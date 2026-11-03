// ─────────────────────────────────────────────────────────────────────────────
// REAPROVEITAR (dono, 03/11): "é um módulo que vai todos reaproveitar apenas,
// com as mesmas informações da Gráfica, pois a pessoa vai colocar quantos temos
// no estoque; caso ele não coloque todos, o item vai para a Gráfica produzir".
//
// Quem reaproveita não é quem imprime: esta tela só tem as peças que a Revisão
// Final pediu para reaproveitar, com o que a Gráfica vê de cada uma (arte,
// descrição, material, medidas, observações, prazo). A pessoa digita quantas tem
// e confirma: as confirmadas seguem para Conferir, o resto cai na fila da Gráfica
// para imprimir. A regra mora em @shared/reaproveitar.
// ─────────────────────────────────────────────────────────────────────────────
import type React from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Calendar, Check, Package, Recycle, Truck } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile, usePonteiroGrosso } from "@/hooks/use-mobile";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { invalidarGraficaEMaquinas } from "@/lib/tempo-real-grafica";
import { seloPecaEventoFinalizado, todayBusinessMs } from "@/lib/status";
import { normalizarBusca, parseDateLocal } from "@/lib/utils";
import { canConfer, isDelivered, qtyOf, reusedTotalOf } from "@/lib/saldo";
import { ESCURO, FONT, FS, FW, N, R, T, TOM } from "@/lib/theme";
import { Abas } from "@/components/ui/abas";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EstadoErro, EstadoVazio } from "@/components/ui/estados";
import { EsqueletoDeFila } from "@/components/esqueleto-de-fila";
import { FilterSelect } from "@/components/filter-select";
import { BotaoCopiar } from "@/components/botao-copiar";
import { StatusPill } from "@/components/status-pill";
import { SeloKit } from "@/components/kit/selo-kit";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import { ObservacoesDaPeca } from "@/components/grafica/observacoes-da-peca";
import { MiniaturaDaPeca } from "@/components/grafica/fila/miniatura-da-peca";
import { DeadlineChip, m2DaLinha } from "@/components/grafica/fila/selos";
import { ordenarFilaDaGrafica } from "@/components/grafica/fila/ordem-da-fila";
import { useHistoricoDaPeca } from "@/components/grafica/hooks/use-fila-da-grafica";
import type { PecaDaFila } from "@/components/grafica/tipos";
import { statusDeExibicao } from "@shared/molde";
import { soVisualizaPecaDoKit } from "@shared/kit";
import { fraseDaTrava, pecaTravada } from "@shared/trava-da-peca";
import { aguardaReaproveitar, fraseDaResposta, pedidoDoReaproveitar } from "@shared/reaproveitar";

const SEM_PECAS: PecaDaFila[] = [];
const LOTE = 60;
type Aba = "responder" | "reaproveitadas" | "entregues";

