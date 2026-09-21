// ─────────────────────────────────────────────────────────────────────────────
// ETIQUETA DO TUBO (dono, 14/09) — para colar no tubo antes do caminhão.
//
// 21/09 (dono): a etiqueta segue o formato da que o galpão já cola no rolo —
// o mesmo das "Folhas de LISTA dos 2x1" em etiquetas-evento.tsx:
//   · cabeçalho CENTRALIZADO: o logo do book, se houver; senão, o prefixo do
//     nome do evento. Embaixo, a palavra GIGANTE (a cidade), que se lê de
//     longe na pilha;
//   · o NÚMERO DO TUBO em destaque — é o que distingue um tubo do outro do
//     mesmo evento;
//   · uma linha por peça, centralizada e compacta: "2x1 Ministério - 16"
//     (tipo + descrição + " - " + quantidade), sem arte e sem código.
// A entrega no fim é por tubo, "dos itens que estão juntos": a lista é o que o
// recebedor confere na ponta sem abrir o tubo.
//
// O PDF é o do navegador (Imprimir → salvar como PDF), como nas etiquetas de
// peça. A impressão esconde tudo que não é a folha pela visibilidade, e não
// por display: assim a folha sai sozinha mesmo dentro da casca do app.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Printer } from "lucide-react";
import { logoDaCapaDoBook } from "@/lib/logo-do-book";
import { useIsMobile } from "@/hooks/use-mobile";

type Peca = { id: string; displayId: string | null; type: string; description: string | null; quantity: number; conferida: boolean };
type Resposta = {
  tubo: { id: string; numero: number; entregueEm: string | null; recebidoPor: string | null };
  evento: { id: string; name: string; truckDepartureDate: string | null; bookUrl?: string | null } | null;
  pecas: Peca[];
};

/**
 * "2x1 Ministério - 16". A descrição que já começa pelo tipo ("2x1 Logo
 * Santander") não repete o tipo. MESMA regra de `linhaDaLista` em
 * etiquetas-evento.tsx (que chega à main no próximo merge da producao) —
 * quando os dois estiverem juntos, vale extrair para um lugar só.
 */
export const linhaDaEtiquetaDoTubo = (p: { type?: string | null; description?: string | null; quantity?: number | null }) => {
  const tipo = String(p.type ?? "").trim();
  const desc = String(p.description ?? "").trim();
  const nome = !desc ? tipo : desc.toLowerCase().startsWith(tipo.toLowerCase()) ? desc : `${tipo} ${desc}`;
  return `${nome} - ${p.quantity ?? 1}`;
};

