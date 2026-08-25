// ─────────────────────────────────────────────────────────────────────────────
// ETIQUETAS DO EVENTO — para colar no material depois da conferência.
//
// Pedido do dono (24/08), com o modelo em PDF do Circuito Vale como régua:
// A4 deitado, DUAS etiquetas por folha com linha de corte no meio; cada uma
// leva o nome do evento em letras gigantes (é o que se lê de longe na pilha
// do galpão), a arte da peça, o código laranja + tipo, a descrição e a
// quantidade. O PDF é o do navegador (Imprimir → salvar como PDF), como no
// Relatório: para folha de texto e imagem, o print nativo é a melhor
// tipografia por zero código.
//
// DECISÕES:
//  · Abre nas peças CONFERIDAS — a etiqueta existe para o material que passou
//    pela conferência. Um interruptor (fora da impressão) inclui as demais,
//    para quem quiser adiantar a rotulagem.
//  · Uma peça por etiqueta, sempre — etiqueta é do ITEM físico; agrupar duas
//    numa faria alguém recortar no meio.
//  · Ordem por código (compareDisplayId), a mesma das outras telas: a pilha
//    impressa sai na ordem da fila.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Printer, ArrowLeft, Tags } from "lucide-react";
import { compareDisplayId } from "@/lib/displayId";

/** Conferida = já passou pela conferência (inclui as entregues e as grafias legadas). */
const CONFERIDA = new Set(["conferred", "conferido", "delivered", "entregue"]);
const jaConferida = (i: any) => CONFERIDA.has(i.status) || (i.conferredQty ?? 0) > 0;

const dataBR = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }) : null;

