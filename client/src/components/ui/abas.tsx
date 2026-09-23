// ─────────────────────────────────────────────────────────────────────────────
// <Abas> e <Segmentado> — as duas formas de trocar de recorte.
//
// API
//   <Abas
//     itens={[{ id: "todos", rotulo: "Todos", contador: 42 },
//             { id: "atrasados", rotulo: "Atrasados", contador: 3, tom: "perigo" }]}
//     ativo={aba} aoTrocar={setAba}
//     rotuloDaLista="Filtro de peças"       // aria-label do container
//     prefixoDeTestId="tab-versoes"         // data-testid: tab-versoes-todos…
//   />
//
//   <Segmentado itens={[…]} ativo={modo} aoTrocar={setModo}
//               tamanho="sm" | "md" | "toque" larguraCheia />
//
//   Em ambos, por ITEM: icone, title, idDoElemento (o id do botão) e
//   ariaControls (o id do painel) — o par que um painel com
//   aria-labelledby precisa. No contêiner: testId (pd. "abas"/"segmentado")
//   e style (flex, margem, largura).
//
// `prefixoDeTestId` existe para a MIGRAÇÃO: uma tela adota o componente sem
// trocar os seletores que os testes dela já usam. Sem ele, adotar custaria uma
// rodada de teste quebrado por tela — e o jeito mais barato de a migração não
// acontecer é ela sair cara.
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
import type { LucideIcon } from "lucide-react";
import { T, FS, R, FW, FONT, H, MOTION } from "@/lib/theme";
import { coresDoTom, type TomDoSelo } from "@/components/ui/selo";

export interface ItemDeAba {
  id: string;
  rotulo: string;
  contador?: number;
  /** Tom do contador — "perigo" em atrasados, "alerta" em pendências. */
  tom?: TomDoSelo;
  desabilitada?: boolean;
  /** Ícone à esquerda do rótulo (decorativo: o rótulo continua sendo o nome). */
  icone?: LucideIcon;
  /** Dica no ponteiro. NÃO substitui o rótulo — no toque não aparece. */
  title?: string;
  /**
   * id do botão da aba, para o painel dizer `aria-labelledby` dele. Antes a
   * tela recolocava o id por ref depois do render.
   */
  idDoElemento?: string;
  /** id do painel que esta aba mostra (`aria-controls`). */
  ariaControls?: string;
}

interface BaseProps {
  itens: ItemDeAba[];
  ativo: string;
  aoTrocar: (id: string) => void;
  rotuloDaLista?: string;
  /**
   * Prefixo do `data-testid` de cada aba (padrão "aba" / "segmento"), para uma
   * tela migrar sem trocar os seletores que os testes dela já usam. Sem isto,
   * adotar o componente custaria uma rodada de teste quebrado por tela — e o
   * jeito mais barato de a migração não acontecer é ela sair cara.
   */
  prefixoDeTestId?: string;
  /** `data-testid` do CONTÊINER (pd. "abas" / "segmentado"). */
  testId?: string;
  /** Estilo do contêiner, por cima do padrão — flex, margem, largura. */
  style?: React.CSSProperties;
}

/** Os atributos por item que as duas fileiras repassam igual. */
function atributosDoItem(item: ItemDeAba) {
  return {
    id: item.idDoElemento,
    "aria-controls": item.ariaControls,
    title: item.title,
  };
}

