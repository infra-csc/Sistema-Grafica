// ─────────────────────────────────────────────────────────────────────────────
// O BACKFILL PELA TRILHA (frente 3 do diagnóstico de 24/08).
//
// O parser é a parte que pode mentir: se ele extrair o rótulo errado de uma
// linha da trilha, o carimbo herdado diria "parada aqui desde D" sobre um D
// de outra etapa. Estes testes rodam o parser contra os FORMATOS REAIS das
// linhas — copiados de server/routes/items.ts, não inventados.
//
// E a regra de segurança fica escrita no código do script: o rótulo-alvo tem
// de bater com o status atual da peça, senão fica NULL.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";

vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({ storage: {} }));

const { alvoDaTransicao } = await import("../../scripts/backfill-status-da-trilha");

describe("o parser contra os formatos reais da trilha", () => {
  it("a forma comum: 'Status alterado: X → Y (contexto)'", () => {
    expect(alvoDaTransicao("Status alterado: Rascunho → Aguardando Envio (enviada à Arte)"))
      .toBe("Aguardando Envio");
    expect(alvoDaTransicao("Status alterado: Aguardando Aprovação → Aguardando Finalização (aprovado pelo patrocinador)"))
      .toBe("Aguardando Finalização");
  });

  it("a forma do /edit: 'Status: X → Y' seguido de outros campos", () => {
    expect(alvoDaTransicao("Status: Aguardando Envio → Aguardando Aprovação; Quantidade: 3 → 5 un."))
      .toBe("Aguardando Aprovação");
  });

  it("devolução com motivo: corta no ponto E no parêntese", () => {
    expect(alvoDaTransicao("Status alterado: Aguardando Revisão Final → Rascunho (devolvida pela Arte ao solicitante). Motivo: medida errada"))
      .toBe("Rascunho");
    expect(alvoDaTransicao("Status alterado: Aguardando Envio → Rascunho (devolvida pela Arte ao solicitante, JÁ FORA DA ARTE). Motivo: refazer"))
      .toBe("Rascunho");
  });

  it("a forma com travessão: 'X → Y — quem precisa aprovar'", () => {
    expect(alvoDaTransicao("Status alterado: Aguardando Finalização → Aguardando Aprovação — Kiss FM precisa aprovar a nova versão"))
      .toBe("Aguardando Aprovação");
  });

  it("linha que não é transição devolve null — nunca um chute", () => {
    expect(alvoDaTransicao("Quantidade: 15 → 10 un.")).toBeNull();
    expect(alvoDaTransicao("Marcado para reaproveitamento")).toBeNull();
    expect(alvoDaTransicao("")).toBeNull();
  });

  it("seta dentro do MOTIVO não engana o parser", () => {
    // O motivo é texto livre; alguém escreve "mudar A → B" e o parser tem de
    // continuar lendo o alvo da TRANSIÇÃO, que vem antes do ". Motivo:".
    expect(alvoDaTransicao("Status alterado: Aguardando Envio → Rascunho (devolvida). Motivo: trocar logo → versão nova"))
      .toBe("Rascunho");
  });
});

describe("as regras de segurança, escritas no script", () => {
  const SCRIPT = readFileSync(new URL("../../scripts/backfill-status-da-trilha.ts", import.meta.url), "utf8");

  it("o alvo tem de bater com o status ATUAL — divergência fica NULL", () => {
    expect(SCRIPT).toContain("if (alvo === atual) decisao.set(l.entityId, l.createdAt);");
    expect(SCRIPT).toContain("andou sem rastro, fica NULL");
  });

  it("só a transição MAIS RECENTE de cada peça decide", () => {
    expect(SCRIPT).toContain("if (decisao.has(l.entityId) || rejeitadas.has(l.entityId)) continue;");
    expect(SCRIPT).toContain("DESC");
  });

  it("o UPDATE repete o IS NULL — nunca sobrescreve um carimbo melhor", () => {
    expect(SCRIPT).toContain("WHERE id = ${id} AND status_changed_at IS NULL");
  });

  it("compara com o MESMO tradutor que escreveu a linha", () => {
    expect(SCRIPT).toContain('import { translateStatus } from "../server/routes/shared";');
  });

  it("é ensaio por padrão: só grava com --aplicar", () => {
    expect(SCRIPT).toContain('const aplicar = process.argv.includes("--aplicar");');
  });
});
