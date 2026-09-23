// Os patrocinadores do evento, com a cota de cada um — a lista do formulário.
import { Link } from "wouter";
import { Building2, Search, ChevronDown } from "lucide-react";
import type { Sponsor } from "@shared/schema";
import { T, FS, R, N, TOM, FONT, FW } from "@/lib/theme";
import { EstadoVazio, EstadoErro } from "@/components/ui/estados";
import { QUOTA_OPTIONS } from "./constantes";
import type { FormularioDoEventoAberto } from "./use-formulario-do-evento";

export function EscolhaDePatrocinadores({ form, sponsors, sponsorsQueryLoading, sponsorsQueryError }: {
  form: FormularioDoEventoAberto;
  sponsors: Sponsor[];
  sponsorsQueryLoading: boolean;
  sponsorsQueryError: boolean;
}) {
  const {
    selectedSponsorIds, setSelectedSponsorIds, sponsorQuotaMap, setSponsorQuotaMap,
    sponsorsLoading, sponsorsError, sponsorSearch, setSponsorSearch,
    editingEvent, duplicateSource, fetchEventSponsors, ordemFixadaNoTopo,
  } = form;
  // De onde vêm os vínculos que o "Tentar de novo" relê (editar ou duplicar).
  const origemDosVinculos = editingEvent || duplicateSource;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label style={{ fontSize: FS.micro, fontWeight: '700', color: T.apoio, textTransform: 'uppercase', letterSpacing: '0.12em', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Building2 style={{ width: '12px', height: '12px', color: T.accent }} />
        Patrocinadores
        <span style={{ color: T.second, fontWeight: '400', textTransform: 'none', letterSpacing: 0 }}>(opcional)</span>
        {selectedSponsorIds.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: FS.micro, fontWeight: '700', color: T.accentText, background: TOM.laranja.bg, border: `1px solid ${TOM.laranja.border}`, borderRadius: R.pill, padding: '1px 8px', letterSpacing: 0, textTransform: 'none' }}>
            {selectedSponsorIds.length} selecionado{selectedSponsorIds.length > 1 ? 's' : ''}
          </span>
        )}
      </label>

      {(sponsorsQueryLoading || sponsorsLoading) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: T.surface, border: `1px solid ${N.n3}`, borderRadius: R.md, padding: '14px 16px' }} aria-busy="true" aria-label="Carregando patrocinadores">
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
        <div style={{ backgroundColor: N.n3, borderRadius: R.lg, overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${T.border}`, position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 22, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: T.muted, pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Buscar patrocinador..."
              aria-label="Buscar patrocinador"
              value={sponsorSearch}
              onChange={e => setSponsorSearch(e.target.value)}
              data-testid="input-sponsor-search"
              style={{
                width: '100%', paddingLeft: 28, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
                backgroundColor: T.surface, border: 'none', borderRadius: R.sm,
                fontSize: FS.body, color: T.text, boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '8px 0' }}>
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
                <p style={{ fontSize: FS.body, color: T.second, textAlign: 'center', padding: '16px 12px' }}>
                  Nenhum resultado para "{sponsorSearch}"
                  {hiddenSelected > 0 ? ` — ${hiddenSelected} selecionado${hiddenSelected > 1 ? 's' : ''} continua${hiddenSelected > 1 ? 'm' : ''} marcado${hiddenSelected > 1 ? 's' : ''}.` : ''}
                </p>
              );
              return (
                <>
                  {hiddenSelected > 0 && (
                    <p style={{ fontSize: FS.micro, color: T.accentText, fontWeight: 700, padding: '0 14px 8px' }}>
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
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '9px 14px',
                          borderBottom: `1px solid ${N.n3}`,
                          backgroundColor: isSelected ? TOM.laranja.bg : 'transparent',
                          transition: 'background-color 0.12s',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = N.n3; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? TOM.laranja.bg : 'transparent'; }}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedSponsorIds(prev => prev.filter(id => id !== sponsor.id));
                            setSponsorQuotaMap(prev => { const n = { ...prev }; delete n[sponsor.id]; return n; });
                          } else {
                            setSelectedSponsorIds(prev => [...prev, sponsor.id]);
                          }
                        }}
                      >
                        <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: color, flexShrink: 0, boxShadow: `0 0 0 2px ${color}33` }} />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: FS.body, fontWeight: isSelected ? 700 : 500, color: T.text, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {sponsor.name}
                          </span>
                          {sponsor.company && (
                            <span style={{ fontSize: FS.micro, color: T.second, display: 'block', lineHeight: 1.2 }}>{sponsor.company}</span>
                          )}
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
                              setSelectedSponsorIds(prev => [...prev, sponsor.id]);
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
