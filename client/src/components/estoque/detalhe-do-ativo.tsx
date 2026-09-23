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
import { alvo, useIsMobile, usePonteiroGrosso } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { miniatura } from "@/lib/miniatura";
import { CONDITION_META, conditionMeta, type Condition } from "@/lib/inventory-meta";
import { emGrupos, GRAVACOES_POR_VEZ } from "@/components/triagem/quadro-da-triagem";
import { fraseDaCondicao, fraseDaSituacao, type GrupoDoAcervo } from "@/lib/agrupar-acervo";
import { ROTULO_DO_USO, diaEMes, eventosDeUso, type UsoDoAtivo } from "@shared/estoque";
import type { InventoryAsset, Sponsor } from "@shared/schema";
import { T, N, TOM, FS, R, FW, FONT } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { Esqueleto } from "@/components/ui/estados";

export const SITUACAO_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  NO_GALPAO: { label: "No galpão", color: TOM.sucesso.text, bg: TOM.sucesso.bg, border: TOM.sucesso.border },
  EM_USO: { label: "Em uso", color: TOM.laranja.text, bg: TOM.laranja.bg, border: TOM.laranja.border },
  AGUARDANDO_TRIAGEM: { label: "Aguardando triagem", color: TOM.alerta.text, bg: TOM.alerta.bg, border: TOM.alerta.border },
  // Divide o TOM.alerta com a Triagem (eram âmbar 800 e 700, quase iguais):
  // o detalhe só abre material do ACERVO, onde peça aguardando triagem não
  // entra — as duas situações nunca aparecem lado a lado aqui.
  EM_MANUTENCAO: { label: "Em manutenção", color: TOM.alerta.text, bg: TOM.alerta.bg, border: TOM.alerta.border },
  DESCARTADO: { label: "Descartado", color: T.apoio, bg: N.n2, border: T.border },
};

type Reserva = { reservaId: string; assetId: string; itemDisplayId: string | null; eventName: string; saida: string | null };

const CONDICOES: Condition[] = ["PERFEITO", "AVARIA_LEVE", "SUCATA"];
const ehImagem = (u?: string | null) => !!u && (/\.(png|jpe?g|gif|webp)/i.test(u) || u.startsWith("/objects/"));
const dataLonga = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).replace(".", "") : null);

