import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Botao } from "@/components/ui/botao";
import { T } from "@/lib/theme";

type EventoDoRelatorio = { id: string; name: string; startDate: string };
export type RecorteDoExcel = { itemIds: string[]; title: string } | { eventIds: string[]; title: string };

export function ExportarExcelGrafica({ open, onClose, quantidadeNaLista, isExporting, onExportar }: {
  open: boolean;
  onClose: () => void;
  quantidadeNaLista: number;
  isExporting: boolean;
  onExportar: (recorte?: RecorteDoExcel) => Promise<void>;
}) {
  const [modo, setModo] = useState<"lista" | "eventos">("lista");
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const eventos = useQuery<EventoDoRelatorio[]>({
    queryKey: ["/api/events"],
    enabled: open && modo === "eventos",
    staleTime: 60_000,
  });
  const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const lista = [...(eventos.data ?? [])]
    .filter(e => normalizar(e.name).includes(normalizar(busca)))
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  const podeExportar = modo === "lista" ? quantidadeNaLista > 0 : selecionados.length > 0 && !eventos.isError;
  const alternar = (id: string) => setSelecionados(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !isExporting) onClose(); }}>
      <DialogContent style={{ maxWidth: 560, maxHeight: "85dvh", display: "flex", flexDirection: "column" }}>
        <DialogTitle>Exportar Excel da Gráfica</DialogTitle>
        <DialogDescription>Exporte todos os eventos ou selecione provas para o fechamento, inclusive eventos já realizados.</DialogDescription>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Botao aria-pressed={modo === "lista"} variante={modo === "lista" ? "primario" : "secundario"} onClick={() => setModo("lista")} disabled={isExporting}>Todos os eventos ({quantidadeNaLista})</Botao>
          <Botao aria-pressed={modo === "eventos"} variante={modo === "eventos" ? "primario" : "secundario"} onClick={() => setModo("eventos")} disabled={isExporting}>Selecionar eventos</Botao>
        </div>
        {modo === "lista" ? (
          <p style={{ color: T.second }}>Inclui todos os eventos, inclusive os já realizados que ficam ocultos na fila. Busca e filtros ativos continuam valendo; para o relatório completo de provas específicas, com as entregues, use “Selecionar eventos”.</p>
        ) : (
          <>
            <p style={{ color: T.second, margin: 0 }}>Todas as peças dos eventos selecionados serão incluídas, inclusive as entregues. A fila de produção não será alterada.</p>
            <input aria-label="Buscar eventos para o Excel" placeholder="Buscar prova ou cidade…" value={busca} onChange={e => setBusca(e.target.value)} disabled={isExporting}
              style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, width: "100%", background: T.surface, color: T.text }} />
            <div style={{ overflowY: "auto", minHeight: 0, maxHeight: 300, border: `1px solid ${T.border}`, borderRadius: 8 }}>
              {eventos.isLoading ? <p style={{ padding: 12 }}>Carregando eventos…</p> : eventos.isError ? (
                <div role="alert" style={{ padding: 12 }}>Não foi possível carregar os eventos. <Botao onClick={() => eventos.refetch()}>Tentar de novo</Botao></div>
              ) : lista.length === 0 ? <p style={{ padding: 12 }}>Nenhum evento encontrado.</p> : lista.map(e => (
                <label key={e.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: 12, cursor: "pointer", borderBottom: `1px solid ${T.border}` }}>
                  <input type="checkbox" checked={selecionados.includes(e.id)} onChange={() => alternar(e.id)} disabled={isExporting || (!selecionados.includes(e.id) && selecionados.length >= 100)} />
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{e.name}<small style={{ display: "block", color: T.second }}>{new Date(e.startDate).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</small></span>
                </label>
              ))}
            </div>
            <span aria-live="polite">{selecionados.length} evento(s) selecionado(s)</span>
          </>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <Botao onClick={onClose} disabled={isExporting}>Cancelar</Botao>
          <Botao variante="primario" icone={FileSpreadsheet} carregando={isExporting} disabled={!podeExportar || isExporting}
            onClick={() => onExportar(modo === "eventos" ? { eventIds: selecionados, title: selecionados.length === 1 ? `Gráfica — ${eventos.data?.find(e => e.id === selecionados[0])?.name ?? "Evento"}` : "Fechamento — Gráfica" } : undefined)}>
            Baixar Excel
          </Botao>
        </div>
      </DialogContent>
    </Dialog>
  );
}
