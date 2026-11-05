import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../db", () => ({ db: {}, pool: {} }));
import { lerResposta, compararCandidatas, compararComIA, PERGUNTA_DA_CONFERENCIA } from "../services/conferencia-do-arquivo";
import { conferirTokenDaIntegracao } from "../routes/integracao-checklist";
import { SQL_EM_CONFERENCIA, SQL_PENDENTES } from "../routes/conferencia-do-arquivo";
import { ATALHOS_DO_AVISO, avisoNaPeca, avisoObrigatorio, ESPERA_MAXIMA_MIN, estadoDaConferencia, lerResolucao } from "@shared/conferencia-do-arquivo";

describe("leitura da resposta da IA", () => {
  it("confere não traz motivo", () => {
    expect(lerResposta('{"veredito":"confere"}')).toEqual({ veredito: "confere", motivo: null });
  });
  it("vale_olhar traz o motivo", () => {
    expect(lerResposta('{"veredito":"vale_olhar","motivo":"Outro logo"}')).toEqual({ veredito: "vale_olhar", motivo: "Outro logo" });
  });
  it("aceita texto em volta do JSON", () => {
    expect(lerResposta('Segue:\n{"veredito":"confere"}\n').veredito).toBe("confere");
  });
  // Resposta estranha não pode virar "arte errada": fica como não conferida.
  it.each(["", "não sei", '{"veredito":"talvez"}', "{quebrado"])("resposta que não dá para entender (%s) vira não deu", (t) => {
    expect(lerResposta(t).veredito).toBe("nao_deu");
  });
  it("motivo enorme é cortado", () => {
    expect(lerResposta(JSON.stringify({ veredito: "vale_olhar", motivo: "x".repeat(900) })).motivo).toHaveLength(400);
  });
});

describe("chamada da IA", () => {
  afterEach(() => vi.unstubAllGlobals());
  const resposta = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status });

  it("manda thumb antes do arquivo final e a pergunta por último", async () => {
    const f = vi.fn(async (_u: string, _i: RequestInit) => resposta(200, { content: [{ type: "text", text: '{"veredito":"confere"}' }], usage: { input_tokens: 10, output_tokens: 3 } }));
    vi.stubGlobal("fetch", f);
    const r = await compararComIA("THUMB", "FINAL", "chave");
    expect(r).toMatchObject({ veredito: "confere", modelo: "claude-sonnet-5-5", tokensEntrada: 10, tokensSaida: 3 });
    const corpo = JSON.parse(String(f.mock.calls[0][1].body));
    expect(corpo.messages[0].content[0].source.data).toBe("THUMB");
    expect(corpo.messages[0].content[1].source.data).toBe("FINAL");
    expect(corpo.messages[0].content[2].text).toBe(PERGUNTA_DA_CONFERENCIA);
  });

  it("recusa da IA fica como não deu, não como arte errada", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta(200, { content: [], stop_reason: "refusal" })));
    expect((await compararComIA("a", "b", "c")).veredito).toBe("nao_deu");
  });

  it("erro da API lança: a peça volta para a fila em vez de ficar marcada", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta(400, { error: { message: "imagem inválida" } })));
    await expect(compararComIA("a", "b", "c")).rejects.toThrow(/IA respondeu 400/);
  });
});

describe("arquivo com várias pranchetas", () => {
  const resultado = (veredito: "confere" | "vale_olhar") => ({ veredito, motivo: veredito === "confere" ? null : "difere", modelo: "m", tokensEntrada: 1, tokensSaida: 1 });
  const candidatas = [{ final: "numeral-2", pagina: "2/3" }, { final: "numeral-1", pagina: "1/3" }, { final: "numeral-3", pagina: "3/3" }];

  // #8942: a mais parecida com o thumb do numeral 1 era a prancheta do 2.
  it("basta uma prancheta conferir, e para aí", async () => {
    const comparar = vi.fn(async (f: string) => resultado(f === "numeral-1" ? "confere" : "vale_olhar"));
    const r = await compararCandidatas(candidatas, comparar);
    expect(r.veredito).toBe("confere");
    expect(r.candidata.pagina).toBe("1/3");
    expect(comparar).toHaveBeenCalledTimes(2);
  });
  it("nenhuma conferiu: o aviso mostra a mais parecida", async () => {
    const r = await compararCandidatas(candidatas, async () => resultado("vale_olhar"));
    expect(r.veredito).toBe("vale_olhar");
    expect(r.candidata.pagina).toBe("2/3");
  });
  it("arquivo de uma prancheta compara uma vez só", async () => {
    const comparar = vi.fn(async () => resultado("confere"));
    await compararCandidatas([candidatas[0]], comparar);
    expect(comparar).toHaveBeenCalledTimes(1);
  });
});

describe("resolver o aviso", () => {
  it("corrigido exige dizer algo à Gráfica", () => {
    expect(lerResolucao({ acao: "corrigido" }).ok).toBe(false);
    expect(lerResolucao({ acao: "corrigido", aviso: "  " }).ok).toBe(false);
    expect(lerResolucao({ acao: "corrigido", aviso: "Arquivo corrigido: abra de novo" })).toEqual({ ok: true, acao: "corrigido", aviso: "Arquivo corrigido: abra de novo" });
  });
  it("certo não exige aviso", () => {
    expect(lerResolucao({ acao: "certo" })).toEqual({ ok: true, acao: "certo", aviso: null });
  });
  it("aviso curto demais, longo demais ou ação desconhecida são recusados", () => {
    expect(lerResolucao({ acao: "certo", aviso: "ok" }).ok).toBe(false);
    expect(lerResolucao({ acao: "certo", aviso: "x".repeat(301) }).ok).toBe(false);
    expect(lerResolucao({ acao: "ignorar" }).ok).toBe(false);
    expect(lerResolucao(undefined).ok).toBe(false);
  });
  it("todo atalho é um aviso válido", () => {
    for (const acao of ["certo", "corrigido"] as const) for (const aviso of ATALHOS_DO_AVISO[acao]) expect(lerResolucao({ acao, aviso }).ok).toBe(true);
  });
  it("na peça vai o texto, quem escreveu e quando", () => {
    expect(avisoNaPeca("Abra de novo", "Fernanda", new Date("2026-11-04T19:30:00Z"))).toBe("Abra de novo (Fernanda, 04/11 às 16:30)");
  });
});

