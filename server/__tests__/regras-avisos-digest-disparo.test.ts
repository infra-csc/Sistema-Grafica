// ─────────────────────────────────────────────────────────────────────────────
// O DISPARO DOS DOIS AVISOS (Revisão e Gestão) — rodando de verdade.
//
// Veio de revisao-digest.test.ts, gestao-digest.test.ts e
// notificacoes-admin.test.ts, que liam o texto de services/revisaoDigest.ts,
// services/gestaoDigest.ts e services/destinatarios.ts. Agora as funções
// rodam sobre um banco de mentira (a trilha é uma lista), um storage de
// mentira e o envio de e-mail trocado por um espião. As regras:
//   · só produção envia — nem o manual escapa;
//   · ligado por padrão; só =false desliga, e o desligamento fica na trilha;
//   · fila vazia não vira e-mail (e a edição fica na trilha);
//   · quem impede a repetição é a TRILHA, por dia E horário — sobrevive a
//     reinício do processo;
//   · o manual pula o interruptor e a trilha, mas não a fila vazia;
//   · o relógio age na hora inteira do horário marcado, e nem sobe fora de
//     produção;
//   · a lista de quem recebe vem do canal administrável, com a constante de
//     padrão;
//   · o histórico da tela Notificações é a própria trilha lida de volta.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type LinhaDaTrilha = { entityType: string; details: string; createdAt: Date; [k: string]: unknown };

const H = vi.hoisted(() => ({
  trilha: [] as LinhaDaTrilha[],
  itens: [] as any[],
  eventos: [] as any[],
  aprovacoes: [] as any[],
  sponsors: [] as any[],
  destinatarios: {} as Record<string, Array<{ email: string }>>,
  destinatariosQuebrados: false,
  leuFila: 0,
  emails: [] as any[],
  entregaFalha: null as Error | null,
  reservas: new Set<string>(),
  // Espiões no H (e não na fábrica do mock): a fábrica pode rodar de novo
  // quando o teste de reinício recarrega os módulos, e a contagem não se perde.
  reservarDisparo: vi.fn(),
  lider: vi.fn(),
}));

