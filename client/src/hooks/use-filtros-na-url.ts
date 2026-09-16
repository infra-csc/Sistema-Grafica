// ─────────────────────────────────────────────────────────────────────────────
// FILTROS NA URL — o recorte de uma lista mora no endereço, não só na memória.
//
// PORQUÊ. Regra da casa: F5, voltar de uma tela de detalhe e mandar o link a um
// colega têm de devolver a MESMA lista — busca, filtros, ordem e página. Estoque
// e Solicitação de peças fizeram isso à mão na 1ª rodada; as telas de cadastro
// (Usuários, Patrocinadores, Logs, Modelos) guardavam tudo em `useState` e
// esqueciam no primeiro recarregar. Este hook é o mesmo contrato, escrito uma
// vez só, para a próxima tela não precisar reinventar (e errar) os detalhes:
//
//  - LIDO UMA VEZ na montagem (inicializador preguiçoso do useState): a lista
//    já nasce no recorte certo, sem um frame "sem filtro" antes.
//  - ESCRITO com `replaceState` e atraso (250 ms): filtrar não é navegar — o
//    Voltar tem de sair da tela, não desfazer tecla por tecla da busca.
//  - VALOR PADRÃO NÃO VAI PARA A URL: `/usuarios` limpo é "sem recorte"; só o
//    que foge do padrão aparece, e o link compartilhado fica legível.
//  - SÓ AS CHAVES DO ESQUEMA são tocadas: qualquer outro parâmetro (de outra
//    tela, de rastreio, `?item=`) sobrevive às escritas.
//  - VOLTAR/AVANÇAR E LINK PARA A PRÓPRIA TELA reidratam o estado — senão a
//    URL passaria a mentir sobre o que está na tabela. Ouve `popstate` e o
//    evento `pushState` que o wouter dispara (ele instrumenta o History API);
//    `replaceState` fica de fora de propósito: é a nossa própria escrita, e
//    reler o que acabamos de gravar apararia o espaço que a pessoa ainda está
//    digitando no fim da busca.
//  - AMARRADO AO CAMINHO da montagem: um clique na sidebar dispara `pushState`
//    antes de a tela desmontar; sem a trava, a tela que está saindo leria a
//    query da tela que está entrando (e poderia reescrevê-la).
//
// Sem dependência nova e sem depender de API do wouter: só `window.history`,
// que é o que o próprio wouter usa por baixo.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";

export type ValorDeFiltro = string | number;
export type EsquemaDeFiltros = Record<string, ValorDeFiltro>;

export interface OpcoesDeFiltrosNaUrl<E extends EsquemaDeFiltros> {
  /** Atraso da escrita na URL, em ms. Padrão 250 — o mesmo ritmo da busca. */
  atrasoMs?: number;
  /**
   * Validação por chave. Um valor da URL que não passa volta ao padrão — link
   * velho ou digitado à mão (`?perfil=xpto`, `?pagina=-3`) não pode deixar a
   * tela num estado que nenhum controle dela consegue produzir.
   */
  aceita?: { [K in keyof E]?: (valor: E[K]) => boolean };
}

type Atualizador<V> = V | ((atual: V) => V);

/** Página ≥ 1 e inteira — o validador que toda lista paginada vai querer. */
export const paginaValida = (n: number) => Number.isInteger(n) && n >= 1;

/** Os valores de uma query string, no formato (e com os tipos) do esquema. */
function lerDaUrl<E extends EsquemaDeFiltros>(search: string, padroes: E, aceita?: OpcoesDeFiltrosNaUrl<E>["aceita"]): E {
  const p = new URLSearchParams(search);
  const saida: E = { ...padroes };
  for (const chave of Object.keys(padroes) as (keyof E & string)[]) {
    const cru = p.get(chave);
    if (cru === null || cru === "") continue;
    // O tipo vem do PADRÃO: número no esquema é número no estado, e um
    // `?pagina=abc` não vira NaN dentro da conta de paginação.
    let valor: ValorDeFiltro;
    if (typeof padroes[chave] === "number") {
      const n = Number(cru);
      if (!Number.isFinite(n)) continue;
      valor = n;
    } else {
      valor = cru;
    }
    const valida = aceita?.[chave];
    if (valida && !valida(valor as E[typeof chave])) continue;
    saida[chave] = valor as E[typeof chave];
  }
  return saida;
}

