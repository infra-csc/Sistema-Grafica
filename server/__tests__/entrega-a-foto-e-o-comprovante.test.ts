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

// A ENTREGA POR PEÇA FOI APOSENTADA (dono, 21/09: "todas são embaladas" + "tem que
// colocar as quantidades"): quem entrega é o volume (tubo ou embalagem avulsa),
// em routes/tubos.ts — obrigatório é quem recebeu; a foto veio de antes (a da
// conferência e a do embalar). A rota por peça responde 409 para qualquer peça.
describe("a entrega por peça está aposentada", () => {
  const i = rotas.indexOf('app.patch("/api/items/:id/deliver"');
  const rota = rotas.slice(i, i + 900);
  it("responde 409 que ensina, sem escrever nada", () => {
    expect(i).toBeGreaterThan(-1);
    expect(rota).toContain('return res.status(409).json({ error: "Embale antes de entregar (Embalar pede a foto; a entrega pede só quem recebeu)" });');
    expect(rota).not.toContain("updateItem");
    expect(rota).not.toContain("photoUrl is required");
  });
});

// A TELA DA GRÁFICA não tem mais entrega por peça (nem individual, nem em lote,
// nem fila do galpão): o código dormente saiu. A entrega é a do volume, na aba
// e no painel de tubos. A conferência continua pedindo a foto.
describe("a tela da Gráfica sem a entrega por peça", () => {
  it("nenhum formulário, lote ou mutação de entrega por peça sobrou", () => {
    for (const morto of ["handleSubmitDelivery", "handleBulkDelivery", "bulkDeliveryPhotos", "markDeliveredMutation", 'label="Foto da entrega *"', "Responsável pelo Recebimento"]) {
      expect(grafica, morto).not.toContain(morto);
    }
  });

  it("a foto da conferência continua obrigatória (individual e lote)", () => {
    expect(grafica).toContain('label="Foto da conferência *"');
    expect(grafica).toContain("const canSubmit = photos.length > 0;");
    expect(grafica).toContain('"Anexe ao menos uma foto para confirmar a conferência."');
  });
});
