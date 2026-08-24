// ─────────────────────────────────────────────────────────────────────────────
// RELATÓRIO DO EVENTO — sugestão 9 da análise de evolução, aprovada 24/08.
//
// O risco de um relatório é ele virar uma SEGUNDA conta das mesmas coisas —
// e desmentir a tela ao lado. As garantias deste arquivo giram todas em
// torno disso: o funil sai da mesma fonte da Gestão de Prazos, o evento
// encerrado não finge funil vivo, e a página imprime sem os botões.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";

vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({ storage: {} }));

const { RELATORIO_MAX_FOTOS } = await import("../routes/relatorio");

const ROTA = readFileSync(new URL("../routes/relatorio.ts", import.meta.url), "utf8");
const PAGINA = readFileSync(new URL("../../client/src/pages/relatorio-evento.tsx", import.meta.url), "utf8");
const APP = readFileSync(new URL("../../client/src/App.tsx", import.meta.url), "utf8");
const DETALHE = readFileSync(new URL("../../client/src/pages/event-detail.tsx", import.meta.url), "utf8");

describe("a rota /api/events/:id/relatorio", () => {
  it("o funil sai de buildEventPrazo — a MESMA fonte da Gestão de Prazos", () => {
    expect(ROTA).toContain("const prazo = buildEventPrazo(event as any, itens as any[], {");
    // nenhuma segunda conta de funil no arquivo
    expect(ROTA).not.toContain("STATUS_STAGE_RANK");
    expect(ROTA).not.toContain("STAGE_DEFS");
  });

  it("evento fora da gestão de prazos devolve prazo null — sem funil de mentira", () => {
    // buildEventPrazo devolve null para evento entregue/encerrado; a rota
    // repassa como está, e os totais continuam calculados fora dele.
    expect(ROTA).toContain("const vivas = itens.filter((i: any) => !OUT_OF_FUNNEL.has(i.status));");
    expect(ROTA).toContain("DELIVERED.has(i.status)");
  });

  it("as aprovações separam com quem está a bola — patrocinador vs Arte", () => {
    expect(ROTA).toContain("if (SPONSOR_TURN.has(ap.status)) linha.comPatrocinador += 1; else linha.comArte += 1;");
    // só as peças DESTE evento entram na conta
    expect(ROTA).toContain("if (!idsDoEvento.has(ap.itemId)) continue;");
  });

  it("fotos são resumo, não galeria", () => {
    expect(RELATORIO_MAX_FOTOS).toBe(8);
    expect(ROTA).toContain(".slice(0, RELATORIO_MAX_FOTOS)");
  });

  it("leitura para qualquer logado, como o Detalhe que o alimenta", () => {
    expect(ROTA).toContain('app.get("/api/events/:id/relatorio", requireAuth,');
    expect(ROTA).not.toContain("requireRole");
  });

  it("o rodapé de autoria viaja: gerado quando e por quem", () => {
    expect(ROTA).toContain('gerado: { em: new Date().toISOString(), por: req.userName ?? "Sistema" }');
  });
});

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
