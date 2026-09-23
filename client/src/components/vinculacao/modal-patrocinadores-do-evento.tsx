// ─────────────────────────────────────────────────────────────────────────────
// PATROCINADORES DO EVENTO — quem participa do evento. Só eles aparecem como
// chip nas peças dele.
// ─────────────────────────────────────────────────────────────────────────────
import { Building2, Check, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { EstadoVazio } from "@/components/ui/estados";
import { alvo } from "@/hooks/use-mobile";
import { TOM, T, N, R, FS, FW } from "@/lib/theme";
import type { EventoDaVinculacao, PatrocinadorDaVinculacao } from "./tipos";

type Props = {
  sponsorDialogOpen: boolean;
  setSponsorDialogOpen: (aberto: boolean) => void;
  sponsorModalSearch: string;
  setSponsorModalSearch: (busca: string) => void;
  selectedEventForSponsors: EventoDaVinculacao | null;
  selectedSponsorIds: string[];
  setSelectedSponsorIds: (ids: string[]) => void;
  sponsors: PatrocinadorDaVinculacao[];
  handleSaveEventSponsors: () => void;
  salvando: boolean;
  dedo: boolean;
  isMobile: boolean;
};

export function ModalPatrocinadoresDoEvento({
  sponsorDialogOpen, setSponsorDialogOpen, sponsorModalSearch, setSponsorModalSearch, selectedEventForSponsors,
  selectedSponsorIds, setSelectedSponsorIds, sponsors, handleSaveEventSponsors, salvando, dedo, isMobile,
}: Props) {
  return (
    <Dialog open={sponsorDialogOpen} onOpenChange={(open) => { setSponsorDialogOpen(open); if (!open) setSponsorModalSearch(''); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(600)}>
        {/* POR QUE congelar aqui: o onSuccess remove /api/events do cache,
            faz refetch forçado, invalida /api/sponsors e /api/audit-logs,
            fecha e toasta. O refetch derruba `selectedEventForSponsors`
            (subtítulo do cabeçalho) e recalcula a lista inteira de linhas
            enquanto o modal ainda está montado saindo — cada uma dessas
            rodadas mandava desanexa+reanexa de ref para a subárvore em
            desmontagem, que é o laço do React #185. Mecanismo por extenso em
            components/modal-shell.tsx. */}
        <FreezeWhileClosing open={sponsorDialogOpen}>
        <DialogTitle className="sr-only">Patrocinadores do evento</DialogTitle>
        <DialogDescription className="sr-only">Escolha quais patrocinadores participam deste evento</DialogDescription>
        <ModalHeader
          icon={Building2}
          tint={T.accentText}
          title="Patrocinadores do evento"
          subtitle={selectedEventForSponsors?.name}
          onClose={() => { setSponsorDialogOpen(false); setSponsorModalSearch(''); }}
          trailing={selectedSponsorIds.length > 0 ? (
            // Tinta translúcida porque senta no cabeçalho ESCURO da casca
            // (ModalHeader "work"); um tom da paleta clara ali seria remendo.
            <Selo cores={{ bg: 'rgba(255,255,255,0.12)', text: T.surface, border: 'rgba(255,255,255,0.18)' }} style={{ flexShrink: 0 }}>
              {selectedSponsorIds.length} selecionado{selectedSponsorIds.length !== 1 ? 's' : ''}
            </Selo>
          ) : undefined}
        />

        <div style={{ padding: '16px 24px 0', flexShrink: 0 }}>
          {/* Barra de busca */}
          <div style={{ position: 'relative' }}>
            <Search style={{ width: 13, height: 13, color: T.muted, position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="text"
              value={sponsorModalSearch}
              onChange={e => setSponsorModalSearch(e.target.value)}
              placeholder="Buscar patrocinador..."
              aria-label="Buscar patrocinador"
              style={{ width: '100%', height: alvo(36, dedo), paddingLeft: 32, paddingRight: 36, borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.bg, color: T.text, fontSize: dedo || isMobile ? FS.lead : FS.body, boxSizing: 'border-box' }}
            />
            {sponsorModalSearch && (
              <button aria-label="Limpar busca" title="Limpar busca" onClick={() => setSponsorModalSearch('')} style={{ position: 'absolute', right: dedo ? 0 : 10, top: '50%', transform: 'translateY(-50%)', width: dedo ? 44 : undefined, height: dedo ? 44 : undefined, justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, color: T.second }}>
                <X style={{ width: 13, height: 13 }} />
              </button>
            )}
          </div>

          {/* Ações rápidas */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            {selectedSponsorIds.length > 0 ? (
              <Botao variante="fantasma" tamanho={dedo ? "toque" : "sm"} onClick={() => setSelectedSponsorIds([])}>
                Limpar seleção
              </Botao>
            ) : (
              <Botao variante="fantasma" tamanho={dedo ? "toque" : "sm"} onClick={() => setSelectedSponsorIds(sponsors.map((s) => s.id))}>
                Selecionar todos
              </Botao>
            )}
          </div>
        </div>

        {/* Lista — ALTURA: cabeçalho 93 + busca 52 + lista 340 + rodapé 65 =
            550px; numa janela de 445 sumiam 52px em cima e 52 embaixo. Os 340
            limitavam a lista, nunca o modal. Com `flex: 0 1 auto` + `minHeight:
            0` a lista encolhe abaixo dos 340 sob o teto do `modalSurface` e a
            rolagem que já existia passa a ligar. */}
        <div style={{ maxHeight: 340, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: '0 1 auto', minHeight: 0 }}>
          {(() => {
            const term = sponsorModalSearch.toLowerCase();
            const filtered = sponsors.filter((s) =>
              s.name.toLowerCase().includes(term) || (s.company || '').toLowerCase().includes(term)
            );
            const selected = filtered.filter((s) => selectedSponsorIds.includes(s.id)).sort((a, b) => a.name.localeCompare(b.name));
            const unselected = filtered.filter((s) => !selectedSponsorIds.includes(s.id)).sort((a, b) => a.name.localeCompare(b.name));
            const sorted = [...selected, ...unselected];

            if (sorted.length === 0) {
              return (
                <EstadoVazio
                  compacto
                  icone={Search}
                  titulo={sponsorModalSearch ? `Nenhum patrocinador com “${sponsorModalSearch}”` : 'Nenhum patrocinador cadastrado'}
                />
              );
            }

            return (
              <>
                {selected.length > 0 && unselected.length > 0 && (
                  <div style={{ fontSize: FS.small, fontWeight: FW.forte, color: T.second, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 4px 4px' }}>
                    Selecionados ({selected.length})
                  </div>
                )}
                {sorted.map((sponsor, idx: number) => {
                  const isSelected = selectedSponsorIds.includes(sponsor.id);
                  const showDivider = selected.length > 0 && unselected.length > 0 && idx === selected.length;
                  const toggleSponsor = () => {
                    if (isSelected) {
                      setSelectedSponsorIds(selectedSponsorIds.filter(id => id !== sponsor.id));
                    } else {
                      setSelectedSponsorIds([...selectedSponsorIds, sponsor.id]);
                    }
                  };
                  return (
                    <div key={sponsor.id}>
                      {showDivider && (
                        <div style={{ fontSize: FS.small, fontWeight: FW.forte, color: T.second, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 4px 4px' }}>
                          Disponíveis ({unselected.length})
                        </div>
                      )}
                      {/* role/aria-checked/tabIndex/teclas: era um <div>
                          só-mouse — leitor de tela não anunciava o estado e
                          teclado não alcançava a linha. */}
                      <div
                        role="checkbox"
                        aria-checked={isSelected}
                        tabIndex={0}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '11px 14px', minHeight: alvo(0, dedo),
                          backgroundColor: isSelected ? TOM.laranja.bg : T.bg,
                          border: isSelected ? `1.5px solid ${TOM.laranja.border}` : `1.5px solid ${N.n3}`,
                          borderRadius: R.md, cursor: 'pointer',
                          transition: 'all 0.12s',
                        }}
                        onClick={toggleSponsor}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleSponsor();
                          }
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: sponsor.color || TOM.info.dot, flexShrink: 0 }} />
                          <span style={{ fontSize: FS.body, fontWeight: isSelected ? FW.forte : FW.corpo, color: isSelected ? TOM.alerta.text : T.text }}>
                            {sponsor.name}
                          </span>
                          {sponsor.company && (
                            <span style={{ fontSize: FS.small, fontWeight: 400, color: T.second }}>({sponsor.company})</span>
                          )}
                        </div>
                        {isSelected ? (
                          <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: T.accentText, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Check style={{ width: 11, height: 11, color: T.surface }} />
                          </div>
                        ) : (
                          <div style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${T.bdark}`, flexShrink: 0 }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: '14px 20px', borderTop: `1px solid ${N.n3}`, backgroundColor: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: FS.meta, color: T.apoio, lineHeight: 1.45 }}>
                <strong style={{ fontWeight: FW.forte, color: T.text }}>{selectedSponsorIds.length} de {sponsors.length} ativos.</strong>{' '}
                Só estes aparecem como opção nas peças.
              </span>
            </div>
            <div style={{ height: 4, borderRadius: R.pill, backgroundColor: T.border, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${sponsors.length > 0 ? (selectedSponsorIds.length / sponsors.length) * 100 : 0}%`, backgroundColor: T.accentText, borderRadius: R.pill, transition: 'width 0.2s' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Botao
              variante="fantasma"
              tamanho={dedo ? "toque" : "md"}
              onClick={() => { setSponsorDialogOpen(false); setSponsorModalSearch(''); }}
              disabled={salvando}
            >
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              tamanho={dedo ? "toque" : "md"}
              onClick={handleSaveEventSponsors}
              carregando={salvando}
              data-testid="button-save-event-sponsors"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </Botao>
          </div>
        </div>
        </FreezeWhileClosing>
      </DialogContent>
    </Dialog>
  );
}
