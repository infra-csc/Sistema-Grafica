// ─────────────────────────────────────────────────────────────────────────────
// <Selo> — a marca curta: status, contagem, rótulo de estado.
//
// API
//   <Selo
//     tom="neutro" | "info" | "sucesso" | "alerta" | "perigo" | "laranja"
//     cores={{ bg, text, border, dot? }}   // sobrepõe o tom (status.ts manda)
//     forma="pilula" | "retangulo"         (pd. pilula)
//     tamanho="sm" | "md"                  (pd. md)
//     ponto                                // bolinha antes do rótulo
//     icone={Clock}                        // LucideIcon no lugar da bolinha
//     ...props de <span> (title, aria-*, data-testid, onClick…)
//   >Rótulo</Selo>
//
// `cores` existe porque o SIGNIFICADO das cores de peça mora em lib/status.ts,
// não aqui: o selo é a FORMA (raio, altura, espaçamento, peso), a fonte da cor
// é de quem sabe o que o status quer dizer. É o que permite <StatusPill> ser
// este componente com `cores={getStatusMeta(status)}` e nada mais.
//
// O `tom` serve ao resto — "3 atrasadas" em perigo, "novo" em info — onde não
// há status de peça envolvido.
//
// SOBRE O TAMANHO sm: 10px em caixa-alta. Continua sendo o menor texto do
// sistema e por isso a classe .status-pill-sm do index.css o sobe para 12px
// abaixo de 768px — no galpão, com o aparelho na mão, 10px some.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { FS, R, FW, TOM, ESCURO, type NomeDeTom } from "@/lib/theme";

export type TomDoSelo = NomeDeTom;

export interface CoresDoSelo {
  bg: string;
  text: string;
  border: string;
  dot?: string;
}

export interface SeloProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "color"> {
  tom?: TomDoSelo;
  cores?: CoresDoSelo;
  forma?: "pilula" | "retangulo";
  tamanho?: "sm" | "md";
  ponto?: boolean;
  icone?: LucideIcon;
}

export function coresDoTom(tom: TomDoSelo): CoresDoSelo {
  return TOM[tom];
}

/**
 * Selo sobre SUPERFÍCIE ESCURA (cabeçalho de modal `work`, barra de lote).
 * Translúcido com o texto claro do token: #fafaf9 sobre o realce fica acima
 * de 10:1. O selo claro comum ali vira um farol que rouba o título.
 */
export const CORES_SOBRE_ESCURO: CoresDoSelo = {
  bg: ESCURO.realceForte,
  text: ESCURO.texto,
  border: ESCURO.borda,
  dot: ESCURO.foco,
};

export const Selo = React.forwardRef<HTMLSpanElement, SeloProps>(function Selo(
  { tom = "neutro", cores, forma = "pilula", tamanho = "md", ponto = false, icone: Icone, children, className, style, ...resto },
  ref,
) {
  const c = cores ?? coresDoTom(tom);
  const sm = tamanho === "sm";

  return (
    <span
      ref={ref}
      className={[sm ? "status-pill-sm" : "", className ?? ""].filter(Boolean).join(" ") || undefined}
      style={{
        display: "inline-flex", alignItems: "center",
        gap: ponto || Icone ? 6 : 0,
        padding: "3px 10px",
        backgroundColor: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        borderRadius: forma === "pilula" ? R.pill : R.sm,
        fontSize: sm ? FS.micro : FS.small,
        fontWeight: sm ? FW.rotulo : FW.forte,
        ...(sm ? { textTransform: "uppercase" as const, letterSpacing: "0.05em" } : {}),
        whiteSpace: "nowrap",
        ...style,
      }}
      {...resto}
    >
      {Icone ? (
        <Icone aria-hidden="true" style={{ width: 11, height: 11, flexShrink: 0 }} />
      ) : ponto ? (
        <span
          aria-hidden="true"
          style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: c.dot ?? c.text, flexShrink: 0 }}
        />
      ) : null}
      {children}
    </span>
  );
});
