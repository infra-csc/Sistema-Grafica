// ─────────────────────────────────────────────────────────────────────────────
// AUDITORIA DO BOOK COM IA (dono, 19/10) — as regras do servidor:
//   · a resposta da IA é validada (peça de fora do evento cai, confiança
//     desconhecida vira baixa, chaves estáveis);
//   · a fila roda uma de cada vez, sem chave vira "sem_chave", erro vira
//     "erro" e NUNCA derruba quem chamou, e só notifica quem monta a lista;
//   · a chamada à API: pedido montado certo, stream lido, erro legível;
//   · contagem e quem vê (shared/auditoria-do-book).
// As rotas e as permissões estão em auditoria-do-book-rotas.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import {
  faltandoEmAberto, canceladasEmAberto, aRevisarEmAberto, divergenciasEmAberto, resumirAuditorias, podeVerAuditoriaDoBook, linkDaPagina,
  fraseDaNotificacaoDoBook, motivoServeParaChave, rotuloDoContadorDoBook, type AuditoriaDoBookVista,
} from "@shared/auditoria-do-book";
import { normalizarResposta, normalizarConfianca } from "../services/auditoria-do-book/normalizar";
import { montarListaDePecas, NOME_DA_FERRAMENTA } from "../services/auditoria-do-book/prompt";

vi.mock("../db", () => ({ db: {}, pool: {} }));
const { criarFila } = await import("../services/auditoria-do-book/fila");
const { chamarIA, juntarStream, montarRequisicao, ErroDaIA } = await import("../services/auditoria-do-book/ia");

const PECAS = [
  { id: "uuid-6524", displayId: "#6524" },
  { id: "uuid-6531", displayId: "#6531" },
  { id: "uuid-7104", displayId: "#7104" },
];

describe("normalizarResposta: nada da IA entra sem passar por aqui", () => {
  it("peça que não é do evento cai fora; divergência sem nenhuma peça válida cai inteira", () => {
    const r = normalizarResposta({
      faltando_no_app: [],
      divergencias: [
        { pagina: 5, ids: ["#6524", "#9999", "6531", "#6524"], no_book: "logo novo", no_app: "logo antigo" },
        { pagina: 6, ids: ["#9999", "#0001"], no_book: "x", no_app: "y" },
      ],
      pecas_no_book: 30, encontradas_no_app: 28, observacoes: "ok",
    }, PECAS);
    expect(r.achados.divergencias).toHaveLength(1);
    expect(r.achados.divergencias[0]).toMatchObject({ chave: "d0", pagina: 5, ids: ["uuid-6524", "uuid-6531"], displayIds: ["#6524", "#6531"] });
    expect(r.pecasNoBook).toBe(30);
    expect(r.encontradasNoApp).toBe(28);
  });

  it("confiança desconhecida vira baixa; 'média' com acento e 'high' são entendidas", () => {
    expect(normalizarConfianca("média")).toBe("media");
    expect(normalizarConfianca("Alta")).toBe("alta");
    expect(normalizarConfianca("high")).toBe("alta");
    expect(normalizarConfianca("talvez")).toBe("baixa");
    expect(normalizarConfianca(undefined)).toBe("baixa");
  });

  it("faltando: chaves em ordem, candidata vira link quando é peça do evento, lixo é descartado", () => {
    const r = normalizarResposta({
      faltando_no_app: [
        { pagina: 13, peca_no_book: "Placas KM 1 a 4", detalhe: "Nenhuma placa km", confianca: "alta", candidata_mais_proxima: null },
        { pagina: "2", peca_no_book: "Lateral da carreta", detalhe: "Envelopamento", confianca: "baixa", candidata_mais_proxima: "#7104 painel em lona 3.9x2.9" },
        { pagina: 0, peca_no_book: "  ", detalhe: "" },
        "texto solto",
        { pagina: 4, peca_no_book: "Traseira", detalhe: "", confianca: "???", candidata_mais_proxima: "#8888 de outro evento" },
      ],
      divergencias: [],
    }, PECAS);
    const f = r.achados.faltando;
    expect(f.map((x) => x.chave)).toEqual(["f0", "f1", "f2"]);
    expect(f[0]).toMatchObject({ pagina: 13, confianca: "alta", candidata: null, candidataId: null });
    expect(f[1]).toMatchObject({ pagina: 2, confianca: "baixa", candidataId: "uuid-7104" });
    expect(f[2]).toMatchObject({ confianca: "baixa", candidata: "#8888 de outro evento", candidataId: null });
  });

  it("resposta vazia ou absurda vira auditoria vazia, sem lançar", () => {
    for (const bruta of [null, undefined, "x", 42, { faltando_no_app: "não é lista" }]) {
      const r = normalizarResposta(bruta, PECAS);
      expect(r.achados.faltando).toEqual([]);
      expect(r.achados.divergencias).toEqual([]);
    }
    expect(normalizarResposta({ pecas_no_book: 5, encontradas_no_app: 9 }, PECAS).encontradasNoApp).toBe(5);
    expect(normalizarResposta({ pecas_no_book: -3 }, PECAS).pecasNoBook).toBeNull();
  });
});

