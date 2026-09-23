// ─────────────────────────────────────────────────────────────────────────────
// MÁQUINAS DA GRÁFICA — a linha da fila geral (liberadas sem impressora).
// ─────────────────────────────────────────────────────────────────────────────
import { memo, useContext } from "react";
import { alvo as alvoDe } from "@/hooks/use-mobile";
import { T, FS, FW } from "@/lib/theme";
import { nomeDaPeca } from "@shared/nome-da-peca";
import { IMP } from "./constantes";
import { ToqueContext } from "./contexto";
import { ControleDeReserva } from "./controle-de-reserva";
import { SeloDePrazo, TituloDaPeca } from "./pedacos";
import { apoioDaPeca, prazoDaPeca, seloDaPecaNaMaquina, textoDoDirecionamento } from "./regras";
import type { OcupacaoDasImpressoras, OcupanteDaImpressora, PecaNaFila } from "./tipos";

/** Quantas peças da fila geral entram por vez ("Mostrar mais"). */
export const LOTE_DA_FILA = 20;

// ─── Linha da fila geral (memoizada: a fila passa de 300 peças) ───────────────
// Celular (390px): os DADOS em cima (caixa de seleção + código/peça/evento/m²,
// o direcionamento "20 → Impressora 1 · 14 sem impressora" quebrando linha e o
// prazo logo abaixo, sem linha própria); os CONTROLES embaixo — impressora na
// linha inteira, depois quantidade + "Reservar" lado a lado. Desktop: tudo
// numa linha, como antes.
export const LinhaDaFilaGeral = memo(function LinhaDaFilaGeral({ p, marcada, podeAgir, ocupado, hojeMs, isMobile, ocupacao, imprimindo, onAlternar, onReservar, onImprimir, onTrocar }: {
  p: PecaNaFila; marcada: boolean; podeAgir: boolean; ocupado: boolean; hojeMs: number; isMobile: boolean;
  ocupacao: OcupacaoDasImpressoras; imprimindo: boolean;
  onAlternar: (id: string) => void; onReservar: (id: string, maquina: string, quantidade: number) => void;
  onImprimir: (p: PecaNaFila, maquina: string, quantidade: number) => void;
  onTrocar: (p: PecaNaFila, maquina: string, quantidade: number | null, sai: OcupanteDaImpressora) => void;
}) {
  const toque = useContext(ToqueContext) || isMobile;
  const alvo = alvoDe(34, toque);
  const fonte = isMobile ? 12 : FS.small;
  const selo = seloDaPecaNaMaquina(p, hojeMs);
  const prazo = prazoDaPeca(p.saidaCaminhao, p.prazoProducaoGrafica);
  const direcionamento = textoDoDirecionamento(p.reserva, p.semImpressora, p.imprimindoEm);
  return (
    <div data-testid={`fila-peca-${p.id}`} className="mq-peca" style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 8 : 10, padding: isMobile ? "10px 12px" : "6px 14px", borderTop: `1px solid ${T.low}`, flexWrap: "wrap" }}>
      {podeAgir && (
        <label style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: alvo, minWidth: alvoDe(28, toque), flexShrink: 0, cursor: selo ? "not-allowed" : "pointer" }}>
          <input type="checkbox" checked={marcada} disabled={!!selo} onChange={() => onAlternar(p.id)} aria-label={`Selecionar ${p.displayId ?? "peça"}`} data-testid={`selecionar-fila-${p.id}`} style={{ width: isMobile ? 22 : 18, height: isMobile ? 22 : 18, accentColor: T.text }} />
        </label>
      )}
      <div data-testid={`fila-dados-${p.id}`} style={{ flex: isMobile ? "1 1 0%" : "1 1 220px", minWidth: 0, color: T.text, display: "flex", flexDirection: "column", gap: 2, minHeight: isMobile ? 44 : undefined, justifyContent: "center" }}>
        <TituloDaPeca id={p.id} codigo={p.displayId} tipo={p.tipo} descricao={p.descricao} isMobile={isMobile} testId={`nome-fila-geral-${p.id}`} />
        <span style={{ fontSize: fonte, color: T.second, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>
          {[p.evento, `${p.aImprimir} un.`, p.m2 != null ? `${p.m2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²` : null].filter(Boolean).join(" · ")}
        </span>
        {apoioDaPeca(p) && (
          <span data-testid={`apoio-${p.id}`} style={{ fontSize: fonte, color: T.second, overflowWrap: "anywhere", lineHeight: 1.35 }}>{apoioDaPeca(p)}</span>
        )}
        {direcionamento && (
          <span data-testid={`direcionado-${p.id}`} style={{ fontSize: fonte, color: IMP.text, fontWeight: FW.forte, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere", lineHeight: 1.35 }}>
            {direcionamento}
          </span>
        )}
        {isMobile && <span style={{ display: "flex", marginTop: 2 }}><SeloDePrazo p={prazo} fonte={fonte} /></span>}
      </div>
      {!isMobile && <SeloDePrazo p={prazo} fonte={fonte} />}
      {selo && (isMobile || selo.motivo === "travada") && (
        <span data-testid={`fila-bloqueada-${p.id}`} style={{ flex: "1 1 100%", fontSize: FS.meta, fontWeight: FW.forte, color: selo.text }}>{selo.label} — {selo.hint}</span>
      )}
      {podeAgir && (
        <ControleDeReserva id={p.id} codigoDaPeca={[p.displayId, `(${nomeDaPeca(p.tipo, p.descricao)})`].filter(Boolean).join(" ")} semImpressora={p.semImpressora ?? p.aImprimir} disabled={!!selo || ocupado} alvo={alvo} isMobile={isMobile} ocupacao={ocupacao} imprimindo={imprimindo} onReservar={(m, n) => onReservar(p.id, m, n)} onImprimir={(m, n) => onImprimir(p, m, n)} onTrocar={(m, n, sai) => onTrocar(p, m, n, sai)} />
      )}
    </div>
  );
});
