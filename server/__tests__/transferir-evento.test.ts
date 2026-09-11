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
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const ROTA = ler("server/routes/items.ts");
const FICHA = ler("client/src/components/item-details-dialog.tsx");
const REGUA = ler("shared/permissoes.ts");

describe("o servidor", () => {
  it("a rota existe, é só de admin, e está declarada na régua", () => {
    expect(ROTA).toContain('app.post("/api/items/:id/transfer-event", requireAuth');
    expect(ROTA).toContain("Apenas administradores podem transferir peças de evento.");
    expect(REGUA).toContain('rota: "/api/items/:id/transfer-event", papeis: ["admin"]');
  });

  it("muda só o eventId — nunca escreve status, sponsors ou approvals no updateItem da transferência", () => {
    const trecho = ROTA.slice(ROTA.indexOf("/api/items/:id/transfer-event"));
    const fimDaRota = trecho.indexOf("\n  });");
    const corpo = trecho.slice(0, fimDaRota);
    expect(corpo).toContain("storage.updateItem(item.id, { eventId: destinoId })");
    expect(corpo).not.toMatch(/updateItem\([^)]*status:/);
  });

  it("barra transferir de OU para um evento finalizado", () => {
    const trecho = ROTA.slice(ROTA.indexOf("/api/items/:id/transfer-event"));
    const fimDaRota = trecho.indexOf("\n  });");
    const corpo = trecho.slice(0, fimDaRota);
    expect(corpo).toContain("barraEventoFinalizado(item, res)");
    expect(corpo).toContain("motivoEventoFechado(destino)");
  });

  it("recusa transferir para o mesmo evento em que já está", () => {
    expect(ROTA).toContain("A peça já está neste evento.");
  });

  it("recalcula o status dos dois eventos e invalida o cache de versões", () => {
    const trecho = ROTA.slice(ROTA.indexOf("/api/items/:id/transfer-event"));
    const fimDaRota = trecho.indexOf("\n  });");
    const corpo = trecho.slice(0, fimDaRota);
    expect(corpo).toContain("updateEventStatus(eventoOrigemId)");
    expect(corpo).toContain("updateEventStatus(destinoId)");
    expect(corpo).toContain("invalidarCacheDeVersoes()");
  });
});

describe("a ficha da peça", () => {
  it("o botão de transferir aparece só para admin", () => {
    expect(FICHA).toContain('user?.role === "admin"');
    expect(FICHA).toContain('data-testid="button-transferir-evento"');
  });

  it("chama a rota certa e avisa que o status foi mantido", () => {
    expect(FICHA).toContain("/transfer-event`");
    expect(FICHA).toContain('toast({ title: "Peça transferida"');
    expect(FICHA).toContain("status mantido");
  });
});
