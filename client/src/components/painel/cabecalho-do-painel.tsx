// ─── O cabeçalho do Painel Geral: "por onde começar" e o menu Exportar ──────
import { useEffect, useRef, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { Link } from "wouter";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, ChevronDown, FileSpreadsheet, ListFilter, ListX, Loader2, Printer } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { visaoEstaAtiva, type Visao, type VisaoFiltros } from "@/lib/painel-visoes";
import { proximaTelaDoStatus } from "@/lib/painel-rotas";
import type { GroupKey, PainelStats } from "@/lib/painel-kpis";
import { FS, FW, R, H, SHADOW, T, TOM } from "@/lib/theme";
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
// O link do topo: laranja de LEITURA (#c2410c, 4,9:1) em peso médio, com o
// sublinhado num tom claro da mesma família — ele diz "link" sem gritar. Três
// links em laranja forte sublinhado eram o trecho mais barulhento da tela.
const linkStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4, minHeight: 32,
  fontSize: FS.body, fontWeight: FW.medio, color: T.accentText,
  textDecoration: "underline", textUnderlineOffset: 3, textDecorationColor: TOM.laranja.border,
  whiteSpace: "nowrap",
};
const fraseStyle: CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4,
  fontSize: FS.body, color: T.apoio, lineHeight: 1.45,
};
const linhaDeAtalhos: CSSProperties = {
  display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 16, rowGap: 0,
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
      <span data-testid="texto-por-onde-comecar" style={fraseStyle}>
        <span>Você vê o fluxo inteiro. Atraso por etapa e quem precisa agir ficam na Gestão de Prazos.</span>
        <span style={linhaDeAtalhos}>
          <Link href="/prazos" className="pnl-link" style={linkStyle}>Abrir Gestão de Prazos <ArrowUpRight aria-hidden="true" style={{ width: 13, height: 13 }} /></Link>
        </span>
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
      <span style={linhaDeAtalhos}>
        {/* A fila é um RECORTE desta tela (botão, alterna), e as telas de
            trabalho são OUTRO lugar (link com seta). Duas gramáticas para
            duas ações diferentes — antes as três eram o mesmo link laranja. */}
        <button
          type="button"
          onClick={() => aplicarVisao(minha)}
          aria-pressed={ativa}
          data-testid="button-ver-minha-fila"
          className="pnl-link"
          style={{ ...linkStyle, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", gap: 6 }}
        >
          {ativa ? <ListX aria-hidden="true" style={{ width: 14, height: 14 }} /> : <ListFilter aria-hidden="true" style={{ width: 14, height: 14 }} />}
          {ativa ? "Ver todas as peças" : "Ver só a minha fila"}
        </button>
        {telas.map(t => (
          <Link key={t.path} href={t.path} className="pnl-link" style={linkStyle}>
            Trabalhar em {t.label} <ArrowUpRight aria-hidden="true" style={{ width: 13, height: 13 }} />
          </Link>
        ))}
      </span>
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
    // Teclado de menu de verdade: setas percorrem os itens, Esc fecha e
    // devolve o foco ao botão (sem isso o foco caía no <body> e a pessoa
    // recomeçava o Tab do topo da página).
    const itens = () => Array.from(exportMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExportMenuOpen(false);
        exportMenuRef.current?.querySelector<HTMLButtonElement>('[data-testid="button-export-painel"]')?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const lista = itens();
      if (!lista.length) return;
      e.preventDefault();
      const i = lista.indexOf(document.activeElement as HTMLButtonElement);
      const prox = e.key === "ArrowDown" ? (i + 1) % lista.length : (i <= 0 ? lista.length - 1 : i - 1);
      lista[prox].focus();
    };
    // Abriu: o foco vai para o primeiro item (o leitor de tela anuncia o menu).
    requestAnimationFrame(() => itens()[0]?.focus({ preventScroll: true }));
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
        <div role="menu" aria-label="Exportar" className="pnl-menu" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 20, width: 264, backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, boxShadow: SHADOW.lg, padding: 6 }}>
          {/* O QUE VAI SAIR, antes de escolher o formato: a seleção quando
              existe, senão o recorte da tela — nunca a base inteira. */}
          <p style={{ fontSize: FS.micro, fontWeight: FW.rotulo, textTransform: "uppercase", letterSpacing: "0.08em", color: T.second, margin: "6px 10px 6px" }}>
            {nSelecionadas > 0 ? `${nSelecionadas} selecionada${nSelecionadas > 1 ? "s" : ""}` : `${nParaExportar} ${nParaExportar === 1 ? "peça na tela" : "peças na tela"}`}
          </p>
          <ItemDoMenu data-testid="button-export-pdf-painel" icone={Printer} titulo="Exportar PDF" apoio="Lista para imprimir ou enviar" onClick={onPdf} desligado={false} toque={useCards} />
          <ItemDoMenu data-testid="button-export-xlsx-painel" icone={FileSpreadsheet} titulo="Exportar Excel" apoio={nParaExportar === 0 ? "Nenhuma peça na tela para exportar" : "Planilha .xlsx com as mesmas peças"} onClick={onXlsx} desligado={isExportingXlsx || nParaExportar === 0} toque={useCards} />
        </div>
      )}
    </div>
  );
}

/** Item do menu Exportar: ícone num quadro, o formato e uma linha de apoio. */
function ItemDoMenu({ icone: Icone, titulo, apoio, onClick, desligado, toque, ...resto }: {
  icone: LucideIcon; titulo: string; apoio: string; onClick: () => void; desligado: boolean; toque: boolean;
  "data-testid": string;
}) {
  return (
    <button role="menuitem" onClick={onClick} disabled={desligado} data-testid={resto["data-testid"]} className="pnl-menu-item"
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: toque ? H.toque : 44, padding: "6px 10px", background: "none", border: "none", borderRadius: R.md, cursor: desligado ? "not-allowed" : "pointer", textAlign: "left", fontFamily: "inherit", opacity: desligado ? 0.55 : 1 }}>
      <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: R.sm + 1, border: `1px solid ${T.border}`, backgroundColor: T.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icone style={{ width: 14, height: 14, color: T.apoio }} />
      </span>
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontSize: FS.body, fontWeight: FW.medio, color: T.text }}>{titulo}</span>
        <span style={{ fontSize: FS.small, color: T.second }}>{apoio}</span>
      </span>
    </button>
  );
}
