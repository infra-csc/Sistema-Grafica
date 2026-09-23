// ─── O cabeçalho do Painel Geral: "por onde começar" e o menu Exportar ──────
import { useEffect, useRef, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { Link } from "wouter";
import { ArrowUpRight, ChevronDown, FileSpreadsheet, Loader2, Printer } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { visaoEstaAtiva, type Visao, type VisaoFiltros } from "@/lib/painel-visoes";
import { proximaTelaDoStatus } from "@/lib/painel-rotas";
import type { GroupKey, PainelStats } from "@/lib/painel-kpis";
import { FS, FW, R, H, SHADOW, T } from "@/lib/theme";
import { fmtN } from "./regras";

// ── POR ONDE COMEÇAR ────────────────────────────────────────────────────────
// O Painel é a primeira tela de TODOS os perfis e não dizia a nenhum
// deles o que fazer. A pessoa da Arte abria 3 mil peças e tinha de
// descobrir sozinha que a fila dela é "Aguardando envio" +
// "Aguardando finalização", que existe uma visão pronta para isso na
// barra de filtros e que o trabalho em si acontece em OUTRA tela. A
// frase junta as três respostas: quantas peças são dela, um clique
// para vê-las aqui e um clique para a tela onde se age.
//
// Nada é inventado: a fila é a visão do papel (lib/painel-visoes), o
// número é a soma dos MESMOS cards de status abaixo e as telas saem
// do mesmo mapa do "Continuar em …" da ficha (lib/painel-rotas) — que
// já respeita o acesso do papel.
const linkStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4, minHeight: 36,
  fontSize: FS.body, fontWeight: FW.forte, color: T.accentText,
  textDecoration: "underline", textUnderlineOffset: 2, whiteSpace: "nowrap",
};
const fraseStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", flexWrap: "wrap", columnGap: 10,
  fontSize: FS.body, color: T.apoio, lineHeight: 1.4,
};

