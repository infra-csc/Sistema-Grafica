// ─────────────────────────────────────────────────────────────────────────────
// ESTOQUE — DETALHE DO ATIVO (refeito em 21/09, pedido do dono).
//
// O modal antigo tinha dois temas escuros competindo (lateral "Rastreabilidade"
// + cartão "Especificações"), "Informações do Evento" com metade vazia, "Qtd
// total 1 un." ao lado de "Quantidade 34 un." sem dizer que uma é a UNIDADE e a
// outra a PEÇA DE ORIGEM, localização vazia de um lado e preenchida do
// outro, nenhuma ação e nenhum histórico de uso.
//
// Agora, numa coluna de leitura só, no tema claro da casa (modal-shell):
//   1. cabeçalho — quem é (código, nome) e a situação;
//   2. arte + "Situação agora" (situação, condição editável, reserva vigente);
//   3. "Especificações" (da peça de origem; a quantidade diz de quem é);
//   4. "Onde já foi usado" (origem + reservas, com a peça #código);
//   5. "Rastreabilidade" como linha do tempo clara (só para UMA unidade);
//   6. rodapé fixo com as ações.
// Aberto a partir de um GRUPO, mostra o grupo (34 un.) e a lista das unidades.
//
// SEM LOCALIZAÇÃO (dono, 21/09): o sistema não guarda onde a peça fica no
// galpão. "No galpão" é SITUAÇÃO, e continua.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Archive, BookmarkCheck, CalendarDays, CheckCircle2, ChevronRight, Package, Pencil, Wrench, Warehouse } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalFooter, ModalHeader, modalSurface } from "@/components/modal-shell";
import { useAcompanharAreaVisivel } from "@/components/grafica/area-visivel";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { miniatura } from "@/lib/miniatura";
import { CONDITION_META, conditionMeta, type Condition } from "@/lib/inventory-meta";
import { emGrupos, GRAVACOES_POR_VEZ } from "@/components/triagem/quadro-da-triagem";
import { fraseDaCondicao, fraseDaSituacao, type GrupoDoAcervo } from "@/lib/agrupar-acervo";
import { ROTULO_DO_USO, diaEMes, eventosDeUso, type UsoDoAtivo } from "@shared/estoque";
import type { InventoryAsset, Sponsor } from "@shared/schema";

export const SITUACAO_META: Record<string, { label: string; color: string; bg: string }> = {
  NO_GALPAO: { label: "No galpão", color: "#15803d", bg: "#f0fdf4" },
  EM_USO: { label: "Em uso", color: "#c2410c", bg: "#fff7ed" },
  AGUARDANDO_TRIAGEM: { label: "Aguardando triagem", color: "#b45309", bg: "#fffbeb" },
  EM_MANUTENCAO: { label: "Em manutenção", color: "#92400e", bg: "#fef3c7" },
  DESCARTADO: { label: "Descartado", color: "#57534e", bg: "#f5f5f4" },
};

type Reserva = { reservaId: string; assetId: string; itemDisplayId: string | null; eventName: string; saida: string | null };

const CONDICOES: Condition[] = ["PERFEITO", "AVARIA_LEVE", "SUCATA"];
const ehImagem = (u?: string | null) => !!u && (/\.(png|jpe?g|gif|webp)/i.test(u) || u.startsWith("/objects/"));
const dataLonga = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).replace(".", "") : null);

const TITULO: React.CSSProperties = { margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: "#0f172a", fontFamily: "Space Grotesk, sans-serif" };
const CARTAO: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 };

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
      <dt style={{ color: "#64748b", flexShrink: 0 }}>{rotulo}</dt>
      <dd style={{ margin: 0, color: "#0f172a", fontWeight: 600, textAlign: "right", overflowWrap: "anywhere" }}>{children}</dd>
    </div>
  );
}

