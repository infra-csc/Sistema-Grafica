// Faixa de análise: gargalo por setor, patrocinadores segurando aprovação e
// os prazos dos próximos dias úteis. Recolhida por padrão — o caminho
// principal da tela é evento → peça; a análise agregada é segundo passo.
//
// ESCOPO CARIMBADO (a mudança de comportamento deste bloco). Ele itera o
// conjunto COMPLETO e fica ABAIXO do resultado filtrado — e tudo que está
// abaixo de um filtro é lido como filtrado. O diretor filtrava um evento, lia
// "Arte: 37 peças" e cobrava a Arte por 37 peças achando que eram daquele
// evento. A alternativa (recortar por `filtered`) daria número ERRADO:
// `sponsorDelays` vem agregado do servidor com `items` limitado a 20, então o
// recorte no cliente reintroduziria exatamente o defeito que se quer corrigir.
// Carimbar o escopo é o conserto honesto — e, em troca, o card de setor ganhou
// uma ação que FILTRA o quadro em vez de só mandar para outra tela.
import { Fragment, useState } from "react";
import { Link } from "wouter";
import { ChevronDown, CheckCircle2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CobrancaEntry, CobrancaMap, SponsorDelay } from "@shared/prazos-contract";
import { CobradoControl, CobrancaLinha } from "./cobrado-control";
import { dayColor, diasTexto, fmtDayMonth, pecasTexto, DRILL_TH, R, TI } from "./tokens";

/** Uma linha do resumo por setor, calculada na página. */
export interface SetorResumo {
  key: string;
  sector: string;
  stageLabel: string;
  url: string | null;
  count: number;
  avgDays: number;
  maxDays: number;
  producedCount: number;
  eventCount: number;
  isWorst: boolean;
}

interface AnaliseBandProps {
  totalEventos: number;
  setores: SetorResumo[];
  sponsorDelays: SponsorDelay[];
  /** Quantos EVENTOS estão parados em cada etapa (conta do quadro). */
  eventosPorEtapa: Map<string, number>;
  proximosDias: { dia: string; total: number }[];
  cobrancas: CobrancaMap;
  today?: string;
  etapaFoco: string;
  onEtapaFoco: (key: string) => void;
  diaFoco: string;
  onDiaFoco: (dia: string) => void;
}

