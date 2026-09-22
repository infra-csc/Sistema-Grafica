// ─────────────────────────────────────────────────────────────────────────────
// IMPORTAÇÃO DE PLANILHA: linhas com defeito DITAS, repetidas marcadas, e o
// confirmar TUDO OU NADA (remessa + peças + vínculos numa transação).
//
//   · o parser devolve `ignoradas: [{linha, motivo}]` em vez de sumir com a
//     linha sem quantidade — e a negativa não passa mais;
//   · linha copiada duas vezes na mesma planilha sai com `repeteLinha`;
//   · o confirmar recusa com "Linha N: …" em pt-BR, recusa patrocinador que
//     não é do evento, grava tudo DENTRO de db.transaction e, se a transação
//     falha, não sobra remessa nem trilha;
//   · o que vem depois (trilha, aviso, status do evento) não derruba a resposta.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import AdmZip from "adm-zip";
import { items as itemsTable, itemSponsors, kitRemessas } from "@shared/schema";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: { transaction: (async () => {}) as any },
  broadcast: (() => {}) as any,
  createAuditLog: (async () => {}) as any,
  createAuditLogsEmLote: (async () => {}) as any,
  updateEventStatus: (async () => {}) as any,
}));

vi.mock("../db", () => ({ db: H.db, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    broadcast: (...a: any[]) => H.broadcast(...a),
    createAuditLog: (...a: any[]) => H.createAuditLog(...a),
    createAuditLogsEmLote: (...a: any[]) => H.createAuditLogsEmLote(...a),
    updateEventStatus: (...a: any[]) => H.updateEventStatus(...a),
  };
});

import { lerPlanilhaDePecas, handleConfirmImport, chaveNaPlanilha, marcarRepetidas } from "../services/xlsxImport";

/** Um .xlsx mínimo (mesma técnica de importar-a-propria-exportacao.test.ts). */
function planilha(linhas: (string | number | null)[][]): Buffer {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const col = (i: number) => String.fromCharCode(65 + i);
  const rows = linhas.map((l, r) => `<row r="${r + 1}">${l.map((v, c) => {
    if (v === null || v === "") return "";
    const ref = `${col(c)}${r + 1}`;
    return typeof v === "number" ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
  }).join("")}</row>`).join("");
  const zip = new AdmZip();
  zip.addFile("xl/worksheets/sheet1.xml", Buffer.from(`<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`));
  return zip.toBuffer();
}

