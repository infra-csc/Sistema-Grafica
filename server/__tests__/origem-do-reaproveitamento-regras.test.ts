// ─────────────────────────────────────────────────────────────────────────────
// DE ONDE VEM O REAPROVEITAMENTO — as regras puras, o schema e a migração
// (dono, 16/10: caminhões conjugados; "Estoque" ou "Em trânsito").
//
//   · o corpo: origem válida, "em trânsito" pede a observação, lixo é recusado;
//   · a CONTA FÍSICA: as unidades em trânsito saem de conferir, embalar e
//     entregar — tetos, fechamento da conferência, da embalagem e da entrega;
//   · a etapa refeita quando a origem muda, e a recusa quando o galpão já
//     conferiu as reaproveitadas;
//   · as duas colunas no schema, na migração 0006 (aditiva, idempotente) e na
//     migração aditiva de produção.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { getTableColumns } from "drizzle-orm";
import {
  lerOrigemDoCorpo, quantidadeFisicaDe, emTransitoDe, doEstoqueDe, todaEmTransito, reaproveitadasDe,
  etapaPelaQuantidadeFisica, statusAposMudarAOrigem, recusaDaTrocaDeOrigem, fraseDaTrilhaDaOrigem,
  fraseDoFechamentoEmTransito, dicaDaOrigem, OBS_DO_REAPROVEITAMENTO_MAX, INSTRUCAO_EM_TRANSITO,
} from "@shared/origem-do-reaproveitamento";
import {
  tetoDaConferencia, aConferir, planejarConferencia, planejarEmbalar, planejarEntrega, aEmbalar,
  todaEmbalada, violacoesDaConta, progressoDaEmbalagem,
} from "@shared/embalagem";
import { items, insertItemSchema, publicInsertItemSchema } from "@shared/schema";
import { remainingConfer, remainingDeliver, canConfer } from "../../client/src/lib/saldo";

const RAIZ = path.resolve(__dirname, "..", "..");
const OBS = "Night Run Salvador, etapa 17/10";
/** Peça de 10: 6 impressas, 4 reaproveitadas. */
const parcial = (over: Record<string, unknown> = {}) => ({
  quantity: 10, quantityProduced: 6, reuseQty: 4, isReuse: false, conferredQty: 0, embaladaQty: 0, deliveredQty: 0,
  status: "produced", origemReaproveitamento: "em_transito", obsReaproveitamento: OBS, ...over,
});

describe("o corpo da requisição", () => {
  it("nenhum dos dois campos = não mexe na origem", () => {
    expect(lerOrigemDoCorpo({ qty: 2 })).toEqual({ ok: true, veio: false });
    expect(lerOrigemDoCorpo(undefined)).toEqual({ ok: true, veio: false });
  });
  it("estoque com e sem observação; espaços normalizados", () => {
    expect(lerOrigemDoCorpo({ origemReaproveitamento: "estoque" })).toEqual({ ok: true, veio: true, origem: "estoque", obs: null });
    expect(lerOrigemDoCorpo({ origemReaproveitamento: "estoque", obsReaproveitamento: "  Galpão   B  " }))
      .toEqual({ ok: true, veio: true, origem: "estoque", obs: "Galpão B" });
  });
  it("em trânsito SEM observação é recusado com a instrução", () => {
    for (const obs of [undefined, "", "  ", "ab"]) {
      const r = lerOrigemDoCorpo({ origemReaproveitamento: "em_transito", obsReaproveitamento: obs });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toContain(INSTRUCAO_EM_TRANSITO.toLowerCase());
    }
    expect(lerOrigemDoCorpo({ origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }))
      .toEqual({ ok: true, veio: true, origem: "em_transito", obs: OBS });
  });
  it("valor inválido, observação que não é texto ou longa demais: recusa", () => {
    for (const origem of ["tapecaria", "EM_TRANSITO", 1, true, {}]) {
      expect(lerOrigemDoCorpo({ origemReaproveitamento: origem }).ok, String(origem)).toBe(false);
    }
    expect(lerOrigemDoCorpo({ origemReaproveitamento: "estoque", obsReaproveitamento: 12 }).ok).toBe(false);
    expect(lerOrigemDoCorpo({ origemReaproveitamento: "estoque", obsReaproveitamento: "x".repeat(OBS_DO_REAPROVEITAMENTO_MAX + 1) }).ok).toBe(false);
  });
  it("null ou \"\" limpa a origem — e a observação some junto", () => {
    expect(lerOrigemDoCorpo({ origemReaproveitamento: null, obsReaproveitamento: "sobrou" })).toEqual({ ok: true, veio: true, origem: null, obs: null });
    expect(lerOrigemDoCorpo({ origemReaproveitamento: "" })).toEqual({ ok: true, veio: true, origem: null, obs: null });
  });
});

