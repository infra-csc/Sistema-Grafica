// ─────────────────────────────────────────────────────────────────────────────
// BUSCAR ARTE JÁ FEITA (dono, 21/09).
//
// "Preciso ter como se fosse uma busca na arte para achar artes já feitas no
// app, para ele não precisar colocar o arquivo ou a thumb de novo e só
// referenciar — com o mesmo patrocinador e eventos 'parecidos', como
// Estações."
//
// O que este arquivo pina:
//   · o que é "evento parecido": mesmo circuito, praça e ano diferentes;
//   · a ordem do dono — patrocinador, tipo, evento parecido, descrição,
//     mais recente — e que cada degrau vence tudo que vem abaixo;
//   · a rota: papel de Arte, visibilidade do Kit, a própria peça fora da
//     lista e o teto de resultados;
//   · o botão e o modal na tela da Arte, e que reaproveitar passa pelo
//     caminho de gravação DE SEMPRE (nenhuma rota nova de escrita).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  mioloDoEvento,
  parecencaDeEvento,
  casaComTermo,
  pontuarArte,
  ordenarArtes,
  normalizarTexto,
  type ArteComparavel,
} from "@shared/artes-parecidas";
import { urlDeThumbValida } from "../routes/thumb-url";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");

// ─── a régua pura ────────────────────────────────────────────────────────────

describe("o que é um evento parecido", () => {
  it("o miolo do nome ignora ano, cidade (última palavra) e palavras curtas", () => {
    expect(mioloDoEvento("Circuito das Estações 2026 Rio de Janeiro")).toEqual(["circuito", "estacoes"]);
    expect(mioloDoEvento("Circuito das Estações 2026 São Paulo")).toEqual(["circuito", "estacoes"]);
    expect(mioloDoEvento("Circuito das Estações 2026 SP")).toEqual(["circuito", "estacoes"]);
  });

  it("o mesmo circuito noutra praça e noutro ano casa; circuito diferente não", () => {
    expect(parecencaDeEvento("Circuito das Estações 2026 Rio de Janeiro", "Circuito das Estações 2025 São Paulo")).toBe(1);
    expect(parecencaDeEvento("Circuito das Estações 2026 SP", "Maratona de Revezamento 2026 SP")).toBe(0);
  });

  it("nome de uma palavra não vira vazio — a cidade só cai quando sobra nome", () => {
    expect(mioloDoEvento("Réveillon")).toEqual(["reveillon"]);
    expect(parecencaDeEvento("Réveillon", "Reveillon")).toBe(1);
  });

  it("com duas palavras a cidade já cai: 'Estações Curitiba' ≈ 'Estações Salvador'", () => {
    expect(mioloDoEvento("Estações Curitiba")).toEqual(["estacoes"]);
    expect(parecencaDeEvento("Estações Curitiba", "Estações Salvador")).toBe(1);
  });

  it("texto sem acento e sem caixa é a régua de comparação", () => {
    expect(normalizarTexto("Circuito das ESTAÇÕES")).toBe("circuito das estacoes");
  });
});