describe("o parser diz o que ficou de fora e o que se repete", () => {
  it("sem quantidade, zero e negativa ficam em `ignoradas` com a linha do Excel", () => {
    const r = lerPlanilhaDePecas(planilha([
      ["Tipo", "Descrição", "Qtd", "Material", "Acabamento"],
      ["Testeira", "Testeira A", 2, "Lona", "Ilhós"],
      ["Testeira", "Testeira B", null, "Lona", "Ilhós"],
      ["Testeira", "Testeira C", -3, "Lona", "Ilhós"],
      ["Testeira", "Testeira D", 0, "Lona", "Ilhós"],
    ]), () => []);
    if (!r.ok) throw new Error(r.erro);
    expect(r.items.map((i) => i.description)).toEqual(["Testeira A"]);
    expect(r.items[0].linha).toBe(2);
    expect(r.ignoradas).toEqual([
      { linha: 3, motivo: "sem quantidade" },
      { linha: 4, motivo: 'quantidade mínima é 1 (veio "-3")' },
      { linha: 5, motivo: 'quantidade mínima é 1 (veio "0")' },
    ]);
  });

  it("linha repetida (tipo, descrição e medida) sai marcada com a linha que ela repete", () => {
    const r = lerPlanilhaDePecas(planilha([
      ["Tipo", "Descrição", "Qtd", "Larg. Arq. (m)", "Alt. Arq. (m)"],
      ["Pórtico", "Pórtico largada", 1, 3, 2],
      ["Pórtico", "Pórtico largada", 1, 4, 2],
      ["Pórtico", "PÓRTICO  largada", 1, 3, 2],
    ]), () => []);
    if (!r.ok) throw new Error(r.erro);
    expect(r.items.map((i) => i.repeteLinha)).toEqual([undefined, undefined, 2]);
  });

  it("a chave e a marcação são puras", () => {
    expect(chaveNaPlanilha({ type: "Pórtico", description: "A", fileWidth: 3, fileHeight: "2" }))
      .toBe(chaveNaPlanilha({ type: "portico", description: " a ", fileWidth: "3.00", fileHeight: 2 }));
    expect(marcarRepetidas([{ linha: 5 }, { linha: 9 }], () => "k")[1].repeteLinha).toBe(5);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// O confirmar
// ═════════════════════════════════════════════════════════════════════════════
type Op = { tabela: unknown; valores: any };
let inseridos: Op[];
let falharNoInsertDePecas: boolean;

function txFalso() {
  return {
    select: () => ({ from: () => ({ where: async () => [] }) }),
    insert: (tabela: unknown) => ({
      values: (valores: any) => {
        if (tabela === itemsTable && falharNoInsertDePecas) throw new Error("violação de chave");
        inseridos.push({ tabela, valores });
        const linhas = (Array.isArray(valores) ? valores : [valores]).map((v: any, i: number) => ({ id: tabela === kitRemessas ? "rem-nova" : `peca-${i}`, ...v }));
        const p: any = Promise.resolve(linhas);
        p.returning = async () => linhas;
        // Vínculo repetido não quebra a importação: o índice único cuida disso.
        p.onConflictDoNothing = () => p;
        return p;
      },
    }),
    execute: async () => ({ rows: [{ next_id: 101 }, { next_id: 102 }, { next_id: 103 }] }),
  };
}

async function confirmar(body: any, extra: any = {}) {
  const req: any = { params: { id: "ev-1" }, body, userRole: "solicitacao", userId: "u1", userName: "Maria", ...extra };
  const res: any = { _status: 200 };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; return res; };
  await handleConfirmImport(req, res);
  return { status: res._status, body: res._body };
}

const LINHA = { type: "Testeira", description: "Testeira A", quantity: 2, fileWidth: 3, fileHeight: 1, calculatedM2: 6, material: "Lona", finish: "Ilhós", measurement: "3.00 × 1.00", observations: "", suggestedSponsorIds: ["sp-a"], linha: 7 };

beforeEach(() => {
  inseridos = [];
  falharNoInsertDePecas = false;
  H.broadcast = vi.fn();
  H.createAuditLog = vi.fn(async () => {});
  H.createAuditLogsEmLote = vi.fn(async () => {});
  H.updateEventStatus = vi.fn(async () => {});
  H.db.transaction = vi.fn(async (fn: any) => fn(txFalso()));
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getEvent = vi.fn(async () => ({ id: "ev-1", name: "COPA", status: "created", startDate: "2099-01-10" }));
  s.getEventSponsors = vi.fn(async () => [{ eventId: "ev-1", sponsorId: "sp-a" }]);
  s.getSponsor = vi.fn(async (id: string) => ({ id, name: id === "sp-x" ? "Itaú" : "Aché" }));
  s.createNotification = vi.fn(async (n: any) => ({ id: "n1", ...n }));
  s.ensureDisplayIdSequence = vi.fn(async () => {});
});

describe("confirmar a importação", () => {
  it("quantidade inválida: 400 com a linha da planilha, nada gravado", async () => {
    const r = await confirmar({ items: [{ ...LINHA, quantity: 0 }], fileName: "l.xlsx" });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Linha 7: quantidade mínima é 1.");
    expect(H.db.transaction).not.toHaveBeenCalled();
  });

  it("patrocinador que não é do evento: 400 com o nome — o vínculo não é gravado às cegas", async () => {
    const r = await confirmar({ items: [{ ...LINHA, suggestedSponsorIds: ["sp-a", "sp-x"] }] });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Linha 7: Itaú não é patrocinador deste evento — tire da peça ou vincule ao evento antes.");
    expect(H.db.transaction).not.toHaveBeenCalled();
  });

  it("peças e vínculos saem na MESMA transação, com o código da sequência", async () => {
    const r = await confirmar({ items: [LINHA, { ...LINHA, description: "Testeira B", suggestedSponsorIds: ["sp-a", "sp-a"] }], fileName: "l.xlsx" });
    expect(r.status).toBe(201);
    expect(r.body.imported).toBe(2);
    expect(H.db.transaction).toHaveBeenCalledTimes(1);
    const pecas = inseridos.find((o) => o.tabela === itemsTable)!.valores;
    expect(pecas.map((p: any) => p.displayId)).toEqual(["#0101", "#0102"]);
    expect(pecas[0]).toMatchObject({ status: "requested", eventId: "ev-1", kitRemessaId: null, quantity: 2 });
    // Vínculo repetido na linha vira um só.
    expect(inseridos.find((o) => o.tabela === itemSponsors)!.valores).toEqual([
      { itemId: "peca-0", sponsorId: "sp-a" },
      { itemId: "peca-1", sponsorId: "sp-a" },
    ]);
    expect(H.updateEventStatus).toHaveBeenCalledWith("ev-1");
  });

  it("remessa nova do Kit nasce DENTRO da transação, e as peças entram nela", async () => {
    const r = await confirmar({ items: [LINHA], kitNovaRemessa: { versao: "V2", entregaMaterial: "2099-01-05" } });
    expect(r.status).toBe(201);
    expect(r.body.kitRemessaId).toBe("rem-nova");
    expect(inseridos[0].tabela).toBe(kitRemessas);
    expect(inseridos.find((o) => o.tabela === itemsTable)!.valores[0].kitRemessaId).toBe("rem-nova");
  });

  it("falhou no meio: 500 sem mensagem interna, sem trilha nem aviso (a transação desfaz a remessa)", async () => {
    falharNoInsertDePecas = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await confirmar({ items: [LINHA], kitNovaRemessa: { versao: "V2", entregaMaterial: "2099-01-05" } });
    log.mockRestore();
    expect(r.status).toBe(500);
    expect(r.body.error).toBe("Não foi possível importar agora — nenhuma peça foi gravada. Tente de novo em instantes.");
    expect(H.createAuditLog).not.toHaveBeenCalled();
    expect(H.broadcast).not.toHaveBeenCalled();
  });

  it("o que vem depois não derruba a resposta: status do evento falhando ainda devolve 201", async () => {
    H.updateEventStatus = vi.fn(async () => { throw new Error("fora do ar"); });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await confirmar({ items: [LINHA] });
    log.mockRestore();
    expect(r.status).toBe(201);
  });
});
