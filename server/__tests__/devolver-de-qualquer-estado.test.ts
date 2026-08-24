// ─────────────────────────────────────────────────────────────────────────────
// A ARTE DEVOLVE DE QUALQUER ESTADO (decisão do dono, 24/08).
//
// Antes, `arte-reject` só aceitava cinco status pré-produção: depois que a
// Gráfica encostava na peça, a Arte não conseguia mais mandá-la de volta e
// precisava chamar um admin — justamente no caso em que devolver mais importa,
// o arquivo errado descoberto depois da produção.
//
// A objeção que sustentava a trava não era falsa, e é por isso que este arquivo
// existe: devolver uma peça que já saiu da mesa da Arte TIRA UMA LINHA DA FILA
// de outra equipe. A regra nova é deliberada, não um descuido — e o que a torna
// defensável são as três coisas testadas aqui:
//
//  1. o rascunho continua recusado (devolver o que já está na criação não muda
//     nada e ainda zeraria os campos de aprovação);
//  2. nada de produção é apagado — o status volta, o histórico fica;
//  3. a trilha MARCA quando a peça veio de depois da Arte, senão ninguém
//     entende, semanas depois, por que a fila da Gráfica perdeu uma linha.
//
// Se algum dia a trava voltar, que volte por decisão — não por alguém achar
// que o limite de cinco status tinha sumido por engano.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const ITEMS = readFileSync(new URL("../routes/items.ts", import.meta.url), "utf8");
const ARTE = readFileSync(new URL("../../client/src/pages/arte.tsx", import.meta.url), "utf8");

/** O corpo da rota, para as asserções não pegarem outra rota por engano. */
const ROTA = (() => {
  const i = ITEMS.indexOf('app.patch("/api/items/:id/arte-reject"');
  expect(i).toBeGreaterThan(-1);
  const j = ITEMS.indexOf('  app.patch("/api/items/', i + 10);
  return ITEMS.slice(i, j > 0 ? j : i + 4000);
})();

describe("o servidor aceita a devolução de qualquer estado", () => {
  it("a lista de cinco status pré-produção não está mais no caminho", () => {
    expect(ROTA).not.toContain("ANTES_DA_PRODUCAO");
    expect(ROTA).not.toContain("devolver para rascunho só vale antes da produção");
  });

  it("o rascunho continua recusado — não há para onde devolver", () => {
    expect(ROTA).toContain('if (currentItem.status === "draft") {');
    expect(ROTA).toContain("Esta peça já está na criação (Rascunho) — não há para onde devolver.");
    expect(ROTA).toContain("res.status(409)");
  });

  it("o papel não mudou: continua Arte e admin", () => {
    expect(ROTA).toContain('req.userRole !== "arte" && req.userRole !== "admin"');
  });

  it("evento finalizado continua barrando — é outra regra, e ela fica", () => {
    expect(ROTA).toContain("if (await barraEventoFinalizado(currentItem, res)) return;");
  });

  it("nada de produção é apagado: o reset zera só aprovação e revisão", () => {
    // Se um dia alguém acrescentar producedAt/deliveredAt a esta lista, a peça
    // devolvida passaria a mentir sobre trabalho que existiu de verdade.
    const i = ROTA.indexOf('status: "draft",');
    const reset = ROTA.slice(i, ROTA.indexOf("});", i));
    for (const campo of ["sponsorApprovedBy", "sponsorApprovedAt", "creatorReviewedAt", "rejectedBySponsor", "rejectedByCreator"]) {
      expect(reset).toContain(campo);
    }
    for (const proibido of ["producedAt", "deliveredAt", "productionStartedAt", "conferredAt"]) {
      expect(reset).not.toContain(proibido);
    }
  });

  it("a trilha marca quando a peça veio de DEPOIS da Arte", () => {
    // A lista mora em shared/fluxo-peca.ts (ver o teste do dono único).
    expect(ROTA).toContain('DEPOIS_DA_ARTE.has(currentItem.status) ? ", JÁ FORA DA ARTE" : ""');
  });
});

describe("a tela da Arte oferece o mesmo que a rota aceita", () => {
  it("o botão aparece em tudo menos no rascunho", () => {
    expect(ARTE).toContain("const podeDevolver = podeEditar && !naoDevolvivel(item.status);");
    expect(ARTE).not.toContain("DEVOLVIVEIS");
  });

  it("e o diálogo AVISA antes do clique quando a peça já saiu da Arte", () => {
    // Oferecer a ação sem dizer a consequência seria trocar uma trava por uma
    // armadilha: quem clica precisa saber que some da fila de outra equipe.
    expect(ARTE).toContain("DEPOIS_DA_ARTE.has(devolverItem.status)");
    expect(ARTE).toContain("ela já saiu da mesa da Arte");
    expect(ARTE).toContain("o que já foi produzido continua produzido");
  });

  it("a lista de 'depois da Arte' tem UM dono: shared/fluxo-peca.ts", () => {
    // Este teste substituiu um que comparava duas cópias da lista — sintoma,
    // não solução: pegava a divergência depois de escrita. Agora ela é
    // inescrevível: os dois lados importam do mesmo lugar, e declarar a lista
    // de novo em qualquer um deles é o que quebra aqui.
    const SHARED = readFileSync(new URL("../../shared/fluxo-peca.ts", import.meta.url), "utf8");
    expect(SHARED).toContain('export const DEPOIS_DA_ARTE');
    // O import pode crescer (EM_REVISAO entrou em 24/08) — o que importa é a
    // lista vir de shared, não a forma exata da linha.
    expect(ITEMS).toMatch(/import \{ DEPOIS_DA_ARTE[^}]*\} from "@shared\/fluxo-peca";/);
    expect(ARTE).toContain('import { DEPOIS_DA_ARTE, naoDevolvivel } from "@shared/fluxo-peca";');
    expect(ITEMS).not.toContain("const DEPOIS_DA_ARTE = new Set");
    expect(ARTE).not.toContain("const DEPOIS_DA_ARTE = new Set");
    for (const st of ["inProduction", "delivered", "canceled"]) {
      expect(SHARED).toContain('"' + st + '"');
    }
  });
});
