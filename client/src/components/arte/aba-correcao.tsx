import { memo, type Dispatch, type SetStateAction } from "react";
import { ArrowRight, CheckCircle, Search } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/estados";
import { alvo } from "@/hooks/use-mobile";
import { T, TOM, FONT } from "@/lib/theme";
import { CartaoDaCorrecao } from "./cartao-da-correcao";
import { ErroDeCarga } from "./erro-de-carga";
import { fsToque } from "./constantes";
import type { PecaDaCorrecao } from "./tipos";

export interface PropsDaAbaCorrecao {
  correcaoLoading: boolean;
  correcaoIsError: boolean;
  correcaoError: unknown;
  refetchCorrecao: () => unknown;
  correcaoItems: PecaDaCorrecao[];
  /** A fila já com o MESMO predicado de filtro das outras abas. */
  correcaoFiltrados: PecaDaCorrecao[];
  correcaoSponsorFilter: string;
  setCorrecaoSponsorFilter: Dispatch<SetStateAction<string>>;
  activeFilterCount: number;
  clearAllFilters: () => void;
  podeEditar: boolean;
  dedo: boolean;
  emCartoes: boolean;
  hoje: Date;
  groupOf: (type: string) => string;
  abrirCorrecao: (item: PecaDaCorrecao) => void;
  /** A próxima fase com peças em que a Arte age (fila vazia). */
  proximaFase?: () => { label: string; count: number; ir: () => void } | undefined;
}

/**
 * A aba Correção — as peças que um patrocinador reprovou. Memoizada pelo
 * mesmo motivo da FilaAgrupada: digitar num modal não redesenha a grade.
 */
