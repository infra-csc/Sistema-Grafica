// ─────────────────────────────────────────────────────────────────────────────
// CONFERÊNCIA, EMBALAGEM, TUBOS E ENTREGA — correções da revisão adversarial
// de 22/09. Comportamento (funções puras) onde dá; o resto pina a forma das
// rotas que só um banco de verdade exercitaria (trava, transação, recorte).
// As telas montadas (digitação real no "Quantas", aviso falso, lote de uma
// peça, peça travada na entrega) estão em tubos-tres-modais.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { problemaNoVolume, progressoDaEmbalagem } from "@shared/embalagem";
import { detalheDaProducao } from "../../client/src/lib/detalhe-producao";
import { partesDaPeca } from "../../client/src/lib/etiqueta-lista";
import { fraseDaTrava } from "@shared/trava-da-peca";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");
const ROTAS = ler("server/routes/tubos.ts");
const ITEMS = ler("server/routes/items.ts");
const trecho = (texto: string, de: string, ate: string) => {
  const i = texto.indexOf(de);
  expect(i, `não achei ${de}`).toBeGreaterThan(-1);
  return texto.slice(i, texto.indexOf(ate, i + de.length));
};

describe("3 · as peças antigas com entrega parcial não são 'embaladas'", () => {
  it("0 embaladas e 7 entregues → '7 de 10 entregues'; embaladas de verdade continuam 'embaladas'", () => {
    expect(progressoDaEmbalagem({ quantity: 10, embaladaQty: 0, deliveredQty: 7 })).toBe("7 de 10 entregues");
    expect(progressoDaEmbalagem({ quantity: 10, embaladaQty: 7, deliveredQty: 7 })).toBe("7 de 10 embaladas");
    expect(progressoDaEmbalagem({ quantity: 10, embaladaQty: 7, deliveredQty: 0 })).toBe("7 de 10 embaladas");
    expect(progressoDaEmbalagem({ quantity: 10, embaladaQty: 0, deliveredQty: 10 })).toBe("");
    expect(progressoDaEmbalagem({ quantity: 10, embaladaQty: 0, deliveredQty: 0 })).toBe("");
  });
  it("a frase curta da peça antiga (produced, 7 entregues sem volume) diz 'entregues'", () => {
    expect(detalheDaProducao({ status: "produced", quantity: 10, quantityProduced: 10, conferredQty: 7, deliveredQty: 7, embaladaQty: 0 })).toBe("7 de 10 entregues");
  });
});

describe("4 · molde produzido não 'aguarda conferência'", () => {
  it("detalheDaProducao do molde produzido é null; a peça comum produzida continua aguardando", () => {
    expect(detalheDaProducao({ type: "Molde", status: "produced", quantity: 1 })).toBeNull();
    expect(detalheDaProducao({ type: "2x1", status: "produced", quantity: 1 })).toBe("Aguardando conferência");
  });
});

describe("5 · peça travada no volume é problema — a tela desabilita antes do 409", () => {
  const travada = { status: "packed", travadaEm: new Date(), travadaPor: "Bia", travadaMotivo: "Arte vai mudar" };
  it("problemaNoVolume acusa a trava com a MESMA frase da recusa", () => {
    expect(problemaNoVolume(travada)).toBe(fraseDaTrava(travada));
    expect(problemaNoVolume(travada)).toBe("Peça travada pela Solicitação: Arte vai mudar — fale com Bia");
    // a excluída continua sendo "foi excluída" (a primeira coisa a resolver)
    expect(problemaNoVolume({ ...travada, deletedAt: new Date() })).toBe("foi excluída");
    expect(problemaNoVolume({ status: "packed" })).toBeNull();
  });
  it("o retrato dos tubos leva os campos da trava; 'pronto para entregar' já lê problemaNoVolume", () => {
    const tela = trecho(ROTAS, "const pecaParaTela = ", "const porCodigo");
    expect(tela).toContain("travada: pecaTravada(p),");
    expect(tela).toContain("travadaPor: p.travadaPor ?? null,");
    expect(tela).toContain("travadaMotivo: p.travadaMotivo ?? null,");
    expect(ROTAS).toContain("&& !dentro.some(({ p, l }) => !l.entregueEm && problemaNoVolume(p)),");
  });
});

