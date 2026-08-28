// ─────────────────────────────────────────────────────────────────────────────
// AVISO DA GESTÃO — as aprovações pendentes de eventos que ainda vão acontecer.
//
// Pedido do dono (25/08): "os cargos de gestão (Agatha, Kakau e Ana)
// precisariam receber os avisos apenas com o objetivo de acompanhar as
// aprovações da equipe — similar ao que enviamos da revisão, um resumão de
// pendências". Depois de ver o primeiro desenho, ele escolheu o corte:
// "detalhado com foco nos eventos e patrocinadores, sem nome de executivo".
//
// O CORTE, então: EVENTO → PATROCINADOR. É o mapa de quem ainda não decidiu,
// evento a evento, com o prazo do caminhão do lado — que é o que transforma
// "12 pendentes" em "12 pendentes e o caminhão sai em 3 dias".
//
// NENHUM NOME DE PESSOA aqui, de propósito. O primeiro desenho agrupava por
// executivo e o dono cortou: este aviso é sobre o que falta decidir, não sobre
// quem está devendo. Se algum dia voltar a nomear executivo, terá voltado a
// ser outra coisa.
//
// SÓ EVENTO QUE AINDA VAI ACONTECER (correção do dono, 25/08, com o primeiro
// e-mail na mão): a primeira versão trouxe evento já realizado, cujas peças
// ninguém vai mais aprovar. Ver `eventoVaiAcontecer` em montarResumoDaGestao.
//
// A ORDEM é a urgência real: caminhão que sai primeiro no topo, evento sem
// data no fim. É a mesma régua da tela de Eventos.
//
// HERDA DO AVISO DA REVISÃO, de propósito, três decisões já tomadas:
//  1. FILA VAZIA NÃO MANDA E-MAIL — aviso que chega dizendo "0" ensina a
//     ignorar o remetente.
//  2. NÃO REPETE: o disparo fica na trilha, e o horário só age se a trilha não
//     tiver o registro daquele dia (reiniciar o servidor não remanda).
//  3. SÓ PRODUÇÃO ENVIA: o workspace de desenvolvimento compartilha segredos e
//     conector com o deploy, e já mandou aviso em dobro uma vez.
//
// TRÊS VEZES POR DIA, nos mesmos horários do aviso da Revisão (10h, 15h, 18h).
// O primeiro desenho mandava uma vez de manhã, com o argumento de que
// acompanhamento não é plantão; o dono decidiu três, e o argumento cai por
// terra sozinho na conta: aprovação muda ao longo do dia, e a foto das 10h já
// está velha às 15h. O que segura a repetição virar ruído é a fila vazia não
// mandar nada.
//
// E o DISPARO À MÃO (25/08): o aviso sai do sistema, e o conector de e-mail só
// autentica no ambiente publicado — sem um botão, a única forma de descobrir
// que o canal caiu seria ninguém receber nada e ninguém estranhar.
// ─────────────────────────────────────────────────────────────────────────────
import { storage } from "../storage";
import { ehBookCompleto } from "@shared/fluxo-peca";
import { db } from "../db";
import { auditLogs } from "@shared/schema";
import { sql } from "drizzle-orm";
import { entregarEmail, getBookEmailConfig, separarDestinatarios, type BookEmailMessage } from "./bookEmailNotification";
import { agoraNoFuso, ehProducao } from "./revisaoDigest";
import { eventDayMs, todayBusinessMs, EVENT_CLOSED_STATUS } from "@shared/prazo-dates";

/**
 * Horas de disparo, no fuso do negócio — as mesmas do aviso da Revisão
 * (decisão do dono, 25/08, depois de ver o desenho pronto). Acompanhar
 * aprovação é acompanhar o dia: às 15h já mudou o que era verdade às 10h.
 */
export const HORARIOS_DA_GESTAO = [10, 15, 18];

/**
 * Quem recebe. Lista NOMEADA, como os outros dois avisos: não existe papel
 * "gestão" no sistema — as três são atendimento, e por papel o aviso iria
 * para a equipe inteira, que é justamente quem ele acompanha.
 */
export const DESTINATARIOS_DA_GESTAO = [
  "agatha.nadolsky@nortemkt.com",
  "kakau.faria@nortemkt.com",
  "ana.motta@nortemkt.com",
  // A direção acompanha junto (25/08) — mesmas cinco pessoas do aviso do book.
  "yan.araujo@nortemkt.com",
  "pedro@nortemkt.com",
  // Entraram em 27/08, a pedido do dono ("adicionar objeto e livia").
  "livia.monteiro@nortemkt.com",
  "objeto@cscdoesporte.com.br",
];

