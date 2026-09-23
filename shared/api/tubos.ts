// ─────────────────────────────────────────────────────────────────────────────
// CONTRATOS DE GET /api/tubos (server/routes/tubos.ts).
//
// Duas formas na MESMA rota:
//   · sem parâmetro   → `TuboResumo[]` (a fila da Gráfica lê número e linhas);
//   · `?detalhe=1`    → `TuboDaAba[]` (a aba Tubos: evento, fotos, conteúdo).
// Ambas só trazem volume ABERTO e o entregue há até 60 dias.
// ─────────────────────────────────────────────────────────────────────────────

/** Linha de um volume: quanto da peça está nele. */
export interface LinhaDoTubo { itemId: string; quantidade: number; entregue: boolean }

/** Elemento de GET /api/tubos (sem `?detalhe`). */
export interface TuboResumo {
  id: string;
  numero: number;
  avulso: boolean;
  eventId: string;
  entregueEm: string | null;
  fechadoEm: string | null;
  linhas: LinhaDoTubo[];
}

/** A peça dentro do volume (pecaParaTela). */
export interface PecaDoTubo {
  id: string;
  displayId: string | null;
  type: string;
  description: string | null;
  quantity: number;
  /** A quantidade da peça NESTE volume. */
  quantidadeNoTubo: number;
  status: string;
  conferredQty: number;
  embaladaQty: number;
  deliveredQty: number;
  /** Quanto ainda dá para embalar agora (conferidas − já embaladas). */
  aEmbalar: number;
  [campo: string]: unknown;
}

/** Elemento de GET /api/tubos?detalhe=1. */
export interface TuboDaAba {
  id: string;
  numero: number;
  avulso: boolean;
  evento: { id: string; name: string; truckDepartureDate: string | null };
  criadoEm: string | null;
  fotosFechamento: string[];
  fechadoEm: string | null;
  fechadoPor: string | null;
  entregueEm: string | null;
  recebidoPor: string | null;
  entreguePor: string | null;
  fotoEntregaUrl: string | null;
  entregueObs: string | null;
  pecas: PecaDoTubo[];
  unidades: number;
  /** Quem enxerga o volume inteiro e não esbarra na trava do Kit. */
  podeAgir: boolean;
}