describe("canceladas no app (dono, 19/10: patrocinador trocado ≠ peça esquecida)", () => {
  const CANCELADAS = [
    { id: "uuid-8040", displayId: "#8040", rotulo: "#8040 2x1 Bradesco Seguros" },
    { id: "uuid-8041", displayId: "#8041", rotulo: "#8041 Rolo Bradesco" },
  ];
  it("aponta a peça CANCELADA do evento, com o rótulo legível; chaves c0, c1…", () => {
    const r = normalizarResposta({
      faltando_no_app: [],
      cancelada_no_app: [
        { pagina: 4, peca_no_book: "2x1 Bradesco Seguros", ids: ["#8040", "#8040", "#9999"], detalhe: "arte igual" },
        { pagina: 5, peca_no_book: "Rolo Bradesco", ids: ["8041"], detalhe: "" },
      ],
      divergencias: [],
    }, PECAS, CANCELADAS);
    expect(r.achados.canceladas).toEqual([
      { chave: "c0", pagina: 4, pecaNoBook: "2x1 Bradesco Seguros", detalhe: "arte igual", ids: ["uuid-8040"], rotulos: ["#8040 2x1 Bradesco Seguros"] },
      { chave: "c1", pagina: 5, pecaNoBook: "Rolo Bradesco", detalhe: "", ids: ["uuid-8041"], rotulos: ["#8041 Rolo Bradesco"] },
    ]);
    expect(r.achados.faltando).toEqual([]);
  });

  it("número que é peça ATIVA: encontrada, sai; número inexistente: vira faltando com confiança baixa", () => {
    const r = normalizarResposta({
      cancelada_no_app: [
        { pagina: 4, peca_no_book: "2x1 Ministério", ids: ["#6524"], detalhe: "x" },
        { pagina: 6, peca_no_book: "Testeira Bradesco", ids: ["#7777"], detalhe: "testeira" },
      ],
    }, PECAS, CANCELADAS);
    expect(r.achados.canceladas).toEqual([]);
    expect(r.achados.faltando).toHaveLength(1);
    expect(r.achados.faltando[0]).toMatchObject({ chave: "f0", pagina: 6, pecaNoBook: "Testeira Bradesco", confianca: "baixa" });
    expect(r.achados.faltando[0].detalhe).toContain("cancelada que não foi encontrada");
  });

  it("'a revisar' = faltando + canceladas em aberto; divergência não entra; auditoria antiga sem o campo não quebra", () => {
    const a: any = { status: "concluida", resolvidos: { c1: { motivo: "nao_precisa" } }, achados: {
      faltando: [{ chave: "f0" }], divergencias: [{ chave: "d0" }],
      canceladas: [{ chave: "c0" }, { chave: "c1" }],
    } };
    expect(canceladasEmAberto(a).map((c: any) => c.chave)).toEqual(["c0"]);
    expect(aRevisarEmAberto(a)).toBe(2);
    expect(resumirAuditorias([{ ...a, eventId: "e1" }]).pecas).toBe(2);
    const antiga: any = { status: "concluida", resolvidos: {}, achados: { faltando: [{ chave: "f0" }], divergencias: [] } };
    expect(aRevisarEmAberto(antiga)).toBe(1);
    expect(motivoServeParaChave("c0", "cadastrada")).toBe(true);
    expect(motivoServeParaChave("c0", "nao_precisa")).toBe(true);
    expect(motivoServeParaChave("c0", "conferida")).toBe(false);
  });

  it("a frase do sino conta as duas coisas", () => {
    expect(fraseDaNotificacaoDoBook("Longevidade Manaus", 2, 13)).toBe("Book do Longevidade Manaus: 2 peças do book não estão na lista e 13 estão canceladas no app");
    expect(fraseDaNotificacaoDoBook("Longevidade Manaus", 0, 1)).toBe("Book do Longevidade Manaus: 1 peça do book está cancelada no app");
  });
});

