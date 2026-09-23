// ─────────────────────────────────────────────────────────────────────────────
// <Botao> — o botão do NORTE.
//
// API
//   <Botao
//     variante="primario" | "secundario" | "fantasma" | "perigo"   (pd. secundario)
//              | "secundarioForte"                  // borda n5, texto n10
//              | "perigoSecundario"                 // texto/borda vermelhos, fundo branco
//              | "claro" | "claroFantasma"          // SOBRE FUNDO ESCURO
//     tamanho="sm" | "md" | "toque"                                (pd. md)
//     tom="ciano"                // cor de ETAPA (primario/secundario/fantasma)
//     carregando                 // troca o ícone por spinner, desabilita, aria-busy
//     motivo="..."               // POR QUE está desabilitado — aparece VISÍVEL
//     icone={Plus} tamanhoDoIcone={16}   // LucideIcon à esquerda (pd. 14px)
//     larguraCheia
//     ...tudo que um <button> aceita (onClick, type, disabled, data-testid…)
//   >Rótulo</Botao>
//
//   <BotaoLink href="/eventos/1" variante tamanho tom icone …>Abrir</BotaoLink>
//     — o MESMO visual num <a> (Link do wouter; `externo` para <a href> cru).
//
// A ESCOLHA DA VARIANTE é pela função, não pelo peso visual:
//   primario   — a ação que a tela existe para fazer. UMA por bloco.
//   secundario — ação legítima que não é a principal (filtrar, exportar, voltar).
//   secundarioForte — o mesmo, com borda e texto mais fortes, para quando o
//                secundário comum some sobre o cartão (bloco denso, galpão).
//   fantasma   — ação de apoio dentro de uma lista densa, onde uma borda por
//                linha viraria grade.
//   perigo     — a ação DESTRUTIVA e só ela. Cancelar não é perigo: cancelar
//                não apaga nada, e pintar de vermelho o botão de desistir
//                ensina a pessoa a ter medo do botão errado.
//   perigoSecundario — destrutiva que NÃO é a ação do bloco (remover um item
//                da lista, "Excluir" ao lado de "Salvar"): avisa sem gritar.
//   claro / claroFantasma — para fundo ESCURO (cabeçalho de modal, barra
//                flutuante de lote). `claro` é o branco cheio (a principal
//                ali); `claroFantasma` é o translúcido (a de apoio).
//
// O `tom` é a cor da ETAPA (Conferir ciano, Entregar azul…) sem sobrescrever
// por `style`: no primário vira o FUNDO (o `text` do TOM — todos passam AA
// sob texto branco, o pior é 5,0:1), no secundário e no fantasma vira o texto.
// Nas variantes de perigo e nas claras ele é ignorado: ali a cor É o recado.
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
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { T, FS, R, H, FW, FONT, TOM, ESCURO, type NomeDeTom } from "@/lib/theme";
import { MotivoBloqueio } from "@/components/ui/motivo-bloqueio";

export type VarianteBotao =
  | "primario" | "secundario" | "secundarioForte" | "fantasma" | "perigo"
  | "perigoSecundario" | "claro" | "claroFantasma";
export type TamanhoBotao = "sm" | "md" | "toque";

const PELA_VARIANTE: Record<VarianteBotao, React.CSSProperties> = {
  primario: { backgroundColor: T.dark, color: "#ffffff", border: `1px solid ${T.dark}` },
  secundario: { backgroundColor: T.surface, color: T.strong, border: `1px solid ${T.border}` },
  // Borda n5 e texto n10: o secundário que precisa se destacar do cartão
  // branco onde mora (Máquinas, modal de impressão cravavam isto à mão).
  secundarioForte: { backgroundColor: T.surface, color: T.text, border: `1px solid ${T.bdark}` },
  fantasma: { backgroundColor: "transparent", color: T.apoio, border: "1px solid transparent" },
  // TOM.perigo.text (#b91c1c) como FUNDO, não o vermelho saturado: sobre ele o
  // texto branco dá 6,5:1. O #ef4444 da bolinha daria 3,4:1 — abaixo do piso.
  perigo: { backgroundColor: TOM.perigo.text, color: "#ffffff", border: `1px solid ${TOM.perigo.text}` },
  // #b91c1c sobre branco: 6,5:1. A borda é a clara do TOM, para o botão não
  // pesar tanto quanto o perigo cheio.
  perigoSecundario: { backgroundColor: T.surface, color: TOM.perigo.text, border: `1px solid ${TOM.perigo.border}` },
  // Branco cheio com o texto da casa: 17,5:1. É a principal sobre o escuro.
  claro: { backgroundColor: "#ffffff", color: T.text, border: "1px solid #ffffff" },
  // Translúcido: #fafaf9 sobre o realce fica acima de 10:1 nos dois escuros.
  claroFantasma: { backgroundColor: ESCURO.realce, color: ESCURO.texto, border: `1px solid ${ESCURO.borda}` },
};