/** Texto como vai para a URL — busca aparada, número como texto. */
const emTexto = (v: ValorDeFiltro) => (typeof v === "string" ? v.trim() : String(v));

function mesmosValores<E extends EsquemaDeFiltros>(a: E, b: E) {
  return (Object.keys(a) as (keyof E)[]).every((k) => Object.is(a[k], b[k]));
}

export function useFiltrosNaUrl<E extends EsquemaDeFiltros>(padroesIniciais: E, opcoes: OpcoesDeFiltrosNaUrl<E> = {}) {
  // Padrões e validadores congelados na montagem: as telas passam objetos
  // literais, recriados a cada render — como dependência, reescreveriam a URL
  // e religariam os ouvintes a cada tecla.
  const padroes = useRef(padroesIniciais).current;
  const aceita = useRef(opcoes.aceita).current;
  const atrasoMs = opcoes.atrasoMs ?? 250;
  const caminho = useRef(typeof window === "undefined" ? "" : window.location.pathname);

  const [valores, setValores] = useState<E>(() =>
    typeof window === "undefined" ? padroes : lerDaUrl(window.location.search, padroes, aceita),
  );

  // ── Estado → URL ──
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (window.location.pathname !== caminho.current) return;
      const p = new URLSearchParams(window.location.search);
      for (const chave of Object.keys(padroes)) {
        const texto = emTexto(valores[chave]);
        if (texto === "" || texto === emTexto(padroes[chave])) p.delete(chave);
        else p.set(chave, texto);
      }
      const qs = p.toString();
      // Nada mudou → nada escrito: cada replaceState acorda os assinantes do
      // wouter, e um re-render inútil por filtro é custo sem troco.
      if (qs === new URLSearchParams(window.location.search).toString()) return;
      // `history.state` preservado: o wouter e o navegador guardam coisas ali.
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
    }, atrasoMs);
    return () => window.clearTimeout(t);
  }, [valores, padroes, atrasoMs]);

  // ── URL → estado (voltar/avançar, link para a própria tela) ──
  useEffect(() => {
    const reler = () => {
      if (window.location.pathname !== caminho.current) return;
      const daUrl = lerDaUrl(window.location.search, padroes, aceita);
      setValores((atual) => (mesmosValores(atual, daUrl) ? atual : daUrl));
    };
    window.addEventListener("popstate", reler);
    window.addEventListener("pushState", reler);
    return () => {
      window.removeEventListener("popstate", reler);
      window.removeEventListener("pushState", reler);
    };
  }, [padroes, aceita]);

  /** Troca UMA chave (aceita função, como o setState). */
  const definir = useCallback(<K extends keyof E>(chave: K, valor: Atualizador<E[K]>) => {
    setValores((atual) => {
      const novo = typeof valor === "function" ? (valor as (a: E[K]) => E[K])(atual[chave]) : valor;
      return Object.is(atual[chave], novo) ? atual : { ...atual, [chave]: novo };
    });
  }, []);

  /** Troca várias de uma vez — filtro novo + página 1 num render só. */
  const atualizar = useCallback((parcial: Partial<E>) => {
    setValores((atual) => {
      const novo = { ...atual, ...parcial };
      return mesmosValores(atual, novo) ? atual : novo;
    });
  }, []);

  /** Volta as chaves dadas (ou todas) ao padrão. */
  const limpar = useCallback((chaves?: (keyof E)[]) => {
    setValores((atual) => {
      const novo = { ...atual };
      for (const k of chaves ?? (Object.keys(padroes) as (keyof E)[])) novo[k] = padroes[k];
      return mesmosValores(atual, novo) ? atual : novo;
    });
  }, [padroes]);

  return { valores, definir, atualizar, limpar } as const;
}
