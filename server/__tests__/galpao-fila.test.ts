// ─────────────────────────────────────────────────────────────────────────────
// MODO GALPÃO — sugestão 19 da análise de evolução, prioridade do dono:
// "a Gráfica usa muito o celular, tem que ser bem bom no mobile".
//
// O desenho inteiro é sobre toques: [câmera] → [confirmar], e a fila avança
// sozinha. Estes testes prendem as decisões que fazem os dois toques valerem
// — e as que impedem o modo de virar uma segunda tela da Gráfica.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const FILA = readFileSync(new URL("../../client/src/components/galpao-fila.tsx", import.meta.url), "utf8");
const GRAFICA = readFileSync(new URL("../../client/src/pages/grafica.tsx", import.meta.url), "utf8");
const UPLOADER = readFileSync(new URL("../../client/src/components/ObjectUploader.tsx", import.meta.url), "utf8");

describe("os dois toques", () => {
  it("a câmera é nativa: capture=environment no input de arquivo", () => {
    expect(FILA).toContain("<ObjectUploader capture");
    expect(UPLOADER).toContain('capture: "environment"');
  });

  it("a quantidade já vem preenchida com o saldo — e da MESMA conta da lista", () => {
    expect(FILA).toContain('import { remainingConfer } from "@/lib/saldo";');
    expect(FILA).toContain("if (item && isConfer) setQty(remainingConfer(item));");
  });

  it("confirmar avança sozinho; a última peça fecha com o total certo", () => {
    expect(FILA).toContain("const totalFeitas = feitas + 1;");
    expect(FILA).toContain("avancar(totalFeitas);");
    expect(FILA).toContain("else onClose(totalFeitas);");
  });

  it("a foto é obrigatória e o botão DIZ o que falta, em vez de só desabilitar", () => {
    expect(FILA).toContain('disabled={!foto || enviando}');
    expect(FILA).toContain('"Falta a foto"');
  });

  it("alvos de galpão: botão de confirmar com 56px, stepper com 52", () => {
    expect(FILA).toContain("flex: 1, height: 56");
    expect(FILA).toContain("width: 52, height: 52");
  });
});

describe("a fila não engana", () => {
  it("é a foto do momento de abertura — confirmar não remove peça sob o dedo", () => {
    expect(FILA).toContain("const filaRef = useRef<any[]>(itens);");
  });

  it("cada peça nova zera foto e erro; o nome de quem recebe ATRAVESSA as peças", () => {
    expect(FILA).toContain("setFoto(null);");
    expect(FILA).toContain("// Quem recebe assina o caminhão inteiro — o nome atravessa as peças.");
    // receivedBy não aparece no reset por peça
    const reset = FILA.slice(FILA.indexOf("Cada peça nova zera"), FILA.indexOf("if (!item) return null;"));
    expect(reset).not.toContain("setReceivedBy");
  });

  it("o erro fica na tela, colado no botão — não em toast", () => {
    expect(FILA).toContain('data-testid="galpao-erro" role="alert"');
    expect(FILA).toContain('setErro(e?.message ??');
  });

  it("a ordem é a da lista da Gráfica — nenhuma segunda ordenação", () => {
    expect(FILA).not.toContain(".sort(");
    expect(GRAFICA).toContain('itens={galpao === "confer" ? conferableInFilter : deliverableInFilter}');
  });
});

describe("a costura na tela da Gráfica", () => {
  it("entra pelos botões de fila, só no celular, com os MESMOS gates do lote", () => {
    expect(GRAFICA).toContain('data-testid="button-fila-conferir"');
    expect(GRAFICA).toContain('data-testid="button-fila-entregar"');
    expect(GRAFICA).toContain('{isMobile && podeConferir && conferableInFilter.length > 0 && !bulkOn && (');
    expect(GRAFICA).toContain('{isMobile && deliverableInFilter.length > 0 && !bulkOn && (');
  });

  it("as chamadas usam as rotas reais, com os campos que elas leem", () => {
    expect(GRAFICA).toContain("conferencePhotoUrl: dados.photoUrl, qty: dados.qty, notes: \"\",");
    expect(GRAFICA).toContain("photoUrl: dados.photoUrl, receivedBy: dados.receivedBy ?? \"\", notes: \"\",");
  });

  it("invalidação POR PEÇA — o computador da bancada vê a fila andar", () => {
    const i = GRAFICA.indexOf("const registrarNoGalpao");
    const corpo = GRAFICA.slice(i, GRAFICA.indexOf("const fecharGalpao"));
    expect(corpo).toContain('queryClient.invalidateQueries({ queryKey: ["/api/items"] });');
  });

  it("um resumo só na saída, não um toast por peça", () => {
    expect(GRAFICA).toContain("pela fila.");
    // e as useMutation dos modais não são reusadas aqui
    const i = GRAFICA.indexOf("const registrarNoGalpao");
    const corpo = GRAFICA.slice(i, GRAFICA.indexOf("const fecharGalpao"));
    expect(corpo).not.toContain("conferMutation");
    expect(corpo).not.toContain("markDeliveredMutation");
  });
});