const PELO_TAMANHO: Record<TamanhoBotao, React.CSSProperties> = {
  sm: { minHeight: H.sm, padding: "0 10px", fontSize: FS.meta, gap: 6 },
  md: { minHeight: H.md, padding: "0 14px", fontSize: FS.body, gap: 7 },
  // `toque` é o piso de 44px da casa — o dedo no galpão. O rótulo sobe junto:
  // alvo grande com letra de 12px parece um botão esticado, não um botão.
  toque: { minHeight: H.toque, padding: "0 18px", fontSize: FS.strong, gap: 8 },
};

// O hover de cada variante mora no index.css; aqui só o nome da classe.
const CLASSE_DA_VARIANTE: Partial<Record<VarianteBotao, string>> = {
  fantasma: "ds-botao-fantasma",
  perigoSecundario: "ds-botao-perigo-secundario",
  claro: "ds-botao-claro",
  claroFantasma: "ds-botao-claro-fantasma",
};

/** A cor da etapa por cima da variante. Devolve {} onde o tom não se aplica. */
function peloTom(variante: VarianteBotao, tom?: NomeDeTom): React.CSSProperties {
  if (!tom) return {};
  const c = TOM[tom];
  if (variante === "primario") return { backgroundColor: c.text, color: "#ffffff", border: `1px solid ${c.text}` };
  if (variante === "secundario" || variante === "secundarioForte") return { color: c.text, border: `1px solid ${c.border}` };
  if (variante === "fantasma") return { color: c.text };
  return {};
}

export interface VisualDoBotao {
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  /** Cor de etapa. Só vale em primario, secundario e fantasma. */
  tom?: NomeDeTom;
  larguraCheia?: boolean;
}

/**
 * O estilo e a classe do botão, fora do componente — é o que o <BotaoLink>
 * usa para ter o MESMO visual num <a> sem copiar tabela nenhuma.
 */
export function visualDoBotao(
  { variante = "secundario", tamanho = "md", tom, larguraCheia = false }: VisualDoBotao,
  travado = false,
): { className: string; style: React.CSSProperties } {
  return {
    className: ["ds-botao", CLASSE_DA_VARIANTE[variante] ?? ""].filter(Boolean).join(" "),
    style: {
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
      ...peloTom(variante, tom),
    },
  };
}

function IconeDoBotao({ carregando, Icone, tamanho }: { carregando: boolean; Icone?: LucideIcon; tamanho: number }) {
  const estilo = { width: tamanho, height: tamanho, flexShrink: 0 };
  if (carregando) return <Loader2 aria-hidden="true" className="animate-spin" style={estilo} />;
  return Icone ? <Icone aria-hidden="true" style={estilo} /> : null;
}

/** Coluna com a frase do motivo embaixo — nunca `title`: no toque não há hover. */
function ComMotivo({ children, id, motivo, alinhar }: {
  children: React.ReactNode; id: string; motivo: React.ReactNode; alinhar: "start" | "center" | "end";
}) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "stretch", maxWidth: "100%" }}>
      {children}
      <MotivoBloqueio id={id} alinhar={alinhar}>{motivo}</MotivoBloqueio>
    </span>
  );
}

export interface BotaoProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VisualDoBotao {
  carregando?: boolean;
  /** Por que está desabilitado. Vira texto visível + aria-describedby. */
  motivo?: React.ReactNode;
  icone?: LucideIcon;
  /** Lado do ícone em px (pd. 14). Botão só de ícone pede 16–18. */
  tamanhoDoIcone?: number;
  /** Alinhamento da frase do `motivo` — "end" para botão encostado à direita. */
  alinharMotivo?: "start" | "center" | "end";
}

