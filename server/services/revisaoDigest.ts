// ─────────────────────────────────────────────────────────────────────────────
// AVISO DA FILA DE REVISÃO — três vezes por dia.
//
// Pedido do dono (24/08): "um e-mail para admin (Yan apenas) e Solicitação, às
// 10h, 15h e 18h, avisando que tem itens para revisar e quantos novos, bem
// resumido, sobre itens na tela de Revisão".
//
// A tela de Revisão lista as peças em `awaiting_final_review` — a Arte já
// mandou o arquivo final e a peça espera o aval de quem abriu o pedido. É uma
// fila que não avisa: quem não abrir a tela não descobre que ela cresceu.
//
// TRÊS DECISÕES QUE MOLDAM O AVISO:
//
//  1. FILA VAZIA NÃO MANDA E-MAIL. Um aviso que chega três vezes por dia
//     dizendo "0 itens" ensina a ignorar o remetente — e aí o dia em que ele
//     traz 14 também é ignorado. Silêncio é informação: se não chegou, não há
//     nada esperando.
//  2. "QUANTOS NOVOS" É DESDE O AVISO ANTERIOR, não desde a meia-noite. Às 15h
//     o que interessa é o que entrou depois das 10h; o corte do dia devolveria
//     a mesma peça três vezes como se fosse notícia.
//  3. NÃO REPETE. O disparo é registrado na trilha, e o horário só dispara se
//     a trilha não tiver o registro daquele dia — assim reiniciar o servidor
//     às 10h05 não manda o aviso das 10h de novo.
// ─────────────────────────────────────────────────────────────────────────────
import { storage } from "../storage";
import { db } from "../db";
import { auditLogs } from "@shared/schema";
import { sql } from "drizzle-orm";
import { entregarEmail, getBookEmailConfig, separarDestinatarios, type BookEmailMessage } from "./bookEmailNotification";

/** O status que a tela de Revisão lista (client/src/pages/solicitacao.tsx). */
export const STATUS_EM_REVISAO = "awaiting_final_review";

/** Horas de disparo, no fuso do negócio. */
export const HORARIOS = [10, 15, 18];

const FUSO = "America/Sao_Paulo";

/**
 * Quem recebe. Lista NOMEADA, como o aviso de book: aqui não vale papel
 * inteiro — o dono pediu ele e a Fernanda, da Solicitação, e mais ninguém.
 *
 * (Ele escreveu "Fernando"; não existe Fernando no cadastro, e a única pessoa
 * da Solicitação com nome parecido é a Fernanda Sanhudo de Oliveira Penna. O
 * cadastro dela tem DUAS contas, uma com o e-mail sem o final do domínio —
 * usamos a válida.)
 */
export const DESTINATARIOS_DA_REVISAO = [
  "yan.araujo@nortemkt.com",
  "fernanda.oliveira@ttkmarketing.com.br",
];

export type ResumoDaRevisao = {
  total: number;
  novos: number;
  semArquivo: number;
  diasDoMaisAntigo: number | null;
  porEvento: { evento: string; n: number }[];
};

const DIA_MS = 86400000;

/** "YYYY-MM-DD" e a hora, no fuso do negócio — sem depender do fuso do servidor. */
export function agoraNoFuso(quando: Date): { dia: string; hora: number; minuto: number } {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(quando).map((x) => [x.type, x.value]));
  return {
    dia: `${p.year}-${p.month}-${p.day}`,
    hora: Number(p.hour),
    minuto: Number(p.minute),
  };
}

/**
 * O instante do aviso ANTERIOR: o horário de hoje que vem antes deste, ou o
 * último de ontem quando este é o primeiro do dia.
 */
export function inicioDaJanela(agora: Date): Date {
  const { hora } = agoraNoFuso(agora);
  const anteriores = HORARIOS.filter((h) => h < hora);
  const alvo = anteriores.length > 0 ? anteriores[anteriores.length - 1] : HORARIOS[HORARIOS.length - 1];
  const base = new Date(agora);
  if (anteriores.length === 0) base.setTime(base.getTime() - DIA_MS);
  // O offset do fuso é aplicado comparando o relógio local do fuso com o UTC.
  const { hora: horaAgora } = agoraNoFuso(base);
  base.setTime(base.getTime() - (horaAgora - alvo) * 3600000);
  base.setMinutes(0, 0, 0);
  return base;
}

