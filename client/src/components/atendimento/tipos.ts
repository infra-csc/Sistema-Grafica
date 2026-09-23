// ─────────────────────────────────────────────────────────────────────────────
// OS TIPOS DO ATENDIMENTO — o formato das respostas que a tela lê.
//
// Tudo o que vem da API chega por JSON: as colunas de data viram texto ISO.
// Por isso os tipos partem do schema (a fonte única das colunas) passados por
// `Serializado`, e não de interfaces escritas à mão que envelheceriam sozinhas.
// ─────────────────────────────────────────────────────────────────────────────
import type { AuditLog, Event, Item, Sponsor, StandardItem } from "@shared/schema";
import type { RemessaDoKit } from "@shared/kit";
import type { PecaComProducao } from "@/lib/detalhe-producao";

/** A linha como chega pelo JSON: toda coluna de data vira texto ISO. */
export type Serializado<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};

/**
 * Evento de GET /api/events — e também o `item.event` que vem junto da peça
 * (cru do storage, com as datas da remessa quando é peça do Kit).
 */
export type EventoAtendimento = Serializado<Event> & { manuallyClosed?: boolean | null };

/**
 * Peça de GET /api/items (recortes da fila e do histórico, já expandidos do
 * formato compacto). Além das colunas, o servidor anexa o evento, a remessa do
 * Kit e o tubo — o que a jornada e o selo de produção leem.
 */
export type PecaAtendimento = Serializado<Item>
  & Pick<PecaComProducao, "tuboNumero" | "tuboAvulso" | "tuboVolumes" | "tuboEntregueEm" | "tuboRecebidoPor">
  & {
    event?: EventoAtendimento | null;
    kitRemessa?: Partial<RemessaDoKit> | null;
    /** Fechamento do tubo em que a peça foi embalada (enrich do servidor). */
    tuboFechadoEm?: string | null;
  };

/** A peça aberta no modal do Histórico leva o evento já resolvido junto. */
export type PecaDoHistorico = PecaAtendimento & { _ev?: EventoAtendimento };

/** Patrocinador do catálogo (/api/sponsors) e dos vínculos de cada peça. */
export type Patrocinador = Serializado<Sponsor>;

/** Patrocinador candidato no "Adicionar patrocinador" do modal (admin). */
export type CandidatoAPatrocinador = Patrocinador & { foraDoEvento: boolean };

/** /api/events/:id/sponsors devolve VÍNCULOS — o nome vem do catálogo. */
export interface VinculoDoEvento {
  sponsorId: string;
  quota?: string | null;
}

/** Status de aprovação de UM patrocinador numa peça. */
export type StatusDaAprovacao = "pending" | "approved" | "rejected" | "awaiting_arte" | "new_version_pending";

export interface SponsorApproval {
  /** A linha remendada na hora (patrocinador recém-adicionado) ainda não tem id. */
  id?: string;
  itemId: string;
  sponsorId: string;
  status: StatusDaAprovacao;
  approvedBy?: string | null;
  approvedAt?: Date | string | null;
  rejectedBy?: string | null;
  rejectedAt?: Date | string | null;
  rejectionReason?: string | null;
  sponsor?: {
    id: string;
    name: string;
  } | null;
}

/** GET /api/items/batch-approval-data, já expandido do formato compacto. */
export interface LoteDeAprovacoes {
  sponsorsByItem?: Record<string, Patrocinador[]>;
  approvalsByItem?: Record<string, SponsorApproval[]>;
}

/** Registro da trilha da peça (GET /api/audit-logs?entityType=item). */
export type RegistroDeAuditoria = Omit<Serializado<AuditLog>, "details"> & {
  /** Texto na coluna; algumas rotas já o devolvem como objeto. */
  details: string | Record<string, unknown> | null;
};

/** Modelo de peça (/api/standard-items) — a tela só lê nome e grupo. */
export type ModeloDePeca = Serializado<StandardItem>;

/** Resposta das decisões por patrocinador (aprovar, reprovar, reverter). */
export interface RespostaDaDecisao {
  approval?: SponsorApproval | null;
  item?: PecaAtendimento;
  allApproved?: boolean;
  allDecided?: boolean;
}

/** Resposta do DELETE /api/items/:id/sponsors/:sponsorId. */
export interface RespostaDoDesvinculo {
  item?: PecaAtendimento;
  pecaInativada?: boolean;
  rodadaFechou?: boolean;
}

/** Resposta do disparo à mão do aviso da gestão. */
export interface RespostaDoAviso {
  status?: string;
  mensagem?: string;
}

/** O que o lote devolve: as decisões que passaram e as que não. */
export interface ResultadoDoLote {
  results: RespostaDaDecisao[];
  falhas: { displayId: string; erro: string }[];
  total: number;
}

/** Patrocinador escolhido numa linha do modal (confirmar, desvincular). */
export interface AlvoDePatrocinador {
  itemId: string;
  sponsorId: string;
  sponsorName: string;
}

/** O papel de quem olha — só o que a tela confere. */
export type UsuarioDaTela = { role: string } | null | undefined;

/** Tamanho dos botões: 44px quando o ponteiro é o dedo. */
export type TamanhoDoBotao = "toque" | "md";

export type AbaDoAtendimento = "pending" | "history";

/** Recorte de uma faceta: o que cada menu de filtro recebe. */
export interface OpcaoContada {
  value: string;
  label: string;
  count: number;
  dotColor?: string;
}
