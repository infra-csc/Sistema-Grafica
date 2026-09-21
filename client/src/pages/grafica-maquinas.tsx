// ─────────────────────────────────────────────────────────────────────────────
// MÁQUINAS DA GRÁFICA (dono, 14/09; revisão de produto 21/09).
//
// "A Gráfica ter uma aba onde faz o controle de impressão por máquinas: ver
// quais máquinas estão imprimindo o quê, qual o histórico do que foi impresso
// naquela máquina naquele dia e tudo mais."
//
// Duas perguntas, na ordem em que o galpão faz:
//   1. AGORA — o que cada impressora está imprimindo, quantas já saíram e
//      quantas ainda estão nela, desde quando. Máquina sem peça diz "Livre".
//   2. O DIA — o diário de impressão de um dia (hoje por padrão), lançamento
//      por lançamento: hora, máquina, peça, o que aconteceu, quem lançou.
//
// E a tela AGE (dono, 21/09: "com base no que está aqui eles fazem a
// manutenção e ajustam"): do cartão da impressora — e da linha do diário de
// uma peça ainda em impressão — o operador informa quantas saíram, manda para
// o acabamento ou troca de máquina, pelo MESMO modal da fila (components/
// grafica/modal-impressao.tsx). Nenhuma regra mora aqui: os endpoints, as
// permissões (grafica/admin agem; solicitacao só vê) e o bloqueio de evento
// finalizado são os de items.ts.
//
// Painel de parede tanto quanto consulta: atualiza sozinha (WebSocket em
// production_started/updated + polling de 60s + ao voltar para a aba), e diz
// "atualizado há X". Dia e impressora escolhidos vivem na URL (?dia=&maquina=)
// para um F5 — ou um link colado — abrir o mesmo recorte.
// ─────────────────────────────────────────────────────────────────────────────
import { memo, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import {
  AlertTriangle, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ExternalLink, Play, Printer, RotateCcw,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/auth-context";
import { T, FS, R } from "@/lib/theme";
import { P, seloPecaEventoFinalizado, motivoAcaoBloqueada, todayBusinessMs } from "@/lib/status";
import { miniatura } from "@/lib/miniatura";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { fmtRelative } from "@/components/prazos/tokens";
import { rotuloDaMaquina } from "@shared/fluxo-peca";
import {
  ModalImpressao, progressoDaImpressao, rotuloCurtoDaAcao, horaDeInicio, type PecaParaImprimir,
} from "@/components/grafica/modal-impressao";

// ─── Tipos (espelho de server/routes/maquinas.ts) ─────────────────────────────
type EventoInfo = { id: string; name: string | null; status: string | null; startDate: string | null; reopenedAt: string | null };

type PecaNaMaquina = {
  id: string;
  displayId: string | null;
  tipo: string;
  descricao: string | null;
  evento: string | null;
  quantidade: number;
  reuso: number;
  aImprimir: number;
  impressas: number;
  desde: string | null;
  maquina: string | null;
  status: string;
  miniatura: string | null;
  eventoInfo: EventoInfo | null;
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
  ordem: number;
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

/** Linha do diário já com a máquina — o diário é UM só, filtrável. */
type Linha = Registro & { maquina: string; rotuloMaquina: string };

// ─── Constantes ───────────────────────────────────────────────────────────────
/** Quando o diário nasceu — antes disso a impressão não anotava a máquina. */
const INICIO_DO_DIARIO = "2026-09-14";
/** Quantas linhas do diário entram por vez ("Mostrar mais"). */
const LOTE = 60;
/** A partir de quantos segundos o carregamento inicial ganha aviso de lentidão. */
const LENTO_APOS_MS = 4000;
const GROTESK = "'Space Grotesk', sans-serif";
const MONO = "'DM Mono', ui-monospace, monospace";
/** Filtros da Gráfica, para os atalhos de ida e volta. */
const GRAFICA_EM_IMPRESSAO = "/grafica?status=inProduction";
const GRAFICA_LIBERADOS = "/grafica?status=ready_for_production,approved";

const TITULO: React.CSSProperties = { margin: 0, fontFamily: GROTESK, fontWeight: 800, color: T.text, letterSpacing: "-0.02em" };
const ROTULO_MICRO: React.CSSProperties = { fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.second };
/** Tom da etapa "Em Impressão" (o mesmo da pílula em lib/status). */
const IMP = P.orange;
const LIVRE = P.green;
const AMBAR = { text: "#b45309", bg: "#fffbeb", border: "#fde68a" };
const VERMELHO = { text: "#b91c1c", bg: "#fef2f2", border: "#fecaca" };

// ─── Helpers puros ────────────────────────────────────────────────────────────
function somarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

const diaBR = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;

function rotuloDoDia(dia: string, hoje: string): string {
  if (dia === hoje) return "Hoje";
  if (dia === somarDias(hoje, -1)) return "Ontem";
  return diaBR(dia);
}

/** "há 1h 20min" — quanto tempo a peça está na máquina. */
function haQuanto(iso: string | null, agora: number): string | null {
  if (!iso) return null;
  const minutos = Math.floor((agora - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(minutos) || minutos < 0) return null;
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h${minutos % 60 ? ` ${minutos % 60}min` : ""}`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} dia${dias > 1 ? "s" : ""}`;
}

/**
 * O que aconteceu naquele lançamento, em palavras do galpão (dono, 21/09):
 * "Iniciou a impressão", "Trocou para Impressora X", "Mandou 3 para acabamento
 * (4 de 10)", "Concluiu: 10 de 10 impressas". Correção (quantidade negativa)
 * diz para quanto o total foi corrigido.
 */
export function oQueAconteceu(r: Registro, rotuloMaquina: string): string {
  if (r.tipo === "inicio") return "Iniciou a impressão";
  if (r.tipo === "troca") return `Trocou para ${rotuloMaquina}`;
  const total = r.totalDepois == null ? "" : ` (${r.totalDepois} de ${r.aImprimir})`;
  if (r.quantidade < 0) return `Corrigiu para ${r.totalDepois ?? "?"} de ${r.aImprimir} (${r.quantidade})`;
  if (r.tipo === "conclusao") return `Concluiu: ${r.totalDepois ?? r.aImprimir} de ${r.aImprimir} impressas`;
  return `Mandou ${r.quantidade} para acabamento${total}`;
}

const TIPO_DO_REGISTRO: Record<Registro["tipo"], { rotulo: string; pal: { bg: string; border: string; text: string } }> = {
  inicio:    { rotulo: "Início",     pal: P.neutral },
  troca:     { rotulo: "Troca",      pal: P.amber },
  parcial:   { rotulo: "Impressas",  pal: P.orange },
  conclusao: { rotulo: "Concluída",  pal: P.green },
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** A peça do retrato no formato que o modal de impressão (e lib/saldo) lê. */
function pecaParaOModal(p: PecaNaMaquina): PecaParaImprimir {
  return {
    id: p.id,
    displayId: p.displayId,
    type: p.tipo,
    description: p.descricao,
    status: p.status,
    quantity: p.quantidade,
    quantityProduced: p.impressas,
    reuseQty: p.reuso,
    printMachine: p.maquina,
    productionStartedAt: p.desde,
    approvalThumbUrl: p.miniatura ? convertGCSUrlToLocalPath(p.miniatura) : null,
    event: p.eventoInfo ? { name: p.eventoInfo.name } : null,
  } as PecaParaImprimir;
}

// ─── Pedaços de interface ─────────────────────────────────────────────────────
/** Estilos de hover/foco que estilo inline não alcança — só desta tela. */
const CSS_DA_TELA = `
  .mq-acao { transition: background-color 0.12s, border-color 0.12s, color 0.12s; }
  .mq-acao:hover:not(:disabled) { background-color: #f5f5f4; }
  .mq-primario:hover:not(:disabled) { background-color: #000000; }
  .mq-chip:hover:not([aria-pressed="true"]) { background-color: #f5f5f4; border-color: #d6d3d1; }
  .mq-peca:hover { background-color: #fafaf9; }
  .mq-linha:hover > td { background-color: #fafaf9; }
  .mq-link:hover { text-decoration: underline; }
`;

/** "Atualizado há X" — relógio próprio, para o resto da tela não redesenhar a cada tique. */
function Atualizado({ em, buscando, fonte }: { em: number; buscando: boolean; fonte: number }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <span data-testid="atualizado-ha" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: fonte, color: T.second, whiteSpace: "nowrap" }}>
      {buscando
        ? <RotateCcw aria-hidden="true" className="animate-spin" style={{ width: 11, height: 11 }} />
        : <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: LIVRE.dot, flexShrink: 0 }} />}
      {buscando ? "Atualizando…" : em ? `Atualizado ${fmtRelative(new Date(em).toISOString(), agora)}` : "Ao vivo"}
    </span>
  );
}

