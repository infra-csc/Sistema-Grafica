import { describe, expect, it, vi } from "vitest";
import {
  buildBookEmailMessage,
  getBookEmailConfig,
  notifyBookSaved,
} from "../services/bookEmailNotification";

const VALID_ENV = {
  BOOK_EMAIL_NOTIFICATIONS_ENABLED: "true",
  BOOK_EMAIL_DRY_RUN: "true",
  BOOK_EMAIL_FROM: "sistemagrafica@nortemkt.com",
  BOOK_EMAIL_TO: "yan.araujo@nortemkt.com",
  BOOK_EMAIL_APP_URL: "https://app.nortemkt.com",
};

const BOOK = {
  eventId: "evento-1",
  eventName: "Corrida <Especial>",
  itemCount: 2,
  bookUrl: "/objects/books/evento-1.pdf",
};

describe("notificação de e-mail do book", () => {
  it("monta e-mail com link público e escapa o nome do evento", () => {
    const message = buildBookEmailMessage(BOOK, getBookEmailConfig(VALID_ENV));

    expect(message).toMatchObject({
      from: "sistemagrafica@nortemkt.com",
      to: ["yan.araujo@nortemkt.com"],
      subject: "Book enviado · Corrida <Especial>",
    });
    expect(message?.text).toContain("https://app.nortemkt.com/objects/books/evento-1.pdf");
    expect(message?.text).toContain("entre no sistema com sua conta");
    expect(message?.html).toContain("Corrida &lt;Especial&gt;");
    expect(message?.html).toContain("O acesso ao book exige login no sistema.");
    expect(message?.html).toContain("Abrir book no sistema");
    expect(message?.html).toContain('href="https://app.nortemkt.com/objects/books/evento-1.pdf"');
  });

  it("não monta e-mail sem URL pública para caminho privado do book", () => {
    const env = { ...VALID_ENV };
    delete env.BOOK_EMAIL_APP_URL;

    expect(buildBookEmailMessage(BOOK, getBookEmailConfig(env))).toBeUndefined();
  });

  it("não transforma URL externa em link de um e-mail assinado pela NORTE", () => {
    expect(buildBookEmailMessage({
      ...BOOK,
      bookUrl: "https://site-nao-confiavel.example/book.pdf",
    }, getBookEmailConfig(VALID_ENV))).toBeUndefined();
  });

  it("permite validar o envio em simulação, sem chamar o provedor", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(notifyBookSaved(BOOK, VALID_ENV)).resolves.toEqual({ status: "dry-run" });
    expect(info).toHaveBeenCalledWith("[book-email] simulação concluída", expect.objectContaining({
      eventId: "evento-1",
      subject: "Book enviado · Corrida <Especial>",
    }));

    info.mockRestore();
  });

  it("permanece desativado até a ativação explícita", async () => {
    await expect(notifyBookSaved(BOOK, {
      ...VALID_ENV,
      BOOK_EMAIL_NOTIFICATIONS_ENABLED: "false",
    })).resolves.toEqual({ status: "disabled" });
  });
});