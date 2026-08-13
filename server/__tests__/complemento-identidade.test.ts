// ─────────────────────────────────────────────────────────────────────────────
// IDENTIDADE DO COMPLEMENTO — displayId, ativos de inventário, blindagem do
// schema público e a montagem da peça-filha.
//
// PORQUÊ: o complemento introduziu o PRIMEIRO displayId que não é "#" + 4
// dígitos (#0062-C1). Todo lugar que ordenava por string, ou que fazia
// .replace(/[^0-9]/g, ''), passou a mentir — "#0062-C1" virava 621, ordenando
// entre #0620 e #0622, a centenas de linhas da própria mãe. Como a ancoragem
// visual ("o complemento cola na mãe") é PRÉ-REQUISITO do recurso e não
// enfeite, uma regressão nestes helpers derruba o recurso inteiro em silêncio,
// sem erro nenhum no console.
//
// Aqui roda CÓDIGO REAL de server/storage.ts (os helpers puros e
// createComplementItemTx) e de shared/schema.ts. Só `../db` é mockado, porque
// importar o módulo exige DATABASE_URL — nenhum teste toca banco.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";

vi.mock("../db", () => ({ db: {}, pool: {} }));

import {
  parseDisplayId,
  compareDisplayId,
  assetPrefix,
  assetSeqOf,
  isDisplayIdConflictError,
  storage,
  type ComplementFields,
} from "../storage";
import {
  insertItemSchema,
  publicInsertItemSchema,
  type Item,
} from "@shared/schema";
import {
  parseDisplayId as parseDisplayIdClient,
  compareDisplayId as compareDisplayIdClient,
  splitDisplayId,
} from "@/lib/displayId";

