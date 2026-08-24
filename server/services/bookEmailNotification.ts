// ─────────────────────────────────────────────────────────────────────────────
// AVISO DE BOOK POR E-MAIL
//
// Quando a Arte publica o book de aprovação de um evento, quem cuida daquele
// evento recebe um e-mail. Entrega pelo conector do Replit (Resend).
//
// ── A REVISÃO DE 24/08 (o que mudou e por quê) ───────────────────────────────
// A primeira versão funcionava e era cuidadosa — escapava HTML, validava
// endereços, recusava link de fora e nunca desfazia um book salvo. Os três
// problemas eram de PRODUTO, não de código:
//
//  1. UM DESTINATÁRIO SÓ, IGUAL PARA TODOS OS EVENTOS. `BOOK_EMAIL_TO` é uma
//     variável global; todo book de todos os 38 eventos avisava a mesma
//     pessoa, que passava a repassar e-mail na mão — o trabalho que a
//     automação deveria eliminar. Quem recebe passou a ser decidido pela rota
//     (ver DESTINATARIOS em routes/items.ts); o endereço global continua, como
//     cópia fixa. O serviço só monta e entrega: ele aceita dois níveis
//     ("Para" e cópia oculta) e não sabe de onde a lista veio.
//  2. O ÚNICO BOTÃO PODIA CAIR NUM JSON DE ERRO. O link apontava para
//     `/objects/…`, rota protegida que responde `{"error":"Não autenticado"}`
//     em texto puro para quem não tem sessão — no celular, sem tela de login e
//     sem volta. Agora o botão abre `/eventos/:id`: o app carrega, pede login
//     se precisar e leva ao evento, onde o book está com contexto. O link
//     direto do arquivo continua, como link secundário, e só quando o book
//     mora no próprio app.
//  3. O ENVIO NÃO DEIXAVA RASTRO. Era `void notifyBookSaved(...)`: sem espera,
//     sem trilha, sem notificação no app. Se o Resend recusasse, ninguém sabia
//     e a Arte achava que tinha avisado. Agora o resultado volta para a rota,
//     que o grava na trilha do evento e o devolve à tela.
//
// E duas armadilhas que a revisão encontrou:
//  · um endereço inválido no meio da lista derrubava o e-mail INTEIRO (a
//    validação era `some(inválido) → não monta`). Com destinatários por
//    evento isso seria uma bomba-relógio: um espaço a mais num cadastro e o
//    aviso deixava de sair para todo mundo, em silêncio. Agora o inválido é
//    DESCARTADO, os válidos recebem, e o descarte é reportado;
//  · "Peças vinculadas: 56" não tinha denominador. Se o book saiu com metade
//    do evento, ninguém percebia. Agora é "56 de 60 peças do evento".
// ─────────────────────────────────────────────────────────────────────────────
import { ReplitConnectors } from "@replit/connectors-sdk";

type Env = Record<string, string | undefined>;

export type BookEmailInput = {
  eventId: string;
  eventName: string;
  /** Peças vinculadas a ESTE book. */
  itemCount: number;
  /** Peças do evento — o denominador que faltava. */
  totalDoEvento?: number | null;
  bookUrl: string;
  publicadoPor?: string | null;
  /** ISO da saída do caminhão, quando houver. */
  saidaDoCaminhao?: string | null;
  /** 1 = primeira publicação; 2+ = atualização. */
  publicacao?: number | null;
  /** Quem recebe de frente, no "Para". */
  destinatariosPrincipais?: string[];
  /** Quem recebe em cópia oculta (quando houver dois níveis). */
  destinatariosDeCopia?: string[];
};

export type BookEmailConfig = {
  enabled: boolean;
  dryRun: boolean;
  from?: string;
  recipients: string[];
  replyTo?: string;
  appUrl?: string;
};

export type BookEmailMessage = {
  from: string;
  to: string[];
  bcc?: string[];
  reply_to?: string;
  subject: string;
  text: string;
  html: string;
};

export type BookEmailResult =
  | { status: "disabled"; reason?: string }
  | { status: "dry-run"; para: string[]; copia: string[]; descartados: string[] }
  | { status: "sent"; para: string[]; copia: string[]; descartados: string[] }
  | { status: "failed"; reason: string; descartados?: string[] };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!
  ));
}

