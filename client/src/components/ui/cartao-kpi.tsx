// ─────────────────────────────────────────────────────────────────────────────
// <CartaoKpi> — o número que resume, e que às vezes também filtra.
//
// API
//   <CartaoKpi
//     tom="neutro" | "info" | "sucesso" | "alerta" | "perigo" | "laranja"
//     valor={42} rotulo="Em produção" sub="3 atrasadas"
//     icone={Printer}
//     ativo={filtro === "producao"} onClick={() => alternar("producao")}
//     compacto
//   />
//
// CLICÁVEL É UM BOTÃO DE VERDADE. Quando vem `onClick`, o cartão renderiza
// <button aria-pressed> — não uma <div> com onClick. Os cartões do app são,
// na prática, a barra de filtros principal de várias telas: sem role e sem
// aria-pressed, quem usa teclado ou leitor de tela não alcança o filtro e não
// tem como saber qual está ligado. Sem `onClick` ele é uma <div> e não finge
// ser clicável.
//
// O ESTADO ATIVO NÃO É SÓ COR. Cartão ligado ganha borda na cor do tom E a
// faixa superior cheia E aria-pressed. Só o tom não basta: em oito cartões
// coloridos lado a lado, "um deles está um pouco mais forte" não se enxerga.
//
// `compacto` tira a faixa e encolhe o número — para fileiras de seis ou mais,
// onde o cartão grande vira uma parede.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { T, FS, R, FW, FONT, SHADOW, MOTION } from "@/lib/theme";
import { coresDoTom, type TomDoSelo } from "@/components/ui/selo";

export interface CartaoKpiProps {
  valor: React.ReactNode;
  rotulo: string;
  sub?: React.ReactNode;
  tom?: TomDoSelo;
  icone?: LucideIcon;
  ativo?: boolean;
  onClick?: () => void;
  compacto?: boolean;
  "data-testid"?: string;
}

export function CartaoKpi({
  valor, rotulo, sub, tom = "neutro", icone: Icone, ativo = false, onClick, compacto = false, ...resto
}: CartaoKpiProps) {
  const c = coresDoTom(tom);
  const clicavel = Boolean(onClick);

  const estilo: React.CSSProperties = {
    position: "relative", overflow: "hidden",
    display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
    padding: compacto ? "10px 12px" : "14px 16px",
    minWidth: 0, textAlign: "left",
    borderRadius: R.lg,
    backgroundColor: ativo ? c.bg : T.surface,
    border: `1px solid ${ativo ? c.border : T.border}`,
    boxShadow: ativo ? SHADOW.sm : "none",
    cursor: clicavel ? "pointer" : "default",
    transition: `background-color ${MOTION.rapida} ease, border-color ${MOTION.rapida} ease`,
  };

  const miolo = (
    <>
      {/* Faixa superior na cor do tom: a leitura do painel inteiro em um
          relance, antes de ler um número sequer. No neutro ela some — cartão
          sem notícia não precisa de tarja. */}
      {!compacto && tom !== "neutro" && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute", insetInline: 0, top: 0, height: ativo ? 4 : 3,
            backgroundColor: c.dot ?? c.text,
          }}
        />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
        {Icone && <Icone aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0, color: tom === "neutro" ? T.muted : c.text }} />}
        <span
          style={{
            fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.08em",
            textTransform: "uppercase", color: T.second,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {rotulo}
        </span>
      </div>
      <span
        style={{
          fontFamily: FONT.display,
          fontSize: compacto ? FS.h2 : FS.h1,
          fontWeight: FW.rotulo, lineHeight: 1.1, letterSpacing: "-0.04em",
          color: tom === "neutro" ? T.text : c.text,
        }}
      >
        {valor}
      </span>
      {sub && (
        <span style={{ fontSize: FS.small, lineHeight: 1.4, color: T.second }}>{sub}</span>
      )}
    </>
  );

  if (!clicavel) {
    return <div style={estilo} {...resto}>{miolo}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className="ds-botao"
      style={estilo}
      {...resto}
    >
      {miolo}
    </button>
  );
}
