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
// O modal com o campo "Quantas" é MONTADO em tubos-tres-modais.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  aEmbalar, conferidasParaEmbalar, todaEmbalada, violacoesDaConta, planejarEmbalar, planejarRetirada, planejarEntrega,
  volumePrincipal, seloDosVolumes, progressoDaEmbalagem, parteDoTotal,
} from "@shared/embalagem";
import { linhaDaLista } from "../../client/src/lib/etiqueta-lista";
import { detalheDaProducao } from "../../client/src/lib/detalhe-producao";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");
const ROTAS = ler("server/routes/tubos.ts");
const ITEMS = ler("server/routes/items.ts");
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
  const SCHEMA = ler("shared/schema.ts");
  const SQL = ler("scripts/migracao-aditiva-producao.sql");
  it("schema: items.embalada_qty e a tabela tubo_itens (única por tubo+peça, índice por peça, cascade)", () => {
    expect(SCHEMA).toContain('embaladaQty: integer("embalada_qty").notNull().default(0),');
    expect(SCHEMA).toContain('export const tuboItens = pgTable("tubo_itens", {');
    expect(SCHEMA).toContain('tuboId: varchar("tubo_id").notNull().references(() => tubos.id, { onDelete: "cascade" }),');
    expect(SCHEMA).toContain('itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),');
    expect(SCHEMA).toContain('uniqueIndex("UQ_tubo_itens_tubo_item").on(table.tuboId, table.itemId),');
    expect(SCHEMA).toContain('index("IDX_tubo_itens_item").on(table.itemId),');
    // quem cria peça pelo corpo da requisição não escolhe o total embalado
    expect(SCHEMA).toContain("  embaladaQty: true,\n  printMachine: true,\n  tuboId: true,");
  });
  it("SQL: só ADD COLUMN / CREATE IF NOT EXISTS, quantidade > 0, e o preenchimento das peças que já estavam em tubo é idempotente", () => {
    expect(SQL).toContain("ALTER TABLE items ADD COLUMN IF NOT EXISTS embalada_qty integer NOT NULL DEFAULT 0;");
    expect(SQL).toContain("CREATE TABLE IF NOT EXISTS tubo_itens (");
    expect(SQL).toContain("quantidade integer NOT NULL CHECK (quantidade > 0),");
    expect(SQL).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "UQ_tubo_itens_tubo_item" ON tubo_itens (tubo_id, item_id);');
    expect(SQL).toContain('CREATE INDEX IF NOT EXISTS "IDX_tubo_itens_item" ON tubo_itens (item_id);');
    expect(SQL).toContain("AND NOT EXISTS (SELECT 1 FROM tubo_itens x WHERE x.item_id = i.id);");
    expect(SQL).toContain("WHERE s.item_id = i.id AND i.embalada_qty = 0;");
    const bloco = SQL.slice(SQL.indexOf("-- EMBALAGEM COM QUANTIDADE"));
    // ("ON DELETE CASCADE" é da chave estrangeira — não apaga nada ao rodar.)
    expect(bloco).not.toMatch(/\bDROP\b|\bDELETE FROM\b|\bTRUNCATE\b|ALTER COLUMN/i);
  });
  it("o .mjs confere a coluna e a tabela depois de rodar", () => {
    const MJS = ler("scripts/migracao-aditiva-producao.mjs");
    expect(MJS).toContain("'reserva_por_maquina','embalada_qty',");
    expect(MJS).toContain("(table_name='tubo_itens' AND column_name IN ('tubo_id','item_id','quantidade','entregue_em'))");
  });
});

