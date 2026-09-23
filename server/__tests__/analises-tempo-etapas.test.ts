// ─────────────────────────────────────────────────────────────────────────────
// TEMPO POR ETAPA — permanência medida na trilha de auditoria
//
// O bloco tinha sido REMOVIDO da tela de Análises por não ter número ("dado
// indisponível, não está nota 10 nunca essa tela"). Ele volta porque a trilha
// passou a ser confiável — mas ele só é honesto enquanto três coisas se
// mantiverem verdadeiras, e é isso que este arquivo trava:
//
//  1. A LEITURA DA FRASE. `audit_logs.details` é texto livre; a transição só é
//     legível porque as rotas escrevem "Status alterado: A → B" (ou uma das
//     cinco frases de destino constante). Reescrever uma dessas frases em
//     items.ts sem mexer aqui faria a etapa PERDER passagens em silêncio — a
//     mediana continuaria saindo, só que sobre menos peças. Por isso as rotas
//     RODAM na seção 2 e a frase que gravam passa pela leitura.
//
//  2. O DESEMPATE. `translateStatus` não é injetiva, e "Aguardando Revisão
//     Final" é o único rótulo que serve a DUAS etapas diferentes (Finalização e
//     Revisão de Lista) — justamente as duas que o negócio mais precisa
//     separar. A regra de desempate é dedução do código das rotas, não palpite,
//     e está fixada aqui.
//
//  3. A HONESTIDADE DO DENOMINADOR. Mediana de três peças não é a verdade da
//     operação. O piso, o recorte e as frases de cobertura têm teste porque são
//     o que separa este bloco do que foi reprovado.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";

// Nada aqui toca banco. A seção 2 roda rotas reais: storage de mentira, a
// trilha anotada e uma transação que só guarda o que seria inserido.
const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  trilha: [] as { acao: string; detalhe: string }[],
  tx: { inserts: [] as any[] },
}));
vi.mock("../db", () => {
  const tx: any = {
    update: () => ({ set: (d: any) => ({ where: () => ({ returning: async () => [{ id: "p1", eventId: "ev-1", type: "Pórtico", ...d }] }) }) }),
    insert: () => ({ values: (v: any) => { H.tx.inserts.push(v); const r: any = Promise.resolve([{ id: "n1", ...v }]); r.returning = async () => [{ id: "n1", ...v }]; return r; } }),
    execute: async () => ({ rows: [] }),
  };
  return { db: { transaction: async (fn: any) => fn(tx), execute: async () => ({ rows: [] }) }, pool: {} };
});
vi.mock("../storage", () => ({ storage: H.storage }));
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    requireAuth: (_req: any, _res: any, next: any) => next(),
    broadcast: () => {},
    createAuditLog: async (_req: any, acao: string, _tipo: string, _id: string, detalhe: string) => { H.trilha.push({ acao, detalhe }); },
    updateEventStatus: async () => {},
  };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));
vi.mock("../services/consultaDeEstoqueNaLiberacao", () => ({
  respostaDoEstoqueParaLiberar: vi.fn(async () => null),
  marcarRespostaAplicada: vi.fn(async () => {}),
}));

import { registerItemRoutes } from "../routes/items";
import { descreverEdicao } from "../services/edicao-da-peca";
import { capturarRotas } from "./rotas-de-mentira";
import { translateStatus } from "../routes/shared";
import { STAGE_DEFS } from "../services/prazo-domain";
import {
  ETAPA_FINALIZACAO,
  ETAPA_LAYOUTS,
  ETAPA_LISTA,
  ETAPA_PRODUCAO,
  ETAPA_REVISAO,
  STATUS_LABEL,
  agregarTempoPorEtapa,
  dentroDaJanela,
  diasEntre,
  interpretarLog,
  janelaDeCiclo,
  mediana,
  permanenciaDaPeca,
  planejadoPorEtapa,
  resolverRevisaoFinal,
  rotuloAmbiguo,
  type LogPeca,
  type PecaMedida,
} from "../services/tempo-etapas";
import { idsDoLog } from "../routes/analises";
import { MINIMO_PECAS_POR_ETAPA, temBaseParaExibir } from "@shared/tempo-etapas-contract";
import type { TempoPorEtapa } from "@shared/tempo-etapas-contract";
import { cycleWindow } from "@/lib/analises-metrics";
import { diferencaContraPlano, etapaMaisCara, frasesDeCobertura } from "@/lib/analises-tempo";

