// ─────────────────────────────────────────────────────────────────────────────
// CONFERÊNCIA, EMBALAGEM, TUBOS E ENTREGA — correções da revisão adversarial
// de 22/09. Aqui ficam as contas puras e as telas; as ROTAS (trava da peça e da
// união, transação, retrato com a excluída, avulso reusado, depois do commit,
// janela de 60 dias, registros, carimbos) são EXECUTADAS em
// regras-estoque-tubos-rotas.test.ts e regras-estoque-peca-embalada.test.ts.
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
});

describe("13–14 · registros e listas com recorte", () => {
  it("a tela de registros manda o Período, e a ficha pede só os volumes da peça", () => {
    const C = ler("client/src/components/registros-de-tubos.tsx");
    expect(C).toContain('if (desdeIso) parametros.set("desde", desdeIso);');
    expect(C).toContain('if (itemId) parametros.set("itemId", itemId);');
    expect(C).toContain('queryKey: ["/api/registros/tubos", `?${parametros.toString()}`]');
  });
});
