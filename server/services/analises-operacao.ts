// ─────────────────────────────────────────────────────────────────────────────
// A OPERAÇÃO DA ANÁLISES — os agregados que o cliente não tem como calcular
// (contrato em shared/analises-operacao-contract.ts; rota GET
// /api/analises/operacao em routes/analises.ts, só admin).
//
// Duas metades, de propósito:
//   · a REGRA (puras, no topo): janela, mediana, motivo normalizado, natureza
//     de cada ação da trilha, série por dia no fuso de Brasília, quem conta e
//     quem fica fora do funil. Testadas sem banco em
//     server/__tests__/analises-operacao.test.ts;
//   · o I/O (no fim): SQL agregado no banco. A conta que precisa de uma regra
//     do shared/ (fora do funil, BOOK COMPLETO, m² por unidade, a reprodução da
//     trilha) recebe linhas JÁ AGRUPADAS ou já recortadas pela janela — nunca
//     uma tabela inteira. A trilha (audit_logs) tem teto e diz quanto leu.
//
// O "dia" é o de Brasília. O banco agrupa por HORA (UTC), e a regra converte
// cada hora para o dia de lá: o fuso do Brasil é de hora cheia (−3, sem
// horário de verão desde 2019), então a hora UTC nunca fica partida entre
// dois dias — e a virada de meia-noite UTC (21h em Brasília) não empurra o
// trabalho da noite para o dia seguinte, que é o erro que se quer evitar.
// ─────────────────────────────────────────────────────────────────────────────
import { sql, type SQL } from "drizzle-orm";
import { ehBookCompleto, ehForaDoFunil, etapaDaPeca, MAQUINAS_DE_IMPRESSAO, rotuloDaMaquina, STATUS_FORA_DO_FUNIL, statusDasEtapas } from "@shared/fluxo-peca";
import { aImprimirDaPeca } from "@shared/impressao-dividida";
import {
  NATUREZAS_DAS_ACOES,
  type AprovacaoDaOperacao,
  type ArteDaOperacao,
  type EstoqueDaOperacao,
  type GraficaDaOperacao,
  type JanelaDaOperacao,
  type NaturezaDaAcao,
  type OperacaoDaAnalise,
  type PessoasDaOperacao,
} from "@shared/analises-operacao-contract";

// ═════════════════════════════════════════════════════════════════════════════
// A REGRA
// ═════════════════════════════════════════════════════════════════════════════

export const FUSO = "America/Sao_Paulo";
const DIA_MS = 86_400_000;
/** Sem `de`, a janela é o último mês corrido. */
export const DIAS_PADRAO = 30;
/** Mesmo teto do relatório das máquinas: um ano é análise; mais que isso é URL torta. */
export const MAXIMO_DE_DIAS = 366;
/**
 * Teto de linhas da trilha lidas por resposta. A aba Pessoas soma VOLUME —
 * 20 mil linhas cobrem com folga um mês de operação; uma janela de um ano
 * bate no teto, e o payload diz (cobertura.truncado) em vez de mentir.
 */
export const TETO_DA_TRILHA = 20_000;
/** Ranking de motivos: o resto é cauda que a tela não mostra. */
export const MAXIMO_DE_MOTIVOS = 10;
export const MAXIMO_DE_PECAS_RETRABALHO = 20;
/** O que o diário das máquinas conta como unidade impressa (mesma régua do Resumo do dia). */
export const TIPOS_QUE_IMPRIMEM: readonly string[] = ["parcial", "conclusao"];

const DIA_VALIDO = /^\d{4}-\d{2}-\d{2}$/;
const INSTANTE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

const formatoDoDia = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });

/** "AAAA-MM-DD" do instante, no fuso de Brasília. */
export function diaNoFuso(ms: number): string {
  return formatoDoDia.format(new Date(ms));
}

/** Meia-noite de Brasília do dia, em ms UTC (−03:00 fixo — ver o cabeçalho). */
function meiaNoiteDoDia(dia: string): number {
  return Date.parse(`${dia}T00:00:00-03:00`);
}

export interface JanelaLida extends JanelaDaOperacao {
  deMs: number;
  ateMs: number;
}

export type LeituraDaJanela = { ok: true; janela: JanelaLida } | { ok: false; erro: string };

/**
 * Lê ?de=&ate=&evento=&patrocinador=. Data só com dia é dia de Brasília: `de`
 * conta desde a meia-noite e `ate` INCLUI o dia inteiro (a janela é [de, ate)).
 * Entrada torta vira 400 com a frase — nunca uma consulta de anos nem um
 * "Invalid Date" no SQL.
 */
export function lerJanela(query: Record<string, unknown>, agoraMs: number): LeituraDaJanela {
  const instante = (v: unknown, fimDoDia: boolean): number | null | undefined => {
    if (v == null || v === "") return undefined; // ausente
    if (typeof v !== "string") return null;
    const s = v.trim();
    if (DIA_VALIDO.test(s)) {
      const ms = meiaNoiteDoDia(s);
      // Date.parse aceita 30/02 e rola para março: o dia de volta tem de ser o pedido.
      if (!Number.isFinite(ms) || diaNoFuso(ms) !== s) return null;
      return fimDoDia ? ms + DIA_MS : ms;
    }
    if (INSTANTE_ISO.test(s)) {
      const ms = Date.parse(s);
      return Number.isFinite(ms) ? ms : null;
    }
    return null;
  };

  const ate = instante(query.ate, true);
  if (ate === null) return { ok: false, erro: "Data final inválida (ate): use AAAA-MM-DD ou uma data ISO." };
  const de = instante(query.de, false);
  if (de === null) return { ok: false, erro: "Data inicial inválida (de): use AAAA-MM-DD ou uma data ISO." };

  const ateMs = ate ?? agoraMs;
  const deMs = de ?? ateMs - DIAS_PADRAO * DIA_MS;
  if (deMs >= ateMs) return { ok: false, erro: "A data inicial precisa ser anterior à final." };
  if (ateMs - deMs > MAXIMO_DE_DIAS * DIA_MS) {
    return { ok: false, erro: `Período longo demais: escolha no máximo ${MAXIMO_DE_DIAS} dias.` };
  }

  const id = (v: unknown, nome: string): { ok: true; v: string | null } | { ok: false; erro: string } => {
    if (v == null) return { ok: true, v: null };
    if (typeof v !== "string") return { ok: false, erro: `${nome} inválido.` };
    const s = v.trim();
    if (s === "" || s === "all") return { ok: true, v: null };
    return ID_VALIDO.test(s) ? { ok: true, v: s } : { ok: false, erro: `${nome} inválido.` };
  };
  const evento = id(query.evento, "Evento");
  if (!evento.ok) return evento;
  const patrocinador = id(query.patrocinador, "Patrocinador");
  if (!patrocinador.ok) return patrocinador;

  return {
    ok: true,
    janela: {
      de: new Date(deMs).toISOString(),
      ate: new Date(ateMs).toISOString(),
      deMs,
      ateMs,
      evento: evento.v,
      patrocinador: patrocinador.v,
    },
  };
}

