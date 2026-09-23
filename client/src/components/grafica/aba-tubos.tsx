// ─────────────────────────────────────────────────────────────────────────────
// A ABA "TUBOS" DA GRÁFICA (dono, 21/09: "devia ter uma aba de tubos para eles
// saberem quais tubos têm o quê e administrar" — e, logo depois: "põe na mesma
// da Gráfica, uma abinha separada, não precisa ser uma página").
//
// Não é rota nem item de menu: a Gráfica mostra `Fila | Tubos` e, em
// `?aba=tubos`, monta SÓ este painel (a fila pesada não renderiza, e a consulta
// detalhada dos tubos — GET /api/tubos?detalhe=1 — só roda aqui).
//
// TRÊS SEGMENTOS, na ordem em que o galpão pensa:
//   · ABERTOS — o que está embalado e ainda vai sair, agrupado por evento e
//     ordenado pela SAÍDA DO CAMINHÃO (o que sai antes aparece antes);
//   · EMBALADAS SOZINHAS — a peça que foi sem tubo (nunca "Tubo N");
//   · ENTREGUES — com quem recebeu e quando; a busca acha pelo recebedor.
// Filtro por evento e busca (código, descrição, tipo, evento, nº do tubo,
// recebedor) moram na URL — recarregar ou mandar o link mantém o recorte.
//
// ENTREGAR EM LOTE (dono, 23/09): nos abertos e nas sozinhas, cada volume que
// pode sair tem uma caixa; marcados, a barra "Entregar N em lote" pede UM
// "quem recebeu" para todos. O que o servidor recusar fica marcado, com o
// motivo no próprio cartão.
//
// AS AÇÕES não são reimplementadas aqui: cada cartão abre os MESMOS modais da
// fila (o do tubo, o de entrega), pelo TubosDialog. Um lugar só para a regra.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCircle2, Package, Search, Tag, Truck, X } from "lucide-react";
import { TubosDialog, EntregarEmLoteDialog, type VolumeDoLote, type ResultadoDoLote } from "@/components/tubos-dialog";
import { linhaDaLista, semAcento as tirarAcento } from "@/lib/etiqueta-lista";
import { useIsMobile } from "@/hooks/use-mobile";
import { intervaloDePolling } from "@/hooks/use-websocket";

type PecaDoTubo = { id: string; displayId: string | null; type: string; description: string | null; quantity: number; quantidadeNoTubo?: number };
export type TuboDaAba = {
  id: string; numero: number; avulso: boolean;
  evento: { id: string; name: string; truckDepartureDate: string | null };
  criadoEm: string | null;
  fotosFechamento: string[]; fechadoEm: string | null; fechadoPor: string | null;
  entregueEm: string | null; recebidoPor: string | null; entreguePor: string | null; fotoEntregaUrl: string | null;
  pecas: PecaDoTubo[]; unidades: number; podeAgir: boolean;
};
type Segmento = "abertos" | "sozinhas" | "entregues";
const SEGMENTOS: Array<{ id: Segmento; rotulo: string }> = [
  { id: "abertos", rotulo: "Abertos" }, { id: "sozinhas", rotulo: "Embaladas sozinhas" }, { id: "entregues", rotulo: "Entregues" },
];
const LOTE = 30;
const COR = { texto: "#1c1917", sec: "#57534e", borda: "#e7e5e4", fundo: "#fafaf9", laranja: "#c2410c", verde: "#15803d", azul: "#1d4ed8", azulBg: "#eff6ff", ambar: "#92400e", vermelho: "#b91c1c" };
const SEM_TUBOS: TuboDaAba[] = [];

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
// (a mesma de lib/etiqueta-lista — uma regra só para tirar acento)
const semAcento = (v: unknown) => tirarAcento(String(v ?? ""));
const dia = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }) : null);
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
/** Dias até a saída do caminhão (negativo = já saiu). null sem data. */
export const diasAteASaida = (iso: string | null, agora = new Date()): number | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate())) / 86_400_000);
};

