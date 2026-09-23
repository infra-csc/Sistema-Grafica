// ─────────────────────────────────────────────────────────────────────────────
// MÁQUINAS DA GRÁFICA — o resumo do período (relatório por dia × impressora)
// e a exportação para Excel.
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Download, Printer, RotateCcw } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/estados";
import { T, FS, FW, R } from "@/lib/theme";
import { GROTESK, IMP, INICIO_DO_DIARIO, MONO, PERIODOS, ROTULO_MICRO, TITULO, VERMELHO } from "./constantes";
import { AVISO_SERVIDOR_ANTIGO, diaBR, duracaoCurta, ehServidorNaVersaoAnterior, periodoBR, plural, rotuloDoDia } from "./regras";
import type { Periodo, Relatorio, ResumoDaMaquinaNoDia, ResumoDoDia } from "./tipos";

// ─── O resumo do período, por dia × impressora ────────────────────────────────
// O relatório diário da operação. Num dia só, uma tabela com as
// quatro impressoras e o total; em semana/mês/intervalo, um bloco por dia. Em
// tela estreita, cartões — os mesmos números, sem coluna cortada.
export function ResumoDoPeriodo({ dias, emCartoes, isMobile, hoje, onVerDiario }: {
  dias: ResumoDoDia[]; emCartoes: boolean; isMobile: boolean; hoje: string; onVerDiario: (dia: string, maquina: string) => void;
}) {
  const th: React.CSSProperties = { padding: "9px 12px", ...ROTULO_MICRO, whiteSpace: "nowrap", textAlign: "left" };
  const td: React.CSSProperties = { padding: "9px 12px", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", color: T.text };
  const num: React.CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap" };
  const semUso = (m: ResumoDaMaquinaNoDia) => !m.primeira;

  if (emCartoes) {
    return (
      <div data-testid="resumo-cartoes" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {dias.map((d) => (
          <div key={d.dia} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: GROTESK, fontWeight: FW.rotulo, fontSize: FS.body, color: T.text }}>{rotuloDoDia(d.dia, hoje)}</span>
              <span style={{ fontSize: isMobile ? 12 : FS.small, color: T.second, fontVariantNumeric: "tabular-nums" }}>
                {plural(d.total.unidades, "un. impressa", "un. impressas")} · {plural(d.total.pecas, "peça", "peças")} · {plural(d.total.concluidas, "concluída", "concluídas")}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 8 }}>
              {d.maquinas.map((m) => (
                <button
                  key={m.maquina}
                  type="button"
                  className="mq-acao"
                  onClick={() => onVerDiario(d.dia, m.maquina)}
                  data-testid={`resumo-${d.dia}-${m.maquina}`}
                  title={`Ver o diário da ${m.rotulo} em ${diaBR(d.dia)}`}
                  style={{ textAlign: "left", background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4, cursor: "pointer", minHeight: 44, color: T.text, opacity: semUso(m) ? 0.7 : 1 }}
                >
                  <span style={{ fontWeight: FW.forte, fontSize: FS.body, overflowWrap: "anywhere" }}>{m.rotulo}</span>
                  {semUso(m) ? (
                    <span style={{ fontSize: isMobile ? 12 : FS.small, color: T.second }}>Sem atividade</span>
                  ) : (
                    <>
                      <span style={{ fontSize: isMobile ? 12 : FS.small, color: T.second, fontVariantNumeric: "tabular-nums" }}>
                        <strong style={{ color: IMP.text }}>{m.unidades} un.</strong> · {plural(m.pecas, "peça", "peças")} · {m.concluidas} concl. · {m.aindaNaMaquina} na máquina
                      </span>
                      <span style={{ fontSize: isMobile ? 12 : FS.small, color: T.second, fontVariantNumeric: "tabular-nums" }}>
                        {m.primeira} → {m.ultima} · {duracaoCurta(m.minutosAtivos)}{m.quem.length ? ` · ${m.quem.join(", ")}` : ""}
                      </span>
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table data-testid="resumo-tabela" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr style={{ color: T.second, background: T.bg }}>
            {dias.length > 1 && <th scope="col" style={th}>Dia</th>}
            <th scope="col" style={th}>Impressora</th>
            <th scope="col" style={{ ...th, textAlign: "right" }}>Unidades</th>
            <th scope="col" style={{ ...th, textAlign: "right" }}>Peças</th>
            <th scope="col" style={{ ...th, textAlign: "right" }}>Concluídas</th>
            <th scope="col" style={{ ...th, textAlign: "right" }}>Na máquina</th>
            <th scope="col" style={th}>Atividade</th>
            <th scope="col" style={{ ...th, textAlign: "right" }}>Tempo ativo</th>
            <th scope="col" style={th}>Quem</th>
          </tr>
        </thead>
        <tbody>
          {dias.map((d) => (
            <Fragment key={d.dia}>
              {d.maquinas.map((m, i) => (
                <tr key={`${d.dia}-${m.maquina}`} className="mq-linha" data-testid={`resumo-${d.dia}-${m.maquina}`} style={{ borderTop: `1px solid ${T.low}`, color: semUso(m) ? T.second : T.text }}>
                  {dias.length > 1 && (
                    <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 700 }}>{i === 0 ? rotuloDoDia(d.dia, hoje) : ""}</td>
                  )}
                  <td style={{ ...td, minWidth: 140 }}>
                    <button type="button" className="mq-link" onClick={() => onVerDiario(d.dia, m.maquina)} title={`Ver o diário da ${m.rotulo} em ${diaBR(d.dia)}`} style={{ border: "none", background: "transparent", padding: 0, font: "inherit", fontWeight: 700, color: "inherit", cursor: "pointer", textAlign: "left", overflowWrap: "anywhere" }}>
                      {m.rotulo}
                    </button>
                  </td>
                  <td style={{ ...num, fontWeight: 700, color: m.unidades > 0 ? IMP.text : "inherit" }}>{m.unidades}</td>
                  <td style={num}>{m.pecas}</td>
                  <td style={num}>{m.concluidas}</td>
                  <td style={num}>{m.aindaNaMaquina}</td>
                  <td style={{ ...td, whiteSpace: "nowrap", fontFamily: MONO, color: "inherit" }}>{m.primeira ? `${m.primeira} → ${m.ultima}` : "—"}</td>
                  <td style={num}>{duracaoCurta(m.minutosAtivos)}</td>
                  <td style={{ ...td, color: T.second, overflowWrap: "anywhere" }}>{m.quem.join(", ") || "—"}</td>
                </tr>
              ))}
              <tr key={`${d.dia}-total`} data-testid={`resumo-${d.dia}-total`} style={{ borderTop: `1px solid ${T.border}`, background: T.low, fontWeight: FW.rotulo }}>
                {dias.length > 1 && <td style={td} />}
                <td style={{ ...td, ...ROTULO_MICRO, color: T.text }}>{dias.length > 1 ? "Total do dia" : "Total"}</td>
                <td style={{ ...num, color: IMP.text }}>{d.total.unidades}</td>
                <td style={num}>{d.total.pecas}</td>
                <td style={num}>{d.total.concluidas}</td>
                <td style={num}>{d.total.aindaNaMaquina}</td>
                <td style={td} />
                <td style={num}>{duracaoCurta(d.total.minutosAtivos)}</td>
                <td style={td} />
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
      <div data-testid="fecho-resumo" style={{ padding: "8px 14px", borderTop: `1px solid ${T.low}`, background: T.bg, textAlign: "center", fontSize: FS.small, color: T.second, fontVariantNumeric: "tabular-nums" }}>
        {dias.length === 1 ? "Fim do resumo do dia" : `Fim do resumo · ${dias.length} dias`}
      </div>
    </div>
  );
}

// ─── A aba Resumo (por dia × impressora, no período escolhido) ────────────────
// O período vive na URL e vale também para o Excel; o estado (consulta do
// relatório e exportação em voo) mora na página.
export function AbaResumo({ isMobile, alvo, periodo, intervalo, dia, hoje, ehHoje, relatorio, exportando, exportarExcel, diarioEmCartoes, botaoNeutro, escreverURL }: {
  isMobile: boolean; alvo: number; periodo: Periodo; intervalo: { de: string; ate: string } | null; dia: string | null; hoje: string | null; ehHoje: boolean;
  relatorio: UseQueryResult<Relatorio>; exportando: boolean; exportarExcel: () => void;
  /** A mesma régua de largura do diário: tela estreita vira cartões. */ diarioEmCartoes: boolean; botaoNeutro: React.CSSProperties;
  escreverURL: (mudancas: Record<string, string | null>) => void;
}) {
  return (
    <section id="painel-maquinas" role="tabpanel" aria-label="Resumo" data-testid="secao-resumo" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h2 id="titulo-resumo" style={{ ...TITULO, fontSize: FS.title, scrollMarginTop: 16 }}>Resumo</h2>
          {intervalo && (
            <span data-testid="resumo-periodo" style={{ fontSize: FS.body, color: T.second, fontVariantNumeric: "tabular-nums" }}>
              {periodo === "dia" && dia && hoje ? rotuloDoDia(dia, hoje) : periodoBR(intervalo.de, intervalo.ate)}
              {relatorio.data ? ` · ${plural(relatorio.data.dias.reduce((s, d) => s + d.total.unidades, 0), "unidade impressa", "unidades impressas")}` : ""}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* O período vale para o resumo E para o Excel. */}
          <div role="group" aria-label="Período do resumo" data-testid="seletor-periodo" style={{ display: isMobile ? "flex" : "inline-flex", ...(isMobile ? { flex: "1 1 100%" } : {}), border: `1px solid ${T.bdark}`, borderRadius: R.md, overflow: "hidden", background: T.surface }}>
            {PERIODOS.map((p, i) => {
              const ativo = periodo === p.valor;
              return (
                <button
                  key={p.valor}
                  type="button"
                  className="mq-chip"
                  aria-pressed={ativo}
                  onClick={() => escreverURL({ periodo: p.valor === "dia" ? null : p.valor, ...(p.valor !== "intervalo" ? { de: null, ate: null } : {}) })}
                  data-testid={`periodo-${p.valor}`}
                  style={{ minHeight: alvo, padding: isMobile ? "0 4px" : "0 12px", ...(isMobile ? { flex: "1 1 0%", minWidth: 0 } : {}), border: "none", borderLeft: i ? `1px solid ${T.border}` : "none", background: ativo ? T.text : "transparent", color: ativo ? T.surface : T.text, fontSize: FS.meta, fontWeight: FW.forte, cursor: "pointer" }}
                >
                  {p.rotulo}
                </button>
              );
            })}
          </div>
          {periodo === "intervalo" && intervalo && hoje && (
            <div role="group" aria-label="Intervalo de datas" style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <label htmlFor="intervalo-de" className="sr-only">De</label>
              <input id="intervalo-de" type="date" value={intervalo.de} max={intervalo.ate} data-testid="intervalo-de" onChange={(e) => { if (e.target.value) escreverURL({ de: e.target.value, ate: intervalo.ate }); }} style={{ height: alvo, borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, padding: "0 8px", fontSize: isMobile ? 16 : 12.5, color: T.text }} />
              <span aria-hidden="true" style={{ fontSize: isMobile ? 12 : FS.small, color: T.second }}>a</span>
              <label htmlFor="intervalo-ate" className="sr-only">Até</label>
              <input id="intervalo-ate" type="date" value={intervalo.ate} min={intervalo.de} max={hoje} data-testid="intervalo-ate" onChange={(e) => { if (e.target.value) escreverURL({ de: intervalo.de, ate: e.target.value }); }} style={{ height: alvo, borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, padding: "0 8px", fontSize: isMobile ? 16 : 12.5, color: T.text }} />
            </div>
          )}
          <Botao
            variante="secundario"
            icone={Download}
            carregando={exportando}
            onClick={exportarExcel}
            disabled={!intervalo}
            data-testid="button-exportar-excel"
            title={intervalo ? `Baixar o resumo e os registros de ${periodoBR(intervalo.de, intervalo.ate)} em Excel` : "Aguarde o carregamento"}
            style={{ ...botaoNeutro, ...(isMobile ? { flex: "1 1 100%", fontSize: 13 } : {}), cursor: !intervalo || exportando ? "wait" : "pointer" }}
          >
            {exportando ? "Gerando…" : "Exportar Excel"}
          </Botao>
        </div>
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden", padding: diarioEmCartoes ? 12 : 0 }}>
        {relatorio.isLoading || !intervalo ? (
          <div role="status" aria-busy="true" data-testid="resumo-carregando" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="sr-only">Carregando o resumo…</span>
            {[0, 1, 2, 3].map((i) => <div key={i} className="animate-pulse" aria-hidden="true" style={{ height: 12, borderRadius: 4, background: T.border, width: `${70 - i * 8}%` }} />)}
          </div>
        ) : relatorio.isError && !relatorio.data ? (
          <div role="alert" data-testid="resumo-erro" style={{ padding: "14px 16px", color: VERMELHO.text, fontSize: FS.body, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span>{ehServidorNaVersaoAnterior(relatorio.error) ? AVISO_SERVIDOR_ANTIGO : "Não foi possível montar o resumo deste período."}</span>
            <Botao variante="secundario" icone={RotateCcw} onClick={() => relatorio.refetch()} style={botaoNeutro}>Tentar novamente</Botao>
          </div>
        ) : relatorio.data && relatorio.data.dias.length === 0 ? (
          <div data-testid="resumo-vazio" style={{ padding: 12 }}>
            <EstadoVazio
              compacto
              icone={Printer}
              titulo={`Nenhuma impressão registrada ${periodo === "dia" ? (ehHoje ? "hoje" : `em ${diaBR(intervalo.de)}`) : `entre ${diaBR(intervalo.de)} e ${diaBR(intervalo.ate)}`}.`}
              descricao={intervalo.ate < INICIO_DO_DIARIO
                ? `O diário por máquina começa em ${diaBR(INICIO_DO_DIARIO)}.`
                : "Escolha outro período ou aguarde as máquinas registrarem."}
            />
          </div>
        ) : relatorio.data ? (
          <ResumoDoPeriodo
            dias={relatorio.data.dias}
            emCartoes={diarioEmCartoes}
            isMobile={isMobile}
            hoje={relatorio.data.hoje}
            onVerDiario={(d, m) => escreverURL({ dia: hoje && d >= hoje ? null : d, maquina: m, aba: "diario" })}
          />
        ) : null}
      </div>
    </section>
  );
}
