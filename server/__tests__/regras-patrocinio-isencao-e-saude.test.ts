// ─────────────────────────────────────────────────────────────────────────────
// A ISENÇÃO E A ESPERA NÃO COEXISTEM — e a saúde dos dados vigia o resto.
// (incidente de 08/09: 12 peças do Ministério invisíveis por 11 dias)
//
// Veio de isencao-e-espera.test.ts (camadas 1 e 2, que liam storage.ts,
// services/consistencia.ts e a rota como texto). Aqui:
//   · storage.updateItem roda com o banco de mentira e se olha o SET que ele
//     manda — o SQL gerado, com os parâmetros;
//   · verificarConsistencia roda com respostas de mentira por consulta;
//   · a rota só-admin roda com req/res falsos.
// A camada "acrescentar patrocinador limpa a isenção" está em
// regras-patrocinio-vinculos.test.ts (a rota bulk-add-sponsor, rodando).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  sets: [] as any[],
  /** Resposta de cada consulta da saúde dos dados, pelo SQL dela. */
  responder: (async () => ({ rows: [] })) as (sqlTexto: string) => Promise<any>,
}));

vi.mock("../db", async () => {
  const { PgDialect } = await vi.importActual<any>("drizzle-orm/pg-core");
  const dialeto = new PgDialect();
  const db: any = {
    update: () => ({
      set: (dados: any) => {
        H.sets.push(dados);
        const q: any = { where: () => q, returning: async () => [{ id: "p1" }] };
        return q;
      },
    }),
    execute: async (q: any) => H.responder(dialeto.sqlToQuery(q).sql),
  };
  return { db, pool: {} };
});
vi.mock("../tempo-real", () => ({ publicarMensagem: vi.fn() }));
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return { ...real, requireAuth: (_req: any, _res: any, next: any) => next() };
});

import { PgDialect } from "drizzle-orm/pg-core";
import { storage } from "../storage";
import { verificarConsistencia } from "../services/consistencia";
import { registrarAvisos } from "../routes/itens/avisos";

const dialeto = new PgDialect();
const emSql = (q: any) => dialeto.sqlToQuery(q);
const ESPERA = "IN ('awaiting_sponsor_approval', 'awaiting_approval') THEN false ELSE";