/** Peça esperando decisão de patrocinador. */
const STATUS_EM_APROVACAO = ["awaiting_sponsor_approval", "awaiting_approval"];

/** Parada demais: acima disso a pendência entra na conta de "travadas". */
export const DIAS_PARA_TRAVADA = 7;

/** Teto de eventos listados: o e-mail é resumo, não relatório. */
export const MAX_EVENTOS = 12;

const DIA_MS = 86400000;
const DETALHE_TRILHA = "Aviso da gestão";

export type LinhaDePatrocinador = {
  nome: string;
  /** Peças esperando a decisão DESTE patrocinador neste evento. */
  pecas: number;
  diasDoMaisAntigo: number;
  travadas: number;
};

export type BlocoDeEvento = {
  eventId: string;
  evento: string;
  /** ISO da saída do caminhão, quando houver. */
  saidaDoCaminhao: string | null;
  /** Dias até a saída; negativo = já saiu; null = sem data. */
  diasParaSaida: number | null;
  pendentes: number;
  pecas: number;
  travadas: number;
  patrocinadores: LinhaDePatrocinador[];
};

export type ResumoDaGestao = {
  /** Linhas de aprovação pendentes (peça × patrocinador). */
  totalPendentes: number;
  /** Peças distintas esperando alguma decisão. */
  pecasPendentes: number;
  travadas: number;
  eventos: BlocoDeEvento[];
  /** Eventos que não couberam no teto — contados, nunca escondidos em silêncio. */
  eventosOcultos: number;
};

/**
 * O resumo, como função PURA — recebe as tabelas já lidas e devolve os
 * números. É assim que o conteúdo do e-mail fica testável sem banco.
 */
