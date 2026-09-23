import { useState, useMemo, useEffect, useDeferredValue, Fragment } from "react";
import { useQuery, useQueries, useMutation } from "@tanstack/react-query";
import { FilterSelect } from "@/components/filter-select";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AtivoJson as InventoryAsset, AtivoDoAcervo, EventoDaLista as Event, OrigemDoAtivo, PatrocinadorJson as Sponsor } from "@shared/api";
import {
  Archive, Search, Pencil, Trash2, CheckCircle2,
  XCircle, Tag, X, Package, Warehouse, Truck, ScanSearch, Calendar, CalendarDays,
  Grid3X3, Eye, Check, Layers, ClipboardCheck, Wrench, BookmarkCheck, ChevronDown, Plus,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { alvo, useDensidadeDoConteudo, useIsMobile, usePonteiroGrosso } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/auth-context";
import { diaEMes, eventoJaAcabou, eventosDeUso, usosDoAtivo, ROTULO_DO_USO, type AlocacaoDoAcervo, type UsoDoAtivo } from "@shared/estoque";
import { agruparAcervo, fraseDaCondicao, fraseDaSituacao, type GrupoDoAcervo } from "@/lib/agrupar-acervo";
import { DetalheDoAtivo } from "@/components/estoque/detalhe-do-ativo";
import { miniatura } from "@/lib/miniatura";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { HIDE_NATIVE_CLOSE, FreezeWhileClosing, ModalHeader, modalSurface } from "@/components/modal-shell";
import { CONDITIONS, CONDITION_META, conditionMeta, type Condition } from "@/lib/inventory-meta";
import { T, N, TOM, FS, R, FW, FONT, SHADOW } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { CartaoKpi } from "@/components/ui/cartao-kpi";
import { Selo } from "@/components/ui/selo";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EstadoErro, EstadoVazio, Esqueleto } from "@/components/ui/estados";

// ─── Status meta ─────────────────────────────────────────────────────────────
/** Referência estável para "ainda sem dados": um `= []` no useQuery cria um
 *  array novo a cada render e todo useMemo que depende dele recalcula sempre. */
const VAZIO: never[] = [];

// Triagem e Manutenção dividem o TOM.alerta (eram âmbar 700 e 800, quase
// iguais). Não colidem: a lista do acervo nunca mostra AGUARDANDO_TRIAGEM —
// essas peças moram na tela da Triagem; aqui o rótulo só aparece no campo
// travado do formulário, sem cor.
const STATUS_META: Record<string, { label: string; color: string }> = {
  NO_GALPAO:          { label: "No Galpão",   color: TOM.sucesso.text },
  EM_USO:             { label: "Em Uso",       color: TOM.laranja.text },
  AGUARDANDO_TRIAGEM: { label: "Ag. Triagem",  color: TOM.alerta.text },
  EM_MANUTENCAO:      { label: "Manutenção",   color: TOM.alerta.text },
  DESCARTADO:         { label: "Descartado",   color: T.second },
};
const ALL_STATUSES = ["NO_GALPAO", "EM_USO", "AGUARDANDO_TRIAGEM", "EM_MANUTENCAO", "DESCARTADO"] as const;
type TrackingStatus = typeof ALL_STATUSES[number];
// Status que o usuário pode definir manualmente. EM_USO e AGUARDANDO_TRIAGEM
// são definidos pelo ciclo do evento (despacho/retorno) — nunca à mão.
// EM_MANUTENCAO (14/09) é manual: terminado o reparo, a Gráfica devolve a
// peça ao galpão por aqui.
const MANUAL_STATUSES: TrackingStatus[] = ["NO_GALPAO", "EM_MANUTENCAO", "DESCARTADO"];

// O QUE CADA RÓTULO QUER DIZER, em uma frase. O acervo é do admin, mas quem
// cadastra ou corrige uma peça decide aqui se ela volta a ser oferecida para
// reaproveitamento — e os rótulos sozinhos não diziam isso. Texto apenas: as
// regras (quem define EM_USO/AGUARDANDO_TRIAGEM, o que é manual) seguem acima.
const SIGNIFICADO_DO_STATUS: Record<TrackingStatus, string> = {
  NO_GALPAO: "Guardada no galpão — aparece na busca do estoque para reaproveitar.",
  EM_USO: "Saiu num evento; volta para a triagem depois dele.",
  AGUARDANDO_TRIAGEM: "Voltou de um evento e espera a triagem decidir o destino.",
  EM_MANUTENCAO: "Fora do estoque disponível até o reparo terminar.",
  DESCARTADO: "Saiu do acervo; fica oculta da tabela, salvo filtrando por Descartado.",
};
const SIGNIFICADO_DA_CONDICAO: Record<Condition, string> = {
  PERFEITO: "Sem defeito — pronta para usar de novo.",
  AVARIA_LEVE: "Defeito pequeno — confira antes de reaproveitar.",
  SUCATA: "Não serve mais para evento.",
};

/** Ativo do acervo como GET /api/inventory devolve: com o evento da peça de
 *  origem junto (revisão 22/09). */
type AtivoComOrigem = AtivoDoAcervo;

/** Teto de peças de origem (ou registros avulsos) por leitura de usos — o
 *  mesmo LIMITE_DO_RECORTE_DE_USOS do servidor. */
const LIMITE_DE_USOS = 500;

/** Reserva vigente (GET /api/estoque/reservas-ativas). */
type ReservaAtiva = { reservaId: string; assetId: string; itemDisplayId: string | null; eventName: string; saida: string | null };

/** "reservada para a peça #0062 (Evento X)" — o mesmo texto que o servidor usa no 409. */
const paraQuemEstaReservada = (r: ReservaAtiva) =>
  r.itemDisplayId ? `a peça ${r.itemDisplayId} (${r.eventName})` : `o evento ${r.eventName}`;

/** Aviso de peça reservada — antes de excluir ou tirar do galpão. */
function AvisoDeReserva({ reserva, acao }: { reserva: ReservaAtiva; acao: string }) {
  return (
    <p role="status" data-testid="aviso-ativo-reservado" style={{ margin: "0 0 16px", padding: "10px 12px", borderRadius: R.md, background: TOM.info.bg, border: `1px solid ${TOM.info.border}`, color: TOM.info.text, fontSize: FS.body, lineHeight: 1.45, fontFamily: FONT.corpo }}>
      Esta peça está reservada para <strong>{paraQuemEstaReservada(reserva)}</strong>. Libere a reserva na peça do evento (Gráfica → buscar no estoque) antes de {acao}.
    </p>
  );
}

// ─── Delete Modal (ui/alert-dialog — Escape, foco e backdrop pelo Radix) ─────
function DeleteModal({ asset, reserva, onClose, onConfirm, isPending }: {
  asset: InventoryAsset; reserva?: ReservaAtiva; onClose: () => void; onConfirm: () => void; isPending: boolean;
}) {
  return (
    <AlertDialog open onOpenChange={open => { if (!open && !isPending) onClose(); }}>
      <AlertDialogContent
        className="p-0 gap-0 border-0"
        style={{
          display: "block", padding: 0, overflow: "hidden", borderRadius: R.xl,
          width: "min(420px, calc(100vw - 32px))", maxWidth: "min(420px, calc(100vw - 32px))",
          boxShadow: SHADOW.lg,
        }}
      >
        {/* TOM.perigo.text (#b91c1c): branco sobre o #ef4444 dava 3,8:1. */}
        <div style={{ background: TOM.perigo.text, padding: "16px 20px" }}>
          <AlertDialogTitle asChild>
            <p style={{ color: T.surface, fontWeight: FW.forte, fontSize: FS.strong, fontFamily: FONT.display, margin: 0, letterSpacing: "-0.01em" }}>
              Atenção: ação irreversível
            </p>
          </AlertDialogTitle>
        </div>
        <div style={{ padding: 24 }}>
          <AlertDialogDescription asChild>
            <p style={{ fontSize: FS.read, color: T.text, margin: "0 0 8px", fontFamily: FONT.corpo }}>
              Tem certeza que deseja excluir este ativo permanentemente?
            </p>
          </AlertDialogDescription>
          <p style={{ fontSize: FS.meta, color: T.second, fontFamily: FONT.mono, margin: "0 0 24px" }}>
            {asset.displayId} — {asset.name}
          </p>
          {reserva && <AvisoDeReserva reserva={reserva} acao="excluir" />}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "flex-start" }}>
            <Botao variante="secundario" tamanho="toque" onClick={onClose} disabled={isPending} data-testid="button-cancel-delete">Manter</Botao>
            {/* O motivo do bloqueio já está no aviso azul logo acima; aqui ele
                vira a frase curta sob o botão, e não mais um `title`. */}
            <Botao variante="perigo" tamanho="toque" onClick={onConfirm} disabled={!!reserva} carregando={isPending}
              data-testid="button-confirm-delete" alinharMotivo="end"
              motivo={reserva ? "Peça reservada — libere a reserva antes de excluir" : undefined}>
              {isPending ? "Excluindo..." : "Sim, Excluir"}
            </Botao>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Asset Modal ──────────────────────────────────────────────────────────────