describe("a ordem que o dono pediu", () => {
  const alvo: ArteComparavel = {
    id: "alvo", tipo: "2x1", descricao: "Portico de largada",
    eventId: "ev-rj", eventName: "Circuito das Estações 2026 Rio de Janeiro",
    eventInicio: "2026-10-01T00:00:00Z", sponsorIds: ["bradesco"],
  };
  const peca = (id: string, mudanca: Partial<ArteComparavel> = {}): ArteComparavel => ({
    id, tipo: "rolo", descricao: null, eventId: "ev-outro", eventName: "Maratona de Revezamento 2026 Curitiba",
    eventInicio: "2024-01-01T00:00:00Z", sponsorIds: [], ...mudanca,
  });

  it("mesmo patrocinador vence tipo, evento, descrição e recência SOMADOS", () => {
    const soPatrocinador = peca("a", { sponsorIds: ["bradesco"] });
    const todoOResto = peca("b", {
      tipo: "2x1", descricao: "Portico de largada",
      eventId: "ev-sp", eventName: "Circuito das Estações 2026 São Paulo",
      eventInicio: "2026-09-01T00:00:00Z",
    });
    expect(pontuarArte(alvo, soPatrocinador).pontos).toBeGreaterThan(pontuarArte(alvo, todoOResto).pontos);
  });

  it("empatado o patrocinador, o mesmo tipo vence o evento parecido", () => {
    const mesmoTipo = peca("a", { sponsorIds: ["bradesco"], tipo: "2x1" });
    const mesmoCircuito = peca("b", { sponsorIds: ["bradesco"], eventId: "ev-sp", eventName: "Circuito das Estações 2026 São Paulo" });
    expect(pontuarArte(alvo, mesmoTipo).pontos).toBeGreaterThan(pontuarArte(alvo, mesmoCircuito).pontos);
  });

  it("tudo igual, a mais recente vem primeiro", () => {
    const velha = peca("velha", { eventInicio: "2021-01-01T00:00:00Z" });
    const nova = peca("nova", { eventInicio: "2026-01-01T00:00:00Z" });
    expect(pontuarArte(alvo, nova).pontos).toBeGreaterThan(pontuarArte(alvo, velha).pontos);
  });

  it("os selos: mesmo patrocinador e evento parecido — e o próprio evento não é 'parecido'", () => {
    const outraPraca = pontuarArte(alvo, peca("a", { sponsorIds: ["bradesco"], eventId: "ev-sp", eventName: "Circuito das Estações 2025 São Paulo" }));
    expect(outraPraca.mesmoPatrocinador).toBe(true);
    expect(outraPraca.eventoParecido).toBe(true);
    const mesmoEvento = pontuarArte(alvo, peca("b", { eventId: "ev-rj", eventName: alvo.eventName }));
    expect(mesmoEvento.eventoParecido).toBe(false);
  });

  it("a própria peça nunca aparece, e o teto corta a lista", () => {
    const lista = [alvo as ArteComparavel, ...Array.from({ length: 80 }, (_, i) => peca(`p${i}`))];
    const saida = ordenarArtes(alvo, lista, { limite: 60 });
    expect(saida.some((x) => x.id === "alvo")).toBe(false);
    expect(saida).toHaveLength(60);
  });

  it("o termo procura em descrição, tipo, patrocinador, evento e código — e todas as palavras têm de bater", () => {
    const p = peca("a", { displayId: "#0123", sponsorNames: ["Bradesco Seguros"], descricao: "Pórtico de largada" });
    expect(casaComTermo(p, "bradesco")).toBe(true);
    expect(casaComTermo(p, "PORTICO")).toBe(true);
    expect(casaComTermo(p, "revezamento")).toBe(true); // nome do evento
    expect(casaComTermo(p, "0123")).toBe(true);
    expect(casaComTermo(p, "bradesco portico")).toBe(true);
    expect(casaComTermo(p, "bradesco natal")).toBe(false);
    expect(casaComTermo(p, "   ")).toBe(true); // sem termo, tudo passa
  });

  it("com termo, o ranking continua desempatando", () => {
    const comPatrocinador = peca("a", { sponsorIds: ["bradesco"], sponsorNames: ["Bradesco"], descricao: "portico" });
    const sem = peca("b", { descricao: "portico" });
    const saida = ordenarArtes(alvo, [sem, comPatrocinador], { termo: "portico" });
    expect(saida.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

// ─── a rota ──────────────────────────────────────────────────────────────────

const H = vi.hoisted(() => ({ filas: [] as any[][] }));

vi.mock("../db", () => {
  // O drizzle é uma cadeia que só vira promessa quando awaited: cada consulta
  // da rota consome a próxima resposta enfileirada, na ordem em que o handler
  // as faz. Sem `q`: alvo → mesmo patrocinador → recentes → vínculos. Com
  // `q`: alvo → candidatas → vínculos.
  const consulta = () => {
    const q: any = {
      from: () => q,
      leftJoin: () => q,
      where: () => q,
      orderBy: () => q,
      limit: () => q,
      then: (ok: any, falha: any) => Promise.resolve(H.filas.shift() ?? []).then(ok, falha),
    };
    return q;
  };
  return { db: { select: consulta } };
});

vi.mock("../routes/shared", () => ({
  requireRole: (...papeis: string[]) => (req: any, res: any, next: any) =>
    papeis.includes(req.userRole) ? next() : res.status(403).json({ error: "Acesso negado" }),
}));

type Handler = (req: any, res: any, next: any) => unknown;

async function montarRota() {
  const { registerArtesBuscaRoutes } = await import("../routes/artes-busca");
  const rotas = new Map<string, Handler[]>();
  const app: any = {};
  for (const metodo of ["get", "post", "patch", "put", "delete"]) {
    app[metodo] = (caminho: string, ...handlers: Handler[]) => {
      rotas.set(`${metodo.toUpperCase()} ${caminho}`, handlers);
      return app;
    };
  }
  registerArtesBuscaRoutes(app);
  return rotas;
}

async function chamar(query: any, usuario: any, rota = "GET /api/artes/busca") {
  const rotas = await montarRota();
  const handlers = rotas.get(rota)!;
  const resposta: any = { statusCode: 200, corpo: undefined };
  const res: any = {
    status(c: number) { resposta.statusCode = c; return res; },
    json(b: any) { resposta.corpo = b; return res; },
  };
  const req: any = { query, ...usuario };
  for (const h of handlers) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (!seguiu) break;
  }
  return resposta;
}

const ARTE = { userRole: "arte", userId: "u1", userKit: false };

const linha = (id: string, mudanca: any = {}) => ({
  id, displayId: `#${id}`, tipo: "2x1", descricao: "portico",
  thumbUrl: `/objects/${id}`, previewUrl: null, arquivoFinalUrl: null, arquivoFinalNome: null,
  kitRemessaId: null, criadoPorId: "u1",
  eventId: `ev-${id}`, eventName: "Circuito das Estações 2026 São Paulo", eventInicio: new Date("2026-01-01T00:00:00Z"),
  ...mudanca,
});

describe("GET /api/artes/busca", () => {
  beforeEach(() => { H.filas = []; });

  it("é da Arte e do admin — a mesma régua de quem troca a arte da peça", async () => {
    const ROTA = ler("server/routes/artes-busca.ts");
    expect(ROTA).toContain('const requireArte = requireRole("admin", "arte");');
    expect(ROTA).toContain('app.get("/api/artes/busca", requireArte');

    H.filas = [[linha("alvo")], [], [], []];
    expect((await chamar({ item: "alvo" }, { ...ARTE, userRole: "grafica" })).statusCode).toBe(403);
  });

  it("sem a peça de destino não há o que ranquear", async () => {
    const r = await chamar({}, ARTE);
    expect(r.statusCode).toBe(400);
  });

  it("devolve as sugestões sem a própria peça e com os selos", async () => {
    // Sem `q`, o banco entrega dois grupos (mesmo patrocinador; mais
    // recentes) e a peça alvo pode vir nos dois — o ranking a tira, e a
    // repetida entre grupos vira uma só.
    H.filas = [
      [linha("alvo")],
      [linha("a", { eventId: "ev-rj", eventName: "Circuito das Estações 2025 Rio de Janeiro" })],
      [linha("alvo"), linha("a", { eventId: "ev-rj", eventName: "Circuito das Estações 2025 Rio de Janeiro" })],
      [{ itemId: "alvo", sponsorId: "s1", nome: "Bradesco" }, { itemId: "a", sponsorId: "s1", nome: "Bradesco" }],
    ];
    const r = await chamar({ item: "alvo" }, ARTE);
    expect(r.statusCode).toBe(200);
    expect(r.corpo.artes.map((x: any) => x.id)).toEqual(["a"]);
    expect(r.corpo.artes[0].mesmoPatrocinador).toBe(true);
    expect(r.corpo.artes[0].eventoParecido).toBe(true);
    expect(r.corpo.artes[0].patrocinadores).toEqual(["Bradesco"]);
  });

  it("o payload é enxuto — nada de peça inteira viajando", async () => {
    H.filas = [[linha("alvo")], [], [linha("a")], []];
    const r = await chamar({ item: "alvo" }, ARTE);
    expect(Object.keys(r.corpo.artes[0]).sort()).toEqual([
      "arquivoFinalNome", "arquivoFinalUrl", "descricao", "displayId", "eventId", "eventInicio",
      "eventName", "eventoParecido", "id", "mesmoPatrocinador", "mesmoTipo", "patrocinadores",
      "previewUrl", "temArquivoFinal", "temPrevia", "temThumb", "thumbUrl", "tipo",
    ]);
  });

  it("o usuário do Kit só vê as peças dele — nas candidatas e na peça de destino", async () => {
    const doKit = { kitRemessaId: "r1", criadoPorId: "u1" };
    H.filas = [
      [linha("alvo", doKit)],
      [],
      [linha("a", doKit), linha("b"), linha("c", { kitRemessaId: "r1", criadoPorId: "outro" })],
      [],
    ];
    const r = await chamar({ item: "alvo" }, { userRole: "arte", userId: "u1", userKit: true });
    expect(r.corpo.artes.map((x: any) => x.id)).toEqual(["a"]);

    // A peça de destino que ele não vê é como se não existisse.
    H.filas = [[linha("alvo")], [], [], []];
    const fora = await chamar({ item: "alvo" }, { userRole: "arte", userId: "u1", userKit: true });
    expect(fora.statusCode).toBe(404);
  });

  it("só peças COM arte, e o teto de 60 é do servidor", async () => {
    const ROTA = ler("server/routes/artes-busca.ts");
    expect(ROTA).toContain("const TETO_DE_RESULTADOS = 60;");
    expect(ROTA).toContain("isNotNull(itemsTable.approvalThumbUrl)");
    expect(ROTA).toContain("isNotNull(itemsTable.finalPreviewUrl)");
    expect(ROTA).toContain("pecaVisivelPara(usuario, c)");
  });

  it("o recorte é do banco: `q` vira LIKE sem acento no SQL e sem `q` há teto de candidatas", async () => {
    const ROTA = ler("server/routes/artes-busca.ts");
    expect(ROTA).toContain("const TETO_DE_CANDIDATAS = 600;");
    expect(ROTA).toContain("translate(lower(coalesce(");
    expect(ROTA).toContain("like ${padrao}");
    expect(ROTA).toContain(".limit(TETO_DE_CANDIDATAS)");
    expect(ROTA).toContain("desc nulls last");
    // Sem `q`, quem divide patrocinador com o alvo entra sempre — o teto de
    // recentes não pode esconder a arte do mesmo patrocinador de dois anos atrás.
    expect(ROTA).toContain("b.item_id = ${alvo.id}");

    // Com `q` a rota faz UMA consulta de candidatas e o refino em memória
    // segue a mesma régua (todas as palavras).
    H.filas = [[linha("alvo")], [linha("a", { descricao: "Pórtico Bradesco" }), linha("b", { descricao: "Pórtico" })], []];
    const r = await chamar({ item: "alvo", q: "portico bradesco" }, ARTE);
    expect(r.corpo.artes.map((x: any) => x.id)).toEqual(["a"]);
  });

  it("aberta pelo arquivo final, o SQL só traz arte que TEM arquivo final", async () => {
    const ROTA = ler("server/routes/artes-busca.ts");
    expect(ROTA).toContain("isNotNull(itemsTable.finalFileUrl)");
    H.filas = [
      [linha("alvo")],
      [],
      [linha("b", { arquivoFinalUrl: "\\\\rede\\arte\\rolo.tif", arquivoFinalNome: "rolo.tif" })],
      [],
    ];
    const r = await chamar({ item: "alvo", comArquivoFinal: "1" }, ARTE);
    expect(r.corpo.artes.map((x: any) => x.id)).toEqual(["b"]);
    expect(r.corpo.artes[0].temArquivoFinal).toBe(true);
  });

  it("está registrada onde as outras estão", () => {
    expect(ler("server/routes.ts")).toContain("registerArtesBuscaRoutes(app);");
  });

  it("não cria rota de escrita nenhuma — reaproveitar grava pelo caminho de sempre", () => {
    const ROTA = ler("server/routes/artes-busca.ts");
    for (const metodo of ["app.post(", "app.patch(", "app.put(", "app.delete("]) {
      expect(ROTA).not.toContain(metodo);
    }
  });
});

// ─── a sugestão do arquivo final ─────────────────────────────────────────────

describe("GET /api/artes/sugestao-final — o arquivo final da peça de onde a arte veio", () => {
  beforeEach(() => { H.filas = []; });
  const SUG = "GET /api/artes/sugestao-final";
  const comFinal = (id: string, mudanca: any = {}) => linha(id, {
    thumbUrl: "/objects/mesma", arquivoFinalUrl: "//srv/arte/" + id + ".tif", arquivoFinalNome: id + ".tif",
    quando: new Date("2026-09-01T00:00:00Z"), ...mudanca,
  });

  it("é da Arte e do admin, e exige a peça", async () => {
    const ROTA = ler("server/routes/artes-busca.ts");
    expect(ROTA).toContain('app.get("/api/artes/sugestao-final", requireArte');
    expect((await chamar({ item: "alvo" }, { ...ARTE, userRole: "grafica" }, SUG)).statusCode).toBe(403);
    expect((await chamar({}, ARTE, SUG)).statusCode).toBe(400);
  });

  it("casa pela MESMA URL de thumb e devolve a mais recente, ignorando a própria peça", async () => {
    H.filas = [[linha("alvo", { thumbUrl: "/objects/mesma" })], [comFinal("alvo"), comFinal("origem"), comFinal("velha")]];
    const r = await chamar({ item: "alvo" }, ARTE, SUG);
    expect(r.statusCode).toBe(200);
    expect(r.corpo.displayId).toBe("#origem");
    expect(r.corpo.finalFileUrl).toContain("origem.tif");
    expect(r.corpo.evento).toBe("Circuito das Estações 2026 São Paulo");
    const ROTA = ler("server/routes/artes-busca.ts");
    expect(ROTA).toContain("or(inArray(itemsTable.approvalThumbUrl, urls), inArray(itemsTable.finalPreviewUrl, urls))");
    expect(ROTA).toContain("ne(itemsTable.id, alvo.id)");
    expect(ROTA).toContain("desc nulls last");
  });

  it("exige o caminho do arquivo final preenchido", async () => {
    H.filas = [[linha("alvo", { thumbUrl: "/objects/mesma" })], [comFinal("a", { arquivoFinalUrl: "  " }), comFinal("b", { arquivoFinalUrl: null })]];
    expect((await chamar({ item: "alvo" }, ARTE, SUG)).corpo).toBeNull();
    expect(ler("server/routes/artes-busca.ts")).toContain("isNotNull(itemsTable.finalFileUrl),");
  });

  it("nada casa pela URL → null, sem plano B por patrocinador", async () => {
    H.filas = [[linha("alvo")], []];
    const r = await chamar({ item: "alvo" }, ARTE, SUG);
    expect(r.statusCode).toBe(200);
    expect(r.corpo).toBeNull();
    // peça sem thumb nem prévia nem chega a consultar
    H.filas = [[linha("alvo", { thumbUrl: null })]];
    expect((await chamar({ item: "alvo" }, ARTE, SUG)).corpo).toBeNull();
    expect(ler("server/routes/artes-busca.ts")).toContain("NÃO HÁ PLANO B de propósito");
  });

  it("o usuário do Kit só recebe sugestão de peça que ele vê", async () => {
    const doKit = { kitRemessaId: "r1", criadoPorId: "u1" };
    const kit = { userRole: "arte", userId: "u1", userKit: true };
    H.filas = [[linha("alvo", { ...doKit, thumbUrl: "/objects/mesma" })], [comFinal("alheia"), comFinal("dele", doKit)]];
    expect((await chamar({ item: "alvo" }, kit, SUG)).corpo.displayId).toBe("#dele");
    H.filas = [[linha("alvo", { thumbUrl: "/objects/mesma" })], []];
    expect((await chamar({ item: "alvo" }, kit, SUG)).statusCode).toBe(404);
  });

  it("na tela: o bloco aparece com o campo vazio, Usar preenche SEM enviar, Ignorar some", () => {
    const T = ler("client/src/pages/arte.tsx");
    expect(T).toContain('data-testid="sugestao-arquivo-final"');
    expect(T).toContain('data-testid="sugestao-arquivo-final-linha"');
    expect(T).toContain("Usar este caminho");
    expect(T).toContain("Confira se o arquivo serve para esta peça (medida e evento).");
    expect(T).toContain("enabled: naFinalizacao && finalFileUrl.trim() === \"\" && !sugestoesIgnoradas.has(selectedItem!.id),");
    const usar = T.slice(T.indexOf("const usarSugestaoFinal = () => {"), T.indexOf("const ignorarSugestaoFinal"));
    expect(usar).toContain("setFinalFileUrl(sugestaoVisivel.finalFileUrl);");
    expect(usar).toContain("setFinalDirty(true);");
    expect(usar).not.toContain("mutate(");
    expect(usar).not.toContain("apiRequest(");
    expect(T).toContain("setSugestoesIgnoradas((s) => new Set(s).add(selectedItem.id));");
    expect(T).toContain("&& sugestaoFinal.finalFileUrl !== finalFileUrl");
  });
});

// ─── o thumb só pode ser objeto do nosso storage ─────────────────────────────

describe("as rotas que gravam thumb só aceitam objeto do storage", () => {
  it("a régua: /objects/ passa, a URL crua do bucket vira /objects/, o resto é recusado", () => {
    expect(urlDeThumbValida("/objects/uploads/abc")).toBe("/objects/uploads/abc");
    expect(urlDeThumbValida("  /objects/uploads/abc  ")).toBe("/objects/uploads/abc");
    expect(urlDeThumbValida("https://storage.googleapis.com/bucket/.private/uploads/abc?x=1")).toBe("/objects/uploads/abc");
    expect(urlDeThumbValida("https://drive.google.com/file/d/x")).toBeNull();
    expect(urlDeThumbValida("https://obj/thumb.png")).toBeNull();
    expect(urlDeThumbValida("/objects/")).toBeNull();
    expect(urlDeThumbValida("")).toBeNull();
    expect(urlDeThumbValida(null)).toBeNull();
  });

  it("submit-for-approval, update-thumb e resubmit validam e gravam a forma normalizada", () => {
    const ITEMS = ler("server/routes/items.ts");
    expect(ITEMS).toContain('import { urlDeThumbValida, ERRO_THUMB_FORA_DO_STORAGE } from "./thumb-url";');
    expect(ITEMS.split("const thumbNormalizado = urlDeThumbValida(").length - 1).toBe(3);
    // 3 rotas de envio + o PATCH genérico (revisão 22/09: a mesma régua lá).
    expect(ITEMS.split("return res.status(400).json({ error: ERRO_THUMB_FORA_DO_STORAGE });").length - 1).toBe(4);
    expect(ITEMS).toContain("itemUpdates.approvalThumbUrl = thumbNormalizado;");
    expect(ITEMS).toContain("approvalThumbUrl: thumbNormalizado,\n        rejectedBySponsor: false,");
    expect(ITEMS).toContain("approvalThumbUrl: thumbNormalizado,\n        previousApprovalThumbUrl: prevUrl,");
    expect(ITEMS).toContain("if (currentItem.approvalThumbUrl === thumbNormalizado) {");
    for (const origem of ['origem: "envio"', 'origem: "reenvio"', 'origem: "troca"']) {
      expect(ITEMS).toContain(`thumbUrl: thumbNormalizado, ${origem}`);
    }
  });

  it("o caminho do arquivo final fica fora da régua — é caminho de rede por regra da casa", () => {
    const ITEMS = ler("server/routes/items.ts");
    expect(ITEMS).not.toContain("urlDeThumbValida(validatedData.finalFileUrl");
    expect(ler("server/routes/thumb-url.ts")).toContain("O CAMINHO DO ARQUIVO FINAL NÃO ENTRA nesta régua");
  });
});

// ─── a tela ──────────────────────────────────────────────────────────────────

describe("o botão e o modal na Arte", () => {
  const ARTE_TSX = ler("client/src/pages/arte.tsx");
  const MODAL = ler("client/src/components/buscar-arte-dialog.tsx");

  it("o botão fica onde hoje se sobe a thumb e o arquivo — nos quatro pontos", () => {
    expect(ARTE_TSX).toContain("function BotaoBuscarArte(");
    expect(ARTE_TSX).toContain("Buscar arte já feita");
    for (const teste of [
      'testId="button-buscar-arte-aprovacao"',
      'testId="button-buscar-arte-trocar"',
      'testId="button-buscar-arte-troca-aprovada"',
      'testId="button-buscar-arte-final"',
      'testId="button-buscar-arte-correcao"',
    ]) expect(ARTE_TSX).toContain(teste);
    expect(ARTE_TSX).toContain("<BuscarArteDialog");
  });

  it("aplicar a arte usa os MESMOS campos e mutações do upload", () => {
    // thumb de aprovação: o mesmo par de setters do upload — daí o
    // "Enviar para aprovação" (submit-for-approval) segue igual.
    expect(ARTE_TSX).toContain("concluirEnvioDoThumb(imagem);");
    // troca do thumb já aprovado: a mutação de sempre (update-thumb).
    expect(ARTE_TSX).toContain("updateThumbMutation.mutate({ itemId: buscaDeArte.itemId, approvalThumbUrl: imagem, origem: de });");
    // correção e arquivo final: os campos que o upload encheria.
    expect(ARTE_TSX).toContain("setCorrecaoThumbUrl(imagem);");
    expect(ARTE_TSX).toContain("setFinalFileUrl(arte.arquivoFinalUrl);");
    expect(ARTE_TSX).toContain("setFinalDirty(true);");
  });

  it("escolher a arte que já é a atual não chama update-thumb — aviso neutro", () => {
    expect(ARTE_TSX).toContain("if (itemPorId.get(buscaDeArte.itemId)?.approvalThumbUrl === imagem) {");
    expect(ARTE_TSX).toContain('toast({ title: "Essa já é a arte atual desta peça" });');
  });

  it("a miniatura da Correção tenta a imagem sempre e cai no ícone só no erro — objetos não têm extensão", () => {
    expect(ARTE_TSX).toContain("function MiniaturaDaCorrecao(");
    expect(ARTE_TSX).toContain("<MiniaturaDaCorrecao key={correcaoThumbUrl} url={correcaoThumbUrl} />");
    expect(ARTE_TSX).not.toContain("/\\.(png|jpg|jpeg|gif|webp)/i.test(correcaoThumbUrl)");
  });

  it("o toast diz de qual peça e de qual evento a arte veio", () => {
    expect(ARTE_TSX).toContain("`Arte de ${de} aplicada`");
    expect(ARTE_TSX).toContain('const de = `${arte.displayId ?? "peça"}${arte.eventName ? ` (${arte.eventName})` : ""}`;');
  });

  it("o modal abre nas sugestões, busca com debounce e tem carregando, vazio e erro", () => {
    expect(MODAL).toContain('data-testid="input-buscar-arte"');
    expect(MODAL).toContain("window.setTimeout(() => setTermoBuscado(termo.trim()), 300)");
    expect(MODAL).toContain('data-testid="vazio-buscar-arte"');
    expect(MODAL).toContain('data-testid="erro-buscar-arte"');
    expect(MODAL).toContain('data-testid="button-usar-esta-arte"');
    expect(MODAL).toContain('role="alert"');
    expect(MODAL).toContain('aria-busy="true"');
  });

  it("usa a casca de modal da casa", () => {
    expect(MODAL).toContain('from "@/components/modal-shell"');
    expect(MODAL).toContain("modalSurface(820)");
    expect(MODAL).toContain("<ModalHeader");
  });

  it("celular: alvo de 44px e campo a 16px (o iPhone dá zoom abaixo disso)", () => {
    expect(MODAL).toContain("minHeight: 44");
    expect(MODAL).toContain("fontSize: 16");
  });

  it("a lista vazia é uma constante estável — useQuery com `= []` e efeito é laço infinito", () => {
    expect(MODAL).toContain("const SEM_ARTES: ArteEncontrada[] = [];");
    expect(MODAL).toContain("data?.artes ?? SEM_ARTES");
    // O efeito de limpeza depende do ID, não do objeto montado no render.
    expect(MODAL).toContain("}, [itemId]);");
  });

  it("as cores proibidas não viram texto", () => {
    for (const arquivo of [MODAL]) {
      expect(arquivo).not.toContain('color: "#f97316"');
      expect(arquivo).not.toContain('color: "#a8a29e"');
    }
  });
});
