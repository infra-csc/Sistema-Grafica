// AS MARCAS "SEM PATROCÍNIO" E "ARTE DO CLIENTE" NA ESCRITA (Pedro/dono, 26/10).
//
// A regra do prazo é de @shared/prazo-sem-aprovacao; aqui mora o que toda
// porta de escrita das marcas precisa fazer igual — o PATCH da peça, o lote, a
// criação e a Vinculação:
//   · RN07 — fora do Layout só o admin muda (recusaDaMarca);
//   · RN10 — a trilha diz quem, quando (a própria linha) e os DOIS prazos de
//     Layout daquele momento (normal × ajustado). Os prazos não são gravados na
//     peça: derivam da saída do caminhão e da configuração (ver o shared).
import { storage } from "../storage";
import type { Item, InsertItem } from "@shared/schema";
import { fraseDaTrilhaDaMarca, prazoDeLayoutDoEvento, prazosDeLayoutDaPeca, pulaAprovacao, semPatrocinio, type MarcasDaPeca } from "@shared/prazo-sem-aprovacao";
import { lerDiasDaAprovacao } from "./configuracoes";

export { prazoDeLayoutDoEvento };

export interface ContextoDosPrazos {
  /** Prazo de Layout do evento ("YYYY-MM-DD", com o fim de semana) — null sem data. */
  prazoDeLayout: string | null;
  diasDaAprovacao: number;
}

export async function contextoDosPrazos(eventId: string): Promise<ContextoDosPrazos> {
  const [event, diasDaAprovacao] = await Promise.all([storage.getEvent(eventId).catch(() => undefined), lerDiasDaAprovacao()]);
  return { prazoDeLayout: prazoDeLayoutDoEvento(event), diasDaAprovacao };
}

/** As colunas da "Arte do cliente" ao marcar/desmarcar. Desmarcar limpa a chegada (a trilha guarda). */
export function colunasDaArteDoCliente(marcou: boolean, quem: string | null): Partial<InsertItem> {
  return marcou
    ? { arteDoCliente: true, arteDoClienteMarcadaEm: new Date(), arteDoClienteMarcadaPor: quem }
    : { arteDoCliente: false, arteDoClienteMarcadaEm: null, arteDoClienteMarcadaPor: null, arteRecebidaEm: null, arteRecebidaPor: null };
}

/**
 * As frases da trilha para o que MUDOU entre `antes` e `depois` — uma por
 * marca. Vazio quando nada mudou. "Sem patrocínio" é a regra do shared
 * (`semPatrocinio`): o `skipApproval` que a produção interna grava por dentro
 * não é marca e não vira frase. O status de `depois` decide se a desmarcação
 * devolve a Aprovação (em Layout) ou se a peça segue na etapa em que está.
 */
export function frasesDasMarcas(
  antes: MarcasDaPeca,
  depois: MarcasDaPeca,
  ctx: ContextoDosPrazos,
  contexto?: string,
): string[] {
  const frases: string[] = [];
  // Os dois prazos de Layout "como se tivesse marca" — a frase os mostra também na desmarcação.
  const prazos = (p: MarcasDaPeca) => prazosDeLayoutDaPeca({ ...p, skipApproval: true, producaoInterna: false }, ctx.prazoDeLayout, ctx.diasDaAprovacao);
  // Sem status em `depois` (cópia parcial): vale o de `antes`; sem nenhum (criação), Layout.
  const statusDepois = depois.status ?? antes.status ?? null;
  if (semPatrocinio(antes) !== semPatrocinio(depois)) {
    frases.push(fraseDaTrilhaDaMarca("semPatrocinio", semPatrocinio(depois), prazos(depois), ctx.diasDaAprovacao, pulaAprovacao(depois), contexto, statusDepois));
  }
  if (!!antes.arteDoCliente !== !!depois.arteDoCliente) {
    frases.push(fraseDaTrilhaDaMarca("arteDoCliente", !!depois.arteDoCliente, prazos(depois), ctx.diasDaAprovacao, pulaAprovacao(depois), contexto, statusDepois));
  }
  return frases;
}

/** Atalho: as frases a partir das duas versões da peça (busca o contexto do evento). */
export async function frasesDasMarcasDaPeca(antes: Item | MarcasDaPeca & { eventId: string }, depois: Item | MarcasDaPeca, contexto?: string): Promise<string[]> {
  const mudou = semPatrocinio(antes) !== semPatrocinio(depois) || !!antes.arteDoCliente !== !!depois.arteDoCliente;
  if (!mudou) return [];
  return frasesDasMarcas(antes, depois, await contextoDosPrazos((antes as { eventId: string }).eventId), contexto);
}