export function montarResumoDaGestao(
  itens: any[],
  aprovacoes: any[],
  sponsors: { id: string; name: string }[],
  eventos: any[],
  agora: Date,
): ResumoDaGestao {
  const eventoPorId = new Map(eventos.map((e) => [e.id, e]));

  // ── SÓ EVENTO QUE AINDA VAI ACONTECER (correção do dono, 25/08) ──────────
  // A primeira versão listava toda aprovação pendente do banco — inclusive de
  // evento já realizado, cujas peças ninguém vai mais aprovar nem imprimir.
  // Cobrar decisão sobre evento passado é o jeito mais rápido de o aviso virar
  // ruído: quem lê aprende que metade da lista é lixo, e passa a não olhar a
  // outra metade.
  //
  // POR QUE A RÉGUA AQUI É MAIS ESTRITA QUE O PREDICADO CANÔNICO. O
  // `motivoEventoFinalizado` (@shared/prazo-dates) abre uma exceção: evento
  // REABERTO à mão depois da data volta a contar, porque alguém afirmou que
  // ainda há trabalho ali. Para as TELAS isso está certo — quem reabriu quer
  // ver e mexer. Para o AVISO o dono decidiu o contrário (25/08): "mesmo
  // reaberto à mão e a data passou, não avisa". E a diferença faz sentido:
  // reabrir é para arrumar a casa de um evento que já aconteceu, e ninguém
  // precisa ser lembrado disso três vezes por dia.
  //
  // Então: encerrado à mão sai, e data passada sai — sem a exceção da
  // reabertura. É deliberadamente uma régua local, e é por isso que ela está
  // escrita aqui em vez de virar mais um parâmetro do predicado compartilhado.
  const hojeBiz = todayBusinessMs();
  const eventoVaiAcontecer = (eventId: string) => {
    const ev = eventoPorId.get(eventId);
    // Peça órfã (evento apagado) não tem como ser cobrada de ninguém.
    if (!ev) return false;
    if (ev.manuallyClosed === true || ev.status === EVENT_CLOSED_STATUS) return false;
    const dia = eventDayMs(ev.startDate);
    // Data ilegível é raro (a coluna é obrigatória) e não é motivo para sumir
    // com a pendência: uma linha que alguém pode julgar vale mais que uma
    // omissão silenciosa.
    if (dia === null) return true;
    return hojeBiz <= dia;
  };

  // BOOK COMPLETO fica de fora: é o trâmite do Atendimento, não uma peça.
  const emAprovacao = new Map(
    itens
      .filter((i) => !i.deletedAt && STATUS_EM_APROVACAO.includes(i.status) && !ehBookCompleto(i) && eventoVaiAcontecer(i.eventId))
      .map((i) => [i.id, i]),
  );
  const nomeDoSponsor = new Map(sponsors.map((s) => [s.id, s.name]));

  const pendentes = aprovacoes.filter((a) => a.status === "pending" && emAprovacao.has(a.itemId));

  type Acc = {
    pecas: Set<string>;
    travadas: number;
    porSponsor: Map<string, { pecas: Set<string>; maisAntigo: number; travadas: number }>;
    pendentes: number;
  };
  const porEvento = new Map<string, Acc>();
  const pecasTotais = new Set<string>();
  let travadasTotais = 0;

  for (const a of pendentes) {
    const item = emAprovacao.get(a.itemId);
    const eventId = item.eventId ?? "";
    pecasTotais.add(a.itemId);

    // DESDE QUANDO espera: o carimbo de status da peça é a entrada na fila de
    // aprovação; a criação da linha é a reserva. Vale a mais recente das duas —
    // uma peça devolvida e reenviada recomeça a contagem.
    const desde = Math.max(
      new Date(item.statusChangedAt ?? item.updatedAt ?? item.createdAt).getTime(),
      new Date(a.createdAt ?? item.createdAt).getTime(),
    );
    const dias = Math.floor((agora.getTime() - desde) / DIA_MS);
    const travada = dias >= DIAS_PARA_TRAVADA;
    if (travada) travadasTotais++;

    const acc = porEvento.get(eventId) ?? { pecas: new Set<string>(), travadas: 0, porSponsor: new Map(), pendentes: 0 };
    acc.pecas.add(a.itemId);
    acc.pendentes += 1;
    if (travada) acc.travadas += 1;

    // Patrocinador apagado do cadastro não vira linha anônima: dizer o id não
    // ajuda ninguém, e "—" ao menos é honesto sobre o que se sabe.
    const nome = nomeDoSponsor.get(a.sponsorId) ?? "Patrocinador removido do cadastro";
    const s = acc.porSponsor.get(nome) ?? { pecas: new Set<string>(), maisAntigo: dias, travadas: 0 };
    s.pecas.add(a.itemId);
    s.maisAntigo = Math.max(s.maisAntigo, dias);
    if (travada) s.travadas += 1;
    acc.porSponsor.set(nome, s);

    porEvento.set(eventId, acc);
  }

  const blocos: BlocoDeEvento[] = Array.from(porEvento.entries()).map(([eventId, acc]) => {
    const ev = eventoPorId.get(eventId);
    const saida = ev?.truckDepartureDate ? new Date(ev.truckDepartureDate as any) : null;
    const diasParaSaida = saida && Number.isFinite(saida.getTime())
      ? Math.ceil((saida.getTime() - agora.getTime()) / DIA_MS)
      : null;
    return {
      eventId,
      evento: ev?.name ?? "Sem evento",
      saidaDoCaminhao: saida && Number.isFinite(saida.getTime()) ? saida.toISOString() : null,
      diasParaSaida,
      pendentes: acc.pendentes,
      pecas: acc.pecas.size,
      travadas: acc.travadas,
      patrocinadores: Array.from(acc.porSponsor.entries())
        .map(([nome, v]) => ({ nome, pecas: v.pecas.size, diasDoMaisAntigo: v.maisAntigo, travadas: v.travadas }))
        // Quem espera há mais tempo primeiro: é a linha que pede cobrança.
        .sort((a, b) => b.diasDoMaisAntigo - a.diasDoMaisAntigo || b.pecas - a.pecas || a.nome.localeCompare(b.nome, "pt-BR")),
    };
  })
    // A urgência real: caminhão que sai primeiro no topo; sem data por último,
    // porque não dá para afirmar que é o mais folgado.
    .sort((a, b) => {
      const ta = a.diasParaSaida ?? Number.MAX_SAFE_INTEGER;
      const tb = b.diasParaSaida ?? Number.MAX_SAFE_INTEGER;
      return ta - tb || b.pendentes - a.pendentes || a.evento.localeCompare(b.evento, "pt-BR");
    });

  return {
    totalPendentes: pendentes.length,
    pecasPendentes: pecasTotais.size,
    travadas: travadasTotais,
    eventos: blocos.slice(0, MAX_EVENTOS),
    eventosOcultos: Math.max(0, blocos.length - MAX_EVENTOS),
  };
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
));

const FONTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";

const fmtDia = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })
    : null;
};

/** "sai em 3 dias" / "sai amanhã" / "já saiu há 2 dias" — o prazo em palavras. */
function frasedoPrazo(dias: number | null): string {
  if (dias === null) return "sem data de saída";
  if (dias < 0) return `caminhão saiu há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "dia" : "dias"}`;
  if (dias === 0) return "caminhão sai hoje";
  if (dias === 1) return "caminhão sai amanhã";
  return `caminhão sai em ${dias} dias`;
}

export function construirEmailDaGestao(
  r: ResumoDaGestao,
  config: { from?: string; appUrl?: string },
  destinatarios: string[],
): BookEmailMessage | { erro: string } {
  const from = config.from?.trim();
  const { validos } = separarDestinatarios(destinatarios);
  if (!from) return { erro: "remetente ausente" };
  if (!config.appUrl) return { erro: "BOOK_EMAIL_APP_URL ausente — sem ela o e-mail não teria para onde apontar" };
  if (validos.length === 0) return { erro: "nenhum destinatário válido" };

  const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

  // O ASSUNTO carrega o número: a caixa de entrada corta o resto, e "há 6
  // paradas" é o que faz alguém abrir.
  const subject = r.travadas > 0
    ? `Aprovações pendentes · ${r.totalPendentes} em ${plural(r.eventos.length, "evento", "eventos")} · ${r.travadas} paradas há ${DIAS_PARA_TRAVADA}+ dias`
    : `Aprovações pendentes · ${r.totalPendentes} em ${plural(r.eventos.length, "evento", "eventos")}`;

  const blocos = r.eventos.map((e) => {
    // Vermelho só quando o caminhão está a menos de uma semana COM pendência —
    // é o cruzamento que muda a decisão de quem lê.
    const urgente = e.diasParaSaida !== null && e.diasParaSaida <= DIAS_PARA_TRAVADA;
    const corPrazo = urgente ? "#b91c1c" : "#78716c";
    const linhas = e.patrocinadores.map((p) => [
      `<tr>`,
      `<td style="padding:7px 12px;border-top:1px solid #f5f4f2;font-size:13.5px;color:#1c1917;">${esc(p.nome)}</td>`,
      `<td style="padding:7px 12px;border-top:1px solid #f5f4f2;font-size:13.5px;color:#57534e;text-align:right;white-space:nowrap;">${plural(p.pecas, "peça", "peças")}</td>`,
      `<td style="padding:7px 12px;border-top:1px solid #f5f4f2;font-size:13.5px;text-align:right;white-space:nowrap;color:${p.travadas > 0 ? "#b91c1c" : "#78716c"};font-weight:${p.travadas > 0 ? "700" : "400"};">há ${plural(p.diasDoMaisAntigo, "dia", "dias")}</td>`,
      `</tr>`,
    ].join("")).join("");

    return [
      `<tr><td style="padding:0 24px 14px;">`,
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e7e5e4;border-radius:10px;border-collapse:separate;overflow:hidden;">`,
      `<tr><td colspan="3" style="padding:11px 12px 9px;background:#fafaf9;">`,
      `<div style="font-size:15px;font-weight:700;color:#1c1917;line-height:1.3;">${esc(e.evento)}</div>`,
      `<div style="margin-top:2px;font-size:12.5px;color:${corPrazo};font-weight:${urgente ? "700" : "400"};">`,
      `${esc(frasedoPrazo(e.diasParaSaida))}${fmtDia(e.saidaDoCaminhao) ? ` · ${fmtDia(e.saidaDoCaminhao)}` : ""}`,
      ` &middot; <span style="color:#57534e;font-weight:400;">${plural(e.pecas, "peça", "peças")} esperando</span>`,
      `</div></td></tr>`,
      linhas,
      `</table></td></tr>`,
    ].join("");
  }).join("");

  const html = [
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<title>${esc(subject)}</title></head>`,
    `<body style="margin:0;padding:0;background:#faf9f7;">`,
    // Pré-cabeçalho: o que a caixa de entrada mostra ao lado do assunto.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${r.totalPendentes} aprovações esperando decisão do patrocinador${r.travadas > 0 ? `, ${r.travadas} paradas há mais de ${DIAS_PARA_TRAVADA} dias` : ""}.</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f7;padding:24px 12px;">`,
    `<tr><td align="center">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;font-family:${FONTE};">`,

    `<tr><td style="padding:22px 24px 4px;">`,
    `<div style="font-size:11px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:#c2410c;">NORTE · Acompanhamento</div>`,
    `<h1 style="margin:6px 0 0;font-size:20px;line-height:1.25;color:#1c1917;">Aprovações pendentes</h1>`,
    `<p style="margin:6px 0 0;font-size:14px;line-height:1.5;color:#57534e;">`,
    `<strong style="color:#1c1917;">${r.totalPendentes}</strong> ${r.totalPendentes === 1 ? "aprovação espera" : "aprovações esperam"} decisão do patrocinador, em ${plural(r.pecasPendentes, "peça", "peças")} de ${plural(r.eventos.length, "evento", "eventos")}.`,
    r.travadas > 0 ? ` <strong style="color:#b91c1c;">${r.travadas}</strong> ${r.travadas === 1 ? "está parada" : "estão paradas"} há ${DIAS_PARA_TRAVADA} dias ou mais.` : "",
    `</p></td></tr>`,

    `<tr><td style="height:16px;line-height:16px;">&nbsp;</td></tr>`,
    blocos,

    r.eventosOcultos > 0
      ? `<tr><td style="padding:0 24px 14px;font-size:12.5px;color:#78716c;">e mais ${plural(r.eventosOcultos, "evento", "eventos")} com pendência — a lista inteira está no Atendimento.</td></tr>`
      : "",

    `<tr><td style="padding:4px 24px 22px;">`,
    `<a href="${esc(`${config.appUrl}/atendimento`)}" style="display:inline-block;background:#1c1917;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:11px 20px;border-radius:9px;">Abrir o Atendimento</a>`,
    `<div style="margin-top:14px;font-size:12px;color:#78716c;line-height:1.5;">Aviso automático às ${HORARIOS_DA_GESTAO.map((h) => `${h}h`).join(", ")}. Quando não há nada esperando, ele não é enviado.</div>`,
    `</td></tr>`,

    `</table></td></tr></table></body></html>`,
  ].join("");

  const texto = [
    `Aprovações pendentes`,
    ``,
    `${r.totalPendentes} ${r.totalPendentes === 1 ? "aprovação espera" : "aprovações esperam"} decisão do patrocinador, em ${plural(r.pecasPendentes, "peça", "peças")} de ${plural(r.eventos.length, "evento", "eventos")}.`,
    r.travadas > 0 ? `${r.travadas} ${r.travadas === 1 ? "parada" : "paradas"} há ${DIAS_PARA_TRAVADA} dias ou mais.` : "",
    ``,
    ...r.eventos.flatMap((e) => [
      `${e.evento} — ${frasedoPrazo(e.diasParaSaida)}${fmtDia(e.saidaDoCaminhao) ? ` (${fmtDia(e.saidaDoCaminhao)})` : ""}`,
      ...e.patrocinadores.map((p) => `  - ${p.nome}: ${plural(p.pecas, "peça", "peças")}, há ${plural(p.diasDoMaisAntigo, "dia", "dias")}`),
      ``,
    ]),
    r.eventosOcultos > 0 ? `e mais ${plural(r.eventosOcultos, "evento", "eventos")} com pendência.` : "",
    `Abrir o Atendimento: ${config.appUrl}/atendimento`,
  ].filter((l) => l !== "").join("\n");

  return { from, to: validos, subject, text: texto, html };
}

