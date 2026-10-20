// ─────────────────────────────────────────────────────────────────────────────
// TROCAR O PATROCINADOR DO EVENTO SEM CANCELAR PEÇAS — contra um Postgres de
// verdade (dono, 20/10).
//
// O caso que originou: "Longevidade Bradesco - Manaus" (16/10). Criaram
// "Bradesco Seguros", vincularam e, na mesma edição, tiraram "Bradesco": o
// desvínculo do evento cancelou as 13 peças que só tinham ele. A intenção era
// trocar. POST /api/events/:id/sponsors/trocar passa as peças para o novo numa
// transação só — e nenhuma é cancelada.
//
// O cenário cobre as quatro fases de shared/troca-de-patrocinador (faseNaTroca)
// e as bordas: aprovada do antigo preservada, novo que já tinha aprovado
// (a rodada fecha), peça na Gráfica, cancelada, lixeira, idempotência, cota,
// permissão, evento finalizado/arquivado e patrocinador arquivado.
//
// Sem o PGlite instalado (pasta de ferramentas), o arquivo PULA com aviso.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGLITE_DISPONIVEL, subirBancoDeTeste, type BancoDeTeste } from "./banco-pglite";
import { montarApp, semearUsuarios, semearPeca, semearEvento, USUARIOS, type AppDeTeste } from "./app-com-banco";
import type { ResultadoDaTroca, PecaNaSaida } from "@shared/troca-de-patrocinador";

vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));

const EV = "ev-manaus";
const BRAD = "sp-bradesco";
const SEG = "sp-bradesco-seguros";
const OUTRO = "sp-outro";
const ARQ = "sp-arquivado";

