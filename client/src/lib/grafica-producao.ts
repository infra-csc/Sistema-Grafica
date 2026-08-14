// ─────────────────────────────────────────────────────────────────────────────
// REGRA PURA DO LANÇAMENTO DE PRODUÇÃO DA GRÁFICA.
//
// O problema que este arquivo resolve: `PATCH /start-production` grava
// `quantityProduced` como valor ABSOLUTO (o total produzido até agora), enquanto
// os dois modais IRMÃOS — conferência e entrega — mandam INCREMENTO e o servidor
// soma. Os três são o mesmo componente visual, com rótulos irmãos, e o botão que
// abre o de produção chama-se "Continuar". Quem produziu 6 de 10, voltou e
// digitou "4" REGREDIA o total para 4: perda silenciosa e irreversível de
// registro, na única tela dona desse número.
//
// Duas travas, as duas nascendo daqui:
//  1. `expectedProduced` — o total que o operador tinha na tela ao abrir o
//     modal. O servidor já sabia conferir isso (409 PRODUCTION_CONFLICT) e o
//     cliente NUNCA enviava: o guard era código morto. Sem ele, dois operadores
//     do galpão com a mesma peça aberta sobrescrevem um ao outro em silêncio.
//  2. `precisaConfirmar` — quando o número lançado é MENOR que o já produzido,
//     a tela precisa dizer isso com todas as letras antes de gravar.
//
// Puro: nada de React, rede ou relógio.
// ─────────────────────────────────────────────────────────────────────────────

import { producedOf, qtyOf, reusedOf, type SaldoItem } from "./saldo";

export interface PayloadProducao {
  /** ABSOLUTO: o total produzido depois deste lançamento. */
  quantityProduced: number;
  /** O total que o cliente leu ao abrir o modal (lock otimista do servidor). */
  expectedProduced: number;
}

export interface AvaliacaoProducao {
  /** Pode enviar? (com `precisaConfirmar`, só depois do "sim" do operador). */
  ok: boolean;
  /** Motivo da recusa, pronto para o toast — vazio quando `ok`. */
  erro: string;
  /** O lançamento REDUZ o total já registrado. */
  precisaConfirmar: boolean;
  /** Pergunta a fazer antes de gravar; vazia quando não há redução. */
  confirmacao: string;
  /** Corpo do PATCH. Só existe quando `ok`. */
  payload: PayloadProducao | null;
}

/**
 * Teto do lançamento: o reaproveitado não vai para a impressora e não pode ser
 * contado como produzido. Espelha byte a byte a validação do servidor
 * (`quantityProduced + reuseQty > quantity` → 400).
 */
export const tetoDeProducao = (item: SaldoItem): number =>
  Math.max(0, qtyOf(item) - reusedOf(item));

export function avaliarProducao(item: SaldoItem, quantidade: number): AvaliacaoProducao {
  const recusa = (erro: string): AvaliacaoProducao =>
    ({ ok: false, erro, precisaConfirmar: false, confirmacao: "", payload: null });

  const teto = tetoDeProducao(item);
  const jaProduzido = producedOf(item);

  if (!Number.isFinite(quantidade) || !Number.isInteger(quantidade)) {
    return recusa("Informe um número inteiro de unidades.");
  }
  if (quantidade <= 0) {
    return recusa("A quantidade produzida precisa ser maior que zero.");
  }
  if (quantidade > teto) {
    const reaproveitadas = reusedOf(item);
    return recusa(
      reaproveitadas > 0
        ? `Máximo ${teto} un.: a peça tem ${qtyOf(item)} un. e ${reaproveitadas} já foram reaproveitadas.`
        : `Máximo ${teto} un.: é o total da peça.`,
    );
  }

  // O campo é ABSOLUTO — este é o único ponto do cliente que sabe disso, e é
  // por isso que a pergunta cita os dois números em vez de dizer "tem certeza?".
  const precisaConfirmar = quantidade < jaProduzido;

  return {
    ok: true,
    erro: "",
    precisaConfirmar,
    confirmacao: precisaConfirmar
      ? `Este campo grava o TOTAL produzido, não o de hoje.\n\n`
        + `Confirmar reduz o registro de ${jaProduzido} para ${quantidade} un. — `
        + `${jaProduzido - quantidade} un. deixam de constar como produzidas, e não há como desfazer.\n\n`
        + `Se você produziu ${quantidade} un. AGORA, o total deveria ser ${jaProduzido + quantidade}.`
      : "",
    payload: { quantityProduced: quantidade, expectedProduced: jaProduzido },
  };
}

/**
 * Traduz o 409 do lock otimista para o operador. O corpo vem cru dentro da
 * mensagem do erro (apiRequest devolve o Response cru), e sem isto o galpão leria
 * `{"error":"…","code":"PRODUCTION_CONFLICT"}` num toast.
 */
export function ehConflitoDeProducao(mensagemCrua: string): boolean {
  return mensagemCrua.includes("PRODUCTION_CONFLICT");
}
