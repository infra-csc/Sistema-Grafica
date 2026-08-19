// ─────────────────────────────────────────────────────────────────────────────
// NA ENTREGA, A FOTO É O COMPROVANTE; O NOME É O RECADO.
//
// A regra estava invertida: exigia-se o NOME de quem recebeu e a foto era
// opcional — inclusive no servidor, que devolvia 400 sem `receivedBy` e aceitava
// entrega sem `photoUrl` nenhuma.
//
// Isso troca a prova pela palavra. Nome é texto digitado por quem ENTREGA, e não
// comprova entrega alguma; a foto é o registro que sustenta a conversa quando o
// cliente diz que não recebeu. Invertido a pedido do dono.
//
// A validação vive no SERVIDOR e não só no formulário porque a mesma rota atende
// a entrega em lote e qualquer chamada futura — regra de negócio validada só na
// tela é regra que o próximo caller ignora.
//
// A trilha de auditoria precisou acompanhar: com `receivedBy` opcional, a frase
// "recebido por: undefined" seria pior que não dizer nada.
//
// A regra que fica: campo obrigatório se decide por qual deles PROVA o fato, não
// por qual é mais fácil de preencher.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const rotas = readFileSync(path.resolve(__dirname, "../routes/items.ts"), "utf8");
const grafica = readFileSync(path.resolve(__dirname, "../../client/src/pages/grafica.tsx"), "utf8");

/** O corpo da rota de entrega. */
function rotaDeEntrega(): string {
  const i = rotas.indexOf("const { receivedBy, photoUrl, notes } = req.body;");
  expect(i).toBeGreaterThan(-1);
  return rotas.slice(i, i + 5200);
}

describe("o servidor exige a foto, não o nome", () => {
  it("recusa entrega sem foto", () => {
    expect(rotaDeEntrega()).toContain("if (!photoUrl) {");
    expect(rotaDeEntrega()).toContain('error: "photoUrl is required"');
  });

  it("não recusa mais por falta de nome", () => {
    expect(rotaDeEntrega()).not.toContain('error: "receivedBy is required"');
  });

  it("a trilha funciona sem o nome", () => {
    // Sem isto o log gravaria "recebido por: undefined" na primeira entrega
    // que viesse sem o campo.
    expect(rotaDeEntrega()).toContain('${receivedBy ? `, recebido por: ${receivedBy}` : ""}');
  });
});

describe("a tela exige a foto, nos dois caminhos", () => {
  it("a entrega individual barra sem foto", () => {
    expect(grafica).toContain("if (photos.length === 0) {");
  });

  it("a entrega em LOTE barra sem foto", () => {
    // O lote tem estado próprio de fotos; validar só o individual deixaria a
    // porta aberta pelo caminho que entrega mais peças de uma vez.
    expect(grafica).toContain("if (bulkDeliveryPhotos.length === 0) {");
  });

  it("nenhum dos dois barra mais por falta de nome", () => {
    expect(grafica).not.toContain("if (!deliveryData.receivedBy?.trim()) {");
    expect(grafica).not.toContain("if (!bulkReceivedBy.trim()) {");
  });
});

describe("a tela DIZ qual campo é obrigatório", () => {
  it("a foto da entrega leva o asterisco", () => {
    // Validação que barra sem o rótulo avisar é armadilha: a pessoa preenche
    // tudo o que parece pedido e leva erro no envio.
    expect(grafica).toContain('label="Foto da entrega *"');
    expect(grafica).toContain('"Foto da entrega *"');
  });

  it("o nome perdeu o asterisco e diz que é opcional", () => {
    expect(grafica).not.toContain("Responsável pelo Recebimento *");
    expect(grafica).toContain('placeholder="Nome de quem recebeu (opcional)"');
  });

  it("a foto da conferência continua obrigatória — não era esta a regra mexida", () => {
    expect(grafica).toContain('"Foto da conferência *"');
  });
});