export const AbaCorrecao = memo(function AbaCorrecao({
  correcaoLoading, correcaoIsError, correcaoError, refetchCorrecao, correcaoItems, correcaoFiltrados,
  correcaoSponsorFilter, setCorrecaoSponsorFilter, activeFilterCount, clearAllFilters,
  podeEditar, dedo, emCartoes, hoje, groupOf, abrirCorrecao, proximaFase,
}: PropsDaAbaCorrecao) {
  if (correcaoLoading) {
    return (
      // Um spinner sozinho não diz o que está carregando — e esta aba demora
      // mais que as outras, porque a fila de correção é uma rota própria.
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '48px 0' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: `3px solid ${T.border}`, borderTopColor: T.accent, animation: 'spin 0.8s linear infinite' }} />
        <p style={{ margin: 0, fontSize: 13, color: T.apoio }}>Carregando a fila de correção…</p>
      </div>
    );
  }
  // Falha da rota de correção também não pode virar "sem correção pendente".
  if (correcaoIsError) {
    return (
      <ErroDeCarga
        titulo="Não foi possível carregar a fila de correção"
        erro={correcaoError}
        tentarDeNovo={() => { void refetchCorrecao(); }}
        testId="erro-correcao"
      />
    );
  }
  if (correcaoItems.length === 0) {
    // O mesmo próximo passo das outras filas vazias (VazioDaFila): a próxima
    // fase com peças em que a Arte age — sem varrer as abas.
    const destino = proximaFase?.();
    return (
      <EstadoVazio
        icone={CheckCircle}
        titulo="Sem correção pendente"
        descricao="Nenhuma peça aguarda nova versão de arte"
        acao={destino ? (
          <Botao variante="primario" tamanho={dedo ? "toque" : "md"} onClick={destino.ir} data-testid="button-empty-proxima-fase-correcao">
            Ir para {destino.label} ({destino.count})
            <ArrowRight aria-hidden="true" style={{ width: 14, height: 14 }} />
          </Botao>
        ) : undefined}
      />
    );
  }

  // MESMO predicado das outras abas (correcaoFiltrados): esta lista só
  // conhecia evento, tipo, material, patrocinador e busca, então ligar
  // "Saída 10 dias" acendia o chip e devolvia a lista inteira — pior que não
  // ter o filtro, porque o chip afirmava que ele estava ativo.
  const baseItems = correcaoFiltrados;

  if (baseItems.length === 0) {
    return (
      <EstadoVazio
        icone={Search}
        titulo="Nenhuma correção neste recorte"
        descricao={`Há ${correcaoItems.length} ${correcaoItems.length === 1 ? 'peça aguardando correção' : 'peças aguardando correção'} fora dos filtros atuais`}
        acao={activeFilterCount > 0 ? (
          <Botao variante="secundario" tamanho={dedo ? "toque" : "md"} onClick={clearAllFilters} data-testid="button-clear-filters-correcao">
            Limpar {activeFilterCount === 1 ? 'o filtro' : `os ${activeFilterCount} filtros`}
          </Botao>
        ) : undefined}
      />
    );
  }

  // Cor ausente vira `undefined`: sem bolinha pintada, como era com `null`.
  const correcaoSponsors: { id: string; name: string; color?: string }[] = [];
  const seenSponsorIds = new Set<string>();
  baseItems.forEach((item) => {
    (item.awaitingArteApprovals || []).forEach((a) => {
      if (a.sponsor && !seenSponsorIds.has(a.sponsorId)) {
        seenSponsorIds.add(a.sponsorId);
        correcaoSponsors.push({ id: a.sponsorId, name: a.sponsor.name, color: a.sponsor.color ?? undefined });
      }
    });
  });

  const filteredCorrecaoItems = correcaoSponsorFilter === "all"
    ? baseItems
    : baseItems.filter((item) => (item.awaitingArteApprovals || []).some((a) => a.sponsorId === correcaoSponsorFilter));

  return (
    <div>
      {/* MODO CONSULTA — por que não há botão.

          Sem papel de edição o "Enviar nova arte" simplesmente não é
          renderizado (`podeEditar`), e a fila fica parecendo uma lista de
          problemas sem saída. A faixa diz que a ausência é permissão, não
          defeito. */}
      {!podeEditar && (
        <div style={{ border: `1px solid ${T.border}`, background: T.surface, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: T.apoio, lineHeight: 1.5 }}>
          <strong style={{ color: T.text }}>Modo consulta.</strong>{' '}
          Você acompanha a fila e abre as versões enviadas, mas não envia arte nova.
        </div>
      )}
      {/* Section header */}
      <div style={{ marginBottom: 20 }}>
        {/* O ÍCONE VIRA MARCADOR. Um triângulo de alerta de 20px no título
            de uma aba que INTEIRA é sobre peças recusadas não distingue nada
            — todo card abaixo dele é um alerta. O quadradinho dá a cor do
            estado sem gritar, e o total da fila sobe para a mesma linha. */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: FONT.display, fontSize: 17, fontWeight: 700, color: T.text, letterSpacing: '-0.03em', margin: 0 }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: TOM.perigo.text, display: 'inline-block' }} />
            Aguardando correções
          </h2>
          <p style={{ margin: 0, fontSize: 12, color: T.apoio, fontVariantNumeric: 'tabular-nums' }}>
            {filteredCorrecaoItems.length} {filteredCorrecaoItems.length === 1 ? 'peça na fila' : 'peças na fila'}
          </p>
        </div>

        {/* Sponsor filter pills */}
        {correcaoSponsors.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: dedo ? 8 : 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: fsToque(11, dedo), fontWeight: 600, color: T.apoio, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Filtrar</span>
            {[{ id: "all", name: "Todos", color: T.second }, ...correcaoSponsors].map(sp => {
              const isActive = correcaoSponsorFilter === sp.id;
              return (
                <button
                  key={sp.id}
                  onClick={() => setCorrecaoSponsorFilter(sp.id)}
                  aria-pressed={isActive}
                  data-testid={`filter-correcao-sponsor-${sp.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    // 36 como todo controle da casa. E hairline no ativo: o
                    // 1,5px empurrava a pílula meio pixel e desalinhava a
                    // linha inteira quando uma delas era selecionada.
                    height: alvo(36, dedo), padding: '0 13px', borderRadius: 999,
                    border: isActive ? `1px solid ${TOM.perigo.text}` : `1px solid ${T.border}`,
                    backgroundColor: isActive ? TOM.perigo.bg : T.surface,
                    color: isActive ? TOM.perigo.text : T.second,
                    fontSize: 12, fontWeight: isActive ? 700 : 500,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {sp.id !== "all" && <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: sp.color, flexShrink: 0 }} />}
                  {sp.name}
                  {/* A contagem vive no controle: o recorte diz QUANTOS são
                      antes de ser clicado, como as abas e os dropdowns. */}
                  {/* #746e69 e não #a8a29e: é número que se lê (quantas
                      correções cada marca pediu), e #a8a29e não passa AA. */}
                  <span style={{ fontSize: fsToque(11, dedo), fontWeight: 700, color: isActive ? TOM.perigo.text : T.second, fontVariantNumeric: 'tabular-nums' }}>
                    {sp.id === 'all'
                      ? baseItems.length
                      : baseItems.filter((i) => (i.awaitingArteApprovals || []).some((a) => a.sponsorId === sp.id)).length}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Correction cards */}
      <div style={{ display: 'grid', gridTemplateColumns: emCartoes ? '1fr' : 'repeat(auto-fill, minmax(460px, 1fr))', gap: 16 }}>
        {filteredCorrecaoItems.map((item) => (
          <CartaoDaCorrecao
            key={item.id}
            item={item}
            correcaoSponsorFilter={correcaoSponsorFilter}
            emCartoes={emCartoes}
            hoje={hoje}
            groupOf={groupOf}
            podeEditar={podeEditar}
            abrirCorrecao={abrirCorrecao}
          />
        ))}
      </div>
    </div>
  );
});