// ─────────────────────────────────────────────────────────────────────────────
describe("parseDisplayId", () => {
  it("peça normal: só a base", () => {
    expect(parseDisplayId("#0062")).toEqual({ base: 62, seq: 0 });
    expect(parseDisplayId("#0001")).toEqual({ base: 1, seq: 0 });
  });

  it("complemento: base + sequência", () => {
    expect(parseDisplayId("#0062-C1")).toEqual({ base: 62, seq: 1 });
    expect(parseDisplayId("#0062-C2")).toEqual({ base: 62, seq: 2 });
    expect(parseDisplayId("#0062-C12")).toEqual({ base: 62, seq: 12 });
  });

  it("aceita minúscula e ausência do '#'", () => {
    expect(parseDisplayId("#0062-c3")).toEqual({ base: 62, seq: 3 });
    expect(parseDisplayId("0062-C3")).toEqual({ base: 62, seq: 3 });
  });

  it("entrada vazia/nula não explode — devolve zeros", () => {
    expect(parseDisplayId(null)).toEqual({ base: 0, seq: 0 });
    expect(parseDisplayId(undefined)).toEqual({ base: 0, seq: 0 });
    expect(parseDisplayId("")).toEqual({ base: 0, seq: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("compareDisplayId — a ancoragem visual do recurso", () => {
  it("a mãe vem antes dos seus complementos, na ordem em que foram pedidos", () => {
    expect(compareDisplayId("#0062", "#0062-C1")).toBeLessThan(0);
    expect(compareDisplayId("#0062-C1", "#0062-C2")).toBeLessThan(0);
    expect(compareDisplayId("#0062-C2", "#0063")).toBeLessThan(0);
  });

  it("O BUG QUE ELE EXISTE PARA MATAR: #0062-C1 não pode cair perto de #0621", () => {
    // Ordenação ingênua (string ou replace(/[^0-9]/g,'')) leria "#0062-C1"
    // como 621 e a linha apareceria entre #0620 e #0622 — exatamente a
    // duplicidade confusa que o modelo de complemento existe para evitar.
    expect(compareDisplayId("#0062-C1", "#0620")).toBeLessThan(0);
    expect(compareDisplayId("#0062-C1", "#0063")).toBeLessThan(0);
  });

  it("ordena uma lista embaralhada exatamente como a tela precisa exibir", () => {
    const embaralhado = ["#0621", "#0063", "#0062-C2", "#0062", "#0620", "#0062-C1"];
    expect([...embaralhado].sort(compareDisplayId)).toEqual([
      "#0062", "#0062-C1", "#0062-C2", "#0063", "#0620", "#0621",
    ]);
  });

  it("é um comparador válido: simétrico e com empate = 0", () => {
    expect(compareDisplayId("#0062", "#0062")).toBe(0);
    expect(compareDisplayId("#0062-C1", "#0062-C1")).toBe(0);
    expect(Math.sign(compareDisplayId("#0062", "#0063")))
      .toBe(-Math.sign(compareDisplayId("#0063", "#0062")));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("ESPELHO client ↔ servidor (o servidor não importa código do client)", () => {
  // client/src/lib/displayId.ts e server/storage.ts carregam a MESMA lógica
  // duplicada de propósito. O comentário nos dois arquivos diz "se um mudar, o
  // outro muda junto" — este bloco é o que faz esse acordo valer alguma coisa.
  // Uma divergência aqui é silenciosa: a tela ordena de um jeito, o export e a
  // numeração de ativos de outro, e ninguém vê erro nenhum.
  const AMOSTRA = [
    "#0001", "#0062", "#0062-C1", "#0062-C2", "#0062-C12", "#0062-c3",
    "#0063", "#0620", "#0621", "#10234", "0062-C1", "", null, undefined,
  ];

  it.each(AMOSTRA)("parseDisplayId concorda para %s", (id) => {
    expect(parseDisplayIdClient(id as any)).toEqual(parseDisplayId(id as any));
  });

  it("compareDisplayId concorda em TODOS os pares da amostra", () => {
    for (const a of AMOSTRA) {
      for (const b of AMOSTRA) {
        expect(Math.sign(compareDisplayIdClient(a as any, b as any)))
          .toBe(Math.sign(compareDisplayId(a as any, b as any)));
      }
    }
  });

  it("splitDisplayId (só client, para colorir o sufixo) casa com o parse dos dois lados", () => {
    expect(splitDisplayId("#0062-C1")).toEqual({ base: "#0062", suffix: "-C1" });
    expect(splitDisplayId("#0062")).toEqual({ base: "#0062", suffix: "" });
    // o sufixo destacado tem que ser o MESMO número que o parse enxerga
    const { suffix } = splitDisplayId("#0062-C2");
    expect(suffix).toBe(`-C${parseDisplayId("#0062-C2").seq}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("assetPrefix — prova de identidade com o acervo existente", () => {
  /** O cálculo ANTIGO, literal, como estava em items.ts antes do complemento. */
  const legado = (id: string) => id.replace(/[^0-9]/g, "").padStart(4, "0");

  it("para TODA peça no formato real (#0001..#9999) devolve byte a byte o valor antigo", () => {
    // Esta é a garantia de risco zero para os ativos já cadastrados: se um
    // único id divergir, o próximo lote de produção de uma peça antiga passa a
    // gerar ativos com prefixo diferente do bloco que já está no galpão.
    for (const n of [1, 7, 62, 99, 100, 621, 999, 1000, 4321, 9999]) {
      const id = `#${String(n).padStart(4, "0")}`;
      expect(assetPrefix(id)).toBe(legado(id));
    }
  });

  it("acima de 4 dígitos (estouro da sequence) também continua idêntico ao antigo", () => {
    expect(assetPrefix("#10234")).toBe(legado("#10234"));
    expect(assetPrefix("#10234")).toBe("10234");
  });

  it("complemento vira 0062C1 — legível e SEM colidir com a peça #0621", () => {
    expect(assetPrefix("#0062-C1")).toBe("0062C1");
    expect(assetPrefix("#0062-C2")).toBe("0062C2");
    // O antigo produzia "00621", que é o prefixo da peça #0621 com 5 dígitos —
    // dois blocos de ativos diferentes disputando o mesmo código.
    expect(legado("#0062-C1")).toBe("00621");
    expect(assetPrefix("#0062-C1")).not.toBe(legado("#0062-C1"));
  });

  it("os blocos de ativos da mãe e dos complementos são disjuntos", () => {
    const bloco = (displayId: string, qtd: number) =>
      Array.from({ length: qtd }, (_, i) => `#EST-${assetPrefix(displayId)}-${i + 1}`);
    const mae = bloco("#0062", 10);        // #EST-0062-1 .. -10
    const c1 = bloco("#0062-C1", 4);       // #EST-0062C1-1 .. -4
    const c2 = bloco("#0062-C2", 2);
    const vizinha = bloco("#0621", 3);     // a peça que o bug antigo atropelava
    const todos = [...mae, ...c1, ...c2, ...vizinha];
    expect(new Set(todos).size).toBe(todos.length);
    expect(mae).toContain("#EST-0062-1");
    expect(c1).toContain("#EST-0062C1-1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("assetSeqOf — numerar ativo por MAIOR sufixo, nunca por contagem", () => {
  it("lê o sufixo dos dois formatos de prefixo", () => {
    expect(assetSeqOf("#EST-0062-7")).toBe(7);
    expect(assetSeqOf("#EST-0062C1-3")).toBe(3);
    expect(assetSeqOf("#EST-0062-12")).toBe(12);
  });

  it("id sem sufixo numérico devolve 0 (e não NaN)", () => {
    expect(assetSeqOf("#EST-0062C1")).toBe(0);
    expect(assetSeqOf(null)).toBe(0);
    expect(assetSeqOf("")).toBe(0);
    expect(assetSeqOf("#EST")).toBe(0);
  });

  it("COMPORTAMENTO REGISTRADO: lê o ÚLTIMO grupo -N, seja ele qual for", () => {
    // "#EST-0062" (ativo malformado, sem o sufixo da unidade) é lido como 62,
    // não como 0 — o helper casa `-(\d+)$`, e ali o último grupo é o prefixo.
    // Inofensivo hoje porque todo ativo nasce com "-N" (ver novoAtivo em
    // items.ts), mas fica registrado: se algum dia um ativo for gravado sem o
    // sufixo, a numeração do próximo lote pularia para 63.
    expect(assetSeqOf("#EST-0062")).toBe(62);
  });

  it("com um ativo EXCLUÍDO no meio, contagem colidiria e o MAX não colide", () => {
    // Bloco original de 3, o -2 foi excluído. Restam [-1, -3].
    const existentes = ["#EST-0062-1", "#EST-0062-3"];
    const porContagem = existentes.length + 1;                       // 3 → JÁ EXISTE
    const porMax = existentes.reduce((m, a) => Math.max(m, assetSeqOf(a)), 0) + 1; // 4
    expect(porContagem).toBe(3);
    expect(existentes).toContain(`#EST-0062-${porContagem}`);
    expect(porMax).toBe(4);
    expect(existentes).not.toContain(`#EST-0062-${porMax}`);
  });

  it("replica a fórmula da rota (maiorSeq + i + 1) para o lote que falta", () => {
    const existentes = ["#EST-0062C1-1", "#EST-0062C1-2"];
    const quantityProduced = 4;
    const maiorSeq = existentes.reduce((m, a) => Math.max(m, assetSeqOf(a)), 0);
    const faltam = quantityProduced - existentes.length;
    const novos = Array.from({ length: faltam }, (_, i) => `#EST-0062C1-${maiorSeq + i + 1}`);
    expect(novos).toEqual(["#EST-0062C1-3", "#EST-0062C1-4"]);
    expect(novos.some((n) => existentes.includes(n))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("isDisplayIdConflictError — o gatilho do retry", () => {
  it("reconhece a violação de unicidade de display_id", () => {
    expect(isDisplayIdConflictError({ code: "23505", constraint: "items_display_id_unique" })).toBe(true);
    expect(isDisplayIdConflictError({ code: "23505", message: 'duplicate key value violates unique constraint "items_display_id_unique"' })).toBe(true);
  });

  it("NÃO confunde com outra violação de unicidade (retry às cegas mascararia bug)", () => {
    expect(isDisplayIdConflictError({ code: "23505", constraint: "users_email_unique" })).toBe(false);
  });

  it("NÃO confunde com outros erros do Postgres", () => {
    expect(isDisplayIdConflictError({ code: "23503", constraint: "items_display_id_unique" })).toBe(false);
    expect(isDisplayIdConflictError({ code: "42703" })).toBe(false); // coluna inexistente = migração pendente
    expect(isDisplayIdConflictError(new Error("boom"))).toBe(false);
    expect(isDisplayIdConflictError(null)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("blindagem do schema público (é falha de segurança, não estética)", () => {
  const base = {
    eventId: "ev-1", type: "Pórtico 6x3", quantity: 4,
    area: "6", visual: "3", material: "Lona", finish: "Ilhós",
    measurement: "6x3", calculatedM2: "18.00",
  };

  it("POST público NÃO aceita parentItemId — parentesco não se forja pelo body", () => {
    // Sem o omit, insertItemSchema (derivado da tabela) passaria a aceitar as
    // colunas novas automaticamente e qualquer usuário autenticado penduraria
    // uma peça como "complemento" de outra — inclusive de outro evento —,
    // contaminando contractedTotal, a ordenação e a fila da Gráfica.
    const out: any = publicInsertItemSchema.parse({ ...base, parentItemId: "mae-de-outro-evento" });
    expect(out.parentItemId).toBeUndefined();
    expect("parentItemId" in out).toBe(false);
  });

  it("os CINCO campos de complemento são descartados juntos", () => {
    const out: any = publicInsertItemSchema.parse({
      ...base,
      parentItemId: "mae-1",
      complementSeq: 9,
      complementReason: "motivo forjado pelo cliente",
      complementRequestedBy: "Diretor Falso",
      complementRequestedAt: new Date(),
    });
    for (const campo of [
      "parentItemId", "complementSeq", "complementReason",
      "complementRequestedBy", "complementRequestedAt",
    ]) {
      expect(out[campo]).toBeUndefined();
    }
  });

  it("o schema INTERNO continua aceitando os campos (é ele que a rota de complemento usa)", () => {
    // Prova que a proteção vem do omit no schema público — não de o campo
    // simplesmente não existir.
    const out: any = insertItemSchema.parse({ ...base, parentItemId: "mae-1", complementSeq: 1 });
    expect(out.parentItemId).toBe("mae-1");
    expect(out.complementSeq).toBe(1);
  });

  it("o resto do corpo continua passando normalmente (nada quebrou no fluxo comum)", () => {
    const out: any = publicInsertItemSchema.parse(base);
    expect(out.eventId).toBe("ev-1");
    expect(out.quantity).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createComplementItemTx — o que a peça-filha herda, o que ela zera e o que
// nunca é copiado (§2.5 da spec). Roda o método REAL contra um `tx` de mentira:
// nenhum banco, mas a montagem inteira da linha é a de produção.
// ─────────────────────────────────────────────────────────────────────────────
function txDeMentira(maxSeq: number) {
  const capturado: { values?: any } = {};
  const tx: any = {
    select: () => ({ from: () => ({ where: () => Promise.resolve([{ maxSeq }]) }) }),
    insert: () => ({
      values: (vals: any) => {
        capturado.values = vals;
        return { returning: async () => [{ id: "filho-1", ...vals }] };
      },
    }),
  };
  return { tx, capturado };
}

/** Mãe realista: entregue, com histórico completo de fluxo preenchido. */
const MAE = {
  id: "mae-1",
  displayId: "#0062",
  eventId: "ev-1",
  type: "Pórtico 6x3",
  description: "Entrada principal",
  area: "6.00", visual: "3.00",
  visualWidth: "6.00", visualHeight: "3.00",
  fileWidth: "6.10", fileHeight: "3.10",
  material: "Lona 440g", finish: "Ilhós",
  measurement: "6x3",
  calculatedM2: "189.10",
  status: "delivered",
  quantity: 10,
  finalFileUrl: "/objects/final.pdf",
  finalFileName: "portico.pdf",
  finalPreviewUrl: "/objects/final.jpg",
  finalFileUpdatedAt: new Date("2026-08-01T10:00:00Z"),
  approvalThumbUrl: "/objects/thumb.jpg",
  bookUrl: "/objects/book.pdf",
  referenceUrl: "/objects/ref.jpg",
  skipApproval: false,
  // ── nada disto pode ir para o filho ──
  observations: "observação da mãe",
  conferenceNotes: "conferido por Zé",
  deliveryNotes: "entregue na portaria",
  conferencePhotoUrl: "/objects/conf.jpg",
  deliveryPhotoUrl: "/objects/entrega.jpg",
  receivedBy: "João da Portaria",
  previousFinalFileUrl: "/objects/velho.pdf",
  previousFinalFileName: "velho.pdf",
  previousApprovalThumbUrl: "/objects/thumb-velho.jpg",
  quantityProduced: 10,
  reuseQty: 4,
  isReuse: false,
  conferredQty: 10,
  deliveredQty: 10,
  hasModifiedData: true,
  rejectedBySponsor: true,
  rejectedByCreator: true,
  producedAt: new Date("2026-08-02T10:00:00Z"),
  deliveredAt: new Date("2026-08-05T10:00:00Z"),
  deletedAt: null,
} as unknown as Item;

const CAMPOS: ComplementFields = {
  quantity: 4,
  calculatedM2: "75.64",
  status: "ready_for_production",
  complementReason: "cliente confirmou dois pórticos extras para a ativação de sábado",
  complementRequestedBy: "Maria Silva",
  complementRequestedAt: new Date("2026-08-13T14:22:00Z"),
};

describe("createComplementItemTx — montagem da peça-filha", () => {
  it("numera pelo MAX do sufixo: sem complemento nenhum, nasce -C1", async () => {
    const { tx, capturado } = txDeMentira(0);
    const filho = await storage.createComplementItemTx(tx, MAE, CAMPOS);
    expect(capturado.values.displayId).toBe("#0062-C1");
    expect(capturado.values.complementSeq).toBe(1);
    expect(filho.displayId).toBe("#0062-C1");
  });

  it("SEGUNDO aumento nasce -C2 (MAX + 1, não contagem)", async () => {
    const { tx, capturado } = txDeMentira(1);
    await storage.createComplementItemTx(tx, MAE, CAMPOS);
    expect(capturado.values.displayId).toBe("#0062-C2");
    expect(capturado.values.complementSeq).toBe(2);
  });

  it("número CANCELADO não é reciclado: com -C1 e -C2 no histórico, o próximo é -C3", async () => {
    // A query de MAX ignora deletedAt de propósito. Se reciclasse, dois
    // complementos distintos dividiriam o mesmo id no audit log — e um deles
    // teria sido cancelado.
    const { tx, capturado } = txDeMentira(2);
    await storage.createComplementItemTx(tx, MAE, CAMPOS);
    expect(capturado.values.displayId).toBe("#0062-C3");
    expect(capturado.values.complementSeq).toBe(3);
  });

  it("HERDA o que define a peça fisicamente (mesma arte, mesmas medidas)", async () => {
    const { tx, capturado } = txDeMentira(0);
    await storage.createComplementItemTx(tx, MAE, CAMPOS);
    expect(capturado.values).toMatchObject({
      eventId: "ev-1",
      type: "Pórtico 6x3",
      description: "Entrada principal",
      area: "6.00", visual: "3.00",
      visualWidth: "6.00", visualHeight: "3.00",
      fileWidth: "6.10", fileHeight: "3.10",
      material: "Lona 440g", finish: "Ilhós",
      measurement: "6x3",
      finalFileUrl: "/objects/final.pdf",
      finalFileName: "portico.pdf",
      finalPreviewUrl: "/objects/final.jpg",
      approvalThumbUrl: "/objects/thumb.jpg",
      bookUrl: "/objects/book.pdf",
      referenceUrl: "/objects/ref.jpg",
      skipApproval: false,
    });
    expect(capturado.values.finalFileUpdatedAt).toEqual(MAE.finalFileUpdatedAt);
  });

  it("grava o que é PRÓPRIO do complemento (quantidade, m², motivo, autor, data, vínculo)", async () => {
    const { tx, capturado } = txDeMentira(0);
    await storage.createComplementItemTx(tx, MAE, CAMPOS);
    expect(capturado.values).toMatchObject({
      quantity: 4,
      calculatedM2: "75.64",
      status: "ready_for_production",
      parentItemId: "mae-1",
      complementReason: CAMPOS.complementReason,
      complementRequestedBy: "Maria Silva",
    });
    expect(capturado.values.complementRequestedAt).toEqual(CAMPOS.complementRequestedAt);
  });

  it("ZERA o ciclo: o filho começa do início, sem herdar produção nem reuso da mãe", async () => {
    // A mãe tinha 10 produzidas, 4 reaproveitadas, 10 conferidas, 10 entregues.
    // O filho é lote NOVO: as 4 unidades vão para a impressora.
    const { tx, capturado } = txDeMentira(0);
    await storage.createComplementItemTx(tx, MAE, CAMPOS);
    expect(capturado.values).toMatchObject({
      quantityProduced: null,
      reuseQty: 0,
      isReuse: false,
      conferredQty: 0,
      deliveredQty: 0,
      hasModifiedData: false,
      rejectedBySponsor: false,
      rejectedByCreator: false,
    });
  });

  it("NÃO carrega o histórico da mãe (observação, conferência, entrega, arquivos anteriores)", async () => {
    const { tx, capturado } = txDeMentira(0);
    await storage.createComplementItemTx(tx, MAE, CAMPOS);
    for (const campo of [
      "observations", "conferenceNotes", "deliveryNotes",
      "conferencePhotoUrl", "deliveryPhotoUrl", "receivedBy",
      "previousFinalFileUrl", "previousFinalFileName", "previousApprovalThumbUrl",
      "producedAt", "deliveredAt", "conferredAt", "productionStartedAt",
      "deletedAt", "id", "createdAt", "updatedAt",
    ]) {
      expect(capturado.values[campo]).toBeUndefined();
    }
  });

  it("mãe REAPROVEITADA não contamina o filho — as novas nascem para impressão", async () => {
    const maeReuso = { ...MAE, isReuse: true, reuseQty: 10 } as unknown as Item;
    const { tx, capturado } = txDeMentira(0);
    await storage.createComplementItemTx(tx, maeReuso, CAMPOS);
    expect(capturado.values.isReuse).toBe(false);
    expect(capturado.values.reuseQty).toBe(0);
  });
});