describe("a lista de peças que a IA recebe", () => {
  it("uma linha por peça, com medida, material, status e patrocinadores", () => {
    const txt = montarListaDePecas("Night Run Vitória", [
      { displayId: "#6525", type: "2x1", description: "2x1 Alçando | Voos", quantity: 8, visualWidth: "1.90", visualHeight: "0.90", material: "SANETT", status: "conferred" },
      { displayId: "#6537", type: "PÓRTICO", description: null, quantity: 1, visualWidth: null, visualHeight: null, material: "Lona", status: "delivered" },
    ], (d) => (d === "#6525" ? ["Ministério"] : []));
    expect(txt).toContain("EVENTO: Night Run Vitória");
    expect(txt).toContain("PEÇAS ATIVAS NO SISTEMA (2):");
    expect(txt).toContain("#6525 | 2x1 | 2x1 Alçando Voos | qtd 8 | 1.9x0.9 | SANETT | conferred | Ministério");
    expect(txt).toContain("#6537 | PÓRTICO | — | qtd 1 | sem medida | Lona | delivered | sem patrocinador");
    expect(txt).toContain("PEÇAS CANCELADAS NO SISTEMA (0) — não serão produzidas:\n(nenhuma)");
  });

  it("as canceladas vão num bloco à parte, marcadas CANCELADA", () => {
    const txt = montarListaDePecas("Longevidade", [], () => ["Bradesco"], [
      { displayId: "#8040", type: "2x1", description: "2x1 Bradesco Seguros", quantity: 6, visualWidth: "1.9", visualHeight: "0.9", material: "SANETT", status: "canceled" },
    ]);
    expect(txt).toContain("(nenhuma peça ativa cadastrada)");
    expect(txt).toContain("PEÇAS CANCELADAS NO SISTEMA (1) — não serão produzidas:\n#8040 | 2x1 | 2x1 Bradesco Seguros | qtd 6 | 1.9x0.9 | SANETT | CANCELADA | Bradesco");
  });
});