// A memória é por DIA E HORÁRIO: com três disparos, marcar só o dia faria o
// das 15h achar que já mandou por causa do das 10h.
async function jaAvisou(dia: string, hora: number): Promise<boolean> {
  const marca = `${DETALHE_TRILHA} (${dia} ${hora}h)`;
  const linhas = await db.select({ id: auditLogs.id }).from(auditLogs)
    .where(sql`${auditLogs.entityType} = 'gestao' and ${auditLogs.details} like ${marca + "%"}`)
    .limit(1);
  return linhas.length > 0;
}

export async function enviarAvisoDaGestao(
  agora: Date,
  env: Record<string, string | undefined> = process.env,
  opcoes: { manual?: boolean } = {},
): Promise<
  { status: "desligado" | "sem-fila" | "ja-enviado" | "simulado" | "enviado" | "falhou"; resumo?: ResumoDaGestao; motivo?: string }
> {
  if (!ehProducao(env)) {
    return { status: "desligado", motivo: "Fora de produção — o ambiente de desenvolvimento não envia e-mail (os dados dele não são os reais)." };
  }
  const ligado = opcoes.manual || env.GESTAO_DIGEST_ENABLED?.trim().toLowerCase() === "true";
  if (!ligado) return { status: "desligado" };

  const { dia, hora } = agoraNoFuso(agora);
  if (!opcoes.manual && await jaAvisou(dia, hora)) return { status: "ja-enviado" };

  const marcaManual = opcoes.manual ? " [manual]" : "";
  const registrar = async (desfecho: string) => {
    await db.insert(auditLogs).values({
      userName: "Sistema",
      action: "updated",
      entityType: "gestao",
      entityId: dia,
      details: `${DETALHE_TRILHA} (${dia} ${hora}h)${marcaManual}: ${desfecho}`,
    } as any);
  };

  const [itens, aprovacoes, sponsors, eventos] = await Promise.all([
    storage.getAllItems(),
    storage.getAllItemSponsorApprovals(),
    storage.getAllSponsors(),
    storage.getAllEvents(),
  ]);
  const resumo = montarResumoDaGestao(itens, aprovacoes, sponsors, eventos, agora);

  // "Não recebi o das 18h" (27/08): os desfechos silenciosos NÃO deixavam
  // rastro — impossível dizer depois se a edição rodou vazia, se a config
  // faltava ou se o relógio nem bateu. Fila vazia e config ausente agora
  // CONSOMEM a edição na trilha (só no automático): o diagnóstico vira uma
  // consulta, e o tique de minuto em minuto para no jaAvisou.
  if (resumo.totalPendentes === 0) {
    if (!opcoes.manual) await registrar("fila vazia — nada a enviar; a edição desta hora fica registrada");
    return { status: "sem-fila", resumo };
  }

  const config = getBookEmailConfig(env);
  const montado = construirEmailDaGestao(resumo, config, DESTINATARIOS_DA_GESTAO);
  if ("erro" in montado) {
    console.warn("[gestao-digest] não enviado", { motivo: montado.erro });
    if (!opcoes.manual) await registrar(`NÃO enviado: ${montado.erro}`);
    return { status: "falhou", motivo: montado.erro, resumo };
  }

  if (config.dryRun) {
    await registrar(`simulação para ${montado.to.join(", ")} — ${resumo.totalPendentes} pendentes, ${resumo.travadas} travadas`);
    console.info("[gestao-digest] simulação", { dia, total: resumo.totalPendentes });
    return { status: "simulado", resumo };
  }

  try {
    await entregarEmail(montado);
    await registrar(`enviado para ${montado.to.join(", ")} — ${resumo.totalPendentes} pendentes, ${resumo.travadas} travadas`);
    console.info("[gestao-digest] enviado", { dia, total: resumo.totalPendentes });
    return { status: "enviado", resumo };
  } catch (error) {
    const motivo = error instanceof Error ? error.message : "falha desconhecida";
    await registrar(`NÃO enviado: ${motivo}`);
    console.error("[gestao-digest] falha", { dia, motivo });
    return { status: "falhou", motivo, resumo };
  }
}

/** O relógio, no mesmo desenho do aviso da Revisão. */
export function startGestaoDigest(): void {
  if (!ehProducao()) {
    console.log("[gestao-digest] fora de produção — o aviso não roda aqui (só o deploy envia).");
    return;
  }
  setInterval(async () => {
    try {
      const agora = new Date();
      const { hora } = agoraNoFuso(agora);
      // A HORA INTEIRA vale — era só hh:00–hh:05, e um republish às 18:02 ou
      // a instância dormindo na virada matavam a edição em silêncio (o "não
      // recebi o das 18h" de 27/08). Quem impede repetição é a trilha
      // (jaAvisou); como fila vazia também consome a edição, o custo do
      // minuto a minuto dentro da hora é um SELECT de uma linha.
      if (!HORARIOS_DA_GESTAO.includes(hora)) return;
      await enviarAvisoDaGestao(agora);
    } catch (error) {
      console.error("[gestao-digest] erro no tique", error);
    }
  }, 60_000);
}
