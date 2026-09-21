// ─────────────────────────────────────────────────────────────────────────────
// CONFERÊNCIA EM LOTE POR TUBO (dono, 14/09): "a conferência de lote tem que
// servir e explicar que vai ser por tubo".
//
// O que este arquivo pina:
//   · a barra do lote não diz mais "Sel. 1" (lia como "1 selecionada" com nada
//     selecionado, e o Confirmar parecia quebrado);
//   · o dialog de conferência em lote escolhe o tubo e explica que a entrega é
//     por tubo;
//   · conferidas, as peças entram no tubo — um por evento quando o lote mistura
//     eventos —, e falhar no tubo não desfaz a conferência.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const GRAFICA = readFileSync(path.resolve(__dirname, "../../client/src/pages/grafica.tsx"), "utf8");

describe("a barra do lote", () => {
  it("diz 'Selecionar todas (N)' e explica o que tocar", () => {
    expect(GRAFICA).toContain("`Selecionar todas (${bulkEligibleList.length})`");
    expect(GRAFICA).not.toContain("`Sel. ${bulkEligibleList.length}`");
    expect(GRAFICA).toContain("'Toque nas peças em acabamento para conferir'");
  });
});

describe("o dialog da conferência em lote", () => {
  it("escolhe o tubo e explica que a entrega é por tubo", () => {
    expect(GRAFICA).toContain('data-testid="seletor-tubo-lote"');
    expect(GRAFICA).toContain('data-testid="aviso-entrega-por-tubo"');
    expect(GRAFICA).toContain("<strong>A entrega é por tubo.</strong>");
  });

  it("lote de vários eventos: um tubo novo por evento; de um evento: tubos abertos dele", () => {
    expect(GRAFICA).toContain("`Um tubo novo por evento (${tubo.eventos.length})`");
    expect(GRAFICA).toContain(".filter((t) => !t.entregueEm)");
  });

  it("conferir não obriga a agrupar: o padrão é 'Sem tubo agora', primeira opção", () => {
    expect(GRAFICA).toContain('const [tuboDoLote, setTuboDoLote] = useState<string>("");');
    expect(GRAFICA).toContain('[{ valor: "", rotulo: "Sem tubo agora" }, { valor: "novo",');
    expect(GRAFICA).toContain("Pode conferir agora e pôr no tubo depois, no botão Tubos do evento.");
  });
});

describe("ao confirmar", () => {
  const handler = GRAFICA.slice(GRAFICA.indexOf("const handleBulkConference = async"), GRAFICA.indexOf("const handleBulkDelivery = async"));

  it("põe as conferidas no tubo, agrupando por evento", () => {
    expect(handler).toContain("const porEvento = new Map<string, string[]>();");
    expect(handler).toContain('await apiRequest("POST", `/api/events/${eventoId}/tubos`, { itemIds: idsDoEvento })');
    expect(handler).toContain('await apiRequest("PATCH", `/api/tubos/${tuboDoLote}/itens`, { adicionar: idsDoEvento })');
    expect(handler).toContain('const usarTuboAberto = tuboDoLote !== "novo" && porEvento.size === 1;');
  });

  it("só as que conferiram vão para o tubo, e falhar no tubo não desfaz a conferência", () => {
    expect(handler).toContain("if (!okIds.includes(it.id) || !it.eventId) continue;");
    expect(handler).toContain("Conferidas, mas não entraram no tubo");
  });

  it("o toast final lembra que a entrega é por tubo", () => {
    expect(handler).toContain("A entrega é por tubo, no botão Tubos do evento.");
  });
});
