// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// O ATENDIMENTO NO CELULAR E NO DESKTOP (revisão de design/UX, 29/09).
//
// jsdom não faz layout: as regras aqui são ESTRUTURAIS — o estilo declarado
// (letra ≥ 12 no toque, alvo de 44, rodapé fixo com recorte seguro), a ORDEM
// das partes no modal empilhado e o que cada estado mostra. O que depende de
// medida real (a primeira peça acima da dobra em 390×844, nada vazando em 360)
// foi conferido ao vivo.
//
//   · PLACAR (celular): grade 2×2 com o número ao lado do rótulo; a frase de
//     apoio vai para leitor de tela; letra ≥ 12.
//   · LINHA DA PEÇA (toque): nada abaixo de 12px; a "versão nova" ganha ícone
//     e a ação principal; no celular a linha é uma grade (miniatura +
//     identidade em cima, o resto em largura cheia).
//   · MODAL (empilhado): arte → decisão → detalhes, e o rodapé da fila FIXO
//     fora da rolagem, com o recorte seguro; o "Fechar" só aparece nele quando
//     é a única saída.
//   · DECISÃO: Reprovar/Aprovar são o <Botao> da casa; a versão nova lembra o
//     pedido da reprovação anterior (ou a aprovação anterior).
//   · ABAS: Pendentes/Histórico são o <Abas> da casa, com id e aria-controls.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";

const h = React.createElement;
vi.setConfig({ testTimeout: 60_000 });

afterEach(() => { cleanup(); });

const px = (v: string) => { const m = /^(\d+(?:\.\d+)?)px$/.exec(v); return m ? Number(m[1]) : NaN; };
const tid = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../client/src", rel), "utf8");

/** Todo texto com letra declarada inline abaixo de 12px dentro de `raiz`. */
function letrasPequenas(raiz: Element): string[] {
  const achados: string[] = [];
  raiz.querySelectorAll<HTMLElement>("*").forEach((el) => {
    if (el.closest(".sr-only")) return;
    const fs = px(el.style.fontSize);
    if (!Number.isNaN(fs) && fs < 12 && (el.textContent ?? "").trim()) achados.push(`${fs}px "${(el.textContent ?? "").trim().slice(0, 40)}"`);
  });
  return achados;
}

const DIA = 86_400_000;
const iso = (d: number) => new Date(Date.now() + d * DIA).toISOString();
const peca = (over: Record<string, unknown> = {}) => ({
  id: "p1", displayId: "#0036", eventId: "e1", type: "Backdrop", description: "Backdrop de pódio 3×2 com patrocinadores",
  quantity: 1, status: "awaiting_sponsor_approval", skipApproval: false, approvalThumbUrl: "/objects/t.png",
  approvalThumbUpdatedAt: iso(-1), finalFileUrl: null, referenceUrl: null, isReuse: false, kitRemessaId: null,
  createdAt: iso(-10), updatedAt: iso(-1), statusChangedAt: iso(-2),
  ...over,
}) as any;
const mutacao = () => ({ isPending: false, mutate: vi.fn() }) as any;

