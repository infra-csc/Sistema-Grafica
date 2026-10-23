// ─────────────────────────────────────────────────────────────────────────────
// KIT NUMA INCLUSÃO SÓ (dono, 23/10), contra um Postgres de verdade (PGlite):
//
//   · a JUNÇÃO da migração 0009: num evento com várias remessas, todas as peças
//     passam para a mais antiga (inclusive as excluídas), as outras linhas
//     somem, a trilha ganha uma linha por evento — e rodar de novo não faz
//     nada. Depois dela o índice único barra a segunda inclusão no evento;
//   · a primeira peça do Kit abre a inclusão; as planilhas seguintes só
//     ACRESCENTAM peças a ela (nada de V2);
//   · o usuário do Kit continua restrito: as peças dele entram no Kit do
//     evento (aberto por quem for), e ele só vê as que criou.
//
// Sem o PGlite instalado (pasta de ferramentas), o arquivo PULA com aviso.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { PGLITE_DISPONIVEL, subirBancoDeTeste, type BancoDeTeste } from "./banco-pglite";
import { montarApp, semearUsuarios, semearPeca, semearEvento, USUARIOS, type AppDeTeste, type Usuario } from "./app-com-banco";

vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));

const SQL_0009 = readFileSync(path.resolve(__dirname, "../../migrations/0009_juntar-remessas-do-kit.sql"), "utf8")
  .split("--> statement-breakpoint").map((c) => c.trim()).filter(Boolean);

const KIT: Usuario = { id: "u-kit", nome: "Kaio Kit", papel: "solicitacao", kit: true };
const KIT2: Usuario = { id: "u-kit2", nome: "Kátia Kit", papel: "solicitacao", kit: true };