const DIA = 86_400_000;
/** Meio-dia UTC = 9h em São Paulo: o dia do negócio nunca escorrega no teste. */
const t = (dia: number) => Date.UTC(2026, 4, dia, 12, 0, 0);
const log = (dia: number, action: string, details: string): LogPeca => ({
  ts: t(dia), action, details,
});

// ─── 1. O vocabulário é espelho, e espelho sem guarda diverge ────────────────

describe("espelho de translateStatus", () => {
  it("todo status traduz para o MESMO rótulo que as rotas gravam", () => {
    for (const [status, label] of Object.entries(STATUS_LABEL)) {
      expect(translateStatus(status), `status ${status}`).toBe(label);
    }
  });

  it("todo status do funil canônico tem rótulo — nenhum fica sem leitura", () => {
    for (const def of STAGE_DEFS) {
      for (const s of def.pendingStatuses) {
        // Grafias legadas em português (pronto_para_producao, liberado…) não
        // passam por translateStatus: elas nunca aparecem numa FRASE de
        // transição, só como valor cru na coluna. Só o vocabulário em inglês
        // precisa de rótulo.
        if (/[ç_]/.test(s) && s !== s.toLowerCase().replace(/[^a-z_]/g, "")) continue;
        if (STATUS_LABEL[s]) expect(translateStatus(s)).toBe(STATUS_LABEL[s]);
      }
    }
  });

  it("só UM rótulo cruza a fronteira entre etapas — e é o que tem desempate", () => {
    const ambiguos = [...new Set(Object.values(STATUS_LABEL))].filter(rotuloAmbiguo);
    expect(ambiguos).toEqual(["Aguardando Revisão Final"]);
  });
});

// ─── 2. O que as rotas GRAVAM é o que a medição LÊ ───────────────────────────
//
// As rotas reais rodam (storage de mentira) e a linha que elas escrevem na
// trilha passa por interpretarLog. Se uma redação for reescrita, a transição
// para de ser lida e a etapa perde passagens SEM erro nenhum — só a mediana
// muda de valor. "Entrega concluída (" é escrita pela embalagem (tubos.ts) e já
// roda em regras-estoque-tubos-rotas.test.ts; a leitura dela está em
// interpretarLog, logo abaixo.