describe("placar no celular", () => {
  it("grade 2×2, número ao lado do rótulo, apoio para leitor de tela, nada abaixo de 12px", async () => {
    const { PlacarDeSituacao } = await import("@/components/atendimento/placar-de-situacao");
    render(h(PlacarDeSituacao, {
      cards: true, contagemSituacao: new Map([["nova_versao", 3], ["aguardando", 13], ["aguardando_arte", 1]]),
      situacaoFilter: [], alternarSituacao: () => {}, atrasadosNaBase: [1, 2], atrasadosFilter: false,
      setAtrasadosFilter: () => {}, loadingSponsors: false,
    }));
    const celula = tid("placar-nova-versao")!;
    expect(celula.style.display).toBe("flex");
    expect(celula.parentElement!.style.gridTemplateColumns).toContain("repeat(2");
    expect(celula.querySelector(".sr-only")?.textContent).toContain("A Arte corrigiu");
    expect(letrasPequenas(celula.parentElement!)).toEqual([]);
  });

  it("a célula ligada diz que está ligada por aria-pressed, não só pela cor", async () => {
    const { PlacarDeSituacao } = await import("@/components/atendimento/placar-de-situacao");
    render(h(PlacarDeSituacao, {
      cards: false, contagemSituacao: new Map(), situacaoFilter: ["aguardando"], alternarSituacao: () => {},
      atrasadosNaBase: [], atrasadosFilter: true, setAtrasadosFilter: () => {}, loadingSponsors: false,
    }));
    expect(tid("placar-aguardando")!.getAttribute("aria-pressed")).toBe("true");
    expect(tid("placar-atrasados")!.getAttribute("aria-pressed")).toBe("true");
    expect(tid("placar-nova-versao")!.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("a linha da peça", () => {
  const props = (over: Record<string, unknown> = {}) => ({
    item: peca(), prevItem: null,
    itemApprovalsMap: { p1: [{ itemId: "p1", sponsorId: "s1", status: "new_version_pending" }] } as any,
    typeToGroup: {}, isItemFullyApproved: () => false,
    sponsorsWithStatus: () => [{ id: "s1", name: "Banco Aurora", status: "pending" }] as any,
    quemFalta: () => ["Banco Aurora"], handleViewDetails: vi.fn(), loadingSponsors: false,
    cards: true, tamBotao: "toque" as const, agora: Date.now(), toque: true, ...over,
  });

  it("no toque, nada abaixo de 12px", async () => {
    const { CartaoDaPeca } = await import("@/components/atendimento/cartao-da-peca");
    const { container } = render(h(CartaoDaPeca, props()));
    expect(letrasPequenas(container)).toEqual([]);
  });

  it("no celular é uma grade: miniatura + identidade em cima, o resto em largura cheia", async () => {
    const { CartaoDaPeca } = await import("@/components/atendimento/cartao-da-peca");
    render(h(CartaoDaPeca, props()));
    const grade = tid("row-item-p1")!.firstElementChild as HTMLElement;
    expect(grade.style.display).toBe("grid");
    expect(grade.style.gridTemplateAreas).toContain('"acao acao"');
    // a ação principal em linha inteira
    expect(tid("button-view-p1")!.style.width).toBe("100%");
  });

  it("versão nova: ícone na situação e 'Revisar agora' como ação principal", async () => {
    const { CartaoDaPeca } = await import("@/components/atendimento/cartao-da-peca");
    render(h(CartaoDaPeca, props({ cards: false, toque: false, tamBotao: "md" })));
    expect(tid("situacao-p1")!.querySelector("svg")).not.toBeNull();
    expect(tid("situacao-p1")!.textContent).toContain("Nova versão para aprovar");
    expect(tid("button-view-p1")!.textContent).toContain("Revisar agora");
  });
});

describe("a decisão de um patrocinador", () => {
  const props = (status: string, over: Record<string, unknown> = {}) => ({
    sponsor: { id: "s1", name: "Banco Aurora" } as any,
    sponsorApprovals: [{ itemId: "p1", sponsorId: "s1", status, rejectionReason: "Logo na versão antiga — usar o manual 2026", rejectedAt: iso(-2), ...over }] as any,
    selectedItem: peca(), user: { role: "atendimento" }, canDecide: true, isMobile: true, dedo: true, tamBotao: "toque" as const,
    rejectingSponsorId: null, setRejectingSponsorId: vi.fn(), rejectionReason: "", setRejectionReason: vi.fn(),
    pecaRecemAberta: false, decisaoTravada: () => false, setConfirmApproveIndividual: vi.fn(), setDesvincularAlvo: vi.fn(),
    acoes: { individualApproveMutation: mutacao(), individualRejectMutation: mutacao(), revertApprovalMutation: mutacao(), desvincularSponsorMutation: mutacao() },
  });

  it("Reprovar e Aprovar são o <Botao> da casa, lado a lado no celular, com alvo de 44", async () => {
    const { LinhaDeDecisao } = await import("@/components/atendimento/linha-de-decisao");
    render(h(LinhaDeDecisao, props("pending")));
    for (const b of [tid("button-reject-sponsor-s1")!, tid("button-approve-sponsor-s1")!]) {
      expect(b.className).toContain("ds-botao");
      expect(px(b.style.minHeight)).toBeGreaterThanOrEqual(44);
      expect(b.style.flex).toBe("1 1 0%");
    }
    expect(tid("button-reject-sponsor-s1")!.getAttribute("aria-label")).toBe("Reprovar para Banco Aurora");
  });

  it("versão nova lembra O QUE foi pedido na reprovação anterior", async () => {
    const { LinhaDeDecisao } = await import("@/components/atendimento/linha-de-decisao");
    render(h(LinhaDeDecisao, props("new_version_pending")));
    const ctx = tid("contexto-versao-nova-s1")!;
    expect(ctx.textContent).toContain("Pedido na reprovação anterior");
    expect(ctx.textContent).toContain("Logo na versão antiga");
  });

  it("versão nova de peça que já tinha sido APROVADA diz isso, com a data", async () => {
    const { LinhaDeDecisao } = await import("@/components/atendimento/linha-de-decisao");
    render(h(LinhaDeDecisao, props("new_version_pending", { rejectionReason: null, rejectedAt: null, approvedAt: iso(-3), approvedBy: "Aline" })));
    expect(tid("contexto-versao-nova-s1")!.textContent).toContain("Tinha aprovado a versão anterior");
  });

  it("no toque, nada abaixo de 12px — nem com o formulário de reprovação aberto", async () => {
    const { LinhaDeDecisao } = await import("@/components/atendimento/linha-de-decisao");
    const { container } = render(h(LinhaDeDecisao, { ...props("pending"), rejectingSponsorId: "s1" }));
    expect(letrasPequenas(container)).toEqual([]);
    // campo de 16px no celular (o iOS dá zoom abaixo disso)
    expect(px(tid("textarea-reject-reason-s1")!.style.fontSize)).toBe(16);
  });
});

describe("o rodapé da fila no modal", () => {
  const base = {
    dialogSponsors: [{ id: "s1", name: "A" }] as any, allDecided: false, allApproved: false,
    setDialogOpen: vi.fn(), reviewQueue: [peca({ id: "p1" }), peca({ id: "p2" })], goToAdjacentItem: vi.fn(),
    sponsorApproveMutation: mutacao(), selectedItem: peca({ id: "p1" }), canDecide: true, tamBotao: "toque" as const,
    pecaRecemAberta: false, decisaoTravada: () => false,
  };

  it("no celular fica FIXO (fora da rolagem), com o recorte seguro embaixo", async () => {
    const { RodapeDaDecisao } = await import("@/components/atendimento/decisao-da-revisao");
    render(h(RodapeDaDecisao, { ...base, fixoNoCelular: true }));
    const r = tid("rodape-da-decisao")!;
    expect(r.style.flexShrink).toBe("0");
    expect(r.style.paddingBottom).toContain("safe-area-inset-bottom");
    expect(tid("button-next-item-footer")).not.toBeNull();
    // (30/09) "Aprovar todos" desceu para logo abaixo dos patrocinadores —
    // no rodapé fixo ficam só a navegação e a saída.
    expect(tid("button-approve-item")).toBeNull();
  });

  it("no celular o Fechar fica SEMPRE no rodapé (30/09) — cede a largura à Próxima peça quando há fila", async () => {
    const { RodapeDaDecisao } = await import("@/components/atendimento/decisao-da-revisao");
    const { unmount } = render(h(RodapeDaDecisao, { ...base, fixoNoCelular: true }));
    expect(tid("button-close-footer")!.style.flex).toBe("0 0 auto");
    unmount();
    render(h(RodapeDaDecisao, { ...base, fixoNoCelular: true, allDecided: true, reviewQueue: [peca({ id: "p1" })] }));
    expect(tid("button-close-footer")!.style.flex).toBe("1 1 0%");
    expect(tid("button-next-item-footer")).toBeNull();
  });

  it("no desktop a dica do teclado fica à esquerda e as ações agrupadas à direita (Fechar → Aprovar todos → Próxima)", async () => {
    const { RodapeDaDecisao } = await import("@/components/atendimento/decisao-da-revisao");
    render(h(RodapeDaDecisao, { ...base, tamBotao: "md" as const }));
    expect(tid("dica-atalhos")!.style.marginRight).toBe("auto");
    const ids = Array.from(tid("rodape-da-decisao")!.querySelectorAll("button")).map(b => b.getAttribute("data-testid"));
    expect(ids.indexOf("button-close-footer")).toBeLessThan(ids.indexOf("button-approve-item"));
    expect(ids.indexOf("button-approve-item")).toBeLessThan(ids.indexOf("button-next-item-footer"));
  });
});

describe("o modal empilhado segue a ordem do trabalho", () => {
  const fonte = ler("components/atendimento/modal-de-revisao.tsx");
  const ramo = fonte.slice(fonte.indexOf("{empilhado ? ("), fonte.indexOf(") : (", fonte.indexOf("{empilhado ? (")));

  it("arte → decisão → detalhes, numa rolagem só", () => {
    const a = ramo.indexOf("<ArteDaRevisao"), d = ramo.indexOf("<ListaDaDecisao"), x = ramo.indexOf("<DetalhesDaRevisao");
    expect(a).toBeGreaterThan(-1);
    expect(a).toBeLessThan(d);
    expect(d).toBeLessThan(x);
    expect(ramo).toContain("overflowY: 'auto'");
  });

  it("o rodapé vem DEPOIS da rolagem, fixo", () => {
    expect(ramo.indexOf("<RodapeDaDecisao")).toBeGreaterThan(ramo.indexOf("<DetalhesDaRevisao"));
    expect(ramo).toContain("fixoNoCelular");
  });

  it("a régua do empilhado é a mesma do CSS (900px)", () => {
    expect(fonte).toContain('const CONSULTA_EMPILHADA = "(max-width: 900px)";');
    const css = readFileSync(path.resolve(__dirname, "../../client/src/index.css"), "utf8");
    expect(css).toContain("@media (max-width: 900px) {\n  .review-modal-body");
  });
});

describe("as confirmações", () => {
  const fonte = ler("components/atendimento/confirmacoes.tsx");

  it("usam o rodapé da casa: Cancelar → ação no desktop, empilhado com a ação em cima no celular", () => {
    expect((fonte.match(/style=\{rodapeDaConfirmacao\(celular\)\}/g) ?? []).length).toBe(3);
    expect((fonte.match(/compacto=\{celular\}/g) ?? []).length).toBe(3);
  });

  it("o desvínculo tem Cancelar (antes a única saída era o X)", () => {
    expect(fonte).toContain('data-testid="button-cancel-desvincular"');
  });

  it("alvo de 44 no celular e no dedo", () => {
    expect(fonte).toContain('const tam = celular || dedo ? "toque" as const : "md" as const;');
  });
});

describe("as abas da tela", () => {
  it("são o <Abas> da casa, com id e aria-controls por item (sem o ref que recolocava por fora)", async () => {
    const { AbasDoAtendimento } = await import("@/components/atendimento/barra-da-fila");
    render(h(AbasDoAtendimento, { activeTab: "pending", setActiveTab: vi.fn(), actionableCount: 16 }));
    const p = document.getElementById("tab-pending")!;
    expect(p.getAttribute("role")).toBe("tab");
    expect(p.getAttribute("aria-controls")).toBe("tabpanel-pending");
    expect(p.getAttribute("aria-selected")).toBe("true");
    expect(document.getElementById("tab-history")!.getAttribute("aria-controls")).toBe("tabpanel-history");
    expect(p.textContent).toContain("16");
  });

  it("a troca de aba chama o mesmo setter de antes", async () => {
    const { AbasDoAtendimento } = await import("@/components/atendimento/barra-da-fila");
    const set = vi.fn();
    render(h(AbasDoAtendimento, { activeTab: "pending", setActiveTab: set, actionableCount: null }));
    fireEvent.click(document.getElementById("tab-history")!);
    expect(set).toHaveBeenCalledWith("history");
  });
});

describe("a leitura das decisões que falhou", () => {
  it("diz que falhou (erro não é vazio) e oferece tentar de novo", async () => {
    const { ListaDaDecisao } = await import("@/components/atendimento/decisao-da-revisao");
    const tentar = vi.fn();
    render(h(ListaDaDecisao, {
      dialogSponsors: [{ id: "s1", name: "Banco Aurora" }] as any, allDecided: false, allApproved: false, loadingSponsorApprovals: false,
      vinculosDoEvento: [], sponsorsDoEvento: [], sponsors: [], buscaPatrocinador: "", setBuscaPatrocinador: vi.fn(),
      addPatrocinadorAberto: false, setAddPatrocinadorAberto: vi.fn(), addingPatrocinadorId: null, adicionarPatrocinador: vi.fn(),
      falhaNasDecisoes: true, aoTentarDeNovoDecisoes: tentar,
      sponsorApprovals: [], selectedItem: peca(), user: { role: "atendimento" }, canDecide: true, isMobile: false, dedo: false, tamBotao: "md",
      rejectingSponsorId: null, setRejectingSponsorId: vi.fn(), rejectionReason: "", setRejectionReason: vi.fn(),
      pecaRecemAberta: false, decisaoTravada: () => false, setConfirmApproveIndividual: vi.fn(), setDesvincularAlvo: vi.fn(),
      acoes: { individualApproveMutation: mutacao(), individualRejectMutation: mutacao(), revertApprovalMutation: mutacao(), desvincularSponsorMutation: mutacao() },
    } as any));
    expect(tid("decisoes-falharam")!.getAttribute("role")).toBe("alert");
    fireEvent.click(tid("button-retry-decisoes")!);
    expect(tentar).toHaveBeenCalledTimes(1);
  });
});
