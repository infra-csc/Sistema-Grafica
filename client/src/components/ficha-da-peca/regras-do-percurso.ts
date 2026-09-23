// O PERCURSO DA PEÇA — conta pura, a partir dos audit logs e dos carimbos do item.
import { getStatusLabel } from "@/lib/status";
import { T, TOM } from "@/lib/theme";
import { dataDoValor, fmtShort } from "./formatos";
import type { EventoDoPercurso, ItemDaFicha, RegistroDaFicha } from "./tipos";

type EtapaDoHistorico = { label: string; keywords: string[]; pool: RegistroDaFicha[]; actionType?: string; match?: (d: string, target: string) => boolean };
type EtapaResolvida = { date: string; user?: string | null; ts?: string | Date | null } | null;

/** Mais antigo primeiro, pela data do registro (camelCase ou snake_case). */
const porData = (a: RegistroDaFicha, b: RegistroDaFicha) =>
  dataDoValor(a.createdAt ?? a.created_at).getTime() -
  dataDoValor(b.createdAt ?? b.created_at).getTime();

export function montarPercurso(item: ItemDaFicha, auditLogs: readonly RegistroDaFicha[]) {
  const itemLogs = auditLogs
    .filter((l) => (l.entityId ?? l.entity_id ?? "") === item.id)
    .sort(porData);

  const itemLogsInclusive = auditLogs
    .filter((l) =>
      String(l.entityId ?? l.entity_id ?? "")
        .split(",").map((s: string) => s.trim()).includes(item.id))
    .sort(porData);

  // Ações que NÃO são etapas do fluxo: acontecem em paralelo a ele e trazem
  // TEXTO LIVRE escrito por uma pessoa (o motivo do complemento, por exemplo).
  //
  // Por que isto precisa existir: `resolveStages` casa cada etapa por PALAVRA
  // dentro da mensagem. Um motivo como "o cliente pediu mais 4 para a
  // conferência de sábado" contém "conferência" e ROUBARIA a etapa "Conferido"
  // de uma peça que nunca foi conferida — carimbando uma data falsa na trilha
  // que o fechamento lê. Tirar estas ações do pool das etapas resolve para
  // sempre, e elas voltam logo abaixo, renderizadas como evento próprio.
  const EXTRA_ACTIONS = ["complement_created", "complement_canceled"];
  const isExtraAction = (l: RegistroDaFicha) => EXTRA_ACTIONS.includes(String(l.action ?? ""));
  const itemLogsFlow = itemLogs.filter((l) => !isExtraAction(l));
  const itemLogsInclusiveFlow = itemLogsInclusive.filter((l) => !isExtraAction(l));

  /**
   * Resolve as etapas do fluxo contra os audit logs.
   *
   * O ponto delicado é que as mensagens têm o formato
   * "Status alterado: <origem> → <destino>", ou seja, carregam também o nome do
   * status ANTERIOR. Procurando no texto inteiro, cada etapa casava com a
   * transição SEGUINTE: "Em aprovação de patrocinador" pegava o log que SAI de
   * "Aguardando Aprovação", que na verdade é a aprovação. Por isso o casamento
   * de status olha só o trecho depois da seta.
   */
  const resolveStages = (stages: EtapaDoHistorico[]) => {
    const out = new Map<string, EtapaResolvida>();

    for (const stage of stages) {
      const log = stage.pool.find((log) => {
        if (stage.actionType && log.action === stage.actionType) return true;
        const d = (log.details || log.action || "").toLowerCase();
        const arrow = d.lastIndexOf("→");
        const target = arrow >= 0 ? d.slice(arrow + 1) : d;
        if (stage.match?.(d, target)) return true;
        return stage.keywords.some(k => target.includes(k.toLowerCase()));
      });

      out.set(stage.label, log ? {
        date: fmtShort(log.createdAt ?? log.created_at),
        user: log.userName ?? log.user_name,
        ts: log.createdAt ?? log.created_at,
      } : null);
    }
    return out;
  };

  const createdLog = itemLogs.find((l) => l.action === "created");

  // `match` recebe a mensagem inteira e o trecho após a seta (o status de
  // destino). Use `target` para status; `d` só quando o texto livre é a pista.
  const historyStages: EtapaDoHistorico[] = [
    { label: "Criado / Solicitado",            keywords: ["criado"],                    pool: itemLogsFlow,          actionType: "created" },
    { label: "Vinculação de patrocinador",      keywords: ["patrocinadores atualizados"], pool: itemLogsFlow },
    // Aqui a pista é o texto livre no início da mensagem, não o status.
    { label: "Enviado para Arte",               keywords: [], pool: itemLogsInclusiveFlow,
      match: d => (d.includes("enviad") && d.includes("arte")) || d.includes("aguard. envio →") || d.includes("aguard envio →") },
    // Daqui em diante, o destino é o que identifica a etapa.
    { label: "Em aprovação de patrocinador",    keywords: ["aguardando aprovação"],      pool: itemLogsFlow },
    { label: "Aprovado — Finalização",          keywords: ["aguardando finaliz"], pool: itemLogsFlow,
      match: (d, t) => t.includes("aguardando finaliz")
                    || d.includes("todos os patrocinadores aprovaram")
                    || d.includes("aprovado pelo patrocinador") },
    { label: "Aguardando revisão final",        keywords: ["aguardando revisão final"], pool: itemLogsFlow,
      match: (d, t) => t.includes("aguardando revisão final") || d.includes("arquivo final adicionado") },
    { label: "Liberado para Produção",          keywords: ["pronto p/ produção", "pronto para produção", "liberado para produção"], pool: itemLogsFlow,
      match: (d, t) => t.includes("pronto p/ produção") || t.includes("pronto para produção")
                    || d.includes("liberado para produção") || d.includes("aprovado para produção") },
    // Os nomes mudaram em 14/09; a trilha antiga continua dizendo "Em Produção"
    // e "Produzido", então as palavras velhas seguem reconhecidas.
    { label: "Em Impressão",                    keywords: ["em impressão", "impressão iniciada", "em produção"], pool: itemLogsFlow, actionType: "production" },
    { label: "Impresso / Acabamento",             keywords: ["impresso / acabamento", "acabamento / conferência", "produzido"], pool: itemLogsFlow, actionType: "produced" },
    // As etapas da Gráfica faltavam por completo: a trilha terminava em
    // "Produzido" mesmo em peças já conferidas e entregues.
    { label: "Conferido",                       keywords: [], pool: itemLogsFlow,
      match: d => d.includes("conferência") },
    // Embalado (21/09): entrou no tubo já conferida — ou o tubo fechou com foto.
    { label: "Embalado",                        keywords: [], pool: itemLogsFlow,
      match: d => d.includes("embalada no tubo") || d.startsWith("embalada (sozinha)") },
    { label: "Entregue",                        keywords: [], pool: itemLogsFlow, actionType: "delivered",
      match: d => d.includes("entrega concluída") || d.includes("entrega parcial") },
  ];

  const stageLogs = resolveStages(historyStages);
  const logBy = (l: EtapaResolvida | undefined) => l?.user ?? null;
  const conferLog = stageLogs.get("Conferido");

  const CORES_ACAO: Record<string, string> = {
    created: TOM.info.dot,
    rejected: TOM.perigo.text,
    deleted: TOM.perigo.text,
    approved: TOM.sucesso.text,
    delivered: TOM.esmeralda.dot,
    produced: TOM.roxo.dot,
    production: TOM.alerta.dot,
    restored: TOM.ceu.dot,
    complement_created: T.accent,
    complement_canceled: T.accent,
  };
  // Cinza para o que não tem família própria — `updated` é a maioria. #78716c e
  // não o #a8a29e de antes: o ponto é o único código de cor da linha, então vale
  // por ele o mínimo de 3:1 de elemento gráfico, e 2,52 não chegava lá.
  const corDaAcao = (a: string) => CORES_ACAO[a] ?? T.second;

  /** Fallback de texto: log antigo sem `details` ainda precisa dizer algo. */
  const textoDoLog = (l: RegistroDaFicha) =>
    String(l.details ?? "").trim() || getStatusLabel(String(l.action ?? "")) || String(l.action ?? "registro");

  const createdBy = createdLog?.userName ?? createdLog?.user_name ?? null;

  // ═══════════════════════════════════════════════════════════════════════════
  // O PERCURSO — uma lista só.
  //
  // A ficha trazia DUAS trilhas dos mesmos acontecimentos, lado a lado:
  // "Rastreabilidade Temporal" (tabela de etapas, vinda dos carimbos do item e
  // de etapas resolvidas contra os logs) e "Histórico" (a lista de logs). Quem
  // lia via cada evento duas vezes, em dois formatos, e tinha de descobrir
  // sozinho que eram a mesma coisa.
  //
  // A ESPINHA é a lista de logs: é o registro completo, tem o texto que uma
  // pessoa escreveu e tem autor. Dos carimbos do item entra apenas o que NÃO
  // tem log correspondente — uma peça migrada, por exemplo, tem `producedAt`
  // sem nenhum log de produção. Etapas que já vinham resolvidas CONTRA os logs
  // não entram nunca: seriam o mesmo registro, com outro rótulo.
  //
  // A janela de 90s existe porque as duas fontes são gravadas na mesma
  // transação, mas não no mesmo instante.
  // ═══════════════════════════════════════════════════════════════════════════
  const JANELA_MESMO_EVENTO_MS = 90_000;

  const eventosDeLog: EventoDoPercurso[] = itemLogs.map((l, i) => ({
    chave: String(l.id ?? `${l.action}-${l.createdAt ?? l.created_at}-${i}`),
    ts: dataDoValor(l.createdAt ?? l.created_at).getTime(),
    texto: textoDoLog(l),
    autor: l.userName ?? l.user_name ?? null,
    cor: corDaAcao(String(l.action ?? "")),
  })).filter((e) => Number.isFinite(e.ts));

  // Só carimbos do PRÓPRIO item: colunas de data que existem no registro.
  const carimbosDoItem = [
    { label: "Solicitada",                 valor: item.createdAt,            por: createdBy,             cor: TOM.info.dot },
    { label: "Aprovada pelo patrocinador", valor: item.sponsorApprovedAt,    por: item.sponsorApprovedBy, cor: TOM.sucesso.text },
    { label: "Revisada pela Solicitação",  valor: item.creatorReviewedAt,    por: null,                  cor: TOM.roxo.dot },
    { label: "Liberada para produção",     valor: item.approvedAt,           por: null,                  cor: T.accent },
    // 21/09: o vocabulário do selo — "Em Impressão" / "Impresso". "Produção
    // iniciada"/"Produzida" eram os nomes antigos das mesmas duas etapas.
    { label: "Impressão iniciada",         valor: item.productionStartedAt,  por: null,                  cor: TOM.alerta.dot },
    { label: "Impressão concluída",        valor: item.producedAt,           por: null,                  cor: TOM.roxo.dot },
    { label: "Conferida",                  valor: item.conferredAt,          por: logBy(conferLog),      cor: TOM.ciano.dot },
    { label: "Entregue",                   valor: item.deliveredAt,          por: item.receivedBy,       cor: TOM.esmeralda.dot },
  ].filter(c => !!c.valor);

  const eventosPercurso: EventoDoPercurso[] = [...eventosDeLog];
  for (const c of carimbosDoItem) {
    const ts = dataDoValor(c.valor).getTime();
    if (!Number.isFinite(ts)) continue;
    const jaTemLog = eventosDeLog.some(e => Math.abs(e.ts - ts) < JANELA_MESMO_EVENTO_MS);
    if (jaTemLog) continue;
    eventosPercurso.push({ chave: `carimbo-${c.label}`, ts, texto: c.label, autor: c.por ?? null, cor: c.cor });
  }
  // Mais recente primeiro: a pergunta que traz alguém aqui é "o que aconteceu
  // por último", não "como tudo começou".
  eventosPercurso.sort((a, b) => b.ts - a.ts);

  return { eventosPercurso, createdBy };
}