/** Lê e escreve um parâmetro da URL sem recarregar — os filtros da FILA (outros parâmetros) não se perdem. */
function useParametro(nome: string, padrao = ""): [string, (v: string) => void] {
  const ler = () => new URLSearchParams(window.location.search).get(nome) ?? padrao;
  const [valor, setValor] = useState(ler);
  const mudar = (v: string) => {
    const u = new URL(window.location.href);
    if (!v || v === padrao) u.searchParams.delete(nome); else u.searchParams.set(nome, v);
    window.history.replaceState(null, "", u.pathname + u.search);
    setValor(v);
  };
  return [valor, mudar];
}

/** A busca da aba: código, tipo, descrição, evento, nº do tubo ("tubo 2" ou "2") e recebedor. */
export function tuboCasa(t: TuboDaAba, busca: string): boolean {
  const q = semAcento(busca).trim();
  if (!q) return true;
  // "tubo 2" é o NÚMERO do tubo, exato — senão o "2" casaria com "2x1" e "#0002".
  const porNumero = q.match(/^tubo *([0-9]+)$/);
  if (porNumero) return !t.avulso && t.numero === Number(porNumero[1]);
  const alvo = semAcento([
    t.avulso ? "sozinha embalada" : `tubo ${t.numero}`, t.evento.name, t.recebidoPor, t.fechadoPor,
    ...t.pecas.flatMap((p) => [p.displayId, p.type, p.description]),
  ].join(" "));
  return q.split(/\s+/).every((palavra) => alvo.includes(palavra));
}

