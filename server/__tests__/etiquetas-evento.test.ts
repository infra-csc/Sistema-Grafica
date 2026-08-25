// ─────────────────────────────────────────────────────────────────────────────
// ETIQUETAS DO EVENTO — o template de colar no material (pedido do dono,
// 24/08, com o PDF do Circuito Vale como modelo).
//
// O que o modelo pede e este arquivo prende: A4 DEITADO com duas etiquetas
// por folha e linha de corte; o nome do evento gigante (é o que se lê de
// longe na pilha); uma peça por etiqueta; e o recorte certo — a etiqueta
// nasce da CONFERÊNCIA, não da lista inteira.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const PAGINA = readFileSync(new URL("../../client/src/pages/etiquetas-evento.tsx", import.meta.url), "utf8");
const APP = readFileSync(new URL("../../client/src/App.tsx", import.meta.url), "utf8");
const DETALHE = readFileSync(new URL("../../client/src/pages/event-detail.tsx", import.meta.url), "utf8");

describe("a página /eventos/:id/etiquetas", () => {
  it("existe na rota, protegida, com a porta no Detalhe do Evento", () => {
    expect(APP).toContain('<Route path="/eventos/:id/etiquetas">');
    expect(APP).toContain("<ProtectedRoute component={EtiquetasEvento} />");
    expect(DETALHE).toContain('data-testid="button-etiquetas-evento"');
  });

  it("A4 deitado, duas por folha, linha de corte, barra fora da impressão", () => {
    expect(PAGINA).toContain("size: A4 landscape");
    expect(PAGINA).toContain("pecas.slice(f * 2, f * 2 + 2)");
    expect(PAGINA).toContain('borderBottom: i === 0 && dupla.length === 2 ? "2px dashed #d6d3d1" : "none"');
    expect(PAGINA).toContain(".etq-acao { display: none !important; }");
    expect(PAGINA).toContain('className="etq-folha"');
    expect(PAGINA).toContain("page-break-after: always;");
  });

  it("abre nas CONFERIDAS — a etiqueta nasce da conferência", () => {
    expect(PAGINA).toContain('const CONFERIDA = new Set(["conferred", "conferido", "delivered", "entregue"]);');
    expect(PAGINA).toContain("(i.conferredQty ?? 0) > 0");
    expect(PAGINA).toContain("const [incluirTodas, setIncluirTodas] = useState(false);");
    // e o vazio explica de onde as etiquetas vêm, em vez de parecer quebrado
    expect(PAGINA).toContain("a etiqueta nasce da conferência");
  });

  it("o nome do evento é o elemento gigante, e a ordem é a da fila", () => {
    expect(PAGINA).toContain('fontSize: "clamp(34px, 5.2vw, 64px)"');
    expect(PAGINA).toContain("compareDisplayId(a.displayId, b.displayId)");
  });

  it("canceladas e excluídas não ganham etiqueta nem no 'incluir todas'", () => {
    expect(PAGINA).toContain('!i.deletedAt && i.status !== "canceled" && i.status !== "archived"');
  });
});
