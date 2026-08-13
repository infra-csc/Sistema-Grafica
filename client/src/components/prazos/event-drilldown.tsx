// Drill-down de um evento: quais peças estão travadas, em que etapa, há
// quanto tempo e — na Aprovação — com QUEM está a bola.
import { useMemo } from "react";
import { Link } from "wouter";
import { getStatusLabel } from "@/lib/status";
import type { CobrancaEntry, PrazoEvent, PrazoPendingItem } from "@shared/prazos-contract";
import { CobradoControl } from "./cobrado-control";
import {
  DRILL_TH, dayColor, diasTexto, fmtDayMonth, pecasTexto, R, STAGE_SECTOR,
  STAGE_STYLE, TI,
} from "./tokens";

const ROW_CAP = 15;

export function EventDrilldown({ ev, cobranca, today, showCobranca = true }: {
  ev: PrazoEvent;
  cobranca?: CobrancaEntry;
  today?: string;
  /** O modal desliga: lá a cobrança é a ação primária do RODAPÉ. */
  showCobranca?: boolean;
}) {
  // Agrupa as peças pendentes por etapa; só etapas com peça travada NELA.
  const { groups, seguintes } = useMemo(() => {
    const byStage = new Map<number, PrazoPendingItem[]>();
    for (const it of ev.pendingItems) {
      const arr = byStage.get(it.stageIndex);
      if (arr) arr.push(it); else byStage.set(it.stageIndex, [it]);
    }
    const grupos = ev.stages
      .map((stage, i) => ({ stage, items: byStage.get(i) ?? [] }))
      .filter((g) => g.items.length > 0);

    // As etapas SEGUINTES sumiam por completo. O gate é a pendência
    // ACUMULADA: as mesmas peças que travam a Lista também travam a Revisão
    // logo adiante — só que sem peça própria a etapa não virava grupo e o
    // diretor cobrava a etapa vencida para ser surpreendido pela seguinte 48h
    // depois. Aqui elas voltam como uma linha cada, sem inflar a tabela.
    const adiante = ev.stages
      .map((stage, i) => ({ stage, i }))
      .filter(({ stage, i }) =>
        stage.state !== "done" && stage.pendingCount > 0 && (byStage.get(i)?.length ?? 0) === 0);

    return { groups: grupos, seguintes: adiante };
  }, [ev]);

  const blocoCobranca = showCobranca ? (
    // ANTES dos early returns de propósito: o evento sem nenhuma peça — o pior
    // caso do negócio — era justamente o ÚNICO em que não dava para registrar
    // cobrança. O diretor lia "Nenhuma peça cadastrada", ligava para o
    // responsável, cobrava de verdade, e não tinha onde marcar.
    <div className="gp-no-print" style={{ display: "flex", justifyContent: "flex-end" }}>
      <CobradoControl targetType="event" targetId={ev.id} cobranca={cobranca} today={today} />
    </div>
  ) : null;

  if (ev.categoria === "semPecas" || ev.totalItems === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "4px 0 8px" }}>
        {blocoCobranca}
        <p style={{ margin: 0, fontSize: 13, color: TI.secondary }}>
          Nenhuma peça cadastrada ainda —{" "}
          <Link href={`/eventos/${ev.id}`} style={{ color: TI.accentText, fontWeight: 600 }}>
            cadastre as peças no evento
          </Link>{" "}
          para o funil começar a contar.
        </p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "4px 0 8px" }}>
        {blocoCobranca}
        <p style={{ margin: 0, fontSize: 13, color: TI.secondary }}>
          Nenhuma peça pendente — todas entregues ou fora do funil.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "4px 0 8px" }}>
      {blocoCobranca}
      {groups.map(({ stage, items }) => {
        const sector = STAGE_SECTOR[stage.key];
        const st = STAGE_STYLE[stage.state];
        // Pior primeiro: a lista é de cobrança, quem espera há mais tempo abre.
        const sorted = [...items].sort((a, b) => b.waitingDays - a.waitingDays);
        const shown = sorted.slice(0, ROW_CAP);
        const hidden = sorted.length - shown.length;
        const sectorUrl = sector?.url ?? `/eventos/${ev.id}`;
        const isAprovacao = stage.key === "aprovacao";
        return (
          <div key={stage.key}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: R.pill, backgroundColor: st.dot, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: TI.title }}>
                {stage.label}
              </span>
              <span style={{ fontSize: 12, color: stage.state === "overdue" ? TI.red : TI.secondary, fontWeight: stage.state === "overdue" ? 700 : 500 }}>
                {/* "peças" por extenso ao lado de "5d" abreviado era a mesma
                    unidade escrita de duas formas na mesma linha. */}
                {pecasTexto(items.length)}
                {ev.invalidDate
                  ? " · sem data confiável"
                  : stage.state === "overdue" ? ` · vencida há ${diasTexto(Math.abs(stage.diffDays))}`
                  : stage.state === "warning" ? (stage.diffDays === 0 ? " · vence hoje" : ` · vence em ${diasTexto(stage.diffDays)}`)
                  : ` · vence em ${fmtDayMonth(stage.deadline)}`}
              </span>
              {/* Links de navegação recuados para peso 600 e cor secundária: a
                  cobrança é a ação primária, e antes seis caminhos disputavam
                  o mesmo laranja no mesmo peso. */}
              <Link
                href={sectorUrl}
                style={{ fontSize: 12, fontWeight: 600, color: TI.secondary, textDecoration: "none" }}
                data-testid={`link-setor-${ev.id}-${stage.key}`}
              >
                Resolver em {sector?.sector ?? stage.label} →
              </Link>
            </div>
            <div style={{ overflowX: "auto", border: `1px solid ${TI.border}`, borderRadius: R.md, backgroundColor: TI.card }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isAprovacao ? 560 : 420 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${TI.border}` }}>
                    <th scope="col" style={DRILL_TH}>Peça</th>
                    <th scope="col" style={{ ...DRILL_TH, textAlign: "left" }}>Descrição</th>
                    <th scope="col" style={DRILL_TH}>Qtd</th>
                    <th scope="col" style={DRILL_TH} title="Dias desde a última alteração da peça — qualquer edição atualiza este relógio">
                      Sem movimento
                    </th>
                    {isAprovacao && <th scope="col" style={{ ...DRILL_TH, textAlign: "left" }}>Aprovação com quem</th>}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((it) => (
                    <tr key={it.id} style={{ borderBottom: `1px solid ${TI.track}` }}>
                      <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                        <Link
                          href={`/eventos/${ev.id}?item=${it.id}`}
                          title={`Abrir ${it.displayId} no evento`}
                          style={{ fontSize: 12, fontWeight: 700, color: TI.accentText, textDecoration: "none" }}
                        >
                          {it.displayId}
                        </Link>
                        <span style={{ display: "block", fontSize: 10, color: TI.label }}>
                          {getStatusLabel(it.status)}
                        </span>
                      </td>
                      <td style={{ padding: "6px 10px", fontSize: 12, color: TI.strong, maxWidth: 240 }}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.description ?? it.type}>
                          {it.type}{it.description ? ` — ${it.description}` : ""}
                        </span>
                      </td>
                      <td style={{ padding: "6px 10px", fontSize: 12, color: TI.strong, textAlign: "center" }}>
                        {it.quantity}
                      </td>
                      <td style={{
                        padding: "6px 10px", textAlign: "center", whiteSpace: "nowrap",
                        fontSize: 12, fontWeight: 700,
                        color: dayColor(it.waitingDays),
                      }}>
                        {it.waitingDays === 0 ? "hoje" : `${it.waitingDays}d`}
                      </td>
                      {isAprovacao && (
                        <td style={{ padding: "6px 10px", fontSize: 12, color: TI.strong }}>
                          {it.sponsors && it.sponsors.length > 0
                            ? it.sponsors.map((s, i) => (
                                <span key={`${it.id}-${s.name}-${i}`} style={{ whiteSpace: "nowrap" }}>
                                  {i > 0 && ", "}
                                  {s.holder === "sponsor" ? (
                                    <>
                                      <strong style={{ color: s.days >= 7 ? TI.red : TI.title }}>{s.name}</strong>
                                      <span style={{ color: dayColor(s.days) }}> ({s.days === 0 ? "hoje" : `${s.days}d`})</span>
                                    </>
                                  ) : (
                                    <span style={{ color: TI.label }} title={`${s.name} devolveu — a Arte precisa reenviar antes de nova aprovação`}>
                                      {s.name} — com a Arte
                                    </span>
                                  )}
                                </span>
                              ))
                            : <span style={{ color: TI.label }} title="Aprovações ainda não inicializadas para esta peça">—</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hidden > 0 && (
              <Link
                href={`/eventos/${ev.id}`}
                style={{ display: "inline-block", marginTop: 6, fontSize: 11, fontWeight: 600, color: TI.secondary, textDecoration: "none" }}
              >
                +{hidden} peça{hidden !== 1 ? "s" : ""} nesta etapa — ver todas no evento →
              </Link>
            )}
          </div>
        );
      })}

      {seguintes.length > 0 && (
        <div style={{
          borderTop: `1px solid ${TI.border}`, paddingTop: 10,
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          {seguintes.map(({ stage }) => (
            <span key={stage.key} style={{ fontSize: 12, color: stage.state === "overdue" ? TI.red : TI.secondary }}>
              As {pecasTexto(stage.pendingCount)} acima também travam <strong style={{ fontWeight: 700 }}>{stage.label}</strong>
              {ev.invalidDate
                ? " (sem data confiável)"
                : stage.state === "overdue"
                ? ` (venceu há ${diasTexto(Math.abs(stage.diffDays))})`
                : ` (vence em ${fmtDayMonth(stage.deadline)})`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