function IconeDaAba({ Icone, tamanho }: { Icone?: LucideIcon; tamanho: number }) {
  return Icone ? <Icone aria-hidden="true" style={{ width: tamanho, height: tamanho, flexShrink: 0 }} /> : null;
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

export interface AbasProps extends BaseProps {
  /**
   * Traz a aba ativa para a vista quando ela muda (trilho que rola no
   * celular). A Arte fazia isto com um ref e scrollIntoView por fora.
   */
  rolarAteAtiva?: boolean;
}

export function Abas({
  itens, ativo, aoTrocar, rotuloDaLista, prefixoDeTestId = "aba", testId = "abas", style, rolarAteAtiva = false,
}: AbasProps) {
  const { refs, onKeyDown } = useSetas(itens, ativo, aoTrocar);

  React.useEffect(() => {
    if (!rolarAteAtiva) return;
    const el = refs.current[ativo];
    // "nearest": só rola o que precisa — sem puxar a PÁGINA para a aba.
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [ativo, rolarAteAtiva, refs]);

  return (
    <div
      role="tablist"
      aria-label={rotuloDaLista}
      onKeyDown={onKeyDown}
      data-testid={testId}
      style={{
        // gap 8 + 11px de respiro de cada lado: a mesma distância de 30px entre
        // rótulos que o 2 + 14 dava, mas agora com o vão de 8px entre ALVOS
        // que a régua do celular cobra — o toque de um dedo gordo não cai na
        // aba vizinha. (Era a exceção que grafica-celular.test.ts abria.)
        display: "flex", alignItems: "stretch", gap: 8,
        borderBottom: `1px solid ${T.border}`,
        overflowX: "auto", scrollbarWidth: "none",
        ...style,
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
            data-testid={`${prefixoDeTestId}-${item.id}`}
            {...atributosDoItem(item)}
            // ds-aba: o anel de foco entra para DENTRO — o trilho rola na
            // horizontal e recortaria o anel de fora.
            className="ds-botao ds-botao-fantasma ds-aba"
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              minHeight: H.toque, padding: "0 11px",
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
            <IconeDaAba Icone={item.icone} tamanho={15} />
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

export interface SegmentadoProps extends BaseProps {
  /**
   * "toque" põe cada segmento em 44px (o piso de dedo) — o trilho fica com
   * 52. sm/md mantêm a altura de ponteiro, e o (pointer: coarse) do index.css
   * sobe o alvo sozinho no aparelho de toque.
   */
  tamanho?: "sm" | "md" | "toque";
  /** Contêiner em 100% e segmentos dividindo a largura por igual. */
  larguraCheia?: boolean;
}

export function Segmentado({
  itens, ativo, aoTrocar, rotuloDaLista, prefixoDeTestId = "segmento", tamanho = "md",
  testId = "segmentado", style, larguraCheia = false,
}: SegmentadoProps) {
  const { refs, onKeyDown } = useSetas(itens, ativo, aoTrocar);
  // Altura do SEGMENTO. sm/md descontam o trilho (3px de respiro + 1 de borda
  // de cada lado) para o conjunto ter a altura do controle; o toque não
  // desconta: 44 é o piso do alvo, não do trilho.
  const altItem = tamanho === "toque" ? H.toque : (tamanho === "sm" ? H.sm : H.md) - 8;

  return (
    <div
      role="tablist"
      aria-label={rotuloDaLista}
      onKeyDown={onKeyDown}
      data-testid={testId}
      style={{
        display: larguraCheia ? "flex" : "inline-flex", alignItems: "center", gap: 2,
        width: larguraCheia ? "100%" : undefined,
        padding: 3, borderRadius: R.md,
        backgroundColor: T.low, border: `1px solid ${T.border}`,
        ...style,
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
            data-testid={`${prefixoDeTestId}-${item.id}`}
            {...atributosDoItem(item)}
            className="ds-botao"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              flex: larguraCheia ? "1 1 0%" : undefined,
              minHeight: altItem, padding: tamanho === "toque" ? "0 14px" : "0 12px",
              borderRadius: R.sm,
              // Só o segmento ativo ganha superfície: o resto é fundo do
              // trilho. Pintar todos e mudar só o tom faz o olho procurar.
              backgroundColor: sel ? T.surface : "transparent",
              border: sel ? `1px solid ${T.border}` : "1px solid transparent",
              boxShadow: sel ? "0 1px 2px rgba(28,25,23,0.06)" : "none",
              fontFamily: FONT.corpo,
              fontSize: tamanho === "sm" ? FS.meta : tamanho === "toque" ? FS.read : FS.body,
              fontWeight: sel ? FW.forte : FW.medio,
              color: sel ? T.text : T.second,
              cursor: item.desabilitada ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <IconeDaAba Icone={item.icone} tamanho={tamanho === "toque" ? 16 : 14} />
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
