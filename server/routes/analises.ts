// Agregados da tela de Análises que o CLIENTE não tem como calcular.
//
// Hoje é um só: "Tempo por etapa". Ele existe aqui, e não no front, por um
// motivo de custo — a permanência sai da diferença entre carimbos consecutivos
// de `audit_logs`, e a tela não pode baixar a trilha para descobrir isso. Os
// outros blocos da Análises continuam calculados no cliente sobre
// /api/items — eles cabem no que a tela já tem em mãos.
//
// Esta camada é I/O + montagem. A REGRA (ler a frase da trilha, fechar as
// passagens, mediana, planejado) mora em `../services/tempo-etapas.ts`, testada
// em `server/__tests__/analises-tempo-etapas.test.ts`.
import type { Express } from "express";
import { storage } from "../storage";
import type { ItemTransitionLog } from "../storage";
import { TRANSITION_LOGS_MAX } from "../storage";
import { requireAuth } from "./shared";
import { OUT_OF_FUNNEL } from "../services/prazo-domain";
import { eventDayMs } from "@shared/prazo-dates";
import type { TempoPorEtapa } from "@shared/tempo-etapas-contract";
import {
  agregarTempoPorEtapa,
  dentroDaJanela,
  janelaDeCiclo,
  planejadoPorEtapa,
  type LogPeca,
  type PecaMedida,
} from "../services/tempo-etapas";

/**
 * Memo curto do resultado, por recorte.
 *
 * PORQUÊ existe: a varredura da trilha é a parte cara da rota, e a tela a
 * dispara de novo a cada troca de filtro e a cada volta para a aba (a Análises
 * revalida no foco). 60s é curto o bastante para o bloco não contradizer os
 * KPIs ao lado — que leem /api/items com a mesma política de frescor — e longo
 * o bastante para absorver a rajada de quem está mexendo nos filtros.
 */
const TTL_MS = 60_000;
const memo = new Map<string, { em: number; payload: TempoPorEtapa }>();

function doMemo(chave: string, agora: number): TempoPorEtapa | null {
  const hit = memo.get(chave);
  if (!hit || agora - hit.em > TTL_MS) return null;
  return hit.payload;
}

function guardarNoMemo(chave: string, agora: number, payload: TempoPorEtapa): void {
  // O mapa não pode crescer sem fim: o recorte entra por querystring, e
  // querystring é do usuário. Expira o que venceu antes de inserir.
  const vencidas: string[] = [];
  memo.forEach((v, k) => { if (agora - v.em > TTL_MS) vencidas.push(k); });
  for (const k of vencidas) memo.delete(k);
  memo.set(chave, { em: agora, payload });
}

/**
 * Uma linha de trilha pode valer para VÁRIAS peças: as rotas em lote gravam
 * `entity_id` como lista ("id1,id2,id3") — é a mesma convenção que o filtro por
 * entidade do getAuditLogs já trata com LIKE. Sem desmembrar aqui, toda
 * devolução em lote e todo cancelamento em massa sumiriam da medição.
 */
export function idsDoLog(entityId: string): string[] {
  return entityId.includes(",")
    ? entityId.split(",").map((s) => s.trim()).filter(Boolean)
    : [entityId];
}

export function agruparPorPeca(
  logs: ItemTransitionLog[],
  idsValidos: Set<string>,
): Map<string, LogPeca[]> {
  const porPeca = new Map<string, LogPeca[]>();
  for (const log of logs) {
    const ts = log.createdAt instanceof Date ? log.createdAt.getTime() : new Date(log.createdAt).getTime();
    if (!Number.isFinite(ts)) continue;
    for (const id of idsDoLog(log.entityId)) {
      if (!idsValidos.has(id)) continue;
      const linha: LogPeca = { ts, action: log.action, details: log.details };
      const atual = porPeca.get(id);
      if (atual) atual.push(linha);
      else porPeca.set(id, [linha]);
    }
  }
  // A trilha chega do mais novo para o mais antigo (ver getItemTransitionLogs);
  // a medição caminha para a frente no tempo.
  porPeca.forEach((linhas) => linhas.sort((a, b) => a.ts - b.ts));
  return porPeca;
}

