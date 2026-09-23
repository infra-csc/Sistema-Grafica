// ─────────────────────────────────────────────────────────────────────────────
// MÁQUINAS DA GRÁFICA — pedaços de interface usados em mais de um bloco da tela
// (o nome da peça, selos, esqueleto, seletor de impressora, fecho de lista).
// ─────────────────────────────────────────────────────────────────────────────
import { useContext, useEffect, useState } from "react";
import { Eye, RotateCcw } from "lucide-react";
import { alvo as alvoDe } from "@/hooks/use-mobile";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { fmtRelative } from "@/components/prazos/tokens";
import { T, TOM, FS, FW, R } from "@/lib/theme";
import { MAQUINAS_DE_IMPRESSAO, rotuloDaMaquina } from "@shared/fluxo-peca";
import { partesDoNomeDaPeca, nomeDaPeca } from "@shared/nome-da-peca";
import { AMBAR, LIVRE, MONO, VERMELHO } from "./constantes";
import { FichaContext, ToqueContext } from "./contexto";
import { textoDoPrazo } from "./regras";

// ─── O nome da peça (abre a ficha) ────────────────────────────────────────────
/**
 * Código + DESCRIÇÃO em destaque (é ela que identifica) + tipo como apoio, em
 * até 2 linhas. Botão de verdade: Enter/Espaço abrem; 44px no celular.
 */
export function TituloDaPeca({ id, codigo, tipo, descricao, isMobile, testId, fonte = FS.body, emLinha = false }: {
  id: string; codigo: string | null; tipo: string; descricao?: string | null; isMobile: boolean; testId?: string; fonte?: number; /** Diário: sem altura mínima nem bloco. */ emLinha?: boolean;
}) {
  const abrirFicha = useContext(FichaContext);
  const toque = useContext(ToqueContext) || isMobile;
  const nome = partesDoNomeDaPeca(tipo, descricao);
  return (
    <button
      type="button"
      className="mq-link"
      onClick={(e) => { e.stopPropagation(); abrirFicha(id); }}
      aria-label={`Ver detalhes de ${codigo ?? "peça"}`}
      title={`${codigo ?? ""} ${nomeDaPeca(tipo, descricao)} — ver detalhes`.trim()}
      data-testid={testId}
      style={{ border: "none", background: "transparent", padding: 0, margin: 0, font: "inherit", textAlign: "left", cursor: "pointer", color: T.text, fontSize: fonte, fontWeight: FW.forte, lineHeight: 1.3, minWidth: 0, maxWidth: "100%", minHeight: toque && !emLinha ? 44 : undefined, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}
    >
      <span style={{ fontFamily: MONO, color: T.accentText, marginRight: 6 }}>{codigo ?? "—"}</span>
      {nome.destaque}
      {nome.tipo && <span style={{ fontWeight: FW.corpo, color: T.second, marginLeft: 6 }}>{nome.tipo}</span>}
    </button>
  );
}

/** No seletor a linha inteira ESCOLHE a peça; a ficha abre por este botão ao lado. */
export function BotaoDaFicha({ id, codigo, isMobile, comBorda, fundo }: { id: string; codigo: string | null; isMobile: boolean; comBorda: boolean; fundo: string }) {
  const abrirFicha = useContext(FichaContext);
  const toque = useContext(ToqueContext) || isMobile;
  return (
    <button type="button" className="mq-acao" onClick={() => abrirFicha(id)} aria-label={`Ver detalhes de ${codigo ?? "peça"}`} title="Ver detalhes da peça" data-testid={`ficha-${id}`} style={{ flex: "0 0 auto", minWidth: 44, minHeight: alvoDe(40, toque), border: "none", borderTop: comBorda ? `1px solid ${T.low}` : "none", borderLeft: `1px solid ${T.low}`, background: fundo, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: T.second }}>
      <Eye aria-hidden="true" style={{ width: 15, height: 15 }} />
    </button>
  );
}

/** "Atualizado há X" — relógio próprio, para o resto da tela não redesenhar a cada tique. */
export function Atualizado({ em, buscando, fonte }: { em: number; buscando: boolean; fonte: number }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <span data-testid="atualizado-ha" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: fonte, color: T.second, whiteSpace: "nowrap" }}>
      {buscando
        ? <RotateCcw aria-hidden="true" className="animate-spin" style={{ width: 11, height: 11 }} />
        : <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: R.pill, background: LIVRE.dot, flexShrink: 0 }} />}
      {buscando ? "Atualizando…" : em ? `Atualizado ${fmtRelative(new Date(em).toISOString(), agora)}` : "Ao vivo"}
    </span>
  );
}

/** O <Selo> do design system com a cor de lib/status; a fonte segue o piso de 12px do celular. */
export function Pilula({ pal, children, testId, fonte = FS.small }: { pal: { bg: string; border: string; text: string; dot?: string }; children: React.ReactNode; testId?: string; fonte?: number }) {
  return (
    <Selo data-testid={testId} cores={pal} ponto={!!pal.dot} style={{ fontSize: fonte, padding: "3px 9px" }}>
      {children}
    </Selo>
  );
}

