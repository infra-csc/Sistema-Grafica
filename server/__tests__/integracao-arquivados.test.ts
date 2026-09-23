// ─────────────────────────────────────────────────────────────────────────────
// INTEGRAÇÃO — ARQUIVAR, LISTAR E RESTAURAR, contra um Postgres de verdade.
//
// Achado na passada visual de 23/09: a lista de arquivados dizia "0 peças"
// para um evento arquivado com 3. A subconsulta de contagem usava
// `${events.id}` dentro do select, que o drizzle rende como "id" solto — e o
// banco o lia como o id da PEÇA. Banco de mentira não pega isso (ele não roda
// o SQL); só o SQL de verdade pega.
//
// Sem o PGlite instalado (pasta de ferramentas), o arquivo PULA com aviso.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGLITE_DISPONIVEL, subirBancoDeTeste, type BancoDeTeste } from "./banco-pglite";
import { montarApp, semearUsuarios, semearPeca, semearEvento, USUARIOS, type AppDeTeste } from "./app-com-banco";

vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));

type EventoArquivado = { id: string; name: string; totalPecas: number; arquivadoPor: string | null };

describe.skipIf(!PGLITE_DISPONIVEL)("integração: eventos arquivados", () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  const EV = "ev-arquivar";

  beforeAll(async () => {
    banco = await subirBancoDeTeste();
    await semearUsuarios(banco);
    await semearEvento(banco, EV, "EVENTO PARA ARQUIVAR", 40);
    for (const n of [1, 2, 3]) {
      await semearPeca(banco, { id: `p-arq-${n}`, eventId: EV, displayId: `#90${n}`, status: "draft", quantity: 1 });
    }
    // Peça na lixeira: NÃO volta ao restaurar, então não entra na contagem.
    await semearPeca(banco, { id: "p-arq-lixo", eventId: EV, displayId: "#909", status: "draft", quantity: 1, extra: { deleted_at: new Date() } });
    app = await montarApp();
  }, 120_000);

  afterAll(async () => {
    await app?.fechar();
    await banco?.parar();
  });

  it("a lista de arquivados conta as peças do PRÓPRIO evento (sem a lixeira)", async () => {
    const arquivar = await app.chamar(USUARIOS.admin, "DELETE", `/api/events/${EV}`);
    expect(arquivar.status, JSON.stringify(arquivar.corpo)).toBe(200);

    const lista = await app.chamar<EventoArquivado[]>(USUARIOS.admin, "GET", "/api/events/arquivados");
    expect(lista.status).toBe(200);
    const ev = lista.corpo.find((e) => e.id === EV);
    expect(ev, "o evento arquivado aparece na lista").toBeTruthy();
    expect(ev!.totalPecas, "3 peças vivas; a da lixeira fica de fora").toBe(3);
  });

  it("restaurar devolve o evento e as peças às telas", async () => {
    const r = await app.chamar(USUARIOS.admin, "POST", `/api/events/${EV}/restaurar`);
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    const lista = await app.chamar<EventoArquivado[]>(USUARIOS.admin, "GET", "/api/events/arquivados");
    expect(lista.corpo.find((e) => e.id === EV)).toBeUndefined();
    const vivos = await banco.consultar<{ n: number }>(`SELECT count(*)::int AS n FROM items WHERE event_id = $1 AND deleted_at IS NULL`, [EV]);
    expect(vivos[0].n).toBe(3);
  });
});
