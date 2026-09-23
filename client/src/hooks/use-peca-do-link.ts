// ─────────────────────────────────────────────────────────────────────────────
// DEEP LINK DE PEÇA — `?item=<uuid>` abre a ficha da peça na fila da tela.
//
// PORQUÊ. O sino (App.tsx) e o "Resolver em…" da Gestão de Prazos
// (components/prazos/tokens.ts) mandam `?item=` para as filas de trabalho.
// O Detalhe do Evento e a Gráfica já consumiam o parâmetro; Arte, Atendimento
// e Revisão Final ignoravam, e o link prometia a peça e entregava o recorte —
// a pessoa ainda tinha de achar a linha e clicar.
//
// O CONTRATO, igual ao do event-detail:
//   · o parâmetro é lido NA MONTAGEM e guardado num ref. As telas espelham os
//     filtros na URL com replaceState (debounce de 300ms) e algumas reescrevem
//     a query inteira — se a leitura esperasse a lista chegar, o `item` já
//     teria sido apagado por elas;
//   · consome UMA vez, só depois que a fila carregou (lista vazia ainda
//     carregando diria "não está aqui" para uma peça que está);
//   · tira SÓ o `item=` da URL, para um F5 não reabrir a ficha e sem apagar o
//     recorte que veio junto (`busca`, `evento`, `fase`…);
//   · peça fora da fila vira um aviso NEUTRO: entre o link ser gerado e o
//     clique a peça pode ter andado, e isso não é erro de ninguém.
//
// Com erro na query não consome: a tela já mostra o erro e o "tentar de novo"
// recarrega a lista, quando então o link ainda vale.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { FORMATO_COMPACTO, expandirResposta } from "@shared/itens-compactos";

/**
 * O CÓDIGO (displayId) de UMA peça, direto do servidor — ou `null`.
 *
 * As telas de fila deixaram de baixar o acervo (perf, 2ª rodada), então o
 * `codigoDe` do aviso não tem mais onde procurar uma peça que já saiu da fila.
 * O recorte `?ids=` traz só ela, em KBs. `credentials: "include"` e nada mais:
 * é uma leitura solta, fora do cache do React Query de propósito — guardá-la
 * criaria uma chave por link clicado.
 */
export async function buscarCodigoDaPeca(id: string): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/items?ids=${encodeURIComponent(id)}&formato=${FORMATO_COMPACTO}`,
      { credentials: "include" },
    );
    if (!res.ok) return null;
    const lista = expandirResposta(await res.json());
    if (!Array.isArray(lista)) return null;
    // Peças decodificadas (formato compacto): só `id` e `displayId` interessam.
    const peca = (lista as Array<{ id?: unknown; displayId?: unknown } | null>).find((i) => i?.id === id);
    return (peca?.displayId as string | undefined) ?? null;
  } catch {
    return null;
  }
}

interface PecaDoLinkOpts<T> {
  /** A fila desta tela terminou de carregar sem erro. */
  pronto: boolean;
  /** A peça na fila DESTA tela (não no banco inteiro) — `null` se não está. */
  localizar: (id: string) => T | null | undefined;
  /** Abre a ficha (e, se a tela tiver fases, vai para a fase dela). */
  abrir: (peca: T) => void;
  /**
   * Código da peça (displayId) quando a tela sabe, mesmo fora da fila — só
   * para o aviso dizer QUAL peça. Sem ele, o aviso fala "a peça do link".
   *
   * PODE SER ASSÍNCRONO (perf, 2ª rodada). As telas de fila deixaram de baixar
   * o acervo inteiro: fora da própria fila elas não têm mais o código de uma
   * peça qualquer em memória. Devolvendo uma Promise, a tela busca SÓ aquela
   * peça (`GET /api/items?ids=…`) e o aviso continua nomeando-a. Uma busca que
   * falha ou demora vira `null` e o aviso sai sem o código — nunca sem aviso.
   */
  codigoDe?: (id: string) => string | null | undefined | Promise<string | null | undefined>;
}

/** Teto da espera pelo código: passado disso o aviso sai sem ele. Um aviso
 *  atrasado por uma rede ruim é pior que um aviso sem o número da peça. */
const ESPERA_PELO_CODIGO_MS = 4000;

export function usePecaDoLink<T>({ pronto, localizar, abrir, codigoDe }: PecaDoLinkOpts<T>): void {
  const { toast } = useToast();
  const pendente = useRef<string | null>(
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("item"),
  );
  // Refs para as funções: as telas as recriam a cada render, e o efeito não
  // deve rodar de novo por isso — só quando a fila muda de "carregando" para
  // "pronta".
  const fns = useRef({ localizar, abrir, codigoDe });
  fns.current = { localizar, abrir, codigoDe };

  useEffect(() => {
    const id = pendente.current;
    if (!id || !pronto) return;
    pendente.current = null;

    const p = new URLSearchParams(window.location.search);
    if (p.has("item")) {
      p.delete("item");
      const qs = p.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
    }

    const peca = fns.current.localizar(id);
    if (peca) {
      fns.current.abrir(peca);
      return;
    }
    const avisar = (codigo: string | null | undefined) => {
      toast({
        title: codigo ? `A peça ${codigo} não está nesta fila agora` : "A peça do link não está nesta fila agora",
        description: "Ela pode ter avançado desde que o link foi criado. O histórico dela está no Detalhe do Evento.",
      });
    };
    const codigo = fns.current.codigoDe?.(id);
    // Caminho síncrono intacto: quem devolve texto avisa no mesmo tique, sem
    // passar por microtarefa nenhuma.
    if (!codigo || typeof codigo === "string") return avisar(codigo);
    let vivo = true;
    const noTempo = new Promise<null>((r) => setTimeout(() => r(null), ESPERA_PELO_CODIGO_MS));
    void Promise.race([Promise.resolve(codigo).catch(() => null), noTempo])
      .then((c) => { if (vivo) avisar(c as string | null | undefined); });
    return () => { vivo = false; };
  }, [pronto, toast]);
}
