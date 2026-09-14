// ─────────────────────────────────────────────────────────────────────────────
// LISTA DE PEDIDOS — a mesma lista para quem pede e para quem resolve.
//
//   · modo "atendimento" (aba do Atendimento): novo pedido, editar, cancelar,
//     reabrir o cancelado; filtro "só meus"; mais recentes primeiro;
//   · modo "solicitacao" (caixa da Solicitação): criar peça direto do pedido,
//     recusar, desfazer atendimento, reabrir o recusado; prazo mais próximo
//     primeiro.
//
// Contadores dos estados contam a base (sem o próprio recorte); a faixa dos
// parados olha todos os pedidos abertos, independente de filtro.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Inbox, Plus, Search } from "lucide-react";
import {
  IDADE_DE_ATENCAO,
  ROTULO_DO_PEDIDO,
  idadeDoPedido,
  pedidoEspera,
  seloDoEventoDoPedido,
  textoDaObservacao,
  type PedidoDePeca,
  type SeloDoEvento,
  type StatusDoPedido,
} from "@shared/pedidos-de-peca";
import { FilterSelect } from "@/components/filter-select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { motivoEventoFinalizado, todayBusinessMs } from "@/lib/status";
import { T, FS, R } from "@/lib/theme";
import { MotivoDoPedidoDialog, type AcaoComMotivo } from "@/components/motivo-do-pedido-dialog";
import { CartaoDoPedido, type AcaoDoCartao } from "@/components/pedidos/cartao-do-pedido";
import { FormularioDoPedido } from "@/components/pedidos/formulario-do-pedido";
import { ListaCarregando, invalidarPedidos, mensagemDaApi } from "@/components/pedidos/ui";

export type ModoDaLista = "atendimento" | "solicitacao";
type Ordem = "recentes" | "antigos" | "prazo";

const PASSO = 300;

export function avisoDaAcao(acao: AcaoComMotivo, pedido: PedidoDePeca): string {
  if (acao === "recusar") return "Quem pediu é avisado com este motivo.";
  if (acao === "cancelar") return "Quem monta a lista é avisado com este motivo — e quem pediu, se não foi você.";
  if (pedido.status === "atendido") return "O pedido volta a aberto e as peças deixam de atender a ele (continuam na lista). Quem pediu é avisado.";
  if (pedido.status === "recusado") return "O pedido volta a aberto e quem pediu é avisado.";
  return "O pedido volta a aberto e quem monta a lista é avisado.";
}

const combina = (p: PedidoDePeca, termo: string) => {
  if (!termo) return true;
  const alvo = [p.eventName, p.sponsorName, textoDaObservacao(p.observacao), p.pedidoPor, p.tipoDePeca, ...(p.pecas ?? []).map((x) => x.displayId)]
    .filter(Boolean).join(" ").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return alvo.includes(termo);
};

