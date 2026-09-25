// ── AÇÕES EM LOTE ────────────────────────────────────────────────────────────
// Entram quando existe seleção e somem quando ela zera, no mesmo desenho que a
// Arte usa (pílula escura com o × redondo). Moram na barra fixa: seguem
// alcançáveis com a lista rolada.
//
// Os contadores são os das peças que DE FATO vão (`selecaoLote.vivas`, e só as
// prontas para liberar) — "Liberar 12" mandando 9 é o defeito que isto evita,
// espelho do 409 de lote inteiro do servidor.
//
// NO CELULAR (25/09) a barra sai da faixa de filtros — que lá rola junto com
// a página — e vira uma barra FIXA no rodapé, com o recorte seguro embaixo (o
// desenho da barra de lote da Gráfica): marcar peças lá embaixo da lista e ter
// de rolar até o topo para achar o "Liberar" era o caminho de todo lote.
import { Check, Recycle, RotateCcw, X } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { alvo } from "@/hooks/use-mobile";
import { T, TOM, FS, R } from "@/lib/theme";
import { DESLIGADO_LEGIVEL } from "./estilos";
import type { useFilaDaRevisao } from "./use-fila-da-revisao";

type Fila = ReturnType<typeof useFilaDaRevisao>;

export function BarraDoLote({
  isMobile, dedo, alturaControle, selecaoLote, loteDeLiberar, avisoLoteFinalizadas,
  liberando, devolvendo, reaproveitando, aoLimparSelecao, aoLiberar, aoDevolver, aoReaproveitar,
}: {
  isMobile: boolean;
  dedo: boolean;
  alturaControle: number;
  selecaoLote: Fila["selecaoLote"];
  loteDeLiberar: Fila["loteDeLiberar"];
  avisoLoteFinalizadas: Fila["avisoLoteFinalizadas"];
  liberando: boolean;
  devolvendo: boolean;
  reaproveitando: boolean;
  aoLimparSelecao: () => void;
  aoLiberar: () => void;
  aoDevolver: () => void;
  aoReaproveitar: () => void;
}) {
  // No celular os botões dividem a linha por igual e quebram o rótulo.
  const noCelular = isMobile ? { flex: "1 1 0%", minWidth: 0, minHeight: 48, whiteSpace: "normal" as const, lineHeight: 1.15, textAlign: "center" as const, padding: "0 8px" } : {};
  return (
    <div
      role="toolbar"
      aria-label="Ações em lote"
      data-testid="barra-do-lote"
      style={isMobile ? {
        // LONGOS: o atalho com env() some no parser do jsdom.
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50,
        display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
        paddingTop: 10, paddingLeft: 12, paddingRight: 12, paddingBottom: "calc(10px + env(safe-area-inset-bottom))",
        backgroundColor: T.surface, borderTop: `1px solid ${T.border}`, boxShadow: "0 -4px 24px rgba(28,25,23,0.16)",
      } : { maxWidth: 1200, margin: "10px auto 0", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}
    >
      <span
        data-testid="chip-selecao"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, height: alturaControle, padding: "0 6px 0 12px", borderRadius: R.pill, background: T.text, color: T.surface, fontSize: FS.meta, fontWeight: 700, whiteSpace: "nowrap" }}
      >
        {selecaoLote.ids.length} {selecaoLote.ids.length === 1 ? "selecionada" : "selecionadas"}
        <button
          onClick={aoLimparSelecao}
          aria-label="Limpar seleção"
          data-testid="button-clear-selection"
          style={{ width: alvo(28, dedo || isMobile), height: alvo(28, dedo || isMobile), borderRadius: "50%", background: "rgba(255,255,255,0.16)", border: "none", cursor: "pointer", color: T.surface, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
        >
          <X style={{ width: 12, height: 12 }} />
        </button>
      </span>

      {/* O que fica de fora, dito ANTES de abrir a confirmação: quem marcou
          40 linhas precisa ver o desconto na hora. */}
      {selecaoLote.finalizadas > 0 && (
        <span
          role="status"
          data-testid="aviso-lote-evento-finalizado"
          title={avisoLoteFinalizadas() ?? undefined}
          style={{ fontSize: FS.meta, color: T.apoio }}
        >
          {selecaoLote.finalizadas} em evento finalizado, fora do lote
        </span>
      )}

      <div style={isMobile ? { display: "flex", gap: 8, flex: "1 1 100%", flexWrap: "wrap" } : { marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
        {/* O CONTADOR DO BOTÃO é o das peças que de fato vão: só as PRONTAS
            (`loteDeLiberar`) — sem arquivo final ou travada fica de fora, com
            o motivo na linha. "Liberar as 9 prontas" diz o desconto antes do
            clique. O porquê do botão apagado já está escrito ao lado. */}
        {selecaoLote.vivas.length > 0 && loteDeLiberar.prontas.length === 0 && (
          <span role="status" data-testid="aviso-lote-nenhuma-pronta" style={{ alignSelf: "center", fontSize: FS.meta, color: TOM.alerta.text, ...(isMobile ? { flex: "1 1 100%" } : {}) }}>
            Nenhuma pronta para liberar: {loteDeLiberar.nFora === 1 ? "a selecionada está" : "as selecionadas estão"} sem arquivo final ou travada{loteDeLiberar.nFora === 1 ? "" : "s"}.
          </span>
        )}
        <Botao
          variante="primario"
          tamanho={dedo || isMobile ? "toque" : "md"}
          icone={Check}
          onClick={() => loteDeLiberar.prontas.length > 0 && aoLiberar()}
          disabled={loteDeLiberar.prontas.length === 0 || liberando}
          style={{ ...noCelular, ...(loteDeLiberar.prontas.length === 0 ? DESLIGADO_LEGIVEL : {}) }}
          title={selecaoLote.vivas.length === 0
            ? "Toda a seleção é de evento finalizado — liberar para produção está bloqueado nessas peças."
            : undefined}
          data-testid="button-bulk-release-hero"
        >
          {liberando
            ? "Liberando..."
            : loteDeLiberar.nFora > 0
            ? `Liberar ${loteDeLiberar.prontas.length === 1 ? "a pronta" : `as ${loteDeLiberar.prontas.length} prontas`}`
            : `Liberar ${loteDeLiberar.prontas.length}`}
        </Botao>
        <Botao
          variante="secundario"
          tamanho={dedo || isMobile ? "toque" : "md"}
          icone={RotateCcw}
          onClick={() => selecaoLote.vivas.length > 0 && aoDevolver()}
          disabled={selecaoLote.vivas.length === 0 || devolvendo}
          style={{ ...noCelular, ...(selecaoLote.vivas.length === 0 ? DESLIGADO_LEGIVEL : {}) }}
          title={selecaoLote.vivas.length === 0
            ? "Toda a seleção é de evento finalizado — devolver para a Arte está bloqueado nessas peças."
            : undefined}
          data-testid="button-bulk-return-hero"
        >
          {devolvendo
            ? "Devolvendo…"
            : `Devolver ${selecaoLote.vivas.length}`}
        </Botao>
        {/* REAPROVEITAR em lote — só com 2+ selecionadas: com uma, o ícone da
            linha faz o mesmo e ainda oferece o parcial. Verde é a identidade
            do reaproveitamento na tela. #15803d/#f0fdf4 = 5,0:1 */}
        {selecaoLote.ids.length >= 2 && (
          <Botao
            variante="secundario"
            tamanho={dedo || isMobile ? "toque" : "md"}
            icone={Recycle}
            onClick={() => selecaoLote.vivas.length > 0 && aoReaproveitar()}
            disabled={selecaoLote.vivas.length === 0 || reaproveitando}
            title={selecaoLote.vivas.length === 0
              ? "Toda a seleção é de evento finalizado — reaproveitar está bloqueado nessas peças."
              : "Marcar como reaproveitamento total e enviar à Gráfica como produzidas"}
            data-testid="button-bulk-reuse-hero"
            // O verde é a identidade do reaproveitamento na tela.
            style={{ ...noCelular, ...(selecaoLote.vivas.length === 0 ? DESLIGADO_LEGIVEL : { border: `1px solid ${TOM.sucesso.border}`, backgroundColor: TOM.sucesso.bg, color: TOM.sucesso.text }) }}
          >
            {reaproveitando
              ? "Reaproveitando…"
              : `Reaproveitar ${selecaoLote.vivas.length}`}
          </Botao>
        )}
      </div>
    </div>
  );
}
