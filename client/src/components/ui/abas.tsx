// ─────────────────────────────────────────────────────────────────────────────
// <Abas> e <Segmentado> — as duas formas de trocar de recorte.
//
// API
//   <Abas
//     itens={[{ id: "todos", rotulo: "Todos", contador: 42 },
//             { id: "atrasados", rotulo: "Atrasados", contador: 3, tom: "perigo" }]}
//     ativo={aba} aoTrocar={setAba}
//     rotuloDaLista="Filtro de peças"   // aria-label do container
//   />
//
//   <Segmentado itens={[…]} ativo={modo} aoTrocar={setModo} tamanho="md" />
//
// QUAL DOS DOIS. <Abas> troca o CONTEÚDO da tela (outra lista, outro recorte);
// o sublinhado é a metáfora de "esta seção está aberta". <Segmentado> troca a
// FORMA de ver o mesmo conteúdo (tabela/cartão, dia/semana/mês) e por isso
// parece um controle, não uma navegação.
//
// ─── O CONTADOR USA A COR DA PRÓPRIA ABA ────────────────────────────────────
// Um "3" vermelho ao lado de "Atrasados" diz, sem ler, que há problema. O
// padrão anterior pintava TODO contador de cinza, o que jogava fora a única
// informação que o número tinha além da quantidade. Aba sem `tom` fica neutra —
// contagem de "Todos" não é notícia.
//
// ─── A NAVEGAÇÃO POR SETAS MORA AQUI, UMA VEZ SÓ ────────────────────────────
// Setas andam entre as abas, Home/End vão às pontas, e só a aba ativa fica no
// Tab (roving tabindex): sem isso, um filtro de 9 abas custa 9 Tabs para
// atravessar. Era o tipo de coisa que cada tela reimplementava pela metade —
// ou, na maioria, não implementava, e o teclado simplesmente não trocava de
// aba. Estando aqui, toda tela que usar o componente ganha isso de graça.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { T, FS, R, FW, FONT, H, MOTION } from "@/lib/theme";
import { coresDoTom, type TomDoSelo } from "@/components/ui/selo";

export interface ItemDeAba {
  id: string;
  rotulo: string;
  contador?: number;
  /** Tom do contador — "perigo" em atrasados, "alerta" em pendências. */
  tom?: TomDoSelo;
  desabilitada?: boolean;
}

interface BaseProps {
  itens: ItemDeAba[];
  ativo: string;
  aoTrocar: (id: string) => void;
  rotuloDaLista?: string;
}

/**
 * Setas/Home/End sobre uma fileira de `role="tab"`. Devolve o onKeyDown que
 * ambos os componentes penduram no container.
 *
 * Pula item desabilitado em vez de parar nele: parar num item que não responde
 * é a mesma coisa que travar.
 */
function useSetas(itens: ItemDeAba[], ativo: string, aoTrocar: (id: string) => void) {
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (e: React.KeyboardEvent) => {
    const passo = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1
      : 0;
    const vivos = itens.filter((i) => !i.desabilitada);
    if (!vivos.length) return;

    let destino: ItemDeAba | undefined;
    if (passo) {
      const atual = vivos.findIndex((i) => i.id === ativo);
      destino = vivos[(((atual < 0 ? 0 : atual) + passo) + vivos.length) % vivos.length];
    } else if (e.key === "Home") {
      destino = vivos[0];
    } else if (e.key === "End") {
      destino = vivos[vivos.length - 1];
    }
    if (!destino) return;

    e.preventDefault();
    aoTrocar(destino.id);
    // O foco acompanha a seleção: quem navega por teclado precisa que o anel
    // esteja onde a leitura está, senão a próxima seta parte do lugar errado.
    refs.current[destino.id]?.focus();
  };

  return { refs, onKeyDown };
}

