// ─────────────────────────────────────────────────────────────────────────────
// PAINEL DE LOTE — aprovar ou reprovar várias peças de um patrocinador num
// evento, de uma vez.
//
// Sem papel de decisão, o painel vira uma faixa informativa: os controles de
// lote não fariam nada além de devolver 403. Com papel, nasce recolhido numa
// barra de uma linha; expande no clique e a escolha persiste na sessão.
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment, type Dispatch, type SetStateAction } from "react";
import { AlertCircle, Check, CheckCircle, ChevronDown, ChevronRight, Eye, XCircle, Zap } from "lucide-react";
import { FilterSelect } from "@/components/filter-select";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/estados";
import { FS, T, N, TOM, FONT } from "@/lib/theme";
import { KBD, MOTIVO_MIN, motivoCurto } from "./regras";
import { LinhaDoLote } from "./linha-do-lote";
import type { AcoesDoAtendimento } from "./use-atendimento-acoes";
import type { EventoAtendimento, Patrocinador, PecaAtendimento, TamanhoDoBotao } from "./tipos";

export function PainelDeLote({
  loadingSponsors, batchEligibleSponsors, canDecide, batchPanelOpen, setBatchPanelOpen, cards, isMobile, tamBotao,
  batchSponsorId, setBatchSponsorId, batchEventId, setBatchEventId, batchEligibleEvents, batchEligibleItems, batchItemCount,
  batchSelectedItemIds, setBatchSelectedItemIds, batchShowRejectForm, setBatchShowRejectForm,
  batchRejectReason, setBatchRejectReason, batchSponsorNome, setBatchPreviewItem, setConfirmApproveBatch, batchSponsorMutation,
}: {
  loadingSponsors: boolean;
  batchEligibleSponsors: Patrocinador[];
  canDecide: boolean;
  batchPanelOpen: boolean;
  setBatchPanelOpen: Dispatch<SetStateAction<boolean>>;
  cards: boolean;
  isMobile: boolean;
  tamBotao: TamanhoDoBotao;
  batchSponsorId: string;
  setBatchSponsorId: Dispatch<SetStateAction<string>>;
  batchEventId: string;
  setBatchEventId: Dispatch<SetStateAction<string>>;
  batchEligibleEvents: EventoAtendimento[];
  batchEligibleItems: PecaAtendimento[];
  batchItemCount: number;
  batchSelectedItemIds: Set<string>;
  setBatchSelectedItemIds: Dispatch<SetStateAction<Set<string>>>;
  batchShowRejectForm: boolean;
  setBatchShowRejectForm: Dispatch<SetStateAction<boolean>>;
  batchRejectReason: string;
  setBatchRejectReason: Dispatch<SetStateAction<string>>;
  batchSponsorNome: string;
  setBatchPreviewItem: Dispatch<SetStateAction<PecaAtendimento | null>>;
  setConfirmApproveBatch: Dispatch<SetStateAction<boolean>>;
  batchSponsorMutation: AcoesDoAtendimento["batchSponsorMutation"];
}) {
  return (
    <>
      {!loadingSponsors && batchEligibleSponsors.length > 0 && !canDecide && (
        <section
          data-testid="section-batch-readonly"
          style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: 12 }}
        >
          <Eye style={{ width: 16, height: 16, color: T.second, flexShrink: 0 }} />
          <p style={{ fontSize: 13, fontWeight: 600, color: T.apoio, margin: 0 }}>
            Somente leitura — as decisões de aprovação são do Atendimento.
          </p>
        </section>
      )}
      {/* Colapsado por padrão: uma barra de 1 linha; expande no clique e a
          escolha persiste na sessão. */}
      {!loadingSponsors && batchEligibleSponsors.length > 0 && canDecide && !batchPanelOpen && (
        <button
          onClick={() => setBatchPanelOpen(true)}
          aria-expanded={false}
          data-testid="button-batch-panel-expand"
          style={{
            width: '100%', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 18px', backgroundColor: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 12, cursor: 'pointer', textAlign: 'left',
          }}
        >
          {/* Ladrilho NEUTRO. O gradiente laranja virou tinta numa rodada
              anterior; tinta ainda era o segundo bloco mais escuro da tela,
              logo acima do "Decidir em fila" — que é a ação do dia. Um atalho
              recolhido não pode pesar mais que ela. */}
          <div style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: N.n2, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Zap aria-hidden="true" style={{ width: 14, height: 14, color: T.apoio }} />
          </div>
          <span style={{ fontFamily: FONT.display, fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em', color: T.text, whiteSpace: 'nowrap' }}>
            Aprovação em lote
          </span>
          <span style={{ fontSize: 13, color: T.second, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            — {batchEligibleSponsors.length} {batchEligibleSponsors.length === 1 ? 'patrocinador com pendências' : 'patrocinadores com pendências'}
          </span>
          <ChevronRight style={{ width: 16, height: 16, color: T.muted, marginLeft: 'auto', flexShrink: 0 }} />
        </button>
      )}
      {!loadingSponsors && batchEligibleSponsors.length > 0 && canDecide && batchPanelOpen && (
        <section
          data-testid="section-batch-sponsor"
          style={{ marginBottom: 20, backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 12 }}
        >
          {/* ── Header do painel — clique recolhe de volta para a barra ── */}
          <div
            role="button"
            tabIndex={0}
            aria-expanded={true}
            title="Recolher painel de lote"
            onClick={() => setBatchPanelOpen(false)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setBatchPanelOpen(false);
              }
            }}
            data-testid="button-batch-panel-collapse"
            /* FAIXA CLARA. O cabeçalho era um bloco quase preto com gradiente,
               um ladrilho laranja com sombra colorida e três bolinhas — a coisa
               mais pesada da página, para um painel auxiliar que fica ACIMA da
               lista de peças que a tela existe para mostrar. */
            style={{ backgroundColor: T.bg, borderBottom: `1px solid ${T.border}`, padding: cards ? '14px 16px' : '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderRadius: '12px 12px 0 0', flexWrap: cards ? 'wrap' : 'nowrap', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Zap style={{ width: 14, height: 14, color: T.surface }} />
              </div>
              <div>
                <h3 style={{ fontFamily: FONT.display, fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', margin: 0, color: T.text }}>
                  Aprovação em lote
                </h3>
                <p style={{ color: T.second, fontSize: 12, margin: 0 }}>
                  {batchEligibleSponsors.length} {batchEligibleSponsors.length === 1 ? 'patrocinador com' : 'patrocinadores com'} itens pendentes
                </p>
              </div>
            </div>
            {/* Indicador de progresso */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {[
                { n: 1, label: 'Patrocinador', done: !!batchSponsorId },
                { n: 2, label: 'Evento', done: !!batchEventId },
                { n: 3, label: 'Revisão', done: batchItemCount > 0 && !!batchEventId },
              ].map((step, idx) => {
                const active = idx === 0 ? !batchSponsorId : idx === 1 ? !!batchSponsorId && !batchEventId : !!batchSponsorId && !!batchEventId;
                return (
                  <Fragment key={step.n}>
                    {/* Pílula, e não bolinha + texto solto: o passo é UMA coisa
                        (número, nome e estado) e era desenhado como duas. */}
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      height: 24, padding: '0 9px', borderRadius: 999,
                      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                      backgroundColor: step.done ? TOM.sucesso.bg : active ? TOM.laranja.bg : N.n2,
                      color: step.done ? TOM.sucesso.text : active ? T.accentText : T.second,
                    }}>
                      {step.done
                        ? <Check aria-hidden="true" style={{ width: 11, height: 11, flexShrink: 0 }} />
                        : <span style={{ fontVariantNumeric: 'tabular-nums' }}>{step.n}</span>}
                      {step.label}
                    </span>
                    {idx < 2 && <div style={{ width: 16, height: 1, background: step.done ? TOM.sucesso.border : T.border }} />}
                  </Fragment>
                );
              })}
              <ChevronDown style={{ width: 16, height: 16, color: T.second, marginLeft: 10, flexShrink: 0 }} />
            </div>
          </div>

          <div style={{ padding: cards ? '16px 14px' : '20px 28px', background: T.bg }}>
            {/* ── Seletores: Patrocinador + Evento — usando FilterSelect idêntico aos filtros do topo ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
              <FilterSelect
                label="Patrocinador"
                allLabel="Patrocinador..."
                value={batchSponsorId || "all"}
                onChange={v => {
                  const next = v === "all" ? "" : v;
                  setBatchSponsorId(next);
                  setBatchEventId("");
                  setBatchShowRejectForm(false);
                  setBatchRejectReason("");
                }}
                options={[...batchEligibleSponsors]
                  .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
                  .map((s) => ({ value: s.id, label: s.name, dotColor: s.color || T.muted }))}
                searchPlaceholder="Buscar patrocinador..."
                emptyText="Nenhum patrocinador encontrado."
                hideWhenEmpty={false}
                showAllLabelWhenEmpty
                testId="select-batch-sponsor"
                panelWidth={280}
                hideClear
              />
              <FilterSelect
                label="Evento"
                allLabel={batchSponsorId
                  ? (batchEligibleEvents.length > 0 ? `${batchEligibleEvents.length} evento${batchEligibleEvents.length !== 1 ? 's' : ''} disponível${batchEligibleEvents.length !== 1 ? 'is' : ''}` : 'Nenhum evento')
                  : 'Selecione o patrocinador antes'}
                value={batchEventId || "all"}
                onChange={v => {
                  const next = v === "all" ? "" : v;
                  setBatchEventId(next);
                  setBatchShowRejectForm(false);
                  setBatchRejectReason("");
                }}
                options={batchEligibleEvents.map((ev) => ({ value: ev.id, label: ev.name }))}
                searchPlaceholder="Buscar evento..."
                emptyText="Nenhum evento encontrado."
                hideWhenEmpty={false}
                showAllLabelWhenEmpty
                disabled={!batchSponsorId}
                testId="select-batch-event"
                panelWidth={300}
                hideClear
              />
            </div>

            {/* ── Área de itens ── */}
            {batchSponsorId && batchEventId ? (
              batchItemCount === 0 ? (
                <EstadoVazio
                  compacto
                  icone={CheckCircle}
                  titulo="Tudo aprovado"
                  descricao="Nenhuma peça pendente para esta combinação"
                />
              ) : (
                <>
                  {/* Barra de seleção + contadores */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '10px 14px', backgroundColor: T.bg, borderRadius: 8, border: `1px solid ${N.n3}` }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 700, color: T.text, cursor: 'pointer', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={batchSelectedItemIds.size === batchItemCount && batchItemCount > 0}
                        onChange={e => {
                          if (e.target.checked) setBatchSelectedItemIds(new Set(batchEligibleItems.map((i) => i.id)));
                          else setBatchSelectedItemIds(new Set());
                        }}
                        style={{ accentColor: T.accentText, width: 15, height: 15, cursor: 'pointer' }}
                      />
                      Selecionar todos
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {batchEligibleItems.filter((i) => !i.approvalThumbUrl).length > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: TOM.alerta.text, fontWeight: 600, background: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: 999, padding: '2px 10px' }}>
                          <AlertCircle style={{ width: 11, height: 11 }} />
                          {batchEligibleItems.filter((i) => !i.approvalThumbUrl).length} sem arte
                        </span>
                      )}
                      <span style={{ fontSize: 13, fontWeight: 700, color: batchSelectedItemIds.size > 0 ? T.accentText : T.second }}>
                        {batchSelectedItemIds.size} / {batchItemCount} selecionadas
                      </span>
                    </div>
                  </div>

                  {/* Lista de itens */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20, maxHeight: 340, overflowY: 'auto', paddingRight: 2 }}>
                    {batchEligibleItems.map((item) => (
                      <LinhaDoLote
                        key={item.id}
                        item={item}
                        batchSelectedItemIds={batchSelectedItemIds}
                        setBatchSelectedItemIds={setBatchSelectedItemIds}
                        setBatchPreviewItem={setBatchPreviewItem}
                      />
                    ))}
                  </div>

                  {/* ── Ações ── */}
                  {!batchShowRejectForm ? (
                    <div style={{ display: 'flex', alignItems: cards ? 'stretch' : 'center', flexDirection: cards ? 'column' : 'row', justifyContent: 'space-between', padding: '14px 16px', background: T.bg, borderRadius: 12, border: `1px solid ${N.n3}`, gap: cards ? 10 : 0 }}>
                      <p style={{ fontSize: 13, color: T.second, margin: 0 }}>
                        {batchSelectedItemIds.size > 0
                          ? <><strong style={{ color: T.text }}>{batchSelectedItemIds.size} {batchSelectedItemIds.size === 1 ? 'peça' : 'peças'}</strong> prontas para decisão</>
                          : 'Selecione peças para aprovar ou reprovar'}
                      </p>
                      <div style={{ display: 'flex', gap: 10, flexDirection: cards ? 'column' : 'row' }}>
                        {/* "Reprovar", não "Recusar": é a palavra do modal de
                            decisão, do placar e do toast desta mesma ação — o
                            lote era o único lugar da tela que dizia "recusa".
                            Secundário, não perigo: ele só ABRE o campo do
                            motivo; quem reprova é o botão de lá. */}
                        <Botao
                          variante="secundario"
                          tamanho={tamBotao}
                          larguraCheia={cards}
                          icone={XCircle}
                          onClick={() => setBatchShowRejectForm(true)}
                          disabled={batchSponsorMutation.isPending || batchSelectedItemIds.size === 0 || !canDecide}
                          title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : undefined}
                          data-testid="button-batch-reject"
                          style={{ color: TOM.perigo.text, border: `1px solid ${TOM.perigo.border}` }}
                        >
                          Reprovar
                        </Botao>
                        {/* TINTA, não verde: nesta tela verde é o ESTADO
                            'aprovado', o que a peça vira depois. Pintar de verde
                            o botão que ainda vai decidir usa a cor do resultado
                            para o pedido. O motivo de estar travado fica à
                            vista (sem papel de decisão / nada selecionado). */}
                        <Botao
                          variante="primario"
                          tamanho={tamBotao}
                          larguraCheia={cards}
                          icone={CheckCircle}
                          carregando={batchSponsorMutation.isPending}
                          onClick={() => setConfirmApproveBatch(true)}
                          disabled={batchSelectedItemIds.size === 0 || !canDecide}
                          motivo={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : undefined}
                          alinharMotivo="end"
                          title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : undefined}
                          data-testid="button-batch-approve"
                        >
                          Aprovar {batchSelectedItemIds.size > 0 ? `${batchSelectedItemIds.size} ${batchSelectedItemIds.size === 1 ? 'peça' : 'peças'}` : ''}
                        </Botao>
                      </div>
                    </div>
                  ) : (
                    <div style={{ backgroundColor: TOM.perigo.bg, border: `1.5px solid ${TOM.perigo.border}`, borderRadius: 12, padding: '18px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: TOM.perigo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <XCircle style={{ width: 16, height: 16, color: TOM.perigo.text }} />
                        </div>
                        <div>
                          {/* PARA QUEM, no título (rodada 4) — e #b91c1c no
                              texto: #dc2626 fica abaixo de AA sobre o rosa. */}
                          <p style={{ fontSize: 13, fontWeight: 800, color: TOM.perigo.text, margin: 0 }}>Reprovar {batchSelectedItemIds.size} {batchSelectedItemIds.size === 1 ? 'peça' : 'peças'} para {batchSponsorNome}</p>
                          <p style={{ fontSize: 11, color: TOM.perigo.text, margin: 0 }}>O mesmo motivo vai para todas; a Arte refaz e {batchSponsorNome} e os patrocinadores com aprovação estrita esperam a nova versão</p>
                        </div>
                      </div>
                      {/* autoFocus: quem clicou "Reprovar" vai escrever o motivo —
                          sem o foco ali era um segundo clique obrigatório.
                          Ctrl+Enter confirma pela MESMA trava do botão (mínimo de
                          caracteres, mutação em curso, papel), como nos motivos
                          da Revisão e do Vincular. */}
                      <textarea
                        autoFocus
                        value={batchRejectReason}
                        onChange={e => setBatchRejectReason(e.target.value)}
                        onKeyDown={e => {
                          if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
                          e.preventDefault();
                          if (batchSponsorMutation.isPending || motivoCurto(batchRejectReason) || !canDecide) return;
                          batchSponsorMutation.mutate({ sponsorId: batchSponsorId, eventId: batchEventId, action: "reject", reason: batchRejectReason });
                        }}
                        placeholder="Descreva o que a Arte precisa refazer…"
                        data-testid="textarea-batch-reject-reason"
                        aria-label={`Motivo da reprovação das ${batchSelectedItemIds.size} peças selecionadas`}
                        aria-required="true"
                        aria-describedby="falta-motivo-lote"
                        rows={3}
                        style={{
                          width: '100%', backgroundColor: T.surface,
                          border: `1.5px solid ${motivoCurto(batchRejectReason) ? T.border : TOM.perigo.text}`,
                          color: T.text, borderRadius: 8, padding: '10px 12px',
                          fontSize: isMobile ? FS.lead : FS.body, resize: 'vertical',
                          boxSizing: 'border-box', lineHeight: 1.5,
                        }}
                      />
                      {/* Quanto falta, à vista — a régua só existia no `title`
                          do botão (hover, só no desktop). Mesma frase do motivo
                          individual no modal de decisão. */}
                      <p id="falta-motivo-lote" style={{ margin: '5px 0 0', fontSize: 11.5, color: motivoCurto(batchRejectReason) ? T.second : T.apoio }}>
                        {motivoCurto(batchRejectReason)
                          ? (batchRejectReason.trim()
                              ? `Faltam ${Math.max(0, MOTIVO_MIN - batchRejectReason.trim().replace(/\s+/g, " ").length)} caracteres — a Arte precisa saber o que refazer.`
                              : `Mínimo de ${MOTIVO_MIN} caracteres — a Arte precisa saber o que refazer.`)
                          : <>Pronto. <kbd style={KBD}>Ctrl</kbd>+<kbd style={KBD}>Enter</kbd> confirma.</>}
                      </p>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <Botao
                          variante="fantasma"
                          tamanho={tamBotao}
                          onClick={() => { setBatchShowRejectForm(false); setBatchRejectReason(""); }}
                        >
                          Cancelar
                        </Botao>
                        {/* Perigo: devolve as peças à Arte. Travado pela MESMA
                            régua do Ctrl+Enter (motivoCurto); o quanto falta já
                            está escrito logo acima, à vista. */}
                        <Botao
                          variante="perigo"
                          tamanho={tamBotao}
                          icone={XCircle}
                          carregando={batchSponsorMutation.isPending}
                          onClick={() => batchSponsorMutation.mutate({ sponsorId: batchSponsorId, eventId: batchEventId, action: "reject", reason: batchRejectReason })}
                          disabled={motivoCurto(batchRejectReason) || !canDecide}
                          title={!canDecide ? "Somente Atendimento e administradores decidem aprovações"
                            : motivoCurto(batchRejectReason) ? `Explique em pelo menos ${MOTIVO_MIN} caracteres — a Arte precisa saber o que refazer.` : undefined}
                          data-testid="button-batch-confirm-reject"
                        >
                          Reprovar e devolver à Arte
                        </Botao>
                      </div>
                    </div>
                  )}
                </>
              )
            ) : (
              /* Estado vazio — orientação de uso */
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '20px 24px', backgroundColor: TOM.laranja.bg, borderRadius: 12, border: `1px solid ${TOM.laranja.border}` }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: T.surface, border: `1px solid ${TOM.laranja.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Zap aria-hidden="true" style={{ width: 16, height: 16, color: T.accentText }} />
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: T.accentText, margin: '0 0 3px' }}>
                    {batchSponsorId ? 'Selecione o evento' : 'Selecione o patrocinador'}
                  </p>
                  <p style={{ fontSize: 13, color: T.accentText, margin: 0, lineHeight: 1.5, opacity: 0.8 }}>
                    {batchSponsorId
                      ? `${batchEligibleEvents.length} evento${batchEligibleEvents.length !== 1 ? 's' : ''} com peças pendentes para o patrocinador selecionado.`
                      : `${batchEligibleSponsors.length} patrocinador${batchEligibleSponsors.length !== 1 ? 'es' : ''} aguardam decisão — escolha um para iniciar o lote.`}
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
