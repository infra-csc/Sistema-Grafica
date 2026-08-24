// ─────────────────────────────────────────────────────────────────────────────
// AVISO DE BOOK POR E-MAIL — a montagem da mensagem.
//
// Este arquivo nasceu com o módulo (21/08) e foi REESCRITO na revisão de 24/08.
// As intenções originais continuam todas fixadas — escapar HTML, não assinar
// link de fora com o domínio da NORTE, e simular sem chamar o provedor. O que
// mudou, e por quê:
//
//  · o CTA deixou de apontar para `/objects/…`. Aquela rota responde
//    `{"error":"Não autenticado"}` em JSON puro para quem não tem sessão: o
//    único botão do e-mail podia terminar num erro técnico, no celular, sem
//    tela de login. Agora aponta para `/eventos/:id`, e o link do arquivo fica
//    como secundário — só quando o book mora no próprio app.
//  · um endereço inválido no meio da lista derrubava o e-mail INTEIRO. Com
//    destinatários vindos do evento, um espaço a mais num cadastro apagaria o
//    aviso de todo mundo, em silêncio. Agora o inválido é descartado e
//    REPORTADO.
//  · "Peças vinculadas: 56" não tinha denominador.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it, vi } from "vitest";
import {
  buildBookEmailMessage,
  getBookEmailConfig,
  notifyBookSaved,
  separarDestinatarios,
  descreverEnvio,
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
  totalDoEvento: 5,
  bookUrl: "/objects/books/evento-1.pdf",
  publicadoPor: "Ana Arte",
  saidaDoCaminhao: "2026-09-05T11:00:00.000Z",
  publicacao: 1,
};

const montar = (input = BOOK, env = VALID_ENV) => {
  const r = buildBookEmailMessage(input as any, getBookEmailConfig(env));
  if ("erro" in r) throw new Error(`esperava mensagem, veio erro: ${r.erro}`);
  return r;
};

describe("a mensagem", () => {
  it("escapa o nome do evento e diz peças COM denominador", () => {
    const { message } = montar();
    expect(message.from).toBe("sistemagrafica@nortemkt.com");
    expect(message.to).toEqual(["yan.araujo@nortemkt.com"]);
    expect(message.subject).toBe("Book de aprovação · Corrida <Especial> · 2 peças");
    expect(message.html).toContain("Corrida &lt;Especial&gt;");
    expect(message.text).toContain("2 de 5 peças do evento");
    expect(message.html).toContain("2 de 5 peças do evento");
  });

  it("o botão abre a TELA DO EVENTO, não a rota de arquivo", () => {
    const { message } = montar();
    expect(message.html).toContain('href="https://app.nortemkt.com/eventos/evento-1"');
    expect(message.text).toContain("https://app.nortemkt.com/eventos/evento-1");
    // o arquivo continua acessível, como link secundário
    expect(message.html).toContain('href="https://app.nortemkt.com/objects/books/evento-1.pdf"');
  });

  it("book publicado por link externo: sem link de arquivo, e o e-mail SAI mesmo assim", () => {
    const { message } = montar({ ...BOOK, bookUrl: "https://drive.google.com/x" } as any);
    expect(message.html).not.toContain("drive.google.com");
    expect(message.html).toContain("publicado por um link externo");
    // o aviso continua existindo: antes, o e-mail simplesmente não saía e
    // ninguém ficava sabendo.
    expect(message.html).toContain("https://app.nortemkt.com/eventos/evento-1");
  });

  it("contexto: quem publicou, quando o caminhão sai, e o aviso de atualização", () => {
    const { message } = montar();
    expect(message.text).toContain("Publicado por: Ana Arte");
    expect(message.text).toContain("Saída do caminhão: 05/09/2026");
    const atualizado = montar({ ...BOOK, publicacao: 3 } as any).message;
    expect(atualizado.subject).toBe("Book atualizado · Corrida <Especial> · 2 peças");
    expect(atualizado.html).toContain("3ª publicação");
  });

  it("tem pré-cabeçalho e trava o esquema claro (senão o cartão some no modo escuro)", () => {
    const { message } = montar();
    expect(message.html).toContain('<meta name="color-scheme" content="light">');
    expect(message.html).toContain("display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;");
  });

  it("o layout é de TABELA, 600px — o Outlook renderiza com o motor do Word", () => {
    const { message } = montar();
    expect(message.html).toContain('<table role="presentation" width="600"');
    expect(message.html).toContain("max-width:100%");
    // nada de layout moderno, que o Outlook ignora
    expect(message.html).not.toContain("display:flex");
    expect(message.html).not.toContain("display:grid");
    // faixa da marca, quadro de dados e botão
    expect(message.html).toContain(">NORTE</td>");
    expect(message.html).toContain("Peças no book");
    expect(message.html).toContain("Abrir o evento no sistema</a>");
  });

  it("Reply-To entra quando configurado, e só se for válido", () => {
    const com = montar(BOOK, { ...VALID_ENV, BOOK_EMAIL_REPLY_TO: "atendimento@nortemkt.com" } as any).message;
    expect(com.reply_to).toBe("atendimento@nortemkt.com");
    const invalido = montar(BOOK, { ...VALID_ENV, BOOK_EMAIL_REPLY_TO: "sem-arroba" } as any).message;
    expect(invalido.reply_to).toBeUndefined();
  });
});

