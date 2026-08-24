// ─────────────────────────────────────────────────────────────────────────────
// RELATÓRIO DO EVENTO — uma página, pronta para imprimir/PDF.
//
// O status report que era montado à mão com prints de quatro telas. O DADO
// vem pronto de /api/events/:id/relatorio (mesma fonte da Gestão de Prazos);
// esta página só o apresenta — em papel A4, com a mesma cara do sistema.
//
// DESENHO:
//  · Documento, não dashboard: uma coluna, hierarquia tipográfica, zero
//    interação além de Imprimir e Voltar (que somem na impressão).
//  · O PDF é o do navegador (Ctrl+P → salvar como PDF). Sem motor próprio:
//    para uma página de texto e tabelas, o print nativo é melhor tipografia
//    por zero código.
//  · Evento fora da gestão de prazos não finge funil vivo: diz "concluído/
//    encerrado" e mostra os totais — que continuam verdadeiros.
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Printer, ArrowLeft } from "lucide-react";
import { getStatusLabel } from "@/lib/status";

interface Relatorio {
  gerado: { em: string; por: string };
  evento: { id: string; name: string; truckDepartureDate: string | null; startDate: string | null; priority: string | null; status: string };
  totais: { pecas: number; entregues: number; canceladas: number };
  prazo: null | {
    categoria: string; piorAtrasoDias?: number;
    stages: Array<{ key: string; label: string; deadline: string | null; state: string; pendingCount: number; diffDays: number | null }>;
    pendingItems: Array<{ id: string; displayId: string; status: string; type: string; description: string | null; waitingDays: number | null; stageIndex: number; marcoIndex: number }>;
  };
  aprovacoes: Array<{ nome: string; comPatrocinador: number; comArte: number }>;
  fotos: { total: number; conferencia: number; entrega: number; ultimas: Array<{ url: string; kind: string; displayId: string | null }> };
}

const dataBR = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";

/** Tom da etapa no papel: preto e cinza imprimem; o vermelho fica para o atraso. */
const tomDoEstado = (state: string) =>
  state === "overdue" ? { cor: "#b91c1c", texto: "vencida" }
  : state === "warning" ? { cor: "#b45309", texto: "vence já" }
  : state === "done" ? { cor: "#15803d", texto: "concluída" }
  : { cor: "#78716c", texto: "a vencer" };

