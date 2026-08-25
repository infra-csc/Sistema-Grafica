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
import { ehBookCompleto } from "@shared/fluxo-peca";
import { logoDaCapaDoBook } from "@/lib/logo-do-book";
import { useEffect } from "react";

/** Conferida = já passou pela conferência (inclui as entregues e as grafias legadas). */
const CONFERIDA = new Set(["conferred", "conferido", "delivered", "entregue"]);
const jaConferida = (i: any) => CONFERIDA.has(i.status) || (i.conferredQty ?? 0) > 0;

const dataBR = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }) : null;

export default function EtiquetasEvento() {
  const [, params] = useRoute("/eventos/:id/etiquetas");
  const eventId = params?.id;
  // Quem chegou pela Gráfica volta para a Gráfica (pedido do dono, 25/08):
  // os atalhos de lá carregam ?de=grafica, e o Voltar respeita a origem.
  const veioDaGrafica = new URLSearchParams(window.location.search).get("de") === "grafica";
  const voltarHref = veioDaGrafica ? "/grafica" : `/eventos/${eventId}`;
  const [incluirTodas, setIncluirTodas] = useState(false);

  /**
   * SELEÇÃO (pedido do dono, 25/08): nem toda conferida precisa de etiqueta
   * naquela impressão. O conjunto guarda as DESMARCADAS — vazio = todas, e
   * peça recém-conferida entra marcada sozinha.
   */
  const [desmarcadas, setDesmarcadas] = useState<Set<string>>(new Set());

  /**
   * ORIENTAÇÃO: paisagem (folha deitada, tiras empilhadas) ou retrato — a
   * folha EM PÉ com o conteúdo deitado, que se lê virando a página. O retrato
   * é exatamente o template original do dono (circuito vale.pdf): A4 em pé,
   * corte vertical no meio, cada metade uma tira deitada.
   */
  const [orientacao, setOrientacao] = useState<"paisagem" | "retrato">("paisagem");

  /**
   * O LOGO DA PROVA, tirado do book (pedido do dono, 25/08): a capa do book
   * subido é o logo num fundo liso — rasterizada e recortada, vira a marca
   * da etiqueta, no lugar da linha de texto. Sem book (ou capa ilegível), a
   * etiqueta segue como era: o logo é enfeite, não pré-requisito.
   */
  const [logo, setLogo] = useState<string | null>(null);
  const [buscandoLogo, setBuscandoLogo] = useState(false);
  const [usarLogo, setUsarLogo] = useState(true);

  /**
   * A PALAVRA GIGANTE da etiqueta. No modelo do dono o nome tem dois níveis:
   * a marca do evento pequena ('Circuito Corrida Vale 2026') e a CIDADE
   * enorme ('ITABIRA') — é ela que se lê de longe. O padrão é a última
   * palavra do nome, e o campo é editável antes de imprimir porque nenhuma
   * regra automática acerta 'São Paulo' (duas palavras) sem errar outra.
   */
  const [destaque, setDestaque] = useState<string | null>(null);

  const { data: event, isError: eventoFalhou } = useQuery<any>({ queryKey: [`/api/events/${eventId}`], enabled: !!eventId });
  const { data: itens = [], isLoading, isError: itensFalharam, refetch } = useQuery<any[]>({
    queryKey: ["/api/items", eventId],
    enabled: !!eventId,
  });

  const pool = useMemo(() => {
    // BOOK COMPLETO fica de fora: é o trâmite do Atendimento, não uma peça (ver shared/fluxo-peca).
    const vivas = (itens as any[]).filter((i) => !i.deletedAt && i.status !== "canceled" && i.status !== "archived" && !ehBookCompleto(i));
    const base = incluirTodas ? vivas : vivas.filter(jaConferida);
    return [...base].sort((a, b) => compareDisplayId(a.displayId, b.displayId));
  }, [itens, incluirTodas]);

  const pecas = useMemo(() => pool.filter((p) => !desmarcadas.has(p.id)), [pool, desmarcadas]);

  const bookUrl = useMemo(() => (itens as any[]).find((i) => i.bookUrl && !i.deletedAt)?.bookUrl ?? null, [itens]);
  useEffect(() => {
    let vivo = true;
    setLogo(null);
    if (!bookUrl) return;
    setBuscandoLogo(true);
    logoDaCapaDoBook(bookUrl).then((l) => { if (vivo) { setLogo(l); setBuscandoLogo(false); } });
    return () => { vivo = false; };
  }, [bookUrl]);

  const conferidas = useMemo(() => (itens as any[]).filter((i) => !i.deletedAt && jaConferida(i)).length, [itens]);

  const nome: string = event?.name ?? "";
  const palavraFinal = nome.trim().split(/\s+/).slice(-1)[0] ?? "";
  const gigante = (destaque ?? palavraFinal).trim();
  // O prefixo é o nome SEM a parte gigante (comparado sem caixa); se o
  // destaque digitado não estiver no nome, o nome inteiro vira prefixo.
  const idx = gigante ? nome.toLowerCase().lastIndexOf(gigante.toLowerCase()) : -1;
  const prefixo = idx >= 0 ? (nome.slice(0, idx) + nome.slice(idx + gigante.length)).replace(/\s+/g, " ").trim() : nome;

  if (isLoading) return <p style={{ padding: 40, fontSize: 14, color: "#78716c" }}>Montando as etiquetas…</p>;

  // Falha de rede NÃO pode virar "evento sem peças" — mentiria justamente
  // para quem está com a impressora esperando.
  if (itensFalharam || eventoFalhou) {
    return (
      <div style={{ padding: 40 }}>
        <p data-testid="etiquetas-erro" style={{ margin: 0, fontSize: 14, color: "#b91c1c", fontWeight: 600 }}>
          Não foi possível carregar as peças do evento.
        </p>
        <button type="button" onClick={() => refetch()} style={{ marginTop: 12, height: 40, padding: "0 16px", borderRadius: 8, border: "1px solid #e7e5e4", background: "#fff", cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 600, color: "#44403c" }}>
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: "#ffffff", minHeight: "100%" }}>
      <style>{`
        /* A ETIQUETA É MEIA FOLHA, SEMPRE. A altura vinha do conteúdo
           (minHeight solto) — a linha de corte caía onde o texto mandasse, e
           a guilhotina corta no MEIO do papel. Folha com proporção de A4 nas
           duas orientações; cada etiqueta ocupa 50% cravados; folha ímpar
           deixa a metade de baixo vazia, e o corte continua certo. */
        .etq-folha { display: flex; flex-direction: column; }
        .etq-etiqueta { height: 50%; flex: none; overflow: hidden; box-sizing: border-box; }
        @media print {
          .etq-acao { display: none !important; }
          @page { size: A4 ${orientacao === "retrato" ? "portrait" : "landscape"}; margin: 8mm; }
          body { background: #fff !important; }
          .etq-quebra { page-break-after: always; }
          .etq-quebra:last-child { page-break-after: auto; }
          .etq-moldura-paisagem { width: 281mm !important; height: 194mm !important; max-width: none !important; }
          .etq-moldura-paisagem > .etq-folha { width: 100% !important; height: 100% !important; border: none !important; border-radius: 0 !important; }
          /* RETRATO: a folha fica em pé e o conteúdo (deitado, como o template
             original do dono) gira 90° para caber — lê-se virando a página. */
          .etq-moldura-retrato { width: 194mm !important; height: 281mm !important; }
          .etq-moldura-retrato > .etq-folha { width: 281mm !important; height: 194mm !important; left: 194mm !important; border: none !important; border-radius: 0 !important; }
        }
        @media screen {
          .etq-folha { border: 1px solid #e7e5e4; border-radius: 10px; }
          .etq-quebra { margin: 0 auto 18px; }
          /* Alvo de dedo na tela que o galpão usa por celular. */
          @media (pointer: coarse) {
            .etq-acao button, .etq-acao input[type="checkbox"] + span { min-height: 40px; }
            .etq-chip { min-height: 38px; }
          }
        }
        .etq-moldura-retrato { position: relative; width: 707px; height: 1000px; }
        .etq-moldura-retrato > .etq-folha { position: absolute; top: 0; left: 707px; width: 1000px; height: 707px; transform: rotate(90deg); transform-origin: top left; }
        .etq-moldura-paisagem { width: min(1050px, 100%); aspect-ratio: 297 / 210; }
        .etq-moldura-paisagem > .etq-folha { width: 100%; height: 100%; }
      `}</style>

      {/* ── Barra (não imprime) ── */}
      <div className="etq-acao" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "14px 18px", borderBottom: "1px solid #e7e5e4", position: "sticky", top: 0, backgroundColor: "#fafaf9", zIndex: 5 }}>
        <Link href={voltarHref} data-testid="link-voltar-evento" style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 12px", borderRadius: 8, border: "1px solid #e7e5e4", color: "#44403c", fontSize: 13, fontWeight: 600, textDecoration: "none", backgroundColor: "#fff" }}>
          <ArrowLeft style={{ width: 14, height: 14 }} /> {veioDaGrafica ? "Voltar à Gráfica" : "Voltar ao evento"}
        </Link>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1c1917", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Tags style={{ width: 15, height: 15, color: "#c2410c" }} />
          {pecas.length} etiqueta{pecas.length !== 1 ? "s" : ""} · {Math.ceil(pecas.length / 2)} folha{Math.ceil(pecas.length / 2) !== 1 ? "s" : ""}
        </span>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "#44403c", cursor: "pointer", marginLeft: 6 }}>
          <input type="checkbox" checked={incluirTodas} onChange={(e) => setIncluirTodas(e.target.checked)} data-testid="check-incluir-todas" style={{ width: 16, height: 16, accentColor: "#c2410c" }} />
          Incluir as não conferidas
        </label>
        {buscandoLogo && (
          <span data-testid="logo-buscando" style={{ fontSize: 12, color: "#78716c" }}>buscando o logo do book…</span>
        )}
        {logo && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "#44403c", cursor: "pointer" }}>
            <input type="checkbox" checked={usarLogo} onChange={(e) => setUsarLogo(e.target.checked)} data-testid="check-usar-logo" style={{ width: 16, height: 16, accentColor: "#c2410c" }} />
            Logo do book
          </label>
        )}
        {/* Orientação da folha — o retrato é o template original do dono. */}
        <div role="group" aria-label="Orientação da folha" style={{ display: "inline-flex", borderRadius: 8, border: "1px solid #d6d3d1", overflow: "hidden" }}>
          {([["paisagem", "Deitada"], ["retrato", "Em pé"]] as const).map(([v, rotulo]) => (
            <button
              key={v}
              type="button"
              onClick={() => setOrientacao(v)}
              aria-pressed={orientacao === v}
              data-testid={`orientacao-${v}`}
              style={{
                height: 34, padding: "0 12px", border: "none", fontSize: 12.5, fontWeight: 700,
                backgroundColor: orientacao === v ? "#1c1917" : "#fff",
                color: orientacao === v ? "#fff" : "#57534e", cursor: "pointer",
              }}
            >
              {rotulo}
            </button>
          ))}
        </div>
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

      {/* ── Seleção: quais peças ganham etiqueta NESTA impressão ── */}
      {pool.length > 0 && (
        <div className="etq-acao" style={{ padding: "10px 18px", borderBottom: "1px solid #f0efee", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", maxHeight: 130, overflowY: "auto" }}>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#78716c", marginRight: 4 }}>
            Imprimir ({pecas.length}/{pool.length})
          </span>
          <button type="button" data-testid="selecao-todas" onClick={() => setDesmarcadas(new Set())}
            style={{ height: 26, padding: "0 10px", borderRadius: 999, border: "1px solid #d6d3d1", background: "#fff", fontSize: 11, fontWeight: 700, color: "#44403c", cursor: "pointer" }}>
            todas
          </button>
          <button type="button" data-testid="selecao-nenhuma" onClick={() => setDesmarcadas(new Set(pool.map((p) => p.id)))}
            style={{ height: 26, padding: "0 10px", borderRadius: 999, border: "1px solid #d6d3d1", background: "#fff", fontSize: 11, fontWeight: 700, color: "#44403c", cursor: "pointer" }}>
            nenhuma
          </button>
          {pool.map((p) => {
            const marcada = !desmarcadas.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setDesmarcadas((prev) => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                aria-pressed={marcada}
                className="etq-chip"
                data-testid={`selecao-peca-${p.id}`}
                title={`${p.type}${p.description ? " — " + p.description : ""}`}
                style={{
                  height: 26, padding: "0 9px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  border: `1px solid ${marcada ? "#c2410c" : "#e7e5e4"}`,
                  backgroundColor: marcada ? "#fff7ed" : "#fff",
                  // #78716c sobre #fff = 4,6:1 — o cinza claro anterior media 2,3:1.
                  color: marcada ? "#c2410c" : "#78716c",
                }}
              >
                {p.displayId}
              </button>
            );
          })}
        </div>
      )}

      {pecas.length === 0 && (
        <p data-testid="etiquetas-vazio" style={{ margin: 0, padding: "36px 24px", fontSize: 14, color: "#57534e", maxWidth: 560 }}>
          {incluirTodas
            ? "Este evento não tem peças para etiquetar."
            : <>Nenhuma peça conferida ainda — a etiqueta nasce da conferência. {conferidas === 0 && "Assim que a Gráfica conferir, elas aparecem aqui."} Se quiser adiantar, marque “Incluir as não conferidas”.</>}
        </p>
      )}

      {/* ── Folhas: 2 etiquetas por página, linha de corte no meio. A MESMA
          tira nas duas orientações — no retrato a folha inteira gira 90°,
          como no template original (corte vertical, leitura de lado). ── */}
      {/* overflow-x próprio: a folha em pé (707px) rola AQUI no celular — a
          página nunca ganha rolagem lateral (régua da casa). */}
      <div style={{ padding: "18px 12px 48px", overflowX: "auto" }}>
        {Array.from({ length: Math.ceil(pecas.length / 2) }, (_, f) => pecas.slice(f * 2, f * 2 + 2)).map((dupla, f) => (
          <div key={f} className={`etq-quebra ${orientacao === "retrato" ? "etq-moldura-retrato" : "etq-moldura-paisagem"}`} style={orientacao === "retrato" ? { margin: "0 auto 18px" } : undefined}>
          <div className="etq-folha" style={{ display: "flex", flexDirection: "column" }}>
            {dupla.map((p, i) => (
              <div key={p.id} data-testid={`etiqueta-${p.id}`} className="etq-etiqueta" style={{
                display: "flex", alignItems: "stretch", gap: 18, padding: "22px 26px",
                borderBottom: i === 0 ? "2px dashed #d6d3d1" : "none",
              }}>
                {/* O NOME DO EVENTO — o que se lê de longe na pilha */}
                <div style={{ flex: "1.2 1 0", minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#78716c" }}>
                    {event?.truckDepartureDate ? `Saída ${dataBR(event.truckDepartureDate)}` : " "}
                  </p>
                  {/* Dois níveis, como no modelo: a marca (o LOGO do book,
                      quando existe; senão o resto do nome em texto) e a
                      palavra de destaque GIGANTE — é ela que se lê de longe. */}
                  {logo && usarLogo && (
                    <img src={logo} alt="Logo do evento" data-testid="logo-etiqueta"
                      style={{ maxHeight: 92, maxWidth: "60%", objectFit: "contain", alignSelf: "flex-start", margin: "4px 0 6px" }} />
                  )}
                  {/* Sem palavra gigante (campo apagado), o nome sai UMA vez,
                      no tamanho médio — antes ele saía duplicado: inteiro como
                      "marca" e inteiro de novo como destaque. */}
                  {!(logo && usarLogo) && gigante && prefixo && (
                    <p style={{ margin: "4px 0 0", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: "clamp(16px, 2vw, 24px)", textTransform: "uppercase", letterSpacing: "0.01em", color: "#1c1917", lineHeight: 1.1 }}>
                      {prefixo}
                    </p>
                  )}
                  <p style={{
                    margin: "2px 0 0", fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em",
                    color: "#1c1917", lineHeight: 0.95,
                    fontSize: gigante && prefixo ? "clamp(56px, 8vw, 104px)" : "clamp(34px, 5.2vw, 64px)",
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
                    {/* A DESCRIÇÃO manda (pedido do dono, 25/08): é ela que
                        identifica o material na pilha — "Testeira Vale Local"
                        diz mais que #2219. O número fica pequeno, para quem
                        precisar conferir no sistema. */}
                    <p style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 30, fontWeight: 900, letterSpacing: "-0.01em", lineHeight: 1.12, color: "#1c1917", overflowWrap: "anywhere" }}>
                      {p.description || p.type}
                    </p>
                    <p style={{ margin: "6px 0 0", fontSize: 16, lineHeight: 1.3 }}>
                      <span style={{ color: "#44403c", textTransform: "uppercase", fontWeight: 700 }}>{p.type}</span>
                      {" "}<span style={{ color: "#c2410c", fontWeight: 700 }}>{p.displayId}</span>
                    </p>
                  </div>
                  <p style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 30, fontWeight: 900, color: "#1c1917", whiteSpace: "nowrap", alignSelf: "flex-start" }}>
                    {p.quantity ?? 1} un.
                  </p>
                </div>
              </div>
            ))}
          </div>
          </div>
        ))}
      </div>
    </div>
  );
}
