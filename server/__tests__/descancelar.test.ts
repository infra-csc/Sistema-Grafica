// ─────────────────────────────────────────────────────────────────────────────
// DESCANCELAR (dono, 01/09: "botão para adm descancelar item e ele voltar no
// fluxo onde estava").
//
// As decisões que este arquivo pina:
//   · SÓ ADMIN — descancelar recoloca trabalho na fila de alguém; é gestão.
//   · O cancelamento agora GRAVA de onde a peça saiu (statusBeforeCancel),
//     no individual e no lote — e cancelar de novo não sobrescreve.
//   · O descancelar restaura em ordem de confiança: coluna → trilha de
//     auditoria ("Status alterado: X → Y") → "requested", sempre dizendo na
//     trilha qual das três fontes valeu.
//   · Evento finalizado barra — mexer ali reescreve número fechado, igual ao
//     cancelamento.
//   · O botão vive na FICHA da peça, só para admin e só em cancelada — a
//     mesma exceção da reversão de aprovação (corrigir lançamento é dado,
//     não atalho de fluxo).
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
  it("o botão aparece só para admin e só em cancelada", () => {
    expect(FICHA).toContain('rawStatus === "canceled" && user?.role === "admin"');
    expect(FICHA).toContain('data-testid="button-descancelar"');
  });

  it("chama a rota certa e conta para onde a peça voltou", () => {
    expect(FICHA).toContain("/uncancel`");
    expect(FICHA).toContain('toast({ title: "Peça descancelada"');
    expect(FICHA).toContain("Voltou para");
  });
});
