// ─────────────────────────────────────────────────────────────────────────────
// <CartaoKpi> — o número que resume, e que às vezes também filtra (ou leva).
//
// API
//   <CartaoKpi
//     tom="neutro" | "info" | "sucesso" | "alerta" | "perigo" | "laranja" | …
//     cores={{ bg, text, border, dot? }}   // cor livre (status.ts, etapa) — vence o tom
//     valor={42} rotulo="Em produção" sub="3 atrasadas"
//     icone={Printer}
//     ativo={filtro === "producao"} onClick={() => alternar("producao")}   // FILTRO
//     href="/grafica?etapa=conferir"            // NAVEGAÇÃO por link (<a>)
//     navegacao onClick={() => navegar(…)}      // NAVEGAÇÃO por botão, sem aria-pressed
//     variante="cartao" | "celula"              // célula: sem moldura, dentro de <FaixaDeKpis>
//     tendencia={{ valor: "+12%", direcao: "sobe", bom: "sobe" }}
//     acaoSecundaria={<Botao …>inclui 3 rascunhos</Botao>}   // rodapé, FORA do botão
//     ariaLabel="Em produção: 42 peças" title="…"
//     compacto
//   />
//
// OS TRÊS PAPÉIS, e o elemento de cada um:
//   · FILTRO (onClick): <button aria-pressed>. Os cartões são a barra de
//     filtros de várias telas; sem role e sem aria-pressed quem usa teclado ou
//     leitor de tela não alcança o filtro nem sabe qual está ligado.
//   · NAVEGAÇÃO (href, ou `navegacao` + onClick): leva a OUTRA tela. Não é
//     liga/desliga, então NÃO tem aria-pressed — anunciar "pressionado" num
//     atalho de tela é mentir sobre o que o clique faz. Ganha a seta ›.
//   · MOSTRADOR (nenhum dos dois): <div>, e não finge ser clicável.
//
// O ESTADO ATIVO NÃO É SÓ COR. Cartão ligado ganha borda na cor do tom E a
// faixa superior cheia E aria-pressed. Só o tom não basta: em oito cartões
// coloridos lado a lado, "um deles está um pouco mais forte" não se enxerga.
//
// AÇÃO SECUNDÁRIA SEM BOTÃO DENTRO DE BOTÃO. Com `acaoSecundaria`, a moldura
// vira uma <div> com DOIS filhos irmãos: o botão principal (o número) e o
// rodapé com a ação. Botão dentro de botão é HTML inválido e o clique no de
// dentro disparava os dois — o Painel contornava isso na mão.
//
// `compacto` tira a faixa e encolhe o número — para fileiras de seis ou mais,
// onde o cartão grande vira uma parede. `variante="celula"` vai além: tira a
// moldura, e a <FaixaDeKpis> desenha os divisores entre as células.
//
// O RÓTULO NO CELULAR sobe de 10 para 12px e quebra linha em vez de cortar
// (classe .ds-kpi-rotulo no index.css). A Gráfica mantinha um cartão próprio no
// celular só por isso.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { Link } from "wouter";
import { ChevronRight, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { T, FS, R, FW, FONT, SHADOW, MOTION, TOM } from "@/lib/theme";
import { coresDoTom, type CoresDoSelo, type TomDoSelo } from "@/components/ui/selo";

export interface TendenciaDoKpi {
  /** O número da variação, já formatado ("+12%", "−3 peças"). */
  valor: React.ReactNode;
  direcao: "sobe" | "desce" | "estavel";
  /**
   * Para onde é BOM ir. Sem isto a seta fica neutra: "atrasadas subiu" é
   * notícia ruim, "entregues subiu" é boa — o componente não adivinha.
   */
  bom?: "sobe" | "desce";
  /** Texto para leitor de tela (pd. "Subiu", "Caiu", "Estável"). */
  rotulo?: string;
}

export interface CartaoKpiProps {
  valor: React.ReactNode;
  rotulo: string;
  sub?: React.ReactNode;
  tom?: TomDoSelo;
  /** Cor livre (de status.ts, de etapa). Quando vem, vence o `tom`. */
  cores?: CoresDoSelo;
  icone?: LucideIcon;
  ativo?: boolean;
  onClick?: () => void;
  /** Leva a outra tela: vira <a> (Link do wouter), sem aria-pressed. */
  href?: string;
  /** Com onClick: o clique NAVEGA (não filtra) — <button> sem aria-pressed. */
  navegacao?: boolean;
  compacto?: boolean;
  variante?: "cartao" | "celula";
  tendencia?: TendenciaDoKpi;
  /** Ação do rodapé (um <Botao> pequeno) — fica FORA do botão principal. */
  acaoSecundaria?: React.ReactNode;
  ariaLabel?: string;
  title?: string;
  "data-testid"?: string;
}

const SETA: Record<TendenciaDoKpi["direcao"], LucideIcon> = { sobe: TrendingUp, desce: TrendingDown, estavel: Minus };
const DITO: Record<TendenciaDoKpi["direcao"], string> = { sobe: "Subiu", desce: "Caiu", estavel: "Estável" };

function Tendencia({ t }: { t: TendenciaDoKpi }) {
  const Seta = SETA[t.direcao];
  // Verde/vermelho só quando se sabe o que é bom; senão, cinza legível.
  const cor = !t.bom || t.direcao === "estavel" ? T.second
    : t.direcao === t.bom ? TOM.sucesso.text : TOM.perigo.text;
  return (
    <span
      data-testid="kpi-tendencia"
      data-direcao={t.direcao}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS.meta, fontWeight: FW.forte, color: cor }}
    >
      <Seta aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0 }} />
      <span className="sr-only">{t.rotulo ?? DITO[t.direcao]}: </span>
      {t.valor}
    </span>
  );
}