const TITULO: React.CSSProperties = { margin: "0 0 10px", fontSize: FS.body, fontWeight: FW.forte, color: T.text, fontFamily: FONT.display };
const CARTAO: React.CSSProperties = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: 16 };

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: `1px solid ${N.n3}`, fontSize: FS.body }}>
      <dt style={{ color: T.second, flexShrink: 0 }}>{rotulo}</dt>
      <dd style={{ margin: 0, color: T.text, fontWeight: FW.medio, textAlign: "right", overflowWrap: "anywhere" }}>{children}</dd>
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
  /** Dedo (celular OU tablet do galpão): manda no TAMANHO do alvo, só nele. */
  const dedo = usePonteiroGrosso() || isMobile;
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
    else toast({ title: feito, description: alvos.length > 1 ? `${alvos.length} registros · ${unidades} un.` : alvos[0].displayId, variant: "success" });
  };

  const condicaoUnica = umaSo ? umaSo.condition : Object.keys(grupo.porCondicao).length === 1 ? Object.keys(grupo.porCondicao)[0] : null;
  // Mandar para manutenção / voltar ao galpão só faz sentido para o que está
  // parado: EM USO e AGUARDANDO TRIAGEM são do ciclo do evento (o servidor recusa).
  const parados = alvos.every((a) => a.trackingStatus === "NO_GALPAO" || a.trackingStatus === "EM_MANUTENCAO");
  const todosEmManutencao = alvos.every((a) => a.trackingStatus === "EM_MANUTENCAO");
  // Peça reservada não vai para manutenção (o servidor recusa com 409): o
  // botão fica desabilitado e o motivo aparece embaixo, antes do clique.
  const manutencaoBloqueada = !todosEmManutencao && reservas.length > 0;
  // Alvo pelo PONTEIRO: o tablet do galpão é dedo em 1024px de janela.
  const alvoBotao = alvo(36, dedo);
  // Rodapé: os botões dividem a largura no celular.
  const noRodape: React.CSSProperties = { flex: isMobile ? 1 : undefined };

  const titulo = umaSo ? umaSo.name : grupo.nome;
  const subtitulo = umaSo
    ? `${umaSo.displayId} · ${(umaSo.quantity ?? 1) === 1 ? "1 unidade" : `${umaSo.quantity} unidades`}${grupo.ativos.length > 1 ? ` · uma das ${grupo.unidades} deste material` : ""}`
    : `${grupo.unidades} unidades em ${grupo.ativos.length} registros`;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent ref={superficieRef} data-testid="detalhe-do-ativo" className={HIDE_NATIVE_CLOSE} style={modalSurface(760)}>
        <DialogTitle className="sr-only">{titulo}</DialogTitle>
        <DialogDescription className="sr-only">{subtitulo}</DialogDescription>
        <ModalHeader icon={Archive} tint={T.accentText} title={titulo} subtitle={subtitulo} onClose={onClose}
          trailing={sm ? <Selo data-testid="detalhe-situacao" ponto cores={{ bg: sm.bg, text: sm.color, border: sm.border }} style={{ padding: "4px 10px", fontSize: FS.meta }}>{sm.label}</Selo> : undefined} />

        <div style={{ padding: isMobile ? 16 : 24, overflowY: "auto", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 16, background: T.bg }}>
          {unidade && grupo.ativos.length > 1 && (
            <Botao variante="fantasma" data-testid="detalhe-voltar-ao-grupo" onClick={() => onAbrirUnidade(null)}
              style={{ alignSelf: "flex-start", minHeight: alvo(32, dedo), padding: "0 8px", marginLeft: -8, fontSize: FS.body }}>
              ← Ver as {grupo.unidades} unidades de {grupo.nome}
            </Botao>
          )}

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "220px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
            <div style={{ ...CARTAO, padding: 0, overflow: "hidden", aspectRatio: isMobile ? "16 / 9" : "1 / 1", display: "flex", alignItems: "center", justifyContent: "center", background: N.n2 }}>
              {ehImagem(arte)
                ? <img data-testid="detalhe-arte" src={miniatura(arte!)} alt={`Arte de ${titulo}`} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                : <div style={{ textAlign: "center", color: T.second, fontSize: FS.meta }}><Package size={28} aria-hidden="true" /><div>Sem arte</div></div>}
            </div>

            <section aria-label="Situação agora" style={CARTAO}>
              <h3 style={TITULO}>Situação agora</h3>
              <p data-testid="detalhe-situacao-frase" style={{ margin: "0 0 12px", fontSize: FS.read, color: T.text, fontWeight: FW.medio, lineHeight: 1.45 }}>
                {umaSo ? sm!.label : situacoes}
                {!umaSo && <span style={{ display: "block", fontSize: FS.body, fontWeight: FW.corpo, color: T.apoio }}>{fraseDaCondicao(grupo)}</span>}
              </p>
              <div role="radiogroup" aria-label={alvos.length > 1 ? `Condição das ${unidades} unidades` : "Condição"} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {CONDICOES.map((c) => {
                  const meta = CONDITION_META[c];
                  const ativa = condicaoUnica === c;
                  return (
                    <button key={c} type="button" role="radio" aria-checked={ativa} disabled={!podeEditar || gravando} data-testid={`detalhe-condicao-${c}`}
                      className="ds-botao"
                      onClick={() => { if (!ativa) mudar({ condition: c }, `Condição: ${meta.label}`); }}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: alvoBotao, padding: "0 12px", borderRadius: R.md, fontSize: FS.body, fontWeight: FW.forte, fontFamily: FONT.corpo, cursor: podeEditar ? "pointer" : "default", border: `1px solid ${ativa ? meta.color : T.border}`, background: ativa ? meta.bg : T.surface, color: ativa ? meta.color : T.apoio }}>
                      {ativa && <CheckCircle2 size={13} aria-hidden="true" />}{meta.label}
                    </button>
                  );
                })}
              </div>
              {!umaSo && podeEditar && <p style={{ margin: "6px 0 0", fontSize: FS.meta, color: T.second }}>Vale para as {unidades} unidades. Para mudar uma só, abra a unidade na lista abaixo.</p>}

              {reservas.length > 0 && (
                <div data-testid="detalhe-reserva" style={{ marginTop: 12, padding: "10px 12px", borderRadius: R.md, background: TOM.info.bg, border: `1px solid ${TOM.info.border}`, fontSize: FS.body, color: TOM.info.text, lineHeight: 1.45 }}>
                  <BookmarkCheck size={13} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 5 }} />
                  {umaSo
                    ? <>Reservada para a peça <strong>{reservas[0].itemDisplayId ?? "—"}</strong> de <strong>{reservas[0].eventName}</strong>{reservas[0].saida ? ` · saída ${diaEMes(reservas[0].saida)}` : ""}.</>
                    : <><strong>{reservas.length}</strong> {reservas.length === 1 ? "unidade reservada" : "unidades reservadas"}: {Array.from(new Set(reservas.map((r) => r.eventName))).join(" · ")}.</>}
                  <span style={{ display: "block", fontSize: FS.meta, color: T.apoio }}>A reserva é feita e liberada na peça do evento (Gráfica → buscar no estoque).</span>
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
            {umaSo?.notes && <p style={{ margin: "12px 0 0", fontSize: FS.body, color: T.apoio, lineHeight: 1.5 }}><strong style={{ color: T.text }}>Observações:</strong> {umaSo.notes}</p>}
          </section>

          <section aria-label="Onde já foi usado" style={CARTAO}>
            <h3 style={TITULO}>Onde já foi usado</h3>
            {(umaSo ? usos.length : eventos.length) === 0 ? (
              <p data-testid="detalhe-sem-uso" style={{ margin: 0, fontSize: FS.body, color: T.second }}>Ainda não saiu para nenhum evento.</p>
            ) : (
              <ul data-testid="detalhe-usos" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
                {(umaSo ? usos.map((u) => ({ chave: u.chave, nome: u.eventName, inicio: u.inicio, etiqueta: ROTULO_DO_USO[u.situacao], detalhe: u.itemDisplayId ? `peça ${u.itemDisplayId}` : null }))
                  : eventos.map((e) => ({ chave: e.eventId, nome: e.eventName, inicio: e.inicio, etiqueta: ROTULO_DO_USO[e.situacao], detalhe: `${e.unidades} ${e.unidades === 1 ? "unidade" : "unidades"}` }))
                ).map((u) => (
                  <li key={u.chave} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${N.n3}`, fontSize: FS.body }}>
                    <CalendarDays size={14} color={T.second} aria-hidden="true" style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ color: T.second }}>{u.etiqueta} </span><strong style={{ color: T.text }}>{u.nome}</strong>
                      {u.detalhe && <span style={{ color: T.apoio }}> · {u.detalhe}</span>}
                    </span>
                    <span style={{ color: T.second, fontSize: FS.meta, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{dataLonga(u.inicio) ?? "sem data"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {umaSo ? (
            <section aria-label="Rastreabilidade" style={CARTAO}>
              <h3 style={TITULO}>Rastreabilidade</h3>
              {carregandoTrilha ? (
                <Esqueleto variante="lista" linhas={2} rotulo="Carregando a trilha" />
              ) : (trilha ?? []).length === 0 ? (
                <p style={{ margin: 0, fontSize: FS.body, color: T.second }}>Sem registros de quem mexeu neste ativo.</p>
              ) : (
                <ol data-testid="detalhe-trilha" style={{ listStyle: "none", margin: 0, padding: "0 0 0 14px", borderLeft: `2px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 12 }}>
                  {(trilha ?? []).slice(0, 12).map((l: any) => (
                    <li key={l.id} style={{ position: "relative", fontSize: FS.body, color: T.text }}>
                      <span aria-hidden="true" style={{ position: "absolute", left: -20, top: 5, width: 10, height: 10, borderRadius: "50%", background: T.surface, border: `2px solid ${T.accent}` }} />
                      <strong style={{ textTransform: "capitalize" }}>{l.action}</strong>
                      <span style={{ color: T.second }}> · {l.userName ?? "Sistema"} · {dataLonga(l.createdAt)}</span>
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
                      {/* A linha inteira é o alvo (lista densa): nativo, com o
                          hover da variante fantasma. */}
                      <button type="button" data-testid={`detalhe-unidade-${a.id}`} onClick={() => onAbrirUnidade(a)}
                        className="ds-botao ds-botao-fantasma"
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, minHeight: 44, padding: "0 4px", background: "none", border: "none", borderBottom: `1px solid ${N.n3}`, cursor: "pointer", textAlign: "left", fontSize: FS.body, fontFamily: FONT.corpo }}>
                        <span style={{ fontFamily: FONT.mono, fontWeight: FW.medio, color: T.accentText, flex: 1, minWidth: 0 }}>{a.displayId}{(a.quantity ?? 1) > 1 ? ` ×${a.quantity}` : ""}</span>
                        <span style={{ color: s.color, fontWeight: FW.forte }}>{s.label}</span>
                        <span style={{ color: T.apoio }}>{conditionMeta(a.condition).label}</span>
                        {reservaPorAtivo.has(a.id) && <BookmarkCheck size={13} color={TOM.info.text} aria-label="Reservada" />}
                        <ChevronRight size={14} color={T.second} aria-hidden="true" />
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
            <p id="detalhe-manutencao-motivo" data-testid="detalhe-manutencao-motivo" style={{ margin: "0 0 8px", fontSize: FS.meta, color: TOM.info.text, textAlign: "right" }}>
              {reservas.length === 1 && umaSo ? "Esta peça está reservada" : `${reservas.length} ${reservas.length === 1 ? "unidade está reservada" : "unidades estão reservadas"}`} — libere a reserva na peça do evento antes de mandar para manutenção.
            </p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", paddingBottom: "calc(0px + env(safe-area-inset-bottom, 0px))" }}>
            <Botao variante="secundario" tamanho="toque" data-testid="detalhe-fechar" onClick={onClose} style={noRodape}>Fechar</Botao>
            {/* O motivo do bloqueio da manutenção é o parágrafo acima (com o
                testid que os testes leem), ligado por aria-describedby. */}
            {podeEditar && parados && (
              <Botao variante="secundario" tamanho="toque" data-testid="detalhe-manutencao"
                icone={todosEmManutencao ? Warehouse : Wrench}
                disabled={manutencaoBloqueada} carregando={gravando}
                aria-describedby={manutencaoBloqueada ? "detalhe-manutencao-motivo" : undefined}
                onClick={() => mudar({ trackingStatus: todosEmManutencao ? "NO_GALPAO" : "EM_MANUTENCAO" }, todosEmManutencao ? "De volta ao galpão" : "Mandada para manutenção")}
                style={noRodape}>
                {todosEmManutencao ? "Voltar ao galpão" : "Mandar para manutenção"}
              </Botao>
            )}
            {podeEditar && umaSo && (
              <Botao variante="primario" tamanho="toque" icone={Pencil} data-testid="detalhe-editar" onClick={() => onEditar(umaSo)} style={noRodape}>Editar</Botao>
            )}
          </div>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