describe("a conta física", () => {
  it("em trânsito sai da quantidade física; estoque e sem origem não", () => {
    expect(quantidadeFisicaDe(parcial())).toBe(6);
    expect(emTransitoDe(parcial())).toBe(4);
    expect(quantidadeFisicaDe(parcial({ origemReaproveitamento: "estoque" }))).toBe(10);
    expect(doEstoqueDe(parcial({ origemReaproveitamento: "estoque" }))).toBe(4);
    expect(quantidadeFisicaDe(parcial({ origemReaproveitamento: null }))).toBe(10);
    // reuso legado (isReuse com reuseQty 0) vale a peça inteira
    expect(reaproveitadasDe({ quantity: 5, reuseQty: 0, isReuse: true })).toBe(5);
    expect(todaEmTransito({ quantity: 5, reuseQty: 0, isReuse: true, origemReaproveitamento: "em_transito" })).toBe(true);
  });

  it("CONFERIR: o teto é só o impresso; a conferência fecha com o físico", () => {
    const p = parcial();
    expect(tetoDaConferencia(p)).toBe(6);
    expect(aConferir(p)).toBe(6);
    expect(remainingConfer(p)).toBe(6);
    const plano = planejarConferencia(p);
    expect(plano).toMatchObject({ ok: true, quantidade: 6, conferredQty: 6, completa: true, novoStatus: "conferred" });
    // pedir 7 é recusado: só há 6 no galpão
    expect(planejarConferencia(p, 7).ok).toBe(false);
    // estoque: as reaproveitadas passam pela conferência (10)
    expect(tetoDaConferencia(parcial({ origemReaproveitamento: "estoque" }))).toBe(10);
    expect(planejarConferencia(parcial({ origemReaproveitamento: "estoque" }), 6)).toMatchObject({ ok: true, completa: false, novoStatus: null });
  });

  it("EMBALAR e ENTREGAR fecham no físico — nada de número negativo", () => {
    const conferida = parcial({ status: "conferred", conferredQty: 6 });
    expect(aEmbalar(conferida)).toBe(6);
    expect(planejarEmbalar(conferida)).toMatchObject({ ok: true, quantidade: 6, embaladaQty: 6, viraEmbalada: true });
    const embalada = parcial({ status: "packed", conferredQty: 6, embaladaQty: 6 });
    expect(todaEmbalada(embalada)).toBe(true);
    expect(aEmbalar(embalada)).toBe(0);
    expect(planejarEntrega(embalada, 6)).toEqual({ deliveredQty: 6, viraEntregue: true });
    expect(remainingDeliver({ ...embalada, deliveredQty: 6 })).toBe(0);
    expect(violacoesDaConta({ ...embalada, deliveredQty: 6 })).toEqual([]);
    // conferir o que vem em trânsito quebraria a conta
    expect(violacoesDaConta(parcial({ conferredQty: 8 }))).not.toEqual([]);
    // "6 de 10 embaladas" mentiria: o físico é 6
    expect(progressoDaEmbalagem(parcial({ embaladaQty: 3 }))).toBe("3 de 6 embaladas");
  });

  it("a peça 100% em trânsito não tem o que conferir nem embalar", () => {
    const toda = { quantity: 8, quantityProduced: 0, reuseQty: 8, isReuse: true, conferredQty: 0, status: "produced", origemReaproveitamento: "em_transito" };
    expect(quantidadeFisicaDe(toda)).toBe(0);
    expect(tetoDaConferencia(toda)).toBe(0);
    expect(canConfer(toda)).toBe(false);
    expect(aEmbalar(toda)).toBe(0);
    expect(etapaPelaQuantidadeFisica(toda)).toBe("delivered");
  });
});

