// ─────────────────────────────────────────────────────────────────────────────
// "CARREGANDO" NÃO É "NÃO ENCONTREI NADA".
//
// O defeito que este arquivo existe para impedir, contado uma vez:
//
// Abrindo o Painel Geral em produção, com 3.187 peças a caminho, a tela dizia
// "0 peças encontradas" enquanto os skeletons rodavam logo abaixo. O contador
// lia `filteredItems.length` sem nenhuma guarda de `isLoading`, e zero é o
// tamanho de um array que ainda não chegou.
//
// O agravante está na acessibilidade: esse contador é `role="status"` com
// `aria-live="polite"`. Ele não só mostrava o zero — ANUNCIAVA. Quem navega por
// leitor de tela recebia "0 peças encontradas" como fato, sem o skeleton para
// contradizer, e não tinha motivo para esperar.
//
// Junto ia o convite para "mostrar os 13 status sem peça": durante a carga
// TODOS os status estão zerados, então o link oferecia revelar um vazio que era
// temporário.
//
// A regra que fica: estado de carga e estado vazio são coisas diferentes, e
// quem tem `aria-live` tem de distinguir os dois — senão a tela afirma, em voz
// alta, uma coisa que não sabe.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const painel = readFileSync(path.resolve(__dirname, "../../client/src/pages/painel-geral.tsx"), "utf8");

describe("Painel Geral: carga e vazio são estados distintos", () => {
  it("o contador tem um ramo de carregamento", () => {
    expect(painel).toContain("Carregando peças…");
  });

  it("a contagem só aparece depois que os dados chegam", () => {
    // O `filteredItems.length` do contador tem de estar DENTRO do ramo de
    // dados prontos — é isso que impede o zero de ser anunciado.
    const i = painel.indexOf("data-testid=\"painel-contador\"");
    const trecho = painel.slice(i, i + 2000);
    const guarda = trecho.indexOf("{isLoading ? (");
    const contagem = trecho.indexOf("{filteredItems.length}");
    expect(guarda).toBeGreaterThan(-1);
    expect(contagem).toBeGreaterThan(guarda);
  });

  it("o contador continua sendo anunciado por leitor de tela", () => {
    // A correção não pode ter sido remover o aria-live: o anúncio a cada
    // mudança de filtro é a razão de o elemento existir.
    const i = painel.indexOf("data-testid=\"painel-contador\"");
    const antes = painel.slice(Math.max(0, i - 400), i);
    expect(antes).toContain('role="status"');
    expect(antes).toContain('aria-live="polite"');
  });

  it("o link dos status zerados não aparece durante a carga", () => {
    expect(painel).toContain("{!isLoading && (escondidos > 0 || showAllKpis) && (");
  });
});