describe("6 · conferir trava a peça", () => {
  const rota = trecho(ITEMS, 'app.post("/api/items/:id/confer"', 'app.patch("/api/items/:id/deliver"');
  it("lê a peça com SELECT … FOR UPDATE dentro de uma transação e grava lá dentro", () => {
    expect(rota).toContain("await db.transaction(async (tx: any): Promise<Resultado> => {");
    expect(rota).toContain('const [current] = await tx.select().from(itemsTable).where(eq(itemsTable.id, req.params.id)).for("update");');
    expect(rota).toContain("const [item] = await tx.update(itemsTable).set({");
    expect(rota).not.toContain("storage.getItem(");
    expect(rota).not.toContain("storage.updateItem(");
    // a leitura travada vem ANTES da conta, e a gravação depois dela
    expect(rota.indexOf('.for("update")')).toBeLessThan(rota.indexOf("const plano = planejarConferencia(current as any, qtdPedida);"));
    expect(rota.indexOf("const newConferred = plano.conferredQty;")).toBeLessThan(rota.indexOf("await tx.update(itemsTable)"));
    // o carimbo "desde quando" continua (a gravação não passa mais por storage.updateItem)
    expect(rota).toContain("statusChangedAt: agora");
  });
});

describe("7 · excluir a peça embalada: uma transação, e a excluída aparece para ser tirada", () => {
  it("o retrato do evento traz a excluída que ainda está num volume ABERTO (com o problema)", () => {
    const retrato = trecho(ROTAS, 'app.get("/api/events/:eventId/tubos"', 'app.get("/api/tubos", requireAuth');
    expect(retrato).toContain("const excluidasNoVolume = Array.from(new Set(linhasCruas.filter((l) => !l.entregueEm && !vivas.has(l.itemId)).map((l) => l.itemId)));");
    // a lista "a embalar" continua só com as vivas
    expect(retrato).toContain("const semTubo = pecas.filter(");
  });
});

describe("9 · segunda embalagem sozinha da mesma peça reusa o avulso aberto", () => {
  it("POST com avulso procura a embalagem avulsa ABERTA da peça antes de criar outra", () => {
    const criar = trecho(ROTAS, 'app.post("/api/events/:eventId/tubos"', 'app.patch("/api/tubos/:id/itens"');
    expect(criar).toContain("eq(tubos.avulso, true), isNull(tubos.entregueEm), eq(tuboItens.itemId, previa.planos[0].peca.id), isNull(tuboItens.entregueEm)");
    expect(criar).toContain("const tubo = existente ?? await criarTubo(eventId, resolveActor(req).userName, avulso);");
    // o reusado nunca é apagado na recusa (só o recém-criado)
    expect(criar).toContain("criado = existente ? null : tubo;");
  });
});

describe("10 · entregue por volume com foto da embalagem não é 'sem comprovante'", () => {
  it("a ficha só acusa quando não há foto de entrega NEM foto do volume", () => {
    const F = ler("client/src/components/item-details-dialog.tsx");
    expect(F).toContain("const entregueComFotoDaEmbalagem = !!item.tuboId && !!item.tuboFechadoEm;");
    expect(F).toContain("const missingDeliveryProof = isDeliveredItem && deliveryPhotos.length === 0 && !entregueComFotoDaEmbalagem;");
  });
});

describe("11 · etiqueta da peça já entregue", () => {
  it("dividida e toda entregue: cada tubo com a SUA quantidade (não 10 no último)", () => {
    const ps = partesDaPeca({
      id: "d", type: "2x1", quantity: 10, tuboId: "t2", tuboNumero: 2, embaladaQty: 10,
      tuboVolumesEntregues: [{ tuboId: "t1", numero: 1, quantidade: 7 }, { tuboId: "t2", numero: 2, quantidade: 3 }],
    });
    expect(ps.map((p) => [p.numero, p.quantidade])).toEqual([[1, 7], [2, 3]]);
  });
  it("um tubo entregue e outro aberto: as já entregues não viram 'fora de volume'", () => {
    const ps = partesDaPeca({
      id: "d", type: "2x1", quantity: 10,
      tuboVolumes: [{ tuboId: "t2", numero: 2, quantidade: 3 }],
      tuboVolumesEntregues: [{ tuboId: "t1", numero: 1, quantidade: 7 }],
    });
    expect(ps.map((p) => [p.numero, p.quantidade])).toEqual([[1, 7], [2, 3]]);
    expect(ps.some((p) => p.chave.endsWith("|fora"))).toBe(false);
  });
  it("a peça leva os volumes entregues no enrich (tubosDaPeca)", () => {
    const S = ler("server/services/tubosDaPeca.ts");
    expect(S).toContain("...(entregues?.length ? { tuboVolumesEntregues: entregues } : {}),");
  });
});

