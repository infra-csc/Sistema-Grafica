// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO DE GET /api/grafica/maquinas (`?dia=YYYY-MM-DD` opcional).
//
// Fonte: server/routes/maquinas.ts (o handler monta `peca`, `pecaDaFila` e os
// cartões por impressora). Datas vêm prontas do SQL em texto ISO (`to_char`).
// Campos marcados como opcionais são os que a versão ANTERIOR do servidor não
// mandava — a tela trata a ausência como "comportamento antigo".
// ─────────────────────────────────────────────────────────────────────────────

/** O bastante do evento para a tela saber se ele já acabou. */
export interface EventoDaPecaNaMaquina {
  id: string;
  name: string | null;
  status: string | null;
  startDate: string | null;
  reopenedAt: string | null;
}

/** A parte de uma impressora quando a peça está dividida (jsonb). */
export interface ParteDaImpressao { atrib: number; impressas: number }

/** Peça em impressão (cartão da impressora ou "sem impressora"). */
export interface PecaNaMaquina {
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
  eventoInfo: EventoDaPecaNaMaquina | null;
  material?: string | null;
  medida?: string | null;
  patrocinadores?: string[];
  /** Peça dividida entre impressoras; ausente/null = tudo em `maquina`. */
  impressaoPorMaquina?: Record<string, ParteDaImpressao> | null;
  /** A parte DESTA impressora (só no cartão da impressora). */
  parte?: ParteDaImpressao | null;
  travadaEm?: string | null;
  travadaPor?: string | null;
  travadaMotivo?: string | null;
}

/** Lançamento do diário da impressora. */
export interface RegistroDaMaquina {
  id: string;
  itemId: string;
  displayId: string | null;
  tipoPeca: string;
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
  /** Posição no diário do dia inteiro (mais recente = 0). */
  ordem: number;
}

/** Peça liberada que ainda vai para a máquina — na fila geral ou reservada. */
export interface PecaNaFilaDaMaquina extends PecaNaMaquina {
  maquinaPrevista: string | null;
  m2: number | null;
  saidaCaminhao: string | null;
  /** Dias em relação à saída do caminhão (negativo = antes); -1 sem prazo. */
  prazoProducaoGrafica: number;
  /** Unidades reservadas por impressora: { "1": 20, "2": 14 }. */
  reserva?: Record<string, number>;
  /** Quando a peça foi TIRADA de cada impressora (topo da fila dela). */
  pausas?: Record<string, string>;
  /** Unidades ainda sem impressora (mantém a peça na fila geral). */
  semImpressora?: number;
  /** No cartão de uma impressora: quantas unidades estão reservadas PARA ELA. */
  reservadas?: number;
  /** Impressoras onde a peça JÁ está imprimindo. */
  imprimindoEm?: string[];
  pausadaEm?: string | null;
}

/** Cartão de uma impressora. */
export interface CartaoDaMaquina {
  codigo: string;
  rotulo: string;
  imprimindo: PecaNaMaquina[];
  naFila?: PecaNaFilaDaMaquina[];
  registros: RegistroDaMaquina[];
  unidadesNoDia: number;
  pecasNoDia: number;
}

/** Resposta de GET /api/grafica/maquinas. */
export interface RetratoDasMaquinas {
  dia: string;
  hoje: string;
  maquinas: CartaoDaMaquina[];
  semMaquina: PecaNaMaquina[];
  filaGeral?: PecaNaFilaDaMaquina[];
}
