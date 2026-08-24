// ─────────────────────────────────────────────────────────────────────────────
// AVISO DA FILA DE REVISÃO — 10h, 15h e 18h.
//
// Pedido do dono (24/08): avisar ele e a Fernanda, da Solicitação, quando há
// peças esperando revisão, dizendo quantas e quantas são novas.
//
// A fila é `awaiting_final_review`: a Arte mandou o arquivo final e a peça
// espera o aval de quem abriu o pedido. Ela não avisa ninguém — quem não abrir
// a tela não descobre que ela cresceu.
//
// Três decisões que este arquivo protege:
//  1. FILA VAZIA NÃO MANDA E-MAIL. Aviso que chega dizendo "0" três vezes por
//     dia ensina a ignorar o remetente, e aí o dia com 14 também é ignorado.
//  2. "NOVOS" É DESDE O AVISO ANTERIOR, não desde a meia-noite — senão a mesma
//     peça é notícia três vezes.
//  3. NÃO REPETE: quem lembra é a trilha, não a memória do processo. Reiniciar
//     o servidor às 10h05 não pode remandar o aviso das 10h.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";

vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({ storage: {} }));

const {
  montarResumo, construirEmailDaRevisao, inicioDaJanela, agoraNoFuso,
  HORARIOS, DESTINATARIOS_DA_REVISAO, STATUS_EM_REVISAO,
} = await import("../services/revisaoDigest");

const CONFIG = { from: "sistemagrafica@nortemkt.com", appUrl: "https://app.nortemkt.com" };

const peca = (over: Record<string, any> = {}) => ({
  id: Math.random().toString(36).slice(2),
  status: STATUS_EM_REVISAO,
  eventId: "e1",
  finalFileUrl: "/objects/x.pdf",
  statusChangedAt: "2026-08-24T12:00:00.000Z",
  deletedAt: null,
  ...over,
});

const nomes = (id: string) => (id === "e1" ? "Rio S21K" : id === "e2" ? "Primavera SP" : "");

describe("o que o resumo conta", () => {
  it("conta só a fila de revisão — outros status e apagadas ficam de fora", () => {
    const r = montarResumo(
      [
        peca(), peca(),
        peca({ status: "awaiting_sponsor_approval" }),
        peca({ deletedAt: "2026-08-01" }),
      ],
      nomes,
      new Date("2026-08-24T13:00:00.000Z"),
      new Date("2026-08-24T18:00:00.000Z"),
    );
    expect(r.total).toBe(2);
  });

  it("'novos' é quem entrou DEPOIS do aviso anterior", () => {
    const desde = new Date("2026-08-24T13:00:00.000Z");
    const r = montarResumo(
      [
        peca({ statusChangedAt: "2026-08-24T14:00:00.000Z" }), // depois
        peca({ statusChangedAt: "2026-08-24T09:00:00.000Z" }), // antes
        peca({ statusChangedAt: "2026-08-24T13:00:00.000Z" }), // no limite: conta
      ],
      nomes, desde, new Date("2026-08-24T18:00:00.000Z"),
    );
    expect(r.total).toBe(3);
    expect(r.novos).toBe(2);
  });

  it("diz o que trava: sem arquivo final e a espera da mais antiga", () => {
    const r = montarResumo(
      [
        peca({ finalFileUrl: null, statusChangedAt: "2026-08-20T12:00:00.000Z" }),
        peca({ statusChangedAt: "2026-08-24T12:00:00.000Z" }),
      ],
      nomes,
      new Date("2026-08-24T13:00:00.000Z"),
      new Date("2026-08-24T18:00:00.000Z"),
    );
    expect(r.semArquivo).toBe(1);
    expect(r.diasDoMaisAntigo).toBe(4);
  });

  it("agrupa por evento, do maior para o menor", () => {
    const r = montarResumo(
      [peca(), peca(), peca({ eventId: "e2" })],
      nomes,
      new Date("2026-08-24T13:00:00.000Z"),
      new Date("2026-08-24T18:00:00.000Z"),
    );
    expect(r.porEvento).toEqual([{ evento: "Rio S21K", n: 2 }, { evento: "Primavera SP", n: 1 }]);
  });

  it("peça sem evento não vira linha em branco", () => {
    const r = montarResumo([peca({ eventId: "zzz" })], nomes, new Date(), new Date());
    expect(r.porEvento).toEqual([{ evento: "Sem evento", n: 1 }]);
  });
});

describe("a janela do 'desde'", () => {
  it("às 15h, a conta começa às 10h do mesmo dia", () => {
    const agora = new Date("2026-08-24T18:02:00.000Z"); // 15h02 em São Paulo
    const inicio = inicioDaJanela(agora);
    expect(agoraNoFuso(inicio)).toMatchObject({ dia: "2026-08-24", hora: 10, minuto: 0 });
  });

  it("às 10h, a conta começa às 18h de ONTEM — senão a madrugada some", () => {
    const agora = new Date("2026-08-24T13:02:00.000Z"); // 10h02 em São Paulo
    const inicio = inicioDaJanela(agora);
    expect(agoraNoFuso(inicio)).toMatchObject({ dia: "2026-08-23", hora: 18, minuto: 0 });
  });

  it("os três horários são os pedidos", () => {
    expect(HORARIOS).toEqual([10, 15, 18]);
  });
});