const msDe = (v: Date | string | null | undefined): number | null => {
  if (v == null) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

export function registerAnaliseRoutes(app: Express): void {
  /**
   * GET /api/analises/tempo-por-etapa
   *
   * Recorte IDÊNTICO ao dos KPIs da tela (mesmos nomes de parâmetro que a URL
   * da Análises já carrega): `periodo` por ciclo de evento já ocorrido,
   * `evento` e `patrocinador`. Se o recorte daqui divergisse do de lá, o
   * rodapé do bloco declararia uma cobertura sobre outra população.
   */
  app.get("/api/analises/tempo-por-etapa", requireAuth, async (req, res) => {
    try {
      const periodo = typeof req.query.periodo === "string" ? req.query.periodo : "all";
      const evento = typeof req.query.evento === "string" ? req.query.evento : "all";
      const patrocinador =
        typeof req.query.patrocinador === "string" ? req.query.patrocinador : "all";

      const agora = Date.now();
      const chave = `${periodo}|${evento}|${patrocinador}`;
      const cache = doMemo(chave, agora);
      if (cache) return res.json(cache);

      const janela = janelaDeCiclo(periodo, agora);

      const [eventos, itens] = await Promise.all([
        storage.getAllEvents(),
        storage.getAllItems(),
      ]);

      // eventId → dia-calendário da saída do caminhão (a âncora do recorte).
      const diaDoEvento = new Map<string, number | null>();
      for (const ev of eventos) diaDoEvento.set(ev.id, eventDayMs(ev.truckDepartureDate));

      // Vínculo peça↔patrocinador só é carregado quando há filtro — é a
      // tabela inteira, e sem filtro ela não muda nenhuma resposta.
      let patrocinadasPor: Set<string> | null = null;
      if (patrocinador !== "all") {
        const vinculos = await storage.getAllItemSponsors();
        patrocinadasPor = new Set(
          vinculos.filter((v) => v.sponsorId === patrocinador).map((v) => v.itemId),
        );
      }

      const noRecorte = itens.filter((i) => {
        // Cancelada/excluída/arquivada fica fora de todo denominador da tela.
        if (OUT_OF_FUNNEL.has(i.status)) return false;
        if (evento !== "all" && i.eventId !== evento) return false;
        if (janela && !dentroDaJanela(diaDoEvento.get(i.eventId) ?? null, janela)) return false;
        if (patrocinadasPor && !patrocinadasPor.has(i.id)) return false;
        return true;
      });

      // Piso da varredura: nenhuma transição de uma peça é anterior à criação
      // dela, então a peça mais antiga do recorte é o começo útil da trilha.
      let desdePiso: number | null = null;
      for (const i of noRecorte) {
        const c = msDe(i.createdAt);
        if (c != null && (desdePiso == null || c < desdePiso)) desdePiso = c;
      }

      const logs = noRecorte.length
        ? await storage.getItemTransitionLogs(desdePiso, TRANSITION_LOGS_MAX)
        : [];
      const truncado = logs.length >= TRANSITION_LOGS_MAX;

      const idsValidos = new Set(noRecorte.map((i) => i.id));
      const porPeca = agruparPorPeca(logs, idsValidos);

      const pecas: PecaMedida[] = noRecorte.map((i) => ({
        id: i.id,
        eventId: i.eventId,
        status: i.status,
        criadaEmMs: msDe(i.createdAt),
        logs: porPeca.get(i.id) ?? [],
      }));

      const planejadoPorEvento = new Map<string, (number | null)[]>();
      for (const ev of eventos) {
        if (!ev.truckDepartureDate) continue;
        planejadoPorEvento.set(ev.id, planejadoPorEtapa(ev));
      }

      // A data declarada é a do registro mais antigo REALMENTE lido — se o teto
      // cortou o passado, o piso honesto é o corte, não o pedido.
      let desdeMs: number | null = null;
      for (const l of logs) {
        const t = msDe(l.createdAt);
        if (t != null && (desdeMs == null || t < desdeMs)) desdeMs = t;
      }

      const payload = agregarTempoPorEtapa({
        pecas,
        planejadoPorEvento,
        desdeMs,
        logsLidos: logs.length,
        truncado,
      });

      guardarNoMemo(chave, agora, payload);
      res.json(payload);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}

/** Só para o teste — o memo é global e vazaria de um caso para o outro. */
export function limparMemoAnalises(): void {
  memo.clear();
}
