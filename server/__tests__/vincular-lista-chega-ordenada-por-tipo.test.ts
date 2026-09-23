// ─────────────────────────────────────────────────────────────────────────────
// VINCULAR: a lista chega ordenada por tipo — senão o agrupador mente.
//
// Relato com captura (Blue Night SP): "TOTENS 6" com UMA linha embaixo, depois
// "QUADROS 4X3 6" com uma linha, depois "2X1 6", "PRISMA 6"… Cada contagem
// certa, a lista misturada.
//
// A tabela abre um cabeçalho de tipo sempre que o tipo MUDA em relação à linha
// anterior (`abreTipo`). Isso só agrupa se a lista chegar ORDENADA por tipo.
// A ordenação existia (grupo pai → tipo → ID) e caiu quando as duas árvores de
// JSX viraram uma: a lista passou a chegar em ordem de ID, os tipos
// intercalados — e um "abre ao mudar" sobre uma lista intercalada repete o
// cabeçalho a cada linha.
//
// O padrão que isto guarda: um agrupador por "mudou em relação ao anterior"
// é uma PROMESSA sobre a ordem da entrada. Quem garante a ordem tem de estar
// ao lado de quem a consome, ou o próximo refactor separa os dois de novo.
//
// A ordem é uma função pura (components/vinculacao/regras.ts) e aqui ela é
// testada com dados; a fila e o hook são conferidos só no que a liga a eles.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { ordenarParaLeitura, secaoDaPeca } from "@/components/vinculacao/regras";
import type { PecaDaVinculacao } from "@/components/vinculacao/tipos";
import { lerDaRaiz } from "./fonte-das-telas-da-arte";

const HOOK = lerDaRaiz("client/src/components/vinculacao/use-vinculacao.ts");
const FILA = lerDaRaiz("client/src/components/vinculacao/fila-da-vinculacao.tsx");

const peca = (displayId: string, type: string, kit?: string): PecaDaVinculacao => ({
  id: displayId, displayId, eventId: "e1", type, description: null, status: "awaiting_linking",
  skipApproval: false, isReuse: false, quantity: 1, calculatedM2: "1.00", referenceUrl: null,
  kitRemessaId: kit ?? null,
  kitRemessa: kit ? { versao: "V1", entregaMaterial: "2099-09-14T12:00:00.000Z" } : null,
});

describe("a ordem de leitura da produção: grupo pai → tipo → ID", () => {
  // Os tipos do relato, intercalados como chegavam em ordem de ID.
  const GRUPOS = { "TOTENS": "Sinalização", "QUADROS 4X3": "Quadros", "2X1": "Quadros", "PRISMA": "Sinalização" };
  const entrada = [
    peca("#0001", "TOTENS"), peca("#0002", "QUADROS 4X3"), peca("#0003", "2X1"), peca("#0004", "PRISMA"),
    peca("#0005", "TOTENS"), peca("#0006", "QUADROS 4X3"), peca("#0007", "2X1"), peca("#0008", "PRISMA"),
  ];

  it("junta cada tipo, e os tipos de um grupo pai ficam juntos", () => {
    const saida = ordenarParaLeitura(entrada, GRUPOS).map((p) => `${p.type} ${p.displayId}`);
    expect(saida).toEqual([
      // Quadros (2X1, QUADROS 4X3) antes de Sinalização (PRISMA, TOTENS).
      "2X1 #0003", "2X1 #0007",
      "QUADROS 4X3 #0002", "QUADROS 4X3 #0006",
      "PRISMA #0004", "PRISMA #0008",
      "TOTENS #0001", "TOTENS #0005",
    ]);
  });

  it("com a lista ordenada, 'abre ao mudar' dá UM cabeçalho por tipo", () => {
    const secoes = ordenarParaLeitura(entrada, GRUPOS).map(secaoDaPeca);
    const aberturas = secoes.filter((s, i) => i === 0 || secoes[i - 1] !== s);
    expect(aberturas).toEqual(["2X1", "QUADROS 4X3", "PRISMA", "TOTENS"]);
  });

  it("dentro do tipo, o complemento fica colado à peça original (compareDisplayId)", () => {
    // replace(/\D/g,'') fazia "#0062-C1" virar 621 e ir parar depois de #0100.
    const saida = ordenarParaLeitura([peca("#0100", "2X1"), peca("#0062-C1", "2X1"), peca("#0062", "2X1")], {})
      .map((p) => p.displayId);
    expect(saida).toEqual(["#0062", "#0062-C1", "#0100"]);
  });

  it("o Kit vai por último, cada remessa junta", () => {
    const saida = ordenarParaLeitura([peca("#0002", "2X1", "r1"), peca("#0009", "TOTENS"), peca("#0001", "2X1", "r1")], GRUPOS)
      .map((p) => p.displayId);
    expect(saida).toEqual(["#0009", "#0001", "#0002"]);
  });

  it("não mexe na lista de entrada", () => {
    const copia = entrada.map((p) => p.displayId);
    ordenarParaLeitura(entrada, GRUPOS);
    expect(entrada.map((p) => p.displayId)).toEqual(copia);
  });
});

describe("quem garante a ordem está ao lado de quem a consome", () => {
  it("é aplicada nos DOIS agrupamentos — por evento e por patrocinador", () => {
    expect((HOOK.match(/ordenarParaLeitura\(filterItems\(eventItems, event\.name\), typeToGroup\)/g) ?? []).length).toBe(2);
  });

  it("e o agrupador por 'mudou em relação ao anterior' continua — com a garantia apontada ao lado", () => {
    // A seção é o tipo — ou a remessa do Kit, que agrupa as peças do Kit.
    expect(FILA).toContain("const abreTipo = !anterior || secaoDaPeca(anterior) !== secaoDaPeca(item);");
    const i = FILA.indexOf("const abreTipo = !anterior");
    expect(FILA.slice(i - 400, i)).toContain("ordenarParaLeitura");
  });

  it("o memo que monta a lista depende do mapa de grupos", () => {
    // Sem typeToGroup nas dependências, a ordenação por grupo pai usaria o
    // mapa de uma renderização antiga — e a lista piscaria fora de ordem até
    // o próximo filtro.
    expect(HOOK).toContain("eventSponsorMap, sponsors, typeToGroup]);");
  });
});