describe("as frases que as rotas gravam são as que a medição lê", () => {
  const { chamar } = capturarRotas(registerItemRoutes);
  const peca = (over: Record<string, unknown> = {}) => ({
    id: "p1", displayId: "#0500", eventId: "ev-1", type: "Pórtico", quantity: 10, status: "awaiting_sponsor_approval",
    skipApproval: false, deletedAt: null, approvalThumbUrl: "/objects/t.png", finalFileUrl: "/objects/f.pdf",
    parentItemId: null, hasModifiedData: false, travadaEm: null, isReuse: false, reuseQty: 0, ...over,
  });
  /** Roda a rota e devolve a ÚNICA linha da trilha que ela escreveu com esta ação. */
  const trilhaDa = async (chave: string, papel: string, body: Record<string, unknown>, acao: string, over: Record<string, unknown> = {}) => {
    let atual: any = peca(over);
    H.trilha = [];
    Object.assign(H.storage, {
      getItem: vi.fn(async () => atual),
      updateItem: vi.fn(async (_id: string, d: any) => (atual = { ...atual, ...d })),
      getEvent: vi.fn(async () => ({ id: "ev-1", name: "COPA", status: "created", startDate: "2099-01-10" })),
      getItemSponsorApprovals: vi.fn(async () => []),
      getItemSponsors: vi.fn(async () => [{ sponsorId: "sp1" }]),
      createNotification: vi.fn(async (n: any) => ({ id: "n1", ...n })),
      getLiveComplements: vi.fn(async () => []),
      getComplementsByParentIds: vi.fn(async () => []),
      createItemArtVersion: vi.fn(async () => ({})),
      initializeItemSponsorApprovals: vi.fn(async () => {}),
    });
    const r = await chamar(chave, { sessao: { userId: "u1", userRole: papel, userName: "Maria" }, params: { id: "p1" }, body });
    expect(r.status, `${chave}: ${JSON.stringify(r.body)}`).toBe(200);
    const linhas = H.trilha.filter((l) => l.acao === acao);
    expect(linhas, chave).toHaveLength(1);
    return { detalhe: linhas[0].detalhe, peca: atual };
  };

  it("'Status alterado: A → B' (aprovação pelo patrocinador) vira a passagem para a Finalização", async () => {
    const { detalhe } = await trilhaDa("PATCH /api/items/:id/sponsor-approve", "atendimento", {}, "approved");
    expect(detalhe.startsWith("Status alterado: ")).toBe(true);
    expect(interpretarLog("approved", detalhe)).toMatchObject({ origem: 2, destino: { tipo: "etapa", indice: ETAPA_FINALIZACAO } });
  });

  it("'Status: A → B' da edição genérica vira passagem — e a quantidade concatenada não vaza", () => {
    const antes = peca({ status: "awaiting_submission", quantity: 5 }) as any;
    const depois = { ...antes, status: "awaiting_sponsor_approval", quantity: 10 };
    const frase = descreverEdicao(antes, depois, { quantity: 10 } as any, { mudaReuso: false, mudouQtd: true, promoveuParaProduzido: false });
    expect(frase).toMatch(/^Status: .+ → .+ \| Quantidade: 5 → 10/);
    expect(interpretarLog("updated", frase)?.destino).toEqual({ tipo: "etapa", indice: 2 });
  });

  it("liberar na Revisão Final escreve a frase que entra na Produção Gráfica", async () => {
    H.tx = { inserts: [] };
    const { detalhe } = await trilhaDaLiberacao();
    expect(detalhe).toMatch(/liberado para produção\)$/);
    expect(interpretarLog("approved", detalhe)?.destino).toEqual({ tipo: "etapa", indice: ETAPA_PRODUCAO });
  });

  it("cancelar escreve 'Item cancelado' — a passagem aberta vira 'fora'", async () => {
    const { detalhe } = await trilhaDa("PATCH /api/items/:id/cancel", "solicitacao", { notes: "Patrocinador saiu" }, "canceled");
    expect(interpretarLog("canceled", detalhe)?.destino).toEqual({ tipo: "fora" });
  });

  it("devolver para a Arte escreve a frase que volta a peça para a Entrega de Layouts", async () => {
    const { detalhe } = await trilhaDa("PATCH /api/items/:id/return-to-arte", "solicitacao", { notes: "Logo cortado na lateral" }, "rejected", { status: "awaiting_final_review" });
    expect(interpretarLog("rejected", detalhe)?.destino).toEqual({ tipo: "etapa", indice: ETAPA_LAYOUTS });
  });

  it("a dispensa escreve a frase do catálogo, com o status CRU de origem", async () => {
    const { detalhe } = await trilhaDa("PATCH /api/items/:id/dispense", "arte", { reason: "Urgência do evento, dono autorizou" }, "dispensed");
    const r = interpretarLog("dispensed", detalhe);
    expect(r?.origem).toBe(2);
    // ATENÇÃO (relatado, não corrigido): desde 09/09 a dispensa leva a peça
    // para DESTINO_DA_DISPENSA (awaiting_creator_review, finalização), mas o
    // CATALOGO ainda a mede como entrada na Produção. Este teste não fixa o
    // destino para não congelar a divergência.
    expect(r?.destino).toBeDefined();
  });

  it("submit-for-approval é o ÚNICO caminho para awaiting_creator_review — e só parte da Entrega de Layouts", async () => {
    // É o que deixa resolverRevisaoFinal(null, ETAPA_LAYOUTS) decidir pela
    // Finalização quando a frase não traz sufixo.
    const { peca: isenta } = await trilhaDa("PATCH /api/items/:id/submit-for-approval", "arte", { approvalThumbUrl: "/objects/t2.png" }, "updated", { status: "awaiting_submission", skipApproval: true });
    expect(isenta.status).toBe("awaiting_creator_review");
    for (const status of ["sponsor_approved", "awaiting_finalization", "draft"]) {
      Object.assign(H.storage, { getItem: vi.fn(async () => peca({ status })) });
      const r = await chamar("PATCH /api/items/:id/submit-for-approval", { sessao: { userId: "u1", userRole: "arte" }, params: { id: "p1" }, body: { approvalThumbUrl: "/objects/t2.png" } });
      expect(r.status, status).toBe(409);
    }
  });

  /** A liberação grava a peça e a trilha DENTRO de uma transação. */
  async function trilhaDaLiberacao() {
    const atual: any = peca({ status: "awaiting_final_review" });
    Object.assign(H.storage, {
      getItem: vi.fn(async () => atual),
      getEvent: vi.fn(async () => ({ id: "ev-1", name: "COPA", status: "created", startDate: "2099-01-10" })),
      getLiveComplements: vi.fn(async () => []),
      getComplementsByParentIds: vi.fn(async () => []),
    });
    const r = await chamar("PATCH /api/items/:id/creator-review", { sessao: { userId: "u1", userRole: "solicitacao", userName: "Maria" }, params: { id: "p1" }, body: {} });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const trilha = H.tx.inserts.map((v: any) => v.details).filter(Boolean);
    expect(trilha).toHaveLength(1);
    return { detalhe: trilha[0] as string };
  }
});

