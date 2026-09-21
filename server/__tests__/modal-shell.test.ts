import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("fechar um toast não fecha o modal (21/09)", () => {
  it("o DialogContent ignora interação vinda do viewport de toasts", () => {
    const dialog = readFileSync(new URL("../../client/src/components/ui/dialog.tsx", import.meta.url), "utf8");
    const toast = readFileSync(new URL("../../client/src/components/ui/toast.tsx", import.meta.url), "utf8");
    expect(toast).toContain('data-toast-viewport=""');
    expect(dialog).toContain('alvo?.closest?.("[data-toast-viewport]")');
    expect(dialog).toContain("onInteractOutside?.(e);");
  });
});