describe("3 · as rotas usam as contas", () => {
  it("embalar aceita `itens: [{ id, quantidade }]` OU a lista de ids (quantidade = tudo o que dá), no tubo novo e no aberto", () => {
    expect(ROTAS).toContain("function lerPedidos(itens: unknown, ids: unknown): Pedido[] | null {");
    expect(ROTAS).toContain("const pedidos = lerPedidos(req.body?.itens, req.body?.itemIds);");
    expect(ROTAS).toContain("const pedidos = lerPedidos(req.body?.itens, req.body?.adicionar);");
    expect(ROTAS).toContain("const plano = planejarEmbalar(p, pedido.quantidade);");
    expect(ROTAS).toContain("if (!plano.ok) { recusas.push(`${nome}: ${plano.motivo}`); continue; }");
  });
  it("embalar soma na linha (ou cria), soma em embalada_qty, vira packed só com tudo embalado, e acerta o atalho", () => {
    expect(ROTAS).toContain("await db.update(tuboItens).set({ quantidade: existente.quantidade + pl.quantidade } as any)");
    expect(ROTAS).toContain("await db.insert(tuboItens).values({ tuboId: tubo.id, itemId: pl.peca.id, quantidade: pl.quantidade, embaladoEm: agora, embaladoPor: quem } as any);");
    expect(ROTAS).toContain("...(pl.viraEmbalada && pl.peca.status !== EMBALADO ? { status: EMBALADO, statusChangedAt: agora } : {}),");
    expect(ROTAS).toContain("await acertarAtalho(planos.map((pl) => pl.peca.id), agora);");
    expect(ROTAS).toContain("const principal = volumePrincipal(todas.filter((l) => l.itemId === id));");
  });
  it("embalar SEMPRE pede foto (só conferida embala) — e, no tubo novo, a recusa vem antes de criar", () => {
    const criar = ROTAS.slice(ROTAS.indexOf('app.post("/api/events/:eventId/tubos"'), ROTAS.indexOf('app.patch("/api/tubos/:id/itens"'));
    expect(criar).toContain("if (planos.length && lidas.fotos.length === 0) return res.status(400).json({ error: RECADO_FOTO_DO_EMBALAR });");
    expect(criar.indexOf("RECADO_FOTO_DO_EMBALAR")).toBeLessThan(criar.indexOf("await criarTubo("));
    const patch = ROTAS.slice(ROTAS.indexOf('app.patch("/api/tubos/:id/itens"'), ROTAS.indexOf('app.delete("/api/tubos/:id"'));
    expect(patch).toContain("if (lidas.fotos.length === 0) return res.status(400).json({ error: RECADO_FOTO_DO_EMBALAR });");
    expect(patch.slice(patch.indexOf("if (remover.length) {"))).not.toContain("RECADO_FOTO_DO_EMBALAR");
  });
  it("tirar é POR LINHA (as não entregues), com a trilha dizendo quantas unidades; avulso esvaziado some", () => {
    expect(ROTAS).toContain("const doTubo = (await linhasDosTubos([tubo.id])).filter((l) => ids.includes(l.itemId) && !l.entregueEm);");
    expect(ROTAS).toContain("const plano = planejarRetirada(p, l.quantidade);");
    expect(ROTAS).toContain('...(plano.voltaAConferida ? { status: "conferred", statusChangedAt: agora } : {}),');
    expect(ROTAS).toContain("`Retirada do Tubo ${tubo.numero} — ${l.quantidade} un.${motivo ? ` (${motivo})` : \"\"}`");
    expect(ROTAS).toContain("if (tubo.avulso && tiradas > 0 && (await linhasDosTubos([tubo.id])).length === 0) {");
  });
  it("entregar o volume: carimba a linha, soma em deliveredQty, `delivered` só com tudo — numa transação; e o tubo guarda o que foi junto", () => {
    const entregar = ROTAS.slice(ROTAS.indexOf('app.post("/api/tubos/:id/entregar"'));
    expect(entregar).toContain("const plano = planejarEntrega(p, l.quantidade);");
    expect(entregar).toContain("await tx.update(tuboItens).set({ entregueEm: agora } as any).where(eq(tuboItens.id, l.id));");
    expect(entregar).toContain('...(plano.viraEntregue ? { status: "delivered", deliveredAt: agora, statusChangedAt: agora } : {}),');
    expect(entregar).toContain('${plano.viraEntregue ? "Entrega concluída (" : "Entrega parcial ("}');
    expect(entregar).toContain('aEntregar.map(({ p, l }) => `${p.displayId ?? "peça"} (${l.quantidade})`).join(", ")');
    expect(entregar).toContain("await db.transaction(async (tx) => {");
    // só quem recebeu é obrigatório
    expect(entregar).toContain("if (!recebedor) {");
    expect(entregar).not.toContain("ainda não tem foto");
  });
  it("a conferência só fecha como Embalado se TUDO já estava embalado (a parcial embalou a parte dela antes)", () => {
    expect(ITEMS).toContain('...(isFull ? { status: (((current as any).embaladaQty ?? 0) >= current.quantity ? "packed" : "conferred") as "packed" | "conferred" } : {}),');
  });
  it("PATCH /api/items/:id/deliver → 409 para QUALQUER peça (inclusive a parcial), sem escrever nada — a rota fica", () => {
    const i = ITEMS.indexOf('app.patch("/api/items/:id/deliver"');
    const rota = ITEMS.slice(i, ITEMS.indexOf("  // Update production (Gráfica module)", i));
    expect(i).toBeGreaterThan(-1);
    expect(rota).toContain('return res.status(409).json({ error: "Embale antes de entregar (Embalar pede a foto; a entrega pede só quem recebeu)" });');
    expect(rota).not.toMatch(/updateItem|db\.update|db\.transaction|createAuditLog/);
    expect(rota.length).toBeLessThan(900);
  });
});

