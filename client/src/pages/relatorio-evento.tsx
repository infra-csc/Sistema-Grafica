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
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Printer, ArrowLeft, CheckCircle2 } from "lucide-react";
import { getStatusLabel } from "@/lib/status";
import { FONT, FS, FW, N, R, SHADOW, T, TOM } from "@/lib/theme";
import { useIsMobile } from "@/hooks/use-mobile";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { EstadoErro, Esqueleto } from "@/components/ui/estados";
import { cssDeImpressaoIsolada } from "@/lib/impressao-isolada";

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

/** Tom da etapa no papel: preto e cinza imprimem; o vermelho fica para o atraso.
 *  Os mesmos tons de antes, agora pelos tokens (perigo/alerta/sucesso são os
 *  MESMOS hex; o cinza do "a vencer" desce um degrau, para T.second, 5:1). */
const tomDoEstado = (state: string) =>
  state === "overdue" ? { cor: TOM.perigo.text, texto: "vencida" }
  : state === "warning" ? { cor: TOM.alerta.text, texto: "vence já" }
  : state === "done" ? { cor: TOM.sucesso.text, texto: "concluída" }
  : { cor: T.second, texto: "a vencer" };

export default function RelatorioEvento() {
  const [, params] = useRoute("/eventos/:id/relatorio");
  const eventId = params?.id;
  const isMobile = useIsMobile();
  // A folha se ajusta à LARGURA ÚTIL (sem o menu lateral): no tablet de 768
  // com o menu aberto sobram ~500px, e a folha de notebook ficava espremida.
  const [mesaEl, setMesaEl] = useState<HTMLDivElement | null>(null);
  const [larguraUtil, setLarguraUtil] = useState(0);
  useEffect(() => {
    if (!mesaEl) return;
    const medir = () => setLarguraUtil(mesaEl.clientWidth);
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(mesaEl);
    return () => ro.disconnect();
  }, [mesaEl]);
  const estreito = isMobile || (larguraUtil > 0 && larguraUtil < 680);

  const { data: r, isLoading, isError, refetch, isFetching } = useQuery<Relatorio>({
    queryKey: [`/api/events/${eventId}/relatorio`],
    enabled: !!eventId,
  });

  // A MESA: fundo da página, com a folha branca no meio. É a mesma moldura nos
  // três estados (montando, falhou, pronto) — a tela não "pula" de layout.
  const mesa = (conteudo: React.ReactNode) => (
    <div ref={setMesaEl} className="rel-mesa" style={{ backgroundColor: T.bg, minHeight: "100%", padding: isMobile ? "12px 12px 48px" : "20px 24px 64px" }}>
      {conteudo}
    </div>
  );

  if (isLoading) {
    // Esqueleto em forma de documento; role="status" vem do <Esqueleto>.
    return mesa(
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div style={{ height: isMobile ? 44 : 36, marginBottom: 16 }} />
        <div style={{ padding: isMobile ? "20px 16px" : "40px 44px", borderRadius: R.lg, backgroundColor: T.surface, border: `1px solid ${T.border}`, boxShadow: SHADOW.sm }}>
          <Esqueleto variante="tabela" linhas={8} rotulo="Montando o relatório" />
        </div>
      </div>,
    );
  }
  if (isError || !r) {
    return mesa(
      <div style={{ maxWidth: 560, margin: isMobile ? "12px auto" : "40px auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ width: "100%" }}>
          <EstadoErro titulo="Não foi possível montar o relatório" testId="relatorio-erro"
            detalhe="Os dados do evento não chegaram. Confira a conexão e tente de novo."
            aoTentarDeNovo={() => { void refetch(); }} carregando={isFetching} tamanhoDoBotao={isMobile ? "toque" : "md"} testIdDoBotao="relatorio-tentar-de-novo" />
        </div>
        {/* A saída ao lado do "tentar de novo": sem ela, quem caiu aqui por
            falha de rede só voltava pelo botão do navegador. */}
        {eventId && (
          <BotaoLink href={`/eventos/${eventId}`} variante="fantasma" tamanho={isMobile ? "toque" : "md"} icone={ArrowLeft}>Voltar ao evento</BotaoLink>
        )}
      </div>,
    );
  }

  const atrasadas = r.prazo
    ? r.prazo.pendingItems.filter((p) => r.prazo!.stages[p.marcoIndex]?.state === "overdue")
    : [];

  // Tipografia do DOCUMENTO: as mesmas famílias e degraus da casa, num ritmo
  // de papel — títulos de seção em 15, corpo de tabela em 12,5.
  const h2: React.CSSProperties = { margin: "0 0 8px", fontFamily: FONT.display, fontSize: FS.strong, fontWeight: FW.forte, color: T.text };
  // No celular as tabelas não rolam de lado: o cabeçalho quebra linha, a
  // situação desce para baixo da descrição e o recuo das células encolhe.
  const th: React.CSSProperties = { padding: estreito ? "5px 6px" : "5px 8px", borderBottom: `1px solid ${T.text}`, fontSize: 10.5, fontWeight: FW.forte, letterSpacing: "0.08em", textTransform: "uppercase", color: T.second, whiteSpace: estreito ? "normal" : "nowrap", verticalAlign: "bottom" };
  const td: React.CSSProperties = { padding: estreito ? "7px 6px" : "6px 8px", borderBottom: `1px solid ${N.n3}`, verticalAlign: "top" };
  const semQuebra = estreito ? "normal" : "nowrap";
  const tabela: React.CSSProperties = { borderCollapse: "collapse", width: "100%", fontSize: 12.5 };

  return mesa(
    <>
      {/* Regras SÓ desta página: A4 com margem; no papel vai só a folha. */}
      <style>{`
        @media print {
          ${cssDeImpressaoIsolada(".rel-documento")}
          .rel-acao { display: none !important; }
          @page { size: A4; margin: 14mm; }
          body { background: #fff !important; }
          .rel-documento { border: 0 !important; border-radius: 0 !important; box-shadow: none !important; padding: 0 !important; max-width: none !important; }
          .rel-rolagem { overflow: visible !important; }
          .rel-fotos { grid-template-columns: repeat(4, 1fr) !important; }
          .rel-documento tr, .rel-documento figure { break-inside: avoid; page-break-inside: avoid; }
          .rel-documento h2 { break-after: avoid; page-break-after: avoid; }
        }
      `}</style>

      {/* ── Barra de ações (não imprime) ── */}
      <div className="rel-acao" data-testid="relatorio-barra" style={{ maxWidth: 820, margin: "0 auto 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <BotaoLink href={`/eventos/${r.evento.id}`} data-testid="link-voltar-evento" icone={ArrowLeft} tamanho={isMobile ? "toque" : "md"}>
          Voltar ao evento
        </BotaoLink>
        <span style={{ flex: "1 1 auto" }} />
        {/* "Imprimir / PDF" abre a janela do navegador — quem quer o arquivo
            não sabia que o PDF sai dali. Uma linha, ao lado do botão. */}
        {!isMobile && (
          <span style={{ fontSize: FS.meta, color: T.second, textAlign: "right", maxWidth: 300, lineHeight: 1.4 }}>
            Para salvar em arquivo, escolha “Salvar como PDF” no destino da impressão.
          </span>
        )}
        <Botao variante="primario" icone={Printer} onClick={() => window.print()} data-testid="button-imprimir-relatorio" tamanho={isMobile ? "toque" : "md"}
          title='Abre a impressão do navegador — para o arquivo, escolha "Salvar como PDF".'>
          Imprimir / PDF
        </Botao>
        {isMobile && (
          <p style={{ flex: "1 1 100%", margin: 0, fontSize: FS.meta, color: T.second, lineHeight: 1.4 }}>
            Para salvar em arquivo, escolha “Salvar como PDF” no destino da impressão.
          </p>
        )}
      </div>

      {/* ── A FOLHA ── na tela, um papel sobre a mesa; no papel, só o conteúdo. */}
      <article className="rel-documento" data-testid="relatorio-documento" aria-labelledby="titulo-relatorio-h1"
        style={{ maxWidth: 820, margin: "0 auto", padding: isMobile ? "20px 16px 24px" : estreito ? "28px 24px 32px" : "40px 48px 44px", boxSizing: "border-box", borderRadius: R.lg, backgroundColor: T.surface, border: `1px solid ${T.border}`, boxShadow: SHADOW.md, color: T.text }}>

        {/* ── Cabeçalho do documento ── */}
        <header style={{ borderBottom: `2px solid ${T.text}`, paddingBottom: 14, marginBottom: 20 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: FW.forte, letterSpacing: "0.14em", textTransform: "uppercase", color: T.second }}>
            NORTE · relatório do evento
          </p>
          <h1 id="titulo-relatorio-h1" style={{ margin: "6px 0 4px", fontFamily: FONT.display, fontSize: estreito ? FS.h2 : FS.h1, fontWeight: FW.forte, letterSpacing: "-0.02em", lineHeight: 1.15, color: T.text, overflowWrap: "anywhere" }} data-testid="titulo-relatorio">
            {r.evento.name}
          </h1>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: T.apoio }}>
            Saída do caminhão {dataBR(r.evento.truckDepartureDate)} · evento {dataBR(r.evento.startDate)}
            {" · "}gerado em {new Date(r.gerado.em).toLocaleString("pt-BR")} por {r.gerado.por}
          </p>
        </header>

        {/* ── Totais ── */}
        <section style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, max-content)", columnGap: isMobile ? 16 : estreito ? 28 : 40, rowGap: 14, marginBottom: 24 }} data-testid="relatorio-totais">
          {[
            ["Peças", r.totais.pecas],
            ["Entregues", r.totais.entregues],
            ["Canceladas", r.totais.canceladas],
            ["Fotos", r.fotos.total],
          ].map(([rotulo, n]) => (
            <div key={String(rotulo)}>
              <p style={{ margin: 0, fontFamily: FONT.display, fontSize: FS.h1, fontWeight: FW.forte, lineHeight: 1.1, color: T.text, fontVariantNumeric: "tabular-nums" }}>{n}</p>
              <p style={{ margin: "2px 0 0", fontSize: FS.small, fontWeight: FW.forte, letterSpacing: "0.08em", textTransform: "uppercase", color: T.second }}>{rotulo}</p>
            </div>
          ))}
        </section>

        {/* ── Funil ── */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={h2}>Funil por etapa</h2>
          {r.prazo ? (
            <div className="rel-rolagem" style={{ overflowX: "auto" }}>
              <table style={tabela}>
                <thead><tr>
                  {["Etapa", "Prazo", "Situação", "Pendentes"].map((h) => (
                    <th key={h} style={{ ...th, textAlign: h === "Pendentes" ? "right" : "left" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {r.prazo.stages.map((s) => {
                    const tom = tomDoEstado(s.state);
                    return (
                      <tr key={s.key} data-testid={`funil-${s.key}`}>
                        <td style={{ ...td, color: T.text, fontWeight: FW.medio }}>{s.label}</td>
                        <td style={{ ...td, color: T.strong, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{s.deadline ? dataBR(s.deadline) : "—"}</td>
                        <td style={{ ...td, color: tom.cor, fontWeight: FW.forte, whiteSpace: semQuebra }}>
                          {tom.texto}{s.state === "overdue" && s.diffDays != null ? ` há ${Math.abs(s.diffDays)}d` : ""}
                        </td>
                        {/* O zero fica em T.second (5:1), não no cinza claro de
                            antes: o peso 400 contra 700 já o rebaixa — clarear
                            além disso some com ele na impressão a laser. */}
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: s.pendingCount > 0 ? T.text : T.second, fontWeight: s.pendingCount > 0 ? FW.forte : 400 }}>{s.pendingCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p data-testid="funil-encerrado" style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: 0, fontSize: FS.body, lineHeight: 1.5, color: T.strong, backgroundColor: TOM.sucesso.bg, border: `1px solid ${TOM.sucesso.border}`, borderRadius: R.md, padding: "10px 12px" }}>
              <CheckCircle2 aria-hidden="true" style={{ width: 16, height: 16, marginTop: 2, color: TOM.sucesso.text, flexShrink: 0 }} />
              <span>Este evento saiu da gestão de prazos — tudo entregue, ou evento encerrado. Os totais acima seguem valendo; o funil não tem mais pendência a mostrar.</span>
            </p>
          )}
        </section>

        {/* ── Atrasadas ── */}
        {atrasadas.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ ...h2, color: TOM.perigo.text }}>
              Peças com prazo vencido — {atrasadas.length}
            </h2>
            <div className="rel-rolagem" style={{ overflowX: "auto" }}>
              <table style={tabela}>
                <tbody>
                  {atrasadas.slice(0, 25).map((p) => (
                    <tr key={p.id} data-testid={`atrasada-${p.id}`}>
                      <td style={{ ...td, fontWeight: FW.forte, color: T.text, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{p.displayId}</td>
                      <td style={{ ...td, color: T.strong }}>
                        {p.type}{p.description ? ` — ${p.description}` : ""}
                        {estreito && <span style={{ display: "block", marginTop: 2, fontSize: FS.small, color: T.second }}>{getStatusLabel(p.status)}</span>}
                      </td>
                      {!estreito && <td style={{ ...td, color: T.second, whiteSpace: "nowrap" }}>{getStatusLabel(p.status)}</td>}
                      <td style={{ ...td, color: TOM.perigo.text, fontWeight: FW.forte, whiteSpace: "nowrap", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {p.waitingDays != null ? `${p.waitingDays}d parada` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {atrasadas.length > 25 && (
              <p style={{ margin: "6px 0 0", fontSize: FS.small, color: T.second }}>
                +{atrasadas.length - 25} peças — a lista completa está na Gestão de Prazos.{" "}
                {/* O atalho só na tela (rel-acao some no papel): a frase dizia
                    onde estava a lista e não levava até ela. */}
                <Link href="/prazos" className="rel-acao rel-link" style={{ color: T.accentText, fontWeight: FW.medio }}>Abrir a Gestão de Prazos</Link>
              </p>
            )}
          </section>
        )}

        {/* ── Aprovações pendentes ── */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={h2}>Aprovações em aberto, por patrocinador</h2>
          {r.aprovacoes.length === 0 ? (
            <p data-testid="aprovacoes-vazio" style={{ margin: 0, fontSize: FS.body, color: T.second }}>Nenhuma aprovação pendente neste evento.</p>
          ) : (
            <div className="rel-rolagem" style={{ overflowX: "auto" }}>
              <table style={tabela} data-testid="tabela-aprovacoes">
                <thead><tr>
                  {["Patrocinador", "Com o patrocinador", "Com a Arte (refazendo)"].map((h, i) => (
                    <th key={h} style={{ ...th, textAlign: i === 0 ? "left" : "right" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {r.aprovacoes.map((a) => (
                    <tr key={a.nome}>
                      <td style={{ ...td, fontWeight: FW.medio, color: T.text }}>{a.nome}</td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: a.comPatrocinador ? TOM.alerta.text : T.second, fontWeight: a.comPatrocinador ? FW.forte : 400 }}>{a.comPatrocinador}</td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: a.comArte ? T.strong : T.second }}>{a.comArte}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Fotos ── */}
        <section>
          <h2 style={h2}>
            Registros fotográficos <span style={{ fontFamily: FONT.corpo, fontSize: FS.body, fontWeight: FW.medio, color: T.second }}>— {r.fotos.conferencia} de conferência · {r.fotos.entrega} de entrega</span>
          </h2>
          {r.fotos.ultimas.length === 0 ? (
            <p data-testid="fotos-vazio" style={{ margin: 0, fontSize: FS.body, color: T.second }}>Ainda não há fotos deste evento.</p>
          ) : (
            <div className="rel-fotos" style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : estreito ? "repeat(3, 1fr)" : "repeat(4, 1fr)", gap: 8 }} data-testid="grade-fotos">
              {r.fotos.ultimas.map((f, i) => (
                <figure key={i} style={{ margin: 0 }}>
                  <img src={f.url} alt={f.displayId ? `Foto da peça ${f.displayId}` : "Registro fotográfico"} loading="lazy"
                    style={{ display: "block", width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: R.sm, border: `1px solid ${T.border}`, backgroundColor: N.n2 }} />
                  <figcaption style={{ display: "flex", justifyContent: "space-between", gap: 6, fontSize: 10.5, color: T.second, marginTop: 3 }}>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{f.displayId ?? "—"}</span>
                    <span>{/* a mesma régua da contagem no servidor */}{String(f.kind).startsWith("confer") ? "conferência" : "entrega"}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>

      </article>
    </>,
  );
}