describe("12 · trilha e aviso depois do commit nunca viram 500", () => {
  it("avisarEmbalagem/avisarRetirada e os broadcasts passam por depoisDoCommit (try/catch + log)", () => {
    expect(ROTAS).toContain('await depoisDoCommit("avisar a embalagem", () => avisarEmbalagemCru(req, tubo, planos, nFotos));');
    expect(ROTAS).toContain('await depoisDoCommit("avisar a retirada", () => avisarRetiradaCru(req, tubo, tiradas, motivo));');
    const f = trecho(ROTAS, "async function depoisDoCommit(", "\n}\n");
    expect(f).toContain("try { await fazer(); } catch (error) { console.error(");
  });
});

describe("13–14 · registros e listas com recorte", () => {
  it("GET /api/tubos (as duas formas) só vê volume aberto ou entregue há até 60 dias", () => {
    const rota = trecho(ROTAS, 'app.get("/api/tubos", requireAuth', 'app.get("/api/registros/tubos"');
    expect((rota.match(/where\(volumeNaJanela\(\)\)/g) ?? []).length).toBe(2);
    expect(ROTAS).toContain("or(isNull(tubos.entregueEm), gte(tubos.entregueEm, sql`now() - (${JANELA_DE_DIAS} * interval '1 day')`))");
    expect(rota).not.toContain("await db.select(COLUNAS_LINHA).from(tuboItens)");
  });
  it("os registros aceitam itemId, desde, eventos e busca, e devolvem no máximo o limite", () => {
    const rota = trecho(ROTAS, 'app.get("/api/registros/tubos"', "// Um tubo com o que tem dentro");
    for (const f of ["const itemId = texto(q.itemId);", "const desdeBruto = texto(q.desde);", "const eventos = texto(q.eventos)", "const busca = texto(q.busca)"]) expect(rota).toContain(f);
  });
  it("a tela de registros manda o Período, e a ficha pede só os volumes da peça", () => {
    const C = ler("client/src/components/registros-de-tubos.tsx");
    expect(C).toContain('if (desdeIso) parametros.set("desde", desdeIso);');
    expect(C).toContain('if (itemId) parametros.set("itemId", itemId);');
    expect(C).toContain('queryKey: ["/api/registros/tubos", `?${parametros.toString()}`]');
  });
});

describe("15–16 · travas e carimbos", () => {
  it("o PATCH trava a UNIÃO das peças uma vez, logo depois do volume; toda trava de peça é por id", () => {
    const patch = trecho(ROTAS, 'app.patch("/api/tubos/:id/itens"', 'app.delete("/api/tubos/:id"');
    const i = patch.indexOf("const travado = await travarTubo(tx, tubo.id, jaEntregue);");
    const j = patch.indexOf("await pecasTravadas(tx, [...pedidos.map((x) => x.id), ...remover]);");
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    expect(j).toBeLessThan(patch.indexOf("const r = await planosParaEmbalar(req, travado.eventId, pedidos, tx);"));
    expect(ROTAS).toContain(".orderBy(asc(itemsTable.id)).for(\"update\")");
  });
  it("quando o avulso vira Tubo N, a peça que já estava nele é carimbada", () => {
    const patch = trecho(ROTAS, 'app.patch("/api/tubos/:id/itens"', 'app.delete("/api/tubos/:id"');
    expect(patch).toContain("await tx.update(itemsTable).set({ updatedAt: new Date() } as any).where(inArray(itemsTable.id, Array.from(dentro)));");
  });
});
