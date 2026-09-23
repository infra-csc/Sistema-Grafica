// ─────────────────────────────────────────────────────────────────────────────
// MAIS DE UMA imagem de referência por peça (pedido do dono, 25/08).
//
// O desenho que este arquivo prende: a lista completa vive em
// items.referenceUrls; referenceUrl continua sendo A PRIMEIRA da lista, para
// as telas de miniatura única (arte, gráfica, atendimento, painel, revisão,
// vincular) não mudarem. O PATCH mantém os dois campos SEMPRE em sincronia —
// nos dois sentidos — senão uma troca pelo caminho antigo deixaria a lista
// mostrando as imagens de antes.
// ─────────────────────────────────────────────────────────────────────────────
// A coluna e o PATCH (sincronia nos dois sentidos) rodam em regras-avisos-edicao-da-peca.test.ts.
import { describe, it, expect } from "vitest";
import { fonteDaTela } from "./fonte-da-tela";
import { fonteDoComponente } from "./fonte-dos-componentes";
import { readFileSync } from "fs";
import path from "path";

const raiz = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const HELPER = raiz("client/src/lib/refs-da-peca.ts");
const DETALHE = fonteDaTela("detalhe-do-evento");
const FICHA = fonteDoComponente("client/src/components/item-details-dialog.tsx");
const HOOK = raiz("client/src/hooks/use-event-reference.ts");

describe("o desenho: lista na peça, primeira no campo antigo", () => {
  it("a leitura tem UMA porta: refsDaPeca (lista, com o campo antigo de reserva)", () => {
    expect(HELPER).toContain("if (lista.length > 0) return lista;");
    expect(HELPER).toContain('return item.referenceUrl ? [item.referenceUrl] : [];');
  });
});

describe("as telas", () => {
  it("no Detalhe do Evento o clipe ADICIONA (não troca) e cada miniatura tem o seu ×", () => {
    // os dois pontos (cartão mobile e tabela) usam a lista
    expect((DETALHE.match(/refsDaPeca\(item\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(DETALHE).toContain("referenceUrls: [...refs, url]");
    expect(DETALHE).toContain("referenceUrls: refs.filter((_, j) => j !== k)");
    // testids antigos preservados na PRIMEIRA miniatura
    expect(DETALHE).toContain("`link-reference-${item.id}`");
    expect(DETALHE).toContain("`link-reference-table-${item.id}`");
  });

  it("a ficha mostra todas: a primeira grande, as demais em miniaturas", () => {
    expect(FICHA).toContain("const refs = refsDaPeca(item);");
    expect(FICHA).toContain("refs.slice(1).map((u, k) =>");
    expect(FICHA).toContain('data-testid={`link-referencia-${k + 2}`}');
    expect(FICHA).toContain("`Referências do solicitante (${refs.length})`");
  });

  it("o hook grava a lista inteira; lista vazia = remover", () => {
    expect(HOOK).toContain("const salvarReferenciasMutation = useMutation({");
    expect(HOOK).toContain('referenceUrls.length === 0 ? "Referência removida" : "Referências salvas"');
  });
});
