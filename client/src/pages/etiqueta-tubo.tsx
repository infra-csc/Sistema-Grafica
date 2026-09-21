// ─────────────────────────────────────────────────────────────────────────────
// ETIQUETA DO TUBO (dono, 14/09) — para colar no tubo antes do caminhão.
//
// 21/09 (dono): a etiqueta segue o formato da que o galpão já cola no rolo:
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
// 21/09, 2ª rodada — o galpão parar de fazer etiqueta no Corel (1.669 peças
// saíram com a etiqueta deles em setembro, 25 com a do app). A barra ganha as
// escolhas que eles fazem à mão: com ou sem quantidade, o TAMANHO do papel
// (adesivo 10×15 em pé é o padrão — é o que eles colam), CÓPIAS (colam dos
// dois lados do tubo) e a segunda etiqueta "REAPROVEITAR". Lista que não cabe
// numa etiqueta quebra em "Tubo 2 · 1 de 2". As regras (linha, tamanhos,
// paginação, preferências) moram em lib/etiqueta-lista.ts, as mesmas das
// listas das etiquetas do evento.
//
// O PDF é o do navegador (Imprimir → salvar como PDF). Na impressão as
// etiquetas saem por um PORTAL no <body> e todo o resto some por display: com
// VÁRIAS páginas, esconder por visibilidade deixava a casca do app (altura de
// tela, rolagem própria) segurar o fluxo — a segunda etiqueta não paginava.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Printer } from "lucide-react";
import { logoDaCapaDoBook } from "@/lib/logo-do-book";
import {
  COPIAS_MAX, ORDEM_DOS_TAMANHOS, TAMANHOS, comCopias, gravarPreferencias, lerPreferencias, limitarCopias,
  paginarLinhas, regraDaPagina, temReaproveitamento, type LinhaDaEtiqueta, type TamanhoEtiqueta,
} from "@/lib/etiqueta-lista";
import { CSS_DA_ETIQUETA_EM_LISTA, EtiquetaEmLista, EtiquetaReaproveitar } from "@/components/etiqueta-lista";

// `isReuse`/`reuseQty`: HOJE o GET /api/tubos/:id não devolve nenhum dos dois —
// ficam opcionais para o REAPROVEITAR ligar sozinho no dia em que a rota
// mandar; até lá vale o interruptor manual.
type Peca = { id: string; displayId: string | null; type: string; description: string | null; quantity: number; conferida: boolean; isReuse?: boolean | null; reuseQty?: number | null };
type Resposta = {
  tubo: { id: string; numero: number; entregueEm: string | null; recebidoPor: string | null };
  evento: { id: string; name: string; truckDepartureDate: string | null; bookUrl?: string | null } | null;
  pecas: Peca[];
};

type Pagina = { tipo: "lista"; linhas: LinhaDaEtiqueta<Peca>[]; n: number; total: number } | { tipo: "reaproveitar" };