export function montarResumo(
  itens: any[],
  nomeDoEvento: (eventId: string) => string,
  desde: Date,
  agora: Date,
): ResumoDaRevisao {
  const naFila = itens.filter((i) => i.status === STATUS_EM_REVISAO && !i.deletedAt);
  const entrouEm = (i: any) => new Date(i.statusChangedAt ?? i.updatedAt ?? i.createdAt).getTime();

  const porEvento = new Map<string, number>();
  for (const i of naFila) {
    const nome = nomeDoEvento(i.eventId) || "Sem evento";
    porEvento.set(nome, (porEvento.get(nome) ?? 0) + 1);
  }

  const maisAntigo = naFila.reduce<number | null>((min, i) => {
    const t = entrouEm(i);
    return Number.isFinite(t) && (min === null || t < min) ? t : min;
  }, null);

  return {
    total: naFila.length,
    novos: naFila.filter((i) => entrouEm(i) >= desde.getTime()).length,
    semArquivo: naFila.filter((i) => !i.finalFileUrl).length,
    diasDoMaisAntigo: maisAntigo === null ? null : Math.floor((agora.getTime() - maisAntigo) / DIA_MS),
    porEvento: Array.from(porEvento.entries())
      .map(([evento, n]) => ({ evento, n }))
      .sort((a, b) => b.n - a.n),
  };
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
));

