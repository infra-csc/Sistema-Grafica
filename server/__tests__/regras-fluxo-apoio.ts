// ─────────────────────────────────────────────────────────────────────────────
// APOIO dos testes regras-fluxo-*: um "mundo" de peças e eventos em memória e
// o storage de mentira que as rotas de peça (server/routes/itens/*) leem.
//
// O vi.mock de ../storage, ../db e ../routes/shared fica em CADA arquivo de
// teste (o vitest só iça vi.mock do próprio arquivo); aqui mora só o que eles
// preenchem — `ligarStorage(H.storage, mundo)`.
// Não é um arquivo de teste (não termina em .test.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { vi } from "vitest";

export type Mundo = {
  itens: Record<string, any>;
  eventos: Record<string, any>;
  /** Trilha por peça (mais recente primeiro, como storage.getAuditLogs devolve). */
  trilha: Record<string, Array<{ details: string }>>;
  /** Patrocinadores de cada peça. */
  vinculos: Record<string, string[]>;
  /** Patrocinadores de cada evento. */
  doEvento: Record<string, string[]>;
  /** Linhas de aprovação por peça (item_sponsor_approvals). */
  aprovacoes: Record<string, any[]>;
  notificacoes: any[];
  criadas: any[];
};

/** Evento vivo, evento vivo 2 e um que JÁ ACONTECEU (motivoEventoFechado → "realizado"). */
export function mundoNovo(): Mundo {
  return {
    itens: {},
    eventos: {
      "ev-1": { id: "ev-1", name: "COPA NORTE", status: "created", startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01T00:00:00Z"), createdBy: "outro" },
      "ev-2": { id: "ev-2", name: "COPA SUL", status: "created", startDate: "2099-02-10", truckDepartureDate: new Date("2099-02-01T00:00:00Z"), createdBy: "outro" },
      "ev-fim": { id: "ev-fim", name: "JÁ FOI", status: "created", startDate: "2020-01-10", truckDepartureDate: new Date("2020-01-01T00:00:00Z"), createdBy: "outro" },
    },
    trilha: {},
    vinculos: {},
    doEvento: { "ev-1": ["sp-a"], "ev-2": ["sp-a"] },
    aprovacoes: {},
    notificacoes: [],
    criadas: [],
  };
}

/** Uma peça no formato da linha de `items`, com o que as rotas leem. */
export const peca = (over: Record<string, any> = {}) => ({
  id: "p1", displayId: "#0500", eventId: "ev-1", type: "Pórtico", description: "Pórtico", quantity: 10,
  quantityProduced: null, reuseQty: 0, isReuse: false, conferredQty: 0, embaladaQty: 0, deliveredQty: 0,
  status: "awaiting_submission", skipApproval: false, deletedAt: null, parentItemId: null, kitRemessaId: null,
  criadoPorId: null, observations: "Ilhós a cada 50 cm", motivoCancelamento: null, statusBeforeCancel: null,
  pedidoDePecaLinhaId: null, pedidoDePecaId: null, fileWidth: "2.00", fileHeight: "1.00", area: "2", visual: "1",
  calculatedM2: "20.00", material: "Lona", finish: "Ilhós", measurement: "2.00 × 1.00", isPriority: false,
  travadaEm: null, travadaPor: null, travadaMotivo: null, printMachine: null, impressaoPorMaquina: null,
  reservaPorMaquina: null, maquinaPrevista: null, producedAt: null, deliveredAt: null, productionStartedAt: null,
  conferredAt: null, sponsorApprovedBy: null, sponsorApprovedAt: null, creatorReviewedAt: null,
  rejectedBySponsor: false, rejectedByCreator: false, approvalThumbUrl: "/objects/uploads/t.png", finalFileUrl: null,
  ...over,
});

/** Preenche o storage de mentira (o objeto que o vi.mock de ../storage devolve). */
export function ligarStorage(s: Record<string, any>, m: Mundo): void {
  for (const k of Object.keys(s)) delete s[k];
  s.getItem = vi.fn(async (id: string) => m.itens[id]);
  s.getEvent = vi.fn(async (id: string) => m.eventos[id]);
  s.getEvents = vi.fn(async () => Object.values(m.eventos));
  s.updateItem = vi.fn(async (id: string, dados: any) => (m.itens[id] ? (m.itens[id] = { ...m.itens[id], ...dados }) : undefined));
  s.updateEvent = vi.fn(async (id: string, dados: any) => (m.eventos[id] = { ...m.eventos[id], ...dados }));
  s.createNotification = vi.fn(async (n: any) => { const feita = { id: `n${m.notificacoes.length + 1}`, ...n }; m.notificacoes.push(feita); return feita; });
  s.createItem = vi.fn(async (dados: any) => { m.criadas.push(dados); const nova = { id: "novo", displayId: "#0900", status: "draft", ...dados }; m.itens.novo = nova; return nova; });
  s.createBulkItems = vi.fn(async (lista: any[]) => { m.criadas.push(...lista); return lista.map((d, i) => ({ id: `n${i}`, displayId: `#09${i}`, ...d })); });
  s.getLiveComplements = vi.fn(async (maeId: string) => Object.values(m.itens).filter((i: any) => i.parentItemId === maeId && !i.deletedAt));
  s.getItemsByEvent = vi.fn(async (eventId: string) => Object.values(m.itens).filter((i: any) => i.eventId === eventId && !i.deletedAt));
  s.getItemSponsors = vi.fn(async (itemId: string) => (m.vinculos[itemId] ?? []).map((sponsorId) => ({ itemId, sponsorId })));
  s.getEventSponsors = vi.fn(async (eventId: string) => (m.doEvento[eventId] ?? []).map((sponsorId) => ({ eventId, sponsorId })));
  s.getSponsor = vi.fn(async (id: string) => ({ id, name: id === "sp-b" ? "Bradesco" : "Aché" }));
  s.getAuditLogs = vi.fn(async (_tipo: string, id: string) => m.trilha[id] ?? []);
  s.getItemSponsorApprovals = vi.fn(async (itemId: string) => m.aprovacoes[itemId] ?? []);
  s.createItemArtVersion = vi.fn(async () => ({}));
}

/** A sessão de quem chama (vira req.session e req.user* em rotas-de-mentira). */
export const sessao = (userRole: string, extra: Record<string, unknown> = {}) => ({ userId: "u1", userName: "Maria", userRole, ...extra });
