import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle, AlertCircle, Copy, Eye, Search, X, FileImage, Maximize2, Trash2, Paperclip, Recycle, Check, Clock, ChevronLeft, ChevronRight, ChevronDown, MoreHorizontal, RotateCcw, Truck, Mail, Lock, Unlock } from "lucide-react";
import { FilterSelect } from "@/components/filter-select";
import { SeloKit } from "@/components/kit/selo-kit";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { FilePreview, isWebUrl } from "@/components/file-preview";
import { parseDateLocal, normalizarBusca } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FORMATO_COMPACTO, expandirResposta } from "@shared/itens-compactos";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { usePecaDoLink } from "@/hooks/use-peca-do-link";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState, useMemo, useEffect, Fragment, useRef, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/auth-context";
import { ehBookCompleto } from "@shared/fluxo-peca";
import { arquivoFinalOk, ehMolde } from "@shared/molde";
import { pecaTravada, fraseDaTrava, seloDaTrava, podeTravar, lerMotivo, SUGESTOES_DE_MOTIVO, MOTIVO_MINIMO, CODIGO_PECA_TRAVADA } from "@shared/trava-da-peca";
import { SeloPrazoMolde } from "@/components/prazo-do-molde";
import {
  STATUS, getStatusMeta,
  seloPecaEventoFinalizado, motivoAcaoBloqueada, todayBusinessMs,
} from "@/lib/status";
import type { SeloPecaEventoFinalizado } from "@/lib/status";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { AumentarQuantidadeDialog, parseApiError } from "@/components/aumentar-quantidade-dialog";
import {
  PedirAoEstoque, RespostaDoEstoqueNaFicha, SeloDoEstoqueNaLinha, AplicarAgoraNoModal, CHAVE_DO_ESTOQUE_NA_REVISAO,
  aguardandoEstoque, chaveDaConsulta, estoqueRespondeu, useConsultaDaPeca, useEstoqueDaRevisao,
} from "@/components/consulta-de-estoque/na-revisao";
import { SOLICITACAO_AO_ESTOQUE_ATIVA, propostaDaLiberacao, respostaEsperandoConfirmar, resumoDoLoteComEstoque } from "@shared/consultas-de-estoque";
import { T, TOM, N, FS } from "@/lib/theme";
import { hrefSeguro } from "@shared/url-segura";

// Tons de texto desta paleta valem para superfícies CLARAS (bg/surface).
// Sobre os painéis escuros (#0c0a09/#1c1917) use #a8a29e ou mais claro —
// #746e69 e #57534e reprovam WCAG AA nesses fundos.
const TI = {
  bg: T.bg, surface: T.surface, border: T.border,
  text: T.text, secondary: T.second, muted: T.muted,
  accent: T.accent, dark: T.text,
};

// Status que esta tela revisa. O vocabulário canônico (rótulo/cores) vive em
// lib/status: "awaiting_final_review" → "Aguardando Revisão Final".
const REVIEW_STATUS = "awaiting_final_review";

// A LISTA DESTA TELA VEM RECORTADA NO SERVIDOR (perf, 17/09). Ela lia
// ["/api/items"] — o acervo inteiro, 5 mil peças e 15 MB em produção — para
// mostrar as poucas em "Aguardando Revisão Final". GET /api/items?status=
// devolve só essas, enriquecidas do mesmo jeito (Kit, patrocinadores na mesma
// ordem, complemento e `parent`), com delta e formato compacto
// (lib/queryClient.ts). A chave fica dentro do prefixo "/api/items": as
// invalidações do WebSocket e das mutações abaixo continuam atingindo esta
// lista, e a peça liberada/devolvida sai dela pelo delta (`removidas`).
//
// Tudo o que a tela lê de `items` é desta fila, com DUAS exceções que liam
// peça de outro status no acervo — e que agora buscam só a peça:
//   · o aviso do link `?item=` para peça que já saiu da fila diz o CÓDIGO dela;
//   · o 409 USE_COMPLEMENT (a peça foi liberada e produzida em outra aba com o
//     modal aberto) abre o complemento com a peça como ela está AGORA.
const CHAVE_DA_REVISAO = ["/api/items", `?status=${REVIEW_STATUS}`] as const;

/**
 * A peça, como está agora no servidor — ou `null` (excluída, fora do que o
 * usuário enxerga, rede fora). Só ela, pelo recorte `?ids=`: é o que as duas
 * exceções acima liam do acervo inteiro.
 */
async function buscarPecaAtual(id: string): Promise<any | null> {
  try {
    const res = await apiRequest("GET", `/api/items?ids=${encodeURIComponent(id)}&formato=${FORMATO_COMPACTO}`);
    const lista = expandirResposta(await res.json());
    return Array.isArray(lista) ? lista.find((i: any) => i?.id === id) ?? null : null;
  } catch {
    return null;
  }
}

// Config do HISTÓRICO: ações de log que correspondem a status do vocabulário
// herdam rótulo e cor de lib/status; o mapa abaixo cobre apenas os tipos de
// log que NÃO são status. Vive fora do componente para não ser recriado a
// cada render.
// `dot` (tom saturado 500) é só da bolinha; `text` (tom escuro 700, AA sobre
// fundo claro) é o que vai no rótulo — mesma disciplina do StatusMeta.
const NON_STATUS_LOG_CFG: Record<string, { label: string; dot: string; text: string }> = {
  updated:          { label: "Atualizado",            dot: T.accent, text: T.accentText },
  rejected:         { label: "Reprovado",             dot: TOM.perigo.dot, text: TOM.perigo.text },
  submitted:        { label: "Enviado",               dot: TOM.ciano.text, text: TOM.ciano.text },
  linked:           { label: "Vinculado",             dot: TOM.turquesa.text, text: TOM.turquesa.text },
  released:         { label: "Liberado",              dot: TOM.info.dot, text: TOM.info.text },
  status_changed:   { label: "Status alterado",       dot: T.accent, text: T.accentText },
  sponsor_approved: { label: "Patrocinador aprovado", dot: TOM.esmeralda.dot, text: TOM.esmeralda.text },
  sponsor_rejected: { label: "Patrocinador reprovou", dot: TOM.perigo.dot, text: TOM.perigo.text },
  file_uploaded:    { label: "Arquivo enviado",       dot: TOM.roxo.text, text: TOM.roxo.text },
  thumb_uploaded:   { label: "Thumb enviado",         dot: TOM.roxo.text, text: TOM.roxo.text },
};

function getLogCfg(log: any): { label: string; dot: string; text: string } {
  const action = log?.action as string | undefined;
  if (action && STATUS[action]) {
    const m = getStatusMeta(action);
    return { label: m.label, dot: m.dot, text: m.text };
  }
  if (action && NON_STATUS_LOG_CFG[action]) return NON_STATUS_LOG_CFG[action];
  return { label: action?.replace(/_/g, " ") ?? log?.details ?? "Ação", dot: T.muted, text: T.second };
}

// ── O recorte na URL ────────────────────────────────────────────────────────
// Esta era a ÚNICA tela com filtros do app que não persistia nada: o recorte
// "evento X + banner" era remontado a cada F5, não sobrevivia a abrir uma peça
// e voltar, e não dava para mandar para um colega. Pior, `urlSetorDaPeca`
// (components/prazos/tokens.ts) já mandava gente para cá com `?busca=<ID>` a
// partir do drill da Gestão de Prazos — o link existia e caía numa tela que
// ignorava o parâmetro, entregando a fila inteira em vez da peça pedida.
//
// Nomes em pt-BR e IGUAIS aos das outras telas (`busca`, `evento`, `tipo`):
// a URL é compartilhada entre colegas, e o mesmo recorte não pode ter um nome
// em cada tela. Só o que está fora do padrão entra — estado limpo, URL limpa.
interface FiltrosRevisao { busca: string; eventos: string[]; tipos: string[] }

const FILTROS_REVISAO_VAZIOS: FiltrosRevisao = { busca: "", eventos: [], tipos: [] };

function filtrosRevisaoDaURL(search: string): FiltrosRevisao {
  const p = new URLSearchParams(search);
  const lista = (k: string) => (p.get(k) ?? "").split(",").filter(Boolean);
  return { busca: p.get("busca") ?? "", eventos: lista("evento"), tipos: lista("tipo") };
}

/**
 * Parte da query ATUAL e sobrescreve só as três chaves gerenciadas — o
 * `?item=` do deep link de peça (e qualquer param alheio) sobrevive, em vez de
 * ser apagado pelo primeiro espelhamento do recorte. Mesma disciplina de
 * `filtrosParaQuery` na Gráfica.
 */
function filtrosRevisaoParaQuery(searchAtual: string, f: FiltrosRevisao): string {
  const p = new URLSearchParams(searchAtual);
  const por = (k: string, v: string) => (v ? p.set(k, v) : p.delete(k));
  por("busca", f.busca);
  por("evento", f.eventos.join(","));
  por("tipo", f.tipos.join(","));
  return p.toString();
}

/**
 * Para onde a peça vai ao ser liberada — o MESMO critério do servidor.
 * PATCH /api/items/:id/creator-review (server/routes/items.ts) trata a peça
 * com reaproveitamento total (`isReuse`) como "não precisa produzir": ela vai
 * direto para Impresso / Acabamento (a conferência da Gráfica) e não exige arquivo final.
 * As demais, inclusive reaproveitamento parcial, vão para Pronto para Produção.
 * Dizer "Pronto para Produção" para todas mentia justamente sobre a peça que
 * nem entra na fila de impressão.
 */
function reaproveitamentoTotal(item: any): boolean {
  return !!item?.isReuse;
}
/** Frase no passado, para o aviso depois de liberar. */
function destinoAoLiberar(item: any): string {
  return reaproveitamentoTotal(item)
    ? "foi direto para Impresso / Acabamento, na conferência da Gráfica (reaproveitamento total — não passa pela impressão)"
    : "entrou na fila da Gráfica como Pronto para Produção";
}

/**
 * A peça pode ser liberada agora? A MESMA régua do servidor: tem arquivo final
 * (ou não precisa — molde), ou é reaproveitamento total, que não imprime nada.
 */
function prontaParaLiberar(item: any): boolean {
  return arquivoFinalOk(item) || reaproveitamentoTotal(item);
}

/** Quantas chamadas o lote faz ao mesmo tempo: 40 de uma vez afogavam o servidor. */
const LOTE_CONCORRENTE = 5;

/**
 * Roda `fazer` em cada id, de LOTE_CONCORRENTE em LOTE_CONCORRENTE, e devolve o
 * motivo de cada falha por id (a mensagem do servidor, não "erro").
 */
async function emLotes(ids: string[], fazer: (id: string) => Promise<unknown>): Promise<Record<string, string>> {
  const falhas: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += LOTE_CONCORRENTE) {
    const fatia = ids.slice(i, i + LOTE_CONCORRENTE);
    const r = await Promise.allSettled(fatia.map((id) => fazer(id)));
    r.forEach((x, j) => {
      if (x.status === "rejected") falhas[fatia[j]] = parseApiError(x.reason).message || "Falha sem mensagem do servidor.";
    });
  }
  return falhas;
}