describe("contagem e quem vê", () => {
  const base = (over: Partial<AuditoriaDoBookVista>): AuditoriaDoBookVista => ({
    id: "a", eventId: "e1", eventName: "E", bookUrl: "/objects/uploads/x", bookPublicadoEm: null, bookMaisNovoEm: null, status: "concluida",
    modelo: null, achados: { faltando: [], divergencias: [], observacoes: null }, resolvidos: {}, pecasNoBook: null,
    encontradasNoApp: null, erro: null, criadoEm: "2026-10-19T00:00:00Z", concluidoEm: null, ...over,
  });
  const f = (chave: string) => ({ chave, pagina: 1, pecaNoBook: chave, detalhe: "", confianca: "alta" as const, candidata: null, candidataId: null });
  const d = (chave: string) => ({ chave, pagina: 1, ids: ["x"], displayIds: ["#1"], noBook: "a", noApp: "b" });

  it("só conta faltando em aberto de auditoria concluída", () => {
    const a1 = base({ eventId: "e1", achados: { faltando: [f("f0"), f("f1"), f("f2")], divergencias: [d("d0")], observacoes: null }, resolvidos: { f1: { motivo: "cadastrada", por: "Ana", porId: "u", em: "x" } } });
    const a2 = base({ id: "b", eventId: "e2", achados: { faltando: [f("f0")], divergencias: [], observacoes: null } });
    const a3 = base({ id: "c", eventId: "e3", status: "erro", achados: { faltando: [f("f0")], divergencias: [], observacoes: null } });
    const a4 = base({ id: "d", eventId: "e4", achados: { faltando: [f("f0")], divergencias: [], observacoes: null }, resolvidos: { f0: { motivo: "nao_precisa", por: null, porId: null, em: "x" } } });
    expect(faltandoEmAberto(a1).map((x) => x.chave)).toEqual(["f0", "f2"]);
    expect(divergenciasEmAberto(a1)).toHaveLength(1);
    expect(faltandoEmAberto(a3)).toEqual([]);
    const r = resumirAuditorias([a1, a2, a3, a4]);
    expect(r.pecas).toBe(3);
    expect(r.eventos).toBe(2);
    expect(Array.from(r.porEvento.entries())).toEqual([["e1", 2], ["e2", 1]]);
  });

  it("Solicitação (menos o Kit) e admin; os demais não", () => {
    expect(podeVerAuditoriaDoBook("admin")).toBe(true);
    expect(podeVerAuditoriaDoBook("solicitacao", false)).toBe(true);
    expect(podeVerAuditoriaDoBook("solicitacao", true)).toBe(false);
    for (const p of ["arte", "grafica", "atendimento", undefined, null]) expect(podeVerAuditoriaDoBook(p as string)).toBe(false);
  });

  it("motivo por tipo de achado, link da página e as frases", () => {
    expect(motivoServeParaChave("f0", "cadastrada")).toBe(true);
    expect(motivoServeParaChave("f0", "conferida")).toBe(false);
    expect(motivoServeParaChave("d3", "conferida")).toBe(true);
    expect(motivoServeParaChave("d3", "cadastrada")).toBe(false);
    expect(linkDaPagina("/objects/uploads/abc", 13)).toBe("/objects/uploads/abc#page=13");
    expect(linkDaPagina("/objects/uploads/abc", null)).toBe("/objects/uploads/abc");
    expect(fraseDaNotificacaoDoBook("Night Run", 1)).toBe("Book do Night Run: 1 peça do book não está na lista");
    expect(fraseDaNotificacaoDoBook("Night Run", 4)).toBe("Book do Night Run: 4 peças do book não estão na lista");
    expect(rotuloDoContadorDoBook(59)).toBe("59 peças do book a revisar na lista (fora da lista ou canceladas)");
  });
});

// ── A fila ────────────────────────────────────────────────────────────────
function depsFalsas(over: Record<string, any> = {}) {
  const chamadas: string[] = [];
  const repo = {
    criarAuditoria: vi.fn(async (eventId: string, bookUrl: string) => ({ id: `aud-${eventId}`, eventId, bookUrl })),
    reivindicar: vi.fn(async (id: string) => ({ id, eventId: "e1", bookUrl: "/objects/uploads/book" })),
    concluir: vi.fn(async (id: string) => ({ id })),
    falhar: vi.fn(async () => {}),
    idsParaRetomar: vi.fn(async () => [] as string[]),
    eventoJaTemAuditoria: vi.fn(async () => false),
  };
  const deps = {
    repo,
    chave: () => "sk-teste",
    carregarPecas: vi.fn(async () => ({
      nomeDoEvento: "Night Run Vitória",
      pecas: [{ id: "uuid-6524", displayId: "#6524", type: "2x1", description: "2x1 Min", quantity: 8, visualWidth: "1.9", visualHeight: "0.9", material: "SANETT", status: "delivered" }] as any,
      patrocinadores: new Map([["#6524", ["Ministério"]]]),
    })),
    lerPdf: vi.fn(async () => Buffer.from("%PDF-1.7 fake")),
    contarPaginas: vi.fn(async () => 16),
    chamarIA: vi.fn(async () => ({
      entrada: { faltando_no_app: [{ pagina: 13, peca_no_book: "Placas KM", detalhe: "sem placa", confianca: "alta", candidata_mais_proxima: null }], divergencias: [], pecas_no_book: 37, encontradas_no_app: 33, observacoes: "" },
      modelo: "claude-opus-5-5", tokensEntrada: 52_000, tokensSaida: 6_000,
    })),
    notificar: vi.fn(async () => {}),
    avisarTelas: vi.fn(() => { chamadas.push("avisar"); }),
    log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    ...over,
  };
  return { deps, repo, chamadas };
}

