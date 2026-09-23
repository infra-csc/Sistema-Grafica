// ─────────────────────────────────────────────────────────────────────────────
// MÁQUINAS DA GRÁFICA — o diário: o que saiu de cada impressora num dia,
// lançamento por lançamento (hora, máquina, peça, o que aconteceu, quem).
// ─────────────────────────────────────────────────────────────────────────────
import { memo } from "react";
import { Link } from "wouter";
import { ArrowRight, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/estados";
import { T, FS, FW, R } from "@/lib/theme";
import { P } from "@/lib/status";
import { GRAFICA_LIBERADOS, GROTESK, INICIO_DO_DIARIO, LOTE, MONO, ROTULO_MICRO, TITULO } from "./constantes";
import { FechoDaLista, Pilula, TituloDaPeca } from "./pedacos";
import { diaBR, oQueAconteceu, plural, rotuloDoDia, somarDias } from "./regras";
import type { Linha, Maquina, Registro } from "./tipos";

/** O selo de cada tipo de lançamento. */
const TIPO_DO_REGISTRO: Record<Registro["tipo"], { rotulo: string; pal: { bg: string; border: string; text: string } }> = {
  inicio:    { rotulo: "Início",     pal: P.neutral },
  troca:     { rotulo: "Troca",      pal: P.amber },
  parcial:   { rotulo: "Impressas",  pal: P.orange },
  conclusao: { rotulo: "Concluída",  pal: P.green },
  pausa:     { rotulo: "Pausa",      pal: P.neutral },
};

// ─── Linha do diário (memoizada: pode haver centenas) ─────────────────────────
// Sem botão por linha: cada registro repetia a ação da MESMA peça, e a coluna
// extra estourava a tabela. A ação mora no cartão da impressora, uma vez.
//
// Três densidades (a largura ÚTIL decide, não a do navegador — com o menu
// lateral aberto a 1280px sobram ~1040px): cartão abaixo de 820px; tabela
// compacta (Evento embaixo da Peça) até 1180px; tabela cheia acima. Em
// nenhuma delas uma coluna corta texto — as células quebram linha.
export const LinhaDoDiario = memo(function LinhaDoDiario({ l, mostrarMaquina, isMobile, emCartao, compacto }: {
  l: Linha; mostrarMaquina: boolean; isMobile: boolean; emCartao: boolean; compacto: boolean;
}) {
  const meta = TIPO_DO_REGISTRO[l.tipo] ?? TIPO_DO_REGISTRO.parcial;
  const texto = oQueAconteceu(l, l.rotuloMaquina);

  if (emCartao) {
    return (
      <div data-testid={`linha-diario-${l.id}`} style={{ padding: "10px 14px", borderTop: `1px solid ${T.low}`, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: FS.meta, color: T.second, fontVariantNumeric: "tabular-nums" }}>{l.hora}</span>
          <Pilula pal={meta.pal} fonte={isMobile ? 12 : FS.small}>{meta.rotulo}</Pilula>
          {mostrarMaquina && <span style={{ fontSize: FS.meta, color: T.second }}>{l.rotuloMaquina}</span>}
        </div>
        <div style={{ fontSize: FS.body, color: T.text, fontWeight: FW.forte }}>{texto}</div>
        <TituloDaPeca id={l.itemId} codigo={l.displayId} tipo={l.tipoPeca} descricao={l.descricaoPeca} isMobile fonte={FS.body} testId={`nome-diario-${l.id}`} />
        {l.evento && <span style={{ fontSize: FS.meta, color: T.second, overflowWrap: "anywhere" }}>{l.evento}</span>}
        <span style={{ fontSize: FS.meta, color: T.second }}>{l.quem ?? "—"}</span>
      </div>
    );
  }

  const td: React.CSSProperties = { padding: "8px 12px", verticalAlign: "top", lineHeight: 1.35 };
  const fixo: React.CSSProperties = { ...td, whiteSpace: "nowrap" };
  return (
    <tr className="mq-linha" data-testid={`linha-diario-${l.id}`} style={{ borderTop: `1px solid ${T.low}` }}>
      <td style={{ ...fixo, fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: T.second }}>{l.hora}</td>
      {mostrarMaquina && <td style={{ ...td, color: T.second, minWidth: 110, overflowWrap: "anywhere" }}>{l.rotuloMaquina}</td>}
      <td style={{ ...td, minWidth: 160, overflowWrap: "anywhere" }}>
        <TituloDaPeca id={l.itemId} codigo={l.displayId} tipo={l.tipoPeca} descricao={l.descricaoPeca} isMobile={false} emLinha fonte={12.5} testId={`nome-diario-${l.id}`} />
        {compacto && l.evento && <div style={{ fontSize: FS.small, color: T.second, marginTop: 2 }}>{l.evento}</div>}
      </td>
      {!compacto && <td style={{ ...td, color: T.second, minWidth: 120, overflowWrap: "anywhere" }}>{l.evento ?? "—"}</td>}
      <td style={{ ...td, minWidth: 200 }}>
        <span style={{ display: "inline-flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
          <Pilula pal={meta.pal} fonte={isMobile ? 12 : FS.small}>{meta.rotulo}</Pilula>
          <span style={{ fontWeight: l.tipo === "parcial" || l.tipo === "conclusao" ? FW.forte : FW.corpo, color: T.text, overflowWrap: "anywhere" }}>{texto}</span>
        </span>
      </td>
      <td style={{ ...td, color: T.second, overflowWrap: "anywhere" }}>{l.quem ?? "—"}</td>
    </tr>
  );
});

// ─── A aba Diário (um dia, todas as impressoras ou uma) ───────────────────────
// O dia e a impressora vivem na URL; o recorte e o "Mostrar mais" moram na
// página (sobrevivem à troca de aba).
export function AbaDiario({ isMobile, alvo, dia, hoje, ehHoje, maquinas, maquinaFiltro, maquinaFiltrada, diario, linhasVisiveis, visiveis, chaveDoRecorte, setLimite, unidadesDoDia, antesDoDiario, diarioEmCartoes, diarioCompacto, podeAgir, botaoNeutro, botaoIcone, irParaDia, escreverURL }: {
  isMobile: boolean; alvo: number; dia: string | null; hoje: string | null; ehHoje: boolean;
  maquinas: Maquina[]; maquinaFiltro: string; maquinaFiltrada: Maquina | null;
  /** O diário já filtrado, a fatia à vista e o limite do recorte atual. */ diario: Linha[]; linhasVisiveis: Linha[]; visiveis: number; chaveDoRecorte: string;
  setLimite: (limite: { chave: string; n: number }) => void;
  unidadesDoDia: number; antesDoDiario: boolean; diarioEmCartoes: boolean; diarioCompacto: boolean; podeAgir: boolean;
  botaoNeutro: React.CSSProperties; botaoIcone: React.CSSProperties;
  irParaDia: (novo: string) => void; escreverURL: (mudancas: Record<string, string | null>) => void;
}) {
  return (
    <section id="painel-maquinas" role="tabpanel" aria-label="Diário" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h2 id="titulo-dia" style={{ ...TITULO, fontSize: FS.title, scrollMarginTop: 16 }}>Diário</h2>
          <span data-testid="resumo-dia" style={{ fontSize: FS.body, color: T.second, fontVariantNumeric: "tabular-nums" }}>
            {unidadesDoDia === 0 ? "nada impresso neste dia" : `${plural(unidadesDoDia, "unidade impressa", "unidades impressas")} no total`}
          </span>
        </div>

        {dia && hoje && (
          <div role="group" aria-label="Escolher o dia" data-testid="navegar-dia" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="mq-acao" onClick={() => irParaDia(somarDias(dia, -1))} aria-label="Dia anterior" data-testid="dia-anterior" style={botaoIcone}>
              <ChevronLeft aria-hidden="true" style={{ width: 15, height: 15 }} />
            </button>
            <span aria-live="polite" style={{ minWidth: 92, textAlign: "center", fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>{rotuloDoDia(dia, hoje)}</span>
            <button type="button" className="mq-acao" onClick={() => irParaDia(somarDias(dia, 1))} disabled={ehHoje} aria-label="Próximo dia" title={ehHoje ? "Já está em hoje" : undefined} data-testid="dia-seguinte" style={{ ...botaoIcone, cursor: ehHoje ? "not-allowed" : "pointer", opacity: ehHoje ? 0.4 : 1 }}>
              <ChevronRight aria-hidden="true" style={{ width: 15, height: 15 }} />
            </button>
            <input
              type="date"
              value={dia}
              max={hoje}
              onChange={(e) => { if (e.target.value) irParaDia(e.target.value); }}
              aria-label="Ir para uma data"
              data-testid="escolher-data"
              style={{ height: alvo, borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, padding: "0 8px", fontSize: isMobile ? 16 : 12.5, color: T.text }}
            />
            {!ehHoje && (
              <Botao variante="primario" tamanho="sm" onClick={() => escreverURL({ dia: null })} data-testid="dia-hoje" style={{ minHeight: alvo }}>
                Hoje
              </Botao>
            )}
          </div>
        )}
      </div>

      {/* Filtro por impressora: chips com contagem — quem procura "o que
          saiu da 3" vê o número antes de clicar. */}
      <div role="group" aria-label="Filtrar por impressora" data-testid="filtro-maquina" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[{ codigo: "", rotulo: "Todas", n: maquinas.reduce((s, m) => s + m.registros.length, 0) }, ...maquinas.map((m) => ({ codigo: m.codigo, rotulo: m.rotulo, n: m.registros.length }))].map((c) => {
          const ativo = maquinaFiltro === c.codigo;
          return (
            <button
              key={c.codigo || "todas"}
              type="button"
              className="mq-chip"
              aria-pressed={ativo}
              onClick={() => escreverURL({ maquina: c.codigo || null })}
              data-testid={`chip-maquina-${c.codigo || "todas"}`}
              style={{ minHeight: alvo, padding: "0 12px", borderRadius: R.pill, border: `1px solid ${ativo ? T.text : T.border}`, background: ativo ? T.text : T.surface, color: ativo ? T.surface : T.text, fontSize: FS.meta, fontWeight: FW.forte, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
            >
              {c.rotulo}
              <span style={{ fontFamily: GROTESK, fontVariantNumeric: "tabular-nums", color: ativo ? T.bdark : T.second }}>{c.n}</span>
            </button>
          );
        })}
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden" }}>
        {diario.length === 0 ? (
          <div data-testid="diario-vazio" style={{ padding: 12 }}>
            <EstadoVazio
              compacto
              icone={Printer}
              titulo={maquinaFiltrada
                ? `Nada saiu da ${maquinaFiltrada.rotulo} ${ehHoje ? "hoje" : `em ${diaBR(dia!)}`}.`
                : `Nenhuma impressão registrada ${ehHoje ? "hoje" : `em ${diaBR(dia!)}`}.`}
              descricao={antesDoDiario
                ? `O diário por máquina começa em ${diaBR(INICIO_DO_DIARIO)}: antes disso a impressão não anotava em qual máquina a peça saiu.`
                : maquinaFiltrada
                  ? "Veja as outras impressoras ou escolha outro dia."
                  : "Ao iniciar uma impressão na Gráfica, ela aparece aqui."}
              acao={(maquinaFiltrada || !ehHoje || podeAgir) ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  {maquinaFiltrada && (
                    <Botao variante="secundario" onClick={() => escreverURL({ maquina: null })} data-testid="button-ver-todas" style={botaoNeutro}>Ver todas as impressoras</Botao>
                  )}
                  {!ehHoje && (
                    <Botao variante="secundario" onClick={() => escreverURL({ dia: null })} style={botaoNeutro}>Voltar para hoje</Botao>
                  )}
                  {ehHoje && !maquinaFiltrada && podeAgir && (
                    <Link href={GRAFICA_LIBERADOS} className="mq-acao" style={botaoNeutro}>Ver peças liberadas <ArrowRight aria-hidden="true" style={{ width: 12, height: 12, color: T.accentText }} /></Link>
                  )}
                </div>
              ) : undefined}
            />
          </div>
        ) : diarioEmCartoes ? (
          <div data-testid="diario-cartoes">
            {linhasVisiveis.map((l) => (
              <LinhaDoDiario key={l.id} l={l} mostrarMaquina={!maquinaFiltro} isMobile={isMobile} emCartao compacto={false} />
            ))}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table data-testid="diario-tabela" data-compacto={diarioCompacto || undefined} style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: T.second, background: T.bg }}>
                  {["Hora", ...(maquinaFiltro ? [] : ["Impressora"]), "Peça", ...(diarioCompacto ? [] : ["Evento"]), "O que aconteceu", "Quem"].map((h, i) => (
                    <th key={`${h}-${i}`} scope="col" style={{ padding: "9px 12px", ...ROTULO_MICRO, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhasVisiveis.map((l) => (
                  <LinhaDoDiario key={l.id} l={l} mostrarMaquina={!maquinaFiltro} isMobile={false} emCartao={false} compacto={diarioCompacto} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {diario.length > 0 && (
          <FechoDaLista visiveis={Math.min(visiveis, diario.length)} total={diario.length} um="lançamento" varios="lançamentos" lote={LOTE} onMais={() => setLimite({ chave: chaveDoRecorte, n: visiveis + LOTE })} testId="fecho-diario" botaoTestId="button-mostrar-mais" isMobile={isMobile} estiloDoBotao={botaoNeutro} />
        )}
      </div>

      {diario.length > 0 && antesDoDiario && (
        <p data-testid="nota-inicio-historico" style={{ margin: 0, fontSize: isMobile ? 12 : FS.small, color: T.second }}>
          O histórico por máquina começa em 14/09/2026: antes disso a impressão não anotava em qual máquina a peça saiu.
        </p>
      )}
    </section>
  );
}
