// ─────────────────────────────────────────────────────────────────────────────
// EMBALAGEM COM QUANTIDADE (dono, 21/09: "podemos ter quantidade diferente em
// tubos diferentes, então tem que colocar as quantidades também").
//
// Substitui "a peça vai INTEIRA para um tubo". O que este arquivo pina:
//   1. AS CONTAS (shared/embalagem.ts, puras): a conta protegida, embalar parte,
//      dividir em dois volumes, entregar volume com parte → entrega parcial,
//      tirar uma linha, o atalho `tubo_id` e como se diz ("Tubo 1 (7) · Tubo 2 (3)");
//   2. O MODELO aditivo: tubo_itens + items.embalada_qty (schema, SQL, conferência);
//   3. AS ROTAS usam essas contas — e a entrega por peça responde 409 para todos;
//   4. OS CONTRATOS novos para quem lê: `quantidadeNoTubo`, `linhas`, `tuboVolumes`;
//   5. A TELA: selo dividido, "Embalar 3", a linha da etiqueta e a frase do fluxo.
// O modal com o campo "Quantas" é MONTADO em tubos-tres-modais.test.ts. As rotas
// (3) e os contratos (4) são EXECUTADOS em regras-estoque-tubos-rotas.test.ts e
// regras-estoque-peca-embalada.test.ts; o schema, em regras-estoque-schema.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { comandosQueCitam, colunasConferidasPeloMjs, DESTRUTIVO } from "./regras-estoque-migracao";
import { readFileSync } from "fs";
import path from "path";
import {
  aEmbalar, conferidasParaEmbalar, todaEmbalada, violacoesDaConta, planejarEmbalar, planejarRetirada, planejarEntrega,
  volumePrincipal, seloDosVolumes, progressoDaEmbalagem, parteDoTotal, planejarConferencia,
} from "@shared/embalagem";
import { linhaDaLista } from "../../client/src/lib/etiqueta-lista";
import { detalheDaProducao } from "../../client/src/lib/detalhe-producao";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");
const GRAFICA = ler("client/src/pages/grafica.tsx");

const peca = (extra: Record<string, unknown> = {}) => ({ quantity: 10, quantityProduced: 10, reuseQty: 0, isReuse: false, conferredQty: 10, embaladaQty: 0, deliveredQty: 0, status: "conferred", ...extra });