describe("fila da auditoria", () => {
  it("caminho feliz: lê o book, chama a IA com a lista, grava e avisa Solicitação + admin", async () => {
    const { deps, repo } = depsFalsas();
    const fila = criarFila(deps as any);
    await fila.processar("a1");
    expect(deps.chamarIA).toHaveBeenCalledTimes(1);
    const arg = (deps.chamarIA as any).mock.calls[0][0];
    expect(arg.chave).toBe("sk-teste");
    expect(arg.listaDePecas).toContain("#6524 | 2x1 | 2x1 Min | qtd 8 | 1.9x0.9 | SANETT | delivered | Ministério");
    expect(Buffer.from(arg.pdfBase64, "base64").toString()).toContain("%PDF");
    expect(repo.concluir).toHaveBeenCalledWith("a1", expect.objectContaining({
      pecasNoBook: 37, encontradasNoApp: 33, modelo: "claude-opus-5-5", tokensEntrada: 52_000, tokensSaida: 6_000,
    }));
    expect((repo.concluir as any).mock.calls[0][1].achados.faltando[0]).toMatchObject({ chave: "f0", pagina: 13, confianca: "alta" });
    expect(deps.notificar).toHaveBeenCalledWith({
      type: "bookAuditado",
      message: "Book do Night Run Vitória: 1 peça do book não está na lista",
      eventId: "e1",
      targetRoles: ["solicitacao", "admin"],
    });
    expect(repo.falhar).not.toHaveBeenCalled();
    expect(deps.avisarTelas).toHaveBeenCalledWith("e1");
  });

  it("canceladas vão à IA marcadas e, achadas, entram no aviso do sino", async () => {
    const { deps, repo } = depsFalsas({
      carregarPecas: vi.fn(async () => ({
        nomeDoEvento: "Longevidade Manaus",
        pecas: [],
        canceladas: [{ id: "uuid-8040", displayId: "#8040", type: "2x1", description: "2x1 Bradesco Seguros", quantity: 6, visualWidth: "1.9", visualHeight: "0.9", material: "SANETT", status: "canceled" }] as any,
        patrocinadores: new Map(),
      })),
      chamarIA: vi.fn(async () => ({ entrada: { faltando_no_app: [], cancelada_no_app: [{ pagina: 4, peca_no_book: "2x1 Bradesco", ids: ["#8040"], detalhe: "" }], divergencias: [] }, modelo: "m", tokensEntrada: 1, tokensSaida: 1 })),
    });
    await criarFila(deps as any).processar("a1");
    expect((deps.chamarIA as any).mock.calls[0][0].listaDePecas).toContain("#8040 | 2x1 | 2x1 Bradesco Seguros | qtd 6 | 1.9x0.9 | SANETT | CANCELADA");
    expect((repo.concluir as any).mock.calls[0][1].achados.canceladas[0]).toMatchObject({ chave: "c0", rotulos: ["#8040 2x1 Bradesco Seguros"] });
    expect(deps.notificar).toHaveBeenCalledWith(expect.objectContaining({ message: "Book do Longevidade Manaus: 1 peça do book está cancelada no app" }));
  });

  it("sem ANTHROPIC_API_KEY: status sem_chave, nada de IA nem de aviso", async () => {
    const { deps, repo } = depsFalsas({ chave: () => undefined });
    await criarFila(deps as any).processar("a1");
    expect(repo.falhar).toHaveBeenCalledWith("a1", "sem_chave", expect.stringContaining("ANTHROPIC_API_KEY"));
    expect(deps.lerPdf).not.toHaveBeenCalled();
    expect(deps.chamarIA).not.toHaveBeenCalled();
    expect(deps.notificar).not.toHaveBeenCalled();
  });

  it("erro em qualquer passo vira status 'erro' com a mensagem — e não lança", async () => {
    const { deps, repo } = depsFalsas({ lerPdf: vi.fn(async () => { throw new ErroDaIA("O arquivo do book não foi encontrado no armazenamento."); }) });
    await expect(criarFila(deps as any).processar("a1")).resolves.toBeUndefined();
    expect(repo.falhar).toHaveBeenCalledWith("a1", "erro", "O arquivo do book não foi encontrado no armazenamento.");
    expect(deps.notificar).not.toHaveBeenCalled();
  });

  it("nem o falhar quebrando derruba a fila", async () => {
    const { deps, repo } = depsFalsas({ chamarIA: vi.fn(async () => { throw new Error("rede caiu"); }) });
    repo.falhar.mockRejectedValueOnce(new Error("banco fora"));
    await expect(criarFila(deps as any).processar("a1")).resolves.toBeUndefined();
    expect(deps.log.error).toHaveBeenCalled();
  });

  it("book acima de 100 páginas: erro claro, sem chamar a IA", async () => {
    const { deps, repo } = depsFalsas({ contarPaginas: vi.fn(async () => 140) });
    await criarFila(deps as any).processar("a1");
    expect(deps.chamarIA).not.toHaveBeenCalled();
    expect(repo.falhar).toHaveBeenCalledWith("a1", "erro", expect.stringContaining("140 páginas"));
  });

  it("book acima de 32 MB: erro claro, sem chamar a IA", async () => {
    const { deps, repo } = depsFalsas({ lerPdf: vi.fn(async () => Buffer.alloc(33 * 1024 * 1024)) });
    await criarFila(deps as any).processar("a1");
    expect(deps.chamarIA).not.toHaveBeenCalled();
    expect(repo.falhar).toHaveBeenCalledWith("a1", "erro", expect.stringContaining("32 MB"));
  });

  it("substituída enquanto a IA lia (concluir devolve null): ninguém é avisado", async () => {
    const { deps, repo } = depsFalsas();
    repo.concluir.mockResolvedValueOnce(null as any);
    await criarFila(deps as any).processar("a1");
    expect(deps.notificar).not.toHaveBeenCalled();
  });

  it("nenhuma peça faltando: conclui sem aviso no sino", async () => {
    const { deps } = depsFalsas({ chamarIA: vi.fn(async () => ({ entrada: { faltando_no_app: [], divergencias: [] }, modelo: "m", tokensEntrada: 1, tokensSaida: 1 })) });
    await criarFila(deps as any).processar("a1");
    expect(deps.notificar).not.toHaveBeenCalled();
  });

  it("outra cópia já pegou (reivindicar null): não faz nada", async () => {
    const { deps, repo } = depsFalsas();
    repo.reivindicar.mockResolvedValueOnce(null as any);
    await criarFila(deps as any).processar("a1");
    expect(deps.lerPdf).not.toHaveBeenCalled();
    expect(repo.falhar).not.toHaveBeenCalled();
  });

  it("uma de cada vez: três books publicados juntos rodam em sequência", async () => {
    let rodando = 0, maximo = 0;
    const { deps } = depsFalsas({
      chamarIA: vi.fn(async () => {
        rodando++; maximo = Math.max(maximo, rodando);
        await new Promise((r) => setTimeout(r, 15));
        rodando--;
        return { entrada: {}, modelo: "m", tokensEntrada: 0, tokensSaida: 0 };
      }),
    });
    const fila = criarFila(deps as any);
    fila.enfileirar("a1"); fila.enfileirar("a2"); fila.enfileirar("a3"); fila.enfileirar("a1");
    await fila.ocioso();
    expect(deps.chamarIA).toHaveBeenCalledTimes(3);
    expect(maximo).toBe(1);
  });

  it("disparar nunca lança, nem com o banco fora", async () => {
    const { deps, repo } = depsFalsas();
    repo.criarAuditoria.mockRejectedValueOnce(new Error("banco fora"));
    const fila = criarFila(deps as any);
    await expect(fila.disparar("e1", "/objects/uploads/x")).resolves.toBeNull();
    await expect(fila.disparar("e2", "/objects/uploads/y")).resolves.toBe("aud-e2");
    await fila.ocioso();
    expect(repo.reivindicar).toHaveBeenCalledWith("aud-e2");
  });

  it("só o 1º book (dono, 19/10 — custo): reenvio não audita; erro/sem_chave do 1º tenta de novo", async () => {
    const { deps, repo } = depsFalsas();
    const fila = criarFila(deps as any);
    // primeiro book: audita
    await expect(fila.dispararSePrimeiro("e1", "/objects/uploads/b1")).resolves.toBe("aud-e1");
    await fila.ocioso();
    expect(repo.criarAuditoria).toHaveBeenCalledTimes(1);
    // reenvio: o evento já tem auditoria valendo → nada
    repo.eventoJaTemAuditoria.mockResolvedValueOnce(true);
    await expect(fila.dispararSePrimeiro("e1", "/objects/uploads/b2")).resolves.toBeNull();
    expect(repo.criarAuditoria).toHaveBeenCalledTimes(1);
    expect(deps.chamarIA).toHaveBeenCalledTimes(1);
    // não deu para saber: não audita (e não lança)
    repo.eventoJaTemAuditoria.mockRejectedValueOnce(new Error("banco fora"));
    await expect(fila.dispararSePrimeiro("e1", "/objects/uploads/b3")).resolves.toBeNull();
    // o admin audita o book atual quando quiser (disparar, sem a regra)
    repo.eventoJaTemAuditoria.mockResolvedValue(true);
    await expect(fila.disparar("e1", "/objects/uploads/b3")).resolves.toBe("aud-e1");
    expect(repo.criarAuditoria).toHaveBeenLastCalledWith("e1", "/objects/uploads/b3");
  });

  it("retomar põe na fila o que ficou pendente/processando (com ou sem chave)", async () => {
    const { deps, repo } = depsFalsas();
    repo.idsParaRetomar.mockResolvedValueOnce(["p1", "p2"]);
    const fila = criarFila(deps as any);
    expect(await fila.retomar()).toBe(2);
    expect(repo.idsParaRetomar).toHaveBeenCalledWith(true);
    await fila.ocioso();
    expect(repo.reivindicar).toHaveBeenCalledWith("p1");
    expect(repo.reivindicar).toHaveBeenCalledWith("p2");

    const sem = depsFalsas({ chave: () => "" });
    sem.repo.idsParaRetomar.mockRejectedValueOnce(new Error("tabela não existe"));
    await expect(criarFila(sem.deps as any).retomar()).resolves.toBe(0);
  });
});