export function construirEmailDaRevisao(
  r: ResumoDaRevisao,
  config: { from?: string; appUrl?: string },
  destinatarios: string[],
): BookEmailMessage | { erro: string } {
  const { validos, descartados } = separarDestinatarios(destinatarios);
  if (!config.from) return { erro: "remetente ausente" };
  if (!config.appUrl) return { erro: "BOOK_EMAIL_APP_URL ausente — o aviso não teria para onde apontar" };
  if (validos.length === 0) return { erro: `nenhum destinatário válido${descartados.length ? ` (descartados: ${descartados.join(", ")})` : ""}` };

  const link = `${config.appUrl}/solicitacao`;
  const pecas = (n: number) => `${n} ${n === 1 ? "peça" : "peças"}`;
  // O ASSUNTO carrega o número: é o que decide se a pessoa abre agora ou
  // depois, e é o que sobrevive ao corte da caixa de entrada.
  const subject = r.novos > 0
    ? `Revisão · ${pecas(r.total)} esperando · ${r.novos} ${r.novos === 1 ? "nova" : "novas"}`
    : `Revisão · ${pecas(r.total)} esperando`;

  const linhas: string[] = [
    `${pecas(r.total)} aguardando sua revisão.`,
    r.novos > 0 ? `${r.novos} ${r.novos === 1 ? "entrou" : "entraram"} na fila desde o aviso anterior.` : "Nenhuma nova desde o aviso anterior.",
  ];
  if (r.semArquivo > 0) linhas.push(`${pecas(r.semArquivo)} ainda sem arquivo final.`);
  if (r.diasDoMaisAntigo !== null && r.diasDoMaisAntigo >= 1) {
    linhas.push(`A mais antiga espera há ${r.diasDoMaisAntigo} ${r.diasDoMaisAntigo === 1 ? "dia" : "dias"}.`);
  }

  const FONTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif";
  const eventos = r.porEvento.slice(0, 5);
  const resto = r.porEvento.length - eventos.length;

  const html = [
    "<!doctype html>",
    '<html lang="pt-BR"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">',
    `<title>${esc(subject)}</title></head>`,
    '<body style="margin:0;padding:0;background:#f5f5f4;-webkit-text-size-adjust:100%;">',
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(linhas.join(" "))}</div>`,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f4;">',
    '<tr><td align="center" style="padding:24px 12px;">',
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid #e7e5e4;border-radius:14px;overflow:hidden;">',
    '<tr><td style="background:#1c1917;padding:18px 32px;">',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`,
    `<td style="font-family:${FONTE};font-size:12px;font-weight:bold;letter-spacing:.16em;color:#ffffff;">NORTE</td>`,
    `<td align="right" style="font-family:${FONTE};font-size:11px;letter-spacing:.06em;color:#a8a29e;">FILA DE REVISÃO</td>`,
    "</tr></table></td></tr>",
    '<tr><td style="padding:30px 32px 8px;">',
    `<div style="font-family:${FONTE};font-size:44px;font-weight:bold;line-height:1;color:#1c1917;">${r.total}</div>`,
    `<div style="font-family:${FONTE};font-size:15px;color:#57534e;padding-top:6px;">${esc(r.total === 1 ? "peça aguardando sua revisão" : "peças aguardando sua revisão")}</div>`,
    "</td></tr>",
    ...(r.novos > 0 ? [
      '<tr><td style="padding:14px 32px 0;">',
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;"><tr>`,
      `<td style="padding:12px 14px;font-family:${FONTE};font-size:14px;color:#9a3412;line-height:1.45;">`,
      `<strong>${r.novos}</strong> ${r.novos === 1 ? "entrou" : "entraram"} na fila desde o aviso anterior.`,
      "</td></tr></table></td></tr>",
    ] : []),
    '<tr><td style="padding:18px 32px 0;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
    ...(r.semArquivo > 0 ? [`<tr><td style="padding:0 0 8px;font-family:${FONTE};font-size:14px;color:#1c1917;">Sem arquivo final: <strong>${r.semArquivo}</strong></td></tr>`] : []),
    ...(r.diasDoMaisAntigo !== null && r.diasDoMaisAntigo >= 1
      ? [`<tr><td style="padding:0 0 8px;font-family:${FONTE};font-size:14px;color:#1c1917;">A mais antiga espera há <strong>${r.diasDoMaisAntigo} ${r.diasDoMaisAntigo === 1 ? "dia" : "dias"}</strong></td></tr>`]
      : []),
    ...eventos.map((e) => `<tr><td style="padding:0 0 6px;font-family:${FONTE};font-size:13px;color:#57534e;">${esc(e.evento)} — <strong style="color:#1c1917;">${e.n}</strong></td></tr>`),
    ...(resto > 0 ? [`<tr><td style="font-family:${FONTE};font-size:13px;color:#78716c;">e mais ${resto} ${resto === 1 ? "evento" : "eventos"}</td></tr>`] : []),
    "</table></td></tr>",
    '<tr><td style="padding:22px 32px 28px;">',
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#ea580c;border-radius:10px;">`,
    `<a href="${esc(link)}" style="display:inline-block;padding:14px 26px;font-family:${FONTE};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">Abrir a fila de revisão</a>`,
    "</td></tr></table></td></tr>",
    '<tr><td style="padding:14px 32px;background:#fafaf9;border-top:1px solid #e7e5e4;">',
    `<div style="font-family:${FONTE};font-size:12px;color:#78716c;line-height:1.5;">Aviso automático às ${HORARIOS.map((h) => `${h}h`).join(", ")}. Quando não há nada esperando, ele não é enviado.</div>`,
    "</td></tr></table></td></tr></table></body></html>",
  ].join("");

  return {
    from: config.from,
    to: validos,
    subject,
    text: [...linhas, "", "Abrir a fila de revisão:", link].join("\n"),
    html,
  };
}

const DETALHE_TRILHA = "Aviso da fila de revisão";

/** Já foi mandado o aviso deste horário hoje? A trilha é a memória. */
async function jaAvisou(dia: string, hora: number): Promise<boolean> {
  const marca = `${DETALHE_TRILHA} (${dia} ${hora}h)`;
  const linhas = await db.select({ id: auditLogs.id }).from(auditLogs)
    .where(sql`${auditLogs.entityType} = 'revisao' and ${auditLogs.details} like ${marca + "%"}`)
    .limit(1);
  return linhas.length > 0;
}

