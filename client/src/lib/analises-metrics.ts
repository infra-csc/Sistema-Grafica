// O tipo mínimo da peça que a régua de retrabalho (analises-desempenho) lê —
// estrutural, conferido em shared/schema.ts. Até 16/10 este arquivo era a base
// da Análises de status (âncoras de data, janelas de ciclo, filtros); a tela
// virou o Painel operacional da gráfica e o resto saiu junto.

export interface AnaliseSponsorRef {
  id: string;
  name?: string | null;
}

export interface AnaliseItem {
  id: string;
  eventId: string;
  status: string;
  type?: string | null;
  quantity?: number | null;
  /** `decimal(10,2)` — o driver devolve STRING, nunca número. */
  calculatedM2?: string | number | null;
  createdAt: string | Date;
  /** Carimbado só na entrega TOTAL (`isFullDelivery` em routes/items.ts). */
  deliveredAt?: string | Date | null;
  producedAt?: string | Date | null;
  conferredAt?: string | Date | null;
  /** Reprovação EM ABERTO — as duas flags são limpas quando a peça reanda. */
  rejectedBySponsor?: boolean | null;
  rejectedByCreator?: boolean | null;
  /** Arquivo final substituído pela Arte: marca DURÁVEL de refação. */
  previousFinalFileUrl?: string | null;
  /** Layout de aprovação substituído pela Arte: idem. */
  previousApprovalThumbUrl?: string | null;
  /** Peça-filha de complemento (quantidade extra depois da produção). */
  complementSeq?: number | null;
  /** Vínculo peça↔patrocinador entregue pela rota. NUNCA `sponsorIds`. */
  sponsors?: AnaliseSponsorRef[] | null;
}