export default function Reaproveitar() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const dedo = usePonteiroGrosso();
  // Sem escolha ainda: abre em "A responder", ou nas reaproveitadas se não houver o que responder.
  const [abaEscolhida, setAba] = useState<Aba | null>(null);
  const [busca, setBusca] = useState("");
  const [evento, setEvento] = useState("all");
  const [vistas, setVistas] = useState(LOTE);
  const [detalhe, setDetalhe] = useState<PecaDaFila | null>(null);
  const auditLogs = useHistoricoDaPeca(detalhe?.id);

  // A MESMA lista da Gráfica (a mesma chave, o mesmo cache e o mesmo tempo real).
  const { data: pecas = SEM_PECAS, isLoading, isError, isFetching, refetch } = useQuery<PecaDaFila[]>({
    queryKey: ["/api/items/approved"],
    staleTime: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const hoje = todayBusinessMs();
  const vivas = useMemo(() => pecas.filter((p) => !p.deletedAt && !seloPecaEventoFinalizado(p.event, hoje)), [pecas, hoje]);
  const aResponder = useMemo(() => ordenarFilaDaGrafica(vivas.filter(aguardaReaproveitar)), [vivas]);
  const comReuso = useMemo(() => ordenarFilaDaGrafica(vivas.filter((p) => !aguardaReaproveitar(p) && reusedTotalOf(p) > 0)), [vivas]);
  const reaproveitadas = useMemo(() => comReuso.filter((p) => !isDelivered(p)), [comReuso]);
  const entregues = useMemo(() => comReuso.filter(isDelivered), [comReuso]);
  const aba: Aba = abaEscolhida ?? (aResponder.length > 0 || reaproveitadas.length === 0 ? "responder" : "reaproveitadas");
  const daAba = aba === "responder" ? aResponder : aba === "reaproveitadas" ? reaproveitadas : entregues;

  const opcoesDeEvento = useMemo(() => {
    const m = new Map<string, { value: string; label: string; count: number }>();
    for (const p of daAba) {
      const id = String(p.eventId);
      const x = m.get(id);
      if (x) x.count++; else m.set(id, { value: id, label: p.event?.name ?? "Sem evento", count: 1 });
    }
    return Array.from(m.values());
  }, [daAba]);

  const visiveis = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    return daAba.filter((p) => (evento === "all" || String(p.eventId) === evento)
      && (!termo || normalizarBusca([p.displayId, p.type, p.description, p.material, p.event?.name].filter(Boolean).join(" ")).includes(termo)));
  }, [daAba, busca, evento]);
  const naTela = visiveis.slice(0, vistas);

  const responder = useMutation({
    mutationFn: async ({ peca, qty }: { peca: PecaDaFila; qty: number }) =>
      (await apiRequest("POST", `/api/items/${peca.id}/mark-reuse`, {
        respostaDoEstoque: true,
        qty,
        // A nota de onde está no estoque (a Revisão escreveu) segue com a peça.
        ...(qty > 0 ? { origemReaproveitamento: "estoque", obsReaproveitamento: peca.obsReaproveitamento ?? null } : {}),
      })).json(),
    onSuccess: (_r, { peca, qty }) => {
      toast({ title: `${peca.displayId ?? "Peça"} respondida`, description: fraseDaResposta(qty, qtyOf(peca)) });
      invalidarGraficaEMaquinas();
      void queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    },
    onError: (e: Error, { peca }) => {
      toast({ title: `Não deu para responder ${peca.displayId ?? "a peça"}`, description: e.message, variant: "destructive" });
      invalidarGraficaEMaquinas();
    },
  });
  let eventoAnterior: unknown = null;
  return (
    <div data-testid="pagina-reaproveitar" className="container mx-auto p-4 max-w-6xl 2xl:max-w-[1440px]" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CabecalhoDaPagina
        titulo="Reaproveitar"
        subtitulo={isMobile ? "Quantas temos no estoque? O que faltar vai para a Gráfica." : "Diga quantas unidades temos no estoque. O que faltar vai para a Gráfica produzir."}
      />
      <Abas
        rotuloDaLista="Peças de reaproveitamento"
        prefixoDeTestId="aba-reaproveitar"
        ativo={aba}
        aoTrocar={(id) => { setAba(id as Aba); setEvento("all"); setVistas(LOTE); }}
        itens={[
          { id: "responder", rotulo: "A responder", contador: aResponder.length > 0 ? aResponder.length : undefined, tom: "alerta" },
          { id: "reaproveitadas", rotulo: "Reaproveitadas", contador: reaproveitadas.length > 0 ? reaproveitadas.length : undefined },
          { id: "entregues", rotulo: "Entregues", contador: entregues.length > 0 ? entregues.length : undefined },
        ]}
      />
      {daAba.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <input
            type="search"
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setVistas(LOTE); }}
            placeholder="Buscar por ID, descrição ou evento"
            aria-label="Buscar peça"
            data-testid="busca-reaproveitar"
            className="grf-campo"
            style={{ flex: "1 1 260px", minWidth: 0, height: isMobile || dedo ? 44 : 38, padding: "0 12px", borderRadius: R.md, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: isMobile ? 16 : FS.body }}
          />
          <FilterSelect
            showAllLabelWhenEmpty hideWhenEmpty={false}
            label="Evento" allLabel="Todos os eventos" icon={Calendar}
            value={evento} onChange={(v) => { setEvento(v || "all"); setVistas(LOTE); }} options={opcoesDeEvento}
            searchPlaceholder="Buscar evento…" emptyText="Nenhum evento encontrado."
            testId="filtro-evento-reaproveitar" fullWidth={isMobile} panelWidth={isMobile ? undefined : 340}
          />
        </div>
      )}

      {isLoading ? <EsqueletoDeFila linhas={6} />
        : isError ? <EstadoErro titulo="Não foi possível carregar as peças" detalhe="Verifique sua conexão e tente novamente." aoTentarDeNovo={isFetching ? undefined : () => { void refetch(); }} />
        : visiveis.length === 0 ? (
          <EstadoVazio
            icone={Recycle}
            testId="vazio-reaproveitar"
            titulo={daAba.length > 0 ? "Nenhuma peça neste recorte" : aba === "responder" ? "Nada esperando resposta" : aba === "reaproveitadas" ? "Nenhuma peça reaproveitada em andamento" : "Nenhuma peça reaproveitada entregue"}
            descricao={daAba.length > 0 ? "Mude a busca ou o evento." : aba === "responder" ? "Quando a Revisão Final pedir reaproveitamento, a peça aparece aqui." : "As peças com reaproveitamento aparecem aqui depois da resposta."}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="lista-reaproveitar">
            {naTela.map((p) => {
              const abreEvento = p.eventId !== eventoAnterior;
              eventoAnterior = p.eventId;
              return (
                <div key={p.id} style={{ display: "contents" }}>
                  {abreEvento && <CabecalhoDoEvento peca={p} primeiro={p === naTela[0]} />}
                  <LinhaDaPeca
                    peca={p}
                    respondendo={aba === "responder"}
                    enviando={responder.isPending && responder.variables?.peca.id === p.id}
                    ocupado={responder.isPending}
                    podeAgir={!soVisualizaPecaDoKit(user, p)}
                    isMobile={isMobile}
                    dedo={dedo}
                    aoResponder={(qty) => responder.mutate({ peca: p, qty })}
                    aoAbrir={() => setDetalhe(p)}
                  />
                </div>
              );
            })}
            {visiveis.length > naTela.length && (
              <Botao variante="secundario" tamanho={isMobile || dedo ? "toque" : "md"} onClick={() => setVistas((n) => n + LOTE)} data-testid="mostrar-mais-reaproveitar" style={{ alignSelf: "center" }}>
                Mostrar mais ({visiveis.length - naTela.length})
              </Botao>
            )}
          </div>
        )}

      <ItemDetailsDialog item={detalhe} auditLogs={auditLogs} open={!!detalhe} onOpenChange={(o) => { if (!o) setDetalhe(null); }} />
    </div>
  );
}

