// ─────────────────────────────────────────────────────────────────────────────
// EMBALAGEM — correções da revisão adversarial (21/09), que bloqueavam a
// publicação. Com o DADO REAL de produção medido no dia:
//   · 6 peças `is_reuse = true` com `reuse_qty = 0` ainda antes da produção
//     (4 awaiting_submission, 2 awaiting_final_review) — nenhuma é embalável;
//   · 7 peças `produced` com `delivered_qty > 0` (entrega parcial do modelo
//     antigo) — o que já saiu não é oferecido de novo.
// O que este arquivo pina:
//   1. o STATUS manda na embalagem (conta pura, rota, lista, fila) e a entrega
//      recusa volume com peça cancelada/arquivada/excluída;
//   2. `aEmbalar` desconta a entrega parcial antiga (e o ciclo 7+3 fecha);
//   3. concorrência: transação com o volume e as peças travados;
//   4. o atalho `items.tubo_id` é acertado na entrega;
//   5–7. transferir, corrigir reaproveitamento, reduzir e excluir respeitam a embalagem;
//   8–9. textos da peça sozinha e a foto única do comprovante;
//   10. a migração aditiva roda em banco limpo.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { fonteDoComponente } from "./fonte-dos-componentes";
import { fonteDasRotasDeItens } from "./fonte-das-rotas-de-itens";
import { readFileSync } from "fs";
import path from "path";
import { fonteDaGrafica } from "./fonte-da-grafica";
import {
  aEmbalar, planejarEmbalar, planejarEntrega, planejarRetirada, todaEmbalada, violacoesDaConta,
  progressoDaEmbalagem, statusEmbalavel, problemaNoVolume, jaSaiuDaConta,
} from "@shared/embalagem";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");
const ROTAS = ler("server/routes/tubos.ts");
const ITEMS = fonteDasRotasDeItens();
const DIALOGO = ler("client/src/components/tubos-dialog.tsx");
const FICHA = fonteDoComponente("client/src/components/item-details-dialog.tsx");
const SQL = ler("scripts/migracao-aditiva-producao.sql");
const trecho = (fonte: string, de: string, ate: string) => fonte.slice(fonte.indexOf(de), fonte.indexOf(ate, fonte.indexOf(de) + 1));

const peca = (extra: Record<string, unknown> = {}) => ({ quantity: 10, quantityProduced: 10, reuseQty: 0, isReuse: false, conferredQty: 10, embaladaQty: 0, deliveredQty: 0, status: "conferred", ...extra });

