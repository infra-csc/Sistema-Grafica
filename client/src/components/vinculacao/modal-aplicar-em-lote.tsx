// ─────────────────────────────────────────────────────────────────────────────
// APLICAR PATROCINADORES EM LOTE — soma os escolhidos aos vínculos de cada
// peça selecionada (ou marca "sem patrocinador", que os remove). Só oferece
// patrocinadores dos eventos das peças selecionadas.
// ─────────────────────────────────────────────────────────────────────────────
import { CheckCircle2, Info, Search, Users, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/estados";
import { alvo } from "@/hooks/use-mobile";
import { TOM, T, R, FS, FW } from "@/lib/theme";
import type { PatrocinadorDaVinculacao, PecaDaVinculacao } from "./tipos";

type Props = {
  bulkApplyDialogOpen: boolean;
  setBulkApplyDialogOpen: (aberto: boolean) => void;
  bulkSponsorSearch: string;
  setBulkSponsorSearch: (busca: string) => void;
  bulkSelectedSponsors: string[];
  setBulkSelectedSponsors: (ids: string[]) => void;
  bulkSkipApproval: boolean;
  setBulkSkipApproval: (marcado: boolean) => void;
  toggleBulkSkip: () => void;
  handleApplyBulkSponsors: () => void;
  selectedItemIds: Set<string>;
  items: PecaDaVinculacao[];
  visibleItems: PecaDaVinculacao[];
  eventFilter: string[];
  getEventSponsors: (eventId: string) => PatrocinadorDaVinculacao[];
  dedo: boolean;
  isMobile: boolean;
};

export function ModalAplicarEmLote({
  bulkApplyDialogOpen, setBulkApplyDialogOpen, bulkSponsorSearch, setBulkSponsorSearch, bulkSelectedSponsors,
  setBulkSelectedSponsors, bulkSkipApproval, setBulkSkipApproval, toggleBulkSkip, handleApplyBulkSponsors,
  selectedItemIds, items, visibleItems, eventFilter, getEventSponsors, dedo, isMobile,
}: Props) {
  return (
    <Dialog open={bulkApplyDialogOpen} onOpenChange={(o) => { setBulkApplyDialogOpen(o); if (!o) setBulkSponsorSearch(''); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(560)}>
        <DialogTitle className="sr-only">Aplicar patrocinadores em lote</DialogTitle>
        <DialogDescription className="sr-only">Aplica os patrocinadores escolhidos a todas as peças selecionadas</DialogDescription>
        <ModalHeader
          icon={Users}
          tint={T.accentText}
          title="Aplicar em lote"
          subtitle={`${selectedItemIds.size} ${selectedItemIds.size === 1 ? 'peça selecionada' : 'peças selecionadas'}`}
          onClose={() => { setBulkApplyDialogOpen(false); setBulkSponsorSearch(''); }}
        />

        <div style={{ padding: '0 24px', flexShrink: 0 }}>
          {/* Banner informativo sobre isentos */}
          {(() => {
            const exemptCount = Array.from(selectedItemIds).filter(id => {
              const it = items.find(i => i.id === id);
              return it?.skipApproval === true;
            }).length;
            if (exemptCount === 0 || bulkSkipApproval) return null;
            return (
              <div style={{ marginTop: 16, padding: '10px 14px', backgroundColor: TOM.laranja.bg, borderRadius: R.md, display: 'flex', gap: 10, alignItems: 'flex-start', border: `1px solid ${TOM.laranja.border}` }}>
                <Info style={{ width: 14, height: 14, color: T.accentText, flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: FS.meta, lineHeight: 1.5, color: TOM.laranja.text, fontWeight: FW.corpo, margin: 0 }}>
                  {exemptCount} {exemptCount === 1 ? 'peça marcada' : 'peças marcadas'} como sem patrocinador não {exemptCount === 1 ? 'receberá' : 'receberão'} as marcas selecionadas.
                </p>
              </div>
            );
          })()}
        </div>

        {/* Campo de busca */}
        <div style={{ padding: '16px 24px 0', flexShrink: 0 }}>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: T.muted, pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Buscar patrocinador..."
              aria-label="Buscar patrocinador"
              value={bulkSponsorSearch}
              onChange={e => setBulkSponsorSearch(e.target.value)}
              style={{ width: '100%', minHeight: alvo(0, dedo), paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8, borderRadius: R.md, border: `1.5px solid ${T.border}`, fontSize: dedo || isMobile ? FS.lead : FS.body, color: T.text, backgroundColor: T.surface, boxSizing: 'border-box' }}
              onFocus={e => (e.currentTarget.style.borderColor = T.accent)}
              onBlur={e => (e.currentTarget.style.borderColor = T.border)}
            />
          </div>
        </div>

        {/* ALTURA: cabeçalho 93 + tarja de isentos ~60 + busca 64 + lista 328 +
            rodapé 65 = 610px com a tarja (550 sem ela). Em 445 de altura
            cortava 82px de cada lado. Mesma correção da lista de cima: o
            `maxHeight: 300` é teto de DESENHO, e `flex: 0 1 auto` +
            `minHeight: 0` é o que deixa a lista encolher abaixo dele quando o
            teto do `modalSurface` aperta. */}
        <div style={{ padding: '12px 24px 16px', maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, flex: '0 1 auto', minHeight: 0 }}>
          {/* Opção: Sem Patrocinador — aparece primeiro */}
          {!bulkSponsorSearch && (
          <div
            role="checkbox"
            aria-checked={bulkSkipApproval}
            tabIndex={0}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 14px',
              backgroundColor: T.surface,
              border: bulkSkipApproval ? `2px solid ${T.accent}` : `2px dashed ${T.border}`,
              borderRadius: R.md, cursor: 'pointer',
              // Sem opacity no desligado: 0,65 derrubava o rótulo abaixo de
              // AA. A borda tracejada já diz "opção, não marca".
              transition: 'all 0.15s',
            }}
            data-testid="bulk-option-sem-patrocinador"
            onClick={toggleBulkSkip}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleBulkSkip();
              }
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <X style={{ width: 15, height: 15, color: T.apoio, flexShrink: 0 }} />
              <span style={{ fontSize: FS.body, fontWeight: FW.medio, color: T.text }}>Sem patrocinador</span>
            </div>
            {bulkSkipApproval ? (
              <CheckCircle2 style={{ width: 17, height: 17, color: T.accentText, flexShrink: 0 }} />
            ) : (
              <div style={{ width: 17, height: 17, borderRadius: '50%', border: `1.5px solid ${T.border}`, flexShrink: 0 }} />
            )}
          </div>
          )}

          {/* Lista de patrocinadores — filtrada, ordenada A-Z, selecionados primeiro */}
          {(() => {
            // Só patrocinadores dos eventos das peças selecionadas: oferecer
            // o cadastro inteiro permitia gravar um vínculo de fora do
            // evento — ficava no banco, mas a coluna "Vínculos Ativos"
            // (que só lista patrocinadores do evento) nunca o exibia.
            const selectedEventIds = Array.from(new Set(
              visibleItems.filter(i => selectedItemIds.has(i.id)).map(i => i.eventId)
            ));
            const base = (eventFilter.length === 1
              ? getEventSponsors(eventFilter[0])
              : selectedEventIds
                  .flatMap(id => getEventSponsors(id))
                  .filter((s, idx: number, arr) => arr.findIndex((x) => x.id === s.id) === idx));
            const q = bulkSponsorSearch.toLowerCase().trim();
            const filtered = q ? base.filter((s) => s.name.toLowerCase().includes(q) || (s.company || '').toLowerCase().includes(q)) : base;
            const sorted = [...filtered].sort((a, b) => {
              const aSelected = bulkSelectedSponsors.includes(a.id);
              const bSelected = bulkSelectedSponsors.includes(b.id);
              if (aSelected !== bSelected) return aSelected ? -1 : 1;
              return a.name.localeCompare(b.name, 'pt-BR');
            });
            if (sorted.length === 0) return (
              <EstadoVazio
                compacto
                icone={Search}
                titulo={q ? `Nenhum patrocinador com “${bulkSponsorSearch}”` : 'Nenhum patrocinador cadastrado para este evento'}
              />
            );
            const selectedOnes = sorted.filter((s) => bulkSelectedSponsors.includes(s.id));
            const unselectedOnes = sorted.filter((s) => !bulkSelectedSponsors.includes(s.id));
            const renderSponsor = (sponsor: PatrocinadorDaVinculacao) => {
              const isSelected = bulkSelectedSponsors.includes(sponsor.id);
              const toggleBulkSponsor = () => {
                if (isSelected) {
                  setBulkSelectedSponsors(bulkSelectedSponsors.filter(id => id !== sponsor.id));
                } else {
                  setBulkSkipApproval(false);
                  setBulkSelectedSponsors([...bulkSelectedSponsors, sponsor.id]);
                }
              };
              return (
                <div
                  key={sponsor.id}
                  role="checkbox"
                  aria-checked={isSelected}
                  tabIndex={0}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '11px 14px',
                    backgroundColor: isSelected ? TOM.laranja.bg : T.surface,
                    border: isSelected ? `2px solid ${T.accent}` : `1px solid ${T.border}`,
                    borderRadius: R.md, cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  aria-label={`Selecionar patrocinador ${sponsor.name}`}
                  data-testid={`checkbox-bulk-sponsor-${sponsor.id}`}
                  onClick={toggleBulkSponsor}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleBulkSponsor();
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 11, height: 11, borderRadius: '50%', backgroundColor: sponsor.color || T.muted, flexShrink: 0, boxShadow: isSelected ? `0 0 0 2px rgba(249,115,22,0.2)` : 'none' }} />
                    <span style={{ fontSize: FS.body, fontWeight: isSelected ? FW.forte : FW.medio, color: isSelected ? T.text : T.strong }}>
                      {sponsor.name}
                      {sponsor.company && (
                        <span style={{ marginLeft: 6, fontWeight: 400, color: T.second, fontSize: FS.body }}> {sponsor.company}</span>
                      )}
                    </span>
                  </div>
                  {isSelected ? (
                    <CheckCircle2 style={{ width: 17, height: 17, color: T.accentText, flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 17, height: 17, borderRadius: '50%', border: `1.5px solid ${T.border}`, flexShrink: 0 }} />
                  )}
                </div>
              );
            };
            return (
              <>
                {selectedOnes.length > 0 && (
                  <>
                    {selectedOnes.map(renderSponsor)}
                    {unselectedOnes.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                        <div style={{ flex: 1, height: 1, backgroundColor: T.border }} />
                        <span style={{ fontSize: FS.small, color: T.second, fontWeight: FW.medio, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>outros</span>
                        <div style={{ flex: 1, height: 1, backgroundColor: T.border }} />
                      </div>
                    )}
                  </>
                )}
                {unselectedOnes.map(renderSponsor)}
              </>
            );
          })()}
        </div>

        <div style={{ flexShrink: 0, padding: '14px 24px', borderTop: `1px solid ${T.border}`, backgroundColor: T.low, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          {/* SOMA, NÃO SUBSTITUI. Sem esta frase não há como saber se aplicar
              dois patrocinadores a vinte peças APAGA o que cada uma já tinha
              — e, na dúvida, a saída segura é não usar o lote, aplicando um a
              um vinte vezes. A variante do "sem patrocinador" diz o contrário
              de propósito: essa opção REMOVE os vínculos, e é a única aqui
              que descarta trabalho. */}
          <p style={{ fontSize: FS.meta, color: T.apoio, lineHeight: 1.45, flex: '1 1 220px', minWidth: 0, marginRight: 12 }}>
            {(() => {
              const pecas = `${selectedItemIds.size} ${selectedItemIds.size === 1 ? 'peça' : 'peças'}`;
              if (bulkSkipApproval) {
                return `${pecas} ${selectedItemIds.size === 1 ? 'passa' : 'passam'} a não exigir patrocinador — os vínculos que ${selectedItemIds.size === 1 ? 'ela tiver é removido' : 'elas tiverem são removidos'}.`;
              }
              const n = bulkSelectedSponsors.length;
              if (n === 0) return `Escolha os patrocinadores que entram nas ${pecas} selecionadas.`;
              return `${n} ${n === 1 ? 'patrocinador entra' : 'patrocinadores entram'} nas ${pecas} selecionadas, somando aos vínculos que já existem.`;
            })()}
          </p>
          <Botao
            variante="fantasma"
            tamanho={dedo ? "toque" : "md"}
            onClick={() => setBulkApplyDialogOpen(false)}
          >
            Cancelar
          </Botao>
          {/* Desabilitado sem seleção, com o motivo À VISTA, em vez de
              deixar clicar e responder com toast destrutivo. */}
          <Botao
            variante="primario"
            tamanho={dedo ? "toque" : "md"}
            onClick={handleApplyBulkSponsors}
            disabled={bulkSelectedSponsors.length === 0 && !bulkSkipApproval}
            motivo="Selecione pelo menos um patrocinador ou marque 'Sem patrocinador'"
            alinharMotivo="end"
            data-testid="button-confirm-bulk-apply"
          >
            Aplicar em lote
          </Botao>
        </div>
      </DialogContent>
    </Dialog>
  );
}