function CabecalhoDoEvento({ peca, primeiro }: { peca: PecaDaFila; primeiro: boolean }) {
  const ev = peca.event;
  const isMobile = useIsMobile();
  return (
    <div className="ds-sobre-escuro" style={{ marginTop: primeiro ? 0 : 10, padding: "10px 14px", borderRadius: R.md, background: ESCURO.gradiente, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px 16px" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <Package aria-hidden="true" style={{ width: 14, height: 14, color: T.accent, flexShrink: 0 }} />
        <span style={{ fontFamily: FONT.display, fontSize: FS.strong, fontWeight: FW.rotulo, color: ESCURO.texto, overflowWrap: "anywhere" }}>{ev?.name ?? "Sem evento"}</span>
      </span>
      {ev && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px 14px", flexWrap: "wrap", fontSize: isMobile ? 12 : FS.small, color: ESCURO.apoio }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
            <Calendar aria-hidden="true" style={{ width: 12, height: 12 }} />
            Início <strong style={{ color: ESCURO.texto, fontVariantNumeric: "tabular-nums" }}>{parseDateLocal(ev.startDate).toLocaleDateString("pt-BR")}</strong>
          </span>
          {ev.truckDepartureDate && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
              <Truck aria-hidden="true" style={{ width: 12, height: 12 }} />
              Saída <strong style={{ color: ESCURO.texto, fontVariantNumeric: "tabular-nums" }}>{new Date(ev.truckDepartureDate).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</strong>
            </span>
          )}
          <DeadlineChip event={ev} />
        </span>
      )}
    </div>
  );
}

function LinhaDaPeca({ peca, respondendo, enviando, ocupado, podeAgir, isMobile, dedo, aoResponder, aoAbrir }: {
  peca: PecaDaFila;
  respondendo: boolean;
  enviando: boolean;
  ocupado: boolean;
  /** A Solicitação da Arena só visualiza peça do Kit. */
  podeAgir: boolean;
  isMobile: boolean;
  dedo: boolean;
  aoResponder: (qty: number) => void;
  aoAbrir: () => void;
}) {
  const pedido = pedidoDoReaproveitar(peca);
  // Nasce VAZIO: a resposta é uma contagem de quem foi olhar, não um padrão aceito sem ver.
  const [texto, setTexto] = useState("");
  const temos = texto === "" ? null : Number(texto);
  const valido = temos !== null && Number.isInteger(temos) && temos >= 0 && temos <= pedido;
  const travada = pecaTravada(peca);
  const alto = isMobile || dedo ? 44 : 36;
  const medidas = [
    peca.fileWidth && peca.fileHeight ? `ARQ ${peca.fileWidth}×${peca.fileHeight}` : null,
    peca.visualWidth && peca.visualHeight ? `VIS ${peca.visualWidth}×${peca.visualHeight}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <article data-testid={`reaproveitar-peca-${peca.id}`} style={{ border: `1px solid ${T.border}`, borderRadius: R.md, background: T.surface, padding: isMobile ? 12 : "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 16px", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 10, flex: "1 1 280px", minWidth: 0 }}>
          <MiniaturaDaPeca item={peca} tamanho={isMobile ? 56 : 48} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              <button type="button" onClick={aoAbrir} aria-label={`Ver detalhes da peça ${peca.displayId ?? ""}`} data-testid={`abrir-peca-${peca.id}`}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: FONT.mono, fontSize: 13, fontWeight: FW.rotulo, color: T.accentText, minWidth: isMobile || dedo ? 44 : undefined, minHeight: isMobile || dedo ? 44 : undefined }}>
                {peca.displayId}
              </button>
              <SeloKit peca={peca} />
              <span style={{ fontSize: FS.read, fontWeight: FW.forte, color: T.text }}>{peca.type}</span>
            </div>
            {peca.description && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: FS.body, color: T.second, overflowWrap: "anywhere", minWidth: 0 }}>{peca.description}</span>
                <BotaoCopiar texto={peca.description} rotulo={`a descrição da peça ${peca.displayId ?? ""}`.trim()} tamanho={isMobile || dedo ? 44 : 24} testId={`copiar-descricao-reaproveitar-${peca.id}`} />
              </div>
            )}
          </div>
        </div>
        <dl style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", margin: 0, flex: "1 1 300px", minWidth: 0 }}>
          <Dado rotulo="Material" valor={[peca.material, peca.finish].filter(Boolean).join(" · ") || "—"} isMobile={isMobile} />
          <Dado rotulo="Medidas" valor={medidas || "—"} mono isMobile={isMobile} />
          <Dado rotulo="Qtd" valor={String(qtyOf(peca))} isMobile={isMobile} />
          <Dado rotulo="m²" valor={m2DaLinha(peca)} isMobile={isMobile} />
        </dl>
        {!respondendo && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }} data-testid={`resposta-${peca.id}`}>
            <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: TOM.esmeralda.text, fontVariantNumeric: "tabular-nums" }}>{reusedTotalOf(peca)} de {qtyOf(peca)} un. reaproveitadas</span>
            <StatusPill status={statusDeExibicao(peca)} size="sm" showDot={false} />
            {podeAgir && !travada && canConfer(peca) && (
              <BotaoLink href={`/grafica?reuso=1&item=${peca.id}`} variante="primario" tamanho={isMobile || dedo ? "toque" : "sm"} icone={Check} data-testid={`conferir-reaproveitada-${peca.id}`} style={{ background: TOM.ciano.text, borderColor: TOM.ciano.text, color: T.surface }}>Conferir</BotaoLink>
            )}
          </div>
        )}
      </div>

      <ObservacoesDaPeca peca={peca} compacto extras={[{ rotulo: "Onde está no estoque", texto: peca.obsReaproveitamento }]} />

      {respondendo && (
        <div style={{ borderTop: `1px solid ${N.n3}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {!podeAgir || travada ? (
            <p data-testid={`sem-acao-${peca.id}`} style={{ margin: 0, fontSize: FS.meta, color: T.apoio }}>
              {travada ? fraseDaTrava(peca) : "Peça do Kit: quem responde é o Kit ou o administrador."}
            </p>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <label htmlFor={`temos-${peca.id}`} style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>
                  Temos no estoque
                </label>
                <input
                  id={`temos-${peca.id}`}
                  type="number" inputMode="numeric" pattern="[0-9]*" min={0} max={pedido}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && valido && !ocupado && !e.repeat) aoResponder(temos!); }}
                  aria-invalid={temos !== null && !valido ? true : undefined}
                  aria-describedby={`frase-${peca.id}`}
                  data-testid={`input-temos-${peca.id}`}
                  className="grf-campo"
                  style={{ width: 84, height: alto, textAlign: "center", borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, color: T.text, fontWeight: FW.forte, fontSize: isMobile ? 16 : FS.read, fontVariantNumeric: "tabular-nums" }}
                />
                <span style={{ fontSize: FS.body, color: T.second, fontVariantNumeric: "tabular-nums" }}>de {pedido} un.</span>
                <Botao variante="secundario" tamanho={isMobile || dedo ? "toque" : "sm"} onClick={() => setTexto(String(pedido))} data-testid={`temos-tudo-${peca.id}`}>Tudo</Botao>
                <Botao variante="secundario" tamanho={isMobile || dedo ? "toque" : "sm"} onClick={() => setTexto("0")} data-testid={`temos-nada-${peca.id}`}>Não tem</Botao>
                <Botao
                  variante="primario" tom="esmeralda" tamanho={isMobile || dedo ? "toque" : "md"} icone={Check}
                  disabled={!valido || ocupado} carregando={enviando}
                  onClick={() => { if (valido) aoResponder(temos!); }}
                  data-testid={`confirmar-temos-${peca.id}`}
                  style={{ marginLeft: isMobile ? 0 : "auto", flex: isMobile ? "1 1 100%" : undefined }}
                >
                  {enviando ? "Salvando…" : "Confirmar"}
                </Botao>
              </div>
              <p id={`frase-${peca.id}`} role="status" data-testid={`frase-temos-${peca.id}`} style={{ margin: 0, fontSize: FS.meta, minHeight: 18, color: temos !== null && !valido ? TOM.perigo.text : T.apoio }}>
                {temos === null ? "Conte no estoque e digite quantas têm."
                  : !valido ? `Digite um número inteiro de 0 a ${pedido}: a Revisão pediu ${pedido} un.`
                  : fraseDaResposta(temos, qtyOf(peca))}
                {temos !== null && valido && temos < pedido && !peca.finalFileUrl && !peca.producaoInterna && (
                  <strong style={{ display: "block", color: TOM.alerta.text }}>Esta peça não tem arquivo final: a Gráfica vai precisar dele para imprimir o que falta.</strong>
                )}
              </p>
            </>
          )}
        </div>
      )}
    </article>
  );
}

function Dado({ rotulo, valor, mono = false, isMobile }: { rotulo: string; valor: React.ReactNode; mono?: boolean; isMobile: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <dt style={{ fontSize: isMobile ? 12 : FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.06em", textTransform: "uppercase", color: T.second }}>{rotulo}</dt>
      <dd style={{ margin: 0, fontSize: mono ? 12 : FS.body, fontFamily: mono ? FONT.mono : undefined, color: T.text, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>{valor}</dd>
    </div>
  );
}
