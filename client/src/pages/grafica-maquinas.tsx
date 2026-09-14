// ─────────────────────────────────────────────────────────────────────────────
// MÁQUINAS DA GRÁFICA (dono, 14/09).
//
// "A Gráfica ter uma aba onde faz o controle de impressão por máquinas: ver
// quais máquinas estão imprimindo o quê, qual o histórico do que foi impresso
// naquela máquina naquele dia e tudo mais."
//
// Duas perguntas, na ordem em que o galpão faz:
//   1. AGORA — o que cada máquina está imprimindo, com o quanto já saiu e
//      desde quando. Máquina sem peça diz "Livre", com todas as letras.
//   2. O DIA — o que saiu de cada máquina num dia (hoje por padrão), lançamento
//      por lançamento: hora, peça, o que aconteceu, total e quem lançou.
//
// A tela se atualiza sozinha a cada minuto e ao voltar para a aba: é painel de
// parede do galpão tanto quanto consulta.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Printer, RotateCcw } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

type PecaNaMaquina = {
  id: string;
  displayId: string | null;
  tipo: string;
  descricao: string | null;
  evento: string | null;
  quantidade: number;
  aImprimir: number;
  impressas: number;
  desde: string | null;
};

type Registro = {
  id: string;
  itemId: string;
  displayId: string | null;
  tipoPeca: string;
  evento: string | null;
  tipo: "inicio" | "troca" | "parcial" | "conclusao";
  quantidade: number;
  totalDepois: number | null;
  aImprimir: number;
  hora: string;
  quem: string | null;
};

type Maquina = {
  codigo: string;
  rotulo: string;
  imprimindo: PecaNaMaquina[];
  registros: Registro[];
  unidadesNoDia: number;
  pecasNoDia: number;
};

type Retrato = { dia: string; hoje: string; maquinas: Maquina[]; semMaquina: PecaNaMaquina[] };

const COR = {
  texto: "#1c1917",
  sec: "#57534e",
  fraco: "#78716c",
  borda: "#e7e5e4",
  fundo: "#fafaf9",
  card: "#ffffff",
  laranja: "#c2410c",
  ativo: "#9a3412",
  ativoBg: "#fff7ed",
  ativoBorda: "#fed7aa",
  livre: "#15803d",
  livreBg: "#f0fdf4",
  livreBorda: "#bbf7d0",
};

const TITULO: React.CSSProperties = {
  margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, color: COR.texto, letterSpacing: "-0.02em",
};

function somarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function rotuloDoDia(dia: string, hoje: string): string {
  if (dia === hoje) return "Hoje";
  if (dia === somarDias(hoje, -1)) return "Ontem";
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
}

function haQuanto(iso: string | null): string | null {
  if (!iso) return null;
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(minutos)) return null;
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h${minutos % 60 ? ` ${minutos % 60}min` : ""}`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} dia${dias > 1 ? "s" : ""}`;
}

