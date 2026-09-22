// Design tokens compartilhados — paleta "Titanium/Stone" e escalas de
// tipografia, raio e elevação. Antes cada página redefinia um `const T = {...}`
// local; a tela da Arte chegava a 113 cores hardcoded, 19 raios de borda e 14
// tamanhos de fonte. Centralizar evita a divergência entre cópias.
//
// ─────────────────────────────────────────────────────────────────────────────
// ESTE ARQUIVO É A FONTE. O index.css espelha os MESMOS valores em CSS vars
// (--n*, --fs-*, --r-*, --sh-*, --dur-*), para o que é CSS puro: pseudo-classes
// (:hover, :focus-visible, :disabled), media queries e o tema escuro. Estilo
// inline não alcança nada disso; por isso os dois existem. Quem muda um muda
// o outro — os valores têm de bater dígito por dígito.
//
// O CSS tinha uma escada PARALELA com valores diferentes (--r-md 10 contra
// R.md 8, --n3 #e7e5e4 contra T.border #e8e8e7). Nenhum .tsx consumia aquelas
// vars: eram tokens mortos de uma tentativa anterior. Foram realinhadas aqui,
// sempre para o valor que a tela REALMENTE usa — contado no código, não
// escolhido no gosto.
// ─────────────────────────────────────────────────────────────────────────────
import { P } from "./status";

/**
 * A ESCADA DE NEUTROS — onze degraus, do papel ao texto.
 *
 * São onze porque a tela usa onze, contados: cada um destes tons aparece em
 * dezenas a centenas de pontos do código. Reduzir a escada a nove obrigaria a
 * arredondar dois tons de verdade (#f0efee, 90 usos, e #44403c, 231) para o
 * vizinho, e é exatamente assim que uma superfície "quase igual" vira uma
 * emenda visível entre dois blocos.
 *
 * O CORTE IMPORTANTE fica entre n6 e n7: n6 (#a8a29e) é o último tom claro o
 * bastante para ser DECORAÇÃO e escuro demais para ser TEXTO — 2,5:1 sobre
 * branco, reprova AA em toda superfície do app. n7 é o primeiro que passa.
 */
export const N = {
  n0: "#ffffff", // superfície pura: card, modal, linha par da tabela
  n1: "#fafaf9", // fundo da página, cabeçalho de tabela
  n2: "#f5f5f4", // superfície sutil: faixa de tipo, linha ímpar, hover
  n3: "#f0efee", // separador claro, trilho, fundo de campo desabilitado
  n4: "#e7e5e4", // BORDA PADRÃO — o hairline de tudo
  n5: "#d6d3d1", // borda forte, ícone de estado vazio, scrollbar
  n6: "#a8a29e", // ícone decorativo e desabilitado — NUNCA como texto
  n7: "#746e69", // texto secundário    (5,03:1 sobre n0, 4,56 no pior fundo)
  n8: "#57534e", // texto de apoio      (7,63:1 sobre n0)
  n9: "#44403c", // texto forte         (10,4:1 sobre n0)
  n10: "#1c1917", // texto principal    (16,1:1 sobre n0)
} as const;

/**
 * SEMÂNTICOS — reexportados de `status.ts`, não redefinidos.
 *
 * As cores de significado já tinham dono: a paleta `P` de lib/status.ts, que é
 * a mesma que pinta as pílulas de status. Copiar os hexes para cá criaria a
 * segunda verdade que este arquivo existe para eliminar — foi assim que um
 * vermelho reprovado em contraste sobreviveu em cinco telas.
 *
 * Cada tom traz `bg` (tinta clara), `border`, `text` (tom escuro, AA sobre o
 * `bg`) e `dot` (tom saturado, só para bolinha/barra — não é cor de texto).
 */
export const TOM = {
  sucesso: P.green,
  alerta: P.amber,
  perigo: P.red,
  info: P.blue,
  neutro: P.neutral,
  /**
   * A família do laranja da marca, em papel de tinta clara. O `text` aqui é
   * #c2410c — o mesmo `T.accentText` — porque o #f97316 da marca não pode
   * carregar leitura. Serve a "em produção", "destaque", "novo".
   */
  laranja: P.orange,
  /**
   * Azul-céu: informação FRIA — contagem, referência, "quantas peças saíram
   * deste modelo". Fica ao lado de `info` (azul) de propósito: `info` avisa,
   * `ceu` só conta.
   */
  ceu: P.sky,
  /**
   * As três que faltavam para as telas pararem de redigitar hex: roxo
   * (aprovação, decisão de patrocinador), esmeralda (encerramento, conclusão)
   * e turquesa (marco de evento). Continuam vindo da MESMA paleta P — este
   * objeto é um índice em português, não uma segunda tabela de cor.
   */
  roxo: P.purple,
  esmeralda: P.emerald,
  turquesa: P.teal,
  ciano: P.cyan,
} as const;

export type NomeDeTom = keyof typeof TOM;