export default function EtiquetaTubo() {
  const [, params] = useRoute("/grafica/tubos/:id/etiqueta");
  const id = params?.id;
  const isMobile = useIsMobile();
  const { data, isLoading, isError } = useQuery<Resposta>({ queryKey: [`/api/tubos/${id}`], enabled: !!id });

  // O LOGO vem da capa do book do evento, como na etiqueta das peças. Sem book
  // (ou capa ilegível), o cabeçalho usa o prefixo do nome: o logo é enfeite,
  // não pré-requisito.
  const bookUrl = data?.evento?.bookUrl ?? null;
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    setLogo(null);
    if (!bookUrl) return;
    logoDaCapaDoBook(bookUrl).then((l) => { if (vivo) setLogo(l); });
    return () => { vivo = false; };
  }, [bookUrl]);

  // A PALAVRA GIGANTE: por padrão a última palavra do nome (a cidade, no
  // modelo do dono); editável antes de imprimir, porque nenhuma regra
  // automática acerta "São Paulo" sem errar outra. Mesma conta da etiqueta
  // das peças.
  const [destaque, setDestaque] = useState<string | null>(null);
  const nome = data?.evento?.name ?? "";
  const palavraFinal = nome.trim().split(/\s+/).slice(-1)[0] ?? "";
  const gigante = (destaque ?? palavraFinal).trim();
  const idx = gigante ? nome.toLowerCase().lastIndexOf(gigante.toLowerCase()) : -1;
  const prefixo = idx >= 0 ? (nome.slice(0, idx) + nome.slice(idx + gigante.length)).replace(/\s+/g, " ").trim() : nome;

  const saida = data?.evento?.truckDepartureDate
    ? new Date(data.evento.truckDepartureDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })
    : null;
  const unidades = (data?.pecas ?? []).reduce((s, p) => s + (p.quantity || 0), 0);
  const alvo = isMobile ? 44 : 38;

  return (
    <div style={{ background: "#fafaf9", minHeight: "100%", padding: isMobile ? 12 : 24 }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .folha-do-tubo, .folha-do-tubo * { visibility: visible !important; }
          .folha-do-tubo { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; margin: 0 !important; }
          @page { size: A4 portrait; margin: 10mm; }
        }
      `}</style>

      <div className="nao-imprime" style={{ maxWidth: 820, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Link href="/grafica" style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: isMobile ? 44 : undefined, fontSize: 12.5, fontWeight: 700, color: "#57534e", textDecoration: "none" }}>
          <ArrowLeft aria-hidden="true" style={{ width: 14, height: 14 }} /> Fila da Gráfica
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {data && (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#57534e" }}>
              Destaque
              <input
                value={destaque ?? palavraFinal}
                onChange={(e) => setDestaque(e.target.value)}
                data-testid="input-destaque-tubo"
                aria-label="Palavra em destaque na etiqueta (a cidade)"
                style={{ height: alvo, width: 150, borderRadius: 8, border: "1px solid #d6d3d1", padding: "0 10px", fontSize: isMobile ? 16 : 13, fontWeight: 700, color: "#1c1917", background: "#fff" }}
              />
            </label>
          )}
          <button type="button" onClick={() => window.print()} disabled={!data} data-testid="imprimir-etiqueta-tubo"
            style={{ display: "inline-flex", alignItems: "center", gap: 7, height: alvo, padding: "0 16px", borderRadius: 8, border: "none", background: "#1c1917", color: "#fff", fontWeight: 800, fontSize: 13, cursor: data ? "pointer" : "not-allowed", opacity: data ? 1 : 0.5 }}>
            <Printer aria-hidden="true" style={{ width: 15, height: 15 }} /> Imprimir etiqueta
          </button>
        </div>
      </div>

      {isLoading && <p style={{ textAlign: "center", color: "#78716c", fontSize: 13 }}>Carregando o tubo…</p>}
      {isError && <p style={{ textAlign: "center", color: "#b91c1c", fontSize: 13 }}>Não foi possível carregar o tubo.</p>}

      {data && (
        <div className="folha-do-tubo" data-testid="folha-do-tubo" style={{ maxWidth: 820, margin: "0 auto", background: "#fff", border: "3px solid #1c1917", borderRadius: 6, padding: isMobile ? "18px 16px" : "24px 32px", boxShadow: "0 8px 24px rgba(0,0,0,0.08)", boxSizing: "border-box" }}>
          <div style={{ borderBottom: "3px solid #1c1917", paddingBottom: 10, textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#78716c" }}>
                {saida ? `Saída ${saida}` : " "}
              </p>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#57534e" }}>
                {data.pecas.length} {data.pecas.length === 1 ? "peça" : "peças"} · {unidades} un.
              </p>
            </div>
            {logo && (
              <img loading="lazy" decoding="async" src={logo} alt="Logo do evento"
                style={{ maxHeight: 64, maxWidth: "45%", objectFit: "contain", display: "block", margin: "4px auto 2px" }} />
            )}
            {!logo && gigante && prefixo && (
              <p style={{ margin: "2px 0 0", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: "clamp(15px, 1.8vw, 22px)", textTransform: "uppercase", color: "#1c1917", lineHeight: 1.1 }}>
                {prefixo}
              </p>
            )}
            <p style={{ margin: "2px 0 0", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em", color: "#1c1917", lineHeight: 0.95, fontSize: "clamp(36px, 5.2vw, 64px)", overflowWrap: "anywhere" }}>
              {gigante || nome || "Evento"}
            </p>
          </div>

          {/* O NÚMERO DO TUBO — o maior texto da folha depois da cidade: entre
              os tubos do mesmo evento, é ele que diz qual é qual. */}
          <div style={{ textAlign: "center", borderBottom: "3px solid #1c1917", padding: "6px 0 8px" }}>
            <span data-testid="numero-do-tubo" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(56px, 9vw, 96px)", fontWeight: 900, lineHeight: 1, color: "#1c1917" }}>
              TUBO {data.tubo.numero}
            </span>
          </div>

          {data.pecas.length === 0 ? (
            <p style={{ fontSize: 14, color: "#57534e", textAlign: "center" }}>Este tubo está vazio.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 10, gap: 2 }}>
              {data.pecas.map((p) => (
                <p key={p.id} data-testid={`linha-tubo-${p.id}`} style={{ margin: 0, maxWidth: "100%", fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 800, lineHeight: 1.25, color: "#1c1917", textAlign: "center", overflowWrap: "anywhere" }}>
                  {linhaDaEtiquetaDoTubo(p)}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
