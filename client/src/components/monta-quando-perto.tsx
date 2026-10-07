// ─────────────────────────────────────────────────────────────────────────────
// MONTA QUANDO PERTO — adia a montagem de um bloco pesado até ele chegar perto
// da área visível (07/10).
//
// POR QUE EXISTE. Medição em produção (07/10, Vincular Patrocinadores): os
// dados chegavam em ~1 s e a tela levava 10–13 s para ficar usável. O tempo
// todo ia no DESENHO: 30 eventos × até 50 linhas, cada uma com um chip por
// patrocinador — 1.263 linhas e ~37 mil nós montados de uma vez, quase todos
// muito abaixo da dobra.
//
// O bloco fora de alcance vira um espaço RESERVADO da altura estimada (a barra
// de rolagem não encolhe e não pula quando ele monta) e só monta quando entra
// a `margem` px da área visível. Montado, FICA montado: desmontar ao rolar de
// volta perderia foco e o estado de quem está no meio de uma ação, e a conta
// que importa — a da abertura — já foi paga.
//
// `children` é uma FUNÇÃO: o JSX do bloco nem é construído enquanto ele está
// reservado (montar a árvore de elementos de 50 linhas para jogar fora também
// custa).
//
// Sem IntersectionObserver (navegador muito antigo) monta tudo de uma vez,
// como antes — mais lento, nunca escondido.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * O contêiner que ROLA de verdade: o ancestral mais próximo com overflow
 * auto/scroll E conteúdo maior que a caixa. O `rootMargin` só vale contra o
 * root do observador — observar contra a janela, com a tela rolando dentro de
 * um <div>, deixaria o recorte do <div> anular a antecipação. Um ancestral
 * com overflow:auto que NÃO rola (altura automática) seria pior ainda: tudo
 * "intersecta" com ele e o bloco montaria de saída. Sem nenhum que role, a
 * janela serve (o bloco monta quando aparecer, só sem a antecipação).
 *
 * A RESPOSTA VALE PARA O QUADRO INTEIRO. Trinta blocos irmãos subindo a mesma
 * cadeia, cada um com getComputedStyle e scrollHeight, eram ~240 ms no perfil
 * da abertura (07/10). Cada ancestral visitado guarda a resposta até o
 * próximo quadro: o primeiro bloco paga a subida, os irmãos param no pai.
 */
let respostasDoQuadro: Map<Element, HTMLElement | null> | null = null;
function scrollerDe(el: HTMLElement): HTMLElement | null {
  if (!respostasDoQuadro) {
    respostasDoQuadro = new Map();
    const esquecer = () => { respostasDoQuadro = null; };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(esquecer);
    else setTimeout(esquecer, 16);
  }
  const visitados: Element[] = [];
  let achado: HTMLElement | null = null;
  let p = el.parentElement;
  while (p && p !== document.body) {
    if (respostasDoQuadro.has(p)) { achado = respostasDoQuadro.get(p) ?? null; break; }
    visitados.push(p);
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight) { achado = p; break; }
    p = p.parentElement;
  }
  for (const v of visitados) respostasDoQuadro.set(v, achado);
  return achado;
}

export function MontaQuandoPerto({ montarJa, alturaEstimada, margem = 1200, reserva, testId, children }: {
  /** Monta na hora, sem esperar o observador (ex.: o que já está na primeira tela). */
  montarJa: boolean;
  /** Altura do espaço reservado enquanto não monta, em px. */
  alturaEstimada: number;
  /** Antecipação, em px, acima e abaixo da área visível. */
  margem?: number;
  /** O que aparece no espaço reservado (por um quadro, ao rolar rápido). */
  reserva?: ReactNode;
  testId?: string;
  children: () => ReactNode;
}) {
  const [perto, setPerto] = useState(false);
  // "Montar já" vira montado para sempre: se o orçamento da primeira tela
  // mudar depois (um "Mostrar todas" acima, um filtro), o bloco não desmonta.
  // setState no render é o padrão do React para derivar de props; roda uma vez.
  if (montarJa && !perto) setPerto(true);
  const semObservador = typeof IntersectionObserver === "undefined";
  const montado = perto || montarJa || semObservador;

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (montado || !el) return;
    const io = new IntersectionObserver(
      (entradas) => { if (entradas.some((e) => e.isIntersecting)) setPerto(true); },
      { root: scrollerDe(el), rootMargin: `${margem}px 0px ${margem}px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [montado, margem]);

  if (montado) return <>{children()}</>;
  return (
    <div ref={ref} data-testid={testId} data-montagem="reservada" style={{ height: alturaEstimada }}>
      {reserva}
    </div>
  );
}