/** O que aconteceu naquele lançamento, em palavras do galpão. */
function oQueAconteceu(r: Registro): string {
  if (r.tipo === "inicio") return "Iniciou a impressão";
  if (r.tipo === "troca") return "Veio de outra máquina";
  if (r.quantidade < 0) return `${r.quantidade} un. (correção)`;
  return r.tipo === "conclusao" ? `+${r.quantidade} un. · concluiu` : `+${r.quantidade} un.`;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export default function GraficaMaquinas() {
  const isMobile = useIsMobile();
  // null = "hoje" segundo o servidor (o fuso da operação é dele, não do navegador).
  const [diaEscolhido, setDiaEscolhido] = useState<string | null>(null);

  const { data, isLoading, isError, isFetching, refetch } = useQuery<Retrato>({
    queryKey: [diaEscolhido ? `/api/grafica/maquinas?dia=${diaEscolhido}` : "/api/grafica/maquinas"],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  const hoje = data?.hoje ?? null;
  const dia = data?.dia ?? diaEscolhido;
  const ehHoje = !!hoje && dia === hoje;
  const totalImprimindo = data ? data.maquinas.reduce((s, m) => s + m.imprimindo.length, 0) : 0;
  const unidadesDoDia = data ? data.maquinas.reduce((s, m) => s + m.unidadesNoDia, 0) : 0;
  const irPara = (novo: string) => setDiaEscolhido(hoje && novo >= hoje ? null : novo);

  return (
    <div style={{ backgroundColor: COR.fundo, minHeight: "100%", padding: isMobile ? "12px 12px 48px" : "24px 24px 64px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Cabeçalho ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Link href="/grafica" data-testid="link-voltar-fila" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: COR.sec, textDecoration: "none", width: "fit-content" }}>
            <ArrowLeft aria-hidden="true" style={{ width: 13, height: 13 }} /> Fila da Gráfica
          </Link>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h1 style={{ ...TITULO, fontSize: isMobile ? 21 : 26, display: "flex", alignItems: "center", gap: 10 }}>
              <Printer aria-hidden="true" style={{ width: isMobile ? 18 : 22, height: isMobile ? 18 : 22, color: COR.laranja }} />
              Máquinas
            </h1>
            {data && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: COR.fraco }}>
                {isFetching && <RotateCcw aria-hidden="true" className="animate-spin" style={{ width: 11, height: 11 }} />}
                Atualiza sozinha a cada minuto
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: COR.sec, maxWidth: 680 }}>
            O que cada máquina está imprimindo agora e o que saiu de cada uma, dia a dia.
          </p>
        </div>

        {isLoading && <p style={{ fontSize: 13, color: COR.fraco }}>Carregando as máquinas…</p>}

        {isError && (
          <div data-testid="maquinas-erro" style={{ padding: "14px 16px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            Não foi possível carregar as máquinas. Confira a conexão e tente de novo.
            <button onClick={() => refetch()} style={{ border: "none", borderRadius: 8, background: "#b91c1c", color: "#fff", fontWeight: 700, fontSize: 12, padding: "8px 14px", cursor: "pointer" }}>
              Tentar novamente
            </button>
          </div>
        )}

        {data && (
          <>
            {/* ── 1 · AGORA ── */}
            <section aria-labelledby="titulo-agora" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <h2 id="titulo-agora" style={{ ...TITULO, fontSize: 17 }}>Agora</h2>
                <span style={{ fontSize: 12.5, color: COR.sec }}>
                  {totalImprimindo === 0 ? "nenhuma peça em impressão" : `${plural(totalImprimindo, "peça", "peças")} em impressão`}
                </span>
              </div>

              {data.semMaquina.length > 0 && (
                <div data-testid="sem-maquina" style={{ padding: "11px 14px", borderRadius: 10, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", fontSize: 12.5, lineHeight: 1.5, display: "flex", gap: 8 }}>
                  <AlertTriangle aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2 }} />
                  <span>
                    <strong>{plural(data.semMaquina.length, "peça está", "peças estão")} em impressão sem máquina anotada</strong> — foram
                    iniciadas antes do controle por máquina. Abra na fila e escolha a máquina:{" "}
                    {data.semMaquina.map((p, i) => (
                      <span key={p.id}>
                        {i > 0 && ", "}
                        <Link href={`/grafica?item=${p.id}`} style={{ color: "#92400e", fontWeight: 700 }}>{p.displayId ?? "peça"}</Link>
                      </span>
                    ))}
                  </span>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 240 : 260}px, 1fr))`, gap: 12 }}>
                {data.maquinas.map((m) => {
                  const ocupada = m.imprimindo.length > 0;
                  return (
                    <div key={m.codigo} data-testid={`maquina-agora-${m.codigo}`} style={{ background: COR.card, border: `1px solid ${COR.borda}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ ...TITULO, fontSize: 17 }}>{m.rotulo}</span>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap", color: ocupada ? COR.ativo : COR.livre, background: ocupada ? COR.ativoBg : COR.livreBg, border: `1px solid ${ocupada ? COR.ativoBorda : COR.livreBorda}` }}>
                          {ocupada ? `Imprimindo ${m.imprimindo.length}` : "Livre"}
                        </span>
                      </div>

                      {!ocupada && (
                        <p style={{ margin: 0, fontSize: 12.5, color: COR.fraco }}>Nenhuma peça nesta máquina.</p>
                      )}

                      {m.imprimindo.map((p) => {
                        const pct = p.aImprimir > 0 ? Math.min(100, Math.round((p.impressas / p.aImprimir) * 100)) : 0;
                        const desde = haQuanto(p.desde);
                        return (
                          <Link key={p.id} href={`/grafica?item=${p.id}`} data-testid={`peca-na-maquina-${p.id}`} style={{ display: "block", textDecoration: "none", borderTop: `1px solid ${COR.borda}`, paddingTop: 10 }}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, fontWeight: 700, color: COR.laranja, flexShrink: 0 }}>{p.displayId ?? "—"}</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: COR.texto, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.tipo}</span>
                            </div>
                            {(p.evento || p.descricao) && (
                              <div style={{ fontSize: 12, color: COR.sec, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {[p.evento, p.descricao].filter(Boolean).join(" · ")}
                              </div>
                            )}
                            <div aria-hidden="true" style={{ height: 6, borderRadius: 999, background: "#f5f5f4", marginTop: 8, overflow: "hidden" }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: COR.laranja, borderRadius: 999 }} />
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 5, fontSize: 11.5, color: COR.sec }}>
                              <span style={{ fontVariantNumeric: "tabular-nums" }}>{p.impressas} de {p.aImprimir} impressas</span>
                              {desde && <span style={{ color: COR.fraco }}>{desde}</span>}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ── 2 · O DIA ── */}
            <section aria-labelledby="titulo-dia" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <h2 id="titulo-dia" style={{ ...TITULO, fontSize: 17 }}>Histórico</h2>
                  <span style={{ fontSize: 12.5, color: COR.sec }}>
                    {unidadesDoDia === 0 ? "nada impresso neste dia" : `${plural(unidadesDoDia, "unidade impressa", "unidades impressas")} no total`}
                  </span>
                </div>

                {dia && hoje && (
                  <div role="group" aria-label="Escolher o dia" data-testid="navegar-dia" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button type="button" onClick={() => irPara(somarDias(dia, -1))} aria-label="Dia anterior" data-testid="dia-anterior" style={{ height: 34, width: 34, borderRadius: 8, border: `1px solid ${COR.borda}`, background: COR.card, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ChevronLeft aria-hidden="true" style={{ width: 15, height: 15 }} />
                    </button>
                    <span style={{ minWidth: 92, textAlign: "center", fontSize: 13, fontWeight: 700, color: COR.texto }}>{rotuloDoDia(dia, hoje)}</span>
                    <button type="button" onClick={() => irPara(somarDias(dia, 1))} disabled={ehHoje} aria-label="Próximo dia" data-testid="dia-seguinte" style={{ height: 34, width: 34, borderRadius: 8, border: `1px solid ${COR.borda}`, background: COR.card, cursor: ehHoje ? "not-allowed" : "pointer", opacity: ehHoje ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ChevronRight aria-hidden="true" style={{ width: 15, height: 15 }} />
                    </button>
                    <input
                      type="date"
                      value={dia}
                      max={hoje}
                      onChange={(e) => { if (e.target.value) irPara(e.target.value); }}
                      aria-label="Ir para uma data"
                      data-testid="escolher-data"
                      style={{ height: 34, borderRadius: 8, border: `1px solid ${COR.borda}`, background: COR.card, padding: "0 8px", fontSize: 12.5, color: COR.texto }}
                    />
                    {!ehHoje && (
                      <button type="button" onClick={() => setDiaEscolhido(null)} data-testid="dia-hoje" style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "none", background: COR.texto, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        Hoje
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {data.maquinas.map((m) => (
                  <div key={m.codigo} data-testid={`maquina-dia-${m.codigo}`} style={{ background: COR.card, border: `1px solid ${COR.borda}`, borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap", padding: "11px 14px", background: COR.fundo, borderBottom: m.registros.length ? `1px solid ${COR.borda}` : "none" }}>
                      <span style={{ ...TITULO, fontSize: 15 }}>{m.rotulo}</span>
                      <span style={{ fontSize: 12.5, color: COR.sec, fontVariantNumeric: "tabular-nums" }}>
                        {m.unidadesNoDia === 0 && m.registros.length === 0
                          ? "nada registrado"
                          : `${plural(m.unidadesNoDia, "un. impressa", "un. impressas")} · ${plural(m.pecasNoDia, "peça", "peças")}`}
                      </span>
                    </div>

                    {m.registros.length > 0 && (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 620 }}>
                          <thead>
                            <tr style={{ textAlign: "left", color: COR.fraco }}>
                              {["Hora", "Peça", "Evento", "O que", "Total", "Quem"].map((h) => (
                                <th key={h} scope="col" style={{ padding: "8px 14px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {m.registros.map((r) => (
                              <tr key={r.id} style={{ borderTop: `1px solid #f5f5f4` }}>
                                <td style={{ padding: "8px 14px", fontVariantNumeric: "tabular-nums", color: COR.sec, whiteSpace: "nowrap" }}>{r.hora}</td>
                                <td style={{ padding: "8px 14px", whiteSpace: "nowrap" }}>
                                  <Link href={`/grafica?item=${r.itemId}`} style={{ textDecoration: "none", color: COR.texto }}>
                                    <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, color: COR.laranja }}>{r.displayId ?? "—"}</span>{" "}
                                    {r.tipoPeca}
                                  </Link>
                                </td>
                                <td style={{ padding: "8px 14px", color: COR.sec, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.evento ?? "—"}</td>
                                <td style={{ padding: "8px 14px", whiteSpace: "nowrap", fontWeight: r.tipo === "parcial" || r.tipo === "conclusao" ? 700 : 500, color: r.tipo === "conclusao" ? COR.livre : COR.texto }}>{oQueAconteceu(r)}</td>
                                <td style={{ padding: "8px 14px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: COR.sec }}>
                                  {r.totalDepois == null ? "—" : `${r.totalDepois} de ${r.aImprimir}`}
                                </td>
                                <td style={{ padding: "8px 14px", color: COR.sec, whiteSpace: "nowrap" }}>{r.quem ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <p data-testid="nota-inicio-historico" style={{ margin: 0, fontSize: 11.5, color: COR.fraco }}>
                O histórico por máquina começa em 14/09/2026: antes disso a impressão não anotava em qual máquina a peça saiu.
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