export function PorOndeComecar({ visoes, stats, recorteAlheio, filtrosAtuais, role, aplicarVisao }: {
  visoes: Visao[];
  stats: PainelStats;
  /** Há busca ou filtro além da visão da fila? A frase então fala "neste recorte". */
  recorteAlheio: boolean;
  filtrosAtuais: VisaoFiltros;
  role: string | null | undefined;
  aplicarVisao: (v: Visao) => void;
}) {
  const minha = visoes.find(v => v.id === "meu_papel") ?? null;
  if (!minha) {
    // Admin não tem fila própria: vê o fluxo inteiro. O próximo
    // passo dele é cobrar, e a tela de cobrança é outra.
    return (
      <span data-testid="texto-por-onde-comecar" style={{ ...fraseStyle, columnGap: 8 }}>
        <span>Você vê o fluxo inteiro. Atraso por etapa e quem precisa agir ficam em</span>
        <Link href="/prazos" style={linkStyle}>Gestão de Prazos <ArrowUpRight aria-hidden="true" style={{ width: 13, height: 13 }} /></Link>
      </span>
    );
  }
  // Soma dos cards de status: `stats` ignora o próprio filtro de
  // status (é o que deixa o card clicável mostrar o número), então o
  // número não muda quando a pessoa aplica a visão da fila.
  const n = minha.filtros.status.reduce((t, s) => t + (stats.byGroup[s as GroupKey] ?? 0), 0);
  const ativa = visaoEstaAtiva(minha, filtrosAtuais);
  const telas = minha.filtros.status
    .map(s => proximaTelaDoStatus(s, role))
    .filter((t, i, arr): t is NonNullable<typeof t> => !!t && arr.findIndex(x => x?.path === t.path) === i);
  // "Peças aguardando envio…" → "aguardando envio…": a frase já começa
  // pelo número de peças.
  const oQue = minha.hint.replace(/^Peças\s+/i, "");
  return (
    <span data-testid="texto-por-onde-comecar" style={fraseStyle}>
      <span>
        Sua fila: <strong style={{ color: T.text, fontWeight: FW.forte }}>{fmtN(n)} {n === 1 ? "peça" : "peças"}</strong> {oQue}
        {recorteAlheio ? " neste recorte" : ""}.
      </span>
      <button
        type="button"
        onClick={() => aplicarVisao(minha)}
        aria-pressed={ativa}
        data-testid="button-ver-minha-fila"
        style={{ ...linkStyle, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}
      >
        {ativa ? "Ver todas as peças" : "Ver só a minha fila"}
      </button>
      {telas.map(t => (
        <Link key={t.path} href={t.path} style={linkStyle}>
          Trabalhar em {t.label} <ArrowUpRight aria-hidden="true" style={{ width: 13, height: 13 }} />
        </Link>
      ))}
    </span>
  );
}

/**
 * Exportar rebaixado a contorno: o botão preto com sombra laranja era o
 * elemento de maior peso visual da página — a ação mais destacada da tela era
 * imprimir.
 */
export function MenuExportar({
  useCards, exportMenuOpen, setExportMenuOpen, isExportingXlsx, nSelecionadas, nParaExportar, onPdf, onXlsx,
}: {
  useCards: boolean;
  exportMenuOpen: boolean;
  setExportMenuOpen: Dispatch<SetStateAction<boolean>>;
  isExportingXlsx: boolean;
  nSelecionadas: number;
  nParaExportar: number;
  onPdf: () => void;
  onXlsx: () => void;
}) {
  // Fecha o menu de exportar ao clicar fora / apertar Escape.
  const exportMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setExportMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExportMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [exportMenuOpen]);

  return (
    <div ref={exportMenuRef} style={{ position: "relative" }}>
      <Botao
        variante="secundario"
        tamanho={useCards ? "toque" : "md"}
        onClick={() => setExportMenuOpen(o => !o)}
        data-testid="button-export-painel"
        aria-haspopup="menu"
        aria-expanded={exportMenuOpen}
        aria-label={useCards ? "Exportar" : undefined}
        title="Exportar o recorte que está na tela"
        icone={isExportingXlsx ? undefined : Printer}
        style={useCards ? { minWidth: H.toque, padding: "0 12px" } : undefined}
      >
        {isExportingXlsx && <Loader2 aria-hidden="true" className="animate-spin" style={{ width: 14, height: 14 }} />}
        {!useCards && "Exportar"}
        <ChevronDown aria-hidden="true" style={{ width: 13, height: 13, color: T.second }} />
      </Botao>
      {exportMenuOpen && (
        <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 20, minWidth: 232, backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, boxShadow: SHADOW.md, padding: 6 }}>
          <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: T.second, margin: "6px 8px 6px" }}>
            {nSelecionadas > 0 ? `${nSelecionadas} selecionada${nSelecionadas > 1 ? "s" : ""}` : `${nParaExportar} ${nParaExportar === 1 ? "peça na tela" : "peças na tela"}`}
          </p>
          <button role="menuitem" onClick={onPdf} data-testid="button-export-pdf-painel" style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 8px", background: "none", border: "none", borderRadius: R.sm, cursor: "pointer", fontSize: FS.body, fontWeight: FW.medio, color: T.text, textAlign: "left" }}>
            <Printer style={{ width: 14, height: 14, color: T.second }} /> Exportar PDF
          </button>
          <button role="menuitem" onClick={onXlsx} disabled={isExportingXlsx || nParaExportar === 0} data-testid="button-export-xlsx-painel" style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 8px", background: "none", border: "none", borderRadius: R.sm, cursor: nParaExportar === 0 ? "not-allowed" : "pointer", fontSize: FS.body, fontWeight: FW.medio, color: nParaExportar === 0 ? T.second : T.text, textAlign: "left" }}>
            <FileSpreadsheet style={{ width: 14, height: 14, color: T.second }} /> Exportar Excel
          </button>
        </div>
      )}
    </div>
  );
}
