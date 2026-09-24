import type { Dispatch, SetStateAction } from "react";
import { ChevronDown } from "lucide-react";
import { alvo } from "@/hooks/use-mobile";
import { diasNaFase } from "@/lib/idade-na-fase";
import { getApprovalMeta } from "@/lib/status";
import { T, TOM, N } from "@/lib/theme";
import { TRAVANDO_CHIPS_VISIBLE, fsToque } from "./constantes";
import type { PecaDaArte } from "./tipos";

/**
 * "Quem está travando" — o ranking das marcas que seguram aprovação, só na
 * fila "Aguardando patrocinador". Clicar numa marca filtra por ela.
 */
export function FaixaTravando({
  items, tabId, hoje, emCartoes, dedo,
  showAllTravando, setShowAllTravando, travandoAberto, setTravandoAberto, sponsorFilter, setSponsorFilter,
}: {
  items: PecaDaArte[];
  tabId: string;
  hoje: Date;
  emCartoes: boolean;
  dedo: boolean;
  showAllTravando: boolean;
  setShowAllTravando: Dispatch<SetStateAction<boolean>>;
  travandoAberto: boolean;
  setTravandoAberto: Dispatch<SetStateAction<boolean>>;
  sponsorFilter: string[];
  setSponsorFilter: Dispatch<SetStateAction<string[]>>;
}) {
  // QUEM ESTÁ TRAVANDO — só na fila que espera patrocinador. Um chip por
  // marca com aprovação pendente: nome, quantas peças e a espera mais antiga
  // (a idade na fase da peça mais parada que a espera — a aprovação não
  // traz carimbo próprio no payload, e a peça entrou na fase quando foi
  // enviada a todos). Clicar filtra por ele — o `sponsorFilter` já existe.
  const travando = tabId === "aguardando-patrocinador" ? (() => {
    const m = new Map<string, { id: string; nome: string; pecas: number; espera: number }>();
    for (const i of items) {
      for (const s of (i.sponsors ?? [])) {
        if (getApprovalMeta(s.approvalStatus)?.tone !== "waiting") continue;
        const e = m.get(s.id) ?? { id: s.id, nome: s.name, pecas: 0, espera: 0 };
        e.pecas += 1;
        e.espera = Math.max(e.espera, diasNaFase(i, hoje) ?? 0);
        m.set(s.id, e);
      }
    }
    return Array.from(m.values()).sort((a, b) => b.espera - a.espera || b.pecas - a.pecas);
  })() : [];

  // O desenho: só as TRAVANDO_CHIPS_VISIBLE piores ficam à vista (a ordenação
  // já é espera ↓, peças ↓), o resto atrás de "+ N outras"; o chip veste a cor
  // da gravidade (a régua de tomDaIdade: ≥14d vermelho, 7–13d âmbar, <7d
  // neutro); e o cabeçalho resume a conta ("N marcas seguram M aprovações").
  if (travando.length === 0) return null;
  // O chip LIGADO nunca se esconde atrás do "+ N outras": é ele que
  // carrega o caminho de volta ("mostrar todas as peças de novo").
  const visiveis = showAllTravando ? travando : (() => {
    const corte = travando.slice(0, TRAVANDO_CHIPS_VISIBLE);
    const ligadoFora = sponsorFilter.length === 1 && !corte.some(t => t.id === sponsorFilter[0])
      ? travando.find(t => t.id === sponsorFilter[0])
      : undefined;
    return ligadoFora ? [...corte, ligadoFora] : corte;
  })();
  const ocultas = travando.length - visiveis.length;
  const pendencias = travando.reduce((s, t) => s + t.pecas, 0);
  // TERCEIRA forma (dono, 27/08: "urgentemente, está péssimo"): as
  // pílulas em fila tinham todas o mesmo peso — seis nomes brancos
  // idênticos não respondem "quem é o pior". Virou RANKING com barra:
  // a barra é proporcional ao nº de aprovações seguradas (o pior
  // salta aos olhos antes de qualquer leitura), a cor é a idade da
  // espera, e o clique continua filtrando.
  const pele = (espera: number, ligado: boolean) => {
    if (ligado) return { bg: T.text, borda: T.text, texto: T.surface, barra: TOM.laranja.dot, trilho: 'rgba(255,255,255,0.16)', sub: 'rgba(255,255,255,0.65)' };
    if (espera >= 14) return { bg: TOM.perigo.bg, borda: TOM.perigo.border, texto: TOM.perigo.text, barra: TOM.perigo.text, trilho: TOM.perigo.bg, sub: TOM.perigo.text };
    if (espera >= 7) return { bg: TOM.alerta.bg, borda: TOM.alerta.border, texto: TOM.alerta.text, barra: TOM.alerta.dot, trilho: TOM.alerta.bg, sub: TOM.alerta.text };
    return { bg: T.surface, borda: T.border, texto: T.strong, barra: T.muted, trilho: N.n3, sub: T.second };
  };
  const teto = Math.max(1, ...travando.map(t => t.pecas));
  // Com uma marca ligada no filtro o ranking fica aberto: é nele que
  // mora o caminho de volta ("mostrar todas as peças de novo").
  const rankingAberto = travandoAberto || (sponsorFilter.length === 1 && travando.some(t => t.id === sponsorFilter[0]));
  return (
    <div data-testid="faixa-travando" style={{ borderRadius: 12, background: T.surface, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', padding: '10px 14px', background: T.bg, borderBottom: `1px solid ${N.n3}` }}>
        <span style={{ fontSize: fsToque(11, dedo), fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.apoio, whiteSpace: 'nowrap' }}>Quem está travando</span>
        <span data-testid="travando-resumo" style={{ fontSize: 12, color: T.second }}>
          {travando.length} {travando.length === 1 ? 'marca segura' : 'marcas seguram'} {pendencias} {pendencias === 1 ? 'aprovação' : 'aprovações'}
          {travando[0].espera > 0 ? ` — a mais antiga espera há ${travando[0].espera}d` : ''}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setTravandoAberto(v => !v)}
          aria-expanded={rankingAberto}
          aria-controls="ranking-travando"
          data-testid="button-travando-ranking"
          style={{ font: 'inherit', border: 'none', background: 'transparent', padding: '0 4px', minHeight: alvo(28, dedo), color: T.strong, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          {rankingAberto ? 'Recolher' : 'Ver quem'}
          <ChevronDown aria-hidden="true" style={{ width: 12, height: 12, transform: rankingAberto ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
        </button>
        {rankingAberto && (ocultas > 0 || showAllTravando) && (
          <button
            type="button"
            onClick={() => setShowAllTravando(v => !v)}
            data-testid="button-travando-todas"
            style={{ font: 'inherit', border: 'none', background: 'transparent', padding: 0, minHeight: alvo(28, dedo), color: T.accentText, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: TOM.laranja.border }}
          >
            {showAllTravando ? 'Mostrar menos' : `Ver as ${ocultas} outra${ocultas !== 1 ? 's' : ''}`}
          </button>
        )}
      </div>
      {rankingAberto && (
      <div id="ranking-travando" style={{ display: 'grid', gridTemplateColumns: emCartoes ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', columnGap: 18, padding: '4px 14px 8px' }}>
        {visiveis.map(t => {
          const ligado = sponsorFilter.length === 1 && sponsorFilter[0] === t.id;
          const p = pele(t.espera, ligado);
          const rank = travando.findIndex(x => x.id === t.id) + 1;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSponsorFilter(ligado ? [] : [t.id])}
              aria-pressed={ligado}
              data-testid={`chip-travando-${t.id}`}
              title={ligado
                ? 'Mostrar todas as peças de novo'
                : `Ver só as ${t.pecas} ${t.pecas === 1 ? 'peça que espera' : 'peças que esperam'} ${t.nome}${t.espera > 0 ? ` — a mais antiga há ${t.espera}d` : ' — chegou hoje'}`}
              style={{
                display: 'block', width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer',
                padding: '8px 10px', margin: '4px 0', borderRadius: 9,
                border: `1px solid ${ligado ? T.text : 'transparent'}`,
                background: ligado ? T.text : 'transparent',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (!ligado) e.currentTarget.style.background = T.bg; }}
              onMouseLeave={e => { e.currentTarget.style.background = ligado ? T.text : 'transparent'; }}
            >
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
                <span aria-hidden style={{ fontFamily: "'DM Mono', monospace", fontSize: fsToque(10.5, dedo), fontWeight: 700, color: ligado ? 'rgba(255,255,255,0.72)' : T.second, minWidth: 16 }}>{rank}º</span>
                <span style={{ fontSize: fsToque(12.5, dedo), fontWeight: 700, color: ligado ? T.surface : T.text, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere', minWidth: 0, flex: 1 }}>{t.nome}</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: fsToque(12.5, dedo), fontWeight: 800, color: ligado ? T.surface : p.texto, whiteSpace: 'nowrap' }}>{t.pecas}</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: fsToque(11, dedo), fontWeight: 700, color: ligado ? 'rgba(255,255,255,0.8)' : p.sub, whiteSpace: 'nowrap', minWidth: 38, textAlign: 'right' }}>
                  {t.espera > 0 ? `+${t.espera}d` : 'hoje'}
                </span>
              </span>
              {/* A barra: proporcional ao nº de aprovações que a marca
                  segura, na cor da idade da espera — o pior caso é o
                  maior E o mais vermelho, sem ler número nenhum. */}
              <span aria-hidden style={{ display: 'block', height: 5, borderRadius: 999, background: p.trilho, overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${Math.max(8, Math.round((t.pecas / teto) * 100))}%`, borderRadius: 999, background: p.barra }} />
              </span>
            </button>
          );
        })}
      </div>
      )}
    </div>
  );
}