export default function RelatorioEvento() {
  const [, params] = useRoute("/eventos/:id/relatorio");
  const eventId = params?.id;

  const { data: r, isLoading, isError, refetch } = useQuery<Relatorio>({
    queryKey: [`/api/events/${eventId}/relatorio`],
    enabled: !!eventId,
  });

  if (isLoading) {
    return <p style={{ padding: 40, fontSize: 14, color: "#78716c" }}>Montando o relatório…</p>;
  }
  if (isError || !r) {
    return (
      <div style={{ padding: 40 }}>
        <p style={{ fontSize: 14, color: "#b91c1c" }}>Não foi possível montar o relatório.</p>
        <button onClick={() => refetch()} style={{ marginTop: 10, height: 36, padding: "0 14px", borderRadius: 8, border: "1px solid #e7e5e4", background: "#fff", cursor: "pointer", font: "inherit", fontSize: 13 }}>Tentar de novo</button>
      </div>
    );
  }

  const atrasadas = r.prazo
    ? r.prazo.pendingItems.filter((p) => r.prazo!.stages[p.marcoIndex]?.state === "overdue")
    : [];

  return (
    <div style={{ backgroundColor: "#ffffff", minHeight: "100%" }}>
      {/* Regras SÓ desta página: A4 com margem, e a barra de ações some no papel. */}
      <style>{`
        @media print {
          .rel-acao { display: none !important; }
          @page { size: A4; margin: 14mm; }
          body { background: #fff !important; }
        }
      `}</style>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "24px 24px 64px" }}>

        {/* ── Ações (não imprimem) ── */}
        <div className="rel-acao" style={{ display: "flex", gap: 8, justifyContent: "space-between", marginBottom: 18 }}>
          <Link href={`/eventos/${r.evento.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 12px", borderRadius: 8, border: "1px solid #e7e5e4", color: "#44403c", fontSize: 13, fontWeight: 600, textDecoration: "none" }} data-testid="link-voltar-evento">
            <ArrowLeft style={{ width: 14, height: 14 }} /> Voltar ao evento
          </Link>
          <button type="button" onClick={() => window.print()} data-testid="button-imprimir-relatorio"
            style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px", borderRadius: 8, border: "none", backgroundColor: "#1c1917", color: "#fff", cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 700 }}>
            <Printer style={{ width: 14, height: 14 }} /> Imprimir / PDF
          </button>
        </div>

        {/* ── Cabeçalho do documento ── */}
        <header style={{ borderBottom: "2px solid #1c1917", paddingBottom: 14, marginBottom: 20 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#78716c" }}>
            NORTE · relatório do evento
          </p>
          <h1 style={{ margin: "6px 0 4px", fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: "#1c1917" }} data-testid="titulo-relatorio">
            {r.evento.name}
          </h1>
          <p style={{ margin: 0, fontSize: 12.5, color: "#57534e" }}>
            Saída do caminhão {dataBR(r.evento.truckDepartureDate)} · evento {dataBR(r.evento.startDate)}
            {" · "}gerado em {new Date(r.gerado.em).toLocaleString("pt-BR")} por {r.gerado.por}
          </p>
        </header>

        {/* ── Totais ── */}
        <section style={{ display: "flex", gap: 24, marginBottom: 22, flexWrap: "wrap" }} data-testid="relatorio-totais">
          {[
            ["Peças", r.totais.pecas],
            ["Entregues", r.totais.entregues],
            ["Canceladas", r.totais.canceladas],
            ["Fotos", r.fotos.total],
          ].map(([rotulo, n]) => (
            <div key={String(rotulo)}>
              <p style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700, color: "#1c1917", fontVariantNumeric: "tabular-nums" }}>{n}</p>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#78716c" }}>{rotulo}</p>
            </div>
          ))}
        </section>

        {/* ── Funil ── */}
        <section style={{ marginBottom: 22 }}>
          <h2 style={{ margin: "0 0 8px", fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 700, color: "#1c1917" }}>Funil por etapa</h2>
          {r.prazo ? (
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
              <thead><tr>
                {["Etapa", "Prazo", "Situação", "Pendentes"].map((h) => (
                  <th key={h} style={{ textAlign: h === "Pendentes" ? "right" : "left", padding: "5px 8px", borderBottom: "1px solid #1c1917", fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#78716c" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {r.prazo.stages.map((s) => {
                  const tom = tomDoEstado(s.state);
                  return (
                    <tr key={s.key} data-testid={`funil-${s.key}`}>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #f0efee", color: "#1c1917", fontWeight: 600 }}>{s.label}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #f0efee", color: "#44403c" }}>{s.deadline ? dataBR(s.deadline) : "—"}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #f0efee", color: tom.cor, fontWeight: 700 }}>
                        {tom.texto}{s.state === "overdue" && s.diffDays != null ? ` há ${Math.abs(s.diffDays)}d` : ""}
                      </td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #f0efee", textAlign: "right", fontVariantNumeric: "tabular-nums", color: s.pendingCount > 0 ? "#1c1917" : "#a8a29e", fontWeight: s.pendingCount > 0 ? 700 : 400 }}>{s.pendingCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p data-testid="funil-encerrado" style={{ margin: 0, fontSize: 13, color: "#44403c", backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 12px" }}>
              Este evento saiu da gestão de prazos — tudo entregue, ou evento encerrado. Os totais acima seguem valendo; o funil não tem mais pendência a mostrar.
            </p>
          )}
        </section>

        {/* ── Atrasadas ── */}
        {atrasadas.length > 0 && (
          <section style={{ marginBottom: 22 }}>
            <h2 style={{ margin: "0 0 8px", fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 700, color: "#b91c1c" }}>
              Peças com prazo vencido — {atrasadas.length}
            </h2>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
              <tbody>
                {atrasadas.slice(0, 25).map((p) => (
                  <tr key={p.id} data-testid={`atrasada-${p.id}`}>
                    <td style={{ padding: "5px 8px", borderBottom: "1px solid #f0efee", fontWeight: 700, color: "#1c1917", whiteSpace: "nowrap" }}>{p.displayId}</td>
                    <td style={{ padding: "5px 8px", borderBottom: "1px solid #f0efee", color: "#44403c" }}>{p.type}{p.description ? ` — ${p.description}` : ""}</td>
                    <td style={{ padding: "5px 8px", borderBottom: "1px solid #f0efee", color: "#78716c", whiteSpace: "nowrap" }}>{getStatusLabel(p.status)}</td>
                    <td style={{ padding: "5px 8px", borderBottom: "1px solid #f0efee", color: "#b91c1c", fontWeight: 700, whiteSpace: "nowrap", textAlign: "right" }}>
                      {p.waitingDays != null ? `${p.waitingDays}d parada` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {atrasadas.length > 25 && (
              <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "#78716c" }}>+{atrasadas.length - 25} peças — a lista completa está na Gestão de Prazos.</p>
            )}
          </section>
        )}

        {/* ── Aprovações pendentes ── */}
        <section style={{ marginBottom: 22 }}>
          <h2 style={{ margin: "0 0 8px", fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 700, color: "#1c1917" }}>Aprovações em aberto, por patrocinador</h2>
          {r.aprovacoes.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "#78716c" }}>Nenhuma aprovação pendente neste evento.</p>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }} data-testid="tabela-aprovacoes">
              <thead><tr>
                {["Patrocinador", "Com o patrocinador", "Com a Arte (refazendo)"].map((h, i) => (
                  <th key={h} style={{ textAlign: i === 0 ? "left" : "right", padding: "5px 8px", borderBottom: "1px solid #1c1917", fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#78716c" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {r.aprovacoes.map((a) => (
                  <tr key={a.nome}>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid #f0efee", fontWeight: 600, color: "#1c1917" }}>{a.nome}</td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid #f0efee", textAlign: "right", fontVariantNumeric: "tabular-nums", color: a.comPatrocinador ? "#b45309" : "#a8a29e", fontWeight: a.comPatrocinador ? 700 : 400 }}>{a.comPatrocinador}</td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid #f0efee", textAlign: "right", fontVariantNumeric: "tabular-nums", color: a.comArte ? "#44403c" : "#a8a29e" }}>{a.comArte}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ── Fotos ── */}
        <section>
          <h2 style={{ margin: "0 0 8px", fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 700, color: "#1c1917" }}>
            Registros fotográficos — {r.fotos.conferencia} de conferência · {r.fotos.entrega} de entrega
          </h2>
          {r.fotos.ultimas.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "#78716c" }}>Ainda não há fotos deste evento.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }} data-testid="grade-fotos">
              {r.fotos.ultimas.map((f, i) => (
                <figure key={i} style={{ margin: 0 }}>
                  <img src={f.url} alt={f.displayId ? `Foto da peça ${f.displayId}` : "Registro fotográfico"} loading="lazy"
                    style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 6, border: "1px solid #e7e5e4" }} />
                  {f.displayId && <figcaption style={{ fontSize: 10.5, color: "#78716c", marginTop: 2 }}>{f.displayId}</figcaption>}
                </figure>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
