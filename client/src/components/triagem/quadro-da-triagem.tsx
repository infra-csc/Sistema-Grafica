// ─────────────────────────────────────────────────────────────────────────────
// TRIAGEM — QUADRO DO EVENTO (dono, 14/09).
//
// "Aparecer as peças e ele arrastando para o destino." As peças do evento
// ficam em "A triar"; o operador arrasta cada uma (ou várias selecionadas)
// para Galpão, Manutenção ou Descartar. Nada grava até "Salvar triagem" —
// dá para rearrumar à vontade antes.
//
// O que cada destino grava (as mesmas regras do servidor):
//   · Galpão     → NO_GALPAO, condição Perfeito ou Avaria leve, LOCAL
//                  obrigatório (sem local ninguém acha a peça para reaproveitar);
//   · Manutenção → EM_MANUTENCAO + Avaria leve (fora do estoque até o reparo);
//   · Descartar  → DESCARTADO + Sucata.
//
// No celular não existe arrastar: toca nas peças e escolhe o destino na barra.
// Dividir uma peça ×N por condição continua na vista em tabela.
// ─────────────────────────────────────────────────────────────────────────────
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookmarkCheck, CheckCircle2, ChevronDown, Grid3X3, Package, Search, Table2, Trash2, Undo2, Warehouse, Wrench, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useElementSize, useIsMobile } from "@/hooks/use-mobile";
import { FS } from "@/lib/theme";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { miniatura } from "@/lib/miniatura";
import { MapaGalpao, LOCAIS_DO_GALPAO } from "@/components/mapa-galpao";
import { diaEMes } from "@shared/estoque";
import type { EnrichedAsset } from "@/lib/inventory-meta";
import type { ReservaDaTriagem } from "@/components/triagem/eventos-da-triagem";

export type DestinoDaTriagem = "triar" | "galpao" | "manutencao" | "descartar";
type CondicaoNoGalpao = "PERFEITO" | "AVARIA_LEVE";

const COLUNAS: Record<DestinoDaTriagem, { titulo: string; sub: string; cor: string; fundo: string; borda: string; Icon: React.ElementType }> = {
  triar:      { titulo: "A triar",    sub: "Arraste cada peça para o destino", cor: "#334155", fundo: "#f8fafc", borda: "#e2e8f0", Icon: Package },
  galpao:     { titulo: "Galpão",     sub: "Volta ao estoque",                 cor: "#1e40af", fundo: "#eff6ff", borda: "#bfdbfe", Icon: Warehouse },
  manutencao: { titulo: "Manutenção", sub: "Fora do estoque até o reparo",     cor: "#92400e", fundo: "#fffbeb", borda: "#fde68a", Icon: Wrench },
  descartar:  { titulo: "Descartar",  sub: "Sai do inventário como sucata",    cor: "#991b1b", fundo: "#fef2f2", borda: "#fecaca", Icon: Trash2 },
};
const DESTINOS: DestinoDaTriagem[] = ["galpao", "manutencao", "descartar"];

/** O corpo do PATCH /api/inventory/:id/triage para cada destino. */
export function corpoDaTriagem(destino: Exclude<DestinoDaTriagem, "triar">, condicao: CondicaoNoGalpao, local: { galpao: string; manutencao: string }) {
  if (destino === "galpao") return { condition: condicao, trackingStatus: "NO_GALPAO", location: local.galpao.trim() };
  if (destino === "manutencao") return { condition: "AVARIA_LEVE", trackingStatus: "EM_MANUTENCAO", location: local.manutencao.trim() || null };
  return { condition: "SUCATA", trackingStatus: "DESCARTADO" };
}

/** Cartões montados por coluna de cada vez. O acúmulo em triagem passa de 4 mil
 *  peças e a pilha "Sem evento" sozinha pode ter centenas: montar tudo de uma
 *  vez travava o quadro a cada seleção. O resto entra por "Mostrar mais". */
export const LOTE_DA_COLUNA = 40;

/** Gravações simultâneas. Um PATCH por peça, todos de uma vez, abria centenas
 *  de conexões e o servidor devolvia erro no meio do lote. */
export const GRAVACOES_POR_VEZ = 6;

/** Executa `tarefa` sobre `itens` em grupos de `porVez`, na ordem, e devolve o
 *  resultado de cada um no formato do Promise.allSettled. */
export async function emGrupos<T, R>(itens: T[], porVez: number, tarefa: (item: T) => Promise<R>, aoAvancar?: (feitos: number) => void): Promise<PromiseSettledResult<R>[]> {
  const resultados: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < itens.length; i += porVez) {
    const grupo = await Promise.allSettled(itens.slice(i, i + porVez).map(tarefa));
    resultados.push(...grupo);
    aoAvancar?.(resultados.length);
  }
  return resultados;
}