describe("1 · as contas", () => {
  it("só unidade CONFERIDA é embalada: a parcial (7 de 10) embala até 7; as outras 3 depois de conferidas", () => {
    const parcial = peca({ status: "produced", conferredQty: 7 });
    expect(aEmbalar(parcial)).toBe(7);
    expect(planejarEmbalar(parcial)).toEqual({ ok: true, quantidade: 7, embaladaQty: 7, viraEmbalada: false });
    expect(planejarEmbalar(parcial, 8)).toEqual({ ok: false, motivo: "só há 7 conferida(s) sem embalar (pediu 8)" });
    // conferiu o resto: sobram 3 para embalar, e aí sim vira Embalado
    const depois = peca({ conferredQty: 10, embaladaQty: 7 });
    expect(aEmbalar(depois)).toBe(3);
    expect(planejarEmbalar(depois)).toEqual({ ok: true, quantidade: 3, embaladaQty: 10, viraEmbalada: true });
  });

  it("dividir em dois volumes: 7 no Tubo 1 e 3 no Tubo 2 — `packed` só quando TUDO está embalado", () => {
    const p = peca();
    const um = planejarEmbalar(p, 7);
    expect(um).toMatchObject({ ok: true, quantidade: 7, viraEmbalada: false });
    const dois = planejarEmbalar(peca({ embaladaQty: 7 }), 3);
    expect(dois).toMatchObject({ ok: true, quantidade: 3, embaladaQty: 10, viraEmbalada: true });
    expect(todaEmbalada(peca({ embaladaQty: 10 }))).toBe(true);
  });

  it("recusas com frase de gente: nada conferido, tudo embalado, quantidade inválida", () => {
    expect(planejarEmbalar(peca({ status: "produced", conferredQty: 0 }))).toEqual({ ok: false, motivo: "ainda não tem unidade conferida para embalar" });
    expect(planejarEmbalar(peca({ embaladaQty: 10 }))).toEqual({ ok: false, motivo: "já está toda embalada (10 de 10)" });
    expect(planejarEmbalar(peca(), 0)).toEqual({ ok: false, motivo: "a quantidade a embalar tem de ser pelo menos 1" });
  });

  it("entregar o volume entrega AS QUANTIDADES que estão nele: 7 de 10 → parcial; +3 → entregue", () => {
    expect(planejarEntrega(peca({ embaladaQty: 10 }), 7)).toEqual({ deliveredQty: 7, viraEntregue: false });
    expect(planejarEntrega(peca({ embaladaQty: 10, deliveredQty: 7 }), 3)).toEqual({ deliveredQty: 10, viraEntregue: true });
  });

  it("tirar uma LINHA devolve aquela quantidade a 'conferida não embalada'; a `packed` volta a `conferred`; nunca abaixo do entregue", () => {
    expect(planejarRetirada(peca({ status: "packed", embaladaQty: 10 }), 3)).toEqual({ embaladaQty: 7, voltaAConferida: true });
    expect(planejarRetirada(peca({ status: "conferred", embaladaQty: 7 }), 7)).toEqual({ embaladaQty: 0, voltaAConferida: false });
    expect(planejarRetirada(peca({ status: "conferred", embaladaQty: 10, deliveredQty: 7 }), 3).embaladaQty).toBe(7);
  });

  it("a conta protegida: entregues ≤ embaladas ≤ conferidas ≤ produzidas + reuso ≤ quantidade", () => {
    expect(violacoesDaConta(peca({ embaladaQty: 7, deliveredQty: 7 }))).toEqual([]);
    expect(violacoesDaConta(peca({ embaladaQty: 3, deliveredQty: 7 }))).toEqual(["entregues (7) > embaladas (3)"]);
    expect(violacoesDaConta(peca({ conferredQty: 5, embaladaQty: 7 }))).toEqual(["embaladas (7) > conferidas (5)"]);
    expect(violacoesDaConta(peca({ quantityProduced: 4, conferredQty: 6 }))).toContain("conferidas (6) > produzidas + reuso (4)");
    expect(violacoesDaConta(peca({ quantityProduced: 12 }))).toContain("produzidas + reuso (12) > quantidade (10)");
  });

  it("reuso LEGADO (isReuse com reuseQty 0) nunca passou por conferência: vale a quantidade inteira", () => {
    const legado = peca({ isReuse: true, reuseQty: 0, quantityProduced: 0, conferredQty: 0 });
    expect(conferidasParaEmbalar(legado)).toBe(10);
    expect(violacoesDaConta({ ...legado, embaladaQty: 10 })).toEqual([]);
  });

  it("o atalho `tubo_id`: o volume ABERTO com mais unidades; sem aberto, o entregue; sem linha, null", () => {
    expect(volumePrincipal([{ tuboId: "t1", quantidade: 3 }, { tuboId: "t2", quantidade: 7 }])).toBe("t2");
    expect(volumePrincipal([{ tuboId: "t1", quantidade: 7, entregueEm: new Date() }, { tuboId: "t2", quantidade: 3 }])).toBe("t2");
    expect(volumePrincipal([{ tuboId: "t1", quantidade: 7, entregueEm: new Date() }])).toBe("t1");
    expect(volumePrincipal([])).toBeNull();
  });

  it("como se diz: 'Tubo 1 (7) · Tubo 2 (3)', 'Embalada (10)', '7 de 10 embaladas', '(7 de 10)'", () => {
    expect(seloDosVolumes([{ tuboId: "b", quantidade: 3, numero: 2 }, { tuboId: "a", quantidade: 7, numero: 1 }])).toBe("Tubo 1 (7) · Tubo 2 (3)");
    expect(seloDosVolumes([{ tuboId: "x", quantidade: 10, numero: -1, avulso: true }])).toBe("Embalada (10)");
    expect(seloDosVolumes([{ tuboId: "x", quantidade: 10, numero: 1, entregueEm: "2026-09-21" }])).toBe("");
    expect(progressoDaEmbalagem(peca({ embaladaQty: 7 }))).toBe("7 de 10 embaladas");
    expect(progressoDaEmbalagem(peca({ embaladaQty: 10 }))).toBe("");
    expect(parteDoTotal(7, 10)).toBe("(7 de 10)");
    expect(parteDoTotal(10, 10)).toBe("");
  });
});

