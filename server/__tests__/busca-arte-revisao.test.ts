// ─────────────────────────────────────────────────────────────────────────────
// BUSCA DE ARTE + ARTE NO CELULAR — revisão adversarial (22/09).
//
//   6. a busca ordena ANTES do LIMIT (mesmo tipo, evento mais recente), leva o
//      filtro do Kit para o SQL, só devolve imagem do nosso storage, e a
//      sugestão do arquivo final exige o mesmo tipo e a mesma medida; o modal
//      aplica a MESMA imagem que mostra;
//   7. na Arte do celular, as datas da faixa do evento abrem num "i" (e não
//      só no `title`), os segmentados têm alvo de 44px e o cartão do modal de
//      busca não colide com o cartão do celular.
// O filtro do Kit e o recorte de tipo/medida no SQL rodam em
// regras-avisos-busca-arte.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fonteDaArte } from "./fonte-das-telas-da-arte";
import { readFileSync } from "fs";
import path from "path";

const H = vi.hoisted(() => ({ filas: [] as any[][], ordens: [] as any[][], limites: [] as number[] }));

vi.mock("../db", () => {
  // Cadeia do drizzle: cada consulta consome a próxima resposta enfileirada e
  // anota o ORDER BY e o LIMIT que recebeu.
  const consulta = () => {
    let ordem: any[] | null = null;
    const q: any = {
      from: () => q,
      leftJoin: () => q,
      where: () => q,
      orderBy: (...a: any[]) => { ordem = a; return q; },
      limit: (n: number) => { H.ordens.push(ordem ?? []); H.limites.push(n); return q; },
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

import { mesmaPecaFisica } from "../routes/artes-busca";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const textoDoSql = (q: any): string =>
  (q?.queryChunks ?? []).map((c: any) => (Array.isArray(c?.value) ? c.value.join("") : "")).join("");

type Handler = (req: any, res: any, next: any) => unknown;
async function chamar(query: any, usuario: any, rota = "GET /api/artes/busca") {
  const { registerArtesBuscaRoutes } = await import("../routes/artes-busca");
  const rotas = new Map<string, Handler[]>();
  const app: any = {};
  for (const m of ["get", "post", "patch", "put", "delete"]) app[m] = (c: string, ...hs: Handler[]) => { rotas.set(`${m.toUpperCase()} ${c}`, hs); return app; };
  registerArtesBuscaRoutes(app);
  const resposta: any = { statusCode: 200, corpo: undefined };
  const res: any = { status(c: number) { resposta.statusCode = c; return res; }, json(b: any) { resposta.corpo = b; return res; } };
  const req: any = { query, ...usuario };
  for (const h of rotas.get(rota)!) {
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
  kitRemessaId: null, criadoPorId: "u1", fileWidth: "2.00", fileHeight: "1.00",
  eventId: `ev-${id}`, eventName: "Circuito das Estações 2026 São Paulo", eventInicio: new Date("2026-01-01T00:00:00Z"),
  ...mudanca,
});

beforeEach(() => { H.filas = []; H.ordens = []; H.limites = []; });

describe("6 · a busca ordena antes de cortar", () => {
  it("sem `q`: as duas consultas de candidatas têm ORDER BY (mesmo tipo primeiro, evento mais recente) antes do LIMIT", async () => {
    H.filas = [[linha("alvo")], [], [linha("a")], []];
    await chamar({ item: "alvo" }, ARTE);
    expect(H.limites).toEqual([600, 600]);
    for (const ordem of H.ordens) {
      const textos = ordem.map(textoDoSql);
      expect(textos[0]).toContain(") = lower(");
      expect(textos[0]).toContain(")) desc");
      expect(textos[1]).toContain("desc nulls last");
    }
  });

  it("com `q`: a consulta de candidatas também ordena", async () => {
    H.filas = [[linha("alvo")], [linha("a")], []];
    await chamar({ item: "alvo", q: "portico" }, ARTE);
    expect(H.limites).toEqual([600]);
    expect(H.ordens[0].map(textoDoSql)[1]).toContain("desc nulls last");
  });

  it("só imagem do nosso storage: URL de fora não vira cartão; a crua do bucket sai normalizada", async () => {
    H.filas = [
      [linha("alvo")],
      [],
      [
        linha("fora", { thumbUrl: "https://example.com/x.png" }),
        linha("bucket", { thumbUrl: "https://storage.googleapis.com/b/.private/uploads/y.png" }),
        linha("ok"),
      ],
      [],
    ];
    const r = await chamar({ item: "alvo" }, ARTE);
    const ids = r.corpo.artes.map((a: any) => a.id);
    expect(ids).not.toContain("fora");
    expect(ids).toEqual(expect.arrayContaining(["bucket", "ok"]));
    expect(r.corpo.artes.find((a: any) => a.id === "bucket").thumbUrl).toBe("/objects/uploads/y.png");
  });
});

describe("6 · a sugestão do arquivo final exige a mesma peça física", () => {
  const SUG = "GET /api/artes/sugestao-final";
  const comFinal = (id: string, mudanca: any = {}) => linha(id, {
    thumbUrl: "/objects/mesma", arquivoFinalUrl: `//srv/arte/${id}.tif`, arquivoFinalNome: `${id}.tif`, quando: new Date("2026-09-01T00:00:00Z"), ...mudanca,
  });

  it("a régua pura: mesmo tipo (sem caixa/acento) e mesma medida numérica", () => {
    expect(mesmaPecaFisica({ tipo: "2x1", fileWidth: "2.00", fileHeight: "1.00" }, { tipo: "2X1", fileWidth: "2", fileHeight: "1.0" })).toBe(true);
    expect(mesmaPecaFisica({ tipo: "2x1", fileWidth: "2.00", fileHeight: "1.00" }, { tipo: "Rolo", fileWidth: "2", fileHeight: "1" })).toBe(false);
    expect(mesmaPecaFisica({ tipo: "2x1", fileWidth: "2.00", fileHeight: "1.00" }, { tipo: "2x1", fileWidth: "2.5", fileHeight: "1" })).toBe(false);
    expect(mesmaPecaFisica({ tipo: "2x1", fileWidth: null, fileHeight: null }, { tipo: "2x1", fileWidth: null, fileHeight: null })).toBe(true);
  });

  it("a arte compartilhada com peça de outro tipo ou outra medida não sugere o arquivo dela", async () => {
    H.filas = [
      [linha("alvo", { thumbUrl: "/objects/mesma" })],
      [comFinal("rolo", { tipo: "Rolo" }), comFinal("maior", { fileWidth: "3.00" }), comFinal("certa", { fileWidth: "2.0" })],
    ];
    const r = await chamar({ item: "alvo" }, ARTE, SUG);
    expect(r.corpo.displayId).toBe("#certa");

    H.filas = [[linha("alvo", { thumbUrl: "/objects/mesma" })], [comFinal("rolo", { tipo: "Rolo" })]];
    expect((await chamar({ item: "alvo" }, ARTE, SUG)).corpo).toBeNull();
  });
});

describe("6 · o modal aplica a MESMA imagem que mostra", () => {
  it("cartão, prévia e aplicação leem de imagemDaArte", () => {
    const dialogo = ler("client/src/components/buscar-arte-dialog.tsx");
    expect(dialogo).toContain("export const imagemDaArte");
    expect(dialogo).toContain("const url = imagemDaArte(arte);");
    expect(dialogo).toContain("const previa = escolhida ? imagemDaArte(escolhida) : null;");
    expect(dialogo).not.toContain("escolhida.previewUrl ?? escolhida.thumbUrl");
    const arte = fonteDaArte();
    expect(arte).toContain("const imagem = imagemDaArte(arte);");
  });
});

describe("7 · a Arte no celular", () => {
  // A Arte foi dividida (página + components/arte/): a faixa do evento e a
  // barra de filtros moram cada uma no seu arquivo.
  const arte = fonteDaArte();

  it("as datas da faixa do evento abrem num botão 'i' com popover (44px no toque)", () => {
    expect(arte).toContain('data-testid="button-datas-da-faixa"');
    expect(arte).toContain('data-testid="popover-datas-da-faixa"');
    expect(arte).toContain("aria-label={`Datas de ${bloco.eventName}`}");
    // alvo(): 44 com ponteiro grosso (dedo = usePonteiroGrosso() || isMobile).
    expect(arte).toContain("const lado = alvo(28, dedo);");
    expect(arte).toContain("const dedo = usePonteiroGrosso() || isMobile;");
    // A saída/entrega, o evento e os marcos da fase estão no popover.
    const trecho = arte.slice(arte.indexOf("const datas: Array<[string, string]> = [];"), arte.indexOf('data-testid="popover-datas-da-faixa"'));
    for (const t of ['"Entrega do material"', '"Saída"', '"Evento"', "ARTE_MARCOS_FAIXA"]) expect(trecho).toContain(t);
  });

  it("Prazo, Prioridade, Thumb e Arquivo final: cada botão com 44×44 no celular", () => {
    const seg = arte.slice(arte.indexOf("const segmentos = (<>"), arte.indexOf("// Ordenação — a regra de negócio inteira"));
    expect(seg.split("minHeight: dedo ? ALVO_TOQUE : undefined, minWidth: dedo ? ALVO_TOQUE : undefined").length - 1).toBe(3);
    expect(seg).not.toContain("margin: '3px 0', padding: '0 10px'");
    expect(seg.split("height: isMobile ? 'auto' : 36").length - 1).toBe(3);
  });

  it("o cartão do modal de busca não colide com o cartão do celular", () => {
    const dialogo = ler("client/src/components/buscar-arte-dialog.tsx");
    expect(dialogo).toContain("data-testid={`card-busca-arte-${arte.id}`}");
    expect(dialogo).not.toContain("data-testid={`card-arte-");
    expect(arte).toContain("data-testid={`card-arte-${item.id}`}");
  });
});
