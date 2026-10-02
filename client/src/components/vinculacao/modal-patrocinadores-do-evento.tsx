// ─────────────────────────────────────────────────────────────────────────────
// PATROCINADORES DO EVENTO — quem participa do evento. Só eles aparecem como
// chip nas peças dele.
// ─────────────────────────────────────────────────────────────────────────────
import { Building2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ModalHeader, ModalFooter, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/estados";
import { T, FS, FW } from "@/lib/theme";
import { CampoDeBusca, Marcador, NomeDaMarca, PontoDaMarca, RotuloDaLista, estiloDaOpcao } from "./pecas-de-escolha";
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
  const fechar = () => { setSponsorDialogOpen(false); setSponsorModalSearch(''); };
  return (
    <Dialog open={sponsorDialogOpen} onOpenChange={(open) => { setSponsorDialogOpen(open); if (!open) setSponsorModalSearch(''); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={{ ...modalSurface(560), gap: 0 }}>
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
        {/* Sem o selo "N selecionados" no cabeçalho: o rodapé já diz "N de M
            no evento", e o mesmo número em dois lugares do mesmo diálogo é
            um a mais para conferir. */}
        <ModalHeader
          icon={Building2}
          tint={T.accentText}
          title="Patrocinadores do evento"
          subtitle={selectedEventForSponsors?.name}
          compacto={isMobile}
          onClose={fechar}
        />

        <div style={{ padding: isMobile ? '14px 16px 0' : '18px 24px 0', flexShrink: 0 }}>
          <CampoDeBusca
            valor={sponsorModalSearch}
            aoMudar={setSponsorModalSearch}
            placeholder="Buscar patrocinador ou empresa…"
            rotulo="Buscar patrocinador"
            dedo={dedo}
            isMobile={isMobile}
          />
        </div>

        {/* Lista — o corpo que rola. Os elos até aqui são coluna flex com
            `minHeight: 0` (ver modalSurface): com o teto da janela, a lista
            encolhe e rola, e o rodapé com o Salvar nunca sai da tela. */}
        <div style={{ overflowY: 'auto', padding: isMobile ? '8px 16px 14px' : '10px 24px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 auto', minHeight: 0 }}>
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
                  descricao={sponsorModalSearch ? 'Confira a grafia ou busque pelo nome da empresa.' : undefined}
                />
              );
            }

            // A AÇÃO RÁPIDA MORA NO RÓTULO DA LISTA, à direita — sozinha numa
            // linha própria embaixo da busca, ela abria um vão de 40px sem
            // nada à esquerda.
            const acaoRapida = selectedSponsorIds.length > 0 ? (
              <Botao variante="fantasma" tamanho={dedo ? "toque" : "sm"} onClick={() => setSelectedSponsorIds([])}>
                Limpar seleção
              </Botao>
            ) : (
              <Botao variante="fantasma" tamanho={dedo ? "toque" : "sm"} onClick={() => setSelectedSponsorIds(sponsors.map((s) => s.id))}>
                Selecionar todos
              </Botao>
            );

            return (
              <>
                <RotuloDaLista acao={acaoRapida}>
                  {selected.length > 0 ? `No evento (${selected.length})` : `Disponíveis (${unselected.length})`}
                </RotuloDaLista>
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
                    <div key={sponsor.id} style={{ display: 'contents' }}>
                      {showDivider && (
                        <div style={{ marginTop: 8 }}>
                          <RotuloDaLista>Disponíveis ({unselected.length})</RotuloDaLista>
                        </div>
                      )}
                      {/* role/aria-checked/tabIndex/teclas: era um <div>
                          só-mouse — leitor de tela não anunciava o estado e
                          teclado não alcançava a linha. */}
                      <div
                        role="checkbox"
                        aria-checked={isSelected}
                        tabIndex={0}
                        className="vinc-opcao"
                        style={estiloDaOpcao(isSelected, dedo)}
                        onClick={toggleSponsor}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleSponsor();
                          }
                        }}
                      >
                        <PontoDaMarca cor={sponsor.color} />
                        <NomeDaMarca nome={sponsor.name} empresa={sponsor.company} marcada={isSelected} />
                        <Marcador marcado={isSelected} />
                      </div>
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>

        <ModalFooter fundo={T.bg} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: isMobile ? '12px 16px' : '14px 24px' }}>
          <p style={{ margin: 0, flex: '1 1 200px', minWidth: 0, fontSize: FS.meta, color: T.apoio, lineHeight: 1.45 }}>
            <strong style={{ fontWeight: FW.forte, color: T.text }}>{selectedSponsorIds.length} de {sponsors.length} no evento.</strong>{' '}
            Só estes aparecem como opção nas peças.
          </p>
          <div style={{ display: 'flex', gap: 8, flex: isMobile ? '1 1 100%' : '0 0 auto' }}>
            <Botao
              variante="secundario"
              tamanho={dedo ? "toque" : "md"}
              onClick={fechar}
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
              style={isMobile ? { flex: '1 1 0' } : undefined}
            >
              {salvando ? "Salvando…" : "Salvar"}
            </Botao>
          </div>
        </ModalFooter>
        </FreezeWhileClosing>
      </DialogContent>
    </Dialog>
  );
}
