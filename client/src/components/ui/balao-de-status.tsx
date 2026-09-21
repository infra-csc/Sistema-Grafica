// ─────────────────────────────────────────────────────────────────────────────
// O BALÃO DO STATUS — "o que isto significa e de quem é a vez", ao tocar.
//
// PORQUÊ. O `title` resolve quem tem mouse. No celular e no tablet não existe
// hover: a frase que explica o status ficava inalcançável justamente para a
// Gráfica, que trabalha de telefone na mão. O balão abre com toque OU clique no
// selo e fecha ao tocar fora, no Esc, ao rolar ou ao redimensionar.
//
// O CUIDADO COM AS LINHAS CLICÁVEIS. O selo mora dentro de linhas e cartões
// que abrem a ficha da peça. Se o toque no selo abrisse o balão E a ficha, o
// balão ficaria atrás do modal; se ele engolisse o clique, a linha pararia de
// abrir quando o dedo cai no selo — o alvo mais visível dela. Então: dentro de
// algo clicável, o selo NÃO faz nada além do `title` (a ficha que a linha abre
// já diz, na faixa do alto, o que falta e quem age). Fora disso, abre o balão.
// "Clicável" é lido do DOM na hora (link, botão, role de controle ou cursor de
// mão num ancestral próximo) — o React não expõe os onClick dos pais, e o
// cursor é a promessa visual de clique que as telas desta base sempre fazem.
//
// SEM RADIX, de propósito: o selo aparece centenas de vezes por tela, e o custo
// dos refs compostos do Radix em lista viva é o que causou o #185 nesta base
// (ver modal-shell.tsx). Aqui, fechado, o custo é um useState e dois handlers;
// o portal só existe enquanto o balão está aberto.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getStatusLabel, guiaDoStatus } from "@/lib/status";

const SELETOR_CLICAVEL =
  'a[href],button,[role="button"],[role="link"],[role="option"],[role="menuitem"],[role="tab"],[role="row"],label,summary';

/** true se algum ancestral próximo do selo já responde a clique. */
function dentroDeAlgoClicavel(el: HTMLElement): boolean {
  let n = el.parentElement;
  // 10 níveis cobrem célula → linha → tabela de qualquer tela; subir até o
  // <body> pegaria o cursor de páginas inteiras e custaria estilo à toa.
  for (let passos = 0; n && n !== document.body && passos < 10; passos++) {
    if (n.matches(SELETOR_CLICAVEL)) return true;
    if (getComputedStyle(n).cursor === "pointer") return true;
    n = n.parentElement;
  }
  return false;
}

const LARGURA = 280;

interface Posicao { left: number; top?: number; bottom?: number }

/**
 * Liga o balão a um selo de status. Devolve os handlers para espalhar no
 * elemento do selo, o `aria-describedby` enquanto aberto e o nó do balão.
 */
export function useBalaoDeStatus(status: string) {
  const guia = guiaDoStatus(status);
  const [pos, setPos] = useState<Posicao | null>(null);
  const alvo = useRef<HTMLElement | null>(null);
  // Decidido uma vez por selo, no primeiro contato: o DOM em volta de um selo
  // não muda de "linha clicável" para "texto solto" durante a vida dele.
  const clicavel = useRef<boolean | null>(null);
  const idBalao = useId();

  const decidir = (el: HTMLElement) => {
    if (clicavel.current === null) clicavel.current = dentroDeAlgoClicavel(el);
    return clicavel.current;
  };

  const fechar = () => setPos(null);

  useEffect(() => {
    if (!pos) return;
    const fora = (e: Event) => {
      const t = e.target as Node | null;
      if (alvo.current?.contains(t)) return; // o próprio selo alterna no onClick
      if (t instanceof Node && document.getElementById(idBalao)?.contains(t)) return;
      fechar();
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    document.addEventListener("pointerdown", fora, true);
    document.addEventListener("keydown", tecla);
    // Rolar ou redimensionar descola o balão do selo — melhor sumir que flutuar
    // apontando para a linha errada.
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      document.removeEventListener("pointerdown", fora, true);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
    };
  }, [pos, idBalao]);

  const handlers = guia
    ? {
        onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
          // Cursor de ajuda só onde o clique vai de fato abrir o balão.
          if (!decidir(e.currentTarget)) e.currentTarget.style.cursor = "help";
        },
        onClick: (e: React.MouseEvent<HTMLElement>) => {
          const el = e.currentTarget;
          if (decidir(el)) return; // a linha/cartão cuida do clique
          alvo.current = el;
          if (pos) { fechar(); return; }
          const r = el.getBoundingClientRect();
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const left = Math.max(8, Math.min(r.left, vw - LARGURA - 8));
          // Abaixo do selo; se não couber (~170px), acima.
          setPos(r.bottom + 180 > vh ? { left, bottom: vh - r.top + 6 } : { left, top: r.bottom + 6 });
        },
      }
    : {};

  const balao = pos && guia
    ? createPortal(
        <div
          id={idBalao}
          role="tooltip"
          data-testid="balao-status"
          className="norte-surge"
          // Portal do React ainda propaga eventos pela árvore de COMPONENTES:
          // sem isto, clicar dentro do balão chegava ao onClick do selo e o
          // fechava — e subiria até o cartão que hospeda o selo.
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, zIndex: 300,
            width: LARGURA, maxWidth: "calc(100vw - 16px)", boxSizing: "border-box",
            padding: "12px 14px", borderRadius: 10,
            backgroundColor: "#ffffff", border: "1px solid #e7e5e4",
            boxShadow: "0 12px 32px -8px rgba(28,25,23,0.22)",
            fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 12, lineHeight: 1.5,
            color: "#57534e", textAlign: "left", whiteSpace: "normal",
            textTransform: "none", letterSpacing: "normal", fontWeight: 500,
          }}
        >
          <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: "#1c1917" }}>{getStatusLabel(status)}</p>
          <p style={{ margin: 0 }}>{guia.significado}</p>
          {guia.quemAge && (
            <p style={{ margin: "8px 0 0" }}>
              <strong style={{ color: "#1c1917" }}>Quem age agora:</strong> {guia.quemAge}
              {guia.onde ? <> — {guia.onde}</> : null}
            </p>
          )}
          {guia.proximoPasso && (
            <p style={{ margin: guia.quemAge ? "2px 0 0" : "8px 0 0" }}>
              <strong style={{ color: "#1c1917" }}>Próximo passo:</strong> {guia.proximoPasso}
            </p>
          )}
        </div>,
        document.body,
      )
    : null;

  return { guia, handlers, describedBy: pos ? idBalao : undefined, balao };
}
