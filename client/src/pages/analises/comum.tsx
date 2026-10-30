// ─────────────────────────────────────────────────────────────────────────────
// PAINEL OPERACIONAL — as peças visuais compartilhadas pelas cinco abas.
//
// Tudo no design da casa (lib/theme, recharts como nas outras abas da
// Análises). As cores são de PAPEL, fixas por série (validadas no
// dataviz/validate_palette — nenhuma dupla vizinha se confunde em daltonismo):
//   azul = no prazo / realizado / impressão / liberado · turquesa = planejado /
//   acabamento · vermelho = atrasado · cinza = já feito / ainda em pré-produção.
// O cinza não é série: é o "fora da conta" de cada gráfico.
//
// PEÇAS SEM APROVAÇÃO (Pedro/dono, 26/10): céu = atraso DO CLIENTE (RN09) — a
// cor da casa (`TOM_DO_ATRASO_DO_CLIENTE`, components/selo-sem-aprovacao), a
// mesma da Gestão de Prazos e da Arte (revisão 27/10). É o
// atraso da peça com "Arte do cliente" cujo arquivo não chegou até o Layout
// ajustado. Fica fora do vermelho de propósito: não é atraso da casa.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import {
  Bar, BarChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { T, TOM, N, FS, FW, R, FONT } from "@/lib/theme";
import { Calendar, Layers } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { FilterSelect } from "@/components/filter-select";
import { P } from "@/lib/status";
import { useIsMobile } from "@/hooks/use-mobile";
import { diaDaSemana, rotuloDaEtapaNoPainel, type FiltroDeMarca, type PecaDaLinha } from "@shared/painel-operacional";
import {
  COR_DO_ATRASO_DO_CLIENTE, SelosSemAprovacao, SeloAtrasoDoCliente, fraseDoPrazoAjustado,
} from "@/components/selo-sem-aprovacao";

export const COR = {
  prazo: TOM.info.dot,
  planejado: TOM.turquesa.dot,
  acabamento: TOM.turquesa.dot,
  atrasado: TOM.perigo.dot,
  /** RN09 (26/10): o atraso por conta do cliente — separado do atraso interno. */
  atrasoCliente: COR_DO_ATRASO_DO_CLIENTE.dot,
  neutro: N.n6,
  // Os processos de pré-produção, na ordem do fluxo.
  cadastro: TOM.turquesa.dot,
  layout: TOM.info.dot,
  aprovacao: TOM.alerta.dot,
  finalizacao: TOM.roxo.dot,
  revisao: P.pink.dot,
  // Problemas.
  furaFila: TOM.alerta.dot,
  refacao: TOM.roxo.dot,
  reprovada: TOM.turquesa.dot,
} as const;

const TABULAR: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

// ─── Formatação ──────────────────────────────────────────────────────────────

const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
export const fmt0 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : nf0.format(v));
export const fmt1 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : nf1.format(v));
export const fmtM2 = (v: number) => `${fmt0(v)} m²`;
/** dd/mm de "YYYY-MM-DD". */
export const dm = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");
/** dd/mm/aaaa de "YYYY-MM-DD". */
export const dma = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");

export type MedidaDaTela = "m2" | "unidades" | "itens";
export function formatoDaMedida(m: MedidaDaTela): (v: number) => string {
  if (m === "m2") return fmtM2;
  if (m === "unidades") return (v) => `${fmt1(v)} pç`;
  return (v) => `${fmt1(v)} itens`;
}

// ─── Vazio ───────────────────────────────────────────────────────────────────

/** O vazio de um bloco: a mesma caixa tracejada das tabelas, com a frase do caso. */
export function Vazio({ children, testId, alto = false }: { children: React.ReactNode; testId?: string; alto?: boolean }) {
  return (
    <p
      data-testid={testId}
      style={{
        margin: 0, padding: alto ? "56px 16px" : "18px 16px", textAlign: "center", fontSize: FS.small, color: T.second,
        border: `1px dashed ${T.border}`, borderRadius: R.md,
      }}
    >
      {children}
    </p>
  );
}

// ─── Legenda ─────────────────────────────────────────────────────────────────

export interface SerieVisual { chave: string; nome: string; cor: string }

export function Legenda({ series }: { series: SerieVisual[] }) {
  if (series.length < 2) return null;
  return (
    <div aria-hidden="true" className="pop-legenda" style={{ display: "flex", flexWrap: "wrap", columnGap: 14, rowGap: 4, marginBottom: 8 }}>
      {series.map((s) => (
        <span key={s.chave} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: FS.small, color: T.second }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: s.cor, flexShrink: 0 }} />{s.nome}
        </span>
      ))}
    </div>
  );
}

