// ─────────────────────────────────────────────────────────────────────────────
// OS BLOCOS VISUAIS DA ANÁLISES — compartilhados por todas as abas.
//
// PORQUÊ ESTE ARQUIVO. Dez abas desenham as mesmas cinco coisas: um número
// que abre as peças, a barra do fluxo, a distribuição de idade, uma tabela
// ordenável e a gaveta com a lista. Se cada aba desenhasse o seu, o "12" da
// Visão geral teria um clique e o "12" da aba Arte outro — e o gestor teria de
// reaprender a tela a cada aba. Aqui é uma vez só.
//
// A REGRA QUE TODO BLOCO SEGUE: número que representa um conjunto de peças é
// CLICÁVEL e abre a gaveta com exatamente aquelas peças (ctx.abrirPecas). Zero
// não é botão — não há o que abrir —, mas continua sendo dito.
//
// A TELA É SÓ LEITURA. Nenhum bloco daqui muda dado: o máximo que um clique
// faz é abrir a gaveta, trocar de aba ou LEVAR à peça (link).
//
// ─── API (nomes estáveis — outras abas dependem deles) ──────────────────────
//
//   Formatação
//     fmtInt(n)                       → "1.234"
//     fmtDias(n | null)               → "3 dias" | "1 dia" | "—"
//     plural(n, "peça", "peças")      → escolhe a forma
//     fmtDia(ms | "YYYY-MM-DD")       → "12/10" (data-calendário, sem fuso)
//     fraseDoPrazo(leitura)           → { texto, tom } do prazo da etapa
//     idDaPeca(p)                     → "#0042" (nunca "##0042" — o displayId às vezes já tem #)
//
//   Estrutura
//     <SecaoDaAnalise id titulo descricao? acoes? testId? semMoldura? style?>…</SecaoDaAnalise>
//     <GradeDeNumeros minimo={170}>…cartões…</GradeDeNumeros>
//     <AvisoDeCobertura itens={[…frases…]} tom?="neutro"|"alerta" testId? />
//
//   Números clicáveis
//     <CartaoDeNumero ctx rotulo pecas titulo? subtitulo? valor? sub? tom? icone?
//                     compacto? acaoSecundaria? testId />
//         — o cartão da casa (CartaoKpi); o número é `pecas.length` (ou `valor`).
//     <BotaoDeContagem ctx pecas titulo subtitulo? tom? rotulo? testId? forte? />
//         — o número inline (célula de tabela, selo de linha).
//
//   Visualizações
//     <FluxoDeEtapas ctx etapas={EtapaNoEstado[]} aoAbrirFase?={(fase)=>…}
//                    agruparPorFase? mostrarEntregue? testId? />
//     <DistribuicaoDeIdade ctx grupo={GrupoDePecas} contexto="na Arte" testId? />
//     <TabelaCompacta<L> colunas linhas chave legenda ordemInicial? limite?
//                        vazio? aoClicarLinha? minLargura? testId? />
//         — coluna com `ocultarNoCelular` some abaixo de 768px (sem rolar de lado).
//     <ListaDePecas ctx leituras={LeituraDaPeca[]} limite? testId? />
//
//   Gaveta (a página monta UMA; as abas só chamam ctx.abrirPecas)
//     <GavetaDePecas aberta titulo subtitulo? pecas leitura aoFechar />
//
//   Operação do servidor (GET /api/analises/operacao)
//     <BlocoDaOperacao ctx titulo>{(op) => …}</BlocoDaOperacao>
//         — carregando / erro / ausente tratados; a aba só desenha o dado.
//     <NumeroDoServidor rotulo valor sub? testId? />
//         — agregado do servidor (não é lista de peças): mostrador, sem clique.
//     rotuloDaJanela(op)              → "nos últimos 30 dias" (a janela que o servidor usou)
//     <ListaDeBarras itens={[{ id, rotulo, valor, texto?, detalhe?, cor? }]} legenda testId? vazio? duasColunas? />
//         — ranking com barra proporcional ao maior (máquinas, motivos, setores).
//           `detalhe` pode trazer um BotaoDeContagem quando há peças por trás.
//           `duasColunas`: lista longa em 2 colunas quando cabe (lê de cima para baixo).
//
//   Textos compartilhados
//     TEXTO_DAS_TRAVADAS              → { rotulo, titulo, subtitulo, sub } do cartão de travadas
//
//   Provisório
//     <AbaProvisoria ctx fase titulo />  — o que as abas ainda não escritas mostram.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import {
  AlertTriangle, ArrowRight, Clock, Flag, Hourglass, Info, Lock, Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ModalHeader } from "@/components/modal-shell";
import { CartaoKpi } from "@/components/ui/cartao-kpi";
import { Selo, coresDoTom, type TomDoSelo } from "@/components/ui/selo";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { Segmentado } from "@/components/ui/abas";
import { EstadoErro, EstadoVazio } from "@/components/ui/estados";
import { T, N, TOM, FS, FW, R, FONT, MOTION, SHADOW } from "@/lib/theme";
import { getStatusLabel, getStatusMeta } from "@/lib/status";
import { tomDaIdade } from "@/lib/idade-na-fase";
import { urlPecaNoEvento } from "@/components/prazos/tokens";
import { useElementSize, useIsMobile } from "@/hooks/use-mobile";
import { statusDeExibicao } from "@shared/molde";
import type { OperacaoDaAnalise } from "@shared/analises-operacao-contract";
import {
  ETAPAS_DO_FLUXO, FAIXAS_DE_IDADE, FASES_DO_FLUXO,
  type EtapaNoEstado, type FaixaDeIdade, type FaseDoFluxo, type GrupoDePecas, type LeituraDaPeca, type LeitorDePeca,
} from "@/lib/analises-estado";
import type { ContextoDaAnalise, PecaDaAnalise } from "./contexto";

// ─── Formatação ──────────────────────────────────────────────────────────────

export const fmtInt = (n: number): string => Math.round(n).toLocaleString("pt-BR");

export function fmtDias(n: number | null | undefined): string {
  if (n == null) return "—";
  const r = Math.round(n * 10) / 10;
  const txt = Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ",");
  return `${txt} ${r === 1 ? "dia" : "dias"}`;
}

export const plural = (n: number, um: string, muitos: string): string => (n === 1 ? um : muitos);

