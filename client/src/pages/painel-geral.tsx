import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, useRef, Fragment, useEffect, useCallback, memo, useSyncExternalStore } from "react";
import { SeloKit } from "@/components/kit/selo-kit";
import {
  Search, Calendar, Truck, Eye, Paperclip, Trash2, FileText, Printer, RotateCcw, Hourglass,
  Loader2, MessageSquare, ArrowUpRight, ChevronDown, ChevronUp, Copy, FileSpreadsheet,
  SlidersHorizontal, Link2, Check, Lock, Pin, AlertTriangle, CheckCircle2, XCircle,
} from "lucide-react";
import { Link } from "wouter";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { ExportPdfDialog } from "@/components/export-pdf-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { parseDateLocal, toUTCDisplayDate } from "@/lib/utils";
import { compareDisplayId } from "@/lib/displayId";
import { MODAL_RADIUS, MODAL_SHADOW } from "@/components/modal-shell";
import { FilterSelect } from "@/components/filter-select";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import {
  ComplementoDaFicha,
  temBlocoDeComplemento,
} from "@/components/aumentar-quantidade-dialog";
import { SponsorChips } from "@/components/sponsor-chips";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIsMobile, useElementSize, densityFromWidth, type ContentDensity } from "@/hooks/use-mobile";
import { getStatusMeta, getStatusLabel, getApprovalMeta, motivoEventoFinalizado, todayBusinessMs } from "@/lib/status";
// AS DEFINIÇÕES VÊM DA ANÁLISE, não de uma cópia. Os focos "retrabalho" e
// "fora do prazo" existem para responder ao clique num KPI de lá — se cada
// tela tivesse a sua regra, o número da Análise e a contagem daqui
// divergiriam, e a tela de destino desmentiria a tela de origem.
import { temRefacao } from "@/lib/analises-desempenho";
import { ehBookCompleto } from "@shared/fluxo-peca";
import { isDelivered } from "@/lib/analises-status";
import { StatusPill } from "@/components/status-pill";
import { DetalheProducao } from "@/components/detalhe-producao";
import type { Event, Sponsor, StandardItem } from "@shared/schema";
import {
  STATUS_GROUPS, GROUP_KEYS, computeStats, matchesStatusFilter,
  statusFlowIndex, type GroupKey,
} from "@/lib/painel-kpis";
import {
  computeDeadlineChip, dayDiff, isPendingItemStatus, type PrazoChip,
} from "@/lib/painel-prazo";
import {
  seloEventoFinalizado, chipOcultas, buscaEhCodigoDaPeca,
  CONTAGEM_OCULTAS_ZERO, type SeloEventoFinalizado, type ContagemOcultas,
} from "@/lib/painel-encerrados";
import { formatFrescor } from "@/lib/painel-frescor";
import { proximaTelaDoStatus } from "@/lib/painel-rotas";
import { FS } from "@/lib/theme";
import {
  visoesParaPapel, visaoEstaAtiva, chaveVisaoPadrao, type Visao,
} from "@/lib/painel-visoes";

// ─── Constantes de módulo — não dependem de estado; hoisted para não serem
// realocadas a cada render. ─────────────────────────────────────────────────

// Faixas do filtro de data (diff em dias até a saída do caminhão).
const DATE_RANGE_MAP: Record<string, (diff: number) => boolean> = {
  today: d => d === 0, next3days: d => d >= 0 && d <= 3, next7days: d => d >= 0 && d <= 7,
  next10days: d => d >= 0 && d <= 10, next15days: d => d >= 0 && d <= 15,
  next30days: d => d >= 0 && d <= 30, overdue: d => d < 0,
};

// Rótulos do filtro de data — fonte única para o dropdown e os chips ativos.
const DATE_FILTER_LABELS: Record<string, string> = {
  overdue: "Caminhão já saiu", today: "Sai hoje",
  next3days: "Sai em até 3 dias", next7days: "Sai em até 7 dias",
  next10days: "Sai em até 10 dias", next15days: "Sai em até 15 dias",
  next30days: "Sai em até 30 dias", no_departure: "Sem data de saída",
};
const DATE_FILTER_VALUES = Object.keys(DATE_FILTER_LABELS);

// ─── Filtro de FOCO — os três recortes que a operação pede sem parar ────────
// Não são status nem datas: são cruzamentos (reprovação de patrocinador,
// caminhão que já saiu com peça pendente, "esconde o que já acabou"). Vivem
// numa dimensão própria para poderem ser combinados com qualquer status.
const FOCO_LABELS: Record<string, string> = {
  reprovadas: "Reprovadas pelo patrocinador",
  atrasadas: "Em evento com caminhão atrasado",
  pendentes: "Só pendências",
};

// Opções do dropdown de status, na ordem do fluxo (rótulos via getStatusLabel).
// `draft` entrou com opção PRÓPRIA: o card "Solicitado" anuncia "inclui N
// rascunhos" e não existia caminho nenhum para ver só eles — a tela fazia a
// pergunta e não dava a resposta.
const STATUS_FILTER_VALUES = [
  "requested", "draft", "awaiting_linking", "awaiting_submission",
  "awaiting_approval", "awaiting_finalization", "awaiting_final_review",
  "ready_for_production", "approved", "inProduction", "produced",
  "conferred", "packed", "delivered", "canceled",
];

// Altura FIXA do header sticky de evento — o thead sticky usa este valor como
// `top` para encostar exatamente abaixo dele (ver comentários na tabela).
const EVENT_HEADER_H = 62;

// Renderização incremental: cada evento mostra até ROW_CAP linhas e a lista
// abre até GROUP_CAP eventos; o resto entra sob demanda. Sem o teto de GRUPOS,
// 40 eventos ativos (o estado padrão da tela, sem filtro) rendiam até 2000 <tr>
// de uma vez — e a tela recebe invalidação por WebSocket a cada mutação de
// QUALQUER usuário, então um lote de 30 peças virava cascata de re-render.
const ROW_CAP = 50;
const GROUP_CAP = 5;

// O nome do evento sai da caixa-alta forçada: é CONTEÚDO (o nome que a pessoa
// digitou), e caixa-alta em 15px peso 800 repetida em cada grupo fazia a lista
// inteira gritar no mesmo volume. Quem cadastrou em maiúsculas continua vendo
// em maiúsculas — a tela só parou de impor.
const EVENT_TITLE_STYLE: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif",
  fontWeight: 700, fontSize: 15,
  letterSpacing: "-0.01em",
  color: "#1c1917", margin: 0, lineHeight: 1,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};

// Zonas dos KPIs — as três fases do fluxo. 12 cards iguais obrigavam a
// escanear um a um para achar o gargalo.
//
// ── TEMPO NO ESTADO ────────────────────────────────────────────────────────
//
// O painel respondia ONDE as peças estão e nunca DESDE QUANDO. 1.129 peças em
// "Aguardando envio" pode ser vazão normal ou travamento de duas semanas — e
// essa é exatamente a pergunta de quem procura gargalo. Status é posição;
// faltava duração.
//
// A fonte é `items.status_changed_at`, coluna que o servidor carimba em toda
// transição (ver shared/schema.ts para por que não serve `updatedAt` nem o
// audit_log). NULO É LEGÍTIMO: peça anterior ao backfill, em status sem
// carimbo de etapa, não tem como saber — e a tela não exibe idade nessas
// linhas em vez de mostrar a idade desde a criação como se fosse tempo no
// estado. Um campo vazio diz "não sei"; um número errado diz "sei" e mente.
const ZONA_ENTRADA: GroupKey[] = ["requested", "awaiting_linking"];
const ZONA_APROVACAO: GroupKey[] = ["awaiting_submission", "awaiting_approval", "awaiting_finalization", "awaiting_final_review"];
const ZONA_PRODUCAO: GroupKey[] = ["ready_for_production", "approved", "inProduction", "produced", "conferred", "packed", "delivered"];

// ─── Tom NEUTRO por zona, para as barras de distribuição ────────────────────
// As barras pintavam cada etapa com a cor do seu status: até 13 matizes numa
// faixa de 14px, logo abaixo dos chips vermelho e âmbar de atenção — a cor que
// SIGNIFICA alguma coisa (atraso, reprovação) competia com cor que só
// identifica. Nenhuma etapa do fluxo é, por si, um risco.
//
// O tom agora diz AVANÇO: quanto mais escuro, mais perto da entrega. Três
// degraus da escala stone, os mesmos tokens do resto da tela. A identidade de
// cada etapa continua onde ela é lida — no nome do card, no title e no
// aria-label do segmento, e na pílula de status de cada linha.
const TOM_ZONA_ENTRADA = "#d6d3d1";
const TOM_ZONA_APROVACAO = "#a8a29e";
const TOM_ZONA_PRODUCAO = "#57534e";
function tomDaZona(k: GroupKey): string {
  if (ZONA_ENTRADA.includes(k)) return TOM_ZONA_ENTRADA;
  if (ZONA_APROVACAO.includes(k)) return TOM_ZONA_APROVACAO;
  if (ZONA_PRODUCAO.includes(k)) return TOM_ZONA_PRODUCAO;
  return "#e7e5e4"; // canceladas: fora do avanço
}

/** Número com separador de milhar pt-BR: "2.099", não "2099". */
const fmtN = (n: number) => n.toLocaleString("pt-BR");

// ─── O selo da linha da peça — UMA receita ──────────────────────────────────
// A célula de ID chegava a ter quatro selos com quatro famílias de cor (verde
// "REAPROVEIT.", azul "REF. VISUAL", roxo "BOOK", cinza de observação) e todos
// em caixa-alta 10px peso 800: a coluna gritava mais que o status ao lado, que
// é a informação que a pessoa foi buscar. Nenhum deles é risco nem atraso.
// Agora: caixa normal, 11px, fundo stone — o que diferencia um do outro é a
// palavra e o ícone. Só o selo de evento finalizado sobrepõe as cores (as
// dele, de lib/painel-encerrados), porque ele muda a leitura da linha inteira.
// #57534e sobre #f5f5f4 = 6,99:1 AA.
const SELO_CALMO: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", width: "fit-content",
  fontSize: 11, fontWeight: 600, lineHeight: 1.35, whiteSpace: "nowrap",
  color: "#57534e", backgroundColor: "#f5f5f4", border: "1px solid #e7e5e4",
  borderRadius: 6, padding: "1px 6px",
};

// ─── CSS da tela ────────────────────────────────────────────────────────────
// O hover das linhas era feito com onMouseEnter/onMouseLeave mutando
// `el.style` — dois handlers recriados a cada render em até 2000 linhas. Em
// CSS custa zero por linha. A zebra continua vindo de atributo (`data-zebra`)
// porque as linhas de peça não são contíguas: sub-headers de grupo e de tipo
// se intercalam, então `:nth-child` contaria errado.
const PG_CSS = `
.pg-row { border-left: 3px solid transparent; border-bottom: 1px solid #f0f0ef; transition: background-color .15s, transform .15s, border-color .15s; }
.pg-row[data-zebra="0"] { background-color: #ffffff; }
.pg-row[data-zebra="1"] { background-color: #f6f4f1; }
.pg-row[data-deleted="0"] { cursor: pointer; }
.pg-row[data-deleted="1"] { background-color: #fff5f5; border-left-color: #fecaca; opacity: .85; }
.pg-row[data-deleted="0"]:hover { background-color: #fff7ed; border-left-color: #f97316; transform: translateY(-1px); }
.pg-row[data-selected="1"] { background-color: #fff7ed; border-left-color: #c2410c; }
.pg-event-link { text-decoration: none; display: block; min-width: 0; border-radius: 4px; }
.pg-event-link h3 { transition: color .15s; }
.pg-event-link:hover h3 { color: #c2410c; text-decoration: underline; }
.pg-event-link:focus-visible { outline: 2px solid #c2410c; outline-offset: 2px; }
.pg-goto { opacity: 0; transition: opacity .15s; flex-shrink: 0; }
.pg-event-link:hover .pg-goto, .pg-event-link:focus-visible .pg-goto { opacity: 1; }
/* CARD DE RESUMO — hover, foco e esmaecido em CSS.
   Eram handlers de mouse mutando style (translateY e opacity) — e o teclado
   não recebia nada disso: o card zerado continuava apagado com foco nele.
   Aqui :focus-visible ganha o mesmo tratamento do hover, de graça. O
   deslocamento é de 1px: o card é resumo, não botão de chamada, e movimento
   grande em 13 cards lado a lado vira tremedeira. A regra global de
   prefers-reduced-motion (index.css) zera as transições. */
.pg-card { transition: border-color .15s, box-shadow .15s, transform .15s, opacity .15s, background-color .15s; }
.pg-card[data-zero="1"] { opacity: .72; }
.pg-card:hover, .pg-card:focus-visible { opacity: 1; }
.pg-card[aria-pressed="false"]:hover { transform: translateY(-1px); border-color: #d6d3d1; box-shadow: 0 3px 10px rgba(28,25,23,.07); }
/* Segmento da barra: o pai tem overflow hidden (raio da pílula), então o anel
   global de foco, que fica 2px PARA FORA, seria cortado. Anel para dentro. */
.pg-seg:focus-visible { outline: 2px solid #1c1917; outline-offset: -2px; border-radius: 0; }
.pg-seg:hover { filter: brightness(.92); }
.pg-chip { transition: background-color .15s, border-color .15s, box-shadow .15s; }
.pg-chip[aria-pressed="false"]:hover { box-shadow: 0 2px 8px rgba(28,25,23,.08); }
.pg-anexo:hover { color: #c2410c !important; border-color: #fed7aa !important; background-color: #fff7ed !important; }
.pg-sortable { cursor: pointer; user-select: none; }
/* ALVO DA CAIXA DE SELEÇÃO.

   A caixa é um input type="checkbox" de 15×15 — a WCAG 2.5.8 pede 24×24
   no nível AA e a régua da casa pede 36 de ponteiro. Não há conserto
   CSS-only no próprio input: padding não se aplica a elemento substituído,
   transform não muda a caixa de layout e ::before não renderiza nele.

   Quem cresce é o label em volta: 36×36 de área clicável, com margem
   negativa de 10px para devolver ao layout o espaço que ele tomou. A caixa
   continua desenhada com 15px no mesmo lugar; o que mudou é onde o clique
   é aceito. Envolver no label também dispensa o for/id — clicar no
   rótulo alterna o input por definição do HTML. */
.pg-check { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; margin: -10px; cursor: pointer; }
/* #c2410c sobre o #fafaf9 do cabecalho = 4,96:1 AA. Era #fdba74, escolhido
   quando o thead era ESCURO; ao clarear o cabecalho eu nao revisei esta cor e
   ela virou 1,61:1 — o hover de ordenacao ficou praticamente invisivel. */
.pg-sortable:hover { color: #c2410c; }
`;

// ─── Status card ────────────────────────────────────────────────────────────
// Fora do componente da página de propósito: definido inline, era recriado a
// cada render e os 13 cards remontavam (perdendo até a transição CSS) a cada
// tecla digitada na busca. Recebe tudo por props.
//
// O CARD É RESUMO, NÃO ALARME (rodada 3). Cada card tinha ponto colorido,
// borda esquerda na cor do status e número pintado quando ativo — treze cores
// competindo com as duas que de fato pedem ação (reprovada, caminhão
// atrasado), que moram na faixa de atenção acima. Agora o card é neutro: o
// que diferencia um do outro é o NOME, escrito por extenso em caixa normal
// (o rótulo em 10px caixa-alta era o texto mais difícil de ler da tela, e é
// justamente o que diz o que o número conta).
//
// Estado FILTRADO usa a mesma gramática das visões salvas da barra de filtros
// (borda #c2410c, fundo #fff7ed): na tela inteira, "este recorte está ligado"
// tem uma aparência só.
//
// `dark` é o card Total. O nome ficou (o data-testid e os testes dependem
// dele), mas o card preto com selo "BASELINE" saiu: era o elemento mais
// pesado da primeira dobra, falava jargão e estava SEMPRE "ativo" — o estado
// padrão da tela pintado como destaque. Agora ele é o card de fundo cinza que
// fecha a conta e só chama atenção quando há um filtro de status para desfazer.
function StatusCard({
  label, value, filterKey, sub, subActionLabel, onSubAction,
  isActive, onToggle, dark, title, carregando, pct, cor,
}: {
  label: string; value: number;
  /** Cor da etapa (getStatusMeta().dot) — a mesma da barra e dos selos. */
  cor?: string;
  filterKey: string; sub?: string; subActionLabel?: string; onSubAction?: () => void;
  isActive: boolean; onToggle: () => void; dark?: boolean; title?: string;
  /** Enquanto os dados nao chegaram, o card nao sabe o numero — e nao deve chutar zero. */
  carregando?: boolean;
  /** Fatia do total. O absoluto responde "quantas peças"; o percentual
   *  responde "quanto isso pesa", que é a pergunta de quem procura gargalo. */
  pct?: number;
}) {
  // Cards zerados são informação de baixo valor no escaneamento ("onde está
  // o gargalo?") — ficam esmaecidos (CSS, .pg-card[data-zero]), mas continuam
  // clicáveis/filtráveis e voltam ao tom cheio no hover E no foco de teclado.
  const isZero = value === 0 && !isActive && !dark && !carregando;
  const plural = value === 1 ? "peça" : "peças";
  const valorTexto = fmtN(value);
  // O Total só tem o que dizer quando há filtro de status para desfazer.
  const badgeTexto = dark ? (isActive ? null : "Ver todas") : (isActive ? "Filtrando" : null);
  // Os cartões são o filtro por status desta tela. Como div com onClick,
  // filtrar era exclusivamente com mouse — e só a cor dizia qual estava
  // ativo, coisa que aria-pressed comunica a quem não a vê.
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      /* Sem isto o leitor de tela anunciava "Filtrar por X, 0 peças" durante
         a carga — o mesmo zero falso, dito em voz alta. */
      aria-label={carregando
        ? `${dark ? "Mostrar todas as peças" : `Filtrar por ${label}`}, carregando`
        : `${dark ? "Mostrar todas as peças" : `Filtrar por ${label}`}, ${value} ${plural}`}
      title={title}
      onClick={onToggle}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      data-testid={dark ? "stat-total" : `stat-card-${filterKey}`}
      className="pg-card"
      data-zero={isZero ? "1" : "0"}
      style={{
        position: "relative", overflow: "hidden",
        // #f5f5f4 no Total: separa "a conta inteira" das parcelas sem cor nova.
        background: isActive && !dark ? "#fff7ed" : dark ? "#f5f5f4" : "#ffffff",
        border: `1px solid ${isActive && !dark ? "#c2410c" : "#e7e5e4"}`,
        borderRadius: 10,
        padding: "11px 12px 10px 13px", minHeight: 84,
        display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 6,
        cursor: "pointer",
        boxShadow: isActive && !dark ? "0 0 0 1px #c2410c" : "0 1px 2px rgba(28,25,23,.04)",
      }}
    >
      {/* COR DA ETAPA (dono, 17/09: "aqui tem que ter cor"). Faixa à esquerda
          com a mesma cor do pedaço da barra e do selo da linha: quem olha o
          card reconhece a etapa sem ler o nome. Decorativa — o nome continua
          escrito ao lado. */}
      {cor && <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: cor }} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
        {/* Rótulo de CONTEÚDO em caixa normal, 12px. Quebra em duas linhas
            se precisar ("Aguardando Revisão Final" no celular) em vez de
            abreviar para "Ag. Revisão" — abreviação é mais um código a
            decorar. #57534e sobre #ffffff = 7,63:1; sobre #f5f5f4 = 6,99:1. */}
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#57534e", lineHeight: 1.3, minWidth: 0, display: "flex", alignItems: "baseline", gap: 6 }}>
          {cor && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: cor, flexShrink: 0, transform: "translateY(-1px)" }} />}
          {label}
        </p>
        {badgeTexto && (
          /* #c2410c sobre #fff7ed = 4,88:1 AA nos 11px peso 700. */
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, flexShrink: 0, fontSize: 11, fontWeight: 700, color: "#c2410c", lineHeight: 1.3, whiteSpace: "nowrap" }}>
            {!dark && <Check aria-hidden="true" style={{ width: 11, height: 11 }} />}
            {badgeTexto}
          </span>
        )}
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
          {/* ZERO É UMA AFIRMAÇÃO, e durante a carga a tela não tem como
              fazê-la. Com 3.187 peças a caminho, os cards exibiam "0" e o
              TOTAL anunciava "0 TOTAL" com selo BASELINE enquanto o skeleton
              rodava logo abaixo — a manchete da tela dizia que não havia nada.
              Um travessão diz a verdade: ainda não sei. */}
          <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 700, color: "#1c1917", lineHeight: 1, margin: 0, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{carregando ? "—" : valorTexto}</p>
          {/* A HIERARQUIA VEM DO PESO, NÃO DO CONTRASTE.
              A primeira tentativa usou um cinza mais claro (#8c8580) para o
              percentual ficar subordinado — e ele dá 3,63:1 em 10px, reprova
              AA. Enfraquecer contraste para criar hierarquia é trocar um
              problema de design por um de acesso.
              Mesmo cinza de apoio (5,03:1), subordinado por tamanho e peso.
              "do total" saiu da frase: repetido em treze cards era a mesma
              ressalva dita treze vezes ao lado de um número que já a implica. */}
          {!carregando && pct !== undefined && value > 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, color: "#746e69", lineHeight: 1 }}>
              {pct < 1 ? "<1" : Math.round(pct)}%
            </span>
          )}
        </div>
        {sub && (
          onSubAction ? (
            /* O subtexto era um beco sem saída: dizia "inclui 7 rascunhos" e
               não havia como ver os 7. stopPropagation para não alternar o
               card pai no mesmo clique. */
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSubAction(); }}
              onKeyDown={(e) => e.stopPropagation()}
              title={subActionLabel}
              style={{
                /* 11px com 3px de padding em cima e embaixo: o alvo passa a
                   ~20px sem deslocar nada, porque o fundo é transparente. */
                background: "none", border: "none", padding: "3px 0", marginTop: 2,
                fontSize: 11, fontWeight: 600, lineHeight: 1.2, cursor: "pointer",
                color: "#746e69",
                textDecoration: "underline", textUnderlineOffset: 2, textAlign: "left",
              }}
            >
              {sub}
            </button>
          ) : (
            <p style={{ fontSize: 11, fontWeight: 600, color: "#746e69", margin: "4px 0 0", lineHeight: 1.2 }}>{sub}</p>
          )
        )}
      </div>
    </div>
  );
}

