// ─────────────────────────────────────────────────────────────────────────────
// INTEGRAÇÃO — SUGESTÃO E VÍNCULO AUTOMÁTICO, contra um Postgres de verdade
// (dono, 15/10: "deixar automático; com base no histórico, via cota, ver
// padrões").
//
// O cenário: quatro eventos passados ensinam o padrão (pórtico leva o elenco;
// MASTER vai no display; o Itaú é MASTER em todos) e um evento futuro tem a
// lista em rascunho. O envio da lista é onde a peça ENTRA na vinculação — e é
// ali que o automático age, só onde acerta ~100%. O resto vira sugestão, que
// a tela lê e aplica; o servidor recalcula, não confia na lista do cliente.
//
// Sem o PGlite instalado (pasta de ferramentas), o arquivo PULA com aviso.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGLITE_DISPONIVEL, subirBancoDeTeste, type BancoDeTeste } from "./banco-pglite";
import { montarApp, semearUsuarios, semearPeca, semearEvento, USUARIOS, type AppDeTeste } from "./app-com-banco";

vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));

type Sugestao = { sponsorId: string; regra: string; confianca: number; motivo: string; automatica: boolean };
type DoEvento = { porPeca: Record<string, Sugestao[]>; automaticos: Record<string, Array<{ sponsorId: string; motivo: string }>> };

const EV = "ev-sug";
const EV_FECHADO = "ev-sug-fechado";
const SP = { itau: "sp-itau", nike: "sp-nike", gat: "sp-gat", uni: "sp-uni", zeta: "sp-zeta" };