describe("a mensagem", () => {
  const resumo = {
    total: 7, novos: 3, semArquivo: 2, diasDoMaisAntigo: 4,
    porEvento: [{ evento: "Rio S21K", n: 5 }, { evento: "Primavera SP", n: 2 }],
  };

  it("o assunto carrega os números — é o que decide se abre agora", () => {
    const m = construirEmailDaRevisao(resumo, CONFIG, DESTINATARIOS_DA_REVISAO);
    if ("erro" in m) throw new Error(m.erro);
    expect(m.subject).toBe("Revisão · 7 peças esperando · 3 novas");
  });

  it("sem novidade, o assunto não inventa uma", () => {
    const m = construirEmailDaRevisao({ ...resumo, novos: 0 }, CONFIG, DESTINATARIOS_DA_REVISAO);
    if ("erro" in m) throw new Error(m.erro);
    expect(m.subject).toBe("Revisão · 7 peças esperando");
    expect(m.text).toContain("Nenhuma nova desde o aviso anterior.");
  });

  it("leva para a tela de Revisão, e diz o que trava", () => {
    const m = construirEmailDaRevisao(resumo, CONFIG, DESTINATARIOS_DA_REVISAO);
    if ("erro" in m) throw new Error(m.erro);
    expect(m.html).toContain('href="https://app.nortemkt.com/solicitacao"');
    expect(m.text).toContain("2 peças ainda sem arquivo final.");
    expect(m.text).toContain("A mais antiga espera há 4 dias.");
    expect(m.html).toContain("Rio S21K");
  });

  it("vai para as duas pessoas nomeadas — nem por papel, nem por evento", () => {
    const m = construirEmailDaRevisao(resumo, CONFIG, DESTINATARIOS_DA_REVISAO);
    if ("erro" in m) throw new Error(m.erro);
    expect(m.to).toEqual(["yan.araujo@nortemkt.com", "fernanda.oliveira@ttkmarketing.com.br"]);
    // A Fernanda tem duas contas; a do e-mail sem final de domínio não é usada.
    expect(m.to.join(" ")).not.toContain("@ttkmarketing\"");
  });

  it("sem URL do app não monta — um aviso sem destino não é aviso", () => {
    const m = construirEmailDaRevisao(resumo, { from: CONFIG.from }, DESTINATARIOS_DA_REVISAO);
    expect("erro" in m && m.erro).toContain("BOOK_EMAIL_APP_URL");
  });

  it("mesmo desenho do outro e-mail: tabela de 600px e esquema claro travado", () => {
    const m = construirEmailDaRevisao(resumo, CONFIG, DESTINATARIOS_DA_REVISAO);
    if ("erro" in m) throw new Error(m.erro);
    expect(m.html).toContain('<table role="presentation" width="600"');
    expect(m.html).toContain('<meta name="color-scheme" content="light">');
    expect(m.html).not.toContain("display:flex");
  });

  it("o rodapé explica o silêncio — para ninguém achar que o aviso quebrou", () => {
    const m = construirEmailDaRevisao(resumo, CONFIG, DESTINATARIOS_DA_REVISAO);
    if ("erro" in m) throw new Error(m.erro);
    expect(m.html).toContain("Quando não há nada esperando, ele não é enviado.");
  });
});

describe("as regras do disparo, escritas no código", () => {
  const CODIGO = readFileSync(
    new URL("../services/revisaoDigest.ts", import.meta.url),
    "utf8",
  );

  it("fila vazia não vira e-mail", () => {
    expect(CODIGO).toContain('if (resumo.total === 0) return { status: "sem-fila", resumo };');
  });

  it("quem impede a repetição é a TRILHA, não a memória do processo", () => {
    expect(CODIGO).toContain("async function jaAvisou(dia: string, hora: number): Promise<boolean> {");
    expect(CODIGO).toContain('if (await jaAvisou(dia, hora)) return { status: "ja-enviado" };');
    expect(CODIGO).toContain("entityType: \"revisao\",");
  });

  it("o relógio lê a hora no fuso do negócio, não no do servidor", () => {
    expect(CODIGO).toContain('const FUSO = "America/Sao_Paulo";');
    expect(CODIGO).toContain("timeZone: FUSO");
  });

  it("desligado por padrão: sem a variável, o relógio bate e não faz nada", () => {
    expect(CODIGO).toContain('const ligado = env.REVISAO_DIGEST_ENABLED?.trim().toLowerCase() === "true";');
    expect(CODIGO).toContain('if (!ligado) return { status: "desligado" };');
  });

  it("e sobe junto com os outros trabalhos de fundo", () => {
    const ROUTES = readFileSync(new URL("../routes.ts", import.meta.url), "utf8");
    expect(ROUTES).toContain("startRevisaoDigest();");
  });
});