// ── A chamada à API ───────────────────────────────────────────────────────
function streamDe(eventos: unknown[]): ReadableStream<Uint8Array> {
  const texto = eventos.map((e: any) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  const bytes = new TextEncoder().encode(texto);
  return new ReadableStream({
    start(c) {
      // em pedaços tortos, como a rede entrega
      for (let i = 0; i < bytes.length; i += 37) c.enqueue(bytes.slice(i, i + 37));
      c.close();
    },
  });
}

const EVENTOS_OK = [
  { type: "message_start", message: { model: "claude-opus-5-5", usage: { input_tokens: 48_000, output_tokens: 1 } } },
  { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
  { type: "content_block_stop", index: 0 },
  { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "t1", name: NOME_DA_FERRAMENTA, input: {} } },
  { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{\"faltando_no_app\": [{\"pagina\": 13, \"peca_no_book\": \"Placas" } },
  { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: " KM\", \"detalhe\": \"x\", \"confianca\": \"alta\", \"candidata_mais_proxima\": null}], \"divergencias\": [], \"pecas_no_book\": 37, \"encontradas_no_app\": 33, \"observacoes\": \"\"}" } },
  { type: "content_block_stop", index: 1 },
  { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 5_432 } },
  { type: "message_stop" },
];

describe("chamada à API da Anthropic", () => {
  it("o pedido: PDF em base64, lista em texto, ferramenta estrita, escolha automática e esforço alto", () => {
    const { corpo, cabecalhos } = montarRequisicao("QUJD", "EVENTO: X", "claude-opus-5-5");
    const c = corpo as any;
    expect(c.model).toBe("claude-opus-5-5");
    expect(c.stream).toBe(true);
    expect(c.tool_choice).toEqual({ type: "auto" });
    expect(c.tools[0]).toMatchObject({ name: NOME_DA_FERRAMENTA, strict: true });
    expect(c.messages[0].content[0]).toEqual({ type: "document", source: { type: "base64", media_type: "application/pdf", data: "QUJD" } });
    expect(c.messages[0].content[1].text).toContain("EVENTO: X");
    expect(c.output_config).toEqual({ effort: "high" });
    expect(c.fallbacks).toBe("default");
    expect(cabecalhos["anthropic-version"]).toBe("2023-06-01");
    expect(cabecalhos["anthropic-beta"]).toBe("server-side-fallback-2026-07-01");
    // modelo sem desvio automático não leva o parâmetro (seria 400)
    const outro = montarRequisicao("QUJD", "x", "claude-haiku-5-5");
    expect((outro.corpo as any).fallbacks).toBeUndefined();
    expect(outro.cabecalhos["anthropic-beta"]).toBeUndefined();
  });

  it("lê o stream em pedaços: entrada da ferramenta e tokens", async () => {
    const r = await juntarStream(streamDe(EVENTOS_OK));
    expect(JSON.parse(r.ferramenta!.json)).toMatchObject({ pecas_no_book: 37, faltando_no_app: [{ peca_no_book: "Placas KM" }] });
    expect(r.tokensEntrada).toBe(48_000);
    expect(r.tokensSaida).toBe(5_432);
    expect(r.stopReason).toBe("tool_use");
  });

  it("chamarIA: manda a chave no cabeçalho e devolve a entrada", async () => {
    const fetchImpl = vi.fn(async () => new Response(streamDe(EVENTOS_OK), { status: 200 }));
    const r = await chamarIA({ pdfBase64: "QUJD", listaDePecas: "x", chave: "sk-x", modelo: "claude-opus-5-5", fetchImpl: fetchImpl as any });
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("sk-x");
    expect((r.entrada as any).encontradas_no_app).toBe(33);
    expect(r.tokensEntrada).toBe(48_000);
  });

  it("chave recusada (401) falha na hora com frase legível; 529 tenta de novo", async () => {
    const f401 = vi.fn(async () => new Response(JSON.stringify({ error: { message: "invalid x-api-key" } }), { status: 401 }));
    await expect(chamarIA({ pdfBase64: "QQ==", listaDePecas: "x", chave: "k", fetchImpl: f401 as any })).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(f401).toHaveBeenCalledTimes(1);

    let n = 0;
    const f529 = vi.fn(async () => (++n === 1
      ? new Response(JSON.stringify({ error: { message: "Overloaded" } }), { status: 529 })
      : new Response(streamDe(EVENTOS_OK), { status: 200 })));
    const r = await chamarIA({ pdfBase64: "QQ==", listaDePecas: "x", chave: "k", fetchImpl: f529 as any, esperarMs: () => 0 });
    expect(f529).toHaveBeenCalledTimes(2);
    expect((r.entrada as any).pecas_no_book).toBe(37);
  });

  it("conta que não aceita o desvio automático (400 'fallbacks'): repete sem ele", async () => {
    const corpos: any[] = [];
    const f = vi.fn(async (_u: string, init: any) => {
      corpos.push(JSON.parse(init.body));
      return corpos.length === 1
        ? new Response(JSON.stringify({ error: { message: "fallbacks: Extra inputs are not permitted" } }), { status: 400 })
        : new Response(streamDe(EVENTOS_OK), { status: 200 });
    });
    const r = await chamarIA({ pdfBase64: "QQ==", listaDePecas: "x", chave: "k", modelo: "claude-opus-5-5", fetchImpl: f as any });
    expect(corpos[0].fallbacks).toBe("default");
    expect(corpos[1].fallbacks).toBeUndefined();
    expect((f.mock.calls[1][1] as any).headers["anthropic-beta"]).toBeUndefined();
    expect((r.entrada as any).pecas_no_book).toBe(37);
  });

  it("IA que não registra nada, ou recusa: erro com motivo", async () => {
    const semFerramenta = [
      { type: "message_start", message: { usage: { input_tokens: 10 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Não consegui ler." } },
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } },
    ];
    await expect(chamarIA({ pdfBase64: "QQ==", listaDePecas: "x", chave: "k", fetchImpl: (async () => new Response(streamDe(semFerramenta))) as any }))
      .rejects.toThrow("A IA terminou sem registrar a auditoria.");
    const recusa = [{ type: "message_start", message: { usage: {} } }, { type: "message_delta", delta: { stop_reason: "refusal" }, usage: { output_tokens: 0 } }];
    await expect(chamarIA({ pdfBase64: "QQ==", listaDePecas: "x", chave: "k", fetchImpl: (async () => new Response(streamDe(recusa))) as any }))
      .rejects.toThrow(/recusou/);
  });
});
