// ─── Estilos compartilhados do Painel Geral ─────────────────────────────────
import type { CSSProperties } from "react";
import { N, T, TOM, FONT } from "@/lib/theme";

// O nome do evento sai da caixa-alta forçada: é CONTEÚDO (o nome que a pessoa
// digitou), e caixa-alta em 15px peso 800 repetida em cada grupo fazia a lista
// inteira gritar no mesmo volume. Quem cadastrou em maiúsculas continua vendo
// em maiúsculas — a tela só parou de impor.
export const EVENT_TITLE_STYLE: CSSProperties = {
  fontFamily: FONT.display,
  fontWeight: 700, fontSize: 15,
  letterSpacing: "-0.01em",
  color: T.text, margin: 0, lineHeight: 1,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};

// ─── O selo da linha da peça — UMA receita ──────────────────────────────────
// A célula de ID chegava a ter quatro selos com quatro famílias de cor (verde
// "REAPROVEIT.", azul "REF. VISUAL", roxo "BOOK", cinza de observação) e todos
// em caixa-alta 10px peso 800: a coluna gritava mais que o status ao lado, que
// é a informação que a pessoa foi buscar. Nenhum deles é risco nem atraso.
// Agora: caixa normal, 11px, fundo stone — o que diferencia um do outro é a
// palavra e o ícone. Só o selo de evento finalizado sobrepõe as cores (as
// dele, de lib/painel-encerrados), porque ele muda a leitura da linha inteira.
// #57534e sobre #f5f5f4 = 6,99:1 AA.
export const SELO_CALMO: CSSProperties = {
  display: "inline-flex", alignItems: "center", width: "fit-content",
  fontSize: 11, fontWeight: 600, lineHeight: 1.35, whiteSpace: "nowrap",
  color: T.apoio, backgroundColor: N.n2, border: `1px solid ${T.border}`,
  borderRadius: 6, padding: "1px 6px",
};

// ─── CSS da tela ────────────────────────────────────────────────────────────
// O hover das linhas era feito com onMouseEnter/onMouseLeave mutando
// `el.style` — dois handlers recriados a cada render em até 2000 linhas. Em
// CSS custa zero por linha. A zebra continua vindo de atributo (`data-zebra`)
// porque as linhas de peça não são contíguas: sub-headers de grupo e de tipo
// se intercalam, então `:nth-child` contaria errado.
export const PG_CSS = `
.pg-row { border-left: 3px solid transparent; border-bottom: 1px solid ${N.n3}; transition: background-color .15s, transform .15s, border-color .15s; }
.pg-row[data-zebra="0"] { background-color: ${T.surface}; }
.pg-row[data-zebra="1"] { background-color: ${N.n2}; }
.pg-row[data-deleted="0"] { cursor: pointer; }
.pg-row[data-deleted="1"] { background-color: ${TOM.perigo.bg}; border-left-color: ${TOM.perigo.border}; opacity: .85; }
.pg-row[data-deleted="0"]:hover { background-color: ${TOM.laranja.bg}; border-left-color: ${T.accent}; transform: translateY(-1px); }
.pg-row[data-selected="1"] { background-color: ${TOM.laranja.bg}; border-left-color: ${T.accentText}; }
.pg-event-link { text-decoration: none; display: block; min-width: 0; border-radius: 4px; }
.pg-event-link h3 { transition: color .15s; }
.pg-event-link:hover h3 { color: ${T.accentText}; text-decoration: underline; }
.pg-event-link:focus-visible { outline: 2px solid ${T.accentText}; outline-offset: 2px; }
.pg-goto { opacity: 0; transition: opacity .15s; flex-shrink: 0; }
.pg-event-link:hover .pg-goto, .pg-event-link:focus-visible .pg-goto { opacity: 1; }
/* CARD DE RESUMO — hover, foco e esmaecido em CSS.
   Eram handlers de mouse mutando style (translateY e opacity) — e o teclado
   não recebia nada disso: o card zerado continuava apagado com foco nele.
   Aqui :focus-visible ganha o mesmo tratamento do hover, de graça. O
   deslocamento é de 1px: o card é resumo, não botão de chamada, e movimento
   grande em 13 cards lado a lado vira tremedeira. A regra global de
   prefers-reduced-motion (index.css) zera as transições. */
.pg-card { transition: border-color .15s, box-shadow .15s, transform .15s, opacity .15s, background-color .15s; }
.pg-card[data-zero="1"] { opacity: .72; }
.pg-card:hover, .pg-card:focus-visible { opacity: 1; }
.pg-card[aria-pressed="false"]:hover { transform: translateY(-1px); border-color: ${T.bdark}; box-shadow: 0 3px 10px rgba(28,25,23,.07); }
/* Segmento da barra: o pai tem overflow hidden (raio da pílula), então o anel
   global de foco, que fica 2px PARA FORA, seria cortado. Anel para dentro. */
.pg-seg:focus-visible { outline: 2px solid ${T.text}; outline-offset: -2px; border-radius: 0; }
.pg-seg:hover { filter: brightness(.92); }
.pg-chip { transition: background-color .15s, border-color .15s, box-shadow .15s; }
.pg-chip[aria-pressed="false"]:hover { box-shadow: 0 2px 8px rgba(28,25,23,.08); }
.pg-anexo:hover { color: ${T.accentText} !important; border-color: ${TOM.laranja.border} !important; background-color: ${TOM.laranja.bg} !important; }
.pg-sortable { cursor: pointer; user-select: none; }
/* ALVO DA CAIXA DE SELEÇÃO.

   A caixa é um input type="checkbox" de 15×15 — a WCAG 2.5.8 pede 24×24
   no nível AA e a régua da casa pede 36 de ponteiro. Não há conserto
   CSS-only no próprio input: padding não se aplica a elemento substituído,
   transform não muda a caixa de layout e ::before não renderiza nele.

   Quem cresce é o label em volta: 36×36 de área clicável, com margem
   negativa de 10px para devolver ao layout o espaço que ele tomou. A caixa
   continua desenhada com 15px no mesmo lugar; o que mudou é onde o clique
   é aceito. Envolver no label também dispensa o for/id — clicar no
   rótulo alterna o input por definição do HTML. */
.pg-check { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; margin: -10px; cursor: pointer; }
/* ${T.accentText} sobre o ${T.bg} do cabecalho = 4,96:1 AA. Era ${TOM.laranja.border}, escolhido
   quando o thead era ESCURO; ao clarear o cabecalho eu nao revisei esta cor e
   ela virou 1,61:1 — o hover de ordenacao ficou praticamente invisivel. */
.pg-sortable:hover { color: ${T.accentText}; }
`;
