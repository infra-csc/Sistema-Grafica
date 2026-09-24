import { AlertTriangle, Check, CheckCircle, ChevronsUpDown, RefreshCw, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Botao } from "@/components/ui/botao";
import { erroDeTamanhoDoUpload } from "@/lib/arte-rules";
import { T, TOM, N } from "@/lib/theme";
import type { BulkThumbEntry, EventoDaPeca, PecaDaArte, PecaDaCorrecao } from "./tipos";
import { fsToque } from "./constantes";
import type { LoteDeThumbs } from "./use-lote-de-thumbs";

/** Um arquivo do envio em lote: a imagem, o estado do envio e o vínculo com a peça. */
export function CartaoThumbEmLote({ entry, lote, itemPorId, correcaoItems, events, groupOf, isMobile, dedo }: {
  entry: BulkThumbEntry;
  lote: LoteDeThumbs;
  itemPorId: Map<string, PecaDaArte>;
  correcaoItems: PecaDaCorrecao[];
  events: EventoDaPeca[];
  groupOf: (type: string) => string;
  isMobile: boolean;
  dedo: boolean;
}) {
  const {
    setBulkThumbEntries, bulkThumbRunning, bulkThumbEventFilter, bulkThumbLinkOpenMap, setBulkThumbLinkOpenMap,
    bulkPendingPool, tentarDeNovoNoLote,
  } = lote;
  // Pool calculado uma vez fora do .map — ver bulkPendingPool.
  const pendingPool = bulkPendingPool;
  const matchedItem = entry.matchedItemId ? itemPorId.get(entry.matchedItemId) : undefined;
  const isLinked = !!entry.matchedItemId;

  const cardBorderColor = entry.status === 'done' ? TOM.sucesso.border
    : entry.status === 'error' ? TOM.perigo.border
    : entry.status === 'uploading' ? TOM.roxo.border
    : isLinked ? (entry.ambiguous ? TOM.alerta.border : TOM.info.border) : TOM.alerta.border;
  const cardAccentBg = entry.status === 'done' ? TOM.sucesso.bg
    : entry.status === 'error' ? TOM.perigo.bg
    : entry.status === 'uploading' ? TOM.roxo.bg
    : isLinked ? (entry.ambiguous ? TOM.alerta.bg : TOM.info.bg) : TOM.alerta.bg;

  return (
    <div data-testid={`bulk-thumb-card-${entry.id}`} style={{
      display: 'flex', alignItems: 'stretch', gap: 0,
      // flexShrink 0 + minHeight: a lista é uma coluna flex de altura
      // fixa, e o cartão tem overflow hidden — com 20+ arquivos o
      // navegador ESPREMIA todos em tirinhas em vez de rolar (dono, 21/09).
      flexShrink: 0, minHeight: 80,
      borderRadius: 12, border: `1.5px solid ${cardBorderColor}`,
      backgroundColor: T.surface,
      overflow: 'hidden', position: 'relative',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      transition: 'box-shadow 0.12s',
    }}>
      {/* ── Thumbnail quadrado ── */}
      <div style={{ position: 'relative', width: 80, flexShrink: 0, backgroundColor: T.low }}>
        <img loading="lazy" decoding="async" src={entry.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', minHeight: 80 }} />
        {/* Status pill */}
        <div style={{ position: 'absolute', bottom: 4, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
          {entry.status === 'done' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 999, backgroundColor: TOM.sucesso.text, color: T.surface, fontSize: fsToque(10, dedo), fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
              <CheckCircle style={{ width: 8, height: 8 }} /> OK
            </span>
          )}
          {entry.status === 'uploading' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 999, backgroundColor: TOM.roxo.text, color: T.surface, fontSize: fsToque(10, dedo), fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.4)', borderTopColor: T.surface, animation: 'spin 0.8s linear infinite' }} />
            </span>
          )}
          {entry.status === 'error' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 999, backgroundColor: TOM.perigo.text, color: T.surface, fontSize: fsToque(10, dedo), fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
              Erro
            </span>
          )}
          {entry.status === 'pending' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 999, backgroundColor: isLinked ? TOM.info.text : TOM.alerta.text, color: T.surface, fontSize: fsToque(10, dedo), fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>
              {isLinked ? '✓' : '?'}
            </span>
          )}
        </div>
      </div>

      {/* ── Card info ── */}
      <div style={{ flex: 1, padding: '10px 12px', borderLeft: `3px solid ${cardBorderColor}`, backgroundColor: cardAccentBg, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
        {/* Top row: filename + remove */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: T.text, margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.file.name}>
              {entry.file.name}
            </p>
            <p style={{ fontSize: fsToque(11, dedo), color: T.apoio, margin: 0 }}>
              {(entry.file.size / 1024).toFixed(0)} KB
            </p>
          </div>
          {(entry.status === 'pending' || entry.status === 'error') && (
            <button
              onClick={() => setBulkThumbEntries(prev => prev.filter(e => {
                if (e.id !== entry.id) return true;
                URL.revokeObjectURL(e.preview); // libera o blob do preview
                return false;
              }))}
              aria-label={`Remover ${entry.file.name}`}
              style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', backgroundColor: N.n2, border: `1px solid ${T.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = TOM.perigo.bg; e.currentTarget.style.borderColor = TOM.perigo.border; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = N.n2; e.currentTarget.style.borderColor = T.border; }}
            >
              <X style={{ width: 13, height: 13, color: T.apoio }} />
            </button>
          )}
        </div>

        {/* ── State-specific content ── */}
        {entry.status === 'done' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', borderRadius: 6, backgroundColor: TOM.sucesso.bg, border: `1px solid ${TOM.sucesso.border}` }}>
            <CheckCircle style={{ width: 11, height: 11, color: TOM.sucesso.text, flexShrink: 0 }} />
            <p style={{ fontSize: fsToque(11, dedo), fontWeight: 700, color: TOM.sucesso.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {matchedItem?.displayId} · {matchedItem?.type?.slice(0, 28)}
            </p>
          </div>
        ) : entry.status === 'uploading' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 6, backgroundColor: TOM.roxo.bg, border: `1px solid ${TOM.roxo.border}` }}>
            <div style={{ width: 11, height: 11, borderRadius: '50%', border: `2px solid ${TOM.roxo.border}`, borderTopColor: TOM.roxo.text, animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
            <span style={{ fontSize: fsToque(11, dedo), color: TOM.roxo.text, fontWeight: 600 }}>Enviando...</span>
          </div>
        ) : entry.status === 'error' ? (
          <div style={{ padding: '5px 8px', borderRadius: 6, backgroundColor: TOM.perigo.bg, border: `1px solid ${TOM.perigo.border}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* A frase do servidor inteira, quebrando linha: cortada
                em reticências ela escondia justamente o que fazer. */}
            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
              <p style={{ fontSize: fsToque(11, dedo), fontWeight: 700, color: TOM.perigo.text, margin: '0 0 1px' }}>Falha no envio</p>
              <p data-testid={`bulk-thumb-erro-${entry.id}`} style={{ fontSize: fsToque(11, dedo), color: TOM.perigo.text, margin: 0, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{entry.errorMsg}</p>
            </div>
            {/* Sem retentativa para o grande demais: o mesmo arquivo
                falharia de novo. Sem peça vinculada, falta escolher. */}
            {!erroDeTamanhoDoUpload(entry.file) && isLinked && (
              <Botao
                variante="secundario"
                tamanho={dedo ? "toque" : "sm"}
                icone={RefreshCw}
                onClick={() => tentarDeNovoNoLote(entry.id)}
                disabled={bulkThumbRunning}
                data-testid={`button-bulk-thumb-tentar-${entry.id}`}
                style={{ flexShrink: 0, color: TOM.perigo.text, borderColor: TOM.perigo.border }}
              >
                Tentar de novo
              </Botao>
            )}
          </div>
        ) : isLinked && matchedItem ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, padding: '5px 8px', borderRadius: 6, backgroundColor: TOM.info.bg, border: `1px solid ${TOM.info.border}`, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: fsToque(11, dedo), fontWeight: 800, color: TOM.info.text, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>{matchedItem.displayId}</span>
                <span style={{ fontSize: fsToque(11, dedo), fontWeight: 700, color: TOM.info.text, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{matchedItem.type}</span>
              </div>
              {matchedItem.event?.name && (
                <p style={{ fontSize: fsToque(11, dedo), color: TOM.info.text, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{matchedItem.event.name}</p>
              )}
              {/* Peça da CORREÇÃO não tem rascunho: os dois
                  botões do rodapé a reenviam (ver o title de
                  "Salvar como rascunho"). Dito no card,
                  antes do clique (rodada 4). */}
              {correcaoItems.some((c) => c.id === matchedItem.id) && (
                <p data-testid={`aviso-correcao-no-lote-${entry.id}`} style={{ fontSize: fsToque(11, dedo), fontWeight: 700, color: TOM.perigo.text, margin: '3px 0 0' }}>
                  Na Correção — vai como nova versão
                </p>
              )}
              {/* O nome do arquivo tinha mais de um número
                  candidato (ou um que parece ano): o vínculo
                  foi feito pelo último, que é a convenção,
                  mas concentra a atenção onde ela vale. */}
              {entry.ambiguous && (
                <p data-testid={`aviso-vinculo-duvidoso-${entry.id}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: fsToque(11, dedo), fontWeight: 700, color: TOM.alerta.text, margin: '3px 0 0' }}>
                  <AlertTriangle style={{ width: 10, height: 10, flexShrink: 0 }} />
                  Confira este vínculo
                </p>
              )}
            </div>
            <Botao
              variante="secundario"
              tamanho={dedo ? "toque" : "sm"}
              onClick={() => setBulkThumbEntries(prev => prev.map(en => en.id === entry.id ? { ...en, matchedItemId: null, ambiguous: false } : en))}
              title="Trocar vínculo"
              aria-label={`Trocar a peça vinculada a ${entry.file.name}`}
              style={{ flexShrink: 0, color: TOM.info.text, borderColor: TOM.info.border }}
            >Trocar</Botao>
          </div>
        ) : (
          /* ── Sem vínculo: combobox pesquisável com grupos ── */
          <div>
            {(() => {
              const linked = entry.matchedItemId ? itemPorId.get(entry.matchedItemId) : undefined;
              const isOpen = !!bulkThumbLinkOpenMap[entry.id];
              // Agrupar por grupo/tipo
              const grouped = pendingPool.reduce((acc: Record<string, PecaDaArte[]>, item) => {
                const g = groupOf(item.type) || item.type;
                if (!acc[g]) acc[g] = [];
                acc[g].push(item);
                return acc;
              }, {});
              const groupKeys = Object.keys(grouped).sort();
              return (
                <Popover
                  open={isOpen}
                  onOpenChange={open => setBulkThumbLinkOpenMap(prev => ({ ...prev, [entry.id]: open }))}
                >
                  <PopoverTrigger asChild>
                    <button style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
                      height: 32, borderRadius: 6,
                      border: `1px solid ${isLinked ? TOM.info.border : T.border}`,
                      backgroundColor: T.surface, fontSize: fsToque(11, dedo), fontWeight: 600,
                      color: linked ? T.text : T.second, padding: '0 8px', cursor: 'pointer',
                    }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {linked
                          ? `${linked.displayId} · ${linked.type}`
                          : 'Selecionar peça...'}
                      </span>
                      <ChevronsUpDown style={{ width: 10, height: 10, color: T.apoio, flexShrink: 0 }} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0" style={{ width: isMobile ? '90vw' : 320 }} align="start">
                    <Command>
                      <CommandInput placeholder="Buscar por ID, tipo ou descrição..." />
                      <CommandList style={{ maxHeight: 280 }}>
                        <CommandEmpty>Nenhuma peça encontrada.</CommandEmpty>
                        {pendingPool.length === 0 && (
                          <div style={{ padding: '9px 16px', fontSize: fsToque(11, dedo), color: TOM.alerta.text, fontWeight: 600, lineHeight: 1.5 }}>
                            Nenhuma peça pronta para receber thumb
                            {bulkThumbEventFilter !== "all" ? " neste evento" : ""}.
                            <span style={{ display: 'block', fontWeight: 500, color: T.apoio, marginTop: 4 }}>
                              Só aparecem peças aguardando envio ou em correção. Se a peça é nova,
                              ela precisa passar antes por <b>Vincular Patrocinadores</b>.
                              {bulkThumbEventFilter !== "all" && " Você também pode trocar o filtro de evento para 'Todos'."}
                            </span>
                          </div>
                        )}
                        {entry.matchedItemId && (
                          <CommandGroup heading="Selecionado">
                            <CommandItem
                              value="clear"
                              onSelect={() => {
                                setBulkThumbEntries(prev => prev.map(en => en.id === entry.id ? { ...en, matchedItemId: null, ambiguous: false } : en));
                                setBulkThumbLinkOpenMap(prev => ({ ...prev, [entry.id]: false }));
                              }}
                            >
                              <X style={{ width: 10, height: 10, marginRight: 6, flexShrink: 0, color: TOM.perigo.text }} />
                              <span style={{ color: TOM.perigo.text, fontSize: fsToque(11, dedo) }}>Remover vínculo</span>
                            </CommandItem>
                          </CommandGroup>
                        )}
                        {groupKeys.map(groupKey => (
                          <CommandGroup key={groupKey} heading={groupKey}>
                            {grouped[groupKey].map((item) => {
                              const evtName = events.find(e => e.id === item.eventId)?.name || '';
                              const searchVal = `${item.displayId} ${item.type} ${item.description || ''} ${evtName}`;
                              return (
                                <CommandItem
                                  key={item.id}
                                  value={searchVal}
                                  className="data-[selected=true]:bg-stone-100 data-[selected=true]:text-stone-900"
                                  onSelect={() => {
                                    setBulkThumbEntries(prev => prev.map(en => en.id === entry.id ? { ...en, matchedItemId: item.id, ambiguous: false } : en));
                                    setBulkThumbLinkOpenMap(prev => ({ ...prev, [entry.id]: false }));
                                  }}
                                >
                                  <Check style={{ width: 10, height: 10, color: TOM.sucesso.text, opacity: entry.matchedItemId === item.id ? 1 : 0, marginRight: 4, flexShrink: 0 }} />
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', minWidth: 0 }}>
                                    {/* displayId — destaque */}
                                    <span style={{ fontSize: fsToque(11, dedo), fontWeight: 800, color: T.text, fontFamily: '"Space Grotesk", sans-serif', flexShrink: 0 }}>{item.displayId}</span>
                                    {/* descrição ou evento — o tipo já aparece no cabeçalho do grupo */}
                                    {(item.description || evtName) && (
                                      <span style={{ fontSize: fsToque(11, dedo), color: T.apoio, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {item.description ? item.description.slice(0, 48) : evtName}
                                      </span>
                                    )}
                                  </div>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