// ─── Chip de filtro ativo (removível) — linha abaixo da toolbar ─────────────
// isMobile por PROP: como cada chip chamava useIsMobile(), 10 filtros ativos
// criavam 10 listeners de matchMedia para uma informação que o pai já tem.
function FilterChip({ label, onRemove, isMobile }: { label: string; onRemove: () => void; isMobile: boolean }) {
  // Alvo de toque do ×: 24px no desktop, 32px no mobile. Margens negativas
  // compensam a área extra para o chip não inflar visualmente.
  const hit = isMobile ? 32 : 24;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      backgroundColor: "#f5f5f4", border: "1px solid #e7e5e4", borderRadius: 999,
      padding: "3px 6px 3px 10px", fontSize: 11, fontWeight: 600, color: "#44403c",
      whiteSpace: "nowrap", maxWidth: 280, overflow: "hidden",
    }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remover filtro ${label}`}
        style={{
          background: "none", border: "none", cursor: "pointer", color: "#746e69",
          fontSize: 13, fontWeight: 800, padding: 0, lineHeight: 1,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          minWidth: hit, minHeight: hit,
          margin: `${-(hit - 18) / 2}px ${-(hit - 18) / 2}px ${-(hit - 18) / 2}px -2px`,
        }}
      >
        ×
      </button>
    </span>
  );
}

// ─── Barra de distribuição de status do evento ──────────────────────────────
// O header do grupo dizia só "N peças": para saber se o evento estava saudável
// era preciso expandir e ler linha a linha. A barra responde "onde está o
/** Acima disto, a peça não está em fluxo: está parada. */
const LIMITE_PARADA = 7;

const DIA_MS = 86_400_000;
const HORA_MS = 3_600_000;

/** Lista vazia ESTÁVEL: `data = []` no destructuring cria um array novo a cada
 *  render enquanto a query carrega, e todo useMemo que depende dele refaz. */
const LISTA_VAZIA: any[] = [];

/** Mesmo resultado de `localeCompare(x, "pt-BR")` (a especificação define um
 *  pelo outro), sem montar o collator de novo a cada comparação do sort. */
const COLLATOR_PT = new Intl.Collator("pt-BR");

// Parse do carimbo memoizado por peça. `diasNoEstado` roda por peça no
// comparador do sort por tempo, nos cabeçalhos de evento e na barra do fluxo —
// dezenas de milhares de `new Date(string)` por clique com 5.000 peças. O
// objeto da peça é imutável no cache do React Query (o delta-sync cria objetos
// novos), e o texto bruto entra na chave para não servir carimbo velho.
const CARIMBO_MS = new WeakMap<object, { bruto: string; t: number }>();
function carimboEmMs(item: any, bruto: string): number {
  const c = CARIMBO_MS.get(item);
  if (c && c.bruto === bruto) return c.t;
  const t = new Date(bruto).getTime();
  if (item && typeof item === "object") CARIMBO_MS.set(item, { bruto, t });
  return t;
}

/**
 * Dias inteiros desde a última mudança de status, ou `null` quando não há
 * registro. O `null` percorre a tela toda: nenhuma das três leituras inventa
 * um número quando ele falta.
 */
function diasNoEstado(item: any, agoraMs: number): number | null {
  const bruto = item?.statusChangedAt ?? item?.status_changed_at;
  if (!bruto) return null;
  const t = typeof bruto === "string" ? carimboEmMs(item, bruto) : new Date(bruto).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((agoraMs - t) / DIA_MS));
}

/**
 * Tom pela idade. Até o limite é FLUXO e fica discreto — pintar de vermelho
 * tudo que tem três dias transformaria o alerta em papel de parede, e a tela
 * inteira em ruído. Acima do limite o dado vira acionável e o peso sobe junto
 * com a cor: cor sozinha não é sinal para quem não a distingue.
 */
function tomDaIdade(dias: number): { cor: string; peso: number } {
  if (dias > 14) return { cor: "#b91c1c", peso: 700 };
  if (dias > LIMITE_PARADA) return { cor: "#b45309", peso: 700 };
  return { cor: "#746e69", peso: 500 };
}

/** "há 1 dia" / "há 12 dias" / "hoje". */
const idadePorExtenso = (d: number) => (d === 0 ? "hoje" : d === 1 ? "há 1 dia" : `há ${d} dias`);

// gargalo" na unidade de decisão real — o evento — sem nenhum clique. Os NOMES
// saem de lib/status.ts; o tom é o da zona (tomDaZona), o mesmo da barra do
// fluxo no topo: escuro = perto da entrega. Um evento "quase todo escuro" está
// adiantado sem ninguém precisar decorar treze cores.
function EventStatusBar({ items, width }: { items: Array<{ status?: string | null }>; width: number }) {
  const segments = useMemo(() => {
    const stats = computeStats(items);
    return GROUP_KEYS
      .map(k => ({ key: k, n: stats.byGroup[k], meta: getStatusMeta(STATUS_GROUPS[k][0]), tom: tomDaZona(k) }))
      .filter(s => s.n > 0);
  }, [items]);

  if (segments.length === 0) return null;
  const total = segments.reduce((a, s) => a + s.n, 0);
  const resumo = segments.map(s => `${s.meta.label}: ${s.n}`).join(" · ");

  return (
    <div
      title={resumo}
      aria-label={`Distribuição por etapa — ${resumo}`}
      role="img"
      style={{ display: "flex", width, height: 6, borderRadius: 999, overflow: "hidden", backgroundColor: "#f0efee", flexShrink: 0 }}
    >
      {segments.map((s, i) => (
        <div key={s.key} style={{ width: `${(s.n / total) * 100}%`, backgroundColor: s.tom, borderRight: i < segments.length - 1 ? "1px solid #ffffff" : "none" }} />
      ))}
    </div>
  );
}

// ─── Texto de busca por peça, memoizado ─────────────────────────────────────
// A busca testava cinco campos com toLowerCase() cada, e o recorte roda a
// busca uma vez por MENU com contagem (evento, tipo, patrocinador, data) além
// da lista: ~30 toLowerCase por peça por tecla. Os campos são os mesmos e na
// mesma ordem; o separador \u0001 impede um acerto atravessando dois campos
// (fim do tipo + começo do evento), que a busca campo a campo nunca dava.
const TEXTO_DE_BUSCA = new WeakMap<object, string>();
function textoDeBusca(item: any): string {
  let t = TEXTO_DE_BUSCA.get(item);
  if (t === undefined) {
    t = [
      item.type ?? "",
      item.event?.name || "",
      item.displayId ?? "",
      item.description || "",
      ...(Array.isArray(item.sponsors) ? item.sponsors.map((s: any) => s?.name || "") : []),
    ].join("\u0001").toLowerCase();
    TEXTO_DE_BUSCA.set(item, t);
  }
  return t;
}

/** Opções do menu de Foco — constantes; inline, nasciam novas a cada render. */
const FOCO_OPTIONS = Object.keys(FOCO_LABELS).map((value) => ({ value, label: FOCO_LABELS[value], pinned: true }));

// ─── Carimbo de frescor com relógio PRÓPRIO ─────────────────────────────────
// O relógio de 30s que envelhece o "Atualizado há 2 min" morava em PainelGeral
// — e um setState no topo re-renderizava a página inteira a cada 30 segundos.
// Pelo mesmo motivo `isFetching`/`dataUpdatedAt` saíram do useQuery da página:
// o React Query só notifica quem LÊ a propriedade, e cada revalidação (duas
// trocas de isFetching) virava dois renders da lista mesmo sem dado novo.
// Aqui o carimbo assina o estado da query direto no cache, sem observer novo
// (nenhuma mudança de refetch), e só ele re-renderiza.
const CHAVE_ITENS = ["/api/items"];
const HASH_ITENS = JSON.stringify(CHAVE_ITENS);
function assinarEstadoDosItens(avisar: () => void) {
  return queryClient.getQueryCache().subscribe((ev) => {
    if (ev.query.queryHash === HASH_ITENS) avisar();
  });
}
function lerEstadoDosItens(): string {
  const s = queryClient.getQueryState(CHAVE_ITENS);
  return `${s?.fetchStatus ?? "idle"}|${s?.dataUpdatedAt ?? 0}`;
}

function CarimboDeFrescor() {
  const [fetchStatus, atualizadoEm] = useSyncExternalStore(assinarEstadoDosItens, lerEstadoDosItens).split("|");
  const isFetching = fetchStatus === "fetching";
  // Relógio de parede só para o carimbo envelhecer sozinho na tela: sem ele,
  // "há 2 min" ficava escrito até a próxima revalidação.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const frescor = formatFrescor(Number(atualizadoEm), agora);
  if (!frescor) return null;
  return (
    <div
      /* A promessa tem de bater com o código: "a cada minuto" era a
         regra antiga — hoje quem traz a mudança na hora é o aviso do
         servidor, e a revalidação de segurança roda a cada 5 min. */
      title={`${frescor.srLabel}. Esta tela se atualiza sozinha: na hora em que alguém muda uma peça, ao voltar para a aba e, por segurança, a cada 5 minutos. Ponto verde = atualizada há menos de 3 minutos.`}
      data-testid="painel-frescor"
      style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "#746e69", whiteSpace: "nowrap" }}
    >
      {isFetching
        ? <Loader2 className="animate-spin" style={{ width: 11, height: 11, color: "#746e69" }} aria-hidden="true" />
        : <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: frescor.tone === "fresco" ? "#15803d" : "#b45309", flexShrink: 0 }} />}
      {/* Sem aria-live aqui de propósito: quem anuncia mudança é o
          contador de resultados. Duas regiões vivas competindo fazem o
          leitor de tela falar por cima de si mesmo a cada minuto. */}
      <span>{isFetching ? "Atualizando…" : `Atualizado ${frescor.texto}`}</span>
    </div>
  );
}

// ─── A LISTA POR EVENTO — grupos e linhas memoizados (PERF-4, 17/09) ────────
//
// O PROBLEMA MEDIDO. A lista inteira morava dentro do corpo de PainelGeral, e
// QUALQUER estado da página re-renderizava todas as linhas: abrir o menu de
// Exportar, abrir a ficha de uma peça, o relógio de 30s do carimbo de frescor
// e cada revalidação da query (isFetching liga e desliga — duas vezes a cada
// invalidação do WebSocket, mesmo quando o servidor devolve exatamente o
// mesmo acervo). Com 5.000 peças: 250 linhas e ~30 cabeçalhos refeitos por
// clique, e em cada cabeçalho `diasNoEstado` sobre TODAS as peças do evento.
//
// A CURA. Cabeçalho de evento e linha de peça viram componentes memoizados,
// com props primitivas ou estáveis (o objeto `acoes` nasce uma vez e lê o
// estado atual por ref). Um clique que não muda a lista não chega às linhas.
// Os componentes ficam NESTE arquivo de propósito: os testes da casa leem o
// texto de painel-geral.tsx (testids, trechos de regra) e a regra é a mesma.

type SortCampo = "displayId" | "status" | "area" | "ciclo";

/** Ações da lista — objeto estável; as funções leem o estado atual por ref. */
interface AcoesDaLista {
  abrir: (item: any) => void;
  alternarSelecao: (id: string) => void;
  alternarSelecaoDoEvento: (itens: any[], marcar: boolean) => void;
  excluir: (id: string) => void;
  restaurar: (id: string) => void;
  /** `extra`: quantas linhas o clique revela — entram no orçamento na hora. */
  expandir: (key: string, extra: number) => void;
  abrirGrupo: (key: string, extra: number) => void;
  ordenar: (campo: SortCampo) => void;
}

type MetaDoEvento = {
  truckDayMs: number | null;
  pendentes: number;
  selo: SeloEventoFinalizado | null;
};

// ─── Renderização incremental por ORÇAMENTO de linhas ───────────────────────
// O teto antigo (5 eventos × 50 linhas) montava até 250 linhas na abertura, e
// a primeira dobra mostra umas oito: o primeiro evento já passa de 3.000px.
// Agora a tela monta um orçamento inicial e uma sentinela no fim do que foi
// montado pede o próximo lote quando o usuário chega a ~1.500px dela. O
// resultado final é o MESMO conjunto de antes (os mesmos tetos, os mesmos
// botões "Mostrar"); só deixa de ser montado de uma vez o que ninguém vê.
// Contadores, KPIs, busca e exportação continuam sobre a lista inteira — o
// orçamento só decide o que vai para o DOM.
const LINHAS_INICIAIS = 40;
const LINHAS_POR_LOTE = 60;
/** Cabeçalho do evento (+ thead ou botão "Mostrar") custa ~2 linhas de altura. */
const CUSTO_CABECALHO = 2;

/** O contêiner que rola de verdade (o <main> do layout), para a margem da sentinela valer. */
function ancestralQueRola(el: HTMLElement): Element | null {
  let n = el.parentElement;
  while (n && n !== document.body) {
    const oy = getComputedStyle(n).overflowY;
    if (oy === "auto" || oy === "scroll") return n;
    n = n.parentElement;
  }
  return null;
}

/**
 * Pede o próximo lote quando se aproxima da área visível. A `key` muda a cada
 * lote no pai: a sentinela remonta e o observer recém-criado reporta de novo
 * se ela CONTINUA perto (lote pequeno demais para empurrá-la para longe).
 */
function SentinelaDeLote({ onVisivel }: { onVisivel: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // A margem precisa ser do contêiner que rola: com a raiz implícita (a
    // janela), o recorte do <main> anularia a antecipação e o lote só chegaria
    // com a sentinela já na tela.
    const io = new IntersectionObserver(
      (entradas) => { if (entradas.some((e) => e.isIntersecting)) onVisivel(); },
      { root: ancestralQueRola(el), rootMargin: "0px 0px 1500px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onVisivel]);
  return <div ref={ref} aria-hidden="true" data-testid="painel-sentinela-lote" style={{ height: 1 }} />;
}

/** Agrupa as linhas visíveis por Grupo Pai → Tipo, na ordem de exibição. */
function secoesDoGrupo(visibleItems: any[], typeToGroup: Record<string, string>) {
  // Group by Grupo Pai first, then by type within each
  // group. typeToGroup vem do memo do topo (fonte única).
  const groupMap: Record<string, Record<string, any[]>> = {};
  for (const item of visibleItems) {
    const g = typeToGroup[item.type] || '';
    if (!groupMap[g]) groupMap[g] = {};
    if (!groupMap[g][item.type]) groupMap[g][item.type] = [];
    groupMap[g][item.type].push(item);
  }
  const sortedGroups = Object.keys(groupMap).sort((a, b) => {
    if (a === '') return 1; if (b === '') return -1;
    return COLLATOR_PT.compare(a, b);
  });
  return sortedGroups.map((group) => ({ group, tipos: Object.entries(groupMap[group]) }));
}

interface LinhaProps {
  item: any;
  idx: number;
  selecionado: boolean;
  selo: SeloEventoFinalizado | null;
  isCompact: boolean;
  isAdmin: boolean;
  canDeleteAny: boolean;
  restaurando: boolean;
  restorePending: boolean;
  relogioIdade: number;
  acoes: AcoesDaLista;
}

const LinhaDaPeca = memo(function LinhaDaPeca({
  item, idx, selecionado, selo, isCompact, isAdmin, canDeleteAny, restaurando, restorePending, relogioIdade, acoes,
}: LinhaProps) {
  const isDeleted = !!item.deletedAt;
  return (
    <tr
      className="pg-row"
      data-zebra={idx % 2 === 1 ? "1" : "0"}
      data-deleted={isDeleted ? "1" : "0"}
      data-selected={selecionado ? "1" : "0"}
      data-testid={`item-row-${item.id}`}
      onClick={() => !isDeleted && acoes.abrir(item)}
    >
      {/* Seleção */}
      <td style={{ padding: "10px 0 10px 12px" }}>
        {!isDeleted && (
          /* stopPropagation no LABEL, e não só no input:
             a linha inteira abre a peça no clique, e a área
             nova do alvo fica fora do input. Sem isto, mirar
             a borda do alvo marcaria a peça E abriria o
             modal — o alvo maior viraria uma armadilha. */
          <label className="pg-check" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={selecionado}
              onChange={() => acoes.alternarSelecao(item.id)}
              aria-label={`Selecionar a peça ${item.displayId}`}
              data-testid={`checkbox-${item.id}`}
              style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#c2410c" }}
            />
          </label>
        )}
      </td>

      {/* ID (+ tipo; + medidas no modo reduzido) */}
      <td style={{ padding: "10px 18px 10px 20px", overflow: "hidden" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <button onClick={e => { e.stopPropagation(); if (!isDeleted) acoes.abrir(item); }} disabled={isDeleted} aria-label={`Ver detalhes da peça ${item.displayId}`} data-testid={`text-display-id-${item.id}`} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "monospace", fontWeight: 700, color: isDeleted ? "#b91c1c" : "#c2410c", fontSize: 13, textDecoration: isDeleted ? "line-through" : "none", textAlign: "left" }}>
            {item.displayId}
          </button>
          <SeloKit peca={item} style={{ alignSelf: "flex-start" }} />
          {/* O TIPO só existia na linha de sub-header
              com colspan, que não é sticky: com 40
              "Banner" num evento, rolar deixava a
              linha órfã do próprio tipo. */}
          <span title={item.type} style={{ fontSize: 10, fontWeight: 600, color: "#746e69", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.type}
          </span>
          {/* O selo se repete na LINHA, e não só
              no cabeçalho do grupo: quem chega por
              busca de código, por link direto ou
              rolando uma lista longa lê a linha, e
              o cabeçalho pode estar 40 linhas
              acima. A frase começa em "Evento" —
              é a mesma da trilha da ficha (lib/
              status, marcoEventoFinalizado), para
              que ninguém entenda que foi a PEÇA
              que acabou. */}
          {/* OS SELOS DEITAM, e não empilham.

              Esta célula era uma coluna vertical com
              até OITO filhos — ID, tipo, selo do
              evento, data de exclusão, medidas,
              "Reaproveit.", "Ref. visual" e "Book" —
              cada um numa linha própria com gap 4.
              Como quase todos são condicionais, a
              altura da linha passava a depender de
              QUANTOS selos aquela peça tivesse.

              Medido em produção, 150 linhas: 55% em
              63px e o resto espalhado até 93px. E a
              coluna de ID era a única causa — as
              outras seis colunas cabem em 24px. A
              lista lia irregular porque a identidade
              da peça crescia para baixo.

              Selo é etiqueta, e etiqueta deita ao lado
              da outra. Numa fileira que quebra só
              quando precisa, quatro selos ocupam UMA
              linha em vez de quatro. */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, minWidth: 0 }}>
          {selo && !isDeleted && (
            <span
              title={selo.hintPeca}
              data-testid={`selo-peca-${item.id}`}
              style={{ ...SELO_CALMO, color: selo.text, backgroundColor: selo.bg, border: `1px solid ${selo.border}` }}
            >
              {selo.labelPeca}
            </span>
          )}
          {isDeleted && item.deletedAt && (
            <span style={{ fontSize: 10, color: "#746e69" }}>
              Excluído {format(new Date(item.deletedAt), "dd/MM/yy", { locale: ptBR })}
            </span>
          )}
          {isCompact && !isDeleted && ((item.visualWidth && item.visualHeight) || (item.fileWidth && item.fileHeight)) && (
            <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#57534e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.fileWidth && item.fileHeight
                ? `ARQ ${item.fileWidth} × ${item.fileHeight}`
                : `VIS ${item.visualWidth} × ${item.visualHeight}`}
            </span>
          )}
          {!isDeleted && item.isReuse && (
            <span style={SELO_CALMO}>
              Reaproveitada
            </span>
          )}
          {!isDeleted && item.referenceUrl && (
            <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Ver referência visual do solicitante" className="pg-anexo" style={{ ...SELO_CALMO, gap: 4, textDecoration: "none" }} data-testid={`link-reference-painel-${item.id}`}>
              <Paperclip aria-hidden="true" style={{ width: 11, height: 11 }} />
              Ref. visual
            </a>
          )}
          {!isDeleted && item.bookUrl && (
            <a href={item.bookUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Abrir book de aprovação (PDF) enviado pela Arte" className="pg-anexo" style={{ ...SELO_CALMO, gap: 4, textDecoration: "none" }} data-testid={`link-book-painel-${item.id}`}>
              <FileText aria-hidden="true" style={{ width: 11, height: 11 }} />
              Book
            </a>
          )}
          </div>
        </div>
      </td>

      {/* Descrição (+ patrocinador no modo reduzido) */}
      <td style={{ padding: "10px 18px", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden", minWidth: 0 }}>
          {item.description ? (
            <span title={item.description} style={{ fontSize: 13, color: isDeleted ? "#746e69" : "#44403c", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0, textDecoration: isDeleted ? "line-through" : "none" }}>
              {item.description}
            </span>
          ) : (
            <span style={{ color: "#746e69", fontSize: 13 }}>—</span>
          )}
          {!isDeleted && item.observations && (
            /* maxWidth + ellipsis + title: o selo
               mostrava a observação INTEIRA com
               nowrap e flex-shrink 0. O campo é
               texto livre e carrega motivo de
               reprovação — parágrafos. O ↩ cru
               virou ícone com rótulo. */
            <span
              title={item.observations}
              style={{ ...SELO_CALMO, flexShrink: 1, minWidth: 0, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", gap: 4, fontWeight: 500 }}
            >
              <MessageSquare style={{ width: 11, height: 11, flexShrink: 0 }} aria-label="Observação" />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.observations}</span>
            </span>
          )}
        </div>
        {isCompact && !isDeleted && (
          <div style={{ marginTop: 4, minWidth: 0, overflow: "hidden" }}>
            <SponsorChips sponsors={item.sponsors ?? []} variant="colored" size="sm" max={3} />
          </div>
        )}
      </td>

      {/* Medidas */}
      {!isCompact && (
        <td style={{ padding: "10px 18px", overflow: "hidden" }}>
          {!isDeleted && ((item.visualWidth && item.visualHeight) || (item.fileWidth && item.fileHeight)) ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {/* ARQ primeiro e escuro: é o par que a
                  impressora recebe e o m² cobra — a mesma
                  ênfase da Gráfica, para as duas telas
                  contarem a mesma história. */}
              {item.fileWidth && item.fileHeight && (
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#b45309", width: 30, flexShrink: 0 }}>ARQ</span>
                  <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#44403c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.fileWidth} × {item.fileHeight}
                  </span>
                </div>
              )}
              {item.visualWidth && item.visualHeight && (
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#746e69", width: 30, flexShrink: 0 }}>VIS</span>
                  <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#746e69", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.visualWidth} × {item.visualHeight}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <span style={{ color: "#746e69", fontSize: 13 }}>—</span>
          )}
        </td>
      )}

      {/* Patrocinador — na linha excluída a célula ganha "—" em vez
          de ficar vazia (leitura de tabela: vazio parece dado faltando). */}
      {!isCompact && (
        <td style={{ padding: "10px 18px", overflow: "hidden" }}>
          {isDeleted
            ? <span style={{ color: "#746e69", fontSize: 13 }}>—</span>
            : <SponsorChips sponsors={item.sponsors ?? []} variant="colored" size="sm" max={4} />}
        </td>
      )}

      {/* Status · tempo

          A pilula diz ONDE a peca esta; a linha
          abaixo diz DESDE QUANDO. Sem a segunda, a
          lista mostra 1.129 pecas em "Aguardando
          envio" sem distinguir vazao normal de
          travamento de duas semanas.

          Peca sem carimbo nao ganha linha nenhuma:
          um campo vazio diz "nao sei"; um numero
          inferido da criacao diria "sei" e mentiria.

          Padding 16 e nao 20: abre a linha extra sem
          crescer a altura da tabela. */}
      <td data-testid={`cell-idade-${item.id}`} style={{ padding: "10px 16px", overflow: "hidden" }}>
        <StatusPill status={isDeleted ? "deleted" : item.status} />
        {!isDeleted && <DetalheProducao item={item} style={{ whiteSpace: "normal" }} />}
        {(() => {
          if (isDeleted) return null;
          // `relogioIdade` e nao Date.now(): a linha e memoizada, entao o
          // "agora" chega por prop (ver o relogio de hora em PainelGeral).
          const d = diasNoEstado(item, relogioIdade);
          if (d === null) return null;
          const tom = tomDaIdade(d);
          return (
            <p
              style={{ margin: "3px 0 0", fontSize: 11, color: tom.cor, fontWeight: tom.peso, whiteSpace: "nowrap" }}
              /* O title passa a existir SEMPRE: "há 3 dias" solto
                 não diz de quê — da criação? da última edição?
                 É o tempo desde a última MUDANÇA DE STATUS. */
              title={d > LIMITE_PARADA
                ? `Parada em ${getStatusMeta(item.status).label} ${idadePorExtenso(d)} (mais de ${LIMITE_PARADA} dias sem mudar de etapa)`
                : `Em ${getStatusMeta(item.status).label} ${d === 0 ? "desde hoje" : idadePorExtenso(d)} — tempo desde a última mudança de status`}
            >
              {idadePorExtenso(d)}
            </p>
          );
        })()}
      </td>

      {/* Ação */}
      <td style={{ padding: "10px 18px", textAlign: "right" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
          {isDeleted && (isAdmin ? (
            <button
              onClick={(e) => { e.stopPropagation(); acoes.restaurar(item.id); }}
              disabled={restorePending}
              title="Restaurar peça" aria-label="Restaurar peça"
              data-testid={`button-restore-${item.id}`}
              style={{ background: "#d1fae5", border: "1px solid #6ee7b7", cursor: restorePending ? "not-allowed" : "pointer", borderRadius: 6, color: "#065f46", display: "flex", alignItems: "center", justifyContent: "center", padding: 6, opacity: restorePending ? 0.6 : 1 }}
            >
              {restaurando
                ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
                : <RotateCcw style={{ width: 14, height: 14 }} />}
            </button>
          ) : (
            <button
              type="button" disabled aria-disabled="true"
              title="Só um administrador pode restaurar peças excluídas"
              aria-label="Só um administrador pode restaurar peças excluídas"
              style={{ background: "none", border: "none", padding: 4, color: "#a8a29e", display: "flex", alignItems: "center", justifyContent: "center", cursor: "not-allowed" }}
            >
              <RotateCcw style={{ width: 15, height: 15 }} />
            </button>
          ))}
          {!isDeleted && (
            <button
              onClick={(e) => { e.stopPropagation(); acoes.abrir(item); }}
              aria-label="Ver detalhes da peça" title="Ver detalhes" data-testid={`button-view-${item.id}`}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: 4, borderRadius: 6, color: "#746e69",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#c2410c")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#746e69")}
            >
              <Eye style={{ width: 16, height: 16 }} />
            </button>
          )}
          {!isDeleted && canDeleteAny && (
            <button
              onClick={(e) => { e.stopPropagation(); acoes.excluir(item.id); }}
              data-testid={`button-delete-${item.id}`}
              title="Excluir peça" aria-label="Excluir peça"
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: 4, borderRadius: 6, color: "#746e69",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#dc2626")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#746e69")}
            >
              <Trash2 style={{ width: 15, height: 15 }} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});

const CartaoDaPeca = memo(function CartaoDaPeca({
  item, idx: ci, selo, isAdmin, canDeleteAny, restaurando, restorePending, acoes,
}: Omit<LinhaProps, "selecionado" | "isCompact" | "relogioIdade">) {
  const isDeleted = !!item.deletedAt;
  return (
    <div
      data-testid={`item-row-${item.id}`}
      onClick={() => !isDeleted && acoes.abrir(item)}
      style={{
        border: `1px solid ${isDeleted ? "#fecaca" : "#e7e5e4"}`,
        borderRadius: 8,
        padding: "10px 12px",
        marginBottom: 8,
        backgroundColor: isDeleted ? "#fff5f5" : (ci % 2 === 1 ? "#f6f4f1" : "#ffffff"),
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        cursor: "pointer",
        overflow: "hidden",
        opacity: isDeleted ? 0.75 : 1,
      }}
    >
      {/* Card content */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        {/* Row 1: ID + type */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <button onClick={e => { e.stopPropagation(); if (!isDeleted) acoes.abrir(item); }} disabled={isDeleted} aria-label={`Ver detalhes da peça ${item.displayId}`} data-testid={`text-display-id-${item.id}`} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "monospace", fontWeight: 700, color: isDeleted ? "#b91c1c" : "#c2410c", fontSize: 13, flexShrink: 0, textDecoration: isDeleted ? "line-through" : "none" }}>
            {item.displayId}
          </button>
          <SeloKit peca={item} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: isDeleted ? "#746e69" : "#44403c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, textDecoration: isDeleted ? "line-through" : "none" }}>{item.type}</span>
          {item.isReuse && !isDeleted && (
            <span style={{ ...SELO_CALMO, flexShrink: 0 }}>
              Reaproveitada
            </span>
          )}
        </div>
        {/* Row 2: description — allow up to 2 lines on mobile */}
        {item.description && (
          <span style={{ fontSize: 13, color: isDeleted ? "#746e69" : "#44403c", fontWeight: 500, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>
            {item.description}
          </span>
        )}
        {/* Row 3: status pill */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <StatusPill status={isDeleted ? "deleted" : item.status} />
          {/* Mesmo selo da linha do desktop, ao
              lado do status: no card o status é
              a informação que a pessoa lê, e é
              justamente ele que engana sozinho
              ("Em Produção" num evento que
              acabou). */}
          {selo && !isDeleted && (
            <span
              title={selo.hintPeca}
              data-testid={`selo-peca-${item.id}`}
              style={{ ...SELO_CALMO, color: selo.text, backgroundColor: selo.bg, border: `1px solid ${selo.border}` }}
            >
              {selo.labelPeca}
            </span>
          )}
          {isDeleted && item.deletedAt && (
            <span style={{ fontSize: 10, color: "#746e69" }}>
              {format(new Date(item.deletedAt), "dd/MM/yyyy", { locale: ptBR })}
            </span>
          )}
        </div>
        {!isDeleted && <DetalheProducao item={item} style={{ marginTop: 0 }} />}
        {/* Row 4: sponsors */}
        {!isDeleted && item.sponsors && item.sponsors.length > 0 && (
          <div style={{ minWidth: 0, overflow: "hidden" }}>
            <SponsorChips sponsors={item.sponsors} variant="colored" size="sm" max={2} />
          </div>
        )}
      </div>
      {/* Action buttons — compact on mobile */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
        {isDeleted && (isAdmin ? (
          <button
            onClick={(e) => { e.stopPropagation(); acoes.restaurar(item.id); }}
            disabled={restorePending}
            title="Restaurar peça" aria-label="Restaurar peça"
            data-testid={`button-restore-${item.id}`}
            style={{ background: "#d1fae5", border: "1px solid #6ee7b7", cursor: restorePending ? "not-allowed" : "pointer", borderRadius: 6, color: "#065f46", display: "flex", alignItems: "center", justifyContent: "center", height: 44, width: 44, opacity: restorePending ? 0.6 : 1 }}
          >
            {restaurando
              ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} />
              : <RotateCcw style={{ width: 15, height: 15 }} />}
          </button>
        ) : (
          // solicitacao ENXERGA a lixeira (o servidor libera o GET)
          // mas não pode restaurar: sem este botão a pessoa achava a
          // peça que apagou por engano e não descobria nem que existe
          // caminho de volta, nem a quem pedir.
          <button
            type="button" disabled aria-disabled="true"
            title="Só um administrador pode restaurar peças excluídas"
            aria-label="Só um administrador pode restaurar peças excluídas"
            style={{ background: "none", border: "1px solid #e7e5e4", borderRadius: 6, color: "#a8a29e", display: "flex", alignItems: "center", justifyContent: "center", height: 44, width: 44, cursor: "not-allowed" }}
          >
            <RotateCcw style={{ width: 15, height: 15 }} />
          </button>
        ))}
        {!isDeleted && (
          <button
            onClick={(e) => { e.stopPropagation(); acoes.abrir(item); }}
            aria-label="Ver detalhes da peça" title="Ver detalhes" data-testid={`button-view-${item.id}`}
            style={{
              background: "none", border: "1px solid #e7e5e4", cursor: "pointer",
              borderRadius: 6, color: "#746e69",
              display: "flex", alignItems: "center", justifyContent: "center",
              height: 44, width: 44,
            }}
          >
            <Eye style={{ width: 15, height: 15 }} />
          </button>
        )}
        {!isDeleted && canDeleteAny && (
          <button
            onClick={(e) => { e.stopPropagation(); acoes.excluir(item.id); }}
            data-testid={`button-delete-${item.id}`}
            title="Excluir peça" aria-label="Excluir peça"
            style={{
              background: "none", border: "1px solid #fecaca", cursor: "pointer",
              borderRadius: 6, color: "#746e69",
              display: "flex", alignItems: "center", justifyContent: "center",
              height: 44, width: 44,
            }}
          >
            <Trash2 style={{ width: 14, height: 14 }} />
          </button>
        )}
      </div>
    </div>
  );
});

interface GrupoDoEventoProps {
  eventKey: string;
  gd: { eventId: string | null; eventName: string; items: any[] };
  meta: MetaDoEvento | undefined;
  groupOpen: boolean;
  isExpanded: boolean;
  /** Quantas linhas este grupo pode montar agora (renderização incremental). */
  linhasPermitidas: number;
  hojeMs: number;
  relogioIdade: number;
  useCards: boolean;
  isCompact: boolean;
  colCount: number;
  topOffset: number;
  sortBy: SortCampo;
  sortDir: "asc" | "desc";
  typeToGroup: Record<string, string>;
  selectedIds: Set<string>;
  isAdmin: boolean;
  canDeleteAny: boolean;
  restoringItemId: string | null;
  restorePending: boolean;
  acoes: AcoesDaLista;
}

const GrupoDoEvento = memo(function GrupoDoEvento({
  eventKey, gd, meta, groupOpen, isExpanded, linhasPermitidas, hojeMs, relogioIdade,
  useCards, isCompact, colCount, topOffset, sortBy, sortDir, typeToGroup, selectedIds,
  isAdmin, canDeleteAny, restoringItemId, restorePending, acoes,
}: GrupoDoEventoProps) {
  const firstItem = gd.items[0];
  // Renderização incremental em dois níveis: até GROUP_CAP eventos
  // abertos e ROW_CAP linhas por evento. O resto entra sob demanda —
  // sem os dois tetos, o estado padrão da tela montava milhares de
  // <tr> que o WebSocket depois re-renderiza a cada mutação alheia.
  const visibleItems = useMemo(
    () => !groupOpen ? [] : (isExpanded || gd.items.length <= ROW_CAP ? gd.items : gd.items.slice(0, ROW_CAP)),
    [groupOpen, isExpanded, gd.items],
  );
  const hiddenCount = gd.items.length - visibleItems.length;
  const secoes = useMemo(() => secoesDoGrupo(visibleItems, typeToGroup), [visibleItems, typeToGroup]);
  // Selo de evento fora de jogo (encerrado à mão ou já realizado).
  // `null` enquanto o evento conta — a esmagadora maioria.
  const selo = meta?.selo ?? null;
  // Chip de prazo: calendário CRUZADO com o estado real das peças.
  // A regra inteira (e o porquê de a versão antiga errar em 100% dos
  // eventos) mora em lib/painel-prazo.ts, testada. O 4º argumento é
  // o que impede o "ATRASADO 8D" num evento que ninguém mais toca.
  const deadline: PrazoChip | null = computeDeadlineChip(
    meta?.truckDayMs ?? null, hojeMs, meta?.pendentes ?? 0, !!selo,
  );
  const todasSelecionadas = visibleItems.length > 0 && visibleItems.every((i: any) => i.deletedAt || selectedIds.has(i.id));
  // Peças paradas: varre TODAS as peças do evento — memoizado, só refaz quando
  // as peças ou o relógio de hora mudam (antes era a cada render da página).
  const paradas = useMemo(
    () => (gd.items as any[])
      .map(i => ({ i, d: diasNoEstado(i, relogioIdade) }))
      .filter((x): x is { i: any; d: number } => x.d !== null && x.d > LIMITE_PARADA),
    [gd.items, relogioIdade],
  );
  // Quantas linhas cabem no orçamento, na ORDEM de exibição (grupo pai → tipo).
  const renderizadas = Math.min(visibleItems.length, linhasPermitidas);
  const ariaSort = (campo: string): "ascending" | "descending" | "none" =>
    sortBy === campo ? (sortDir === "asc" ? "ascending" : "descending") : "none";

  // overflow: clip (não hidden): clipa o border-radius SEM criar
  // scroll-container — pré-requisito para o thead sticky funcionar
  // contra o scroll da página.
  return (
    <div style={{ border: "1px solid #e2e2e2", borderRadius: 12, backgroundColor: "#ffffff", overflow: "clip", boxShadow: "0 2px 8px rgba(28,25,23,0.07)" }}>

      {/* Group header — sticky logo abaixo da toolbar (topOffset):
          mantém o contexto do evento visível ao rolar listas longas.
          zIndex 6 fica ACIMA do thead sticky (5) e ABAIXO da toolbar
          (8); fundo sólido para as linhas não vazarem por trás.
          Altura FIXA (EVENT_HEADER_H) — é ela que o thead usa como
          `top` para encostar exatamente abaixo. Nada aqui cria novo
          scroll-container (ver comentário na tabela). */}
      <div style={{
        position: "sticky", top: topOffset, zIndex: 6,
        backgroundColor: "#ffffff",
        borderBottom: "1px solid #e7e5e4",
        // Altura fixa SÓ no desktop (onde o thead precisa dela p/
        // calcular o próprio top). Mobile usa cards, sem thead —
        // altura automática deixa os metadados quebrarem linha.
        ...(useCards
          ? { padding: "13px 18px 13px 20px" }
          : { padding: "0 18px 0 20px", height: EVENT_HEADER_H, boxSizing: "border-box" as const }),
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        // Acento do evento fora de jogo — o MESMO da lista de
        // Eventos: cinza no encerrado à mão (verde diria "deu tudo
        // certo", âmbar diria "corre atrás", e encerrado não é
        // nenhum dos dois) e âmbar no realizado. O laranja da marca
        // fica para os eventos que ainda estão em jogo.
        borderLeft: `3px solid ${selo ? selo.dot : "#f97316"}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            {/* Nome do evento navega para o detalhe. Era a única saída
                da tela e não parecia clicável: sem hover, sem
                sublinhado, sem ícone e sem foco visível — descoberta
                por acaso não é descoberta. Afordância no CSS (.pg-event-link). */}
            {gd.eventId ? (
              <Link
                href={`/eventos/${gd.eventId}`}
                onClick={(e) => e.stopPropagation()}
                title={`Abrir evento ${gd.eventName}`}
                className="pg-event-link"
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <h3 style={EVENT_TITLE_STYLE}>{gd.eventName}</h3>
                  <ArrowUpRight className="pg-goto" style={{ width: 12, height: 12, color: "#c2410c" }} aria-hidden="true" />
                </span>
              </Link>
            ) : (
              <h3 style={EVENT_TITLE_STYLE}>{gd.eventName}</h3>
            )}
            {/* Ordem invertida de propósito: o CHIP DE PRAZO vem
                primeiro e não encolhe. Com as datas primeiro e
                flexWrap nowrap + overflow hidden, o que era clipado
                em silêncio (sem reticências) era justamente
                "Atrasado 5d" — o dado mais acionável da linha. */}
            <div style={{ display: "flex", alignItems: "center", gap: useCards ? 10 : 12, marginTop: 5, minWidth: 0, flexWrap: useCards ? "wrap" : "nowrap", overflow: "hidden" }}>
              {/* O selo vem ANTES do chip de prazo e também não
                  encolhe: ele é a chave de leitura de todo o resto da
                  linha. Sem ele, "Saiu há 8d · 66 em aberto" parecia
                  um evento vivo em apuros. Palavras da lista de
                  Eventos — as duas telas falam do mesmo estado. */}
              {selo && (
                <span
                  title={selo.hint}
                  data-testid={`selo-evento-${eventKey}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, lineHeight: 1.3, color: selo.text, backgroundColor: selo.bg, border: `1px solid ${selo.border}`, borderRadius: 999, padding: "1px 8px", whiteSpace: "nowrap", flexShrink: 0 }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: selo.dot, flexShrink: 0 }} aria-hidden="true" />
                  {isCompact || useCards ? selo.short : selo.label}
                </span>
              )}
              {deadline && (
                <span
                  title={deadline.srLabel}
                  data-testid={`chip-prazo-${eventKey}`}
                  style={{ fontSize: 12, fontWeight: deadline.tone === "neutral" ? 500 : 700, color: deadline.color, whiteSpace: "nowrap", flexShrink: 0 }}
                >
                  {deadline.text}
                </span>
              )}
              {/* ── PECAS PARADAS ──

                  Antes das datas e com `flexShrink: 0`, pela mesma
                  regra do chip de prazo ao lado: dado acionavel nao
                  pode ser clipado em silencio quando a largura
                  aperta. A data pode encolher; "7 paradas" nao.

                  So aparece acima do limite — abaixo dele a peca esta
                  em fluxo, e um chip em todo cabecalho viraria papel
                  de parede. */}
              {(() => {
                if (paradas.length === 0) return null;
                const pior = paradas.reduce((a, b) => (b.d > a.d ? b : a));
                const tom = tomDaIdade(pior.d);
                return (
                  <span
                    data-testid={`chip-paradas-${eventKey}`}
                    title={`${paradas.length} ${paradas.length === 1 ? "peça parada" : "peças paradas"} há mais de ${LIMITE_PARADA} dias. A mais antiga: ${pior.i.displayId} em ${getStatusMeta(pior.i.status).label}, ${idadePorExtenso(pior.d)}.`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: tom.peso, color: tom.cor, whiteSpace: "nowrap", flexShrink: 0 }}
                  >
                    <Hourglass aria-hidden="true" style={{ width: 11, height: 11 }} />
                    {paradas.length} {paradas.length === 1 ? "parada" : "paradas"} {isCompact ? `+${LIMITE_PARADA} dias` : `há mais de ${LIMITE_PARADA} dias`}
                  </span>
                );
              })()}
              {firstItem?.event?.truckDepartureDate && (
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 500, color: "#746e69", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                  <Truck style={{ width: 11, height: 11, flexShrink: 0 }} />
                  Saída: {format(toUTCDisplayDate(firstItem.event.truckDepartureDate), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
              )}
              {/* "Início" é o metadado menos acionável; some primeiro
                  em container estreito (continua na ficha do evento). */}
              {firstItem?.event?.startDate && !isCompact && (
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 500, color: "#746e69", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                  <Calendar style={{ width: 11, height: 11, flexShrink: 0 }} />
                  Início: {format(parseDateLocal(firstItem.event.startDate), "dd MMM yyyy", { locale: ptBR })}
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {!useCards && <EventStatusBar items={gd.items} width={120} />}
          {/* Contador é informação neutra — texto simples, sem
              pílula nem caixa-alta: ao lado do chip de prazo e do
              selo, uma terceira cápsula só disputava o olho com os
              dois que pedem ação. #57534e sobre #ffffff = 7,63:1. */}
          <span style={{ fontSize: 12, fontWeight: 600, color: "#57534e", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            {fmtN(gd.items.length)} {gd.items.length === 1 ? "peça" : "peças"}
          </span>
        </div>
      </div>

      {!groupOpen ? (
        <button
          onClick={() => acoes.abrirGrupo(eventKey, Math.min(gd.items.length, ROW_CAP))}
          data-testid={`button-open-group-${eventKey}`}
          style={{ width: "100%", padding: "13px", background: "#fafaf9", border: "none", color: "#1c1917", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
        >
          Mostrar as {gd.items.length} {gd.items.length === 1 ? "peça" : "peças"} deste evento
        </button>
      ) : useCards ? (
        <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 0 }}>
          {(() => {
            let cardIdx = 0;
            return secoes.map(({ group, tipos }) => (
              <Fragment key={group || '__nogroup'}>
                {/* A FAIXA AZUL DO GRUPO PAI SAIU TAMBÉM DAQUI. No
                    desktop ela já tinha virado prefixo da linha de
                    tipo; o celular ficou com a versão antiga — azul,
                    caixa-alta 10px, uma família de cor que não se
                    repete em lugar nenhum. Agora as duas larguras
                    dizem "Grupo / Tipo  N" do mesmo jeito. */}
                {tipos.map(([type, typeItems]) => {
                  // Orçamento: o tipo só aparece se ao menos uma peça dele cabe.
                  const cabem = Math.max(0, Math.min(typeItems.length, renderizadas - cardIdx));
                  if (cabem === 0) return null;
                  return (
                    <Fragment key={type}>
                      {/* Type sub-header */}
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "10px 4px 6px", marginTop: 4, overflow: "hidden" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#44403c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>
                          {group && <span style={{ fontWeight: 500, color: "#746e69" }}>{group} / </span>}
                          {type}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#746e69", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                          {typeItems.length}
                        </span>
                      </div>
                      {typeItems.slice(0, cabem).map((item: any) => (
                        <CartaoDaPeca
                          key={item.id}
                          item={item}
                          idx={cardIdx++}
                          selo={selo}
                          isAdmin={isAdmin}
                          canDeleteAny={canDeleteAny}
                          restaurando={restoringItemId === item.id}
                          restorePending={restorePending}
                          acoes={acoes}
                        />
                      ))}
                    </Fragment>
                  );
                })}
              </Fragment>
            ));
          })()}
          {hiddenCount > 0 && renderizadas === visibleItems.length && (
            <button
              onClick={() => acoes.expandir(eventKey, hiddenCount)}
              data-testid={`button-show-all-${eventKey}`}
              style={{ width: "100%", padding: "13px", marginTop: 4, background: "#fafaf9", border: "1px solid #e7e5e4", borderRadius: 8, color: "#1c1917", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              Mostrar todas as {gd.items.length} peças (+{hiddenCount})
            </button>
          )}
        </div>
      ) : (
      /* overflow visível (não auto): qualquer scroll-container entre o
         th e o scroll da página quebraria o sticky do cabeçalho. O
         desktop comporta a tabela; larguras menores usam cards. */
      <div style={{ overflow: "visible" }}>
        {/* table-layout: fixed + colgroup — com `auto`, a largura
            mínima de uma coluna é o min-content do conteúdo, então um
            único campo de texto livre (a observação) esticava a tabela
            inteira e a página ganhava barra horizontal SILENCIOSA (o
            overflow-y do SidebarInset faz o overflow-x computar auto).
            Com fixed, nenhum conteúdo futuro consegue estourar. */}
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <caption className="sr-only">Peças do evento {gd.eventName}</caption>
          <colgroup>
            <col style={{ width: 40 }} />
            {isCompact ? (
              <>
                <col style={{ width: "27%" }} />
                <col style={{ width: "40%" }} />
                <col style={{ width: "17%" }} />
              </>
            ) : (
              <>
                <col style={{ width: "15%" }} />
                <col style={{ width: "27%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "12%" }} />
              </>
            )}
            <col style={{ width: 96 }} />
          </colgroup>
          <thead>
            <tr>
              {(() => {
                const thBase: React.CSSProperties = {
                  /* Sticky: colunas continuam visíveis ao rolar listas
                     longas. bg no th (não no tr) — th sticky sem fundo
                     ficaria transparente sobre as linhas.
                     top = topOffset + EVENT_HEADER_H: encosta exatamente
                     sob o header sticky do evento, que por sua vez está
                     sob a toolbar sticky (altura medida). */
                  position: "sticky", top: topOffset + EVENT_HEADER_H, zIndex: 5,
                  // CABEÇALHO CLARO. Era #1c1917 sólido — e com 38
                  // eventos abertos a tela desenhava 38 barras pretas
                  // de ponta a ponta, o elemento mais pesado do painel
                  // repetido dezenas de vezes. O cabeçalho de tabela
                  // não é conteúdo: é régua. A Arte e o Detalhe do
                  // Evento já usam este tratamento claro.
                  // #57534e sobre #fafaf9 = 7,30:1 ✓ nos 11px.
                  backgroundColor: "#fafaf9",
                  borderBottom: "1px solid #e7e5e4",
                  padding: "11px 20px",
                  fontSize: 11, fontWeight: 800, textTransform: "uppercase",
                  letterSpacing: "0.08em", color: "#57534e",
                  textAlign: "left",
                  whiteSpace: "nowrap",
                };
                const seta = (campo: string) => sortBy === campo ? (sortDir === "asc" ? " ↑" : " ↓") : "";
                const cols: React.ReactNode[] = [
                  <th key="sel" scope="col" style={{ ...thBase, padding: "12px 0 12px 12px" }}>
                    <label className="pg-check">
                      <input
                        type="checkbox"
                        checked={todasSelecionadas}
                        onChange={(e) => acoes.alternarSelecaoDoEvento(visibleItems, e.target.checked)}
                        aria-label={`Selecionar as peças visíveis do evento ${gd.eventName}`}
                        data-testid={`checkbox-all-${eventKey}`}
                        style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#c2410c" }}
                      />
                    </label>
                  </th>,
                  <th key="id" scope="col" aria-sort={ariaSort("displayId")} style={thBase}>
                    <span className="pg-sortable" role="button" tabIndex={0} onClick={() => acoes.ordenar("displayId")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); acoes.ordenar("displayId"); } }} title="Ordenar por ID">
                      {isCompact ? "ID / Medidas" : "ID"}{seta("displayId")}
                    </span>
                  </th>,
                  <th key="desc" scope="col" style={thBase}>{isCompact ? "Descrição / Patrocinador" : "Descrição"}</th>,
                ];
                if (!isCompact) {
                  cols.push(
                    <th key="med" scope="col" aria-sort={ariaSort("area")} style={thBase}>
                      <span className="pg-sortable" role="button" tabIndex={0} onClick={() => acoes.ordenar("area")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); acoes.ordenar("area"); } }} title="Ordenar por área">
                        Medidas{seta("area")}
                      </span>
                    </th>,
                    <th key="pat" scope="col" style={thBase}>Patrocinador</th>,
                  );
                }
                cols.push(
                  <th key="st" scope="col" aria-sort={ariaSort("status")} style={thBase}>
                    <span className="pg-sortable" role="button" tabIndex={0} onClick={() => acoes.ordenar("status")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); acoes.ordenar("status"); } }} title="Ordenar pela etapa do fluxo">
                      Status · tempo{seta("status")}
                    </span>
                  </th>,
                  <th key="ac" scope="col" style={{ ...thBase, textAlign: "right" }}>Ações</th>,
                );
                return cols;
              })()}
            </tr>
          </thead>
          <tbody>
            {(() => {
              let globalIdx = 0;
              return secoes.map(({ group, tipos }) => (
                <Fragment key={group || '__nogroup'}>
                  {/* A FAIXA AZUL DO GRUPO PAI SAIU. Eram DUAS linhas
                      inteiras empilhadas para rotular a mesma coisa —
                      uma azul com "2X1" e outra cinza com "2×1 PADRÃO
                      · 10" — em duas famílias de cor que não se
                      repetem em lugar nenhum da tela.
                      O pai virou PREFIXO da linha de tipo. Além de
                      devolver uma linha por grupo, informa mais: antes
                      o pai aparecia uma vez e some ao rolar; agora ele
                      acompanha cada tipo. */}
                  {tipos.map(([type, typeItems]) => {
                    // Orçamento: o tipo só aparece se ao menos uma peça dele cabe.
                    const cabem = Math.max(0, Math.min(typeItems.length, renderizadas - globalIdx));
                    if (cabem === 0) return null;
                    return (
                <Fragment key={type}>
                  {/* ── Type sub-header ── */}
                  <tr>
                    <td colSpan={colCount} style={{
                      padding: "6px 18px 6px 20px",
                      // #f5f5f4 e não #fafaf9: o cabeçalho da tabela
                      // passou a ser claro nesta rodada, e os dois no
                      // mesmo tom viravam a mesma faixa repetida.
                      backgroundColor: "#f5f5f4",
                      borderTop: "1px solid #e7e5e4",
                      borderBottom: "1px solid #e7e5e4",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {group && (
                          <>
                            {/* #746e69 sobre #f5f5f4 = 4,61:1 ✓ nos 11px.
                                O comentario anterior dizia "#78716c = 4,7:1"
                                e estava ERRADO: aquele cinza da 4,40 sobre
                                este fundo e REPROVA AA. Os dois cinzas ficam
                                a 6 unidades de distancia — indistinguiveis —
                                entao o que passa substitui o que falha, sem
                                custo visual nenhum.
                                O pai vem em peso e cor MENORES que o
                                tipo: ele é contexto, o tipo é o rótulo. */}
                            <span style={{ fontSize: 12, fontWeight: 500, color: "#746e69" }}>
                              {group}
                            </span>
                            {/* #746e69: é glifo de texto, e a casa proíbe #a8a29e como cor de texto (2,52:1). */}
                            <span aria-hidden="true" style={{ color: "#746e69", fontSize: 12 }}>/</span>
                          </>
                        )}
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#44403c" }}>
                          {type}
                        </span>
                        {/* A contagem deixou de ser pílula: número
                            simples, #746e69 sobre #f5f5f4 = 4,61:1. */}
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#746e69", fontVariantNumeric: "tabular-nums" }}>
                          {typeItems.length}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* ── Items within this type ── */}
                  {typeItems.slice(0, cabem).map((item: any) => (
                    <LinhaDaPeca
                      key={item.id}
                      item={item}
                      idx={globalIdx++}
                      selecionado={selectedIds.has(item.id)}
                      selo={selo}
                      isCompact={isCompact}
                      isAdmin={isAdmin}
                      canDeleteAny={canDeleteAny}
                      restaurando={restoringItemId === item.id}
                      restorePending={restorePending}
                      relogioIdade={relogioIdade}
                      acoes={acoes}
                    />
                  ))}
                </Fragment>
                    );
                  })}
                </Fragment>
              ));
            })()}
            {hiddenCount > 0 && renderizadas === visibleItems.length && (
              <tr>
                <td colSpan={colCount} style={{ padding: 0 }}>
                  <button
                    onClick={() => acoes.expandir(eventKey, hiddenCount)}
                    data-testid={`button-show-all-${eventKey}`}
                    style={{ width: "100%", padding: "13px", background: "#fafaf9", border: "none", borderTop: "1px solid #e7e5e4", color: "#1c1917", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                  >
                    Mostrar todas as {gd.items.length} peças (+{hiddenCount})
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
});


export default function PainelGeral() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  // Exclusão: admin e solicitação, em QUALQUER status — decisão do dono, mesma
  // regra do event-detail.tsx.
  //
  // O que torna a liberação segura é a natureza da ação: excluir aqui é SOFT
  // delete (grava deletedAt), fica registrado no log de auditoria e a peça
  // continua acessível — e restaurável por admin — na visão "Excluídos". Não é
  // uma porta sem volta, é tirar da listagem. A trava de escalão por status
  // impedia solicitação de apagar até o rascunho que ela mesma tinha acabado de
  // criar (awaiting_submission estava na lista de bloqueio), o que resolvia um
  // risco que não existia e criava um pedido de socorro ao admin por dia.
  //
  // A trava que CONTINUA valendo para todo mundo é a de integridade — peça mãe
  // com complemento vivo — e ela é barrada no servidor com 409, onde tem de
  // ser: é regra de dado, não de papel.
  const canDeleteAny = isAdmin || user?.role === "solicitacao";

  // Filtros inicializam da URL (?status=...&evento=...) — assim F5 não perde o
  // trabalho de filtrar e dá para compartilhar um link "itens atrasados do
  // evento X" com um colega.
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const fromCsv = (key: string) => { const v = urlParams.get(key); return v ? v.split(",").filter(Boolean) : []; };
  // Busca com debounce: o input atualiza `searchInput` a cada tecla; o filtro
  // (searchTerm) só é aplicado 200ms depois — sem isso, cada tecla refiltrava,
  // reordenava e reagrupava a lista inteira.
  const [searchInput, setSearchInput]   = useState(() => urlParams.get("busca") ?? "");
  const [searchTerm, setSearchTerm]     = useState(() => urlParams.get("busca") ?? "");
  const [statusFilter, setStatusFilter] = useState<string[]>(() => fromCsv("status"));
  const [eventFilter, setEventFilter]   = useState<string[]>(() => fromCsv("evento"));
  const [sponsorFilter, setSponsorFilter] = useState<string[]>(() => fromCsv("patrocinador"));
  const [typeFilter, setTypeFilter]     = useState<string[]>(() => fromCsv("tipo"));
  const [dateFilter, setDateFilter]     = useState<string[]>(() => fromCsv("saida"));
  const [focoFilter, setFocoFilter]     = useState<string[]>(() => fromCsv("foco"));
  // ── Peças de evento fora de jogo: ocultas na abertura ─────────────────────
  // Decisão do dono (14/08): "acho que não precisa aparecer inicialmente".
  // Mesmo padrão já provado das "entregues ocultas" da Gráfica — o estado mora
  // na URL (um recorte compartilhado tem de chegar igual do outro lado) e o
  // caminho de volta é um chip SEMPRE visível na faixa de atenção, nunca um
  // filtro escondido num dropdown.
  const [mostrarFinalizados, setMostrarFinalizados] = useState<boolean>(() => urlParams.get("finalizados") === "1");

  // Mantém a URL espelhando os filtros (replaceState: não polui o histórico).
  // Parte da query string ATUAL e sobrescreve só as chaves gerenciadas — um
  // param alheio (ex.: utm_source, flag de debug) sobrevive à filtragem.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string) => value ? p.set(key, value) : p.delete(key);
    setOrDelete("busca", searchTerm);
    setOrDelete("status", statusFilter.join(","));
    setOrDelete("evento", eventFilter.join(","));
    setOrDelete("patrocinador", sponsorFilter.join(","));
    setOrDelete("tipo", typeFilter.join(","));
    setOrDelete("saida", dateFilter.join(","));
    setOrDelete("foco", focoFilter.join(","));
    setOrDelete("finalizados", mostrarFinalizados ? "1" : "");
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [searchTerm, statusFilter, eventFilter, sponsorFilter, typeFilter, dateFilter, focoFilter, mostrarFinalizados]);

  // Debounce da busca (200ms) — ver comentário no estado searchInput.
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Voltar/avançar do navegador: reidrata os filtros a partir da URL. Sem
  // isso, o back trocava a URL mas a tela continuava com os filtros novos.
  useEffect(() => {
    const onPop = () => {
      const p = new URLSearchParams(window.location.search);
      const csv = (k: string) => { const v = p.get(k); return v ? v.split(",").filter(Boolean) : []; };
      setSearchInput(p.get("busca") ?? "");
      setSearchTerm(p.get("busca") ?? "");
      setStatusFilter(csv("status"));
      setEventFilter(csv("evento"));
      setSponsorFilter(csv("patrocinador"));
      setTypeFilter(csv("tipo"));
      setDateFilter(csv("saida"));
      setFocoFilter(csv("foco"));
      setMostrarFinalizados(p.get("finalizados") === "1");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Atalho "/" foca a busca (padrão de SaaS — Linear/GitHub). Ignorado quando
  // o usuário já está digitando em algum campo.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<any>(null);
  // Aumento de quantidade pós-produção (COMPLEMENTO): a peça-mãe em foco.
  const [deleteConfirmItemId, setDeleteConfirmItemId] = useState<string | null>(null);
  // Feedback do restaurar: guarda o id em restauração para trocar o ícone
  // daquele botão por um spinner (os outros só ficam desabilitados).
  const [restoringItemId, setRestoringItemId] = useState<string | null>(null);
  const [showExportPDFModal, setShowExportPDFModal] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [showAllKpis, setShowAllKpis] = useState(false);
  // "ciclo" é a porta de entrada do KPI de Ciclo de Entrega da Análise: o
  // número é a MEDIANA de um conjunto, e a pergunta que segue é sempre "quais
  // foram as mais demoradas". Nasce em desc porque ninguém clica ali para ver
  // a mais rápida.
  const [sortBy, setSortBy] = useState<"displayId" | "status" | "area" | "ciclo">(
    () => (new URLSearchParams(window.location.search).get("ordem") === "ciclo" ? "ciclo" : "displayId"),
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const isMobile = useIsMobile();
  // Densidade pela largura do CONTEÚDO, não da janela: com a sidebar aberta,
  // 1000px de janela deixam ~744px de conteúdo — e era aí que a tabela de 6
  // colunas estourava, dando rolagem horizontal na PÁGINA inteira, em silêncio.
  const { ref: rootRef, width: contentWidth } = useElementSize<HTMLDivElement>();
  const density: ContentDensity = contentWidth === 0
    ? (isMobile ? "cards" : "full")   // antes da 1ª medição: cai no palpite da janela
    : densityFromWidth(contentWidth);
  const useCards = isMobile || density === "cards";
  const isCompact = !useCards && density === "compact";
  // Altura REAL da toolbar sticky — ela quebra linha conforme a largura, e o
  // header de evento e o thead grudam logo abaixo dela. Número fixo aqui
  // esconderia uma camada atrás da outra na primeira quebra.
  const { ref: toolbarRef, height: toolbarH } = useElementSize<HTMLDivElement>();
  const stickyToolbar = !useCards;
  const topOffset = 4 + (stickyToolbar ? toolbarH : 0);

  // ── Frescor do dado ───────────────────────────────────────────────────────
  // O queryClient roda com staleTime Infinity e sem refetch: a ÚNICA fonte de
  // atualização era o WebSocket. Socket caído = painel congelado por tempo
  // indeterminado, enquanto o subtítulo prometia "tempo real". Aqui a query
  // desta tela sobrescreve o padrão: fica velha em 30s, revalida sozinha a cada
  // 60s e ao voltar o foco da aba. Sem botão "Atualizar" (decisão do dono): a
  // tela se atualiza sozinha e o carimbo diz desde quando o que se lê é verdade.
  //
  // PERF-4: `isFetching` e `dataUpdatedAt` NÃO são lidos aqui — quem os lê é o
  // <CarimboDeFrescor>. O React Query só re-renderiza o componente que lê a
  // propriedade; lidos aqui, cada revalidação re-renderizava a página duas
  // vezes mesmo quando o servidor devolvia o mesmo acervo.
  const {
    data: itensDoServidor = LISTA_VAZIA, isLoading, isError, refetch,
  } = useQuery<any[]>({
    queryKey: ["/api/items"],
    staleTime: 30_000,
    refetchInterval: 300_000, // 5min (auditoria 27/08): o WebSocket cobre o tempo real; isto é só a rede de segurança de socket morto
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  // BOOK COMPLETO fica de fora: é o trâmite do Atendimento, não uma peça (ver shared/fluxo-peca).
  const items = useMemo(() => (itensDoServidor as any[]).filter((i: any) => !ehBookCompleto(i)), [itensDoServidor]);
  const { data: sponsors = LISTA_VAZIA }      = useQuery<Sponsor[]>({ queryKey: ["/api/sponsors"], placeholderData: LISTA_VAZIA });
  const { data: standardItems = LISTA_VAZIA } = useQuery<StandardItem[]>({ queryKey: ["/api/standard-items"], placeholderData: LISTA_VAZIA });

  // Relógio de IDADE, na hora cheia. As idades ("há 3 dias") são em dias
  // inteiros e as linhas são memoizadas: um "agora" que mudasse a cada render
  // re-renderizaria todas elas. Este só muda uma vez por hora (o setState com
  // o mesmo número é descartado pelo React), então a idade nunca fica mais de
  // uma hora atrasada e a lista não re-renderiza à toa.
  const [relogioIdade, setRelogioIdade] = useState(() => Math.floor(Date.now() / HORA_MS) * HORA_MS);
  useEffect(() => {
    const t = setInterval(() => setRelogioIdade(Math.floor(Date.now() / HORA_MS) * HORA_MS), 60_000);
    return () => clearInterval(t);
  }, []);

  // Audit log SÓ da peça aberta no modal, buscado sob demanda. Antes a página
  // baixava /api/audit-logs INTEIRO no load (tabela que só cresce — em 1 ano,
  // megabytes por visita) apenas para alimentar o ItemDetailsDialog. O modal
  // filtra por entityId internamente, então receber o subconjunto é compatível.
  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs", "item", selectedItem?.id],
    queryFn: () =>
      fetch(`/api/audit-logs?entityType=item&entityId=${selectedItem!.id}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`Falha ao carregar o histórico (HTTP ${r.status})`))),
    // Resposta inesperada (HTML de erro, objeto) não pode chegar ao modal
    // como "array" — normaliza para lista vazia.
    select: d => (Array.isArray(d) ? d : []),
    enabled: !!selectedItem?.id,
    placeholderData: LISTA_VAZIA,
  });

  const showDeleted = statusFilter.includes("deleted");
  const {
    // LISTA_VAZIA e não `[]`: com a query desligada (o normal — sem a visão
    // Excluídos), `= []` criava um array novo a CADA render, e como ele é
    // dependência do useMemo do recorte, a filtragem/ordenação/agrupamento
    // das 5.000 peças era refeita a cada clique na tela (abrir um menu, abrir
    // a ficha, o relógio do carimbo). Era o gargalo nº 1 medido na PERF-4.
    data: deletedItems = LISTA_VAZIA,
    isLoading: deletedLoading,
    isError: deletedError,
    refetch: refetchDeleted,
  } = useQuery<any[]>({
    queryKey: ["/api/items/deleted"],
    enabled: showDeleted && canDeleteAny,
  });

  // ── /api/events só quando faz falta (PERF-4) ─────────────────────────────
  // Esta tela usava a lista de eventos (826 KB em produção, baixada duas vezes
  // na abertura) só para NOME e PRIORIDADE de um id — e toda peça de
  // /api/items já traz o evento dela embutido (`item.event`, o registro cru do
  // enrich do servidor, re-costurado a cada delta). O mapa sai daí. A lista
  // completa só é pedida no caso em que as peças não respondem: um link com
  // ?evento= de um evento sem nenhuma peça aqui, para o chip do filtro dizer o
  // nome e não o id.
  const eventoDasPecas = useMemo(() => {
    const m = new Map<string, any>();
    for (const lista of [items, deletedItems]) {
      for (const i of lista as any[]) if (i.eventId && i.event && !m.has(i.eventId)) m.set(i.eventId, i.event);
    }
    return m;
  }, [items, deletedItems]);
  const faltaNomeDeEvento = !isLoading && eventFilter.some((id) => !eventoDasPecas.has(id));
  const { data: events = LISTA_VAZIA as Event[] } = useQuery<Event[]>({
    queryKey: ["/api/events"], staleTime: 30_000, refetchOnWindowFocus: true, enabled: faltaNomeDeEvento,
  });
  const nomeDoEvento = (id: string): string | undefined =>
    eventoDasPecas.get(id)?.name ?? events.find((e) => e.id === id)?.name;

  // Restaurar (desfaz o soft delete) — SOMENTE admin; a visão Excluídos era
  // um beco sem saída (dava para ver, não para voltar).
  const restoreItemMutation = useMutation({
    mutationFn: async (itemId: string) => await apiRequest("POST", `/api/items/${itemId}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/deleted"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      toast({ title: "Peça restaurada", description: "Ela voltou às listagens com o status que tinha." });
    },
    onError: (error: any) => toast({ title: "Erro ao restaurar", description: error.message, variant: "destructive" }),
    onSettled: () => setRestoringItemId(null),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => await apiRequest("DELETE", `/api/items/${itemId}`),
    onSuccess: (_res, itemId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/deleted"] });
      // '/api/events' também: sem ela, com o socket caído, quem excluiu via a
      // lista certa e o status do evento errado no resto do app.
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setDeleteConfirmItemId(null);
      // Exclusão aqui é soft delete e existe rota de restore — mas só admin
      // pode chamá-la (solicitacao leva 403). Por isso o desfazer só aparece
      // para quem consegue desfazer; aos demais, o caminho para a lixeira.
      toast({
        title: "Peça excluída",
        description: "Ela saiu das listagens e foi para a lixeira.",
        action: isAdmin ? (
          <ToastAction
            altText="Desfazer exclusão"
            onClick={() => { setRestoringItemId(itemId); restoreItemMutation.mutate(itemId); }}
          >
            Desfazer
          </ToastAction>
        ) : canDeleteAny ? (
          <ToastAction altText="Ver a lixeira" onClick={() => setStatusFilter(["deleted"])}>
            Ver na lixeira
          </ToastAction>
        ) : undefined,
      });
    },
    onError: (error: any) => toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }),
  });

  // `uniqueTypes` saiu: era a lista de tipos do BANCO INTEIRO alimentando o
  // menu de Tipo, sem contagem e sem relação com o recorte da tela. Quem faz
  // isso agora é `typeFilterOptions`, que sai do mesmo pool da lista.

  const typeToGroup = useMemo(() => {
    const map: Record<string, string> = {};
    (standardItems as any[]).forEach((s: any) => { if (s.group) map[s.name] = s.group; });
    return map;
  }, [standardItems]);

  // Âncora SEPARADA para o predicado de evento finalizado, e ela é obrigatória:
  // `todayMs` (no memo abaixo) é meia-noite LOCAL do navegador, enquanto o
  // predicado compartilhado (servidor + as cinco filas) roda no dia do negócio
  // em São Paulo. Duas âncoras diferentes fariam o Painel divergir das filas
  // exatamente na virada do dia — o horário em que alguém confere o painel
  // antes do evento. É um número por DIA: como dependência de memo, só muda
  // na virada.
  const hojeNegocioMs = todayBusinessMs();

  // ── Retrato do evento, em memo PRÓPRIO (17/09) ───────────────────────────
  // Morava dentro do memo dos filtros: cada tecla da busca, cada troca de
  // status ou de ordenação criava um Map novo com objetos `meta` novos — e o
  // `memo` de GrupoDoEvento (que recebe `meta` e, por ele, o `selo` que desce
  // a cada linha) nunca pulava grupo nenhum. O retrato só lê `items` e o dia
  // do negócio; é deles que depende.
  const { eventMeta, seloDosEventosVivos } = useMemo(() => {
  // ── Retrato do evento, calculado sobre a base INTEIRA ────────────────────
  // De propósito não usa a lista filtrada: o chip de prazo diz "3 pendentes" e
  // esse número não pode encolher porque o usuário filtrou por "Entregue". O
  // estado do evento é o que é, independentemente do recorte na tela.
  const eventMeta = new Map<string, {
    truckDayMs: number | null;
    pendentes: number;
    /** Selo de evento fora de jogo — `null` enquanto ele ainda conta. */
    selo: SeloEventoFinalizado | null;
  }>();
  for (const i of items as any[]) {
    const key = i.eventId || "no-event";
    let m = eventMeta.get(key);
    if (!m) {
      const raw = i.event?.truckDepartureDate;
      // toUTCDisplayDate: mesma conversão usada na EXIBIÇÃO da saída — com
      // new Date() local, um fuso atrás do UTC classificava o dia errado.
      let truckDayMs: number | null = null;
      if (raw) { const d = toUTCDisplayDate(raw); d.setHours(0, 0, 0, 0); truckDayMs = d.getTime(); }
      m = { truckDayMs, pendentes: 0, selo: null };
      eventMeta.set(key, m);
    }
    if (!i.deletedAt && isPendingItemStatus(i.status)) m.pendentes++;
  }
  // ── Selo de evento fora de jogo, por evento ──────────────────────────────
  // Calculado DEPOIS do laço acima porque o rótulo do "realizado" depende da
  // contagem de pendentes ("com pendências" × "sem pendências"), que só fecha
  // no fim dele. `item.event` é o evento CRU do enrich de /api/items — traz
  // `status` e `startDate`, que são exatamente as duas colunas do predicado
  // compartilhado (@shared/prazo-dates), o mesmo das cinco filas.
  //
  // Cache próprio, alimentado sob demanda: a lista de EXCLUÍDAS pode trazer
  // peça de um evento que não tem nenhuma peça viva, e esse evento não existe
  // em `eventMeta`. Sem o fallback, a peça excluída de um evento encerrado
  // apareceria sem selo nenhum — exatamente o silêncio que este trabalho veio
  // acabar.
  const seloDosEventosVivos = new Map<string, SeloEventoFinalizado | null>();
  for (const i of items as any[]) {
    const key = i.eventId || "no-event";
    const m = eventMeta.get(key);
    if (!m || m.selo !== null) continue;
    if (!seloDosEventosVivos.has(key)) {
      seloDosEventosVivos.set(key, seloEventoFinalizado(i.event ?? null, hojeNegocioMs, m.pendentes));
    }
    m.selo = seloDosEventosVivos.get(key)!;
  }
  return { eventMeta, seloDosEventosVivos };
  }, [items, hojeNegocioMs]);

  // Filtragem, ordenação, agrupamento e KPIs são recomputados SÓ quando os
  // dados ou filtros mudam — sem o useMemo, cada render (ex.: abrir um modal)
  // refazia filter+sort da lista inteira.
  const { filteredItems, sortedGroupEntries, stats, atencao, ocultas,
          eventFilterOptions, typeFilterOptions, sponsorFilterOptions, dateFilterOptions } = useMemo(() => {
  // Hoje à meia-noite — calculado UMA vez por recomputação (antes era um
  // new Date por item dentro do filtro).
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  // Içado do applyBaseFilters: eram até 4 toLowerCase() do MESMO termo por item.
  const q = searchTerm.toLowerCase();

  // Cópia por recomputação: o fallback abaixo acrescenta eventos que só
  // existem na lista de EXCLUÍDAS, e isso não pode vazar para o memo do
  // retrato (que não depende de `deletedItems`).
  const seloPorEvento = new Map(seloDosEventosVivos);
  const seloDoItem = (item: any): SeloEventoFinalizado | null => {
    const key = item.eventId || "no-event";
    if (seloPorEvento.has(key)) return seloPorEvento.get(key)!;
    const selo = seloEventoFinalizado(item.event ?? null, hojeNegocioMs, eventMeta.get(key)?.pendentes ?? 0);
    seloPorEvento.set(key, selo);
    return selo;
  };
  const eventoFinalizado = (item: any) => seloDoItem(item) !== null;

  const temReprovacao = (item: any) =>
    Array.isArray(item.sponsors) &&
    item.sponsors.some((s: any) => getApprovalMeta(s?.approvalStatus)?.isRejection);

  // "Atrasada" é uma COBRANÇA, e evento fora de jogo não se cobra — nem quando
  // o usuário pede para VER as peças ocultas. Por isso a exclusão não olha o
  // `mostrarFinalizados`: revelar o registro é uma coisa, voltar a chamar de
  // atrasado o que ninguém mais vai tocar seria outra. Era isto que fazia o
  // chip "436 peças em evento com caminhão atrasado" contar um passivo que
  // ninguém ia atacar.
  const emEventoAtrasado = (item: any) => {
    const m = eventMeta.get(item.eventId || "no-event");
    return !!m?.truckDayMs && dayDiff(todayMs, m.truckDayMs) < 0
      && isPendingItemStatus(item.status) && !eventoFinalizado(item);
  };

  // ── A ocultação ──────────────────────────────────────────────────────────
  // A peça sai da lista quando o EVENTO dela saiu de circulação. Três
  // exceções, e as três são intenção EXPLÍCITA de ver aquilo:
  //   · o usuário pediu para ver (chip da faixa de atenção / deep link);
  //   · a busca é o CÓDIGO EXATO da peça — procurar "#3089" e ouvir "nenhuma
  //     peça encontrada" faria qualquer um concluir que ela sumiu do sistema;
  //   · o evento foi escolhido A DEDO no filtro de evento. Filtrar pelo nome do
  //     evento encerrado e receber "Nenhuma peça encontrada" seria a mesma
  //     armadilha, com um clique a menos de esforço para cair nela.
  //
  // `seriaOculto` ignora o botão e responde só "esta peça pertence à ocultação?".
  // É ele que alimenta a contagem do chip — sem essa separação o chip zeraria
  // assim que o usuário revelasse as peças, e o caminho de VOLTA para a lista
  // limpa desapareceria junto com ele.
  // Memoizado por peça DENTRO desta recomputação: a mesma peça passa por aqui
  // até seis vezes (base, ocultas, três pools de menu e a lista).
  const ocultoCache = new Map<any, boolean>();
  const seriaOculto = (item: any) => {
    let r = ocultoCache.get(item);
    if (r === undefined) {
      r = eventoFinalizado(item)
        && !buscaEhCodigoDaPeca(item.displayId, searchTerm)
        && !eventFilter.includes(item.eventId);
      ocultoCache.set(item, r);
    }
    return r;
  };
  const ocultoPorEvento = (item: any) => !mostrarFinalizados && seriaOculto(item);

  /**
   * O recorte base da tela. `exceto` desliga UMA dimensão — é assim que o
   * pool das opções de um menu sai da MESMA lista que a tela mostra, sem o
   * próprio filtro dele (senão a opção escolhida seria a única com número).
   * Mesma assinatura de `casaRecorte(item, 'evento')` na Revisão Final e de
   * `casaHistorico(i, 'evento')` no Atendimento — a disciplina travada em
   * server/__tests__/faceta-lista-invariante.test.ts.
   */
  type DimBase = "evento" | "tipo" | "patrocinador" | "data";
  // PERF-4: cada dimensão é avaliada UMA vez por peça por recomputação e
  // guardada como máscara de bits das dimensões que a peça NÃO casa. Antes a
  // peça era reavaliada inteira em cada chamada — uma pela base, uma por menu
  // com contagem e uma pela lista —, com cinco toLowerCase de busca em cada.
  // `applyBaseFilters(item, exceto)` responde igual: ignora o bit da dimensão
  // excluída e exige que as demais casem.
  const BIT_DIM: Record<DimBase, number> = { evento: 1, tipo: 2, patrocinador: 4, data: 8 };
  const BIT_BUSCA = 16;
  const falhasPorPeca = new Map<any, number>();
  const falhasDoRecorte = (item: any): number => {
    const cache = falhasPorPeca.get(item);
    if (cache !== undefined) return cache;
    // Busca sobre o texto memoizado da peça (código, evento, tipo, descrição
    // e patrocinador — ver textoDeBusca). Patrocinador: a tela exibe chips de
    // patrocinador em toda linha, então "buscar Ambev" é tentativa natural.
    const matchesSearch = q === "" || textoDeBusca(item).includes(q);
    const matchesEvent   = eventFilter.length === 0   || eventFilter.includes(item.eventId);
    const matchesType    = typeFilter.length === 0    || typeFilter.includes(item.type);
    const matchesSponsor = sponsorFilter.length === 0 ||
      (item.sponsors && Array.isArray(item.sponsors) && item.sponsors.some((s: any) => sponsorFilter.includes(s.id)));
    const matchesDate = dateFilter.length === 0 || (() => {
      // Âncora: SAÍDA DO CAMINHÃO (decisão de negócio) — é o prazo operacional
      // que os chips e alertas usam. Antes filtrava pelo início do evento, que
      // podia dizer "no prazo" com o caminhão já atrasado.
      // Itens sem data não são descartados em silêncio: têm opção própria.
      const truckDayMs = eventMeta.get(item.eventId || "no-event")?.truckDayMs ?? null;
      if (truckDayMs == null) return dateFilter.includes("no_departure");
      // dayDiff (Math.round): a MESMA conta do chip de prazo. Antes o filtro
      // usava ceil e o chip usava round sobre a mesma diferença.
      const diff = dayDiff(todayMs, truckDayMs);
      return dateFilter.some(df => df === "no_departure" ? false : (DATE_RANGE_MAP[df] ? DATE_RANGE_MAP[df](diff) : true));
    })();
    const falhas = (matchesSearch ? 0 : BIT_BUSCA) | (matchesEvent ? 0 : BIT_DIM.evento)
      | (matchesType ? 0 : BIT_DIM.tipo) | (matchesSponsor ? 0 : BIT_DIM.patrocinador)
      | (matchesDate ? 0 : BIT_DIM.data);
    falhasPorPeca.set(item, falhas);
    return falhas;
  };
  const applyBaseFilters = (item: any, exceto?: DimBase) =>
    (falhasDoRecorte(item) & ~(exceto ? BIT_DIM[exceto] : 0)) === 0;

  // "Fora do prazo": peça ENTREGUE depois do dia em que o caminhão saiu. É a
  // mesma conta de computeDesempenho — inclusive o `<=`, que trata entregar
  // NO dia da saída como no prazo, porque o caminhão carrega naquele dia.
  const entregueForaDoPrazo = (item: any) => {
    if (!isDelivered(item.status)) return false;
    const truckDayMs = eventMeta.get(item.eventId || "no-event")?.truckDayMs ?? null;
    if (truckDayMs == null || !item.deliveredAt) return false;
    const d = new Date(item.deliveredAt);
    d.setHours(0, 0, 0, 0);
    return d.getTime() > truckDayMs;
  };

  const matchesFoco = (item: any) => focoFilter.every(f =>
    f === "reprovadas" ? temReprovacao(item)
    : f === "atrasadas" ? emEventoAtrasado(item)
    : f === "pendentes" ? isPendingItemStatus(item.status)
    // Os dois abaixo são a porta de entrada dos KPIs da Análise.
    : f === "retrabalho" ? temRefacao(item as any)
    : f === "fora-do-prazo" ? entregueForaDoPrazo(item)
    : true);

  const matchesStatus = (item: any, f: string[]) => {
    const isDeleted = !!item.deletedAt;
    const activeFilters = f.filter(x => x !== "deleted");
    // Itens excluídos só aparecem quando o filtro "deleted" está ativo — e,
    // se houver outro status marcado, precisam casar com ele também. Antes o
    // atalho `return f.includes("deleted")` trazia a lixeira INTEIRA com o
    // card "Solicitado" marcado como Filtrado: o rótulo mentia.
    if (isDeleted) {
      if (!f.includes("deleted")) return false;
      return activeFilters.length === 0 || matchesStatusFilter(item.status, activeFilters);
    }
    // Itens normais nunca aparecem quando só "deleted" está selecionado —
    // com "Excluídos" como único filtro, a lista mostra SÓ os excluídos.
    if (activeFilters.length === 0) return !f.includes("deleted");
    return matchesStatusFilter(item.status, activeFilters);
  };

  // Quando o filtro "Excluídos" está ativo, mescla as peças soft-deleted na lista de exibição.
  const allDisplayItems = showDeleted ? [...items, ...(deletedItems as any[])] : items;

  // Base do bloco "Precisa de atenção": respeita evento/tipo/busca, mas NÃO o
  // próprio foco — senão o número do chip mudaria ao clicar nele mesmo.
  //
  // A REGRA DOS NÚMEROS DESTA TELA, e ela vale para TUDO (KPIs, contador de
  // resultados, chips de atenção, exportação): os números seguem o RECORTE
  // VISÍVEL. Um KPI é "quanto trabalho eu tenho", e evento fora de jogo não é
  // trabalho. A única exceção é o chip de ocultas logo abaixo — ele existe
  // justamente para contar o que os outros deixaram de contar, e é a porta de
  // volta. Metade dos números seguindo uma regra e metade outra seria pior que
  // qualquer das duas.
  const baseCompleta = (items as any[]).filter(i => applyBaseFilters(i));
  const baseItems = baseCompleta.filter(i => !ocultoPorEvento(i));
  const atencao = {
    reprovadas: baseItems.filter(temReprovacao).length,
    atrasadas: baseItems.filter(emEventoAtrasado).length,
  };

  // O que a ocultação tira (ou tiraria) da tela, por origem e por situação.
  // Contado sobre a base JÁ filtrada pelos demais recortes: o chip fala do que
  // sumiu DESTA lista, não do banco inteiro — senão ele anunciaria peças que o
  // filtro de evento tinha excluído de qualquer jeito.
  const ocultas: ContagemOcultas = { ...CONTAGEM_OCULTAS_ZERO };
  for (const i of baseCompleta) {
    if (!seriaOculto(i)) continue;
    const motivo = seloDoItem(i)!.motivo;
    const aberto = !i.deletedAt && isPendingItemStatus(i.status);
    if (motivo === "encerrado") { ocultas.encerrado++; if (aberto) ocultas.encerradoAberto++; }
    else { ocultas.realizado++; if (aberto) ocultas.realizadoAberto++; }
  }

  const statsItems = baseItems.filter(matchesFoco);

  // ── Opções dos menus, COM contagem ─────────────────────────────────────
  // Os seis menus desta tela eram os únicos do app sem número nenhum: os
  // cards de status contavam, os chips de atenção contavam, e os menus logo
  // ao lado ofereciam listas mudas. Pior no de Evento, que varria a query
  // `events` INTEIRA — oferecia evento do sistema todo sobre uma fila podada
  // por evento finalizado, e clicar num deles devolvia lista vazia sem dizer
  // por quê. É exatamente o defeito que o teste de invariante trava nas
  // outras telas.
  //
  // Cada pool exclui o próprio filtro (`exceto`) e respeita a ocultação de
  // evento finalizado — menos o de EVENTO, que a ignora de propósito: é
  // clicando no evento oculto que o operador o revela (`seriaOculto` já não
  // esconde evento escolhido à mão), então esconder a opção fecharia a única
  // porta de entrada. Mesma decisão da Gráfica com as peças entregues.
  const poolDe = (dim: DimBase, respeitarOcultacao = true) => {
    const base = (items as any[]).filter(i => applyBaseFilters(i, dim));
    return respeitarOcultacao ? base.filter(i => !ocultoPorEvento(i)) : base;
  };

  const PRIO_ORDEM: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };
  const PRIO_COR: Record<string, string> = { urgente: "#ef4444", alta: "#f97316", media: "#eab308", baixa: "#3b82f6" };
  // Nome e prioridade do evento saem do evento EMBUTIDO nas peças (ver
  // `eventoDasPecas`): todo id deste menu veio de uma peça, então ele sempre
  // responde — e a tela não precisa da lista inteira de /api/events.
  const eventoPorId = eventoDasPecas;

  const eventFilterOptions = (() => {
    const conta = new Map<string, number>();
    poolDe("evento", false).forEach(i => {
      if (!i.eventId) return;
      conta.set(i.eventId, (conta.get(i.eventId) ?? 0) + 1);
    });
    return Array.from(conta.entries())
      .map(([id, count]) => {
        // `events` entra só para buscar NOME e prioridade de um id que já veio
        // da lista — nunca como fonte do conjunto de opções.
        const ev = eventoPorId.get(id);
        return { value: id, label: ev?.name ?? "Evento sem nome", count, dotColor: PRIO_COR[ev?.priority ?? ""], _p: PRIO_ORDEM[ev?.priority ?? ""] ?? 4 };
      })
      // `pinned` em todas para o FilterSelect preservar esta ordem: por
      // prioridade e, dentro dela, alfabética — era a ordem que a tela já
      // tinha e que a ordenação alfabética padrão do menu desmontaria.
      .sort((a, b) => a._p !== b._p ? a._p - b._p : COLLATOR_PT.compare(a.label, b.label))
      .map(({ _p, ...o }) => ({ ...o, pinned: true }));
  })();

  const typeFilterOptions = (() => {
    const conta = new Map<string, number>();
    poolDe("tipo").forEach(i => { if (i.type) conta.set(i.type, (conta.get(i.type) ?? 0) + 1); });
    return Array.from(conta.entries()).map(([t, count]) => ({ value: t, label: t, count }));
  })();

  const sponsorFilterOptions = (() => {
    const conta = new Map<string, number>();
    poolDe("patrocinador").forEach(i => {
      if (!Array.isArray(i.sponsors)) return;
      // Set por peça: uma peça com o mesmo patrocinador repetido não pode
      // contar duas vezes — o clique nele devolveria UMA linha.
      new Set(i.sponsors.map((s: any) => s?.id).filter(Boolean)).forEach((id: any) => {
        conta.set(id, (conta.get(id) ?? 0) + 1);
      });
    });
    const nomePorId = new Map((sponsors as any[]).map(s => [s.id, s.name]));
    return Array.from(conta.entries())
      .map(([id, count]) => ({ value: id, label: nomePorId.get(id) ?? "Patrocinador", count }));
  })();

  const dateFilterOptions = (() => {
    // AUDITORIA 27/08: era uma varredura completa do pool POR OPÇÃO de data
    // (6+ passes por render). Uma passada só, contando cada peça em todas as
    // faixas em que ela cai — mesma régua, ~6× menos trabalho por render.
    const pool = poolDe("data");
    const conta = new Map<string, number>(DATE_FILTER_VALUES.map((v) => [v, 0]));
    for (const i of pool) {
      const truckDayMs = eventMeta.get(i.eventId || "no-event")?.truckDayMs ?? null;
      if (truckDayMs == null) {
        conta.set("no_departure", (conta.get("no_departure") ?? 0) + 1);
        continue;
      }
      const diff = dayDiff(todayMs, truckDayMs);
      for (const value of DATE_FILTER_VALUES) {
        if (value === "no_departure") continue;
        const casa = DATE_RANGE_MAP[value] ? DATE_RANGE_MAP[value](diff) : true;
        if (casa) conta.set(value, (conta.get(value) ?? 0) + 1);
      }
    }
    return DATE_FILTER_VALUES.map((value) => ({
      value,
      label: DATE_FILTER_LABELS[value],
      count: conta.get(value) ?? 0,
      pinned: true,
    }));
  })();

  /** Dias entre criação e entrega — a mesma conta do KPI de ciclo. */
  const cicloEmDias = (i: any): number | null => {
    if (!isDelivered(i.status) || !i.deliveredAt || !i.createdAt) return null;
    const fim = new Date(i.deliveredAt); fim.setHours(0, 0, 0, 0);
    const ini = new Date(i.createdAt); ini.setHours(0, 0, 0, 0);
    const d = (fim.getTime() - ini.getTime()) / 86400000;
    return d >= 0 ? d : null;
  };

  const areaDe = (i: any) => {
    const fw = Number(i.fileWidth), fh = Number(i.fileHeight);
    if (Number.isFinite(fw) && Number.isFinite(fh) && fw > 0 && fh > 0) return fw * fh;
    const vw = Number(i.visualWidth), vh = Number(i.visualHeight);
    if (Number.isFinite(vw) && Number.isFinite(vh) && vw > 0 && vh > 0) return vw * vh;
    return -1;
  };

  const dir = sortDir === "asc" ? 1 : -1;
  const filteredItems = allDisplayItems
    .filter((i: any) => applyBaseFilters(i))
    .filter((i: any) => !ocultoPorEvento(i))
    .filter(matchesFoco)
    .filter((i) => matchesStatus(i, statusFilter))
    .sort((a, b) => {
      // Itens excluídos ficam no final
      if (!!a.deletedAt !== !!b.deletedAt) return a.deletedAt ? 1 : -1;
      const gA = typeToGroup[a.type] || '', gB = typeToGroup[b.type] || '';
      if (gA !== gB) return COLLATOR_PT.compare(gA, gB);
      // Ordenação escolhida no cabeçalho. O padrão continua sendo o displayId:
      // compareDisplayId, não replace(/\D/g,'') — com o replace, o complemento
      // "#0062-C1" virava 621 e aparecia centenas de linhas longe da mãe.
      if (sortBy === "status") {
        // ORDENA PELO TEMPO NO ESTADO, nao pela etapa do fluxo. Ordenar por
        // etapa so reagrupa o que os cards ja agrupam; ordenar por tempo
        // responde a pergunta nova — o que esta parado ha mais tempo. Peca sem
        // carimbo vai para o fim: ela nao e "a mais nova", e desconhecida.
        const ia = diasNoEstado(a, Date.now()), ib = diasNoEstado(b, Date.now());
        if (ia !== ib) {
          if (ia === null) return 1;
          if (ib === null) return -1;
          return (ib - ia) * dir;
        }
        const d = statusFlowIndex(a.status) - statusFlowIndex(b.status);
        if (d !== 0) return d * dir;
      } else if (sortBy === "area") {
        const d = areaDe(a) - areaDe(b);
        if (d !== 0) return d * dir;
      } else if (sortBy === "ciclo") {
        // MESMA conta do KPI: dias entre a criação e a entrega, só para peça
        // entregue. Peça sem ciclo fechado não é "a mais rápida" — é outra
        // coisa, e vai para o fim em qualquer direção.
        const ca = cicloEmDias(a), cb = cicloEmDias(b);
        if (ca !== cb) {
          if (ca === null) return 1;
          if (cb === null) return -1;
          return (cb - ca) * dir;
        }
      } else {
        return compareDisplayId(a.displayId, b.displayId) * dir;
      }
      return compareDisplayId(a.displayId, b.displayId);
    });

  const groupedItems = filteredItems.reduce((acc, item) => {
    const k = item.eventId || "no-event";
    if (!acc[k]) acc[k] = { eventId: item.eventId, eventName: item.event?.name || "Sem Evento", items: [] };
    acc[k].items.push(item);
    return acc;
  }, {} as Record<string, { eventId: string | null; eventName: string; items: any[] }>);

  // KPIs num único passe, derivados do MESMO mapa que o predicado do filtro
  // (lib/painel-kpis). Antes eram duas escritas da mesma regra sem ligação, e
  // o switch sem `default:` deixava status fora do mapa somarem no Total e em
  // card nenhum — a soma dos cards parava de fechar sem qualquer aviso.
  const stats = computeStats(statsItems);


  // Grupos ordenados pela saída do caminhão (ascendente; sem data por último;
  // empate/sem data desempata pelo nome) — Object.entries herdava a ordem de
  // inserção, arbitrária para o usuário.
  //
  // ANTES DISSO, porém, evento fora de jogo vai para o FIM — nunca escondido,
  // sempre no fim. A ordem é por saída do caminhão ASCENDENTE, ou seja o mais
  // antigo primeiro: um evento encerrado em maio ficaria no topo da tela
  // empurrando para baixo tudo que ainda está vivo. Só acontece com o chip de
  // ocultas ligado (por padrão eles nem aparecem), e é exatamente aí que
  // importa: quem revelou o registro quer olhá-lo DEPOIS do trabalho do dia.
  type EventGroup = { eventId: string | null; eventName: string; items: any[] };
  const sortedGroupEntries = (Object.entries(groupedItems) as Array<[string, EventGroup]>).sort(([ka, a], [kb, b]) => {
    const fa = seloPorEvento.get(ka) ? 1 : 0;
    const fb = seloPorEvento.get(kb) ? 1 : 0;
    if (fa !== fb) return fa - fb;
    const da = eventMeta.get(ka)?.truckDayMs ?? null;
    const db = eventMeta.get(kb)?.truckDayMs ?? null;
    if (da == null && db == null) return COLLATOR_PT.compare(a.eventName, b.eventName);
    if (da == null) return 1;
    if (db == null) return -1;
    const diff = da - db;
    return diff !== 0 ? diff : COLLATOR_PT.compare(a.eventName, b.eventName);
  });

  return { filteredItems, sortedGroupEntries, stats, atencao, ocultas,
           eventFilterOptions, typeFilterOptions, sponsorFilterOptions, dateFilterOptions };
  }, [eventMeta, seloDosEventosVivos, hojeNegocioMs, items, deletedItems, showDeleted, searchTerm, statusFilter, eventFilter, sponsorFilter, typeFilter, dateFilter, focoFilter, mostrarFinalizados, typeToGroup, sortBy, sortDir, eventoDasPecas, sponsors]);

  // O chip de reversão. Fora do memo de propósito: ele depende de `ocultas`
  // (que vem de lá) mas também do estado do botão, e nada mais.
  const chipOcultasDados = chipOcultas(ocultas, mostrarFinalizados);

  // Clique no card alterna o status DENTRO do conjunto de filtros — coerente
  // com o dropdown multi-seleção. Antes o clique descartava a seleção inteira
  // e ficava impossível combinar dois status pelos cards.
  const toggleStatusCard = (filterKey: string) =>
    setStatusFilter(prev => prev.includes(filterKey) ? prev.filter(s => s !== filterKey) : [...prev, filterKey]);
  const toggleFoco = (key: string) =>
    setFocoFilter(prev => prev.includes(key) ? prev.filter(f => f !== key) : [...prev, key]);
  // DO ALERTA À LISTA, sem rolar à mão. No celular, entre o chip de atenção e
  // a primeira peça ficam a barra, os cards e os filtros — tocar em "3 peças
  // reprovadas" filtrava uma lista que estava duas telas abaixo, e nada na
  // tela visível mudava: parecia que o toque não tinha feito nada. Só ao
  // LIGAR o foco e só no layout de cards; no desktop a barra de filtros é
  // sticky e o contador muda à vista. Sem animação para quem pediu menos
  // movimento (a regra global do CSS não alcança o scroll disparado por JS).
  const levarALista = () => {
    if (!useCards) return;
    const semMovimento = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => toolbarRef.current?.scrollIntoView({ block: "start", behavior: semMovimento ? "auto" : "smooth" }));
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", height: 36,
    backgroundColor: "#ffffff",
    border: "1px solid #e7e5e4",
    borderRadius: 6,
    padding: "0 12px",
    fontSize: 13, color: "#1c1917",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  const activeFilterCount =
    statusFilter.length + eventFilter.length + sponsorFilter.length +
    typeFilter.length + dateFilter.length + focoFilter.length + (searchTerm ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;
  const clearAllFilters = () => {
    setStatusFilter([]); setEventFilter([]); setSponsorFilter([]);
    setTypeFilter([]); setDateFilter([]); setFocoFilter([]);
    setSearchTerm(""); setSearchInput("");
  };

  // Mudou o recorte, muda a lista: manter grupos expandidos de um filtro
  // anterior deixava um evento com 400 linhas abertas debaixo de uma busca que
  // não tem nada a ver. `expandedEvents` só crescia; agora zera com o filtro.
  useEffect(() => {
    setExpandedEvents(new Set());
    setOpenGroups(new Set());
  }, [searchTerm, statusFilter, eventFilter, sponsorFilter, typeFilter, dateFilter, focoFilter, mostrarFinalizados]);

  // ── Orçamento de linhas montadas (ver LINHAS_INICIAIS) ────────────────────
  // Volta ao inicial quando o RECORTE muda, pela mesma razão do efeito acima —
  // mas derivado no próprio render (chave do recorte), e não num efeito: com
  // efeito, o primeiro render do recorte novo ainda montaria o orçamento
  // grande do anterior para desmontá-lo logo depois.
  const chaveDoRecorte = JSON.stringify([searchTerm, statusFilter, eventFilter, sponsorFilter, typeFilter, dateFilter, focoFilter, mostrarFinalizados]);
  const chaveDoRecorteRef = useRef(chaveDoRecorte);
  chaveDoRecorteRef.current = chaveDoRecorte;
  const [orcamento, setOrcamento] = useState(() => ({ chave: chaveDoRecorte, n: LINHAS_INICIAIS }));
  // Sem IntersectionObserver (navegador muito antigo) não há quem peça o
  // próximo lote: monta tudo de uma vez, como antes.
  const orcamentoLinhas = typeof IntersectionObserver === "undefined"
    ? Number.POSITIVE_INFINITY
    : orcamento.chave === chaveDoRecorte ? orcamento.n : LINHAS_INICIAIS;
  // `extra` explícito quando o usuário PEDE linhas ("Mostrar todas", "Mostrar
  // as N peças"): elas entram inteiras de uma vez, como antes, em vez de
  // esperar a sentinela — e os eventos logo abaixo não somem por um quadro.
  const crescerOrcamento = useCallback((extra: number = LINHAS_POR_LOTE) => {
    setOrcamento((prev) => {
      const chave = chaveDoRecorteRef.current;
      return { chave, n: (prev.chave === chave ? prev.n : LINHAS_INICIAIS) + extra };
    });
  }, []);
  const pedirProximoLote = useCallback(() => crescerOrcamento(), [crescerOrcamento]);

  // O plano do que vai para o DOM: grupos na ordem da lista, cada um com as
  // linhas que o orçamento ainda cobre. Os tetos de sempre (GROUP_CAP e
  // ROW_CAP, botões "Mostrar") valem igual; o orçamento só adia a montagem.
  const planoDaLista = useMemo(() => {
    const grupos: Array<{ eventKey: string; gd: { eventId: string | null; eventName: string; items: any[] }; groupOpen: boolean; isExpanded: boolean; linhasPermitidas: number }> = [];
    let restante = orcamentoLinhas;
    let incompleto = false;
    for (let groupIdx = 0; groupIdx < sortedGroupEntries.length; groupIdx++) {
      const [eventKey, gd] = sortedGroupEntries[groupIdx];
      const groupOpen = groupIdx < GROUP_CAP || openGroups.has(eventKey);
      const isExpanded = expandedEvents.has(eventKey);
      const nVisiveis = !groupOpen ? 0 : (isExpanded || gd.items.length <= ROW_CAP ? gd.items.length : ROW_CAP);
      // Sem espaço para o cabeçalho E ao menos uma linha, o grupo espera o
      // próximo lote — um cabeçalho com a tabela vazia embaixo pareceria erro.
      if (restante < CUSTO_CABECALHO + (nVisiveis > 0 ? 1 : 0)) { incompleto = true; break; }
      restante -= CUSTO_CABECALHO;
      const linhasPermitidas = Math.min(nVisiveis, restante);
      restante -= linhasPermitidas;
      grupos.push({ eventKey, gd, groupOpen, isExpanded, linhasPermitidas });
      if (linhasPermitidas < nVisiveis) { incompleto = true; break; }
    }
    return { grupos, incompleto };
  }, [sortedGroupEntries, openGroups, expandedEvents, orcamentoLinhas]);

  // ── Visões salvas ─────────────────────────────────────────────────────────
  const visoes = useMemo(() => visoesParaPapel(user?.role), [user?.role]);
  const filtrosAtuais = { status: statusFilter, saida: dateFilter, foco: focoFilter };
  const aplicarVisao = (v: Visao) => {
    const ativa = visaoEstaAtiva(v, filtrosAtuais);
    setStatusFilter(ativa ? [] : [...v.filtros.status]);
    setDateFilter(ativa ? [] : [...v.filtros.saida]);
    setFocoFilter(ativa ? [] : [...v.filtros.foco]);
  };
  const [visaoPadrao, setVisaoPadrao] = useState<string | null>(null);
  useEffect(() => {
    try { setVisaoPadrao(localStorage.getItem(chaveVisaoPadrao(user?.role))); } catch { /* modo privado */ }
  }, [user?.role]);
  const fixarVisaoPadrao = (v: Visao) => {
    const novo = visaoPadrao === v.id ? null : v.id;
    setVisaoPadrao(novo);
    try {
      if (novo) localStorage.setItem(chaveVisaoPadrao(user?.role), novo);
      else localStorage.removeItem(chaveVisaoPadrao(user?.role));
    } catch { /* modo privado */ }
    toast({
      title: novo ? "Visão padrão definida" : "Visão padrão removida",
      description: novo ? `"${v.label}" será aplicada ao abrir o Painel sem filtros na URL.` : "O Painel volta a abrir sem recorte.",
    });
  };
  // Aplica a visão padrão UMA vez, e só quando a URL não trouxe filtro nenhum —
  // um link compartilhado sempre vence a preferência local, senão o colega abre
  // o link e vê outra coisa. O chip do filtro aparece normalmente: nunca é um
  // recorte silencioso.
  const visaoPadraoAplicada = useRef(false);
  useEffect(() => {
    if (visaoPadraoAplicada.current || visaoPadrao === null) return;
    visaoPadraoAplicada.current = true;
    if (urlParams.toString()) return;
    const v = visoes.find(x => x.id === visaoPadrao);
    if (!v) return;
    setStatusFilter([...v.filtros.status]);
    setDateFilter([...v.filtros.saida]);
    setFocoFilter([...v.filtros.foco]);
  }, [visaoPadrao, visoes, urlParams]);

  // ── Deep-link ?peca=<id> ──────────────────────────────────────────────────
  // O event-detail já suporta ?item=; a home, que é de onde se manda o link no
  // WhatsApp, não tinha equivalente. Consumido UMA vez (o param é removido da
  // URL), senão o dialog reabriria a cada re-render e o F5 nunca "esqueceria".
  const pendingDeepLink = useRef<string | null>(urlParams.get("peca"));
  useEffect(() => {
    const id = pendingDeepLink.current;
    if (!id || items.length === 0) return;
    pendingDeepLink.current = null;
    const alvo = (items as any[]).find((i: any) => i.id === id || i.displayId === id);
    const p = new URLSearchParams(window.location.search);
    p.delete("peca");
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    if (alvo) {
      // A peça pode estar num evento fora de jogo, que a tela abre ocultando.
      // O link tem de entregar a peça — e, junto, o CONTEXTO: revelar o recorte
      // deixa o chip da faixa marcado, então o usuário vê onde ela estava. Sem
      // isto, o dialog abriria sobre uma lista onde a peça não existe.
      if (motivoEventoFinalizado(alvo.event, todayBusinessMs()) !== null) setMostrarFinalizados(true);
      setSelectedItem(alvo);
    }
    else toast({ title: "Peça não encontrada", description: "O link aponta para uma peça que não está mais nas listagens." });
  }, [items, toast]);

  const copiarLinkDaPeca = async (item: any) => {
    const url = `${window.location.origin}${window.location.pathname}?peca=${item.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copiado", description: `Link direto da peça ${item.displayId}.` });
    } catch {
      toast({ title: "Não foi possível copiar", description: url, variant: "destructive" });
    }
  };

  // ── Seleção em lote ───────────────────────────────────────────────────────
  const selecionadas = useMemo(
    () => filteredItems.filter((i: any) => !i.deletedAt && selectedIds.has(i.id)),
    [filteredItems, selectedIds],
  );
  const copiarIds = async () => {
    const txt = selecionadas.map((i: any) => i.displayId).join("\n");
    try {
      await navigator.clipboard.writeText(txt);
      toast({ title: "IDs copiados", description: `${selecionadas.length} ${selecionadas.length === 1 ? "ID copiado" : "IDs copiados"}.` });
    } catch {
      toast({ title: "Não foi possível copiar", description: "O navegador bloqueou o acesso à área de transferência.", variant: "destructive" });
    }
  };

  // ── Exportações ───────────────────────────────────────────────────────────
  // O que sai é sempre o que está na tela: a seleção quando existe, senão o
  // recorte filtrado. Nunca a base inteira, e nunca com peça excluída dentro.
  const itensParaExportar = useMemo(
    () => (selecionadas.length > 0 ? selecionadas : filteredItems).filter((i: any) => !i.deletedAt),
    [selecionadas, filteredItems],
  );
  const tituloExport = statusFilter.length
    ? `Peças — ${statusFilter.filter(s => s !== "deleted").map(s => getStatusLabel(s)).join(", ") || "Excluídas"}`
    : "Peças";

  const exportarXlsx = async () => {
    if (!itensParaExportar.length) return;
    setExportMenuOpen(false);
    setIsExportingXlsx(true);
    try {
      const res = await fetch("/api/items/export-xlsx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ itemIds: itensParaExportar.map((i: any) => i.id), title: tituloExport }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Falha ao gerar o arquivo");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tituloExport}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({ title: "Erro ao exportar", description: error.message, variant: "destructive" });
    } finally {
      setIsExportingXlsx(false);
    }
  };

  // Fecha o menu de exportar ao clicar fora / apertar Escape.
  const exportMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setExportMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExportMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [exportMenuOpen]);

  // Ordenação por coluna: mesmo campo alterna a direção; campo novo começa asc.
  const toggleSort = useCallback((campo: "displayId" | "status" | "area" | "ciclo") => {
    setSortBy(prev => { if (prev === campo) { setSortDir(d => d === "asc" ? "desc" : "asc"); return prev; } setSortDir("asc"); return campo; });
  }, []);

  // ── Ações da lista: UM objeto estável para todos os grupos e linhas ──────
  // Funções novas a cada render derrubariam o memo de cada linha. As que só
  // chamam setState já são estáveis; a de restaurar depende da mutação (objeto
  // novo por render) e por isso lê a versão atual por ref.
  const restaurarPecaRef = useRef<(id: string) => void>(() => {});
  restaurarPecaRef.current = (id: string) => { setRestoringItemId(id); restoreItemMutation.mutate(id); };
  const acoesDaLista = useMemo<AcoesDaLista>(() => ({
    abrir: (item) => setSelectedItem(item),
    alternarSelecao: (id) =>
      setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    alternarSelecaoDoEvento: (evItems, marcar) =>
      setSelectedIds(prev => {
        const n = new Set(prev);
        for (const i of evItems) { if (i.deletedAt) continue; if (marcar) n.add(i.id); else n.delete(i.id); }
        return n;
      }),
    excluir: (id) => setDeleteConfirmItemId(id),
    restaurar: (id) => restaurarPecaRef.current(id),
    expandir: (key, extra) => {
      setExpandedEvents(prev => { const next = new Set(prev); next.add(key); return next; });
      crescerOrcamento(extra);
    },
    abrirGrupo: (key, extra) => {
      setOpenGroups(prev => { const next = new Set(prev); next.add(key); return next; });
      crescerOrcamento(extra);
    },
    ordenar: toggleSort,
  }), [toggleSort, crescerOrcamento]);

  // Banner da visão Excluídos visível = o motivo do vazio JÁ está explicado em
  // cima. O bloco genérico "Nenhum item corresponde aos filtros ativos" logo
  // abaixo dizia outra coisa (falsa) e era o maior e o único com botão.
  const bannerExcluidosVisivel = showDeleted && (!canDeleteAny || deletedLoading || deletedError);

  const colCount = isCompact ? 5 : 7;
  /**
   * QUAIS CARDS APARECEM. Um card com 0 ocupava a mesma largura e o mesmo peso
   * de um com 1102 — e a primeira dobra da tela gastava treze deles, sendo que
   * tres costumam estar zerados. "Onde esta o gargalo?" e uma pergunta sobre
   * onde HA peca, e cards vazios so competem com a resposta.
   *
   * A regra ja existia e valia so no celular; agora vale nos dois. O status
   * FILTRADO nunca some, mesmo zerado: quem clicou nele precisa do caminho de
   * volta, e um controle que desaparece ao ser usado e uma armadilha.
   */
  /** Largura de um card de status. Fixa de proposito: ver o comentario das
   *  zonas — card que estica para preencher a linha vira um retangulo de
   *  1500px anunciando o numero 1. */
  const LARG_CARD = useCards ? "minmax(0,1fr)" : "minmax(150px, 196px)";

  const kpiVisivelPorChave = (k: GroupKey) =>
    showAllKpis || (stats.byGroup[k] ?? 0) > 0 || statusFilter.includes(k);

  const entradaVisivel   = ZONA_ENTRADA.filter(kpiVisivelPorChave);
  const aprovacaoVisivel = ZONA_APROVACAO.filter(kpiVisivelPorChave);
  const producaoVisivel  = ZONA_PRODUCAO.filter(kpiVisivelPorChave);
  /** Quantos o corte tirou — o número que o gatilho promete devolver. */
  const escondidos =
    (ZONA_ENTRADA.length - entradaVisivel.length) +
    (ZONA_APROVACAO.length - aprovacaoVisivel.length) +
    (ZONA_PRODUCAO.length - producaoVisivel.length);

  const kpiCards: Array<{ key: GroupKey; value: number }> = [...ZONA_ENTRADA, ...ZONA_APROVACAO, ...ZONA_PRODUCAO]
    .map(k => ({ key: k, value: stats.byGroup[k] }));

  const renderStatusCard = (key: GroupKey) => {
    const m = getStatusMeta(STATUS_GROUPS[key][0]);
    return (
      <StatusCard
        key={key}
        // label COMPLETO também no celular. O `short` ("Ag. Vinculação")
        // existia porque o trilho horizontal dava 150px por card; na grade de
        // duas colunas o nome inteiro cabe quebrando em duas linhas, e o chip
        // de filtro logo abaixo diz "Aguardando Vinculação" — um nome só para
        // a mesma etapa na mesma tela.
        label={m.label}
        cor={m.dot}
        value={stats.byGroup[key]} carregando={isLoading}
        pct={stats.total > 0 ? ((stats.byGroup[key] ?? 0) / stats.total) * 100 : undefined}
        filterKey={key}
        isActive={statusFilter.includes(key)}
        onToggle={() => toggleStatusCard(key)}
        sub={key === "requested" && stats.drafts > 0 ? `inclui ${stats.drafts} rascunho${stats.drafts > 1 ? "s" : ""}` : undefined}
        subActionLabel={key === "requested" ? "Ver só os rascunhos" : undefined}
        onSubAction={key === "requested" && stats.drafts > 0 ? () => setStatusFilter(["draft"]) : undefined}
      />
    );
  };

  const canceladas = stats.byGroup.canceled;
  const totalCard = (
    <StatusCard
      label="Total" value={stats.total} carregando={isLoading}
      filterKey="total" dark
      isActive={statusFilter.length === 0}
      onToggle={() => setStatusFilter([])}
      sub={canceladas > 0 ? `inclui ${canceladas} cancelada${canceladas > 1 ? "s" : ""}` : undefined}
      subActionLabel="Ver só as canceladas"
      onSubAction={canceladas > 0 ? () => setStatusFilter(["canceled"]) : undefined}
    />
  );

  // Hoje à meia-noite — uma vez por render, não uma por grupo de evento.
  const hojeMs = (() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t.getTime(); })();
  // O "agora" das idades é o `relogioIdade` (hora cheia), UM só para a tela
  // inteira: o chip de peças paradas chamava Date.now() dentro de cada grupo,
  // e dois cabeçalhos do mesmo render podiam medir contra instantes diferentes.

  // Opções do menu de Status, memoizadas (inline, nasciam novas a cada render).
  // Rótulos derivam de lib/status.ts (fonte única) — o hardcoded anterior
  // chamava `requested` de "Rascunho", divergindo dos pills da tabela
  // ("Solicitado").
  const statusOptions = useMemo(() => [
    ...STATUS_FILTER_VALUES.map((value) => ({ value, label: getStatusLabel(value), pinned: true })),
    ...(canDeleteAny ? [{ value: "deleted", label: "Excluídos", pinned: true }] : []),
  ], [canDeleteAny]);

  // Idades por etapa da barra do fluxo, numa passada só e memoizada. A barra
  // chamava `idadeDoSegmento` para até 13 segmentos — duas vezes cada, no
  // title — e cada chamada varria a lista filtrada inteira com parse de data:
  // ~130 mil iterações a cada render da página, inclusive ao abrir um menu.
  const idadesPorEtapa = useMemo(() => {
    const porStatus = new Map<string, GroupKey>();
    for (const k of GROUP_KEYS) for (const s of STATUS_GROUPS[k]) porStatus.set(s, k);
    const m = new Map<string, number[]>();
    for (const i of filteredItems as any[]) {
      const k = porStatus.get(i.status);
      if (!k) continue;
      const d = diasNoEstado(i, relogioIdade);
      if (d === null) continue;
      let lista = m.get(k);
      if (!lista) { lista = []; m.set(k, lista); }
      lista.push(d);
    }
    return m;
  }, [filteredItems, relogioIdade]);

  return (
    <div
      ref={rootRef}
      /* flexShrink 0 — e a raiz PRECISA disso, senao ela encolhe.

         Esta raiz e flex ITEM do <main>, que e `flex-direction: column`. Com
         `flex: 0 1 auto` (o padrao), o flex-SHRINK de 1 autoriza o navegador
         a comprimi-la ate o tamanho do container quando o conteudo e maior.
         Medido: a caixa ficava em 609,6px enquanto o conteudo pedia 1224.
         `minHeight: 100%` nao salva — ele resolve contra a altura do <main>,
         que e justamente 610.

         Quem paga e a barra de filtros: `sticky` so gruda DENTRO da caixa do
         pai, e com a caixa do tamanho da janela ela nao tinha alcance nenhum.
         Rolando a lista a barra saia da tela (medida em y -78), e quem estava
         no meio de 3.187 pecas perdia busca, filtros e visoes salvas
         justamente quando mais precisa deles.

         Tentei antes com `alignSelf: flex-start` e NAO funcionou, por um
         motivo que so a medicao mostrou: em container `column` o align-self
         governa o eixo CRUZADO, que ali e a largura. Estava mexendo no eixo
         errado. Com flexShrink 0 a raiz vai a 1262px e a barra fica em y 68 —
         os dois numeros medidos no navegador antes deste commit. */
      style={{ position: "relative", display: "flex", flexDirection: "column", flexShrink: 0, gap: 22, padding: useCards ? "0 12px 20px" : "0 28px 34px", minHeight: "100%", background: "#fafaf9" }}
    >
      {/* SEM overflowY no wrapper: quem rola é o <main> do layout. Um
          overflow:auto aqui criava um scroll-container que NÃO rola
          (min-height 100%) e prendia todo position:sticky descendente. */}
      <style>{PG_CSS}</style>
      <div style={{ position: "sticky", top: 0, zIndex: 4, height: 4, margin: useCards ? "0 -12px" : "0 -28px", background: "linear-gradient(90deg, #1c1917 0%, #1c1917 72%, #f97316 72%, #f97316 100%)" }} />

      {/* ── Header ── */}
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16, paddingTop: 22, paddingBottom: 2 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minWidth: 0 }}>
          <h1
            data-testid="title-painel-geral"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: useCards ? 20 : FS.h1, fontWeight: 700, letterSpacing: "-0.03em",
              lineHeight: 1.1, color: "#1c1917", margin: 0,
            }}
          >
            Painel Geral
          </h1>
          {/* Subtítulo honesto: a tela mostra peças em TODOS os status (não só
              "em produção") e o "tempo real" dependia de um socket que cai. O
              que ela garante mesmo é o escopo e a ordem. */}
          <p style={{ fontSize: 13, color: "#746e69", fontWeight: 500, margin: "4px 0 0 0", display: useCards ? "none" : "block" }}>
            Todas as peças de todos os eventos, ordenadas pela saída do caminhão
          </p>
          {/* ── POR ONDE COMEÇAR (rodada 4) ──────────────────────────────────
              O Painel é a primeira tela de TODOS os perfis e não dizia a
              nenhum deles o que fazer. A pessoa da Arte abria 3 mil peças e
              tinha de descobrir sozinha que a fila dela é "Aguardando envio" +
              "Aguardando finalização", que existe uma visão pronta para isso na
              barra de filtros e que o trabalho em si acontece em OUTRA tela.
              A frase junta as três respostas: quantas peças são dela, um
              clique para vê-las aqui e um clique para a tela onde se age.

              Nada é inventado: a fila é a visão do papel (lib/painel-visoes),
              o número é a soma dos MESMOS cards de status abaixo e as telas
              saem do mesmo mapa do "Continuar em …" da ficha
              (lib/painel-rotas) — que já respeita o acesso do papel. */}
          {!isLoading && !(isError && itensDoServidor.length === 0) && (() => {
            const minha = visoes.find(v => v.id === "meu_papel") ?? null;
            const linkStyle: React.CSSProperties = {
              display: "inline-flex", alignItems: "center", gap: 4, minHeight: 36,
              fontSize: 13, fontWeight: 700, color: "#c2410c",
              textDecoration: "underline", textUnderlineOffset: 2, whiteSpace: "nowrap",
            };
            if (!minha) {
              // Admin não tem fila própria: vê o fluxo inteiro. O próximo
              // passo dele é cobrar, e a tela de cobrança é outra.
              return (
                <p data-testid="texto-por-onde-comecar" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 8, margin: "2px 0 0", fontSize: 13, color: "#57534e", lineHeight: 1.4 }}>
                  <span>Você vê o fluxo inteiro. Atraso por etapa e quem precisa agir ficam em</span>
                  <Link href="/prazos" style={linkStyle}>Gestão de Prazos <ArrowUpRight aria-hidden="true" style={{ width: 13, height: 13 }} /></Link>
                </p>
              );
            }
            // Soma dos cards de status: `stats` ignora o próprio filtro de
            // status (é o que deixa o card clicável mostrar o número), então o
            // número não muda quando a pessoa aplica a visão da fila.
            const n = minha.filtros.status.reduce((t, s) => t + (stats.byGroup[s as GroupKey] ?? 0), 0);
            const recorteAlheio = !!searchTerm || eventFilter.length > 0 || typeFilter.length > 0
              || sponsorFilter.length > 0 || dateFilter.length > 0 || focoFilter.length > 0;
            const ativa = visaoEstaAtiva(minha, filtrosAtuais);
            const telas = minha.filtros.status
              .map(s => proximaTelaDoStatus(s, user?.role))
              .filter((t, i, arr): t is NonNullable<typeof t> => !!t && arr.findIndex(x => x?.path === t.path) === i);
            // "Peças aguardando envio…" → "aguardando envio…": a frase já começa
            // pelo número de peças.
            const oQue = minha.hint.replace(/^Peças\s+/i, "");
            return (
              <p data-testid="texto-por-onde-comecar" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 10, margin: "2px 0 0", fontSize: 13, color: "#57534e", lineHeight: 1.4 }}>
                <span>
                  Sua fila: <strong style={{ color: "#1c1917", fontWeight: 700 }}>{fmtN(n)} {n === 1 ? "peça" : "peças"}</strong> {oQue}
                  {recorteAlheio ? " neste recorte" : ""}.
                </span>
                <button
                  type="button"
                  onClick={() => aplicarVisao(minha)}
                  aria-pressed={ativa}
                  data-testid="button-ver-minha-fila"
                  style={{ ...linkStyle, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}
                >
                  {ativa ? "Ver todas as peças" : "Ver só a minha fila"}
                </button>
                {telas.map(t => (
                  <Link key={t.path} href={t.path} style={linkStyle}>
                    Trabalhar em {t.label} <ArrowUpRight aria-hidden="true" style={{ width: 13, height: 13 }} />
                  </Link>
                ))}
              </p>
            );
          })()}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          {/* Carimbo de frescor: o usuário precisa saber DESDE QUANDO o que ele
              lê é verdade. Sem botão Atualizar — a tela revalida sozinha. O
              relógio de 30s mora dentro dele (ver CarimboDeFrescor). */}
          <CarimboDeFrescor />

          {/* Exportar rebaixado a contorno: o botão preto com sombra laranja era
              o elemento de maior peso visual da página — a ação mais destacada
              da tela era imprimir. */}
          <div ref={exportMenuRef} style={{ position: "relative" }}>
            <button
              onClick={() => setExportMenuOpen(o => !o)}
              data-testid="button-export-painel"
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
              title="Exportar o recorte que está na tela"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: useCards ? 44 : 40, minWidth: useCards ? 44 : undefined, padding: useCards ? "0 12px" : "0 14px", borderRadius: 8, backgroundColor: "#ffffff", border: "1px solid #d6d3d1", color: "#1c1917", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              {isExportingXlsx
                ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
                : <Printer style={{ width: 14, height: 14 }} />}
              {!useCards && "Exportar"}
              <ChevronDown style={{ width: 13, height: 13, color: "#746e69" }} />
            </button>
            {exportMenuOpen && (
              <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 20, minWidth: 232, backgroundColor: "#fff", border: "1px solid #e7e5e4", borderRadius: 10, boxShadow: "0 8px 24px rgba(28,25,23,.12)", padding: 6 }}>
                <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#746e69", margin: "6px 8px 6px" }}>
                  {selecionadas.length > 0 ? `${selecionadas.length} selecionada${selecionadas.length > 1 ? "s" : ""}` : `${itensParaExportar.length} ${itensParaExportar.length === 1 ? "peça na tela" : "peças na tela"}`}
                </p>
                <button role="menuitem" onClick={() => { setExportMenuOpen(false); setShowExportPDFModal(true); }} data-testid="button-export-pdf-painel" style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 8px", background: "none", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#1c1917", textAlign: "left" }}>
                  <Printer style={{ width: 14, height: 14, color: "#746e69" }} /> Exportar PDF
                </button>
                <button role="menuitem" onClick={exportarXlsx} disabled={isExportingXlsx || itensParaExportar.length === 0} data-testid="button-export-xlsx-painel" style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 8px", background: "none", border: "none", borderRadius: 6, cursor: itensParaExportar.length === 0 ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, color: itensParaExportar.length === 0 ? "#746e69" : "#1c1917", textAlign: "left" }}>
                  <FileSpreadsheet style={{ width: 14, height: 14, color: "#746e69" }} /> Exportar Excel
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Precisa de atenção ────────────────────────────────────────────────
          Os 13 estados têm o mesmo peso visual, mas a operação não é simétrica:
          reprovação de patrocinador e caminhão que já saiu com peça pendente
          valem mais que as outras dez juntas.

          A FAIXA RESPONDE SEMPRE (rodada 3). Ela só aparecia quando havia
          alerta — e o silêncio era ambíguo: "não há nada" e "ainda não
          carregou" tinham a mesma cara, e a pergunta do primeiro minuto de
          todo perfil ("o que precisa de mim agora?") ficava sem resposta
          explícita justamente no dia bom. Agora são três estados:
            · carregando → uma silhueta do tamanho do chip (sem layout shift,
              e sem afirmar "nada" antes de saber);
            · sem alerta → uma frase calma com o recorte a que ela se refere;
            · com alerta → os chips, num cartão, antes de qualquer número. */}
      {isLoading ? (
        <div aria-hidden="true" className="animate-pulse" style={{ width: useCards ? "100%" : 320, height: 38, borderRadius: 999, backgroundColor: "#f0efee" }} />
      ) : (!isError || atencao.reprovadas > 0 || atencao.atrasadas > 0 || chipOcultasDados) && (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {!isError && atencao.reprovadas === 0 && atencao.atrasadas === 0 && (
        <p data-testid="texto-atencao-em-dia" style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: 0, fontSize: 13, lineHeight: 1.45, color: "#57534e" }}>
          {/* Verde só aqui, e só no ícone: é o único "está tudo certo" da
              tela. #15803d sobre #fafaf9 = 4,80:1. */}
          <CheckCircle2 aria-hidden="true" style={{ width: 16, height: 16, color: "#15803d", flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong style={{ color: "#1c1917", fontWeight: 700 }}>Nada pede atenção agora.</strong>
            {" "}Nenhuma peça reprovada pelo patrocinador nem em evento com caminhão atrasado
            {/* Os números desta faixa seguem o recorte; com filtro ligado, a
                frase não pode soar como verdade do sistema inteiro. */}
            {hasActiveFilters ? " neste recorte." : "."}
          </span>
        </p>
      )}
      {(atencao.reprovadas > 0 || atencao.atrasadas > 0 || chipOcultasDados) && (() => {
        /* O RÓTULO DIZ O QUE A FAIXA REALMENTE CARREGA.

           Ele era fixo em "Precisa de atenção", mas a faixa aparece por três
           motivos e um deles NÃO é alerta: peça oculta porque o evento já foi
           encerrado ou realizado é informação de recorte, não pendência. E
           esse é o caso mais COMUM — em produção são 147 peças ocultas com
           zero reprovadas e zero atrasadas, ou seja, na maior parte do tempo
           a faixa anunciava urgência e entregava uma nota de rodapé.

           Rótulo que promete o que não cumpre custa caro duas vezes: gasta a
           atenção de quem lê agora e ensina a ignorar a faixa da próxima vez
           — inclusive quando ela estiver certa. */
        const temAlerta = atencao.reprovadas > 0 || atencao.atrasadas > 0;
        const rotulo = temAlerta ? "Precisa de atenção" : "Fora da lista";
        // No celular cada chip ocupa a linha inteira e pode quebrar o texto:
        // "147 peças ocultas · evento encerrado ou já realizado · mostrar" não
        // cabe em 366px, e com altura fixa o texto vazava do chip.
        const chipBase: React.CSSProperties = {
          display: "flex", alignItems: "center", gap: 8, minHeight: 38, padding: "7px 14px",
          borderRadius: useCards ? 10 : 999, cursor: "pointer", fontSize: 13, fontWeight: 600, lineHeight: 1.3,
          textAlign: "left", width: useCards ? "100%" : undefined,
        };
        return (
        <section aria-label={rotulo} style={{
            display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
            // O cartão só existe quando há ALERTA: é o que faz a faixa ser a
            // primeira coisa lida sem precisar de cor extra. "Fora da lista"
            // sozinho continua sendo uma nota de rodapé, sem moldura.
            ...(temAlerta ? { backgroundColor: "#ffffff", border: "1px solid #e7e5e4", borderRadius: 12, padding: useCards ? 12 : "10px 12px 10px 16px", boxShadow: "0 1px 3px rgba(28,25,23,0.05)" } : null),
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 6, fontSize: 13, fontWeight: 700, color: temAlerta ? "#1c1917" : "#57534e", width: useCards ? "100%" : undefined }}>
            {temAlerta && <AlertTriangle aria-hidden="true" style={{ width: 15, height: 15, color: "#b91c1c", flexShrink: 0 }} />}
            {rotulo}</span>
          {atencao.reprovadas > 0 && (
            <button
              onClick={() => { if (!focoFilter.includes("reprovadas")) levarALista(); toggleFoco("reprovadas"); }}
              aria-pressed={focoFilter.includes("reprovadas")}
              data-testid="chip-atencao-reprovadas"
              className="pg-chip"
              /* #b91c1c sobre #fef2f2 = 5,91:1 AA; marcado, branco sobre o vermelho = 6,47:1. */
              style={{ ...chipBase, backgroundColor: focoFilter.includes("reprovadas") ? "#b91c1c" : "#fef2f2", color: focoFilter.includes("reprovadas") ? "#fff" : "#b91c1c", border: `1px solid ${focoFilter.includes("reprovadas") ? "#b91c1c" : "#fecaca"}` }}
            >
              <XCircle aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0 }} />
              <span>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800 }}>{fmtN(atencao.reprovadas)}</span>
                {" "}{atencao.reprovadas === 1 ? "peça reprovada pelo patrocinador" : "peças reprovadas pelo patrocinador"}
              </span>
            </button>
          )}
          {atencao.atrasadas > 0 && (
            <button
              onClick={() => { if (!focoFilter.includes("atrasadas")) levarALista(); toggleFoco("atrasadas"); }}
              aria-pressed={focoFilter.includes("atrasadas")}
              data-testid="chip-atencao-atrasadas"
              className="pg-chip"
              /* #b45309 sobre #fffbeb = 4,84:1 AA nos 13px. */
              style={{ ...chipBase, backgroundColor: focoFilter.includes("atrasadas") ? "#b45309" : "#fffbeb", color: focoFilter.includes("atrasadas") ? "#fff" : "#b45309", border: `1px solid ${focoFilter.includes("atrasadas") ? "#b45309" : "#fde68a"}` }}
            >
              <Truck aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0 }} />
              <span>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800 }}>{fmtN(atencao.atrasadas)}</span>
                {" "}{atencao.atrasadas === 1 ? "peça em evento com caminhão atrasado" : "peças em evento com caminhão atrasado"}
              </span>
            </button>
          )}
          {/* "QUEM PRECISA AGIR NESTE ATRASO?" O chip responde quantas peças,
              e o Painel não sabe dizer de quem é a vez — quem sabe é a Gestão
              de Prazos, que cruza cada etapa vencida com o setor que a
              destrava. O link já chega no recorte "Só com atraso" (?atrasados=1,
              parâmetro que aquela tela lê), sem a pessoa remontar o filtro. */}
          {atencao.atrasadas > 0 && (
            <Link
              href="/prazos?atrasados=1"
              data-testid="link-atrasados-quem-age"
              style={{ display: "inline-flex", alignItems: "center", gap: 4, minHeight: 38, fontSize: 13, fontWeight: 700, color: "#c2410c", textDecoration: "underline", textUnderlineOffset: 2, whiteSpace: "nowrap" }}
            >
              Quem precisa agir <ArrowUpRight aria-hidden="true" style={{ width: 13, height: 13 }} />
            </Link>
          )}
          {/* ── Peças de evento fora de jogo ────────────────────────────────
              Mora AQUI, e não entre os cards de status, por dois motivos: os
              cards são etapas do fluxo, e isto não é etapa nenhuma; e esta
              faixa é o lugar onde os recortes transversais já vivem — foi dela
              que saiu a contagem de "atrasadas" que antes misturava evento
              vivo com evento morto.

              Aparece SEMPRE que houver algo oculto, inclusive com a lista
              cheia: esconder em silêncio seria pior que o problema que a
              ocultação resolve. Cinza, não âmbar nem vermelho — não é
              urgência, é registro; o alarme aqui ao lado tem de continuar
              sendo o mais forte da faixa.

              UM ALGARISMO SÓ, e é o total — o mesmo que o contador de
              resultados exibe. A primeira versão mostrava o passivo aqui e o
              total dentro do verbo ("315 em aberto … mostrar as 469
              ocultas"), e o dono reprovou de imediato: "aparece dois números
              diferentes". O passivo continua na frase do `title`, por extenso
              e com a relação dita. O porquê inteiro está em lib/
              painel-encerrados.ts. */}
          {chipOcultasDados && (
            <button
              onClick={() => setMostrarFinalizados(v => !v)}
              aria-pressed={mostrarFinalizados}
              title={chipOcultasDados.title}
              aria-label={chipOcultasDados.srLabel}
              data-testid="chip-atencao-ocultas"
              className="pg-chip"
              /* Contrastes: #44403c sobre #f5f5f4 = 9,42:1; no estado marcado,
                 #ffffff sobre #57534e = 7,63:1. Ambos AA com folga em 13px. */
              style={{ ...chipBase, backgroundColor: mostrarFinalizados ? "#57534e" : "#f5f5f4", color: mostrarFinalizados ? "#fff" : "#44403c", border: `1px solid ${mostrarFinalizados ? "#57534e" : "#e7e5e4"}` }}
            >
              <span>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800 }}>{fmtN(chipOcultasDados.total)}</span>
                {" "}{chipOcultasDados.texto}
                {/* Separador só de ritmo — o nome acessível do botão vem inteiro
                    do aria-label, então esta pontuação não é lida duas vezes. */}
                <span aria-hidden="true" style={{ opacity: 0.55 }}> · </span>
                <span style={{ textDecoration: "underline", textUnderlineOffset: 2, fontWeight: 700 }}>{chipOcultasDados.acao}</span>
              </span>
            </button>
          )}
        </section>
        );
      })()}
      </div>
      )}

      {/* ── O FLUXO INTEIRO NUMA BARRA ─────────────────────────────────────

          O GARGALO ESTAVA INVISÍVEL. Com dados de produção, 1.129 de 2.632
          peças (43%) estavam em "Aguardando envio" — e esse número aparecia
          como mais um entre doze contadores do mesmo tamanho. Doze cards com
          o mesmo peso não têm vencedor: a tela mostrava tudo e não dizia
          nada.

          Uma barra proporcional resolve o que doze números iguais não
          resolvem, porque a informação que importa aqui é RELATIVA — não
          "quantos", e sim "onde está a massa". 43% num segmento salta aos
          olhos sem ler um algarismo sequer.

          Os cards continuam existindo abaixo, como detalhe. Esta é a leitura
          de três segundos; eles são a de trinta.

          A barra usa a MESMA fonte de cor dos cards e dos selos da tabela
          (getStatusMeta), e cada segmento aplica o mesmo recorte que o card
          correspondente — clicar aqui e clicar no card levam ao mesmo lugar. */}
      {!isLoading && stats.total > 0 && (() => {
        const zonas = [
          { nome: "Entrada", chaves: ZONA_ENTRADA },
          { nome: "Aprovação", chaves: ZONA_APROVACAO },
          { nome: "Produção e entrega", chaves: ZONA_PRODUCAO },
        ];
        const segmentos = zonas.flatMap(z =>
          z.chaves
            .map(k => ({ k, zona: z.nome, n: stats.byGroup[k] ?? 0, meta: getStatusMeta(STATUS_GROUPS[k][0]) }))
            .filter(seg => seg.n > 0),
        );
        // `stats.total` também inclui canceladas e status fora do fluxo. Um
        // recorte só com esses itens deixa `segmentos` vazio; nesse caso não
        // existe maior fila para anunciar nem barra proporcional para desenhar.
        // Só canceladas (ou só status fora do mapa) não têm fluxo para
        // distribuir, e `maior` abaixo seria undefined — a tela quebraria.
        if (segmentos.length === 0) return null;
        const soma = segmentos.reduce((t, seg) => t + seg.n, 0) || 1;
        const maior = segmentos.reduce((a, b) => (b.n > a.n ? b : a), segmentos[0]);

        // A MEDIA DA MAIOR FILA. So sobre as pecas que TEM carimbo: a media de
        // um conjunto com buracos e a media do que se SABE, nao do que se supoe.
        // Sem nenhuma carimbada nao ha frase — melhor calar do que dizer
        // "parada ha 0 dias", que se leria como "acabou de entrar".
        //
        // O pool e `filteredItems` — a lista que a pessoa esta vendo. Os
        // segmentos contam `statsItems` (um recorte acima), e os dois so
        // divergem com filtro ativo; quando divergem, a media do que esta na
        // tela e a mais util das duas.
        const idadeDoSegmento = (chave: string): number | null => {
          // Vem pronto de `idadesPorEtapa` (memo): uma passada por mudança da
          // lista, não uma varredura por segmento a cada render.
          const idades = idadesPorEtapa.get(chave) ?? [];
          return idades.length ? Math.round(idades.reduce((t, d) => t + d, 0) / idades.length) : null;
        };
        const mediaDaMaior = idadeDoSegmento(maior.k);
        return (
          <section aria-label="Distribuição das peças pelo fluxo" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              {/* A única legenda em caixa-alta que sobrou no topo: ela nomeia a
                  SEÇÃO, não um dado — e é curta o bastante para ler de relance. */}
              <span style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "#746e69" }}>
                Onde estão as {fmtN(stats.total)} peças
              </span>
              {/* O maior segmento dito por extenso: a barra mostra a forma, a
                  frase nomeia o gargalo para quem chega sem contexto — e para
                  quem lê por leitor de tela, que não enxerga proporção. */}
              <span style={{ fontSize: 12, fontWeight: 500, color: "#57534e", lineHeight: 1.4 }}>
                Maior fila: <strong style={{ color: "#1c1917", fontWeight: 700 }}>{maior.meta.label}</strong>
                {" "}· {Math.round((maior.n / soma) * 100)}% ({fmtN(maior.n)})
                {/* A frase dizia o quanto a fila PESA; passa a dizer tambem se
                    ela esta andando. E a diferenca entre vazao normal e
                    travamento — a pergunta inteira de quem procura gargalo. */}
                {mediaDaMaior !== null && (() => {
                  const tom = tomDaIdade(mediaDaMaior);
                  return (
                    <span data-testid="texto-idade-maior-fila" style={{ color: tom.cor, fontWeight: tom.peso }}>
                      {" "}· parada {idadePorExtenso(mediaDaMaior)} em média
                    </span>
                  );
                })()}
              </span>
            </div>
            <div style={{ display: "flex", height: 12, borderRadius: 999, overflow: "hidden", background: "#f5f5f4", border: "1px solid #e7e5e4" }}>
              {segmentos.map((seg, i) => {
                const pct = (seg.n / soma) * 100;
                // O VAO ENTRE ZONAS. A barra tem ate 13 segmentos sem rotulo e
                // as zonas so existiam nos cards abaixo: as duas leituras nao
                // se reconheciam. Uma borda de 2px na cor do fundo separa sem
                // mexer nas larguras proporcionais — a soma continua 100%.
                const fechaZona = i < segmentos.length - 1 && segmentos[i + 1].zona !== seg.zona;
                // Dentro da MESMA zona os segmentos têm o mesmo tom (ver
                // tomDaZona): um fio claro de 1px os separa, senão cinco etapas
                // de Produção virariam um bloco só.
                const mesmaZonaAntes = i > 0 && segmentos[i - 1].zona === seg.zona;
                const ativo = statusFilter.includes(seg.k);
                return (
                  <button
                    key={seg.k}
                    onClick={() => toggleStatusCard(seg.k)}
                    aria-pressed={ativo}
                    data-testid={`fluxo-seg-${seg.k}`}
                    title={`${seg.zona} · ${seg.meta.label}: ${fmtN(seg.n)} ${seg.n === 1 ? "peça" : "peças"} (${Math.round(pct)}%)`
                      + (idadeDoSegmento(seg.k) !== null ? ` · parada ${idadePorExtenso(idadeDoSegmento(seg.k)!)} em média` : "")}
                    aria-label={`${seg.meta.label}, ${seg.n} ${seg.n === 1 ? "peça" : "peças"}, ${Math.round(pct)} por cento. Filtrar.`}
                    className="pg-seg"
                    style={{
                      width: `${pct}%`, minWidth: 3, height: "100%", padding: 0, cursor: "pointer",
                      border: "none",
                      // O vao entre zonas: 2px na cor do fundo, via borda, para
                      // nao mexer nas larguras proporcionais — a soma continua
                      // 100%.
                      borderRight: fechaZona ? "2px solid #fafaf9" : "none",
                      borderLeft: mesmaZonaAntes ? "1px solid rgba(255,255,255,0.75)" : "none",
                      // Filtrado = o laranja de "recorte ligado" da tela inteira
                      // (visões salvas, cards). O anel escuro é o segundo canal,
                      // para quem não distingue a cor.
                      // COR DA ETAPA (dono, 17/09): a mesma de getStatusMeta
                      // usada no card e no selo da linha — a barra volta a
                      // dizer QUAL etapa pesa, não só onde fica a massa.
                      // Filtrado: a própria cor com o anel escuro (o laranja
                      // de "recorte ligado" se confundiria com uma etapa).
                      background: seg.meta.dot,
                      boxShadow: ativo ? "inset 0 0 0 2px #1c1917" : "none",
                      transition: "background-color .15s, box-shadow .15s, filter .15s",
                    }}
                  />
                );
              })}
            </div>

            {/* ── AS MARCAS DE ZONA ──

                A barra mostra ate 13 segmentos e as zonas so existiam nos cards
                abaixo — duas leituras da mesma coisa que nao se reconheciam.
                Cada marca tem a largura da soma da sua zona, com elipse: uma
                zona estreita nao pode empurrar as outras.

                No celular elas somem. Tres rotulos em 390px nao cabem, e a
                barra sem rotulo e o que ela ja era — nada se perde. */}
            {!useCards && (
              <div aria-hidden="true" style={{ display: "flex", marginTop: 2 }}>
                {zonas.map(z => {
                  const daZona = segmentos.filter(seg => seg.zona === z.nome);
                  if (daZona.length === 0) return null;
                  const n = daZona.reduce((t, seg) => t + seg.n, 0);
                  const pct = (n / soma) * 100;
                  return (
                    <div
                      key={z.nome}
                      data-testid={`zona-tick-${z.nome}`}
                      style={{ width: `${pct}%`, borderLeft: "1px solid #ddd8d1", paddingLeft: 7, overflow: "hidden" }}
                    >
                      <p style={{ margin: 0, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#746e69", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, backgroundColor: tomDaZona(z.chaves[0]), marginRight: 6, verticalAlign: "0" }} />
                        {z.nome}
                      </p>
                      <p style={{ margin: 0, fontSize: 11, color: "#57534e", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {Math.round(pct)}% · {fmtN(n)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
            {/* COMO LER A BARRA, por escrito. Quem chega pela primeira vez via
                uma faixa cinza sem legenda e não tinha como saber que o tom
                quer dizer avanço, nem que cada pedaço é um filtro. A cor
                continua sem significar risco (risco mora na faixa de atenção
                acima); a frase só ensina a ler a forma e o clique. */}
            <p data-testid="texto-como-ler-fluxo" style={{ margin: 0, fontSize: 12, color: "#746e69", lineHeight: 1.45 }}>
              Cada pedaço é uma etapa, do pedido à entrega, na mesma cor do cartão e do selo da etapa.
              {" "}Clique numa etapa (aqui ou nos cartões abaixo) para filtrar a lista; clique de novo para desfazer.
            </p>
          </section>
        );
      })()}

      {/* ── Status cards — agrupados nas 3 fases do fluxo ─────────────────
          12 cards iguais obrigavam o usuário a escanear um a um para achar o
          gargalo. As zonas (Entrada → Aprovação → Produção) contam a história
          do fluxo e a largura dos cards por zona cria ritmo visual.

          Some quando a carga FALHOU sem dado nenhum: os cards mostrariam "0"
          em tudo ao lado do aviso "Não foi possível carregar as peças" — o
          mesmo zero falso que o travessão resolve na carga, agora no erro. ── */}
      {!(isError && itensDoServidor.length === 0) && (
      <section aria-label="Peças por etapa" style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: -8 }}>
        {useCards ? (
          /* CELULAR: GRADE DE DUAS COLUNAS, não trilho horizontal.
             O trilho escondia a maior parte dos cards fora da tela, sem
             nenhuma pista de que havia mais à direita, e cortava o último
             card ao meio em 390px. Duas colunas mostram tudo o que tem peça
             de uma vez, com o nome inteiro legível; os zerados continuam
             atrás do "Mostrar todos os status". */
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
              {totalCard}
              {kpiCards.filter(c => kpiVisivelPorChave(c.key)).map(c => renderStatusCard(c.key))}
              {stats.outros > 0 && (
                <StatusCard
                  label="Outros" value={stats.outros} filterKey="outros"
                  isActive={false} onToggle={() => setShowAllKpis(true)}
                  sub="fora do fluxo"
                  title={`Status fora do mapa do painel: ${stats.outrosStatus.join(", ")}`}
                />
              )}
            </div>
            <button
              onClick={() => setShowAllKpis(v => !v)}
              style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", minHeight: 36, background: "none", border: "none", padding: "0 2px", fontSize: 11, fontWeight: 700, color: "#c2410c", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              {showAllKpis ? "Mostrar só os status com peças" : "Mostrar todos os status"}
            </button>
          </>
        ) : (
          /* AS ZONAS FLUEM, e não mais num grid 3fr/4fr fixo.
             Com o corte dos zerados o número de cards por zona virou variável,
             e proporções fixas passaram a produzir dois defeitos que só o ao
             vivo mostrou: uma zona com UM card esticava esse card por 1500px,
             e cards de zonas diferentes ficavam com larguras diferentes na
             mesma tela. Card de status é uma peça de tamanho conhecido — ele
             não deve crescer para preencher espaço, deve terminar e deixar o
             resto vazio. */
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 18 }}>
            {/* O NOME DA ZONA É LEGENDA DA BARRA ACIMA: o quadradinho tem o
                mesmo tom que a zona tem lá, e é isso que liga as duas leituras
                sem repetir cor de status. Caixa normal, 12px: era a terceira
                faixa de caixa-alta 10px empilhada no topo da tela. */}
            {([
              { nome: "Entrada", tom: TOM_ZONA_ENTRADA, chaves: entradaVisivel, total: true, outros: false },
              { nome: "Aprovação", tom: TOM_ZONA_APROVACAO, chaves: aprovacaoVisivel, total: false, outros: false },
              { nome: "Produção e entrega", tom: TOM_ZONA_PRODUCAO, chaves: producaoVisivel, total: false, outros: true },
            ]).map(z => {
              const outrosAqui = z.outros && stats.outros > 0;
              const colunas = (z.total ? 1 : 0) + z.chaves.length + (outrosAqui ? 1 : 0);
              if (colunas === 0) return null;
              return (
                <div key={z.nome} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#57534e", paddingLeft: 2 }}>
                    <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: z.tom, flexShrink: 0 }} />
                    {z.nome}
                  </span>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${colunas}, ${LARG_CARD})`, gap: 8 }}>
                    {z.total && totalCard}
                    {z.chaves.map(renderStatusCard)}
                    {/* Card "Outros": qualquer status fora do mapa aparece aqui, com
                        o valor cru no title. É o que faz a soma dos cards fechar
                        SEMPRE com o Total — antes esses itens somavam no Total e em
                        card nenhum, sem aviso. */}
                    {outrosAqui && (
                      <StatusCard
                        label="Outros" value={stats.outros} filterKey="outros"
                        isActive={false} onToggle={() => { /* sem filtro: é anomalia de dado, não etapa do fluxo */ }}
                        sub="status fora do fluxo"
                        title={`Status fora do mapa do painel: ${stats.outrosStatus.join(", ")}`}
                      />
                    )}
                  </div>
                </div>
              );
            })}

            {/* O caminho de volta para os escondidos. Discreto de proposito:
                e uma porta, nao um alarme — e so aparece quando ha o que
                mostrar, senao viraria um botao que nao faz nada. */}
            {/* Sem a guarda de isLoading, durante a carga TODOS os status
                estao zerados e o link oferecia "mostrar os 13 status sem peca"
                — um convite para revelar um vazio que e temporario. */}
            {!isLoading && (escondidos > 0 || showAllKpis) && (
              <button
                onClick={() => setShowAllKpis(v => !v)}
                data-testid="button-toggle-kpis"
                /* Alinhado com a BASE dos cards, não solto embaixo de tudo:
                   `alignSelf: flex-end` o encosta na linha inferior da faixa,
                   onde ele se lê como a continuação dela. */
                style={{ alignSelf: "flex-end", display: "inline-flex", alignItems: "center", minHeight: 36, background: "none", border: "none", padding: "0 2px", fontSize: 11, fontWeight: 700, color: "#c2410c", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2, whiteSpace: "nowrap" }}
              >
                {showAllKpis
                  ? "Mostrar só os status com peças"
                  : `Mostrar os ${escondidos} status sem peça`}
              </button>
            )}
          </div>
        )}
      </section>
      )}

      {/* ── Filter toolbar ──
          Sticky no desktop: com 15 eventos abertos, refinar um filtro obrigava
          a rolar até o topo e voltar — exatamente o laço de quem usa a tela o
          dia inteiro. `top: 4` = logo abaixo da barra de gradiente; zIndex 8
          fica acima do header de evento (6) e do thead (5), que passam a grudar
          abaixo dela (topOffset). Nada aqui pode virar scroll-container. */}
      <div
        ref={toolbarRef}
        style={{
          ...(stickyToolbar ? { position: "sticky" as const, top: 4, zIndex: 8 } : null),
          // DUAS LINHAS DECLARADAS, e nao uma linha que quebra sozinha.
          // Com as visoes salvas aqui dentro sao ate 12 controles; deixados
          // num `wrap` livre eles se reorganizavam a cada largura e cortavam o
          // ultimo select ao meio. Agora e uma grade de duas faixas: as visoes
          // em cima (o recorte pronto), os filtros embaixo (o recorte a mao).
          display: "grid", gridTemplateColumns: "1fr", gap: 8,
          backgroundColor: "#ffffff",
          borderRadius: 10,
          border: "1px solid #e7e5e4",
          padding: "10px 12px",
          boxShadow: "0 1px 3px rgba(28,25,23,0.05)",
        }}
      >
        {/* AS VISÕES MORAM AQUI, e não numa terceira fileira acima.
            A tela tinha três faixas de controle empilhadas antes da primeira
            peça — atenção, visões e filtros —, três gramáticas visuais para
            duas funções. Visão salva É um conjunto de filtros (cada uma é
            literalmente um link com os parâmetros), então ela pertence à
            barra de filtros e não a uma linha própria.
            De quebra herda o `sticky` da barra: antes, para trocar de visão
            com a lista rolada era preciso voltar ao topo. */}
              {/* ── Visões salvas ─────────────────────────────────────────────────────
                  Cada usuário remontava todo dia a mesma combinação de 2-3 filtros, e a
                  home era idêntica para 5 papéis com trabalhos diferentes. Como os
                  filtros vivem na URL, cada visão é literalmente um link. */}
              <div aria-label="Visões salvas" role="group" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                {visoes.map(v => {
                  // 44 no toque, 36 no ponteiro — o mesmo piso do resto dos filtros.
                  const alturaVisao = isMobile ? 44 : 36;
                  const ativa = visaoEstaAtiva(v, filtrosAtuais);
                  const ehPadrao = visaoPadrao === v.id;
                  return (
                    <span key={v.id} style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, border: `1px solid ${ativa ? "#c2410c" : "#e7e5e4"}`, backgroundColor: ativa ? "#fff7ed" : "#ffffff", overflow: "hidden" }}>
                      <button
                        onClick={() => aplicarVisao(v)}
                        aria-pressed={ativa}
                        title={v.hint}
                        data-testid={`visao-${v.id}`}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "0 12px", height: alturaVisao, fontSize: 12, fontWeight: 700, color: ativa ? "#c2410c" : "#57534e", whiteSpace: "nowrap" }}
                      >
                        {v.label}
                      </button>
                      <button
                        onClick={() => fixarVisaoPadrao(v)}
                        aria-pressed={ehPadrao}
                        title={ehPadrao ? "Deixar de abrir o Painel nesta visão" : "Abrir o Painel nesta visão por padrão"}
                        aria-label={ehPadrao ? `Deixar de usar "${v.label}" como visão padrão` : `Usar "${v.label}" como visão padrão`}
                        style={{ background: "none", border: "none", borderLeft: `1px solid ${ativa ? "#fed7aa" : "#e7e5e4"}`, cursor: "pointer", padding: "0 9px", height: alturaVisao, display: "flex", alignItems: "center", color: ehPadrao ? "#c2410c" : "#a8a29e" }}
                      >
                        {/* PIN, não CHECK. O ✓ é o glifo que o app inteiro usa para
                            "este recorte está ligado" — nos FilterSelect e na pílula de
                            atalho. Aqui ele dizia outra coisa ("abrir o Painel nesta
                            visão"), e ficava aceso nas CINCO visões ao mesmo tempo:
                            quem aprendeu ✓ = ligado lia cinco filtros ativos numa tela
                            sem filtro nenhum. Fixar é outra ideia e ganha outro glifo.
                            #a8a29e sobrevive porque é ÍCONE, não texto — e o estado
                            real vive no aria-pressed, não na cor. */}
                        <Pin style={{ width: 12, height: 12, fill: ehPadrao ? "currentColor" : "none" }} aria-hidden="true" />
                      </button>
                    </span>
                  );
                })}
              </div>

        {/* FAIXA 2 — o recorte a mao. Separada da faixa das visoes para os
            controles pararem de se reorganizar a cada largura. */}
        <div style={{ display: "flex", alignItems: useCards ? "stretch" : "center", flexWrap: "wrap", gap: 8 }}>
        {/* Search — full width row on mobile */}
        <div style={{ position: "relative", flexShrink: 0, width: useCards ? "100%" : 180 }}>
          {/* #78716c (4,8:1), não #a8a29e (2,52:1): a lupa é a única marcação
              visual do campo e reprovava o mínimo de 3:1 da WCAG 1.4.11. */}
          <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#746e69", pointerEvents: "none" }} />
          <input
            ref={searchRef}
            type="text"
            placeholder="Buscar peça, evento, tipo ou patrocinador"
            title="Atalho: pressione / para focar a busca"
            aria-label="Buscar peças (atalho: /)"
            aria-keyshortcuts="/"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            data-testid="input-search"
            style={{ ...inputStyle, paddingLeft: 28, height: useCards ? 44 : 32, fontSize: 13 }}
          />
        </div>

        {useCards && (
          <button
            onClick={() => setMobileFiltersOpen(o => !o)}
            aria-expanded={mobileFiltersOpen}
            data-testid="button-toggle-filtros-mobile"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", height: 44, borderRadius: 6, border: "1px solid #e7e5e4", background: "#fafaf9", fontSize: 13, fontWeight: 700, color: "#1c1917", cursor: "pointer" }}
          >
            <SlidersHorizontal style={{ width: 14, height: 14, color: "#746e69" }} />
            Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            {mobileFiltersOpen ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
          </button>
        )}

        {!useCards && <div style={{ width: 1, height: 20, backgroundColor: "#e7e5e4", flexShrink: 0 }} />}

        {(!useCards || mobileFiltersOpen) && (
          <>
            {/* Evento */}
            <div style={{ flexShrink: 1, minWidth: 120, ...(useCards && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
              {/* As opções saem de `eventFilterOptions` — o pool da LISTA —
                  e não mais da query `events` inteira. Antes o menu oferecia
                  todo evento do sistema sobre uma fila podada, e o clique num
                  evento sem peça aqui devolvia lista vazia sem explicação. */}
              <EventFilterDropdown
                values={eventFilter}
                onValuesChange={setEventFilter}
                options={eventFilterOptions}
              />
            </div>

            {/* Tipo */}
            <div style={{ flexShrink: 1, minWidth: 110, ...(useCards && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
              <FilterSelect
                label="Tipo" allLabel="Todos os tipos"
                values={typeFilter} onValuesChange={setTypeFilter}
                hideWhenEmpty={false}
                options={typeFilterOptions}
                testId="select-type-filter"
                fullWidth
              />
            </div>

            {/* Patrocinador */}
            <div style={{ flex: 1, flexShrink: 1, minWidth: 130, ...(useCards && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
              <FilterSelect
                label="Patrocinador" allLabel="Todos os patrocinadores"
                values={sponsorFilter} onValuesChange={setSponsorFilter}
                hideWhenEmpty={false}
                options={sponsorFilterOptions}
                testId="select-sponsor-filter"
                fullWidth
              />
            </div>

            {/* Status */}
            <div style={{ flexShrink: 1, minWidth: 120, ...(useCards && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
              <FilterSelect
                label="Status" allLabel="Qualquer status"
                values={statusFilter} onValuesChange={setStatusFilter}
                hideWhenEmpty={false}
                options={statusOptions}
                testId="select-status-filter"
                fullWidth
              />
            </div>

            {/* Data */}
            <div style={{ flexShrink: 1, minWidth: 110, ...(useCards && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
              {/* O critério é a SAÍDA DO CAMINHÃO — a âncora operacional dos
                  prazos (mesma dos chips e dos alertas), confirmada pelo negócio. */}
              <FilterSelect
                label="Saída do caminhão" allLabel="Saída: qualquer data"
                values={dateFilter} onValuesChange={setDateFilter}
                hideWhenEmpty={false}
                options={dateFilterOptions}
                testId="select-date-filter"
                fullWidth
              />
            </div>

            {/* Foco */}
            <div style={{ flexShrink: 1, minWidth: 120, ...(useCards && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
              <FilterSelect
                label="Foco" allLabel="Sem foco"
                values={focoFilter} onValuesChange={setFocoFilter}
                // TRÊS opções: uma caixa de busca sobre elas é ruído puro. É a
                // mesma decisão que o Histórico tomou com os seus 25/50/100.
                hideSearch
                hideWhenEmpty={false}
                options={FOCO_OPTIONS}
                testId="select-foco-filter"
                fullWidth
              />
            </div>
          </>
        )}

        {!useCards && <div style={{ width: 1, height: 20, backgroundColor: "#e7e5e4", flexShrink: 0 }} />}

        {/* Counter + clear.
            role="status": mudar o filtro trocava lista e número sem nada
            anunciar — o aria-pressed do card diz que o card está pressionado,
            não quantos resultados sobraram. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, ...(useCards && { width: "100%" }) }}>
          <span
            role="status" aria-live="polite" aria-atomic="true"
            data-testid="painel-contador"
            style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 700, color: "#746e69", whiteSpace: "nowrap" }}
          >
            {/* ENQUANTO CARREGA, O CONTADOR NÃO PODE DIZER ZERO.
                Ele lia `filteredItems.length` sem guarda de isLoading, então
                durante a carga (3.187 peças em produção) a tela afirmava
                "0 peças encontradas" com os skeletons rodando logo abaixo —
                "não achei nada" no lugar de "estou buscando".
                E este span é role=status aria-live: o leitor de tela ANUNCIAVA
                o zero. Quem não vê o skeleton recebia a informação errada, sem
                nada que a contradissesse. */}
            {isLoading ? (
              <span style={{ color: "#1c1917", fontWeight: 900 }}>Carregando peças…</span>
            ) : (
              <>
                <span style={{ color: "#1c1917", fontWeight: 900 }}>{filteredItems.length}</span>
                {" "}{filteredItems.length === 1 ? "peça encontrada" : "peças encontradas"}
                {activeFilterCount > 0 && ` · ${activeFilterCount} ${activeFilterCount === 1 ? "filtro ativo" : "filtros ativos"}`}
              </>
            )}
            {/* O número desta tela conta o que está VISÍVEL. Ele só pode dizer
                isso se disser, no mesmo fôlego, quanto ficou de fora — é aqui
                que a contagem é lida (e anunciada pelo leitor de tela a cada
                mudança de filtro), então é aqui que a ressalva tem de estar.
                A porta de volta continua sendo o chip da faixa de atenção.

                É o MESMO número e a MESMA palavra do chip ("ocultas"), de
                propósito: repetir um fato em dois lugares que se leem de
                jeitos diferentes (o chip pelo olho, este pelo leitor de tela)
                é redundância; dizer 315 aqui e 469 ali era contradição. */}
            {chipOcultasDados && !mostrarFinalizados && ` · ${chipOcultasDados.total} ${chipOcultasDados.total === 1 ? "oculta" : "ocultas"}`}
          </span>
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              style={{ display: "flex", alignItems: "center", gap: 4, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700, color: "#c2410c", cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap", height: 32 }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#c2410c"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#fff7ed"; (e.currentTarget as HTMLButtonElement).style.color = "#c2410c"; }}
            >
              × Limpar
            </button>
          )}
        </div>
        </div>
      </div>

      {/* ── Chips dos filtros ativos — a seleção inteira num relance, cada
          filtro removível individualmente sem reabrir dropdown por dropdown.
          O "× Limpar" da toolbar continua sendo o limpa-tudo. ── */}
      {hasActiveFilters && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: -12 }}>
          {searchTerm && (
            <FilterChip isMobile={useCards} label={`Busca: "${searchTerm}"`} onRemove={() => { setSearchInput(""); setSearchTerm(""); }} />
          )}
          {eventFilter.map(id => (
            <FilterChip isMobile={useCards} key={`ev-${id}`} label={`Evento: ${nomeDoEvento(id) ?? id}`} onRemove={() => setEventFilter(prev => prev.filter(v => v !== id))} />
          ))}
          {typeFilter.map(t => (
            <FilterChip isMobile={useCards} key={`tp-${t}`} label={`Tipo: ${t}`} onRemove={() => setTypeFilter(prev => prev.filter(v => v !== t))} />
          ))}
          {sponsorFilter.map(id => (
            <FilterChip isMobile={useCards} key={`sp-${id}`} label={`Patrocinador: ${sponsors.find(s => s.id === id)?.name ?? id}`} onRemove={() => setSponsorFilter(prev => prev.filter(v => v !== id))} />
          ))}
          {statusFilter.map(s => (
            <FilterChip isMobile={useCards} key={`st-${s}`} label={`Status: ${s === "deleted" ? "Excluídos" : getStatusLabel(s)}`} onRemove={() => setStatusFilter(prev => prev.filter(v => v !== s))} />
          ))}
          {dateFilter.map(d => (
            <FilterChip isMobile={useCards} key={`dt-${d}`} label={`Saída: ${DATE_FILTER_LABELS[d] ?? d}`} onRemove={() => setDateFilter(prev => prev.filter(v => v !== d))} />
          ))}
          {focoFilter.map(f => (
            <FilterChip isMobile={useCards} key={`fc-${f}`} label={`Foco: ${FOCO_LABELS[f] ?? f}`} onRemove={() => setFocoFilter(prev => prev.filter(v => v !== f))} />
          ))}
        </div>
      )}

      {/* Sem permissão para a visão Excluídos (a query nem roda — enabled
          exige canDeleteAny): diz o porquê e oferece a saída, em vez de uma
          lista silenciosamente vazia. Acontece via URL compartilhada. */}
      {showDeleted && !canDeleteAny && (
        <div style={{ backgroundColor: "#fff", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#b91c1c" }}>Você não tem permissão para ver peças excluídas.</span>
          <button
            onClick={() => setStatusFilter(prev => prev.filter(s => s !== "deleted"))}
            style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: "#1c1917", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}
          >
            Remover filtro
          </button>
        </div>
      )}

      {/* Estados da visão Excluídos — sem eles, carregamento parecia lista
          vazia e uma falha virava "Nenhum item encontrado" (mentira). */}
      {showDeleted && deletedLoading && (
        <div style={{ backgroundColor: "#fafaf9", border: "1px solid #e7e5e4", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, color: "#746e69" }}>
          Carregando peças excluídas...
        </div>
      )}
      {showDeleted && deletedError && (
        <div style={{ backgroundColor: "#fff", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#b91c1c" }}>Não foi possível carregar as peças excluídas.</span>
          <button onClick={() => refetchDeleted()} style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: "#1c1917", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}>
            Tentar novamente
          </button>
        </div>
      )}

      {/* ── Grouped table ── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {isLoading ? (
          /* O SKELETON TEM DE SER O RETRATO DA TABELA QUE VAI CHEGAR.

             A ideia estava certa — silhueta em vez de spinner central, que
             causava layout shift —, mas o retrato ficou desatualizado. Ele
             desenhava uma FAIXA PRETA de 40px porque o cabeçalho da tabela
             era escuro; o cabeçalho virou claro (#fafaf9 com texto #57534e)
             numa passada anterior e ninguém voltou aqui. Resultado: durante o
             carregamento a tela mostrava uma tarja preta larga — que ainda por
             cima lê como erro ou censura — e ela sumia quando os dados
             chegavam. Um piscar de um design que não existe mais.

             Os outros dois números também haviam se soltado do real, medidos
             no DOM: a linha da tabela tem 63px e o skeleton fazia ~38; a zebra
             é #f6f4f1 e o skeleton usava #fafaf9. Skeleton que não bate com o
             conteúdo entrega justamente o layout shift que ele existe para
             evitar.

             Os valores abaixo são os MEDIDOS da tabela real: thead 44px em
             #fafaf9 com filete #e7e5e4, linha 63px, zebra #ffffff/#f6f4f1. */
          <div style={{ backgroundColor: "#ffffff", border: "1px solid #e7e5e4", borderRadius: 10, overflow: "hidden" }} aria-busy="true" aria-label="Carregando peças">
            <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="animate-pulse" style={{ width: 180, height: 16, borderRadius: 4, backgroundColor: "#e7e5e4" }} />
              <div className="animate-pulse" style={{ width: 70, height: 20, borderRadius: 999, backgroundColor: "#f5f5f4" }} />
            </div>
            <div style={{ height: 44, backgroundColor: "#fafaf9", borderBottom: "1px solid #e7e5e4" }} />
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 24, height: 63, boxSizing: "border-box", padding: "0 16px", backgroundColor: i % 2 ? "#f6f4f1" : "#ffffff" }}>
                <div className="animate-pulse" style={{ width: 48, height: 12, borderRadius: 4, backgroundColor: "#e7e5e4" }} />
                <div className="animate-pulse" style={{ width: `${34 - i * 3}%`, height: 12, borderRadius: 4, backgroundColor: "#e7e5e4" }} />
                <div className="animate-pulse" style={{ width: 60, height: 12, borderRadius: 4, backgroundColor: "#f0efee", marginLeft: "auto" }} />
                <div className="animate-pulse" style={{ width: 90, height: 22, borderRadius: 999, backgroundColor: "#f0efee" }} />
              </div>
            ))}
          </div>
        ) : isError ? (
          /* O ERRO É IRMÃO DO VAZIO, e estava mal-acabado ao lado dele.
             Os dois ocupam o mesmo lugar da tela e aparecem pelo mesmo
             motivo — não há lista para mostrar —, mas só um tinha sido
             desenhado: o vazio vinha com raio 10, ícone, título 700 e botão
             de 9/20; o erro vinha QUADRADO (sem raio nenhum, único caso na
             tela), sem ícone, com título 600 e botão de 8/18.
             Ninguém compara os dois lado a lado, e é justamente por isso que
             a diferença passa: cada um é visto sozinho, e o erro parecia uma
             tela mais velha do mesmo produto. Agora os dois têm a mesma
             composição — só muda a cor da borda e do ícone, que é o que de
             fato distingue "deu errado" de "não tem nada". */
          <div style={{ backgroundColor: "#ffffff", border: "1px solid #fecaca", borderRadius: 10, padding: "56px 24px", textAlign: "center" }}>
            <AlertTriangle style={{ width: 28, height: 28, color: "#fca5a5", margin: "0 auto 12px" }} />
            {/* #b91c1c sobre #ffffff = 6,47:1 ✓ (calculado, nao estimado) */}
            <p style={{ color: "#b91c1c", fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>Não foi possível carregar as peças</p>
            <p style={{ color: "#746e69", fontSize: 13, margin: "0 0 16px" }}>Verifique sua conexão e tente novamente.</p>
            <button onClick={() => refetch()} style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: "#1c1917", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}>Tentar novamente</button>
          </div>
        ) : filteredItems.length === 0 ? (
          /* Empty state com contexto e ação: diz POR QUE está vazio (filtros
             ativos vs sistema sem peças) e oferece o caminho de volta ali
             mesmo. Suprimido quando um banner da visão Excluídos já explicou o
             motivo — antes os dois apareciam empilhados, e o segundo (maior e
             com botão) contava uma história falsa. */
          !bannerExcluidosVisivel && (
            <div style={{ backgroundColor: "#ffffff", border: "1px solid #e7e5e4", borderRadius: 10, padding: "56px 24px", textAlign: "center" }}>
              <Search style={{ width: 28, height: 28, color: "#d6d3d1", margin: "0 auto 12px" }} />
              {/* Três motivos, três respostas. O terceiro é novo e é o que
                  evita a pior leitura desta feature: lista vazia com peças
                  ocultas por trás lida como "não existe" quando o certo é "não
                  está aqui, e está a um clique". */}
              <p style={{ color: "#1c1917", fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>
                {hasActiveFilters ? "Nenhuma peça encontrada"
                  : chipOcultasDados && !mostrarFinalizados ? "Só sobrou o que já acabou"
                  : "Nenhuma peça cadastrada ainda"}
              </p>
              <p style={{ color: "#746e69", fontSize: 13, margin: "0 0 16px", maxWidth: 520, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>
                {/* "FILTREI — POR QUE SUMIU TUDO?" A frase antiga mandava
                    ajustar sem dizer O QUÊ: os filtros ativos são nomeados
                    aqui (os mesmos rótulos dos chips acima), a busca diz onde
                    procura, e as peças ocultas ganham a sua própria saída —
                    com filtro ligado elas também podem ser a resposta. */}
                {hasActiveFilters
                  ? <>
                      Nenhuma peça corresponde a {activeFilterCount === 1 ? "este filtro" : `estes ${activeFilterCount} filtros`}:{" "}
                      <strong style={{ color: "#44403c", fontWeight: 600 }}>
                        {[
                          searchTerm && `busca "${searchTerm}"`,
                          ...eventFilter.map(id => `evento ${nomeDoEvento(id) ?? ""}`.trim()),
                          ...typeFilter.map(t => `tipo ${t}`),
                          ...sponsorFilter.map(id => `patrocinador ${sponsors.find(s => s.id === id)?.name ?? ""}`.trim()),
                          ...statusFilter.map(s => `status ${s === "deleted" ? "Excluídos" : getStatusLabel(s)}`),
                          ...dateFilter.map(d => `saída ${(DATE_FILTER_LABELS[d] ?? d).toLowerCase()}`),
                          ...focoFilter.map(f => `foco ${(FOCO_LABELS[f] ?? f).toLowerCase()}`),
                        ].filter(Boolean).join(" · ")}
                      </strong>.
                      {searchTerm ? " A busca procura no código da peça, no nome do evento, no tipo, na descrição e no patrocinador." : ""}
                      {chipOcultasDados && !mostrarFinalizados ? ` ${chipOcultasDados.total} ${chipOcultasDados.total === 1 ? "peça de evento encerrado ou realizado está oculta" : "peças de evento encerrado ou realizado estão ocultas"} e podem ser o que você procura.` : ""}
                    </>
                  : chipOcultasDados && !mostrarFinalizados
                    ? `${chipOcultasDados.total} ${chipOcultasDados.total === 1 ? "peça está fora" : "peças estão fora"} da lista porque o evento delas foi encerrado ou já foi realizado.`
                    : "As peças aparecem aqui quando forem adicionadas a um evento."}
              </p>
              {hasActiveFilters ? (
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
                  <button
                    onClick={clearAllFilters}
                    style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: "#1c1917", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}
                  >
                    Limpar filtros
                  </button>
                  {chipOcultasDados && !mostrarFinalizados && (
                    /* Contorno: é a saída secundária. Mesmo estado do chip da
                       faixa de atenção — revela sem mexer nos filtros. */
                    <button
                      onClick={() => setMostrarFinalizados(true)}
                      data-testid="button-incluir-ocultas-vazio"
                      style={{ fontSize: 13, fontWeight: 700, color: "#1c1917", background: "#ffffff", border: "1px solid #d6d3d1", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}
                    >
                      Procurar também nas {chipOcultasDados.total} ocultas
                    </button>
                  )}
                </div>
              ) : chipOcultasDados && !mostrarFinalizados ? (
                <button
                  onClick={() => setMostrarFinalizados(true)}
                  data-testid="button-mostrar-ocultas-vazio"
                  style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: "#1c1917", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}
                >
                  Mostrar as {chipOcultasDados.total} {chipOcultasDados.total === 1 ? "peça oculta" : "peças ocultas"}
                </button>
              ) : null}
            </div>
          )
        ) : (
          <>
            {planoDaLista.grupos.map((p) => (
              <GrupoDoEvento
                key={p.eventKey}
                eventKey={p.eventKey}
                gd={p.gd}
                meta={eventMeta.get(p.eventKey)}
                groupOpen={p.groupOpen}
                isExpanded={p.isExpanded}
                linhasPermitidas={p.linhasPermitidas}
                hojeMs={hojeMs}
                relogioIdade={relogioIdade}
                useCards={useCards}
                isCompact={isCompact}
                colCount={colCount}
                topOffset={topOffset}
                sortBy={sortBy}
                sortDir={sortDir}
                typeToGroup={typeToGroup}
                selectedIds={selectedIds}
                isAdmin={isAdmin}
                canDeleteAny={canDeleteAny}
                restoringItemId={restoringItemId}
                restorePending={restoreItemMutation.isPending}
                acoes={acoesDaLista}
              />
            ))}
            {planoDaLista.incompleto && (
              <SentinelaDeLote key={orcamentoLinhas} onVisivel={pedirProximoLote} />
            )}
          </>
        )}
      </section>

      {/* ── Barra de ações em lote ────────────────────────────────────────────
          O ExportPdfDialog já tinha seleção interna, mas ela não conversava com
          a lista: o usuário filtrava fora e re-selecionava dentro. */}
      {selecionadas.length > 0 && (
        <div
          role="region" aria-label="Ações para as peças selecionadas"
          style={{ position: "fixed", left: "50%", bottom: 20, transform: "translateX(-50%)", zIndex: 30, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 999, backgroundColor: "#1c1917", boxShadow: "0 8px 24px rgba(28,25,23,.28)", flexWrap: "wrap", maxWidth: "94vw" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", whiteSpace: "nowrap" }}>
              {selecionadas.length} {selecionadas.length === 1 ? "peça selecionada" : "peças selecionadas"}
            </span>
            {/* DO QUE A SELECAO E FEITA. "12 selecionadas" nao diz se sao doze
                aguardando aprovacao ou onze entregues e uma reprovada — e a
                acao que faz sentido depende inteiramente disso. Marcar em lote
                e facil; lembrar o que se marcou, nao. */}
            {(() => {
              const porStatus = new Map<string, number>();
              for (const i of selecionadas as any[]) {
                const m = getStatusMeta(i.status);
                const rotulo = m.short || m.label;
                porStatus.set(rotulo, (porStatus.get(rotulo) ?? 0) + 1);
              }
              if (porStatus.size === 0) return null;
              const partes = Array.from(porStatus.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([rotulo, n]) => `${n} ${rotulo.toLowerCase()}`);
              // Acima de tres situacoes a frase vira lista de compras: o resto
              // some num "+N", que ainda diz que ha mais.
              const visiveis = partes.slice(0, 3);
              const resto = partes.length - visiveis.length;
              return (
                <span data-testid="text-selecao-composicao" style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {visiveis.join(" · ")}{resto > 0 ? ` · +${resto}` : ""}
                </span>
              );
            })()}
          </div>
          <button onClick={() => setShowExportPDFModal(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, color: "#fff", fontSize: 12, fontWeight: 700, padding: "6px 12px", cursor: "pointer" }}>
            <Printer style={{ width: 13, height: 13 }} /> PDF
          </button>
          <button onClick={exportarXlsx} disabled={isExportingXlsx} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, color: "#fff", fontSize: 12, fontWeight: 700, padding: "6px 12px", cursor: "pointer" }}>
            <FileSpreadsheet style={{ width: 13, height: 13 }} /> Excel
          </button>
          <button onClick={copiarIds} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, color: "#fff", fontSize: 12, fontWeight: 700, padding: "6px 12px", cursor: "pointer" }}>
            <Copy style={{ width: 13, height: 13 }} /> Copiar IDs
          </button>
          <button onClick={() => setSelectedIds(new Set())} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 700, padding: "6px 8px", cursor: "pointer", textDecoration: "underline" }}>
            Limpar seleção
          </button>
        </div>
      )}

      {/* ── Exportar PDF — mesmo modal da Arte e do Atendimento ── */}
      {/* Exporta o recorte que está na tela (ou a seleção), nunca a base
          inteira, e sem as peças excluídas. Montado só quando aberto — o modal
          roda facetas sobre a lista inteira mesmo fechado. */}
      {showExportPDFModal && (
        <ExportPdfDialog
          open={showExportPDFModal}
          onOpenChange={setShowExportPDFModal}
          items={itensParaExportar}
          title="Peças"
        />
      )}

      {/* ── Item details modal ── */}
      <ItemDetailsDialog
        item={selectedItem}
        auditLogs={auditLogs}
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItem(null)}
        topActions={selectedItem ? (
          /* Fecha o ciclo ver → agir: depois de achar o gargalo, o usuário
             fechava a ficha e fazia o roteamento mental (status → tela) sem
             ajuda nenhuma. O mapa status→tela respeita o papel: quando a
             pessoa não entra na tela, o botão não aparece. */
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {selectedItem.eventId && (
              <Link
                href={`/eventos/${selectedItem.eventId}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px", borderRadius: 8, border: "1px solid #e7e5e4", background: "#fff", color: "#1c1917", fontSize: 12, fontWeight: 700, textDecoration: "none" }}
              >
                <Link2 style={{ width: 13, height: 13, color: "#746e69" }} />
                Abrir evento
              </Link>
            )}
            {(() => {
              // "Continuar em X" leva à FILA de trabalho — e as filas escondem
              // as peças de evento finalizado. Mandar a pessoa para uma tela
              // onde a peça não aparece é o mesmo beco sem saída do botão que
              // só devolve 409: ela vai procurar, não vai achar, e vai concluir
              // que o sistema perdeu a peça. Aqui o atalho vira a explicação.
              //
              // Só o ATALHO muda. O Painel Geral continua listando a peça de
              // propósito (registro não perde o passado) e "Abrir evento" e
              // "Copiar link" seguem valendo — são leitura.
              const motivoFim = motivoEventoFinalizado(selectedItem.event ?? null, todayBusinessMs());
              if (motivoFim) {
                return (
                  <span
                    data-testid="aviso-evento-finalizado-ficha"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 34, padding: "6px 12px", borderRadius: 8, border: "1px solid #e7e5e4", background: "#fafaf9", color: "#57534e", fontSize: 12, fontWeight: 600, maxWidth: 360, lineHeight: 1.4 }}
                  >
                    <Lock style={{ width: 13, height: 13, flexShrink: 0, color: "#746e69" }} />
                    {motivoFim === "encerrado"
                      ? "Evento encerrado — esta peça não avança no fluxo. Reabra o evento para voltar a trabalhar nela."
                      : "Evento já realizado — esta peça não avança no fluxo. Conferência e entrega seguem liberadas na Gráfica."}
                  </span>
                );
              }
              const tela = proximaTelaDoStatus(selectedItem.status, user?.role);
              if (!tela) return null;
              return (
                <Link
                  href={tela.path}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px", borderRadius: 8, border: "1px solid #fed7aa", background: "#fff7ed", color: "#c2410c", fontSize: 12, fontWeight: 800, textDecoration: "none" }}
                >
                  <ArrowUpRight style={{ width: 13, height: 13 }} />
                  Continuar em {tela.label}
                </Link>
              );
            })()}
            <button
              onClick={() => copiarLinkDaPeca(selectedItem)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px", borderRadius: 8, border: "1px solid #e7e5e4", background: "#fff", color: "#1c1917", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              <Copy style={{ width: 13, height: 13, color: "#746e69" }} />
              Copiar link da peça
            </button>
          </div>
        ) : undefined}
        customActions={temBlocoDeComplemento(selectedItem, false, false) ? (
          <ComplementoDaFicha
            item={selectedItem}
            canEditLists={false}
            onAbrirPeca={(id) => {
              const alvo = (items as any[]).find((i: any) => i.id === id);
              if (alvo) setSelectedItem(alvo);
            }}
          />
        ) : undefined}
      />

      {/* ── Delete confirmation (Admin ou Solicitação, em qualquer status) ── */}
      <AlertDialog open={!!deleteConfirmItemId} onOpenChange={open => { if (!open) setDeleteConfirmItemId(null); }}>
        {/* A SUPERFÍCIE VEM DO SISTEMA DE MODAL DO APP, e não de números
            escritos aqui.

            Este era o único modal do Painel Geral e vinha com o shadcn CRU —
            nenhum estilo — enquanto o resto do app já tinha acabamento. É o
            que mais denuncia uma tela feita pela metade: a página refinada e,
            ao confirmar uma exclusão, um modal com cara de biblioteca
            instalada ontem. E confirmar exclusão é o momento de MAIOR atrito
            da tela: é onde a pessoa para para ler.

            A primeira correção copiou os números do Detalhe do Evento (raio
            16, sombra 0 20px 60px). Estava errado por um motivo que só
            apareceu ao ler o modal-shell: aquele arquivo TAMBÉM está fora do
            sistema. Copiar de quem está fora não conserta — só cria a quarta
            superfície artesanal. `modalSurface` é usado por dez telas, e os
            tokens dele são MODAL_RADIUS e MODAL_SHADOW.

            O maxHeight não é detalhe: sem teto, um modal que cresce além da
            janela é cortado EM CIMA E EMBAIXO AO MESMO TEMPO — o Radix centra
            o conteúdo — e some o título junto com o botão de confirmar. Aqui
            o texto é curto, mas ele carrega o nome e o tipo da peça, que numa
            janela baixa quebram em várias linhas. */}
        <AlertDialogContent style={{ width: "96vw", maxWidth: 460, backgroundColor: "#ffffff", borderRadius: MODAL_RADIUS, padding: 32, border: "none", boxShadow: MODAL_SHADOW, maxHeight: "calc(100vh - 48px)", overflowY: "auto" }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em", color: "#1c1917" }}>Excluir peça?</AlertDialogTitle>
            {/* #57534e sobre #ffffff = 7,63:1 ✓ — o mesmo cinza de leitura
                que a tela usa em texto de apoio. */}
            <AlertDialogDescription style={{ fontSize: 13, lineHeight: 1.55, color: "#57534e" }}>
              {/* O texto antigo ("permanece no histórico de auditoria")
                  descrevia o LOG, não a peça — e escondia que a ação é
                  reversível. O que acontece é soft delete, com rota de restore. */}
              {deleteConfirmItemId && (() => {
                const item = items.find((i: any) => i.id === deleteConfirmItemId);
                const alvo = item ? `A peça "${item.displayId} — ${item.type}"` : "A peça";
                return `${alvo} vai para a lixeira. Ela some das listagens, mas um administrador pode restaurá-la a qualquer momento.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteItemMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              // preventDefault: o AlertDialogAction fecha o diálogo no clique;
              // fechado, o "Excluindo..." nunca aparecia. Quem fecha agora é o
              // onSuccess da mutação (setDeleteConfirmItemId(null)).
              onClick={(e) => {
                e.preventDefault();
                if (deleteConfirmItemId) deleteItemMutation.mutate(deleteConfirmItemId);
              }}
              disabled={deleteItemMutation.isPending}
              /* #b91c1c, e não #dc2626. Os dois passam AA com texto branco
                 (6,47 e 4,83), então isto não é correção de contraste — é
                 consistência: #b91c1c é o vermelho destrutivo que este
                 arquivo já usa em outros oito lugares, e ainda por cima o
                 mais legível dos dois. Um app não tem dois vermelhos de
                 "apagar". */
              style={{ backgroundColor: "#b91c1c", color: "#fff", fontWeight: 700 }}
              data-testid="button-confirm-delete"
            >
              {deleteItemMutation.isPending ? "Excluindo..." : "Excluir Peça"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