describe("1 · o status manda na embalagem", () => {
  it("as 6 de reaproveitamento antigo ANTES da produção não são embaláveis (nem na conta, nem no plano)", () => {
    for (const status of ["awaiting_submission", "awaiting_submission", "awaiting_submission", "awaiting_submission", "awaiting_final_review", "awaiting_final_review"]) {
      const legado = peca({ status, isReuse: true, reuseQty: 0, quantityProduced: 0, conferredQty: 0 });
      expect(aEmbalar(legado)).toBe(0);
      expect(planejarEmbalar(legado).ok).toBe(false);
    }
    expect(planejarEmbalar(peca({ status: "awaiting_final_review", isReuse: true })) ).toEqual({ ok: false, motivo: "está em revisão" });
    expect(planejarEmbalar(peca({ status: "awaiting_submission", isReuse: true })) ).toEqual({ ok: false, motivo: "ainda não saiu da impressão" });
    // …e o mesmo reaproveitamento antigo, já Produzido, continua embalando a quantidade inteira
    expect(aEmbalar(peca({ status: "produced", isReuse: true, reuseQty: 0, quantityProduced: 0, conferredQty: 0 }))).toBe(10);
  });

  it("cancelada, arquivada, em aprovação e em revisão nunca embalam — com frase de gente", () => {
    expect(planejarEmbalar(peca({ status: "canceled" }))).toEqual({ ok: false, motivo: "está cancelada" });
    expect(planejarEmbalar(peca({ status: "archived" }))).toEqual({ ok: false, motivo: "está arquivada" });
    for (const s of ["awaiting_review", "in_review", "awaiting_final_review", "awaiting_approval", "ready_for_production", "in_production"]) {
      expect(aEmbalar(peca({ status: s }))).toBe(0);
    }
    for (const s of ["produced", "conferred", "packed"]) expect(statusEmbalavel(s)).toBe(true);
  });

  it("problema dentro do volume: excluída, cancelada, arquivada, devolvida — a entregue e a conferida não", () => {
    expect(problemaNoVolume({ status: "canceled" })).toBe("está cancelada");
    expect(problemaNoVolume({ status: "archived" })).toBe("está arquivada");
    expect(problemaNoVolume({ status: "packed", deletedAt: new Date() })).toBe("foi excluída");
    expect(problemaNoVolume({ status: "in_review" })).toBe("está em revisão");
    expect(problemaNoVolume({ status: "awaiting_submission" })).toBe("voltou para antes da impressão");
    expect(problemaNoVolume({ status: "packed" })).toBeNull();
    expect(problemaNoVolume({ status: "delivered" })).toBeNull();
  });

  it("a rota, a lista 'sem tubo' e a fila da Gráfica usam o gate", () => {
    expect(ROTAS).toContain("const semTubo = pecas.filter((p) => !ehEntregue(p) && statusEmbalavel(p.status) && aEmbalar(p) > 0)");
    expect(ROTAS).toContain("const plano = planejarEmbalar(p, pedido.quantidade);");
    // a fila: aEmbalar() já devolve 0 pelo status, e a revisão continua barrada
    expect(fonteDaGrafica()).toContain("!EM_REVISAO.has(item.status) && !soVisualizaKit(item) && !isDelivered(item) && !isPacked(item) && !!item.eventId && aEmbalar(item) > 0;");
  });

  it("/entregar RECUSA (409) volume com peça-problema, dizendo qual e como resolver; a tela mostra o problema", () => {
    const entregar = ROTAS.slice(ROTAS.indexOf("const entregarVolume ="));
    expect(entregar).toContain("const comProblema = aEntregar.filter(({ p }) => problemaNoVolume(p));");
    expect(entregar).toContain("throw new Recusa(409, `Não dá para entregar");
    expect(entregar).toContain("tire ${codigos} do Tubo ${tubo.numero}");
    expect(entregar).toContain("desfaça a embalagem de ${codigos}");
    // a recusa vem ANTES de qualquer escrita
    expect(entregar.indexOf("comProblema.length")).toBeLessThan(entregar.indexOf("await tx.update(tuboItens)"));
    // a entrega enxerga a excluída (conteúdo lido com a trava, sem filtrar deleted_at)
    expect(entregar).toContain("const dentro = await conteudoDoTubo(tubo.id, tx);");
    expect(ROTAS).toContain("problema: linha && !linha.entregueEm ? problemaNoVolume(p) : null,");
    expect(ROTAS).toContain("&& !dentro.some(({ p, l }) => !l.entregueEm && problemaNoVolume(p)),");
    expect(DIALOGO).toContain('`${p.problema} — ${avulso ? "desfaça a embalagem" : "tire do tubo"} para entregar`');
  });
});

describe("2 · a entrega parcial antiga conta como já saída", () => {
  it("10 un., 7 conferidas e 7 entregues antigas → a embalar 0; conferir +3 → 3; embalar 3 → packed; entregar → delivered", () => {
    const antiga = peca({ status: "produced", conferredQty: 7, deliveredQty: 7, embaladaQty: 0 });
    expect(aEmbalar(antiga)).toBe(0);
    expect(planejarEmbalar(antiga)).toEqual({ ok: false, motivo: "não há unidade conferida sem embalar (7 de 10 já embaladas ou entregues)" });
    expect(violacoesDaConta(antiga)).toEqual([]);
    // 22/09: a entrega antiga NÃO é embalagem — a frase diz o que aconteceu.
    expect(progressoDaEmbalagem(antiga)).toBe("7 de 10 entregues");

    const conferida = { ...antiga, status: "conferred", conferredQty: 10 };
    expect(aEmbalar(conferida)).toBe(3);
    const plano = planejarEmbalar(conferida);
    expect(plano).toEqual({ ok: true, quantidade: 3, embaladaQty: 10, viraEmbalada: true });
    expect(planejarEmbalar(conferida, 4)).toEqual({ ok: false, motivo: "só há 3 conferida(s) sem embalar (pediu 4)" });

    const embalada = { ...conferida, status: "packed", embaladaQty: 10 };
    expect(todaEmbalada(embalada)).toBe(true);
    expect(aEmbalar(embalada)).toBe(0); // não oferece de novo
    expect(violacoesDaConta(embalada)).toEqual([]);
    expect(planejarEntrega(embalada, 3)).toEqual({ deliveredQty: 10, viraEntregue: true });
    // tirar do tubo antes de entregar devolve a 7 (o que já saiu), nunca abaixo
    expect(planejarRetirada(embalada, 3)).toEqual({ embaladaQty: 7, voltaAConferida: true });
    expect(jaSaiuDaConta(peca({ embaladaQty: 7, deliveredQty: 7 }))).toBe(7);
  });

  it("toda entregue pelo modelo antigo: nada a embalar", () => {
    expect(aEmbalar(peca({ status: "produced", deliveredQty: 10 }))).toBe(0);
  });
});