/**
 * FAMÍLIAS DE FONTE — três, e o papel de cada uma.
 *
 * Eram SEIS carregadas no index.html (Inter, Plus Jakarta Sans, Space Grotesk,
 * DM Mono, Manrope, Outfit): ~180KB de fonte para três papéis. Manrope tinha
 * dois usos no app inteiro e Outfit, dois. Plus Jakarta e Space Grotesk faziam
 * o MESMO papel (título) em telas diferentes, o que deixava dois cabeçalhos do
 * mesmo produto com desenho de letra diferente.
 */
export const FONT = {
  /** Corpo, rótulo, campo — tudo que se lê em linha. */
  corpo: "Inter, system-ui, sans-serif",
  /** Título e NÚMERO: o desenho estreito segura dígito grande sem esparramar. */
  display: "'Space Grotesk', Inter, sans-serif",
  /** Código, medida, id — o que só se compara alinhado em coluna. */
  mono: "'DM Mono', Menlo, monospace",
} as const;

/** Pesos. Três, porque a hierarquia não pode depender só de peso. */
export const FW = {
  corpo: 500,
  medio: 600,
  forte: 700,
  /** Rótulo em CAIXA-ALTA — sempre acompanhado de tracking. */
  rotulo: 800,
} as const;

/**
 * MOVIMENTO — duas durações.
 *
 * `rapida` é reação a toque (hover, foco, cor de fundo): tem de ser curta o
 * bastante para parecer instantânea. `media` é mudança de estado que o olho
 * precisa seguir (abrir, expandir, entrar). Um terceiro degrau só serviria
 * para discutir. Tudo isto é anulado por `prefers-reduced-motion` no
 * index.css.
 */
export const MOTION = {
  rapida: "120ms",
  media: "180ms",
  saida: "cubic-bezier(0.2, 0.8, 0.2, 1)",
} as const;

export const T = {
  bg: N.n1,
  surface: N.n0,
  /**
   * Era #e8e8e7, um cinza que só existia aqui: a tela escreve #e7e5e4 (n4) em
   * 553 pontos. Dois cinzas separados por um dígito, lado a lado na mesma
   * tabela, desenham uma emenda que ninguém consegue nomear mas todo mundo vê.
   */
  border: N.n4,
  bdark: N.n5,
  /** Era #1a1c1c; a tela escreve #1c1917 (n10) em 487 pontos. Mesma história. */
  text: N.n10,
  /**
   * Texto secundário — metadados, legendas, rótulos de apoio.
   *
   * Era #78716c, escolhido medindo contra branco (4.80:1). Só que o app
   * também escreve sobre as superfícies acinzentadas #f5f5f4 e #f3f4f3, onde
   * aquele cinza cai para 4.40 e 4.35 e reprova o piso de 4.5:1 — foi
   * exatamente esse erro que passou despercebido na tela da Arte.
   *
   * #746e69 é o cinza mais claro da mesma família quente que passa em TODAS as
   * superfícies do app (4.56 no pior caso, #f3f4f3), então não existe mais
   * "depende do fundo": onde couber texto secundário, este token serve.
   * A diferença de peso para o anterior é imperceptível (L 0.159 vs 0.169).
   */
  second: N.n7,
  /**
   * ATENÇÃO: apenas para elementos decorativos (ícones, separadores,
   * placeholders) — nunca para texto. Fica entre 2.29 e 2.52:1 sobre as
   * superfícies do app e reprova WCAG AA em todas elas. Para texto legível
   * use `T.second`.
   */
  muted: N.n6,
  accent: "#f97316",
  /**
   * Accent em papel de TEXTO. O laranja `accent` (#f97316) rende 2,8:1 sobre
   * branco — accent NUNCA pode ser cor de texto, nem fundo sob texto branco.
   * Onde o laranja precisa carregar leitura (rótulos, links, botão com texto
   * branco), use este tom escurecido da mesma família (#c2410c, ~4,9:1 sobre
   * branco). `accent` segue reservado a elementos decorativos: barras, brilhos,
   * ícones grandes, anéis de foco.
   */
  accentText: "#c2410c",
  dark: N.n10,
  /** Fundo de bloco rebaixado dentro de card branco. */
  low: "#f3f4f3",
  /** Texto de apoio e texto forte, para não redigitar `N.n8` / `N.n9`. */
  apoio: N.n8,
  strong: N.n9,
};

/**
 * Escala tipográfica. Os degraus existem para forçar hierarquia: quando um
 * texto não cabe em nenhum deles, o problema costuma ser a hierarquia, não a
 * escala.
 *
 * PISO DE 10px. A tela tinha 6, 7, 8 e 9px vivos — em 15 pontos somados. Não é
 * "texto pequeno", é texto que não se lê: no galpão, sob luz ruim e com o
 * aparelho na mão, 8px some. Quem precisava de 8 precisava, na verdade, de
 * menos texto.
 *
 * Os degraus do meio (12, 14, 16) não estavam nomeados e apareciam 840 vezes
 * como número cru — a escala fingia ter sete degraus enquanto a tela usava dez.
 */