function normalizedAppUrl(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

/**
 * Separa o joio do trigo em vez de jogar tudo fora. Endereço repetido some,
 * maiúsculas não criam duplicata, e o inválido é DEVOLVIDO para quem chamou
 * poder registrar — nunca engolido.
 */
export function separarDestinatarios(lista: string[]): { validos: string[]; descartados: string[] } {
  const vistos = new Set<string>();
  const validos: string[] = [];
  const descartados: string[] = [];
  for (const bruto of lista) {
    const email = (bruto ?? "").trim();
    if (!email) continue;
    const chave = email.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    if (EMAIL_PATTERN.test(email)) validos.push(email);
    else descartados.push(email);
  }
  return { validos, descartados };
}

export function getBookEmailConfig(env: Env = process.env): BookEmailConfig {
  return {
    enabled: enabled(env.BOOK_EMAIL_NOTIFICATIONS_ENABLED),
    dryRun: enabled(env.BOOK_EMAIL_DRY_RUN),
    from: env.BOOK_EMAIL_FROM?.trim() || undefined,
    recipients: (env.BOOK_EMAIL_TO ?? "").split(",").map((e) => e.trim()).filter(Boolean),
    replyTo: env.BOOK_EMAIL_REPLY_TO?.trim() || undefined,
    appUrl: normalizedAppUrl(env.BOOK_EMAIL_APP_URL),
  };
}

const fmtDia = (iso?: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
};

export function buildBookEmailMessage(
  input: BookEmailInput,
  config: BookEmailConfig,
): { message: BookEmailMessage; descartados: string[] } | { erro: string; descartados: string[] } {
  const from = config.from?.trim();

  // DOIS GRUPOS, de propósito. No "Para" vai quem responde por este evento;
  // em cópia OCULTA, a equipe que acompanha a produção (Solicitação e admin) e
  // a cópia fixa da configuração. Sem isso o e-mail chegaria com uma dúzia de
  // endereços expostos no cabeçalho e ninguém saberia de quem é a vez de agir.
  const principais = separarDestinatarios(input.destinatariosPrincipais ?? []);
  const copias = separarDestinatarios([
    ...(input.destinatariosDeCopia ?? []),
    ...config.recipients,
  ].filter((e) => !principais.validos.some((p) => p.toLowerCase() === e.trim().toLowerCase())));
  const descartados = [...principais.descartados, ...copias.descartados];

  // Evento sem executivo de conta definido não fica sem aviso: a equipe ampla
  // sobe para o "Para". É o caso de 4 dos 34 eventos com book hoje.
  const to = principais.validos.length > 0 ? principais.validos : copias.validos;
  const bcc = principais.validos.length > 0 ? copias.validos : [];

  if (!from || !EMAIL_PATTERN.test(from)) return { erro: "remetente ausente ou inválido", descartados };
  if (!config.appUrl) return { erro: "BOOK_EMAIL_APP_URL ausente — sem ela o e-mail não teria para onde apontar", descartados };
  if (to.length === 0) return { erro: "nenhum destinatário válido", descartados };

  // O BOTÃO abre a tela do evento: o app pede login e leva ao lugar certo.
  // Nunca um caminho de API, que responderia JSON a quem não tem sessão.
  const linkDoEvento = `${config.appUrl}/eventos/${encodeURIComponent(input.eventId)}`;
  // O link do arquivo só existe quando o book mora no próprio app — a NORTE
  // não assina com o seu domínio um endereço que veio de fora.
  const linkDoArquivo = input.bookUrl.startsWith("/objects/")
    ? new URL(input.bookUrl, `${config.appUrl}/`).toString()
    : undefined;

  const eventName = input.eventName.trim() || "Evento sem nome";
  const atualizacao = (input.publicacao ?? 1) > 1;
  const pecas = input.totalDoEvento && input.totalDoEvento > 0
    ? `${input.itemCount} de ${input.totalDoEvento} ${input.totalDoEvento === 1 ? "peça" : "peças"} do evento`
    : `${input.itemCount} ${input.itemCount === 1 ? "peça" : "peças"}`;
  const saida = fmtDia(input.saidaDoCaminhao);

  // O EVENTO VEM PRIMEIRO. Assunto não aceita negrito: a única forma de
  // destaque é a posição, e a caixa de entrada corta o fim — no celular sobram
  // uns 35 caracteres. Com "Book de aprovação · " na frente, todas as
  // mensagens começavam iguais e a pessoa tinha de abrir para saber de qual
  // evento era. Agora o nome do evento é a primeira coisa que ela lê.
  const quantasPecas = `${input.itemCount} ${input.itemCount === 1 ? "peça" : "peças"}`;
  const subject = atualizacao
    ? `${eventName} · BOOK ATUALIZADO · ${quantasPecas}`
    : `${eventName} · Book de aprovação · ${quantasPecas}`;

  const preheader = `${pecas}${saida ? ` · caminhão sai em ${saida}` : ""}${input.publicadoPor ? ` · publicado por ${input.publicadoPor}` : ""}`;

  const linhasTexto = [
    atualizacao
      ? `O book de aprovação do evento ${eventName} foi ATUALIZADO (${input.publicacao}ª publicação).`
      : `O book de aprovação do evento ${eventName} está pronto.`,
    `Peças no book: ${pecas}.`,
    ...(saida ? [`Saída do caminhão: ${saida}.`] : []),
    ...(input.publicadoPor ? [`Publicado por: ${input.publicadoPor}.`] : []),
    "",
    "Abrir o evento no sistema (pede login, se necessário):",
    linkDoEvento,
    ...(linkDoArquivo ? ["", "Baixar o book direto:", linkDoArquivo] : []),
    ...(linkDoArquivo ? [] : ["", "Observação: este book foi publicado por um link externo, então não há download direto por aqui."]),
  ];

  const e = escapeHtml;

  // ── O LAYOUT ────────────────────────────────────────────────────────────
  // Tabelas, não divs com flex: o Outlook ainda renderiza com o motor do Word
  // e quebra qualquer layout moderno. Largura fixa de 600px (o padrão que
  // todos os clientes respeitam), fontes do sistema, tudo inline — folha de
  // estilo externa é removida por metade dos webmails.
  const FONTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif";

  /** Uma linha do quadro de dados: rótulo miúdo em cima, valor forte embaixo. */
  const dado = (rotulo: string, valor: string) => [
    '<tr>',
    `<td style="padding:0 0 14px;font-family:${FONTE};">`,
    `<div style="font-size:11px;font-weight:bold;letter-spacing:.09em;text-transform:uppercase;color:#78716c;padding-bottom:3px;">${e(rotulo)}</div>`,
    `<div style="font-size:16px;font-weight:bold;color:#1c1917;line-height:1.3;">${e(valor)}</div>`,
    '</td>',
    '</tr>',
  ].join("");

  const html = [
    '<!doctype html>',
    '<html lang="pt-BR"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    // Trava o esquema claro: sem isto, clientes em modo escuro invertem o
    // cartão branco e o texto preto some no preto.
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">',
    `<title>${e(subject)}</title>`,
    '</head>',
    `<body style="margin:0;padding:0;background:#f5f5f4;-webkit-text-size-adjust:100%;">`,
    // Pré-cabeçalho: o que a caixa de entrada mostra ao lado do assunto.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${e(preheader)}</div>`,

    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f4;">',
    '<tr><td align="center" style="padding:24px 12px;">',

    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid #e7e5e4;border-radius:14px;overflow:hidden;">',

    // ── Faixa da marca ──
    '<tr><td style="background:#1c1917;padding:18px 32px;">',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`,
    `<td style="font-family:${FONTE};font-size:12px;font-weight:bold;letter-spacing:.16em;color:#ffffff;">NORTE</td>`,
    `<td align="right" style="font-family:${FONTE};font-size:11px;letter-spacing:.06em;color:#a8a29e;">PRODUÇÃO GRÁFICA</td>`,
    '</tr></table>',
    '</td></tr>',

    // ── Título e evento ──
    '<tr><td style="padding:30px 32px 6px;">',
    `<div style="font-family:${FONTE};font-size:12px;font-weight:bold;letter-spacing:.1em;text-transform:uppercase;color:#ea580c;padding-bottom:8px;">${atualizacao ? "Book atualizado" : "Book de aprovação"}</div>`,
    `<h1 style="margin:0;font-family:${FONTE};font-size:26px;line-height:1.2;color:#1c1917;font-weight:bold;">${e(eventName)}</h1>`,
    '</td></tr>',

    // ── Aviso de republicação, quando é o caso ──
    ...(atualizacao ? [
      '<tr><td style="padding:16px 32px 0;">',
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;"><tr>`,
      `<td style="padding:12px 14px;font-family:${FONTE};font-size:14px;color:#9a3412;line-height:1.45;">`,
      `Esta é a <strong>${input.publicacao}ª publicação</strong> do book deste evento. A versão anterior deixou de valer.`,
      '</td></tr></table>',
      '</td></tr>',
    ] : []),

    // ── Quadro de dados ──
    '<tr><td style="padding:22px 32px 0;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
    dado("Peças no book", pecas),
    ...(saida ? [dado("Saída do caminhão", saida)] : []),
    ...(input.publicadoPor ? [dado("Publicado por", input.publicadoPor)] : []),
    '</table>',
    '</td></tr>',

    // ── Ação ──
    '<tr><td style="padding:8px 32px 4px;">',
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>`,
    `<td style="background:#ea580c;border-radius:10px;">`,
    `<a href="${e(linkDoEvento)}" style="display:inline-block;padding:14px 26px;font-family:${FONTE};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">Abrir o evento no sistema</a>`,
    '</td></tr></table>',
    '</td></tr>',

    // ── Linha secundária: download direto ou o aviso de link externo ──
    '<tr><td style="padding:12px 32px 28px;">',
    ...(linkDoArquivo
      ? [`<div style="font-family:${FONTE};font-size:13px;color:#57534e;line-height:1.5;">Ou <a href="${e(linkDoArquivo)}" style="color:#c2410c;font-weight:bold;">baixar o book direto</a> — os dois pedem login no sistema.</div>`]
      : [`<div style="font-family:${FONTE};font-size:13px;color:#57534e;line-height:1.5;">Este book foi publicado por um link externo, então não há download direto por aqui.</div>`]),
    '</td></tr>',

    // ── Rodapé ──
    '<tr><td style="padding:16px 32px;background:#fafaf9;border-top:1px solid #e7e5e4;">',
    `<div style="font-family:${FONTE};font-size:12px;color:#78716c;line-height:1.5;">Aviso automático do sistema de produção gráfica da NORTE.<br>Você recebe este e-mail porque acompanha a produção dos eventos.</div>`,
    '</td></tr>',

    '</table>',
    '</td></tr></table>',
    '</body></html>',
  ].join("");
  return {
    message: {
      from,
      to,
      ...(bcc.length > 0 ? { bcc } : {}),
      ...(config.replyTo && EMAIL_PATTERN.test(config.replyTo) ? { reply_to: config.replyTo } : {}),
      subject,
      text: linhasTexto.join("\n"),
      html,
    },
    descartados,
  };
}

/**
 * O CANAL DE ENTREGA, um só para o app inteiro. O aviso da fila de revisão
 * (services/revisaoDigest.ts) passa por aqui: dois caminhos até o provedor
 * seriam dois lugares para configurar, testar e quebrar.
 */
export async function entregarEmail(message: BookEmailMessage): Promise<void> {
  const connectors = new ReplitConnectors();
  const response = await connectors.proxy("resend", "/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  if (!response.ok) {
    throw new Error(`Resend respondeu com HTTP ${response.status}`);
  }
}

/**
 * Dispara a notificação sem participar da transação do book: uma falha no
 * provedor nunca pode desfazer o PDF e as peças que já foram salvos. Diferente
 * da primeira versão, o RESULTADO volta — quem chama grava na trilha e conta
 * para a tela.
 *
 * Configuração:
 * - BOOK_EMAIL_NOTIFICATIONS_ENABLED=true
 * - BOOK_EMAIL_FROM=remetente@dominio-verificado
 * - BOOK_EMAIL_TO=copia@empresa.com          (cópia fixa; os destinatários
 *                                             principais vêm do evento)
 * - BOOK_EMAIL_APP_URL=https://url-do-app
 * - BOOK_EMAIL_REPLY_TO=atendimento@empresa   (opcional)
 * - BOOK_EMAIL_DRY_RUN=true                   (prepara e não envia)
 */
export async function notifyBookSaved(input: BookEmailInput, env: Env = process.env): Promise<BookEmailResult> {
  const config = getBookEmailConfig(env);
  if (!config.enabled) return { status: "disabled" };

  const montado = buildBookEmailMessage(input, config);
  if ("erro" in montado) {
    console.warn("[book-email] envio ignorado", { eventId: input.eventId, reason: montado.erro });
    return { status: "failed", reason: montado.erro, descartados: montado.descartados };
  }

  const { message, descartados } = montado;
  if (descartados.length > 0) {
    console.warn("[book-email] endereços descartados", { eventId: input.eventId, descartados });
  }

  if (config.dryRun) {
    console.info("[book-email] simulação concluída", { eventId: input.eventId, para: message.to, copia: message.bcc ?? [], subject: message.subject });
    return { status: "dry-run", para: message.to, copia: message.bcc ?? [], descartados };
  }

  try {
    await entregarEmail(message);
    console.info("[book-email] enviado", { eventId: input.eventId, para: message.to, copia: message.bcc ?? [] });
    return { status: "sent", para: message.to, copia: message.bcc ?? [], descartados };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "falha desconhecida no Resend";
    console.error("[book-email] falha no envio", { eventId: input.eventId, reason });
    return { status: "failed", reason, descartados };
  }
}

/** Frase única para a trilha de auditoria e para o toast da tela. */
export function descreverEnvio(r: BookEmailResult): string {
  const sobra = (d?: string[]) => (d && d.length > 0 ? ` (endereços inválidos descartados: ${d.join(", ")})` : "");
  const copia = (c?: string[]) => (c && c.length > 0 ? `, com cópia oculta para ${c.length} ${c.length === 1 ? "pessoa" : "pessoas"}` : "");
  switch (r.status) {
    case "disabled": return "Aviso por e-mail desligado — nada foi enviado.";
    case "dry-run": return `Aviso por e-mail em modo de simulação para ${r.para.join(", ")}${copia(r.copia)} — nada foi enviado${sobra(r.descartados)}.`;
    case "sent": return `Aviso por e-mail enviado para ${r.para.join(", ")}${copia(r.copia)}${sobra(r.descartados)}.`;
    case "failed": return `Aviso por e-mail NÃO enviado: ${r.reason}${sobra(r.descartados)}.`;
  }
}