export function CartaoKpi({
  valor, rotulo, sub, tom = "neutro", cores, icone: Icone, ativo = false, onClick, href,
  navegacao = false, compacto = false, variante = "cartao", tendencia, acaoSecundaria,
  ariaLabel, title, ...resto
}: CartaoKpiProps) {
  const c = cores ?? coresDoTom(tom);
  // "Sem notícia" = neutro e sem cor livre: número no texto da casa, sem faixa.
  const semTom = !cores && tom === "neutro";
  const celula = variante === "celula";
  const vaiParaOutraTela = Boolean(href) || (navegacao && Boolean(onClick));
  const clicavel = Boolean(onClick) || Boolean(href);
  // O resto (data-*, aria-* que a tela já passava) vai para o elemento
  // principal, como antes — só o testid ganha tratamento com a ação no rodapé.
  const { "data-testid": testId, ...outros } = resto as Record<string, unknown> & { "data-testid"?: string };

  const moldura: React.CSSProperties = celula
    ? {
        // A célula não tem borda nem raio: os divisores vêm da <FaixaDeKpis>,
        // pela sombra de 1px à direita e embaixo que ela recorta na ponta.
        position: "relative",
        minWidth: 0, textAlign: "left",
        backgroundColor: ativo ? c.bg : T.surface,
        boxShadow: `1px 0 0 ${T.border}, 0 1px 0 ${T.border}`,
        transition: `background-color ${MOTION.rapida} ease`,
      }
    : {
        position: "relative", overflow: "hidden",
        minWidth: 0, textAlign: "left",
        borderRadius: R.lg,
        backgroundColor: ativo ? c.bg : T.surface,
        border: `1px solid ${ativo ? c.border : T.border}`,
        boxShadow: ativo ? SHADOW.sm : "none",
        transition: `background-color ${MOTION.rapida} ease, border-color ${MOTION.rapida} ease`,
      };

  // O "corpo" do cartão: coluna com rótulo, número, sub e tendência.
  const corpo: React.CSSProperties = {
    display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
    padding: celula ? "12px 16px" : compacto ? "10px 12px" : "14px 16px",
    cursor: clicavel ? "pointer" : "default",
  };

  const faixa = !compacto && !celula && !semTom ? (
    // Faixa superior na cor do tom: a leitura do painel inteiro em um relance,
    // antes de ler um número sequer. No neutro ela some — cartão sem notícia
    // não precisa de tarja.
    <span
      aria-hidden="true"
      style={{
        position: "absolute", insetInline: 0, top: 0, height: ativo ? 4 : 3,
        backgroundColor: c.dot ?? c.text,
      }}
    />
  ) : null;

  const miolo = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
        {Icone && <Icone aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0, color: semTom ? T.muted : c.text }} />}
        <span
          className="ds-kpi-rotulo"
          style={{
            fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.08em",
            textTransform: "uppercase", color: T.second,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {rotulo}
        </span>
        {vaiParaOutraTela && (
          // A seta diz "isto leva a outro lugar" antes do clique — o filtro
          // não tem seta porque não sai da tela.
          <ChevronRight aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, marginLeft: "auto", color: T.muted }} />
        )}
      </div>
      <span
        style={{
          fontFamily: FONT.display,
          fontSize: compacto || celula ? FS.h2 : FS.h1,
          fontWeight: FW.rotulo, lineHeight: 1.1, letterSpacing: "-0.04em",
          color: semTom ? T.text : c.text,
        }}
      >
        {valor}
      </span>
      {sub && (
        <span style={{ fontSize: FS.small, lineHeight: 1.4, color: T.second }}>{sub}</span>
      )}
      {tendencia && <Tendencia t={tendencia} />}
    </>
  );

  const acessivel = {
    ...outros,
    ...(ariaLabel !== undefined ? { "aria-label": ariaLabel } : {}),
    ...(title !== undefined ? { title } : {}),
  };
  const classePrincipal = celula ? "ds-botao ds-kpi-principal" : "ds-botao";

  // O elemento principal: <a>, <button> ou <div>, conforme o papel.
  const principal = (estilo: React.CSSProperties, classe: string, comTestId: boolean, comFaixa: boolean) => {
    const tid = comTestId ? { "data-testid": testId } : {};
    const conteudo = <>{comFaixa && faixa}{miolo}</>;
    if (href) {
      return (
        <Link href={href} onClick={onClick} className={classe} style={{ ...estilo, color: "inherit", textDecoration: "none" }} {...acessivel} {...tid}>
          {conteudo}
        </Link>
      );
    }
    if (onClick) {
      return (
        <button
          type="button"
          onClick={onClick}
          // Navegação não é liga/desliga: sem aria-pressed.
          aria-pressed={navegacao ? undefined : ativo}
          className={classe}
          style={estilo}
          {...acessivel}
          {...tid}
        >
          {conteudo}
        </button>
      );
    }
    return <div style={estilo} {...acessivel} {...tid}>{conteudo}</div>;
  };

  if (!acaoSecundaria) {
    return principal({ ...moldura, ...corpo }, classePrincipal, true, true);
  }

  // Com ação no rodapé: a moldura é uma <div>, e o principal e a ação são
  // IRMÃOS dentro dela. O principal perde a própria moldura (a de fora já
  // desenha) e o anel de foco entra para dentro, para a moldura não o cortar.
  const semMoldura: React.CSSProperties = {
    ...corpo, width: "100%", margin: 0, border: "none", background: "transparent", font: "inherit",
  };
  return (
    <div
      data-testid={testId && clicavel ? `${testId}-moldura` : testId}
      style={{ ...moldura, display: "flex", flexDirection: "column" }}
    >
      {faixa}
      {principal(semMoldura, "ds-botao ds-kpi-principal", clicavel, false)}
      <div
        data-testid={testId ? `${testId}-acao` : undefined}
        style={{ padding: celula ? "0 16px 12px" : compacto ? "0 12px 10px" : "0 16px 14px", marginTop: -4 }}
      >
        {acaoSecundaria}
      </div>
    </div>
  );
}

/**
 * <FaixaDeKpis> — a fileira de células sem moldura, com divisores entre elas.
 *
 * Cada <CartaoKpi variante="celula"> desenha uma linha de 1px à direita e
 * embaixo (sombra, não borda: não mexe na medida). A faixa tem a moldura e o
 * `overflow: hidden` que recorta a linha que sobraria na última coluna e na
 * última fileira — então os divisores ficam certos em qualquer quebra, de 4
 * colunas no desktop a 2 no celular, sem a tela calcular quem é o último.
 */
export function FaixaDeKpis({
  children, minimo = 150, style, "data-testid": testId = "faixa-de-kpis", rotulo,
}: {
  children: React.ReactNode;
  /** Largura mínima de cada célula antes de quebrar (pd. 150px). */
  minimo?: number;
  style?: React.CSSProperties;
  "data-testid"?: string;
  /** aria-label do grupo ("Resumo da fila"). */
  rotulo?: string;
}) {
  return (
    <div
      role={rotulo ? "group" : undefined}
      aria-label={rotulo}
      data-testid={testId}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${minimo}px, 100%), 1fr))`,
        borderRadius: R.lg,
        border: `1px solid ${T.border}`,
        backgroundColor: T.surface,
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
