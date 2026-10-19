// ─────────────────────────────────────────────────────────────────────────────
// FECHAMENTO DO EVENTO (19/10) — a planilha COMPLETA de um ou mais eventos.
//
// Captura em uso real (equipe da Gráfica, fechamento): "Night Run Teresina
// está apenas com 2 itens; Circuitinho Salvador, Girl Power RJ e Petrobras
// Bike Recife não aparecem no relatório". No banco os quatro estavam inteiros
// (71–76 peças, todas entregues). O "relatório" era o Exportar Excel da
// Gráfica, que exporta a LISTA VISÍVEL — e a fila esconde o evento realizado
// (decisão de 08/10) e só traz as entregues de uma janela recente. Os dois
// recortes estão certos para a fila do dia; estão errados para o fechamento.
//
// Aqui o recorte é o EVENTO, não a fila: todas as peças vivas dele, em
// qualquer status (inclusive entregues, reaproveitadas e em trânsito), em
// qualquer situação do evento (aberto, realizado, encerrado). Arquivado
// responde 404 — sumiu de todas as listas, como em toda rota de evento.
//
// O FORMATO é o da exportação da Gráfica (writeWorkbook com as colunas de
// produção): quem fecha o evento lê a mesma planilha que já conhece, com a
// coluna Evento dizendo de qual evento é cada linha quando são vários.
//
// Quem pode: qualquer logado (o Detalhe do Evento e o Relatório, de onde o
// botão sai, são de todos os papéis). O usuário do Kit leva só as peças do
// Kit que ele criou — a mesma régua das outras exportações.
// ─────────────────────────────────────────────────────────────────────────────
import type { Request, Response } from "express";
import { storage, compareDisplayId } from "../storage";
import { ehBookCompleto } from "@shared/fluxo-peca";
import { reaproveitadasDe, emTransitoDe } from "@shared/origem-do-reaproveitamento";
import { writeWorkbook, withSponsorNames, fmt, fmtDiaDoEvento } from "./xlsxExport";
import { responderFalha, EVENTO_NAO_ENCONTRADO } from "../erros";

/** Teto de eventos num arquivo só — fechamento é de uma etapa ou de um lote, não do acervo. */
export const FECHAMENTO_MAX_EVENTOS = 60;

/** O nome do evento sem o que o sistema de arquivos recusa. */
const nomeSeguro = (s: string) => s.replace(/[^a-zA-Z0-9À-ÿ _-]/g, "").replace(/\s+/g, " ").trim();

/** "Fechamento — Night Run Teresina.xlsx" / "Fechamento — 4 eventos.xlsx". */
export function nomeDoArquivoDoFechamento(nomes: string[]): string {
  if (nomes.length === 1) return `Fechamento — ${nomeSeguro(nomes[0]) || "evento"}.xlsx`;
  return `Fechamento — ${nomes.length} eventos.xlsx`;
}

/** Os ids de `?eventos=a,b` (ou repetido: `?eventos=a&eventos=b`), sem vazios nem repetidos. */
export function idsDosEventosDaQuery(v: unknown): string[] {
  const brutos = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  return Array.from(new Set(
    brutos.flatMap((x) => (typeof x === "string" ? x.split(",") : [])).map((x) => x.trim()).filter(Boolean),
  ));
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Responde com o .xlsx do fechamento dos eventos pedidos. */
export async function responderFechamento(req: Request, res: Response, idsPedidos: string[]) {
  try {
    const ids = Array.from(new Set(idsPedidos.map((x) => String(x ?? "").trim()).filter(Boolean)));
    if (ids.length === 0) return res.status(400).json({ error: "Escolha ao menos um evento para o fechamento." });
    if (ids.length > FECHAMENTO_MAX_EVENTOS) {
      return res.status(400).json({ error: `No máximo ${FECHAMENTO_MAX_EVENTOS} eventos por arquivo.` });
    }

    // Arquivado responde como inexistente (some de todas as listas). Os
    // demais — aberto, realizado, encerrado à mão — entram sem distinção.
    const eventos = (await Promise.all(ids.map((id) => storage.getEvent(id))))
      .filter((e): e is NonNullable<typeof e> => !!e && !e.arquivadoEm)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
    if (eventos.length === 0) return res.status(404).json({ error: EVENTO_NAO_ENCONTRADO });

    // TODAS as peças vivas (getItemsByEvents já tira as excluídas), em todo
    // status. BOOK COMPLETO fica de fora: é o trâmite do Atendimento, não uma
    // peça (shared/fluxo-peca). Kit: só as peças do Kit que ele criou.
    const doKit = req.userKit === true;
    const pecas = (await storage.getItemsByEvents(eventos.map((e) => e.id)))
      .filter((i) => !ehBookCompleto(i) && (!doKit || (!!i.kitRemessaId && i.criadoPorId === req.userId)));

    const nomePorEvento = new Map(eventos.map((e) => [e.id, e.name] as const));
    const ordemDoEvento = new Map(eventos.map((e, i) => [e.id, i] as const));
    const items = (await withSponsorNames(pecas))
      .map((i) => ({ ...i, eventName: nomePorEvento.get(i.eventId) ?? "" }))
      // Evento a evento (na ordem do nome) e, dentro dele, pelo código —
      // com o complemento (#0062-C1) logo abaixo da peça de que nasceu.
      .sort((a, b) => ((ordemDoEvento.get(a.eventId) ?? 0) - (ordemDoEvento.get(b.eventId) ?? 0))
        || compareDisplayId(a.displayId, b.displayId));

    // O resumo que responde a pergunta do fechamento logo no cabeçalho.
    const un = items.reduce((s, i) => s + (i.quantity ?? 0), 0);
    const produzidas = items.reduce((s, i) => s + (i.quantityProduced ?? 0), 0);
    const reaproveitadas = items.reduce((s, i) => s + reaproveitadasDe(i), 0);
    const emTransito = items.reduce((s, i) => s + emTransitoDe(i), 0);
    const entregues = items.reduce((s, i) => s + (i.deliveredQty ?? 0), 0);
    const contas = [
      `${plural(items.length, "peça", "peças")} · ${un} un.`,
      `Produzidas ${produzidas} · Reaproveitadas ${reaproveitadas}${emTransito > 0 ? ` (${emTransito} em trânsito)` : ""} · Entregues ${entregues}`,
      `Exportado em ${fmt(new Date())}`,
    ];

    const nomes = eventos.map((e) => e.name);
    let title: string;
    let cabeca: string[];
    if (eventos.length === 1) {
      const ev = eventos[0];
      title = `Fechamento — ${ev.name}`;
      cabeca = [`Data do evento: ${fmtDiaDoEvento(ev.startDate)}`, `Saída do caminhão: ${fmt(ev.truckDepartureDate)}`];
      if (ev.franchise) cabeca.push(`Franquia: ${ev.franchise}`);
    } else {
      title = `Fechamento — ${eventos.length} eventos`;
      cabeca = [nomes.join(", ")];
    }

    await writeWorkbook(res, {
      items, title,
      subtitle: [...cabeca, ...contas].join("   |   "),
      filename: nomeDoArquivoDoFechamento(nomes),
      withProduction: true,
    });
  } catch (error: unknown) {
    // Falha depois de o arquivo começar a sair não tem mais como virar JSON.
    if (res.headersSent) { console.error("[fechamento-xlsx]", error); res.end(); return; }
    responderFalha(res, error, "fechamento-xlsx");
  }
}
