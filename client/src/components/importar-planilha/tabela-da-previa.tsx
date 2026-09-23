// O PAINEL DA TABELA: busca, recorte da triagem e as linhas agrupadas por tipo.
import { Fragment } from "react";
import { List, Search } from "lucide-react";
import { T, N, TOM, FONT } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/estados";
import { ImportPreviewRow } from "./linha-da-previa";
import { tipoDoGrupo, type DefeitoImport } from "./regras";
import type { LinhaDaImportacao, PatrocinadorDoEvento } from "./tipos";

export function TabelaDaPrevia({
  importPreviewItems, setImportPreviewItems, importSearch, setImportSearch, triagem, setTriagem,
  eventSponsorsList, matchesImportFiltros, colunas, larguraDaTabela, chavesDoEvento, repetidasDaPlanilha, mostrarVisual,
}: {
  importPreviewItems: LinhaDaImportacao[];
  setImportPreviewItems: React.Dispatch<React.SetStateAction<LinhaDaImportacao[] | null>>;
  importSearch: string;
  setImportSearch: (s: string) => void;
  triagem: DefeitoImport | null;
  setTriagem: (t: DefeitoImport | null) => void;
  eventSponsorsList: PatrocinadorDoEvento[];
  /** A busca E a triagem — o mesmo predicado da contagem dos baldes. */
  matchesImportFiltros: (i: LinhaDaImportacao) => boolean | undefined;
  colunas: { label: string; tip: string; w: number }[];
  larguraDaTabela: number;
  chavesDoEvento: Set<string>;
  repetidasDaPlanilha: Map<string, number>;
  mostrarVisual: boolean;
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
      {/* Search bar. paddingRight extra: o X nativo do dialog vive em
          right-4/top-4 e ficava POR CIMA do botão "+ Todos
          patrocinadores" — colisão flagrada em produção. */}
      <div style={{ padding: '10px 44px 10px 16px', borderBottom: `1px solid ${T.border}`, backgroundColor: T.surface, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: T.second, pointerEvents: 'none' }} />
          <input
            value={importSearch}
            onChange={e => setImportSearch(e.target.value)}
            placeholder="Filtrar peças ou grupos..."
            aria-label="Filtrar as peças da planilha por descrição ou grupo"
            style={{ width: '100%', padding: '7px 12px 7px 28px', backgroundColor: N.n3, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
        <span style={{ fontSize: 11, color: T.second, whiteSpace: 'nowrap', fontWeight: 600 }}>
          {importSearch || triagem
            ? `${importPreviewItems.filter(matchesImportFiltros).length} de ${importPreviewItems.length} peças`
            : `${importPreviewItems.length} peças`
          }
        </span>
        {/* O "Limpar" da triagem: um balde ligado na barra lateral fica
            longe da tabela que ele recortou, e sem saída à mão a pessoa
            lê a lista curta como "a planilha tem 4 peças". */}
        {triagem && (
          <button
            type="button"
            onClick={() => setTriagem(null)}
            data-testid="button-limpar-triagem"
            style={{ fontSize: 11, fontWeight: 700, color: T.accentText, background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', padding: 0 }}
          >
            Limpar
          </button>
        )}
        {eventSponsorsList.length > 0 && (
          <Botao
            variante="secundario"
            tamanho="sm"
            title="Vincular todos os patrocinadores do evento a todas as peças listadas"
            onClick={() => {
              const allIds = eventSponsorsList.map(s => s.sponsorId);
              const q = importSearch.toLowerCase();
              setImportPreviewItems(prev => prev ? prev.map(r =>
                (!q || r.description?.toLowerCase().includes(q) || r.type?.toLowerCase().includes(q))
                  ? { ...r, suggestedSponsorIds: allIds }
                  : r
              ) : prev);
            }}
            style={{ flexShrink: 0 }}
          >
            + Todos patrocinadores
          </Botao>
        )}
      </div>

      {/* A TABELA ROLA DENTRO DO PAINEL. Com layout automático, as
          colunas eram espremidas até a última sair pela borda —
          "0/1 vincu" — sem barra de rolagem, porque a tabela cabia
          "tecnicamente". Com `table-layout: fixed` e um <colgroup>, a
          soma das larguras É a largura da tabela: abaixo dela o
          painel rola; nada é espremido, nada é cortado. */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto' }}>
        <table style={{ tableLayout: 'fixed', width: '100%', minWidth: larguraDaTabela, borderCollapse: 'collapse', fontSize: 13 }}>
          <colgroup>
            {colunas.map((c, i) => <col key={i} style={{ width: c.w }} />)}
          </colgroup>
          <thead>
            <tr style={{ backgroundColor: N.n3, position: 'sticky', top: 0, zIndex: 2, boxShadow: `0 1px 0 ${T.border}` }}>
              {colunas.map((h, i) => (
                <th key={i} title={h.tip} style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, fontSize: 10, color: T.second, textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(() => {
              const items = importPreviewItems.filter(matchesImportFiltros);
              const groupMap = new Map<string, LinhaDaImportacao[]>();
              for (const item of items) {
                const t = tipoDoGrupo(item);
                if (!groupMap.has(t)) groupMap.set(t, []);
                groupMap.get(t)!.push(item);
              }
              const groups = Array.from(groupMap.entries());
              return groups.map(([type, groupItems], gIdx) => {
                const groupM2 = groupItems.reduce((s: number, i) => s + (parseFloat(String(i.calculatedM2)) || 0), 0);
                const groupLinked = groupItems.filter((i) => (i.suggestedSponsorIds ?? []).length > 0).length;
                return (
                  <Fragment key={type}>
                    <tr>
                      <td colSpan={colunas.length} style={{ padding: '9px 14px 8px', background: `linear-gradient(90deg, ${N.n3} 0%, ${N.n3} 100%)`, borderTop: gIdx > 0 ? `2px solid ${T.border}` : undefined, borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 3, height: 14, backgroundColor: T.accent, borderRadius: 6 }} />
                            <span style={{ fontWeight: 800, fontSize: 13, color: T.text, fontFamily: FONT.display, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{type}</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: T.apoio, backgroundColor: T.border, borderRadius: 999, padding: '1px 8px' }}>{groupItems.length}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            {groupM2 > 0 && (
                              <span style={{ fontSize: 11, fontFamily: FONT.mono, fontWeight: 700, color: TOM.alerta.text }}>{groupM2.toFixed(2)} m²</span>
                            )}
                            <span style={{ fontSize: 11, color: groupLinked === groupItems.length ? TOM.sucesso.text : TOM.alerta.text, fontWeight: 600 }}>
                              {groupLinked}/{groupItems.length} vinculados
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                    {groupItems.map((row, rowIdx: number) => (
                      <ImportPreviewRow
                        key={row._id}
                        row={row}
                        idx={rowIdx}
                        onChange={(updated) => setImportPreviewItems(prev => prev ? prev.map(r => r._id === row._id ? updated : r) : prev)}
                        onDelete={() => setImportPreviewItems(prev => prev ? prev.filter(r => r._id !== row._id) : prev)}
                        eventSponsorsList={eventSponsorsList}
                        jaNoEvento={chavesDoEvento}
                        repetidas={repetidasDaPlanilha}
                        mostrarVisual={mostrarVisual}
                      />
                    ))}
                  </Fragment>
                );
              });
            })()}
          </tbody>
        </table>
        {importPreviewItems.length === 0 && (
          <div style={{ padding: 24 }}>
            <EstadoVazio icone={List} titulo="Nenhuma peça para importar." />
          </div>
        )}
        {/* Filtro sem resultado: antes a tabela simplesmente sumia,
            sem dizer o porquê nem oferecer saída. */}
        {importPreviewItems.length > 0 && importPreviewItems.filter(matchesImportFiltros).length === 0 && (
          <div style={{ padding: 24 }}>
            <EstadoVazio
              icone={Search}
              titulo="Nenhuma peça corresponde ao filtro"
              descricao={<>Tente outro termo ou limpe o filtro para ver as {importPreviewItems.length} peças.</>}
              acao={
                <Botao
                  variante="secundario"
                  // Limpa os DOIS recortes: com a triagem ligada, um
                  // "Limpar filtro" que so apaga a busca deixa a tela
                  // vazia depois de a pessoa ter pedido para limpar.
                  onClick={() => { setImportSearch(""); setTriagem(null); }}
                  data-testid="button-clear-import-search"
                >
                  Limpar filtro
                </Botao>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