describe("4 · os contratos novos para quem lê", () => {
  it("GET /api/tubos/:id e o retrato do evento devolvem `quantidadeNoTubo` por peça (a etiqueta do tubo usa)", () => {
    expect(ROTAS).toContain("quantidadeNoTubo: linha ? linha.quantidade : 0,");
    expect(ROTAS).toContain("pecas: dentro.sort((a, b) => porCodigo(a.p, b.p)).map(({ p, l }) => pecaParaTela(p, l)),");
    expect(ROTAS).toContain("aEmbalar: aEmbalar(p),");
  });
  it("GET /api/tubos leva as `linhas` de cada volume num select só — e respeita o recorte do Kit", () => {
    const rota = ROTAS.slice(ROTAS.indexOf('app.get("/api/tubos", requireAuth'), ROTAS.indexOf('app.get("/api/tubos/:id"'));
    expect(rota).toContain("const todasAsLinhas = (await db.select(COLUNAS_LINHA).from(tuboItens)) as Linha[];");
    expect(rota).toContain("permitidas = todasAsLinhas.filter((l) => suas.has(l.itemId));");
    expect(rota).toContain("linhas: porTubo.get(t.id) ?? []");
  });
  it("'sem tubo' virou 'tem unidade conferida ainda não embalada' — vale para a inteira, a parcial e a dividida", () => {
    expect(ROTAS).toContain("const semTubo = pecas.filter((p) => !ehEntregue(p) && aEmbalar(p) > 0).sort(porCodigo).map((p) => pecaParaTela(p));");
  });
  it("a peça leva `tuboVolumes` (os volumes abertos com quantidade) para o resto do fluxo — um select a mais, com rede de segurança", () => {
    const SERVICO = ler("server/services/tubosDaPeca.ts");
    expect(SERVICO).toContain("export type VolumeDaPeca = { tuboId: string; numero: number; avulso: boolean; quantidade: number };");
    expect(SERVICO).toContain("return volumes?.length ? { ...peca, ...resumo, tuboVolumes: volumes } : { ...peca, ...resumo };");
    expect(SERVICO).toContain('console.error("[tubosDaPeca] não foi possível ler as quantidades por volume:", erro);');
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
    expect(GRAFICA).toContain("const canDeliver = (_item: any) => false && canDeliverBase(_item);");
  });
  it("o selo do tubo fica em LINHA PRÓPRIA, abaixo do código, e quebra sem cortar (dono: 'muito grudado no número')", () => {
    expect(GRAFICA).toContain('style={{ display: "flex", width: "fit-content", maxWidth: "100%", flexWrap: "wrap", alignItems: "center", gap: 3, marginTop: 6,');
    expect(GRAFICA).toContain("flexBasis: '100%'");
  });
});