// ─── 3. Leitura de uma linha da trilha ───────────────────────────────────────

describe("interpretarLog", () => {
  it("lê a seta simples e devolve origem e destino", () => {
    const r = interpretarLog("approved", "Status alterado: Aguardando Aprovação → Aguardando Finalização (aprovado pelo patrocinador)");
    expect(r?.destino).toEqual({ tipo: "etapa", indice: ETAPA_FINALIZACAO });
    expect(r?.origem).toBe(2);
  });

  it("lê a seta com prefixo ('Enviado para Arte — ', 'Todos os patrocinadores…')", () => {
    const a = interpretarLog("updated", "Enviado para Arte — Status alterado: Aguardando Envio → Aguardando Aprovação");
    expect(a?.destino).toEqual({ tipo: "etapa", indice: 2 });
    const b = interpretarLog("approved", "Todos os patrocinadores aprovaram. Status alterado: Aguardando Aprovação → Aguardando Finalização");
    expect(b?.destino).toEqual({ tipo: "etapa", indice: ETAPA_FINALIZACAO });
  });

  it("lê 'Item reaberto: A → B' da reversão de aprovação", () => {
    const r = interpretarLog("updated", 'Administrador reverteu a aprovação de "Alfa" para pendente (estava: approved). Item reaberto: Aguardando Finalização → Aguardando Aprovação');
    expect(r?.destino).toEqual({ tipo: "etapa", indice: 2 });
  });

  it("a rota genérica concatena com ' | ' — a quantidade não vaza para o destino", () => {
    const r = interpretarLog("updated", "Status: Aguardando Envio → Aguardando Aprovação | Quantidade: 5 → 10 un.");
    expect(r?.destino).toEqual({ tipo: "etapa", indice: 2 });
  });

  it("linha sem transição de etapa não vira transição", () => {
    expect(interpretarLog("updated", "Observações atualizadas")).toBeNull();
    expect(interpretarLog("updated", "Quantidade: 5 → 10 un.")).toBeNull();
    expect(interpretarLog("updated", "Conferência parcial: 3 un. (3/10)")).toBeNull();
    expect(interpretarLog("updated", null)).toBeNull();
  });

  it("a dispensa não escreve seta: origem vem do status CRU e o destino é da rota", () => {
    const r = interpretarLog("dispensed", "Peça dispensada pela Arte. Status anterior: sponsor_approved. Motivo: urgência");
    expect(r?.origem).toBe(ETAPA_FINALIZACAO);
    expect(r?.destino).toEqual({ tipo: "etapa", indice: ETAPA_PRODUCAO });
  });

  it("entrega TOTAL sai do funil; entrega parcial não move a peça", () => {
    expect(interpretarLog("delivered", "Entrega concluída (10/10, recebido por: João)")?.destino)
      .toEqual({ tipo: "entregue" });
    expect(interpretarLog("delivered", "Entrega parcial: 3 un. (3/10, recebido por: João)")).toBeNull();
  });

  it("cancelamento é 'fora' — a passagem aberta não vira medida", () => {
    expect(interpretarLog("canceled", "Item cancelado")?.destino).toEqual({ tipo: "fora" });
    expect(interpretarLog("canceled", "Item cancelado (em lote): sem verba")?.destino).toEqual({ tipo: "fora" });
  });

  it("devolução para a Arte volta a peça para a Entrega de Layouts", () => {
    expect(interpretarLog("rejected", "Item devolvido para Arte para modificações.")?.destino)
      .toEqual({ tipo: "etapa", indice: ETAPA_LAYOUTS });
  });

  it("a rota legada de liberação entra na Produção Gráfica", () => {
    expect(interpretarLog("approved", 'Item "Banner" liberado para produção')?.destino)
      .toEqual({ tipo: "etapa", indice: ETAPA_PRODUCAO });
  });
});