export function Abas({ itens, ativo, aoTrocar, rotuloDaLista }: BaseProps) {
  const { refs, onKeyDown } = useSetas(itens, ativo, aoTrocar);

  return (
    <div
      role="tablist"
      aria-label={rotuloDaLista}
      onKeyDown={onKeyDown}
      data-testid="abas"
      style={{
        display: "flex", alignItems: "stretch", gap: 2,
        borderBottom: `1px solid ${T.border}`,
        overflowX: "auto", scrollbarWidth: "none",
      }}
    >
      {itens.map((item) => {
        const sel = item.id === ativo;
        const cor = item.tom ? coresDoTom(item.tom) : null;
        return (
          <button
            key={item.id}
            ref={(el) => { refs.current[item.id] = el; }}
            role="tab"
            type="button"
            aria-selected={sel}
            disabled={item.desabilitada}
            tabIndex={sel ? 0 : -1}
            onClick={() => aoTrocar(item.id)}
            data-testid={`aba-${item.id}`}
            className="ds-botao ds-botao-fantasma"
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              minHeight: H.toque, padding: "0 14px",
              background: "transparent",
              border: "none",
              // O sublinhado é a marca da aba aberta. 2px fica abaixo do
              // hairline de 1px da borda do container, por isso 3 e o
              // marginBottom negativo — ele TAPA a linha, não convive com ela.
              borderBottom: `3px solid ${sel ? T.text : "transparent"}`,
              marginBottom: -1,
              fontFamily: FONT.corpo,
              fontSize: FS.body,
              fontWeight: sel ? FW.rotulo : FW.medio,
              color: sel ? T.text : T.second,
              cursor: item.desabilitada ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
              transition: `color ${MOTION.rapida} ease, border-color ${MOTION.rapida} ease`,
            }}
          >
            {item.rotulo}
            {typeof item.contador === "number" && (
              <span
                // A contagem na cor da própria aba: "3" vermelho já é a
                // notícia, antes de ler a palavra "Atrasados".
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  minWidth: 20, padding: "1px 6px", borderRadius: R.pill,
                  fontSize: FS.micro, fontWeight: FW.rotulo, lineHeight: 1.6,
                  backgroundColor: cor ? cor.bg : T.low,
                  color: cor ? cor.text : T.apoio,
                  border: `1px solid ${cor ? cor.border : T.border}`,
                }}
              >
                {item.contador}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Segmentado({ itens, ativo, aoTrocar, rotuloDaLista, tamanho = "md" }: BaseProps & { tamanho?: "sm" | "md" }) {
  const { refs, onKeyDown } = useSetas(itens, ativo, aoTrocar);
  const alt = tamanho === "sm" ? H.sm : H.md;

  return (
    <div
      role="tablist"
      aria-label={rotuloDaLista}
      onKeyDown={onKeyDown}
      data-testid="segmentado"
      style={{
        display: "inline-flex", alignItems: "center", gap: 2,
        padding: 3, borderRadius: R.md,
        backgroundColor: T.low, border: `1px solid ${T.border}`,
      }}
    >
      {itens.map((item) => {
        const sel = item.id === ativo;
        return (
          <button
            key={item.id}
            ref={(el) => { refs.current[item.id] = el; }}
            role="tab"
            type="button"
            aria-selected={sel}
            disabled={item.desabilitada}
            tabIndex={sel ? 0 : -1}
            onClick={() => aoTrocar(item.id)}
            data-testid={`segmento-${item.id}`}
            className="ds-botao"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              minHeight: alt - 8, padding: "0 12px",
              borderRadius: R.sm,
              // Só o segmento ativo ganha superfície: o resto é fundo do
              // trilho. Pintar todos e mudar só o tom faz o olho procurar.
              backgroundColor: sel ? T.surface : "transparent",
              border: sel ? `1px solid ${T.border}` : "1px solid transparent",
              boxShadow: sel ? "0 1px 2px rgba(28,25,23,0.06)" : "none",
              fontFamily: FONT.corpo,
              fontSize: tamanho === "sm" ? FS.meta : FS.body,
              fontWeight: sel ? FW.forte : FW.medio,
              color: sel ? T.text : T.second,
              cursor: item.desabilitada ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {item.rotulo}
            {typeof item.contador === "number" && (
              <span style={{ fontSize: FS.micro, fontWeight: FW.rotulo, color: sel ? T.apoio : T.second }}>
                {item.contador}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