export async function enviarAvisoDaRevisao(
  agora: Date,
  env: Record<string, string | undefined> = process.env,
  opcoes: { manual?: boolean } = {},
): Promise<
  { status: "desligado" | "sem-fila" | "ja-enviado" | "simulado" | "enviado" | "falhou"; resumo?: ResumoDaRevisao; motivo?: string }
> {
  // O disparo MANUAL ignora o interruptor e a memória da trilha, porque ele é
  // outra coisa: alguém pediu agora, na tela, e está esperando o e-mail. O que
  // ele não ignora é a fila vazia — mandar "0 itens" a pedido também ensina a
  // ignorar o remetente.
  const ligado = opcoes.manual || env.REVISAO_DIGEST_ENABLED?.trim().toLowerCase() === "true";
  if (!ligado) return { status: "desligado" };

  const { dia, hora } = agoraNoFuso(agora);
  if (!opcoes.manual && await jaAvisou(dia, hora)) return { status: "ja-enviado" };

  const [itens, eventos] = await Promise.all([storage.getAllItems(), storage.getAllEvents()]);
  const nomePorId = new Map(eventos.map((e) => [e.id, e.name]));
  const resumo = montarResumo(itens, (id) => nomePorId.get(id) ?? "", inicioDaJanela(agora), agora);

  // Fila vazia não vira e-mail: aviso que chega dizendo "0" ensina a ignorar o
  // remetente, e aí o dia em que ele traz 14 também é ignorado.
  if (resumo.total === 0) return { status: "sem-fila", resumo };

  const config = getBookEmailConfig(env);
  const montado = construirEmailDaRevisao(resumo, config, DESTINATARIOS_DA_REVISAO);
  if ("erro" in montado) {
    console.warn("[revisao-digest] não enviado", { motivo: montado.erro });
    return { status: "falhou", motivo: montado.erro, resumo };
  }

  const marcaManual = opcoes.manual ? " [manual]" : "";
  const registrar = async (desfecho: string) => {
    await db.insert(auditLogs).values({
      userName: "Sistema",
      action: "updated",
      entityType: "revisao",
      entityId: dia,
      details: `${DETALHE_TRILHA} (${dia} ${hora}h)${marcaManual}: ${desfecho}`,
    } as any);
  };

  if (config.dryRun) {
    await registrar(`simulação para ${montado.to.join(", ")} — ${resumo.total} na fila, ${resumo.novos} novas`);
    console.info("[revisao-digest] simulação", { dia, hora, total: resumo.total, novos: resumo.novos });
    return { status: "simulado", resumo };
  }

  try {
    await entregarEmail(montado);
    await registrar(`enviado para ${montado.to.join(", ")} — ${resumo.total} na fila, ${resumo.novos} novas`);
    console.info("[revisao-digest] enviado", { dia, hora, total: resumo.total, novos: resumo.novos });
    return { status: "enviado", resumo };
  } catch (error) {
    const motivo = error instanceof Error ? error.message : "falha desconhecida";
    await registrar(`NÃO enviado: ${motivo}`);
    console.error("[revisao-digest] falha", { dia, hora, motivo });
    return { status: "falhou", motivo, resumo };
  }
}

/**
 * O relógio. Bate de minuto em minuto e só age nos cinco primeiros minutos da
 * hora marcada — janela larga o bastante para sobreviver a um tick perdido, e
 * estreita o bastante para não virar outra coisa. Quem impede a repetição é a
 * trilha, não a janela.
 */
export function startRevisaoDigest(): void {
  setInterval(async () => {
    try {
      const agora = new Date();
      const { hora, minuto } = agoraNoFuso(agora);
      if (!HORARIOS.includes(hora) || minuto >= 5) return;
      await enviarAvisoDaRevisao(agora);
    } catch (error) {
      console.error("[revisao-digest] erro no tique", error);
    }
  }, 60_000);
}
