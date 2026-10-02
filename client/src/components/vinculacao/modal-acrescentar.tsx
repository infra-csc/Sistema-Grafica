// ─────────────────────────────────────────────────────────────────────────────
// ACRESCENTAR UM PATROCINADOR — soma, nunca reescreve, e por isso vale mesmo
// depois do envio à Arte. O alvo (`acrescentarAlvo`) é a seleção congelada na
// abertura do diálogo.
// ─────────────────────────────────────────────────────────────────────────────
import { PlusCircle, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ModalHeader, ModalFooter, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/estados";
import { TOM, T, FS, FW } from "@/lib/theme";
import { CampoDeBusca, Marcador, NomeDaMarca, PontoDaMarca, RotuloDaLista, estiloDaOpcao } from "./pecas-de-escolha";
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
  const escolhido = sponsors.find((s) => s.id === acrescentarSponsorId);
  return (
    <Dialog open={acrescentarAberto} onOpenChange={(o) => { setAcrescentarAberto(o); if (!o) { setAcrescentarSponsorId(null); setBuscaAcrescentar(''); } }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={{ ...modalSurface(540), gap: 0 }}>
        <DialogTitle className="sr-only">Acrescentar patrocinador</DialogTitle>
        <DialogDescription className="sr-only">Acrescenta um patrocinador às peças selecionadas sem remover os vínculos existentes</DialogDescription>
        <FreezeWhileClosing open={acrescentarAberto}>
          <ModalHeader
            icon={PlusCircle}
            tint={TOM.sucesso.text}
            title="Acrescentar patrocinador"
            subtitle={`${acrescentarAlvo.length} ${acrescentarAlvo.length === 1 ? 'peça selecionada' : 'peças selecionadas'}`}
            compacto={isMobile}
            onClose={() => setAcrescentarAberto(false)}
          />
          <div style={{ padding: isMobile ? '14px 16px 0' : '18px 24px 0', flexShrink: 0 }}>
            {/* A REGRA EM TRÊS LINHAS, não num bloco de cinco. A frase de cima
                é o que o botão faz; as de baixo são os casos — antes tudo
                corria num parágrafo só, e "volta para a aprovação" (o que muda
                a vida de alguém) se perdia no meio. Mesmo texto. */}
            <p style={{ margin: 0, fontSize: FS.read, color: T.strong, lineHeight: 1.5 }}>
              Soma <strong style={{ color: T.text }}>um</strong> patrocinador às peças escolhidas, sem mexer nos vínculos que elas já têm.
            </p>
            <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                <>Funciona <strong style={{ color: T.text }}>mesmo depois do envio à Arte</strong>: quem espera o layout entra na aprovação quando ele chegar; quem está em aprovação ganha a pendência agora.</>,
                <>Peça que <strong style={{ color: T.text }}>já passou</strong> (finalização ou revisão) <strong style={{ color: T.accentText }}>volta para a aprovação</strong> — só o novo decide, quem já aprovou segue aprovado e a arte fica.</>,
                <>Peça já liberada para a Gráfica não entra.</>,
              ].map((linha, i) => (
                <li key={i} style={{ display: 'flex', gap: 8, fontSize: FS.meta, color: T.apoio, lineHeight: 1.5 }}>
                  <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: T.bdark, flexShrink: 0, marginTop: 7 }} />
                  <span>{linha}</span>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 14 }}>
              <CampoDeBusca
                valor={buscaAcrescentar}
                aoMudar={setBuscaAcrescentar}
                placeholder="Buscar patrocinador…"
                rotulo="Buscar patrocinador"
                testId="input-busca-acrescentar"
                dedo={dedo}
                isMobile={isMobile}
              />
            </div>
          </div>
          <div role="group" aria-label="Patrocinador a acrescentar" style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: isMobile ? '8px 16px 12px' : '10px 24px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                return <EstadoVazio compacto icone={Search} titulo={`Nenhum patrocinador com “${buscaAcrescentar.trim()}”.`} descricao="Confira a grafia do nome." />;
              }
              return (
                <>
                  <RotuloDaLista>Escolha um</RotuloDaLista>
                  {lista.map((s) => {
                    const marcado = acrescentarSponsorId === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setAcrescentarSponsorId(marcado ? null : s.id)}
                        aria-pressed={marcado}
                        data-testid={`opcao-acrescentar-${s.id}`}
                        className="vinc-opcao"
                        style={estiloDaOpcao(marcado, dedo)}
                      >
                        <PontoDaMarca cor={s.color} />
                        {/* Nome inteiro em até duas linhas: cortado, dois patrocinadores de nome parecido viravam o mesmo. */}
                        <NomeDaMarca nome={s.name} marcada={marcado} />
                        <Marcador marcado={marcado} unico />
                      </button>
                    );
                  })}
                </>
              );
            })()}
          </div>
          <ModalFooter fundo={T.bg} style={{ padding: isMobile ? '12px 16px' : '14px 24px' }}>
            {/* O ESCOLHIDO, DITO NO RODAPÉ. Com a lista rolada, a linha marcada
                podia estar fora da vista na hora de confirmar. */}
            {escolhido && (
              <p style={{ margin: 0, fontSize: FS.meta, color: T.apoio, lineHeight: 1.45 }}>
                <strong style={{ color: T.text, fontWeight: FW.forte }}>{escolhido.name}</strong> entra em {acrescentarAlvo.length} {acrescentarAlvo.length === 1 ? 'peça' : 'peças'}, somando aos vínculos que já existem.
              </p>
            )}
            {/* Topo alinhado: com o motivo embaixo do primário, o Cancelar
                esticava até a altura da coluna inteira. */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Botao
                variante="secundario"
                tamanho={dedo ? "toque" : "md"}
                onClick={() => setAcrescentarAberto(false)}
                disabled={acrescentando}
              >
                Cancelar
              </Botao>
              <div style={{ flex: '1 1 0', minWidth: 0 }}>
                <Botao
                  variante="primario"
                  tamanho={dedo ? "toque" : "md"}
                  larguraCheia
                  icone={PlusCircle}
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
              </div>
            </div>
          </ModalFooter>
        </FreezeWhileClosing>
      </DialogContent>
    </Dialog>
  );
}