// O banco de mentira entende as três consultas dos avisos: a gravação na
// trilha, o "já avisou?" (entity_type = 'x' and details like 'marca%') e o
// histórico (entity_type in ('gestao', 'revisao')), lendo o SQL renderizado.
vi.mock("../db", async () => {
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const dialeto = new PgDialect();
  const responder = (where: unknown) => {
    const { sql, params } = dialeto.sqlToQuery(where as any);
    if (/in \('gestao', 'revisao'\)/.test(sql)) {
      return H.trilha
        .filter((l) => l.entityType === "gestao" || l.entityType === "revisao")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    const tipo = /= '(\w+)'/.exec(sql)?.[1];
    const prefixo = String(params[0] ?? "").replace(/%$/, "");
    if (!tipo || !/ like /.test(sql)) throw new Error(`consulta inesperada: ${sql}`);
    return H.trilha.filter((l) => l.entityType === tipo && l.details.startsWith(prefixo));
  };
  const select = () => {
    let where: unknown = null;
    const q: any = {
      from: () => q, orderBy: () => q, limit: () => q,
      where: (w: unknown) => { where = w; return q; },
      then: (ok: any, falha: any) => Promise.resolve().then(() => responder(where)).then(ok, falha),
    };
    return q;
  };
  const insert = () => ({
    values: async (v: any) => { H.trilha.push({ ...v, createdAt: new Date() }); },
  });
  return { db: { select, insert }, pool: {} };
});

vi.mock("../storage", () => ({
  storage: {
    getAllItems: async () => { H.leuFila++; return H.itens; },
    getAllEvents: async () => H.eventos,
    getAllItemSponsorApprovals: async () => H.aprovacoes,
    getAllSponsors: async () => H.sponsors,
    getEmailDestinatarios: async (canal: string) => {
      if (H.destinatariosQuebrados) throw new Error('relation "email_destinatarios" does not exist');
      return H.destinatarios[canal] ?? [];
    },
  },
}));

vi.mock("../services/bookEmailNotification", async () => {
  const real = await vi.importActual<typeof import("../services/bookEmailNotification")>("../services/bookEmailNotification");
  return {
    ...real,
    entregarEmail: async (m: unknown) => {
      if (H.entregaFalha) throw H.entregaFalha;
      H.emails.push(m);
    },
  };
});

// A reserva entre réplicas é outra trava (tem teste próprio); aqui ela só
// guarda as chaves, para dar para separar o que é dela do que é da trilha.
vi.mock("../services/reservaDeDisparo", () => ({
  reservarDisparo: (c: string) => H.reservarDisparo(c),
  anotarDesfecho: async () => {},
}));

vi.mock("../services/lideranca", () => ({
  executarComoLider: (t: string, fn: () => Promise<unknown>) => H.lider(t, fn),
}));

const revisao = await import("../services/revisaoDigest");
const gestao = await import("../services/gestaoDigest");
const { destinatariosDoCanal } = await import("../services/destinatarios");

// 10h05 em São Paulo (13h05 UTC) — o servidor pode estar em qualquer fuso.
const AS_10H = new Date("2026-08-24T13:05:00.000Z");
const AS_15H = new Date("2026-08-24T18:05:00.000Z");
const PROD = {
  REPLIT_DEPLOYMENT: "1",
  BOOK_EMAIL_FROM: "sistemagrafica@nortemkt.com",
  BOOK_EMAIL_APP_URL: "https://app.nortemkt.com",
};

function filaDaRevisao() {
  H.itens = [
    { id: "p1", eventId: "e1", status: "awaiting_final_review", finalFileUrl: "/objects/a.pdf", statusChangedAt: "2026-08-24T12:00:00.000Z" },
    { id: "p2", eventId: "e1", status: "awaiting_final_review", finalFileUrl: "/objects/b.pdf", statusChangedAt: "2026-08-20T12:00:00.000Z" },
  ];
  H.eventos = [{ id: "e1", name: "Rio S21K", startDate: "2026-09-20", truckDepartureDate: "2026-09-15" }];
}

function filaDaGestao() {
  H.itens = [{ id: "p1", eventId: "e1", status: "awaiting_sponsor_approval", statusChangedAt: "2026-08-22T12:00:00.000Z", type: "Lona" }];
  H.aprovacoes = [{ itemId: "p1", sponsorId: "s1", status: "pending", createdAt: "2026-08-22T12:00:00.000Z" }];
  H.sponsors = [{ id: "s1", name: "Livelo" }];
  H.eventos = [{ id: "e1", name: "Primavera SP", startDate: "2026-09-20", truckDepartureDate: "2026-09-15" }];
}

beforeEach(() => {
  H.trilha = [];
  H.itens = []; H.eventos = []; H.aprovacoes = []; H.sponsors = [];
  H.destinatarios = {};
  H.destinatariosQuebrados = false;
  H.leuFila = 0;
  H.emails = [];
  H.entregaFalha = null;
  H.reservas.clear();
  H.reservarDisparo.mockReset().mockImplementation(async (chave: string) => {
    if (H.reservas.has(chave)) return false;
    H.reservas.add(chave);
    return true;
  });
  H.lider.mockReset().mockImplementation(async (_t: string, fn: () => Promise<unknown>) => { await fn(); return "rodou"; });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

// As regras que valem igual para os dois avisos.
const AVISOS = [
  {
    nome: "Revisão",
    tipo: "revisao",
    chave: "REVISAO_DIGEST_ENABLED",
    tarefa: "aviso-da-revisao",
    padrao: revisao.DESTINATARIOS_DA_REVISAO,
    encher: filaDaRevisao,
    enviar: (agora: Date, env: Record<string, string | undefined>, opcoes?: { manual?: boolean }) => revisao.enviarAvisoDaRevisao(agora, env, opcoes),
    subir: () => revisao.startRevisaoDigest(),
  },
  {
    nome: "Gestão",
    tipo: "gestao",
    chave: "GESTAO_DIGEST_ENABLED",
    tarefa: "aviso-da-gestao",
    padrao: gestao.DESTINATARIOS_DA_GESTAO,
    encher: filaDaGestao,
    enviar: (agora: Date, env: Record<string, string | undefined>, opcoes?: { manual?: boolean }) => gestao.enviarAvisoDaGestao(agora, env, opcoes),
    subir: () => gestao.startGestaoDigest(),
  },
] as const;

describe.each(AVISOS)("aviso da $nome", (A) => {
  const daqui = () => H.trilha.filter((l) => l.entityType === A.tipo);

  it("SÓ PRODUÇÃO ENVIA — nem o manual, porque dev compartilha segredos e conector com o deploy", async () => {
    // Caso real (24/08): dois avisos às 18h, "1 peça" (dev) e "48" (produção).
    A.encher();
    for (const env of [{}, { NODE_ENV: "development" }, { ...PROD, REPLIT_DEPLOYMENT: undefined }]) {
      const r = await A.enviar(AS_10H, env, { manual: true });
      expect(r.status).toBe("desligado");
      expect(r.motivo).toContain("Fora de produção");
    }
    expect(H.emails).toHaveLength(0);
    expect(H.leuFila).toBe(0);
    expect(H.trilha).toHaveLength(0);
  });

  it("produção é o carimbo do deploy OU NODE_ENV=production", async () => {
    A.encher();
    const { REPLIT_DEPLOYMENT: _, ...semCarimbo } = PROD;
    expect((await A.enviar(AS_10H, PROD, { manual: true })).status).toBe("enviado");
    expect((await A.enviar(AS_10H, { ...semCarimbo, NODE_ENV: "production" }, { manual: true })).status).toBe("enviado");
    expect(H.emails).toHaveLength(2);
  });

  it("LIGADO por padrão em produção — a chave opt-in nunca era criada no deploy", async () => {
    A.encher();
    const r = await A.enviar(AS_10H, PROD);
    expect(r.status).toBe("enviado");
    expect(H.emails).toHaveLength(1);
    expect(H.emails[0].to).toEqual([...A.padrao]);
    expect(daqui()[0].details).toMatch(/\(2026-08-24 10h\): enviado para /);
  });

  it("desligar exige =false (qualquer caixa) — e o desligamento fica na trilha", async () => {
    A.encher();
    const r = await A.enviar(AS_10H, { ...PROD, [A.chave]: " FALSE " });
    expect(r.status).toBe("desligado");
    expect(H.emails).toHaveLength(0);
    expect(H.leuFila).toBe(0);
    expect(daqui().map((l) => l.details)).toEqual([
      expect.stringMatching(new RegExp(`\\(2026-08-24 10h\\): desligado \\(${A.chave}=false\\) — nada enviado$`)),
    ]);
    // outro valor qualquer não desliga
    H.trilha = []; H.reservas.clear();
    expect((await A.enviar(AS_10H, { ...PROD, [A.chave]: "0" })).status).toBe("enviado");
  });

  it("fila vazia não vira e-mail — mas a edição fica na trilha (\"rodou vazio\" ≠ \"não rodou\")", async () => {
    const r = await A.enviar(AS_10H, PROD);
    expect(r.status).toBe("sem-fila");
    expect(H.emails).toHaveLength(0);
    expect(daqui().map((l) => l.details)).toEqual([
      expect.stringContaining("(2026-08-24 10h): fila vazia — nada a enviar; a edição desta hora fica registrada"),
    ]);
  });

  it("não repete: quem lembra é a TRILHA — reiniciar o processo não remanda", async () => {
    A.encher();
    expect((await A.enviar(AS_10H, PROD)).status).toBe("enviado");
    // Processo novo (módulo recarregado) e reserva entre réplicas vazia: só
    // sobra a trilha para lembrar.
    vi.resetModules();
    H.reservas.clear();
    const denovo = A.tipo === "revisao"
      ? (await import("../services/revisaoDigest")).enviarAvisoDaRevisao
      : (await import("../services/gestaoDigest")).enviarAvisoDaGestao;
    const r = await denovo(AS_10H, PROD);
    expect(r.status).toBe("ja-enviado");
    expect(H.emails).toHaveLength(1);
    expect(H.reservarDisparo).toHaveBeenCalledTimes(1); // a trilha barrou antes da reserva
  });

  it("a memória é por dia E horário: o das 10h não cala o das 15h", async () => {
    A.encher();
    expect((await A.enviar(AS_10H, PROD)).status).toBe("enviado");
    expect((await A.enviar(AS_15H, PROD)).status).toBe("enviado");
    expect(daqui().map((l) => /\((\S+ \d+h)\)/.exec(l.details)?.[1])).toEqual(["2026-08-24 10h", "2026-08-24 15h"]);
  });

  it("o MANUAL pula o interruptor e a trilha (alguém está esperando o e-mail)…", async () => {
    A.encher();
    await A.enviar(AS_10H, PROD); // a edição das 10h já saiu
    H.emails = [];
    const r = await A.enviar(AS_10H, { ...PROD, [A.chave]: "false" }, { manual: true });
    expect(r.status).toBe("enviado");
    expect(H.emails).toHaveLength(1);
    expect(H.reservarDisparo).toHaveBeenCalledTimes(1); // só o automático reservou
    expect(daqui().at(-1)!.details).toMatch(/\(2026-08-24 10h\) \[manual\]: enviado para /);
  });

  it("…mas NÃO a fila vazia — e o manual vazio não consome a edição na trilha", async () => {
    const r = await A.enviar(AS_10H, PROD, { manual: true });
    expect(r.status).toBe("sem-fila");
    expect(H.emails).toHaveLength(0);
    expect(H.trilha).toHaveLength(0);
  });

  it("a lista de quem recebe vem do canal administrável; sem linha ou com banco quebrado, o padrão", async () => {
    A.encher();
    H.destinatarios[A.tipo] = [{ email: " Livia.Monteiro@NorteMkt.com " }];
    await A.enviar(AS_10H, PROD, { manual: true });
    expect(H.emails[0].to).toEqual(["livia.monteiro@nortemkt.com"]);

    H.destinatariosQuebrados = true; // migração pendente não mata o aviso
    await A.enviar(AS_10H, PROD, { manual: true });
    expect(H.emails[1].to).toEqual([...A.padrao]);
  });

  it("simulação monta, não entrega, e deixa na trilha", async () => {
    A.encher();
    const r = await A.enviar(AS_10H, { ...PROD, BOOK_EMAIL_DRY_RUN: "true" });
    expect(r.status).toBe("simulado");
    expect(H.emails).toHaveLength(0);
    expect(daqui()[0].details).toContain(": simulação para ");
  });

  it("falha na entrega vira 'falhou' com o motivo — e fica na trilha", async () => {
    A.encher();
    H.entregaFalha = new Error("conector fora");
    const r = await A.enviar(AS_10H, PROD);
    expect(r).toMatchObject({ status: "falhou", motivo: "conector fora" });
    expect(daqui()[0].details).toContain(": NÃO enviado: conector fora");
  });

  describe("o relógio", () => {
    it("nem sobe fora de produção", () => {
      vi.useFakeTimers();
      vi.stubEnv("REPLIT_DEPLOYMENT", "");
      vi.stubEnv("NODE_ENV", "test");
      A.subir();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("em produção, age em QUALQUER minuto da hora marcada — um republish às 18:40 não mata a edição", async () => {
      vi.useFakeTimers();
      for (const [k, v] of Object.entries(PROD)) vi.stubEnv(k, v);
      A.encher();
      vi.setSystemTime(new Date("2026-08-24T21:39:30.000Z")); // 18h39 em São Paulo
      A.subir();
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(H.lider).toHaveBeenCalledWith(A.tarefa, expect.any(Function));
      expect(H.emails).toHaveLength(1);
      expect(daqui()[0].details).toContain("(2026-08-24 18h)");
    });

    it("fora dos horários (10h, 15h, 18h) o tique não faz nada", async () => {
      vi.useFakeTimers();
      for (const [k, v] of Object.entries(PROD)) vi.stubEnv(k, v);
      A.encher();
      vi.setSystemTime(new Date("2026-08-24T15:30:00.000Z")); // 12h30 em São Paulo
      A.subir();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(H.lider).not.toHaveBeenCalled();
      expect(H.emails).toHaveLength(0);
    });
  });
});

describe("o fuso do negócio", () => {
  it("a hora é a de São Paulo, não a do servidor", () => {
    expect(revisao.agoraNoFuso(new Date("2026-08-24T13:02:00.000Z"))).toEqual({ dia: "2026-08-24", hora: 10, minuto: 2 });
    // 23h30 de São Paulo já é o dia seguinte em UTC
    expect(revisao.agoraNoFuso(new Date("2026-08-25T02:30:00.000Z"))).toEqual({ dia: "2026-08-24", hora: 23, minuto: 30 });
  });
});

describe("aviso da Gestão — 'vazia' quer dizer vazia DE VERDADE (31/08)", () => {
  it("só refação na Criação já sustenta o envio", async () => {
    filaDaGestao();
    H.aprovacoes = [{ itemId: "p1", sponsorId: "s1", status: "awaiting_arte", createdAt: "2026-08-20T12:00:00.000Z", rejectedAt: "2026-08-21T12:00:00.000Z" }];
    const r = await gestao.enviarAvisoDaGestao(AS_10H, PROD);
    expect(r.status).toBe("enviado");
    expect(H.emails[0].subject).toContain("1 na Criação");
  });
});

describe("destinatariosDoCanal — a regra do fallback", () => {
  const PADRAO = ["a@x.com", "b@x.com"] as const;

  it("canal sem linha usa a lista padrão (cópia — ninguém mexe na constante)", async () => {
    const r = await destinatariosDoCanal("gestao", PADRAO);
    expect(r).toEqual(["a@x.com", "b@x.com"]);
    expect(r).not.toBe(PADRAO);
  });

  it("canal com linhas: SÓ as do banco — elas substituem, não somam", async () => {
    H.destinatarios.gestao = [{ email: " C@X.com" }, { email: "" }];
    expect(await destinatariosDoCanal("gestao", PADRAO)).toEqual(["c@x.com"]);
  });

  it("erro de banco (migração pendente) NÃO mata o aviso — cai no padrão", async () => {
    H.destinatariosQuebrados = true;
    expect(await destinatariosDoCanal("revisao", PADRAO)).toEqual(["a@x.com", "b@x.com"]);
  });
});

describe("historicoDeEnvios — a trilha lida de volta para a tela Notificações", () => {
  it("lê a marca (dia hora [manual]) dos DOIS avisos que os próprios disparos gravam", async () => {
    filaDaRevisao();
    await revisao.enviarAvisoDaRevisao(AS_10H, PROD, { manual: true });
    await gestao.enviarAvisoDaGestao(AS_15H, PROD); // fila da gestão vazia
    const h = await gestao.historicoDeEnvios();
    expect(h).toEqual(expect.arrayContaining([
      expect.objectContaining({ aviso: "revisao", dia: "2026-08-24", hora: 10, manual: true, status: "enviado" }),
      expect.objectContaining({ aviso: "gestao", dia: "2026-08-24", hora: 15, manual: false, status: "vazio" }),
    ]));
    expect(h).toHaveLength(2);
  });

  it("classifica cada desfecho, ignora linha fora do formato e registro de outra entidade", async () => {
    const t = (entityType: string, details: string, min: number) =>
      H.trilha.push({ entityType, details, createdAt: new Date(Date.UTC(2026, 7, 24, 13, min)) });
    t("gestao", "Aviso da gestão (2026-08-24 10h): NÃO enviado: remetente ausente", 1);
    t("revisao", "Aviso da fila de revisão (2026-08-24 9h): simulação para a@x.com — 2 na fila", 2);
    t("gestao", "Aviso da gestão (2026-08-24 18h): desligado (GESTAO_DIGEST_ENABLED=false) — nada enviado", 3);
    t("gestao", "Aviso da gestão (2026-08-24 15h): algo novo", 4);
    t("gestao", "Destinatário \"x@y.com\" adicionado ao aviso", 5); // fora do formato
    t("item", "Aviso da gestão (2026-08-24 10h): enviado para a@x.com", 6); // outra entidade
    const h = await gestao.historicoDeEnvios();
    expect(h.map((e) => [e.aviso, e.hora, e.status])).toEqual([
      ["gestao", 15, "outro"],
      ["gestao", 18, "desligado"],
      ["revisao", 9, "simulado"],
      ["gestao", 10, "falhou"],
    ]);
    expect(h[3].desfecho).toBe("NÃO enviado: remetente ausente");
    expect(h[3].em).toBe("2026-08-24T13:01:00.000Z");
  });
});

// VARREDURA (não dá para executar): subir o servidor inteiro para ver o relógio
// ligar não cabe num teste de unidade. Então se procura, pelo AST de todo o
// server/ (fora dos testes), uma CHAMADA de verdade a cada start — comentário
// ou import sozinho não contam.
describe("os relógios sobem junto com os outros trabalhos de fundo", async () => {
  const ts = (await import("typescript")).default;
  const { readdirSync, readFileSync } = await import("fs");
  const path = await import("path");
  const RAIZ = path.resolve(__dirname, "..");
  const arquivos = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === "__tests__" || d.name === "node_modules" ? [] : arquivos(p);
    return /\.ts$/.test(d.name) ? [p] : [];
  });
  const quemChama = (nome: string) => arquivos(RAIZ).filter((arq) => {
    const texto = readFileSync(arq, "utf8");
    if (!texto.includes(nome)) return false;
    const sf = ts.createSourceFile(arq, texto, ts.ScriptTarget.Latest, true);
    let achou = false;
    const visitar = (no: import("typescript").Node) => {
      if (ts.isCallExpression(no) && ts.isIdentifier(no.expression) && no.expression.text === nome) achou = true;
      ts.forEachChild(no, visitar);
    };
    visitar(sf);
    return achou;
  }).map((arq) => path.relative(RAIZ, arq).split(path.sep).join("/"));

  it.each(["startRevisaoDigest", "startGestaoDigest"])("%s é chamado na subida do servidor", (nome) => {
    expect(quemChama(nome)).toContain("routes.ts");
  });
});
