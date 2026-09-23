// ─────────────────────────────────────────────────────────────────────────────
// ACRESCENTAR UM PATROCINADOR — soma, nunca reescreve, e por isso vale mesmo
// depois do envio à Arte. O alvo (`acrescentarAlvo`) é a seleção congelada na
// abertura do diálogo.
// ─────────────────────────────────────────────────────────────────────────────
import { Check, PlusCircle, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ModalHeader, ModalFooter, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/estados";
import { alvo } from "@/hooks/use-mobile";
import { TOM, T, R, FS, FW } from "@/lib/theme";
import type { PatrocinadorDaVinculacao } from "./tipos";

type Props = {
  acrescentarAberto: boolean;
  setAcrescentarAberto: (aberto: boolean) => void;
  acrescentarSponsorId: string | null;
  setAcrescentarSponsorId: (id: string | null) => void;
  buscaAcrescentar: string;
  setBuscaAcrescentar: (busca: string) => void;
  acrescentarAlvo: string[];
  sponsors: PatrocinadorDaVinculacao[];
  confirmarAcrescentar: () => void;
  acrescentando: boolean;
  dedo: boolean;
  isMobile: boolean;
};

export function ModalAcrescentar({
  acrescentarAberto, setAcrescentarAberto, acrescentarSponsorId, setAcrescentarSponsorId, buscaAcrescentar,
  setBuscaAcrescentar, acrescentarAlvo, sponsors, confirmarAcrescentar, acrescentando, dedo, isMobile,
}: Props) {
  return (
    <Dialog open={acrescentarAberto} onOpenChange={(o) => { setAcrescentarAberto(o); if (!o) { setAcrescentarSponsorId(null); setBuscaAcrescentar(''); } }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(520)}>
        <DialogTitle className="sr-only">Acrescentar patrocinador</DialogTitle>
        <DialogDescription className="sr-only">Acrescenta um patrocinador às peças selecionadas sem remover os vínculos existentes</DialogDescription>
        <FreezeWhileClosing open={acrescentarAberto}>
          <ModalHeader
            icon={PlusCircle}
            tint={TOM.sucesso.text}
            title="Acrescentar patrocinador"
            subtitle={`${acrescentarAlvo.length} ${acrescentarAlvo.length === 1 ? 'peça selecionada' : 'peças selecionadas'}`}
            onClose={() => setAcrescentarAberto(false)}
          />
          <div style={{ padding: '14px 24px 0', flexShrink: 0 }}>
            <p style={{ margin: 0, fontSize: FS.body, color: T.apoio, lineHeight: 1.55 }}>
              Soma <strong style={{ color: T.text }}>um</strong> patrocinador às peças escolhidas, sem mexer nos vínculos que elas já têm.
              Funciona <strong style={{ color: T.text }}>mesmo depois do envio à Arte</strong>: quem espera o layout entra na aprovação quando ele chegar; quem está em aprovação ganha a pendência agora.
              Peça que <strong style={{ color: T.text }}>já passou</strong> (finalização ou revisão) <strong style={{ color: T.accentText }}>volta para a aprovação</strong> — só o novo decide, quem já aprovou segue aprovado e a arte fica. Peça já liberada para a Gráfica não entra.
            </p>
            <div style={{ position: 'relative', marginTop: 12 }}>
              <Search style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: T.muted }} />
              <input
                value={buscaAcrescentar}
                onChange={(e) => setBuscaAcrescentar(e.target.value)}
                placeholder="Buscar patrocinador…"
                aria-label="Buscar patrocinador"
                data-testid="input-busca-acrescentar"
                style={{ width: '100%', height: alvo(38, dedo), paddingLeft: 34, paddingRight: 12, borderRadius: R.md, border: `1px solid ${T.bdark}`, fontSize: dedo || isMobile ? FS.lead : FS.body, fontFamily: 'inherit', color: T.text, backgroundColor: T.surface }}
              />
            </div>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '10px 24px 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(() => {
              const termo = buscaAcrescentar.trim().toLowerCase();
              // Ordem alfabética SEMPRE (erro apontado pelo dono, 25/08):
              // o cadastro vem na ordem do banco, e achar "Ministério" numa
              // lista embaralhada era rolar e torcer.
              const lista = sponsors
                .filter((s) => !termo || String(s.name ?? '').toLowerCase().includes(termo))
                .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'pt-BR'))
                .slice(0, 60);
              if (lista.length === 0) {
                return <EstadoVazio compacto icone={Search} titulo={`Nenhum patrocinador com “${buscaAcrescentar.trim()}”.`} />;
              }
              return lista.map((s) => {
                const escolhido = acrescentarSponsorId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setAcrescentarSponsorId(escolhido ? null : s.id)}
                    aria-pressed={escolhido}
                    data-testid={`opcao-acrescentar-${s.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, width: '100%', minHeight: alvo(42, dedo), padding: '6px 12px',
                      borderRadius: R.md, cursor: 'pointer', font: 'inherit', fontSize: FS.body, fontWeight: FW.medio, textAlign: 'left',
                      border: `1px solid ${escolhido ? TOM.sucesso.border : T.border}`,
                      backgroundColor: escolhido ? TOM.sucesso.bg : T.surface,
                      color: T.text,
                    }}
                  >
                    <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: s.color || T.muted, flexShrink: 0 }} />
                    {/* Nome inteiro em até duas linhas: cortado, dois patrocinadores de nome parecido viravam o mesmo. */}
                    <span style={{ flex: 1, minWidth: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.name}</span>
                    {escolhido && <Check style={{ width: 15, height: 15, color: TOM.sucesso.text, flexShrink: 0 }} />}
                  </button>
                );
              });
            })()}
          </div>
          <ModalFooter>
            <Botao
              variante="primario"
              tamanho="toque"
              larguraCheia
              onClick={confirmarAcrescentar}
              disabled={!acrescentarSponsorId || acrescentarAlvo.length === 0}
              carregando={acrescentando}
              motivo="Escolha um patrocinador na lista"
              alinharMotivo="center"
              data-testid="button-confirmar-acrescentar"
            >
              {acrescentando
                ? 'Acrescentando…'
                : `Acrescentar em ${acrescentarAlvo.length} ${acrescentarAlvo.length === 1 ? 'peça' : 'peças'}`}
            </Botao>
          </ModalFooter>
        </FreezeWhileClosing>
      </DialogContent>
    </Dialog>
  );
}