describe("token do conferidor", () => {
  const TOKEN = "t".repeat(40);
  it("sem token no servidor, fica desativada", () => {
    expect(conferirTokenDaIntegracao(`Bearer ${TOKEN}`, undefined)).toBe("desativada");
  });
  it("token errado não passa", () => {
    expect(conferirTokenDaIntegracao(`Bearer ${"x".repeat(40)}`, TOKEN)).not.toBe("ok");
    expect(conferirTokenDaIntegracao(undefined, TOKEN)).not.toBe("ok");
  });
  it("token certo passa", () => {
    expect(conferirTokenDaIntegracao(`Bearer ${TOKEN}`, TOKEN)).toBe("ok");
  });
});

describe("quais peças entram na fila", () => {
  // O dono pediu só o que ainda dá para mudar: nada impresso, evento por vir, sem reaproveitamento.
  it.each([
    ["peça apagada fica de fora", "i.deleted_at is null"],
    ["evento arquivado fica de fora", "e.arquivado_em is null"],
    ["evento que já passou fica de fora", "e.start_date >="],
    ["reaproveitamento fica de fora", "coalesce(i.is_reuse, false) = false"],
    ["peça com algo impresso fica de fora", "coalesce(i.quantity_produced, 0) = 0"],
    ["sem thumb guardado fica de fora", "i.approval_thumb_url like '/objects/%'"],
    ["trocou arquivo ou thumb, confere de novo", "c.arquivo = i.final_file_url and c.thumb = i.approval_thumb_url"],
    ["confere de outro modelo volta para a fila", "c.veredito = 'confere' and c.modelo is distinct from 'claude-sonnet-5-5'"],
    ["corrigiram o arquivo, confere de novo", "or c.reconferir"],
    ["não deu volta para a fila depois de um dia", "c.veredito = 'nao_deu' and c.resolvida_em is null and c.criada_em < now() - interval '1 day'"],
  ])("%s", (_n, trecho) => {
    expect(SQL_PENDENTES).toContain(trecho);
  });
});

describe("conferência antes da Revisão (dono, 05/11)", () => {
  const pedida = new Date("2026-11-05T12:00:00Z");
  const depois = (min: number) => new Date(pedida.getTime() + min * 60_000);
  it("peça sem pedido de conferência é liberada como sempre", () => {
    expect(estadoDaConferencia(null, null)).toBe("liberada");
  });
  it("sem veredito ainda, espera a conferência", () => {
    expect(estadoDaConferencia(pedida, null, depois(10))).toBe("conferindo");
  });
  it("veredito de antes do pedido é de outro envio: continua esperando", () => {
    expect(estadoDaConferencia(pedida, { veredito: "confere", criadaEm: depois(-60), resolvida: false }, depois(10))).toBe("conferindo");
  });
  it("confere ou não deu liberam; divergência sem resolver não", () => {
    expect(estadoDaConferencia(pedida, { veredito: "confere", criadaEm: depois(5), resolvida: false }, depois(10))).toBe("liberada");
    expect(estadoDaConferencia(pedida, { veredito: "nao_deu", criadaEm: depois(5), resolvida: false }, depois(10))).toBe("liberada");
    expect(estadoDaConferencia(pedida, { veredito: "vale_olhar", criadaEm: depois(5), resolvida: false }, depois(10))).toBe("divergente");
    expect(estadoDaConferencia(pedida, { veredito: "vale_olhar", criadaEm: depois(5), resolvida: true }, depois(10))).toBe("liberada");
  });
  it("conferidor parado não prende a peça para sempre", () => {
    expect(estadoDaConferencia(pedida, null, depois(ESPERA_MAXIMA_MIN + 1))).toBe("liberada");
  });
  it("antes da Gráfica, o aviso do arquivo corrigido é opcional", () => {
    expect(avisoObrigatorio("sponsor_approved", "corrigido")).toBe(false);
    expect(avisoObrigatorio("awaiting_final_review", "corrigido")).toBe(false);
    expect(avisoObrigatorio("ready_for_production", "corrigido")).toBe(true);
    expect(avisoObrigatorio("ready_for_production", "certo")).toBe(false);
    expect(lerResolucao({ acao: "corrigido" }, "sponsor_approved")).toEqual({ ok: true, acao: "corrigido", aviso: null });
    expect(lerResolucao({ acao: "corrigido" }, "ready_for_production").ok).toBe(false);
  });
  it("a peça que espera na Revisão vem primeiro na fila e volta a ela quando o arquivo é trocado", () => {
    expect(SQL_PENDENTES).toContain("c.criada_em < i.conferencia_pedida_em");
    expect(SQL_PENDENTES).toContain("order by (");
  });
  it("só trava a liberação dentro da espera máxima e sem veredito novo", () => {
    expect(SQL_EM_CONFERENCIA).toContain("i.status = 'awaiting_final_review'");
    expect(SQL_EM_CONFERENCIA).toContain(`interval '${ESPERA_MAXIMA_MIN} minutes'`);
    expect(SQL_EM_CONFERENCIA).toContain("c.criada_em < i.conferencia_pedida_em");
  });
});
