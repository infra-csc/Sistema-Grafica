// O AVISO DA CONFERÊNCIA NA PÁGINA DA ARTE (dono, 05/11).
//
// O arquivo final é conferido com o thumb antes da Revisão. Quando parece diferente, a
// peça volta para a Finalização e aparece aqui, no topo da Arte, até alguém resolver na
// Conferência de arte: o arquivo estava certo, foi corrigido, ou o thumb é que estava
// errado. Assim o arquivo é arrumado antes de chegar na Gráfica.
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { FS, FW, R, T, TOM } from "@/lib/theme";
import { BotaoLink } from "@/components/ui/botao";

type PecaQueVoltou = { id: string; motivo: string | null; itemId: string; displayId: string | null; tipo: string; descricao: string | null; evento: string };

const MOSTRAR = 4;

export function AvisoDaConferencia({ dedo, compacto = false }: { dedo: boolean; compacto?: boolean }) {
  const { data = [] } = useQuery<PecaQueVoltou[]>({ queryKey: ["/api/conferencia-do-arquivo", "voltaram"], refetchInterval: 60_000 });
  if (data.length === 0) return null;
  const um = data.length === 1;
  return (
    <section
      data-testid="aviso-conferencia-arte"
      aria-label="Peças que voltaram da conferência do arquivo"
      style={{ display: "flex", flexWrap: "wrap", gap: "10px 16px", alignItems: "flex-start", padding: "12px 14px", borderRadius: R.md, backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, color: TOM.alerta.text }}
    >
      <TriangleAlert aria-hidden="true" style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <strong style={{ fontSize: FS.body, fontWeight: FW.forte }}>
          {um ? "1 peça voltou da conferência do arquivo" : `${data.length} peças voltaram da conferência do arquivo`}
        </strong>
        <span style={{ fontSize: FS.meta, color: T.apoio }}>
          {compacto
            ? `O arquivo final parece diferente do thumb. ${um ? "Ela só entra" : "Elas só entram"} na Revisão depois de resolvida${um ? "" : "s"}.`
            : `O arquivo final parece diferente do thumb. ${um ? "Ela só entra" : "Elas só entram"} na Revisão depois que alguém disser se o arquivo está certo, corrigir o arquivo ou trocar o thumb.`}
        </span>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
          {data.slice(0, compacto ? 2 : MOSTRAR).map((p) => (
            <li key={p.id} data-testid={`voltou-arte-${p.displayId ?? p.itemId}`} style={{ fontSize: FS.meta, color: T.text, overflowWrap: "anywhere" }}>
              <strong>{p.displayId ?? "Peça"}</strong> {p.tipo}{p.descricao ? ` · ${p.descricao}` : ""} <span style={{ color: T.second }}>· {p.evento}</span>
              {p.motivo && !compacto && <span style={{ display: "block", color: T.apoio }}>{p.motivo}</span>}
            </li>
          ))}
          {data.length > (compacto ? 2 : MOSTRAR) && <li style={{ fontSize: FS.meta, color: T.second }}>e mais {data.length - (compacto ? 2 : MOSTRAR)}</li>}
        </ul>
      </div>
      <BotaoLink href="/conferencia-arquivos" variante="primario" tamanho={dedo ? "toque" : "md"} data-testid="resolver-na-conferencia" style={{ flexShrink: 0 }}>
        Resolver na conferência
      </BotaoLink>
    </section>
  );
}
