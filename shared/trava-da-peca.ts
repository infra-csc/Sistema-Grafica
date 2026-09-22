// ─────────────────────────────────────────────────────────────────────────────
// A PEÇA TRAVADA PELA SOLICITAÇÃO (dono, 21/09: "colocar um botão na Gráfica
// onde o usuário de Solicitação TRAVA a peça com motivo").
//
// A trava é uma MARCA, não um status: a peça continua na etapa em que estava
// (Liberada, Em Impressão, Impresso, Conferido, Embalado) e a Gráfica a vê,
// com o motivo e quem travou — mas não consegue fazê-la ANDAR: iniciar
// impressão, informar impressas, mandar para acabamento, trocar de máquina,
// reservar impressora, imprimir agora, conferir, embalar nem entregar o volume
// em que ela está. RECUAR continua permitido: tirar da impressora nunca é
// bloqueado (a peça travada não pode prender a impressora).
//
// Quem trava e quem destrava: a Solicitação e o admin (a Gráfica NÃO destrava).
// Dados: items.travada_em / travada_por / travada_por_id / travada_motivo.
//
// Puro: o servidor (as guardas das rotas), a Gráfica, Máquinas, a ficha da
// peça e o Detalhe do evento leem DESTAS funções.
// ─────────────────────────────────────────────────────────────────────────────

export type PecaTravavel = {
  status?: string | null;
  travadaEm?: string | Date | null;
  travadaPor?: string | null;
  travadaPorId?: string | null;
  travadaMotivo?: string | null;
};

/** Quem pode travar e destravar. */
export const PAPEIS_QUE_TRAVAM: readonly string[] = ["solicitacao", "admin"];
export const podeTravar = (papel: string | null | undefined): boolean => PAPEIS_QUE_TRAVAM.includes(papel ?? "");

/** O motivo é obrigatório: texto livre, com pelo menos isto de letras. */
export const MOTIVO_MINIMO = 5;
export const MOTIVO_MAXIMO = 300;
/** Os atalhos da tela (chips) — o motivo continua editável. */
export const SUGESTOES_DE_MOTIVO: readonly string[] = ["Arte vai mudar", "Aguardando patrocinador", "Quantidade vai mudar", "Evento em revisão"];

/** O motivo limpo, ou o erro humano. */
export function lerMotivo(bruto: unknown): { ok: true; motivo: string } | { ok: false; erro: string } {
  const motivo = typeof bruto === "string" ? bruto.trim().replace(/\s+/g, " ") : "";
  if (motivo.length < MOTIVO_MINIMO) return { ok: false, erro: `Diga o motivo da trava (pelo menos ${MOTIVO_MINIMO} letras) — é o que a Gráfica vai ler` };
  if (motivo.length > MOTIVO_MAXIMO) return { ok: false, erro: `O motivo passa de ${MOTIVO_MAXIMO} letras — resuma` };
  return { ok: true, motivo };
}

const ENTREGUE = ["delivered", "entregue"];

/** A peça está travada? (A regra ÚNICA — telas e servidor.) */
export function pecaTravada(p: PecaTravavel | null | undefined): boolean {
  return !!p?.travadaEm;
}

/** Dá para travar AGORA? Qualquer etapa antes de Entregue; e não duas vezes. */
export function motivoDeNaoTravar(p: PecaTravavel | null | undefined): string | null {
  if (!p) return "Peça não encontrada";
  if (pecaTravada(p)) return "A peça já está travada";
  if (ENTREGUE.includes(p.status ?? "")) return "Peça entregue não se trava — não há mais nada a segurar";
  if (p.status === "canceled" || p.status === "cancelled") return "Peça cancelada não se trava";
  return null;
}

/** A frase do 409 (e do title dos botões desabilitados). */
export function fraseDaTrava(p: PecaTravavel): string {
  const quem = (p.travadaPor ?? "").trim();
  return `Peça travada pela Solicitação: ${p.travadaMotivo ?? "sem motivo"}${quem ? ` — fale com ${quem}` : ""}`;
}

/** "há 2h", "há 3d", "agora" — a idade da trava. */
export function haQuantoTravada(p: PecaTravavel, agora: number = Date.now()): string | null {
  if (!p.travadaEm) return null;
  const t = new Date(p.travadaEm).getTime();
  if (Number.isNaN(t)) return null;
  const min = Math.max(0, Math.floor((agora - t) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

/** O selo: "Travada: Arte vai mudar · por Fulano, há 2h". */
export function seloDaTrava(p: PecaTravavel, agora: number = Date.now()): string | null {
  if (!pecaTravada(p)) return null;
  const quem = (p.travadaPor ?? "").trim();
  const quando = haQuantoTravada(p, agora);
  const por = [quem ? `por ${quem}` : null, quando].filter(Boolean).join(", ");
  return `Travada: ${p.travadaMotivo ?? "sem motivo"}${por ? ` · ${por}` : ""}`;
}

/** As colunas da trava (gravar) e do destravar (limpar). */
export const colunasDaTrava = (motivo: string, quem: { nome: string; id: string | null }, agora: Date) =>
  ({ travadaEm: agora, travadaPor: quem.nome, travadaPorId: quem.id, travadaMotivo: motivo });
export const colunasDoDestravar = () => ({ travadaEm: null, travadaPor: null, travadaPorId: null, travadaMotivo: null });

/** O código do 409, para a tela reconhecer a recusa. */
export const CODIGO_PECA_TRAVADA = "PECA_TRAVADA";
