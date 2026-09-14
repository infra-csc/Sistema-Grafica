// ─────────────────────────────────────────────────────────────────────────────
// ETIQUETA DO TUBO (dono, 14/09) — para colar no tubo antes do caminhão.
//
// O que se lê de longe na pilha do galpão: o EVENTO e o NÚMERO DO TUBO, em
// letras enormes. Embaixo, a lista do que está dentro — é ela que o recebedor
// confere na ponta sem abrir o tubo. Mesma estratégia das etiquetas de peça:
// o PDF é o do navegador (Imprimir → salvar como PDF).
//
// A impressão esconde tudo que não é a folha (menu, cabeçalho do app, botões)
// pela visibilidade, e não por display: assim a folha sai sozinha mesmo dentro
// da casca do app, sem depender de cada tela saber esconder a barra lateral.
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Printer } from "lucide-react";

type Peca = { id: string; displayId: string | null; type: string; description: string | null; quantity: number; conferida: boolean };
type Resposta = {
  tubo: { id: string; numero: number; entregueEm: string | null; recebidoPor: string | null };
  evento: { id: string; name: string; truckDepartureDate: string | null } | null;
  pecas: Peca[];
};

export default function EtiquetaTubo() {
  const [, params] = useRoute("/grafica/tubos/:id/etiqueta");
  const id = params?.id;
  const { data, isLoading, isError } = useQuery<Resposta>({ queryKey: [`/api/tubos/${id}`], enabled: !!id });

  const saida = data?.evento?.truckDepartureDate
    ? new Date(data.evento.truckDepartureDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })
    : null;
  const unidades = (data?.pecas ?? []).reduce((s, p) => s + (p.quantity || 0), 0);

  return (
    <div style={{ background: "#fafaf9", minHeight: "100%", padding: 24 }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .folha-do-tubo, .folha-do-tubo * { visibility: visible !important; }
          .folha-do-tubo { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; margin: 0 !important; }
          @page { size: A4 portrait; margin: 10mm; }
        }
      `}</style>

      <div className="nao-imprime" style={{ maxWidth: 820, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Link href="/grafica" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700, color: "#57534e", textDecoration: "none" }}>
          <ArrowLeft aria-hidden="true" style={{ width: 14, height: 14 }} /> Fila da Gráfica
        </Link>
        <button type="button" onClick={() => window.print()} disabled={!data} data-testid="imprimir-etiqueta-tubo"
          style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px", borderRadius: 8, border: "none", background: "#1c1917", color: "#fff", fontWeight: 800, fontSize: 13, cursor: data ? "pointer" : "not-allowed", opacity: data ? 1 : 0.5 }}>
          <Printer aria-hidden="true" style={{ width: 15, height: 15 }} /> Imprimir etiqueta
        </button>
      </div>

      {isLoading && <p style={{ textAlign: "center", color: "#78716c", fontSize: 13 }}>Carregando o tubo…</p>}
      {isError && <p style={{ textAlign: "center", color: "#b91c1c", fontSize: 13 }}>Não foi possível carregar o tubo.</p>}

      {data && (
        <div className="folha-do-tubo" style={{ maxWidth: 820, margin: "0 auto", background: "#fff", border: "3px solid #1c1917", borderRadius: 6, padding: "28px 32px", boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#57534e" }}>
            {saida ? `Saída do caminhão ${saida}` : "Evento"}
          </div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 44, fontWeight: 900, lineHeight: 1.05, textTransform: "uppercase", color: "#1c1917", margin: "4px 0 10px", wordBreak: "break-word" }}>
            {data.evento?.name ?? "Evento"}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, borderTop: "3px solid #1c1917", borderBottom: "3px solid #1c1917", padding: "8px 0", marginBottom: 18 }}>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 88, fontWeight: 900, lineHeight: 1, color: "#1c1917" }}>
              TUBO {data.tubo.numero}
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#1c1917", textAlign: "right" }}>
              {data.pecas.length} {data.pecas.length === 1 ? "peça" : "peças"}<br />
              <span style={{ fontSize: 13, color: "#57534e" }}>{unidades} {unidades === 1 ? "unidade" : "unidades"}</span>
            </span>
          </div>

          {data.pecas.length === 0 ? (
            <p style={{ fontSize: 14, color: "#57534e" }}>Este tubo está vazio.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  {["Código", "Peça", "Descrição", "Qtd"].map((h) => (
                    <th key={h} scope="col" style={{ padding: "6px 8px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#57534e", borderBottom: "2px solid #1c1917" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.pecas.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #d6d3d1" }}>
                    <td style={{ padding: "7px 8px", fontFamily: "ui-monospace, monospace", fontWeight: 800, whiteSpace: "nowrap" }}>{p.displayId ?? "—"}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 700 }}>{p.type}</td>
                    <td style={{ padding: "7px 8px", color: "#44403c" }}>{p.description ?? ""}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 800, textAlign: "right", whiteSpace: "nowrap" }}>{p.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