describe("os destinatários", () => {
  it("junta os do evento com a cópia global, sem repetir e sem ligar para maiúsculas", () => {
    const { message } = montar({ ...BOOK, destinatariosDoEvento: ["exec@nortemkt.com", "YAN.ARAUJO@nortemkt.com"] } as any);
    expect(message.to).toEqual(["exec@nortemkt.com", "YAN.ARAUJO@nortemkt.com"]);
  });

  it("UM endereço inválido não derruba o aviso dos outros — e o descarte é reportado", () => {
    const r = buildBookEmailMessage(
      { ...BOOK, destinatariosDoEvento: ["ok@nortemkt.com", "quebrado @ errado"] } as any,
      getBookEmailConfig(VALID_ENV),
    );
    if ("erro" in r) throw new Error("não deveria falhar por causa de um endereço");
    expect(r.message.to).toEqual(["ok@nortemkt.com"]);
    expect(r.descartados).toEqual(["quebrado @ errado"]);
  });

  it("responsável no PARA, equipe em cópia oculta — e ninguém aparece duas vezes", () => {
    const r = buildBookEmailMessage(
      {
        ...BOOK,
        destinatariosDoEvento: ["exec@nortemkt.com"],
        destinatariosDeCopia: ["pedido@nortemkt.com", "EXEC@nortemkt.com", "chefe@nortemkt.com"],
      } as any,
      getBookEmailConfig(VALID_ENV),
    );
    if ("erro" in r) throw new Error("não deveria falhar");
    // Quem responde pelo evento fica visível; quem acompanha vai oculto.
    expect(r.message.to).toEqual(["exec@nortemkt.com"]);
    expect(r.message.bcc).toEqual(["pedido@nortemkt.com", "chefe@nortemkt.com", "yan.araujo@nortemkt.com"]);
  });

  it("evento SEM executivo de conta: a equipe sobe para o Para, e não fica sem aviso", () => {
    const r = buildBookEmailMessage(
      { ...BOOK, destinatariosDoEvento: [], destinatariosDeCopia: ["pedido@nortemkt.com"] } as any,
      getBookEmailConfig(VALID_ENV),
    );
    if ("erro" in r) throw new Error("não deveria falhar");
    expect(r.message.to).toEqual(["pedido@nortemkt.com", "yan.araujo@nortemkt.com"]);
    expect(r.message.bcc).toBeUndefined();
  });

  it("sem NENHUM destinatário válido, aí sim não monta", () => {
    const r = buildBookEmailMessage(BOOK as any, getBookEmailConfig({ ...VALID_ENV, BOOK_EMAIL_TO: "" }));
    expect("erro" in r && r.erro).toBe("nenhum destinatário válido");
  });

  it("sem URL pública do app não há para onde apontar — e o e-mail não sai", () => {
    const r = buildBookEmailMessage(BOOK as any, getBookEmailConfig({ ...VALID_ENV, BOOK_EMAIL_APP_URL: "" }));
    expect("erro" in r && r.erro).toContain("BOOK_EMAIL_APP_URL ausente");
  });

  it("separarDestinatarios é a régua, e é testável sozinha", () => {
    expect(separarDestinatarios([" a@b.com ", "a@B.com", "", "torto"])).toEqual({
      validos: ["a@b.com"],
      descartados: ["torto"],
    });
  });
});

describe("o disparo", () => {
  it("desligado não monta nada", async () => {
    await expect(notifyBookSaved(BOOK as any, { ...VALID_ENV, BOOK_EMAIL_NOTIFICATIONS_ENABLED: "false" }))
      .resolves.toEqual({ status: "disabled" });
  });

  it("simulação não chama o provedor, mas já diz PARA QUEM iria", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(notifyBookSaved(BOOK as any, VALID_ENV)).resolves.toEqual({
      status: "dry-run",
      para: ["yan.araujo@nortemkt.com"],
      copia: [],
      descartados: [],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("configuração incompleta vira 'failed' com motivo — nunca silêncio", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = await notifyBookSaved(BOOK as any, { ...VALID_ENV, BOOK_EMAIL_FROM: "" });
    expect(r).toMatchObject({ status: "failed" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("a frase que vai para a trilha e para a tela", () => {
  it("diz o desfecho em português, incluindo os descartes", () => {
    expect(descreverEnvio({ status: "disabled" })).toContain("desligado");
    expect(descreverEnvio({ status: "sent", para: ["a@b.com"], copia: [], descartados: [] }))
      .toBe("Aviso por e-mail enviado para a@b.com.");
    expect(descreverEnvio({ status: "sent", para: ["a@b.com"], copia: ["c@d.com", "e@f.com"], descartados: [] }))
      .toBe("Aviso por e-mail enviado para a@b.com, com cópia oculta para 2 pessoas.");
    expect(descreverEnvio({ status: "sent", para: ["a@b.com"], copia: [], descartados: ["torto"] }))
      .toContain("endereços inválidos descartados: torto");
    expect(descreverEnvio({ status: "failed", reason: "HTTP 429" }))
      .toBe("Aviso por e-mail NÃO enviado: HTTP 429.");
  });
});