describe.skipIf(!PGLITE_DISPONIVEL)("integração: trocar o patrocinador do evento sem cancelar peças", () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;

  const vincular = async (itemId: string, sponsorId: string) =>
    banco.consultar(`INSERT INTO item_sponsors (item_id, sponsor_id) VALUES ($1, $2)`, [itemId, sponsorId]);
  const aprovacao = async (itemId: string, sponsorId: string, status: string) =>
    banco.consultar(`INSERT INTO item_sponsor_approvals (item_id, sponsor_id, status) VALUES ($1, $2, $3)`, [itemId, sponsorId, status]);
  const noEvento = async (eventId: string, sponsorId: string, quota: string | null) =>
    banco.consultar(`INSERT INTO event_sponsors (event_id, sponsor_id, quota) VALUES ($1, $2, $3)`, [eventId, sponsorId, quota]);
  const statusDe = async (id: string) =>
    (await banco.consultar<{ status: string }>(`SELECT status FROM items WHERE id = $1`, [id]))[0]?.status;
  const patrocinadoresDe = async (id: string) =>
    (await banco.consultar<{ sponsor_id: string }>(`SELECT sponsor_id FROM item_sponsors WHERE item_id = $1 ORDER BY sponsor_id`, [id])).map((r) => r.sponsor_id);
  const linhasDe = async (id: string) =>
    Object.fromEntries((await banco.consultar<{ sponsor_id: string; status: string }>(
      `SELECT sponsor_id, status FROM item_sponsor_approvals WHERE item_id = $1`, [id])).map((r) => [r.sponsor_id, r.status]));

  beforeAll(async () => {
    banco = await subirBancoDeTeste();
    await semearUsuarios(banco);
    for (const [id, nome] of [[BRAD, "Bradesco"], [SEG, "Bradesco Seguros"], [OUTRO, "Outro Patrocinador"], [ARQ, "Marca Arquivada"]]) {
      await banco.consultar(`INSERT INTO sponsors (id, name) VALUES ($1, $2)`, [id, nome]);
    }
    await banco.consultar(`UPDATE sponsors SET arquivado_em = now() WHERE id = $1`, [ARQ]);

    await semearEvento(banco, EV, "Longevidade Bradesco - Manaus", 30);
    await noEvento(EV, BRAD, "MASTER");
    await noEvento(EV, OUTRO, null);

    const p = (id: string, status: string, extra?: Record<string, unknown>) =>
      semearPeca(banco, { id, eventId: EV, displayId: `#${id}`, status, quantity: 1, extra });
    // antes da aprovação
    await p("p-rasc", "draft"); await vincular("p-rasc", BRAD);
    await p("p-envio", "awaiting_submission"); await vincular("p-envio", BRAD);
    // em aprovação, só ele, pendente
    await p("p-aprov", "awaiting_sponsor_approval"); await vincular("p-aprov", BRAD); await aprovacao("p-aprov", BRAD, "pending");
    // em aprovação, o antigo JÁ aprovou e o outro ainda não
    await p("p-mista", "awaiting_sponsor_approval"); await vincular("p-mista", BRAD); await vincular("p-mista", OUTRO);
    await aprovacao("p-mista", BRAD, "approved"); await aprovacao("p-mista", OUTRO, "pending");
    // em aprovação, o NOVO já estava e já aprovou; só faltava o antigo
    await p("p-fecha", "awaiting_sponsor_approval"); await vincular("p-fecha", BRAD); await vincular("p-fecha", SEG);
    await aprovacao("p-fecha", BRAD, "pending"); await aprovacao("p-fecha", SEG, "approved");
    // já passou da aprovação (finalização) e já na Gráfica
    await p("p-final", "sponsor_approved"); await vincular("p-final", BRAD); await aprovacao("p-final", BRAD, "approved");
    await p("p-grafica", "inProduction"); await vincular("p-grafica", BRAD); await aprovacao("p-grafica", BRAD, "approved");
    // cancelada antes, por outro motivo
    await p("p-canc", "canceled"); await vincular("p-canc", BRAD);
    // não é dele
    await p("p-outro", "draft"); await vincular("p-outro", OUTRO);
    // na lixeira
    await p("p-lixo", "draft", { deleted_at: new Date() }); await vincular("p-lixo", BRAD);

    app = await montarApp();
  }, 120_000);

  afterAll(async () => {
    await app?.fechar();
    await banco?.parar();
  });

  it("GET …/sponsors/pecas: as peças vivas de quem sai, com TODOS os patrocinadores de cada uma", async () => {
    const r = await app.chamar<{ pecas: PecaNaSaida[] }>(USUARIOS.atendimento, "GET", `/api/events/${EV}/sponsors/pecas?ids=${BRAD}`);
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    const ids = r.corpo.pecas.map((x) => x.id).sort();
    expect(ids).toEqual(["p-aprov", "p-canc", "p-envio", "p-fecha", "p-final", "p-grafica", "p-mista", "p-rasc"]);
    expect(r.corpo.pecas.find((x) => x.id === "p-mista")!.sponsorIds.sort()).toEqual([BRAD, OUTRO]);
  });

  it("papel sem vínculo (Gráfica) não troca — mesma régua do desvincular", async () => {
    const r = await app.chamar(USUARIOS.grafica, "POST", `/api/events/${EV}/sponsors/trocar`, { de: BRAD, para: SEG });
    expect(r.status).toBe(403);
    expect(await patrocinadoresDe("p-rasc")).toEqual([BRAD]);
  });

  it("destino igual à origem e destino arquivado são recusados antes de mexer em qualquer peça", async () => {
    const igual = await app.chamar(USUARIOS.atendimento, "POST", `/api/events/${EV}/sponsors/trocar`, { de: BRAD, para: BRAD });
    expect(igual.status).toBe(400);
    const arquivado = await app.chamar<{ code: string }>(USUARIOS.atendimento, "POST", `/api/events/${EV}/sponsors/trocar`, { de: BRAD, para: ARQ });
    expect(arquivado.status).toBe(409);
    expect(arquivado.corpo.code).toBe("ARCHIVED");
    expect(await patrocinadoresDe("p-aprov")).toEqual([BRAD]);
  });

  it("troca: as peças passam para o novo e NENHUMA é cancelada", async () => {
    const r = await app.chamar<ResultadoDaTroca>(USUARIOS.atendimento, "POST", `/api/events/${EV}/sponsors/trocar`, { de: BRAD, para: SEG });
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    const res = r.corpo;
    expect(res.canceladas).toBe(0);
    expect(res.pecas).toBe(8);
    expect(res.passaram).toBe(8);
    expect(res.jaTinhamONovo).toBe(1); // p-fecha
    expect(res.pendenciasAbertas).toBe(2); // p-aprov e p-mista
    expect(res.pendenciasDescartadas).toBe(2); // p-aprov e p-fecha
    expect(res.aprovacoesMantidas).toBe(3); // p-mista, p-final, p-grafica
    expect(res.semReabrir).toBe(2); // p-final e p-grafica
    expect(res.rodadasFechadas).toBe(1); // p-fecha
    expect(res.vinculoDoNovo).toBe("criado");
    expect(res.cotaHerdada).toBe("MASTER");
    expect(res.resumo).toContain('Patrocinador "Bradesco" trocado por "Bradesco Seguros" no evento');
    expect(res.resumo).toContain("8 peças passaram para o novo; nenhuma cancelada; 2 aprovações pendentes abertas para o novo");

    // nenhum status virou "canceled" (a única cancelada já era)
    for (const id of ["p-rasc", "p-envio", "p-aprov", "p-mista", "p-final", "p-grafica"]) {
      expect(await statusDe(id), id).not.toBe("canceled");
    }
    expect(await statusDe("p-canc")).toBe("canceled");
    // todas com o novo, nenhuma com o antigo
    for (const id of ["p-rasc", "p-envio", "p-aprov", "p-final", "p-grafica", "p-canc"]) {
      expect(await patrocinadoresDe(id), id).toEqual([SEG]);
    }
    expect(await patrocinadoresDe("p-mista")).toEqual([SEG, OUTRO].sort());
  });

  it("aprovação: pendente só nas peças com a rodada aberta; aprovada do antigo fica na trilha", async () => {
    // antes da aprovação: nenhuma linha (a rodada nasce dos vínculos no envio da Arte)
    expect(await linhasDe("p-rasc")).toEqual({});
    expect(await linhasDe("p-envio")).toEqual({});
    // em aprovação: a pendente do antigo saiu, a do novo nasceu
    expect(await linhasDe("p-aprov")).toEqual({ [SEG]: "pending" });
    expect(await statusDe("p-aprov")).toBe("awaiting_sponsor_approval");
    // o antigo já tinha aprovado: a aprovação dele fica; o novo entra pendente
    expect(await linhasDe("p-mista")).toEqual({ [BRAD]: "approved", [OUTRO]: "pending", [SEG]: "pending" });
    // depois da aprovação e na Gráfica: troca o vínculo SEM reabrir
    expect(await statusDe("p-final")).toBe("sponsor_approved");
    expect(await linhasDe("p-final")).toEqual({ [BRAD]: "approved" });
    expect(await statusDe("p-grafica")).toBe("inProduction");
    expect(await linhasDe("p-grafica")).toEqual({ [BRAD]: "approved" });
  });

  it("o novo já tinha aprovado e só faltava o antigo: a rodada fecha e a peça segue", async () => {
    expect(await statusDe("p-fecha")).toBe("sponsor_approved");
    expect(await linhasDe("p-fecha")).toEqual({ [SEG]: "approved" });
    const avisoArte = await banco.consultar(`SELECT 1 FROM notifications WHERE item_id = 'p-fecha' AND type = 'arteApproved'`);
    expect(avisoArte.length).toBe(1);
  });

  it("peça de outro patrocinador e peça na lixeira não são tocadas", async () => {
    expect(await patrocinadoresDe("p-outro")).toEqual([OUTRO]);
    expect(await patrocinadoresDe("p-lixo")).toEqual([BRAD]);
  });

  it("o evento: o novo entra com a cota do antigo, o antigo sai", async () => {
    const v = await banco.consultar<{ sponsor_id: string; quota: string | null }>(
      `SELECT sponsor_id, quota FROM event_sponsors WHERE event_id = $1 ORDER BY sponsor_id`, [EV]);
    expect(v).toEqual([{ sponsor_id: SEG, quota: "MASTER" }, { sponsor_id: OUTRO, quota: null }].sort((a, b) => a.sponsor_id.localeCompare(b.sponsor_id)));
  });

  it("trilha por peça + resumo no evento; o Atendimento recebe UM aviso das aprovações novas", async () => {
    const porPeca = await banco.consultar<{ details: string }>(`SELECT details FROM audit_logs WHERE entity_type = 'item' AND entity_id = 'p-final'`);
    expect(porPeca.map((l) => l.details).join(" | ")).toContain("a aprovação NÃO foi reaberta");
    const doEvento = await banco.consultar<{ details: string; user_name: string }>(`SELECT details, user_name FROM audit_logs WHERE entity_type = 'event' AND entity_id = $1`, [EV]);
    expect(doEvento.length).toBe(1);
    expect(doEvento[0].details).toContain("nenhuma cancelada");
    expect(doEvento[0].user_name).toBe(USUARIOS.atendimento.nome);
    const aviso = await banco.consultar<{ message: string; target_roles: string[] }>(
      `SELECT message, target_roles FROM notifications WHERE event_id = $1 AND type = 'itemAdded'`, [EV]);
    expect(aviso.length).toBe(1);
    expect(aviso[0].target_roles).toEqual(["atendimento"]);
    expect(aviso[0].message).toContain("2 peças aguardam a aprovação do novo patrocinador");
  });

  it("IDEMPOTENTE: repetir a troca não muda nada nem suja a trilha", async () => {
    const antes = await banco.consultar<{ n: number }>(`SELECT count(*)::int AS n FROM audit_logs`);
    const r = await app.chamar<ResultadoDaTroca>(USUARIOS.atendimento, "POST", `/api/events/${EV}/sponsors/trocar`, { de: BRAD, para: SEG });
    expect(r.status).toBe(200);
    expect(r.corpo.nadaATrocar).toBe(true);
    expect(r.corpo.pecas).toBe(0);
    const depois = await banco.consultar<{ n: number }>(`SELECT count(*)::int AS n FROM audit_logs`);
    expect(depois[0].n).toBe(antes[0].n);
    expect(await linhasDe("p-aprov")).toEqual({ [SEG]: "pending" });
  });

  it("o novo JÁ estava no evento com cota própria: a cota dele fica", async () => {
    const EV2 = "ev-cota";
    await semearEvento(banco, EV2, "EVENTO COM COTA", 30);
    await noEvento(EV2, BRAD, "MASTER");
    await noEvento(EV2, SEG, "GOLD");
    await semearPeca(banco, { id: "q-1", eventId: EV2, displayId: "#q1", status: "draft", quantity: 1 });
    await vincular("q-1", BRAD);
    const r = await app.chamar<ResultadoDaTroca>(USUARIOS.solicitacao, "POST", `/api/events/${EV2}/sponsors/trocar`, { de: BRAD, para: SEG });
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    expect(r.corpo.vinculoDoNovo).toBe("ja_existia");
    expect(r.corpo.cotaHerdada).toBeNull();
    const v = await banco.consultar<{ sponsor_id: string; quota: string }>(`SELECT sponsor_id, quota FROM event_sponsors WHERE event_id = $1`, [EV2]);
    expect(v).toEqual([{ sponsor_id: SEG, quota: "GOLD" }]);
  });

  it("evento já realizado: 409 EVENT_FINALIZED, nada muda", async () => {
    const EV3 = "ev-passou";
    await semearEvento(banco, EV3, "EVENTO QUE JÁ FOI", -5);
    await noEvento(EV3, BRAD, null);
    await semearPeca(banco, { id: "r-1", eventId: EV3, displayId: "#r1", status: "draft", quantity: 1 });
    await vincular("r-1", BRAD);
    const r = await app.chamar<{ code: string }>(USUARIOS.admin, "POST", `/api/events/${EV3}/sponsors/trocar`, { de: BRAD, para: SEG });
    expect(r.status).toBe(409);
    expect(r.corpo.code).toBe("EVENT_FINALIZED");
    expect(await patrocinadoresDe("r-1")).toEqual([BRAD]);
  });

  it("evento encerrado à mão e evento arquivado: 409 também", async () => {
    const EV4 = "ev-fechado";
    await semearEvento(banco, EV4, "EVENTO ENCERRADO", 30);
    await banco.consultar(`UPDATE events SET status = 'closed' WHERE id = $1`, [EV4]);
    await noEvento(EV4, BRAD, null);
    const fechado = await app.chamar<{ code: string; reason: string }>(USUARIOS.admin, "POST", `/api/events/${EV4}/sponsors/trocar`, { de: BRAD, para: SEG });
    expect(fechado.status).toBe(409);
    expect(fechado.corpo.reason).toBe("encerrado");

    const EV5 = "ev-arquivado";
    await semearEvento(banco, EV5, "EVENTO ARQUIVADO", 30);
    await banco.consultar(`UPDATE events SET arquivado_em = now() WHERE id = $1`, [EV5]);
    const arq = await app.chamar<{ code: string }>(USUARIOS.admin, "POST", `/api/events/${EV5}/sponsors/trocar`, { de: BRAD, para: SEG });
    // evento arquivado some das leituras: 404 (não achado) ou 409 (arquivado) — nunca 200
    expect([404, 409]).toContain(arq.status);
  });

  it('"Só remover" (o DELETE de sempre) continua cancelando a peça que só tinha ele', async () => {
    const EV6 = "ev-so-remover";
    await semearEvento(banco, EV6, "SAIU DE VERDADE", 30);
    await noEvento(EV6, BRAD, null);
    await semearPeca(banco, { id: "s-1", eventId: EV6, displayId: "#s1", status: "awaiting_submission", quantity: 1 });
    await vincular("s-1", BRAD);
    const r = await app.chamar<{ pecasInativadas: number }>(USUARIOS.atendimento, "DELETE", `/api/events/${EV6}/sponsors/${BRAD}`);
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    expect(r.corpo.pecasInativadas).toBe(1);
    expect(await statusDe("s-1")).toBe("canceled");
  });
});
