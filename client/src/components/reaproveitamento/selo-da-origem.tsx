// ─────────────────────────────────────────────────────────────────────────────
// O SELO DA ORIGEM DO REAPROVEITAMENTO e o bloco da ficha (dono, 16/10).
//
//   · EM TRÂNSITO (ciano, caminhão): a peça já está no caminhão de outra
//     etapa — não passa por conferir, embalar nem entregar.
//   · BUSCAR NO ESTOQUE (âmbar suave, só na Gráfica e na Conferência, enquanto
//     as unidades ainda não foram separadas): "os meninos já ficam espertos
//     que têm que procurar essa peça lá no estoque".
//   · ESTOQUE (esmeralda, a cor do reaproveitamento): o resto das telas.
//
// A observação vai no title (tooltip) e, na ficha, por extenso. Não renderiza
// nada na peça sem origem — pode ser posto em qualquer linha sem `if` em volta.
// ─────────────────────────────────────────────────────────────────────────────
import type { CSSProperties } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Boxes, Recycle, Truck, PencilLine } from "lucide-react";
import { Selo } from "@/components/ui/selo";
import { Botao } from "@/components/ui/botao";
import { FS, FW, R, T, TOM } from "@/lib/theme";
import { statusDasEtapas } from "@shared/fluxo-peca";
import { podeTransicionar } from "@shared/maquina-de-estados";
import {
  dicaDaOrigem, origemDe, reaproveitadasDe, type PecaComOrigem,
} from "@shared/origem-do-reaproveitamento";

export type PecaComOrigemNaTela = PecaComOrigem & { id?: string; status?: string | null };

/** Na Gráfica, o estoque pede BUSCA enquanto a peça ainda está na mesa dela, antes da conferência. */
const AINDA_A_SEPARAR: ReadonlySet<string> = new Set(statusDasEtapas("ready_for_production", "approved", "inProduction", "produced"));

export const precisaBuscarNoEstoque = (p: PecaComOrigemNaTela): boolean =>
  origemDe(p) === "estoque" && reaproveitadasDe(p) > 0 && AINDA_A_SEPARAR.has(String(p.status ?? ""));

/** O rótulo do selo. Parcial diz quantas: "Em trânsito · 4 un.". */
export function rotuloDaOrigem(p: PecaComOrigemNaTela, onde: "grafica" | "geral"): string | null {
  const origem = origemDe(p);
  if (!origem) return null;
  const un = reaproveitadasDe(p);
  const parcial = un > 0 && un < (Number(p.quantity) || 0);
  const base = origem === "em_transito" ? "Em trânsito" : onde === "grafica" && precisaBuscarNoEstoque(p) ? "Buscar no estoque" : "Estoque";
  return parcial ? `${base} · ${un} un.` : base;
}

/** Quem pode marcar/trocar a origem nesta etapa — a MESMA tabela do servidor. */
export const podeMarcarOrigem = (papel: string | null | undefined, p: PecaComOrigemNaTela): boolean =>
  reaproveitadasDe(p) > 0 && podeTransicionar(p.status ?? "", "definir-origem-do-reaproveitamento", papel);

export function SeloOrigemDoReaproveitamento({ peca, onde = "geral", tamanho = "sm", style }: {
  peca: PecaComOrigemNaTela | null | undefined;
  /** "grafica": a Gráfica e a Conferência — o estoque vira "Buscar no estoque". */
  onde?: "grafica" | "geral";
  tamanho?: "sm" | "md";
  style?: CSSProperties;
}) {
  if (!peca) return null;
  const origem = origemDe(peca);
  const rotulo = rotuloDaOrigem(peca, onde);
  if (!origem || !rotulo) return null;
  const buscar = onde === "grafica" && precisaBuscarNoEstoque(peca);
  const cores = origem === "em_transito" ? TOM.ciano : buscar ? TOM.alerta : TOM.esmeralda;
  const icone = origem === "em_transito" ? Truck : buscar ? Boxes : Recycle;
  const dica = dicaDaOrigem(peca) ?? rotulo;
  return (
    <Selo
      forma="retangulo"
      tamanho={tamanho}
      icone={icone}
      cores={cores}
      title={dica}
      aria-label={dica}
      data-testid={peca.id ? `selo-origem-reaproveitamento-${peca.id}` : "selo-origem-reaproveitamento"}
      data-origem={origem}
      style={{ padding: "2px 8px", ...style }}
    >
      {rotulo}
    </Selo>
  );
}

/**
 * O BLOCO DA FICHA: a origem por extenso (com a observação) e o botão discreto
 * "Origem do reaproveitamento" para quem pode trocá-la. Peça reaproveitada sem
 * origem mostra "Sem origem marcada" e o mesmo botão — é por aqui que a peça
 * que veio da planilha ou da Entrada Rápida ganha a origem.
 */
export function OrigemDoReaproveitamentoNaFicha({ peca, podeEditar, onEditar, onde = "geral", style }: {
  peca: PecaComOrigemNaTela & { obsReaproveitamento?: string | null };
  podeEditar: boolean;
  onEditar: () => void;
  onde?: "grafica" | "geral";
  style?: CSSProperties;
}) {
  const un = reaproveitadasDe(peca);
  if (un === 0) return null;
  const origem = origemDe(peca);
  const obs = peca.obsReaproveitamento?.trim();
  const q = Number(peca.quantity) || 0;
  return (
    <div className="reap-ficha" data-testid={peca.id ? `ficha-origem-reaproveitamento-${peca.id}` : "ficha-origem-reaproveitamento"} style={style}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0, flex: "1 1 220px" }}>
        <span style={{ fontSize: FS.meta, fontWeight: FW.rotulo, letterSpacing: "0.06em", textTransform: "uppercase", color: T.apoio }}>
          Reaproveitamento{q > 0 && un < q ? ` · ${un} de ${q} un.` : ""}
        </span>
        {origem
          ? <SeloOrigemDoReaproveitamento peca={peca} onde={onde} tamanho="md" />
          : <span style={{ fontSize: FS.small, color: T.second }}>Sem origem marcada</span>}
        {obs && (
          <span data-testid="obs-origem-reaproveitamento" style={{ fontSize: FS.body, color: T.text, minWidth: 0, overflowWrap: "anywhere" }}>
            {origem === "em_transito" ? "Vem de " : ""}{obs}
          </span>
        )}
      </div>
      {podeEditar && (
        <Botao
          variante="fantasma"
          tamanho="sm"
          icone={PencilLine}
          onClick={onEditar}
          data-testid={peca.id ? `button-origem-reaproveitamento-${peca.id}` : "button-origem-reaproveitamento"}
          title="Marcar se o reaproveitamento sai do estoque ou já está em trânsito, e de qual etapa"
          style={{ color: T.apoio, border: `1px solid ${T.border}`, borderRadius: R.sm, flexShrink: 0 }}
        >
          Origem do reaproveitamento
        </Botao>
      )}
    </div>
  );
}

/**
 * O papel de quem está vendo, lido do cache da sessão (/api/auth/me, que o
 * AuthProvider já carregou). Sem buscar nada: a ficha abre em seis telas e em
 * testes sem o provedor — sem sessão no cache, ninguém edita.
 */
export function usePapelDaSessao(): string | null {
  const qc = useQueryClient();
  return qc.getQueryData<{ role?: string | null }>(["/api/auth/me"])?.role ?? null;
}
