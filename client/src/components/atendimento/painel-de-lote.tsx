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
import { FS, FW, R, T, N, TOM, FONT } from "@/lib/theme";
import { letra } from "./estilos";
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
          style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg }}
        >
          <Eye style={{ width: 16, height: 16, color: T.second, flexShrink: 0 }} />
          <p style={{ fontSize: letra(FS.body, isMobile), fontWeight: FW.medio, color: T.apoio, margin: 0 }}>
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
          className="atd-cabeca-do-grupo"
          style={{
            width: '100%', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12,
            minHeight: 56, padding: cards ? '10px 14px' : '12px 18px', backgroundColor: T.surface, border: `1px solid ${T.border}`,
            borderRadius: R.lg, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
          }}
        >
          {/* Ladrilho NEUTRO. O gradiente laranja virou tinta numa rodada
              anterior; tinta ainda era o segundo bloco mais escuro da tela,
              logo acima do "Decidir em fila" — que é a ação do dia. Um atalho
              recolhido não pode pesar mais que ela. */}
          <div aria-hidden="true" style={{ width: 30, height: 30, borderRadius: R.md, backgroundColor: N.n2, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Zap style={{ width: 14, height: 14, color: T.apoio }} />
          </div>
          {/* No celular a contagem desce para baixo do título: numa linha só
              ela virava "— 4 patrocinadore…". */}
          <span style={{ display: 'flex', flexDirection: cards ? 'column' : 'row', alignItems: cards ? 'flex-start' : 'baseline', gap: cards ? 2 : 8, minWidth: 0 }}>
            <span style={{ fontFamily: FONT.display, fontSize: 15, fontWeight: FW.forte, letterSpacing: '-0.01em', color: T.text, whiteSpace: 'nowrap' }}>
              Aprovação em lote
            </span>
            <span style={{ fontSize: letra(FS.body, isMobile), color: T.second, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {cards ? '' : '— '}{batchEligibleSponsors.length} {batchEligibleSponsors.length === 1 ? 'patrocinador com pendências' : 'patrocinadores com pendências'}
            </span>
          </span>
          <ChevronRight aria-hidden="true" style={{ width: 16, height: 16, color: T.second, marginLeft: 'auto', flexShrink: 0 }} />
        </button>
      )}
      {!loadingSponsors && batchEligibleSponsors.length > 0 && canDecide && batchPanelOpen && (
        <section
          data-testid="section-batch-sponsor"
          className="atd-entrar"
          style={{ marginBottom: 16, backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: 'hidden' }}
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
            className="atd-cabeca-do-grupo"
            style={{ backgroundColor: T.surface, borderBottom: `1px solid ${T.border}`, padding: cards ? '12px 14px' : '12px 18px', minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: cards ? 10 : 16, flexWrap: cards ? 'wrap' : 'nowrap', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* O MESMO ladrilho neutro da barra recolhida: abrir o painel
                  não pode trocar o desenho do que se clicou. */}
              <div aria-hidden="true" style={{ width: 30, height: 30, borderRadius: R.md, backgroundColor: N.n2, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Zap style={{ width: 14, height: 14, color: T.apoio }} />
              </div>
              <div>
                <h3 style={{ fontFamily: FONT.display, fontSize: 15, fontWeight: FW.forte, letterSpacing: '-0.01em', margin: 0, color: T.text }}>
                  Aprovação em lote
                </h3>
                <p style={{ color: T.second, fontSize: letra(FS.meta, isMobile), margin: 0 }}>
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
                      fontSize: letra(FS.small, isMobile), fontWeight: FW.forte, whiteSpace: 'nowrap',
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
              <ChevronDown aria-hidden="true" style={{ width: 16, height: 16, color: T.second, marginLeft: 10, flexShrink: 0, transform: 'rotate(180deg)' }} />
            </div>
          </div>

          <div style={{ padding: cards ? '16px 14px' : '20px 24px', background: T.bg }}>
            {/* ── Seletores: Patrocinador + Evento — usando FilterSelect idêntico aos filtros do topo ── */}
            <div style={{ display: cards ? 'grid' : 'flex', gridTemplateColumns: '1fr', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
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
                fullWidth={cards}
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
                fullWidth={cards}
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10, padding: '4px 14px', minHeight: 44, backgroundColor: T.surface, borderRadius: R.md, border: `1px solid ${T.border}` }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 36, fontSize: letra(FS.body, isMobile), fontWeight: FW.forte, color: T.text, cursor: 'pointer', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={batchSelectedItemIds.size === batchItemCount && batchItemCount > 0}
                        onChange={e => {
                          if (e.target.checked) setBatchSelectedItemIds(new Set(batchEligibleItems.map((i) => i.id)));
                          else setBatchSelectedItemIds(new Set());
                        }}
                        style={{ accentColor: T.accentText, width: 18, height: 18, cursor: 'pointer' }}
                      />
                      Selecionar todos
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {batchEligibleItems.filter((i) => !i.approvalThumbUrl).length > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: letra(FS.small, isMobile), color: TOM.alerta.text, fontWeight: FW.medio, background: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: R.pill, padding: '2px 10px' }}>
                          <AlertCircle style={{ width: 11, height: 11 }} />
                          {batchEligibleItems.filter((i) => !i.approvalThumbUrl).length} sem arte
                        </span>
                      )}
                      <span style={{ fontSize: letra(FS.body, isMobile), fontWeight: FW.forte, color: batchSelectedItemIds.size > 0 ? T.accentText : T.second, fontVariantNumeric: 'tabular-nums' }}>
                        {batchSelectedItemIds.size} / {batchItemCount} selecionadas
                      </span>
                    </div>
                  </div>

                  {/* Lista de itens */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, maxHeight: 340, overflowY: 'auto', paddingRight: 2 }}>
                    {batchEligibleItems.map((item) => (
                      <LinhaDoLote
                        key={item.id}
                        item={item}
                        batchSelectedItemIds={batchSelectedItemIds}
                        setBatchSelectedItemIds={setBatchSelectedItemIds}
                        setBatchPreviewItem={setBatchPreviewItem}
                        toque={isMobile}
                      />
                    ))}
                  </div>

                  {/* ── Ações ── */}
                  {!batchShowRejectForm ? (
                    <div style={{ display: 'flex', alignItems: cards ? 'stretch' : 'center', flexDirection: cards ? 'column' : 'row', justifyContent: 'space-between', padding: '12px 14px', background: T.surface, borderRadius: R.lg, border: `1px solid ${T.border}`, gap: cards ? 10 : 12 }}>
                      <p style={{ fontSize: letra(FS.body, isMobile), color: T.second, margin: 0 }}>
                        {batchSelectedItemIds.size > 0
                          ? <><strong style={{ color: T.text }}>{batchSelectedItemIds.size} {batchSelectedItemIds.size === 1 ? 'peça' : 'peças'}</strong> prontas para decisão</>
                          : 'Selecione peças para aprovar ou reprovar'}
                      </p>
                      <div style={{ display: 'flex', gap: 8, flexDirection: cards ? 'column-reverse' : 'row' }}>
                        {/* "Reprovar", não "Recusar": é a palavra do modal de
                            decisão, do placar e do toast desta mesma ação — o
                            lote era o único lugar da tela que dizia "recusa".
                            Secundário, não perigo: ele só ABRE o campo do
                            motivo; quem reprova é o botão de lá. */}
                        <Botao
                          variante="perigoSecundario"
                          tamanho={tamBotao}
                          larguraCheia={cards}
                          icone={XCircle}
                          onClick={() => setBatchShowRejectForm(true)}
                          disabled={batchSponsorMutation.isPending || batchSelectedItemIds.size === 0 || !canDecide}
                          title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : undefined}
                          data-testid="button-batch-reject"
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
                    <div className="atd-entrar" style={{ backgroundColor: TOM.perigo.bg, border: `1px solid ${TOM.perigo.border}`, borderRadius: R.lg, padding: cards ? '14px' : '16px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                        <div aria-hidden="true" style={{ width: 32, height: 32, borderRadius: R.md, background: T.surface, border: `1px solid ${TOM.perigo.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <XCircle style={{ width: 16, height: 16, color: TOM.perigo.text }} />
                        </div>
                        <div>
                          {/* PARA QUEM, no título (rodada 4) — e #b91c1c no
                              texto: #dc2626 fica abaixo de AA sobre o rosa. */}
                          <p style={{ fontSize: letra(FS.read, isMobile), fontWeight: FW.forte, color: TOM.perigo.text, margin: 0 }}>Reprovar {batchSelectedItemIds.size} {batchSelectedItemIds.size === 1 ? 'peça' : 'peças'} para {batchSponsorNome}</p>
                          <p style={{ fontSize: letra(FS.meta, isMobile), color: TOM.perigo.text, margin: '2px 0 0', lineHeight: 1.45 }}>O mesmo motivo vai para todas; a Arte refaz e {batchSponsorNome} e os patrocinadores com aprovação estrita esperam a nova versão</p>
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
                          border: `1px solid ${motivoCurto(batchRejectReason) ? T.bdark : TOM.perigo.text}`,
                          color: T.text, borderRadius: R.md, padding: '10px 12px', minHeight: 88, fontFamily: 'inherit',
                          fontSize: isMobile ? FS.lead : FS.body, resize: 'vertical',
                          boxSizing: 'border-box', lineHeight: 1.5,
                        }}
                      />
                      {/* Quanto falta, à vista — a régua só existia no `title`
                          do botão (hover, só no desktop). Mesma frase do motivo
                          individual no modal de decisão. */}
                      <p id="falta-motivo-lote" style={{ margin: '6px 0 0', fontSize: letra(11.5, isMobile), color: motivoCurto(batchRejectReason) ? T.second : T.apoio }}>
                        {motivoCurto(batchRejectReason)
                          ? (batchRejectReason.trim()
                              ? `Faltam ${Math.max(0, MOTIVO_MIN - batchRejectReason.trim().replace(/\s+/g, " ").length)} caracteres — a Arte precisa saber o que refazer.`
                              : `Mínimo de ${MOTIVO_MIN} caracteres — a Arte precisa saber o que refazer.`)
                          : <>Pronto. <kbd style={KBD}>Ctrl</kbd>+<kbd style={KBD}>Enter</kbd> confirma.</>}
                      </p>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end', flexWrap: 'wrap', flexDirection: cards ? 'column-reverse' : 'row' }}>
                        <Botao
                          variante="fantasma"
                          tamanho={tamBotao}
                          larguraCheia={cards}
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
                          larguraCheia={cards}
                        >
                          Reprovar e devolver à Arte
                        </Botao>
                      </div>
                    </div>
                  )}
                </>
              )
            ) : (
              /* ORIENTAÇÃO, não alarme: era um bloco laranja com o texto de
                 apoio a 80% de opacidade (abaixo de AA). Superfície neutra, o
                 número do passo que falta, o texto em cinza legível. */
              <div data-testid="lote-orientacao" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: cards ? '14px' : '16px 18px', backgroundColor: T.surface, borderRadius: R.lg, border: `1px dashed ${T.bdark}` }}>
                <div aria-hidden="true" style={{ width: 34, height: 34, borderRadius: R.md, backgroundColor: TOM.laranja.bg, border: `1px solid ${TOM.laranja.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: FONT.display, fontWeight: FW.forte, fontSize: 15, color: T.accentText }}>
                  {batchSponsorId ? 2 : 1}
                </div>
                <div>
                  <p style={{ fontSize: FS.strong, fontWeight: FW.forte, color: T.text, margin: '0 0 2px' }}>
                    {batchSponsorId ? 'Selecione o evento' : 'Selecione o patrocinador'}
                  </p>
                  <p style={{ fontSize: letra(FS.body, isMobile), color: T.second, margin: 0, lineHeight: 1.5 }}>
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
