// AS MARCAS DE UMA PEÇA PENDENTE na Gestão de Prazos (Pedro/dono, 26/10).
//
// Três coisas, na mesma linha, em toda lista de peça da tela (o drill do
// evento, a lista de peças atrasadas):
//   · os SELOS "Sem patrocínio" / "Arte cliente" / "Aguardando arte do
//     cliente" — o componente único da casa (`SelosSemAprovacao`);
//   · o PRAZO DE LAYOUT normal × ajustado ("Layout 10/11 → 17/11 (+7d)"), que
//     o payload já traz pronto em `item.prazoDeLayout` — o mesmo desenho do
//     `PrazoDeLayoutAjustado`, sem refazer a conta no navegador;
//   · "Atraso do cliente" (RN09) — a peça atrasada porque a arte do cliente
//     não chegou. O selo e a cor são os da casa (`SeloAtrasoDoCliente`,
//     `TOM_DO_ATRASO_DO_CLIENTE` — céu), os mesmos da Arte e das Análises.
//
// Não renderiza nada na peça sem marca.
import type { CSSProperties } from "react";
import { CalendarClock } from "lucide-react";
import { SelosSemAprovacao, SeloAtrasoDoCliente as SeloDaCasa, fraseDoPrazoAjustado } from "@/components/selo-sem-aprovacao";
import { FS, FW, T, TOM } from "@/lib/theme";
import type { PrazoPendingItem } from "@shared/prazos-contract";
import { fmtDayMonth } from "./tokens";
import { DICA_ATRASO_DO_CLIENTE } from "./sem-aprovacao";

const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(`${a.slice(0, 10)}T00:00:00Z`) - Date.parse(`${b.slice(0, 10)}T00:00:00Z`)) / 86_400_000);

/** "Layout 10/11 → 17/11 (+7d)" a partir do `prazoDeLayout` do payload. */
export function PrazoDeLayoutDaPeca({ it, style }: { it: Pick<PrazoPendingItem, "id" | "prazoDeLayout">; style?: CSSProperties }) {
  const pl = it.prazoDeLayout;
  if (!pl) return null;
  const dias = diasEntre(pl.ajustado, pl.normal);
  return (
    <span
      data-testid={`prazo-ajustado-${it.id}`}
      title={`Prazo de Layout normal ${fmtDayMonth(pl.normal)} × ajustado ${fmtDayMonth(pl.ajustado)}: a peça sem aprovação ganha a duração da Aprovação. A Finalização e o prazo final não mudam.`}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS.meta, color: T.second, whiteSpace: "nowrap", ...style }}
    >
      {/* O desenho é aria-hidden; o leitor de tela ouve a MESMA frase do
          `PrazoDeLayoutAjustado` (revisão 27/10). */}
      <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <CalendarClock style={{ width: 12, height: 12, color: TOM.turquesa.text, flexShrink: 0 }} />
        <span>Layout</span>
        <span style={{ textDecoration: "line-through", color: T.second }}>{fmtDayMonth(pl.normal)}</span>
        <span>→</span>
        <span style={{ fontWeight: FW.forte, color: T.text }}>{fmtDayMonth(pl.ajustado)}</span>
        {dias > 0 && <span style={{ color: T.second }}>(+{dias}d)</span>}
      </span>
      <span className="sr-only">{fraseDoPrazoAjustado(pl.normal, pl.ajustado, dias)}</span>
    </span>
  );
}

/** O selo "Atraso do cliente" (RN09) — só na peça que o tem. */
export function SeloAtrasoDoCliente({ it }: { it: Pick<PrazoPendingItem, "id" | "atrasoDoCliente"> }) {
  if (!it.atrasoDoCliente) return null;
  return <SeloDaCasa title={DICA_ATRASO_DO_CLIENTE} testId={`selo-atraso-do-cliente-${it.id}`} />;
}

/** Selos + prazo normal × ajustado + atraso do cliente, numa linha que quebra. */
export function MarcasDaPecaPendente({ it, style }: { it: PrazoPendingItem; style?: CSSProperties }) {
  const temMarca = !!it.semPatrocinio || !!it.arteDoCliente || !!it.atrasoDoCliente;
  if (!temMarca) return null;
  return (
    <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "3px 6px", marginTop: 3, ...style }}>
      <SelosSemAprovacao peca={it} />
      <SeloAtrasoDoCliente it={it} />
      <PrazoDeLayoutDaPeca it={it} />
    </span>
  );
}
