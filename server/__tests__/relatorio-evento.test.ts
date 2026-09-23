// ─────────────────────────────────────────────────────────────────────────────
// RELATÓRIO DO EVENTO — sugestão 9 da análise de evolução, aprovada 24/08.
//
// O risco de um relatório é ele virar uma SEGUNDA conta das mesmas coisas —
// e desmentir a tela ao lado. As garantias deste arquivo giram todas em
// torno disso: o funil sai da mesma fonte da Gestão de Prazos, o evento
// encerrado não finge funil vivo, e a página imprime sem os botões.
// ─────────────────────────────────────────────────────────────────────────────
// A rota roda agora em regras-avisos-relatorio.test.ts; aqui fica a página.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const PAGINA = readFileSync(new URL("../../client/src/pages/relatorio-evento.tsx", import.meta.url), "utf8");
const APP = readFileSync(new URL("../../client/src/App.tsx", import.meta.url), "utf8");
const DETALHE = readFileSync(new URL("../../client/src/pages/event-detail.tsx", import.meta.url), "utf8");

describe("a página /eventos/:id/relatorio", () => {
  it("existe na rota, protegida como as demais", () => {
    expect(APP).toContain('<Route path="/eventos/:id/relatorio">');
    expect(APP).toContain("<ProtectedRoute component={RelatorioEvento} />");
  });

  it("é documento de imprimir: A4, e as ações somem no papel", () => {
    expect(PAGINA).toContain("@media print");
    expect(PAGINA).toContain(".rel-acao { display: none !important; }");
    expect(PAGINA).toContain("size: A4");
    expect(PAGINA).toContain("window.print()");
  });

  it("o evento encerrado é dito com todas as letras", () => {
    expect(PAGINA).toContain('data-testid="funil-encerrado"');
    expect(PAGINA).toContain("Este evento saiu da gestão de prazos");
  });

  it("as atrasadas são as do MARCO vencido — a régua da Gestão de Prazos", () => {
    expect(PAGINA).toContain('r.prazo.pendingItems.filter((p) => r.prazo!.stages[p.marcoIndex]?.state === "overdue")');
  });

  it("a lista de atrasadas tem teto e o teto é anunciado", () => {
    expect(PAGINA).toContain("atrasadas.slice(0, 25)");
    expect(PAGINA).toContain("a lista completa está na Gestão de Prazos");
  });

  it("a espera respeita a regra do não-sei", () => {
    expect(PAGINA).toContain('p.waitingDays != null ? `${p.waitingDays}d parada` : "—"');
  });

  it("e o Detalhe do Evento tem a porta, para todos os perfis", () => {
    expect(DETALHE).toContain('data-testid="button-relatorio-evento"');
    expect(DETALHE).toContain("/relatorio`)");
  });
});