export default function Solicitacao() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  // As duas facetas novas da barra de filtros.
  const [soSemArquivo, setSoSemArquivo] = useState(false);
  const [soEventoFinalizado, setSoEventoFinalizado] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [returnObservations, setReturnObservations] = useState("");
  // PARA ONDE a peça volta — escolha de quem devolve (regra do dono, 17/08).
  // "finalizacao" é o padrão porque é o caso comum e o menos destrutivo:
  // preservar a aprovação do patrocinador não custa nada se a arte for refeita
  // depois, mas jogar fora uma aprovação que valia obriga a pedir tudo de novo.
  const [destinoDevolucao, setDestinoDevolucao] = useState<"finalizacao" | "arte">("finalizacao");
  const [editingQuantity, setEditingQuantity] = useState(false);
  const [quantityValue, setQuantityValue] = useState<number>(1);
  // Complemento: peça-mãe e a diferença sugerida pelo servidor quando o
  // aumento foi barrado por já estar em produção (409 USE_COMPLEMENT).
  const [complementItem, setComplementItem] = useState<any>(null);
  const [complementSugestao, setComplementSugestao] = useState<number | null>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  // Alvo do foco ao abrir a confirmação de liberar (ver o AlertDialog dela).
  const botaoConfirmarLiberarRef = useRef<HTMLButtonElement>(null);
  const [releaseConfirmOpen, setReleaseConfirmOpen] = useState(false);
  // ── SOLICITAÇÃO AO ESTOQUE (dono, 21/09) ────────────────────────────────
  // "As respostas do reaproveitar têm que aparecer na REVISÃO, e é ELA que
  // segue com o item… tem que vir SUGERIDO e ela só CONFIRMAR."
  // `estoquePorPeca`: o que vale para cada peça da lista (selo na linha, os
  // dois contadores, a ordem e o resumo do lote) — uma leitura só.
  // `propostaDaFicha`: a conta pronta da peça aberta, que escreve o botão
  // "Confirmar e liberar · 3 reaproveitadas + 3 a produzir".
  // `usarMenos`: o ajuste escondido atrás do link — null = a sugestão.
  // CHAVE DESLIGADA (dono, 21/09 — segurar; SOLICITACAO_AO_ESTOQUE_ATIVA):
  // os dois hooks não pedem nada (mapa vazio, consulta null), o filtro fica
  // vazio e a URL não é tocada — a tela é a de antes da solicitação ao estoque.
  const estoquePorPeca = useEstoqueDaRevisao();
  const [filtroEstoque, setFiltroEstoque] = useState<"" | "aguardando" | "respondeu">(() => {
    if (!SOLICITACAO_AO_ESTOQUE_ATIVA) return "";
    const v = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("estoque");
    return v === "aguardando" || v === "respondeu" ? v : "";
  });
  const [usarMenos, setUsarMenos] = useState<number | null>(null);
  const idDaFicha = selectedItem?.id ?? null;
  useEffect(() => { setUsarMenos(null); }, [idDaFicha]);
  const { consulta: consultaDaFicha } = useConsultaDaPeca(idDaFicha, modalOpen);
  const pedidoEmAberto = consultaDaFicha?.status === "aberta";
  // Marcação manual de reaproveitamento total manda — o servidor também a
  // respeita antes da resposta do estoque.
  const propostaDaFicha = SOLICITACAO_AO_ESTOQUE_ATIVA && selectedItem && !selectedItem.isReuse && respostaEsperandoConfirmar(consultaDaFicha)
    ? propostaDaLiberacao(Number(selectedItem.quantity) || 0, consultaDaFicha!, usarMenos)
    : null;
  // Sem arquivo final não libera — salvo quando o estoque cobre a peça inteira
  // (reaproveitamento total não imprime nada; é a mesma régua do servidor).
  // Chave desligada: a regra de antes — sem arquivo final, não libera. MOLDE
  // (22/09) não tem arquivo final — libera só com o thumb (arquivoFinalOk).
  // Reaproveitamento total também não precisa (não imprime nada).
  const semArquivoParaLiberar = !!selectedItem && !prontaParaLiberar(selectedItem) && !(SOLICITACAO_AO_ESTOQUE_ATIVA && propostaDaFicha?.pulaProducao);
  // O filtro do estoque mora na URL, como os outros (?estoque=respondeu).
  useEffect(() => {
    if (!SOLICITACAO_AO_ESTOQUE_ATIVA) return;
    const q = new URLSearchParams(window.location.search);
    if (filtroEstoque) q.set("estoque", filtroEstoque); else q.delete("estoque");
    const qs = q.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [filtroEstoque]);
  // Campo de observação do card: precisa existir por conta própria, sem
  // depender de "Liberar" ou "Devolver" — a pessoa pode querer deixar um
  // recado (cor, acabamento, posição) sem estar pronta para tomar nenhuma das
  // duas decisões ainda.
  const [cardObservations, setCardObservations] = useState("");
  const [bulkReleaseConfirmOpen, setBulkReleaseConfirmOpen] = useState(false);
  const [bulkReturnConfirmOpen, setBulkReturnConfirmOpen] = useState(false);
  const [bulkReuseConfirmOpen, setBulkReuseConfirmOpen] = useState(false);
  const [bulkReturnObservations, setBulkReturnObservations] = useState("");
  const [returnConfirmOpen, setReturnConfirmOpen] = useState(false);
  const [deleteConfirmItemId, setDeleteConfirmItemId] = useState<string | null>(null);
  // POR QUE CADA PEÇA DO LOTE FICOU: o motivo do servidor, escrito na linha.
  // O toast só resume — "3 com erro" não dizia quais nem por quê.
  const [falhasPorId, setFalhasPorId] = useState<Record<string, string>>({});
  const anotarFalhas = (falhas: Record<string, string>, limpar: string[] = []) =>
    setFalhasPorId(prev => {
      const prox = { ...prev };
      for (const id of limpar) delete prox[id];
      return { ...prox, ...falhas };
    });
  // Travar pela ficha (a mesma trava da Gráfica): a peça a travar e o motivo.
  const [travandoItem, setTravandoItem] = useState<any>(null);
  const [motivoDaTrava, setMotivoDaTrava] = useState("");
  // "Reaproveitada · desfazer" pede confirmação: desfazer devolve a peça à
  // régua do arquivo final e da produção.
  const [desfazerReuseId, setDesfazerReuseId] = useState<string | null>(null);

  // Estado inicial vindo da URL — ver o bloco de comentário acima do componente.
  const urlInicial = useMemo(() => filtrosRevisaoDaURL(window.location.search), []);
  const [searchTerm, setSearchTerm] = useState(urlInicial.busca);
  const [eventFilter, setEventFilter] = useState<string[]>(urlInicial.eventos);
  const [itemTypeFilter, setItemTypeFilter] = useState<string[]>(urlInicial.tipos);
  const searchRef = useRef<HTMLInputElement>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const isMobile = useIsMobile();
  /* PARA ONDE A PEÇA VOLTA — as duas opções lado a lado, com a consequência
     escrita em cada uma. Não é um <select>: são duas escolhas e a diferença
     entre elas custa caro (uma joga fora a aprovação do patrocinador), então
     as duas ficam à vista sem precisar abrir nada.
     A opção destrutiva NÃO é a padrão e avisa o que perde. */
  const seletorDestino = (
    <div style={{ marginBottom: 12 }}>
      <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.apoio }}>
        O que a Arte precisa refazer?
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {([
          { valor: "finalizacao" as const, titulo: "Só o arquivo final",
            desc: "A arte está certa — a peça volta para a Finalização e a aprovação do patrocinador continua valendo." },
          { valor: "arte" as const, titulo: "A arte inteira",
            desc: "Volta para o começo da Arte. O thumb aprovado é descartado e o patrocinador terá de aprovar de novo." },
        ]).map(op => {
          const ativo = destinoDevolucao === op.valor;
          return (
            <button
              key={op.valor}
              type="button"
              onClick={() => setDestinoDevolucao(op.valor)}
              aria-pressed={ativo}
              data-testid={`destino-${op.valor}`}
              style={{
                textAlign: "left", cursor: "pointer", borderRadius: 8, padding: "9px 11px",
                border: `1.5px solid ${ativo ? T.accentText : T.border}`,
                background: ativo ? TOM.laranja.bg : T.surface,
                display: "flex", gap: 9, alignItems: "flex-start", font: "inherit",
              }}
            >
              <span aria-hidden="true" style={{
                width: 14, height: 14, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                border: `1.5px solid ${ativo ? T.accentText : T.bdark}`,
                background: ativo ? T.accentText : "transparent",
                boxShadow: ativo ? `inset 0 0 0 2.5px ${T.surface}` : "none",
              }} />
              <span style={{ minWidth: 0 }}>
                {/* #c2410c sobre #fff7ed = 4,88:1 ✓ · #57534e sobre branco = 7,03:1 ✓ */}
                <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: ativo ? T.accentText : T.text }}>
                  {op.titulo}
                </span>
                <span style={{ display: "block", fontSize: 11, color: T.apoio, lineHeight: 1.4, marginTop: 1 }}>
                  {op.desc}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  /** Altura dos controles: 44 no toque, 36 no ponteiro. */
  const alturaControle = isMobile ? 44 : 36;

  // ── TABELA OU CARTÕES: decide a LARGURA DA LISTA, não a da janela ──
  // `isMobile` lê a janela. Num tablet de 768–1024 com a barra lateral aberta
  // sobram 512–768px para a lista, e a tabela de layout fixo precisa de ~920:
  // checkbox 96 (48 + 24 de cada lado) + Qtd·Dim·m² 262 + Arquivo 172 + Ações
  // 192 = 722, mais ~200 para a Peça ler alguma coisa. Com menos que isso a
  // Peça colapsava e a tabela ganhava rolagem horizontal — justo o que o dono
  // pediu para não existir (15/09). Os 980 são esses ~920 + o padding de 32 da
  // seção de cada lado. Abaixo deles a lista usa os cartões que o celular já
  // tinha, sem nada novo.
  // Callback ref, e não `useElementSize`: a seção só monta DEPOIS do
  // carregamento (há retornos antecipados acima dela), e o efeito de montagem
  // daquele hook rodaria com a ref ainda vazia e nunca mais observaria.
  const [larguraLista, setLarguraLista] = useState(0);
  const observadorLista = useRef<ResizeObserver | null>(null);
  const listaRef = useCallback((el: HTMLElement | null) => {
    observadorLista.current?.disconnect();
    observadorLista.current = null;
    if (!el) return;
    const medir = () => {
      const w = el.getBoundingClientRect().width;
      // Ignora sub-pixel: barra de rolagem aparecendo não re-renderiza a tela.
      setLarguraLista(prev => (Math.abs(prev - w) < 1 ? prev : w));
    };
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    observadorLista.current = ro;
  }, []);
  const listaEmCartoes = isMobile || (larguraLista > 0 && larguraLista < 980);
  // A tela ja exigia motivo NAO VAZIO; o servidor agora exige 10 caracteres em
  // TODAS as portas de devolucao (lerMotivoDevolucao, routes/items.ts). Uma
  // regua so, nos dois lados: senao o botao habilita e a requisicao volta 400.
  const MOTIVO_MIN = 10;
  // A mesma barra invertida que faltava no servidor. Aqui ela não corrompia
  // texto, só a CONTA: um motivo cheio de "s" era medido como mais curto do
  // que é, e o botão de enviar ficava desabilitado sem explicar por quê.
  const motivoCurto = (t: string) => t.trim().replace(/\s+/g, " ").length < MOTIVO_MIN;
  const avisoMotivoCurto = `Explique o motivo em pelo menos ${MOTIVO_MIN} caracteres — a Arte precisa saber o que corrigir.`;
  // O botão travado dizia o porquê só no `title` — que não aparece em botão
  // desabilitado nem no toque. A conta fica à vista enquanto se digita, com a
  // mesma régua de `motivoCurto`.
  const contadorDoMotivo = (t: string) => {
    const falta = Math.max(0, MOTIVO_MIN - t.trim().replace(/\s+/g, " ").length);
    return (
      <p aria-live="polite" style={{ margin: "4px 0 0", fontSize: 12, lineHeight: 1.4, color: falta > 0 ? TOM.alerta.text : TOM.esmeralda.text }}>
        {falta > 0 ? `Faltam ${falta} ${falta === 1 ? "caractere" : "caracteres"} — a Arte precisa saber o que corrigir.` : "Motivo pronto."}
      </p>
    );
  };
  const { data: itensDoServidor = [], isLoading: itemsLoading, isError: itemsError, refetch: refetchItems } = useQuery<any[]>({ queryKey: CHAVE_DA_REVISAO });
  // BOOK COMPLETO fica de fora: é o trâmite do Atendimento, não uma peça (ver shared/fluxo-peca).
  const items = useMemo(() => (itensDoServidor as any[]).filter((i: any) => !ehBookCompleto(i)), [itensDoServidor]);
  const { data: events = [], isLoading: eventsLoading, isError: eventsError, refetch: refetchEvents } = useQuery<any[]>({ queryKey: ["/api/events"] });
  // Histórico da peça: só busca com o modal aberto, já filtrado e limitado no
  // servidor. A chave em duas partes ("/api/audit-logs" + querystring) mantém
  // o prefixo casando com as invalidateQueries(["/api/audit-logs"]) das
  // mutations (o queryFn junta as partes com "/").
  const { data: itemAuditLogs = [], isLoading: historicoCarregando } = useQuery<any[]>({
    queryKey: ["/api/audit-logs", `?entityId=${selectedItem?.id}&limit=8`],
    enabled: modalOpen && !!selectedItem?.id,
  });
  const { data: standardItems = [] } = useQuery<any[]>({ queryKey: ['/api/standard-items'] });
  const typeToGroup = useMemo(() => {
    const map: Record<string, string> = {};
    (standardItems as any[]).forEach((s: any) => { if (s.group) map[s.name] = s.group; });
    return map;
  }, [standardItems]);

  /**
   * DISPARAR O AVISO DA FILA AGORA.
   *
   * O aviso sai sozinho às 10h, 15h e 18h. Este botão existe porque o e-mail
   * SAI do sistema: o conector só autentica dentro do ambiente publicado, então
   * não há como verificar de fora que o canal está de pé — sem ele, a única
   * forma de descobrir que o aviso parou seria ninguém receber nada e ninguém
   * estranhar.
   *
   * Só admin, pela mesma régua do reenvio do book: um clique manda e-mail de
   * verdade para outras pessoas.
   */
  const avisarRevisaoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/revisao/digest/enviar", {});
      return await res.json();
    },
    onSuccess: (r: any) => {
      // O servidor devolve a frase pronta — inclusive quando NÃO enviou (fila
      // vazia, remetente ausente). "Enviado" seria mentira nesses casos, e o
      // ponto do botão é justamente saber o que aconteceu.
      toast({
        title: r?.status === "enviado" ? "Aviso enviado" : "Aviso não enviado",
        description: r?.mensagem ?? "Sem resposta do servidor.",
        variant: r?.status === "enviado" ? undefined : "destructive",
      });
    },
    onError: (error: any) => toast({ title: "Erro ao disparar o aviso", description: error.message, variant: "destructive" }),
  });

  const updateQuantityMutation = useMutation({
    // apiRequest devolve o Response cru — sem o json() o "updatedItem" era o
    // Response e updatedItem.quantity saía sempre undefined.
    mutationFn: async ({ itemId, quantity }: { itemId: string; quantity: number }) => {
      const res = await apiRequest("PATCH", `/api/items/${itemId}`, { quantity });
      return await res.json();
    },
    onSuccess: (updatedItem: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItem((prev: any) => prev ? { ...prev, quantity: updatedItem.quantity ?? quantityValue } : prev);
      setEditingQuantity(false);
      toast({ title: "Quantidade atualizada", description: `Nova quantidade: ${updatedItem.quantity ?? quantityValue}x` });
    },
    // Rede de segurança do modelo de COMPLEMENTO. Esta tela só lista peças em
    // "Aguardando Revisão Final" — ou seja, pré-produção, onde editar a
    // quantidade continua sendo o gesto certo. Mas a peça pode ter sido
    // liberada e produzida em outra aba enquanto o modal estava aberto: aí o
    // servidor recusa o aumento (409 USE_COMPLEMENT) e a resposta honesta é
    // abrir o fluxo do complemento, já com a diferença que ELE calculou — não
    // despejar um JSON vermelho na tela. QUANTITY_FLOOR é o mesmo raciocínio
    // para a redução abaixo do que já existe fisicamente.
    onError: (error: any) => {
      const { message, code, data } = parseApiError(error);

      if (code === "USE_COMPLEMENT") {
        const idAlvo = data?.itemId ?? selectedItem?.id;
        const daFila = (items as any[]).find((i: any) => i.id === idAlvo) ?? selectedItem;
        setEditingQuantity(false);
        toast({
          title: "Peça em produção",
          description: 'Use "Aumentar quantidade" — o aumento vira uma peça complementar.',
        });
        const abrirComplemento = (alvo: any) => {
          if (!alvo) return;
          // `suggestedComplement` só existe quando o corpo JSON chega inteiro;
          // no caminho normal (apiRequest desembrulha o erro em texto) a
          // diferença é a que o próprio modal tentou salvar menos a atual.
          const atual = Number(alvo?.quantity);
          setComplementSugestao(
            Number(data?.suggestedComplement)
              || (Number.isFinite(atual) && quantityValue > atual ? quantityValue - atual : null),
          );
          setComplementItem(alvo);
        };
        // A peça já saiu desta fila (está em produção): a lista recortada não
        // a tem mais, e o complemento precisa do status, da quantidade e dos
        // complementos de AGORA — era o que o acervo inteiro dava. Sem id, ou
        // se a busca falhar, segue com a peça que o modal mostrava, como antes.
        // Book completo nunca entrava em `items`: mesma régua aqui.
        if (!idAlvo) { abrirComplemento(daFila); return; }
        void buscarPecaAtual(idAlvo).then((atual) =>
          abrirComplemento(atual && !ehBookCompleto(atual) ? atual : daFila));
        return;
      }

      if (code === "QUANTITY_FLOOR") {
        toast({
          title: "Redução não permitida",
          description: `Já há ${data?.minimum ?? "?"} un. produzidas/conferidas/entregues. Mínimo: ${data?.minimum ?? "?"}.`,
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Erro ao atualizar quantidade", description: message, variant: "destructive" });
    },
  });

  const updateObservationsMutation = useMutation({
    mutationFn: async ({ itemId, observations }: { itemId: string; observations: string }) =>
      await apiRequest("PATCH", `/api/items/${itemId}`, { observations }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItem((prev: any) => prev ? { ...prev, observations: cardObservations } : prev);
      toast({ title: "Observação salva" });
    },
    onError: (error: any) => toast({ title: "Erro ao salvar observação", description: parseApiError(error).message, variant: "destructive" }),
  });

  const creatorReviewMutation = useMutation({
    // `corpo`: vazio = a sugestão do estoque (o servidor aplica o que a Gráfica
    // atendeu); { reuseQty, peloEstoque } = "usar menos do que o estoque atendeu".
    // `trava`: o que fazer com a trava da Solicitação ao liberar (o servidor
    // recusa peça travada sem essa escolha).
    mutationFn: async ({ itemId, corpo, trava }: { itemId: string; corpo?: { reuseQty: number; peloEstoque: true }; trava?: "destravar" | "manter" }) =>
      await apiRequest("PATCH", `/api/items/${itemId}/creator-review`, {
        ...(corpo ?? {}),
        ...(trava === "destravar" ? { destravar: true } : trava === "manter" ? { manterTrava: true } : {}),
      }),
    onSuccess: (_res, { itemId, corpo, trava }) => {
      queryClient.invalidateQueries({ queryKey: CHAVE_DO_ESTOQUE_NA_REVISAO });
      queryClient.invalidateQueries({ queryKey: chaveDaConsulta(itemId) });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setReleaseConfirmOpen(false);
      const liberada = (items as any[]).find((i: any) => i.id === itemId);
      const id = liberada?.displayId ?? "A peça";
      // Avança para a peça seguinte em vez de fechar. Só fecha na última —
      // e é aí que o FreezeWhileClosing continua valendo, porque é aí que o
      // `selectedItem` de fato some com o modal em fade.
      if (!marcarAvanco()) { setModalOpen(false); setSelectedItem(null); }
      const avancou = proximaAposDecidir.current !== null;
      // A resposta do estoque entrou nesta liberação: o aviso não pode dizer
      // só "Pronto para Produção" para uma peça que veio coberta pelo estoque.
      const linhaDoEstoque = estoquePorPeca.get(itemId);
      const doEstoque = liberada && !liberada.isReuse && linhaDoEstoque && estoqueRespondeu(linhaDoEstoque)
        ? propostaDaLiberacao(Number(liberada.quantity) || 0, linhaDoEstoque, corpo ? corpo.reuseQty : null)
        : null;
      // O aviso responde "foi para a Gráfica?" (o destino e o status que ela
      // vai ver lá) e "e agora?" (a ficha já trocou de peça, ou a fila acabou).
      // "A Arte foi notificada" dizia a verdade, mas respondia outra pergunta.
      // O recado (observação) sai da vista junto com a peça: a Revisão Final só
      // lista o que ainda está nela. O atalho leva à peça na fila da Gráfica,
      // onde o recado aparece — e a trilha da ficha guarda o texto.
      toast({
        title: "Liberada para a Gráfica",
        action: <ToastAction altText="Ver a peça na fila da Gráfica" onClick={() => { window.location.href = `/grafica?item=${itemId}`; }}>Ver na Gráfica</ToastAction>,
        description: `${id} ${doEstoque && doEstoque.reaproveitadas > 0
          ? (doEstoque.pulaProducao
            ? `foi direto para Impresso / Acabamento: as ${doEstoque.reaproveitadas} un. vêm do estoque`
            : `entrou na fila da Gráfica com ${doEstoque.reaproveitadas} un. do estoque e ${doEstoque.aProduzir} a produzir`)
          : destinoAoLiberar(liberada)}.${trava === "destravar" ? " A trava foi retirada." : trava === "manter" ? " Continua travada: a Gráfica vê, mas não consegue fazê-la andar." : ""} ${avancou ? "A próxima peça da fila já está aberta." : "Era a última desta fila."}`,
      });
    },
    onError: (error: any) => {
      const { message, code } = parseApiError(error);
      // Travada por outra pessoa enquanto a ficha estava aberta: a lista
      // atualiza e a confirmação passa a oferecer as duas escolhas.
      if (code === CODIGO_PECA_TRAVADA) queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({ title: "Não foi possível liberar", description: message, variant: "destructive" });
    },
  });

  const bulkReleaseMutation = useMutation({
    // LIBERAÇÃO não tem rota em lote: usa a individual (idempotente), de 5 em
    // 5, e guarda o MOTIVO de cada recusa por id. Só vão as PRONTAS (ver
    // `loteDeLiberar`): peça sem arquivo final ou travada fica fora, marcada
    // na linha com o porquê, em vez de ir e voltar com erro.
    mutationFn: async ({ prontas, deFora }: { prontas: string[]; deFora: Record<string, string> }) => {
      const falhas = await emLotes(prontas, (id) => apiRequest("PATCH", `/api/items/${id}/creator-review`, {}));
      return { total: prontas.length, released: prontas.length - Object.keys(falhas).length, falhas, deFora };
    },
    onSuccess: ({ total, released, falhas, deFora }, { prontas }) => {
      queryClient.invalidateQueries({ queryKey: CHAVE_DO_ESTOQUE_NA_REVISAO });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      anotarFalhas({ ...deFora, ...falhas }, prontas);
      // Continua marcado o que ainda pede ação: o que falhou, o que ficou de
      // fora por não estar pronto e as de evento finalizado (ver `selecaoLote`).
      setSelectedItemIds(prev => {
        const foi = new Set(prontas);
        return new Set(Array.from(prev).filter(id => !!falhas[id] || !foi.has(id)));
      });
      setBulkReleaseConfirmOpen(false);
      const failed = Object.keys(falhas).length;
      const fora = Object.keys(deFora).length;
      if (failed > 0) {
        toast({
          title: "Liberação parcial",
          description: `${released} de ${total} foram para a fila da Gráfica. ${failed} não ${failed === 1 ? "passou" : "passaram"} — o motivo está escrito na linha${failed === 1 ? "" : " de cada uma"}, que continua marcada.`,
          variant: "destructive",
        });
      } else {
        // Reaproveitamento total vai para Impresso / Acabamento, não para a impressão
        // (mesmo critério do servidor — ver `reaproveitamentoTotal`).
        const reaproveitadas = prontas.filter(id => reaproveitamentoTotal(pendingItems.find((i: any) => i.id === id))).length;
        const extra = reaproveitadas > 0
          ? ` ${reaproveitadas === released ? (released === 1 ? "Era" : "Todas eram") : (reaproveitadas === 1 ? "1 era" : `${reaproveitadas} eram`)} de reaproveitamento total e ${reaproveitadas === 1 ? "foi" : "foram"} direto para Impresso / Acabamento.`
          : "";
        const deForaTxt = fora > 0 ? ` ${fora} ${fora === 1 ? "não estava pronta e continua marcada" : "não estavam prontas e continuam marcadas"}, com o motivo na linha.` : "";
        toast({ title: "Liberadas para a Gráfica", description: `${released} ${released === 1 ? "peça saiu" : "peças saíram"} da Revisão Final para a fila da Gráfica.${extra}${deForaTxt}` });
      }
    },
    onError: (error: any) => toast({ title: "Não foi possível liberar as peças", description: parseApiError(error).message, variant: "destructive" }),
  });

  const returnToArteMutation = useMutation({
    mutationFn: async (payload: { itemId: string; notes: string; destino: string }) => {
      // PATCH, não POST: a rota é PATCH e o método errado caía no fallback do
      // SPA, que responde 200 com HTML. A tela dava "devolvida com sucesso" e o
      // servidor nunca recebia nada — a peça continuava na fila de revisão.
      const res = await apiRequest("PATCH", `/api/items/${payload.itemId}/return-to-arte`, { notes: payload.notes, destino: payload.destino });
      return await res.json().catch(() => ({}));
    },
    onSuccess: (resposta: any, payload) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setReturnConfirmOpen(false); setReturnObservations("");
      if (!marcarAvanco()) { setModalOpen(false); setSelectedItem(null); }
      const avancou = proximaAposDecidir.current !== null;
      // O aviso diz para onde ela FOI — o destino que o SERVIDOR aplicou (o
      // molde volta sempre para o começo da Arte, seja qual for o pedido) — e
      // QUEM recebe: a Arte, avisada com o motivo.
      const destino = resposta?.destinoDevolvido ?? payload.destino;
      const molde = ehMolde(resposta) || ehMolde(pendingItems.find((i: any) => i.id === payload.itemId));
      toast({
        title: "Devolvida para a Arte",
        description: (molde
          ? "O molde voltou para o começo da Arte, com o thumb dele."
          : destino === "arte"
          ? "Voltou para o começo da Arte — o patrocinador terá de aprovar de novo."
          : "Voltou para a Finalização — a aprovação do patrocinador continua valendo.")
          + ` A Arte foi avisada com o seu motivo.${avancou ? " A próxima peça já está aberta." : ""}`,
      });
    },
    onError: (error: any) => toast({ title: "Não foi possível devolver", description: parseApiError(error).message, variant: "destructive" }),
  });

  const bulkReturnMutation = useMutation({
    // Uma chamada só: a rota de lote responde { success, errors: [{itemId,
    // error}], items, destinos } — o motivo de cada recusa vai para a linha.
    mutationFn: async (payload: { ids: string[]; notes: string; destino: string }) => {
      const res = await apiRequest("PATCH", "/api/items/bulk-return-to-arte", { itemIds: payload.ids, notes: payload.notes, destino: payload.destino });
      const result: { success: number; errors?: Array<{ itemId: string; error: string }> | number; failedItemIds?: string[]; destinos?: Record<string, string> } = await res.json();
      const falhas: Record<string, string> = {};
      if (Array.isArray(result.errors)) for (const e of result.errors) falhas[e.itemId] = e.error;
      else for (const id of result.failedItemIds ?? []) falhas[id] = "O servidor recusou esta peça.";
      return { total: payload.ids.length, falhas, destinos: result.destinos ?? {} };
    },
    onSuccess: ({ total, falhas, destinos }, { ids: enviados }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      anotarFalhas(falhas, enviados);
      // Falha parcial: mantém selecionado só o que falhou, para a pessoa
      // tentar de novo sem re-marcar tudo — e mantém também as de evento
      // finalizado, que nem chegaram a ser enviadas (ver `selecaoLote`).
      setSelectedItemIds(prev => {
        const foi = new Set(enviados);
        return new Set(Array.from(prev).filter(id => !!falhas[id] || !foi.has(id)));
      });
      setBulkReturnConfirmOpen(false); setBulkReturnObservations("");
      const failed = Object.keys(falhas).length;
      const ok = total - failed;
      // Para onde foram DE FATO (o servidor diz por peça): molde volta sempre
      // para o começo da Arte, mesmo com "só o arquivo final" escolhido.
      const paraArte = Object.values(destinos).filter(d => d === "arte").length;
      const paraFinalizacao = Object.values(destinos).filter(d => d === "finalizacao").length;
      const onde = paraArte > 0 && paraFinalizacao > 0
        ? `${paraFinalizacao} para a Finalização e ${paraArte} para o começo da Arte`
        : paraArte > 0 ? "o começo da Arte" : "a Finalização";
      if (failed > 0) {
        toast({ title: "Devolução parcial", description: `${ok} ${ok === 1 ? "voltou" : "voltaram"} para a Arte; ${failed} não ${failed === 1 ? "passou e continua marcada" : "passaram e continuam marcadas"} — o motivo está na linha.`, variant: "destructive" });
      } else {
        toast({ title: "Devolvidas para a Arte", description: `${ok} ${ok === 1 ? "peça voltou" : "peças voltaram"} ${paraArte > 0 && paraFinalizacao > 0 ? `(${onde})` : `para ${onde}`}. A Arte foi avisada com o motivo.` });
      }
    },
    onError: (error: any) => toast({ title: "Não foi possível devolver as peças", description: parseApiError(error).message, variant: "destructive" }),
  });

  const bulkReuseMutation = useMutation({
    // REAPROVEITAR em lote (pedido do dono, 25/08): o mesmo par de chamadas do
    // reaproveitamento TOTAL individual (PATCH isReuse + creator-review), peça
    // a peça, de 5 em 5 — rota de lote não existe. O PARCIAL continua só no
    // ícone da linha: quantidade reaproveitada é decisão de UMA peça.
    mutationFn: async (itemIds: string[]) => {
      const semLiberar: Record<string, string> = {};
      const falhas = await emLotes(itemIds, async (id) => {
        // Reaproveitamento TOTAL: o servidor exige a quantidade junto com a marcação.
        const qtd = (items as any[]).find((i: any) => i.id === id)?.quantity;
        await apiRequest("PATCH", `/api/items/${id}`, { isReuse: true, reuseQty: qtd });
        // Marcou mas não liberou é MEIO caminho, não falha igual: a marcação
        // existe, e o "Liberar" da barra resolve o resto — com o motivo.
        try { await apiRequest("PATCH", `/api/items/${id}/creator-review`, {}); }
        catch (e) { semLiberar[id] = `Marcada, mas não liberada: ${parseApiError(e).message}`; }
      });
      return { total: itemIds.length, falhas, semLiberar };
    },
    onSuccess: ({ total, falhas, semLiberar }, enviados) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      anotarFalhas({ ...semLiberar, ...falhas }, enviados);
      // Continua selecionado o que ainda pede ação: o que falhou (tentar de
      // novo) e o que marcou sem liberar (o "Liberar N" da barra fecha) — e as
      // de evento finalizado, que nem foram enviadas (ver `selecaoLote`).
      setSelectedItemIds(prev => {
        const foi = new Set(enviados);
        return new Set(Array.from(prev).filter(id => !!falhas[id] || !!semLiberar[id] || !foi.has(id)));
      });
      setBulkReuseConfirmOpen(false);
      const nFalhas = Object.keys(falhas).length, nSem = Object.keys(semLiberar).length;
      const ok = total - nFalhas - nSem;
      if (nFalhas === 0 && nSem === 0) {
        toast({ title: "Reaproveitamento confirmado", description: `${ok} peça(s) enviada(s) à Gráfica como produzida(s).` });
      } else if (nFalhas === 0) {
        toast({
          title: "Marcadas, mas nem todas liberadas",
          description: `${ok} enviada(s) à Gráfica; ${nSem} marcada(s) sem liberar — continuam selecionadas, com o motivo na linha.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Reaproveitamento parcial",
          description: `${ok} de ${total} enviada(s). ${nFalhas} falhou(aram)${nSem > 0 ? ` e ${nSem} marcou sem liberar` : ""} — continuam selecionadas, com o motivo na linha.`,
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => toast({ title: "Não foi possível reaproveitar", description: parseApiError(error).message, variant: "destructive" }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => await apiRequest("DELETE", `/api/items/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setDeleteConfirmItemId(null);
      toast({ title: "Peça excluída", description: "A peça foi removida com sucesso." });
    },
    onError: (error: any) => toast({ title: "Erro ao excluir", description: parseApiError(error).message, variant: "destructive" }),
  });

  // Diálogo de reaproveitamento (total ou parcial)
  const [reuseDialogItemId, setReuseDialogItemId] = useState<string | null>(null);
  const [partialReuseQty, setPartialReuseQty] = useState(1);

  // URL espelhando o recorte, com 300ms de atraso (a régua da casa pede ≥200):
  // sem o debounce, cada tecla da busca escreveria um replaceState — o padrão
  // que já derrubou a árvore React no Safari em outra tela. `replaceState` e
  // não `pushState`: filtrar não é navegar, e o Voltar tem de sair da tela em
  // vez de desfazer letra por letra.
  useEffect(() => {
    const t = setTimeout(() => {
      const qs = filtrosRevisaoParaQuery(
        window.location.search,
        { busca: searchTerm, eventos: eventFilter, tipos: itemTypeFilter },
      );
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, eventFilter, itemTypeFilter]);

  // Voltar/avançar do navegador reidrata o recorte. Sem isto o back trocava a
  // URL e a tela continuava com os filtros novos — a URL passaria a mentir.
  useEffect(() => {
    const onPop = () => {
      const f = filtrosRevisaoDaURL(window.location.search);
      setSearchTerm(f.busca);
      setEventFilter(f.eventos);
      setItemTypeFilter(f.tipos);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Atalho "/" foca a busca (paridade com eventos, calendário, histórico,
  // registros, painel e gestão de prazos — era a tela que faltava).
  // Com um diálogo aberto o atalho SE CALA: o FocusScope do Radix puxaria o
  // foco de volta na hora e o efeito visível seria só um pisca-pisca.
  const algumDialogoAberto = modalOpen || releaseConfirmOpen || returnConfirmOpen
    || bulkReleaseConfirmOpen || bulkReturnConfirmOpen || bulkReuseConfirmOpen
    || deleteConfirmItemId !== null || complementItem !== null || reuseDialogItemId !== null
    || travandoItem !== null || desfazerReuseId !== null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || algumDialogoAberto) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [algumDialogoAberto]);

  const toggleReuseMutation = useMutation({
    mutationFn: async ({ itemId, isReuse }: { itemId: string; isReuse: boolean }) => {
      // Marcar é o reaproveitamento TOTAL (a quantidade vai junto, o servidor exige);
      // desmarcar zera.
      const qtd = (items as any[]).find((i: any) => i.id === itemId)?.quantity;
      await apiRequest("PATCH", `/api/items/${itemId}`, isReuse ? { isReuse, reuseQty: qtd } : { isReuse, reuseQty: 0 });
      // Ao marcar reaproveitamento, libera automaticamente para Gráfica (status → produced)
      if (isReuse) {
        try {
          await apiRequest("PATCH", `/api/items/${itemId}/creator-review`, {});
        } catch (e) {
          // O MOTIVO do servidor vai para o aviso (e para a linha): "falhou"
          // sozinho não dizia se era arquivo, trava ou evento finalizado.
          return { statusAdvanced: false, erro: parseApiError(e).message };
        }
      }
      return { statusAdvanced: true };
    },
    onSuccess: (result, { itemId, isReuse }) => {
      setDesfazerReuseId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      const advanced = (result as any)?.statusAdvanced !== false;
      if (isReuse && !advanced) {
        // A marcação gravou mas o creator-review falhou: nada de prometer
        // atualização automática — a liberação precisa ser feita à mão.
        const erro = (result as any)?.erro as string | undefined;
        if (erro) anotarFalhas({ [itemId]: `Marcada, mas não liberada: ${erro}` });
        toast({
          title: "Reaproveitamento marcado, mas não liberado",
          description: `${erro ?? "A liberação falhou."} Abra a peça e libere quando o motivo estiver resolvido.`,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: isReuse ? "Reaproveitamento confirmado" : "Marcação removida",
        description: isReuse
          ? "Peça enviada diretamente para a Gráfica como produzida."
          : "A peça volta ao fluxo normal: para liberar, precisa do arquivo final.",
      });
    },
    onError: (error: any) => { setDesfazerReuseId(null); toast({ title: "Não foi possível salvar o reaproveitamento", description: parseApiError(error).message, variant: "destructive" }); },
  });

  // Reaproveitamento parcial: define reuseQty e avança via creator-review
  const partialReuseMutation = useMutation({
    mutationFn: async ({ itemId, reuseQty }: { itemId: string; reuseQty: number }) => {
      // creator-review aceita reuseQty no body para registrar o parcial e
      // avança para ready_for_production (as demais unidades ainda vão para produção)
      await apiRequest("PATCH", `/api/items/${itemId}/creator-review`, { reuseQty });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setReuseDialogItemId(null);
      toast({
        title: "Reaproveitamento parcial confirmado",
        description: "As unidades reaproveitadas foram registradas. O restante segue para produção.",
      });
    },
    onError: (error: any) => toast({ title: "Não foi possível reaproveitar em parte", description: parseApiError(error).message, variant: "destructive" }),
  });

  // TRAVAR / DESTRAVAR pela ficha — a mesma trava que a Solicitação põe na
  // Gráfica (rotas /travar e /destravar). A ficha passa a mostrar a peça como
  // o servidor a devolveu, sem esperar a lista recarregar.
  const travarMutation = useMutation({
    mutationFn: async ({ itemId, motivo }: { itemId: string; motivo: string; displayId?: string }) => {
      const res = await apiRequest("POST", `/api/items/${itemId}/travar`, { motivo });
      return await res.json();
    },
    onSuccess: (item: any, v) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItem((prev: any) => (prev?.id === v.itemId ? { ...prev, ...item } : prev));
      setTravandoItem(null); setMotivoDaTrava("");
      toast({ title: `${v.displayId ?? "Peça"} travada`, description: `Mesmo liberada, a Gráfica não consegue fazê-la andar até alguém destravar: ${v.motivo}` });
    },
    onError: (error: any) => toast({ title: "Não foi possível travar", description: parseApiError(error).message, variant: "destructive" }),
  });
  const destravarMutation = useMutation({
    mutationFn: async ({ itemId }: { itemId: string; displayId?: string }) => {
      const res = await apiRequest("POST", `/api/items/${itemId}/destravar`, {});
      return await res.json();
    },
    onSuccess: (item: any, v) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItem((prev: any) => (prev?.id === v.itemId ? { ...prev, ...item } : prev));
      toast({ title: `${v.displayId ?? "Peça"} destravada` });
    },
    onError: (error: any) => toast({ title: "Não foi possível destravar", description: parseApiError(error).message, variant: "destructive" }),
  });
  const motivoDaTravaLido = lerMotivo(motivoDaTrava);

  // ── Evento FINALIZADO CONTINUA NESTA FILA ─────────────────────────────────
  // Regra do dono (17/08): "os eventos finalizados devem aparecer ainda na
  // Revisão e Gráfica". Esta tela filtrava as peças de evento encerrado à mão
  // ou já realizado; não filtra mais.
  //
  // POR QUE AQUI VOLTA E EM ARTE/ATENDIMENTO/VINCULAR CONTINUA ESCONDIDO — a
  // pergunta que alguém vai fazer olhando as cinco filas. A guarda do servidor
  // (server/routes/eventoFinalizado.ts) barra o que faz o trabalho ANDAR e
  // permite o que ARRUMA A CASA; das exceções que ela abriu, CONFERIR e
  // REGISTRAR ENTREGA são da Gráfica e EXCLUIR PEÇA é daqui. Esconder a peça
  // tornava impossível executar o que o servidor autoriza: a lista de um evento
  // acabado ficava com lixo preso, sem tela nenhuma onde apagá-lo. E há a razão
  // de leitura, que vale tanto quanto: a Revisão é onde se vê o que ficou por
  // revisar, e um pendente que some não vira resolvido — vira invisível.
  //
  // A CONTRAPARTIDA, obrigatória: aqui quase TUDO é barrado. Liberar, devolver,
  // reaproveitar, mexer na quantidade e salvar observação passam todos pela
  // guarda. Por isso o selo na linha é ainda mais necessário do que na Gráfica
  // — e por isso o lote precisa separar peça viva de peça morta (ver
  // `selecaoLote`, abaixo) em vez de mandar tudo e colher erro.
  //
  // `item.event` vem CRU do storage: traz `status` ("closed") e `startDate`.
  const hojeBusinessMs = todayBusinessMs();
  const pendingItems = useMemo(
    // KIT (dono, 15/09): a Solicitação da Arena não revisa peça do Kit — ela
    // nem aparece aqui. O usuário do Kit só recebe as do Kit; o admin vê tudo.
    () => items.filter(item => item.status === REVIEW_STATUS
      && !(user?.role === "solicitacao" && !user?.kit && item.kitRemessaId)),
    [items, user?.role, user?.kit],
  );

  // Um selo por peça, calculado uma vez. `null` = evento em jogo, linha normal.
  const selosPorItem = useMemo(() => {
    const m = new Map<string, SeloPecaEventoFinalizado>();
    for (const item of pendingItems) {
      const s = seloPecaEventoFinalizado(item.event, hojeBusinessMs);
      if (s) m.set(item.id, s);
    }
    return m;
  }, [pendingItems, hojeBusinessMs]);
  const seloDoItem = (item: any): SeloPecaEventoFinalizado | null =>
    (item ? selosPorItem.get(item.id) : undefined) ?? null;

  // A TRAVA na linha: sem ela, "Liberar" numa peça travada só mostrava a
  // escolha dentro da ficha — e o lote a deixava de fora sem dizer por quê.
  const seloTravaNaLinha = (item: any, onde: "tabela" | "cartao") => pecaTravada(item) ? (
    <span
      data-testid={`badge-travada-${onde}-${item.id}`}
      title={fraseDaTrava(item)}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%", fontSize: 11, fontWeight: 700, color: TOM.perigo.text, backgroundColor: TOM.perigo.bg, border: `1px solid ${TOM.perigo.border}`, borderRadius: 999, padding: "1px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0 }}
    >
      <Lock aria-hidden="true" style={{ width: 11, height: 11, flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{seloDaTrava(item)}</span>
    </span>
  ) : null;
  // O MOTIVO da última recusa num lote, escrito na linha (#b91c1c = 6,5:1).
  const falhaNaLinha = (item: any) => falhasPorId[item.id] ? (
    <p role="status" data-testid={`falha-lote-${item.id}`} style={{ flexBasis: "100%", margin: "4px 0 0", fontSize: 12, lineHeight: 1.4, color: TOM.perigo.text, fontWeight: 600, overflowWrap: "anywhere" }}>
      {falhasPorId[item.id]}
    </p>
  ) : null;
  // Desfazer o reaproveitamento pede confirmação (ver o diálogo no fim).
  const desfazendoReuse = (id: string) => toggleReuseMutation.isPending && toggleReuseMutation.variables?.itemId === id && toggleReuseMutation.variables?.isReuse === false;

  // ── O RECORTE, UMA FUNÇÃO SÓ ──────────────────────────────────────────────
  // A INVARIANTE, e é ela que alguém quebra sem perceber ao acrescentar um
  // filtro: FACETA E LISTA SAEM DO MESMO POOL. A lista chama isto sem
  // `excluir`; cada dropdown chama com a PRÓPRIA dimensão excluída, sobre o
  // mesmo `pendingItems`. Assim o pool da faceta é, por construção, um
  // superconjunto da lista que difere só naquele filtro — a faceta nunca
  // oferece menos do que a tela mostra (evento visível na lista e ausente do
  // menu) nem mais do que ela entrega (opção que devolve lista vazia).
  //
  // Era exatamente aqui que estava o furo: as duas facetas ignoravam a BUSCA.
  // Digitar "banner" encolhia a lista e os dropdowns continuavam prometendo o
  // número de antes — "Evento X · 12" sobre uma lista de 2. É o mesmo defeito
  // que a Gráfica já tinha corrigido em lib/grafica-filtros.
  //
  // Busca sem acento (`normalizarBusca`): "so quero" acha "SÓ QUERO PEDALAR SP".
  const casaRecorte = (item: any, excluir?: 'evento' | 'tipo' | 'sem-arquivo' | 'evento-finalizado' | 'estoque'): boolean => {
    const q = normalizarBusca(searchTerm);
    if (q &&
        !normalizarBusca(item.type).includes(q) &&
        !normalizarBusca(item.description).includes(q) &&
        !normalizarBusca(item.displayId).includes(q) &&
        !normalizarBusca(item.event?.name).includes(q)) return false;
    if (excluir !== 'evento' && eventFilter.length > 0 && !eventFilter.includes(item.eventId)) return false;
    if (excluir !== 'tipo' && itemTypeFilter.length > 0 && !itemTypeFilter.includes(item.type)) return false;
    if (excluir !== 'sem-arquivo' && soSemArquivo && arquivoFinalOk(item)) return false;
    if (excluir !== 'evento-finalizado' && soEventoFinalizado && !selosPorItem.has(item.id)) return false;
    if (excluir !== 'estoque' && filtroEstoque === "aguardando" && !aguardandoEstoque(estoquePorPeca.get(item.id))) return false;
    if (excluir !== 'estoque' && filtroEstoque === "respondeu" && !estoqueRespondeu(estoquePorPeca.get(item.id))) return false;
    return true;
  };

  const filteredItems = useMemo(() => pendingItems.filter(item => casaRecorte(item)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingItems, searchTerm, eventFilter, itemTypeFilter, soSemArquivo, soEventoFinalizado, selosPorItem, filtroEstoque, estoquePorPeca]);

  // "Aguardando estoque (N)" e "Estoque respondeu (N)" — mesma disciplina dos
  // outros chips: a contagem sai do pool com a PRÓPRIA dimensão excluída.
  const contagemDoEstoque = useMemo(() => {
    const pool = pendingItems.filter(i => casaRecorte(i, 'estoque'));
    return {
      aguardando: pool.filter(i => aguardandoEstoque(estoquePorPeca.get(i.id))).length,
      respondeu: pool.filter(i => estoqueRespondeu(estoquePorPeca.get(i.id))).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingItems, searchTerm, eventFilter, itemTypeFilter, soSemArquivo, soEventoFinalizado, selosPorItem, estoquePorPeca]);

  // ── OS DOIS CHIPS DE FACETA ─────────────────────────────────────────────
  //
  // Mesma disciplina dos dropdowns: a contagem sai do pool com a PRÓPRIA
  // dimensão excluída, então o número ao lado do chip é exatamente o número de
  // linhas que o clique entrega. Contar sobre `filteredItems` faria o chip
  // ligado mostrar a contagem de si mesmo e o desligado mostrar zero.
  const contagemSemArquivo = useMemo(
    () => pendingItems.filter(i => casaRecorte(i, 'sem-arquivo') && !arquivoFinalOk(i)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingItems, searchTerm, eventFilter, itemTypeFilter, soEventoFinalizado, selosPorItem],
  );
  const contagemEventoFinalizado = useMemo(
    () => pendingItems.filter(i => casaRecorte(i, 'evento-finalizado') && selosPorItem.has(i.id)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingItems, searchTerm, eventFilter, itemTypeFilter, soSemArquivo, selosPorItem],
  );

  // ── A FRASE DE RESOLUÇÃO ────────────────────────────────────────────────
  //
  // A legenda era a descrição da tela — a mesma frase todo dia, que quem chega
  // aqui já sabe. No lugar dela, o que muda a cada visita: quantas dá para
  // decidir AGORA, e quantas ainda dependem da Arte. São 74 peças: a diferença
  // entre "tenho trabalho" e "tenho trabalho em 12 delas" é o dia inteiro.
  const fraseDeResolucao = useMemo(() => {
    const total = pendingItems.length;
    if (total === 0) return "Nenhuma peça aguardando revisão.";
    const semArquivo = pendingItems.filter(i => !arquivoFinalOk(i)).length;
    const prontas = total - semArquivo;
    if (semArquivo === 0) {
      return `${total === 1 ? "A única peça tem" : `Todas as ${total} peças têm`} arquivo final — é só decidir.`;
    }
    if (prontas === 0) {
      return `${semArquivo === 1 ? "A única peça ainda espera" : `As ${semArquivo} peças ainda esperam`} o arquivo final da Arte.`;
    }
    return `${prontas} ${prontas === 1 ? "peça está pronta" : "peças estão prontas"} para decidir; `
         + `${semArquivo} ainda ${semArquivo === 1 ? "espera" : "esperam"} o arquivo final da Arte.`;
  }, [pendingItems]);

  // Seleção sobrevive ao filtro: quando a lista filtrada muda, mantém marcado
  // só o que continua visível — senão "Liberar Selecionadas" agiria sobre
  // peças que a pessoa não está mais vendo.
  useEffect(() => {
    setSelectedItemIds(prev => {
      const visible = new Set(filteredItems.map((i: any) => i.id));
      if (Array.from(prev).every(id => visible.has(id))) return prev;
      return new Set(Array.from(prev).filter(id => visible.has(id)));
    });
  }, [filteredItems]);

  const uniqueItemTypes = useMemo(() => Array.from(new Set(pendingItems.map(i => i.type).filter(Boolean))).sort(), [pendingItems]);
  const eventsWithItems = useMemo(() => {
    const ids = new Set(pendingItems.map(i => i.eventId));
    return events.filter(e => ids.has(e.id));
  }, [pendingItems, events]);

  // Filtros facetados: mesmo `casaRecorte` da lista, só com a própria dimensão
  // excluída (ver a invariante logo acima). Peça de evento finalizado entra
  // aqui como qualquer outra — ela está na lista, então o evento dela tem de
  // estar no menu; do contrário o operador vê a peça na tela e não consegue
  // filtrar por ela.
  const eventFilterOptions = useMemo(() => {
    // Sem dotColor aqui: o EventFilterDropdown em modo múltiplo (o desta tela)
    // não renderiza bolinha — e o mapa local divergia do PRIORITY canônico.
    const byId = new Map(events.map((e: any) => [e.id, e]));
    const map = new Map<string, { value: string; label: string; count: number }>();
    pendingItems
      .filter(i => casaRecorte(i, 'evento'))
      .forEach((i: any) => {
        if (!i.eventId) return;
        const cur = map.get(i.eventId);
        if (cur) cur.count++;
        else {
          const ev: any = byId.get(i.eventId);
          map.set(i.eventId, { value: i.eventId, label: ev?.name || i.event?.name || 'Sem evento', count: 1 });
        }
      });
    return Array.from(map.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingItems, searchTerm, itemTypeFilter, events]);

  const typeFilterOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    pendingItems
      .filter(i => casaRecorte(i, 'tipo'))
      .forEach((i: any) => {
        if (!i.type) return;
        const cur = map.get(i.type);
        if (cur) cur.count++;
        else map.set(i.type, { value: i.type, label: i.type, count: 1 });
      });
    return Array.from(map.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingItems, searchTerm, eventFilter]);

  const itemsByEvent = useMemo(() => {
    const map = new Map<string, any[]>();
    // Dentro do evento: grupo do item padrão, depois tipo.
    const sorted = [...filteredItems].sort((a, b) => {
      // ESTOQUE RESPONDEU sobe (dono, 21/09): a resposta existe para a Revisão
      // Final agir — no meio de 74 peças ela passava batido.
      if (SOLICITACAO_AO_ESTOQUE_ATIVA) {
        const ra = estoqueRespondeu(estoquePorPeca.get(a.id)) ? 0 : 1, rb = estoqueRespondeu(estoquePorPeca.get(b.id)) ? 0 : 1;
        if (ra !== rb) return ra - rb;
      }
      const ga = typeToGroup[a.type] || '', gb = typeToGroup[b.type] || '';
      // type pode vir null do banco — sem o fallback o localeCompare lançava.
      return ga.localeCompare(gb) || (a.type || '').localeCompare(b.type || '');
    });
    sorted.forEach(item => {
      // KIT (15/09): as peças de uma remessa formam bloco próprio, com as
      // datas do Kit no cabeçalho (ver getEventInfo).
      const key = item.kitRemessaId ? `${item.eventId}#kit-${item.kitRemessaId}` : (item.eventId || "__none__");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    // Grupos na ordem da urgência real: saída do caminhão ascendente (quem
    // sai primeiro aparece primeiro), sem data por último, nome desempata.
    // O Kit vem sempre em cima.
    const byId = new Map<string, any>(events.map((e: any) => [e.id, e]));
    for (const [key, lista] of Array.from(map.entries())) {
      if (key.includes("#kit-") && lista[0]?.event) byId.set(key, lista[0].event);
    }
    const entries = Array.from(map.entries()).sort(([idA], [idB]) => {
      const kitA = idA.includes("#kit-"), kitB = idB.includes("#kit-");
      if (kitA !== kitB) return kitA ? -1 : 1;
      const ea: any = byId.get(idA), eb: any = byId.get(idB);
      const ta = ea?.truckDepartureDate ? new Date(ea.truckDepartureDate).getTime() : Infinity;
      const tb = eb?.truckDepartureDate ? new Date(eb.truckDepartureDate).getTime() : Infinity;
      if (ta !== tb) return ta < tb ? -1 : 1;
      return (ea?.name || "").localeCompare(eb?.name || "");
    });
    return new Map(entries);
  }, [filteredItems, typeToGroup, events]);

  // ── LOTE MISTO: a tela conta a história que o servidor conta ──────────────
  // As duas ações em lote (liberar e devolver) são barradas em evento
  // finalizado, e o servidor já sabe lidar com mistura:
  //   · PATCH /api/items/bulk-return-to-arte roda item a item — o barrado entra
  //     na lista de `errors`, os outros passam. 409 do lote inteiro só quando
  //     NADA passou e tudo o que caiu caiu por esta regra (`contadorDeBloqueio`
  //     em server/routes/eventoFinalizado.ts).
  //   · "Liberar" não tem rota de lote: são N chamadas individuais de
  //     creator-review, cada peça de evento acabado devolvendo o seu 409.
  //
  // O que a tela faz com isso: NÃO manda o que já se sabe que vai voltar. As
  // duas alternativas eram piores. Mandar tudo e mostrar "3 com erro" põe a
  // culpa nas peças boas e não diz o motivo (a resposta do lote traz o número
  // de erros, não o texto de cada um). Bloquear o lote inteiro por causa de uma
  // peça pune a seleção grande, que é justamente para o que o lote existe.
  //
  // Então a seleção é SEPARADA em duas: `vivas` seguem, `finalizadas` ficam —
  // e o diálogo de confirmação diz as duas metades ANTES do clique, com o
  // motivo. Só quando a seleção inteira é de evento acabado o botão desabilita,
  // que é o espelho exato do 409 de lote inteiro do servidor.
  const selecaoLote = useMemo(() => {
    const ids = Array.from(selectedItemIds);
    const vivas: string[] = [];
    let encerrado = 0, realizado = 0;
    for (const id of ids) {
      const motivo = selosPorItem.get(id)?.motivo;
      if (motivo === "encerrado") encerrado++;
      else if (motivo === "realizado") realizado++;
      else vivas.push(id);
    }
    return { ids, vivas, encerrado, realizado, finalizadas: encerrado + realizado };
  }, [selectedItemIds, selosPorItem]);

  // As peças vivas da seleção (fora as de evento finalizado).
  const itensDoLoteVivo = selecaoLote.vivas.map(id => pendingItems.find((i: any) => i.id === id));
  // O LOTE leva a sugestão do estoque (dono, 21/09): peça com resposta entra
  // com o que a Gráfica atendeu — o servidor aplica na liberação de cada uma.
  const propostasDoLote = itensDoLoteVivo
    .filter((it: any) => it && !it.isReuse && estoqueRespondeu(estoquePorPeca.get(it.id)))
    .map((it: any) => propostaDaLiberacao(Number(it.quantity) || 0, estoquePorPeca.get(it.id)!));
  const reaproveitadasNoLote = itensDoLoteVivo.filter((it: any) => reaproveitamentoTotal(it)).length;
  // O LOTE DE LIBERAR leva só as PRONTAS. Sem arquivo final o servidor
  // recusa; travada pede a escolha "destravar ou manter", que é da ficha.
  // As de fora ficam marcadas com o motivo na linha, sem ir e voltar.
  const loteDeLiberar = useMemo(() => {
    const prontas: string[] = [];
    const deFora: Record<string, string> = {};
    let nTravadas = 0, nSemArquivo = 0;
    for (const id of selecaoLote.vivas) {
      const it: any = pendingItems.find((i: any) => i.id === id);
      if (!it) continue;
      if (pecaTravada(it)) { nTravadas++; deFora[id] = "Travada — libere pela ficha, escolhendo destravar ou manter a trava."; }
      else if (!prontaParaLiberar(it)) { nSemArquivo++; deFora[id] = "Sem arquivo final da Arte — fica para depois."; }
      else prontas.push(id);
    }
    return { prontas, deFora, nFora: nTravadas + nSemArquivo, nTravadas, nSemArquivo };
  }, [selecaoLote, pendingItems]);
  // Moldes no lote de devolver: voltam sempre para o começo da Arte (com o
  // thumb), qualquer que seja o destino escolhido.
  const moldesNoLote = itensDoLoteVivo.filter((it: any) => ehMolde(it)).length;
  const loteSoDeMoldes = moldesNoLote > 0 && moldesNoLote === selecaoLote.vivas.length;

  /** A frase do "ficam de fora" — uma só, para os dois diálogos de lote. */
  const avisoLoteFinalizadas = (): string | null => {
    const { finalizadas, encerrado, realizado } = selecaoLote;
    if (finalizadas <= 0) return null;
    const partes: string[] = [];
    if (encerrado > 0) partes.push(`${encerrado} em evento encerrado por um administrador`);
    if (realizado > 0) partes.push(`${realizado} em evento cuja data já passou`);
    return `${finalizadas} ${finalizadas === 1 ? "peça fica" : "peças ficam"} de fora`
      + ` (${partes.join(" e ")}): o servidor recusa qualquer ação que faça o trabalho andar num evento finalizado.`;
  };

  // O selo da peça ABERTA no modal. Vem do mesmo mapa da lista — a ficha não
  // pode discordar da linha de onde foi aberta. Deriva de `selectedItem.event`
  // como reserva: o modal sobrevive a uma invalidação que tire a peça da lista.
  const seloSelecionado = selectedItem
    ? (selosPorItem.get(selectedItem.id) ?? seloPecaEventoFinalizado(selectedItem.event, hojeBusinessMs))
    : null;

  // A TRAVA DA PEÇA ABERTA: a versão mais nova entre a da lista (que chega
  // pelo WebSocket quando alguém trava na Gráfica) e a da ficha (que o
  // travar/destravar daqui atualiza na hora).
  const pecaDaFicha: any = (() => {
    if (!selectedItem) return null;
    const daLista: any = pendingItems.find((i: any) => i.id === selectedItem.id);
    if (!daLista) return selectedItem;
    const t = (x: any) => new Date(x?.updatedAt ?? 0).getTime() || 0;
    return t(selectedItem) > t(daLista) ? selectedItem : daLista;
  })();
  const fichaTravada = pecaTravada(pecaDaFicha);

  // Bloco do Kit ("<evento>#kit-<remessa>"): o evento da peça já vem com as
  // datas do Kit (servidor); o nome ganha "· KIT".
  const getEventInfo = (eventId: string): any => {
    if (eventId.includes("#kit-")) {
      const peca: any = filteredItems.find((i: any) => `${i.eventId}#kit-${i.kitRemessaId}` === eventId);
      return peca?.event ? { ...peca.event, name: `${peca.event.name} · KIT` } : undefined;
    }
    return events.find(e => e.id === eventId);
  };

  const toggleItem = (id: string) => setSelectedItemIds(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });
  const toggleAll = () => {
    selectedItemIds.size === filteredItems.length && filteredItems.length > 0
      ? setSelectedItemIds(new Set())
      : setSelectedItemIds(new Set(filteredItems.map(i => i.id)));
  };

  const filaIdx = useMemo(
    () => (selectedItem ? filteredItems.findIndex((i: any) => i.id === selectedItem.id) : -1),
    [selectedItem, filteredItems],
  );
  const temAnterior = filaIdx > 0;
  const temProxima = filaIdx >= 0 && filaIdx < filteredItems.length - 1;

  const irParaFila = (idx: number) => {
    const alvo = filteredItems[idx];
    if (!alvo) return;
    // Mesmo preparo do openModal, sem reabrir o diálogo: trocar a peça com o
    // modal aberto tem de zerar os campos de edição da anterior, senão a
    // observação digitada na peça 3 aparece na 4.
    setSelectedItem(alvo);
    setQuantityValue(alvo.quantity ?? 1);
    setEditingQuantity(false);
    setReturnObservations("");
    setCardObservations(alvo.observations || "");
  };

  /**
   * Depois de decidir, a peça sai de `pendingItems` — e, portanto, da lista
   * filtrada. O índice que ERA o dela passa a ser o da peça seguinte, então
   * avançar é ficar no mesmo índice. Guardamos o índice ANTES da invalidação
   * porque depois dela `selectedItem` já não está na lista.
   */
  const proximaAposDecidir = useRef<number | null>(null);
  useEffect(() => {
    const idx = proximaAposDecidir.current;
    if (idx === null) return;
    proximaAposDecidir.current = null;
    const alvo = filteredItems[idx];
    if (!alvo) { setModalOpen(false); setSelectedItem(null); return; }
    irParaFila(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredItems]);

  /** Marca o avanço, ou devolve `false` quando era a última da fila. */
  const marcarAvanco = (): boolean => {
    if (filaIdx < 0 || filaIdx >= filteredItems.length - 1) return false;
    proximaAposDecidir.current = filaIdx;
    return true;
  };

  const openModal = (item: any) => {
    setSelectedItem(item);
    setQuantityValue(item.quantity ?? 1);
    setEditingQuantity(false);
    setReturnObservations("");
    setCardObservations(item.observations || "");
    setModalOpen(true);
  };

  // Deep link `?item=` (sino e "Resolver em Revisão Final →" da Gestão de
  // Prazos): abre a decisão da peça. A fila é `pendingItems` — a mesma regra
  // da lista, com o recorte do Kit —, então peça já liberada ou devolvida não
  // abre um modal sem decisão: o hook avisa que ela avançou.
  //
  // Peça do link FORA da fila: o aviso diz o código dela, que antes vinha do
  // acervo inteiro e agora vem de uma busca só por ela (`buscarPecaAtual`). O
  // hook espera essa busca (`pronto`) para o aviso sair com o código, como
  // saía. O id é lido na montagem, no mesmo instante em que o hook o lê.
  const [idDoLink] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("item"));
  const [codigoDoLink, setCodigoDoLink] = useState<{ id: string; codigo: string | null } | null>(null);
  const filaCarregada = !itemsLoading && !eventsLoading && !itemsError;
  const linkForaDaFila = filaCarregada && !!idDoLink && !(pendingItems as any[]).some((i: any) => i.id === idDoLink);
  const codigoDoLinkPronto = !!idDoLink && codigoDoLink?.id === idDoLink;
  const linkPronto = filaCarregada && (!linkForaDaFila || codigoDoLinkPronto);
  // O hook consome o link UMA vez. Depois disso, a peça do link sair da fila
  // (a própria pessoa a liberou) não é motivo para buscar código nenhum.
  const linkJaConsumido = useRef(false);
  if (linkPronto) linkJaConsumido.current = true;
  useEffect(() => {
    if (linkJaConsumido.current || !linkForaDaFila || !idDoLink || codigoDoLinkPronto) return;
    let vivo = true;
    void buscarPecaAtual(idDoLink).then((peca) => {
      if (vivo) setCodigoDoLink({ id: idDoLink, codigo: peca?.displayId ?? null });
    });
    return () => { vivo = false; };
  }, [linkForaDaFila, idDoLink, codigoDoLinkPronto]);
  usePecaDoLink<any>({
    pronto: linkPronto,
    localizar: (id) => (pendingItems as any[]).find((i: any) => i.id === id),
    abrir: openModal,
    codigoDe: (id) =>
      (itensDoServidor as any[]).find((i: any) => i.id === id)?.displayId
      ?? (codigoDoLink?.id === id ? codigoDoLink.codigo : undefined),
  });

  useEffect(() => {
    if (!modalOpen) return;
    const handler = (e: KeyboardEvent) => {
      // Tecla SEGURADA não é decisão: o auto-repeat do teclado abria a
      // confirmação, o foco no "Liberar" confirmava, a fila avançava e o
      // próximo repeat recomeçava — várias peças liberadas num só aperto.
      // Só o keydown inicial conta; setas seguradas também param aqui (uma
      // peça por aperto é o ritmo de revisão).
      if (e.repeat) return;
      // Quem está digitando num campo (textarea de observação, input de
      // quantidade...) não pode ter Enter/Esc sequestrados pelo atalho.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.tagName === "SELECT" || t.isContentEditable)) return;
      // Com foco em botão/link, Enter ativa o próprio elemento — agir aqui
      // também abriria dois diálogos de uma vez.
      if (t && t.closest("button,a")) return;
      // Com um AlertDialog de confirmação aberto por cima, Enter/Esc são dele
      // (o Radix cuida); agir aqui fechava as duas camadas de uma vez.
      if (releaseConfirmOpen || returnConfirmOpen || travandoItem || desfazerReuseId || reuseDialogItemId) return;
      // Mesma checagem do botão "Liberar para Produção": sem arquivo final —
      // ou com o evento finalizado, que o servidor recusa com 409 — o atalho
      // não pode driblar o botão desabilitado.
      if (e.key === "Enter" && selectedItem && prontaParaLiberar(selectedItem)
        && !seloPecaEventoFinalizado(selectedItem?.event, hojeBusinessMs)) setReleaseConfirmOpen(true);
      if (e.key === "Escape") setModalOpen(false);
      if (e.key === "ArrowLeft" && temAnterior) { e.preventDefault(); irParaFila(filaIdx - 1); }
      if (e.key === "ArrowRight" && temProxima) { e.preventDefault(); irParaFila(filaIdx + 1); }
      // D de devolver — o par do Enter, que libera. Sem ele o atalho de
      // teclado só cobria metade da decisão.
      if ((e.key === "d" || e.key === "D") && !seloSelecionado) { e.preventDefault(); setReturnConfirmOpen(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modalOpen, selectedItem, releaseConfirmOpen, returnConfirmOpen, travandoItem, desfazerReuseId, reuseDialogItemId, filaIdx, temAnterior, temProxima, seloSelecionado]);

  if (itemsLoading || eventsLoading) {
    // O giro sozinho não dizia O QUE carrega — numa fila que às vezes está
    // vazia de verdade, "carregando ou vazio?" era pergunta de todo dia.
    return (
      <div role="status" style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div aria-hidden="true" className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: TI.accent }} />
        <p style={{ margin: 0, fontSize: 13, color: T.apoio }}>Carregando a fila de revisão…</p>
      </div>
    );
  }

  if (itemsError || eventsError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, textAlign: "center", padding: "0 24px" }}>
        <p role="alert" style={{ fontSize: 15, fontWeight: 700, color: TOM.perigo.text, margin: 0 }}>
          {itemsError ? "Não foi possível carregar as peças" : "Não foi possível carregar os eventos"}
        </p>
        <p style={{ fontSize: 13, color: TI.secondary, margin: 0 }}>Verifique sua conexão e tente novamente.</p>
        <button onClick={() => { refetchItems(); refetchEvents(); }} style={{ marginTop: 4, background: TI.text, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Tentar novamente</button>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: TI.bg, height: "100%", overflowY: "auto" }}>

      {/* ── 1. CABEÇALHO ───────────────────────────────────────────────
          Era um bloco preto de 275px — 45% da primeira dobra — com titulo de
          56px e um olho decorativo de 280px atras. Nenhuma outra tela do app
          tem isso: Gestao de Prazos gasta 60px no mesmo trabalho e Analises,
          78. A lista so comecava em y=434, entao a tela mostrava TRES pecas
          antes de precisar rolar.

          O titulo virou "Revisao", o nome que a barra lateral ja usa: "Revisao
          do Criador" era o unico lugar do app que dizia outra coisa.
          Em 16/09 o menu passou a "Revisão Final" (o status que traz a peça é
          "Aguardando Revisão Final") e o título acompanhou: menu, aba do
          navegador e h1 dizem o mesmo nome.

          Os contadores sairam daqui. "Aguardando: 74" e o "74 de 74 pecas" da
          barra de filtros eram o MESMO numero dito duas vezes, a 200px de
          distancia; ficou o da barra, que e onde o resto do app poe. */}
      <section style={{ backgroundColor: TI.surface, padding: isMobile ? "16px 12px" : "20px 32px", borderBottom: `1px solid ${TI.border}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{
              margin: 0, fontSize: isMobile ? 20 : FS.h1, fontWeight: 700, color: TI.text,
              fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em", lineHeight: 1.1,
            }}>
              Revisão Final
            </h1>
            {/* #57534e e não o TI.secondary: em 13px a régua da casa é 4,5:1. */}
            <p data-testid="frase-resolucao" style={{ margin: "4px 0 0", fontSize: 13, color: T.apoio, maxWidth: 620, lineHeight: 1.5 }}>
              {fraseDeResolucao}
            </p>
            {/* O QUE É ESTA TELA, numa linha. A rodada de 13/09 tirou a
                descrição diária (a frase acima diz o que muda a cada visita),
                mas quem chega pela primeira vez não sabia o que "revisar" quer
                dizer, nem para onde a peça vai depois do clique. Uma linha
                curta, em tom secundário, responde as duas coisas sem competir
                com a frase de resolução. */}
            <p data-testid="explicacao-revisao" style={{ margin: "2px 0 0", fontSize: 12, color: T.apoio, maxWidth: 680, lineHeight: 1.5 }}>
              Última conferência antes da Gráfica: compare o aprovado pelo patrocinador com o arquivo final da Arte.
              {" "}<strong style={{ fontWeight: 700, color: T.strong }}>Liberar</strong> manda para a fila da Gráfica;
              {" "}<strong style={{ fontWeight: 700, color: T.strong }}>Devolver</strong> volta para a Arte com o seu motivo.
            </p>
          </div>

          {/* A ENTRADA DA FILA. Sem ela, comecar a revisar exige achar a
              primeira linha e mirar num botao de 90px — e quem abre esta tela
              para trabalhar quer comecar do comeco, nao escolher por onde. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
          {/* O DISPARO À MÃO DO AVISO. Discreto de propósito: é ferramenta de
              manutenção, não parte do trabalho de revisar — quem entra aqui
              para revisar não deve tropeçar nele. */}
          {user?.role === "admin" && (
            <button
              type="button"
              onClick={() => avisarRevisaoMutation.mutate()}
              disabled={avisarRevisaoMutation.isPending}
              data-testid="button-avisar-revisao"
              title="Manda agora o resumo da fila para quem recebe o aviso das 10h, 15h e 18h. Se a fila estiver vazia, nada é enviado."
              style={{
                display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0,
                height: 40, padding: "0 14px", borderRadius: 8,
                border: `1px solid ${T.bdark}`, backgroundColor: "#fff", color: T.strong,
                cursor: avisarRevisaoMutation.isPending ? "wait" : "pointer",
                font: "inherit", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
                opacity: avisarRevisaoMutation.isPending ? 0.6 : 1,
              }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = T.bg; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#fff"; }}
            >
              <Mail aria-hidden="true" style={{ width: 15, height: 15 }} />
              {avisarRevisaoMutation.isPending ? "Enviando…" : "Avisar por e-mail"}
            </button>
          )}
          {filteredItems.length > 0 && (
            <button
              type="button"
              onClick={() => openModal(filteredItems[0])}
              data-testid="button-queue-start"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0,
                height: 40, padding: "0 18px", borderRadius: 8, border: "none",
                backgroundColor: T.text, color: "#fff", cursor: "pointer",
                font: "inherit", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
              }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = T.strong; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = T.text; }}
            >
              <Eye aria-hidden="true" style={{ width: 15, height: 15 }} />
              Revisar em fila ({filteredItems.length})
            </button>
          )}
          </div>
        </div>
      </section>


      {/* ── 2. FILTER BAR ──────────────────────────────────────────────── */}
      <section style={{
        backgroundColor: "#fff", padding: isMobile ? "12px 12px" : "12px 32px",
        borderBottom: `1px solid ${TI.border}`,
        position: "sticky", top: 0, zIndex: 30,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: TI.muted, pointerEvents: "none" }} />
            <input
              ref={searchRef}
              // A busca já casava tipo e evento também — o placeholder só
              // prometia ID e descrição, e ninguém tentava o nome do evento.
              placeholder="ID, tipo, descrição ou evento   /"
              aria-label="Buscar peça por ID, tipo, descrição ou evento"
              aria-keyshortcuts="/"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              data-testid="input-search"
              style={{ width: "100%", height: alturaControle, paddingLeft: 34, paddingRight: searchTerm ? 40 : 12, backgroundColor: T.low, border: "none", borderRadius: 8, fontSize: isMobile ? 16 : 13, color: TI.text, boxSizing: "border-box" }}
            />
            {searchTerm && (
              <button type="button" onClick={() => { setSearchTerm(""); searchRef.current?.focus(); }} aria-label="Limpar busca" style={{ position: "absolute", right: 2, top: "50%", transform: "translateY(-50%)", width: isMobile ? 40 : 30, height: isMobile ? 40 : 30, background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: TI.secondary, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X style={{ width: 13, height: 13 }} />
              </button>
            )}
          </div>

          {/* Event select */}
          <EventFilterDropdown
            values={eventFilter}
            onValuesChange={setEventFilter}
            options={eventFilterOptions}
          />

          {/* Type select */}
          <FilterSelect
            label="Tipo de Peça" allLabel="Todos os tipos"
            values={itemTypeFilter} onValuesChange={setItemTypeFilter}
            options={typeFilterOptions}
            searchPlaceholder="Buscar tipo..." emptyText="Nenhum tipo encontrado."
            testId="select-type-filter"
            triggerStyle={{ backgroundColor: T.low, border: "none", fontSize: 13, color: TI.text, minWidth: 150 }}
          />

          {/* ── OS DOIS CHIPS DE FACETA ──
              "Sem arquivo final" e "Evento finalizado" sao as duas perguntas
              que a fila de 74 faz o tempo todo e que nenhum dropdown
              respondia. A contagem sai do pool com a PROPRIA dimensao
              excluida (ver `contagemSemArquivo`), entao o numero e exatamente
              o de linhas que o clique entrega.

              Estado sem nenhuma peca nao vira chip: o clique devolveria lista
              vazia sem dizer por que. Fica se ja estiver ligado, senao o chip
              sumiria com o filtro aceso e nao haveria como apaga-lo. */}
          {([
            { id: "sem-arquivo", rotulo: "Sem arquivo final", n: contagemSemArquivo, ligado: soSemArquivo, alterna: () => setSoSemArquivo(v => !v), cor: T.accentText, testid: "chip-sem-arquivo" },
            { id: "evento-finalizado", rotulo: "Evento finalizado", n: contagemEventoFinalizado, ligado: soEventoFinalizado, alterna: () => setSoEventoFinalizado(v => !v), cor: T.second, testid: "chip-evento-finalizado-faceta" },
            // Solicitação ao estoque: só com a chave ligada (dono, 21/09 — segurar).
            ...(SOLICITACAO_AO_ESTOQUE_ATIVA ? [
            { id: "estoque-respondeu", rotulo: "Estoque respondeu", n: contagemDoEstoque.respondeu, ligado: filtroEstoque === "respondeu", alterna: () => setFiltroEstoque(v => (v === "respondeu" ? "" : "respondeu")), cor: TOM.sucesso.text, testid: "chip-estoque-respondeu" },
            { id: "aguardando-estoque", rotulo: "Aguardando estoque", n: contagemDoEstoque.aguardando, ligado: filtroEstoque === "aguardando", alterna: () => setFiltroEstoque(v => (v === "aguardando" ? "" : "aguardando")), cor: TOM.alerta.text, testid: "chip-aguardando-estoque" },
            ] : []),
          ]).map(chip => {
            if (chip.n === 0 && !chip.ligado) return null;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={chip.alterna}
                aria-pressed={chip.ligado}
                title={chip.ligado ? `Remover o filtro ${chip.rotulo}` : `Ver só ${chip.rotulo.toLowerCase()}`}
                data-testid={chip.testid}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  height: alturaControle, padding: "0 12px", borderRadius: 999,
                  border: `1px solid ${chip.ligado ? T.text : T.border}`,
                  backgroundColor: chip.ligado ? T.text : "#fff",
                  color: chip.ligado ? "#fff" : T.strong,
                  cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
                }}
              >
                <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: chip.ligado ? "#fff" : chip.cor, flexShrink: 0 }} />
                {chip.rotulo}
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, opacity: chip.ligado ? 1 : 0.75 }}>{chip.n}</span>
              </button>
            );
          })}

          {(searchTerm || eventFilter.length > 0 || itemTypeFilter.length > 0 || soSemArquivo || soEventoFinalizado || filtroEstoque) && (
            <button
              onClick={() => { setSearchTerm(""); setEventFilter([]); setItemTypeFilter([]); setSoSemArquivo(false); setSoEventoFinalizado(false); setFiltroEstoque(""); }}
              data-testid="button-clear-filters"
              style={{ height: alturaControle, fontSize: 13, fontWeight: 600, color: TI.secondary, textDecoration: "underline", textUnderlineOffset: 3, background: "none", border: "none", cursor: "pointer", padding: "0 8px" }}>
              Limpar filtros
            </button>
          )}

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {filteredItems.length > 0 && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: TI.secondary, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={selectedItemIds.size === filteredItems.length && filteredItems.length > 0}
                  ref={el => { if (el) el.indeterminate = selectedItemIds.size > 0 && selectedItemIds.size < filteredItems.length; }}
                  onChange={toggleAll}
                  data-testid="checkbox-select-all"
                  style={{ accentColor: TI.accent, width: 20, height: 20 }}
                />
                Selecionar todos
              </label>
            )}
            {/* O contador unico da tela. Herdou do hero o recado das pecas de
                evento finalizado: elas CONTAM aqui (a regra dos numeros desta
                tela e "todo contador conta o que a tela mostra"), mas quem le
                "74" precisa saber quanto daquilo e trabalho que ninguem vai
                mais fazer. #746e69 sobre branco = 5,15:1 nos 11px. */}
            <span style={{ fontSize: 11, color: TI.secondary, whiteSpace: "nowrap" }}>
              {filteredItems.length} de {pendingItems.length} peças
              {selosPorItem.size > 0 && (
                <span
                  data-testid="chip-evento-finalizado"
                  title={"Estas peças continuam na lista porque a Revisão Final é onde se vê o que ficou por revisar — e porque excluir peça segue liberado."
                    + " Liberar, devolver, reaproveitar e mexer na quantidade estão bloqueados nelas."}
                >
                  {" · "}{selosPorItem.size} de evento finalizado
                </span>
              )}
            </span>
          </div>
        </div>

        {/* ── Ações em lote ────────────────────────────────────────────────
            Viviam num painel de 280px na area mais cara da tela, e passavam a
            maior parte do tempo DESABILITADAS — porque na maior parte do tempo
            nao ha nada selecionado. Agora entram quando existe selecao e somem
            quando ela zera, no mesmo desenho que a Arte usa (pilula escura com
            o × redondo). Como a barra e sticky, elas seguem alcancaveis com a
            lista rolada — coisa que o painel do topo nao era. */}
        {selecaoLote.ids.length > 0 && (
          <div style={{ maxWidth: 1200, margin: "10px auto 0", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <span
              data-testid="chip-selecao"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, height: alturaControle, padding: "0 6px 0 12px", borderRadius: 999, background: T.text, color: T.surface, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}
            >
              {selecaoLote.ids.length} {selecaoLote.ids.length === 1 ? "selecionada" : "selecionadas"}
              <button
                onClick={() => setSelectedItemIds(new Set())}
                aria-label="Limpar seleção"
                data-testid="button-clear-selection"
                style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.16)", border: "none", cursor: "pointer", color: T.surface, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                <X style={{ width: 12, height: 12 }} />
              </button>
            </span>

            {/* O que fica de fora, dito ANTES de abrir a confirmacao: quem
                marcou 40 linhas precisa ver o desconto na hora. */}
            {selecaoLote.finalizadas > 0 && (
              <span
                role="status"
                data-testid="aviso-lote-evento-finalizado"
                title={avisoLoteFinalizadas() ?? undefined}
                style={{ fontSize: 12, color: TI.secondary }}
              >
                {selecaoLote.finalizadas} em evento finalizado, fora do lote
              </span>
            )}

            <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
              {/* O CONTADOR DO BOTAO e o das pecas que de fato vao: so as
                  PRONTAS (`loteDeLiberar`) — sem arquivo final ou travada fica
                  de fora, com o motivo na linha. "Liberar as 9 prontas" diz o
                  desconto antes do clique. #ffffff sobre #9d4300 = 6,49:1 ✓ */}
              {selecaoLote.vivas.length > 0 && loteDeLiberar.prontas.length === 0 && (
                <span role="status" data-testid="aviso-lote-nenhuma-pronta" style={{ alignSelf: "center", fontSize: 12, color: TOM.alerta.text }}>
                  Nenhuma pronta para liberar: {loteDeLiberar.nFora === 1 ? "a selecionada está" : "as selecionadas estão"} sem arquivo final ou travada{loteDeLiberar.nFora === 1 ? "" : "s"}.
                </span>
              )}
              <button
                onClick={() => loteDeLiberar.prontas.length > 0 && setBulkReleaseConfirmOpen(true)}
                disabled={loteDeLiberar.prontas.length === 0 || bulkReleaseMutation.isPending}
                title={selecaoLote.vivas.length === 0
                  ? "Toda a seleção é de evento finalizado — liberar para produção está bloqueado nessas peças."
                  : undefined}
                data-testid="button-bulk-release-hero"
                style={{
                  height: alturaControle, padding: "0 14px", borderRadius: 8, border: "none",
                  backgroundColor: loteDeLiberar.prontas.length === 0 ? T.border : T.accentText,
                  color: loteDeLiberar.prontas.length === 0 ? T.second : T.surface,
                  fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
                  cursor: loteDeLiberar.prontas.length === 0 || bulkReleaseMutation.isPending ? "not-allowed" : "pointer",
                }}>
                {bulkReleaseMutation.isPending
                  ? "Liberando..."
                  : loteDeLiberar.nFora > 0
                  ? `Liberar ${loteDeLiberar.prontas.length === 1 ? "a pronta" : `as ${loteDeLiberar.prontas.length} prontas`}`
                  : `Liberar ${loteDeLiberar.prontas.length}`}
              </button>
              <button
                onClick={() => selecaoLote.vivas.length > 0 && setBulkReturnConfirmOpen(true)}
                disabled={selecaoLote.vivas.length === 0 || bulkReturnMutation.isPending}
                title={selecaoLote.vivas.length === 0
                  ? "Toda a seleção é de evento finalizado — devolver para a Arte está bloqueado nessas peças."
                  : undefined}
                data-testid="button-bulk-return-hero"
                style={{
                  height: alturaControle, padding: "0 14px", borderRadius: 8,
                  border: `1px solid ${TI.border}`, backgroundColor: TI.surface,
                  color: selecaoLote.vivas.length === 0 ? T.second : T.strong,
                  fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
                  cursor: selecaoLote.vivas.length === 0 || bulkReturnMutation.isPending ? "not-allowed" : "pointer",
                }}>
                {bulkReturnMutation.isPending
                  ? "Processando..."
                  : `Devolver ${selecaoLote.vivas.length}`}
              </button>
              {/* REAPROVEITAR em lote (pedido do dono, 25/08) — só com 2+
                  selecionadas: com uma, o ícone da linha faz o mesmo e ainda
                  oferece o parcial. Verde é a identidade do reaproveitamento
                  na tela (o selo e o ícone da linha). #15803d/#f0fdf4 = 5,0:1 */}
              {selecaoLote.ids.length >= 2 && (
                <button
                  onClick={() => selecaoLote.vivas.length > 0 && setBulkReuseConfirmOpen(true)}
                  disabled={selecaoLote.vivas.length === 0 || bulkReuseMutation.isPending}
                  title={selecaoLote.vivas.length === 0
                    ? "Toda a seleção é de evento finalizado — reaproveitar está bloqueado nessas peças."
                    : "Marcar como reaproveitamento total e enviar à Gráfica como produzidas"}
                  data-testid="button-bulk-reuse-hero"
                  style={{
                    height: alturaControle, padding: "0 14px", borderRadius: 8,
                    border: `1px solid ${selecaoLote.vivas.length === 0 ? TI.border : TOM.sucesso.border}`,
                    backgroundColor: selecaoLote.vivas.length === 0 ? TI.surface : TOM.sucesso.bg,
                    color: selecaoLote.vivas.length === 0 ? T.second : TOM.sucesso.text,
                    fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
                    cursor: selecaoLote.vivas.length === 0 || bulkReuseMutation.isPending ? "not-allowed" : "pointer",
                  }}>
                  {bulkReuseMutation.isPending
                    ? "Processando..."
                    : `Reaproveitar ${selecaoLote.vivas.length}`}
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── 3 & 4. HIGH-DENSITY TABLE ──────────────────────────────────── */}
      <section ref={listaRef} style={{ padding: isMobile ? "12px 12px" : listaEmCartoes ? "20px" : "32px", maxWidth: 1200, margin: "0 auto", paddingBottom: isMobile ? 20 : 80 }}>
        {filteredItems.length === 0 ? (
          /* DOIS VAZIOS DIFERENTES. "Tudo revisado" é conquista (verde, texto
             escuro); "nada neste recorte" é filtro demais — e precisa da saída
             ali mesmo, sem subir até a barra para achar o "Limpar filtros". */
          <div style={{ backgroundColor: "#fff", border: `1px solid ${T.border}`, borderRadius: 8, textAlign: "center", padding: isMobile ? "48px 20px" : "80px 24px" }}>
            <CheckCircle aria-hidden="true" style={{ width: 48, height: 48, color: pendingItems.length === 0 ? TOM.sucesso.text : T.bdark, margin: "0 auto 16px" }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: TI.text, margin: "0 0 8px" }}>
              {pendingItems.length === 0 ? "Tudo revisado!" : "Nenhuma peça neste recorte"}
            </p>
            <p style={{ fontSize: 13, color: T.apoio, margin: 0 }}>
              {pendingItems.length === 0
                ? "Não há peças aguardando revisão no momento."
                : `${pendingItems.length} ${pendingItems.length === 1 ? "peça aguardando revisão ficou" : "peças aguardando revisão ficaram"} fora da busca e dos filtros.`}
            </p>
            {/* "POR QUE A PEÇA NÃO ESTÁ AQUI?" — a pergunta de quem chega
                procurando uma peça específica. A resposta é a regra de entrada
                da fila, dita onde a ausência é notada. */}
            <p data-testid="regra-da-fila-revisao" style={{ fontSize: 12, color: T.apoio, margin: "10px auto 0", maxWidth: 460, lineHeight: 1.5 }}>
              Aqui só entram peças que a Arte mandou para a revisão final. Peça ainda em criação na Arte, em aprovação do patrocinador
              ou já liberada para a Gráfica não aparece — abra o evento dela para ver em que etapa está.
              {user?.role === "solicitacao" && !user?.kit ? " Peças do Kit são revisadas pela equipe do Kit." : ""}
            </p>
            {pendingItems.length > 0 && (
              <button
                type="button"
                onClick={() => { setSearchTerm(""); setEventFilter([]); setItemTypeFilter([]); setSoSemArquivo(false); setSoEventoFinalizado(false); }}
                data-testid="button-clear-filters-empty"
                style={{ marginTop: 16, height: alturaControle, padding: "0 16px", borderRadius: 8, border: `1px solid ${T.border}`, backgroundColor: "#fff", color: TI.text, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : listaEmCartoes ? (
          <div>
            {Array.from(itemsByEvent.entries()).map(([eventKey, eventItems]) => {
              const evInfo = getEventInfo(eventKey);
              return (
                <div key={eventKey} style={{marginBottom:16}}>
                  {/* Event header */}
                  <div style={{padding:"8px 0 6px", borderBottom:`2px solid ${T.accent}`, marginBottom:8}}>
                    <span style={{fontSize:11,fontWeight:900,textTransform:"uppercase",letterSpacing:"0.08em",color:T.second}}>{evInfo?.name || "Sem Evento"}</span>
                  </div>
                  {eventItems.map((item:any) => (
                    /* Card mobile: o checkbox fica FORA do alvo role="button"
                       (checkbox aninhado em botão é estrutura inválida para
                       leitor de tela); o corpo do card segue abrindo o modal
                       por toque, Enter e Espaço. */
                    <div key={item.id} style={{position:"relative",backgroundColor:"#fff",border:`1px solid ${T.border}`,borderRadius:8,marginBottom:8}}>
                      {/* ALVO de 44, CAIXA de 20. Este checkbox e a unica porta
                          para "Liberar selecionadas" / "Devolver selecionadas"
                          no celular, e tinha 20px de lado — metade do piso de
                          toque. Crescer a caixa deixaria o card com um quadrado
                          enorme no canto; quem cresce e o <label>, que e
                          transparente e encaminha o toque para o input. */}
                      <label
                        style={{position:"absolute",top:0,right:0,width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",zIndex:1}}
                      >
                        <input
                          type="checkbox"
                          checked={selectedItemIds.has(item.id)}
                          onChange={()=>toggleItem(item.id)}
                          aria-label={`Selecionar ${item.displayId}`}
                          style={{accentColor:T.accent,width:20,height:20,cursor:"pointer"}}
                        />
                      </label>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Revisar peça ${item.displayId}`}
                        // Mesmo testid do botão da tabela: é a mesma ação, e só um
                        // dos dois layouts existe por vez (a escolha agora depende
                        // da largura medida, então o teste não sabe qual virá).
                        data-testid={`button-review-${item.id}`}
                        onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(item); } }}
                        onClick={() => openModal(item)}
                        style={{padding:"12px",cursor:"pointer",display:"flex",flexDirection:"column",gap:6}}>
                        <div style={{display:"flex",justifyContent:"flex-start",alignItems:"center",gap:6,flexWrap:"wrap",paddingRight:44}}>
                          <span style={{fontFamily:"monospace",fontWeight:700,color:T.accentText,fontSize:13}}>{item.displayId}</span>
                          <SeloKit peca={item} />
                          <SeloDoEstoqueNaLinha linha={estoquePorPeca.get(item.id)} />
                          {/* EVENTO FINALIZADO — a peça voltou para a fila (ver
                              `pendingItems`), então tem de se declarar. Aqui
                              quase nada funciona: só excluir. */}
                          {seloDoItem(item) && (() => {
                            const selo = seloDoItem(item)!;
                            return (
                              <span
                                data-testid={`badge-evento-finalizado-mobile-${item.id}`}
                                title={selo.hint}
                                style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:9,fontWeight:800,color:selo.text,background:selo.bg,border:`1px solid ${selo.border}`,borderRadius:6,padding:"1px 5px",letterSpacing:"0.06em",whiteSpace:"nowrap",textTransform:"uppercase"}}
                              >
                                <span aria-hidden="true" style={{width:5,height:5,borderRadius:"50%",background:selo.dot,flexShrink:0}} />
                                {selo.label}
                              </span>
                            );
                          })()}
                          {seloTravaNaLinha(item, "cartao")}
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                          <div style={{flex:1}}>
                            <span style={{fontSize:13,fontWeight:700,color:T.text}}>{item.type}</span>
                            {item.description && <p style={{fontSize:13,color:T.second,margin:"2px 0 0"}}>{item.description}</p>}
                          </div>
                          <span style={{fontSize:10,fontWeight:700,color:T.second,whiteSpace:"nowrap"}}>{item.quantity}×</span>
                        </div>
                        {/* O ARQUIVO FINAL também no celular. No desktop ele tem
                            coluna própria (decide se a peça é revisável); no
                            cartão só se descobria abrindo a ficha. */}
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                          {ehMolde(item) ? (
                            <>
                              <span data-testid={`chip-arquivo-mobile-${item.id}`} title="Molde não tem arquivo final — libera só com o thumb" style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:999,backgroundColor:N.n2,border:`1px solid ${T.bdark}`,color:T.strong}}>
                                Molde · sem arquivo final
                              </span>
                              {/* Prazo do molde (22/09): só o fluxo do molde o lê. */}
                              <SeloPrazoMolde item={item} />
                            </>
                          ) : item.finalFileUrl ? (
                            <span data-testid={`chip-arquivo-mobile-${item.id}`} style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:999,backgroundColor:TOM.sucesso.bg,border:`1px solid ${TOM.sucesso.border}`,color:TOM.sucesso.text}}>
                              <Check aria-hidden="true" style={{width:10,height:10}} /> Arquivo recebido
                            </span>
                          ) : (
                            <span data-testid={`chip-arquivo-mobile-${item.id}`} style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:999,backgroundColor:TOM.laranja.bg,border:`1px solid ${TOM.laranja.border}`,color:T.accentText}}>
                              <Clock aria-hidden="true" style={{width:10,height:10}} /> Aguardando arquivo
                            </span>
                          )}
                          {item.sponsors?.map((s:any)=><span key={s.id} style={{fontSize:11,padding:"2px 6px",borderRadius:6,backgroundColor:N.n2,color:T.apoio,fontWeight:600}}>{s.name}</span>)}
                        </div>
                        {falhaNaLinha(item)}
                      </div>
                      {/* EXCLUIR PEÇA — a lixeira da tabela, que não existe na
                          ficha. Desde que os cartões valem abaixo de 980px de
                          lista (e não só no celular), o admin no notebook
                          estreito perdia a ação. Mesmo gate de papel da tabela
                          (o DELETE trava "solicitacao" nesse status) e mesmo
                          diálogo de confirmação. Fica FORA do alvo role="button"
                          da revisão: interativo aninhado em botão é estrutura
                          inválida. Mesmo testid da tabela, pelo mesmo motivo do
                          `button-review-`: os dois layouts nunca coexistem. */}
                      {/* REAPROVEITAR também no cartão (rodada 4): a tabela
                          tinha o ♻ na linha e o cartão não — abaixo de 980px de
                          lista a ação só existia abrindo a ficha. Mesmo fluxo e
                          mesmo testid do botão da tabela (os layouts nunca
                          coexistem): desfaz a marcação ou abre total/parcial;
                          em evento finalizado fica visível, travado, com o
                          motivo escrito. */}
                      <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",gap:4,flexWrap:"wrap",padding:"0 4px 4px",marginTop:-4}}>
                          {(() => {
                            const selo = seloDoItem(item);
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  if (selo) return;
                                  if (item.isReuse) setDesfazerReuseId(item.id);
                                  else { setPartialReuseQty(Math.max(1, Number(item.quantity) - 1 || 1)); setReuseDialogItemId(item.id); }
                                }}
                                disabled={!!selo || desfazendoReuse(item.id)}
                                data-testid={`button-reuse-${item.id}`}
                                aria-pressed={!!item.isReuse}
                                title={selo ? motivoAcaoBloqueada(selo.motivo, "marcar reaproveitamento") : undefined}
                                style={{minHeight:44,padding:"0 12px",background:item.isReuse ? TOM.sucesso.bg : "none",border:item.isReuse ? `1px solid ${TOM.sucesso.border}` : "1px solid transparent",borderRadius:8,cursor:selo ? "not-allowed" : "pointer",color:selo ? T.second : TOM.sucesso.text,fontSize:12,fontWeight:700,display:"inline-flex",alignItems:"center",gap:6}}
                              >
                                <Recycle aria-hidden="true" style={{width:14,height:14}} />
                                {desfazendoReuse(item.id) ? "Desfazendo…" : item.isReuse ? "Reaproveitada · desfazer" : "Reaproveitar"}
                              </button>
                            );
                          })()}
                      {user?.role === "admin" && (
                          <button
                            onClick={() => setDeleteConfirmItemId(item.id)}
                            data-testid={`button-delete-${item.id}`}
                            title="Excluir peça"
                            aria-label={`Excluir a peça ${item.displayId}`}
                            style={{minHeight:44,padding:"0 12px",background:"none",border:"none",borderRadius:8,cursor:"pointer",color:TOM.perigo.text,fontSize:12,fontWeight:700,display:"inline-flex",alignItems:"center",gap:6}}
                          >
                            <Trash2 aria-hidden="true" style={{width:14,height:14}} />
                            Excluir
                          </button>
                      )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ backgroundColor: "#fff", border: `1px solid ${T.border}`, borderRadius: 8, overflowX: "auto", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            {/* SEM ROLAGEM (dono, 15/09): layout fixo — as colunas de dado têm
                largura, a Peça fica com o resto e QUEBRA linha em vez de
                alargar a tabela. */}
            <table style={{ width: "100%", tableLayout: "fixed", textAlign: "left", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: T.bg, borderBottom: `1px solid ${T.border}` }}>
                  {/* Select all */}
                  <th style={{ padding: "14px 24px", width: 48, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={selectedItemIds.size === filteredItems.length && filteredItems.length > 0}
                      ref={el => { if (el) el.indeterminate = selectedItemIds.size > 0 && selectedItemIds.size < filteredItems.length; }}
                      onChange={toggleAll}
                      aria-label="Selecionar todos"
                      data-testid="checkbox-select-all-header"
                      style={{ accentColor: T.accent, width: 20, height: 20, cursor: "pointer" }}
                    />
                  </th>
                  {[
                    // DE SETE COLUNAS PARA QUATRO. ID, Tipo e Descrição
                    // identificam a MESMA peça e viviam separados por duas
                    // divisórias; Qtd, Dim e M² são a mesma medida contada de
                    // três jeitos. Juntas, cabem numa linha — e sobra largura
                    // para a coluna que faltava.
                    { label: "Peça", w: undefined },
                    { label: "Qtd · Dim · m²", w: 230 },
                    { label: "Arquivo final", w: 140 },
                    { label: "Ações", w: 160, right: true },
                  ].map(col => (
                    <th
                      key={col.label}
                      style={{
                        padding: "14px 16px",
                        width: col.w,
                        textAlign: col.right ? "right" : "left",
                        fontSize: 10, fontWeight: 900,
                        textTransform: "uppercase", letterSpacing: "0.1em",
                        // #746e69 sobre o #fafaf9 do thead da 4,55 — passa
                        // raspando. #7a6154 da 5,49 e e o tom que as outras
                        // telas ja usam em rotulo de coluna.
                        color: T.apoio,
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(itemsByEvent.entries()).map(([eventId, eventItems]) => {
                  const event = getEventInfo(eventId);
                  const groupSelected = eventItems.every(i => selectedItemIds.has(i.id));
                  const toggleGroup = () => {
                    setSelectedItemIds(prev => {
                      const next = new Set(prev);
                      if (groupSelected) eventItems.forEach(i => next.delete(i.id));
                      else eventItems.forEach(i => next.add(i.id));
                      return next;
                    });
                  };

                  return (
                    <Fragment key={eventId}>
                      {/* ── Group header row ── */}
                      <tr style={{ backgroundColor: T.text, borderTop: `1px solid ${T.strong}`, borderBottom: `1px solid ${T.strong}` }}>
                        <td style={{ padding: "10px 24px", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={groupSelected}
                            onChange={toggleGroup}
                            aria-label={`Selecionar evento ${event?.name || "sem evento"}`}
                            data-testid={`checkbox-group-${eventId}`}
                            style={{ accentColor: T.accent, width: 20, height: 20, cursor: "pointer", backgroundColor: T.strong }}
                          />
                        </td>
                        {/* colSpan 4 = as quatro colunas de dados depois do checkbox.
                            Era 7 (e 8 nos subgrupos): sobra do tempo em que a
                            tabela tinha sete colunas. Declarar mais colunas do
                            que existem faz o navegador criar colunas FANTASMA e
                            redistribuir a largura — somado aos chips de prazo em
                            nowrap logo abaixo, isso alargava a tabela inteira e
                            empurrava o botão Revisar para fora do card, onde a
                            rolagem horizontal ficava no pé de uma lista de dezenas
                            de linhas (dono, 11/09: "cortando o botão"). */}
                        <td colSpan={4} style={{ padding: "10px 16px" }}>
                          {/* flexWrap: quando os chips não cabem ao lado do nome,
                              DESCEM de linha — nunca empurram a largura da tabela. */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                              <span style={{
                                fontFamily: "'Space Grotesk', sans-serif",
                                fontSize: 11, fontWeight: 900,
                                color: "#fff", textTransform: "uppercase", letterSpacing: "0.06em",
                              }}>
                                {event?.name || "Sem Evento"}
                              </span>
                              <span style={{
                                backgroundColor: T.accentText, color: "#fff",
                                fontSize: 10, fontWeight: 900,
                                padding: "1px 8px", borderRadius: 999,
                                textTransform: "uppercase", letterSpacing: "0.04em",
                              }}>
                                {eventItems.length} PENDENTE{eventItems.length !== 1 ? "S" : ""}
                              </span>
                            </div>
                            {event && (
                              <div style={{ display: "flex", gap: "6px 12px", fontSize: 10, color: T.bdark, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>
                                {event.startDate && (
                                  <span>Início: <span style={{ color: T.bdark }}>{parseDateLocal(event.startDate).toLocaleDateString("pt-BR")}</span></span>
                                )}
                                {/* ── A SAIDA DO CAMINHAO, COM OS DIAS ──

                                    Os eventos JA vinham na ordem da saida (ver
                                    `itemsByEvent`), mas o cabecalho so dizia a
                                    DATA: para saber se "09/09" e daqui a tres
                                    dias ou a tres semanas era preciso fazer a
                                    conta de cabeca, evento por evento, numa
                                    fila de 74 pecas. A ordem ja e a da
                                    urgencia; faltava a urgencia estar escrita.

                                    A cor sai da mesma regua dos chips de prazo
                                    ao lado — nada de um terceiro vocabulario de
                                    urgencia no mesmo cabecalho. */}
                                {event.truckDepartureDate && (() => {
                                  const saida = new Date(event.truckDepartureDate);
                                  const hoje = new Date(); hoje.setHours(0,0,0,0);
                                  const dia = new Date(saida); dia.setHours(0,0,0,0);
                                  const dias = Math.ceil((dia.getTime() - hoje.getTime()) / 86400000);
                                  const cor = dias <= 7 ? TOM.perigo.border : dias <= 30 ? TOM.laranja.border : "rgba(255,255,255,0.7)";
                                  const quando = dias < 0 ? `há ${-dias}d`
                                    : dias === 0 ? "hoje"
                                    : dias === 1 ? "amanhã"
                                    : `${dias}d`;
                                  return (
                                    <span
                                      data-testid={`chip-caminhao-${eventId}`}
                                      title={`Saída do caminhão em ${saida.toLocaleDateString("pt-BR", { timeZone: 'UTC' })} às ${saida.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: 'UTC' })}`}
                                      style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, backgroundColor: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 999, padding: "3px 9px", fontSize: 10, fontWeight: 700, color: cor, letterSpacing: "0.04em", whiteSpace: "nowrap", textTransform: "none" }}
                                    >
                                      <Truck aria-hidden="true" style={{ width: 11, height: 11 }} />
                                      {event.datasDoKit ? "Entrega do material" : "Caminhão"} {saida.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: 'UTC' }).toUpperCase().replace(".", "")}
                                      {!event.datasDoKit && <>{" · "}{saida.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: 'UTC' })}</>}
                                      {" · "}{quando}
                                    </span>
                                  );
                                })()}
                                {event.truckDepartureDate && (() => {
                                  const dls = [
                                    { label: "Lista de Imagens", days: event.deadlineListaImagens  ?? -25 },
                                    { label: "Revisão de Lista", days: event.deadlineRevisaoLista   ?? -8  },
                                  ];
                                  const tod = new Date(); tod.setHours(0,0,0,0);
                                  return dls.map(({ label, days }) => {
                                    const d = new Date(new Date(event.truckDepartureDate).getTime() + days * 86400000);
                                    d.setHours(0,0,0,0);
                                    const diff = Math.ceil((d.getTime() - tod.getTime()) / 86400000);
                                    const ds = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                                    const s = diff < 0
                                      ? { bg: "rgba(255,80,80,0.22)", border: "rgba(255,80,80,0.38)", text: "#ffb3b3" }
                                      : diff === 0
                                      ? { bg: "rgba(255,200,80,0.28)", border: "rgba(255,200,80,0.45)", text: "#ffe59c" }
                                      : diff <= 3
                                      ? { bg: "rgba(255,160,50,0.22)", border: "rgba(255,160,50,0.38)", text: "#ffc78a" }
                                      : { bg: "rgba(255,255,255,0.12)", border: "rgba(255,255,255,0.2)", text: "rgba(255,255,255,0.72)" };
                                    return (
                                      <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 4, backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: 999, padding: "3px 9px", fontSize: 10, fontWeight: 700, color: s.text, letterSpacing: "0.04em", whiteSpace: "nowrap", textTransform: "none" }}>
                                        {label} · {ds}{diff >= 0 && diff <= 14 && <span style={{ opacity: 0.65, fontWeight: 500 }}> ({diff}d)</span>}
                                      </span>
                                    );
                                  });
                                })()}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* ── Item rows ── */}
                      {eventItems.map((item, idx) => {
                        const isSelected = selectedItemIds.has(item.id);
                        // Evento finalizado: selo na linha e ações barradas
                        // desabilitadas. Ver `pendingItems`, no topo.
                        const selo = seloDoItem(item);
                        const isLast = idx === eventItems.length - 1;
                        const prevItem = idx > 0 ? eventItems[idx - 1] : null;
                        const showTypeHeader = !prevItem || prevItem.type !== item.type;
                        const itemGroupName = typeToGroup[item.type] || '';
                        const prevItemGroupName = prevItem ? (typeToGroup[prevItem.type] || '') : '';
                        const showGroupHeader = showTypeHeader && itemGroupName !== '' && itemGroupName !== prevItemGroupName;
                        return (
                          <Fragment key={item.id}>
                            {showGroupHeader && (
                              <tr style={{ backgroundColor: TOM.info.border }}>
                                <td colSpan={5} style={{ padding: '5px 16px' }}>
                                  <span style={{ fontSize: 10, fontWeight: 800, color: TOM.info.text, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{itemGroupName}</span>
                                </td>
                              </tr>
                            )}
                            {showTypeHeader && (
                              <tr style={{ backgroundColor: N.n3 }}>
                                <td colSpan={5} style={{ padding: '5px 16px' }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: T.apoio, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.type}</span>
                                </td>
                              </tr>
                            )}
                          <tr
                            key={`row-${item.id}`}
                            data-testid={`row-item-${item.id}`}
                            style={{
                              borderBottom: isLast ? "none" : `1px solid ${N.n3}`,
                              backgroundColor: isSelected ? TOM.laranja.bg : "#fff",
                              transition: "background-color 0.1s",
                              cursor: "pointer",
                            }}
                            onClick={() => openModal(item)}
                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = T.bg; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = isSelected ? TOM.laranja.bg : "#fff"; }}
                          >
                            {/* Checkbox. `stopPropagation` no <td>: a linha
                                inteira abre o modal, e marcar para o lote não é
                                pedir a ficha. */}
                            <td onClick={e => e.stopPropagation()} style={{ padding: "14px 24px", textAlign: "center" }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleItem(item.id)}
                                aria-label={`Selecionar ${item.displayId}`}
                                data-testid={`checkbox-item-${item.id}`}
                                style={{ accentColor: T.accent, width: 20, height: 20, cursor: "pointer" }}
                              />
                            </td>

                            {/* ── Peça: ID · Tipo · Descrição ──
                                Eram três colunas para identificar a MESMA
                                peça, separadas por duas divisórias. Juntas,
                                lêem-se como uma frase — e a largura que
                                sobra vira a coluna que faltava. */}
                            <td style={{ padding: "12px 16px", minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px 8px", minWidth: 0 }}>
                                <span
                                  data-testid={`text-display-id-${item.id}`}
                                  style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: T.accentText, flexShrink: 0, whiteSpace: "nowrap" }}
                                >
                                  {item.displayId}
                                </span>
                                <SeloKit peca={item} style={{ flexShrink: 0 }} />
                                <span style={{ fontSize: 13, fontWeight: 700, color: TI.text, minWidth: 0, overflowWrap: "anywhere" }}>
                                  {item.type}
                                </span>
                                {item.description && (
                                  // flexShrink alto: falta largura, a descrição
                                  // é que cede. ID e tipo identificam a peça.
                                  <span title={item.description} style={{ fontSize: 12, color: T.apoio, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 999, minWidth: 0 }}>
                                    {item.description}
                                  </span>
                                )}

                                {/* MARCADORES COMO ÍCONE. Eram pílulas com
                                    texto ("Ref. visual", "Reaproveit.") do
                                    tamanho da descrição, disputando com ela a
                                    leitura — sendo que o que dizem é binário. */}
                                {item.referenceUrl && (
                                  <a
                                    href={hrefSeguro(item.referenceUrl)} target="_blank" rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    title="Ver a referência visual do solicitante"
                                    aria-label={`Referência visual de ${item.displayId}`}
                                    data-testid={`link-reference-solicitacao-${item.id}`}
                                    style={{ display: "inline-flex", color: TOM.info.text, flexShrink: 0 }}
                                  >
                                    <Paperclip style={{ width: 13, height: 13 }} />
                                  </a>
                                )}
                                {item.isReuse && (
                                  <span title="Reaproveitamento" aria-label="Reaproveitamento" style={{ display: "inline-flex", color: TOM.sucesso.text, flexShrink: 0 }}>
                                    <Recycle aria-hidden="true" style={{ width: 13, height: 13 }} />
                                  </span>
                                )}
                                <SeloDoEstoqueNaLinha linha={estoquePorPeca.get(item.id)} />
                                {/* EVENTO FINALIZADO — sem este selo, a linha
                                    mostra "Revisar" e dois botões apagados sem
                                    dizer por quê. */}
                                {selo && (
                                  <span
                                    data-testid={`badge-evento-finalizado-${item.id}`}
                                    title={selo.hint}
                                    style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", backgroundColor: selo.bg, color: selo.text, border: `1px solid ${selo.border}`, borderRadius: 999, padding: "2px 7px", whiteSpace: "nowrap", flexShrink: 0 }}
                                  >
                                    <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: selo.dot, flexShrink: 0 }} />
                                    {selo.label}
                                  </span>
                                )}
                                {seloTravaNaLinha(item, "tabela")}
                                {falhaNaLinha(item)}
                              </div>
                            </td>

                            {/* ── Qtd · Dim · m² ──
                                Eram três colunas para a mesma medida contada de
                                três jeitos. Em DM Mono os números de linhas
                                vizinhas se alinham e dá para comparar de
                                relance, que é o que três colunas prometiam e
                                não entregavam. */}
                            <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: T.apoio }}>
                                {item.quantity ?? 0} un
                                {item.fileWidth && item.fileHeight ? ` · ${item.fileWidth}×${item.fileHeight}` : ""}
                                {item.calculatedM2 ? ` · ${item.calculatedM2} m²` : ""}
                              </span>
                            </td>

                            {/* ── Arquivo final ──
                                Só se descobria que ele não chegou ABRINDO o
                                modal e encontrando "Liberar" apagado: a
                                informação que decide se a peça é revisável
                                estava escondida atrás de um clique, numa fila
                                de 74. O "de quem depende" (a Arte) vai no title:
                                a coluna tem 140px e "Aguardando Arte" não cabe. */}
                            <td data-testid={`cell-final-file-${item.id}`} style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                              {ehMolde(item) ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                                  <span title="Molde não tem arquivo final — libera só com o thumb" style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 24, padding: "0 9px", borderRadius: 999, backgroundColor: N.n2, border: `1px solid ${T.bdark}`, color: T.strong, fontSize: 12, fontWeight: 700 }}>
                                    Não se aplica
                                  </span>
                                  {/* Prazo do molde (22/09): só o fluxo do molde o lê. */}
                                  <SeloPrazoMolde item={item} />
                                </div>
                              ) : item.finalFileUrl ? (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 24, padding: "0 9px", borderRadius: 999, backgroundColor: TOM.sucesso.bg, border: `1px solid ${TOM.sucesso.border}`, color: TOM.sucesso.text, fontSize: 12, fontWeight: 700 }}>
                                  <Check aria-hidden="true" style={{ width: 11, height: 11 }} /> Recebido
                                </span>
                              ) : (
                                <span title="A Arte ainda não enviou o arquivo final — dá para abrir e devolver, mas liberar só depois do arquivo." style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 24, padding: "0 9px", borderRadius: 999, backgroundColor: TOM.laranja.bg, border: `1px solid ${TOM.laranja.border}`, color: T.accentText, fontSize: 12, fontWeight: 700 }}>
                                  <Clock aria-hidden="true" style={{ width: 11, height: 11 }} /> Aguardando
                                </span>
                              )}
                            </td>

                            {/* Ação */}
                            <td onClick={e => e.stopPropagation()} style={{ padding: "12px 16px", textAlign: "right" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                                <button
                                  onClick={() => openModal(item)}
                                  data-testid={`button-review-${item.id}`}
                                  style={{
                                    backgroundColor: T.text, color: "#fff",
                                    border: "none", borderRadius: 6,
                                    // 12px sem caixa alta: o 10px/900 em
                                    // maiúsculas espaçadas repetido em cada uma
                                    // das 74 linhas gritava mais que a peça.
                                    fontSize: 12, fontWeight: 700,
                                    height: 32, padding: "0 14px", cursor: "pointer",
                                    transition: "background-color 0.15s",
                                  }}
                                  // #c2410c e não #ea580c no hover: branco sobre
                                  // #ea580c dá 3,6:1 — o rótulo sumia justo ao apontar.
                                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = T.accentText)}
                                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = T.text)}
                                >
                                  Revisar
                                </button>
                                {/* Reaproveitamento passa por PATCH /api/items/:id
                                    (isReuse) e por creator-review: as duas rotas
                                    são barradas em evento finalizado. */}
                                <button
                                  onClick={() => {
                                    if (selo) return;
                                    if (item.isReuse) {
                                      // Já marcada como reaproveitamento total: desfazer pede confirmação
                                      setDesfazerReuseId(item.id);
                                    } else {
                                      // Abre o diálogo para escolher total ou parcial
                                      setPartialReuseQty(Math.max(1, Number(item.quantity) - 1 || 1));
                                      setReuseDialogItemId(item.id);
                                    }
                                  }}
                                  disabled={!!selo || desfazendoReuse(item.id)}
                                  data-testid={`button-reuse-${item.id}`}
                                  aria-label={`Reaproveitamento de ${item.displayId}`}
                                  title={selo
                                    ? motivoAcaoBloqueada(selo.motivo, "marcar reaproveitamento")
                                    : item.isReuse ? "Remover marcação de reaproveitamento" : "Marcar para reaproveitamento"}
                                  style={{
                                    background: selo ? N.n2 : item.isReuse ? TOM.sucesso.bg : "none",
                                    border: selo ? `1px solid ${T.border}` : item.isReuse ? `1px solid ${TOM.sucesso.border}` : "1px solid transparent",
                                    cursor: selo ? "not-allowed" : "pointer",
                                    color: selo ? T.second : item.isReuse ? TOM.sucesso.text : T.second,
                                    padding: 6,
                                    display: "flex", alignItems: "center",
                                    borderRadius: 6, transition: "all 0.15s",
                                  }}
                                  onMouseEnter={e => {
                                    if (!selo && !item.isReuse) {
                                      (e.currentTarget as HTMLButtonElement).style.color = TOM.sucesso.text;
                                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = TOM.sucesso.bg;
                                    }
                                  }}
                                  onMouseLeave={e => {
                                    if (!selo && !item.isReuse) {
                                      (e.currentTarget as HTMLButtonElement).style.color = T.second;
                                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                                    }
                                  }}
                                >
                                  <Recycle style={{ width: 15, height: 15 }} />
                                </button>
                                {/* Toda peça desta tela está em awaiting_final_review —
                                    status TRAVADO para "solicitacao" no DELETE do servidor.
                                    Mostrar a lixeira para esse perfil só rendia um 403. */}
                                {user?.role === "admin" && (
                                  <button
                                    onClick={() => setDeleteConfirmItemId(item.id)}
                                    data-testid={`button-delete-${item.id}`}
                                    title="Excluir peça"
                                    aria-label={`Excluir a peça ${item.displayId}`}
                                    style={{
                                      background: "none", border: "none", cursor: "pointer",
                                      color: T.second, padding: 6,
                                      display: "flex", alignItems: "center",
                                      borderRadius: 6, transition: "color 0.15s",
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.color = TOM.perigo.dot)}
                                    onMouseLeave={e => (e.currentTarget.style.color = T.second)}
                                  >
                                    <Trash2 style={{ width: 15, height: 15 }} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* Table footer */}
            <div style={{
              backgroundColor: T.bg, padding: "12px 24px",
              borderTop: `1px solid ${T.border}`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              {/* O par de botoes que ficava aqui SAIU. Com as acoes na barra
                  sticky, ele virou a mesma dupla duas vezes na tela — e a copia
                  daqui era a pior das duas: contava `selectedItemIds.size` em
                  vez das pecas que de fato vao (`selecaoLote.vivas`), entao
                  prometia "Liberar 12" e mandava 9, e nao tinha o guard que
                  espelha o 409 de lote inteiro do servidor. Duas versoes da
                  mesma acao com contas diferentes e pior que nenhuma. */}
              <span style={{ fontSize: 10, fontWeight: 700, color: TI.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Mostrando {filteredItems.length} de {pendingItems.length} {pendingItems.length !== 1 ? "peças aguardando revisão" : "peça aguardando revisão"}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ── 5. REVIEW MODAL ────────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={open => { setModalOpen(open); if (!open) setReturnObservations(""); }}>
        <DialogContent className={`review-dialog-shell max-w-6xl p-0 gap-0 rounded-xl overflow-hidden flex flex-col ${HIDE_NATIVE_CLOSE}`} style={{ height: isMobile ? "94dvh" : "87vh", maxHeight: 900, maxWidth: isMobile ? "95vw" : undefined }} onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          {/* POR QUE congelar aqui: é o pior onSuccess da tela. Liberar (ou
              devolver) dispara TRÊS invalidateQueries, fecha este modal, fecha
              o AlertDialog de confirmação E faz `setSelectedItem(null)` — tudo
              no mesmo commit. `selectedItem` é a fonte de TODO o miolo: sem
              congelar, o modal esvazia (thumb, ID, tipo, patrocinadores,
              histórico) no primeiro frame do fade, e cada um dos renders da
              janela de saída ainda manda desanexa+reanexa de ref para a
              subárvore em desmontagem — o laço do React #185. Mecanismo por
              extenso em components/modal-shell.tsx. */}
          <FreezeWhileClosing open={modalOpen}>
          <DialogTitle className="sr-only">Decisão de Revisão</DialogTitle>
          <DialogDescription className="sr-only">
            Compare o thumb aprovado pelo patrocinador com o arquivo final da Arte e libere ou devolva a peça
          </DialogDescription>
          {/* ── CINCO FAIXAS HORIZONTAIS, LARGURA CHEIA ──

              A versão anterior era um layout de DUAS COLUNAS com estilo novo
              por cima: a comparação numa coluna de 56% e a decisão num painel
              à direita, com os botões empilhados numa caixa escura. Os
              defeitos vistos em produção — botões se sobrepondo, metadados
              cortados pela borda — eram CONSEQUÊNCIA dessa estrutura, não
              bugs soltos: a coluna estreita nunca teve largura para dois
              rótulos longos lado a lado, e a tira quebrava porque dividia 44%
              do modal com tudo o mais.

              Agora não existe divisão esquerda/direita no nível do modal:

                1 · cabeçalho escuro (identidade da peça + fila + X)
                2 · comparação — dois panes lado a lado, LARGURA CHEIA
                3 · metadados numa linha
                4 · decisão — botões + observações | patrocinadores/histórico
                5 · rodapé de atalhos

              Só a faixa 2 flexiona (flex: 1 1 auto, piso 200px); as outras
              quatro têm flexShrink: 0 — numa janela de 540px de altura, a
              comparação e os dois botões estão visíveis sem rolar, porque as
              faixas fixas somam ~340px e o resto é da comparação. */}
          {/* NO CELULAR O MIOLO ROLA INTEIRO. As faixas fixas somam mais que a
              tela: cabeçalho ~70 + comparação 200 (piso) + metadados ~50 +
              decisão (34vh + 26vh + folgas) ≈ 860px num aparelho de 844, cujo
              modal tem 94dvh ≈ 793. Com overflow hidden o excesso era CORTADO
              em silêncio — o fim do histórico, e com o motivo da devolução no
              topo, o rodapé da decisão. Rolando, nada some; o cabeçalho gruda
              (sticky) para a fila e o X continuarem à mão. No desktop fica
              como estava: a conta das faixas foi feita para caber. */}
          <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", ...(isMobile ? { overflowY: "auto" as const } : {}) }}>

            {/* ── 1 · CABEÇALHO ── */}
            <div style={{ flexShrink: 0, background: "linear-gradient(135deg, #1c1917, #2d2926)", padding: isMobile ? "12px 14px" : "14px 20px", display: "flex", alignItems: "center", gap: isMobile ? 10 : 14, ...(isMobile ? { position: "sticky" as const, top: 0, zIndex: 2 } : {}) }}>
              {!isMobile && (
                <div aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "rgba(249,115,22,0.14)", border: "1px solid rgba(249,115,22,0.35)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Eye style={{ width: 18, height: 18, color: TOM.laranja.border }} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: TOM.laranja.border, flexShrink: 0 }}>{selectedItem?.displayId}</span>
                  {selectedItem && <SeloKit peca={selectedItem} style={{ flexShrink: 0, alignSelf: "center" }} />}
                  <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 17, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selectedItem?.type}</span>
                  {selectedItem?.isReuse && (
                    <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", backgroundColor: TOM.sucesso.bg, color: TOM.sucesso.text, borderRadius: 999, padding: "3px 10px", flexShrink: 0 }}>
                      Reaproveitamento
                    </span>
                  )}
                </div>
                {selectedItem?.description && (
                  <p style={{ margin: "1px 0 0", fontSize: 13, color: "rgba(255,255,255,0.72)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selectedItem.description}</p>
                )}
                {(() => {
                  const ev: any = events.find((e: any) => e.id === selectedItem?.eventId);
                  if (!ev) return null;
                  // A saída é gravada no "horário de exibição" (UTC = relógio de
                  // São Paulo), como lê o chip do cabeçalho do evento na tabela.
                  // Sem timeZone "UTC" a ficha mostrava a hora 3h antes da lista.
                  const saida = ev.truckDepartureDate ? new Date(ev.truckDepartureDate) : null;
                  return (
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(255,255,255,0.72)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {ev.name}
                      {saida && " · caminhão " + saida.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }).replace(".", "").replace(" de ", " ") + " · " + saida.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}
                    </p>
                  );
                })()}
              </div>
              {/* ── A FILA mora no cabeçalho, não no corpo ──
                  Sem isto o modal é uma ficha isolada quando o trabalho é uma
                  fila de 74: decidir, o modal fecha, procurar a próxima na
                  tabela, clicar de novo. E a tabela mudou entre uma e outra (a
                  peça decidida saiu dela), então "procurar a próxima" nem é
                  procurar a linha de baixo. */}
              {filaIdx >= 0 && filteredItems.length > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => irParaFila(filaIdx - 1)}
                    disabled={!temAnterior}
                    title="Peça anterior (←)"
                    aria-label="Peça anterior"
                    data-testid="button-modal-prev"
                    style={{ width: isMobile ? 40 : 32, height: isMobile ? 40 : 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.22)", background: "transparent", color: temAnterior ? "#fff" : "rgba(255,255,255,0.35)", cursor: temAnterior ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                  >
                    <ChevronLeft style={{ width: 15, height: 15 }} />
                  </button>
                  <span
                    data-testid="text-queue-position"
                    aria-live="polite"
                    style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)", padding: "0 6px", whiteSpace: "nowrap" }}
                  >
                    {filaIdx + 1} / {filteredItems.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => irParaFila(filaIdx + 1)}
                    disabled={!temProxima}
                    title="Próxima peça (→)"
                    aria-label="Próxima peça"
                    data-testid="button-modal-next"
                    style={{ width: isMobile ? 40 : 32, height: isMobile ? 40 : 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.22)", background: "transparent", color: temProxima ? "#fff" : "rgba(255,255,255,0.35)", cursor: temProxima ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                  >
                    <ChevronRight style={{ width: 15, height: 15 }} />
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Fechar"
                style={{ width: isMobile ? 44 : 36, height: isMobile ? 44 : 36, borderRadius: 8, border: "none", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}
              >
                <X style={{ width: 17, height: 17 }} />
              </button>
            </div>

            {/* ── 1b · POR QUE ELA VOLTOU ──
                `rejectionReason` já chega em cada peça do /api/items (é coluna
                da própria peça, gravada por TODA porta de devolução) — nenhuma
                consulta nova. Ela NUNCA é zerada: quando a peça segue para
                aprovação o servidor limpa só o motivo das linhas de
                itemSponsorApprovals, não o da peça. Por isso o rótulo diz
                "última devolução" — é histórico, não pendência: uma peça
                devolvida uma vez carrega o motivo daquela vez para sempre.
                Quem revisa uma peça que já foi devolvida precisa conferir
                justamente se aquilo foi corrigido, e o motivo só existia na
                trilha, que mostra 8 eventos em texto de auditoria lá embaixo.
                Faixa fixa (flexShrink 0) e cortada em duas linhas: a
                comparação continua sendo a faixa que flexiona. */}
            {selectedItem?.rejectionReason && String(selectedItem.rejectionReason).trim() && (
              <div
                data-testid="motivo-ultima-devolucao"
                title={String(selectedItem.rejectionReason).trim()}
                style={{ flexShrink: 0, display: "flex", alignItems: "flex-start", gap: 10, padding: isMobile ? "10px 14px" : "10px 20px", backgroundColor: TOM.laranja.bg, borderBottom: `1px solid ${TOM.laranja.border}` }}
              >
                <RotateCcw aria-hidden="true" style={{ width: 15, height: 15, color: T.accentText, flexShrink: 0, marginTop: 2 }} />
                <p style={{ margin: 0, minWidth: 0, fontSize: 13, lineHeight: 1.45, color: TOM.laranja.text, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>
                  <strong style={{ fontWeight: 700 }}>Motivo da última devolução: </strong>
                  {String(selectedItem.rejectionReason).trim()}
                </p>
              </div>
            )}

            {/* ── 2 · COMPARAÇÃO — a única faixa que flexiona ──
                Os dois arquivos lado a lado na LARGURA INTEIRA do modal: é a
                comparação que esta tela existe para mostrar, e antes ela vivia
                espremida numa coluna de 56%. `min-height: 200` fecha as duas
                contas — sem piso a faixa colapsa; com 300px ela empurra os
                botões abaixo da dobra numa janela de 540px. No celular
                empilha, a única situação em que empilhar aqui é certo. */}
            <div style={{ flex: "1 1 auto", minHeight: 200, overflow: "hidden", backgroundColor: N.n2, padding: isMobile ? 12 : "14px 20px", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 10 : 14 }}>
              {[
                { label: "Aprovado pelo patrocinador", url: selectedItem?.approvalThumbUrl, empty: "Sem thumb aprovado" },
                { label: "Arquivo final da Arte", url: selectedItem?.finalFileUrl, empty: ehMolde(selectedItem) ? "Molde não tem arquivo final — revise pelo thumb" : "A Arte ainda não subiu o arquivo final" },
              ].map(({ label, url, empty }) => {
                // Caminho de rede/disco (\\10.100.1.7\...): o navegador não
                // abre nem pré-visualiza — sem moldura e sem "ampliar", só o
                // aviso apontando para o caminho copiável na tira abaixo.
                const caminhoDeRede = !!url && !isWebUrl(url);
                return (
                  <div key={label} style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 0, overflow: "hidden" }}>
                    <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: T.apoio, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0, flexShrink: 0 }}>
                      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: url ? TOM.sucesso.text : T.accentText, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
                      {url && isWebUrl(url) && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={"Ampliar: abrir " + label.toLowerCase() + " em nova aba"}
                          aria-label={"Abrir " + label.toLowerCase() + " em nova aba"}
                          style={{ display: "flex", padding: 4, borderRadius: 6, color: T.second, flexShrink: 0 }}
                        >
                          <Maximize2 style={{ width: 14, height: 14 }} />
                        </a>
                      )}
                    </p>
                    {caminhoDeRede ? (
                      <div style={{ backgroundColor: "#fff", borderRadius: 8, border: `1px solid ${T.border}`, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                        <FileImage style={{ width: 20, height: 20, color: T.muted, flexShrink: 0 }} />
                        <p style={{ fontSize: 11, fontWeight: 600, color: TI.secondary, margin: 0 }}>
                          Arquivo salvo na rede local — sem pré-visualização. Copie o caminho na tira abaixo.
                        </p>
                      </div>
                    ) : (
                    /* EIXO DEFINIDO. `max-width: 100%; max-height: 100%;
                       aspect-ratio: 3/2` sem largura nem altura resolve para
                       2px: `max-*` LIMITA um tamanho, nunca o produz. Aqui a
                       moldura toma a altura que a faixa deu (`flex: 1` dentro
                       de um pai de altura definida) e o conteúdo cabe inteiro
                       com `objectFit: contain`. */
                    <div style={{ flex: "1 1 auto", minHeight: isMobile ? 180 : 140, width: "100%", backgroundColor: "#fff", borderRadius: 8, overflow: "hidden", border: `1px solid ${T.border}`, boxShadow: "inset 0 1px 4px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {url ? (
                        <FilePreview url={url} noLink objectFit="contain" />
                      ) : (
                        <div style={{ textAlign: "center", color: TI.secondary, padding: 12 }}>
                          <FileImage style={{ width: 32, height: 32, margin: "0 auto 8px", color: T.muted }} />
                          <p style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>{empty}</p>
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── 3 · METADADOS NUMA LINHA ──
                Os cartões que quebravam em duas linhas (e a segunda era
                cortada pela borda) viraram UMA linha de blocos separados por
                filetes. Cada bloco encolhe (`min-width: 0`, valor em elipse
                com o texto completo no title); no celular a linha rola na
                horizontal — cortar em silêncio é o único desfecho proibido. */}
            <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}`, backgroundColor: "#fff", padding: isMobile ? "8px 12px" : "8px 20px", display: "flex", alignItems: "center", overflowX: isMobile ? "auto" : "hidden" }}>
              {[
                { label: "Material", value: selectedItem?.material || "—" },
                { label: "Acabamento", value: selectedItem?.finish || "—" },
                { label: "Dimensões (ARQ.)", value: selectedItem?.fileWidth && selectedItem?.fileHeight ? `${selectedItem.fileWidth}×${selectedItem.fileHeight}` : "—" },
                { label: "M²", value: selectedItem?.calculatedM2 || "—" },
              ].map(({ label, value }, i) => (
                <div key={label} style={{ flex: "1 1 0", minWidth: isMobile ? 76 : 0, padding: "2px 14px 2px " + (i === 0 ? "0" : "14px"), borderLeft: i === 0 ? "none" : `1px solid ${T.border}` }}>
                  <p style={{ fontSize: 10, color: T.apoio, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em", margin: 0, whiteSpace: "nowrap" }}>{label}</p>
                  <p title={String(value)} style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</p>
                </div>
              ))}

              {/* Quantidade — editável por teclado (role="button" + Enter/Espaço).
                  Em evento finalizado deixa de ser botão: PATCH /api/items/:id
                  passa pela guarda, então abrir o campo só levaria a um 409
                  depois de digitar. O rótulo "· editar" sai junto — oferecer e
                  negar é pior do que não oferecer. */}
              <div
                role={editingQuantity || seloSelecionado ? undefined : "button"}
                tabIndex={editingQuantity || seloSelecionado ? undefined : 0}
                aria-label={seloSelecionado ? undefined : "Editar quantidade"}
                style={{ flex: "1 1 0", minWidth: isMobile ? 104 : 96, padding: "2px 0 2px 14px", borderLeft: `1px solid ${T.border}`, cursor: seloSelecionado ? "default" : "pointer" }}
                onClick={() => {
                  if (!editingQuantity && !seloSelecionado) {
                    setEditingQuantity(true);
                    setTimeout(() => quantityInputRef.current?.select(), 50);
                  }
                }}
                onKeyDown={e => {
                  if (editingQuantity || seloSelecionado) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setEditingQuantity(true);
                    setTimeout(() => quantityInputRef.current?.select(), 50);
                  }
                }}
                title={seloSelecionado
                  ? motivoAcaoBloqueada(seloSelecionado.motivo, "mudar a quantidade")
                  : "Clique para editar a quantidade"}
              >
                <p style={{ fontSize: 10, color: T.apoio, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em", margin: 0, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                  Qtd
                  {!seloSelecionado && (
                    <span style={{ fontSize: 10, color: T.accentText, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>· editar</span>
                  )}
                </p>
                {editingQuantity ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }} onClick={e => e.stopPropagation()}>
                    <input
                      ref={quantityInputRef}
                      type="number"
                      min={1}
                      value={quantityValue}
                      onChange={e => setQuantityValue(Math.max(1, parseInt(e.target.value) || 1))}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          updateQuantityMutation.mutate({ itemId: selectedItem.id, quantity: quantityValue });
                        }
                        if (e.key === "Escape") {
                          setQuantityValue(selectedItem.quantity ?? 1);
                          setEditingQuantity(false);
                        }
                      }}
                      style={{
                        width: 52, padding: "2px 6px", fontSize: 13, fontWeight: 700,
                        border: `1.5px solid ${T.accent}`, borderRadius: 6,
                        color: TI.text, background: TOM.laranja.bg,
                      }}
                      data-testid="input-quantity-edit"
                      autoFocus
                    />
                    {/* OK e ✕ com alvo de 40 no celular: eram ~22px de altura,
                        colados um no outro — errar o dedo descartava a edição. */}
                    <button
                      onClick={() => updateQuantityMutation.mutate({ itemId: selectedItem.id, quantity: quantityValue })}
                      disabled={updateQuantityMutation.isPending}
                      style={{ minWidth: isMobile ? 44 : 32, height: isMobile ? 40 : 28, padding: "0 10px", fontSize: 12, fontWeight: 700, backgroundColor: T.accentText, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
                      data-testid="button-confirm-quantity"
                      aria-label="Salvar a quantidade"
                    >
                      {updateQuantityMutation.isPending ? "…" : "OK"}
                    </button>
                    <button
                      onClick={() => { setQuantityValue(selectedItem.quantity ?? 1); setEditingQuantity(false); }}
                      style={{ minWidth: isMobile ? 40 : 28, height: isMobile ? 40 : 28, padding: 0, fontSize: 12, fontWeight: 700, backgroundColor: T.low, color: T.apoio, border: "none", borderRadius: 6, cursor: "pointer" }}
                      data-testid="button-cancel-quantity"
                      aria-label="Cancelar a edição da quantidade"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: "2px 0 0" }}>
                    {selectedItem?.quantity ?? "—"}x
                  </p>
                )}
              </div>

              {/* Copiar caminho da rede — o único gesto útil para o TIF no
                  servidor local; "Abrir" para caminho de rede é promessa que
                  nunca funciona. */}
              {selectedItem?.finalFileUrl && (
                <button
                  type="button"
                  title={"Copiar caminho: " + selectedItem.finalFileUrl}
                  aria-label="Copiar caminho do arquivo final"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedItem.finalFileUrl!)
                      .then(() => toast({ title: "Caminho copiado", description: "Cole no Explorer para abrir o arquivo." }))
                      .catch(() => toast({ title: "Não foi possível copiar", description: "Selecione o caminho e copie manualmente.", variant: "destructive" }));
                  }}
                  style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginLeft: 14, minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : undefined, padding: "8px 12px", borderRadius: 6, border: `1px solid ${T.border}`, backgroundColor: "#fff", color: T.apoio, cursor: "pointer", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}
                >
                  <Copy style={{ width: 13, height: 13 }} />
                  {!isMobile && "Copiar caminho da rede"}
                </button>
              )}
            </div>

            {/* ── 4 · DECISÃO — faixa clara, largura cheia ──
                Nada de caixa escura em volta dos botões: o escuro é do
                cabeçalho. À esquerda os dois botões LADO A LADO com as
                observações abaixo; à direita patrocinadores e histórico. As
                duas colunas com teto de 32vh e rolagem própria — sem o teto
                elas crescem até a altura do conteúdo e o modal inteiro passa a
                rolar, deixando as decisões fora de vista na abertura.

                Sobre as maiúsculas: "LIBERAR PARA PRODUÇÃO" com letterSpacing
                media ~40% mais que "Liberar para produção" e era o que
                produzia a sobreposição dos botões. Caixa normal resolve na
                origem — sem elipse, sem empilhar. */}
            <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}`, backgroundColor: T.bg, padding: isMobile ? 12 : "14px 20px", display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 24 }}>
              <div className="review-modal-scroll" style={{ flex: isMobile ? undefined : "1 1 0", minWidth: 0, minHeight: 0, maxHeight: isMobile ? "34vh" : "32vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                {/* PATCH creator-review (liberar) e PATCH return-to-arte
                    (devolver) são as duas rotas mais claramente barradas pela
                    guarda de evento finalizado. Ficam visíveis e DESABILITADAS,
                    com o motivo — sumi-las deixaria a ficha sem explicação
                    nenhuma para a ausência. */}
                <div style={{ display: "flex", gap: 10, flexWrap: isMobile ? "wrap" : "nowrap" }}>
                  <button
                    onClick={() => { if (!seloSelecionado) setReleaseConfirmOpen(true); }}
                    disabled={!!seloSelecionado || creatorReviewMutation.isPending || semArquivoParaLiberar}
                    data-testid="button-release-modal"
                    title={seloSelecionado
                      ? motivoAcaoBloqueada(seloSelecionado.motivo, "liberar para produção")
                      : semArquivoParaLiberar ? "Arquivo final não enviado" : ""}
                    style={{
                      flex: "1 1 0", minWidth: 0, height: 48,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      borderRadius: 8,
                      border: seloSelecionado || semArquivoParaLiberar ? `1px solid ${T.border}` : "none",
                      backgroundColor: seloSelecionado || semArquivoParaLiberar ? N.n2 : T.accentText,
                      /* #6f6a64 sobre #f5f5f4 → 4,91:1: o "off" continua legível
                         porque desabilitado-por-evento-finalizado é o único
                         estado off desta tela que carrega informação nova. */
                      color: seloSelecionado || semArquivoParaLiberar ? T.second : "#fff",
                      fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap",
                      cursor: seloSelecionado || semArquivoParaLiberar || creatorReviewMutation.isPending ? "not-allowed" : "pointer",
                    }}
                  >
                    <Check style={{ width: 16, height: 16, flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {creatorReviewMutation.isPending ? "Liberando..."
                        : propostaDaFicha ? propostaDaFicha.rotulo
                        : "Liberar para produção"}
                    </span>
                  </button>
                  <button
                    onClick={() => { if (!seloSelecionado) setReturnConfirmOpen(true); }}
                    disabled={!!seloSelecionado}
                    title={seloSelecionado ? motivoAcaoBloqueada(seloSelecionado.motivo, "devolver para a Arte") : undefined}
                    data-testid="button-return-toggle"
                    style={{
                      flex: "1 1 0", minWidth: 0, height: 48,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      borderRadius: 8, border: `1px solid ${T.border}`,
                      backgroundColor: seloSelecionado ? N.n2 : "#fff",
                      color: seloSelecionado ? T.second : T.text,
                      fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap",
                      cursor: seloSelecionado ? "not-allowed" : "pointer",
                    }}
                  >
                    <RotateCcw style={{ width: 15, height: 15, flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>Devolver para Arte</span>
                  </button>
                  {/* REAPROVEITAR, aqui também. O gesto existia só na linha da
                      tabela; quem revisa em fila (26/48) decide dentro da
                      ficha e não quer fechar, achar a linha, clicar. É o
                      MESMO fluxo do botão da linha — abre o diálogo de
                      total/parcial, ou desfaz a marcação — para não nascer
                      um segundo caminho para a mesma decisão. Terceiro na
                      ordem e mais estreito de propósito: é a decisão menos
                      frequente das três, e os dois primeiros não podem
                      perder largura (a colisão de rótulos já aconteceu). */}
                  <button
                    onClick={() => {
                      if (seloSelecionado || !selectedItem) return;
                      if (selectedItem.isReuse) {
                        setDesfazerReuseId(selectedItem.id);
                      } else {
                        setPartialReuseQty(Math.max(1, Number(selectedItem.quantity) - 1 || 1));
                        setReuseDialogItemId(selectedItem.id);
                      }
                    }}
                    disabled={!!seloSelecionado || toggleReuseMutation.isPending}
                    title={seloSelecionado
                      ? motivoAcaoBloqueada(seloSelecionado.motivo, "marcar reaproveitamento")
                      : selectedItem?.isReuse ? "Remover marcação de reaproveitamento" : "Reaproveitar — total ou parte das unidades, sem nova produção"}
                    aria-label={selectedItem?.isReuse ? "Remover marcação de reaproveitamento" : "Reaproveitar"}
                    aria-pressed={!!selectedItem?.isReuse}
                    data-testid="button-reuse-modal"
                    style={{
                      flex: isMobile ? "1 1 100%" : "0 0 auto", height: 48, padding: "0 16px",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      borderRadius: 8,
                      border: seloSelecionado ? `1px solid ${T.border}` : selectedItem?.isReuse ? `1px solid ${TOM.sucesso.border}` : `1px solid ${T.border}`,
                      backgroundColor: seloSelecionado ? N.n2 : selectedItem?.isReuse ? TOM.sucesso.bg : "#fff",
                      /* #15803d sobre #dcfce7 = 4,6:1; #1c1917 sobre branco. */
                      color: seloSelecionado ? T.second : selectedItem?.isReuse ? TOM.sucesso.text : T.text,
                      fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap",
                      cursor: seloSelecionado ? "not-allowed" : "pointer",
                    }}
                  >
                    <Recycle style={{ width: 15, height: 15, flexShrink: 0 }} />
                    {selectedItem && desfazendoReuse(selectedItem.id) ? "Desfazendo…" : selectedItem?.isReuse ? "Reaproveitada · desfazer" : "Reaproveitar"}
                  </button>
                </div>
                {/* A TRAVA DA SOLICITAÇÃO, também aqui: travada, o selo com o
                    motivo e o Destravar; livre, o Travar (com motivo) — as
                    mesmas rotas e o mesmo texto da Gráfica. */}
                {pecaDaFicha && (fichaTravada ? (
                  <div role="status" data-testid="selo-travada-revisao" title={fraseDaTrava(pecaDaFicha)} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "6px 10px", borderRadius: 8, background: TOM.perigo.text, color: T.surface, fontSize: 12, fontWeight: 700, lineHeight: 1.4 }}>
                    <Lock aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0 }} />
                    <span style={{ flex: "1 1 160px", minWidth: 0, overflowWrap: "anywhere" }}>{seloDaTrava(pecaDaFicha)}</span>
                    {podeTravar(user?.role) && (
                      <button
                        type="button"
                        onClick={() => destravarMutation.mutate({ itemId: pecaDaFicha.id, displayId: pecaDaFicha.displayId })}
                        disabled={destravarMutation.isPending}
                        data-testid="button-destravar-revisao"
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: isMobile ? 44 : 30, padding: "0 10px", borderRadius: 6, border: `1px solid ${TOM.perigo.border}`, background: T.surface, color: TOM.perigo.text, fontSize: 12, fontWeight: 700, cursor: destravarMutation.isPending ? "wait" : "pointer", whiteSpace: "nowrap" }}
                      >
                        <Unlock aria-hidden="true" style={{ width: 12, height: 12 }} /> {destravarMutation.isPending ? "Destravando…" : "Destravar"}
                      </button>
                    )}
                  </div>
                ) : podeTravar(user?.role) && !seloSelecionado ? (
                  <button
                    type="button"
                    onClick={() => { setMotivoDaTrava(""); setTravandoItem(pecaDaFicha); }}
                    data-testid="button-travar-revisao"
                    title="Travar a peça: mesmo liberada, a Gráfica não consegue fazê-la andar até alguém da Solicitação destravar"
                    style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, minHeight: isMobile ? 44 : 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${T.bdark}`, background: T.surface, color: TOM.perigo.text, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    <Lock aria-hidden="true" style={{ width: 12, height: 12 }} /> Travar
                  </button>
                ) : null)}
                {/* PARA ONDE A PEÇA VAI, dito ANTES do clique. "Liberei — foi
                    para a Gráfica?" e "Devolvi — quem recebe?" eram as duas
                    perguntas de quem revisava a primeira vez; o rótulo do botão
                    (fixado por teste) diz a ação, esta linha diz o destino. Sem
                    arquivo final, o porquê do Liberar travado deixa de morar só
                    no `title`, que não aparece em botão desabilitado nem no
                    toque. Em evento finalizado o aviso cinza abaixo já explica. */}
                {SOLICITACAO_AO_ESTOQUE_ATIVA && selectedItem && (
                  <RespostaDoEstoqueNaFicha item={selectedItem} usar={usarMenos} onUsar={setUsarMenos} />
                )}
                {!seloSelecionado && selectedItem && (
                  <p data-testid="destino-da-decisao" style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: T.apoio }}>
                    {prontaParaLiberar(selectedItem) ? (
                      <>
                        <strong style={{ color: T.text }}>Liberar</strong>: {reaproveitamentoTotal(selectedItem)
                          ? "sai da Revisão Final e vai direto para Impresso / Acabamento (reaproveitamento total, sem impressão)."
                          : "sai da Revisão Final e entra na fila da Gráfica como Pronto para Produção."}{" "}
                        <strong style={{ color: T.text }}>Devolver</strong>: volta para a Arte, que é avisada com o seu motivo.
                      </>
                    ) : (
                      <>
                        <strong style={{ color: TOM.alerta.text }}>Liberar fica disponível quando a Arte enviar o arquivo final.</strong>{" "}
                        Dá para devolver agora, se algo já precisa mudar.
                      </>
                    )}
                  </p>
                )}
                {seloSelecionado && (
                  <p
                    role="status"
                    data-testid="aviso-ficha-evento-finalizado"
                    style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: T.strong, backgroundColor: N.n2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px" }}
                  >
                    <strong style={{ color: T.text }}>{seloSelecionado.label}.</strong>{" "}
                    {seloSelecionado.hint}{" "}
                    Nesta peça continua liberado apenas excluir.
                  </p>
                )}
                {selectedItem?.isReuse && (
                  <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: TOM.sucesso.text, backgroundColor: TOM.sucesso.bg, border: `1px solid ${TOM.sucesso.border}`, borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                    <Recycle style={{ width: 14, height: 14, flexShrink: 0 }} />
                    <span>Peça de reaproveitamento — não será enviada para nova produção gráfica. Verifique o arquivo e libere normalmente.</span>
                  </p>
                )}

                {/* Observações do item — campo próprio, sempre editável.
                    Existe para anotar sem ter de devolver a peça. */}
                <div style={{ backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: 8, padding: "10px 12px", display: "flex", gap: 8 }}>
                  <AlertCircle style={{ width: 14, height: 14, color: TOM.alerta.text, flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* "Salvar observação libera a peça?" — não. A frase curta
                        separa o recado da decisão, que é o que o bloco existe
                        para permitir. */}
                    <p style={{ fontSize: 11, fontWeight: 700, color: TOM.alerta.text, margin: "0 0 6px" }}>
                      Observações do item <span style={{ fontWeight: 500 }}>· fica gravada na peça, sem liberar nem devolver</span>
                    </p>
                    <textarea
                      placeholder="Deixe um recado sobre esta peça (cor, acabamento, posição...)"
                      value={cardObservations}
                      onChange={e => setCardObservations(e.target.value)}
                      data-testid="textarea-item-observations"
                      style={{
                        width: "100%", minHeight: 48, padding: "8px 10px", borderRadius: 6,
                        border: `1px solid ${TOM.alerta.border}`, backgroundColor: TOM.alerta.bg,
                        color: TOM.alerta.text, fontSize: 13, resize: "vertical",
                        fontFamily: "inherit", boxSizing: "border-box",
                      }}
                    />
                    {cardObservations !== (selectedItem?.observations || "") && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        {/* Salvar observação é PATCH /api/items/:id, a mesma
                            rota (e a mesma guarda) da edição de quantidade. */}
                        <button
                          onClick={() => { if (!seloSelecionado && selectedItem) updateObservationsMutation.mutate({ itemId: selectedItem.id, observations: cardObservations }); }}
                          disabled={!!seloSelecionado || updateObservationsMutation.isPending}
                          title={seloSelecionado ? motivoAcaoBloqueada(seloSelecionado.motivo, "salvar a observação") : undefined}
                          data-testid="button-save-observations"
                          style={{
                            padding: "6px 14px", borderRadius: 6,
                            border: seloSelecionado ? `1px solid ${T.border}` : "none",
                            backgroundColor: seloSelecionado ? N.n2 : TOM.alerta.text,
                            color: seloSelecionado ? T.second : "#fff",
                            fontSize: 12, fontWeight: 700, cursor: seloSelecionado || updateObservationsMutation.isPending ? "not-allowed" : "pointer",
                          }}
                        >
                          {updateObservationsMutation.isPending ? "Salvando..." : "Salvar observação"}
                        </button>
                        <button
                          onClick={() => setCardObservations(selectedItem?.observations || "")}
                          style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "none", color: TOM.alerta.text, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                          Descartar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Direita da faixa: patrocinadores e histórico, com o mesmo
                  teto de 32vh — listas crescem, decisões não podem descer. */}
              <div className="review-modal-scroll" style={{ flex: "1 1 0", minWidth: 0, minHeight: 0, maxHeight: isMobile ? "26vh" : "32vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
                {(selectedItem?.sponsors?.length ?? 0) > 0 && (
                  <div>
                    <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TI.secondary, paddingBottom: 8, borderBottom: `1px solid ${N.n3}`, margin: "0 0 10px" }}>
                      Patrocinadores da peça
                    </h3>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {selectedItem.sponsors.map((s: any) => (
                        <span key={s.id} style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, backgroundColor: N.n2, border: `1px solid ${T.border}`, color: TI.secondary }}>
                          {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TI.secondary, paddingBottom: 8, borderBottom: `1px solid ${N.n3}`, margin: "0 0 14px" }}>
                    Histórico
                  </h3>
                  {historicoCarregando ? (
                    <p role="status" style={{ fontSize: 13, color: T.apoio, margin: 0 }}>Carregando o histórico…</p>
                  ) : itemAuditLogs.length === 0 ? (
                    <p style={{ fontSize: 13, color: TI.secondary, margin: 0 }}>Sem histórico disponível.</p>
                  ) : (
                    <div style={{ position: "relative", paddingLeft: 24 }}>
                      <div style={{ position: "absolute", left: 11, top: 8, bottom: 0, width: 2, backgroundColor: N.n3 }} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                        {itemAuditLogs.map((log: any, idx: number) => {
                          const cfg = getLogCfg(log);
                          return (
                            <div key={log.id || idx} style={{ position: "relative" }}>
                              <span style={{
                                position: "absolute", left: -22, top: 2,
                                width: 16, height: 16, borderRadius: "50%",
                                backgroundColor: "#fff", border: `4px solid ${cfg.dot}`, zIndex: 1,
                              }} />
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                                <div>
                                  <p style={{ fontSize: 13, fontWeight: 700, color: cfg.text, margin: 0 }}>{cfg.label}</p>
                                  {log.userName && <p style={{ fontSize: 10, color: TI.secondary, margin: "2px 0 0" }}>{log.userName}</p>}
                                  {log.details && log.action && (
                                    <p style={{ fontSize: 11, fontStyle: "italic", color: TI.secondary, backgroundColor: T.low, padding: "6px 8px", borderRadius: 6, margin: "6px 0 0" }}>
                                      "{log.details}"
                                    </p>
                                  )}
                                </div>
                                <span style={{ fontSize: 10, fontWeight: 700, color: T.second, whiteSpace: "nowrap", fontFamily: "monospace" }}>
                                  {log.createdAt ? new Date(log.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── 5 · RODAPÉ de atalhos: só no desktop — no mobile não há
                teclado físico e o rodapé roubava altura do modal. */}
            {!isMobile && (
              <div style={{ padding: "12px 20px", backgroundColor: T.bg, borderTop: `1px solid ${N.n3}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: TI.secondary, textTransform: "uppercase", letterSpacing: "0.08em" }}>Atalhos:</span>
                  {([
                    // A confirmação abre com o foco no "Liberar": Enter de
                    // novo confirma. Dito aqui para ninguém procurar o mouse.
                    ["Enter", "liberar (Enter de novo confirma)"],
                    ["D", "devolver"],
                    ["← →", "peça anterior / próxima"],
                    ["Esc", "fechar"],
                  ] as const).map(([tecla, oque]) => (
                    <Fragment key={tecla}>
                      <span style={{ fontSize: 10, fontWeight: 900, backgroundColor: T.border, padding: "2px 6px", borderRadius: 6, color: TI.text, whiteSpace: "nowrap" }}>{tecla}</span>
                      <span style={{ fontSize: 10, color: TI.secondary, whiteSpace: "nowrap" }}>{oque}</span>
                    </Fragment>
                  ))}
                </div>
              </div>
            )}
          </div>
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>

      {/* ── CONFIRM DIALOGS ─────────────────────────────────────────────── */}

      {/* Release single */}
      <AlertDialog open={releaseConfirmOpen} onOpenChange={setReleaseConfirmOpen}>
        {/* FOCO NO "LIBERAR", não no Cancelar (o padrão do Radix). Quem chega
            aqui pelo atalho Enter da ficha apertava Enter de novo e CANCELAVA:
            revisar em fila pelo teclado exigia Tab a cada peça. Liberar não
            destrói nada — é o caminho que a tela existe para percorrer —, e
            a confirmação continua existindo porque a peça sai para impressão. */}
        <AlertDialogContent
          className="review-confirm-content"
          onOpenAutoFocus={(e) => { e.preventDefault(); botaoConfirmarLiberarRef.current?.focus(); }}
        >
          {/* POR QUE congelar aqui: o mesmo onSuccess que fecha esta confirmação
              também faz `setSelectedItem(null)` — e é `selectedItem` que
              escreve o ID e o tipo da peça na descrição. Sem congelar, a frase
              inteira some antes do diálogo terminar de sair. */}
          <FreezeWhileClosing open={releaseConfirmOpen}>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar para produção</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedItem && (
                <span>
                  <strong>{selectedItem.displayId}</strong> — {selectedItem.type} sai da Revisão Final e
                  {reaproveitamentoTotal(selectedItem)
                    ? <> vai direto para <strong>Impresso / Acabamento</strong>, na conferência da Gráfica: é reaproveitamento total e não passa pela impressão.</>
                    : <> entra na fila da Gráfica como <strong>Pronto para Produção</strong>. Se algo estiver errado depois, a Gráfica pode devolvê-la para a Revisão Final.</>}
                  {propostaDaFicha && propostaDaFicha.reaproveitadas > 0 && (
                    <span data-testid="confirmacao-com-estoque" style={{ display: "block", marginTop: 8, color: TOM.sucesso.text }}>
                      <strong>{propostaDaFicha.reaproveitadas} un. vêm do estoque</strong> como reaproveitamento
                      {propostaDaFicha.aProduzir > 0 ? <> e a Gráfica produz as outras {propostaDaFicha.aProduzir}.</> : <>: nada a produzir, a peça vai direto para Impresso / Acabamento.</>}
                    </span>
                  )}
                  {fichaTravada && pecaDaFicha && (
                    <span data-testid="confirmacao-travada" style={{ display: "block", marginTop: 8, color: TOM.perigo.text }}>
                      <strong>{seloDaTrava(pecaDaFicha)}.</strong> Liberar mantendo a trava leva a peça à fila da Gráfica, mas ela não anda lá até alguém destravar.
                    </span>
                  )}
                  {pedidoEmAberto && (
                    <span data-testid="confirmacao-pedido-em-aberto" style={{ display: "block", marginTop: 8, color: TOM.alerta.text }}>
                      <strong>Liberar sem esperar a resposta do estoque?</strong> O pedido continua aberto: se a Gráfica atender, o reaproveitamento entra direto na peça já liberada e você é avisada.
                    </span>
                  )}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-release-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              ref={botaoConfirmarLiberarRef}
              // Com o foco já no botão, o repeat de um Enter SEGURADO (o mesmo
              // aperto que abriu esta confirmação) ativaria o clique sozinho.
              // Barrar o repeat obriga soltar e apertar de novo: confirmar
              // continua a um Enter, mas nunca por inércia do dedo.
              onKeyDown={(e) => { if (e.repeat) e.preventDefault(); }}
              onClick={() => selectedItem && creatorReviewMutation.mutate({
                itemId: selectedItem.id,
                ...(propostaDaFicha && usarMenos != null ? { corpo: { reuseQty: propostaDaFicha.reaproveitadas, peloEstoque: true as const } } : {}),
                ...(fichaTravada ? { trava: "manter" as const } : {}),
              })}
              disabled={creatorReviewMutation.isPending}
              style={{ backgroundColor: TI.text, color: "#fff" }}
              data-testid="button-release-confirm"
            >
              {creatorReviewMutation.isPending ? "Liberando..." : fichaTravada ? "Liberar mantendo a trava" : "Liberar"}
            </AlertDialogAction>
            {/* Travada: a segunda saída libera E destrava na mesma gravação. */}
            {fichaTravada && (
              <AlertDialogAction
                onKeyDown={(e) => { if (e.repeat) e.preventDefault(); }}
                onClick={() => selectedItem && creatorReviewMutation.mutate({
                  itemId: selectedItem.id,
                  ...(propostaDaFicha && usarMenos != null ? { corpo: { reuseQty: propostaDaFicha.reaproveitadas, peloEstoque: true as const } } : {}),
                  trava: "destravar",
                })}
                disabled={creatorReviewMutation.isPending}
                style={{ backgroundColor: T.accentText, color: "#fff" }}
                data-testid="button-release-destravar"
              >
                Liberar e destravar
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
          </FreezeWhileClosing>
        </AlertDialogContent>
      </AlertDialog>

      {/* Return to Arte from card (quick) */}
      <AlertDialog open={returnConfirmOpen} onOpenChange={setReturnConfirmOpen}>
        <AlertDialogContent className="review-confirm-content">
          {/* POR QUE congelar aqui: o onSuccess da devolução fecha este diálogo,
              zera `selectedItem` (o ID na descrição) e ainda esvazia
              `returnObservations` — o texto que a pessoa acabou de escrever
              sumia do textarea à vista, no meio do fade. */}
          <FreezeWhileClosing open={returnConfirmOpen}>
          <AlertDialogHeader>
            <AlertDialogTitle>Devolver para Arte</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedItem && <span><strong>{selectedItem.displayId}</strong> sai da Revisão Final e volta para a Arte. Quem recebe é a Arte: ela é avisada com o motivo que você escrever abaixo.</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div style={{ padding: 0 }}>
            {ehMolde(selectedItem) ? (
              <p data-testid="aviso-devolucao-molde" style={{ margin: "0 0 12px", fontSize: 12, lineHeight: 1.5, color: T.strong, backgroundColor: N.n2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px" }}>
                Molde não tem Finalização: ele volta para o começo da Arte, <strong>com o thumb</strong>, que a Arte corrige e reenvia.
              </p>
            ) : seletorDestino}
            <textarea
              placeholder="Descreva as alterações necessárias..."
              aria-label="Motivo da devolução para a Arte"
              value={returnObservations}
              onChange={e => setReturnObservations(e.target.value)}
              data-testid="textarea-return-quick"
              className="w-full min-h-20 p-2 border rounded-md bg-background text-foreground resize-none text-sm"
            />
            {contadorDoMotivo(returnObservations)}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-return-cancel" onClick={() => { setReturnObservations(""); }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedItem && returnToArteMutation.mutate({ itemId: selectedItem.id, notes: returnObservations, destino: ehMolde(selectedItem) ? "arte" : destinoDevolucao })}
              disabled={returnToArteMutation.isPending || motivoCurto(returnObservations)}
              title={motivoCurto(returnObservations) ? avisoMotivoCurto : undefined}
              style={{ backgroundColor: TI.text, color: "#fff" }}
              data-testid="button-return-confirm"
            >
              {returnToArteMutation.isPending ? "Devolvendo..." : "Devolver para Arte"}
            </AlertDialogAction>
          </AlertDialogFooter>
          </FreezeWhileClosing>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk release */}
      <AlertDialog open={bulkReleaseConfirmOpen} onOpenChange={setBulkReleaseConfirmOpen}>
        <AlertDialogContent className="review-confirm-content">
          {/* POR QUE congelar aqui: o onSuccess troca `selectedItemIds` pelo
              conjunto do que FALHOU e fecha o diálogo no mesmo commit. O
              título é contado a partir desse conjunto — "Liberar 12 itens"
              virava "Liberar 0 itens" enquanto a caixa saía de cena. */}
          <FreezeWhileClosing open={bulkReleaseConfirmOpen}>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar {loteDeLiberar.prontas.length} {loteDeLiberar.prontas.length === 1 ? "peça" : "peças"}</AlertDialogTitle>
            <AlertDialogDescription>
              {loteDeLiberar.prontas.length === 1 ? "A peça sai" : `As ${loteDeLiberar.prontas.length} peças saem`} da Revisão Final
              {reaproveitadasNoLote > 0 && reaproveitadasNoLote === loteDeLiberar.prontas.length
                ? <> e {reaproveitadasNoLote === 1 ? "vai" : "vão"} direto para Impresso / Acabamento (conferência da Gráfica): reaproveitamento total, sem impressão e sem precisar de arquivo final.</>
                : <> e {loteDeLiberar.prontas.length === 1 ? "entra" : "entram"} na fila da Gráfica como Pronto para Produção.</>}
              {reaproveitadasNoLote > 0 && reaproveitadasNoLote < loteDeLiberar.prontas.length && (
                <span data-testid="aviso-bulk-release-reaproveitadas" style={{ display: "block", marginTop: 8 }}>
                  Exceção: {reaproveitadasNoLote === 1 ? "1 é" : `${reaproveitadasNoLote} são`} de reaproveitamento total e {reaproveitadasNoLote === 1 ? "vai" : "vão"} direto para Impresso / Acabamento (conferência da Gráfica), sem impressão e sem precisar de arquivo final.
                </span>
              )}
              {propostasDoLote.some(x => x.reaproveitadas > 0) && (
                <span data-testid="aviso-bulk-release-estoque" style={{ display: "block", marginTop: 8, color: TOM.sucesso.text }}>
                  <strong>{resumoDoLoteComEstoque(loteDeLiberar.prontas.length, propostasDoLote)}</strong> — entram com o que o estoque atendeu, sem digitar nada.
                </span>
              )}
              {/* FICAM DE FORA, dito antes: sem arquivo final o servidor recusa
                  (reaproveitamento total não conta — não imprime), e travada
                  pede a escolha da trava, que é da ficha. Nenhuma das duas vai;
                  as duas seguem marcadas com o motivo na linha. */}
              {loteDeLiberar.nSemArquivo > 0 && (
                <span data-testid="aviso-bulk-release-sem-arquivo" style={{ display: "block", marginTop: 8 }}>
                  {loteDeLiberar.nSemArquivo === 1 ? "1 ainda não tem" : `${loteDeLiberar.nSemArquivo} ainda não têm`} arquivo final da Arte e {loteDeLiberar.nSemArquivo === 1 ? "fica de fora — continua marcada" : "ficam de fora — continuam marcadas"}.
                </span>
              )}
              {loteDeLiberar.nTravadas > 0 && (
                <span data-testid="aviso-bulk-release-travadas" style={{ display: "block", marginTop: 8 }}>
                  {loteDeLiberar.nTravadas === 1 ? "1 está travada" : `${loteDeLiberar.nTravadas} estão travadas`} pela Solicitação e {loteDeLiberar.nTravadas === 1 ? "fica" : "ficam"} de fora: libere pela ficha, escolhendo destravar ou manter a trava.
                </span>
              )}
              {selecaoLote.finalizadas > 0 && (
                <span data-testid="aviso-bulk-release-finalizadas" style={{ display: "block", marginTop: 8 }}>
                  {avisoLoteFinalizadas()}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-bulk-release-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkReleaseMutation.mutate({ prontas: loteDeLiberar.prontas, deFora: loteDeLiberar.deFora })}
              disabled={bulkReleaseMutation.isPending || loteDeLiberar.prontas.length === 0}
              style={{ backgroundColor: TI.text, color: "#fff" }}
              data-testid="button-bulk-release-confirm"
            >
              {bulkReleaseMutation.isPending
                ? "Liberando..."
                : selecaoLote.finalizadas > 0 || loteDeLiberar.nFora > 0 ? `Liberar ${loteDeLiberar.prontas.length === 1 ? "a pronta" : `as ${loteDeLiberar.prontas.length} prontas`}` : "Liberar todas"}
            </AlertDialogAction>
          </AlertDialogFooter>
          </FreezeWhileClosing>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk return */}
      <AlertDialog open={bulkReturnConfirmOpen} onOpenChange={setBulkReturnConfirmOpen}>
        <AlertDialogContent className="review-confirm-content">
          {/* POR QUE congelar aqui: o onSuccess fecha, reescreve
              `selectedItemIds` (que conta o título) e esvazia
              `bulkReturnObservations` (que é o valor do textarea) no mesmo
              commit — dois campos visíveis apagando durante o fade. */}
          <FreezeWhileClosing open={bulkReturnConfirmOpen}>
          <AlertDialogHeader>
            <AlertDialogTitle>Devolver {selecaoLote.vivas.length} {selecaoLote.vivas.length === 1 ? "peça" : "peças"} para a Arte</AlertDialogTitle>
            <AlertDialogDescription>
              {selecaoLote.vivas.length === 1 ? "A peça sai" : `As ${selecaoLote.vivas.length} peças saem`} da Revisão Final e {selecaoLote.vivas.length === 1 ? "volta" : "voltam"} para a Arte, que é avisada com o motivo escrito abaixo.
              {selecaoLote.finalizadas > 0 && (
                <span data-testid="aviso-bulk-return-finalizadas" style={{ display: "block", marginTop: 8 }}>
                  {avisoLoteFinalizadas()}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div style={{ padding: 0 }}>
            {!loteSoDeMoldes && seletorDestino}
            {moldesNoLote > 0 && (
              <p data-testid="aviso-bulk-return-moldes" style={{ margin: "0 0 12px", fontSize: 12, lineHeight: 1.5, color: T.strong, backgroundColor: N.n2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px" }}>
                {loteSoDeMoldes
                  ? (moldesNoLote === 1 ? "O molde volta" : `Os ${moldesNoLote} moldes voltam`)
                  : (moldesNoLote === 1 ? "1 molde volta" : `${moldesNoLote} moldes voltam`)} para o começo da Arte, com o thumb — molde não tem Finalização{loteSoDeMoldes ? "." : ", seja qual for a escolha acima."}
              </p>
            )}
            <textarea
              placeholder="Descreva o motivo da devolução..."
              aria-label="Motivo da devolução das peças para a Arte"
              value={bulkReturnObservations}
              onChange={e => setBulkReturnObservations(e.target.value)}
              data-testid="textarea-bulk-return"
              className="w-full min-h-20 p-2 border rounded-md bg-background text-foreground resize-none text-sm"
            />
            {contadorDoMotivo(bulkReturnObservations)}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-bulk-return-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // a mutation controla o fechamento (mantém aberto em erro)
                bulkReturnMutation.mutate({ ids: selecaoLote.vivas, notes: bulkReturnObservations, destino: destinoDevolucao });
              }}
              disabled={bulkReturnMutation.isPending || motivoCurto(bulkReturnObservations) || selecaoLote.vivas.length === 0}
              title={motivoCurto(bulkReturnObservations) ? avisoMotivoCurto : undefined}
              style={{ backgroundColor: TI.text, color: "#fff" }}
              data-testid="button-bulk-return-confirm"
            >
              {bulkReturnMutation.isPending ? "Devolvendo..." : "Devolver para Arte"}
            </AlertDialogAction>
          </AlertDialogFooter>
          </FreezeWhileClosing>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk reuse — reaproveitamento TOTAL em lote. O parcial fica no ícone
          da linha, onde a quantidade é decidida peça a peça. */}
      <AlertDialog open={bulkReuseConfirmOpen} onOpenChange={setBulkReuseConfirmOpen}>
        <AlertDialogContent className="review-confirm-content">
          {/* Mesmo congelamento dos outros lotes: o onSuccess reescreve
              `selectedItemIds` (que conta o título) e fecha no mesmo commit. */}
          <FreezeWhileClosing open={bulkReuseConfirmOpen}>
          <AlertDialogHeader>
            <AlertDialogTitle>Reaproveitar {selecaoLote.vivas.length} {selecaoLote.vivas.length === 1 ? "peça" : "peças"}</AlertDialogTitle>
            <AlertDialogDescription>
              {selecaoLote.vivas.length === 1 ? "A peça será marcada" : "As peças serão marcadas"} como reaproveitamento <strong>total</strong> e enviadas direto à Gráfica como produzidas — sem nova impressão. Para reaproveitar só parte das unidades de uma peça, use o ícone ♻ na linha dela.
              {selecaoLote.finalizadas > 0 && (
                <span data-testid="aviso-bulk-reuse-finalizadas" style={{ display: "block", marginTop: 8 }}>
                  {avisoLoteFinalizadas()}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-bulk-reuse-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // a mutation controla o fechamento (mantém aberto em erro)
                bulkReuseMutation.mutate(selecaoLote.vivas);
              }}
              disabled={bulkReuseMutation.isPending || selecaoLote.vivas.length === 0}
              style={{ backgroundColor: TOM.sucesso.text, color: "#fff" }}
              data-testid="button-bulk-reuse-confirm"
            >
              {bulkReuseMutation.isPending
                ? "Reaproveitando..."
                : selecaoLote.finalizadas > 0 ? `Reaproveitar as ${selecaoLote.vivas.length}` : "Reaproveitar todas"}
            </AlertDialogAction>
          </AlertDialogFooter>
          </FreezeWhileClosing>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo: escolher reaproveitamento total ou parcial.
          Era um overlay <div> montado à mão: sem Esc, sem armadilha de foco
          (o Tab passeava pela lista atrás), sem devolver o foco ao fechar, e a
          página continuava rolando por baixo. A largura ainda vinha de
          `window.innerWidth` lido na renderização — girar o celular deixava o
          painel no tamanho antigo. */}
      <Dialog open={!!reuseDialogItemId} onOpenChange={o => { if (!o) setReuseDialogItemId(null); }}>
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(420)}>
          {/* POR QUE congelar aqui: o corpo inteiro é derivado de
              `reuseDialogItemId` (e o item vem de `pendingItems`, que as três
              invalidações do onSuccess recarregam). Ao confirmar, o id vira
              null, a busca não acha nada e o modal fica LITERALMENTE VAZIO
              durante toda a animação de saída. */}
          <FreezeWhileClosing open={!!reuseDialogItemId}>
          {(() => {
            const dialogItem = pendingItems.find(i => i.id === reuseDialogItemId);
            if (!dialogItem) return null;
            const qty = Number(dialogItem.quantity) || 1;
            return (
              <>
                <DialogTitle className="sr-only">Reaproveitamento</DialogTitle>
                <DialogDescription className="sr-only">
                  Escolha reaproveitar todas as unidades ou apenas parte delas
                </DialogDescription>
                <ModalHeader
                  variant="confirm"
                  icon={Recycle}
                  tint={TOM.sucesso.text}
                  title="Reaproveitamento"
                  subtitle={`${dialogItem.displayId} · ${dialogItem.type} · ${qty} un.`}
                  onClose={() => setReuseDialogItemId(null)}
                />
                {/* ALTURA: cabeçalho 80 + as duas opções de reaproveitamento
                    ~240 = 320px, contra 397 disponíveis numa janela de 445 —
                    este modal NÃO cortava. O scrollport é preventivo e
                    obrigatório: o `modalSurface` passou a trazer teto COM
                    `overflow: hidden`, e a segunda opção só aparece quando a
                    quantidade é maior que 1, então o corpo é elástico. */}
                <div style={{ padding: "20px 24px", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>

              {/* PEDIR AO ESTOQUE (dono, 21/09): com a chave LIGADA, confirmar
                  aqui não aplica o reaproveitamento na hora — vira uma
                  solicitação para a Gráfica, que atende, atende em parte ou
                  não consegue. A resposta volta para a ficha desta peça.
                  Chave DESLIGADA (dono, 21/09 — segurar): nada disto aparece. */}
              {SOLICITACAO_AO_ESTOQUE_ATIVA && (
                <PedirAoEstoque key={dialogItem.id} item={dialogItem} onPedido={() => setReuseDialogItemId(null)} />
              )}

              {/* APLICAR AGORA — o fluxo NORMAL de reaproveitar. Chave
                  desligada: as duas opções de sempre, direto no modal. Ligada:
                  só o admin, atrás de "Já conferi no estoque — aplicar agora". */}
              <AplicarAgoraNoModal admin={user?.role === "admin"}>

              {/* Opção: reaproveitar tudo */}
              <button
                onClick={() => {
                  // Aberto de dentro da ficha: decidir avança para a próxima da
                  // fila, como Liberar e Devolver — ou fecha, se era a última.
                  if (modalOpen && selectedItem?.id === dialogItem.id && !marcarAvanco()) { setModalOpen(false); setSelectedItem(null); }
                  toggleReuseMutation.mutate({ itemId: dialogItem.id, isReuse: true });
                  setReuseDialogItemId(null);
                }}
                disabled={toggleReuseMutation.isPending || partialReuseMutation.isPending}
                style={{
                  width: "100%", padding: "12px 16px", marginBottom: 10,
                  backgroundColor: TOM.sucesso.text, color: "#fff",
                  border: "none", borderRadius: 8, cursor: "pointer",
                  fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <Recycle style={{ width: 13, height: 13 }} />
                Reaproveitar tudo ({qty} un.) — pula produção
              </button>

              {/* Opção: reaproveitar parcialmente (só aparece se qty > 1) */}
              {qty > 1 && (
                <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "14px 16px" }}>
                  <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Reaproveitar parcialmente
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <input
                      type="number"
                      min={1}
                      max={qty - 1}
                      value={partialReuseQty}
                      onChange={e => setPartialReuseQty(Math.max(1, Math.min(qty - 1, parseInt(e.target.value) || 1)))}
                      aria-label="Unidades reaproveitadas"
                      data-testid="input-partial-reuse-qty"
                      style={{ width: 64, height: 34, padding: "0 8px", borderRadius: 6, border: `1px solid ${T.bdark}`, fontSize: 15, fontWeight: 700, textAlign: "center" }}
                    />
                    <span style={{ fontSize: 13, color: T.second }}>de {qty} un. reaproveitadas</span>
                  </div>
                  <p style={{ margin: "0 0 10px", fontSize: 11, color: T.second }}>
                    As outras <strong>{qty - partialReuseQty}</strong> un. seguirão para produção normal.
                  </p>
                  {/* O parcial LIBERA o restante para produção — e produção pede
                      arquivo final. Dito aqui, antes do 409 do servidor. */}
                  {!arquivoFinalOk(dialogItem) && (
                    <p role="status" data-testid="aviso-parcial-sem-arquivo" style={{ margin: "0 0 10px", fontSize: 12, lineHeight: 1.45, color: TOM.alerta.text, backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: 6, padding: "6px 10px" }}>
                      Sem arquivo final da Arte: o parcial manda o restante para a Gráfica, que precisa do arquivo. Espere a Arte enviar, ou reaproveite tudo.
                    </p>
                  )}
                  <button
                    onClick={() => {
                      if (!arquivoFinalOk(dialogItem)) return;
                      if (modalOpen && selectedItem?.id === dialogItem.id && !marcarAvanco()) { setModalOpen(false); setSelectedItem(null); }
                      partialReuseMutation.mutate({ itemId: dialogItem.id, reuseQty: partialReuseQty });
                    }}
                    disabled={toggleReuseMutation.isPending || partialReuseMutation.isPending || !arquivoFinalOk(dialogItem)}
                    style={{
                      width: "100%", padding: "10px 16px",
                      backgroundColor: arquivoFinalOk(dialogItem) ? T.text : T.border, color: arquivoFinalOk(dialogItem) ? "#fff" : T.second,
                      border: "none", borderRadius: 6, cursor: "pointer",
                      fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em",
                    }}
                  >
                    {partialReuseMutation.isPending ? "Salvando..." : `Confirmar ${partialReuseQty} un. reaproveitadas`}
                  </button>
                </div>
              )}
              </AplicarAgoraNoModal>

                  <button
                    onClick={() => setReuseDialogItemId(null)}
                    style={{ width: "100%", marginTop: 12, height: 36, background: "none", border: "none", fontSize: 13, color: T.second, cursor: "pointer" }}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            );
          })()}
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>

      {/* Desfazer o reaproveitamento — confirmação: a peça volta a precisar
          de arquivo final e de produção. */}
      <AlertDialog open={!!desfazerReuseId} onOpenChange={open => { if (!open && !toggleReuseMutation.isPending) setDesfazerReuseId(null); }}>
        <AlertDialogContent className="review-confirm-content">
          <FreezeWhileClosing open={!!desfazerReuseId}>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer o reaproveitamento</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const it: any = pendingItems.find((i: any) => i.id === desfazerReuseId);
                return (
                  <span>
                    {it ? <strong>{it.displayId}</strong> : "A peça"} deixa de ser reaproveitamento total e volta ao fluxo normal: para liberar, vai precisar do arquivo final da Arte, e a Gráfica produz as unidades.
                  </span>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-desfazer-reuse-cancel" disabled={toggleReuseMutation.isPending}>Manter reaproveitada</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // a mutation fecha (mantém aberto em erro)
                if (desfazerReuseId) toggleReuseMutation.mutate({ itemId: desfazerReuseId, isReuse: false });
              }}
              disabled={toggleReuseMutation.isPending}
              style={{ backgroundColor: TI.text, color: "#fff" }}
              data-testid="button-desfazer-reuse-confirm"
            >
              {toggleReuseMutation.isPending ? "Desfazendo…" : "Desfazer"}
            </AlertDialogAction>
          </AlertDialogFooter>
          </FreezeWhileClosing>
        </AlertDialogContent>
      </AlertDialog>

      {/* Travar pela ficha: motivo obrigatório, com os mesmos atalhos da Gráfica. */}
      <Dialog open={!!travandoItem} onOpenChange={o => { if (!o && !travarMutation.isPending) { setTravandoItem(null); setMotivoDaTrava(""); } }}>
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(440)}>
          <FreezeWhileClosing open={!!travandoItem}>
          <DialogTitle className="sr-only">Travar peça</DialogTitle>
          <DialogDescription className="sr-only">Diga o motivo da trava — é o que a Gráfica vai ler</DialogDescription>
          <ModalHeader
            variant="confirm"
            icon={Lock}
            tint={TOM.perigo.text}
            title="Travar peça"
            subtitle={travandoItem ? `${travandoItem.displayId ?? ""} · ${travandoItem.type ?? ""}` : undefined}
            onClose={() => { if (!travarMutation.isPending) { setTravandoItem(null); setMotivoDaTrava(""); } }}
          />
          <div style={{ padding: "16px 24px 20px", overflowY: "auto", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: T.strong }}>
              Travada, a peça pode ser liberada, mas não anda na Gráfica (imprimir, conferir, embalar) até alguém da Solicitação destravar.
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {SUGESTOES_DE_MOTIVO.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => setMotivoDaTrava(sug)}
                  style={{ minHeight: isMobile ? 44 : 30, padding: "0 10px", borderRadius: 999, border: `1px solid ${T.border}`, background: motivoDaTrava === sug ? TOM.perigo.bg : T.surface, color: T.strong, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  {sug}
                </button>
              ))}
            </div>
            <textarea
              value={motivoDaTrava}
              onChange={e => setMotivoDaTrava(e.target.value)}
              aria-label="Motivo da trava"
              placeholder="Por que a peça fica travada?"
              data-testid="textarea-motivo-trava-revisao"
              className="w-full min-h-20 p-2 border rounded-md bg-background text-foreground resize-none text-sm"
            />
            {!motivoDaTravaLido.ok && (
              <p aria-live="polite" style={{ margin: 0, fontSize: 12, color: TOM.alerta.text }}>
                {`Escreva o motivo (pelo menos ${MOTIVO_MINIMO} letras) — é o que a Gráfica vai ler.`}
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => { setTravandoItem(null); setMotivoDaTrava(""); }}
                disabled={travarMutation.isPending}
                style={{ minHeight: 40, padding: "0 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.strong, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => { if (travandoItem && motivoDaTravaLido.ok) travarMutation.mutate({ itemId: travandoItem.id, motivo: motivoDaTravaLido.motivo, displayId: travandoItem.displayId }); }}
                disabled={!motivoDaTravaLido.ok || travarMutation.isPending}
                data-testid="button-travar-confirm-revisao"
                style={{ minHeight: 40, padding: "0 14px", borderRadius: 8, border: "none", background: motivoDaTravaLido.ok ? TOM.perigo.text : T.border, color: motivoDaTravaLido.ok ? T.surface : T.second, fontSize: 13, fontWeight: 700, cursor: motivoDaTravaLido.ok && !travarMutation.isPending ? "pointer" : "not-allowed" }}
              >
                {travarMutation.isPending ? "Travando…" : "Travar"}
              </button>
            </div>
          </div>
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirmItemId} onOpenChange={open => { if (!open) setDeleteConfirmItemId(null); }}>
        <AlertDialogContent className="review-confirm-content">
          {/* POR QUE congelar aqui: o onSuccess da exclusão invalida, toasta e
              zera `deleteConfirmItemId` — que é quem escreve o ID da peça na
              descrição. Sem congelar, "A peça SOL-123 será excluída" cai para
              o texto genérico durante a saída. */}
          <FreezeWhileClosing open={!!deleteConfirmItemId}>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir peça</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirmItemId && (() => {
                const item = pendingItems.find(i => i.id === deleteConfirmItemId);
                return item ? <span>A peça <strong>{item.displayId}</strong> será permanentemente excluída. Esta ação não pode ser desfeita.</span> : "Esta peça será permanentemente excluída.";
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // a mutation controla o fechamento (mantém aberto em erro)
                if (deleteConfirmItemId) deleteItemMutation.mutate(deleteConfirmItemId);
              }}
              disabled={deleteItemMutation.isPending}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-delete-confirm"
            >
              {deleteItemMutation.isPending ? "Excluindo..." : "Excluir peça"}
            </AlertDialogAction>
          </AlertDialogFooter>
          </FreezeWhileClosing>
        </AlertDialogContent>
      </AlertDialog>

      {/* Aumentar quantidade — mesmo modal das outras telas. Aqui ele é a saída
          do 409 USE_COMPLEMENT: a peça saiu de revisão e entrou em produção
          enquanto o modal estava aberto. */}
      <AumentarQuantidadeDialog
        item={complementItem}
        event={complementItem ? (events as any[]).find((e: any) => e.id === complementItem.eventId) ?? null : null}
        open={!!complementItem}
        sugestao={complementSugestao}
        onOpenChange={(o) => { if (!o) { setComplementItem(null); setComplementSugestao(null); } }}
      />

    </div>
  );
}