export default function EtiquetaTubo() {
  const [, params] = useRoute("/grafica/tubos/:id/etiqueta");
  const id = params?.id;
  const { data, isLoading, isError } = useQuery<Resposta>({ queryKey: [`/api/tubos/${id}`], enabled: !!id });

  // PREFERÊNCIAS lembradas por navegador (o computador do galpão imprime
  // sempre no mesmo papel): lidas uma vez, gravadas a cada mudança.
  const [prefs, setPrefs] = useState(lerPreferencias);
  useEffect(() => { gravarPreferencias(prefs); }, [prefs]);
  const { mostrarQuantidade, tamanho, copias } = prefs;

  // REAPROVEITAR: null = "ainda não mexi" → segue o que as peças dizem. Não é
  // preferência lembrada: depende do TUBO, não do computador.
  const [reaproveitarManual, setReaproveitarManual] = useState<boolean | null>(null);
  const temReuso = useMemo(() => temReaproveitamento(data?.pecas ?? []), [data]);
  const reaproveitar = reaproveitarManual ?? temReuso;

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

  // AS PÁGINAS: a lista quebrada em etiquetas (+ REAPROVEITAR), o jogo inteiro
  // repetido pelas cópias. No tubo a lista sai na ordem do código, SEM
  // subtítulo de tipo: o tubo é pequeno e cada linha já começa pelo tipo.
  const paginas = useMemo<Pagina[]>(() => {
    if (!data) return [];
    const medidas = TAMANHOS[tamanho];
    const linhas = data.pecas.map((peca) => ({ tipo: "peca" as const, peca }));
    const partes = paginarLinhas(linhas, { capacidade: medidas.linhasComTubo, letrasPorLinha: medidas.letrasPorLinha, mostrarQuantidade });
    // Tubo vazio ainda imprime a etiqueta (evento + TUBO N): dá para colar antes de encher.
    const listas: Pagina[] = (partes.length ? partes : [[]]).map((l, k, todas) => ({ tipo: "lista", linhas: l, n: k + 1, total: todas.length }));
    return comCopias<Pagina>(reaproveitar ? [...listas, { tipo: "reaproveitar" }] : listas, copias);
  }, [data, tamanho, mostrarQuantidade, reaproveitar, copias]);

  const folha = (destino: "tela" | "papel") => paginas.map((pg, i) => {
    const ultima = i === paginas.length - 1;
    // data-testid só na cópia da TELA: a do papel é a mesma árvore repetida.
    const tid = (s: string) => (destino === "tela" ? s : undefined);
    return pg.tipo === "reaproveitar" ? (
      <EtiquetaReaproveitar key={i} tamanho={tamanho} ultima={ultima} testid={tid(`etiqueta-reaproveitar-${i + 1}`)}
        rodape={data ? `${gigante || nome} · Tubo ${data.tubo.numero}` : undefined} />
    ) : (
      <EtiquetaEmLista key={i} tamanho={tamanho} ultima={ultima} testid={tid(`etiqueta-tubo-${i + 1}`)}
        testidDaLinha={destino === "tela" ? `linha-tubo-${i + 1}` : undefined}
        logo={logo} prefixo={prefixo} gigante={gigante} saida={saida}
        tubo={data?.tubo.numero ?? null}
        contador={pg.total > 1 ? `Tubo ${data?.tubo.numero} · ${pg.n} de ${pg.total}` : null}
        linhas={pg.linhas} mostrarQuantidade={mostrarQuantidade} vazio="Este tubo está vazio." />
    );
  });

  const rotulo: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: "#44403c", cursor: "pointer" };
  const campo: React.CSSProperties = { height: 38, borderRadius: 8, border: "1px solid #d6d3d1", padding: "0 10px", fontSize: 13, fontWeight: 700, color: "#1c1917", background: "#fff", fontFamily: "inherit" };

  return (
    <div style={{ background: "#fafaf9", minHeight: "100%" }}>
      <style>{`
        ${CSS_DA_ETIQUETA_EM_LISTA}
        .etq-impressao { display: none; }
        @media screen and (pointer: coarse) {
          .etq-alvo { min-height: 44px; }
          .etq-acao input[type="text"], .etq-acao select { min-height: 44px; font-size: 16px !important; }
        }
        @media print {
          .etq-acao { display: none !important; }
          /* Só o portal sai: a casca inteira (e a prévia da tela) some. */
          body > *:not(.etq-impressao) { display: none !important; }
          .etq-impressao { display: block !important; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; }
          ${regraDaPagina(tamanho)}
        }
      `}</style>

      <div className="etq-acao" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 16px", borderBottom: "1px solid #e7e5e4", backgroundColor: "#fafaf9" }}>
        <Link href="/grafica" className="etq-alvo" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700, color: "#57534e", textDecoration: "none" }}>
          <ArrowLeft aria-hidden="true" style={{ width: 14, height: 14 }} /> Fila da Gráfica
        </Link>
        {data && (
          <>
            <label className="etq-alvo" style={rotulo} title='Ligado: "2x1 Ministério - 16". Desligado: só "2x1 Ministério".'>
              <input type="checkbox" checked={mostrarQuantidade} onChange={(e) => setPrefs((p) => ({ ...p, mostrarQuantidade: e.target.checked }))} data-testid="check-mostrar-quantidade" style={{ width: 16, height: 16, accentColor: "#c2410c" }} />
              Mostrar quantidade
            </label>
            <label className="etq-alvo" style={{ ...rotulo, cursor: "default" }}>
              Tamanho
              <select value={tamanho} onChange={(e) => setPrefs((p) => ({ ...p, tamanho: e.target.value as TamanhoEtiqueta }))} data-testid="select-tamanho-etiqueta" style={campo}>
                {ORDEM_DOS_TAMANHOS.map((t) => <option key={t} value={t}>{TAMANHOS[t].rotulo}</option>)}
              </select>
            </label>
            <label className="etq-alvo" style={{ ...rotulo, cursor: "default" }} title="Quantas vezes o jogo de etiquetas sai — colam dos dois lados do tubo.">
              Cópias
              <select value={copias} onChange={(e) => setPrefs((p) => ({ ...p, copias: limitarCopias(e.target.value) }))} data-testid="select-copias-etiqueta" style={campo}>
                {Array.from({ length: COPIAS_MAX }, (_, k) => k + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="etq-alvo" style={rotulo} title="Sai uma etiqueta extra, do mesmo tamanho, com REAPROVEITAR em pé — para tubo com material de reuso.">
              <input type="checkbox" checked={reaproveitar} onChange={(e) => setReaproveitarManual(e.target.checked)} data-testid="check-reaproveitar" style={{ width: 16, height: 16, accentColor: "#c2410c" }} />
              Imprimir etiqueta REAPROVEITAR
            </label>
            <label className="etq-alvo" style={{ ...rotulo, cursor: "default" }}>
              Destaque
              <input type="text" value={destaque ?? palavraFinal} onChange={(e) => setDestaque(e.target.value)} data-testid="input-destaque-tubo"
                aria-label="Palavra em destaque na etiqueta (a cidade)" style={{ ...campo, width: 150 }} />
            </label>
          </>
        )}
        <span style={{ flex: 1 }} />
        {data && (
          <span data-testid="contagem-etiquetas-tubo" style={{ fontSize: 12.5, fontWeight: 700, color: "#57534e" }}>
            {paginas.length} {paginas.length === 1 ? "etiqueta" : "etiquetas"}
          </span>
        )}
        <button type="button" onClick={() => window.print()} disabled={!data} data-testid="imprimir-etiqueta-tubo" className="etq-alvo"
          style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px", borderRadius: 8, border: "none", background: data ? "#1c1917" : "#e7e5e4", color: data ? "#fff" : "#57534e", fontWeight: 800, fontSize: 13, cursor: data ? "pointer" : "not-allowed" }}>
          <Printer aria-hidden="true" style={{ width: 15, height: 15 }} /> Imprimir etiqueta
        </button>
      </div>

      {isLoading && <p role="status" style={{ textAlign: "center", color: "#57534e", fontSize: 13, padding: 24 }}>Carregando o tubo…</p>}
      {isError && <p style={{ textAlign: "center", color: "#b91c1c", fontSize: 13, padding: 24 }}>Não foi possível carregar o tubo.</p>}

      {/* A PRÉVIA: a etiqueta no tamanho real (mm). A4 é mais larga que o
          celular — rola AQUI dentro, a página nunca ganha rolagem lateral. */}
      {data && (
        <div className="folha-do-tubo" data-testid="folha-do-tubo" style={{ padding: "18px 12px 48px", overflowX: "auto" }}>
          {folha("tela")}
        </div>
      )}
      {data && typeof document !== "undefined" && createPortal(<div className="etq-impressao" aria-hidden="true">{folha("papel")}</div>, document.body)}
    </div>
  );
}