function Pilula({ pal, children, testId, fonte = FS.small }: { pal: { bg: string; border: string; text: string; dot?: string }; children: React.ReactNode; testId?: string; fonte?: number }) {
  return (
    <span data-testid={testId} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: fonte, fontWeight: 800, padding: "3px 9px", borderRadius: R.pill, whiteSpace: "nowrap", color: pal.text, background: pal.bg, border: `1px solid ${pal.border}`, textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {pal.dot && <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: pal.dot }} />}
      {children}
    </span>
  );
}

/** Silhueta da tela enquanto carrega: reserva o espaço, nada empurra ao chegar. */
function Esqueleto({ lento }: { lento: boolean }) {
  const bloco = (w: string | number, h: number, extra?: React.CSSProperties) => (
    <div className="animate-pulse" aria-hidden="true" style={{ width: w, height: h, borderRadius: 4, background: "#e7e5e4", ...extra }} />
  );
  return (
    <div role="status" aria-busy="true" data-testid="maquinas-carregando" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <span className="sr-only">Carregando as máquinas…</span>
      {lento && (
        <p data-testid="maquinas-lento" style={{ margin: 0, fontSize: FS.body, color: AMBAR.text }}>
          Está demorando mais que o normal. A conexão do galpão pode estar lenta — a tela carrega assim que responder.
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>{bloco(120, 14)}{bloco(56, 18, { borderRadius: 999 })}</div>
            {bloco("80%", 12)}{bloco("100%", 6, { borderRadius: 999 })}{bloco("55%", 10)}
          </div>
        ))}
      </div>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: "flex", gap: 16, alignItems: "center", height: 46, padding: "0 14px", borderTop: i ? `1px solid ${T.low}` : "none" }}>
            {bloco(40, 10)}{bloco(`${34 - (i % 3) * 6}%`, 10)}{bloco(90, 10, { marginLeft: "auto" })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── A peça dentro do cartão da impressora ────────────────────────────────────
function PecaNoCartao({ p, agora, podeAgir, hojeMs, isMobile, onAgir }: {
  p: PecaNaMaquina; agora: number; podeAgir: boolean; hojeMs: number; isMobile: boolean; onAgir: (p: PecaNaMaquina) => void;
}) {
  const pct = p.aImprimir > 0 ? Math.min(100, Math.round((p.impressas / p.aImprimir) * 100)) : 0;
  const desde = haQuanto(p.desde, agora);
  const hora = horaDeInicio(p.desde);
  const selo = seloPecaEventoFinalizado(p.eventoInfo, hojeMs);
  const alvo = isMobile ? 44 : 34;
  const thumb = p.miniatura ? miniatura(convertGCSUrlToLocalPath(p.miniatura)) : undefined;
  const rotuloAcao = rotuloCurtoDaAcao(p.impressas, p.aImprimir);
  const concluir = rotuloAcao !== "Impressas";
  const [semThumb, setSemThumb] = useState(false);

  return (
    <div data-testid={`peca-na-maquina-${p.id}`} style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
        {/* A arte em miniatura: é o que o galpão reconhece de relance. */}
        <div aria-hidden="true" style={{ width: 48, height: 48, borderRadius: R.md, background: T.low, border: `1px solid ${T.border}`, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {thumb && !semThumb
            ? <img src={thumb} alt="" loading="lazy" decoding="async" onError={() => setSemThumb(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            : <Printer style={{ width: 16, height: 16, color: T.muted }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
            <span style={{ fontFamily: MONO, fontSize: FS.body, fontWeight: 700, color: T.accentText, flexShrink: 0 }}>{p.displayId ?? "—"}</span>
            <span style={{ fontSize: FS.body, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.tipo}</span>
          </div>
          {(p.evento || p.descricao) && (
            <div title={[p.evento, p.descricao].filter(Boolean).join(" · ")} style={{ fontSize: isMobile ? 12 : FS.small, color: T.second, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {[p.evento, p.descricao].filter(Boolean).join(" · ")}
            </div>
          )}
          <div style={{ fontSize: isMobile ? 12 : FS.small, color: T.second, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
            {hora ? `Desde ${hora}` : "Na máquina"}{desde ? ` · ${desde}` : ""}
          </div>
        </div>
      </div>

      {/* Progresso: o número em palavras (o que se lê) e a barra (o que se vê de longe). */}
      <div>
        <div data-testid={`progresso-${p.id}`} style={{ fontSize: isMobile ? 12 : FS.small, fontWeight: 700, color: IMP.text, fontVariantNumeric: "tabular-nums" }}>
          {progressoDaImpressao(p.impressas, p.aImprimir)}
        </div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={p.aImprimir} aria-valuenow={p.impressas} aria-label={`${p.displayId ?? "peça"}: ${p.impressas} de ${p.aImprimir} impressas`} style={{ height: 5, borderRadius: 999, background: IMP.border, marginTop: 5, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: IMP.dot, borderRadius: 999, transition: "width 0.2s" }} />
        </div>
      </div>

      {/* Ações: a principal (o mesmo modal da fila) e a volta para a Gráfica. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {podeAgir && (
          <button
            type="button"
            className="mq-acao mq-primario"
            onClick={() => { if (!selo) onAgir(p); }}
            disabled={!!selo}
            data-testid={`button-impressas-${p.id}`}
            title={selo
              ? motivoAcaoBloqueada(selo.motivo, "informar impressas")
              : concluir ? `Todas as ${p.aImprimir} saíram — mandar a peça para o acabamento` : `Informar quantas já saíram da ${rotuloDaMaquina(p.maquina)} (${progressoDaImpressao(p.impressas, p.aImprimir)})`}
            style={{ flex: "1 1 140px", minHeight: alvo, padding: "0 12px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: R.md, border: selo ? `1px solid ${T.border}` : "none", background: selo ? T.low : T.text, color: selo ? "#746e69" : "#fff", fontFamily: GROTESK, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: selo ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
          >
            <Play aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0 }} />
            {rotuloAcao}
          </button>
        )}
        <Link
          href={`/grafica?item=${p.id}`}
          className="mq-acao"
          data-testid={`link-peca-grafica-${p.id}`}
          title="Abrir esta peça na fila da Gráfica"
          style={{ flex: podeAgir ? "0 1 auto" : "1 1 140px", minHeight: alvo, padding: "0 10px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, color: T.text, fontSize: isMobile ? 13 : 12, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}
        >
          <ExternalLink aria-hidden="true" style={{ width: 12, height: 12, color: T.accentText }} />
          Ver na Gráfica
        </Link>
      </div>
      {selo && (
        <div data-testid={`selo-evento-${p.id}`} title={selo.hint} style={{ fontSize: isMobile ? 12 : FS.small, color: selo.text, fontWeight: 700 }}>
          {selo.label} — {selo.hint}
        </div>
      )}
    </div>
  );
}

// ─── Linha do diário (memoizada: pode haver centenas) ─────────────────────────
const LinhaDoDiario = memo(function LinhaDoDiario({ l, mostrarMaquina, acao, isMobile, hojeMs, onAgir }: {
  l: Linha; mostrarMaquina: boolean; acao: PecaNaMaquina | null; isMobile: boolean; hojeMs: number; onAgir: (p: PecaNaMaquina) => void;
}) {
  const meta = TIPO_DO_REGISTRO[l.tipo] ?? TIPO_DO_REGISTRO.parcial;
  const texto = oQueAconteceu(l, l.rotuloMaquina);
  // Evento finalizado: o mesmo bloqueio (e a mesma frase do 409) do cartão.
  const selo = acao ? seloPecaEventoFinalizado(acao.eventoInfo, hojeMs) : null;
  const botao = acao && (
    <button
      type="button"
      className="mq-acao"
      onClick={() => { if (!selo) onAgir(acao); }}
      disabled={!!selo}
      data-testid={`button-impressas-linha-${l.id}`}
      title={selo ? motivoAcaoBloqueada(selo.motivo, "informar impressas") : `Informar quantas já saíram — ${progressoDaImpressao(acao.impressas, acao.aImprimir)}`}
      style={{ minHeight: isMobile ? 44 : 30, padding: "0 10px", display: "inline-flex", alignItems: "center", gap: 5, borderRadius: R.md, border: `1px solid ${T.bdark}`, background: selo ? T.low : T.surface, color: selo ? "#746e69" : T.text, fontSize: 12, fontWeight: 700, cursor: selo ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
    >
      <Play aria-hidden="true" style={{ width: 11, height: 11, color: T.accentText }} />
      {rotuloCurtoDaAcao(acao.impressas, acao.aImprimir)}
    </button>
  );

  if (isMobile) {
    return (
      <div data-testid={`linha-diario-${l.id}`} style={{ padding: "10px 14px", borderTop: `1px solid ${T.low}`, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: T.second, fontVariantNumeric: "tabular-nums" }}>{l.hora}</span>
          <Pilula pal={meta.pal} fonte={isMobile ? 12 : FS.small}>{meta.rotulo}</Pilula>
          {mostrarMaquina && <span style={{ fontSize: 12, color: T.second }}>{l.rotuloMaquina}</span>}
        </div>
        <div style={{ fontSize: 13, color: T.text, fontWeight: 700 }}>{texto}</div>
        <Link href={`/grafica?item=${l.itemId}`} className="mq-link" style={{ textDecoration: "none", color: T.text, fontSize: 13, minHeight: 44, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ fontFamily: MONO, fontWeight: 700, color: T.accentText, flexShrink: 0 }}>{l.displayId ?? "—"}</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.tipoPeca}{l.evento ? ` · ${l.evento}` : ""}</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 12, color: T.second }}>{l.quem ?? "—"}</span>
          {botao}
        </div>
      </div>
    );
  }

  const td: React.CSSProperties = { padding: "8px 14px", whiteSpace: "nowrap", verticalAlign: "middle" };
  return (
    <tr className="mq-linha" data-testid={`linha-diario-${l.id}`} style={{ borderTop: `1px solid ${T.low}` }}>
      <td style={{ ...td, fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: T.second }}>{l.hora}</td>
      {mostrarMaquina && <td style={{ ...td, color: T.second }}>{l.rotuloMaquina}</td>}
      <td style={{ ...td, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>
        <Link href={`/grafica?item=${l.itemId}`} className="mq-link" title="Abrir na fila da Gráfica" style={{ textDecoration: "none", color: T.text }}>
          <span style={{ fontFamily: MONO, fontWeight: 700, color: T.accentText }}>{l.displayId ?? "—"}</span>{" "}
          {l.tipoPeca}
        </Link>
      </td>
      <td title={l.evento ?? undefined} style={{ ...td, color: T.second, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{l.evento ?? "—"}</td>
      <td style={td}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Pilula pal={meta.pal} fonte={isMobile ? 12 : FS.small}>{meta.rotulo}</Pilula>
          <span style={{ fontWeight: l.tipo === "parcial" || l.tipo === "conclusao" ? 700 : 500, color: T.text }}>{texto}</span>
        </span>
      </td>
      <td style={{ ...td, color: T.second }}>{l.quem ?? "—"}</td>
      <td style={{ ...td, textAlign: "right", paddingTop: 4, paddingBottom: 4 }}>{botao}</td>
    </tr>
  );
});

// ─── A página ─────────────────────────────────────────────────────────────────
export default function GraficaMaquinas() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  // Quem AGE: os mesmos papéis que os endpoints aceitam (grafica e admin). A
  // Solicitação vê a tela, mas não informa impressas — os botões nem aparecem.
  const podeAgir = user?.role === "grafica" || user?.role === "admin";
  const alvo = isMobile ? 44 : 34;

  // ── Recorte na URL: ?dia=AAAA-MM-DD&maquina=N ─────────────────────────────
  const search = useSearch();
  const [, navegar] = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const diaEscolhido = params.get("dia");          // null = hoje (o servidor decide o fuso)
  const maquinaFiltro = params.get("maquina") ?? ""; // "" = todas
  const escreverURL = (mudancas: Record<string, string | null>) => {
    const p = new URLSearchParams(search);
    for (const [k, v] of Object.entries(mudancas)) { if (v) p.set(k, v); else p.delete(k); }
    const qs = p.toString();
    navegar(`/grafica/maquinas${qs ? `?${qs}` : ""}`, { replace: true });
  };

  // ── Dados ─────────────────────────────────────────────────────────────────
  // A chave é [rota, "?dia=…"]: o queryFn padrão junta as duas sem barra, e a
  // invalidação por prefixo ("/api/grafica/maquinas" — WebSocket e modal de
  // impressão) alcança qualquer dia aberto.
  const { data, isLoading, isError, isFetching, refetch, dataUpdatedAt } = useQuery<Retrato>({
    queryKey: diaEscolhido ? ["/api/grafica/maquinas", `?dia=${diaEscolhido}`] : ["/api/grafica/maquinas"],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  // Aviso de lentidão só no carregamento INICIAL (depois há dado na tela).
  const [lento, setLento] = useState(false);
  useEffect(() => {
    if (!isLoading) return;
    const t = setTimeout(() => setLento(true), LENTO_APOS_MS);
    return () => clearTimeout(t);
  }, [isLoading]);

  // Relógio da tela (para "há 1h 20min"): anda junto com cada chegada de dado
  // e a cada minuto — sem tique por segundo.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    setAgora(Date.now());
    const t = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [dataUpdatedAt]);

  // ── O modal de impressão (o mesmo da fila) ────────────────────────────────
  const [pecaNoModal, setPecaNoModal] = useState<PecaNaMaquina | null>(null);
  const itemDoModal = useMemo(() => (pecaNoModal ? pecaParaOModal(pecaNoModal) : null), [pecaNoModal]);
  const hojeMs = todayBusinessMs();

  // ── Derivados ─────────────────────────────────────────────────────────────
  const hoje = data?.hoje ?? null;
  const dia = data?.dia ?? diaEscolhido;
  const ehHoje = !!hoje && dia === hoje;
  const maquinas = data?.maquinas ?? [];
  const totalImprimindo = maquinas.reduce((s, m) => s + m.imprimindo.length, 0) + (data?.semMaquina.length ?? 0);
  const unidadesDoDia = maquinas.reduce((s, m) => s + m.unidadesNoDia, 0);

  // Peças ainda em impressão, por id: a linha do diário ganha o botão de agir.
  const emImpressaoPorId = useMemo(() => {
    const mapa = new Map<string, PecaNaMaquina>();
    for (const m of maquinas) for (const p of m.imprimindo) mapa.set(p.id, p);
    return mapa;
  }, [maquinas]);

  // O diário é UM só (todas as máquinas), na ordem do dia; o chip filtra.
  const diario = useMemo<Linha[]>(() => {
    const linhas: Linha[] = [];
    for (const m of maquinas) for (const r of m.registros) linhas.push({ ...r, maquina: m.codigo, rotuloMaquina: m.rotulo });
    linhas.sort((a, b) => a.ordem - b.ordem);
    return maquinaFiltro ? linhas.filter((l) => l.maquina === maquinaFiltro) : linhas;
  }, [maquinas, maquinaFiltro]);

  // "Mostrar mais" sem efeito: o limite guarda o recorte a que pertence e
  // volta ao lote inicial quando o recorte muda.
  const chaveDoRecorte = `${dia ?? ""}|${maquinaFiltro}`;
  const [limite, setLimite] = useState<{ chave: string; n: number }>({ chave: chaveDoRecorte, n: LOTE });
  const visiveis = limite.chave === chaveDoRecorte ? limite.n : LOTE;
  const linhasVisiveis = diario.slice(0, visiveis);

  const irParaDia = (novo: string) => escreverURL({ dia: hoje && novo >= hoje ? null : novo });
  const maquinaFiltrada = maquinas.find((m) => m.codigo === maquinaFiltro) ?? null;
  const antesDoDiario = !!dia && dia < INICIO_DO_DIARIO;

  // Estilos repetidos
  const botaoNeutro: React.CSSProperties = { minHeight: alvo, padding: "0 12px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, color: T.text, fontSize: 12, fontWeight: 700, cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap" };
  const botaoIcone: React.CSSProperties = { height: alvo, width: alvo, borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: T.text };

  return (
    <div style={{ backgroundColor: T.bg, minHeight: "100%", padding: isMobile ? "12px 16px 48px" : "24px 24px 64px" }}>
      <style>{CSS_DA_TELA}</style>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: isMobile ? 18 : 24 }}>

        {/* ── Cabeçalho: onde estou, o que a tela faz, atalhos ── */}
        <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Link href="/grafica" data-testid="link-voltar-fila" className="mq-link" style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: isMobile ? 44 : undefined, fontSize: isMobile ? 12 : FS.small, fontWeight: 700, color: T.second, textDecoration: "none", width: "fit-content" }}>
            <ArrowLeft aria-hidden="true" style={{ width: 13, height: 13 }} /> Fila da Gráfica
          </Link>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h1 style={{ ...TITULO, fontSize: isMobile ? 22 : FS.h1, display: "flex", alignItems: "center", gap: 10 }}>
              <Printer aria-hidden="true" style={{ width: isMobile ? 18 : 22, height: isMobile ? 18 : 22, color: T.accentText }} />
              Máquinas
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {data && <Atualizado em={dataUpdatedAt} buscando={isFetching && !isLoading} fonte={isMobile ? 12 : FS.small} />}
              <Link href={GRAFICA_EM_IMPRESSAO} data-testid="link-grafica-em-impressao" className="mq-acao" title='Abrir a fila da Gráfica já filtrada em "Em Impressão"' style={botaoNeutro}>
                Em impressão na Gráfica <ArrowRight aria-hidden="true" style={{ width: 12, height: 12, color: T.accentText }} />
              </Link>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: FS.body, color: T.second, maxWidth: 680 }}>
            O que cada impressora está imprimindo agora — e o diário do que saiu de cada uma, dia a dia.
            {podeAgir && " Daqui você informa as impressas, manda para o acabamento ou troca de máquina."}
          </p>
        </header>

        {isLoading && <Esqueleto lento={lento} />}

        {isError && !data && (
          <div role="alert" data-testid="maquinas-erro" style={{ padding: "14px 16px", borderRadius: R.lg, background: VERMELHO.bg, border: `1px solid ${VERMELHO.border}`, color: VERMELHO.text, fontSize: FS.body, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span>Não foi possível carregar as máquinas. Confira a conexão e tente de novo.</span>
            <button type="button" onClick={() => refetch()} data-testid="button-tentar-novamente" style={{ minHeight: alvo, border: "none", borderRadius: R.md, background: VERMELHO.text, color: "#fff", fontWeight: 700, fontSize: 12, padding: "0 14px", cursor: "pointer" }}>
              Tentar novamente
            </button>
          </div>
        )}

        {data && (
          <>
            {isError && (
              <p role="status" data-testid="maquinas-erro-suave" style={{ margin: 0, fontSize: FS.small, color: AMBAR.text }}>
                A última atualização falhou — mostrando o retrato de {fmtRelative(new Date(dataUpdatedAt).toISOString(), agora)}. Tentando de novo em breve.
              </p>
            )}

            {/* ── 1 · AGORA ── */}
            <section aria-labelledby="titulo-agora" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <h2 id="titulo-agora" style={{ ...TITULO, fontSize: FS.title }}>Agora</h2>
                <span data-testid="resumo-agora" style={{ fontSize: FS.body, color: T.second }}>
                  {totalImprimindo === 0 ? "nenhuma peça em impressão" : `${plural(totalImprimindo, "peça", "peças")} em impressão`}
                </span>
              </div>

              {data.semMaquina.length > 0 && (
                <div role="status" data-testid="sem-maquina" style={{ padding: "11px 14px", borderRadius: R.lg, background: AMBAR.bg, border: `1px solid ${AMBAR.border}`, color: "#92400e", fontSize: isMobile ? 13 : 12.5, lineHeight: 1.5, display: "flex", gap: 8 }}>
                  <AlertTriangle aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2 }} />
                  <span>
                    <strong>{plural(data.semMaquina.length, "peça está", "peças estão")} em impressão sem máquina anotada</strong> — foram
                    iniciadas antes do controle por máquina. Abra na fila e escolha a impressora:{" "}
                    {data.semMaquina.map((p, i) => (
                      <span key={p.id}>
                        {i > 0 && ", "}
                        <Link href={`/grafica?item=${p.id}`} className="mq-link" style={{ color: "#92400e", fontWeight: 700 }}>{p.displayId ?? "peça"}</Link>
                      </span>
                    ))}
                  </span>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
                {maquinas.map((m) => {
                  const ocupada = m.imprimindo.length > 0;
                  return (
                    <article key={m.codigo} aria-label={m.rotulo} data-testid={`maquina-agora-${m.codigo}`} style={{ background: T.surface, border: `1px solid ${ocupada ? IMP.border : T.border}`, borderRadius: R.lg, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <h3 style={{ ...TITULO, fontSize: FS.strong, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.rotulo}</h3>
                        <Pilula pal={ocupada ? IMP : LIVRE} testId={`estado-${m.codigo}`} fonte={isMobile ? 12 : FS.small}>
                          {ocupada ? (m.imprimindo.length === 1 ? "Imprimindo" : `Imprimindo ${m.imprimindo.length}`) : "Livre"}
                        </Pilula>
                      </div>

                      {!ocupada && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <p style={{ margin: 0, fontSize: FS.body, color: T.second }}>Nenhuma peça nesta máquina.</p>
                          {podeAgir && (
                            <Link href={GRAFICA_LIBERADOS} className="mq-acao" data-testid={`link-escolher-peca-${m.codigo}`} title="Abrir a fila da Gráfica filtrada em Liberados para escolher o que imprimir" style={{ ...botaoNeutro, width: "fit-content" }}>
                              Escolher peça para imprimir <ArrowRight aria-hidden="true" style={{ width: 12, height: 12, color: T.accentText }} />
                            </Link>
                          )}
                        </div>
                      )}

                      {m.imprimindo.map((p) => (
                        <PecaNoCartao key={p.id} p={p} agora={agora} podeAgir={podeAgir} hojeMs={hojeMs} isMobile={isMobile} onAgir={setPecaNoModal} />
                      ))}

                      {/* Rodapé: o que saiu desta máquina no dia aberto — e o atalho para o diário dela. */}
                      <button
                        type="button"
                        className="mq-acao"
                        onClick={() => { escreverURL({ maquina: m.codigo }); document.getElementById("titulo-dia")?.scrollIntoView({ block: "start", behavior: "smooth" }); }}
                        data-testid={`resumo-dia-${m.codigo}`}
                        title={`Ver o diário da ${m.rotulo} neste dia`}
                        style={{ marginTop: "auto", minHeight: isMobile ? 44 : 32, padding: "6px 8px", border: "none", borderTop: `1px solid ${T.low}`, borderRadius: `0 0 ${R.sm}px ${R.sm}px`, background: "transparent", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: isMobile ? 12 : FS.small, color: T.second, fontVariantNumeric: "tabular-nums" }}
                      >
                        <span>
                          <span style={{ ...ROTULO_MICRO, fontSize: isMobile ? 12 : FS.micro }}>{dia && hoje ? rotuloDoDia(dia, hoje) : "Dia"}</span>{" "}
                          {m.unidadesNoDia === 0 && m.registros.length === 0
                            ? "nada impresso"
                            : `${plural(m.unidadesNoDia, "un. impressa", "un. impressas")} · ${plural(m.pecasNoDia, "peça", "peças")}`}
                        </span>
                        <ChevronRight aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0 }} />
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>

            {/* ── 2 · O DIÁRIO ── */}
            <section aria-labelledby="titulo-dia" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
                    <span aria-live="polite" style={{ minWidth: 92, textAlign: "center", fontSize: FS.body, fontWeight: 700, color: T.text }}>{rotuloDoDia(dia, hoje)}</span>
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
                      <button type="button" className="mq-acao mq-primario" onClick={() => escreverURL({ dia: null })} data-testid="dia-hoje" style={{ height: alvo, padding: "0 12px", borderRadius: R.md, border: "none", background: T.text, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        Hoje
                      </button>
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
                      style={{ minHeight: alvo, padding: "0 12px", borderRadius: R.pill, border: `1px solid ${ativo ? T.text : T.border}`, background: ativo ? T.text : T.surface, color: ativo ? "#fff" : T.text, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
                    >
                      {c.rotulo}
                      <span style={{ fontFamily: GROTESK, fontVariantNumeric: "tabular-nums", color: ativo ? "#d6d3d1" : T.second }}>{c.n}</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden" }}>
                {diario.length === 0 ? (
                  <div data-testid="diario-vazio" style={{ padding: isMobile ? "28px 16px" : "36px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <Printer aria-hidden="true" style={{ width: 22, height: 22, color: T.muted }} />
                    <p style={{ margin: 0, fontSize: FS.strong, fontWeight: 700, color: T.text }}>
                      {maquinaFiltrada
                        ? `Nada saiu da ${maquinaFiltrada.rotulo} ${ehHoje ? "hoje" : `em ${diaBR(dia!)}`}.`
                        : `Nenhuma impressão registrada ${ehHoje ? "hoje" : `em ${diaBR(dia!)}`}.`}
                    </p>
                    <p style={{ margin: 0, fontSize: FS.body, color: T.second, maxWidth: 420 }}>
                      {antesDoDiario
                        ? `O diário por máquina começa em ${diaBR(INICIO_DO_DIARIO)}: antes disso a impressão não anotava em qual máquina a peça saiu.`
                        : maquinaFiltrada
                          ? "Veja as outras impressoras ou escolha outro dia."
                          : "Ao iniciar uma impressão na Gráfica, ela aparece aqui."}
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
                      {maquinaFiltrada && (
                        <button type="button" className="mq-acao" onClick={() => escreverURL({ maquina: null })} data-testid="button-ver-todas" style={botaoNeutro}>Ver todas as impressoras</button>
                      )}
                      {!ehHoje && (
                        <button type="button" className="mq-acao" onClick={() => escreverURL({ dia: null })} style={botaoNeutro}>Voltar para hoje</button>
                      )}
                      {ehHoje && !maquinaFiltrada && podeAgir && (
                        <Link href={GRAFICA_LIBERADOS} className="mq-acao" style={botaoNeutro}>Ver peças liberadas <ArrowRight aria-hidden="true" style={{ width: 12, height: 12, color: T.accentText }} /></Link>
                      )}
                    </div>
                  </div>
                ) : isMobile ? (
                  <div data-testid="diario-cartoes">
                    {linhasVisiveis.map((l) => (
                      <LinhaDoDiario key={l.id} l={l} mostrarMaquina={!maquinaFiltro} acao={podeAgir ? emImpressaoPorId.get(l.itemId) ?? null : null} isMobile hojeMs={hojeMs} onAgir={setPecaNoModal} />
                    ))}
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table data-testid="diario-tabela" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 720 }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: T.second, background: T.bg }}>
                          {["Hora", ...(maquinaFiltro ? [] : ["Impressora"]), "Peça", "Evento", "O que aconteceu", "Quem", ""].map((h, i) => (
                            <th key={`${h}-${i}`} scope="col" style={{ padding: "9px 14px", ...ROTULO_MICRO, whiteSpace: "nowrap" }}>{h || <span className="sr-only">Ação</span>}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {linhasVisiveis.map((l) => (
                          <LinhaDoDiario key={l.id} l={l} mostrarMaquina={!maquinaFiltro} acao={podeAgir ? emImpressaoPorId.get(l.itemId) ?? null : null} isMobile={false} hojeMs={hojeMs} onAgir={setPecaNoModal} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {diario.length > visiveis && (
                  <div style={{ padding: 12, borderTop: `1px solid ${T.low}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: FS.small, color: T.second, fontVariantNumeric: "tabular-nums" }}>Mostrando {visiveis} de {diario.length} lançamentos</span>
                    <button type="button" className="mq-acao" onClick={() => setLimite({ chave: chaveDoRecorte, n: visiveis + LOTE })} data-testid="button-mostrar-mais" style={botaoNeutro}>
                      Mostrar mais {Math.min(LOTE, diario.length - visiveis)}
                    </button>
                  </div>
                )}
              </div>

              {diario.length > 0 && antesDoDiario && (
                <p data-testid="nota-inicio-historico" style={{ margin: 0, fontSize: isMobile ? 12 : FS.small, color: T.second }}>
                  O histórico por máquina começa em 14/09/2026: antes disso a impressão não anotava em qual máquina a peça saiu.
                </p>
              )}
            </section>
          </>
        )}
      </div>

      {/* O mesmo modal da fila da Gráfica: iniciar não cabe aqui (a peça já
          está na máquina), então ele abre direto em "informar impressas". */}
      <ModalImpressao item={itemDoModal} onFechar={() => setPecaNoModal(null)} />
    </div>
  );
}
