// ─────────────────────────────────────────────────────────────────────────────
// MODAL DO HISTÓRICO DE APROVAÇÕES — o log por patrocinador de uma peça.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { CheckCircle, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { miniatura } from "@/lib/miniatura";
import { FS, FW, R, T, N, TOM, FONT } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { useIsMobile, usePonteiroGrosso } from "@/hooks/use-mobile";
import { codigoDaPeca, letra } from "./estilos";
import { aoFalharMiniatura, approvalVisual } from "./regras";
import type { Patrocinador, PecaDoHistorico, SponsorApproval } from "./tipos";

export function ModalHistoricoDeAprovacoes({ histDetailItem, setHistDetailItem, itemSponsorsMap, itemApprovalsMap }: {
  histDetailItem: PecaDoHistorico | null;
  setHistDetailItem: Dispatch<SetStateAction<PecaDoHistorico | null>>;
  itemSponsorsMap: Record<string, Patrocinador[]>;
  itemApprovalsMap: Record<string, SponsorApproval[]>;
}) {
  const celular = useIsMobile();
  const dedo = usePonteiroGrosso();
  const toque = celular || dedo;
  const lado = dedo ? 44 : 36;
  return (
    <Dialog open={!!histDetailItem} onOpenChange={open => { if (!open) setHistDetailItem(null); }}>
      {/* HIDE_NATIVE_CLOSE: o modal tem botão de fechar próprio no header escuro */}
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(620)}>
        <DialogTitle className="sr-only">Histórico de aprovações</DialogTitle>
        <DialogDescription className="sr-only">Log completo de aprovações por patrocinador</DialogDescription>
        {histDetailItem && (() => {
          const di = histDetailItem;
          const diSps = itemSponsorsMap[di.id] || [];
          const diApprovals: SponsorApproval[] = itemApprovalsMap[di.id] || [];
          const ev = di._ev;
          const fmtFull = (d: string | Date | null | undefined) => d ? format(new Date(d), "dd/MM/yy 'às' HH:mm", { locale: ptBR }) : null;
          const approvedCount = diApprovals.filter(a => a.status === 'approved').length;
          const allApp = diSps.length > 0 && approvedCount === diSps.length;
          return (
            <>
              {/* CABEÇALHO CLARO.

                  Era um bloco quase preto com gradiente, ladrilho translúcido
                  e botão de fechar circular — um tema visual só dele, dentro
                  de um app inteiro claro. Todo o texto vinha em branco com
                  opacidade (0,55 a 0,65), que é como se apaga texto sem
                  admitir que ele ficou ilegível.

                  O contador 1/2 subiu para cá: ele era uma pílula empilhada de
                  56x56 no corpo, com o número, a fração e a palavra 'parcial'
                  em três alturas — e a frase ao lado já dizia a mesma coisa
                  por extenso. */}
              <div style={{ padding: celular ? '12px 12px 12px 16px' : '14px 14px 14px 20px', backgroundColor: T.bg, borderBottom: `1px solid ${N.n3}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <div style={{ width: 40, height: 40, borderRadius: R.md + 2, overflow: 'hidden', flexShrink: 0, backgroundColor: N.n2, border: `1px solid ${T.border}`, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {(di.approvalThumbUrl || di.finalPreviewUrl)
                    ? <>
                        <img
                          src={miniatura(di.approvalThumbUrl || di.finalPreviewUrl)}
                          alt=""
                          decoding="async"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={aoFalharMiniatura}
                        />
                        <div data-fallback="1" style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: T.second, letterSpacing: '-0.01em' }}>{di.type?.slice(0,2).toUpperCase()}</span>
                        </div>
                      </>
                    : <span style={{ fontSize: 12, fontWeight: 800, color: T.second, letterSpacing: '-0.01em' }}>{di.type?.slice(0,2).toUpperCase()}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <h2 title={di.type} style={{ fontFamily: FONT.display, fontSize: 17, fontWeight: FW.forte, color: T.text, margin: 0, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{di.type}</h2>
                    <span style={codigoDaPeca(toque)}>{di.displayId}</span>
                  </div>
                  <span title={ev?.name || undefined} style={{ display: 'block', fontSize: letra(FS.meta, toque), color: T.second, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev?.name || '—'}</span>
                </div>
                <span
                  data-testid="hist-contador-aprovacoes"
                  title={`${approvedCount} de ${diSps.length} patrocinadores aprovaram`}
                  style={{
                    flexShrink: 0, fontSize: FS.body, fontWeight: FW.forte, padding: '3px 9px', borderRadius: R.pill,
                    backgroundColor: allApp ? TOM.sucesso.bg : N.n2, border: `1px solid ${allApp ? TOM.sucesso.border : T.border}`,
                    fontVariantNumeric: 'tabular-nums',
                    color: allApp ? TOM.sucesso.text : T.apoio,
                  }}
                >
                  {approvedCount}/{diSps.length}
                </span>
                {/* O X da casa, do tamanho dos outros modais da tela (44 no toque). */}
                <Botao
                  variante="secundario"
                  icone={X}
                  tamanhoDoIcone={16}
                  onClick={() => setHistDetailItem(null)}
                  aria-label="Fechar"
                  title="Fechar (Esc)"
                  data-testid="button-close-historico-aprovacoes"
                  style={{ width: lado, minWidth: lado, minHeight: lado, padding: 0, flexShrink: 0 }}
                />
              </div>
              {/* Body: resumo + lista integrados, sem faixa separada.
                  ALTURA: cabeçalho escuro 80 + lista de até 440 = 520px, sem
                  rodapé. Numa janela de 445 o Radix cortava 61px em cima e 61
                  embaixo ao mesmo tempo. Este wrapper é o ELO da coluna (o
                  fade de rolagem depende do `position: relative` dele): sem
                  ser coluna flex e sem `minHeight: 0` o teto do `modalSurface`
                  não chegaria à lista. */}
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: '0 1 auto', minHeight: 0 }}>
              <div style={{ maxHeight: 440, overflowY: 'auto', flex: '0 1 auto', minHeight: 0 }}>
                {/* Resumo compacto no topo do body */}
                <div style={{ padding: celular ? '12px 16px' : '14px 24px 12px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: `1px solid ${allApp ? TOM.esmeralda.bg : N.n3}`, background: allApp ? TOM.sucesso.bg : T.surface }}>
                  {/* A pílula de 56x56 saiu: ela dizia "2", "/2" e "TODOS" em
                      três alturas, ao lado de uma frase que já dizia "Todos os
                      patrocinadores aprovaram". A fração ficou no cabeçalho. */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      {allApp && <CheckCircle style={{ width: 14, height: 14, color: TOM.sucesso.text, flexShrink: 0 }} />}
                      <span style={{ fontSize: FS.body, fontWeight: FW.medio, color: allApp ? TOM.sucesso.text : T.text }}>
                        {allApp
                          ? (diSps.length === 1 ? 'Patrocinador aprovou' : 'Todos os patrocinadores aprovaram')
                          : `${approvedCount} de ${diSps.length} aprovaram`}
                      </span>
                    </div>
                    {di.createdAt && <div style={{ fontSize: letra(FS.small, toque), color: T.second }}>Criado em {fmtFull(di.createdAt)}</div>}
                  </div>
                </div>
                {diSps.length === 0
                  ? <div style={{ padding: '32px 24px', textAlign: 'center', color: T.second, fontSize: FS.body }}>Nenhum patrocinador vinculado</div>
                  : diSps.map((sp, si) => {
                      const appr = diApprovals.find(a => a.sponsorId === sp.id);
                      const v = approvalVisual(appr?.status);
                      const { isApproved, isNewVersion } = v;
                      return (
                        <div key={sp.id} style={{ padding: celular ? '12px 16px' : '12px 24px', borderBottom: si < diSps.length - 1 ? `1px solid ${N.n2}` : 'none', display: 'flex', alignItems: 'center', gap: 12, borderLeft: sp.color ? `3px solid ${sp.color}` : 'none', paddingLeft: celular ? (sp.color ? '16px' : '19px') : (sp.color ? '24px' : '27px') }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: v.dot, flexShrink: 0, alignSelf: 'flex-start', marginTop: 3, boxShadow: `0 0 0 3px ${v.dot}33` }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                              <span style={{ fontSize: letra(FS.body, toque), fontWeight: FW.forte, color: T.text }}>{sp.name}</span>
                              <span style={{ fontSize: letra(FS.small, toque), fontWeight: FW.medio, color: v.text, background: v.bg, border: `1px solid ${v.border}`, borderRadius: R.sm, padding: '2px 8px', whiteSpace: 'nowrap' }}>{v.label}</span>
                            </div>
                            {isApproved && appr?.approvedAt && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <CheckCircle style={{ width: 12, height: 12, color: TOM.sucesso.text, flexShrink: 0 }} />
                                <span style={{ fontSize: letra(FS.small, toque), color: T.apoio }}>
                                  Aprovado em <strong style={{ fontWeight: 700 }}>{fmtFull(appr.approvedAt)}</strong>
                                  {appr.approvedBy && <> por <strong style={{ fontWeight: 700, color: T.text }}>{appr.approvedBy}</strong></>}
                                </span>
                              </div>
                            )}
                            {isApproved && !appr?.approvedAt && <span style={{ fontSize: letra(FS.small, toque), color: T.second }}>Data não registrada</span>}
                            {/* Gate pelos DADOS da reprovação, não pelo status: o
                                servidor grava 'awaiting_arte' na reprovação (nunca
                                'rejected'), então isRejected jamais ligava aqui e o
                                motivo/data da reprovação ficavam invisíveis. */}
                            {(appr?.rejectedAt || appr?.rejectionReason) && (
                              <>
                                {appr?.rejectedAt && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: appr.rejectionReason ? 6 : 0 }}>
                                    <X style={{ width: 12, height: 12, color: TOM.perigo.dot, flexShrink: 0 }} />
                                    <span style={{ fontSize: letra(FS.small, toque), color: T.apoio }}>
                                      Reprovado em <strong style={{ fontWeight: 700 }}>{fmtFull(appr.rejectedAt)}</strong>
                                      {appr.rejectedBy && <> por <strong style={{ fontWeight: 700, color: T.text }}>{appr.rejectedBy}</strong></>}
                                    </span>
                                  </div>
                                )}
                                {appr?.rejectionReason && (
                                  <div style={{ padding: '6px 10px', background: TOM.perigo.bg, borderRadius: 6, border: `1px solid ${TOM.perigo.border}` }}>
                                    <span style={{ fontSize: letra(FS.meta, toque), color: TOM.perigo.text, lineHeight: 1.5 }}>"{appr.rejectionReason}"</span>
                                  </div>
                                )}
                              </>
                            )}
                            {isNewVersion && <span style={{ fontSize: letra(FS.small, toque), color: TOM.alerta.text }}>Nova versão de arte solicitada</span>}
                            {!appr && <span style={{ fontSize: letra(FS.small, toque), color: T.second }}>Aguardando resposta do patrocinador</span>}
                          </div>
                        </div>
                      );
                    })
                }
                <div style={{ height: 8 }} />
              </div>
              {/* Fade de scroll: só exibe quando a lista pode ter overflow */}
              {diSps.length > 4 && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 48, background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.97))', pointerEvents: 'none', borderRadius: '0 0 16px 16px' }} />}
              </div>

            </>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