describe.skipIf(!PGLITE_DISPONIVEL)("integração: Kit numa inclusão só", () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  const junta = async () => { for (const c of SQL_0009) await banco.consultar(c); };

  beforeAll(async () => {
    banco = await subirBancoDeTeste();
    await semearUsuarios(banco);
    for (const u of [KIT, KIT2]) {
      await banco.consultar(`INSERT INTO users (id, name, email, password_hash, role, kit) VALUES ($1, $2, $3, 'x', $4, true)`, [u.id, u.nome, `${u.id}@teste.local`, u.papel]);
    }
    await semearEvento(banco, "ev-junta", "EVENTO COM TRÊS REMESSAS", 40);
    await semearEvento(banco, "ev-um", "EVENTO COM UMA REMESSA", 40);
    await semearEvento(banco, "ev-novo", "EVENTO SEM KIT", 40);
    app = await montarApp();
  }, 120_000);

  afterAll(async () => {
    await app?.fechar();
    await banco?.parar();
  });

  it("a 0009 junta as remessas do evento na mais antiga, sem apagar peça — e é idempotente", async () => {
    // O banco de produção ANTES da 0009: várias remessas por evento, com data.
    await banco.consultar(`DROP INDEX IF EXISTS "UQ_kit_remessas_event"`);
    const rem = async (id: string, ev: string, versao: string, dia: string) => banco.consultar(
      `INSERT INTO kit_remessas (id, event_id, versao, entrega_material, criado_por_id, created_at) VALUES ($1, $2, $3, $4, 'u-kit', $5)`,
      [id, ev, versao, `2099-01-0${dia}T12:00:00Z`, `2026-09-0${dia}T12:00:00Z`],
    );
    await rem("r-v2", "ev-junta", "V2", "2");
    await rem("r-v1", "ev-junta", "V1", "1");
    await rem("r-v3", "ev-junta", "V3", "3");
    await rem("r-so", "ev-um", "V1", "1");
    const peca = (id: string, kit: string, extra: Record<string, unknown> = {}) =>
      semearPeca(banco, { id, eventId: kit === "r-so" ? "ev-um" : "ev-junta", displayId: `#${id}`, status: "draft", quantity: 1, extra: { kit_remessa_id: kit, criado_por_id: "u-kit", ...extra } });
    await peca("k1", "r-v1");
    await peca("k2", "r-v1");
    await peca("k3", "r-v2");
    await peca("k4", "r-v3", { deleted_at: new Date() }); // excluída: guarda a marca do Kit
    await peca("k5", "r-so");
    await semearPeca(banco, { id: "arena", eventId: "ev-junta", displayId: "#arena", status: "draft", quantity: 1 });

    await junta();

    const remessas = await banco.consultar<{ id: string; event_id: string }>(`SELECT id, event_id FROM kit_remessas ORDER BY event_id`);
    expect(remessas).toEqual([{ id: "r-v1", event_id: "ev-junta" }, { id: "r-so", event_id: "ev-um" }]);
    const pecas = await banco.consultar<{ id: string; kit_remessa_id: string | null }>(`SELECT id, kit_remessa_id FROM items WHERE id IN ('k1','k2','k3','k4','k5','arena') ORDER BY id`);
    expect(pecas).toEqual([
      { id: "arena", kit_remessa_id: null },
      { id: "k1", kit_remessa_id: "r-v1" }, { id: "k2", kit_remessa_id: "r-v1" },
      { id: "k3", kit_remessa_id: "r-v1" }, { id: "k4", kit_remessa_id: "r-v1" },
      { id: "k5", kit_remessa_id: "r-so" },
    ]);
    const trilha = await banco.consultar<{ entity_id: string; details: string }>(`SELECT entity_id, details FROM audit_logs WHERE user_name = 'Sistema (migração 0009)'`);
    expect(trilha).toHaveLength(1);
    expect(trilha[0].entity_id).toBe("ev-junta");
    expect(trilha[0].details).toBe("Kit numa inclusão só: 3 remessas juntadas (V1, V2, V3) na V1 — 2 peça(s) passaram para ela; nenhuma peça foi apagada");

    // De novo: nada muda, nenhuma trilha nova.
    await junta();
    expect(await banco.consultar(`SELECT id FROM kit_remessas ORDER BY event_id`)).toEqual([{ id: "r-v1" }, { id: "r-so" }]);
    expect(await banco.consultar(`SELECT 1 FROM audit_logs WHERE user_name = 'Sistema (migração 0009)'`)).toHaveLength(1);

    // Depois da junção: a inclusão não precisa de data, e não cabe uma segunda no evento.
    await expect(banco.consultar(`INSERT INTO kit_remessas (id, event_id, versao) VALUES ('r-dup', 'ev-junta', 'KIT')`)).rejects.toThrow();
    const coluna = await banco.consultar<{ is_nullable: string }>(`SELECT is_nullable FROM information_schema.columns WHERE table_name = 'kit_remessas' AND column_name = 'entrega_material'`);
    expect(coluna[0].is_nullable).toBe("YES");
  });

  it("a primeira peça do Kit abre a inclusão; as seguintes — à mão ou por planilha — entram NELA", async () => {
    const LINHA = { eventId: "ev-novo", type: "Pórtico", description: "x", quantity: 1, area: "9.00", visual: "9.00", material: "Lona", finish: "Ilhós", measurement: "3x3", calculatedM2: "9.00" };
    const primeira = await app.chamar<{ kitRemessaId: string }>(KIT, "POST", "/api/items", LINHA);
    expect(primeira.status, JSON.stringify(primeira.corpo)).toBe(201);
    const inclusao = primeira.corpo.kitRemessaId;
    expect(inclusao).toBeTruthy();
    // Outro usuário do Kit põe peça no MESMO Kit do evento (a inclusão é do evento).
    const daOutra = await app.chamar<{ kitRemessaId: string }>(KIT2, "POST", "/api/items", LINHA);
    expect(daOutra.corpo.kitRemessaId).toBe(inclusao);
    // A Solicitação marca "Kit" no formulário.
    const daSolicitacao = await app.chamar<{ kitRemessaId: string }>(USUARIOS.solicitacao, "POST", "/api/items", { ...LINHA, doKit: true });
    expect(daSolicitacao.corpo.kitRemessaId).toBe(inclusao);
    // Duas planilhas do Kit: as peças somam na mesma inclusão.
    const LINHA_DA_PLANILHA = { type: "Testeira", description: "A", quantity: 2, fileWidth: 3, fileHeight: 1, calculatedM2: 6, material: "Lona", finish: "Ilhós", measurement: "3.00 × 1.00", observations: "", suggestedSponsorIds: [], linha: 7 };
    for (const arquivo of ["kit-v1.xlsx", "kit-v2.xlsx"]) {
      const r = await app.chamar<{ imported: number; kitRemessaId: string }>(USUARIOS.solicitacao, "POST", "/api/events/ev-novo/confirm-import",
        { items: [LINHA_DA_PLANILHA, { ...LINHA_DA_PLANILHA, description: "B", linha: 8 }], fileName: arquivo, kit: { solicitante: "Bruno" } });
      expect(r.status, JSON.stringify(r.corpo)).toBe(201);
      expect(r.corpo.kitRemessaId).toBe(inclusao);
    }
    const linhas = await banco.consultar<{ id: string; arquivo: string | null; entrega_material: unknown }>(`SELECT id, arquivo, entrega_material FROM kit_remessas WHERE event_id = 'ev-novo'`);
    expect(linhas).toEqual([{ id: inclusao, arquivo: "kit-v2.xlsx", entrega_material: null }]);
    const [{ n }] = await banco.consultar<{ n: number }>(`SELECT count(*)::int AS n FROM items WHERE event_id = 'ev-novo' AND kit_remessa_id = $1`, [inclusao]);
    expect(n).toBe(7);
    // A rota devolve o Kit do evento: uma linha.
    const lida = await app.chamar<Array<{ id: string }>>(USUARIOS.arte, "GET", "/api/kit/remessas?eventId=ev-novo");
    expect(lida.corpo.map((r) => r.id)).toEqual([inclusao]);
  });

  it("o usuário do Kit continua restrito: só vê (e só mexe) nas peças do Kit que ele criou", async () => {
    const minhas = await app.chamar<Array<{ id: string; criadoPorId: string }>>(KIT, "GET", "/api/items/ev-novo");
    expect(minhas.status).toBe(200);
    expect(minhas.corpo.length).toBe(1);
    expect(minhas.corpo.every((p) => p.criadoPorId === KIT.id)).toBe(true);
    const daOutra = (await banco.consultar<{ id: string }>(`SELECT id FROM items WHERE criado_por_id = $1`, [KIT2.id]))[0].id;
    const mexer = await app.chamar(KIT, "PATCH", `/api/items/${daOutra}`, { description: "não é minha" });
    expect(mexer.status).toBe(403);
    // A Solicitação da Arena vê o Kit inteiro do evento.
    const tudo = await app.chamar<unknown[]>(USUARIOS.solicitacao, "GET", "/api/items/ev-novo");
    expect(tudo.corpo.length).toBe(7);
  });
});
