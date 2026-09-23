// FILTROS NO CELULAR — bottom sheet.
//
// Os quatro gatilhos lado a lado estouram 390px e embrulham em três fileiras,
// empurrando a grade para fora da primeira tela — numa tela cujo conteúdo É a
// grade. Aqui cada opção tem 48px de altura em vez dos 28 de um item de menu,
// e o rodapé diz o resultado antes de fechar: "Ver N registros".
//
// Dialog e não um <div> fixo, pelo mesmo motivo do zoom: foco preso, fundo sem
// rolagem, foco devolvido, e o leitor de tela anunciando a abertura.
import type { Dispatch, SetStateAction } from "react";
import { Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Botao } from "@/components/ui/botao";
import { T, FS, R, FW, FONT } from "@/lib/theme";
import { KIND, PAGE_SIZE, type Kind, type OpcaoDeFiltro, type Period, type Photo } from "./fotos";

export function SheetDeFiltros({
  sheetAberto, setSheetAberto, hasFilters, clearAll, setVisible, filtered,
  kindOptions, kindFilter, setKindFilter,
  eventOptions, eventFilter, setEventFilter,
  periodOptions, period, setPeriod,
}: {
  sheetAberto: boolean;
  setSheetAberto: Dispatch<SetStateAction<boolean>>;
  hasFilters: boolean;
  clearAll: () => void;
  setVisible: Dispatch<SetStateAction<number>>;
  /** A lista filtrada — o rodapé diz quantos registros ela tem. */
  filtered: Photo[];
  kindOptions: OpcaoDeFiltro[];
  kindFilter: string[];
  setKindFilter: Dispatch<SetStateAction<string[]>>;
  eventOptions: OpcaoDeFiltro[];
  eventFilter: string[];
  setEventFilter: Dispatch<SetStateAction<string[]>>;
  periodOptions: OpcaoDeFiltro[];
  period: Period;
  setPeriod: Dispatch<SetStateAction<Period>>;
}) {
  return (
    <Dialog open={sheetAberto} onOpenChange={setSheetAberto}>
      <DialogContent
        className="p-0 gap-0 [&>button]:hidden"
        data-testid="sheet-filters"
        style={{
          width: "100vw", maxWidth: "100vw",
          top: "auto", bottom: 0, left: 0, right: 0, transform: "none",
          maxHeight: "85dvh", borderRadius: "16px 16px 0 0",
          display: "flex", flexDirection: "column", backgroundColor: T.surface,
        }}
      >
        <DialogTitle className="sr-only">Filtros dos registros</DialogTitle>
        <DialogDescription className="sr-only">Escolha tipo, evento e período</DialogDescription>

        <div style={{ flexShrink: 0, padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontFamily: FONT.display, fontSize: FS.lead, fontWeight: FW.forte, color: T.text }}>Filtros</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {hasFilters && (
              <Botao variante="fantasma" tamanho="toque" onClick={() => { clearAll(); setVisible(PAGE_SIZE); }}
                data-testid="button-clear-filters">
                Limpar tudo
              </Botao>
            )}
            <button type="button" onClick={() => setSheetAberto(false)} aria-label="Fechar"
              style={{ width: 44, height: 44, borderRadius: R.pill, border: "none", background: T.low, color: T.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X style={{ width: 18, height: 18 }} />
            </button>
          </div>
        </div>

        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "4px 0 8px" }}>
          {([
            { titulo: "Tipo",    opcoes: kindOptions,   marcadas: kindFilter,  alterna: (v: string) => setKindFilter(kindFilter.includes(v) ? kindFilter.filter(x => x !== v) : [...kindFilter, v]), cor: (v: string) => KIND[v as Kind]?.color },
            { titulo: "Evento",  opcoes: eventOptions,  marcadas: eventFilter, alterna: (v: string) => setEventFilter(eventFilter.includes(v) ? eventFilter.filter(x => x !== v) : [...eventFilter, v]), cor: () => T.accentText },
            // Período é escolha única: marcar um desmarca o anterior.
            { titulo: "Período", opcoes: periodOptions, marcadas: period === "Todos" ? [] : [period], alterna: (v: string) => setPeriod(period === v ? "Todos" : (v as Period)), cor: () => T.second },
          ] as const).map(grupo => (
            <div key={grupo.titulo} style={{ padding: "8px 0" }}>
              <p style={{ fontSize: FS.meta, fontWeight: FW.forte, color: T.second, margin: "0 16px 4px" }}>
                {grupo.titulo}
              </p>
              {grupo.opcoes.map((o: OpcaoDeFiltro) => {
                const marcada = (grupo.marcadas as readonly string[]).includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="checkbox"
                    aria-checked={marcada}
                    onClick={() => { grupo.alterna(o.value); setVisible(PAGE_SIZE); }}
                    style={{ width: "100%", minHeight: 48, padding: "0 16px", display: "flex", alignItems: "center", gap: 10, border: "none", background: marcada ? T.low : "none", font: "inherit", textAlign: "left", cursor: "pointer" }}
                  >
                    <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: grupo.cor(o.value) || T.second, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: FS.body, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                    <span style={{ fontFamily: FONT.mono, fontSize: FS.meta, color: T.apoio, flexShrink: 0 }}>{o.count}</span>
                    {marcada && <Check aria-hidden="true" style={{ width: 16, height: 16, color: T.accentText, flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ flexShrink: 0, padding: 12, borderTop: `1px solid ${T.border}` }}>
          <Botao variante="primario" tamanho="toque" larguraCheia onClick={() => setSheetAberto(false)} style={{ minHeight: 48 }}>
            Ver {filtered.length} {filtered.length === 1 ? "registro" : "registros"}
          </Botao>
        </div>
      </DialogContent>
    </Dialog>
  );
}