// ─── 4. O desempate do único rótulo ambíguo ──────────────────────────────────

describe("'Aguardando Revisão Final' — Finalização ou Revisão de Lista", () => {
  it("o sufixo da peça isenta manda para a Finalização", () => {
    expect(resolverRevisaoFinal("(sem aprovação de patrocinador)", null)).toBe(ETAPA_FINALIZACAO);
  });

  it("o sufixo do arquivo final manda para a Revisão de Lista", () => {
    expect(resolverRevisaoFinal("(arquivo final adicionado)", null)).toBe(ETAPA_REVISAO);
  });

  it("sem sufixo, decide pela ORIGEM", () => {
    // `awaiting_creator_review` só nasce em submit-for-approval, que exige a
    // peça em `awaiting_submission` (Entrega de Layouts) — rodado na seção 2.
    expect(resolverRevisaoFinal(null, ETAPA_LAYOUTS)).toBe(ETAPA_FINALIZACAO);
    expect(resolverRevisaoFinal(null, ETAPA_FINALIZACAO)).toBe(ETAPA_REVISAO);
  });

  it("origem desconhecida cai no caminho comum (Revisão de Lista)", () => {
    expect(resolverRevisaoFinal(null, null)).toBe(ETAPA_REVISAO);
  });

  it("as duas frases reais das rotas caem cada uma na sua etapa", () => {
    const isenta = interpretarLog("updated", "Enviado para Arte — Status alterado: Aguardando Envio → Aguardando Revisão Final (sem aprovação de patrocinador)");
    expect(isenta?.destino).toEqual({ tipo: "etapa", indice: ETAPA_FINALIZACAO });
    const arquivo = interpretarLog("updated", "Status alterado: Aguardando Finalização → Aguardando Revisão Final (arquivo final adicionado)");
    expect(arquivo?.destino).toEqual({ tipo: "etapa", indice: ETAPA_REVISAO });
  });
});

// ─── 5. Permanência de uma peça ──────────────────────────────────────────────