/** Atalhos do cartão focado — a alternativa de TECLADO ao arrastar. */
export const ATALHO_DO_DESTINO: Record<string, DestinoDaTriagem> = { g: "galpao", m: "manutencao", d: "descartar", t: "triar" };

const ehImagem = (u?: string | null) => !!u && (/\.(png|jpe?g|gif|webp)/i.test(u) || u.startsWith("/objects/"));

// memo: selecionar UMA peça não pode redesenhar as outras dezenas de cartões.
// Por isso os handlers chegam estáveis (useCallback) e recebem o id.
const CartaoDaPeca = memo(function CartaoDaPeca({ ativo, reserva, selecionada, fantasma, podeArrastar, noGalpao, condicao, onCondicao, onAlternar, onArrastar, onSoltar, onAtalho, alvo = 28 }: {
  /** Altura dos botões Perfeito/Avaria leve — 44 no celular (toque). */
  alvo?: number;
  ativo: EnrichedAsset;
  reserva: ReservaDaTriagem | undefined;
  selecionada: boolean;
  fantasma: boolean;
  podeArrastar: boolean;
  noGalpao: boolean;
  condicao: CondicaoNoGalpao;
  onCondicao: (id: string, c: CondicaoNoGalpao) => void;
  onAlternar: (id: string) => void;
  onArrastar: (e: React.DragEvent, id: string) => void;
  onSoltar: () => void;
  onAtalho: (id: string, destino: DestinoDaTriagem) => void;
}) {
  const qtd = ativo.quantity ?? 1;
  // Duas camadas: o invólucro arrasta e desenha a borda; o miolo é o botão de
  // selecionar. Antes o cartão INTEIRO era role="button" com os botões
  // Perfeito/Avaria leve DENTRO — controle interativo aninhado, que o leitor de
  // tela anuncia errado e o axe reprova. Arrastar a partir do miolo continua
  // arrastando o invólucro (o drag sobe até o ancestral draggable).
  return (
    <div
      data-cartao=""
      draggable={podeArrastar}
      onDragStart={(e) => onArrastar(e, ativo.id)}
      onDragEnd={onSoltar}
      style={{
        display: "flex", flexDirection: "column", borderRadius: 12,
        background: selecionada ? "#fff7ed" : "#fff", cursor: podeArrastar ? "grab" : "pointer", userSelect: "none",
        border: `2px solid ${selecionada ? "#c2410c" : "#e2e8f0"}`,
        boxShadow: selecionada ? "0 0 0 3px rgba(194,65,12,0.15)" : "0 1px 2px rgba(0,0,0,0.05)",
        opacity: fantasma ? 0.4 : 1, transition: "border-color 0.12s, box-shadow 0.12s, opacity 0.12s, background-color 0.12s",
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selecionada}
        aria-label={`${ativo.displayId} ${ativo.name}${selecionada ? " — selecionada" : ""}`}
        data-testid={`cartao-triagem-${ativo.id}`}
        aria-keyshortcuts="G M D T"
        onClick={() => onAlternar(ativo.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAlternar(ativo.id); return; }
          // G/M/D/T movem sem mouse (só a tecla pura: Ctrl+D é do navegador).
          const destino = !e.ctrlKey && !e.metaKey && !e.altKey ? ATALHO_DO_DESTINO[e.key.toLowerCase()] : undefined;
          if (destino) { e.preventDefault(); onAtalho(ativo.id, destino); }
        }}
        style={{ display: "flex", flexDirection: "column", gap: 8, padding: noGalpao ? "10px 10px 8px" : 10, borderRadius: 10 }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
          <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", background: "#f1f5f9", border: "1px solid #e2e8f0", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {ehImagem(ativo.approvalThumbUrl) ? <img src={miniatura(ativo.approvalThumbUrl!)} alt="" loading="lazy" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Package size={16} color="#94a3b8" aria-hidden="true" />}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: "DM Mono, monospace", fontSize: 11, fontWeight: 700, color: "#9a3412" }}>{ativo.displayId}</span>
              {qtd > 1 && <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#0f172a", borderRadius: 5, padding: "0 5px" }}>×{qtd}</span>}
            </div>
            <div title={ativo.name} style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ativo.name}</div>
            {(ativo.sponsors ?? []).length > 0 && (
              <div style={{ fontSize: 12, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(ativo.sponsors ?? []).map((s) => s.name).join(" · ")}</div>
            )}
          </div>
          {selecionada && <CheckCircle2 size={18} color="#c2410c" aria-hidden="true" style={{ flexShrink: 0 }} />}
        </div>
        {reserva && (
          <span title={`Reservada para ${reserva.itemDisplayId ?? "uma peça"} de ${reserva.eventName}`}
            style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%", fontSize: 11, fontWeight: 700, color: "#1d4ed8", background: "#eff6ff", borderRadius: 6, padding: "2px 7px" }}>
            <BookmarkCheck size={11} aria-hidden="true" style={{ flexShrink: 0 }} /> Reservada · {reserva.eventName}{reserva.saida ? ` · saída ${diaEMes(reserva.saida)}` : ""}
          </span>
        )}
      </div>
      {noGalpao && (
        <div role="radiogroup" aria-label={`Condição de ${ativo.displayId}`} style={{ display: "flex", gap: 4, padding: "0 10px 10px" }}>
          {([["PERFEITO", "Perfeito"], ["AVARIA_LEVE", "Avaria leve"]] as const).map(([valor, rotulo]) => {
            const ativa = condicao === valor;
            return (
              <button key={valor} type="button" role="radio" aria-checked={ativa} data-testid={`condicao-${valor}-${ativo.id}`}
                onClick={() => onCondicao(ativo.id, valor)}
                style={{ flex: 1, height: alvo, borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${ativa ? (valor === "PERFEITO" ? "#15803d" : "#b45309") : "#e2e8f0"}`, background: ativa ? (valor === "PERFEITO" ? "#f0fdf4" : "#fffbeb") : "#fff", color: ativa ? (valor === "PERFEITO" ? "#15803d" : "#b45309") : "#475569", transition: "background-color 0.12s, border-color 0.12s, color 0.12s" }}>
                {rotulo}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

export function QuadroDaTriagem({ evento, ativos, reservaPorAtivo, onVoltar, onTabela, onConcluido }: {
  evento: { id: string; nome: string; data: string | null };
  ativos: EnrichedAsset[];
  reservaPorAtivo: Map<string, ReservaDaTriagem>;
  onVoltar: () => void;
  onTabela: () => void;
  onConcluido: () => void;
}) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  // MODO GALPÃO: o quadro é usado em tablet no chão do galpão. Um tablet de
  // 768px+ não é "mobile" para o useIsMobile, mas é dedo e não mouse — os
  // alvos de 38px e o texto "arraste as peças" valiam para ele também, e
  // arrastar (HTML5 drag) nem existe em tela de toque.
  const [toqueGrosso, setToqueGrosso] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(pointer: coarse)");
    const aplicar = () => setToqueGrosso(mql.matches);
    aplicar();
    mql.addEventListener?.("change", aplicar);
    return () => mql.removeEventListener?.("change", aplicar);
  }, []);
  const toque = isMobile || toqueGrosso;
  // Largura REAL do quadro (não da janela): com a barra lateral aberta, um
  // tablet de 1024px deixa ~700px para quatro colunas de ~160px cada.
  const { ref: refDoQuadro, width: larguraDoQuadro } = useElementSize<HTMLDivElement>();
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const [destinos, setDestinos] = useState<Record<string, DestinoDaTriagem>>({});
  const [condicoes, setCondicoes] = useState<Record<string, CondicaoNoGalpao>>({});
  const [local, setLocal] = useState({ galpao: "", manutencao: "" });
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [arrastando, setArrastando] = useState<string[] | null>(null);
  const [sobre, setSobre] = useState<DestinoDaTriagem | null>(null);
  const [mapaDe, setMapaDe] = useState<"galpao" | "manutencao" | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [gravadas, setGravadas] = useState(0);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const [busca, setBusca] = useState("");
  const [mostrando, setMostrando] = useState<Record<DestinoDaTriagem, number>>({ triar: LOTE_DA_COLUNA, galpao: LOTE_DA_COLUNA, manutencao: LOTE_DA_COLUNA, descartar: LOTE_DA_COLUNA });
  // Dito ao leitor de tela a cada movimento: o cartão muda de coluna em
  // silêncio e quem não vê a tela não sabia se a tecla tinha funcionado.
  const [anuncio, setAnuncio] = useState("");

  const destinoDe = (id: string): DestinoDaTriagem => destinos[id] ?? "triar";
  // UMA passada por render para as quatro colunas (eram seis filter+sort da
  // lista inteira a cada tecla no campo de local).
  const porColuna = useMemo(() => {
    const c: Record<DestinoDaTriagem, EnrichedAsset[]> = { triar: [], galpao: [], manutencao: [], descartar: [] };
    for (const a of ativos) c[destinos[a.id] ?? "triar"].push(a);
    for (const d of Object.keys(c) as DestinoDaTriagem[]) {
      c[d].sort((x, y) => Number(!!reservaPorAtivo.get(y.id)) - Number(!!reservaPorAtivo.get(x.id)));
    }
    return c;
  }, [ativos, destinos, reservaPorAtivo]);
  // A busca recorta só "A triar": é a pilha que cresce; os destinos mostram
  // sempre tudo o que vai ser gravado.
  const termo = busca.trim().toLowerCase();
  const triarNoRecorte = useMemo(() => !termo ? porColuna.triar : porColuna.triar.filter((a) =>
    (a.name ?? "").toLowerCase().includes(termo) || (a.displayId ?? "").toLowerCase().includes(termo)
    || (a.sponsors ?? []).some((s) => s.name.toLowerCase().includes(termo))), [porColuna, termo]);
  const naColuna = (d: DestinoDaTriagem) => (d === "triar" ? triarNoRecorte : porColuna[d]);
  const movidas = useMemo(() => ativos.filter((a) => !!destinos[a.id]), [ativos, destinos]);
  const faltaLocal = porColuna.galpao.length > 0 && !local.galpao.trim();

  const mover = useCallback((ids: string[], destino: DestinoDaTriagem) => {
    setDestinos((prev) => {
      const proximo = { ...prev };
      for (const id of ids) {
        if (destino === "triar") delete proximo[id];
        else proximo[id] = destino;
      }
      return proximo;
    });
    setSelecionadas(new Set());
    setAnuncio(`${ids.length} ${ids.length === 1 ? "peça movida" : "peças movidas"} para ${COLUNAS[destino].titulo}`);
  }, []);

  const alternar = useCallback((id: string) =>
    setSelecionadas((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);

  // A seleção é lida por ref nos handlers estáveis — se entrasse como
  // dependência, todo cartão redesenhava a cada clique e o memo não valia.
  const refSelecionadas = useRef(selecionadas);
  refSelecionadas.current = selecionadas;
  const idsDoGesto = (id: string) => (refSelecionadas.current.has(id) ? Array.from(refSelecionadas.current) : [id]);

  const aoArrastar = useCallback((e: React.DragEvent, id: string) => {
    const ids = idsDoGesto(id);
    e.dataTransfer.setData("text/plain", JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "move";
    setArrastando(ids);
  }, []);
  const aoSoltar = useCallback(() => { setArrastando(null); setSobre(null); }, []);
  const aoMudarCondicao = useCallback((id: string, c: CondicaoNoGalpao) => setCondicoes((prev) => ({ ...prev, [id]: c })), []);
  // Tecla G/M/D/T no cartão focado. O cartão sai da coluna e o foco iria para
  // o <body>: passa para o vizinho, para triar a pilha inteira só no teclado.
  const aoAtalho = useCallback((id: string, destino: DestinoDaTriagem) => {
    const atual = document.activeElement?.closest("[data-cartao]") as HTMLElement | null;
    const vizinho = (atual?.nextElementSibling ?? atual?.previousElementSibling) as HTMLElement | null;
    const proximo = vizinho?.querySelector<HTMLElement>('[role="button"]')?.dataset.testid;
    mover(idsDoGesto(id), destino);
    if (proximo) setTimeout(() => document.querySelector<HTMLElement>(`[data-testid="${proximo}"]`)?.focus(), 0);
  }, [mover]);

  // DESCARTAR é o único destino que destrói (a peça sai do inventário e a
  // triagem não volta atrás pelo app): pede confirmação, com a contagem.
  const salvar = () => {
    if (movidas.length === 0 || salvando) return;
    if (faltaLocal) {
      toast({ title: "Informe o local no galpão", description: "Sem o local, ninguém encontra a peça para reaproveitar.", variant: "destructive" });
      return;
    }
    if (porColuna.descartar.length > 0) { setConfirmarDescarte(true); return; }
    gravar();
  };

  const gravar = async () => {
    setConfirmarDescarte(false);
    setSalvando(true);
    setGravadas(0);
    const lote = movidas.map((a) => ({ ativo: a, destino: destinoDe(a.id) as Exclude<DestinoDaTriagem, "triar"> }));
    const resultados = await emGrupos(lote, GRAVACOES_POR_VEZ, ({ ativo, destino }) =>
      apiRequest("PATCH", `/api/inventory/${ativo.id}/triage`, corpoDaTriagem(destino, condicoes[ativo.id] ?? "PERFEITO", local)),
    setGravadas);
    const salvas = lote.filter((_, i) => resultados[i].status === "fulfilled").map((l) => l.ativo.id);
    const falhas = lote.length - salvas.length;
    setDestinos((prev) => { const n = { ...prev }; for (const id of salvas) delete n[id]; return n; });
    queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    queryClient.invalidateQueries({ queryKey: ["/api/inventory/awaiting-triage"] });
    queryClient.invalidateQueries({ queryKey: ["/api/estoque/reservas-ativas"] });
    setSalvando(false);
    if (falhas > 0) {
      // O motivo da primeira recusa: "com erro" sem porquê deixava a pessoa
      // reenviando o lote às cegas.
      const motivo = (resultados.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined)?.reason?.message;
      toast({ title: `${salvas.length} ${salvas.length === 1 ? "salva" : "salvas"}, ${falhas} com erro`, description: `${motivo ? `${motivo}. ` : ""}As que falharam continuam no destino — tente salvar de novo.`, variant: "destructive" });
      return;
    }
    const restam = ativos.length - salvas.length;
    toast({ title: `Triagem salva: ${salvas.length} ${salvas.length === 1 ? "peça" : "peças"}`, description: restam > 0 ? `Faltam ${restam} para triar neste evento.` : "Este evento terminou a triagem." });
    if (restam === 0) onConcluido();
  };

  // Confirmação no diálogo da casa, e não no window.confirm nativo (que no
  // celular abre uma caixa do navegador com o domínio no título).
  const voltar = () => {
    if (movidas.length > 0) { setConfirmarSaida(true); return; }
    onVoltar();
  };

  const alvo = toque ? 44 : 38;
  // Layout das colunas pela largura do quadro: uma coluna quando não cabe
  // nem três destinos lado a lado; "A triar" em cima e os três destinos
  // embaixo na faixa de tablet; as quatro lado a lado só com folga.
  const layout: "uma" | "tablet" | "larga" =
    larguraDoQuadro === 0 ? (isMobile ? "uma" : "larga")
      : larguraDoQuadro < 600 ? "uma"
        : larguraDoQuadro < 1000 ? "tablet"
          : "larga";

  // FUNÇÃO DE RENDER, não componente. Era `const Coluna = (...) => <section>`
  // usado como <Coluna/>: um componente declarado DENTRO do render ganha
  // identidade nova a cada render, o React desmonta e remonta a coluna inteira
  // — e o campo "Local no galpão" perdia o foco a CADA tecla (digitar
  // "Setor A" exigia seis toques no campo). Chamada como função, a árvore é a
  // mesma entre renders e o input continua focado.
  const coluna = (destino: DestinoDaTriagem) => {
    const meta = COLUNAS[destino];
    const todas = naColuna(destino);
    const pecas = todas.slice(0, mostrando[destino]);
    const escondidas = todas.length - pecas.length;
    const total = porColuna[destino].length;
    const destacada = sobre === destino && !!arrastando;
    const campoDeLocal = destino === "galpao" || destino === "manutencao" ? destino : null;
    return (
      <section
        key={destino}
        aria-label={meta.titulo}
        data-testid={`coluna-triagem-${destino}`}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (sobre !== destino) setSobre(destino); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre((s) => (s === destino ? null : s)); }}
        onDrop={(e) => {
          e.preventDefault();
          let ids = arrastando;
          try { const lidos = JSON.parse(e.dataTransfer.getData("text/plain")); if (Array.isArray(lidos)) ids = lidos; } catch { /* usa o estado */ }
          if (ids?.length) mover(ids, destino);
          setSobre(null); setArrastando(null);
        }}
        style={{
          display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 16,
          minHeight: layout === "larga" ? 360 : destino === "triar" ? undefined : 140,
          gridColumn: layout === "tablet" && destino === "triar" ? "1 / -1" : undefined,
          background: destacada ? meta.fundo : destino === "triar" ? "#f1f5f9" : "#ffffff",
          border: `2px ${destino === "triar" ? "solid" : "dashed"} ${destacada ? meta.cor : meta.borda}`,
          transition: "background 0.12s, border-color 0.12s",
        }}
      >
        <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 8, background: meta.fundo, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <meta.Icon size={15} color={meta.cor} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: meta.cor, fontFamily: "Space Grotesk, sans-serif" }}>{meta.titulo}</h2>
            <div style={{ fontSize: 12, color: "#475569" }}>{destino === "triar" && toque ? "Toque nas peças e escolha o destino" : meta.sub}</div>
          </div>
          <span aria-label={`${total} ${total === 1 ? "peça" : "peças"}`} style={{ minWidth: 26, height: 24, padding: "0 8px", borderRadius: 999, background: meta.fundo, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: meta.cor, fontFamily: "Space Grotesk, sans-serif", fontVariantNumeric: "tabular-nums" }}>{total}</span>
        </header>

        {destino === "triar" && total > 8 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 180px", minWidth: 0 }}>
              <Search size={14} color="#64748b" aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              <input type="search" data-testid="input-busca-quadro" aria-label="Buscar peça a triar por nome, código ou patrocinador"
                placeholder="Buscar nesta pilha…" value={busca}
                onChange={(e) => { setBusca(e.target.value); setMostrando((m) => ({ ...m, triar: LOTE_DA_COLUNA })); }}
                style={{ width: "100%", boxSizing: "border-box", height: alvo, padding: "0 10px 0 30px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: toque ? 16 : 13, color: "#0f172a" }} />
            </div>
            <button type="button" data-testid="button-selecionar-visiveis" disabled={pecas.length === 0}
              title="Marca só o que está na tela — o resto da pilha entra por Mostrar mais"
              onClick={() => setSelecionadas(pecas.every((a) => selecionadas.has(a.id)) ? new Set() : new Set(pecas.map((a) => a.id)))}
              style={{ height: alvo, padding: "0 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#334155", fontSize: 13, fontWeight: 700, cursor: pecas.length === 0 ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
              {pecas.length > 0 && pecas.every((a) => selecionadas.has(a.id)) ? "Desmarcar" : `Selecionar as ${pecas.length} visíveis`}
            </button>
          </div>
        )}

        {campoDeLocal && (
          <div style={{ display: "flex", gap: 4 }}>
            <input
              type="text"
              list="locais-do-galpao-quadro"
              data-testid={`input-local-${destino}`}
              aria-label={destino === "galpao" ? "Local no galpão (obrigatório)" : "Local da manutenção (opcional)"}
              placeholder={destino === "galpao" ? "Local no galpão *" : "Local (opcional)"}
              value={local[campoDeLocal]}
              onChange={(e) => setLocal((l) => ({ ...l, [campoDeLocal]: e.target.value }))}
              aria-invalid={destino === "galpao" && faltaLocal ? true : undefined}
              // Sem `outline: none` (o inline anulava o anel de foco global) e
              // 16px no toque — abaixo disso o Safari dá zoom ao focar.
              style={{ flex: 1, minWidth: 0, height: alvo, padding: "0 10px", borderRadius: 8, fontSize: toque ? 16 : 13, border: `1px solid ${destino === "galpao" && faltaLocal ? "#fca5a5" : "#e2e8f0"}`, background: destino === "galpao" && faltaLocal ? "#fff7f7" : "#fff" }}
            />
            <button type="button" aria-label="Abrir mapa do galpão" title="Abrir mapa do galpão" onClick={() => setMapaDe(campoDeLocal)}
              style={{ width: alvo, height: alvo, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#c2410c", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Grid3X3 size={15} aria-hidden="true" />
            </button>
          </div>
        )}
        {/* UM local para a coluna inteira — o campo fica no topo da coluna e
            nada dizia que valia para todas as peças soltas nela. */}
        {campoDeLocal && (
          <p style={{ margin: "-4px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>
            {destino === "galpao" ? "Vale para todas as peças desta coluna." : "Opcional · vale para todas desta coluna."}
          </p>
        )}

        <div style={{
          flex: 1, gap: 8,
          // "A triar" ocupando a linha toda (faixa de tablet) vira grade: numa
          // coluna só, 700px de largura para um cartão de 44px de altura.
          ...(layout === "tablet" && destino === "triar"
            ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", alignItems: "start" }
            : { display: "flex", flexDirection: "column" }),
        }}>
          {pecas.length === 0 ? (
            <div style={{ flex: 1, gridColumn: "1 / -1", minHeight: 70, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 13, color: "#64748b", padding: 12 }}>
              {destino === "triar" ? (termo && total > 0 ? `Nenhuma peça com “${busca.trim()}” nesta pilha` : "Tudo arrumado — salve a triagem") : toque ? "Selecione peças e toque no destino" : "Solte as peças aqui"}
            </div>
          ) : pecas.map((a) => (
            <CartaoDaPeca
              key={a.id}
              ativo={a}
              reserva={reservaPorAtivo.get(a.id)}
              selecionada={selecionadas.has(a.id)}
              fantasma={!!arrastando?.includes(a.id)}
              podeArrastar={!isMobile}
              noGalpao={destino === "galpao"}
              alvo={toque ? 44 : 32}
              condicao={condicoes[a.id] ?? "PERFEITO"}
              onCondicao={aoMudarCondicao}
              onAlternar={alternar}
              onArrastar={aoArrastar}
              onSoltar={aoSoltar}
              onAtalho={aoAtalho}
            />
          ))}
        </div>
        {escondidas > 0 && (
          <button type="button" data-testid={`mostrar-mais-${destino}`}
            onClick={() => setMostrando((m) => ({ ...m, [destino]: m[destino] + LOTE_DA_COLUNA }))}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", color: "#334155", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            <ChevronDown size={15} aria-hidden="true" /> Mostrar mais {Math.min(LOTE_DA_COLUNA, escondidas)} · faltam {escondidas}
          </button>
        )}
      </section>
    );
  };

  return (
    <div data-testid="quadro-triagem" style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: selecionadas.size > 0 ? (isMobile ? 200 : 96) : 0 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <button type="button" onClick={voltar} data-testid="button-voltar-eventos"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: toque ? 44 : 32, background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 700, color: "#475569", cursor: "pointer", transition: "color 0.12s" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#0f172a"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#475569"; }}>
            <ArrowLeft size={15} aria-hidden="true" /> Eventos da triagem
          </button>
          {/* Título no padrão da casa (FS.h1, 700) — estava em 26/900, mais
              pesado que o título de qualquer outra tela. */}
          <h1 style={{ margin: "2px 0 3px", fontSize: FS.h1, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", color: "#1c1917", letterSpacing: "-0.03em", lineHeight: 1.15, overflowWrap: "anywhere" }}>{evento.nome}</h1>
          <p aria-live="polite" style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.45 }}>
            {evento.data ? `Evento ${diaEMes(evento.data)} · ` : ""}{naColuna("triar").length} a triar de {ativos.length} ·{" "}
            {toque ? "toque nas peças e escolha o destino" : "arraste as peças para o destino — ou clique para selecionar e use a barra; no teclado, G, M ou D no cartão"}
            {" · "}nada é gravado até salvar — dá para rearrumar
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", width: isMobile ? "100%" : undefined }}>
          <button type="button" onClick={onTabela} data-testid="button-quadro-tabela" title="Na tabela dá para dividir uma peça ×N por condição"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: alvo, padding: "0 14px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", color: "#334155", fontSize: 13, fontWeight: 700, cursor: "pointer", flex: isMobile ? "1 1 100%" : undefined, transition: "background-color 0.12s, border-color 0.12s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e2e8f0"; }}>
            <Table2 size={15} aria-hidden="true" /> Tabela (dividir por quantidade)
          </button>
          <button type="button" onClick={salvar} data-testid="button-salvar-triagem" disabled={movidas.length === 0 || salvando}
            title={movidas.length === 0 ? "Mova ao menos uma peça para um destino" : faltaLocal ? "Informe o local no galpão" : `Grava o destino de ${movidas.length} ${movidas.length === 1 ? "peça" : "peças"}`}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: alvo, padding: "0 18px", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: movidas.length === 0 || salvando ? "not-allowed" : "pointer", background: movidas.length === 0 || salvando ? "#e2e8f0" : "#c2410c", color: movidas.length === 0 || salvando ? "#64748b" : "#fff", boxShadow: movidas.length > 0 && !salvando ? "0 4px 14px rgba(194,65,12,0.28)" : "none", flex: isMobile ? "1 1 100%" : undefined, transition: "background-color 0.15s, box-shadow 0.15s" }}>
            <CheckCircle2 size={16} aria-hidden="true" /> {salvando ? `Salvando ${gravadas} de ${movidas.length}…` : movidas.length === 0 ? "Salvar triagem" : `Salvar ${movidas.length} ${movidas.length === 1 ? "peça" : "peças"}`}
          </button>
        </div>
      </div>

      {faltaLocal && (
        <p role="status" data-testid="aviso-local-galpao" style={{ margin: 0, padding: "10px 12px", borderRadius: 10, background: "#fff7ed", border: "1px solid #fed7aa", fontSize: 13, color: "#9a3412", lineHeight: 1.45 }}>
          Há peças indo para o Galpão: informe o local na coluna Galpão antes de salvar.
        </p>
      )}

      <div ref={refDoQuadro} style={{
        display: "grid", gap: 12, alignItems: "start",
        gridTemplateColumns: layout === "uma" ? "minmax(0, 1fr)"
          : layout === "tablet" ? "repeat(3, minmax(0, 1fr))"
            : "minmax(0, 1.25fr) repeat(3, minmax(0, 1fr))",
      }}>
        {coluna("triar")}
        {DESTINOS.map((d) => coluna(d))}
      </div>

      {selecionadas.size > 0 && (
        <div role="toolbar" aria-label="Mover peças selecionadas" data-testid="barra-mover-selecionadas"
          style={{
            position: "fixed", zIndex: 50, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 12px", borderRadius: 16, background: "#0f172a", boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
            // No celular: presa às laterais e acima da barra de gesto do iPhone
            // (safe-area), com os três destinos dividindo a largura.
            ...(isMobile
              ? { left: 12, right: 12, bottom: "calc(12px + env(safe-area-inset-bottom, 0px))", transform: "none" }
              : { left: "50%", bottom: 20, transform: "translateX(-50%)", maxWidth: "calc(100vw - 32px)" }),
          }}>
          <span role="status" style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 700, padding: "0 6px", flex: isMobile ? "1 1 100%" : undefined }}>
            {selecionadas.size} {selecionadas.size === 1 ? "selecionada" : "selecionadas"} →
          </span>
          {DESTINOS.map((d) => {
            const meta = COLUNAS[d];
            return (
              <button key={d} type="button" data-testid={`mover-para-${d}`} onClick={() => mover(Array.from(selecionadas), d)}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, height: alvo, padding: "0 12px", borderRadius: 10, border: "none", background: meta.fundo, color: meta.cor, fontSize: 13, fontWeight: 700, cursor: "pointer", flex: isMobile ? "1 1 0" : undefined, minWidth: 0 }}>
                <meta.Icon size={15} aria-hidden="true" /> {meta.titulo}
              </button>
            );
          })}
          <button type="button" data-testid="mover-para-triar" onClick={() => mover(Array.from(selecionadas), "triar")}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, height: alvo, padding: "0 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#e2e8f0", fontSize: 13, fontWeight: 600, cursor: "pointer", flex: isMobile ? "1 1 0" : undefined }}>
            <Undo2 size={15} aria-hidden="true" /> A triar
          </button>
          <button type="button" aria-label="Limpar seleção" title="Limpar seleção" onClick={() => setSelecionadas(new Set())}
            style={{ width: alvo, height: alvo, borderRadius: 10, border: "none", background: "rgba(255,255,255,0.1)", color: "#e2e8f0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite" data-testid="anuncio-do-quadro">{anuncio}</p>

      <AlertDialog open={confirmarDescarte} onOpenChange={setConfirmarDescarte}>
        <AlertDialogContent style={{ width: "min(440px, calc(100vw - 32px))", maxWidth: "min(440px, calc(100vw - 32px))", borderRadius: 16 }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar {porColuna.descartar.length} {porColuna.descartar.length === 1 ? "peça" : "peças"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {porColuna.descartar.length === 1 ? "Ela sai" : "Elas saem"} do inventário como sucata e a triagem não pode ser desfeita por aqui.
              {movidas.length > porColuna.descartar.length ? ` As outras ${movidas.length - porColuna.descartar.length} seguem para Galpão e Manutenção.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter style={{ gap: 8 }}>
            <AlertDialogCancel data-testid="button-rever-descarte" style={{ minHeight: 44 }}>Rever</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirmar-descarte" onClick={() => gravar()}
              style={{ minHeight: 44, background: "#b91c1c", color: "#fff" }}>
              Descartar e salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <datalist id="locais-do-galpao-quadro">
        {LOCAIS_DO_GALPAO.map((l) => <option key={l} value={l} />)}
      </datalist>

      {mapaDe && (
        <MapaGalpao
          value={local[mapaDe]}
          onSelect={(loc) => setLocal((l) => ({ ...l, [mapaDe]: loc }))}
          onClose={() => setMapaDe(null)}
        />
      )}

      <AlertDialog open={confirmarSaida} onOpenChange={setConfirmarSaida}>
        <AlertDialogContent style={{ width: "min(420px, calc(100vw - 32px))", maxWidth: "min(420px, calc(100vw - 32px))", borderRadius: 16 }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair sem salvar?</AlertDialogTitle>
            <AlertDialogDescription>
              {movidas.length} {movidas.length === 1 ? "peça foi arrumada" : "peças foram arrumadas"} e ainda não {movidas.length === 1 ? "foi salva" : "foram salvas"}. Saindo agora, a arrumação se perde.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter style={{ gap: 8 }}>
            <AlertDialogCancel data-testid="button-ficar-no-quadro" style={{ minHeight: 44 }}>Continuar arrumando</AlertDialogCancel>
            <AlertDialogAction data-testid="button-sair-sem-salvar" onClick={() => { setConfirmarSaida(false); onVoltar(); }}
              style={{ minHeight: 44, background: "#b91c1c", color: "#fff" }}>
              Sair sem salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
