// Design tokens compartilhados — paleta "Titanium/Stone" e escalas de
// tipografia, raio e elevação. Antes cada página redefinia um `const T = {...}`
// local; a tela da Arte chegava a 113 cores hardcoded, 19 raios de borda e 14
// tamanhos de fonte. Centralizar evita a divergência entre cópias.
export const T = {
  bg: "#f9f9f8",
  surface: "#ffffff",
  border: "#e8e8e7",
  bdark: "#d6d3d1",
  text: "#1a1c1c",
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
  second: "#746e69",
  /**
   * ATENÇÃO: apenas para elementos decorativos (ícones, separadores,
   * placeholders) — nunca para texto. Fica entre 2.29 e 2.52:1 sobre as
   * superfícies do app e reprova WCAG AA em todas elas. Para texto legível
   * use `T.second`.
   */
  muted: "#a8a29e",
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
  dark: "#1c1917",
  low: "#f3f4f3",
};

/**
 * Escala tipográfica. Os degraus existem para forçar hierarquia: quando um
 * texto não cabe em nenhum deles, o problema costuma ser a hierarquia, não a
 * escala. Nada abaixo de 10px — 8px não é legível nem dentro de badge.
 */
export const FS = {
  micro: 10,   // rótulo de badge, texto auxiliar em caixa alta
  small: 11,   // metadados, legendas
  body: 13,    // texto corrente da interface
  strong: 15,  // destaque dentro de um bloco
  title: 18,   // título de seção
  h2: 22,      // título de card/modal
  h1: 26,      // título de página
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
