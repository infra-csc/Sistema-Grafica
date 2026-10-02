// ─────────────────────────────────────────────────────────────────────────────
// APLICAR PATROCINADORES EM LOTE — soma os escolhidos aos vínculos de cada
// peça selecionada (ou marca "sem patrocinador", que os remove). Só oferece
// patrocinadores dos eventos das peças selecionadas.
// ─────────────────────────────────────────────────────────────────────────────
import { EyeOff, Info, Search, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ModalHeader, ModalFooter, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/estados";
import { TOM, T, R, FS, FW } from "@/lib/theme";
import { CampoDeBusca, Marcador, NomeDaMarca, PontoDaMarca, RotuloDaLista, estiloDaOpcao } from "./pecas-de-escolha";
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
  const lado = isMobile ? 16 : 24;
  return (
    <Dialog open={bulkApplyDialogOpen} onOpenChange={(o) => { setBulkApplyDialogOpen(o); if (!o) setBulkSponsorSearch(''); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={{ ...modalSurface(560), gap: 0 }}>
        <DialogTitle className="sr-only">Aplicar patrocinadores em lote</DialogTitle>
        <DialogDescription className="sr-only">Aplica os patrocinadores escolhidos a todas as peças selecionadas</DialogDescription>
        <ModalHeader
          icon={Users}
          tint={T.accentText}
          title="Aplicar em lote"
          subtitle={`${selectedItemIds.size} ${selectedItemIds.size === 1 ? 'peça selecionada' : 'peças selecionadas'}`}
          compacto={isMobile}
          onClose={() => { setBulkApplyDialogOpen(false); setBulkSponsorSearch(''); }}
        />

        <div style={{ padding: `${isMobile ? 14 : 18}px ${lado}px 0`, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Aviso sobre as isentas — antes da busca, porque muda o que o
              lote vai fazer em algumas peças. */}
          {(() => {
            const exemptCount = Array.from(selectedItemIds).filter(id => {
              const it = items.find(i => i.id === id);
              return it?.skipApproval === true;
            }).length;
            if (exemptCount === 0 || bulkSkipApproval) return null;
            return (
              <div style={{ padding: '10px 12px', backgroundColor: TOM.alerta.bg, borderRadius: R.md, display: 'flex', gap: 9, alignItems: 'flex-start', border: `1px solid ${TOM.alerta.border}` }}>
                <Info aria-hidden="true" style={{ width: 14, height: 14, color: TOM.alerta.text, flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: FS.meta, lineHeight: 1.5, color: TOM.alerta.text, fontWeight: FW.corpo, margin: 0 }}>
                  {exemptCount} {exemptCount === 1 ? 'peça marcada' : 'peças marcadas'} como sem patrocinador não {exemptCount === 1 ? 'receberá' : 'receberão'} as marcas selecionadas.
                </p>
              </div>
            );
          })()}
          <CampoDeBusca
            valor={bulkSponsorSearch}
            aoMudar={setBulkSponsorSearch}
            placeholder="Buscar patrocinador ou empresa…"
            rotulo="Buscar patrocinador"
            dedo={dedo}
            isMobile={isMobile}
          />
        </div>

        {/* O CORPO QUE ROLA: `flex: 1 1 auto` + `minHeight: 0` (ver
            modalSurface). Sob o teto da janela a lista encolhe e rola; o
            rodapé com o Aplicar não sai da tela. */}
        <div style={{ padding: `10px ${lado}px 14px`, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 auto', minHeight: 0 }}>
          {/* Opção: Sem Patrocinador — aparece primeiro, separada das marcas:
              não é uma marca, é a ausência de todas (e REMOVE os vínculos). */}
          {!bulkSponsorSearch && (
          <div
            role="checkbox"
            aria-checked={bulkSkipApproval}
            tabIndex={0}
            className="vinc-opcao"
            style={{
              ...estiloDaOpcao(false, dedo),
              // Tracejada desligada: "opção, não marca" — a mesma linguagem do
              // chip "Sem patrocinador" da linha. Ligada, o âmbar do selo.
              border: bulkSkipApproval ? `1px solid ${TOM.alerta.border}` : `1px dashed ${T.bdark}`,
              backgroundColor: bulkSkipApproval ? TOM.alerta.bg : T.surface,
              marginBottom: 4,
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
            <EyeOff aria-hidden="true" style={{ width: 14, height: 14, color: bulkSkipApproval ? TOM.alerta.text : T.apoio, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: FS.body, fontWeight: bulkSkipApproval ? FW.forte : FW.medio, color: bulkSkipApproval ? TOM.alerta.text : T.text }}>Sem patrocinador</span>
              <span style={{ fontSize: FS.meta, color: bulkSkipApproval ? TOM.alerta.text : T.apoio }}>Remove os vínculos e dispensa a aprovação de marca</span>
            </span>
            <Marcador marcado={bulkSkipApproval} />
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
                descricao={q ? 'A lista mostra só os patrocinadores dos eventos das peças selecionadas.' : 'Adicione patrocinadores ao evento pelo botão no cabeçalho dele, na lista.'}
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
                  className="vinc-opcao"
                  style={estiloDaOpcao(isSelected, dedo)}
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
                  <PontoDaMarca cor={sponsor.color} />
                  <NomeDaMarca nome={sponsor.name} empresa={sponsor.company} marcada={isSelected} />
                  <Marcador marcado={isSelected} />
                </div>
              );
            };
            return (
              <>
                {selectedOnes.length > 0 && (
                  <>
                    <RotuloDaLista>Entram ({selectedOnes.length})</RotuloDaLista>
                    {selectedOnes.map(renderSponsor)}
                  </>
                )}
                {unselectedOnes.length > 0 && (
                  <div style={{ marginTop: selectedOnes.length > 0 ? 8 : 0 }}>
                    <RotuloDaLista>{selectedOnes.length > 0 ? `Outros (${unselectedOnes.length})` : `Patrocinadores do evento (${unselectedOnes.length})`}</RotuloDaLista>
                  </div>
                )}
                {unselectedOnes.map(renderSponsor)}
              </>
            );
          })()}
        </div>

        <ModalFooter fundo={T.bg} style={{ padding: isMobile ? '12px 16px' : '14px 24px' }}>
          {/* SOMA, NÃO SUBSTITUI. Sem esta frase não há como saber se aplicar
              dois patrocinadores a vinte peças APAGA o que cada uma já tinha
              — e, na dúvida, a saída segura é não usar o lote, aplicando um a
              um vinte vezes. A variante do "sem patrocinador" diz o contrário
              de propósito: essa opção REMOVE os vínculos, e é a única aqui
              que descarta trabalho. */}
          <p style={{ margin: 0, fontSize: FS.meta, color: bulkSkipApproval ? TOM.alerta.text : T.apoio, lineHeight: 1.45 }}>
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
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'flex-start' }}>
            <Botao
              variante="secundario"
              tamanho={dedo ? "toque" : "md"}
              onClick={() => setBulkApplyDialogOpen(false)}
            >
              Cancelar
            </Botao>
            {/* Desabilitado sem seleção, com o motivo À VISTA, em vez de
                deixar clicar e responder com toast destrutivo. */}
            <div style={{ flex: isMobile ? '1 1 0' : '0 0 auto', minWidth: 0 }}>
              <Botao
                variante="primario"
                tamanho={dedo ? "toque" : "md"}
                icone={Users}
                larguraCheia={isMobile}
                onClick={handleApplyBulkSponsors}
                disabled={bulkSelectedSponsors.length === 0 && !bulkSkipApproval}
                motivo="Escolha um patrocinador ou “Sem patrocinador”"
                alinharMotivo="end"
                data-testid="button-confirm-bulk-apply"
              >
                {bulkSkipApproval ? `Marcar ${selectedItemIds.size} sem patrocinador` : 'Aplicar em lote'}
              </Botao>
            </div>
          </div>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