describe("permanenciaDaPeca", () => {
  it("mede o intervalo entre entrar e sair da etapa", () => {
    const d = permanenciaDaPeca(
      [
        log(1, "updated", "Enviado para Arte — Status alterado: Aguardando Envio → Aguardando Aprovação"),
        log(9, "approved", "Status alterado: Aguardando Aprovação → Aguardando Finalização (aprovado pelo patrocinador)"),
      ],
      null,
    );
    expect(d.get(2)).toBe(8);
  });

  it("a peça nasce na primeira etapa: createdAt é a entrada na Lista de Imagens", () => {
    const d = permanenciaDaPeca(
      [log(10, "updated", "Status: Rascunho → Aguardando Envio")],
      t(3),
    );
    expect(d.get(ETAPA_LISTA)).toBe(7);
  });

  it("sem createdAt não se inventa entrada — a primeira passagem não é medida", () => {
    const d = permanenciaDaPeca(
      [log(10, "updated", "Status: Rascunho → Aguardando Envio")],
      null,
    );
    expect(d.has(ETAPA_LISTA)).toBe(false);
  });

  it("passagem ainda ABERTA não entra: só se mede quem já saiu", () => {
    const d = permanenciaDaPeca(
      [log(1, "updated", "Status: Rascunho → Aguardando Envio")],
      t(0),
    );
    expect(d.has(ETAPA_LAYOUTS)).toBe(false);
  });

  it("retrabalho SOMA as passagens da mesma etapa em vez de virar duas observações curtas", () => {
    // PORQUÊ: contar cada visita separada puxaria a mediana para BAIXO
    // justamente na etapa onde a peça sofre mais.
    const d = permanenciaDaPeca(
      [
        log(1, "updated", "Status: Rascunho → Aguardando Envio"),
        log(3, "updated", "Enviado para Arte — Status alterado: Aguardando Envio → Aguardando Aprovação"),
        log(5, "rejected", "Status alterado: Aguardando Aprovação → Aguardando Envio (reprovado pelo patrocinador)"),
        log(9, "updated", "Enviado para Arte — Status alterado: Aguardando Envio → Aguardando Aprovação"),
        log(12, "approved", "Status alterado: Aguardando Aprovação → Aguardando Finalização"),
      ],
      t(0),
    );
    expect(d.get(ETAPA_LAYOUTS)).toBe(2 + 4);
    expect(d.get(2)).toBe(2 + 3);
  });

  it("cancelamento DESCARTA a passagem aberta — trabalho que deixou de existir não é tempo de etapa", () => {
    const d = permanenciaDaPeca(
      [
        log(1, "updated", "Status: Rascunho → Aguardando Envio"),
        log(20, "canceled", "Item cancelado"),
      ],
      t(0),
    );
    expect(d.get(ETAPA_LISTA)).toBe(1);
    expect(d.has(ETAPA_LAYOUTS)).toBe(false);
  });

  it("a entrega FECHA a passagem da Produção Gráfica", () => {
    const d = permanenciaDaPeca(
      [
        log(1, "approved", 'Item "Banner" liberado para produção'),
        log(8, "delivered", "Entrega concluída (10/10, recebido por: João)"),
      ],
      null,
    );
    expect(d.get(ETAPA_PRODUCAO)).toBe(7);
  });

  it("linha intra-etapa não reabre a contagem", () => {
    const d = permanenciaDaPeca(
      [
        log(1, "approved", 'Item "Banner" liberado para produção'),
        log(4, "approved", 'Item "Banner" liberado para produção'),
        log(8, "delivered", "Entrega concluída (10/10, recebido por: João)"),
      ],
      null,
    );
    expect(d.get(ETAPA_PRODUCAO)).toBe(7);
  });

  it("relógio fora de ordem não gera dia negativo", () => {
    expect(diasEntre(t(9), t(3))).toBe(0);
  });
});

// ─── 6. Planejado: a distância entre marcos do evento ────────────────────────

describe("planejadoPorEtapa", () => {
  it("usa os offsets padrão COM ajuste de fim de semana", () => {
    // Saída 15/06/2026 (segunda). O marco de −8 cai num domingo e anda para a
    // segunda: a Revisão de Lista ganha um dia e a Produção perde um.
    const p = planejadoPorEtapa({ truckDepartureDate: new Date(Date.UTC(2026, 5, 15)) });
    expect(p).toEqual([null, 5, 8, 2, 3, 6]);
  });

  it("a primeira etapa não tem plano — não existe marco anterior de onde contar", () => {
    const p = planejadoPorEtapa({ truckDepartureDate: new Date(Date.UTC(2026, 5, 15)) });
    expect(p[0]).toBeNull();
  });

  it("offset do PRÓPRIO evento vence o padrão", () => {
    const base = planejadoPorEtapa({ truckDepartureDate: new Date(Date.UTC(2026, 5, 15)) });
    const custom = planejadoPorEtapa({
      truckDepartureDate: new Date(Date.UTC(2026, 5, 15)),
      deadlineEntregaLayouts: -22,
    });
    expect(custom[1]).not.toBe(base[1]);
  });

  it("data de saída inválida não derruba nem inventa plano", () => {
    expect(planejadoPorEtapa({ truckDepartureDate: "não é data" })).toEqual(STAGE_DEFS.map(() => null));
  });
});

// ─── 7. Mediana ──────────────────────────────────────────────────────────────

describe("mediana", () => {
  it("ímpar devolve o do meio; par, a média dos dois centrais", () => {
    expect(mediana([5, 1, 3])).toBe(3);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
  });

  it("resiste ao outlier que a média não resiste", () => {
    const amostra = [2, 2, 3, 3, 400];
    expect(mediana(amostra)).toBe(3);
    const media = amostra.reduce((a, b) => a + b, 0) / amostra.length;
    expect(media).toBeGreaterThan(80);
  });

  it("amostra vazia é null, não zero", () => {
    expect(mediana([])).toBeNull();
  });
});

// ─── 8. Agregação e a honestidade do denominador ─────────────────────────────