// ─── Barras por dia (recharts, como as outras abas) ─────────────────────────

type ItemDaDica = { value?: number | null; dataKey?: string | number; name?: string; color?: string };

function DicaDoDia({ active, payload, label, formato, empilhado }: {
  active?: boolean; payload?: ItemDaDica[]; label?: string | number; formato: (n: number) => string; empilhado: boolean;
}) {
  if (!active || !payload?.length) return null;
  const dia = String(label ?? "");
  const total = payload.reduce((s, p) => s + Number(p.value ?? 0), 0);
  return (
    <div style={{ backgroundColor: T.dark, color: T.surface, borderRadius: R.sm, padding: "9px 12px", fontSize: FS.small, lineHeight: 1.6, minWidth: 160 }}>
      <div style={{ fontWeight: FW.forte, marginBottom: 4 }}>{diaDaSemana(dia)} {dma(dia)}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} style={{ ...TABULAR, display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: p.color }} />{p.name}
          </span>
          <strong>{formato(Number(p.value ?? 0))}</strong>
        </div>
      ))}
      {empilhado && payload.length > 1 && (
        <div style={{ ...TABULAR, display: "flex", justifyContent: "space-between", gap: 12, borderTop: "1px solid rgba(255,255,255,0.2)", marginTop: 4, paddingTop: 4 }}>
          <span>Total</span><strong>{formato(total)}</strong>
        </div>
      )}
    </div>
  );
}

function TickDoDia({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const d = payload?.value ?? "";
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text dy={11} textAnchor="middle" fontSize={FS.micro} fontWeight={FW.forte} fill={T.second} fontFamily={FONT.corpo}>{dm(d)}</text>
      <text dy={23} textAnchor="middle" fontSize={FS.micro} fill={T.second} fontFamily={FONT.corpo}>{diaDaSemana(d)}</text>
    </g>
  );
}

/**
 * BARRAS POR DIA. `empilhado` soma as séries no mesmo dia; sem ele, ficam lado
 * a lado (impressão × acabamento). `hoje` marca a linha "hoje"; `selecionado`
 * contorna o dia escolhido; `aoClicarDia` torna cada dia clicável (a fila da
 * projeção). A caixa rola de lado quando há dia demais — a página nunca.
 */