describe.skipIf(!PGLITE_DISPONIVEL)("integração: sugestão de vínculo e vínculo automático", () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let seq = 100;
  const peca = async (id: string, eventId: string, tipo: string, descricao: string, status: string, extra: Record<string, unknown> = {}) => {
    seq++;
    await semearPeca(banco, { id, eventId, displayId: `#${seq}`, status, quantity: 1, type: tipo, extra: { description: descricao, ...extra } });
  };
  const vinculosDe = async (itemId: string) =>
    (await banco.consultar<{ sponsor_id: string }>(`SELECT sponsor_id FROM item_sponsors WHERE item_id = $1 ORDER BY sponsor_id`, [itemId])).map((r) => r.sponsor_id);
  const statusDe = async (itemId: string) =>
    (await banco.consultar<{ status: string }>(`SELECT status FROM items WHERE id = $1`, [itemId]))[0]?.status;

  beforeAll(async () => {
    banco = await subirBancoDeTeste();
    await semearUsuarios(banco);
    for (const [k, id] of Object.entries(SP)) {
      const nome = { itau: "Itaú", nike: "Nike", gat: "Gatorade", uni: "Unimed", zeta: "Zeta" }[k];
      await banco.consultar(`INSERT INTO sponsors (id, name, arquivado_em) VALUES ($1, $2, $3)`, [id, nome, k === "zeta" ? new Date() : null]);
    }

    // ── O histórico: 4 eventos passados ──
    for (let e = 1; e <= 4; e++) {
      const ev = `ev-hist-${e}`;
      await semearEvento(banco, ev, `CIRCUITO ${e} 2026`, -100 + e * 10);
      for (const [sid, cota] of [[SP.itau, "MASTER"], [SP.nike, "GOLD"], [SP.gat, null], [SP.uni, null]] as const) {
        await banco.consultar(`INSERT INTO event_sponsors (event_id, sponsor_id, quota) VALUES ($1, $2, $3)`, [ev, sid, cota]);
      }
      const todos = [SP.itau, SP.nike, SP.gat, SP.uni];
      const pecasDoEvento: Array<[string, string, string[]]> = [
        ["Pórtico Chegada", "Pórtico de chegada", todos],
        ["Pórtico Chegada", "Pórtico de largada", todos],
        ["Pórtico Chegada", "Pórtico bem vindos", todos.slice(0, 3)],
        ["Display", "Display entrada", [SP.itau]],
        ["Display", "Display saída", [SP.itau]],
        ...todos.map((s, i) => ["Rolo", `Rolo ${i}`, [s]] as [string, string, string[]]),
      ];
      for (const [i, [tipo, desc, sps]] of pecasDoEvento.entries()) {
        const id = `h${e}-${i}`;
        await peca(id, ev, tipo, desc, "delivered");
        for (const s of sps) await banco.consultar(`INSERT INTO item_sponsors (item_id, sponsor_id) VALUES ($1, $2)`, [id, s]);
      }
    }

    // ── O evento em jogo: Itaú SEM cota neste evento (vem do histórico) ──
    await semearEvento(banco, EV, "MARATONA FUTURA 2099", 40);
    for (const sid of [SP.itau, SP.nike, SP.gat, SP.uni, SP.zeta]) {
      await banco.consultar(`INSERT INTO event_sponsors (event_id, sponsor_id) VALUES ($1, $2)`, [EV, sid]);
    }
    await peca("p-rolo-itau", EV, "Rolo", "Rolo Itaú 2x1", "draft");
    await peca("p-portico", EV, "Pórtico Chegada", "Pórtico chegada Itaú", "draft");
    await peca("p-display", EV, "Display", "Display principal", "draft");
    await peca("p-itauna", EV, "Rolo", "Rolo Itaúna", "draft");
    await peca("p-molde", EV, "Molde", "Molde Itaú", "draft");
    await peca("p-interna", EV, "Rolo", "Rolo Itaú interno", "draft", { producao_interna: true, instrucoes_grafica: "Imprimir igual ao anterior" });
    await peca("p-dois", EV, "Rolo", "Rolo Itaú e Nike", "draft");
    await peca("p-ja-tem", EV, "Rolo", "Rolo Nike", "draft");
    await banco.consultar(`INSERT INTO item_sponsors (item_id, sponsor_id) VALUES ('p-ja-tem', $1)`, [SP.gat]);
    await peca("p-zeta", EV, "Rolo", "Rolo Zeta", "draft");
    await peca("p-isenta", EV, "Rolo", "Rolo Itaú isento", "draft", { skip_approval: true });

    // Peça do KIT já na vinculação: a Solicitação da Arena só a visualiza.
    await banco.consultar(`INSERT INTO kit_remessas (id, event_id, versao, entrega_material) VALUES ('kit-1', $1, 'V1', now() + interval '30 days')`, [EV]);
    await peca("p-kit", EV, "Pórtico Chegada", "Pórtico do Kit", "awaiting_linking", { kit_remessa_id: "kit-1", criado_por_id: USUARIOS.admin.id });

    // Evento já realizado, com peça na vinculação.
    await semearEvento(banco, EV_FECHADO, "PROVA QUE JÁ FOI", -3);
    await banco.consultar(`INSERT INTO event_sponsors (event_id, sponsor_id) VALUES ($1, $2)`, [EV_FECHADO, SP.itau]);
    await peca("p-fechado", EV_FECHADO, "Rolo", "Rolo Itaú", "awaiting_linking");

    app = await montarApp();
  }, 180_000);

  afterAll(async () => {
    await app?.fechar();
    await banco?.parar();
  });

  it("o envio da lista vincula SOZINHO só o nome único — e nada mais", async () => {
    const r = await app.chamar<{ vinculadasAutomaticamente: number }>(USUARIOS.solicitacao, "POST", `/api/events/${EV}/items/submit`, {});
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    expect(r.corpo.vinculadasAutomaticamente).toBe(1);

    expect(await vinculosDe("p-rolo-itau")).toEqual([SP.itau]);
    // o status NÃO muda além do envio (vincular à mão também não muda)
    expect(await statusDe("p-rolo-itau")).toBe("awaiting_linking");
    // estrutura, cota, ambíguo, palavra parcial: sugestão, não vínculo
    for (const id of ["p-portico", "p-display", "p-dois", "p-itauna"]) expect(await vinculosDe(id), id).toEqual([]);
    // as guardas: molde, produção interna, "sem patrocinador", arquivado, já vinculada
    expect(await vinculosDe("p-molde")).toEqual([]);
    expect(await vinculosDe("p-interna")).toEqual([]);
    expect(await vinculosDe("p-isenta")).toEqual([]);
    expect(await vinculosDe("p-zeta")).toEqual([]);
    expect(await vinculosDe("p-ja-tem")).toEqual([SP.gat]);

    const trilha = await banco.consultar<{ details: string; user_name: string }>(
      `SELECT details, user_name FROM audit_logs WHERE entity_type = 'item' AND entity_id = 'p-rolo-itau' AND action = 'added'`);
    expect(trilha.map((t) => t.details)).toEqual(['Patrocinador "Itaú" vinculado automaticamente — o nome está na descrição']);
    expect(trilha[0].user_name).toBe(USUARIOS.solicitacao.nome);
  });

  it("a leitura traz as sugestões calculadas do histórico e o selo do automático", async () => {
    const r = await app.chamar<DoEvento>(USUARIOS.arte, "GET", `/api/events/${EV}/sugestoes-de-vinculo`);
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    const { porPeca, automaticos } = r.corpo;

    // pórtico: o elenco ATIVO inteiro (Zeta está arquivado)
    expect(porPeca["p-portico"].map((s) => s.sponsorId).sort()).toEqual([SP.gat, SP.itau, SP.nike, SP.uni].sort());
    expect(porPeca["p-portico"].every((s) => !s.automatica)).toBe(true);
    expect(porPeca["p-portico"].find((s) => s.sponsorId === SP.gat)!.motivo).toBe("Peça de estrutura: leva os patrocinadores do evento");
    // display: MASTER pela cota do HISTÓRICO do Itaú
    expect(porPeca["p-display"]).toEqual([expect.objectContaining({
      sponsorId: SP.itau, regra: "cota",
      motivo: "MASTER costuma ir em Display (4 de 4 eventos) — cota pelo histórico do patrocinador",
    })]);
    // ambíguo: os dois
    expect(porPeca["p-dois"].map((s) => s.sponsorId).sort()).toEqual([SP.itau, SP.nike].sort());
    // sem sugestão: palavra parcial, quem já tem vínculo, molde, isenta
    for (const id of ["p-itauna", "p-ja-tem", "p-molde", "p-isenta", "p-rolo-itau"]) expect(porPeca[id], id).toBeUndefined();
    // o automático gravado
    expect(automaticos["p-rolo-itau"]).toEqual([{ sponsorId: SP.itau, motivo: "O nome está na descrição" }]);
  });

  it("a leitura em lote e o papel: Gráfica não lê; evento fechado não sugere", async () => {
    const lote = await app.chamar<Record<string, DoEvento>>(USUARIOS.atendimento, "GET", `/api/sugestoes-de-vinculo?eventId=${EV},${EV_FECHADO}`);
    expect(lote.status).toBe(200);
    expect(Object.keys(lote.corpo)).toEqual([EV]);
    expect((await app.chamar(USUARIOS.grafica, "GET", `/api/events/${EV}/sugestoes-de-vinculo`)).status).toBe(403);
    expect((await app.chamar(USUARIOS.grafica, "POST", `/api/events/${EV}/sugestoes-de-vinculo/aplicar`, {})).status).toBe(403);
  });

  it("aplicar RECALCULA no servidor: a lista do cliente só recorta quais peças", async () => {
    const r = await app.chamar<{ aplicadas: Array<{ itemId: string; sponsorIds: string[] }>; vinculos: number }>(
      USUARIOS.arte, "POST", `/api/events/${EV}/sugestoes-de-vinculo/aplicar`,
      // p-ja-tem (já vinculada), p-molde, p-fechado (outro evento) e um id inventado ficam de fora
      { itemIds: ["p-portico", "p-display", "p-ja-tem", "p-molde", "p-fechado", "nao-existe"] },
    );
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    expect(r.corpo.aplicadas.map((a) => a.itemId).sort()).toEqual(["p-display", "p-portico"]);
    expect(r.corpo.vinculos).toBe(5);
    expect(await vinculosDe("p-portico")).toEqual([SP.gat, SP.itau, SP.nike, SP.uni].sort());
    expect(await vinculosDe("p-display")).toEqual([SP.itau]);
    expect(await vinculosDe("p-ja-tem")).toEqual([SP.gat]);
    expect(await vinculosDe("p-fechado")).toEqual([]);
    // fora da lista: intocada
    expect(await vinculosDe("p-dois")).toEqual([]);
    // mesmo tratamento de status da vinculação manual: não muda
    expect(await statusDe("p-portico")).toBe("awaiting_linking");
    const trilha = await banco.consultar<{ details: string }>(`SELECT details FROM audit_logs WHERE entity_id = 'p-display' AND action = 'added'`);
    expect(trilha[0].details).toMatch(/^Sugestão de vínculo aplicada na peça #\d+: "Itaú" \(MASTER costuma ir em Display/);
  });

  it("aplicar no evento já realizado responde 409 e não grava", async () => {
    const r = await app.chamar<{ code: string }>(USUARIOS.admin, "POST", `/api/events/${EV_FECHADO}/sugestoes-de-vinculo/aplicar`, {});
    expect(r.status).toBe(409);
    expect(r.corpo.code).toBe("EVENT_FINALIZED");
    expect(await vinculosDe("p-fechado")).toEqual([]);
  });

  it("aplicar sem lista aplica o que sobrou do evento; lista mal formada é 400", async () => {
    expect((await app.chamar(USUARIOS.admin, "POST", `/api/events/${EV}/sugestoes-de-vinculo/aplicar`, { itemIds: "p-dois" })).status).toBe(400);
    const r = await app.chamar<{ aplicadas: Array<{ itemId: string }> }>(USUARIOS.solicitacao, "POST", `/api/events/${EV}/sugestoes-de-vinculo/aplicar`, {});
    expect(r.status).toBe(200);
    // a Solicitação da Arena não alcança a peça do Kit: sem lista, ela fica de fora
    expect(r.corpo.aplicadas.map((a) => a.itemId)).toEqual(["p-dois"]);
    expect(await vinculosDe("p-kit")).toEqual([]);
    // com a peça do Kit na lista, a trava da Solicitação responde 403 (como no vínculo à mão)
    expect((await app.chamar(USUARIOS.solicitacao, "POST", `/api/events/${EV}/sugestoes-de-vinculo/aplicar`, { itemIds: ["p-kit"] })).status).toBe(403);
    // o admin aplica
    const admin = await app.chamar<{ aplicadas: Array<{ itemId: string }> }>(USUARIOS.admin, "POST", `/api/events/${EV}/sugestoes-de-vinculo/aplicar`, { itemIds: ["p-kit"] });
    expect(admin.corpo.aplicadas.map((a) => a.itemId)).toEqual(["p-kit"]);
    const depois = await app.chamar<DoEvento>(USUARIOS.arte, "GET", `/api/events/${EV}/sugestoes-de-vinculo`);
    expect(depois.corpo.porPeca).toEqual({});
  });

  it("cota sugerida: a mais recente em outros eventos", async () => {
    const r = await app.chamar<Record<string, { cota: string; seguidos: number; eventos: number }>>(USUARIOS.solicitacao, "GET", "/api/cotas-sugeridas");
    expect(r.status).toBe(200);
    expect(r.corpo[SP.itau]).toEqual({ cota: "MASTER", seguidos: 4, eventos: 4 });
    expect(r.corpo[SP.nike]).toEqual({ cota: "GOLD", seguidos: 4, eventos: 4 });
    expect(r.corpo[SP.gat]).toBeUndefined();
    const exceto = await app.chamar<Record<string, { seguidos: number }>>(USUARIOS.solicitacao, "GET", "/api/cotas-sugeridas?exceto=ev-hist-4");
    expect(exceto.corpo[SP.itau].seguidos).toBe(3);
  });
});