function AssetModal({ asset, reserva, onClose, onSaved }: {
  asset: InventoryAsset | null; reserva?: ReservaAtiva; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const isEdit = !!asset;
  const [form, setForm] = useState(asset ? {
    // Sem `location`: o formulário não pede mais o local (dono, 21/09) e, fora
    // do corpo do PATCH, o valor que já existe no banco fica intocado.
    name: asset.name, quantity: asset.quantity ?? 1,
    condition: (asset.condition as Condition) ?? "PERFEITO",
    sponsorIds: asset.sponsorIds ?? [] as string[],
    trackingStatus: (asset.trackingStatus as TrackingStatus) ?? "NO_GALPAO",
    notes: asset.notes ?? "",
  } : { name: "", quantity: 1, condition: "PERFEITO" as Condition, sponsorIds: [] as string[], trackingStatus: "NO_GALPAO" as TrackingStatus, notes: "" });

  const { data: allSponsors = VAZIO as Sponsor[] } = useQuery<Sponsor[]>({ queryKey: ["/api/sponsors"] });

  const toggleSponsor = (id: string) =>
    setForm(f => ({
      ...f,
      sponsorIds: f.sponsorIds.includes(id)
        ? f.sponsorIds.filter(s => s !== id)
        : [...f.sponsorIds, id],
    }));

  // Situação do CICLO (Em uso / Aguardando triagem) não é editável: fica fora
  // do corpo. Antes o PATCH levava `trackingStatus: "EM_USO"` de volta e o
  // servidor recusava (400) — editar o nome de uma peça em uso não salvava.
  const corpoDoFormulario = (data: typeof form) => {
    const { trackingStatus, ...resto } = data;
    return MANUAL_STATUSES.includes(trackingStatus) ? data : resto;
  };
  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      isEdit ? apiRequest("PATCH", `/api/inventory/${asset!.id}`, corpoDoFormulario(data)) : apiRequest("POST", "/api/inventory", data),
    // Toast com o NOME do ativo e erro com o motivo do servidor — "Erro ao
    // salvar." sem porquê não dizia se era campo, permissão ou conexão.
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); toast({ title: isEdit ? "Ativo atualizado" : "Ativo cadastrado", description: form.name.trim(), variant: "success" }); onSaved(); },
    onError: (e: Error) => {
      // 409 de peça reservada: recarrega as reservas para o aviso aparecer.
      queryClient.invalidateQueries({ queryKey: ["/api/estoque/reservas-ativas"] });
      toast({ title: "Não foi possível salvar o ativo", description: e.message, variant: "destructive" });
    },
  });

  // Borda visível e SEM `outline: none`: o campo era um retângulo #f8fafc
  // sobre branco (1,05:1 — ninguém via onde clicar) e o outline inline anulava
  // o anel de foco global do index.css, então o teclado não mostrava onde
  // estava. 16px no celular: abaixo disso o Safari dá zoom ao focar.
  const INP: React.CSSProperties = {
    width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: R.md, border: `1px solid ${T.bdark}`,
    fontSize: isMobile ? FS.lead : FS.body, fontFamily: FONT.corpo, background: T.surface,
    color: T.text, boxSizing: "border-box",
  };
  const LBL: React.CSSProperties = {
    fontSize: FS.meta, fontWeight: FW.medio, color: T.apoio, fontFamily: FONT.display,
    display: "block", marginBottom: 6,
  };
  // Legenda sob o campo (o que a escolha quer dizer).
  const AJUDA: React.CSSProperties = { margin: "5px 0 0", fontSize: FS.small, color: T.second, fontFamily: FONT.corpo, lineHeight: 1.4 };

  // Status automático (EM_USO / AGUARDANDO_TRIAGEM) não pode ser trocado à
  // mão — quem o define é o ciclo do evento. Só NO_GALPAO/DESCARTADO são
  // escolhas manuais válidas.
  const lockedStatus = isEdit && !MANUAL_STATUSES.includes(form.trackingStatus);
  // Manutenção/descarte de peça reservada: o servidor recusa (409); a tela
  // avisa antes e trava o Salvar com o motivo à vista.
  const tiraDoGalpaoReservada = isEdit && !!reserva && form.trackingStatus !== "NO_GALPAO" && form.trackingStatus !== asset?.trackingStatus;

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent
        className={`p-0 gap-0 border-0 ${HIDE_NATIVE_CLOSE}`}
        // Casca padrão: teto de altura com corpo rolando e rodapé fixo. Antes
        // o modal inteiro rolava (display block + overflow auto) e o botão
        // Salvar sumia embaixo junto com o formulário.
        style={modalSurface(500)}
      >
        <DialogTitle className="sr-only">{isEdit ? "Editar ativo" : "Cadastrar novo ativo"}</DialogTitle>
        <DialogDescription className="sr-only">
          Formulário de cadastro e edição de ativo do acervo.
        </DialogDescription>
        {/* Fechar vai no `trailing` (e não no onClose do ModalHeader) só para
            manter o data-testid que os testes de ponta a ponta usam. O
            subtítulo "NORTE ASSETS" em caixa alta saiu: não dizia nada. */}
        <ModalHeader
          icon={Archive}
          tint={T.accentText}
          title={isEdit ? "Editar ativo" : "Cadastrar novo ativo"}
          subtitle={isEdit ? `${asset!.displayId} · acervo do galpão` : "Entra no acervo do galpão"}
          trailing={
            // Botão redondo sobre o cabeçalho ESCURO: nenhuma variante do
            // Botao é clara-sobre-escuro, então fica nativo; o realce vem da
            // .ds-botao e o alvo de 44px no toque, da .modal-fechar.
            <button type="button" onClick={onClose} data-testid="button-close-modal" aria-label="Fechar" title="Fechar (Esc)"
              className="modal-fechar ds-botao"
              style={{ width: isMobile ? 44 : 40, height: isMobile ? 44 : 40, borderRadius: R.pill, flexShrink: 0, border: "1px solid rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.72)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X size={16} aria-hidden="true" />
            </button>
          }
        />
        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: isMobile ? 16 : 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label htmlFor="asset-name" style={LBL}>Nome / Descrição *</label>
            <input id="asset-name" data-testid="input-asset-name" style={INP} value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Banner 3×1m — Patrocinador A" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div>
              <label htmlFor="asset-quantity" style={LBL}>Quantidade</label>
              <input id="asset-quantity" data-testid="input-asset-quantity" type="number" min={1} style={INP}
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: Math.max(1, parseInt(e.target.value) || 1) }))} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div>
              <label htmlFor="asset-condition" style={LBL}>Condição</label>
              {/* kind="field" — campo de formulário, não filtro (vocabulário em
                  components/filter-select.tsx). Era `<select>` NATIVO num modal
                  onde os seis filtros da tela atrás já eram FilterSelect: o
                  mesmo gesto abria dois menus diferentes conforme o lado do
                  modal. `hideSearch` porque a lista é curta e fixa. */}
              <FilterSelect
                kind="field" hideSearch fullWidth hideWhenEmpty={false}
                label="Condição"
                value={form.condition}
                onChange={v => setForm(f => ({ ...f, condition: v as Condition }))}
                options={CONDITIONS.map(c => ({ value: c, label: CONDITION_META[c].label }))}
                testId="select-asset-condition"
                triggerProps={{ id: "asset-condition" }}
                triggerStyle={{ ...INP, height: "auto" }}
              />
              {/* O que a condição escolhida QUER DIZER — sem manual, "Avaria
                  leve" não dizia se a peça ainda serve. */}
              <p style={AJUDA}>
                {SIGNIFICADO_DA_CONDICAO[form.condition]}
              </p>
            </div>
            <div>
              <label htmlFor="asset-status" style={LBL}>Status</label>
              {lockedStatus ? (
                <div>
                  <input id="asset-status" data-testid="select-asset-status" readOnly disabled
                    value={STATUS_META[form.trackingStatus]?.label ?? form.trackingStatus}
                    style={{ ...INP, color: T.second, cursor: "not-allowed" }} />
                  <p style={AJUDA}>
                    Status definido pelo ciclo do evento.
                  </p>
                </div>
              ) : (
                <FilterSelect
                  kind="field" hideSearch fullWidth hideWhenEmpty={false}
                  label="Status"
                  value={form.trackingStatus}
                  onChange={v => setForm(f => ({ ...f, trackingStatus: v as TrackingStatus }))}
                  options={MANUAL_STATUSES.map(s => ({ value: s, label: STATUS_META[s].label }))}
                  testId="select-asset-status"
                  triggerProps={{ id: "asset-status" }}
                  triggerStyle={{ ...INP, height: "auto" }}
                />
              )}
              {!lockedStatus && (
                <p style={AJUDA}>
                  {SIGNIFICADO_DO_STATUS[form.trackingStatus]}
                </p>
              )}
              {tiraDoGalpaoReservada && reserva && (
                <div style={{ marginTop: 8 }}>
                  <AvisoDeReserva reserva={reserva} acao={form.trackingStatus === "DESCARTADO" ? "descartar" : "mandar para manutenção"} />
                </div>
              )}
            </div>
          </div>
          <div>
            <label id="asset-sponsors-label" style={LBL}>Patrocinadores</label>
            {allSponsors.length === 0 ? (
              <p style={{ margin: 0, fontSize: FS.meta, color: T.second, fontFamily: FONT.corpo, fontStyle: "italic" }}>
                Nenhum patrocinador cadastrado no sistema.
              </p>
            ) : (
              <div role="group" aria-labelledby="asset-sponsors-label" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {allSponsors.map(sp => {
                  const selected = form.sponsorIds.includes(sp.id);
                  return (
                    <button key={sp.id} type="button"
                      data-testid={`toggle-sponsor-${sp.id}`}
                      onClick={() => toggleSponsor(sp.id)}
                      // aria-pressed: o estado só existia na cor do botão.
                      aria-pressed={selected}
                      // Chip de alternar com desenho próprio (preto = marcado):
                      // fica <button> nativo, com o realce da .ds-botao.
                      className="ds-botao"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        minHeight: isMobile ? 44 : 32, padding: "0 12px", borderRadius: R.md, cursor: "pointer",
                        fontSize: FS.meta, fontWeight: FW.medio, fontFamily: FONT.display,
                        background: selected ? T.dark : N.n2,
                        color: selected ? T.surface : T.apoio,
                        border: `1px solid ${selected ? T.dark : T.border}`,
                      }}>
                      {selected && <CheckCircle2 size={12} aria-hidden="true" />}
                      {sp.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <label htmlFor="asset-notes" style={LBL}>Observações</label>
            <textarea id="asset-notes" data-testid="input-asset-notes" style={{ ...INP, minHeight: 72, resize: "vertical" as const }}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Informações adicionais..." />
          </div>
        </div>
        <div style={{ flexShrink: 0, padding: isMobile ? "12px 16px" : "16px 24px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "flex-end", alignItems: "flex-start", gap: 8, background: T.surface }}>
          <Botao variante="secundario" tamanho="toque" onClick={onClose}>Cancelar</Botao>
          {/* "+ SALVAR ATIVO" também na edição, onde o "+" prometia criar
              outro. O rótulo segue o modo do formulário, e o porquê do
              bloqueio aparece embaixo do botão (não mais só na cor). */}
          <Botao variante="primario" tamanho="toque" data-testid="button-save-asset"
            disabled={!form.name.trim() || tiraDoGalpaoReservada} carregando={mutation.isPending}
            alinharMotivo="end"
            motivo={!form.name.trim() ? "Preencha o nome do ativo" : tiraDoGalpaoReservada ? "Peça reservada — veja o aviso acima" : undefined}
            onClick={() => mutation.mutate(form)}>
            {mutation.isPending ? "Salvando..." : isEdit ? "Salvar alterações" : "Cadastrar ativo"}
          </Botao>
        </div>
      </DialogContent>
    </Dialog>
  );
}



// ─── Main Page ────────────────────────────────────────────────────────────────
/** Ativos montados por vez. O acervo passa de 5 mil peças e cada linha monta
 *  um Popover, três botões e uma miniatura: montar tudo de uma vez travava a
 *  tela a cada tecla da busca. O resto entra por "Mostrar mais". */
export const LOTE_DO_ESTOQUE = 60;

export default function Estoque() {
  // Régua única (use-mobile.tsx): a tabela de 6 colunas tem `minWidth: 900` e a
  // coluna de Ações é a última — num tablet com a barra lateral aberta ela
  // ficava FORA da área visível e a rolagem lateral não era óbvia. Abaixo de
  // 820px de área útil entra a mesma lista de cartões do celular, que já
  // existe e mostra ação, condição e situação sem rolar nada.
  const { ref: listaRef, cards: emCards, compacto, isMobile } = useDensidadeDoConteudo<HTMLDivElement>();
  const ponteiroGrosso = usePonteiroGrosso();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  // FILTROS NA URL (regra da casa): F5 não perde o recorte e dá para mandar o
  // link de "descartados da franquia X". Lidos uma vez na montagem; escritos
  // com replaceState (não polui o histórico) e o mesmo debounce de 200 ms das
  // outras telas, para digitar na busca não gravar uma entrada por tecla.
  // Só as chaves daqui são tocadas — qualquer outro parâmetro sobrevive.
  const urlInicial = useMemo(() => new URLSearchParams(window.location.search), []);
  const listaDaUrl = (k: string) => (urlInicial.get(k) ?? "").split(",").filter(Boolean);
  const [search, setSearch] = useState(() => urlInicial.get("q") ?? "");
  const [filterStatus, setFilterStatus] = useState<string[]>(() => listaDaUrl("status"));
  const [filterCondition, setFilterCondition] = useState<string[]>(() => listaDaUrl("condicao"));
  const [filterAutoAdded, setFilterAutoAdded] = useState(() => urlInicial.get("origem") ?? "all");
  const [filterEvent, setFilterEvent] = useState<string[]>(() => listaDaUrl("evento"));
  const [filterSponsor, setFilterSponsor] = useState<string[]>(() => listaDaUrl("patrocinador"));
  const [filterFranchise, setFilterFranchise] = useState<string[]>(() => listaDaUrl("franquia"));
  // "O que a Gráfica já reservou?" — a pergunta que liga esta tela à Gráfica
  // e que não tinha resposta sem abrir peça por peça.
  const [soReservadas, setSoReservadas] = useState(() => urlInicial.get("reserva") === "1");
  const [mostrando, setMostrando] = useState(LOTE_DO_ESTOQUE);
  const limparFiltros = () => { setSearch(""); setFilterStatus([]); setFilterCondition([]); setFilterAutoAdded("all"); setFilterEvent([]); setFilterSponsor([]); setFilterFranchise([]); setSoReservadas(false); };
  // Trocar o recorte volta ao primeiro lote.
  useEffect(() => { setMostrando(LOTE_DO_ESTOQUE); }, [search, filterStatus, filterCondition, filterAutoAdded, filterEvent, filterSponsor, filterFranchise, soReservadas]);
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams(window.location.search);
      const grava = (k: string, v: string) => { if (v) p.set(k, v); else p.delete(k); };
      grava("q", search.trim());
      grava("status", filterStatus.join(","));
      grava("condicao", filterCondition.join(","));
      grava("origem", filterAutoAdded === "all" ? "" : filterAutoAdded);
      grava("evento", filterEvent.join(","));
      grava("patrocinador", filterSponsor.join(","));
      grava("franquia", filterFranchise.join(","));
      grava("reserva", soReservadas ? "1" : "");
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    }, 200);
    return () => clearTimeout(t);
  }, [search, filterStatus, filterCondition, filterAutoAdded, filterEvent, filterSponsor, filterFranchise, soReservadas]);
  const [editing, setEditing] = useState<InventoryAsset | null | false>(false);
  const [deleting, setDeleting] = useState<InventoryAsset | null>(null);
  // Fechamento por clique-fora/Escape do popover de condição agora é do
  // Radix (ui/popover) — sem listener manual em document. Só "condition" tem
  // edição rápida; o status é definido pelo ciclo do evento.
  const [quickEdit, setQuickEdit] = useState<{ assetId: string; field: "condition" } | null>(null);
  // O detalhe aberto: um MATERIAL (grupo) ou uma unidade dele. Guarda chave e
  // id — não o objeto — para o modal acompanhar os dados depois de uma mudança.
  const [vendo, setVendo] = useState<{ chave: string; unidadeId: string | null } | null>(null);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const alternarGrupo = (chave: string) => setAbertos(prev => { const n = new Set(prev); if (n.has(chave)) n.delete(chave); else n.add(chave); return n; });

  // Quem mexe no acervo (dono, 14/09): Gráfica e admin editam; excluir segue
  // só do admin; a Solicitação consulta o que tem para reservar.
  const { user } = useAuth();
  // As rotas de escrita do acervo são só do admin (15/09) — oferecer a edição
  // à Gráfica era botão que sempre voltava 403.
  const podeEditar = user?.role === "admin";
  const podeExcluir = user?.role === "admin";
  const { data: reservasAtivas = VAZIO as ReservaAtiva[] } = useQuery<ReservaAtiva[]>({ queryKey: ["/api/estoque/reservas-ativas"] });
  const reservaPorAtivo = useMemo(() => new Map(reservasAtivas.map(r => [r.assetId, r])), [reservasAtivas]);

  const { data: assets = VAZIO as AtivoComOrigem[], isLoading, isError, refetch } = useQuery<AtivoComOrigem[]>({ queryKey: ["/api/inventory"] });
  const { data: sponsors = VAZIO as Sponsor[] } = useQuery<Sponsor[]>({ queryKey: ["/api/sponsors"] });
  const { data: allEvents = VAZIO as Event[] } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  // Por id: cada linha fazia sponsors.find() por patrocinador.
  const patrocinadorPorId = useMemo(() => new Map(sponsors.map(s => [s.id, s])), [sponsors]);

  // ativo → evento de ORIGEM. O acervo já traz `origemEventId` (revisão
  // 22/09): a tela baixava /api/items INTEIRO (MBs) só para isto e, até ele
  // chegar, a chave dos grupos mudava e as linhas abertas fechavam sozinhas.
  const assetEventMap = useMemo(() => {
    const eventMap = new Map(allEvents.map(e => [e.id, e]));
    const map: Record<string, { id: string; name: string; startDate: Date | string | null }> = {};
    for (const asset of assets) {
      const event = asset.origemEventId ? eventMap.get(asset.origemEventId) : undefined;
      if (event) map[asset.id] = { id: event.id, name: event.name, startDate: event.startDate ?? null };
    }
    return map;
  }, [assets, allEvents]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/inventory/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); toast({ title: "Ativo excluído", description: deleting ? `${deleting.displayId} — ${deleting.name}` : undefined, variant: "success" }); setDeleting(null); },
    onError: (e: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/estoque/reservas-ativas"] });
      toast({ title: "Não foi possível excluir", description: e.message, variant: "destructive" });
    },
  });

  // O toast diz QUAL ativo mudou e para QUAL condição — "Item atualizado" era
  // igual para qualquer linha da tabela.
  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object; rotulo?: string }) => apiRequest("PATCH", `/api/inventory/${id}`, data),
    onSuccess: (_r, vars) => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); setQuickEdit(null); toast({ title: "Condição atualizada", description: vars.rotulo, variant: "success" }); },
    onError: (e: Error) => toast({ title: "Não foi possível mudar a condição", description: e.message, variant: "destructive" }),
  });

  // Exclude AGUARDANDO_TRIAGEM — those belong to the triage screen only
  // UMA passada conta tudo (eram oito filter() do acervo inteiro por render).
  const { acervoAssets, contagem, registros } = useMemo(() => {
    // Os cartões contam UNIDADES, como as linhas (revisão 22/09): contavam
    // registros, e um registro ×10 valia 1 no topo e 10 na linha.
    const contagem: Record<string, number> = {};
    const registros: Record<string, number> = {};
    const acervoAssets: AtivoComOrigem[] = [];
    for (const a of assets) {
      contagem[a.trackingStatus] = (contagem[a.trackingStatus] ?? 0) + (a.quantity ?? 1);
      registros[a.trackingStatus] = (registros[a.trackingStatus] ?? 0) + 1;
      if (a.trackingStatus !== "AGUARDANDO_TRIAGEM") acervoAssets.push(a);
    }
    return { acervoAssets, contagem, registros };
  }, [assets]);
  const byStatus = (s: string) => contagem[s] ?? 0;
  const triageCount = byStatus("AGUARDANDO_TRIAGEM");
  const noAcervo = (st: string) => st !== "AGUARDANDO_TRIAGEM" && st !== "DESCARTADO";
  const total = Object.entries(contagem).reduce((soma, [st, n]) => (noAcervo(st) ? soma + n : soma), 0);
  const registrosNoTotal = Object.entries(registros).reduce((soma, [st, n]) => (noAcervo(st) ? soma + n : soma), 0);
  // Reservadas que estão no galpão: "No galpão" não quer dizer livre (14/09).
  const reservadasNoGalpao = useMemo(() => acervoAssets.reduce((s, a) => (a.trackingStatus === "NO_GALPAO" && reservaPorAtivo.has(a.id) ? s + (a.quantity ?? 1) : s), 0), [acervoAssets, reservaPorAtivo]);

  // A busca filtra com o valor ADIADO: o campo responde na hora e a lista
  // acompanha quando o navegador respira.
  const buscaAdiada = useDeferredValue(search);
  const filtered = useMemo(() => acervoAssets.filter(a => {
    // Hide DESCARTADO by default — only show when explicitly filtered
    if (filterStatus.length === 0 && a.trackingStatus === "DESCARTADO") return false;
    if (soReservadas && !reservaPorAtivo.has(a.id)) return false;
    const q = buscaAdiada.trim().toLowerCase();
    const ms = !q || a.name.toLowerCase().includes(q) || a.displayId.toLowerCase().includes(q) || a.franchiseTags.some(t => t.toLowerCase().includes(q));
    const mst = filterStatus.length === 0 || filterStatus.includes(a.trackingStatus);
    const mc = filterCondition.length === 0 || filterCondition.includes(a.condition);
    const ma = filterAutoAdded === "all" || (filterAutoAdded === "auto" ? a.autoAdded : !a.autoAdded);
    const me = filterEvent.length === 0 || filterEvent.includes(assetEventMap[a.id]?.id);
    const msp = filterSponsor.length === 0 || (a.sponsorIds ?? []).some(sid => filterSponsor.includes(sid));
    const mf = filterFranchise.length === 0 || (a.franchiseTags ?? []).some(t => filterFranchise.includes(t));
    return ms && mst && mc && ma && me && msp && mf;
  }), [acervoAssets, buscaAdiada, filterStatus, filterCondition, filterAutoAdded, filterEvent, filterSponsor, filterFranchise, soReservadas, reservaPorAtivo, assetEventMap]);
  // AGRUPADO POR QUANTIDADE: os filtros e os cartões contam UNIDADES; a lista
  // mostra MATERIAIS. Lotes por grupo. A chave usa o evento que vem NO
  // PRÓPRIO ativo (origemEventId) — não espera outra lista chegar, então não
  // muda depois da primeira carga e as linhas abertas ficam abertas.
  const grupos = useMemo(() => {
    const agora = new Date();
    return agruparAcervo(filtered, a => a.origemEventId ?? null,
      a => reservaPorAtivo.has(a.id) || (!!assetEventMap[a.id] && !eventoJaAcabou(assetEventMap[a.id].startDate, agora)));
  }, [filtered, assetEventMap, reservaPorAtivo]);
  const gruposVisiveis = useMemo(() => grupos.slice(0, mostrando), [grupos, mostrando]);
  const grupoVendo = vendo ? grupos.find(g => g.chave === vendo.chave) : undefined;

  // ONDE JÁ FOI USADO (revisão 22/09): só dos materiais NA TELA (e do que
  // está aberto no detalhe), sem N+1 — uma leitura por fatia de até
  // LIMITE_DE_USOS peças de origem / registros avulsos. Antes era o acervo inteiro.
  const recortesDeUsos = useMemo(() => {
    const itens = new Set<string>(), avulsos = new Set<string>();
    for (const g of grupoVendo ? [...gruposVisiveis, grupoVendo] : gruposVisiveis) {
      for (const a of g.ativos) { if (a.originalItemId) itens.add(a.originalItemId); else avulsos.add(a.id); }
    }
    const fatias = (xs: string[], param: string) => {
      const out: string[] = [];
      for (let i = 0; i < xs.length; i += LIMITE_DE_USOS) out.push(`?${param}=${xs.slice(i, i + LIMITE_DE_USOS).join(",")}`);
      return out;
    };
    return [...fatias(Array.from(itens).sort(), "itens"), ...fatias(Array.from(avulsos).sort(), "ativos")];
  }, [gruposVisiveis, grupoVendo]);
  const consultasDeUsos = useQueries({
    queries: recortesDeUsos.map(qs => ({
      queryKey: ["/api/estoque/usos", qs],
      // Mostrar mais / trocar filtro muda a chave: segura o que já tinha.
      placeholderData: (anterior: AlocacaoDoAcervo[] | undefined) => anterior,
    })),
  });
  const assinaturaDosUsos = consultasDeUsos.map(q => q.dataUpdatedAt).join(",");
  const alocacoes = useMemo(() => {
    const vistos = new Set<string>();
    const out: AlocacaoDoAcervo[] = [];
    for (const q of consultasDeUsos) for (const a of (q.data as AlocacaoDoAcervo[] | undefined) ?? []) if (!vistos.has(a.id)) { vistos.add(a.id); out.push(a); }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinaturaDosUsos, recortesDeUsos]);
  const usosPorAtivo = useMemo(() => {
    const porAtivo = new Map<string, AlocacaoDoAcervo[]>();
    for (const a of alocacoes) { const l = porAtivo.get(a.assetId); if (l) l.push(a); else porAtivo.set(a.assetId, [a]); }
    const agora = new Date();
    const m = new Map<string, UsoDoAtivo[]>();
    for (const a of assets) {
      const usos = usosDoAtivo(assetEventMap[a.id] ?? null, porAtivo.get(a.id) ?? VAZIO, agora);
      if (usos.length) m.set(a.id, usos);
    }
    return m;
  }, [alocacoes, assets, assetEventMap]);

  const unidadesNoRecorte = useMemo(() => filtered.reduce((s, a) => s + (a.quantity ?? 1), 0), [filtered]);
  const chaveDoAtivo = useMemo(() => { const m = new Map<string, string>(); for (const g of grupos) for (const a of g.ativos) m.set(a.id, g.chave); return m; }, [grupos]);
  const setViewingAsset = (a: InventoryAsset) => { const chave = chaveDoAtivo.get(a.id); if (chave) setVendo({ chave, unidadeId: a.id }); };
  // A peça de ORIGEM do detalhe: uma só, pedida quando o detalhe abre.
  const origemDoDetalhe = grupoVendo?.ativos.find(a => a.originalItemId)?.id ?? null;
  const { data: pecaDeOrigem } = useQuery<OrigemDoAtivo | null>({ queryKey: [`/api/inventory/${origemDoDetalhe}/origem`], enabled: !!origemDoDetalhe });

  const hasFilters = !!(soReservadas || search || filterStatus.length > 0 || filterCondition.length > 0 || filterAutoAdded !== "all" || filterEvent.length > 0 || filterSponsor.length > 0 || filterFranchise.length > 0);

  // Filtros facetados: cada filtro lista só o que existe no acervo já recortado
  // pelos OUTROS filtros ativos, com a contagem de ativos por opção.
  const eFacetPool = (exclude: 'status' | 'condition' | 'auto' | 'event' | 'sponsor' | 'franchise') =>
    acervoAssets.filter(a => {
      if (soReservadas && !reservaPorAtivo.has(a.id)) return false;
      if (exclude !== 'status') {
        if (filterStatus.length === 0 && a.trackingStatus === "DESCARTADO") return false;
        if (filterStatus.length > 0 && !filterStatus.includes(a.trackingStatus)) return false;
      }
      if (exclude !== 'condition' && filterCondition.length > 0 && !filterCondition.includes(a.condition)) return false;
      if (exclude !== 'auto' && filterAutoAdded !== "all" && (filterAutoAdded === "auto" ? !a.autoAdded : a.autoAdded)) return false;
      if (exclude !== 'event' && filterEvent.length > 0 && !filterEvent.includes(assetEventMap[a.id]?.id)) return false;
      if (exclude !== 'sponsor' && filterSponsor.length > 0 && !(a.sponsorIds ?? []).some(sid => filterSponsor.includes(sid))) return false;
      if (exclude !== 'franchise' && filterFranchise.length > 0 && !(a.franchiseTags ?? []).some(t => filterFranchise.includes(t))) return false;
      return true;
    });

  const tally = <T,>(rows: T[], key: (r: T) => { value: string; label: string } | null) => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    rows.forEach(r => {
      const k = key(r);
      if (!k) return;
      const cur = map.get(k.value);
      if (cur) cur.count++;
      else map.set(k.value, { ...k, count: 1 });
    });
    return Array.from(map.values());
  };

  const eventFilterOptions = tally(eFacetPool('event'), a => {
    const ev = assetEventMap[a.id];
    return ev ? { value: ev.id, label: ev.name } : null;
  });
  const sponsorFilterOptions = (() => {
    const byId = new Map(sponsors.map(s => [s.id, s.name]));
    const map = new Map<string, { value: string; label: string; count: number }>();
    eFacetPool('sponsor').forEach(a => (a.sponsorIds ?? []).forEach(id => {
      const cur = map.get(id);
      if (cur) cur.count++;
      else map.set(id, { value: id, label: byId.get(id) || id, count: 1 });
    }));
    return Array.from(map.values());
  })();
  const statusFilterOptions = tally(eFacetPool('status'), a =>
    a.trackingStatus === "AGUARDANDO_TRIAGEM" ? null : { value: a.trackingStatus, label: STATUS_META[a.trackingStatus]?.label ?? a.trackingStatus });
  const conditionFilterOptions = tally(eFacetPool('condition'), a =>
    ({ value: a.condition, label: conditionMeta(a.condition).label }));
  const originFilterOptions = tally(eFacetPool('auto'), a =>
    ({ value: a.autoAdded ? "auto" : "manual", label: a.autoAdded ? "Gráfica (automático)" : "Manual" }));
  const franchiseFilterOptions = (() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    eFacetPool('franchise').forEach(a => (a.franchiseTags ?? []).forEach(t => {
      const cur = map.get(t);
      if (cur) cur.count++;
      else map.set(t, { value: t, label: t, count: 1 });
    }));
    return Array.from(map.values());
  })();

  // Cabeçalho e célula com o MESMO recuo lateral (24px): eram 20 no th e 24 no
  // td, e todo rótulo de coluna ficava 4px à esquerda do seu conteúdo.
  const TH: React.CSSProperties = {
    padding: "12px 24px", fontSize: FS.small, fontWeight: FW.forte, letterSpacing: "0.06em",
    textTransform: "uppercase", color: T.surface, fontFamily: FONT.display,
    textAlign: "left", background: T.dark, borderBottom: "none",
    whiteSpace: "nowrap",
  };
  const TD: React.CSSProperties = {
    padding: "14px 24px", verticalAlign: "middle",
    fontFamily: FONT.corpo, fontSize: FS.body, color: T.text,
    borderBottom: `1px solid ${N.n3}`,
  };

  // Subtítulo = o ESTADO do acervo agora, não uma paráfrase do título.
  const estadoDoAcervo = isLoading
    ? "Carregando o acervo…"
    : isError
      ? "O acervo não carregou"
      : `${total.toLocaleString("pt-BR")} ${total === 1 ? "unidade" : "unidades"} no acervo${triageCount > 0 ? ` · ${triageCount} aguardando triagem` : ""}`;

  return (
    <div style={{ padding: isMobile ? "14px 16px" : "32px 36px", background: T.bg, height: "100%", overflowY: "auto" }}>

      {/* ── Header ── */}
      <CabecalhoDaPagina
        titulo="Estoque"
        icone={Archive}
        subtitulo={estadoDoAcervo}
        acoes={podeEditar ? (
          <Botao variante="primario" tamanho="toque" icone={Plus} larguraCheia={isMobile}
            data-testid="button-new-asset" onClick={() => setEditing(null)}>
            Novo ativo
          </Botao>
        ) : undefined}
      />

      {/* ── Stat cards ── */}
      {/* minmax(0, ...) pelo mesmo motivo do calendario: `1fr` e
          `minmax(AUTO, 1fr)`, e o minimo automatico e o min-content do cartao.
          Em 375px cada coluna vale ~103px, e "Disponivel no deposito" nao cabe
          — as tres trilhas estouravam e a PAGINA inteira ganhava rolagem
          lateral. Com o minimo em 0 o texto quebra e a grade fica na largura. */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, minmax(0, 1fr))" : "repeat(auto-fit, minmax(160px, 1fr))", gap: isMobile ? 8 : 14, marginBottom: isMobile ? 16 : 24 }}>
        {/* Os cartões FILTRAM a lista: o CartaoKpi com onClick é <button
            aria-pressed>, então o teclado alcança os seis atalhos. */}
        <CartaoKpi compacto={isMobile}
          rotulo="Total Acervo" valor={total.toLocaleString("pt-BR")} icone={Package} tom="info"
          // O cartão LIMPA os filtros ao ser tocado — e nada dizia isso: com
          // filtro ativo, o subtexto vira o convite.
          sub={hasFilters ? "Toque para ver tudo (limpa filtros)" : registrosNoTotal !== total ? `${registrosNoTotal} registros · ${total} unidades` : "Unidades no acervo"}
          ativo={!hasFilters}
          onClick={limparFiltros}
        />
        <CartaoKpi compacto={isMobile}
          rotulo="Descartados" valor={byStatus("DESCARTADO").toLocaleString("pt-BR")} icone={XCircle} tom="neutro"
          sub={byStatus("DESCARTADO") > 0 ? "Ocultos na tabela · ver →" : "Nenhum descartado"}
          ativo={filterStatus.length === 1 && filterStatus[0] === "DESCARTADO"}
          onClick={() => setFilterStatus(filterStatus.length === 1 && filterStatus[0] === "DESCARTADO" ? [] : ["DESCARTADO"])}
        />
        <CartaoKpi compacto={isMobile}
          rotulo="No Galpão" valor={byStatus("NO_GALPAO").toLocaleString("pt-BR")} icone={Warehouse} tom="sucesso"
          // "Disponível" prometia o que a regra de 14/09 nega: no galpão pode
          // estar reservada ou separada para o evento de origem.
          sub={reservadasNoGalpao > 0 ? `${reservadasNoGalpao} com reserva` : "Guardadas no depósito"}
          ativo={filterStatus.length === 1 && filterStatus[0] === "NO_GALPAO"}
          onClick={() => setFilterStatus(filterStatus.length === 1 && filterStatus[0] === "NO_GALPAO" ? [] : ["NO_GALPAO"])}
        />
        <CartaoKpi compacto={isMobile}
          rotulo="Em Uso" valor={byStatus("EM_USO").toLocaleString("pt-BR")} icone={Truck} tom="laranja"
          sub="Num evento agora"
          ativo={filterStatus.length === 1 && filterStatus[0] === "EM_USO"}
          onClick={() => setFilterStatus(filterStatus.length === 1 && filterStatus[0] === "EM_USO" ? [] : ["EM_USO"])}
        />
        <CartaoKpi compacto={isMobile}
          rotulo="Manutenção" valor={byStatus("EM_MANUTENCAO").toLocaleString("pt-BR")} icone={Wrench} tom="alerta"
          sub="Fora do estoque até o reparo"
          ativo={filterStatus.length === 1 && filterStatus[0] === "EM_MANUTENCAO"}
          onClick={() => setFilterStatus(filterStatus.length === 1 && filterStatus[0] === "EM_MANUTENCAO" ? [] : ["EM_MANUTENCAO"])}
        />
        {/* Este não filtra: LEVA à Triagem. O subtexto em âmbar quando há
            fila é o convite; sem fila, fica no cinza de apoio. */}
        <CartaoKpi compacto={isMobile}
          rotulo="Ag. Triagem" valor={triageCount.toLocaleString("pt-BR")} icone={ScanSearch} tom="alerta"
          sub={<span style={{ color: triageCount > 0 ? TOM.alerta.text : T.second }}>{triageCount > 0 ? "Ir para triagem ↗" : "Abrir triagem ↗"}</span>}
          onClick={() => navigate("/triagem-retorno")}
        />
      </div>

      {/* ── Filter bar ── */}
      {(() => {
        const FL: React.CSSProperties = {
          fontSize: FS.small, fontWeight: FW.corpo, color: T.second,
          fontFamily: FONT.corpo, marginBottom: 6, display: "block",
        };
        const SEL = (active: boolean): React.CSSProperties => ({
          height: 44, width: "100%",
          border: `1.5px solid ${active ? T.accentText : T.border}`,
          borderRadius: R.md, fontSize: FS.body, fontWeight: FW.corpo,
          fontFamily: FONT.corpo,
          padding: "0 12px", background: T.surface,
          color: active ? T.accentText : T.strong,
          cursor: "pointer",
          transition: "border-color 0.15s",
        });
        return (
          <div style={{
            background: T.surface, borderRadius: R.lg, border: `1px solid ${T.border}`,
            padding: isMobile ? "12px 14px 14px" : "16px 20px 18px", marginBottom: isMobile ? 16 : 20,
            display: "flex", alignItems: "flex-end", gap: isMobile ? 10 : 14, flexWrap: "wrap",
          }}>
            {/* Evento — wrapper .event-filter-44 iguala a altura do trigger (44px)
                aos demais filtros; o componente é compartilhado e não expõe
                triggerStyle. */}
            <div className="event-filter-44" style={{ display: "flex", flexDirection: "column", flex: "1 1 160px" }}>
              <label style={FL}>Evento</label>
              <EventFilterDropdown
                values={filterEvent}
                onValuesChange={setFilterEvent}
                options={eventFilterOptions}
              />
            </div>

            {/* Patrocinador */}
            <div style={{ display: "flex", flexDirection: "column", flex: "1 1 180px" }}>
              <label style={FL}>Patrocinador</label>
              <FilterSelect
                fullWidth showAllLabelWhenEmpty hideWhenEmpty={false}
                label="Patrocinador" allLabel="Todos os patrocinadores"
                values={filterSponsor} onValuesChange={setFilterSponsor}
                options={sponsorFilterOptions}
                searchPlaceholder="Buscar patrocinador..." emptyText="Nenhum patrocinador encontrado."
                testId="select-filter-sponsor" triggerStyle={SEL(filterSponsor.length > 0)}
              />
            </div>

            {/* Franquia */}
            <div style={{ display: "flex", flexDirection: "column", flex: "1 1 140px" }}>
              <label style={FL}>Franquia</label>
              <FilterSelect
                fullWidth showAllLabelWhenEmpty hideWhenEmpty={false}
                label="Franquia" allLabel="Todas as franquias"
                values={filterFranchise} onValuesChange={setFilterFranchise}
                options={franchiseFilterOptions}
                searchPlaceholder="Buscar franquia..." emptyText="Nenhuma franquia encontrada."
                testId="select-filter-franchise" triggerStyle={SEL(filterFranchise.length > 0)}
              />
            </div>

            {/* Status */}
            <div style={{ display: "flex", flexDirection: "column", flex: "1 1 140px" }}>
              <label style={FL}>Status</label>
              <FilterSelect
                fullWidth showAllLabelWhenEmpty hideWhenEmpty={false}
                label="Status" allLabel="Qualquer status"
                values={filterStatus} onValuesChange={setFilterStatus}
                options={statusFilterOptions}
                searchPlaceholder="Buscar status..." emptyText="Nenhum status encontrado."
                testId="select-filter-status" triggerStyle={SEL(filterStatus.length > 0)}
              />
            </div>

            {/* Condição */}
            <div style={{ display: "flex", flexDirection: "column", flex: "1 1 130px" }}>
              <label style={FL}>Condição</label>
              <FilterSelect
                fullWidth showAllLabelWhenEmpty hideWhenEmpty={false}
                label="Condição" allLabel="Todas as condições"
                values={filterCondition} onValuesChange={setFilterCondition}
                options={conditionFilterOptions}
                searchPlaceholder="Buscar condição..." emptyText="Nenhuma condição encontrada."
                testId="select-filter-condition" triggerStyle={SEL(filterCondition.length > 0)}
              />
            </div>

            {/* Origem */}
            <div style={{ display: "flex", flexDirection: "column", flex: "0 1 110px" }}>
              <label style={FL}>Origem</label>
              <FilterSelect
                fullWidth showAllLabelWhenEmpty hideWhenEmpty={false}
                label="Origem" allLabel="Todas"
                value={filterAutoAdded} onChange={setFilterAutoAdded}
                options={originFilterOptions}
                searchPlaceholder="Buscar origem..." emptyText="Nenhuma origem encontrada."
                testId="select-filter-origin" triggerStyle={SEL(filterAutoAdded !== "all")}
              />
            </div>

            {/* Busca */}
            <div style={{ display: "flex", flexDirection: "column", flex: "1 1 160px" }}>
              <label style={FL}>Buscar</label>
              <div style={{ position: "relative" }}>
                <Search size={14} color={T.second} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <input data-testid="input-search-assets" style={{
                  width: "100%", paddingLeft: 34, paddingRight: 12, height: 44,
                  border: `1.5px solid ${search ? T.accentText : T.border}`, borderRadius: R.md,
                  fontSize: isMobile ? FS.lead : FS.body, fontWeight: 400, fontFamily: FONT.corpo,
                  background: T.surface, color: T.strong, boxSizing: "border-box",
                  transition: "border-color 0.15s",
                }}
                onFocus={e => (e.target.style.borderColor = T.accentText)}
                onBlur={e => (e.target.style.borderColor = search ? T.accentText : T.border)}
                aria-label="Buscar ativos"
                placeholder="Nome, ID ou franquia..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>

            {/* Só reservadas — botão de alternar (aria-pressed), não depende
                só da cor: o ícone preenche e o texto muda. */}
            {(reservasAtivas.length > 0 || soReservadas) && (
              <div style={{ display: "flex", flexDirection: "column", flex: "0 0 auto" }}>
                <label style={{ ...FL, visibility: "hidden" }} aria-hidden="true">·</label>
                {/* Chip de filtro com desenho próprio (alterna, com contagem):
                    fica <button> nativo; o realce vem da .ds-botao. */}
                <button type="button" data-testid="button-so-reservadas" aria-pressed={soReservadas}
                  onClick={() => setSoReservadas(v => !v)}
                  title="Peças que a Gráfica reservou para outra peça de um evento"
                  className="ds-botao"
                  style={{ height: 44, display: "flex", alignItems: "center", gap: 6, padding: "0 14px", borderRadius: R.md, border: `1.5px solid ${soReservadas ? TOM.info.text : T.border}`, background: soReservadas ? TOM.info.bg : T.surface, color: soReservadas ? TOM.info.text : T.strong, fontSize: FS.body, fontWeight: FW.medio, fontFamily: FONT.corpo, cursor: "pointer", whiteSpace: "nowrap" }}>
                  <BookmarkCheck size={14} aria-hidden="true" fill={soReservadas ? TOM.info.border : "none"} />
                  {soReservadas ? "Só reservadas" : "Reservadas"}
                  <span style={{ fontFamily: FONT.display, fontWeight: FW.forte, fontVariantNumeric: "tabular-nums" }}>{reservasAtivas.length}</span>
                </button>
              </div>
            )}

            {/* Limpar */}
            {/* alignSelf start: a frase do motivo pendura ABAIXO do botão sem
                tirá-lo da linha dos outros campos. Limpar não é destrutivo —
                secundário, e não vermelho. */}
            <div style={{ display: "flex", flexDirection: "column", flex: "0 0 auto", alignSelf: "flex-start" }}>
              <label style={{ ...FL, visibility: "hidden" }} aria-hidden="true">·</label>
              <Botao variante="secundario" tamanho="toque" icone={X}
                data-testid="button-clear-filters"
                disabled={!hasFilters}
                motivo={!hasFilters ? "Nenhum filtro ativo" : undefined}
                onClick={limparFiltros}
                style={{ height: 44, fontSize: FS.meta }}>
                Limpar filtros
              </Botao>
            </div>
          </div>
        );
      })()}

      {/* ── Table ── */}
      {/* `listaRef` mede a ÁREA ÚTIL desta caixa (já sem o padding da página):
          é ela, e não a janela, que decide entre tabela e cartões. */}
      <div ref={listaRef} style={{ background: T.surface, borderRadius: isMobile ? R.lg : R.xl, border: `1px solid ${T.border}`, overflow: "hidden", boxShadow: SHADOW.sm }}>
        {isLoading ? (
          <div data-testid="skeleton-estoque" style={{ padding: isMobile ? 12 : 16 }}>
            {/* O esqueleto imita o que vem: cartões na área estreita, tabela na larga. */}
            <Esqueleto variante={emCards ? "lista" : "tabela"} linhas={6} rotulo="Carregando o estoque" />
          </div>
        ) : isError ? (
          <div style={{ padding: isMobile ? 12 : 24 }}>
            <EstadoErro titulo="Não foi possível carregar o estoque" detalhe="Verifique sua conexão e tente de novo." aoTentarDeNovo={() => refetch()} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: isMobile ? 12 : 24 }}>
            {/* Vazio com saída: com filtro ativo, o botão que resolve fica
                aqui, e não lá em cima na barra (que já rolou para fora). */}
            <EstadoVazio
              icone={Archive}
              titulo={hasFilters ? "Nenhum ativo neste recorte" : "Nenhum ativo no acervo ainda"}
              descricao={hasFilters ? "Os filtros atuais escondem todo o acervo." : podeEditar ? "Cadastre o primeiro ativo pelo botão Novo ativo." : "As peças entram aqui depois de produzidas e triadas."}
              acao={hasFilters ? (
                <Botao variante="primario" tamanho="toque" data-testid="button-clear-filters-vazio" onClick={limparFiltros}>
                  Limpar filtros
                </Botao>
              ) : undefined}
            />
          </div>
        ) : (
          <div>
            {(() => {
              // As peças de cada ativo são montadas UMA vez e servem às duas
              // vistas: tabela no desktop, lista no celular. Antes o celular
              // recebia a tabela de 860px com rolagem lateral — o status e as
              // ações ficavam fora da tela e ninguém sabia que dava para rolar.
              // Alvo pelo PONTEIRO: o tablet do galpão não é "mobile" pela
              // largura e ficava com 32px em Ver/Editar/Excluir, metade do
              // mínimo para o dedo.
              const alvoAcao = alvo(32, ponteiroGrosso || isMobile);
              // Ícone de ação na linha: Botao fantasma no quadrado do alvo
              // (o hover vem da classe, não de onMouseEnter trocando cor).
              const botaoAcao: React.CSSProperties = { width: alvoAcao, height: alvoAcao, minHeight: alvoAcao, padding: 0, color: T.second };
              const tamanhoDoIcone = ponteiroGrosso || isMobile ? 18 : 15;
              const pecasDe = (asset: InventoryAsset) => {
                const sm = STATUS_META[asset.trackingStatus ?? "NO_GALPAO"];
                const cm = conditionMeta(asset.condition);
                const thumbOk = asset.approvalThumbUrl && (/\.(png|jpg|jpeg|gif|webp)/i.test(asset.approvalThumbUrl) || asset.approvalThumbUrl.startsWith('/objects/'));
                const assetSponsors = (asset.sponsorIds ?? []).map(id => patrocinadorPorId.get(id)).filter(Boolean);
                const lado = emCards ? 48 : 40;

                const miniaturaEl = (
                  <div style={{ width: lado, height: lado, borderRadius: R.md, overflow: "hidden", background: N.n2, border: `1px solid ${T.border}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {thumbOk
                      ? <img loading="lazy" decoding="async" src={miniatura(asset.approvalThumbUrl!)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <Package size={16} color={T.muted} aria-hidden="true" />
                    }
                  </div>
                );

                const quantidadeEl = (
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    padding: "1px 6px", borderRadius: R.sm,
                    background: (asset.quantity ?? 1) > 1 ? T.accentText : N.n2,
                    color: (asset.quantity ?? 1) > 1 ? T.surface : T.second,
                    fontSize: FS.small, fontWeight: FW.forte, fontFamily: FONT.mono, flexShrink: 0,
                  }}>×{asset.quantity ?? 1}</span>
                );

                const eventoEl = assetEventMap[asset.id] ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, minWidth: 0 }}>
                    <CalendarDays size={11} color={T.second} aria-hidden="true" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: FS.meta, color: T.second, fontFamily: FONT.corpo, fontWeight: FW.corpo, whiteSpace: "normal", overflowWrap: "anywhere" }}>
                      {assetEventMap[asset.id].name}
                    </span>
                  </div>
                ) : null;

                // Patrocinador no laranja LEGÍVEL (TOM.laranja: #c2410c sobre
                // o tinte claro). Caixa alta em 9px saiu — o nome da marca já
                // é o que se lê, não precisa gritar.
                const patrocinadoresEl = assetSponsors.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                    {assetSponsors.slice(0, 2).map(sp => (
                      <Selo key={sp!.id} tom="laranja" forma="retangulo" style={{ padding: "1px 6px", fontWeight: FW.medio, fontFamily: FONT.display }}>{sp!.name}</Selo>
                    ))}
                    {assetSponsors.length > 2 && (
                      <span style={{ fontSize: FS.small, color: T.second, fontFamily: FONT.mono, alignSelf: "center" }}>+{assetSponsors.length - 2}</span>
                    )}
                  </div>
                ) : null;

                const franquiasEl = (asset.franchiseTags ?? []).length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                    {(asset.franchiseTags ?? []).map(t => (
                      <Selo key={t} tom="info" forma="retangulo" style={{ padding: "1px 6px", fontWeight: FW.medio, fontFamily: FONT.display }}>{t}</Selo>
                    ))}
                  </div>
                ) : null;

                // Condição — edição rápida via ui/popover: portal (não é
                // cortado pela tabela), abre para cima quando falta espaço,
                // fecha por Escape/clique-fora via Radix. O chevron diz que o
                // chip é editável; sem ele parecia só um rótulo.
                const condicaoEl = (
                  <Popover
                    open={quickEdit?.assetId === asset.id && quickEdit.field === "condition"}
                    onOpenChange={open => setQuickEdit(open ? { assetId: asset.id, field: "condition" } : null)}
                  >
                    <PopoverTrigger asChild>
                      {/* Gatilho de Popover (asChild): fica <button> nativo, em
                          forma de pílula; o realce vem da .ds-botao. */}
                      <button data-testid={`button-quick-condition-${asset.id}`}
                        disabled={!podeEditar}
                        title={podeEditar ? "Mudar a condição" : "Mudar a condição é só do admin"}
                        aria-label={`Condição: ${cm.label}${podeEditar ? " — mudar" : ""}`}
                        className="ds-botao"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          minHeight: isMobile ? 36 : 26, padding: "0 10px", borderRadius: R.pill, border: "none",
                          background: cm.bg, color: cm.color,
                          fontSize: FS.meta, fontWeight: FW.forte, fontFamily: FONT.display,
                          cursor: podeEditar ? "pointer" : "default", whiteSpace: "nowrap",
                          // Sem edição a pílula é só leitura: não esmaece como
                          // botão desabilitado (a .ds-botao faria 50%).
                          opacity: 1,
                        }}>
                        {cm.label}
                        {podeEditar && <ChevronDown size={12} aria-hidden="true" />}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" sideOffset={4} className="w-auto p-1.5"
                      style={{ minWidth: 150, borderRadius: R.md, display: "flex", flexDirection: "column", gap: 2, boxShadow: SHADOW.md }}
                      onClick={e => e.stopPropagation()}
                    >
                      {/* Congelado enquanto SAI: o painel fecha e a página
                          continua renderizando — ver popover-congelado.test.ts. */}
                      <FreezeWhileClosing open={quickEdit?.assetId === asset.id && quickEdit.field === "condition"}>
                      {CONDITIONS.map(c => {
                        const meta = CONDITION_META[c];
                        return (
                          <button key={c} disabled={patchMutation.isPending}
                            className="ds-botao ds-botao-fantasma"
                            onClick={e => { e.stopPropagation(); patchMutation.mutate({ id: asset.id, data: { condition: c }, rotulo: `${asset.displayId} → ${meta.label}` }); }}
                            style={{ display: "flex", alignItems: "center", gap: 6, minHeight: isMobile ? 44 : 32, padding: "0 10px", borderRadius: R.sm, border: "none", background: asset.condition === c ? meta.bg : "transparent", color: asset.condition === c ? meta.color : T.apoio, fontSize: FS.body, fontWeight: FW.medio, fontFamily: FONT.display, cursor: patchMutation.isPending ? "wait" : "pointer", textAlign: "left" }}>
                            {asset.condition === c ? <CheckCircle2 size={13} aria-hidden="true" /> : <span style={{ width: 13 }} />}
                            {meta.label}
                          </button>
                        );
                      })}
                    </FreezeWhileClosing>
                    </PopoverContent>
                  </Popover>
                );

                // "No galpão" não quer dizer livre (14/09): a peça pode estar
                // reservada para outro evento, ou ter sido impressa para um
                // evento que ainda não aconteceu.
                const reservaEl = (() => {
                  const reserva = reservaPorAtivo.get(asset.id);
                  const chip: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, marginTop: 5, padding: "2px 7px", borderRadius: R.sm, fontSize: FS.small, fontWeight: FW.forte, fontFamily: FONT.display, whiteSpace: "normal", overflowWrap: "anywhere", maxWidth: "100%" };
                  if (reserva) {
                    return (
                      <div data-testid={`chip-reservada-${asset.id}`} title={`Reservada para ${reserva.itemDisplayId ?? "uma peça"} de ${reserva.eventName}`}
                        style={{ ...chip, background: TOM.info.bg, color: TOM.info.text }}>
                        <BookmarkCheck size={11} aria-hidden="true" style={{ flexShrink: 0 }} /> Reservada · {reserva.eventName}{reserva.saida ? ` · saída ${diaEMes(reserva.saida)}` : ""}
                      </div>
                    );
                  }
                  const origem = assetEventMap[asset.id];
                  if (asset.trackingStatus === "NO_GALPAO" && origem && !eventoJaAcabou(origem.startDate, new Date())) {
                    return (
                      <div data-testid={`chip-separada-${asset.id}`} title={`Impressa para ${origem.name}, que ainda não aconteceu`}
                        style={{ ...chip, background: N.n2, color: T.apoio }}>
                        Separada · aguarda {origem.name}
                      </div>
                    );
                  }
                  return null;
                })();

                const statusEl = (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: sm.color, flexShrink: 0 }} />
                    <span style={{ fontSize: FS.meta, fontWeight: FW.forte, color: sm.color, fontFamily: FONT.display, whiteSpace: "nowrap" }}>
                      {sm.label}
                    </span>
                  </div>
                );

                // Excluir leva o vermelho legível no próprio ícone (destrutivo
                // se lê antes do hover); os outros ficam no cinza de apoio.
                const acoesEl = (
                  <div className="row-actions" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2, transition: "opacity 0.15s" }}>
                    <Botao variante="fantasma" data-testid={`button-view-asset-${asset.id}`}
                      title="Ver detalhes" aria-label={`Ver detalhes de ${asset.name}`}
                      onClick={e => { e.stopPropagation(); setViewingAsset(asset); }}
                      style={botaoAcao}>
                      <Eye size={tamanhoDoIcone} aria-hidden="true" />
                    </Botao>
                    {podeEditar && <Botao variante="fantasma" data-testid={`button-edit-asset-${asset.id}`}
                      title="Editar" aria-label={`Editar ${asset.name}`}
                      onClick={e => { e.stopPropagation(); setEditing(asset); }}
                      style={botaoAcao}>
                      <Pencil size={tamanhoDoIcone} aria-hidden="true" />
                    </Botao>}
                    {podeExcluir && <Botao variante="fantasma" data-testid={`button-delete-asset-${asset.id}`}
                      title="Excluir" aria-label={`Excluir ${asset.name}`}
                      onClick={e => { e.stopPropagation(); setDeleting(asset); }}
                      style={{ ...botaoAcao, color: TOM.perigo.text }}>
                      <Trash2 size={tamanhoDoIcone} aria-hidden="true" />
                    </Botao>}
                  </div>
                );

                return { miniaturaEl, quantidadeEl, eventoEl, patrocinadoresEl, franquiasEl, condicaoEl, reservaEl, statusEl, acoesEl };
              };

              // ── AGRUPADO POR QUANTIDADE (dono, 21/09) ─────────────────────
              // Uma linha por MATERIAL, com a soma e a distribuição por
              // situação; as unidades (e as ações por unidade) ficam dentro da
              // expansão. Material de um registro só continua sendo uma linha
              // comum. O espaço da antiga coluna de localização foi para
              // "Situação" e "Onde já foi usado".
              const usadoEmEl = (g: GrupoDoAcervo<InventoryAsset>) => {
                const eventos = eventosDeUso(g.ativos.map(a => usosPorAtivo.get(a.id) ?? []), g.ativos.map(a => a.quantity));
                if (eventos.length === 0) return <span style={{ fontSize: FS.meta, color: T.second }}>Ainda não saiu</span>;
                return (
                  <div data-testid={`usado-em-${g.ativos[0].id}`} style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                    {eventos.slice(0, 2).map(e => (
                      <span key={e.eventId} title={`${ROTULO_DO_USO[e.situacao]} ${e.eventName} · ${e.unidades} un.`}
                        style={{ whiteSpace: "normal", overflowWrap: "anywhere", padding: "2px 7px", borderRadius: R.sm, fontSize: FS.small, fontWeight: FW.medio, background: e.situacao === "separada" ? TOM.info.bg : N.n2, color: e.situacao === "separada" ? TOM.info.text : T.strong }}>
                        {e.eventName}
                      </span>
                    ))}
                    {eventos.length > 2 && <span style={{ fontSize: FS.small, color: T.second, fontFamily: FONT.display, fontWeight: FW.forte }}>+{eventos.length - 2}</span>}
                  </div>
                );
              };
              const quantidadeDoGrupoEl = (g: GrupoDoAcervo<InventoryAsset>) => (
                <span data-testid={`unidades-${g.ativos[0].id}`} style={{ whiteSpace: "nowrap" }}>
                  <span style={{ fontFamily: FONT.display, fontSize: FS.title, fontWeight: FW.forte, color: T.text, fontVariantNumeric: "tabular-nums" }}>{g.unidades}</span>
                  <span style={{ fontSize: FS.small, fontWeight: FW.medio, color: T.second, marginLeft: 3 }}>un.</span>
                </span>
              );
              const alternarEl = (g: GrupoDoAcervo<InventoryAsset>, aberto: boolean) => (
                <Botao variante="fantasma" data-testid={`expandir-${g.ativos[0].id}`} aria-expanded={aberto}
                  aria-label={`${aberto ? "Recolher" : "Ver"} as ${g.ativos.length} unidades de ${g.nome}`}
                  onClick={e => { e.stopPropagation(); alternarGrupo(g.chave); }}
                  style={{ ...botaoAcao, width: "auto", padding: "0 8px", gap: 4, fontSize: FS.meta, color: T.strong }}>
                  {aberto ? "Recolher" : "Unidades"} <ChevronDown size={14} aria-hidden="true" style={{ transform: aberto ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                </Botao>
              );
              const verGrupoEl = (g: GrupoDoAcervo<InventoryAsset>) => (
                <Botao variante="fantasma" data-testid={`button-view-group-${g.ativos[0].id}`} title="Ver o material" aria-label={`Ver detalhes de ${g.nome}`}
                  onClick={e => { e.stopPropagation(); setVendo({ chave: g.chave, unidadeId: null }); }} style={botaoAcao}>
                  <Eye size={tamanhoDoIcone} aria-hidden="true" />
                </Botao>
              );
              const LIMITE_DE_UNIDADES = 40;

              if (emCards) {
                return (
                  <ul aria-label="Materiais do acervo" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {gruposVisiveis.map((g, i) => {
                      const unico = g.ativos.length === 1;
                      const asset = g.ativos[0];
                      const p = pecasDe(asset);
                      const aberto = abertos.has(g.chave);
                      return (
                        <li key={g.chave} data-testid={unico ? `row-asset-${asset.id}` : `row-group-${asset.id}`}
                          style={{ padding: "14px 14px 10px", borderBottom: i < gruposVisiveis.length - 1 ? `1px solid ${N.n3}` : "none", display: "flex", flexDirection: "column", gap: 10 }}>
                          {/* Toque no cartão abre o detalhe; o teclado tem o
                              botão Ver explícito logo abaixo, nas ações. */}
                          <div onClick={() => setVendo({ chave: g.chave, unidadeId: unico ? asset.id : null })} style={{ display: "flex", gap: 12, minWidth: 0, cursor: "pointer" }}>
                            {p.miniaturaEl}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {unico && <span style={{ fontFamily: FONT.mono, fontSize: FS.meta, fontWeight: FW.medio, color: T.accentText }}>{asset.displayId}</span>}
                              <div style={{ fontSize: FS.read, fontWeight: FW.forte, color: T.text, lineHeight: 1.3, overflowWrap: "anywhere" }}>{g.nome}</div>
                              {p.eventoEl}
                              {p.patrocinadoresEl}
                            </div>
                            <div style={{ flexShrink: 0 }}>{quantidadeDoGrupoEl(g)}</div>
                          </div>
                          {unico ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>{p.condicaoEl}{p.statusEl}{p.reservaEl}</div>
                          ) : (
                            <div style={{ fontSize: FS.body, color: T.text, lineHeight: 1.45 }}>
                              <div data-testid={`situacao-${asset.id}`} style={{ fontWeight: FW.medio }}>{fraseDaSituacao(g)}</div>
                              <div style={{ color: T.apoio }}>{fraseDaCondicao(g)}</div>
                            </div>
                          )}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ minWidth: 0 }}>{usadoEmEl(g)}</div>
                            <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>{unico ? p.acoesEl : <>{alternarEl(g, aberto)}{verGrupoEl(g)}</>}</div>
                          </div>
                          {!unico && aberto && (
                            <ul data-testid={`unidades-de-${asset.id}`} style={{ listStyle: "none", margin: 0, padding: "4px 0 0", borderTop: `1px dashed ${T.border}` }}>
                              {g.ativos.slice(0, LIMITE_DE_UNIDADES).map(u => {
                                const pu = pecasDe(u);
                                return (
                                  <li key={u.id} data-testid={`row-asset-${u.id}`} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "6px 0", borderBottom: `1px solid ${N.n2}` }}>
                                    <span style={{ fontFamily: FONT.mono, fontSize: FS.meta, fontWeight: FW.medio, color: T.accentText, flex: "1 1 120px" }}>{u.displayId}</span>
                                    {pu.condicaoEl}{pu.statusEl}
                                    <div style={{ marginLeft: "auto" }}>{pu.acoesEl}</div>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                );
              }

              return (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: compacto ? 720 : 900 }}>
                    <thead>
                      <tr style={{ background: T.dark }}>
                        {/* Entre 820 e 1180px de área útil "Onde já foi usado"
                            desce para dentro da célula do material: é a coluna
                            mais larga e a menos consultada, e era ela que
                            empurrava Ações para fora da tela. */}
                        {[
                          { label: "Material", align: "left" },
                          { label: "Quantidade", align: "left" },
                          { label: "Situação", align: "left" },
                          { label: "Condição", align: "left" },
                          ...(compacto ? [] : [{ label: "Onde já foi usado", align: "left" }]),
                          { label: "Ações", align: "right" },
                        ].map(({ label, align }) => (
                          <th key={label} scope="col" style={{ ...TH, textAlign: align as React.CSSProperties["textAlign"] }}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {gruposVisiveis.map(g => {
                        const unico = g.ativos.length === 1;
                        const asset = g.ativos[0];
                        const p = pecasDe(asset);
                        const aberto = abertos.has(g.chave);
                        return (
                          <Fragment key={g.chave}>
                            {/* Clique na linha abre o detalhe (atalho do mouse); o
                                teclado usa o botão Ver explícito da coluna Ações.
                                O realce de hover vem do CSS (tr.linha-estoque). */}
                            <tr data-testid={unico ? `row-asset-${asset.id}` : `row-group-${asset.id}`} className="group linha-estoque"
                              onClick={() => setVendo({ chave: g.chave, unidadeId: unico ? asset.id : null })}
                              style={{ transition: "background 0.12s", cursor: "pointer" }}>
                              <td style={{ ...TD, maxWidth: 320 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                                  {p.miniaturaEl}
                                  <div style={{ minWidth: 0 }}>
                                    <span style={{ display: "block", fontSize: FS.body, fontWeight: FW.forte, color: T.text, whiteSpace: "normal", overflowWrap: "anywhere", lineHeight: 1.3 }}>{g.nome}</span>
                                    <span style={{ fontFamily: FONT.mono, fontSize: FS.small, fontWeight: FW.medio, color: T.accentText }}>
                                      {asset.displayId}{!unico ? ` +${g.ativos.length - 1}` : ""}
                                    </span>
                                    {p.eventoEl}
                                    {p.patrocinadoresEl}
                                    {p.franquiasEl}
                                    {compacto && <div style={{ marginTop: 3 }}>{usadoEmEl(g)}</div>}
                                  </div>
                                </div>
                              </td>
                              <td style={TD}>{quantidadeDoGrupoEl(g)}</td>
                              <td style={TD}>
                                {unico ? <>{p.statusEl}{p.reservaEl}</> : <span data-testid={`situacao-${asset.id}`} style={{ fontSize: FS.body, fontWeight: FW.medio, color: T.text, lineHeight: 1.4 }}>{fraseDaSituacao(g)}</span>}
                              </td>
                              <td style={TD} onClick={e => { if (unico) e.stopPropagation(); }}>
                                {unico ? p.condicaoEl : <span data-testid={`condicao-${asset.id}`} style={{ fontSize: FS.body, color: T.strong }}>{fraseDaCondicao(g)}</span>}
                              </td>
                              {!compacto && <td style={TD}>{usadoEmEl(g)}</td>}
                              <td style={{ ...TD, textAlign: "right", paddingRight: 20 }}>
                                {unico ? p.acoesEl : <div className="row-actions" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>{alternarEl(g, aberto)}{verGrupoEl(g)}</div>}
                              </td>
                            </tr>
                            {!unico && aberto && g.ativos.slice(0, LIMITE_DE_UNIDADES).map(u => {
                              const pu = pecasDe(u);
                              return (
                                <tr key={u.id} data-testid={`row-asset-${u.id}`} className="group" style={{ background: T.bg }}>
                                  <td style={{ ...TD, paddingLeft: 75 }}><span style={{ fontFamily: FONT.mono, fontSize: FS.meta, fontWeight: FW.medio, color: T.accentText }}>{u.displayId}</span></td>
                                  <td style={TD}>{pu.quantidadeEl}</td>
                                  <td style={TD}>{pu.statusEl}{pu.reservaEl}</td>
                                  <td style={TD}>{pu.condicaoEl}</td>
                                  {!compacto && <td style={TD} />}
                                  <td style={{ ...TD, textAlign: "right", paddingRight: 20 }}>{pu.acoesEl}</td>
                                </tr>
                              );
                            })}
                            {!unico && aberto && g.ativos.length > LIMITE_DE_UNIDADES && (
                              <tr style={{ background: T.bg }}>
                                <td colSpan={compacto ? 5 : 6} style={{ ...TD, paddingLeft: 75, fontSize: FS.meta, color: T.apoio }}>
                                  Mostrando {LIMITE_DE_UNIDADES} de {g.ativos.length} unidades —{" "}
                                  {/* Link dentro da frase: nativo, sublinhado. */}
                                  <button type="button" onClick={() => setVendo({ chave: g.chave, unidadeId: null })} style={{ background: "none", border: "none", padding: 0, font: "inherit", fontWeight: FW.forte, color: T.text, textDecoration: "underline", cursor: "pointer" }}>ver todas no detalhe</button>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* Rodapé — "N de M" comparava conjuntos diferentes (o M excluía
                descartados) e produzia "12 de 8". Agora: total exibido +
                quantos registros os filtros estão ocultando. */}
            <div style={{ padding: isMobile ? "12px 14px" : "14px 24px", background: T.bg, borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              {(() => {
                const baseline = acervoAssets.filter(a => filterStatus.length > 0 || a.trackingStatus !== "DESCARTADO").length;
                const ocultos = Math.max(0, baseline - filtered.length);
                // eFacetPool não aplica a busca — ela entra aqui com o MESMO
                // casamento da lista (nome, ID, local, franquia).
                const q = search.toLowerCase();
                const descartadosNoRecorte = filterStatus.length === 0
                  ? eFacetPool("status").filter(a => a.trackingStatus === "DESCARTADO"
                      && (!q || a.name.toLowerCase().includes(q) || a.displayId.toLowerCase().includes(q) || a.franchiseTags.some(t => t.toLowerCase().includes(q)))).length
                  : 0;
                return (
                  <p role="status" style={{ margin: 0, fontSize: FS.meta, fontWeight: FW.corpo, fontFamily: FONT.corpo, color: T.second }}>
                    <span data-testid="contador-da-lista"><span style={{ color: T.text, fontWeight: FW.forte, fontFamily: FONT.display }}>{gruposVisiveis.length < grupos.length ? `${gruposVisiveis.length} de ${grupos.length}` : grupos.length}</span> {grupos.length === 1 ? "material" : "materiais"} · <span style={{ color: T.text, fontWeight: FW.forte, fontFamily: FONT.display }}>{unidadesNoRecorte}</span> {unidadesNoRecorte === 1 ? "unidade" : "unidades"}</span>
                    {ocultos > 0 && <span> ({ocultos} {ocultos === 1 ? "oculto" : "ocultos"} pelos filtros)</span>}
                    {/* "Cadê a peça descartada?" — ela some por padrão e só
                        voltava para quem adivinhasse o filtro. */}
                    {/* Conta o que o CLIQUE traz (os outros filtros continuam
                        valendo), não o total de descartados do acervo. */}
                    {filterStatus.length === 0 && descartadosNoRecorte > 0 && (
                      <>
                        {" · "}
                        <button type="button" data-testid="button-ver-descartados-rodape" onClick={() => setFilterStatus(["DESCARTADO"])}
                          style={{ background: "none", border: "none", padding: 0, minHeight: isMobile ? 32 : undefined, font: "inherit", fontWeight: FW.forte, color: T.text, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer" }}>
                          {descartadosNoRecorte} {descartadosNoRecorte === 1 ? "descartado oculto" : "descartados ocultos"} · ver
                        </button>
                      </>
                    )}
                  </p>
                );
              })()}
              {grupos.length > gruposVisiveis.length && (
                <Botao variante="secundario" tamanho="toque" icone={ChevronDown} larguraCheia={isMobile}
                  data-testid="mostrar-mais-estoque" onClick={() => setMostrando(n => n + LOTE_DO_ESTOQUE)}
                  style={{ fontSize: FS.body }}>
                  Mostrar mais {Math.min(LOTE_DO_ESTOQUE, grupos.length - gruposVisiveis.length)}
                </Botao>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Ícones de ação: base 0.7, revelação por hover OU foco de teclado na
          linha (.group é a classe realmente aplicada no <tr>). O wrapper
          .event-filter-44 iguala o trigger do EventFilterDropdown aos demais
          filtros (44px de altura e largura total). */}
      <style>{`
        tr.group .row-actions { opacity: 0.7; }
        tr.group:hover .row-actions, tr.group:focus-within .row-actions { opacity: 1; }
        tr.linha-estoque:hover { background-color: var(--n1); }
        .event-filter-44 > div { width: 100%; }
        .event-filter-44 > div > button { height: 44px !important; width: 100%; }
      `}</style>

      {editing !== false && (
        <AssetModal asset={editing} reserva={editing ? reservaPorAtivo.get(editing.id) : undefined} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
      )}
      {deleting && (
        <DeleteModal asset={deleting} reserva={reservaPorAtivo.get(deleting.id)} onClose={() => setDeleting(null)} onConfirm={() => deleteMutation.mutate(deleting.id)} isPending={deleteMutation.isPending} />
      )}
      {vendo && grupoVendo && (
        <DetalheDoAtivo
          grupo={grupoVendo}
          unidade={vendo.unidadeId ? grupoVendo.ativos.find(a => a.id === vendo.unidadeId) ?? null : null}
          linkedItem={origemDoDetalhe ? pecaDeOrigem ?? undefined : undefined}
          sponsors={sponsors}
          reservaPorAtivo={reservaPorAtivo}
          usosPorAtivo={usosPorAtivo}
          podeEditar={podeEditar}
          onClose={() => setVendo(null)}
          onEditar={a => { setVendo(null); setEditing(a); }}
          onAbrirUnidade={a => setVendo({ chave: vendo.chave, unidadeId: a?.id ?? null })}
        />
      )}
    </div>
  );
}