/** Mediana; null sem números (zero leria como "na hora", que é o oposto). */
export function mediana(valores: readonly number[]): number | null {
  const v = valores.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

const umaCasa = (n: number) => Math.round(n * 10) / 10;
const duasCasas = (n: number) => Math.round(n * 100) / 100;

/** A peça conta na Análises? Fora do funil (cancelada/excluída/arquivada) e BOOK COMPLETO, não. */
export function pecaConta(p: { status: string | null | undefined; type?: string | null }): boolean {
  return !ehForaDoFunil(p.status) && !ehBookCompleto({ type: p.type ?? null });
}

/** m² de UMA unidade: calculatedM2 já é quantidade × largura × altura. */
export function m2DaUnidade(calculatedM2: unknown, quantity: unknown): number {
  const m2 = Number(calculatedM2);
  const q = Number(quantity);
  return Number.isFinite(m2) && q > 0 ? m2 / q : 0;
}

// ── Motivos ──────────────────────────────────────────────────────────────────

/** O texto depois do PRIMEIRO "Motivo:" da frase da trilha (null sem motivo). */
export function extrairMotivo(details: string | null | undefined): string | null {
  const d = details ?? "";
  const i = d.indexOf("Motivo:");
  if (i < 0) return null;
  const m = d.slice(i + "Motivo:".length).trim();
  return m || null;
}

/**
 * Normaliza o motivo para AGRUPAR: "Logo errado.", "logo  errado" e "Logo
 * errado!" são o mesmo motivo. A chave ignora caixa, acento, espaço repetido e
 * pontuação final; o rótulo é o texto limpo, com a primeira letra maiúscula.
 */
export function normalizarMotivo(texto: string | null | undefined): { chave: string; rotulo: string } | null {
  const limpo = (texto ?? "").replace(/\s+/g, " ").trim().replace(/[\s.!;,:…-]+$/, "").trim();
  if (!limpo) return null;
  const chave = limpo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return { chave, rotulo: limpo.charAt(0).toUpperCase() + limpo.slice(1) };
}

/** Ranking dos motivos. O rótulo de cada grupo é a grafia que mais apareceu. */
export function agruparMotivos(
  textos: readonly (string | null | undefined)[],
  limite = MAXIMO_DE_MOTIVOS,
): { motivo: string; vezes: number }[] {
  const grupos = new Map<string, { vezes: number; grafias: Map<string, number> }>();
  for (const t of textos) {
    const n = normalizarMotivo(t);
    if (!n) continue;
    const g = grupos.get(n.chave) ?? { vezes: 0, grafias: new Map<string, number>() };
    g.vezes++;
    g.grafias.set(n.rotulo, (g.grafias.get(n.rotulo) ?? 0) + 1);
    grupos.set(n.chave, g);
  }
  return Array.from(grupos.values())
    .map((g) => {
      let melhor = "";
      let n = -1;
      g.grafias.forEach((v, k) => { if (v > n) { n = v; melhor = k; } });
      return { motivo: melhor, vezes: g.vezes };
    })
    .sort((a, b) => b.vezes - a.vezes || a.motivo.localeCompare(b.motivo, "pt-BR"))
    .slice(0, limite);
}

// ── Aprovação ────────────────────────────────────────────────────────────────

export interface LinhaPendente {
  sponsorId: string;
  nome: string | null;
  status: string | null;
  type: string | null;
  /** items.status_changed_at da PEÇA (desde quando está na etapa), em ms; null = sem carimbo. */
  pecaNaEtapaDesdeMs: number | null;
  /** updatedAt da linha de aprovação, em ms — só o plano B (ver inicioDaEspera). */
  linhaDesdeMs: number;
}

/**
 * DESDE QUANDO uma linha pendente espera. O relógio é o da PEÇA
 * (items.status_changed_at — o mesmo que a tela usa para "há quanto tempo na
 * etapa"): dois relógios diferentes na mesma aba faziam o cartão dizer "14+
 * dias" e o ranking "menos de 1 dia" para as mesmas peças. O updatedAt da
 * linha NÃO serve como relógio principal: ele muda em qualquer escrita na
 * linha (e toda escrita de vínculo/aprovação o renova), então mede o último
 * toque, não a espera. Fica só como plano B para peça sem carimbo (anterior
 * ao backfill de status_changed_at).
 */
export function inicioDaEspera(l: Pick<LinhaPendente, "pecaNaEtapaDesdeMs" | "linhaDesdeMs">): number {
  return l.pecaNaEtapaDesdeMs != null && Number.isFinite(l.pecaNaEtapaDesdeMs) ? l.pecaNaEtapaDesdeMs : l.linhaDesdeMs;
}

/**
 * Os status em que a PEÇA espera o patrocinador — a etapa canônica de
 * aprovação (STATUS_DA_ETAPA em shared/fluxo-peca.ts), nunca uma cópia.
 */
export const STATUS_ESPERANDO_PATROCINADOR: readonly string[] = statusDasEtapas("awaiting_approval");

/**
 * Pendentes agora + ranking da espera por patrocinador (maior espera primeiro).
 *
 * Só conta a linha cuja PEÇA está na etapa de aprovação. A linha pending
 * nasce no VÍNCULO do patrocinador e fica lá enquanto a peça ainda está em
 * rascunho, na vinculação ou na Arte — e continua pending com a peça já na
 * finalização ou na Revisão (estado herdado de atalhos). Nesses casos a bola
 * não está com o patrocinador: contar a linha inflava a espera dele (na base
 * local, 40 linhas pending para 12 peças de fato aguardando aprovação).
 */
export function agregarEspera(
  linhas: readonly LinhaPendente[],
  agoraMs: number,
): Pick<AprovacaoDaOperacao, "pendentesAgora" | "esperaPorPatrocinador"> {
  const por = new Map<string, { nome: string; dias: number[] }>();
  let pendentesAgora = 0;
  for (const l of linhas) {
    const desde = inicioDaEspera(l);
    if (etapaDaPeca(l.status) !== "awaiting_approval" || !pecaConta(l) || !Number.isFinite(desde)) continue;
    pendentesAgora++;
    const g = por.get(l.sponsorId) ?? { nome: l.nome ?? "Patrocinador removido", dias: [] };
    g.dias.push(Math.max(0, agoraMs - desde) / DIA_MS);
    por.set(l.sponsorId, g);
  }
  const esperaPorPatrocinador = Array.from(por.entries())
    .map(([sponsorId, g]) => ({
      sponsorId,
      nome: g.nome,
      pecasPendentes: g.dias.length,
      diasMaisAntiga: Math.floor(Math.max(...g.dias)),
      diasMediana: umaCasa(mediana(g.dias) ?? 0),
    }))
    .sort((a, b) => b.diasMaisAntiga - a.diasMaisAntiga || b.pecasPendentes - a.pecasPendentes || a.nome.localeCompare(b.nome, "pt-BR"));
  return { pendentesAgora, esperaPorPatrocinador };
}

export interface LinhaDeDecisao {
  action: string;
  details: string | null;
  status: string | null;
  type: string | null;
}

// [\s\S]* e não [^"]*: o nome do patrocinador pode ter aspas.
const RE_APROVOU = /^Patrocinador "[\s\S]*" aprovou/;
const RE_REPROVOU = /^Patrocinador "[\s\S]*" reprovou/;

/** Decisões do patrocinador lidas da trilha + o ranking dos motivos de reprovação. */
export function agregarDecisoes(
  linhas: readonly LinhaDeDecisao[],
): Pick<AprovacaoDaOperacao, "decididasNoPeriodo" | "motivosDeReprovacao"> {
  let aprovadas = 0;
  let reprovadas = 0;
  const motivos: (string | null)[] = [];
  for (const l of linhas) {
    if (!pecaConta(l)) continue;
    const d = l.details ?? "";
    if (l.action === "approved" && RE_APROVOU.test(d)) aprovadas++;
    else if (l.action === "rejected" && RE_REPROVOU.test(d)) {
      reprovadas++;
      motivos.push(extrairMotivo(d));
    }
  }
  return { decididasNoPeriodo: { aprovadas, reprovadas }, motivosDeReprovacao: agruparMotivos(motivos) };
}

/**
 * Mediana de dias entre a linha ficar pendente e a decisão.
 *
 * O começo é a versão da arte mais recente ANTES da decisão (`versaoMs`, de
 * item_art_versions), nunca antes do nascimento da linha (`criadaMs`). Sem
 * versão registrada a decisão SAI da amostra: o único carimbo que sobra é o
 * nascimento da linha, que acontece no VÍNCULO do patrocinador — semanas
 * antes de existir arte para aprovar — e inflaria a mediana. Melhor uma
 * mediana com menos amostra do que uma inflada.
 */
export function medianaAteDecidir(
  linhas: readonly { criadaMs: number; versaoMs: number | null; decididaMs: number; status: string | null; type: string | null }[],
): number | null {
  const dias = linhas
    .filter((l) => pecaConta(l) && l.versaoMs != null && Number.isFinite(l.versaoMs) && Number.isFinite(l.decididaMs))
    .map((l) => {
      const inicio = Number.isFinite(l.criadaMs) ? Math.max(l.criadaMs, l.versaoMs!) : l.versaoMs!;
      return Math.max(0, l.decididaMs - inicio) / DIA_MS;
    });
  const m = mediana(dias);
  return m == null ? null : umaCasa(m);
}

// ── Séries por dia ───────────────────────────────────────────────────────────

/** Todos os dias de Brasília da janela [deMs, ateMs), em ordem. */
export function diasDaJanela(deMs: number, ateMs: number): string[] {
  const dias: string[] = [];
  const ultimo = diaNoFuso(ateMs - 1);
  let d = diaNoFuso(deMs);
  // Teto defensivo: a janela já foi validada, mas um laço nunca roda sem fim.
  for (let i = 0; i <= MAXIMO_DE_DIAS + 1 && d <= ultimo; i++) {
    dias.push(d);
    d = new Date(Date.parse(`${d}T12:00:00Z`) + DIA_MS).toISOString().slice(0, 10);
  }
  return dias;
}

/**
 * Soma baldes de HORA (ms UTC do começo da hora, como o banco agrupa) no dia
 * de Brasília. Contínua: todo dia da janela aparece, com zero se vazio.
 */
export function somarPorDia<K extends string>(
  baldes: readonly ({ horaMs: number } & Partial<Record<K, number>>)[],
  campos: readonly K[],
  deMs: number,
  ateMs: number,
): ({ dia: string } & Record<K, number>)[] {
  const zero = () => Object.fromEntries(campos.map((c) => [c, 0])) as Record<K, number>;
  const por = new Map<string, Record<K, number>>();
  for (const dia of diasDaJanela(deMs, ateMs)) por.set(dia, zero());
  for (const b of baldes) {
    if (!Number.isFinite(b.horaMs)) continue;
    const alvo = por.get(diaNoFuso(b.horaMs));
    if (!alvo) continue; // balde fora da janela (a hora que começou antes de `de`)
    for (const c of campos) alvo[c] += Number(b[c] ?? 0) || 0;
  }
  return Array.from(por.entries()).map(([dia, v]) => {
    const linha = { dia } as { dia: string } & Record<K, number>;
    for (const c of campos) (linha as Record<string, unknown>)[c] = duasCasas(v[c]);
    return linha;
  });
}

// ── Gráfica ──────────────────────────────────────────────────────────────────

export interface LinhaMaquinaPeca {
  maquina: string;
  itemId: string;
  unidades: number;
  registros: number;
  calculatedM2: unknown;
  quantity: unknown;
}

/** Uma linha por impressora (as conhecidas sempre, na ordem da régua). */
export function agregarMaquinas(linhas: readonly LinhaMaquinaPeca[]): GraficaDaOperacao["porMaquina"] {
  const por = new Map<string, { unidades: number; m2: number; registros: number; pecas: Set<string> }>();
  const novo = () => ({ unidades: 0, m2: 0, registros: 0, pecas: new Set<string>() });
  for (const m of MAQUINAS_DE_IMPRESSAO) por.set(m, novo());
  for (const l of linhas) {
    const g = por.get(l.maquina) ?? novo();
    const u = Number(l.unidades) || 0;
    g.unidades += u;
    g.m2 += u * m2DaUnidade(l.calculatedM2, l.quantity);
    g.registros += Number(l.registros) || 0;
    g.pecas.add(l.itemId);
    por.set(l.maquina, g);
  }
  const conhecidas = new Set(MAQUINAS_DE_IMPRESSAO);
  const ordem = [...MAQUINAS_DE_IMPRESSAO, ...Array.from(por.keys()).filter((k) => !conhecidas.has(k)).sort()];
  return ordem.map((codigo) => {
    const g = por.get(codigo)!;
    return { maquina: rotuloDaMaquina(codigo), codigo, unidades: g.unidades, m2: duasCasas(g.m2), registros: g.registros, pecas: g.pecas.size };
  });
}

/** Baldes (hora × peça) do diário → unidades e m² por hora, prontos para somarPorDia. */
export function baldesDeImpressao(
  linhas: readonly { horaMs: number; unidades: number; calculatedM2: unknown; quantity: unknown }[],
): { horaMs: number; unidades: number; m2: number }[] {
  return linhas.map((l) => {
    const u = Number(l.unidades) || 0;
    return { horaMs: l.horaMs, unidades: u, m2: u * m2DaUnidade(l.calculatedM2, l.quantity) };
  });
}

// ── Pessoas ──────────────────────────────────────────────────────────────────

export interface LinhaDaTrilha {
  userId: string | null;
  userName: string;
  action: string;
  entityType: string;
  details: string | null;
}

export interface UsuarioDoCadastro {
  id: string;
  name: string;
  role: string | null;
}

/** Nome para CASAR: sem caixa, acento, espaço repetido nem o "(como Gráfica)" do VER COMO. */
export function chaveDoNome(nome: string | null | undefined): string {
  return (nome ?? "")
    .replace(/\s*\(como [^)]*\)\s*$/i, "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * A NATUREZA de uma linha da trilha — o que a pessoa FEZ, no vocabulário do
 * gestor (a lista e a ordem moram em NATUREZAS_DAS_ACOES, no contrato).
 *
 * A `action` sozinha não basta: quase todo passo grava "updated" e diz o que
 * foi na frase (`details`). As frases abaixo são as que as rotas escrevem
 * HOJE; peça editada por um caminho sem frase própria cai em "editar peça" —
 * é o que ela é —, e "outras" fica para o que não tem dono (aviso disparado à
 * mão, entidade nova que ninguém ensinou aqui).
 *
 * `null` = a linha não é uma ação de pessoa a contar:
 *   · RESUMO de algo que já tem linha própria — o volume (entity "tubo": cada
 *     peça já ganhou "Embalada…"/"Entrega…"), a importação do Excel (cada
 *     peça já ganhou "importado via Excel");
 *   · EFEITO de outra ação — o ativo cadastrado no fim da impressão, a
 *     revogação do desaprovador, a peça destravada ao liberar, a volta para
 *     a aprovação quando a Arte troca o thumb;
 *   · o que não é trabalho — o VER COMO do admin, troca de senha, reparo
 *     automático de texto.
 */
export function naturezaDaAcao(l: { action: string; entityType: string; details: string | null }): NaturezaDaAcao | null {
  const d = l.details ?? "";
  const a = l.action;

  // Registro na Gestão de Prazos (o alvo é evento ou patrocinador).
  if (a === "cobranca_registrada") return "prazos";

  switch (l.entityType) {
    case "item":
      break;
    case "tubo":
      return null;
    case "event":
      if (a === "created" && /itens importados via Excel/.test(d)) return null;
      // O book de aprovação e o aviso por e-mail que sai com ele são da Arte.
      if (/^Book (de aprovação vinculado|removido)|^Aviso por e-mail|^Reenvio manual/.test(d)) return "enviar arte";
      if (/^Vinculação automática por cota|^Cota "/.test(d)) return "vincular patrocinador";
      return "evento";
    case "event_sponsor":
    case "item_sponsor":
      return "vincular patrocinador";
    case "pedido_de_peca":
      return "pedido de peça";
    case "inventory_asset":
      return a === "cadastrado" ? null : "estoque";
    case "user":
      if (a === "password_changed" || /^(Passou a ver|Voltou a ver) o sistema como/.test(d)) return null;
      return "cadastros";
    case "sponsor":
    case "standardItem":
    case "catalogOption":
    case "quota_rules":
      return "cadastros";
    case "gestao":
    case "revisao":
      // Quem recebe os avisos é cadastro; o resumo disparado à mão, "outras"
      // (o automático é do "Sistema" e nem chega aqui).
      return a === "added" || a === "deleted" ? "cadastros" : "outras";
    case "item_sponsor_approval":
      return null; // reparo automático de texto
    default:
      return "outras";
  }

  switch (a) {
    case "created":
      // A rota de envio da lista grava UMA linha "created" no evento:
      // "N itens: Status alterado de Rascunho → Aguardando Vinculação".
      return /Status alterado de Rascunho/.test(d) ? "enviar lista" : "criar peça";
    case "complement_created":
      return "criar peça";
    // "approved" é a decisão do patrocinador (aprovacao.ts, sponsors.ts — a
    // frase sempre fala do patrocinador) OU a liberação da Revisão Final
    // (revisao.ts — Solicitação e admin, QUEM_DECIDE_NA_REVISAO em
    // shared/maquina-de-estados.ts). Não há outro "approved" no servidor.
    case "approved":
      // "Com a saída de X…" é EFEITO de desvincular o patrocinador (que já tem
      // a linha "removed") — e, sem patrocinador restante, a frase nem cita a
      // palavra: sem esta regra viraria "liberar".
      if (/^Com a saída de "/.test(d)) return null;
      return /patrocinador/i.test(d) ? "aprovar" : "liberar";
    // "rejected" do patrocinador é reprovar; o resto é alguém DEVOLVENDO a
    // peça (Arte ao solicitante, Revisão à Arte, Gráfica à Revisão, admin).
    case "rejected":
      return RE_REPROVOU.test(d) ? "reprovar" : "devolver";
    // A Arte pulou a aprovação e mandou a peça direto para a finalização.
    case "dispensed":
      return "enviar arte";
    case "production":
    case "produced":
      return "imprimir";
    case "label_printed":
      return "etiquetas";
    case "delivered":
      return "entregar";
    case "canceled":
    case "complement_canceled":
    case "deleted":
    case "restored":
      return "cancelar";
    case "added":
    case "removed":
      return "vincular patrocinador";
    case "corrected_text":
      return null;
    case "updated":
      break;
    default:
      return "outras";
  }

  // "updated" numa peça: a frase diz o quê.
  if (/^Confer[eê]ncia (conclu[ií]da|parcial)/i.test(d)) return "conferir";
  if (/^(Embalada|Fotografada|Embalagem desfeita|Retirada do Tubo)/.test(d)) return "embalar";
  if (/^Entrega (conclu[ií]da|parcial)/.test(d)) return "entregar";
  // Efeitos de outra ação (ver o cabeçalho).
  if (/^Aprovação revogada de|^Destravada na liberação da Revisão Final|precisa aprovar a nova versão$/.test(d)) return null;
  // "Enviado para Arte — Status alterado…" é a frase (antiga) do ENVIO DO
  // THUMB pela Arte (submit-for-approval), não o envio da lista à Arte.
  if (/^Enviado para Arte — |^Molde: thumb enviado|^Arte enviou nova versão|\(arquivo final adicionado\)/.test(d)) return "enviar arte";
  if (/^Thumb |^Arquivo final (substituído|propagado)|arquivo final trocado/.test(d)) return "trocar arte";
  // O envio da lista à Arte (send-to-arte): "N itens enviados para Arte".
  if (/(item enviado|itens enviados) para Arte$/.test(d)) return "enviar lista";
  if (/^Item devolvido para Criação|reabriu a aprovação/.test(d)) return "devolver";
  if (/^Travada pela Solicitação|^Destravada \(/.test(d)) return "travar";
  if (/^Pedido ao estoque|^Estoque respondeu|^Reservou |^Liberou a reserva|^Reaproveitamento|^Marcado para reaproveitamento/.test(d)) return "estoque";
  if (/^Peça ligada à solicitação/.test(d)) return "pedido de peça";
  if (/^Patrocinadores atualizados|^Aprovações de patrocinador \(re\)inicializadas/.test(d)) return "vincular patrocinador";
  if (/^Item descancelado/.test(d)) return "cancelar";
  if (/^Molde voltou para liberado/.test(d)) return "imprimir";
  return "editar peça";
}

/**
 * Volume de ações por pessoa, mais ações primeiro. O ator "Sistema" não é pessoa.
 *
 * QUEM é a pessoa: pelo user_id quando a linha tem; sem ele (rotas antigas
 * gravam só o nome — criar evento, enviar lista), pelo NOME casado com o
 * cadastro (chaveDoNome: sem caixa nem acento). Sem isso a mesma Sofia
 * aparecia duas vezes, uma no setor dela e outra "sem cadastro ligado". Só
 * fica sem cadastro o nome que não casa com NINGUÉM — ou que casa com dois
 * usuários (homônimos), porque escolher um seria inventar o autor.
 */
export function agregarPessoas(
  linhas: readonly LinhaDaTrilha[],
  usuarios: readonly UsuarioDoCadastro[],
  ignorarNomes: ReadonlySet<string>,
): PessoasDaOperacao["porPessoa"] {
  const porId = new Map(usuarios.map((u) => [u.id, u]));
  const porNome = new Map<string, UsuarioDoCadastro | null>(); // null = homônimos
  for (const u of usuarios) {
    const k = chaveDoNome(u.name);
    if (k) porNome.set(k, porNome.has(k) ? null : u);
  }
  const por = new Map<string, { nome: string; papel: string | null; total: number; porAcao: Record<string, number> }>();
  for (const l of linhas) {
    if (!l.userId && ignorarNomes.has(l.userName)) continue;
    const natureza = naturezaDaAcao(l);
    if (!natureza) continue;
    // "Ana (como Gráfica)" — o VER COMO do admin — é a Ana, e o nome que vale
    // é o do cadastro (renomear não parte a pessoa).
    const usuario = (l.userId ? porId.get(l.userId) : undefined) ?? porNome.get(chaveDoNome(l.userName)) ?? null;
    const chave = usuario ? `id:${usuario.id}` : l.userId ? `id:${l.userId}` : `nome:${chaveDoNome(l.userName)}`;
    const g = por.get(chave) ?? { nome: usuario?.name ?? l.userName, papel: usuario?.role ?? null, total: 0, porAcao: {} };
    g.total++;
    g.porAcao[natureza] = (g.porAcao[natureza] ?? 0) + 1;
    por.set(chave, g);
  }
  const ordem = new Map<string, number>(NATUREZAS_DAS_ACOES.map((n, i) => [n, i]));
  return Array.from(por.values())
    .map((g) => ({
      ...g,
      porAcao: Object.fromEntries(Object.entries(g.porAcao).sort((a, b) => (ordem.get(a[0]) ?? 99) - (ordem.get(b[0]) ?? 99))),
    }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
}

// ── Estoque ──────────────────────────────────────────────────────────────────

export function agregarAtivos(
  linhas: readonly { situacao: string; condicao: string; unidades: number; registros: number }[],
): Pick<EstoqueDaOperacao, "ativosPorSituacao" | "ativosPorCondicao"> {
  const sit = new Map<string, { unidades: number; registros: number }>();
  const cond = new Map<string, number>();
  for (const l of linhas) {
    const s = sit.get(l.situacao) ?? { unidades: 0, registros: 0 };
    s.unidades += Number(l.unidades) || 0;
    s.registros += Number(l.registros) || 0;
    sit.set(l.situacao, s);
    // Descartado saiu do acervo: a condição dele não é a do que temos.
    if (l.situacao !== "DESCARTADO") cond.set(l.condicao, (cond.get(l.condicao) ?? 0) + (Number(l.unidades) || 0));
  }
  return {
    ativosPorSituacao: Array.from(sit.entries())
      .map(([situacao, v]) => ({ situacao, ...v }))
      .sort((a, b) => b.unidades - a.unidades),
    ativosPorCondicao: Array.from(cond.entries())
      .map(([condicao, unidades]) => ({ condicao, unidades }))
      .sort((a, b) => b.unidades - a.unidades),
  };
}

export interface PecaEntregue {
  status: string | null;
  type: string | null;
  quantity: unknown;
  reuseQty: unknown;
  isReuse: boolean | null;
  calculatedM2: unknown;
}

/**
 * Reaproveitado × impresso das peças entregues na janela. O impresso é o
 * mesmo "a imprimir" da fila da Gráfica (aImprimirDaPeca); o reaproveitado, o
 * que sobra da quantidade. Reaproveitamento parcial conta nos dois lados.
 */
export function agregarReuso(pecas: readonly PecaEntregue[]): Pick<EstoqueDaOperacao, "reaproveitadas" | "impressas"> {
  const reaproveitadas = { pecas: 0, unidades: 0, m2: 0 };
  const impressas = { pecas: 0, unidades: 0, m2: 0 };
  for (const p of pecas) {
    if (!pecaConta(p)) continue;
    const quantidade = Math.max(0, Number(p.quantity) || 0);
    const impresso = Math.min(quantidade, aImprimirDaPeca({ quantity: quantidade, reuseQty: Number(p.reuseQty) || 0, isReuse: p.isReuse === true }));
    const reuso = quantidade - impresso;
    const m2u = m2DaUnidade(p.calculatedM2, quantidade);
    if (reuso > 0) { reaproveitadas.pecas++; reaproveitadas.unidades += reuso; reaproveitadas.m2 += reuso * m2u; }
    if (impresso > 0) { impressas.pecas++; impressas.unidades += impresso; impressas.m2 += impresso * m2u; }
  }
  reaproveitadas.m2 = duasCasas(reaproveitadas.m2);
  impressas.m2 = duasCasas(impressas.m2);
  return { reaproveitadas, impressas };
}

// ═════════════════════════════════════════════════════════════════════════════
// O I/O
// ═════════════════════════════════════════════════════════════════════════════

/** Executor de SQL cru — o `db` de ../db na rota; trocável no teste. */
export type Executor = { execute: (q: SQL) => Promise<unknown> };

// Linhas cruas de um `execute`: o formato das colunas é de quem escreveu o SQL.
const linhas = <T>(r: unknown): T[] => {
  const x = r as { rows?: unknown } | unknown[] | null | undefined;
  return (x && !Array.isArray(x) && x.rows != null ? x.rows : x ?? []) as T[];
};
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
/** Epoch em ms de uma coluna `timestamp` (gravada em UTC, sem fuso). */
const ms = (coluna: string) => sql.raw(`(extract(epoch from ${coluna}) * 1000)::bigint`);
const horaMs = (coluna: string) => sql.raw(`(extract(epoch from date_trunc('hour', ${coluna})) * 1000)::bigint`);
const lista = (valores: readonly string[]) => sql.join(valores.map((v) => sql`${v}`), sql`, `);
const naoArquivado = (colunaEventId: string) =>
  sql.raw(`not exists (select 1 from events ev_arq where ev_arq.id = ${colunaEventId} and ev_arq.arquivado_em is not null)`);

/**
 * Executa as consultas e monta a resposta. A janela já vem validada
 * (lerJanela). As datas entram como texto ISO em UTC com `::timestamp` — é
 * como as colunas são gravadas; um Date cru iria no fuso do processo.
 */
export async function carregarOperacao(
  db: Executor,
  janela: JanelaLida,
  agoraMs: number,
  opcoes: { ignorarNomes: ReadonlySet<string> },
): Promise<OperacaoDaAnalise> {
  const de = sql`${janela.de}::timestamp`;
  const ate = sql`${janela.ate}::timestamp`;
  const naJanela = (coluna: string) => sql`${sql.raw(coluna)} >= ${de} and ${sql.raw(coluna)} < ${ate}`;
  const doEvento = (colunaEventId: string) =>
    janela.evento ? sql`${sql.raw(colunaEventId)} = ${janela.evento}` : sql`true`;
  const doPatrocinador = (colunaItemId: string) =>
    janela.patrocinador
      ? sql`exists (select 1 from item_sponsors s_f where s_f.item_id = ${sql.raw(colunaItemId)} and s_f.sponsor_id = ${janela.patrocinador})`
      : sql`true`;
  const noFunil = sql`i.status not in (${lista(STATUS_FORA_DO_FUNIL)})`;
  const ehq = <T>(q: SQL) => db.execute(q).then((r) => linhas<T>(r));

  // As abas em sequência, as consultas de cada aba em paralelo: no máximo
  // quatro conexões do pool por vez (o pool tem 10 e serve o app inteiro).

  // ── Aprovação ──
  const [pendentes, decisoes, duracoes] = await Promise.all([
    ehq<{ sponsor_id: string; nome: string | null; status: string; type: string; peca_desde: unknown; linha_desde: unknown }>(sql`
      select a.sponsor_id, s.name as nome, i.status, i.type,
             ${ms("i.status_changed_at")} as peca_desde, ${ms("a.updated_at")} as linha_desde
      from item_sponsor_approvals a
      join items i on i.id = a.item_id
      left join sponsors s on s.id = a.sponsor_id
      where a.status in ('pending', 'new_version_pending')
        -- Só a peça que espera o patrocinador (ver agregarEspera); o filtro
        -- aqui só poupa linhas, quem decide é a regra pura.
        and i.status in (${lista(STATUS_ESPERANDO_PATROCINADOR)})
        and i.deleted_at is null and ${naoArquivado("i.event_id")}
        and ${doEvento("i.event_id")}
        and ${janela.patrocinador ? sql`a.sponsor_id = ${janela.patrocinador}` : sql`true`}
    `),
    // Da TRILHA: a linha de aprovação perde a decisão quando a arte renova.
    ehq<{ action: string; details: string | null; status: string; type: string }>(sql`
      select a.action, left(a.details, 600) as details, i.status, i.type
      from audit_logs a
      join items i on i.id = a.entity_id
      where a.entity_type = 'item' and a.action in ('approved', 'rejected')
        and ${naJanela("a.created_at")}
        and starts_with(a.details, 'Patrocinador "')
        and i.deleted_at is null and ${naoArquivado("i.event_id")}
        and ${doEvento("i.event_id")}
        and ${janela.patrocinador
          ? sql`exists (select 1 from sponsors s_n where s_n.id = ${janela.patrocinador}
                 and (starts_with(a.details, 'Patrocinador "' || s_n.name || '"') or starts_with(a.details, 'Patrocinador "' || s_n.id || '"')))`
          : sql`true`}
      order by a.created_at desc
      limit ${TETO_DA_TRILHA}
    `),
    ehq<{ criada: unknown; versao: unknown; decidida: unknown; status: string; type: string }>(sql`
      select ${ms("coalesce(a.approved_at, a.rejected_at)")} as decidida,
             ${ms("a.created_at")} as criada,
             ${ms(`(select max(v.created_at) from item_art_versions v
                     where v.item_id = a.item_id and v.created_at <= coalesce(a.approved_at, a.rejected_at))`)} as versao,
             i.status, i.type
      from item_sponsor_approvals a
      join items i on i.id = a.item_id
      where ${naJanela("coalesce(a.approved_at, a.rejected_at)")}
        and i.deleted_at is null and ${naoArquivado("i.event_id")}
        and ${doEvento("i.event_id")}
        and ${janela.patrocinador ? sql`a.sponsor_id = ${janela.patrocinador}` : sql`true`}
    `),
  ]);

  const aprovacao: AprovacaoDaOperacao = {
    ...agregarEspera(
      pendentes.map((l) => ({
        sponsorId: l.sponsor_id, nome: l.nome, status: l.status, type: l.type,
        pecaNaEtapaDesdeMs: l.peca_desde == null ? null : num(l.peca_desde), linhaDesdeMs: num(l.linha_desde),
      })),
      agoraMs,
    ),
    ...agregarDecisoes(decisoes),
    diasAteDecidirMediana: medianaAteDecidir(
      duracoes.map((l) => ({
        criadaMs: num(l.criada), versaoMs: l.versao == null ? null : num(l.versao),
        decididaMs: num(l.decidida), status: l.status, type: l.type,
      })),
    ),
  };

  // ── Gráfica ──
  const imprime = sql`r.tipo in (${lista(TIPOS_QUE_IMPRIMEM)})`;
  const doDiario = sql`${naJanela("r.created_at")} and ${naoArquivado("i.event_id")} and ${doEvento("i.event_id")} and ${doPatrocinador("r.item_id")}`;
  const [porMaquinaPeca, porHoraPeca, tubos, embalagem] = await Promise.all([
    ehq<{ maquina: string; item_id: string; unidades: unknown; registros: unknown; calculated_m2: unknown; quantity: unknown }>(sql`
      select r.maquina, r.item_id,
             coalesce(sum(case when ${imprime} then r.quantidade else 0 end), 0)::int as unidades,
             count(*)::int as registros, i.calculated_m2, i.quantity
      from registros_de_impressao r
      join items i on i.id = r.item_id
      where ${doDiario}
      group by r.maquina, r.item_id, i.calculated_m2, i.quantity
    `),
    ehq<{ hora: unknown; unidades: unknown; calculated_m2: unknown; quantity: unknown }>(sql`
      select ${horaMs("r.created_at")} as hora, sum(r.quantidade)::int as unidades, i.calculated_m2, i.quantity
      from registros_de_impressao r
      join items i on i.id = r.item_id
      where ${doDiario} and ${imprime}
      group by 1, r.item_id, i.calculated_m2, i.quantity
    `),
    ehq<{ abertos: unknown; fechados: unknown; avulsos_abertos: unknown; entregues: unknown }>(sql`
      select count(*) filter (where not t.avulso and t.entregue_em is null and t.fechado_em is null)::int as abertos,
             count(*) filter (where not t.avulso and t.entregue_em is null and t.fechado_em is not null)::int as fechados,
             count(*) filter (where t.avulso and t.entregue_em is null)::int as avulsos_abertos,
             count(*) filter (where ${naJanela("t.entregue_em")})::int as entregues
      from tubos t
      where ${naoArquivado("t.event_id")} and ${doEvento("t.event_id")}
        and ${janela.patrocinador
          ? sql`exists (select 1 from tubo_itens ti_f join item_sponsors s_f on s_f.item_id = ti_f.item_id
                 where ti_f.tubo_id = t.id and s_f.sponsor_id = ${janela.patrocinador})`
          : sql`true`}
    `),
    ehq<{ hora: unknown; embaladas: unknown; entregues: unknown }>(sql`
      select hora, sum(embaladas)::int as embaladas, sum(entregues)::int as entregues from (
        select ${horaMs("ti.embalado_em")} as hora, ti.quantidade as embaladas, 0 as entregues
        from tubo_itens ti join items i on i.id = ti.item_id
        where ${naJanela("ti.embalado_em")} and ${naoArquivado("i.event_id")} and ${doEvento("i.event_id")} and ${doPatrocinador("ti.item_id")}
        union all
        select ${horaMs("ti.entregue_em")} as hora, 0 as embaladas, ti.quantidade as entregues
        from tubo_itens ti join items i on i.id = ti.item_id
        where ${naJanela("ti.entregue_em")} and ${naoArquivado("i.event_id")} and ${doEvento("i.event_id")} and ${doPatrocinador("ti.item_id")}
      ) x group by hora
    `),
  ]);

  const t0 = tubos[0];
  const grafica: GraficaDaOperacao = {
    porMaquina: agregarMaquinas(porMaquinaPeca.map((l) => ({
      maquina: l.maquina, itemId: l.item_id, unidades: num(l.unidades), registros: num(l.registros),
      calculatedM2: l.calculated_m2, quantity: l.quantity,
    }))),
    porDia: somarPorDia(
      baldesDeImpressao(porHoraPeca.map((l) => ({ horaMs: num(l.hora), unidades: num(l.unidades), calculatedM2: l.calculated_m2, quantity: l.quantity }))),
      ["unidades", "m2"] as const,
      janela.deMs,
      janela.ateMs,
    ),
    tubos: {
      abertos: num(t0?.abertos),
      fechados: num(t0?.fechados),
      entreguesNoPeriodo: num(t0?.entregues),
      avulsosAbertos: num(t0?.avulsos_abertos),
    },
    embaladasPorDia: somarPorDia(
      embalagem.map((l) => ({ horaMs: num(l.hora), embaladas: num(l.embaladas), entregues: num(l.entregues) })),
      ["embaladas", "entregues"] as const,
      janela.deMs,
      janela.ateMs,
    ),
  };

  // ── Pessoas ──
  // Com recorte de evento/patrocinador só as ações sobre PEÇAS do recorte
  // contam. `entity_id` pode ser lista ("id1,id2") nas rotas em lote — a
  // mesma convenção que idsDoLog trata em routes/analises.ts.
  const soPecas = !!(janela.evento || janela.patrocinador);
  const [trilha, usuarios] = await Promise.all([ehq<{
    user_id: string | null; user_name: string; action: string; entity_type: string; details: string | null;
  }>(sql`
    select a.user_id, a.user_name, a.action, a.entity_type, left(a.details, 200) as details
    from audit_logs a
    where ${naJanela("a.created_at")}
      and ${soPecas
        ? sql`a.entity_type = 'item' and exists (select 1 from items i
               where i.id = any(regexp_split_to_array(a.entity_id, '\\s*,\\s*'))
                 and ${doEvento("i.event_id")} and ${doPatrocinador("i.id")})`
        : sql`true`}
    order by a.created_at desc
    limit ${TETO_DA_TRILHA + 1}
  `),
  // O cadastro inteiro: é pequeno (dezenas de pessoas) e é o que casa pelo
  // nome as linhas da trilha gravadas sem user_id (ver agregarPessoas).
  ehq<{ id: string; name: string; role: string | null }>(sql`select u.id, u.name, u.role from users u`)]);
  const truncado = trilha.length > TETO_DA_TRILHA;
  const lidas = truncado ? trilha.slice(0, TETO_DA_TRILHA) : trilha;
  const pessoas: PessoasDaOperacao = {
    porPessoa: agregarPessoas(
      lidas.map((l) => ({
        userId: l.user_id, userName: l.user_name, action: l.action, entityType: l.entity_type, details: l.details,
      })),
      usuarios,
      opcoes.ignorarNomes,
    ),
    cobertura: { linhasLidas: lidas.length, truncado, teto: TETO_DA_TRILHA, soAcoesEmPecas: soPecas },
  };

  // ── Estoque ──
  const [ativos, entregues, consultas, pedidos] = await Promise.all([
    // O acervo não tem evento; o patrocinador é o que está impresso no ativo.
    ehq<{ situacao: string; condicao: string; unidades: unknown; registros: unknown }>(sql`
      select a.tracking_status as situacao, a.condition as condicao,
             coalesce(sum(a.quantity), 0)::int as unidades, count(*)::int as registros
      from inventory_assets a
      where ${janela.patrocinador ? sql`${janela.patrocinador} = any(a.sponsor_ids)` : sql`true`}
      group by a.tracking_status, a.condition
    `),
    // Peças ENTREGUES na janela (ver o contrato: é a entrega que prova o uso).
    ehq<{ status: string; type: string; quantity: unknown; reuse_qty: unknown; is_reuse: boolean | null; calculated_m2: unknown }>(sql`
      select i.status, i.type, i.quantity, i.reuse_qty, i.is_reuse, i.calculated_m2
      from items i
      where ${naJanela("i.delivered_at")} and i.deleted_at is null and ${naoArquivado("i.event_id")}
        and ${doEvento("i.event_id")} and ${doPatrocinador("i.id")}
    `),
    ehq<{ abertos: unknown; respondidos: unknown }>(sql`
      select count(*) filter (where c.status = 'aberta')::int as abertos,
             count(*) filter (where c.status in ('atendida', 'atendida_parcial', 'nao_atendida') and ${naJanela("c.respondido_em")})::int as respondidos
      from consultas_de_estoque c
      join items i on i.id = c.item_id
      where i.deleted_at is null and ${naoArquivado("c.event_id")} and ${doEvento("c.event_id")} and ${doPatrocinador("c.item_id")}
    `),
    // Por PEÇA pedida (as linhas); o pedido anterior às linhas conta como uma.
    ehq<{ abertos: unknown; atendidos: unknown; recusados: unknown }>(sql`
      select count(*) filter (where p.status = 'aberto')::int as abertos,
             count(*) filter (where p.status = 'atendido' and ${naJanela("p.resolvido_em")})::int as atendidos,
             count(*) filter (where p.status = 'recusado' and ${naJanela("p.resolvido_em")})::int as recusados
      from (
        select l.status, l.resolvido_em, l.event_id, l.sponsor_ids from pedidos_de_peca_linhas l
        union all
        select pp.status, pp.resolvido_em, pp.event_id,
               case when pp.sponsor_id is null then array[]::text[] else array[pp.sponsor_id]::text[] end
        from pedidos_de_peca pp
        where not exists (select 1 from pedidos_de_peca_linhas l2 where l2.pedido_id = pp.id)
      ) p
      where ${naoArquivado("p.event_id")} and ${doEvento("p.event_id")}
        and ${janela.patrocinador ? sql`${janela.patrocinador} = any(p.sponsor_ids)` : sql`true`}
    `),
  ]);

  const estoque: EstoqueDaOperacao = {
    ...agregarAtivos(ativos.map((l) => ({ situacao: l.situacao, condicao: l.condicao, unidades: num(l.unidades), registros: num(l.registros) }))),
    ...agregarReuso(entregues.map((l) => ({
      status: l.status, type: l.type, quantity: l.quantity, reuseQty: l.reuse_qty, isReuse: l.is_reuse, calculatedM2: l.calculated_m2,
    }))),
    pedidosAoEstoque: { abertos: num(consultas[0]?.abertos), respondidosNoPeriodo: num(consultas[0]?.respondidos) },
    pedidosDePeca: {
      abertos: num(pedidos[0]?.abertos),
      atendidosNoPeriodo: num(pedidos[0]?.atendidos),
      recusadosNoPeriodo: num(pedidos[0]?.recusados),
    },
  };

  // ── Arte ──
  const pecaDaArte = sql`i.deleted_at is null and ${noFunil} and ${naoArquivado("i.event_id")} and ${doEvento("i.event_id")} and ${doPatrocinador("i.id")}`;
  const [porOrigem, retrabalho] = await Promise.all([
    ehq<{ origem: string; n: unknown }>(sql`
      select v.origem, count(*)::int as n
      from item_art_versions v
      join items i on i.id = v.item_id
      where ${naJanela("v.created_at")} and ${pecaDaArte}
      group by v.origem
    `),
    ehq<{ item_id: string; display_id: string | null; versoes: unknown }>(sql`
      select v.item_id, i.display_id, count(*)::int as versoes
      from item_art_versions v
      join items i on i.id = v.item_id
      where v.item_id in (select v2.item_id from item_art_versions v2 where ${naJanela("v2.created_at")})
        and ${pecaDaArte}
      group by v.item_id, i.display_id
      having count(*) >= 3
      order by count(*) desc, i.display_id
      limit ${MAXIMO_DE_PECAS_RETRABALHO}
    `),
  ]);

  const arte: ArteDaOperacao = {
    versoesNoPeriodo: Object.fromEntries(porOrigem.map((l) => [l.origem, num(l.n)])),
    pecasComMaisVersoes: retrabalho.map((l) => ({ itemId: l.item_id, displayId: l.display_id ?? null, versoes: num(l.versoes) })),
  };

  return {
    janela: { de: janela.de, ate: janela.ate, evento: janela.evento, patrocinador: janela.patrocinador },
    geradoEm: new Date(agoraMs).toISOString(),
    aprovacao,
    grafica,
    pessoas,
    estoque,
    arte,
  };
}