export default function EtiquetasEvento() {
  const [, params] = useRoute("/eventos/:id/etiquetas");
  const eventId = params?.id;
  const [incluirTodas, setIncluirTodas] = useState(false);

  /**
   * A PALAVRA GIGANTE da etiqueta. No modelo do dono o nome tem dois níveis:
   * a marca do evento pequena ('Circuito Corrida Vale 2026') e a CIDADE
   * enorme ('ITABIRA') — é ela que se lê de longe. O padrão é a última
   * palavra do nome, e o campo é editável antes de imprimir porque nenhuma
   * regra automática acerta 'São Paulo' (duas palavras) sem errar outra.
   */
  const [destaque, setDestaque] = useState<string | null>(null);

  const { data: event } = useQuery<any>({ queryKey: [`/api/events/${eventId}`], enabled: !!eventId });
  const { data: itens = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/items", eventId],
    enabled: !!eventId,
  });

  const pecas = useMemo(() => {
    const vivas = (itens as any[]).filter((i) => !i.deletedAt && i.status !== "canceled" && i.status !== "archived");
    const base = incluirTodas ? vivas : vivas.filter(jaConferida);
    return [...base].sort((a, b) => compareDisplayId(a.displayId, b.displayId));
  }, [itens, incluirTodas]);

  const conferidas = useMemo(() => (itens as any[]).filter((i) => !i.deletedAt && jaConferida(i)).length, [itens]);

  const nome: string = event?.name ?? "";
  const palavraFinal = nome.trim().split(/\s+/).slice(-1)[0] ?? "";
  const gigante = (destaque ?? palavraFinal).trim();
  // O prefixo é o nome SEM a parte gigante (comparado sem caixa); se o
  // destaque digitado não estiver no nome, o nome inteiro vira prefixo.
  const idx = gigante ? nome.toLowerCase().lastIndexOf(gigante.toLowerCase()) : -1;
  const prefixo = idx >= 0 ? (nome.slice(0, idx) + nome.slice(idx + gigante.length)).replace(/\s+/g, " ").trim() : nome;

  if (isLoading) return <p style={{ padding: 40, fontSize: 14, color: "#78716c" }}>Montando as etiquetas…</p>;

  return (
    <div style={{ backgroundColor: "#ffffff", minHeight: "100%" }}>
      <style>{`
        @media print {
          .etq-acao { display: none !important; }
          @page { size: A4 landscape; margin: 8mm; }
          body { background: #fff !important; }
          .etq-folha { page-break-after: always; }
          .etq-folha:last-child { page-break-after: auto; }
        }
        @media screen {
          .etq-folha { border: 1px solid #e7e5e4; border-radius: 10px; margin: 0 auto 18px; max-width: 1050px; }
        }
      `}</style>

      {/* ── Barra (não imprime) ── */}
      <div className="etq-acao" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "14px 18px", borderBottom: "1px solid #e7e5e4", position: "sticky", top: 0, backgroundColor: "#fafaf9", zIndex: 5 }}>
        <Link href={`/eventos/${eventId}`} data-testid="link-voltar-evento" style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 12px", borderRadius: 8, border: "1px solid #e7e5e4", color: "#44403c", fontSize: 13, fontWeight: 600, textDecoration: "none", backgroundColor: "#fff" }}>
          <ArrowLeft style={{ width: 14, height: 14 }} /> Voltar
        </Link>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1c1917", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Tags style={{ width: 15, height: 15, color: "#c2410c" }} />
          {pecas.length} etiqueta{pecas.length !== 1 ? "s" : ""} · {Math.ceil(pecas.length / 2)} folha{Math.ceil(pecas.length / 2) !== 1 ? "s" : ""}
        </span>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "#44403c", cursor: "pointer", marginLeft: 6 }}>
          <input type="checkbox" checked={incluirTodas} onChange={(e) => setIncluirTodas(e.target.checked)} data-testid="check-incluir-todas" style={{ width: 16, height: 16, accentColor: "#c2410c" }} />
          Incluir as não conferidas
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "#44403c", marginLeft: 6 }}>
          Palavra gigante
          <input value={destaque ?? palavraFinal} onChange={(e) => setDestaque(e.target.value)} data-testid="input-destaque"
            style={{ height: 34, width: 140, borderRadius: 8, border: "1px solid #d6d3d1", padding: "0 10px", fontSize: 13, fontFamily: "inherit", color: "#1c1917", backgroundColor: "#fff" }} />
        </label>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => window.print()} data-testid="button-imprimir-etiquetas"
          style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px", borderRadius: 8, border: "none", backgroundColor: "#1c1917", color: "#fff", cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 700 }}>
          <Printer style={{ width: 14, height: 14 }} /> Imprimir / PDF
        </button>
      </div>

      {pecas.length === 0 && (
        <p data-testid="etiquetas-vazio" style={{ margin: 0, padding: "36px 24px", fontSize: 14, color: "#57534e", maxWidth: 560 }}>
          {incluirTodas
            ? "Este evento não tem peças para etiquetar."
            : <>Nenhuma peça conferida ainda — a etiqueta nasce da conferência. {conferidas === 0 && "Assim que a Gráfica conferir, elas aparecem aqui."} Se quiser adiantar, marque “Incluir as não conferidas”.</>}
        </p>
      )}

      {/* ── Folhas: 2 etiquetas por A4 deitado, linha de corte no meio ── */}
      <div style={{ padding: "18px 12px 48px" }}>
        {Array.from({ length: Math.ceil(pecas.length / 2) }, (_, f) => pecas.slice(f * 2, f * 2 + 2)).map((dupla, f) => (
          <div key={f} className="etq-folha" style={{ display: "flex", flexDirection: "column" }}>
            {dupla.map((p, i) => (
              <div key={p.id} data-testid={`etiqueta-${p.id}`} style={{
                display: "flex", alignItems: "stretch", gap: 18, padding: "22px 26px",
                minHeight: 300,
                borderBottom: i === 0 && dupla.length === 2 ? "2px dashed #d6d3d1" : "none",
              }}>
                {/* O NOME DO EVENTO — o que se lê de longe na pilha */}
                <div style={{ flex: "1.2 1 0", minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#78716c" }}>
                    {event?.truckDepartureDate ? `Saída ${dataBR(event.truckDepartureDate)}` : " "}
                  </p>
                  {/* Dois níveis, como no modelo: a marca do evento pequena e
                      a palavra de destaque GIGANTE — é ela que se lê de longe. */}
                  {prefixo && (
                    <p style={{ margin: "4px 0 0", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: "clamp(16px, 2vw, 24px)", textTransform: "uppercase", letterSpacing: "0.01em", color: "#1c1917", lineHeight: 1.1 }}>
                      {prefixo}
                    </p>
                  )}
                  <p style={{
                    margin: "2px 0 0", fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em",
                    color: "#1c1917", lineHeight: 0.95,
                    fontSize: prefixo ? "clamp(56px, 8vw, 104px)" : "clamp(34px, 5.2vw, 64px)",
                    overflowWrap: "anywhere",
                  }}>
                    {gigante || nome}
                  </p>
                </div>

                {/* A PEÇA: arte + código + descrição + quantidade */}
                <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", gap: 16, alignItems: "center" }}>
                  {(p.approvalThumbUrl || p.finalPreviewUrl) && (
                    <img src={p.approvalThumbUrl || p.finalPreviewUrl} alt=""
                      style={{ width: 150, height: 150, objectFit: "contain", borderRadius: 10, border: "1px solid #e7e5e4", backgroundColor: "#fafaf9", flexShrink: 0 }} />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 30, fontWeight: 900, letterSpacing: "-0.01em", lineHeight: 1.1 }}>
                      <span style={{ color: "#c2410c" }}>{p.displayId}</span>{" "}
                      <span style={{ color: "#1c1917", textTransform: "uppercase" }}>{p.type}</span>
                    </p>
                    {p.description && (
                      <p style={{ margin: "6px 0 0", fontSize: 19, color: "#44403c", lineHeight: 1.3, overflowWrap: "anywhere" }}>{p.description}</p>
                    )}
                  </div>
                  <p style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 30, fontWeight: 900, color: "#1c1917", whiteSpace: "nowrap", alignSelf: "flex-start" }}>
                    {p.quantity ?? 1} un.
                  </p>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