describe("a etapa refeita quando a origem muda", () => {
  it("no fim do fluxo; antes da produção só a peça liberada TODA em trânsito muda", () => {
    expect(statusAposMudarAOrigem(parcial({ status: "ready_for_production" }))).toBeNull();
    expect(statusAposMudarAOrigem(parcial({ status: "inProduction" }))).toBeNull();
  });
  it("liberada e toda em trânsito (#8688/#8683, 28/10): fecha como Entregue — não há o que imprimir", () => {
    const liberada = { quantity: 8, reuseQty: 8, isReuse: true, status: "ready_for_production", origemReaproveitamento: "em_transito" };
    expect(statusAposMudarAOrigem(liberada)).toBe("delivered");
    expect(statusAposMudarAOrigem({ ...liberada, status: "pronto_para_producao" })).toBe("delivered");
    // do estoque, a Gráfica ainda separa e confere: continua liberada
    expect(statusAposMudarAOrigem({ ...liberada, origemReaproveitamento: "estoque" })).toBeNull();
    // em trânsito só em parte: ainda há o que imprimir
    expect(statusAposMudarAOrigem({ ...liberada, reuseQty: 5, isReuse: false })).toBeNull();
    // em impressão nada muda por aqui
    expect(statusAposMudarAOrigem({ ...liberada, status: "inProduction" })).toBeNull();
  });
  it("marcar em trânsito: produced → conferred / packed / delivered conforme o físico", () => {
    expect(statusAposMudarAOrigem(parcial({ conferredQty: 6 }))).toBe("conferred");
    expect(statusAposMudarAOrigem(parcial({ conferredQty: 6, embaladaQty: 6 }))).toBe("packed");
    expect(statusAposMudarAOrigem(parcial({ status: "packed", conferredQty: 6, embaladaQty: 6, deliveredQty: 6 }))).toBe("delivered");
    expect(statusAposMudarAOrigem(parcial())).toBeNull(); // produced, nada conferido: continua
  });
  it("desmarcar em trânsito: a peça fechada volta ao galpão (Produzido)", () => {
    const fechada = { quantity: 8, reuseQty: 8, isReuse: true, status: "delivered", origemReaproveitamento: "estoque" };
    expect(statusAposMudarAOrigem(fechada)).toBe("produced");
    // grafia legada também
    expect(statusAposMudarAOrigem({ ...fechada, status: "entregue" })).toBe("produced");
  });
  it("recusa marcar em trânsito quando o galpão já conferiu as reaproveitadas", () => {
    const atual = parcial({ origemReaproveitamento: "estoque", conferredQty: 9 });
    expect(recusaDaTrocaDeOrigem(atual, "em_transito")).toMatch(/já foram conferidas.*Use "Estoque"/);
    expect(recusaDaTrocaDeOrigem(parcial({ origemReaproveitamento: "estoque", conferredQty: 6 }), "em_transito")).toBeNull();
    // sair de em trânsito nunca deixa número negativo
    expect(recusaDaTrocaDeOrigem(parcial({ conferredQty: 6 }), "estoque")).toBeNull();
    // sem reaproveitamento não há origem
    expect(recusaDaTrocaDeOrigem({ quantity: 3, reuseQty: 0 }, "estoque")).toMatch(/não tem unidade reaproveitada/);
  });
});