export const FS = {
  micro: 10,   // rótulo de badge, texto auxiliar em caixa alta
  small: 11,   // metadados, legendas
  meta: 12,    // segunda linha de um item, contagem
  body: 13,    // texto corrente da interface
  read: 14,    // texto corrido longo (descrição, comentário)
  strong: 15,  // destaque dentro de um bloco
  lead: 16,    // campo em tela de toque (abaixo disto o iOS dá zoom), subtítulo
  title: 18,   // título de seção
  h2: 22,      // título de card/modal
  h1: 26,      // título de página, número de KPI
} as const;

/**
 * Raio de borda. Cinco degraus cobrem tudo — a Arte usava dezenove, incluindo
 * quatro formas diferentes de dizer "pílula" (20, 99, 100, 9999).
 */
export const R = {
  sm: 6,     // chips, badges retangulares
  md: 8,     // botões, inputs, controles
  lg: 12,    // cards, painéis
  xl: 16,    // modais
  pill: 999, // pílulas e círculos
} as const;

/**
 * ALTURA DE CONTROLE. `toque` é o piso de 44px da regra da casa: no celular e
 * no tablet do galpão o ponteiro é o dedo, e alvo menor que isso erra.
 */
export const H = {
  sm: 32,
  md: 36,
  toque: 44,
} as const;

/** Luminância relativa de um hex de 6 dígitos. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.substr(i, 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function normalizeHex(value?: string | null): string | null {
  const hex = (value ?? "").trim();
  const full = /^#[0-9a-fA-F]{3}$/.test(hex)
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  return /^#[0-9a-fA-F]{6}$/.test(full) ? full.toLowerCase() : null;
}

/**
 * Escurece `color` até ele alcançar 4.5:1 sobre `bg`, preservando a matiz.
 *
 * O padrão de "pill" do patrocinador pinta o fundo com a cor a 10% e o texto
 * com a cor cheia. Isso funciona nos tons escuros da paleta e falha em 9 das
 * 12 cores oferecidas: o amarelo (#eab308) fica em 1.79:1 sobre o próprio
 * fundo. Como a cor é dado do usuário, não há valor fixo a corrigir — o
 * ajuste tem de ser calculado.
 *
 * Escala os canais na direção do preto em passos pequenos: mantém a
 * identidade da marca (um pill vermelho continua vermelho) e só troca o brilho
 * pelo necessário.
 */
export function darkenToContrast(color?: string | null, bg = "#ffffff", target = 4.5): string {
  const fg = normalizeHex(color);
  const back = normalizeHex(bg);
  if (!fg || !back) return "#1c1917";

  const lb = luminance(back);
  const ratio = (l: number) => (Math.max(l, lb) + 0.05) / (Math.min(l, lb) + 0.05);
  if (ratio(luminance(fg)) >= target) return fg;

  const rgb = [1, 3, 5].map(i => parseInt(fg.substr(i, 2), 16));
  for (let k = 95; k >= 0; k -= 5) {
    const escala = rgb.map(c => Math.round((c * k) / 100));
    const hex = `#${escala.map(c => c.toString(16).padStart(2, "0")).join("")}`;
    if (ratio(luminance(hex)) >= target) return hex;
  }
  return "#1c1917";
}

/**
 * Escolhe entre texto claro e escuro para ficar legível sobre `bg`.
 *
 * A cor do patrocinador é escolhida por quem cadastra, então nenhuma auditoria
 * estática enxerga esse par. Medindo a paleta oferecida na tela de
 * patrocinadores, o branco fixo que estava em uso reprova em 8 das 12 cores —
 * sobre o amarelo (#eab308) a inicial fica em 1.92:1, praticamente invisível.
 *
 * Compara o contraste real dos dois candidatos e devolve o melhor, em vez de
 * usar um limiar de luminância: o limiar erra justamente nos tons médios
 * (índigo, roxo), onde a diferença entre as opções é pequena.
 */
export function onColor(bg?: string | null): string {
  const hex = (bg ?? "").trim();
  const full = /^#[0-9a-fA-F]{3}$/.test(hex)
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  if (!/^#[0-9a-fA-F]{6}$/.test(full)) return "#ffffff";

  const channel = (i: number) => {
    const c = parseInt(full.substr(i, 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  const against = (l: number) =>
    (Math.max(lum, l) + 0.05) / (Math.min(lum, l) + 0.05);

  // Luminâncias de #ffffff e de T.dark (#1c1917).
  return against(1) >= against(0.0157) ? "#ffffff" : "#1c1917";
}

/** Elevação em três degraus, do rente ao flutuante. */
export const SHADOW = {
  sm: "0 1px 2px rgba(28,25,23,0.06)",
  md: "0 4px 12px -2px rgba(28,25,23,0.10)",
  lg: "0 16px 32px -12px rgba(28,25,23,0.18)",
} as const;