/** Silhueta da tela enquanto carrega: reserva o espaço, nada empurra ao chegar. */
export function Esqueleto({ lento }: { lento: boolean }) {
  const bloco = (w: string | number, h: number, extra?: React.CSSProperties) => (
    <div className="animate-pulse" aria-hidden="true" style={{ width: w, height: h, borderRadius: 4, background: T.border, ...extra }} />
  );
  return (
    <div role="status" aria-busy="true" data-testid="maquinas-carregando" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <span className="sr-only">Carregando as máquinas…</span>
      {lento && (
        <p data-testid="maquinas-lento" style={{ margin: 0, fontSize: FS.body, color: AMBAR.text }}>
          Está demorando mais que o normal. A conexão do galpão pode estar lenta — a tela carrega assim que responder.
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>{bloco(120, 14)}{bloco(56, 18, { borderRadius: R.pill })}</div>
            {bloco("80%", 12)}{bloco("100%", 6, { borderRadius: R.pill })}{bloco("55%", 10)}
          </div>
        ))}
      </div>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: "flex", gap: 16, alignItems: "center", height: 46, padding: "0 14px", borderTop: i ? `1px solid ${T.low}` : "none" }}>
            {bloco(40, 10)}{bloco(`${34 - (i % 3) * 6}%`, 10)}{bloco(90, 10, { marginLeft: "auto" })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** O selo de prazo da fila — sobre fundo claro (na Gráfica é sobre o escuro). */
export function SeloDePrazo({ p, fonte }: { p: { data: string; diff: number } | null; fonte: number }) {
  if (!p) return <span style={{ fontSize: fonte, color: T.second }}>Sem prazo</span>;
  const pal = p.diff < 0 ? VERMELHO : p.diff === 0 ? TOM.laranja : p.diff <= 3 ? AMBAR : { text: T.second, bg: T.low, border: T.border };
  return (
    <Selo cores={pal} title={`Marco de Produção Gráfica em ${p.data}`} style={{ fontSize: fonte, padding: "2px 8px", fontVariantNumeric: "tabular-nums" }}>
      {textoDoPrazo(p)}
    </Selo>
  );
}

/**
 * "Reservar para →" / "Mover para": um select nativo com as 4 impressoras e a
 * fila geral — no galpão, muitas vezes no celular, o menu nativo é o mais
 * confiável e já vem acessível. `excluir` tira a opção atual.
 */
export function SeletorDeReserva({ valor, excluir, disabled, alvo, isMobile, testId, rotulo, onEscolher }: {
  valor: string | null; excluir: string | null; disabled?: boolean; alvo: number; isMobile: boolean; testId: string; rotulo: string; onEscolher: (maquina: string | null) => void;
}) {
  return (
    <select
      aria-label={rotulo}
      data-testid={testId}
      value=""
      disabled={disabled}
      onChange={(e) => { const v = e.target.value; if (v !== "") onEscolher(v === "geral" ? null : v); }}
      // Celular: 16px (sem zoom do iOS) e a linha inteira — o menu nativo
      // abre de um alvo de 44px que o dedo acha sem mirar.
      style={{ minHeight: alvo, height: alvo, padding: "0 8px", borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, color: T.text, fontSize: isMobile ? 16 : 12, fontWeight: FW.forte, cursor: disabled ? "not-allowed" : "pointer", maxWidth: "100%", ...(isMobile ? { flex: "1 1 100%", width: "100%" } : {}) }}
    >
      <option value="">{rotulo}</option>
      {MAQUINAS_DE_IMPRESSAO.filter((m) => m !== excluir).map((m) => (
        <option key={m} value={m}>{rotuloDaMaquina(m)}</option>
      ))}
      {valor && <option value="geral">Devolver à fila geral</option>}
    </select>
  );
}

/**
 * O fecho de uma lista: diz que ela ACABOU ("6 de 6 peças") ou quanto falta
 * ("Mostrando 20 de 143" + o botão). Sem ele a lista terminava colada na
 * borda e parecia cortada.
 */
export function FechoDaLista({ visiveis, total, um, varios, lote, onMais, testId, botaoTestId, isMobile, estiloDoBotao }: {
  visiveis: number; total: number; um: string; varios: string; lote: number; onMais: () => void; testId: string; botaoTestId: string; isMobile: boolean; estiloDoBotao: React.CSSProperties;
}) {
  const tudo = visiveis >= total;
  return (
    <div data-testid={testId} data-fim={tudo || undefined} style={{ padding: tudo ? "8px 14px" : 12, borderTop: `1px solid ${T.low}`, background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
      <span style={{ fontSize: isMobile ? 12 : FS.small, color: T.second, fontVariantNumeric: "tabular-nums" }}>
        {tudo ? `${total} de ${total} ${total === 1 ? um : varios}` : `Mostrando ${visiveis} de ${total} ${varios}`}
      </span>
      {!tudo && (
        <Botao variante="secundario" onClick={onMais} data-testid={botaoTestId} style={{ ...estiloDoBotao, ...(isMobile ? { flex: "1 1 100%", fontSize: 13 } : {}) }}>
          Mostrar mais {Math.min(lote, total - visiveis)}
        </Botao>
      )}
    </div>
  );
}
