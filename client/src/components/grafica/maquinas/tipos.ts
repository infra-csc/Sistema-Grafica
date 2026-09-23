// ─────────────────────────────────────────────────────────────────────────────
// MÁQUINAS DA GRÁFICA — os tipos da tela.
//
// Espelho do que o servidor devolve: o retrato (server/routes/maquinas.ts) e o
// relatório (server/services/relatorioDeMaquinas.ts). Datas chegam como texto.
// ─────────────────────────────────────────────────────────────────────────────
import type { SeloPecaEventoFinalizado } from "@/lib/status";
import type { OcupanteDaImpressora } from "@shared/progresso-da-impressao";

// ─── O retrato ────────────────────────────────────────────────────────────────
export type EventoInfo = { id: string; name: string | null; status: string | null; startDate: string | null; reopenedAt: string | null };

export type PecaNaMaquina = {
  id: string;
  displayId: string | null;
  tipo: string;
  descricao: string | null;
  evento: string | null;
  quantidade: number;
  reuso: number;
  aImprimir: number;
  impressas: number;
  desde: string | null;
  maquina: string | null;
  status: string;
  miniatura: string | null;
  eventoInfo: EventoInfo | null;
  /** O que o operador usa para achar o arquivo (servidor antigo não manda). */
  material?: string | null;
  medida?: string | null;
  patrocinadores?: string[];
  /** Peça dividida entre impressoras (jsonb); ausente/null = tudo em `maquina`. */
  impressaoPorMaquina?: Record<string, { atrib: number; impressas: number }> | null;
  /** A parte DESTA impressora, quando a peça está dividida. */
  parte?: { atrib: number; impressas: number } | null;
  /** Travada pela Solicitação (shared/trava-da-peca.ts); servidor antigo não manda. */
  travadaEm?: string | null;
  travadaPor?: string | null;
  travadaMotivo?: string | null;
};

export type Registro = {
  id: string;
  itemId: string;
  displayId: string | null;
  tipoPeca: string;
  /** A descrição é o que distingue duas peças do mesmo tipo. */
  descricaoPeca?: string | null;
  evento: string | null;
  tipo: "inicio" | "troca" | "parcial" | "conclusao" | "pausa";
  /** Só na "pausa": a peça que entrou no lugar (null = só tirou da impressora). */
  deuLugarA?: string | null;
  quantidade: number;
  totalDepois: number | null;
  aImprimir: number;
  hora: string;
  quem: string | null;
  ordem: number;
};

/** Peça liberada que ainda vai para a máquina — na fila geral ou reservada. */
export type PecaNaFila = PecaNaMaquina & {
  maquinaPrevista: string | null;
  m2: number | null;
  saidaCaminhao: string | null;
  /** Dias em relação à saída do caminhão (negativo = antes). */
  prazoProducaoGrafica: number;
  // Reserva COM QUANTIDADE. Servidor na versão anterior não manda
  // nenhum destes: a tela cai no comportamento "tudo numa impressora".
  /** Unidades reservadas por impressora: { "1": 20, "2": 14 }. */
  reserva?: Record<string, number>;
  /** Unidades ainda sem impressora (é o que mantém a peça na fila geral). */
  semImpressora?: number;
  /** No cartão de uma impressora: quantas unidades estão reservadas PARA ELA. */
  reservadas?: number;
  /** Impressoras onde a peça JÁ está imprimindo (iniciou só uma parte). */
  imprimindoEm?: string[];
  /** Foi TIRADA desta impressora para dar lugar a outra: fica no topo da fila dela. */
  pausadaEm?: string | null;
};

export type Maquina = {
  codigo: string;
  rotulo: string;
  imprimindo: PecaNaMaquina[];
  /** Servidor na versão anterior não manda: a tela trata como vazio. */
  naFila?: PecaNaFila[];
  registros: Registro[];
  unidadesNoDia: number;
  pecasNoDia: number;
};

export type Retrato = { dia: string; hoje: string; maquinas: Maquina[]; semMaquina: PecaNaMaquina[]; filaGeral?: PecaNaFila[] };

/** Linha do diário já com a máquina — o diário é UM só, filtrável. */
export type Linha = Registro & { maquina: string; rotuloMaquina: string };

// ─── O relatório (espelho de server/services/relatorioDeMaquinas.ts) ──────────
export type ResumoDaMaquinaNoDia = {
  dia: string; maquina: string; rotulo: string; unidades: number; pecas: number; concluidas: number;
  aindaNaMaquina: number; primeira: string | null; ultima: string | null; minutosAtivos: number; quem: string[];
};
export type ResumoDoDia = { dia: string; maquinas: ResumoDaMaquinaNoDia[]; total: { unidades: number; pecas: number; concluidas: number; aindaNaMaquina: number; minutosAtivos: number } };
export type Relatorio = { de: string; ate: string; hoje: string; dias: ResumoDoDia[] };

/** As abas da tela (?aba=). "agora" é o padrão e não vai para a URL. */
export type Aba = "agora" | "diario" | "resumo";

/** Os recortes do resumo e da exportação (?periodo=). "dia" segue o dia do diário. */
export type Periodo = "dia" | "semana" | "mes" | "intervalo";

/** O que barra o gesto na peça: o evento finalizado ou a trava da Solicitação. */
export type SeloDeBloqueio = Omit<SeloPecaEventoFinalizado, "motivo"> & { motivo: SeloPecaEventoFinalizado["motivo"] | "travada" };

/** O que cada impressora tem AGORA (a peça e os números da parte dela): shared/progresso-da-impressao.ts. */
export type { OcupanteDaImpressora };
export type OcupacaoDasImpressoras = Record<string, { n: number; primeira: string | null; atual?: OcupanteDaImpressora | null }>;
