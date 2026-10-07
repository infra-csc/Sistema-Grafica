// REVISÃO DO LOTE — o que será criado, o que já existe no evento e as repetições.
import { ArrowRight, Factory, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { T, N, TOM, FONT } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { SeloProducaoInterna } from "@/components/selo-producao-interna";
import { faltamInstrucoes } from "@shared/producao-interna";
import { isSameItem } from "./regras";
import type { ConfirmacaoDoLote, ExistingItem, PecaDoLote, StandardItem } from "./tipos";

export function RevisaoDoLote({
  duplicateConfirm, setDuplicateConfirm, standardItems, existingItems, isPending, onSubmit, leftoverCount,
}: {
  duplicateConfirm: ConfirmacaoDoLote | null;
  setDuplicateConfirm: (v: ConfirmacaoDoLote | null) => void;
  standardItems: StandardItem[];
  existingItems: ExistingItem[];
  isPending?: boolean;
  onSubmit: (items: PecaDoLote[], leftoverCount: number) => void;
  /** Linhas incompletas que NÃO vão no envio e seguem no grid. */
  leftoverCount: number;
}) {
  // VAI DIRETO PARA A GRÁFICA (dono, 07/10): quantas linhas do lote foram
  // marcadas e quantas ainda não dizem à Gráfica o que fazer. A conta é a do
  // envio da lista (shared/producao-interna): sem arquivo e sem instrução, a
  // peça fica no rascunho — a revisão avisa ANTES de gravar.
  const diretas = duplicateConfirm?.valid.filter(p => p.producaoInterna) ?? [];
  const diretasSemInstrucao = diretas.filter(p => faltamInstrucoes(p.instrucoesGrafica, !!p.finalFileUrl)).length;

  // ── RESUMO / CONFIRMAÇÃO DE LOTE ──
  // Era um overlay montado à mão: sem Esc, sem armadilha de foco (o Tab
  // percorria o formulário atrás do escurecido), o foco não voltava ao
  // fechar e a página seguia rolando por baixo. É a última conferência
  // antes de gravar um lote inteiro de peças — justamente onde a pessoa
  // precisa poder desistir com uma tecla.
  return (
    <Dialog open={!!duplicateConfirm} onOpenChange={o => { if (!o) setDuplicateConfirm(null); }}>
      <DialogContent
        className="p-0 gap-0 border-none"
        style={{ maxWidth: 520, width: '96vw', borderRadius: 12, overflow: 'hidden', backgroundColor: N.n2, boxShadow: '0 24px 64px rgba(0,0,0,0.28)' }}
      >
        <DialogTitle className="sr-only">Revisão do lote</DialogTitle>
        <DialogDescription className="sr-only">Confira as peças antes de gravar o lote</DialogDescription>
        {/* A guarda continua necessária: o Dialog monta o conteúdo antes de
            `duplicateConfirm` existir, e todo o corpo abaixo lê esse objeto. */}
        {duplicateConfirm && (
        <div style={{
          maxHeight: '85vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>

          {/* ── CABEÇALHO ── */}
          <div style={{
            padding: '22px 28px 18px',
            borderBottom: `1px solid ${T.border}`,
            backgroundColor: T.surface,
            borderRadius: '12px 12px 0 0',
          }}>
            <p style={{
              margin: 0, fontSize: '11px', fontWeight: '700', letterSpacing: '0.10em',
              textTransform: 'uppercase', color: T.second,
              fontFamily: FONT.display,
            }}>
              Revisão do Lote
            </p>
            <p style={{
              margin: '4px 0 0', fontSize: '18px', fontWeight: '800', color: T.text,
              fontFamily: FONT.display,
            }}>
              Confirmar criação de peças
            </p>
          </div>

          {/* ── CORPO SCROLLÁVEL ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* SEÇÃO 1 — O QUE SERÁ CRIADO */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <div style={{
                  width: '6px', height: '6px', borderRadius: '50%', backgroundColor: TOM.sucesso.dot, flexShrink: 0,
                }} />
                <span style={{
                  fontSize: '10px', fontWeight: '700', letterSpacing: '0.10em', textTransform: 'uppercase',
                  color: T.second, fontFamily: FONT.display,
                }}>
                  Será criado — {duplicateConfirm.valid.length} {duplicateConfirm.valid.length === 1 ? 'peça' : 'peças'}
                </span>
              </div>
              {diretas.length > 0 && (
                <div
                  data-testid="revisao-lote-diretas"
                  style={{
                    display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10,
                    backgroundColor: TOM.ceu.bg, borderLeft: `4px solid ${TOM.ceu.dot}`, borderRadius: 8,
                    padding: '8px 12px', color: TOM.ceu.text, fontSize: 13, fontFamily: FONT.corpo, lineHeight: 1.4,
                  }}
                >
                  <Factory aria-hidden="true" style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }} />
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontWeight: 700 }}>
                      {diretas.length === duplicateConfirm.valid.length
                        ? (diretas.length === 1 ? 'Vai direto para a Gráfica' : `Todas as ${diretas.length} vão direto para a Gráfica`)
                        : `${diretas.length} de ${duplicateConfirm.valid.length} vão direto para a Gráfica`}
                    </strong>
                    {' '}no envio da lista — sem Vinculação, Arte, Aprovação nem Revisão Final.
                    {diretasSemInstrucao > 0 && (
                      <span data-testid="revisao-lote-diretas-sem-instrucao" style={{ display: 'block', color: TOM.alerta.text, marginTop: 2 }}>
                        {diretasSemInstrucao === 1 ? '1 está' : `${diretasSemInstrucao} estão`} sem arquivo e sem instruções: {diretasSemInstrucao === 1 ? 'fica' : 'ficam'} no rascunho até você escrever o que a Gráfica deve fazer.
                      </span>
                    )}
                  </div>
                </div>
              )}
              <div style={{ maxHeight: '220px', overflowY: 'auto', overflowX: 'hidden', border: `1px solid ${T.border}`, borderRadius: '8px' }}>
                {(() => {
                  const typeToGroup: Record<string, string> = {};
                  for (const s of standardItems) { if (s.group) typeToGroup[s.name] = s.group; }
                  const groupMap: Record<string, Record<string, PecaDoLote[]>> = {};
                  for (const item of duplicateConfirm.valid) {
                    const g = typeToGroup[item.type] || '';
                    if (!groupMap[g]) groupMap[g] = {};
                    if (!groupMap[g][item.type]) groupMap[g][item.type] = [];
                    groupMap[g][item.type].push(item);
                  }
                  const sortedGroups = Object.keys(groupMap).sort((a, b) => { if (a === '') return 1; if (b === '') return -1; return a.localeCompare(b, 'pt-BR'); });
                  return sortedGroups.map(group => (
                    <div key={group || '__nogroup'}>
                      {group && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '4px 12px', backgroundColor: TOM.ceu.border, borderBottom: `1px solid ${TOM.ceu.border}` }}>
                          <span style={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.12em', color: TOM.ceu.text, fontFamily: FONT.display }}>{group}</span>
                        </div>
                      )}
                      {Object.entries(groupMap[group]).map(([type, typeItems], gi) => (
                    <div key={type}>
                      {/* Type sub-header */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '7px',
                        padding: '5px 12px',
                        backgroundColor: N.n3,
                        borderTop: (!group && gi === 0) ? 'none' : `1px solid ${T.border}`,
                        borderBottom: `1px solid ${T.border}`,
                      }}>
                        <span style={{
                          fontSize: '10px', fontWeight: '900',
                          textTransform: 'uppercase', letterSpacing: '0.12em',
                          color: T.second, fontFamily: FONT.display,
                          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {type}
                        </span>
                        <span style={{
                          fontSize: '10px', fontWeight: '700',
                          color: T.apoio, backgroundColor: T.border,
                          borderRadius: 999, padding: '1px 6px',
                          fontFamily: FONT.display, flexShrink: 0,
                        }}>
                          {typeItems.length}
                        </span>
                      </div>
                      {/* Items within this type */}
                      {typeItems.map((item, i) => {
                        const dupMatch = duplicateConfirm.duplicates.find(d => isSameItem(d.newItem, item));
                        const isDup = !!dupMatch;
                        return (
                          <div key={i} style={{
                            backgroundColor: isDup ? TOM.alerta.bg : T.surface,
                            borderBottom: `1px solid ${T.border}`,
                            padding: '9px 12px',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                            // A marcada ganha uma 2ª linha com o selo: na 1ª,
                            // ao lado do tipo, ele espremia tipo e descrição
                            // em reticências num diálogo de 520px.
                            flexWrap: 'wrap', rowGap: 5,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                              {item.isReuse && (
                                <span style={{
                                  fontSize: '10px', fontWeight: '800', backgroundColor: TOM.esmeralda.text,
                                  color: T.surface, borderRadius: '6px', padding: '1px 6px',
                                  textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0,
                                  fontFamily: FONT.display,
                                  display: 'inline-flex', alignItems: 'center', gap: 3,
                                }}>
                                  <RotateCcw size={8} /> Reaproveit.
                                </span>
                              )}
                              {isDup && (
                                <span style={{
                                  fontSize: '10px', fontWeight: '800', backgroundColor: TOM.alerta.border,
                                  color: TOM.alerta.text, borderRadius: '6px', padding: '1px 5px',
                                  textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0,
                                  fontFamily: FONT.display,
                                }}>Dup</span>
                              )}
                              {isDup && dupMatch?.existingItem.displayId && (
                                <span style={{ fontSize: '11px', fontWeight: '700', color: TOM.alerta.text, fontFamily: FONT.display, flexShrink: 0 }}>
                                  {dupMatch.existingItem.displayId}
                                </span>
                              )}
                              <span style={{ fontSize: '13px', fontWeight: '700', color: isDup ? TOM.alerta.text : T.text, fontFamily: FONT.display, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.type}
                              </span>
                              {item.description && (
                                <span style={{ fontSize: '11px', color: isDup ? TOM.alerta.text : T.second, fontFamily: FONT.corpo, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.description}
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                              <span style={{ fontSize: '11px', color: T.second, fontFamily: FONT.corpo }}>
                                {item.fileWidth} × {item.fileHeight}m
                              </span>
                              <span style={{ fontSize: '11px', color: T.second, fontFamily: FONT.corpo }}>
                                {item.material}
                              </span>
                              <span style={{ fontSize: '11px', fontWeight: '700', color: TOM.alerta.text, fontFamily: FONT.display, backgroundColor: TOM.laranja.bg, borderRadius: '6px', padding: '2px 7px' }}>
                                {item.quantity}x
                              </span>
                            </div>
                            {item.producaoInterna && (
                              <div style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                                <SeloProducaoInterna peca={item} onde="lista" style={{ flexShrink: 0 }} />
                                {faltamInstrucoes(item.instrucoesGrafica, !!item.finalFileUrl) && (
                                  <span style={{ fontSize: '12px', color: TOM.alerta.text, fontFamily: FONT.corpo }}>
                                    sem instruções — fica no rascunho no envio
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ));
            })()}
              </div>
            </div>

            {/* SEÇÃO 2 — JÁ EXISTEM NO EVENTO */}
            {existingItems.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: T.muted, flexShrink: 0 }} />
                  <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.10em', textTransform: 'uppercase', color: T.second, fontFamily: FONT.display }}>
                    Já existem no evento — {existingItems.length} {existingItems.length === 1 ? 'peça' : 'peças'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', maxHeight: '220px', overflowY: 'auto', overflowX: 'hidden', border: `1px solid ${T.border}`, borderRadius: '8px' }}>
                  {(() => {
                    const typeToGroup2: Record<string, string> = {};
                    for (const s of standardItems) { if (s.group) typeToGroup2[s.name] = s.group; }
                    const gMap2: Record<string, Record<string, ExistingItem[]>> = {};
                    for (const item of existingItems) {
                      const g = typeToGroup2[item.type] || '';
                      if (!gMap2[g]) gMap2[g] = {};
                      if (!gMap2[g][item.type]) gMap2[g][item.type] = [];
                      gMap2[g][item.type].push(item);
                    }
                    const sortedG2 = Object.keys(gMap2).sort((a, b) => { if (a === '') return 1; if (b === '') return -1; return a.localeCompare(b, 'pt-BR'); });
                    return sortedG2.map(group => (
                      <div key={group || '__nogroup2'}>
                        {group && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '4px 12px', backgroundColor: TOM.ceu.border, borderBottom: `1px solid ${TOM.ceu.border}` }}>
                            <span style={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.12em', color: TOM.ceu.text, fontFamily: FONT.display }}>{group}</span>
                          </div>
                        )}
                        {Object.entries(gMap2[group]).map(([type, typeItems], gi) => (
                          <div key={type}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 12px', backgroundColor: N.n3, borderTop: (!group && gi === 0) ? 'none' : `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` }}>
                              <span style={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.12em', color: T.second, fontFamily: FONT.display, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{type}</span>
                              <span style={{ fontSize: '10px', fontWeight: '700', color: T.apoio, backgroundColor: T.border, borderRadius: 999, padding: '1px 6px', fontFamily: FONT.display, flexShrink: 0 }}>{typeItems.length}</span>
                            </div>
                            {typeItems.map((item) => {
                              const isConflict = duplicateConfirm.duplicates.some(d => d.existingItem.id === item.id);
                              return (
                                <div key={item.id} style={{ backgroundColor: isConflict ? TOM.alerta.bg : N.n2, borderBottom: `1px solid ${T.border}`, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <span style={{ fontSize: '11px', fontWeight: '700', color: TOM.alerta.text, fontFamily: FONT.display, flexShrink: 0 }}>{item.displayId}</span>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ fontSize: '13px', fontWeight: isConflict ? '700' : '400', color: isConflict ? TOM.alerta.text : T.second, fontFamily: FONT.corpo, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.type}</span>
                                    {item.description && <span style={{ fontSize: '11px', color: isConflict ? TOM.alerta.text : T.second, fontFamily: FONT.corpo, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</span>}
                                  </div>
                                  <span style={{ fontSize: '11px', fontWeight: isConflict ? '700' : '400', color: isConflict ? TOM.alerta.text : T.second, fontFamily: FONT.corpo, flexShrink: 0 }}>{item.quantity}x</span>
                                  {isConflict && <span style={{ fontSize: '10px', fontWeight: '800', backgroundColor: TOM.alerta.border, color: TOM.alerta.text, borderRadius: '6px', padding: '1px 5px', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0, fontFamily: FONT.display }}>Dup</span>}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* SEÇÃO 3 — DUPLICATAS (só se houver) */}
            {duplicateConfirm.duplicates.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: TOM.alerta.text, flexShrink: 0 }} />
                  <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.10em', textTransform: 'uppercase', color: TOM.alerta.text, fontFamily: FONT.display }}>
                    Duplicatas detectadas — {duplicateConfirm.duplicates.length} {duplicateConfirm.duplicates.length === 1 ? 'conflito' : 'conflitos'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                  {duplicateConfirm.duplicates.map((dup, i) => (
                    <div key={i} style={{
                      backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`,
                      borderRadius: '8px', padding: '10px 14px',
                      display: 'flex', alignItems: 'center', gap: '10px',
                    }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: TOM.alerta.text, fontFamily: FONT.display, flexShrink: 0 }}>
                        {dup.existingItem.displayId}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: TOM.alerta.text, fontFamily: FONT.display, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {dup.existingItem.type}
                        </span>
                        {dup.existingItem.description && (
                          <span style={{ fontSize: '11px', color: TOM.alerta.text, fontFamily: FONT.corpo, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {dup.existingItem.description}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '11px', color: TOM.alerta.text, fontFamily: FONT.corpo, flexShrink: 0 }}>
                        {dup.existingItem.quantity}x
                      </span>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '13px', color: T.second, margin: '10px 0 0', fontFamily: FONT.corpo }}>
                  Você ainda pode confirmar — as peças serão criadas mesmo assim.
                </p>
              </div>
            )}

          </div>

          {/* ── RODAPÉ ── */}
          <div style={{
            padding: '16px 28px',
            borderTop: `1px solid ${T.border}`,
            backgroundColor: T.surface,
            borderRadius: '0 0 14px 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
            // No celular o texto ganha a linha dele e os botões descem: lado a
            // lado, o texto virava uma coluna de 8 linhas e o Confirmar vazava
            // pela borda (revisão visual de 07/10).
            flexWrap: 'wrap',
          }}>
            {/* O que o "Confirmar" faz, na hora de decidir: grava em
                RASCUNHO. Quem nunca usou achava que o lote já seguia para a
                vinculação — e esquecia o envio. */}
            <p style={{ margin: 0, fontSize: '13px', color: T.second, fontFamily: FONT.corpo, lineHeight: 1.45, flex: '1 1 220px', minWidth: 0 }}>
              {duplicateConfirm.valid.length} {duplicateConfirm.valid.length === 1 ? 'peça nova' : 'peças novas'} ·{' '}
              {existingItems.length} existentes no evento
              <span style={{ display: 'block', fontSize: '12px', color: T.apoio }}>
                {diretas.length === 0
                  ? 'Entram em Rascunho — depois, envie para a vinculação.'
                  : diretas.length === duplicateConfirm.valid.length
                    ? 'Entram em Rascunho — no envio, vão para a Gráfica.'
                    : 'Entram em Rascunho — as marcadas vão para a Gráfica no envio.'}
              </span>
            </p>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginLeft: 'auto' }}>
              <Botao variante="secundario" onClick={() => setDuplicateConfirm(null)}>
                Voltar e revisar
              </Botao>
              <Botao
                variante="primario"
                // carregando durante o envio: sem a guarda, dois cliques rápidos
                // antes do re-render disparavam onSubmit duas vezes — lote duplicado.
                carregando={isPending}
                onClick={() => { setDuplicateConfirm(null); onSubmit(duplicateConfirm.valid, leftoverCount); }}
                data-testid="button-confirm-duplicates"
              >
                <span>Confirmar Lote</span>
                <ArrowRight size={14} aria-hidden="true" />
              </Botao>
            </div>
          </div>

        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