export function AnaliseBand({
  totalEventos, setores, sponsorDelays, eventosPorEtapa, proximosDias,
  cobrancas, today, etapaFoco, onEtapaFoco, diaFoco, onDiaFoco,
}: AnaliseBandProps) {
  const isMobile = useIsMobile();
  const [aberta, setAberta] = useState(false);
  const [sponsorExpandido, setSponsorExpandido] = useState<string | null>(null);
  const [verTodosSponsors, setVerTodosSponsors] = useState(false);

  // O resumo recolhido deriva do MESMO `isWorst` que pinta os selos abertos.
  // Antes usava `.find()`: com dois setores empatados os DOIS cards ganhavam o
  // selo "MAIOR GARGALO" e o resumo nomeava só o primeiro da ordem das etapas
  // — recolhido e aberto contavam histórias diferentes sobre o mesmo dado.
  // (Com 3+ empatados a página já zera `isWorst`: dia distribuído não é
  // gargalo, e o destaque uniforme viraria alarme sem informação.)
  const gargalos = setores.filter((s) => s.isWorst);
  const resumoGargalo =
    gargalos.length === 0
      ? "· sem gargalo definido"
      : gargalos.length === 1
        ? `· gargalo: ${gargalos[0].sector} (${pecasTexto(gargalos[0].count)})`
        : `· gargalo empatado: ${gargalos.map((g) => g.sector).join(" e ")} (${pecasTexto(gargalos[0].count)} cada)`;
  const pico = proximosDias.reduce((m, d) => Math.max(m, d.total), 0);
  const escopo = `considerando todos os ${totalEventos} evento${totalEventos !== 1 ? "s" : ""} ativo${totalEventos !== 1 ? "s" : ""} — não segue os filtros acima`;
  /** Altura de alvo de toque dos controles inline deste bloco. */
  const alturaToggle = isMobile ? 44 : 36;
  const cobrancaSponsor = (id: string): CobrancaEntry | undefined => cobrancas[`sponsor:${id}`];

  return (
    <section aria-label="Análise por setor e patrocinador" style={{ marginTop: 22 }}>
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
        aria-controls={aberta ? "gp-diag" : undefined}
        data-testid="toggle-diagnostico"
        className="gp-no-print"
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          padding: "12px 16px", borderRadius: R.lg,
          border: `1px solid ${TI.border}`, backgroundColor: TI.card,
          fontSize: 13, fontWeight: 700, color: TI.title, cursor: "pointer",
          textAlign: "left", flexWrap: "wrap",
        }}
      >
        <ChevronDown aria-hidden="true" style={{
          width: 15, height: 15, color: TI.label, flexShrink: 0,
          transform: aberta ? "rotate(180deg)" : "none",
          transition: "transform 0.15s ease",
        }} />
        Análise por setor e patrocinador
        {!aberta && (
          <span style={{ fontSize: 12, fontWeight: 500, color: TI.secondary, marginLeft: 4, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {resumoGargalo}
            {/* Nome e dias em vez de "4 patrocinadores": "Coca-Cola há 11
                dias" gera uma ligação, um numeral não gera nada. */}
            {sponsorDelays.length > 0 && ` · pior aprovação: ${sponsorDelays[0].name} há ${diasTexto(sponsorDelays[0].maxDays)}`}
          </span>
        )}
        <span style={{ fontSize: 11, fontWeight: 500, color: TI.label, flexBasis: "100%" }}>
          {escopo}
        </span>
      </button>

      {aberta && (
        <div id="gp-diag" style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "3fr 2fr",
          gap: 14, marginTop: 12, alignItems: "start",
        }}>
          <section aria-label="Gargalo por setor">
            <h2 style={{
              margin: "0 0 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.1em", color: TI.label, fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
              Onde as peças estão paradas agora
            </h2>
            <div style={{
              display: "grid", gap: 10,
              // 180px (era 130): a linha de estatística quebrava em 2-3 linhas
              // dentro do card.
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}>
              {setores.map((s) => {
                const eventosAqui = eventosPorEtapa.get(s.key) ?? 0;
                return (
                  <div
                    key={s.key}
                    data-testid={`setor-${s.key}`}
                    style={{
                      backgroundColor: TI.card, borderRadius: R.lg, padding: "12px 14px", minWidth: 0,
                      border: s.isWorst ? `1.5px solid ${TI.redEdge}` : `1px solid ${TI.border}`,
                    }}
                  >
                    <span style={{ display: "block", fontSize: 12, fontWeight: 800, color: TI.title, fontFamily: "'Space Grotesk', sans-serif" }}>
                      {s.sector}
                    </span>
                    <span style={{ display: "block", fontSize: 10, color: TI.label, marginBottom: 8 }}>
                      {s.stageLabel}
                    </span>
                    <span style={{
                      fontSize: 24, fontWeight: 800, lineHeight: 1,
                      fontFamily: "'Space Grotesk', sans-serif",
                      color: s.count === 0 ? TI.label : s.isWorst ? TI.red : TI.title,
                    }}>
                      {s.count}
                    </span>
                    <span style={{ fontSize: 11, color: TI.secondary, marginLeft: 5 }}>
                      peça{s.count !== 1 ? "s" : ""}
                    </span>
                    {s.count > 0 ? (
                      <span
                        // A frase longa vive no `title`; a linha visível é
                        // telegráfica porque "parada há 4d em média · pior 11d"
                        // quebrava em 2-3 linhas dentro do card e empurrava o
                        // botão de ação para fora do primeiro olhar.
                        // `eventCount` entra AQUI e não como número visível: o
                        // card já mostra peças e o botão abaixo já mostra
                        // eventos — um terceiro numeral confundiria as duas
                        // contagens, que não são a mesma.
                        title={`Dias desde a última alteração de cada peça — ${s.count} peça${s.count !== 1 ? "s" : ""} de ${s.eventCount} evento${s.eventCount !== 1 ? "s" : ""}`}
                        // Neutro de propósito: vermelho aqui competia com os
                        // alarmes reais — o alarme deste bloco é o selo de gargalo.
                        style={{ display: "block", fontSize: 11, color: TI.secondary, marginTop: 4 }}
                      >
                        parada: média {s.avgDays}d · pior {s.maxDays}d
                      </span>
                    ) : (
                      <span style={{ display: "block", fontSize: 11, color: TI.label, marginTop: 4 }}>
                        mesa limpa
                      </span>
                    )}
                    {s.isWorst && (
                      <span style={{
                        display: "inline-block", marginTop: 6, padding: "1px 8px", borderRadius: R.pill,
                        backgroundColor: TI.redBg, color: TI.red, fontSize: 10, fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: "0.06em",
                      }}>
                        maior gargalo
                      </span>
                    )}
                    {s.producedCount > 0 && (
                      <span style={{ display: "block", fontSize: 11, color: TI.secondary, marginTop: 4 }}>
                        {s.producedCount} já produzida{s.producedCount !== 1 ? "s" : ""} — aguardando conferência/entrega
                      </span>
                    )}
                    {/* Fecha o laço diagnóstico→ação DENTRO da tela: descobrir
                        que o gargalo é a Arte passa a mostrar QUAIS eventos
                        cobrar. O número fala em EVENTOS porque o card acima
                        conta PEÇAS pelo dono real da bola, e as duas contas não
                        são a mesma — misturar seria criar outro número que se
                        contradiz. */}
                    {eventosAqui > 0 && (
                      <button
                        type="button"
                        onClick={() => onEtapaFoco(s.key)}
                        aria-pressed={etapaFoco === s.key}
                        data-testid={`filtrar-etapa-${s.key}`}
                        className="gp-no-print"
                        style={{
                          display: "block", marginTop: 8, padding: "8px 10px", borderRadius: R.md,
                          minHeight: isMobile ? 44 : 36,
                          border: etapaFoco === s.key ? `1.5px solid ${TI.accentText}` : `1px solid ${TI.border}`,
                          backgroundColor: TI.card, color: TI.title,
                          fontSize: 11, fontWeight: 700, cursor: "pointer", width: "100%", textAlign: "left",
                        }}
                      >
                        Ver os {eventosAqui} evento{eventosAqui !== 1 ? "s" : ""} parados nesta etapa
                      </button>
                    )}
                    {s.count > 0 && (
                      <Link href={s.url ?? "/eventos"} style={{ display: "inline-block", marginTop: 6, fontSize: 11, fontWeight: 600, color: TI.secondary, textDecoration: "none" }}>
                        Abrir {s.url ? s.sector : "Eventos"} →
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section aria-label="Aprovações travadas por patrocinador">
            <h2 style={{
              margin: "0 0 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.1em", color: TI.label, fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
              Aprovações travadas por patrocinador
            </h2>
            {sponsorDelays.length === 0 ? (
              <div style={{
                backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: R.lg,
                padding: "16px 14px", display: "flex", alignItems: "center", gap: 8,
              }}>
                <CheckCircle2 aria-hidden="true" style={{ width: 16, height: 16, color: TI.green, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: TI.secondary }}>
                  Nenhum patrocinador segurando aprovação.
                </span>
              </div>
            ) : (
              <div style={{ overflowX: "auto", backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: R.lg }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 440 }}>
                  <caption className="sr-only">Patrocinadores com aprovações pendentes, pior primeiro</caption>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${TI.border}` }}>
                      <th scope="col" style={{ ...DRILL_TH, textAlign: "left", paddingLeft: 14 }}>Patrocinador</th>
                      <th scope="col" style={DRILL_TH}>Peças</th>
                      <th scope="col" style={DRILL_TH}>Pior espera</th>
                      <th scope="col" style={DRILL_TH}><span className="sr-only">Ações</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(verTodosSponsors ? sponsorDelays : sponsorDelays.slice(0, 5)).map((sp) => {
                      const expandido = sponsorExpandido === sp.sponsorId;
                      const cobranca = cobrancaSponsor(sp.sponsorId);
                      return (
                        <Fragment key={sp.sponsorId}>
                          <tr style={{ borderBottom: expandido ? "none" : `1px solid ${TI.rule}` }}>
                            <th scope="row" style={{
                              padding: "8px 6px 8px 14px", fontSize: 13, fontWeight: 700,
                              color: TI.title, textAlign: "left",
                            }}>
                              <button
                                type="button"
                                onClick={() => setSponsorExpandido(expandido ? null : sp.sponsorId)}
                                aria-expanded={expandido}
                                aria-controls={expandido ? `sp-drill-${sp.sponsorId}` : undefined}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 6,
                                  background: "none", border: "none", padding: "6px 0",
                                  // Alvo de toque real (36/44) SEM inflar a
                                  // linha da tabela: a margem negativa devolve
                                  // ao fluxo a altura que o `minHeight` tomou
                                  // além do texto (~18px). Mesmo padrão do
                                  // `FilterChip`. Sem ela, cada linha do
                                  // ranking crescia 26px no mobile e o bloco
                                  // deixava de caber na dobra.
                                  minHeight: alturaToggle,
                                  margin: `${-(alturaToggle - 18) / 2}px 0`,
                                  fontSize: 13, fontWeight: 700, color: TI.title, cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                <ChevronDown aria-hidden="true" style={{
                                  width: 13, height: 13, color: TI.label, flexShrink: 0,
                                  transform: expandido ? "rotate(180deg)" : "none",
                                  transition: "transform 0.15s ease",
                                }} />
                                {sp.name}
                              </button>
                              <span style={{ display: "block", fontSize: 10, color: TI.label, marginLeft: 19, fontWeight: 500 }}>
                                {sp.eventCount} evento{sp.eventCount !== 1 ? "s" : ""}
                                {/* A tela nomeava setores e nunca pessoas — e é
                                    a uma pessoa que o diretor liga. */}
                                {sp.executivoConta && ` · conta: ${sp.executivoConta}`}
                              </span>
                              {cobranca && (
                                <span style={{ display: "block", marginLeft: 19 }}>
                                  <CobrancaLinha cobranca={cobranca} fontSize={10} />
                                </span>
                              )}
                            </th>
                            <td style={{
                              padding: "8px 6px", textAlign: "center", fontSize: 13, fontWeight: 800,
                              fontFamily: "'Space Grotesk', sans-serif",
                              color: sp.maxDays >= 7 ? TI.red : TI.title,
                            }}>
                              {sp.pendingCount}
                            </td>
                            <td style={{
                              padding: "8px 6px", textAlign: "center", fontSize: 12, fontWeight: 700,
                              color: dayColor(sp.maxDays),
                            }}>
                              {sp.maxDays === 0 ? "hoje" : `${sp.maxDays}d`}
                            </td>
                            <td style={{ padding: "8px 14px 8px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                              <Link
                                href={`/atendimento?patrocinador=${sp.sponsorId}`}
                                aria-label={`Cobrar ${sp.name} no Atendimento`}
                                // Mesmo alvo de toque do toggle ao lado: era um
                                // link de 11px com ~15px de altura renderizado
                                // no mobile.
                                style={{
                                  display: "inline-flex", alignItems: "center", justifyContent: "flex-end",
                                  minHeight: alturaToggle, minWidth: 64,
                                  fontSize: 11, fontWeight: 600, color: TI.secondary, textDecoration: "none",
                                }}
                              >
                                Cobrar →
                              </Link>
                            </td>
                          </tr>
                          {expandido && (
                            <tr style={{ borderBottom: `1px solid ${TI.rule}`, backgroundColor: TI.sunken }}>
                              <td id={`sp-drill-${sp.sponsorId}`} colSpan={4} style={{ padding: "6px 14px 12px" }}>
                                <div className="gp-no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                                  <CobradoControl
                                    targetType="sponsor"
                                    targetId={sp.sponsorId}
                                    cobranca={cobranca}
                                    today={today}
                                    variant="secondary"
                                    showForm
                                    showHistorico
                                  />
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  {(sp.items ?? []).map((it) => (
                                    <Link
                                      key={it.itemId}
                                      href={`/eventos/${it.eventId}?item=${it.itemId}`}
                                      title={`${it.eventName} — abrir a peça`}
                                      style={{
                                        display: "inline-flex", alignItems: "center", gap: 5,
                                        padding: "3px 9px", borderRadius: R.pill,
                                        backgroundColor: TI.chipBg, border: `1px solid ${TI.border}`,
                                        fontSize: 11, fontWeight: 600, color: TI.strong,
                                        textDecoration: "none", lineHeight: 1.5,
                                      }}
                                    >
                                      {it.displayId}
                                      <span style={{ color: TI.secondary }}>{it.eventName}</span>
                                      <span style={{ fontWeight: 700, color: dayColor(it.days) }}>
                                        {it.days === 0 ? "hoje" : `${it.days}d`}
                                      </span>
                                    </Link>
                                  ))}
                                  {/* Teto de 20 vindo do servidor: a linha é
                                      lista de cobrança, não inventário. */}
                                  {sp.pendingCount > (sp.items ?? []).length && (
                                    <span style={{ fontSize: 11, color: TI.label, alignSelf: "center" }}>
                                      +{sp.pendingCount - (sp.items ?? []).length} no Atendimento
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
                {sponsorDelays.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setVerTodosSponsors((v) => !v)}
                    className="gp-no-print"
                    style={{
                      display: "block", width: "100%", padding: "10px 0",
                      background: "none", border: "none", borderTop: `1px solid ${TI.rule}`,
                      fontSize: 12, fontWeight: 600, color: TI.secondary, cursor: "pointer",
                    }}
                  >
                    {verTodosSponsors ? "Mostrar só os 5 piores" : `Ver todos (${sponsorDelays.length})`}
                  </button>
                )}
              </div>
            )}
          </section>

          {/* A tela era ótima no passado e cega no futuro próximo: todos os
              `stage.deadline` já vinham no payload e ninguém os somava. É a
              passagem de "apagar incêndio" para "antecipar" — o gesto de
              segunda-feira que não existia. Flex puro, sem biblioteca. */}
          {proximosDias.length > 0 && (
            <section aria-label="Prazos que vencem nos próximos dias úteis" style={{ gridColumn: "1 / -1" }}>
              <h2 style={{
                margin: "0 0 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.1em", color: TI.label, fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}>
                Próximos dias úteis — prazos que vencem
              </h2>
              <div style={{
                display: "flex", alignItems: "flex-end", gap: 6,
                backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: R.lg,
                padding: "12px 14px", overflowX: "auto",
              }}>
                {proximosDias.map((d) => {
                  const altura = pico > 0 ? Math.round((d.total / pico) * 56) : 0;
                  const ativo = diaFoco === d.dia;
                  return (
                    <button
                      key={d.dia}
                      type="button"
                      onClick={() => onDiaFoco(ativo ? "" : d.dia)}
                      aria-pressed={ativo}
                      data-testid={`dia-${d.dia}`}
                      title={`${d.total} prazo${d.total !== 1 ? "s" : ""} vencendo em ${fmtDayMonth(d.dia)}`}
                      style={{
                        flex: "1 1 44px", minWidth: 44, display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "flex-end", gap: 4,
                        background: "none", border: "none", cursor: "pointer", padding: 0,
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700, color: d.total > 0 ? TI.title : TI.label }}>
                        {d.total}
                      </span>
                      <span aria-hidden="true" style={{
                        width: "100%", height: Math.max(altura, 3), borderRadius: R.sm,
                        backgroundColor: d.total === 0 ? TI.track : ativo ? TI.accentText : TI.strong,
                      }} />
                      <span style={{ fontSize: 10, color: ativo ? TI.accentText : TI.label, fontWeight: ativo ? 700 : 500, whiteSpace: "nowrap" }}>
                        {fmtDayMonth(d.dia)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </section>
  );
}
