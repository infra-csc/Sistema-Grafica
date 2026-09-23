// Envio de thumbs em lote: com muitos arquivos a lista ROLA — os cartões não
// podem encolher (eram espremidos em tirinhas com 20+ arquivos; dono, 21/09).
import { describe, it, expect } from "vitest";
import { fonteDaArte } from "./fonte-das-telas-da-arte";

// O modal mora em components/arte/dialogo-thumbs-em-lote.tsx e o cartão em
// cartao-thumb-em-lote.tsx — o texto da tela inteira cobre os dois.
const ARTE = fonteDaArte();

describe("lista do envio de thumbs em lote", () => {
  it("o cartão de cada arquivo não encolhe e tem altura mínima", () => {
    const i = ARTE.indexOf("data-testid={`bulk-thumb-card-${entry.id}`}");
    expect(i).toBeGreaterThan(0);
    expect(ARTE.slice(i, i + 700)).toContain("flexShrink: 0, minHeight: 80,");
  });
  it("a lista é quem rola", () => {
    expect(ARTE).toContain("<div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>");
  });
});