describe("2 · o modelo é ADITIVO", () => {
  // O schema (embalada_qty, tubo_itens, publicInsertItemSchema) é lido pelo drizzle em regras-estoque-schema.test.ts.
  // Varredura: o .sql e o .mjs não rodam nos testes de unidade; confere-se cada COMANDO que cita a tabela.
  it("SQL: só ADD COLUMN / CREATE IF NOT EXISTS, quantidade > 0, e o preenchimento das peças que já estavam em tubo é idempotente", () => {
    const doModelo = [...comandosQueCitam("tubo_itens"), ...comandosQueCitam("embalada_qty")];
    expect(doModelo.length).toBeGreaterThan(0);
    for (const c of doModelo) expect(c).not.toMatch(DESTRUTIVO);
    expect(doModelo).toContainEqual(expect.stringMatching(/^ALTER TABLE items ADD COLUMN IF NOT EXISTS embalada_qty integer NOT NULL DEFAULT 0\s*;/i));
    const cria = doModelo.find((c) => /^CREATE TABLE IF NOT EXISTS tubo_itens\s*\(/i.test(c))!;
    expect(cria).toMatch(/\bquantidade integer NOT NULL CHECK \(\s*quantidade > 0\s*\)/i);
    expect(doModelo).toContainEqual(expect.stringMatching(/^CREATE UNIQUE INDEX IF NOT EXISTS "UQ_tubo_itens_tubo_item" ON tubo_itens\s*\(\s*tubo_id\s*,\s*item_id\s*\)/i));
    expect(doModelo).toContainEqual(expect.stringMatching(/^CREATE INDEX IF NOT EXISTS "IDX_tubo_itens_item" ON tubo_itens\s*\(\s*item_id\s*\)/i));
    // o preenchimento só toca quem ainda não tem linha / ainda está em 0 (rodar duas vezes não dobra)
    const insere = doModelo.find((c) => /^INSERT INTO tubo_itens\b/i.test(c))!;
    expect(insere).toMatch(/NOT EXISTS\s*\(\s*SELECT 1 FROM tubo_itens x WHERE x\.item_id = i\.id\s*\)/i);
    const soma = doModelo.find((c) => /^UPDATE items\b/i.test(c))!;
    expect(soma).toMatch(/\bi\.embalada_qty = 0\b/i);
  });
  it("o .mjs confere a coluna e a tabela depois de rodar", () => {
    const conferidas = colunasConferidasPeloMjs();
    expect(Array.from(conferidas.get("items") ?? [])).toContain("embalada_qty");
    expect(Array.from(conferidas.get("tubo_itens") ?? [])).toEqual(expect.arrayContaining(["tubo_id", "item_id", "quantidade", "entregue_em"]));
  });
});

describe("3 · a conferência fecha como Embalado só com tudo embalado", () => {
  // As rotas (embalar, tirar, entregar, /deliver aposentada, leituras) são EXECUTADAS em
  // regras-estoque-tubos-rotas.test.ts e regras-estoque-peca-embalada.test.ts.
  it("a conferência só fecha como Embalado se TUDO já estava embalado (a parcial embalou a parte dela antes)", () => {
    const fecha = (embaladaQty: number) => planejarConferencia(peca({ status: "produced", conferredQty: 7, embaladaQty }), 3);
    expect(fecha(10)).toMatchObject({ ok: true, completa: true, novoStatus: "packed" });
    expect(fecha(7)).toMatchObject({ ok: true, completa: true, novoStatus: "conferred" });
    expect(planejarConferencia(peca({ status: "produced", conferredQty: 5, embaladaQty: 5 }), 3)).toMatchObject({ ok: true, completa: false, novoStatus: null });
  });
});

describe("5 · a tela", () => {
  it("a linha da etiqueta usa a quantidade NAQUELE tubo e avisa quando a peça está dividida", () => {
    expect(linhaDaLista({ type: "2x1", description: "Nubank", quantity: 10, quantidadeNoTubo: 7 })).toBe("2x1 Nubank - 7 (7 de 10)");
    expect(linhaDaLista({ type: "2x1", description: "Nubank", quantity: 10, quantidadeNoTubo: 10 })).toBe("2x1 Nubank - 10");
    // sem o campo (etiquetas do evento), nada muda
    expect(linhaDaLista({ type: "2x1", description: "Nubank", quantity: 10 })).toBe("2x1 Nubank - 10");
    expect(linhaDaLista({ type: "2x1", description: "Nubank", quantity: 10, quantidadeNoTubo: 7 }, { mostrarQuantidade: false })).toBe("2x1 Nubank");
  });
  it("a frase fora da Gráfica: '7 de 10 embaladas · Tubo 1 (7)' e 'Tubo 1 (7) · Tubo 2 (3)'", () => {
    const volumes = (...v: Array<[number, number]>) => v.map(([numero, quantidade], i) => ({ tuboId: `t${i}`, numero, quantidade, avulso: false }));
    expect(detalheDaProducao({ status: "conferred", quantity: 10, conferredQty: 10, embaladaQty: 7, tuboId: "t0", tuboNumero: 1, tuboVolumes: volumes([1, 7]) } as any)).toBe("7 de 10 embaladas · Tubo 1 (7)");
    expect(detalheDaProducao({ status: "produced", quantity: 10, quantityProduced: 10, conferredQty: 7, embaladaQty: 7, tuboId: "t0", tuboNumero: 1, tuboVolumes: volumes([1, 7]) } as any)).toBe("7 de 10 embaladas · Tubo 1 (7)");
    expect(detalheDaProducao({ status: "packed", quantity: 10, conferredQty: 10, embaladaQty: 10, tuboId: "t0", tuboNumero: 1, tuboVolumes: volumes([1, 7], [2, 3]) } as any)).toBe("Tubo 1 (7) · Tubo 2 (3)");
    expect(detalheDaProducao({ status: "conferred", quantity: 10, conferredQty: 10, embaladaQty: 0 } as any)).toBe("Aguardando embalagem");
  });
  it("Gráfica: embala quem tem unidade a embalar ('Embalar 3'), o selo lista os volumes, e as ações da embalada valem para quem tem volume aberto", () => {
    expect(GRAFICA).toContain("!EM_REVISAO.has(item.status) && !soVisualizaKit(item) && !isDelivered(item) && !isPacked(item) && !!item.eventId && aEmbalar(item) > 0;");
    expect(GRAFICA).toContain("const rotuloEmbalar = (item: any) => (aEmbalar(item) < qtyOf(item) ? `Embalar ${aEmbalar(item)}` : \"Embalar\");");
    expect(GRAFICA.match(/\{rotuloEmbalar\(item\)\}/g)?.length).toBe(2);
    expect(GRAFICA).toContain("return falta + seloDosVolumes(volumes);");
    expect(GRAFICA.match(/temVolumeAberto\(item\) && /g)?.length).toBeGreaterThanOrEqual(4);
    // a linha memoizada redesenha quando o selo ou o "Embalar N" mudam
    expect(GRAFICA).toContain("seloDoTubo(item), aEmbalar(item),");
  });
  it("Gráfica: a entrega por peça está aposentada — nenhum Entregar por peça, lote de entrega ou fila de entrega aparece", () => {
    // o código morto saiu inteiro: nem gate, nem mutação, nem chamada à rota aposentada
    expect(GRAFICA).not.toContain("canDeliver");
    expect(GRAFICA).not.toContain("markDeliveredMutation");
    expect(GRAFICA).not.toContain("/deliver`");
    expect(GRAFICA).not.toContain("bulkDeliveryMode");
  });
  it("o selo do tubo fica em LINHA PRÓPRIA, abaixo do código, e quebra sem cortar (dono: 'muito grudado no número')", () => {
    expect(GRAFICA).toContain('style={{ display: "flex", width: "fit-content", maxWidth: "100%", flexWrap: "wrap", alignItems: "center", gap: 3, marginTop: 6,');
    expect(GRAFICA).toContain("flexBasis: '100%'");
  });
});