export const Botao = React.forwardRef<HTMLButtonElement, BotaoProps>(function Botao(
  {
    variante = "secundario",
    tamanho = "md",
    tom,
    carregando = false,
    motivo,
    icone,
    tamanhoDoIcone = 14,
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
  const visual = visualDoBotao({ variante, tamanho, tom, larguraCheia }, travado);

  const botao = (
    <button
      ref={ref}
      type="button"
      disabled={travado}
      aria-busy={carregando || undefined}
      aria-describedby={mostraMotivo ? idMotivo : undefined}
      className={[visual.className, className ?? ""].filter(Boolean).join(" ")}
      style={{ ...visual.style, ...style }}
      {...resto}
    >
      <IconeDoBotao carregando={carregando} Icone={icone} tamanho={tamanhoDoIcone} />
      {children}
    </button>
  );

  if (!mostraMotivo) return botao;
  return <ComMotivo id={idMotivo} motivo={motivo} alinhar={alinharMotivo}>{botao}</ComMotivo>;
});

export interface BotaoLinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">, VisualDoBotao {
  href: string;
  /** <a href> cru em vez do Link do wouter — arquivo, outra aba, outro site. */
  externo?: boolean;
  /**
   * Link não tem `disabled`. Travado, ele perde o href (não navega nem pelo
   * teclado), ganha aria-disabled e mostra o `motivo` como o <Botao>.
   */
  desabilitado?: boolean;
  motivo?: React.ReactNode;
  icone?: LucideIcon;
  tamanhoDoIcone?: number;
  alinharMotivo?: "start" | "center" | "end";
}

/**
 * <BotaoLink> — o visual do <Botao> num link de verdade.
 *
 * As telas faziam isto de dois jeitos, os dois ruins: <Link><Botao/></Link>
 * (um <button> dentro de um <a>: dois alvos de Tab para a mesma ação, HTML
 * inválido) ou um <a> com o estilo copiado à mão (sem hover, sem foco). Aqui o
 * elemento é UM <a>, com a mesma classe .ds-botao — hover, foco e o piso de
 * 44px no toque vêm junto.
 */
export const BotaoLink = React.forwardRef<HTMLAnchorElement, BotaoLinkProps>(function BotaoLink(
  {
    href, externo = false, desabilitado = false, motivo,
    variante = "secundario", tamanho = "md", tom, larguraCheia = false,
    icone, tamanhoDoIcone = 14, alinharMotivo = "start",
    children, className, style, onClick, ...resto
  },
  ref,
) {
  const idMotivo = React.useId();
  const mostraMotivo = Boolean(motivo) && desabilitado;
  const visual = visualDoBotao({ variante, tamanho, tom, larguraCheia }, desabilitado);
  const comuns = {
    ...resto,
    className: [visual.className, className ?? ""].filter(Boolean).join(" "),
    style: { ...visual.style, ...style },
    "aria-describedby": mostraMotivo ? idMotivo : resto["aria-describedby"],
  };
  const miolo = (
    <>
      <IconeDoBotao carregando={false} Icone={icone} tamanho={tamanhoDoIcone} />
      {children}
    </>
  );

  let link: React.ReactElement;
  if (desabilitado) {
    // Sem href o <a> sai da ordem do Tab; tabIndex 0 o devolve, para quem usa
    // teclado chegar nele e OUVIR o motivo, como no botão desabilitado.
    link = (
      <a {...comuns} ref={ref} role="link" aria-disabled="true" tabIndex={0} onClick={(e) => e.preventDefault()}>
        {miolo}
      </a>
    );
  } else if (externo) {
    link = <a {...comuns} ref={ref} href={href} onClick={onClick}>{miolo}</a>;
  } else {
    link = <Link {...comuns} ref={ref} href={href} onClick={onClick}>{miolo}</Link>;
  }

  if (!mostraMotivo) return link;
  return <ComMotivo id={idMotivo} motivo={motivo} alinhar={alinharMotivo}>{link}</ComMotivo>;
});