/** "12/10" de um dia-calendário (ms UTC-meia-noite ou "YYYY-MM-DD"). Sem fuso: é data, não instante. */
export function fmtDia(v: number | string | null | undefined): string {
  if (v == null) return "—";
  if (typeof v === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    return m ? `${m[3]}/${m[2]}` : "—";
  }
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return "—";
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * O ID da peça como a casa o escreve: "#0042". O displayId às vezes já vem com
 * o "#" gravado — sem esta normalização a tela mostrava "##0042".
 */
export function idDaPeca(p: { id: string; displayId?: string | null }): string {
  const bruto = String(p.displayId ?? "").trim().replace(/^#+/, "");
  return `#${bruto || p.id.slice(0, 8)}`;
}

/** Números em coluna: dígitos da mesma largura, senão "111" e "888" não se alinham. */
const TABULAR: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

/** A frase do prazo da etapa de uma peça, com o tom de urgência. */
export function fraseDoPrazo(l: LeituraDaPeca): { texto: string; tom: TomDoSelo } {
  if (l.situacao === "entregue") return { texto: "Entregue", tom: "sucesso" };
  if (l.situacao === "fora") return { texto: "Fora do fluxo", tom: "neutro" };
  if (l.situacao === "eventoFinalizado") {
    return { texto: l.eventoFinalizado === "encerrado" ? "Evento encerrado — fora da conta de prazos" : "Evento já realizado — fora da conta de prazos", tom: "neutro" };
  }
  if (!l.prazo) return { texto: "Sem prazo: o evento não tem saída válida", tom: "neutro" };
  const isenta = l.prazo.cobradaPorOutraEtapa ? " (isenta de aprovação)" : "";
  const d = l.prazo.diasRestantes;
  if (d < 0) return { texto: `${l.prazo.rotulo}${isenta} venceu há ${fmtDias(-d)}`, tom: "perigo" };
  if (d === 0) return { texto: `${l.prazo.rotulo}${isenta} vence hoje`, tom: "alerta" };
  if (d <= 3) return { texto: `${l.prazo.rotulo}${isenta} vence em ${fmtDias(d)}`, tom: "alerta" };
  return { texto: `${l.prazo.rotulo}${isenta} vence ${fmtDia(l.prazo.dia)}`, tom: "neutro" };
}

// ─── Estrutura ───────────────────────────────────────────────────────────────

export function SecaoDaAnalise({
  id, titulo, descricao, acoes, children, testId, semMoldura = false, style,
}: {
  /** Por cima do padrão (ex.: `flex: 1` para a seção esticar até o fim da coluna). */
  style?: React.CSSProperties;
  /** id do <h2> — a seção diz `aria-labelledby` dele. */
  id: string;
  titulo: string;
  descricao?: React.ReactNode;
  acoes?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
  /** Sem cartão branco (para seções que já são uma faixa de cartões). */
  semMoldura?: boolean;
}) {
  const isMobile = useIsMobile();
  return (
    <section
      aria-labelledby={id}
      data-testid={testId}
      style={semMoldura ? { minWidth: 0, ...style } : {
        backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg,
        padding: isMobile ? "16px 14px" : "20px 22px", minWidth: 0, ...style,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", columnGap: 16, rowGap: 8, marginBottom: 14 }}>
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <h2 id={id} style={{ margin: 0, fontFamily: FONT.display, fontSize: FS.title, fontWeight: FW.forte, letterSpacing: "-0.02em", color: T.text, lineHeight: 1.25 }}>
            {titulo}
          </h2>
          {descricao && (
            <p style={{ margin: "4px 0 0", fontSize: FS.small, lineHeight: 1.5, color: T.second, maxWidth: 760 }}>{descricao}</p>
          )}
        </div>
        {acoes && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>{acoes}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * A GRADE DOS NÚMEROS, COM LINHAS EQUILIBRADAS. O `auto-fit` puro põe quantos
 * cabem e deixa o resto sozinho embaixo: seis cartões em 1366px viravam 5 + 1
 * — um cartão órfão e quatro buracos. Aqui a grade mede a própria largura e
 * escolhe o número de colunas que divide as linhas por igual (6 → 3 + 3, não
 * 4 + 2). O que sobra numa linha incompleta ESTICA, em vez de deixar vão.
 *
 * `minimo` é a largura em que o RÓTULO do cartão cabe inteiro (o CartaoKpi não
 * quebra o rótulo fora do celular — ele cortaria com reticência).
 */
export function GradeDeNumeros({ children, minimo = 170, rotulo, testId }: {
  children: React.ReactNode; minimo?: number; rotulo?: string; testId?: string;
}) {
  const GAP = 12;
  const { ref, width } = useElementSize<HTMLDivElement>();
  const itens = React.Children.toArray(children).filter(Boolean);
  const n = itens.length;
  // Sem medida (primeiro quadro, jsdom): a grade auto-fit de sempre.
  let colunas = 0;
  if (width > 0 && n > 0) {
    const cabem = Math.max(1, Math.floor((width + GAP) / (minimo + GAP)));
    const linhas = Math.ceil(n / Math.min(cabem, n));
    colunas = Math.ceil(n / linhas);
  }
  return (
    <div
      ref={ref}
      role={rotulo ? "group" : undefined}
      aria-label={rotulo}
      data-testid={testId}
      style={colunas > 0
        ? { display: "flex", flexWrap: "wrap", gap: GAP }
        : { display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(${minimo}px, 100%), 1fr))`, gap: GAP }}
    >
      {colunas > 0
        ? itens.map((filho, i) => (
          <div key={i} style={{ display: "grid", minWidth: 0, flex: `1 1 calc((100% - ${(colunas - 1) * GAP}px) / ${colunas})` }}>{filho}</div>
        ))
        : itens}
    </div>
  );
}

/** A nota de método/cobertura: o que o número NÃO inclui e por quê. Nada some em silêncio. */
export function AvisoDeCobertura({ itens, tom = "neutro", testId = "aviso-cobertura" }: {
  itens: Array<React.ReactNode | null | false | undefined>;
  tom?: "neutro" | "alerta";
  testId?: string;
}) {
  const vivos = itens.filter(Boolean) as React.ReactNode[];
  if (vivos.length === 0) return null;
  const c = tom === "alerta" ? TOM.alerta : null;
  return (
    <div
      data-testid={testId}
      style={{
        display: "flex", gap: 8, alignItems: "flex-start",
        padding: c ? "10px 12px" : 0, borderRadius: R.md,
        backgroundColor: c ? c.bg : "transparent", border: c ? `1px solid ${c.border}` : "none",
      }}
    >
      {tom === "alerta"
        ? <AlertTriangle aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2, color: TOM.alerta.text }} />
        : <Info aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0, marginTop: 2, color: T.muted }} />}
      <p style={{ margin: 0, fontSize: FS.small, lineHeight: 1.55, color: c ? c.text : T.second, maxWidth: 900 }}>
        {vivos.map((v, i) => <React.Fragment key={i}>{i > 0 && " "}{v}</React.Fragment>)}
      </p>
    </div>
  );
}

// ─── Números clicáveis ───────────────────────────────────────────────────────

/**
 * O CARTÃO DE NÚMERO. É o <CartaoKpi> da casa no papel de NAVEGAÇÃO (o clique
 * abre a gaveta — não liga um filtro, então sem aria-pressed). Com zero peças
 * vira mostrador: não há lista a abrir.
 */
export function CartaoDeNumero({
  ctx, rotulo, pecas, titulo, subtitulo, valor, sub, tom = "neutro", icone, compacto, acaoSecundaria, testId,
}: {
  ctx: Pick<ContextoDaAnalise, "abrirPecas">;
  rotulo: string;
  pecas: PecaDaAnalise[];
  /** Título da gaveta (pd. o rótulo). */
  titulo?: string;
  subtitulo?: string;
  /** Valor exibido, quando não é a contagem (ex.: "82%"). */
  valor?: React.ReactNode;
  sub?: React.ReactNode;
  tom?: TomDoSelo;
  icone?: LucideIcon;
  compacto?: boolean;
  acaoSecundaria?: React.ReactNode;
  testId?: string;
}) {
  const n = pecas.length;
  const abre = n > 0;
  return (
    <CartaoKpi
      data-testid={testId}
      rotulo={rotulo}
      valor={<span style={TABULAR}>{valor ?? fmtInt(n)}</span>}
      sub={sub}
      // Sem notícia, sem cor: zero atrasadas não é alarme.
      tom={n > 0 ? tom : "neutro"}
      icone={icone}
      compacto={compacto}
      navegacao={abre}
      onClick={abre ? () => ctx.abrirPecas(titulo ?? rotulo, pecas, subtitulo) : undefined}
      ariaLabel={abre ? `${rotulo}: ${fmtInt(n)} ${plural(n, "peça", "peças")}. Abrir a lista.` : `${rotulo}: nenhuma peça.`}
      acaoSecundaria={acaoSecundaria}
    />
  );
}

/** O número inline: célula de tabela, selo de linha. Zero vira "—" (ou `vazio`). */
export function BotaoDeContagem({
  ctx, pecas, titulo, subtitulo, tom = "neutro", rotulo, testId, forte = false, vazio = "—", sufixo,
}: {
  ctx: Pick<ContextoDaAnalise, "abrirPecas">;
  pecas: PecaDaAnalise[];
  titulo: string;
  subtitulo?: string;
  tom?: TomDoSelo;
  /** Nome acessível do conjunto ("atrasadas na Arte"). */
  rotulo?: string;
  testId?: string;
  forte?: boolean;
  vazio?: string;
  /** Texto depois do número ("atrasadas"). */
  sufixo?: string;
}) {
  const n = pecas.length;
  if (n === 0) {
    return <span data-testid={testId} style={{ ...TABULAR, color: T.second, fontSize: FS.body }} aria-label={rotulo ? `${rotulo}: nenhuma` : undefined}>{vazio}</span>;
  }
  const cor = tom === "neutro" ? T.text : coresDoTom(tom).text;
  return (
    <button
      type="button"
      data-testid={testId}
      className="ds-botao ds-botao-fantasma"
      onClick={() => ctx.abrirPecas(titulo, pecas, subtitulo)}
      aria-label={`${rotulo ?? titulo}: ${fmtInt(n)} ${plural(n, "peça", "peças")}. Abrir a lista.`}
      title="Ver as peças"
      style={{
        ...TABULAR,
        display: "inline-flex", alignItems: "center", gap: 4,
        minHeight: 28, padding: "2px 6px", margin: "-2px -6px",
        border: "none", borderRadius: R.sm, background: "transparent", cursor: "pointer",
        fontFamily: "inherit", fontSize: FS.body, fontWeight: forte ? FW.rotulo : FW.forte, color: cor,
        textDecoration: "underline", textDecorationColor: T.bdark, textUnderlineOffset: 3,
      }}
    >
      {fmtInt(n)}{sufixo ? <span style={{ fontWeight: FW.medio }}>{sufixo}</span> : null}
    </button>
  );
}

/** Selo clicável de estado (atrasadas, paradas, travadas) — some quando zero. */
function SeloDeContagem({ ctx, pecas, titulo, tom, icone, texto, testId }: {
  ctx: Pick<ContextoDaAnalise, "abrirPecas">; pecas: PecaDaAnalise[]; titulo: string; tom: TomDoSelo; icone: LucideIcon; texto: string; testId?: string;
}) {
  if (pecas.length === 0) return null;
  const c = coresDoTom(tom);
  const Icone = icone;
  return (
    <button
      type="button"
      data-testid={testId}
      className="ds-botao"
      onClick={() => ctx.abrirPecas(titulo, pecas)}
      aria-label={`${fmtInt(pecas.length)} ${texto}. Abrir a lista.`}
      style={{
        ...TABULAR, display: "inline-flex", alignItems: "center", gap: 4, minHeight: 26, padding: "2px 8px",
        borderRadius: R.pill, border: `1px solid ${c.border}`, backgroundColor: c.bg, color: c.text,
        fontSize: FS.small, fontWeight: FW.forte, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
      }}
    >
      <Icone aria-hidden="true" style={{ width: 12, height: 12 }} />
      {fmtInt(pecas.length)} {texto}
    </button>
  );
}

// ─── O fluxo de etapas ───────────────────────────────────────────────────────

/**
 * O FLUXO INTEIRO, etapa por etapa. Cada linha diz quantas peças estão ali
 * (barra proporcional + número), quantas passaram do prazo da etapa, quantas
 * estão paradas há 14+ dias e quantas travadas — tudo clicável. A barra mede
 * contra a MAIOR fila: o que importa é onde está a massa, não o total.
 *
 * Entregue fica fora da escala: é o acumulado da história e esmagaria as
 * barras do trabalho vivo. Aparece no fim, com o número dele.
 */
/**
 * A Arte aparece DUAS vezes no fluxo. "ARTE · 8" e, três linhas abaixo,
 * "ARTE · 4" pareciam o mesmo número dito duas vezes; o trecho diz qual é.
 */
const ROTULO_DO_TRECHO: Partial<Record<string, string>> = {
  awaiting_submission: "Arte · criação",
  awaiting_finalization: "Arte · finalização",
};

export function FluxoDeEtapas({
  ctx, etapas, aoAbrirFase, agruparPorFase = true, mostrarEntregue = true, testId = "fluxo-de-etapas",
}: {
  ctx: Pick<ContextoDaAnalise, "abrirPecas">;
  etapas: EtapaNoEstado<PecaDaAnalise>[];
  aoAbrirFase?: (fase: FaseDoFluxo) => void;
  agruparPorFase?: boolean;
  mostrarEntregue?: boolean;
  testId?: string;
}) {
  const isMobile = useIsMobile();
  const vivas = etapas.filter((e) => e.etapa !== "delivered");
  const maior = Math.max(1, ...vivas.map((e) => e.pecas.length));
  const entregue = etapas.find((e) => e.etapa === "delivered");

  // Grupos contíguos por fase, na ordem do fluxo (a Arte aparece duas vezes).
  const blocos: { fase: FaseDoFluxo | null; etapas: EtapaNoEstado<PecaDaAnalise>[] }[] = [];
  for (const e of vivas) {
    const ultimo = blocos[blocos.length - 1];
    if (agruparPorFase && ultimo && ultimo.fase === e.fase) ultimo.etapas.push(e);
    else blocos.push({ fase: agruparPorFase ? e.fase : null, etapas: [e] });
  }

  const linha = (e: EtapaNoEstado<PecaDaAnalise>) => {
    const pct = (e.pecas.length / maior) * 100;
    const titulo = e.rotulo;
    // Os selos moram numa LINHA PRÓPRIA, embaixo do rótulo, que quebra — em
    // todas as larguras. Numa quarta coluna eles se empilhavam e, em 1366,
    // vazavam para fora do cartão ("6 paradas 14+ dias" passava da borda).
    const temSelo = e.atrasadas.length + e.paradas.length + e.travadas.length > 0;
    return (
      <li
        key={e.etapa}
        data-testid={`fluxo-etapa-${e.etapa}`}
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr auto" : "minmax(130px, 200px) minmax(60px, 1fr) 56px",
          alignItems: "center", columnGap: 12, rowGap: 6, padding: "8px 0",
          borderTop: `1px solid ${N.n3}`,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: R.pill, backgroundColor: e.cores.dot, flexShrink: 0 }} />
          <span style={{ fontSize: FS.body, fontWeight: FW.medio, color: T.text, lineHeight: 1.3 }}>{e.rotulo}</span>
        </span>
        {isMobile && (
          <span style={{ textAlign: "right" }}>
            <BotaoDeContagem ctx={ctx} pecas={e.pecas} titulo={titulo} rotulo={`Peças em ${e.rotulo}`} forte vazio="0" testId={`fluxo-n-${e.etapa}`} />
          </span>
        )}
        <span
          aria-hidden="true"
          style={{
            gridColumn: isMobile ? "1 / -1" : undefined,
            height: 10, borderRadius: R.pill, backgroundColor: N.n2, overflow: "hidden",
          }}
        >
          <span style={{ display: "block", height: "100%", width: `${pct}%`, minWidth: e.pecas.length > 0 ? 3 : 0, backgroundColor: e.cores.dot, borderRadius: R.pill, transition: `width ${MOTION.media} ${MOTION.saida}` }} />
        </span>
        {!isMobile && (
          <span style={{ textAlign: "right" }}>
            <BotaoDeContagem ctx={ctx} pecas={e.pecas} titulo={titulo} rotulo={`Peças em ${e.rotulo}`} forte vazio="0" testId={`fluxo-n-${e.etapa}`} />
          </span>
        )}
        {temSelo && (
          <span style={{ display: "flex", flexWrap: "wrap", gap: 6, gridColumn: "1 / -1", minWidth: 0, paddingLeft: 17 }}>
            <SeloDeContagem ctx={ctx} pecas={e.atrasadas} titulo={`${e.rotulo} — atrasadas na etapa`} tom="perigo" icone={AlertTriangle} texto={plural(e.atrasadas.length, "atrasada", "atrasadas")} testId={`fluxo-atrasadas-${e.etapa}`} />
            <SeloDeContagem ctx={ctx} pecas={e.paradas} titulo={`${e.rotulo} — paradas há 14 dias ou mais`} tom="alerta" icone={Hourglass} texto={plural(e.paradas.length, "parada 14+ dias", "paradas 14+ dias")} testId={`fluxo-paradas-${e.etapa}`} />
            <SeloDeContagem ctx={ctx} pecas={e.travadas} titulo={`${e.rotulo} — travadas`} tom="roxo" icone={Lock} texto={plural(e.travadas.length, "travada", "travadas")} testId={`fluxo-travadas-${e.etapa}`} />
          </span>
        )}
      </li>
    );
  };

  return (
    <div data-testid={testId}>
      {blocos.map((b, i) => {
        const fase = b.fase ? FASES_DO_FLUXO.find((f) => f.id === b.fase) : null;
        const total = b.etapas.reduce((t, e) => t + e.pecas.length, 0);
        return (
          <div key={`${b.fase}-${i}`} style={{ marginTop: i === 0 ? 0 : 14 }}>
            {fase && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", paddingBottom: 4 }}>
                <span style={{ fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.12em", textTransform: "uppercase", color: T.second }}>
                  {ROTULO_DO_TRECHO[b.etapas[0].etapa] ?? fase.rotulo} · <span style={TABULAR}>{fmtInt(total)}</span>
                </span>
                {aoAbrirFase && (
                  <button
                    type="button"
                    className="ds-botao ds-botao-fantasma"
                    data-testid={`fluxo-abrir-fase-${fase.id}-${i}`}
                    onClick={() => aoAbrirFase(fase.id)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 4, minHeight: 28, padding: "2px 8px",
                      border: "none", borderRadius: R.sm, background: "transparent", cursor: "pointer",
                      fontFamily: "inherit", fontSize: FS.small, fontWeight: FW.forte, color: T.accentText,
                    }}
                  >
                    Abrir a aba {fase.rotulo}
                    <ArrowRight aria-hidden="true" style={{ width: 12, height: 12 }} />
                  </button>
                )}
              </div>
            )}
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>{b.etapas.map(linha)}</ul>
          </div>
        );
      })}
      {mostrarEntregue && entregue && (
        <div
          data-testid="fluxo-etapa-delivered"
          style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
        >
          <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: R.pill, backgroundColor: entregue.cores.dot }} />
          <span style={{ fontSize: FS.body, fontWeight: FW.medio, color: T.text }}>Entregue</span>
          <BotaoDeContagem ctx={ctx} pecas={entregue.pecas} titulo="Entregues" rotulo="Peças entregues" forte vazio="0" testId="fluxo-n-delivered" />
          <span style={{ fontSize: FS.small, color: T.second }}>— o acumulado do recorte; fica fora da escala das barras.</span>
        </div>
      )}
    </div>
  );
}

// ─── Distribuição de idade ───────────────────────────────────────────────────

const COR_DA_FAIXA: Record<FaixaDeIdade, { dot: string; text: string }> = {
  "0-6": { dot: TOM.neutro.dot, text: T.strong },
  "7-13": { dot: TOM.alerta.dot, text: TOM.alerta.text },
  "14+": { dot: TOM.perigo.dot, text: TOM.perigo.text },
  desconhecida: { dot: N.n4, text: T.second },
};

/**
 * HÁ QUANTO TEMPO PARADAS. A régua da casa (7/14 dias) em quatro faixas, e a
 * quarta é honesta: peça sem `statusChangedAt` tem idade DESCONHECIDA — não
 * "0 dias". Somá-la à rotina esconderia justamente as peças mais antigas, que
 * são as que nasceram antes de o carimbo existir.
 */
export function DistribuicaoDeIdade({ ctx, grupo, contexto, testId = "distribuicao-idade" }: {
  ctx: Pick<ContextoDaAnalise, "abrirPecas">;
  grupo: GrupoDePecas<PecaDaAnalise>;
  /** Onde ("na Arte", "em andamento") — entra no título da gaveta. */
  contexto: string;
  testId?: string;
}) {
  const total = grupo.pecas.length;
  if (total === 0) {
    return <p data-testid={testId} style={{ margin: 0, fontSize: FS.small, color: T.second }}>Nenhuma peça {contexto} — sem idade para medir.</p>;
  }
  return (
    <div data-testid={testId}>
      <div aria-hidden="true" style={{ display: "flex", height: 12, borderRadius: R.pill, overflow: "hidden", backgroundColor: N.n2, border: `1px solid ${T.border}` }}>
        {FAIXAS_DE_IDADE.map((f) => {
          const n = grupo.idade[f.id].length;
          return n > 0 ? <span key={f.id} style={{ width: `${(n / total) * 100}%`, backgroundColor: COR_DA_FAIXA[f.id].dot }} /> : null;
        })}
      </div>
      <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))", gap: 8 }}>
        {FAIXAS_DE_IDADE.map((f) => {
          const pecas = grupo.idade[f.id];
          const pct = Math.round((pecas.length / total) * 100);
          return (
            <li key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: COR_DA_FAIXA[f.id].dot, flexShrink: 0 }} />
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontSize: FS.small, color: T.second, lineHeight: 1.3 }}>{f.rotulo}</span>
                <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <BotaoDeContagem
                    ctx={ctx} pecas={pecas} forte vazio="0"
                    tom={f.id === "14+" ? "perigo" : f.id === "7-13" ? "alerta" : "neutro"}
                    titulo={`${f.rotulo} ${contexto}`}
                    rotulo={`${f.rotulo} ${contexto}`}
                    testId={`idade-${f.id}`}
                  />
                  <span style={{ ...TABULAR, fontSize: FS.small, color: T.second }}>{pct}%</span>
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {grupo.diasMediana != null && (
        <p style={{ margin: "8px 0 0", fontSize: FS.small, color: T.second }}>
          Mediana: <strong style={{ ...TABULAR, color: T.text }}>{fmtDias(grupo.diasMediana)}</strong> na mesma etapa
          {grupo.maisAntiga && <> · a mais antiga está parada há <strong style={{ ...TABULAR, color: tomDaIdade(grupo.maisAntiga.diasNaFase ?? 0).cor }}>{fmtDias(grupo.maisAntiga.diasNaFase)}</strong></>}.
        </p>
      )}
    </div>
  );
}

// ─── Tabela compacta ordenável ───────────────────────────────────────────────

export interface ColunaDaTabela<L> {
  id: string;
  rotulo: string;
  alinhar?: "esquerda" | "direita";
  /** O valor de ORDENAÇÃO (e o exibido, quando não há `render`). */
  valor: (l: L) => number | string | null;
  render?: (l: L) => React.ReactNode;
  ordenavel?: boolean;
  /** Dica do cabeçalho (o que a coluna conta). */
  titulo?: string;
  largura?: number | string;
  /**
   * Coluna SECUNDÁRIA: some abaixo de 768px. No celular a tabela mostra só o
   * que importa (nome, peças, atrasadas) sem rolar de lado — rolar escondia
   * justamente a coluna de atraso. O detalhe continua na gaveta.
   */
  ocultarNoCelular?: boolean;
}

export function TabelaCompacta<L>({
  colunas, linhas, chave, legenda, ordemInicial, limite = 10, vazio = "Nada para mostrar neste recorte.", aoClicarLinha, minLargura = 560, testId = "tabela",
}: {
  colunas: ColunaDaTabela<L>[];
  linhas: L[];
  chave: (l: L) => string;
  /** <caption> (lido por leitor de tela; visualmente oculto). */
  legenda: string;
  ordemInicial?: { coluna: string; direcao: "asc" | "desc" };
  limite?: number;
  vazio?: string;
  /** Clique na linha (fora dos números): abre algo. Os números continuam abrindo o seu conjunto. */
  aoClicarLinha?: (l: L) => void;
  minLargura?: number;
  testId?: string;
}) {
  const isMobile = useIsMobile();
  // Compacta também quando a tabela TRANSBORDA o próprio cartão, não só no
  // celular: no tablet (768) a barra lateral aberta deixa ~480px e a tabela
  // cortava colunas (02/10). A cada mudança de largura volta a tentar a
  // versão cheia e mede de novo — assim, se o cartão crescer, as colunas voltam.
  const { ref: refDaTabela, width: larguraDaTabela } = useElementSize<HTMLDivElement>();
  const refDaRolagem = React.useRef<HTMLDivElement>(null);
  const [transborda, setTransborda] = React.useState(false);
  React.useLayoutEffect(() => { setTransborda(false); }, [larguraDaTabela]);
  React.useLayoutEffect(() => {
    const el = refDaRolagem.current;
    if (!transborda && el && el.scrollWidth > el.clientWidth + 1) setTransborda(true);
  });
  if (isMobile || transborda) {
    colunas = colunas.filter((c) => !c.ocultarNoCelular);
    minLargura = 0;
  }
  const [ordem, setOrdem] = React.useState(ordemInicial ?? null);
  const [todas, setTodas] = React.useState(false);
  const ordenadas = React.useMemo(() => {
    if (!ordem) return linhas;
    const col = colunas.find((c) => c.id === ordem.coluna);
    if (!col) return linhas;
    const sinal = ordem.direcao === "asc" ? 1 : -1;
    return [...linhas].sort((a, b) => {
      const va = col.valor(a); const vb = col.valor(b);
      // Vazio sempre por último, nos dois sentidos: "—" no topo não é o maior de nada.
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * sinal;
      return String(va).localeCompare(String(vb), "pt-BR") * sinal;
    });
  }, [linhas, colunas, ordem]);
  const visiveis = todas ? ordenadas : ordenadas.slice(0, limite);

  if (linhas.length === 0) {
    return <p data-testid={`${testId}-vazia`} style={{ margin: 0, fontSize: FS.small, color: T.second }}>{vazio}</p>;
  }

  const th: React.CSSProperties = {
    padding: isMobile ? "8px 6px" : "8px 10px", fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.1em", textTransform: "uppercase",
    color: T.second, borderBottom: `1px solid ${T.bdark}`, backgroundColor: T.low,
    // No celular o cabeçalho quebra em vez de empurrar a tabela para fora da tela.
    whiteSpace: isMobile ? "normal" : "nowrap",
  };
  const respiro = isMobile ? "8px 6px" : "8px 10px";
  return (
    <div data-testid={testId} ref={refDaTabela}>
      <div ref={refDaRolagem} style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: minLargura }}>
          <caption className="sr-only">{legenda}</caption>
          <thead>
            <tr>
              {colunas.map((c) => {
                const ativa = ordem?.coluna === c.id;
                const alinhar = c.alinhar === "direita" ? "right" : "left";
                return (
                  <th
                    key={c.id} scope="col" title={c.titulo}
                    aria-sort={ativa ? (ordem!.direcao === "asc" ? "ascending" : "descending") : undefined}
                    style={{ ...th, textAlign: alinhar, width: c.largura, padding: c.ordenavel ? 0 : th.padding }}
                  >
                    {c.ordenavel ? (
                      <button
                        type="button"
                        data-testid={`${testId}-ordem-${c.id}`}
                        onClick={() => setOrdem((o) => ({ coluna: c.id, direcao: o?.coluna === c.id && o.direcao === "desc" ? "asc" : "desc" }))}
                        style={{
                          width: "100%", padding: respiro, border: "none", background: "none", cursor: "pointer",
                          font: "inherit", letterSpacing: "inherit", textTransform: "inherit", textAlign: alinhar,
                          color: ativa ? T.accentText : T.second,
                        }}
                      >
                        {c.rotulo}{ativa ? (ordem!.direcao === "desc" ? " ▾" : " ▴") : ""}
                      </button>
                    ) : c.rotulo}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr
                key={chave(l)}
                data-testid={`${testId}-linha`}
                onClick={aoClicarLinha ? (e) => {
                  // O clique num número abre o conjunto dele, não a linha.
                  if ((e.target as HTMLElement).closest("button, a")) return;
                  aoClicarLinha(l);
                } : undefined}
                style={{ borderBottom: `1px solid ${N.n3}`, cursor: aoClicarLinha ? "pointer" : "default" }}
              >
                {colunas.map((c, i) => {
                  const conteudo = c.render ? c.render(l) : (c.valor(l) ?? "—");
                  const Cel = i === 0 ? "th" : "td";
                  return (
                    <Cel
                      key={c.id}
                      scope={i === 0 ? "row" : undefined}
                      style={{
                        ...TABULAR, padding: isMobile ? "9px 6px" : "9px 10px", fontSize: FS.body, fontWeight: i === 0 ? FW.medio : FW.corpo,
                        color: T.text, textAlign: c.alinhar === "direita" ? "right" : "left", verticalAlign: "middle",
                      }}
                    >
                      {typeof conteudo === "number" ? fmtInt(conteudo) : conteudo}
                    </Cel>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ordenadas.length > limite && (
        <Botao variante="fantasma" tamanho="sm" onClick={() => setTodas((v) => !v)} data-testid={`${testId}-mostrar-todas`} style={{ marginTop: 8 }}>
          {todas ? `Mostrar só as ${limite} primeiras` : `Mostrar todas as ${fmtInt(ordenadas.length)} linhas`}
        </Botao>
      )}
    </div>
  );
}

// ─── A linha de uma peça (gaveta e listas) ───────────────────────────────────

function LinhaDaPeca({ l, aoAbrir }: { l: LeituraDaPeca<PecaDaAnalise>; aoAbrir?: () => void }) {
  const p = l.peca;
  const statusVisto = statusDeExibicao(p);
  const meta = getStatusMeta(statusVisto);
  const prazo = fraseDoPrazo(l);
  const corPrazo = prazo.tom === "neutro" ? T.second : coresDoTom(prazo.tom).text;
  const idade = l.diasNaFase;
  const tomIdade = idade != null ? tomDaIdade(idade) : null;
  const descricao = [p.type, p.description].filter((x) => x && String(x).trim()).join(" · ") || "Sem tipo nem descrição";
  return (
    <li
      data-testid="gaveta-peca"
      style={{ padding: "12px 0", borderBottom: `1px solid ${N.n3}`, display: "flex", gap: 12, alignItems: "flex-start" }}
    >
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: FONT.mono, fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>
            {idDaPeca(p)}
          </span>
          <span style={{ fontSize: FS.body, color: T.text, overflowWrap: "anywhere" }}>{descricao}</span>
        </div>
        <span style={{ fontSize: FS.small, color: T.second, overflowWrap: "anywhere" }}>
          {l.evento?.name ?? "Evento não encontrado"}
          {(p.quantity ?? 0) > 1 && <> · <span style={TABULAR}>{fmtInt(p.quantity!)}</span> un.</>}
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          <Selo cores={meta} tamanho="sm" ponto>{getStatusLabel(statusVisto)}</Selo>
          {l.travada && (
            <Selo tom="roxo" tamanho="sm" icone={Lock} style={{ whiteSpace: "normal", height: "auto", minHeight: 22, paddingBlock: 3, lineHeight: 1.3, maxWidth: "100%" }} title={`Travada${p.travadaPor ? ` por ${p.travadaPor}` : ""}: a Gráfica não consegue fazer a peça andar até destravar.`}>
              Travada{p.travadaMotivo ? `: ${p.travadaMotivo}` : ""}
            </Selo>
          )}
          {l.prioritaria && <Selo tom="laranja" tamanho="sm" icone={Flag}>Prioritária</Selo>}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", columnGap: 12, rowGap: 2, fontSize: FS.small }}>
          {(l.situacao === "ativa" || l.situacao === "eventoFinalizado") && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: tomIdade ? tomIdade.cor : T.second, fontWeight: tomIdade ? tomIdade.peso : FW.corpo }}>
              <Clock aria-hidden="true" style={{ width: 12, height: 12 }} />
              {idade == null ? "Idade na etapa desconhecida (sem registro)" : idade === 0 ? "Entrou na etapa hoje" : `Parada há ${fmtDias(idade)}`}
            </span>
          )}
          <span style={{ color: corPrazo, fontWeight: prazo.tom === "neutro" ? FW.corpo : FW.forte }}>{prazo.texto}</span>
        </div>
      </div>
      <BotaoLink
        href={urlPecaNoEvento(p.eventId, p.id)}
        variante="fantasma"
        tamanho="sm"
        onClick={aoAbrir}
        aria-label={`Abrir a peça ${idDaPeca(p)}`}
        data-testid="gaveta-abrir-peca"
        style={{ flexShrink: 0 }}
      >
        Abrir
        <ArrowRight aria-hidden="true" style={{ width: 12, height: 12 }} />
      </BotaoLink>
    </li>
  );
}

/** Uma lista curta de peças no formato da gaveta (ex.: "onde está parado há mais tempo"). */
export function ListaDePecas({ leituras, limite = 8, testId = "lista-de-pecas", vazio = "Nenhuma peça." }: {
  leituras: LeituraDaPeca<PecaDaAnalise>[];
  limite?: number;
  testId?: string;
  vazio?: string;
}) {
  if (leituras.length === 0) return <p data-testid={testId} style={{ margin: 0, fontSize: FS.small, color: T.second }}>{vazio}</p>;
  return (
    <ul data-testid={testId} style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {leituras.slice(0, limite).map((l) => <LinhaDaPeca key={l.peca.id} l={l} />)}
    </ul>
  );
}

// ─── A gaveta ────────────────────────────────────────────────────────────────

type OrdemDaGaveta = "parada" | "atraso" | "evento" | "id";
// `curto`: no celular as quatro ordens cabem em 360px só com rótulo curto
// (com o longo, "Por ID" saía cortado da gaveta — visto a 390px, 02/10).
const ORDENS_DA_GAVETA: { id: OrdemDaGaveta; rotulo: string; curto: string }[] = [
  { id: "parada", rotulo: "Mais paradas", curto: "Paradas" },
  { id: "atraso", rotulo: "Mais atrasadas", curto: "Atrasadas" },
  { id: "evento", rotulo: "Por evento", curto: "Evento" },
  { id: "id", rotulo: "Por ID", curto: "ID" },
];
const LOTE_DA_GAVETA = 100;

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * O DRILL-DOWN. Todo número da tela abre aqui, com EXATAMENTE as peças que ele
 * contou — o número e a lista nunca discordam, porque são o mesmo array.
 *
 * É uma gaveta lateral (o Dialog do Radix: foco preso, Esc fecha, o foco volta
 * ao número que a abriu) e não outra tela: o gestor abre, confere, fecha e
 * continua lendo o painel de onde parou. No celular ela ocupa a tela inteira.
 */
export function GavetaDePecas({ aberta, titulo, subtitulo, pecas, leitura, aoFechar }: {
  aberta: boolean;
  titulo: string;
  subtitulo?: string;
  pecas: PecaDaAnalise[];
  leitura: LeitorDePeca<PecaDaAnalise>;
  aoFechar: () => void;
}) {
  const isMobile = useIsMobile();
  const [ordem, setOrdem] = React.useState<OrdemDaGaveta>("parada");
  const [busca, setBusca] = React.useState("");
  const [quantas, setQuantas] = React.useState(LOTE_DA_GAVETA);

  // Cada abertura começa do zero: a busca da lista anterior não vale para esta.
  React.useEffect(() => {
    if (aberta) { setBusca(""); setQuantas(LOTE_DA_GAVETA); }
  }, [aberta, pecas]);

  const leituras = React.useMemo(() => pecas.map(leitura), [pecas, leitura]);
  const resumo = React.useMemo(() => ({
    atrasadas: leituras.filter((l) => l.atrasada).length,
    travadas: leituras.filter((l) => l.travada).length,
    prioritarias: leituras.filter((l) => l.prioritaria).length,
    semIdade: leituras.filter((l) => (l.situacao === "ativa" || l.situacao === "eventoFinalizado") && l.diasNaFase == null).length,
  }), [leituras]);

  const filtradas = React.useMemo(() => {
    const q = normalizar(busca.trim());
    const base = q
      ? leituras.filter((l) => normalizar(`${l.peca.displayId ?? ""} ${l.peca.type ?? ""} ${l.peca.description ?? ""} ${l.evento?.name ?? ""}`).includes(q))
      : leituras;
    const porId = (a: LeituraDaPeca<PecaDaAnalise>, b: LeituraDaPeca<PecaDaAnalise>) =>
      idDaPeca(a.peca).localeCompare(idDaPeca(b.peca), "pt-BR", { numeric: true });
    return [...base].sort((a, b) => {
      if (ordem === "parada") return (b.diasNaFase ?? -1) - (a.diasNaFase ?? -1) || porId(a, b);
      if (ordem === "atraso") return b.diasDeAtraso - a.diasDeAtraso || (b.diasNaFase ?? -1) - (a.diasNaFase ?? -1) || porId(a, b);
      if (ordem === "evento") return (a.evento?.name ?? "").localeCompare(b.evento?.name ?? "", "pt-BR") || porId(a, b);
      return porId(a, b);
    });
  }, [leituras, busca, ordem]);

  const n = pecas.length;
  const frase = [
    `${fmtInt(n)} ${plural(n, "peça", "peças")}`,
    resumo.atrasadas ? `${fmtInt(resumo.atrasadas)} ${plural(resumo.atrasadas, "atrasada", "atrasadas")}` : null,
    resumo.travadas ? `${fmtInt(resumo.travadas)} ${plural(resumo.travadas, "travada", "travadas")}` : null,
    resumo.prioritarias ? `${fmtInt(resumo.prioritarias)} ${plural(resumo.prioritarias, "prioritária", "prioritárias")}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <Sheet open={aberta} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <SheetContent
        side="right"
        data-testid="gaveta-de-pecas"
        // O X nativo some: o ModalHeader tem o dele (e dois X lado a lado confundem).
        className="[&>button:last-child]:hidden"
        style={{
          width: isMobile ? "100vw" : "min(600px, 100vw)", maxWidth: "100vw", padding: 0, gap: 0,
          display: "flex", flexDirection: "column", backgroundColor: T.surface, boxShadow: SHADOW.lg,
          borderLeft: `1px solid ${T.border}`,
        }}
      >
        <SheetTitle className="sr-only">{titulo}</SheetTitle>
        <SheetDescription className="sr-only">{subtitulo ? `${subtitulo}. ` : ""}{frase}. Lista somente para leitura.</SheetDescription>
        <ModalHeader variant="confirm" title={titulo} subtitle={subtitulo ?? frase} onClose={aoFechar} testIdDoFechar="gaveta-fechar" compacto={isMobile} />

        <div style={{ padding: isMobile ? "10px 14px" : "12px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
          {subtitulo && <p style={{ margin: 0, fontSize: FS.small, color: T.second }} data-testid="gaveta-resumo">{frase}</p>}
          {resumo.semIdade > 0 && (
            <p style={{ margin: 0, fontSize: FS.small, color: T.second }}>
              {fmtInt(resumo.semIdade)} {plural(resumo.semIdade, "peça não tem", "peças não têm")} registro de quando entrou na etapa — a idade fica como desconhecida, nunca como zero.
            </p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <label style={{ position: "relative", flex: "1 1 200px", minWidth: 0 }}>
              <span className="sr-only">Buscar nesta lista</span>
              <Search aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: T.muted }} />
              <input
                type="search"
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setQuantas(LOTE_DA_GAVETA); }}
                placeholder="ID, tipo, descrição ou evento"
                data-testid="gaveta-busca"
                style={{
                  width: "100%", minHeight: isMobile ? 44 : 34, padding: "6px 10px 6px 30px",
                  fontSize: isMobile ? FS.lead : FS.body, color: T.text, backgroundColor: T.surface,
                  border: `1px solid ${T.bdark}`, borderRadius: R.md, fontFamily: "inherit",
                }}
              />
            </label>
            <Segmentado
              rotuloDaLista="Ordem da lista"
              prefixoDeTestId="gaveta-ordem"
              tamanho={isMobile ? "toque" : "sm"}
              ativo={ordem}
              aoTrocar={(v) => setOrdem(v as OrdemDaGaveta)}
              itens={ORDENS_DA_GAVETA.map((o) => ({ id: o.id, rotulo: isMobile ? o.curto : o.rotulo, title: o.rotulo }))}
              larguraCheia={isMobile}
              style={{ flexShrink: 0, maxWidth: "100%", overflowX: "auto" }}
            />
          </div>
        </div>

        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: isMobile ? "0 14px 16px" : "0 24px 20px" }}>
          {filtradas.length === 0 ? (
            <div style={{ paddingTop: 20 }}>
              <EstadoVazio compacto titulo={busca ? "Nenhuma peça casa com a busca" : "Nenhuma peça"} descricao={busca ? "Apague a busca para ver a lista inteira." : undefined} />
            </div>
          ) : (
            <>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {filtradas.slice(0, quantas).map((l) => <LinhaDaPeca key={l.peca.id} l={l} aoAbrir={aoFechar} />)}
              </ul>
              {filtradas.length > quantas && (
                <Botao variante="secundario" tamanho={isMobile ? "toque" : "sm"} onClick={() => setQuantas((q) => q + LOTE_DA_GAVETA)} data-testid="gaveta-mais" style={{ marginTop: 12 }}>
                  Mostrar mais {fmtInt(Math.min(LOTE_DA_GAVETA, filtradas.length - quantas))} de {fmtInt(filtradas.length - quantas)} restantes
                </Botao>
              )}
            </>
          )}
        </div>
        <div style={{ flexShrink: 0, padding: isMobile ? "10px 14px calc(10px + env(safe-area-inset-bottom))" : "10px 24px", borderTop: `1px solid ${T.border}`, backgroundColor: T.bg, fontSize: FS.small, color: T.second }}>
          Somente leitura — para agir sobre uma peça, abra-a.
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Operação (agregados do servidor) ────────────────────────────────────────

/**
 * Os agregados de GET /api/analises/operacao chegam DEPOIS e podem falhar sem
 * derrubar a aba: o que é de /api/items continua de pé, e este bloco diz o que
 * aconteceu com o resto.
 */
export function BlocoDaOperacao({ ctx, titulo, children }: {
  ctx: Pick<ContextoDaAnalise, "operacao" | "operacaoCarregando" | "operacaoErro">;
  titulo: string;
  children: (op: OperacaoDaAnalise) => React.ReactNode;
}) {
  if (ctx.operacao) return <>{children(ctx.operacao)}</>;
  if (ctx.operacaoCarregando) {
    return (
      <div role="status" aria-busy="true" data-testid="operacao-carregando" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="sr-only">Carregando {titulo}…</span>
        <span className="animate-pulse" style={{ display: "block", height: 12, width: "60%", borderRadius: R.sm, backgroundColor: T.low }} />
        <span className="animate-pulse" style={{ display: "block", height: 12, width: "40%", borderRadius: R.sm, backgroundColor: T.low }} />
      </div>
    );
  }
  return (
    <EstadoErro
      compacto
      testId="operacao-erro"
      titulo={`${titulo}: indisponível agora`}
      detalhe={ctx.operacaoErro
        ? "O servidor não respondeu com estes números. O resto da aba vem das peças e continua certo."
        : "Estes números vêm de um levantamento do servidor que ainda não está disponível."}
    />
  );
}

/**
 * Número de AGREGADO do servidor (pedidos, m², versões): não é um conjunto de
 * peças que a tela tenha em mãos, então é mostrador — não finge abrir lista.
 */
export function NumeroDoServidor({ rotulo, valor, sub, testId }: {
  rotulo: string; valor: React.ReactNode; sub?: React.ReactNode; testId?: string;
}) {
  return (
    <div data-testid={testId} style={{ padding: "10px 12px", border: `1px solid ${T.border}`, borderRadius: R.md, backgroundColor: T.surface, minWidth: 0 }}>
      <div style={{ fontSize: FS.small, color: T.second, lineHeight: 1.35 }}>{rotulo}</div>
      <div style={{ ...TABULAR, fontFamily: FONT.display, fontSize: FS.h2, fontWeight: FW.rotulo, color: T.text, lineHeight: 1.2 }}>
        {typeof valor === "number" ? fmtInt(valor) : valor}
      </div>
      {sub && <div style={{ fontSize: FS.small, color: T.second, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/**
 * A janela que o servidor DE FATO usou, dita em palavras. A página não manda
 * `de`/`ate` (o servidor usa 30 dias), mas a frase sai do payload e não de uma
 * constante: se a janela mudar, o texto muda junto em vez de mentir.
 */
export function rotuloDaJanela(op: Pick<OperacaoDaAnalise, "janela">): string {
  const de = Date.parse(op.janela.de);
  const ate = Date.parse(op.janela.ate);
  if (!Number.isFinite(de) || !Number.isFinite(ate) || ate <= de) return "no período";
  const dias = Math.round((ate - de) / 86_400_000);
  return dias === 1 ? "nas últimas 24 horas" : `nos últimos ${fmtInt(dias)} dias`;
}

export interface ItemDaListaDeBarras {
  id: string;
  rotulo: React.ReactNode;
  /** O que mede a barra (proporcional ao maior da lista). */
  valor: number;
  /** O número exibido (pd. fmtInt(valor)). */
  texto?: React.ReactNode;
  /** Linha de apoio sob o rótulo, ou números extras (m², peças clicáveis). */
  detalhe?: React.ReactNode;
  /** Cor da barra (token). Pd. o neutro da casa. */
  cor?: string;
}

/**
 * O RANKING COM BARRA. Máquinas, motivos de reprovação, situações do acervo,
 * setores: a pergunta é sempre "quem pesa mais?", e a barra contra o MAIOR
 * responde antes de o olho ler o número. Lista e não gráfico: o rótulo é texto
 * longo ("Logo fora do padrão do patrocinador") e precisa caber inteiro, no
 * celular inclusive — num eixo de gráfico ele seria cortado.
 */
export function ListaDeBarras({ itens, legenda, testId = "lista-de-barras", vazio = "Nada para mostrar neste recorte.", duasColunas = false }: {
  itens: ItemDaListaDeBarras[];
  /** Nome acessível da lista. */
  legenda: string;
  testId?: string;
  vazio?: string;
  /**
   * Lista longa (15 naturezas de ação) ao lado de uma curta deixava a coluna
   * vizinha com um buraco do tamanho da diferença. Em duas colunas de texto
   * (multicol, não grade) a ordem continua sendo lida de cima para baixo; sem
   * largura para duas, volta a ser uma só.
   */
  duasColunas?: boolean;
}) {
  if (itens.length === 0) return <p data-testid={`${testId}-vazia`} style={{ margin: 0, fontSize: FS.small, color: T.second }}>{vazio}</p>;
  const maior = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ul
      aria-label={legenda}
      data-testid={testId}
      style={{ listStyle: "none", margin: 0, padding: 0, ...(duasColunas ? { columnCount: 2, columnWidth: 220, columnGap: 28 } : null) }}
    >
      {itens.map((i, idx) => (
        <li
          key={i.id}
          data-testid={`${testId}-item`}
          style={{
            display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", columnGap: 12, rowGap: 5,
            padding: "8px 0", breakInside: "avoid",
            // Em colunas, a linha vai EMBAIXO: em cima, o 1º item da 2ª coluna abriria com um traço solto.
            ...(duasColunas ? { borderBottom: `1px solid ${N.n3}` } : { borderTop: idx === 0 ? "none" : `1px solid ${N.n3}` }),
          }}
        >
          <span style={{ fontSize: FS.body, fontWeight: FW.medio, color: T.text, lineHeight: 1.35, overflowWrap: "anywhere", minWidth: 0 }}>{i.rotulo}</span>
          <span style={{ ...TABULAR, fontSize: FS.body, fontWeight: FW.forte, color: T.text, textAlign: "right", whiteSpace: "nowrap" }}>
            {i.texto ?? fmtInt(i.valor)}
          </span>
          <span aria-hidden="true" style={{ gridColumn: "1 / -1", height: 8, borderRadius: R.pill, backgroundColor: N.n2, overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${(i.valor / maior) * 100}%`, minWidth: i.valor > 0 ? 3 : 0, backgroundColor: i.cor ?? TOM.neutro.dot, borderRadius: R.pill }} />
          </span>
          {i.detalhe && (
            <span style={{ gridColumn: "1 / -1", fontSize: FS.small, color: T.second, display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 2, minWidth: 0 }}>
              {i.detalhe}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// ─── Textos compartilhados ───────────────────────────────────────────────────

/**
 * O cartão de TRAVADAS diz a mesma coisa em toda aba. A trava só vale na
 * Gráfica e quem trava é a Solicitação ou um admin — "pela Solicitação, com
 * motivo" (o texto antigo) deixava de fora o admin e sugeria que o motivo
 * sempre existe.
 */
export const TEXTO_DAS_TRAVADAS = {
  rotulo: "Travadas",
  titulo: "Travadas na Gráfica",
  subtitulo: "A Gráfica vê, mas não consegue fazer andar até destravar",
  sub: "Seguradas na Gráfica pela Solicitação ou um admin",
} as const;

// ─── Aba provisória ──────────────────────────────────────────────────────────

/** O que uma aba ainda não escrita mostra: o fluxo da fase dela, com os mesmos números da Visão geral. */
export function AbaProvisoria({ ctx, fase, titulo }: { ctx: ContextoDaAnalise; fase: FaseDoFluxo | null; titulo: string }) {
  const etapas = fase ? ctx.estado.porEtapa.filter((e) => e.fase === fase) : [];
  return (
    <SecaoDaAnalise id={`h-provisoria-${fase ?? "geral"}`} titulo={titulo} descricao="A leitura detalhada desta aba está sendo preparada. Por enquanto, as etapas dela com os mesmos números da Visão geral.">
      {etapas.length > 0
        ? <FluxoDeEtapas ctx={ctx} etapas={etapas} agruparPorFase={false} mostrarEntregue={false} />
        : <EstadoVazio compacto titulo="Em preparação" descricao="Os números desta aba chegam com o levantamento do servidor." />}
    </SecaoDaAnalise>
  );
}

/** As etapas na ordem do fluxo (reexportado para as abas não importarem a lib só por isso). */
export { ETAPAS_DO_FLUXO };
