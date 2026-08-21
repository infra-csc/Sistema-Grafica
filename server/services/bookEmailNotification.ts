import { ReplitConnectors } from "@replit/connectors-sdk";

type Env = Record<string, string | undefined>;

export type BookEmailInput = {
  eventId: string;
  eventName: string;
  itemCount: number;
  bookUrl: string;
};

export type BookEmailConfig = {
  enabled: boolean;
  dryRun: boolean;
  from?: string;
  recipients: string[];
  appUrl?: string;
};

export type BookEmailMessage = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
};

export type BookEmailResult =
  | { status: "disabled" | "dry-run" | "sent"; reason?: string }
  | { status: "failed"; reason: string };

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

function bookLink(bookUrl: string, appUrl?: string): string | undefined {
  // O endpoint de book é uma API e não pode transformar qualquer URL recebida
  // em um link de e-mail assinado pela NORTE. O upload normal guarda os objetos
  // privados como /objects/...; somente esse caminho interno é promovido.
  if (!appUrl || !bookUrl.startsWith("/objects/")) return undefined;

  return new URL(bookUrl, `${appUrl}/`).toString();
}

export function getBookEmailConfig(env: Env = process.env): BookEmailConfig {
  const recipients = (env.BOOK_EMAIL_TO ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  return {
    enabled: enabled(env.BOOK_EMAIL_NOTIFICATIONS_ENABLED),
    dryRun: enabled(env.BOOK_EMAIL_DRY_RUN),
    from: env.BOOK_EMAIL_FROM?.trim() || undefined,
    recipients,
    appUrl: normalizedAppUrl(env.BOOK_EMAIL_APP_URL),
  };
}

export function buildBookEmailMessage(input: BookEmailInput, config: BookEmailConfig): BookEmailMessage | undefined {
  const from = config.from?.trim();
  const link = bookLink(input.bookUrl, config.appUrl);

  if (!from || !EMAIL_PATTERN.test(from) || config.recipients.length === 0 || config.recipients.some((email) => !EMAIL_PATTERN.test(email)) || !link) {
    return undefined;
  }

  const eventName = input.eventName.trim() || "Evento sem nome";
  const itemLabel = `${input.itemCount} ${input.itemCount === 1 ? "peça" : "peças"}`;
  const subject = `Book enviado · ${eventName}`;
  const safeEventName = escapeHtml(eventName);
  const safeItemLabel = escapeHtml(itemLabel);
  const safeLink = escapeHtml(link);

  return {
    from,
    to: config.recipients,
    subject,
    text: [
      `O book de aprovação do evento ${eventName} foi enviado.`,
      `Peças vinculadas: ${itemLabel}.`,
      "",
      `Abrir book: ${link}`,
    ].join("\n"),
    html: [
      "<!doctype html>",
      '<html lang="pt-BR"><body style="margin:0;background:#f6f7f8;font-family:Arial,sans-serif;color:#1f2937;">',
      '<main style="max-width:600px;margin:24px auto;padding:32px;background:#ffffff;border-radius:12px;">',
      '<p style="margin:0 0 16px;font-size:12px;font-weight:700;letter-spacing:.08em;color:#6b7280;">NORTE MARKETING ESPORTIVO</p>',
      "<h1 style=\"margin:0 0 16px;font-size:24px;line-height:1.25;\">Book de aprovação enviado</h1>",
      `<p style="margin:0 0 8px;">O book do evento <strong>${safeEventName}</strong> foi salvo com sucesso.</p>`,
      `<p style="margin:0 0 24px;">Peças vinculadas: <strong>${safeItemLabel}</strong>.</p>`,
      `<a href="${safeLink}" style="display:inline-block;padding:12px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;">Abrir book</a>`,
      "</main></body></html>",
    ].join(""),
  };
}

async function deliver(message: BookEmailMessage): Promise<void> {
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
 * Dispara a notificação sem participar da transação do book. Uma falha no
 * provedor nunca pode desfazer o PDF e as peças que já foram salvos.
 *
 * Configuração necessária antes de ativar:
 * - BOOK_EMAIL_NOTIFICATIONS_ENABLED=true
 * - BOOK_EMAIL_FROM=remetente@dominio-verificado
 * - BOOK_EMAIL_TO=destinatario@empresa.com
 * - BOOK_EMAIL_APP_URL=https://url-publica-do-app
 *
 * BOOK_EMAIL_DRY_RUN=true registra a preparação sem enviar e-mail.
 */
export async function notifyBookSaved(input: BookEmailInput, env: Env = process.env): Promise<BookEmailResult> {
  const config = getBookEmailConfig(env);
  if (!config.enabled) return { status: "disabled" };

  const message = buildBookEmailMessage(input, config);
  if (!message) {
    const reason = "configuração ausente ou inválida (remetente, destinatário ou URL pública do app)";
    console.warn("[book-email] envio ignorado", { eventId: input.eventId, reason });
    return { status: "failed", reason };
  }

  if (config.dryRun) {
    console.info("[book-email] simulação concluída", {
      eventId: input.eventId,
      itemCount: input.itemCount,
      subject: message.subject,
    });
    return { status: "dry-run" };
  }

  try {
    await deliver(message);
    console.info("[book-email] enviado", { eventId: input.eventId, itemCount: input.itemCount });
    return { status: "sent" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "falha desconhecida no Resend";
    console.error("[book-email] falha no envio", { eventId: input.eventId, reason });
    return { status: "failed", reason };
  }
}