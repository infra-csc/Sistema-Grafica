// CONFIGURAÇÕES GERAIS DO APP (26/10) — leitura e escrita da tabela
// `configuracoes`. Hoje só uma: a duração da etapa de Aprovação, em dias
// corridos ("dias_da_aprovacao", padrão 7), que estende o prazo de Layout das
// peças sem aprovação (shared/prazo-sem-aprovacao.ts). Nunca valor fixo no
// código: o padrão só vale quando a linha falta, está fora da faixa ou a
// tabela ainda não foi migrada (o app não pode cair por uma configuração).
//
// CACHE CURTO. A Gestão de Prazos, as Análises, o card do evento e o job de
// snapshot leem a mesma linha a cada montagem; 30 s de memória por processo
// poupam a ida ao banco e, em autoscale, uma réplica que não recebeu a escrita
// passa a ver o valor novo em no máximo 30 s.
import { eq } from "drizzle-orm";
import { db } from "../db";
import { configuracoes } from "@shared/schema";
import {
  CONFIG_DIAS_DA_APROVACAO,
  DIAS_DA_APROVACAO_PADRAO,
  diasDaAprovacaoOuPadrao,
  diasDaAprovacaoValidos,
} from "@shared/prazo-sem-aprovacao";

const VALIDADE_MS = 30_000;
let emMemoria: { valor: number; atualizadoEm: string | null; atualizadoPor: string | null; ate: number } | null = null;

export interface ConfiguracaoDePrazos {
  diasDaAprovacao: number;
  /** ISO de quando o admin mudou por último (null = nunca mudou / padrão). */
  atualizadoEm: string | null;
  atualizadoPor: string | null;
  padrao: number;
}

async function lerDoBanco(): Promise<ConfiguracaoDePrazos> {
  try {
    const [linha] = await db.select().from(configuracoes).where(eq(configuracoes.chave, CONFIG_DIAS_DA_APROVACAO));
    return {
      diasDaAprovacao: diasDaAprovacaoOuPadrao(linha?.valor),
      atualizadoEm: linha?.atualizadoEm ? new Date(linha.atualizadoEm).toISOString() : null,
      atualizadoPor: linha?.atualizadoPor ?? null,
      padrao: DIAS_DA_APROVACAO_PADRAO,
    };
  } catch {
    // Tabela ainda não migrada (ou banco de mentira dos testes): vale o padrão.
    return { diasDaAprovacao: DIAS_DA_APROVACAO_PADRAO, atualizadoEm: null, atualizadoPor: null, padrao: DIAS_DA_APROVACAO_PADRAO };
  }
}

/** A configuração de prazos (com o cache curto). */
export async function lerConfiguracaoDePrazos(): Promise<ConfiguracaoDePrazos> {
  if (emMemoria && emMemoria.ate > Date.now()) {
    return { diasDaAprovacao: emMemoria.valor, atualizadoEm: emMemoria.atualizadoEm, atualizadoPor: emMemoria.atualizadoPor, padrao: DIAS_DA_APROVACAO_PADRAO };
  }
  const c = await lerDoBanco();
  emMemoria = { valor: c.diasDaAprovacao, atualizadoEm: c.atualizadoEm, atualizadoPor: c.atualizadoPor, ate: Date.now() + VALIDADE_MS };
  return c;
}

/** Só o número — o que o domínio de prazos precisa. */
export async function lerDiasDaAprovacao(): Promise<number> {
  return (await lerConfiguracaoDePrazos()).diasDaAprovacao;
}

/** Grava (admin). Devolve o valor anterior, para a trilha. */
export async function gravarDiasDaAprovacao(valor: unknown, quem: string | null): Promise<{ anterior: number; novo: number } | { erro: string }> {
  const novo = diasDaAprovacaoValidos(valor);
  if (novo === null) return { erro: "Informe um número inteiro de dias entre 1 e 30." };
  const anterior = (await lerDoBanco()).diasDaAprovacao;
  await db
    .insert(configuracoes)
    .values({ chave: CONFIG_DIAS_DA_APROVACAO, valor: novo, atualizadoPor: quem, atualizadoEm: new Date() })
    .onConflictDoUpdate({ target: configuracoes.chave, set: { valor: novo, atualizadoPor: quem, atualizadoEm: new Date() } });
  emMemoria = null;
  return { anterior, novo };
}

/** Para os testes: esquece o cache. */
export function esquecerConfiguracoesEmMemoria(): void {
  emMemoria = null;
}