beforeEach(() => {
  H.sets = [];
  H.responder = async () => ({ rows: [] });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("camada 1 — updateItem (o funil de toda escrita de peça) não escreve o par proibido", () => {
  it("mudou o status: a isenção passa a depender do status NOVO, e a antiga vem da coluna", async () => {
    await storage.updateItem("p1", { status: "awaiting_sponsor_approval" });
    const { sql, params } = emSql(H.sets[0].skipApproval);
    expect(sql).toBe(`CASE WHEN $1 ${ESPERA} "items"."skip_approval" END`);
    expect(params).toEqual(["awaiting_sponsor_approval"]);
  });

  it("mudou só a isenção: o status é lido da COLUNA — marcar isenção numa peça que já espera não passa", async () => {
    await storage.updateItem("p1", { skipApproval: true });
    const { sql, params } = emSql(H.sets[0].skipApproval);
    expect(sql).toBe(`CASE WHEN "items"."status" ${ESPERA} $1 END`);
    expect(params).toEqual([true]);
  });

  it("os dois no mesmo update: os dois valores novos entram na decisão", async () => {
    await storage.updateItem("p1", { status: "awaiting_approval", skipApproval: true });
    const { sql, params } = emSql(H.sets[0].skipApproval);
    expect(sql).toBe(`CASE WHEN $1 ${ESPERA} $2 END`);
    expect(params).toEqual(["awaiting_approval", true]);
  });

  it("update que não toca nenhum dos dois não mexe na isenção", async () => {
    await storage.updateItem("p1", { observations: "Ilhós a cada 50 cm" });
    expect(H.sets[0]).not.toHaveProperty("skipApproval");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("camada 2 — a saúde dos dados vê o que escapar", () => {
  it("pergunta exatamente pelo par proibido, e o achado explica o efeito para quem opera", async () => {
    H.responder = async (sql) => ({ rows: /skip_approval = true/.test(sql) ? [{ display_id: "#0101" }, { display_id: "#0102" }] : [] });
    const r = await verificarConsistencia();
    const isenta = r.achados.find((a) => a.chave === "isenta_aguardando")!;
    expect(isenta).toMatchObject({ gravidade: "critico", quantas: 2, amostra: ["#0101", "#0102"] });
    expect(isenta.explicacao).toContain("O Atendimento acredita na isenção e não mostra a peça");
    // e o SQL que casou é o do par proibido, não outro qualquer
    const consultas: string[] = [];
    H.responder = async (sql) => { consultas.push(sql); return { rows: [] }; };
    await verificarConsistencia();
    expect(consultas.some((s) => s.includes("status in ('awaiting_sponsor_approval','awaiting_approval') and skip_approval = true"))).toBe(true);
  });

  it("cobre as outras contradições que nenhuma tela vê sozinha — e peça de evento arquivado fica fora", async () => {
    const consultas: string[] = [];
    H.responder = async (sql) => { consultas.push(sql); return { rows: [{ display_id: "#1" }] }; };
    const r = await verificarConsistencia();
    const chaves = r.achados.map((a) => a.chave);
    for (const chave of ["isenta_aguardando", "aguardando_sem_patrocinador", "passou_com_pendencia", "conferido_sem_lastro", "evento_inexistente", "numero_duplicado"]) {
      expect(chaves).toContain(chave);
    }
    expect(r.verificadas).toBe(consultas.length);
    for (const s of consultas) expect(s).toContain("ea.arquivado_em is not null");
    expect(r.achados.find((a) => a.chave === "conferido_sem_lastro")!.explicacao).toContain("podem sair no caminhão sem existir");
  });

  it("uma verificação que quebra vira achado — nunca um 'está tudo certo' falso — e as outras seguem", async () => {
    H.responder = async (sql) => {
      if (/skip_approval = true/.test(sql)) throw new Error('column "skip_approval" does not exist');
      return { rows: /display_id having count/.test(sql) ? [{ display_id: "#7" }] : [] };
    };
    const r = await verificarConsistencia();
    const quebrada = r.achados.find((a) => a.chave === "isenta_aguardando")!;
    expect(quebrada.titulo).toContain("não conseguiu rodar");
    expect(quebrada.explicacao).toContain("este risco está sem vigilância");
    expect(quebrada.explicacao).toContain('column "skip_approval" does not exist');
    expect(r.achados.map((a) => a.chave)).toContain("numero_duplicado");
  });

  it("amostra de até 8 números; os críticos vêm primeiro", async () => {
    H.responder = async (sql) => ({
      rows: /skip_approval = true/.test(sql) ? Array.from({ length: 12 }, (_, i) => ({ display_id: `#${i}` }))
        : /status = 'delivered'/.test(sql) ? [{ display_id: null }] : [],
    });
    const r = await verificarConsistencia();
    expect(r.achados.map((a) => a.gravidade)).toEqual(["critico", "medio"]);
    expect(r.achados[0]).toMatchObject({ quantas: 12 });
    expect(r.achados[0].amostra).toHaveLength(8);
    expect(r.achados[1].amostra).toEqual(["—"]);
  });

  it("a rota é só do admin — a lista nomeia peças de todos os eventos", async () => {
    type Handler = (req: any, res: any, next: any) => any;
    const rotas = new Map<string, Handler[]>();
    const appFalso: any = {};
    for (const v of ["get", "post", "patch", "put", "delete"]) appFalso[v] = (c: string, ...hs: Handler[]) => { rotas.set(`${v.toUpperCase()} ${c}`, hs); return appFalso; };
    registrarAvisos(appFalso);
    const chamar = async (userRole: string) => {
      const req: any = { userRole, session: { userId: "u1", userRole } };
      const res: any = { _status: 200 };
      res.status = (c: number) => { res._status = c; return res; };
      res.json = (b: any) => { res._body = b; return res; };
      for (const h of rotas.get("GET /api/admin/consistencia")!) {
        let seguiu = false;
        await h(req, res, () => { seguiu = true; });
        if (!seguiu) break;
      }
      return res;
    };
    H.responder = async () => ({ rows: [{ display_id: "#1" }] });
    for (const papel of ["atendimento", "arte", "grafica", "solicitacao"]) {
      const r = await chamar(papel);
      expect(r._status, papel).toBe(403);
      expect(r._body.error).toBe("Apenas administradores podem ver a saude dos dados");
    }
    const r = await chamar("admin");
    expect(r._status).toBe(200);
    expect(r._body.achados.length).toBeGreaterThan(0);
  });
});
