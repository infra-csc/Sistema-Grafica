// Os patrocinadores do evento, com a cota de cada um — a lista do formulário.
import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Building2, Search, ChevronDown, Sparkles } from "lucide-react";
import { textoDaCotaSugerida, type CotaSugerida } from "@shared/sugestao-de-vinculo";
import type { Sponsor } from "@shared/schema";
import { T, FS, R, N, TOM, FONT, FW } from "@/lib/theme";
import { EstadoVazio, EstadoErro } from "@/components/ui/estados";
import { QUOTA_OPTIONS } from "./constantes";
import type { FormularioDoEventoAberto } from "./use-formulario-do-evento";
import { ROTULO_DO_CAMPO, CAMPO } from "./campos-de-data";

export function EscolhaDePatrocinadores({ form, sponsors, sponsorsQueryLoading, sponsorsQueryError }: {
  form: FormularioDoEventoAberto;
  sponsors: Sponsor[];
  sponsorsQueryLoading: boolean;
  sponsorsQueryError: boolean;
}) {
  const {
    selectedSponsorIds, setSelectedSponsorIds, sponsorQuotaMap, setSponsorQuotaMap,
    sponsorsLoading, sponsorsError, sponsorSearch, setSponsorSearch,
    editingEvent, duplicateSource, fetchEventSponsors, ordemFixadaNoTopo, soPatrocinadoresNoModal,
  } = form;
  // De onde vêm os vínculos que o "Tentar de novo" relê (editar ou duplicar).
  const origemDosVinculos = editingEvent || duplicateSource;

  // COTA SUGERIDA (dono, 15/10): a cota mais recente de cada patrocinador em
  // OUTROS eventos. Ao MARCAR um patrocinador sem cota, ela já vem escolhida
  // (e a linha diz de onde veio); no vínculo que JÁ existe sem cota, a
  // sugestão aparece com um "Usar" — não grava sozinha.
  const { data: cotasCruas } = useQuery<Record<string, CotaSugerida>>({
    queryKey: editingEvent ? ["/api/cotas-sugeridas", `?exceto=${editingEvent.id}`] : ["/api/cotas-sugeridas"],
    staleTime: 5 * 60_000,
  });
  const cotasSugeridas: Record<string, CotaSugerida> = cotasCruas && typeof cotasCruas === 'object' && !Array.isArray(cotasCruas) ? cotasCruas : {};
  const sugestaoValida = (id: string) => {
    const c = cotasSugeridas[id];
    return c && QUOTA_OPTIONS.some((q) => q.value === c.cota) ? c : undefined;
  };
  // Quem teve a cota PREENCHIDA pela sugestão nesta abertura do formulário.
  const [preenchidas, setPreenchidas] = useState<Set<string>>(() => new Set());
  const marcarPatrocinador = (id: string) => {
    setSelectedSponsorIds(prev => (prev.includes(id) ? prev : [...prev, id]));
    const sug = sugestaoValida(id);
    if (sug && !sponsorQuotaMap[id]) {
      setSponsorQuotaMap(prev => (prev[id] ? prev : { ...prev, [id]: sug.cota }));
      setPreenchidas(prev => new Set(prev).add(id));
    }
  };
  const usarSugestao = (id: string) => {
    const sug = sugestaoValida(id);
    if (!sug) return;
    setSponsorQuotaMap(prev => ({ ...prev, [id]: sug.cota }));
    setPreenchidas(prev => new Set(prev).add(id));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label htmlFor="busca-patrocinador-do-evento" style={{ ...ROTULO_DO_CAMPO, display: 'flex', alignItems: 'center', gap: '6px', minHeight: 20 }}>
        Patrocinadores
        {/* Só patrocinadores (Atendimento): a lista é o formulário inteiro — "opcional" ali não diz nada. */}
        {!soPatrocinadoresNoModal && (
          <span style={{ color: T.second, fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: FS.small }}>(opcional)</span>
        )}
        {selectedSponsorIds.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: FS.micro, fontWeight: '700', color: T.accentText, background: TOM.laranja.bg, border: `1px solid ${TOM.laranja.border}`, borderRadius: R.pill, padding: '1px 8px', letterSpacing: 0, textTransform: 'none' }}>
            {selectedSponsorIds.length} selecionado{selectedSponsorIds.length > 1 ? 's' : ''}
          </span>
        )}
      </label>

      {(sponsorsQueryLoading || sponsorsLoading) ? (
        <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md, padding: '14px 16px' }} aria-busy="true" aria-label="Carregando patrocinadores">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse" style={{ height: '14px', borderRadius: '4px', backgroundColor: N.n2, width: `${88 - i * 9}%` }} />
          ))}
        </div>
      ) : (sponsorsQueryError || sponsorsError) ? (
        <EstadoErro
          compacto
          titulo="Não foi possível carregar os patrocinadores."
          aoTentarDeNovo={origemDosVinculos && sponsorsError
            ? () => fetchEventSponsors(origemDosVinculos.id, !!editingEvent)
            : undefined}
        />
      ) : sponsors.length === 0 ? (
        <EstadoVazio
          compacto
          icone={Building2}
          titulo="Nenhum patrocinador cadastrado."
          acao={<Link href="/patrocinadores" style={{ color: T.accentText, fontWeight: FW.medio, fontSize: FS.body }}>Cadastre agora</Link>}
        />
      ) : (
        <div style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md, overflow: 'hidden' }}>
          <div style={{ padding: 8, borderBottom: `1px solid ${T.border}`, position: 'relative', backgroundColor: T.bg }}>
            <Search aria-hidden="true" style={{ position: 'absolute', left: 19, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: T.muted, pointerEvents: 'none' }} />
            <input
              id="busca-patrocinador-do-evento"
              type="text"
              placeholder="Buscar patrocinador"
              aria-label="Buscar patrocinador"
              value={sponsorSearch}
              onChange={e => setSponsorSearch(e.target.value)}
              data-testid="input-sponsor-search"
              autoComplete="off"
              className="evl-campo"
              style={{
                ...CAMPO, height: 36, paddingLeft: 32, paddingRight: 10,
                borderRadius: R.sm, fontSize: FS.body,
              }}
            />
          </div>
          <div style={{ maxHeight: 248, overflowY: 'auto', overscrollBehavior: 'contain' }}>
            {(() => {
              const q = sponsorSearch.toLowerCase();
              // Selecionados FIXADOS no topo: numa lista alfabética
              // dentro de 200px eles ficavam espalhados, e o único
              // resumo era o contador. Com busca ativa, sumiam de
              // vista sem indicação de que continuavam marcados.
              // A ORDEM É CONGELADA ENQUANTO O FORMULÁRIO ESTÁ ABERTO.
              //
              // Ela continua trazendo os selecionados para o topo — o motivo
              // original: numa lista alfabética dentro de 200px eles ficavam
              // espalhados. O que mudou é QUANDO isso é decidido: quando a lista
              // aparece (abrir o formulário ou mudar a busca), e não a cada clique.
              //
              // Reordenar a cada clique punha as ~147 linhas em movimento de uma
              // vez. Cada troca de posição faz o React desanexar e reanexar a ref
              // de cada primitiva da linha, e cada uma dessas é um setState em fase
              // de commit: com a lista inteira se mexendo, a pilha de updates
              // aninhados passa dos 50 que o React admite e ele estoura o #185 —
              // que é o relato ("toda vez que adiciono um patrocinador ao evento").
              //
              // De quebra, a linha para de fugir do cursor: marcar um patrocinador
              // não o joga mais para o alto da lista.
              const filtered = [...sponsors]
                .filter(s => !q || s.name.toLowerCase().includes(q) || (s.company || '').toLowerCase().includes(q))
                .sort((a, b) => {
                  const selA = ordemFixadaNoTopo.has(a.id) ? 0 : 1;
                  const selB = ordemFixadaNoTopo.has(b.id) ? 0 : 1;
                  if (selA !== selB) return selA - selB;
                  return (a.name || '').localeCompare(b.name || '', 'pt-BR');
                });
              const hiddenSelected = selectedSponsorIds.filter((id) => !filtered.some((s) => s.id === id)).length;
              if (filtered.length === 0) return (
                <p style={{ fontSize: FS.body, color: T.second, textAlign: 'center', padding: '20px 12px', margin: 0 }}>
                  Nenhum resultado para "{sponsorSearch}"
                  {hiddenSelected > 0 ? ` — ${hiddenSelected} selecionado${hiddenSelected > 1 ? 's' : ''} continua${hiddenSelected > 1 ? 'm' : ''} marcado${hiddenSelected > 1 ? 's' : ''}.` : ''}
                </p>
              );
              return (
                <>
                  {hiddenSelected > 0 && (
                    <p style={{ fontSize: FS.small, color: T.accentText, fontWeight: 700, padding: '8px 14px', margin: 0, borderBottom: `1px solid ${N.n3}`, backgroundColor: TOM.laranja.bg }}>
                      +{hiddenSelected} selecionado{hiddenSelected > 1 ? 's' : ''} fora desta busca (continua{hiddenSelected > 1 ? 'm' : ''} marcado{hiddenSelected > 1 ? 's' : ''})
                    </p>
                  )}
                  {filtered.map((sponsor) => {
                    const isSelected = selectedSponsorIds.includes(sponsor.id);
                    const color = sponsor.color || TOM.info.dot;
                    const currentQuota = sponsorQuotaMap[sponsor.id] || '';
                    const quotaOpt = QUOTA_OPTIONS.find(q => q.value === currentQuota);
                    return (
                      <div
                        key={sponsor.id}
                        className="evl-opcao"
                        data-marcado={isSelected}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          minHeight: 48, padding: '6px 14px',
                          borderBottom: `1px solid ${N.n3}`,
                          backgroundColor: isSelected ? TOM.laranja.bg : 'transparent',
                          boxShadow: isSelected ? `inset 3px 0 0 ${T.accentText}` : 'none',
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedSponsorIds(prev => prev.filter(id => id !== sponsor.id));
                            setSponsorQuotaMap(prev => { const n = { ...prev }; delete n[sponsor.id]; return n; });
                          } else {
                            marcarPatrocinador(sponsor.id);
                          }
                        }}
                      >
                        <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: color, flexShrink: 0, boxShadow: `0 0 0 2px ${color}33` }} />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: FS.body, fontWeight: isSelected ? 700 : 500, color: T.text, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {sponsor.name}
                          </span>
                          {sponsor.company && (
                            <span style={{ fontSize: FS.small, color: T.second, display: 'block', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sponsor.company}</span>
                          )}
                          {/* COTA SUGERIDA: preenchida agora pela sugestão (a
                              frase diz de onde veio), ou vínculo sem cota com
                              a sugestão ao lado e o "Usar". */}
                          {isSelected && (() => {
                            const sug = sugestaoValida(sponsor.id);
                            if (!sug) return null;
                            const veioDaSugestao = currentQuota === sug.cota && preenchidas.has(sponsor.id);
                            if (!veioDaSugestao && currentQuota) return null;
                            return (
                              <span className="sug-cota" data-testid={`cota-sugerida-${sponsor.id}`}>
                                <Sparkles aria-hidden="true" style={{ width: 11, height: 11, flexShrink: 0 }} />
                                <span>{textoDaCotaSugerida(sug, (QUOTA_OPTIONS.find((q) => q.value === sug.cota)?.label ?? sug.cota).toUpperCase())}</span>
                                {!currentQuota && (
                                  <button
                                    type="button"
                                    className="sug-cota-usar"
                                    onClick={(e) => { e.stopPropagation(); usarSugestao(sponsor.id); }}
                                    aria-label={`Usar a cota sugerida ${sug.cota} para ${sponsor.name}`}
                                    data-testid={`usar-cota-sugerida-${sponsor.id}`}
                                  >
                                    Usar
                                  </button>
                                )}
                              </span>
                            );
                          })()}
                        </div>

                        {isSelected && (
                          // <select> NATIVO, não o Select do Radix.
                          //
                          // O Radix aqui travava a tela inteira: ao
                          // fechar o modal (Cancelar, X, Esc ou
                          // depois de salvar), o trigger soltava a
                          // ref, o Select voltava a se declarar
                          // controle de formulário e remontava o
                          // <select> escondido enquanto o Dialog
                          // ainda estava saindo — os dois ficavam
                          // montando e desmontando um ao outro até
                          // React #185 ("Maximum update depth") e
                          // "Erro de renderização" na tela toda.
                          // Reproduzido no dev: com o patrocinador
                          // desmarcado (sem este campo) o modal
                          // fecha limpo; com ele, quebra sempre.
                          //
                          // Escolher cota é uma lista curta de
                          // opção única — o nativo faz isso, é o
                          // melhor no celular e não tem ciclo de
                          // vida para conflitar com o modal.
                          <div style={{ flexShrink: 0, position: 'relative', display: 'inline-flex', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                            <select
                              value={currentQuota || '_none_'}
                              onChange={e => {
                                const val = e.target.value === '_none_' ? '' : e.target.value;
                                // Escolheu à mão: a frase "Sugerida" deixa de valer.
                                setPreenchidas(prev => { if (!prev.has(sponsor.id)) return prev; const n = new Set(prev); n.delete(sponsor.id); return n; });
                                setSponsorQuotaMap(prev => {
                                  const n = { ...prev };
                                  if (val) n[sponsor.id] = val; else delete n[sponsor.id];
                                  return n;
                                });
                              }}
                              data-testid={`quota-select-${sponsor.id}`}
                              aria-label={`Cota de ${sponsor.name}`}
                              style={{
                                appearance: 'none',
                                WebkitAppearance: 'none',
                                MozAppearance: 'none',
                                fontSize: FS.small,
                                fontWeight: 700,
                                letterSpacing: '0.05em',
                                textTransform: 'uppercase',
                                borderRadius: R.pill,
                                // Borda saturada + fundo tint 50 +
                                // texto tom 700: o par auditado da
                                // paleta. Antes o texto usava o hex
                                // saturado sobre 9% dele mesmo — 4
                                // das 6 cotas reprovavam AA em 11px.
                                border: `1.5px solid ${quotaOpt ? quotaOpt.dot : T.bdark}`,
                                backgroundColor: quotaOpt ? quotaOpt.bg : N.n3,
                                color: quotaOpt ? quotaOpt.text : T.strong,
                                height: '28px',
                                // Direita maior: a seta desenhada
                                // ao lado ocupa esse espaço.
                                padding: '0 26px 0 10px',
                                minWidth: '96px',
                                fontFamily: FONT.corpo,
                                boxShadow: 'none',
                                cursor: 'pointer',
                              }}
                            >
                              <option value="_none_">Sem cota</option>
                              {QUOTA_OPTIONS.map(q => (
                                <option key={q.value} value={q.value}>{q.label}</option>
                              ))}
                            </select>
                            <ChevronDown
                              aria-hidden="true"
                              style={{ position: 'absolute', right: 8, width: 12, height: 12, pointerEvents: 'none', color: quotaOpt ? quotaOpt.text : T.strong }}
                            />
                          </div>
                        )}

                        {/* CAIXA NATIVA, e não a primitiva do Radix. Está medido em
                            modal-congelado.test.ts: cinco renders do pai custam CINCO
                            desanexa+reanexa de ref numa primitiva do Radix e ZERO num
                            <input> nativo. Numa lista de 147 linhas que re-renderiza a
                            cada clique, é a diferença entre funcionar e estourar o #185.
                            O visual é o mesmo: laranja da marca via accent-color. */}
                        <input
                          type="checkbox"
                          id={`sponsor-${sponsor.id}`}
                          aria-label={sponsor.name}
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              marcarPatrocinador(sponsor.id);
                            } else {
                              setSelectedSponsorIds(prev => prev.filter(id => id !== sponsor.id));
                              setSponsorQuotaMap(prev => { const n = { ...prev }; delete n[sponsor.id]; return n; });
                            }
                          }}
                          onClick={e => e.stopPropagation()}
                          data-testid={`checkbox-sponsor-${sponsor.id}`}
                          // accentText e não accent: o visto branco sobre #f97316 fica em 2,8:1.
                          style={{ width: 18, height: 18, flexShrink: 0, accentColor: T.accentText, cursor: "pointer", margin: 0 }}
                        />
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