export function AbaTubos({ sugestaoRecebedor, onEntregou, onAbrirPeca }: {
  sugestaoRecebedor?: string;
  onEntregou?: (recebedor: string) => void;
  onAbrirPeca?: (itemId: string) => void;
}) {
  const isMobile = useIsMobile();
  const alvo = isMobile ? 44 : 36;
  const { data = SEM_TUBOS, isLoading, isError, refetch, isFetching } = useQuery<TuboDaAba[]>({ queryKey: ["/api/tubos", "?detalhe=1"], refetchInterval: intervaloDePolling(60_000) });
  const [seg, setSeg] = useParametro("seg", "abertos");
  const [eventoId, setEventoId] = useParametro("tuboEvento");
  const [busca, setBusca] = useParametro("tuboBusca");
  const [mostrando, setMostrando] = useState(LOTE);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<{ evento: { id: string; name: string }; verTubo?: string; entregarTubo?: string } | null>(null);
  const segmento: Segmento = (SEGMENTOS.find((x) => x.id === seg)?.id ?? "abertos");
  // O LOTE: ids marcados (só volumes que ainda vão sair e que a pessoa pode entregar).
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [recusas, setRecusas] = useState<Record<string, string>>({});
  const [loteAberto, setLoteAberto] = useState(false);
  const podeEntrar = (t: TuboDaAba) => t.podeAgir && !t.entregueEm && t.pecas.length > 0;
  const alternar = (id: string) => setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const doSegmento = (t: TuboDaAba, qual: Segmento) =>
    qual === "entregues" ? !!t.entregueEm : !t.entregueEm && t.pecas.length > 0 && (qual === "sozinhas" ? t.avulso : !t.avulso);
  const contagem = useMemo(() => Object.fromEntries(SEGMENTOS.map((x) => [x.id, data.filter((t) => doSegmento(t, x.id)).length])) as Record<Segmento, number>, [data]);
  const eventos = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of data) m.set(t.evento.id, t.evento.name);
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [data]);

  const lista = useMemo(() => {
    const filtrada = data.filter((t) => doSegmento(t, segmento) && (!eventoId || t.evento.id === eventoId) && tuboCasa(t, busca));
    return filtrada.sort((a, b) => segmento === "entregues"
      ? String(b.entregueEm).localeCompare(String(a.entregueEm))
      // Abertos: o caminhão que sai antes vem antes; sem data vai para o fim.
      : String(a.evento.truckDepartureDate ?? "9999").localeCompare(String(b.evento.truckDepartureDate ?? "9999")) || a.evento.name.localeCompare(b.evento.name, "pt-BR") || a.numero - b.numero);
  }, [data, segmento, eventoId, busca]);

  // O RESUMO fala do que ainda vai SAIR (abertos + sozinhas), não do recorte.
  const resumo = useMemo(() => {
    const porSair = data.filter((t) => !t.entregueEm && t.pecas.length > 0);
    const tubos = porSair.filter((t) => !t.avulso).length;
    const sozinhas = porSair.length - tubos;
    const unidades = porSair.reduce((u, t) => u + t.unidades, 0);
    const urgentes = new Set(porSair.filter((t) => { const d = diasAteASaida(t.evento.truckDepartureDate); return d !== null && d <= 2; }).map((t) => t.evento.id)).size;
    return { tubos, sozinhas, unidades, urgentes };
  }, [data]);

  const irPara = (s: Segmento) => { setSeg(s); setMostrando(LOTE); };
  const nomeDo = (t: TuboDaAba) => (t.avulso ? `Embalagem de ${t.pecas[0]?.displayId ?? "peça"}` : `Tubo ${t.numero}`);
  const noLote = useMemo(() => data.filter((t) => marcados.has(t.id) && podeEntrar(t)), [data, marcados]);
  const doFiltro = lista.filter(podeEntrar);
  const todosDoFiltroMarcados = doFiltro.length > 0 && doFiltro.every((t) => marcados.has(t.id));
  const volumesDoLote: VolumeDoLote[] = noLote.map((t) => ({ id: t.id, nome: nomeDo(t), evento: { id: t.evento.id, name: t.evento.name }, pecas: t.pecas.length, unidades: t.unidades }));
  const terminouLote = (r: ResultadoDoLote, recebedor: string) => {
    // Entregues saem do lote; recusados FICAM marcados, com o motivo no cartão.
    setMarcados((m) => { const n = new Set(m); for (const e of r.entregues) n.delete(e.tuboId); return n; });
    setRecusas(Object.fromEntries(r.recusados.map((x) => [x.tuboId, x.motivo])));
    if (r.entregues.length) onEntregou?.(recebedor);
  };
  const botao = (cor: string, solido = false): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: alvo, padding: "0 12px", borderRadius: 8, fontSize: isMobile ? 14 : 12.5, fontWeight: 700, cursor: "pointer", textDecoration: "none",
    border: solido ? "none" : `1px solid ${COR.borda}`, background: solido ? cor : "#fff", color: solido ? "#fff" : cor,
  });
  const campo: React.CSSProperties = { height: isMobile ? 44 : 38, boxSizing: "border-box", borderRadius: 8, border: `1px solid ${COR.borda}`, background: "#fff", color: COR.texto, fontSize: isMobile ? 16 : 13, padding: "0 10px" };

  return (
    <section id="painel-tubos" role="tabpanel" aria-labelledby="aba-grafica-tubos" data-testid="aba-tubos" style={{ display: "flex", flexDirection: "column", gap: 14, padding: isMobile ? "12px 12px 24px" : "16px 0 32px" }}>
      <p data-testid="tubos-resumo" aria-live="polite" style={{ margin: 0, fontSize: isMobile ? 14 : 13, color: COR.sec }}>
        {isLoading ? "Carregando os tubos…" : (
          <>
            <strong style={{ color: COR.texto }}>{plural(resumo.tubos, "tubo aberto", "tubos abertos")}</strong>
            {resumo.sozinhas > 0 ? ` · ${plural(resumo.sozinhas, "embalada sozinha", "embaladas sozinhas")}` : ""} · {resumo.unidades} un.
            {resumo.urgentes > 0 ? <strong style={{ color: COR.ambar }}> · {plural(resumo.urgentes, "evento sai", "eventos saem")} em até 2 dias</strong> : null}
            {isFetching ? <span style={{ color: COR.sec }}> · atualizando…</span> : null}
          </>
        )}
      </p>

      {/* Segmentos: trilho com rolagem no celular, setas e roving tabindex. */}
      <div role="tablist" aria-label="Quais tubos" data-testid="tubos-segmentos"
        onKeyDown={(e) => {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          e.preventDefault();
          const i = SEGMENTOS.findIndex((x) => x.id === segmento);
          const prox = e.key === "ArrowRight" ? (i + 1) % SEGMENTOS.length : (i - 1 + SEGMENTOS.length) % SEGMENTOS.length;
          irPara(SEGMENTOS[prox].id);
          (e.currentTarget.querySelectorAll('[role="tab"]')[prox] as HTMLElement | undefined)?.focus();
        }}
        style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", maxWidth: "100%" }}>
        {SEGMENTOS.map((x) => {
          const ativo = x.id === segmento;
          return (
            <button key={x.id} type="button" role="tab" aria-selected={ativo} tabIndex={ativo ? 0 : -1} onClick={() => irPara(x.id)} data-testid={`tubos-seg-${x.id}`}
              style={{ flexShrink: 0, minHeight: alvo, padding: "0 14px", borderRadius: 999, cursor: "pointer", fontSize: isMobile ? 14 : 13, fontWeight: 700, whiteSpace: "nowrap", border: `1px solid ${ativo ? COR.texto : COR.borda}`, background: ativo ? COR.texto : "#fff", color: ativo ? "#fff" : COR.texto }}>
              {x.rotulo} <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.8 }}>({contagem[x.id] ?? 0})</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label style={{ position: "relative", flex: "2 1 220px", minWidth: 0 }}>
          <span className="sr-only">Buscar nos tubos</span>
          <Search aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: COR.sec }} />
          <input value={busca} onChange={(e) => { setBusca(e.target.value); setMostrando(LOTE); }} data-testid="tubos-busca" type="search"
            placeholder={segmento === "entregues" ? "Código, descrição, evento, nº do tubo ou quem recebeu" : "Código, descrição, evento ou nº do tubo"}
            style={{ ...campo, width: "100%", paddingLeft: 30 }} />
        </label>
        <label style={{ flex: "1 1 180px", minWidth: 0 }}>
          <span className="sr-only">Filtrar por evento</span>
          <select value={eventoId} onChange={(e) => { setEventoId(e.target.value); setMostrando(LOTE); }} data-testid="tubos-evento" style={{ ...campo, width: "100%" }}>
            <option value="">Todos os eventos</option>
            {eventos.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        {(busca || eventoId) && (
          <button type="button" onClick={() => { setBusca(""); setEventoId(""); }} data-testid="tubos-limpar" style={botao(COR.sec)}>
            <X aria-hidden="true" style={{ width: 13, height: 13 }} /> Limpar
          </button>
        )}
      </div>

      {segmento !== "entregues" && doFiltro.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button type="button" data-testid="tubos-marcar-todos"
            onClick={() => setMarcados((m) => { const n = new Set(m); for (const t of doFiltro) { if (todosDoFiltroMarcados) n.delete(t.id); else n.add(t.id); } return n; })}
            style={botao(COR.texto)}>
            {todosDoFiltroMarcados ? "Desmarcar os deste filtro" : `Marcar todos deste filtro (${doFiltro.length})`}
          </button>
          <span style={{ fontSize: 12.5, color: COR.sec }}>Marque os volumes que saem juntos para entregar de uma vez.</span>
        </div>
      )}

      {isError && (
        <div role="alert" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: COR.vermelho, fontSize: 13 }}>
          Não foi possível carregar os tubos.
          <button type="button" onClick={() => refetch()} style={botao(COR.vermelho, true)}>Tentar novamente</button>
        </div>
      )}

      {!isLoading && !isError && lista.length === 0 && (
        <p data-testid="tubos-vazio" style={{ margin: 0, padding: "28px 12px", textAlign: "center", fontSize: 14, color: COR.sec, background: COR.fundo, border: `1px dashed ${COR.borda}`, borderRadius: 12 }}>
          {busca || eventoId ? "Nada com esse filtro. Limpe a busca ou troque o evento."
            : segmento === "abertos" ? "Nenhum tubo aberto. Embale peças conferidas na Gráfica."
            : segmento === "sozinhas" ? "Nenhuma peça embalada sozinha esperando a entrega."
            : "Nenhum tubo entregue ainda."}
        </p>
      )}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(auto-fill, minmax(340px, 1fr))" }}>
        {lista.slice(0, mostrando).map((t) => {
          const d = diasAteASaida(t.evento.truckDepartureDate);
          const aberto = expandidos.has(t.id);
          const visiveis = aberto ? t.pecas : t.pecas.slice(0, 4);
          const nome = t.avulso ? `Embalagem de ${t.pecas[0]?.displayId ?? "peça"}` : `Tubo ${t.numero}`;
          return (
            <article key={t.id} data-testid={`cartao-tubo-${t.id}`} aria-label={`${nome} · ${t.evento.name}`}
              style={{ display: "flex", flexDirection: "column", minWidth: 0, border: `1px solid ${COR.borda}`, borderRadius: 12, background: "#fff", overflow: "hidden" }}>
              <header style={{ padding: "10px 12px", background: marcados.has(t.id) ? "#f0fdf4" : COR.fundo, borderBottom: `1px solid ${COR.borda}`, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {podeEntrar(t) && (
                      <label style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: alvo, minHeight: alvo, margin: isMobile ? "-10px 0 -10px -10px" : "-6px 0 -6px -6px", cursor: "pointer" }}>
                        <input type="checkbox" checked={marcados.has(t.id)} onChange={() => alternar(t.id)} data-testid={`marcar-lote-${t.id}`}
                          aria-label={`Marcar ${nome} para entregar em lote`}
                          // A caixa desenha pelo lado menor (22px); a altura inteira do alvo
                          // é a área de toque — 44px no celular, como todo controle da aba.
                          style={{ width: 22, height: alvo, margin: 0, fontSize: isMobile ? 16 : 14, accentColor: COR.verde, cursor: "pointer" }} />
                      </label>
                    )}
                    <strong style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, color: COR.texto }}>{nome}</strong>
                  </span>
                  <span style={{ fontSize: 12.5, color: COR.sec }}>{plural(t.pecas.length, "peça", "peças")} · {t.unidades} un. · {t.fotosFechamento.length ? plural(t.fotosFechamento.length, "foto", "fotos") : "sem foto"}</span>
                </span>
                <span style={{ fontSize: 13, color: COR.sec, overflowWrap: "anywhere" }}>
                  {t.evento.name}
                  {t.entregueEm
                    ? <strong style={{ color: COR.verde }}> · entregue{t.recebidoPor ? ` a ${t.recebidoPor}` : ""} em {quando(t.entregueEm)}</strong>
                    : d !== null ? <strong style={{ color: d <= 2 ? COR.ambar : COR.sec }}> · caminhão {dia(t.evento.truckDepartureDate)}{d < 0 ? " (já saiu)" : d === 0 ? " (hoje)" : d === 1 ? " (amanhã)" : ` (em ${d} dias)`}</strong> : null}
                </span>
              </header>

              {recusas[t.id] && !t.entregueEm && (
                <p role="status" data-testid={`recusa-lote-${t.id}`} style={{ margin: "8px 12px 0", padding: "8px 10px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: COR.vermelho, fontSize: 12.5, lineHeight: 1.4 }}>
                  Não saiu no lote: {recusas[t.id]}
                </p>
              )}

              {t.fotosFechamento.length > 0 && (
                <div style={{ display: "flex", gap: 6, padding: "8px 12px 0", flexWrap: "wrap" }}>
                  {t.fotosFechamento.slice(0, 5).map((url, i) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" aria-label={`Foto ${i + 1} de ${nome} — abrir`} style={{ width: 44, height: 44, borderRadius: 6, overflow: "hidden", border: `1px solid ${COR.borda}`, display: "block" }}>
                      <img src={url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </a>
                  ))}
                </div>
              )}

              <ul style={{ margin: 0, padding: "8px 12px", listStyle: "none", display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                {visiveis.map((p) => (
                  <li key={p.id} style={{ display: "flex", gap: 8, fontSize: 13, color: COR.texto }}>
                    <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, color: COR.laranja, flexShrink: 0 }}>{p.displayId ?? "—"}</span>
                    <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{linhaDaLista(p)}</span>
                  </li>
                ))}
                {t.pecas.length > 4 && (
                  <li>
                    <button type="button" aria-expanded={aberto} data-testid={`ver-tudo-${t.id}`}
                      onClick={() => setExpandidos((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
                      style={{ minHeight: alvo, padding: 0, border: "none", background: "none", color: COR.azul, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      {aberto ? "Ver menos" : `Ver tudo (${t.pecas.length})`}
                    </button>
                  </li>
                )}
              </ul>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "10px 12px", borderTop: `1px solid ${COR.borda}` }}>
                {t.podeAgir && (
                  <button type="button" onClick={() => setModal({ evento: t.evento, entregarTubo: t.id })} data-testid={`aba-entregar-${t.id}`} style={botao(COR.verde, true)}>
                    <Truck aria-hidden="true" style={{ width: 13, height: 13 }} /> {t.avulso ? "Entregar" : "Entregar tubo"}
                  </button>
                )}
                <button type="button" onClick={() => setModal({ evento: t.evento, verTubo: t.id })} data-testid={`aba-abrir-${t.id}`} style={botao(COR.azul)}>
                  {t.entregueEm ? <CheckCircle2 aria-hidden="true" style={{ width: 13, height: 13 }} /> : <Package aria-hidden="true" style={{ width: 13, height: 13 }} />}
                  {t.entregueEm ? "Ver o registro" : "Abrir · fotos e peças"}
                </button>
                {!t.avulso && (
                  <Link href={`/grafica/tubos/${t.id}/etiqueta`} data-testid={`aba-etiqueta-${t.id}`} style={botao(COR.texto)}>
                    <Tag aria-hidden="true" style={{ width: 13, height: 13 }} /> Etiqueta
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {lista.length > mostrando && (
        <button type="button" onClick={() => setMostrando((n) => n + LOTE)} data-testid="tubos-mostrar-mais" style={{ ...botao(COR.texto), alignSelf: "center", minHeight: isMobile ? 48 : 40, padding: "0 20px" }}>
          Mostrar mais ({lista.length - mostrando} de {lista.length})
        </button>
      )}

      {noLote.length > 0 && (
        <div role="region" aria-label="Entrega em lote" data-testid="barra-entregar-em-lote"
          style={{ position: "sticky", bottom: 0, zIndex: 3, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap",
            padding: isMobile ? "10px 12px calc(10px + env(safe-area-inset-bottom))" : "10px 14px", borderRadius: isMobile ? 0 : 12, background: "#fff", border: `1px solid ${COR.borda}`, boxShadow: "0 -4px 16px rgba(28,25,23,0.08)" }}>
          <span aria-live="polite" style={{ fontSize: isMobile ? 14 : 13, color: COR.texto }}>
            <strong>{plural(noLote.length, "volume marcado", "volumes marcados")}</strong> · {noLote.reduce((s, t) => s + t.unidades, 0)} un.
          </span>
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => { setMarcados(new Set()); setRecusas({}); }} data-testid="limpar-lote" style={botao(COR.sec)}>Limpar</button>
            <button type="button" onClick={() => setLoteAberto(true)} data-testid="abrir-entregar-em-lote" style={botao(COR.verde, true)}>
              <Truck aria-hidden="true" style={{ width: 13, height: 13 }} /> Entregar {noLote.length} em lote
            </button>
          </span>
        </div>
      )}

      <EntregarEmLoteDialog volumes={loteAberto ? volumesDoLote : null} sugestaoRecebedor={sugestaoRecebedor}
        onClose={() => setLoteAberto(false)} onTerminou={terminouLote} />

      <TubosDialog evento={modal ? { id: modal.evento.id, name: modal.evento.name } : null} onClose={() => setModal(null)}
        verTubo={modal?.verTubo} tuboInicial={modal?.entregarTubo}
        onAbrirPeca={onAbrirPeca ? (id) => { setModal(null); onAbrirPeca(id); } : undefined}
        sugestaoRecebedor={sugestaoRecebedor} onEntregou={onEntregou} />
    </section>
  );
}