export function DetalheDoAtivo({ grupo, unidade, linkedItem, sponsors, reservaPorAtivo, usosPorAtivo, podeEditar, onClose, onEditar, onAbrirUnidade }: {
  /** O grupo de origem (sempre vem; com uma unidade só, é um grupo de 1). */
  grupo: GrupoDoAcervo<InventoryAsset>;
  /** Quando definido, o modal mostra ESTA unidade; senão, o grupo inteiro. */
  unidade: InventoryAsset | null;
  linkedItem?: any;
  sponsors: Sponsor[];
  reservaPorAtivo: Map<string, Reserva>;
  usosPorAtivo: Map<string, UsoDoAtivo[]>;
  podeEditar: boolean;
  onClose: () => void;
  onEditar: (a: InventoryAsset) => void;
  onAbrirUnidade: (a: InventoryAsset | null) => void;
}) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const superficieRef = useRef<HTMLDivElement>(null);
  useAcompanharAreaVisivel(superficieRef, "centro", isMobile);
  const [gravando, setGravando] = useState(false);

  const umaSo = unidade ?? (grupo.ativos.length === 1 ? grupo.ativos[0] : null);
  const alvos = umaSo ? [umaSo] : grupo.ativos;
  const unidades = alvos.reduce((s, a) => s + (a.quantity ?? 1), 0);
  const situacoes = umaSo ? null : fraseDaSituacao(grupo);
  const sm = umaSo ? SITUACAO_META[umaSo.trackingStatus] ?? SITUACAO_META.NO_GALPAO : null;
  const arte = umaSo?.approvalThumbUrl ?? grupo.miniatura;
  const reservas = alvos.map((a) => reservaPorAtivo.get(a.id)).filter((r): r is Reserva => !!r);

  // Patrocinadores: os do ativo; se o ativo não tem vínculo (o nome dizia
  // "Nubank" e o campo mostrava "—"), os da peça de origem.
  const nomesDePatrocinador = useMemo(() => {
    const ids = new Set<string>(alvos.flatMap((a) => a.sponsorIds ?? []));
    const doAtivo = sponsors.filter((s) => ids.has(s.id)).map((s) => s.name);
    if (doAtivo.length > 0) return doAtivo;
    return ((linkedItem?.sponsors ?? []) as any[]).map((s) => s?.name).filter(Boolean) as string[];
  }, [alvos, sponsors, linkedItem]);

  const usos = useMemo(() => (umaSo ? usosPorAtivo.get(umaSo.id) ?? [] : []), [umaSo, usosPorAtivo]);
  const eventos = useMemo(() => eventosDeUso(alvos.map((a) => usosPorAtivo.get(a.id) ?? []), alvos.map((a) => a.quantity)), [alvos, usosPorAtivo]);

  // A trilha só existe por unidade (é por registro). Chave em string única: o
  // queryFn padrão junta a queryKey com "/".
  const { data: trilha, isLoading: carregandoTrilha } = useQuery<any[]>({
    queryKey: [`/api/audit-logs?entityType=inventory_asset&entityId=${umaSo?.id}`],
    enabled: !!umaSo,
  });

  const mudar = async (dados: Record<string, unknown>, feito: string) => {
    if (gravando) return;
    setGravando(true);
    const r = await emGrupos(alvos, GRAVACOES_POR_VEZ, (a) => apiRequest("PATCH", `/api/inventory/${a.id}`, dados));
    const falhas = r.filter((x) => x.status === "rejected") as PromiseRejectedResult[];
    queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    if (falhas.length > 0) queryClient.invalidateQueries({ queryKey: ["/api/estoque/reservas-ativas"] });
    setGravando(false);
    if (falhas.length > 0) toast({ title: `${alvos.length - falhas.length} de ${alvos.length} atualizadas`, description: falhas[0].reason?.message, variant: "destructive" });
    else toast({ title: feito, description: alvos.length > 1 ? `${alvos.length} registros · ${unidades} un.` : alvos[0].displayId });
  };

  const condicaoUnica = umaSo ? umaSo.condition : Object.keys(grupo.porCondicao).length === 1 ? Object.keys(grupo.porCondicao)[0] : null;
  // Mandar para manutenção / voltar ao galpão só faz sentido para o que está
  // parado: EM USO e AGUARDANDO TRIAGEM são do ciclo do evento (o servidor recusa).
  const parados = alvos.every((a) => a.trackingStatus === "NO_GALPAO" || a.trackingStatus === "EM_MANUTENCAO");
  const todosEmManutencao = alvos.every((a) => a.trackingStatus === "EM_MANUTENCAO");
  // Peça reservada não vai para manutenção (o servidor recusa com 409): o
  // botão fica desabilitado e o motivo aparece embaixo, antes do clique.
  const manutencaoBloqueada = !todosEmManutencao && reservas.length > 0;
  const alvo = isMobile ? 44 : 36;
  const botao = (primario: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, padding: "0 16px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: gravando ? "wait" : "pointer",
    border: primario ? "none" : "1px solid #e2e8f0", background: primario ? "#c2410c" : "#fff", color: primario ? "#fff" : "#334155", flex: isMobile ? 1 : undefined,
  });

  const titulo = umaSo ? umaSo.name : grupo.nome;
  const subtitulo = umaSo
    ? `${umaSo.displayId} · ${(umaSo.quantity ?? 1) === 1 ? "1 unidade" : `${umaSo.quantity} unidades`}${grupo.ativos.length > 1 ? ` · uma das ${grupo.unidades} deste material` : ""}`
    : `${grupo.unidades} unidades em ${grupo.ativos.length} registros`;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent ref={superficieRef} data-testid="detalhe-do-ativo" className={HIDE_NATIVE_CLOSE} style={modalSurface(760)}>
        <DialogTitle className="sr-only">{titulo}</DialogTitle>
        <DialogDescription className="sr-only">{subtitulo}</DialogDescription>
        <ModalHeader icon={Archive} tint="#c2410c" title={titulo} subtitle={subtitulo} onClose={onClose}
          trailing={sm ? <span data-testid="detalhe-situacao" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: sm.bg, color: sm.color, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}><span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: sm.color }} />{sm.label}</span> : undefined} />

        <div style={{ padding: isMobile ? 16 : 24, overflowY: "auto", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 16, background: "#f8fafc" }}>
          {unidade && grupo.ativos.length > 1 && (
            <button type="button" data-testid="detalhe-voltar-ao-grupo" onClick={() => onAbrirUnidade(null)}
              style={{ alignSelf: "flex-start", minHeight: isMobile ? 44 : 32, background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 700, color: "#475569", cursor: "pointer" }}>
              ← Ver as {grupo.unidades} unidades de {grupo.nome}
            </button>
          )}

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "220px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
            <div style={{ ...CARTAO, padding: 0, overflow: "hidden", aspectRatio: isMobile ? "16 / 9" : "1 / 1", display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9" }}>
              {ehImagem(arte)
                ? <img data-testid="detalhe-arte" src={miniatura(arte!)} alt={`Arte de ${titulo}`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                : <div style={{ textAlign: "center", color: "#64748b", fontSize: 12 }}><Package size={28} aria-hidden="true" /><div>Sem arte</div></div>}
            </div>

            <section aria-label="Situação agora" style={CARTAO}>
              <h3 style={TITULO}>Situação agora</h3>
              <p data-testid="detalhe-situacao-frase" style={{ margin: "0 0 12px", fontSize: 14, color: "#0f172a", fontWeight: 600, lineHeight: 1.45 }}>
                {umaSo ? sm!.label : situacoes}
                {!umaSo && <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#475569" }}>{fraseDaCondicao(grupo)}</span>}
              </p>
              <div role="radiogroup" aria-label={alvos.length > 1 ? `Condição das ${unidades} unidades` : "Condição"} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {CONDICOES.map((c) => {
                  const meta = CONDITION_META[c];
                  const ativa = condicaoUnica === c;
                  return (
                    <button key={c} type="button" role="radio" aria-checked={ativa} disabled={!podeEditar || gravando} data-testid={`detalhe-condicao-${c}`}
                      onClick={() => { if (!ativa) mudar({ condition: c }, `Condição: ${meta.label}`); }}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: alvo, padding: "0 12px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: podeEditar ? "pointer" : "default", border: `1px solid ${ativa ? meta.color : "#e2e8f0"}`, background: ativa ? meta.bg : "#fff", color: ativa ? meta.color : "#475569" }}>
                      {ativa && <CheckCircle2 size={13} aria-hidden="true" />}{meta.label}
                    </button>
                  );
                })}
              </div>
              {!umaSo && podeEditar && <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b" }}>Vale para as {unidades} unidades. Para mudar uma só, abra a unidade na lista abaixo.</p>}

              {reservas.length > 0 && (
                <div data-testid="detalhe-reserva" style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "#eff6ff", border: "1px solid #bfdbfe", fontSize: 13, color: "#1e40af", lineHeight: 1.45 }}>
                  <BookmarkCheck size={13} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 5 }} />
                  {umaSo
                    ? <>Reservada para a peça <strong>{reservas[0].itemDisplayId ?? "—"}</strong> de <strong>{reservas[0].eventName}</strong>{reservas[0].saida ? ` · saída ${diaEMes(reservas[0].saida)}` : ""}.</>
                    : <><strong>{reservas.length}</strong> {reservas.length === 1 ? "unidade reservada" : "unidades reservadas"}: {Array.from(new Set(reservas.map((r) => r.eventName))).join(" · ")}.</>}
                  <span style={{ display: "block", fontSize: 12, color: "#475569" }}>A reserva é feita e liberada na peça do evento (Gráfica → buscar no estoque).</span>
                </div>
              )}
            </section>
          </div>

          <section aria-label="Especificações" style={CARTAO}>
            <h3 style={TITULO}>Especificações</h3>
            <dl style={{ margin: 0, display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))", columnGap: 24 }}>
              <Linha rotulo="Tipo">{linkedItem?.type ?? "—"}</Linha>
              <Linha rotulo="Material">{linkedItem?.material ?? "—"}</Linha>
              <Linha rotulo="Acabamento">{linkedItem?.finish ?? "—"}</Linha>
              <Linha rotulo="Medida">{linkedItem?.visualWidth && linkedItem?.visualHeight ? `${linkedItem.visualWidth} × ${linkedItem.visualHeight} m` : linkedItem?.measurement ?? "—"}</Linha>
              <Linha rotulo="Patrocinadores">{nomesDePatrocinador.length ? nomesDePatrocinador.join(" · ") : "Sem patrocinador"}</Linha>
              <Linha rotulo="Origem">{alvos[0].autoAdded ? "Produção da Gráfica" : "Cadastro manual"}</Linha>
              {/* As DUAS quantidades, cada uma dizendo de quem é — antes "1 un."
                  e "34 un." apareciam lado a lado sem explicação. */}
              <Linha rotulo={umaSo ? "Este registro" : "Neste material"}>{unidades} un.</Linha>
              {linkedItem?.quantity ? <Linha rotulo={`Peça de origem ${linkedItem.displayId ?? ""}`.trim()}>{linkedItem.quantity} un. pedidas</Linha> : null}
            </dl>
            {umaSo?.notes && <p style={{ margin: "12px 0 0", fontSize: 13, color: "#475569", lineHeight: 1.5 }}><strong style={{ color: "#0f172a" }}>Observações:</strong> {umaSo.notes}</p>}
          </section>

          <section aria-label="Onde já foi usado" style={CARTAO}>
            <h3 style={TITULO}>Onde já foi usado</h3>
            {(umaSo ? usos.length : eventos.length) === 0 ? (
              <p data-testid="detalhe-sem-uso" style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Ainda não saiu para nenhum evento.</p>
            ) : (
              <ul data-testid="detalhe-usos" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
                {(umaSo ? usos.map((u) => ({ chave: u.chave, nome: u.eventName, inicio: u.inicio, etiqueta: ROTULO_DO_USO[u.situacao], detalhe: u.itemDisplayId ? `peça ${u.itemDisplayId}` : null }))
                  : eventos.map((e) => ({ chave: e.eventId, nome: e.eventName, inicio: e.inicio, etiqueta: ROTULO_DO_USO[e.situacao], detalhe: `${e.unidades} ${e.unidades === 1 ? "unidade" : "unidades"}` }))
                ).map((u) => (
                  <li key={u.chave} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
                    <CalendarDays size={14} color="#64748b" aria-hidden="true" style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ color: "#64748b" }}>{u.etiqueta} </span><strong style={{ color: "#0f172a" }}>{u.nome}</strong>
                      {u.detalhe && <span style={{ color: "#475569" }}> · {u.detalhe}</span>}
                    </span>
                    <span style={{ color: "#64748b", fontSize: 12, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{dataLonga(u.inicio) ?? "sem data"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {umaSo ? (
            <section aria-label="Rastreabilidade" style={CARTAO}>
              <h3 style={TITULO}>Rastreabilidade</h3>
              {carregandoTrilha ? (
                <div aria-busy="true" className="animate-pulse" style={{ height: 48, borderRadius: 8, background: "#e2e8f0" }} />
              ) : (trilha ?? []).length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Sem registros de quem mexeu neste ativo.</p>
              ) : (
                <ol data-testid="detalhe-trilha" style={{ listStyle: "none", margin: 0, padding: "0 0 0 14px", borderLeft: "2px solid #e2e8f0", display: "flex", flexDirection: "column", gap: 12 }}>
                  {(trilha ?? []).slice(0, 12).map((l: any) => (
                    <li key={l.id} style={{ position: "relative", fontSize: 13, color: "#0f172a" }}>
                      <span aria-hidden="true" style={{ position: "absolute", left: -20, top: 5, width: 10, height: 10, borderRadius: "50%", background: "#fff", border: "2px solid #c2410c" }} />
                      <strong style={{ textTransform: "capitalize" }}>{l.action}</strong>
                      <span style={{ color: "#64748b" }}> · {l.userName ?? "Sistema"} · {dataLonga(l.createdAt)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ) : (
            <section aria-label="Unidades" style={CARTAO}>
              <h3 style={TITULO}>As {grupo.ativos.length} unidades</h3>
              <ul data-testid="detalhe-unidades" style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 280, overflowY: "auto" }}>
                {grupo.ativos.map((a) => {
                  const s = SITUACAO_META[a.trackingStatus] ?? SITUACAO_META.NO_GALPAO;
                  return (
                    <li key={a.id}>
                      <button type="button" data-testid={`detalhe-unidade-${a.id}`} onClick={() => onAbrirUnidade(a)}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, minHeight: 44, padding: "0 4px", background: "none", border: "none", borderBottom: "1px solid #f1f5f9", cursor: "pointer", textAlign: "left", fontSize: 13 }}>
                        <span style={{ fontFamily: "DM Mono, monospace", fontWeight: 600, color: "#9a3412", flex: 1, minWidth: 0 }}>{a.displayId}{(a.quantity ?? 1) > 1 ? ` ×${a.quantity}` : ""}</span>
                        <span style={{ color: s.color, fontWeight: 700 }}>{s.label}</span>
                        <span style={{ color: "#475569" }}>{conditionMeta(a.condition).label}</span>
                        {reservaPorAtivo.has(a.id) && <BookmarkCheck size={13} color="#1d4ed8" aria-label="Reservada" />}
                        <ChevronRight size={14} color="#64748b" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <ModalFooter>
          {podeEditar && parados && manutencaoBloqueada && (
            <p id="detalhe-manutencao-motivo" data-testid="detalhe-manutencao-motivo" style={{ margin: "0 0 8px", fontSize: 12, color: "#1e40af", textAlign: "right" }}>
              {reservas.length === 1 && umaSo ? "Esta peça está reservada" : `${reservas.length} ${reservas.length === 1 ? "unidade está reservada" : "unidades estão reservadas"}`} — libere a reserva na peça do evento antes de mandar para manutenção.
            </p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", paddingBottom: "calc(0px + env(safe-area-inset-bottom, 0px))" }}>
            <button type="button" data-testid="detalhe-fechar" onClick={onClose} style={botao(false)}>Fechar</button>
            {podeEditar && parados && (
              <button type="button" data-testid="detalhe-manutencao" disabled={gravando || manutencaoBloqueada}
                aria-describedby={manutencaoBloqueada ? "detalhe-manutencao-motivo" : undefined}
                onClick={() => mudar({ trackingStatus: todosEmManutencao ? "NO_GALPAO" : "EM_MANUTENCAO" }, todosEmManutencao ? "De volta ao galpão" : "Mandada para manutenção")}
                style={{ ...botao(false), ...(manutencaoBloqueada ? { cursor: "not-allowed", opacity: 0.6 } : {}) }}>
                {todosEmManutencao ? <><Warehouse size={15} aria-hidden="true" /> Voltar ao galpão</> : <><Wrench size={15} aria-hidden="true" /> Mandar para manutenção</>}
              </button>
            )}
            {podeEditar && umaSo && (
              <button type="button" data-testid="detalhe-editar" onClick={() => onEditar(umaSo)} style={botao(true)}><Pencil size={15} aria-hidden="true" /> Editar</button>
            )}
          </div>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