export function ListaDePedidos({ modo, podePedir, podeResolver, userId, titulo = false }: {
  modo: ModoDaLista;
  /** atendimento | admin */
  podePedir: boolean;
  /** solicitacao | admin */
  podeResolver: boolean;
  userId: string | null;
  titulo?: boolean;
}) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [filtro, setFiltro] = useState<StatusDoPedido | "todos">("aberto");
  const [ordem, setOrdem] = useState<Ordem>(modo === "solicitacao" ? "prazo" : "recentes");
  const [busca, setBusca] = useState("");
  const [soMeus, setSoMeus] = useState(false);
  const [eventoFiltro, setEventoFiltro] = useState("");
  const [limite, setLimite] = useState(PASSO);
  const [formulario, setFormulario] = useState<{ aberto: boolean; pedido: PedidoDePeca | null }>({ aberto: false, pedido: null });
  const [motivo, setMotivo] = useState<{ pedido: PedidoDePeca; acao: AcaoComMotivo } | null>(null);
  const agora = new Date();
  const alvo = isMobile ? 44 : 34;

  const { data: pedidos = [], isLoading, isError, refetch } = useQuery<PedidoDePeca[]>({ queryKey: [`/api/pedidos-de-peca?limite=${limite}`] });
  const { data: eventos = [] } = useQuery<any[]>({ queryKey: ["/api/events"] });

  const hoje = todayBusinessMs();
  const eventoPorId = useMemo(() => new Map<string, any>(eventos.map((e) => [e.id, e])), [eventos]);
  const seloDe = (p: PedidoDePeca): SeloDoEvento | null => {
    if (p.status !== "aberto" && p.status !== "atendido") return null;
    const ev = eventoPorId.get(p.eventId);
    return seloDoEventoDoPedido({ motivoFim: ev ? motivoEventoFinalizado(ev, hoje) : null, saida: ev?.truckDepartureDate ?? p.eventSaida }, agora);
  };

  const acaoComMotivo = useMutation({
    mutationFn: async ({ pedido, acao, texto }: { pedido: PedidoDePeca; acao: AcaoComMotivo; texto: string }) =>
      (await apiRequest("PATCH", `/api/pedidos-de-peca/${pedido.id}/${acao}`, { motivo: texto })).json(),
    onSuccess: (_d, v) => {
      toast({ title: v.acao === "cancelar" ? "Pedido cancelado" : v.acao === "recusar" ? "Pedido recusado" : "Pedido reaberto" });
      setMotivo(null);
      invalidarPedidos();
    },
    onError: (e) => toast({ title: "Não deu para concluir", description: mensagemDaApi(e), variant: "destructive" }),
  });

  const acoesDe = (p: PedidoDePeca): AcaoDoCartao[] => {
    const selo = seloDe(p);
    const bloqueio = selo?.bloqueiaAtender ? selo.explicacao : null;
    const acoes: AcaoDoCartao[] = [];
    if (modo === "atendimento" && podePedir) {
      if (p.status === "aberto") {
        acoes.push({ chave: "editar", rotulo: "Editar", tom: "secundario", onClick: () => setFormulario({ aberto: true, pedido: p }), testId: `button-editar-pedido-${p.id}` });
        acoes.push({ chave: "cancelar", rotulo: "Cancelar", tom: "perigo", onClick: () => setMotivo({ pedido: p, acao: "cancelar" }), testId: `button-cancelar-pedido-${p.id}` });
      }
      if (p.status === "cancelado") {
        acoes.push({ chave: "reabrir", rotulo: "Reabrir", tom: "secundario", bloqueio, onClick: () => setMotivo({ pedido: p, acao: "reabrir" }), testId: `button-reabrir-pedido-${p.id}` });
      }
    }
    if (modo === "solicitacao" && podeResolver) {
      if (p.status === "aberto") {
        acoes.push({ chave: "criar", rotulo: "Criar peça", tom: "criar", bloqueio, href: `/eventos/${p.eventId}?pedidos=1&criar=${p.id}`, testId: `button-criar-peca-pedido-${p.id}` });
        acoes.push({ chave: "abrir", rotulo: "Abrir no evento", tom: "secundario", href: `/eventos/${p.eventId}?pedidos=1`, testId: `link-evento-pedido-${p.id}` });
        acoes.push({ chave: "recusar", rotulo: "Recusar", tom: "perigo", onClick: () => setMotivo({ pedido: p, acao: "recusar" }), testId: `button-recusar-pedido-${p.id}` });
      }
      if (p.status === "atendido") {
        acoes.push({ chave: "outra", rotulo: "+ Outra peça", tom: "secundario", bloqueio, href: `/eventos/${p.eventId}?pedidos=1&criar=${p.id}`, testId: `button-outra-peca-pedido-${p.id}` });
        acoes.push({ chave: "desfazer", rotulo: "Desfazer atendimento", tom: "perigo", bloqueio, onClick: () => setMotivo({ pedido: p, acao: "reabrir" }), testId: `button-desfazer-pedido-${p.id}` });
      }
      if (p.status === "recusado") {
        acoes.push({ chave: "reabrir", rotulo: "Reabrir", tom: "secundario", bloqueio, onClick: () => setMotivo({ pedido: p, acao: "reabrir" }), testId: `button-reabrir-pedido-${p.id}` });
      }
    }
    return acoes;
  };

  const termo = busca.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const base = pedidos.filter((p) => (!soMeus || p.pedidoPorId === userId) && (!eventoFiltro || p.eventId === eventoFiltro) && combina(p, termo));
  const contagem = (s: StatusDoPedido) => base.filter((p) => p.status === s).length;
  const FILTROS: Array<{ k: StatusDoPedido | "todos"; rotulo: string; n: number }> = [
    { k: "aberto", rotulo: "Abertos", n: contagem("aberto") },
    { k: "atendido", rotulo: "Atendidos", n: contagem("atendido") },
    { k: "recusado", rotulo: "Recusados", n: contagem("recusado") },
    { k: "cancelado", rotulo: "Cancelados", n: contagem("cancelado") },
    { k: "todos", rotulo: "Todos", n: base.length },
  ];

  const tempo = (d: string | null) => (d ? new Date(d).getTime() : Infinity);
  const visiveis = base
    .filter((p) => filtro === "todos" || p.status === filtro)
    .sort((a, b) => {
      if (ordem === "antigos") return tempo(a.createdAt) - tempo(b.createdAt);
      if (ordem === "prazo") return (tempo(a.precisaAte) - tempo(b.precisaAte)) || (tempo(a.createdAt) - tempo(b.createdAt));
      return tempo(b.createdAt) - tempo(a.createdAt);
    });

  const parados = pedidos
    .filter((p) => pedidoEspera(p.status) && idadeDoPedido(p.createdAt, agora).dias > IDADE_DE_ATENCAO)
    .sort((a, b) => tempo(a.createdAt) - tempo(b.createdAt));

  const opcoesDeEvento = useMemo(() => {
    const m = new Map<string, { value: string; label: string; count: number }>();
    for (const p of pedidos) {
      const atual = m.get(p.eventId);
      if (atual) atual.count += 1; else m.set(p.eventId, { value: p.eventId, label: p.eventName ?? "Evento", count: 1 });
    }
    return Array.from(m.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [pedidos]);

  const CHIP = (ativo: boolean, zerado: boolean): React.CSSProperties => ({
    height: alvo, padding: "0 11px", borderRadius: R.pill, cursor: "pointer",
    border: `1px solid ${ativo ? "#1c1917" : "#e7e5e4"}`, background: ativo ? "#1c1917" : "#ffffff",
    color: ativo ? "#ffffff" : zerado ? "#78716c" : "#44403c",
    fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
  });

  return (
    <section data-testid={`lista-pedidos-${modo}`} style={{ background: "#ffffff", border: "1px solid #e7e5e4", borderRadius: R.lg, boxShadow: "0 1px 2px rgba(28,25,23,0.06)", overflow: "hidden", minWidth: 0 }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #f1f0ef", display: "flex", flexDirection: "column", gap: 10 }}>
        {(titulo || (modo === "atendimento" && podePedir)) && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            {titulo && <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: T.text }}>Pedidos de peças</h2>}
            {modo === "atendimento" && podePedir && (
              <button type="button" data-testid="button-novo-pedido" onClick={() => setFormulario({ aberto: true, pedido: null })}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: isMobile ? 44 : 38, padding: "0 16px", borderRadius: R.md, border: "none", background: "#1c1917", color: "#fff", fontSize: FS.body, fontWeight: 800, cursor: "pointer" }}>
                <Plus size={15} aria-hidden="true" /> Novo pedido
              </button>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : "1 1 240px", minWidth: 0 }}>
            <Search size={14} aria-hidden="true" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#57534e" }} />
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} data-testid="input-busca-pedidos"
              aria-label="Buscar pedidos por evento, patrocinador, observação, quem pediu ou peça"
              placeholder="Evento, patrocinador, observação, quem pediu…"
              style={{ width: "100%", boxSizing: "border-box", height: alvo, padding: "0 12px 0 32px", borderRadius: R.md, border: "1px solid #e7e5e4", fontSize: FS.body, color: T.text, outline: "none" }} />
          </div>
          {opcoesDeEvento.length > 1 && (
            <FilterSelect label="Evento" allLabel="Todos os eventos" showAllLabelWhenEmpty hideWhenEmpty={false}
              value={eventoFiltro} onChange={setEventoFiltro} options={opcoesDeEvento}
              searchPlaceholder="Buscar evento..." emptyText="Nenhum evento." testId="select-evento-pedidos"
              triggerStyle={{ height: alvo, borderRadius: R.md, border: "1px solid #e7e5e4", padding: "0 12px", fontSize: FS.body, background: "#fff" }} />
          )}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: FS.body, color: "#44403c", fontWeight: 600 }}>
            Ordem
            <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} data-testid="select-ordem-pedidos"
              style={{ height: alvo, borderRadius: R.md, border: "1px solid #e7e5e4", padding: "0 8px", fontSize: FS.body, background: "#fff", color: T.text }}>
              <option value="prazo">Prazo mais próximo</option>
              <option value="recentes">Mais recentes</option>
              <option value="antigos">Mais antigos</option>
            </select>
          </label>
        </div>

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          <div role="group" aria-label="Filtrar por estado" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {FILTROS.map((f) => (
              <button key={f.k} type="button" aria-pressed={filtro === f.k} data-testid={`filtro-pedidos-${f.k}`} onClick={() => setFiltro(f.k)} style={CHIP(filtro === f.k, f.n === 0)}>
                {f.rotulo}<span style={{ fontVariantNumeric: "tabular-nums" }}>{f.n}</span>
              </button>
            ))}
          </div>
          {modo === "atendimento" && (
            <button type="button" aria-pressed={soMeus} data-testid="filtro-pedidos-meus" onClick={() => setSoMeus((v) => !v)} style={{ ...CHIP(soMeus, false), marginLeft: isMobile ? 0 : "auto" }}>
              Só os meus
            </button>
          )}
        </div>
      </div>

      {parados.length > 0 && (
        <div data-testid="faixa-pedidos-parados" role="status" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 16px", background: "#fffbeb", borderBottom: "1px solid #fde68a" }}>
          <AlertTriangle size={18} color="#b45309" aria-hidden="true" style={{ flexShrink: 0 }} />
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#78350f" }}>
              {parados.length} {parados.length === 1 ? "pedido esperando" : "pedidos esperando"} há mais de {IDADE_DE_ATENCAO} dias
            </div>
            <div style={{ fontSize: 11, color: "#78350f", marginTop: 2, lineHeight: 1.45 }}>
              {parados.slice(0, 3).map((p) => `${p.pedidoPor ?? "—"} · ${p.eventName ?? "evento"} · ${idadeDoPedido(p.createdAt, agora).texto}`).join("; ")}
            </div>
          </div>
          <button type="button" data-testid="button-ver-mais-antigos" onClick={() => { setFiltro("aberto"); setOrdem("antigos"); }}
            style={{ height: alvo, padding: "0 12px", borderRadius: R.md, border: "1px solid #fcd34d", background: "#ffffff", color: "#78350f", fontSize: 12.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>
            Ver os {parados.length} mais antigos
          </button>
        </div>
      )}

      {isLoading ? (
        <ListaCarregando />
      ) : isError ? (
        <p style={{ margin: 0, padding: 20, fontSize: FS.body, color: "#b91c1c" }}>
          Não foi possível carregar os pedidos.{" "}
          <button type="button" onClick={() => refetch()} style={{ border: "none", background: "none", fontWeight: 800, textDecoration: "underline", cursor: "pointer", color: T.text }}>Tentar de novo</button>
        </p>
      ) : visiveis.length === 0 ? (
        <div data-testid="pedidos-vazio" style={{ padding: "36px 16px", textAlign: "center", color: "#57534e" }}>
          <Inbox size={26} color="#78716c" aria-hidden="true" />
          <p style={{ margin: "8px 0 2px", fontSize: 14, fontWeight: 700, color: T.text }}>
            {pedidos.length === 0 ? "Nenhum pedido ainda" : termo || eventoFiltro || soMeus ? "Nenhum pedido neste recorte" : filtro === "aberto" ? "Nenhum pedido esperando a lista" : `Nenhum pedido ${ROTULO_DO_PEDIDO[filtro as StatusDoPedido]?.toLowerCase() ?? ""}`}
          </p>
          {pedidos.length === 0 && modo === "atendimento" && podePedir && (
            <p style={{ margin: 0, fontSize: FS.body }}>Use “Novo pedido” para pedir uma peça a quem monta a lista.</p>
          )}
        </div>
      ) : (
        <ul style={{ margin: 0, padding: 0 }}>
          {visiveis.map((p) => (
            <CartaoDoPedido key={p.id} pedido={p} agora={agora} selo={seloDe(p)} acoes={acoesDe(p)} />
          ))}
        </ul>
      )}

      {pedidos.length >= limite && (
        <div style={{ padding: 12, borderTop: "1px solid #f1f0ef", textAlign: "center" }}>
          <button type="button" data-testid="button-mais-pedidos" onClick={() => setLimite((l) => l + PASSO)}
            style={{ height: alvo, padding: "0 16px", borderRadius: R.md, border: "1px solid #e7e5e4", background: "#fff", color: T.text, fontSize: FS.body, fontWeight: 700, cursor: "pointer" }}>
            Carregar pedidos mais antigos
          </button>
        </div>
      )}

      <FormularioDoPedido aberto={formulario.aberto} pedido={formulario.pedido} onFechar={() => setFormulario({ aberto: false, pedido: null })} />
      <MotivoDoPedidoDialog
        pedido={motivo?.pedido ?? null}
        acao={motivo?.acao ?? "cancelar"}
        aviso={motivo ? avisoDaAcao(motivo.acao, motivo.pedido) : ""}
        pendente={acaoComMotivo.isPending}
        onConfirmar={(texto) => { if (motivo) acaoComMotivo.mutate({ pedido: motivo.pedido, acao: motivo.acao, texto }); }}
        onFechar={() => setMotivo(null)}
      />
    </section>
  );
}