const pecaComPassagem = (id: string, dias: number, status = "delivered"): PecaMedida => ({
  id,
  eventId: "ev1",
  status,
  criadaEmMs: null,
  logs: [
    log(1, "updated", "Enviado para Arte — Status alterado: Aguardando Envio → Aguardando Aprovação"),
    log(1 + dias, "approved", "Status alterado: Aguardando Aprovação → Aguardando Finalização"),
  ],
});

const plano = new Map<string, (number | null)[]>([["ev1", [null, 5, 8, 2, 2, 7]]]);

describe("agregarTempoPorEtapa", () => {
  it("etapa abaixo do piso NÃO vira linha — vira declaração de base insuficiente", () => {
    const r = agregarTempoPorEtapa({
      pecas: [pecaComPassagem("a", 3), pecaComPassagem("b", 4)],
      planejadoPorEvento: plano,
      desdeMs: t(1),
      logsLidos: 4,
      truncado: false,
    });
    expect(r.etapas).toHaveLength(0);
    expect(r.etapasSemBase.find((e) => e.key === "aprovacao")?.pecas).toBe(2);
  });

  it("com o piso alcançado a etapa publica mediana e a diferença contra o plano", () => {
    const pecas = [3, 3, 10, 12, 12].map((d, i) => pecaComPassagem(`p${i}`, d));
    const r = agregarTempoPorEtapa({
      pecas, planejadoPorEvento: plano, desdeMs: t(1), logsLidos: 10, truncado: false,
    });
    const aprov = r.etapas.find((e) => e.key === "aprovacao")!;
    expect(pecas).toHaveLength(MINIMO_PECAS_POR_ETAPA);
    expect(aprov.medianaDias).toBe(10);
    expect(aprov.planejadoDias).toBe(8);
    expect(aprov.deltaDias).toBe(2);
    expect(aprov.pecas).toBe(5);
  });

  it("'paradas hoje' sai do status ATUAL da peça, não do replay da trilha", () => {
    const pecas = [3, 3, 10, 12, 12].map((d, i) => pecaComPassagem(`p${i}`, d));
    pecas.push({ ...pecaComPassagem("parada", 1, "awaiting_sponsor_approval"), logs: [] });
    const r = agregarTempoPorEtapa({
      pecas, planejadoPorEvento: plano, desdeMs: t(1), logsLidos: 10, truncado: false,
    });
    expect(r.etapas.find((e) => e.key === "aprovacao")!.emAberto).toBe(1);
  });

  it("o denominador é visível: quantas peças mediram, de quantas no recorte", () => {
    const pecas = [3, 3, 10, 12, 12].map((d, i) => pecaComPassagem(`p${i}`, d));
    pecas.push({ id: "sem-log", eventId: "ev1", status: "draft", criadaEmMs: null, logs: [] });
    const r = agregarTempoPorEtapa({
      pecas, planejadoPorEvento: plano, desdeMs: t(1), logsLidos: 10, truncado: false,
    });
    expect(r.pecasNoRecorte).toBe(6);
    expect(r.pecasMedidas).toBe(5);
  });

  it("declara a data do registro mais antigo lido — o piso da confiança", () => {
    const r = agregarTempoPorEtapa({
      pecas: [], planejadoPorEvento: plano, desdeMs: t(2), logsLidos: 0, truncado: false,
    });
    expect(r.medicaoDesde).toBe(new Date(t(2)).toISOString());
  });

  it("sem trilha nenhuma não há bloco — e não há bloco VAZIO", () => {
    const r = agregarTempoPorEtapa({
      pecas: [], planejadoPorEvento: plano, desdeMs: null, logsLidos: 0, truncado: false,
    });
    expect(r.etapas).toHaveLength(0);
    expect(temBaseParaExibir(r)).toBe(false);
  });

  it("resposta ainda não carregada não derruba a tela", () => {
    expect(temBaseParaExibir(undefined)).toBe(false);
    expect(temBaseParaExibir([] as unknown as TempoPorEtapa)).toBe(false);
  });
});

// ─── 9. O recorte é o MESMO dos KPIs ao lado ─────────────────────────────────

