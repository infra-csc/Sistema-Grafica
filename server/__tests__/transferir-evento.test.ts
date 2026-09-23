// ─────────────────────────────────────────────────────────────────────────────
// TRANSFERIR DE EVENTO (dono, 11/09: "botão para adm transferir um item de um
// evento para o outro sem mudar o status").
//
// As decisões que este arquivo pina:
//   · SÓ ADMIN — reescrever o dono da peça é decisão de quem responde pela
//     lista inteira, mesma classe do descancelar.
//   · Muda SÓ o eventId. Status, aprovações de patrocinador, fotos e
//     comentários seguem exatamente como estavam — "sem mudar o status" foi
//     lido como "sem mudar nada além do evento".
//   · Barra nos DOIS lados: evento de origem finalizado (reabriria trabalho
//     fechado) e evento de destino finalizado (a peça nasceria invisível pras
//     mesmas filas que já o escondem).
//   · Grava auditoria com o nome dos dois eventos e confirma que o status foi
//     mantido, e recalcula o status dos dois eventos.
//   · O botão vive na FICHA da peça (mesma família da reversão de aprovação e
//     do descancelar), só para admin.
//
// As regras do SERVIDOR rodam a rota de verdade em
// regras-fluxo-transferir-descancelar-clonar.test.ts; aqui fica só a tela.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { fonteDoComponente } from "./fonte-dos-componentes";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const FICHA = fonteDoComponente("client/src/components/item-details-dialog.tsx");

describe("a ficha da peça", () => {
  it("o botão de transferir aparece só para admin", () => {
    expect(FICHA).toContain('user?.role === "admin"');
    expect(FICHA).toContain('data-testid="button-transferir-evento"');
  });

  it("chama a rota certa e avisa que o status foi mantido", () => {
    expect(FICHA).toContain("/transfer-event`");
    expect(FICHA).toContain('title: "Peça transferida",');
    expect(FICHA).toContain("status mantido");
  });
});
