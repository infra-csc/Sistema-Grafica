import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../db", () => ({ db: {}, pool: {} }));
import { lerResposta, compararComIA, PERGUNTA_DA_CONFERENCIA } from "../services/conferencia-do-arquivo";
import { conferirTokenDaIntegracao } from "../routes/integracao-checklist";
import { SQL_PENDENTES } from "../routes/conferencia-do-arquivo";

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
    ["não deu volta para a fila depois de um dia", "c.veredito = 'nao_deu' and c.resolvida_em is null and c.criada_em < now() - interval '1 day'"],
  ])("%s", (_n, trecho) => {
    expect(SQL_PENDENTES).toContain(trecho);
  });
});
