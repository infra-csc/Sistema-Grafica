// ─────────────────────────────────────────────────────────────────────────────
// LISTA INCREMENTAL DA GRÁFICA — as duas peças que seguram a fila de 4 mil.
//
// POR QUE EXISTE. Medição em produção (17/09): ~4.290 peças, 55.218 elementos
// DOM montados e a aba congelada por mais de 45 s ao trocar de etapa e digitar
// na busca. Havia um teto de 50 linhas por EVENTO, mas com dezenas de eventos
// pequenos cada bloco cabia inteiro no teto e a soma passava de quatro mil
// linhas — cada uma com badges, miniatura, handlers de hover e botões. E a
// cada tecla, clique ou revalidação (polling, WebSocket, foco) TODAS as linhas
// renderizavam de novo, mesmo sem mudança nenhuma.
//
// As duas respostas moram aqui, e nenhuma delas mexe em regra:
//
//   1. `LinhaMemo` — pula o render de uma linha cujas dependências não mudaram.
//      O JSX da linha continua ESCRITO em pages/grafica.tsx (vários testes leem
//      os gates de lá, inclusive a paridade de ações tabela × cartão); aqui só
//      se decide SE ele roda de novo.
//
//   2. `SentinelaDaLista` — desenha as linhas por lotes. Quando o fim do que já
//      está desenhado se aproxima da área visível, entra o próximo lote. A
//      lista, os contadores, a seleção "Todas" e a exportação continuam lendo o
//      recorte INTEIRO — só o que vai para o DOM é que chega aos poucos.
// ─────────────────────────────────────────────────────────────────────────────
import { memo, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Renderiza `render()` só quando algum item de `deps` muda (Object.is).
 *
 * O CONTRATO — e o jeito de quebrá-lo: `render` é uma closure do componente da
 * página. Quando o memo pula, o DOM antigo continua com os handlers da closure
 * ANTIGA. Por isso `deps` precisa listar tudo o que a linha LÊ e que pode mudar
 * entre renders (a peça, a seleção dela, o modo de lote, o papel do usuário,
 * o valor em edição DAQUELA linha…). Handlers que só chamam setState (sempre
 * estáveis) ou `mutation.mutate` (estável no TanStack Query v5) não precisam
 * entrar. Quem acrescentar um estado novo lido dentro da linha acrescenta aqui.
 */
export const LinhaMemo = memo(
  function LinhaMemo({ render }: { deps: readonly unknown[]; render: () => ReactNode }) {
    return <>{render()}</>;
  },
  (antes, depois) =>
    antes.deps.length === depois.deps.length &&
    antes.deps.every((d, i) => Object.is(d, depois.deps[i])),
);

/**
 * O contêiner que ROLA de verdade: o ancestral mais próximo com overflow
 * auto/scroll e conteúdo maior que a caixa. `rootMargin` só vale para o root
 * do IntersectionObserver — observar contra a viewport ignoraria a margem, já
 * que o scroller corta o sentinela antes. Sem nenhum (página que rola no
 * documento), a viewport serve.
 */
function scrollerDe(el: HTMLElement | null): HTMLElement | null {
  let p = el?.parentElement ?? null;
  while (p && p !== document.body) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight) return p;
    p = p.parentElement;
  }
  return null;
}

/**
 * Fim do que está desenhado: pede o próximo lote quando chega a ~1,5 tela da
 * área visível, e oferece um BOTÃO para o mesmo — teclado, leitor de tela e
 * navegador sem IntersectionObserver não dependem da rolagem.
 */
export function SentinelaDaLista({ mostradas, total, lote, onMais, compacto }: {
  mostradas: number;
  total: number;
  lote: number;
  onMais: () => void;
  /** Cards (celular/tablet): alvo de 44px e texto menor. */
  compacto?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onMaisRef = useRef(onMais);
  onMaisRef.current = onMais;
  const faltam = total - mostradas;

  // FOCO NO ÚLTIMO LOTE. O botão some quando o último lote entra, e o foco de
  // quem clicou (teclado, leitor de tela) caía no <body> — a próxima tecla Tab
  // recomeçava do topo da página. Quando o clique pede o ÚLTIMO lote, guarda o
  // total daquele momento; quando a lista fica completa, o foco vai para o
  // texto fixo abaixo. Guardar o total (e não um sim/não) evita roubar o foco
  // depois, quando outro recorte ficar completo pela rolagem.
  const [fimPedidoNoTotal, setFimPedidoNoTotal] = useState<number | null>(null);
  const focouNoFimRef = useRef(false);
  const fimRef = useRef<HTMLParagraphElement>(null);
  const mostrarFim = faltam <= 0 && fimPedidoNoTotal === total;
  useEffect(() => {
    if (!mostrarFim || focouNoFimRef.current) return;
    focouNoFimRef.current = true;
    fimRef.current?.focus();
  }, [mostrarFim]);

  // Reobserva a cada lote (`mostradas` nas deps): o IntersectionObserver só
  // avisa quando o estado de interseção MUDA, e com linhas baixas o sentinela
  // pode continuar dentro da margem depois do lote novo — a observação nova
  // entrega a leitura inicial e o próximo lote entra sem precisar rolar.
  useEffect(() => {
    const el = ref.current;
    if (!el || faltam <= 0 || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entradas) => { if (entradas.some((e) => e.isIntersecting)) onMaisRef.current(); },
      { root: scrollerDe(el), rootMargin: "0px 0px 1500px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mostradas, faltam]);

  if (faltam <= 0) {
    if (!mostrarFim) return null;
    return (
      <p
        ref={fimRef}
        tabIndex={-1}
        style={{ margin: 0, textAlign: "center", padding: compacto ? "10px 8px 14px" : "12px 16px 16px", borderTop: "1px solid #f4f3f0", fontSize: 12, color: "#57534e", fontVariantNumeric: "tabular-nums", outlineOffset: -2 }}
      >
        Mostrando todas as {total} peças
      </p>
    );
  }
  const proximo = Math.min(lote, faltam);
  return (
    <div
      ref={ref}
      data-testid="sentinela-lista-grafica"
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: compacto ? "10px 8px 14px" : "12px 16px 16px", borderTop: "1px solid #f4f3f0" }}
    >
      {/* #57534e sobre branco (7,6:1) — nunca #a8a29e como texto. */}
      <span style={{ fontSize: 12, color: "#57534e", fontVariantNumeric: "tabular-nums" }}>
        Mostrando {mostradas} de {total} peças
      </span>
      <button
        type="button"
        onClick={() => {
          // Último lote: prepara o destino do foco ANTES de o botão sumir.
          if (faltam <= lote) {
            focouNoFimRef.current = false;
            setFimPedidoNoTotal(total);
          }
          onMaisRef.current();
        }}
        data-testid="button-mostrar-mais-pecas"
        style={{ minHeight: compacto ? 44 : 36, padding: "0 16px", borderRadius: 8, background: "#ffffff", border: "1px dashed #d6d3d1", color: "#1c1917", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
      >
        Mostrar mais {proximo}
      </button>
    </div>
  );
}
