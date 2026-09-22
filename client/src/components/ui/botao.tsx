// ─────────────────────────────────────────────────────────────────────────────
// <Botao> — o botão do NORTE.
//
// API
//   <Botao
//     variante="primario" | "secundario" | "fantasma" | "perigo"   (pd. secundario)
//     tamanho="sm" | "md" | "toque"                                (pd. md)
//     carregando                 // troca o ícone por spinner, desabilita, aria-busy
//     motivo="..."               // POR QUE está desabilitado — aparece VISÍVEL
//     icone={Plus}               // LucideIcon à esquerda do rótulo
//     larguraCheia
//     ...tudo que um <button> aceita (onClick, type, disabled, data-testid…)
//   >Rótulo</Botao>
//
// A ESCOLHA DA VARIANTE é pela função, não pelo peso visual:
//   primario   — a ação que a tela existe para fazer. UMA por bloco.
//   secundario — ação legítima que não é a principal (filtrar, exportar, voltar).
//   fantasma   — ação de apoio dentro de uma lista densa, onde uma borda por
//                linha viraria grade.
//   perigo     — a ação DESTRUTIVA e só ela. Cancelar não é perigo: cancelar
//                não apaga nada, e pintar de vermelho o botão de desistir
//                ensina a pessoa a ter medo do botão errado.
//
// POR QUE ESTE COMPONENTE EXISTE. O app tinha ~200 pares de
// onMouseEnter/onMouseLeave trocando `style.backgroundColor` na mão, cada um
// com a sua cor de hover, e NENHUM deles cobrindo foco por teclado — estilo
// inline não tem :hover nem :focus-visible. Aqui a cor continua inline (como o
// resto do app), e os estados moram na classe .ds-botao do index.css.
//
// O MOTIVO É OBRIGATÓRIO NA PRÁTICA. Botão apagado sem frase ao lado lê-se
// como sistema quebrado: a pessoa não sabe se falta permissão, se falta
// preencher algo, ou se o app travou. Passando `motivo`, a frase aparece
// abaixo do botão (via <MotivoBloqueio>) e vira o `aria-describedby` dele —
// não é `title`, que no celular não existe.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { T, FS, R, H, FW, FONT, TOM } from "@/lib/theme";
import { MotivoBloqueio } from "@/components/ui/motivo-bloqueio";

export type VarianteBotao = "primario" | "secundario" | "fantasma" | "perigo";
export type TamanhoBotao = "sm" | "md" | "toque";

const PELA_VARIANTE: Record<VarianteBotao, React.CSSProperties> = {
  primario: { backgroundColor: T.dark, color: "#ffffff", border: `1px solid ${T.dark}` },
  secundario: { backgroundColor: T.surface, color: T.strong, border: `1px solid ${T.border}` },
  fantasma: { backgroundColor: "transparent", color: T.apoio, border: "1px solid transparent" },
  // TOM.perigo.text (#b91c1c) como FUNDO, não o vermelho saturado: sobre ele o
  // texto branco dá 6,5:1. O #ef4444 da bolinha daria 3,4:1 — abaixo do piso.
  perigo: { backgroundColor: TOM.perigo.text, color: "#ffffff", border: `1px solid ${TOM.perigo.text}` },
};

const PELO_TAMANHO: Record<TamanhoBotao, React.CSSProperties> = {
  sm: { minHeight: H.sm, padding: "0 10px", fontSize: FS.meta, gap: 6 },
  md: { minHeight: H.md, padding: "0 14px", fontSize: FS.body, gap: 7 },
  // `toque` é o piso de 44px da casa — o dedo no galpão. O rótulo sobe junto:
  // alvo grande com letra de 12px parece um botão esticado, não um botão.
  toque: { minHeight: H.toque, padding: "0 18px", fontSize: FS.strong, gap: 8 },
};

export interface BotaoProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  carregando?: boolean;
  /** Por que está desabilitado. Vira texto visível + aria-describedby. */
  motivo?: React.ReactNode;
  icone?: LucideIcon;
  larguraCheia?: boolean;
  /** Alinhamento da frase do `motivo` — "end" para botão encostado à direita. */
  alinharMotivo?: "start" | "center" | "end";
}

export const Botao = React.forwardRef<HTMLButtonElement, BotaoProps>(function Botao(
  {
    variante = "secundario",
    tamanho = "md",
    carregando = false,
    motivo,
    icone: Icone,
    larguraCheia = false,
    alinharMotivo = "start",
    disabled,
    children,
    className,
    style,
    ...resto
  },
  ref,
) {
  const idMotivo = React.useId();
  // Carregando É desabilitado: sem isto, dois cliques rápidos mandam dois
  // pedidos — e no app isso já significou dois pedidos de peça iguais.
  const travado = Boolean(disabled) || carregando;
  const mostraMotivo = Boolean(motivo) && travado && !carregando;

  const botao = (
    <button
      ref={ref}
      type="button"
      disabled={travado}
      aria-busy={carregando || undefined}
      aria-describedby={mostraMotivo ? idMotivo : undefined}
      className={["ds-botao", variante === "fantasma" ? "ds-botao-fantasma" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        borderRadius: R.md,
        fontFamily: FONT.corpo,
        fontWeight: FW.forte,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
        cursor: travado ? "not-allowed" : "pointer",
        width: larguraCheia ? "100%" : undefined,
        ...PELO_TAMANHO[tamanho],
        ...PELA_VARIANTE[variante],
        ...style,
      }}
      {...resto}
    >
      {carregando ? (
        <Loader2 aria-hidden="true" className="animate-spin" style={{ width: 14, height: 14, flexShrink: 0 }} />
      ) : Icone ? (
        <Icone aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }} />
      ) : null}
      {children}
    </button>
  );

  if (!mostraMotivo) return botao;

  // Coluna, e não `title`: a frase precisa estar na tela para quem toca (não há
  // hover no celular) e para quem usa leitor de tela.
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "stretch", maxWidth: "100%" }}>
      {botao}
      <MotivoBloqueio id={idMotivo} alinhar={alinharMotivo}>{motivo}</MotivoBloqueio>
    </span>
  );
});