describe("como se diz", () => {
  it("a trilha e a dica", () => {
    expect(fraseDaTrilhaDaOrigem("em_transito", OBS)).toBe(`Reaproveitamento: em trânsito — ${OBS}`);
    expect(fraseDaTrilhaDaOrigem("estoque", null)).toBe("Reaproveitamento: estoque");
    expect(fraseDaTrilhaDaOrigem(null, null)).toBe("Reaproveitamento: origem removida");
    expect(fraseDoFechamentoEmTransito(OBS)).toBe(`Reaproveitada em trânsito (${OBS}) — não passa pela Gráfica`);
    expect(dicaDaOrigem(parcial())).toContain(`vindo de ${OBS}`);
    expect(dicaDaOrigem(parcial({ origemReaproveitamento: "estoque" }))).toMatch(/^Buscar no estoque — 4 un\./);
    expect(dicaDaOrigem(parcial({ origemReaproveitamento: null }))).toBeNull();
    // "Tapeçaria" foi trocado por "Estoque" (dono, 16/10)
    expect(JSON.stringify([dicaDaOrigem(parcial({ origemReaproveitamento: "estoque" })), fraseDaTrilhaDaOrigem("estoque", null)])).not.toMatch(/tape[cç]aria/i);
  });
});

describe("schema e migração", () => {
  it("as duas colunas na tabela, nullable, sem default", () => {
    const cols = getTableColumns(items);
    expect(cols.origemReaproveitamento.name).toBe("origem_reaproveitamento");
    expect(cols.obsReaproveitamento.name).toBe("obs_reaproveitamento");
    expect(cols.origemReaproveitamento.notNull).toBe(false);
    expect(cols.origemReaproveitamento.hasDefault).toBe(false);
  });
  it("o insert aceita só as duas origens; o público nem aceita (nasce sem origem)", () => {
    const base = { eventId: "e1", type: "Placa", quantity: 1, area: "1", visual: "1", material: "Lona", finish: "Ilhós", measurement: "1x1", calculatedM2: "1" };
    expect(insertItemSchema.safeParse({ ...base, origemReaproveitamento: "em_transito" }).success).toBe(true);
    expect(insertItemSchema.safeParse({ ...base, origemReaproveitamento: "tapecaria" }).success).toBe(false);
    const publico = publicInsertItemSchema.parse({ ...base, origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }) as Record<string, unknown>;
    expect(publico.origemReaproveitamento).toBeUndefined();
    expect(publico.obsReaproveitamento).toBeUndefined();
  });
  it("migração 0006 versionada, aditiva e idempotente; e na aditiva de produção", () => {
    const sql = readFileSync(path.join(RAIZ, "migrations", "0006_origem-do-reaproveitamento.sql"), "utf8");
    expect(sql).toContain(`ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "origem_reaproveitamento" text`);
    expect(sql).toContain(`ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "obs_reaproveitamento" text`);
    expect(sql).not.toMatch(/DROP|UPDATE|DEFAULT|NOT NULL/i);
    const journal = JSON.parse(readFileSync(path.join(RAIZ, "migrations", "meta", "_journal.json"), "utf8"));
    // Registrada no journal (migrações depois dela — 0007 do book, 19/10 — não a tiram de lá).
    expect(journal.entries.map((e: { tag: string }) => e.tag)).toContain("0006_origem-do-reaproveitamento");
    const aditiva = readFileSync(path.join(RAIZ, "scripts", "migracao-aditiva-producao.sql"), "utf8");
    expect(aditiva).toContain(`ADD COLUMN IF NOT EXISTS "origem_reaproveitamento" text`);
    expect(aditiva).toContain(`ADD COLUMN IF NOT EXISTS "obs_reaproveitamento" text`);
  });
});