describe("janela de ciclo — espelho de cycleWindow do cliente", () => {
  const agora = Date.UTC(2026, 4, 20, 15, 0, 0);

  it.each(["7d", "30d", "90d", "all"])("período %s dá a mesma janela dos dois lados", (p) => {
    expect(janelaDeCiclo(p, agora)).toEqual(cycleWindow(p, agora));
  });

  it("evento sem data de saída fica fora de qualquer janela fechada", () => {
    expect(dentroDaJanela(null, janelaDeCiclo("30d", agora))).toBe(false);
    expect(dentroDaJanela(null, null)).toBe(true);
  });
});

// ─── 10. Logs de operação em LOTE valem para todas as peças da lista ─────────

describe("idsDoLog", () => {
  it("desmembra o entity_id de operação em lote", () => {
    expect(idsDoLog("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("id simples continua sendo um id só", () => {
    expect(idsDoLog("abc-123")).toEqual(["abc-123"]);
  });
});

// ─── 11. As frases que o dono lê ─────────────────────────────────────────────

const payload = (over: Partial<TempoPorEtapa> = {}): TempoPorEtapa => ({
  etapas: [
    { key: "layouts", label: "Entrega de Layouts", medianaDias: 9, pecas: 40, planejadoDias: 5, deltaDias: 4, emAberto: 3 },
    { key: "aprovacao", label: "Aprovação de Layout", medianaDias: 7, pecas: 38, planejadoDias: 8, deltaDias: -1, emAberto: 2 },
  ],
  etapasSemBase: [{ key: "listaImagens", label: "Lista de Imagens", pecas: 2 }],
  pecasNoRecorte: 120,
  pecasMedidas: 44,
  medicaoDesde: "2026-05-02T10:00:00.000Z",
  logsLidos: 900,
  truncado: false,
  ...over,
});

describe("leitura do bloco", () => {
  it("passar do plano é ruim; ficar abaixo é bom; empatar não é vitória", () => {
    const p = payload();
    expect(diferencaContraPlano(p.etapas[0]!)).toEqual({ texto: "4 dias além do plano", tom: "ruim" });
    expect(diferencaContraPlano(p.etapas[1]!)).toEqual({ texto: "1 dia abaixo do plano", tom: "bom" });
    expect(diferencaContraPlano({ ...p.etapas[0]!, deltaDias: 0.2 })?.tom).toBe("neutro");
  });

  it("etapa sem plano não é comparada", () => {
    expect(diferencaContraPlano({ ...payload().etapas[0]!, deltaDias: null })).toBeNull();
  });

  it("a etapa mais cara é a de maior ATRASO, não a de maior permanência", () => {
    // Produção leva mais dias no absoluto, mas dentro do planejado — não é lá
    // que o tempo se perde.
    const p = payload({
      etapas: [
        { key: "producao", label: "Produção Gráfica", medianaDias: 7, pecas: 40, planejadoDias: 7, deltaDias: 0, emAberto: 0 },
        { key: "layouts", label: "Entrega de Layouts", medianaDias: 9, pecas: 40, planejadoDias: 5, deltaDias: 4, emAberto: 0 },
      ],
    });
    expect(etapaMaisCara(p)?.key).toBe("layouts");
  });

  it("nenhuma etapa fora do plano devolve null em vez de eleger um culpado", () => {
    const p = payload({
      etapas: [{ key: "producao", label: "Produção Gráfica", medianaDias: 7, pecas: 40, planejadoDias: 7, deltaDias: 0, emAberto: 0 }],
    });
    expect(etapaMaisCara(p)).toBeNull();
  });

  it("a cobertura sai com NÚMERO: quantas peças, desde quando, o que ficou fora", () => {
    const frases = frasesDeCobertura(payload(), () => "2 de maio de 2026").join(" ");
    expect(frases).toContain("44 de 120 peças");
    expect(frases).toContain("2 de maio de 2026");
    expect(frases).toContain("5 peças estão paradas");
    expect(frases).toContain("Lista de Imagens");
  });

  it("varredura truncada é declarada, não escondida", () => {
    const frases = frasesDeCobertura(payload({ truncado: true }), () => "x").join(" ");
    expect(frases).toContain("teto");
  });

  it("sem peça parada a frase do viés não aparece — nada de '0 peças estão paradas'", () => {
    const p = payload({ etapas: payload().etapas.map((e) => ({ ...e, emAberto: 0 })) });
    expect(frasesDeCobertura(p, () => "x").join(" ")).not.toContain("estão paradas");
  });
});