describe("3 · concorrência: volume e peças TRAVADOS, contas refeitas lá dentro", () => {
  it("há trava do volume e das peças (SELECT … FOR UPDATE)", () => {
    expect(ROTAS).toContain('const [tubo] = await tx.select().from(tubos).where(eq(tubos.id, tuboId)).for("update");');
    expect(ROTAS).toContain('(await tx.select(COLUNAS_PECA).from(itemsTable).where(inArray(itemsTable.id, Array.from(new Set(ids)))).orderBy(asc(itemsTable.id)).for("update"))');
  });
  it("embalar, tirar, apagar, fotografar e entregar rodam cada um numa transação que trava o volume", () => {
    const criar = trecho(ROTAS, 'app.post("/api/events/:eventId/tubos"', 'app.patch("/api/tubos/:id/itens"');
    const patch = trecho(ROTAS, 'app.patch("/api/tubos/:id/itens"', 'app.delete("/api/tubos/:id"');
    const apagar = trecho(ROTAS, 'app.delete("/api/tubos/:id"', 'app.post("/api/tubos/:id/fechar"');
    const fechar = trecho(ROTAS, 'app.post("/api/tubos/:id/fechar"', "const entregarVolume =");
    const entregar = ROTAS.slice(ROTAS.indexOf("const entregarVolume ="));
    for (const r of [criar, patch, apagar, fechar, entregar]) {
      expect(r).toContain("db.transaction(async (tx: Ex) => {");
      expect(r).toContain("await travarTubo(tx, ");
    }
    // dentro da transação as contas são refeitas com as peças travadas
    expect(criar).toContain("const r = await planosParaEmbalar(req, eventId, pedidos, tx);");
    expect(patch).toContain("const r = await planosParaEmbalar(req, travado.eventId, pedidos, tx);");
    // o volume entregue no meio do caminho é recusado lá dentro
    expect(ROTAS).toContain("if (tubo.entregueEm) throw new Recusa(409,");
  });
  it("escritas relativas: soma na linha e entrega com teto — nunca um total lido fora da trava", () => {
    expect(ROTAS).toContain("quantidade: sql`${tuboItens.quantidade} + ${pl.quantidade}`");
    expect(ROTAS).toContain("deliveredQty: sql`least(${itemsTable.quantity}, coalesce(${itemsTable.deliveredQty}, 0) + ${l.quantidade})`");
    expect(ROTAS).not.toContain("quantidade: existente.quantidade + pl.quantidade");
  });
  it("a recusa de dentro da transação vira a resposta HTTP e não deixa tubo novo vazio", () => {
    expect(ROTAS).toContain("if (criado) await db.delete(tubos).where(eq(tubos.id, criado.id)).catch(() => {});");
    expect((ROTAS.match(/if \(responderRecusa\(res, error\)\) return;/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});

describe("4 · o atalho `items.tubo_id` depois da entrega", () => {
  it("a entrega acerta o atalho das peças entregues (a dividida passa a apontar para o volume ainda aberto)", () => {
    const entregar = ROTAS.slice(ROTAS.indexOf("const entregarVolume ="));
    expect(entregar).toContain("await acertarAtalho(aEntregar.map(({ p }) => p.id), agora, tx);");
  });
});

describe("5–7 · as outras portas respeitam a embalagem", () => {
  it("transferir de evento: 409 com linha aberta em tubo_itens", () => {
    const rota = trecho(ITEMS, 'app.post("/api/items/:id/transfer-event"', "const atualizado = await storage.updateItem(item.id, { eventId: destinoId });");
    expect(rota).toContain("from tubo_itens where item_id = ${item.id} and entregue_em is null");
    expect(rota).toContain("Tire a peça do tubo antes de transferir.");
  });
  it("corrigir reaproveitamento recusa peça com unidade embalada; o piso da redução inclui as embaladas", () => {
    const rota = trecho(ITEMS, 'app.post("/api/items/:id/correct-reuse"', "const maximo = isAdmin");
    expect(rota).toContain("if (((current as any).embaladaQty || 0) > 0) {");
    expect(ITEMS).toContain("const piso = Math.max(impressas, currentItem.conferredQty ?? 0, (currentItem as any).embaladaQty ?? 0, currentItem.deliveredQty ?? 0);");
  });
  it("excluir a peça tira ela dos volumes abertos E faz o soft delete NUMA transação só, com a peça travada (22/09)", () => {
    const rota = trecho(ITEMS, 'app.delete("/api/items/:id"', "res.json({ success: true });");
    expect(rota).toContain("excluida = await excluirPecaTirandoDosVolumes(req, req.params.id);");
    expect(rota).not.toContain("storage.deleteItem(");
    expect(rota).not.toContain(".catch((e) => console.error(\"[items] falha ao tirar");
    const funcao = trecho(ROTAS, "export async function excluirPecaTirandoDosVolumes(", "export const ehRecusaDeTubo");
    expect(funcao).toContain("const feito = await db.transaction(async (tx: Ex) => {");
    // a ordem das travas do arquivo: volumes (por id), depois a peça
    expect(funcao.indexOf('.orderBy(asc(tubos.id)).for("update")')).toBeLessThan(funcao.indexOf("const [peca] = await pecasTravadas(tx, [itemId]);"));
    // o soft delete é DENTRO da transação, depois de tirar dos volumes
    expect(funcao.indexOf("await tirarDoTubo(tubo, [itemId], tx);")).toBeLessThan(funcao.indexOf("const apagada = await tx.update(itemsTable).set({ deletedAt: agora"));
    expect(funcao.indexOf("const apagada = await tx.update(itemsTable)")).toBeLessThan(funcao.indexOf("if (!feito) return null;"));
  });
});

describe("8–9 · a peça sozinha nunca vira 'Tubo -1'; o comprovante é uma foto", () => {
  it("textos do volume avulso", () => {
    expect(DIALOGO).toContain('{jaEmTubo.map((t) => (t.avulso ? "embalada sozinha" : `no Tubo ${t.numero}`)).join(", ")}');
    expect(DIALOGO).toContain("const jaEmTubo = (data?.tubos ?? []).filter((t) => !t.entregueEm && t.pecas.some((p) => sumidas.includes(p.id)));");
    expect(DIALOGO).toContain('{avulso ? "A embalagem está vazia" : `O Tubo ${t.numero} está vazio`}');
    expect(DIALOGO).toContain('alt={avulso ? "Foto da embalagem" : `Foto do Tubo ${t.numero}`} />');
    expect(DIALOGO).not.toContain("O Tubo {t.numero} está vazio");
    expect(FICHA).toContain('${item.tuboAvulso ? "Embalada sozinha" : `Embalada');
    expect(ROTAS).toContain('const apagado = tubo.avulso ? "Embalagem avulsa apagada" : `Tubo ${tubo.numero} apagado`;');
    expect(ROTAS).not.toContain("`Tubo ${tubo.numero} apagado — ${devolvidas}");
  });
  it("o seletor do comprovante guarda UMA foto (a nova substitui)", () => {
    expect(DIALOGO).toContain('<Fotos lista={fotos} onMudar={(mudar) => setFotos((atual) => mudar(atual).slice(-1))} alt="Foto do comprovante" />');
  });
});

describe("extra · a etiqueta do tubo", () => {
  it("GET /api/tubos/:id devolve fechadoEm no tubo (rodapé \"embalado dd/mm\")", () => {
    expect(ROTAS).toContain("tubo: { id: tubo.id, numero: tubo.numero, avulso: !!tubo.avulso, entregueEm: tubo.entregueEm, recebidoPor: tubo.recebidoPor, fechadoEm: tubo.fechadoEm },");
  });
});

describe("10 · a migração aditiva roda em banco limpo", () => {
  it("cria tubos e items.tubo_id ANTES dos ALTERs, sem mexer em banco que já os tem", () => {
    const cria = SQL.indexOf("CREATE TABLE IF NOT EXISTS tubos (");
    const coluna = SQL.indexOf("ALTER TABLE items ADD COLUMN IF NOT EXISTS tubo_id varchar REFERENCES tubos(id) ON DELETE SET NULL;");
    expect(cria).toBeGreaterThan(-1);
    expect(coluna).toBeGreaterThan(cria);
    expect(cria).toBeLessThan(SQL.indexOf("ALTER TABLE tubos"));
    expect(coluna).toBeLessThan(SQL.indexOf("CREATE TABLE IF NOT EXISTS tubo_itens"));
    expect(SQL).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "UQ_tubos_evento_numero" ON tubos (event_id, numero);');
  });
});