export const GraficoDeDias = React.memo(function GraficoDeDias({
  dados, series, formato, empilhado = false, hoje, selecionado, aoClicarDia, altura = 240, legenda, testId, vazio = "Sem registros no período.",
}: {
  dados: Array<{ dia: string } & Record<string, number | string>>;
  series: SerieVisual[];
  formato: (n: number) => string;
  empilhado?: boolean;
  hoje?: string;
  selecionado?: string;
  aoClicarDia?: (dia: string) => void;
  altura?: number;
  /** Descrição do gráfico para leitor de tela. */
  legenda: string;
  testId: string;
  vazio?: string;
}) {
  const isMobile = useIsMobile();
  const rolagemRef = React.useRef<HTMLDivElement>(null);
  const temValor = dados.some((d) => series.some((s) => Number(d[s.chave] ?? 0) > 0));
  // Quando os dias não cabem e a caixa rola, ela abre no dia que importa (o
  // escolhido, ou hoje) — não no começo da série, que é o passado.
  const foco = selecionado ?? hoje;
  const indiceDoFoco = foco ? dados.findIndex((d) => d.dia === foco) : -1;
  React.useLayoutEffect(() => {
    const el = rolagemRef.current;
    if (!el || indiceDoFoco < 0 || el.scrollWidth <= el.clientWidth + 1) return;
    const x = (indiceDoFoco / Math.max(1, dados.length)) * el.scrollWidth;
    el.scrollLeft = Math.max(0, x - el.clientWidth / 2);
  }, [indiceDoFoco, dados.length]);
  if (!temValor) {
    return <Vazio testId={`${testId}-vazio`} alto>{vazio}</Vazio>;
  }
  // No celular a barra afina para os dias caberem; o resto rola dentro da caixa.
  const larguraPorDia = isMobile ? (empilhado ? 9 : 12) : (empilhado ? 12 : 22);
  return (
    <figure data-testid={testId} style={{ margin: 0, minWidth: 0 }}>
      <figcaption className="sr-only">{legenda}</figcaption>
      <Legenda series={series} />
      <div ref={rolagemRef} className="pop-rolagem" style={{ overflowX: "auto", ...TABULAR }}>
        <div style={{ minWidth: dados.length * larguraPorDia, height: altura }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={dados}
              margin={{ top: 16, right: 8, left: 0, bottom: 4 }}
              barGap={2}
              onClick={aoClicarDia ? (e: { activeLabel?: string | number } | null) => { if (e?.activeLabel != null) aoClicarDia(String(e.activeLabel)); } : undefined}
              style={aoClicarDia ? { cursor: "pointer" } : undefined}
            >
              <CartesianGrid stroke={N.n3} vertical={false} />
              <XAxis dataKey="dia" tick={<TickDoDia />} height={34} axisLine={{ stroke: T.bdark }} tickLine={false} interval="preserveStartEnd" minTickGap={10} />
              <YAxis tick={{ fontSize: FS.micro, fill: T.second }} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => fmt0(v)} />
              <Tooltip content={<DicaDoDia formato={formato} empilhado={empilhado} />} cursor={{ fill: T.low }} />
              {selecionado && <ReferenceArea x1={selecionado} x2={selecionado} fill={T.low} stroke={T.text} strokeWidth={1} ifOverflow="extendDomain" />}
              {hoje && dados.some((d) => d.dia === hoje) && (
                <ReferenceLine x={hoje} stroke={T.apoio} strokeDasharray="3 3" label={{ value: "hoje", position: "top", fontSize: FS.micro, fill: T.apoio, fontWeight: FW.forte }} />
              )}
              {series.map((s, i) => (
                <Bar
                  key={s.chave}
                  dataKey={s.chave}
                  name={s.nome}
                  fill={s.cor}
                  stackId={empilhado ? "pilha" : undefined}
                  maxBarSize={empilhado ? 26 : 16}
                  radius={empilhado ? (i === series.length - 1 ? [3, 3, 0, 0] : 0) : [3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </figure>
  );
});

// ─── Barras horizontais empilhadas (HTML: o rótulo longo cabe inteiro) ───────

export interface LinhaEmpilhada {
  id: string;
  rotulo: string;
  partes: Record<string, number>;
  /** O número no fim da barra (pd. a soma das partes). */
  total?: number;
  /** Texto extra da dica. */
  extra?: string;
}

export function BarrasEmpilhadas({
  linhas, series, formato, legenda, testId, vazio = "Nada em aberto.", aoClicar, rotuloDoClique, selecionada,
}: {
  linhas: LinhaEmpilhada[];
  series: SerieVisual[];
  formato: (n: number) => string;
  legenda: string;
  testId: string;
  vazio?: string;
  aoClicar?: (l: LinhaEmpilhada) => void;
  /** "Ver o evento" — o que o clique faz, para o leitor de tela. */
  rotuloDoClique?: string;
  selecionada?: string | null;
}) {
  if (linhas.length === 0) return <Vazio testId={`${testId}-vazio`}>{vazio}</Vazio>;
  const soma = (l: LinhaEmpilhada) => series.reduce((s, x) => s + (l.partes[x.chave] ?? 0), 0);
  const maior = Math.max(1e-9, ...linhas.map(soma));
  return (
    <div data-testid={testId}>
      <Legenda series={series} />
      <ul aria-label={legenda} className="pop-barras" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {linhas.map((l) => {
          const total = l.total ?? soma(l);
          const dica = [l.rotulo, ...series.filter((s) => (l.partes[s.chave] ?? 0) > 0).map((s) => `${s.nome}: ${formato(l.partes[s.chave])}`), l.extra].filter(Boolean).join("\n");
          const conteudo = (
            <>
              <span className="pop-barras-rotulo" style={{ fontSize: FS.body, fontWeight: FW.medio, color: T.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>{l.rotulo}</span>
              <span aria-hidden="true" className="pop-barras-trilho" style={{ display: "flex", height: 12, gap: 2, minWidth: 0 }}>
                {series.map((s) => {
                  const v = l.partes[s.chave] ?? 0;
                  if (v <= 0) return null;
                  return <span key={s.chave} style={{ width: `${(v / maior) * 100}%`, minWidth: 3, backgroundColor: s.cor, borderRadius: 2 }} />;
                })}
              </span>
              <span style={{ ...TABULAR, fontSize: FS.body, fontWeight: total > 0 ? FW.forte : FW.corpo, color: total > 0 ? T.text : T.second, textAlign: "right", whiteSpace: "nowrap" }}>{formato(total)}</span>
            </>
          );
          const ativa = selecionada != null && selecionada === l.id;
          return (
            <li key={l.id} data-testid={`${testId}-linha`} title={dica} style={{ borderTop: `1px solid ${N.n3}` }}>
              {aoClicar ? (
                <button
                  type="button"
                  className="pop-barras-linha pop-clicavel"
                  onClick={() => aoClicar(l)}
                  aria-label={`${l.rotulo}: ${formato(total)}. ${rotuloDoClique ?? "Abrir"}.`}
                  aria-pressed={selecionada !== undefined ? ativa : undefined}
                  style={{ width: "100%", border: "none", background: ativa ? T.low : "none", cursor: "pointer", font: "inherit", padding: "7px 4px", borderRadius: R.sm }}
                >
                  {conteudo}
                </button>
              ) : (
                <div className="pop-barras-linha" aria-label={`${l.rotulo}: ${formato(total)}`} style={{ padding: "7px 4px" }}>{conteudo}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Controles ───────────────────────────────────────────────────────────────

/** Faixa de controles de uma aba (a mesma faixa em T.low da Análises). */
export function FaixaDeControles({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="pop-controles"
      style={{
        backgroundColor: T.low, border: `1px solid ${T.border}`, borderRadius: R.lg,
        padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end",
      }}
    >
      {children}
    </div>
  );
}

/** Um campo rotulado da faixa. */
export function Campo({ rotulo, children, id }: { rotulo: string; children: React.ReactNode; id?: string }) {
  return (
    <div className="pop-campo" style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <label htmlFor={id} style={{ fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.1em", textTransform: "uppercase", color: T.second }}>{rotulo}</label>
      {children}
    </div>
  );
}

/** Chips de escolha (um ou vários): o botão da casa com aria-pressed. */
export function Chips<V extends string>({ opcoes, ativos, aoAlternar, rotulo, testId, tamanho }: {
  opcoes: ReadonlyArray<{ id: V; rotulo: string; contador?: number }>;
  ativos: ReadonlyArray<V>;
  aoAlternar: (id: V) => void;
  rotulo: string;
  testId: string;
  tamanho?: "sm" | "toque";
}) {
  return (
    <div role="group" aria-label={rotulo} data-testid={testId} className="pop-chips" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {opcoes.map((o) => {
        const ligado = ativos.includes(o.id);
        return (
          <Botao
            key={o.id}
            tamanho={tamanho ?? "sm"}
            variante={ligado ? "primario" : "secundario"}
            aria-pressed={ligado}
            onClick={() => aoAlternar(o.id)}
            data-testid={`${testId}-${o.id}`}
            style={{ whiteSpace: "nowrap" }}
          >
            {o.rotulo}
            {o.contador != null && <span style={TABULAR}>{fmt0(o.contador)}</span>}
          </Botao>
        );
      })}
    </div>
  );
}

/** <select> nativo no visual dos campos da casa (opções curtas: medida, processo). */
export function Seletor<V extends string>({ id, valor, opcoes, aoMudar, testId, rotulo }: {
  id: string; valor: V; opcoes: ReadonlyArray<{ id: V; rotulo: string }>; aoMudar: (v: V) => void; testId: string; rotulo: string;
}) {
  return (
    <select
      id={id}
      aria-label={rotulo}
      value={valor}
      onChange={(e) => aoMudar(e.target.value as V)}
      data-testid={testId}
      className="pop-select"
      style={{
        height: 36, padding: "0 30px 0 10px", borderRadius: R.md, border: `1px solid ${T.border}`,
        backgroundColor: T.surface, color: T.text, fontFamily: FONT.corpo, fontSize: FS.body, fontWeight: FW.medio,
      }}
    >
      {opcoes.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
    </select>
  );
}

/** Caixa de marcar com rótulo (nativa, no visual da casa). */
export function Marcador({ marcado, aoMudar, children, testId }: { marcado: boolean; aoMudar: (v: boolean) => void; children: React.ReactNode; testId: string }) {
  return (
    <label className="pop-marcador" style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 36, fontSize: FS.body, fontWeight: FW.medio, color: T.text, cursor: "pointer" }}>
      <input type="checkbox" checked={marcado} onChange={(e) => aoMudar(e.target.checked)} data-testid={testId} style={{ width: 16, height: 16, accentColor: T.accentText, margin: 0 }} />
      {children}
    </label>
  );
}

/** Célula de dias de atraso: vermelha quando > 0. */
export function DiasDeAtraso({ dias }: { dias: number }) {
  return <span style={{ ...TABULAR, color: dias > 0 ? TOM.perigo.text : T.second, fontWeight: dias > 0 ? FW.forte : FW.corpo }}>{dias > 0 ? fmt0(dias) : "0"}</span>;
}

/** "Sim" destacado / "Não" apagado. */
export function SimNao({ sim, tom = "alerta" }: { sim: boolean; tom?: "alerta" | "sucesso" }) {
  return <span style={{ color: sim ? TOM[tom].text : T.second, fontWeight: sim ? FW.forte : FW.corpo }}>{sim ? "Sim" : "Não"}</span>;
}

// ─── Evento: situação, nome clicável, filtro ─────────────────────────────────

export function SeloDaSituacao({ situacao }: { situacao: string }) {
  const tom = situacao === "Atrasado" || situacao === "Atrasada" ? "perigo"
    : situacao === "Em dia" || situacao === "Concluída" ? "sucesso"
      : situacao === "Vence em breve" || situacao === "Data inválida" ? "alerta" : "neutro";
  return <Selo tom={tom} tamanho="sm">{situacao}</Selo>;
}

/** O nome do evento como botão (o teclado chega nele; a linha inteira também abre). */
export function NomeDoEvento({ nome, aoAbrir, testId }: { nome: string; aoAbrir: () => void; testId?: string }) {
  return (
    <button
      type="button"
      onClick={aoAbrir}
      data-testid={testId}
      className="pop-link"
      style={{ border: "none", background: "none", padding: 0, font: "inherit", fontWeight: FW.medio, color: T.text, textAlign: "left", cursor: "pointer", overflowWrap: "break-word" }}
    >
      {nome}
    </button>
  );
}

/** As opções do filtro de evento: os eventos que aparecem nas séries, por nome. */
export function opcoesDeEvento(chaves: Iterable<string>, nomes: Record<string, string>) {
  return Array.from(new Set(chaves))
    .map((c) => ({ value: c, label: nomes[c] ?? c }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export function FiltroDeEvento({ valor, aoMudar, opcoes, isMobile, testId }: {
  valor: string | null; aoMudar: (v: string | null) => void; opcoes: { value: string; label: string }[]; isMobile: boolean; testId: string;
}) {
  return (
    <Campo rotulo="Evento">
      <FilterSelect
      showAllLabelWhenEmpty hideWhenEmpty={false}
      label="Evento" allLabel="Todos os eventos" icon={Calendar} activeAppearance="solid"
      value={valor ?? "all"} onChange={(v) => aoMudar(!v || v === "all" ? null : v)} options={opcoes}
      searchPlaceholder="Buscar evento…" emptyText="Nenhum evento encontrado."
      testId={testId} fullWidth={isMobile} panelWidth={isMobile ? undefined : 340} triggerStyle={isMobile ? undefined : { minWidth: 220 }}
      />
    </Campo>
  );
}


/**
 * TIPO DE MATERIAL (30/10, Pedro): vários de uma vez; nenhum = todos. A lista
 * é o cadastro de materiais do app (@shared/materiais) — e, se alguma peça usa
 * um material fora dele, a opção "Outros (fora do cadastro)".
 */
export function FiltroDeMaterial({ valores, aoMudar, opcoes, isMobile, testId }: {
  valores: string[]; aoMudar: (v: string[]) => void; opcoes: { value: string; label: string }[]; isMobile: boolean; testId: string;
}) {
  return (
    <Campo rotulo="Tipo de material">
      <FilterSelect
        showAllLabelWhenEmpty hideWhenEmpty={false}
        label="Material" allLabel="Todos os materiais" icon={Layers} activeAppearance="solid"
        values={valores} onValuesChange={aoMudar} options={opcoes}
        unitLabel={{ one: "material", many: "materiais" }}
        searchPlaceholder="Buscar material…" emptyText="Nenhum material encontrado."
        testId={testId} fullWidth={isMobile} panelWidth={isMobile ? undefined : 300} triggerStyle={isMobile ? undefined : { minWidth: 200 }}
      />
    </Campo>
  );
}

/**
 * A 1ª célula de uma lista de peças: o número da peça e, no celular (onde a
 * coluna Evento sai para a tabela caber), o evento embaixo.
 */
export function CelulaDaPeca({ id, evento, isMobile }: { id: string; evento?: string; isMobile: boolean }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontFamily: FONT.mono, fontWeight: FW.forte }}>{id}</span>
      {isMobile && evento && <span style={{ fontSize: FS.small, fontWeight: FW.corpo, color: T.second, fontFamily: FONT.corpo }}>{evento}</span>}
    </span>
  );
}

// ─── Peças sem aprovação (Pedro/dono, 26/10 — RF06, RF09, RF11, RF12) ───────

/** A cor do texto do atraso: vermelho = interno; céu = do cliente (RN09). */
export const corDoAtraso = (p: Pick<PecaDaLinha, "diasAtraso" | "atrasoDoCliente">): string | undefined =>
  p.diasAtraso > 0 ? (p.atrasoDoCliente ? COR_DO_ATRASO_DO_CLIENTE.text : TOM.perigo.text) : undefined;

/**
 * Os selos "Sem patrocínio" / "Arte cliente" (ou "Aguardando arte do cliente")
 * de uma linha do painel — o componente da casa, com o nome do campo que ele lê.
 */
export function SelosDaLinha({ p }: { p: PecaDaLinha }) {
  if (!p.semAprovacao) return null;
  return (
    <SelosSemAprovacao
      peca={{ id: p.id, status: p.status, semPatrocinio: p.semPatrocinio, arteDoCliente: p.arteDoCliente, aguardandoArteDoCliente: p.aguardandoArteCliente }}
    />
  );
}

/** A célula de status da lista de peças: o status e, embaixo, os selos das marcas. */
export function StatusDaLinha({ p }: { p: PecaDaLinha }) {
  if (!p.semAprovacao) return <>{rotuloDaEtapaNoPainel(p.etapa)}</>;
  return (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
      <span>{rotuloDaEtapaNoPainel(p.etapa)}</span>
      <SelosDaLinha p={p} />
    </span>
  );
}

/**
 * RF12 — o prazo da fase e, na peça com marca (não Kit), o "Layout normal →
 * ajustado" logo embaixo. O prazo da fase já é o que mede a peça (o ajustado,
 * quando vale); o par é a história de como o Layout dela foi medido.
 */
export function PrazoDaLinha({ p, entregue = false }: { p: PecaDaLinha; entregue?: boolean }) {
  const cor = entregue ? undefined : corDoAtraso(p);
  const data = <span style={{ color: cor, fontWeight: cor ? FW.forte : undefined }}>{entregue ? "—" : dma(p.prazoFase)}</span>;
  if (!p.prazoDeLayout) return data;
  const { normal, ajustado } = p.prazoDeLayout;
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {data}
      <span
        data-testid={`op-prazo-layout-${p.id}`}
        title={`Prazo de Layout normal ${dma(normal)} × ajustado ${dma(ajustado)}: a peça sem aprovação ganha a duração da Aprovação (dias corridos). A Finalização e o prazo final não mudam.`}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS.meta, color: T.second, whiteSpace: "nowrap", ...TABULAR }}
      >
        {/* Revisão 27/10: o desenho é aria-hidden e o leitor ouve a frase
            da casa; o tachado saiu do T.muted (n6, não é cor de texto). */}
        <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span>Layout</span>
          <span style={{ textDecoration: "line-through", color: T.second }}>{dm(normal)}</span>
          <span>→</span>
          <span style={{ fontWeight: FW.forte, color: T.text }}>{dm(ajustado)}</span>
        </span>
        <span className="sr-only">{fraseDoPrazoAjustado(normal, ajustado, 0)}</span>
      </span>
    </span>
  );
}

/** Os dias de atraso da linha; o atraso do cliente (RN09) vem em céu, com o selo. */
export function AtrasoDaLinha({ p }: { p: PecaDaLinha }) {
  if (!(p.diasAtraso > 0 && p.atrasoDoCliente)) return <DiasDeAtraso dias={p.diasAtraso} />;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
      <span style={{ ...TABULAR, color: COR_DO_ATRASO_DO_CLIENTE.text, fontWeight: FW.forte }}>{fmt0(p.diasAtraso)}</span>
      <SeloAtrasoDoCliente testId={`op-atraso-cliente-${p.id}`} />
    </span>
  );
}

/**
 * RF11: a frase das partes da tela que NÃO seguem o filtro de marca (as séries
 * de m² e de processos chegam somadas do servidor, sem a peça). Vazia sem filtro.
 */
export const naoSegueAMarca = (marca: FiltroDeMarca): string =>
  marca === "todas" ? "" : " Este bloco não segue o filtro de peças sem aprovação: é a soma do evento inteiro.";
