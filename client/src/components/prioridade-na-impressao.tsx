// ─────────────────────────────────────────────────────────────────────────────
// PRIORIDADE NA IMPRESSÃO — o botão (dono, 08/10: "faz um botão que a
// Solicitação consegue pedir prioridade na impressão quando estiver na revisão
// ou na gráfica").
//
// Um componente só para as quatro telas (Detalhe do Evento, Revisão Final,
// Painel Geral, Gráfica). A REGRA de quando aparece mora em
// shared/prioridade-na-impressao.ts — a mesma que a rota
// POST /api/items/:id/prioridade-na-impressao aplica; aqui só o desenho e o
// pedido.
//
//   · "pedir"  → [⤒ Pedir prioridade na impressão]
//   · "pedida" → (⚠ Prioridade pedida) [Retirar prioridade]
//   · fora da janela, sem papel, peça do Kit alheia → nada.
//
// O estado mostrado é o do servidor assim que ele responde (a ficha aberta no
// Painel Geral é uma cópia da peça e não se atualiza sozinha); a lista vem
// junto pela invalidação. Toast com "Desfazer", como os outros gestos de volta
// fácil do app.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import type React from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpToLine, X } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { invalidarGraficaEMaquinas } from "@/lib/tempo-real-grafica";
import { FS, T, TOM } from "@/lib/theme";
import {
  estadoDaPrioridadeNaImpressao, ROTULO_PEDIR_PRIORIDADE, ROTULO_PRIORIDADE_PEDIDA, ROTULO_RETIRAR_PRIORIDADE,
} from "@shared/prioridade-na-impressao";
import type { PecaDaPrioridade } from "@shared/prioridade-na-impressao";

export type PecaComPrioridade = PecaDaPrioridade & { id: string; displayId?: string | null };

const mensagemDoErro = (e: unknown): string => {
  const bruto = String((e as { message?: unknown } | null)?.message ?? "");
  try {
    const j = JSON.parse(bruto);
    if (j?.error) return String(j.error);
  } catch { /* já era a frase */ }
  return bruto || "Erro inesperado";
};

/**
 * O pedido e o estado mostrado. `pedidaAgora` = o que o servidor respondeu por
 * último para esta peça (vence a cópia que a tela tem até ela recarregar).
 */
export function usePrioridadeNaImpressao(item: PecaComPrioridade | null | undefined) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [respondida, setRespondida] = useState<{ id: string; valor: boolean } | null>(null);
  // A peça trocou (outra ficha) ou chegou versão nova dela: vale a da tela.
  useEffect(() => { setRespondida(null); }, [item?.id, item?.isPriority]);

  const mutacao = useMutation({
    mutationFn: async (v: { itemId: string; prioritaria: boolean; displayId?: string | null; desfazendo?: boolean }) => {
      const r = await apiRequest("POST", `/api/items/${v.itemId}/prioridade-na-impressao`, { prioritaria: v.prioritaria });
      return (await r.json()) as { isPriority?: boolean };
    },
    onSuccess: (peca, v) => {
      setRespondida({ id: v.itemId, valor: !!peca?.isPriority });
      invalidarGraficaEMaquinas("/api/audit-logs");
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      const rotulo = v.displayId ?? "Peça";
      if (v.desfazendo) {
        toast({ title: v.prioritaria ? `Prioridade pedida de novo: ${rotulo}` : `Pedido desfeito: ${rotulo}`, variant: "success" });
        return;
      }
      toast({
        title: v.prioritaria ? `Prioridade pedida: ${rotulo}` : `Prioridade retirada: ${rotulo}`,
        description: v.prioritaria
          ? "A Gráfica foi avisada. A peça passa à frente das outras na fila da Gráfica e na de Máquinas."
          : "A peça volta para a ordem normal da fila da Gráfica.",
        variant: "success",
        action: (
          <ToastAction
            altText={v.prioritaria ? `Desfazer o pedido de prioridade de ${rotulo}` : `Pedir de novo a prioridade de ${rotulo}`}
            onClick={() => mutacao.mutate({ ...v, prioritaria: !v.prioritaria, desfazendo: true })}
          >
            Desfazer
          </ToastAction>
        ),
      });
    },
    onError: (e, v) => {
      invalidarGraficaEMaquinas();
      toast({
        title: v.prioritaria ? "Não foi possível pedir a prioridade" : "Não foi possível retirar a prioridade",
        description: mensagemDoErro(e),
        variant: "destructive",
      });
    },
  });

  const pecaAgora = item
    ? { ...item, isPriority: respondida && respondida.id === item.id ? respondida.valor : item.isPriority }
    : null;
  const estado = estadoDaPrioridadeNaImpressao(pecaAgora, { papel: user?.role, kit: user?.kit === true, userId: user?.id ?? null });
  const pendente = mutacao.isPending && mutacao.variables?.itemId === item?.id;
  const pedir = (prioritaria: boolean) => {
    if (!item || mutacao.isPending) return;
    mutacao.mutate({ itemId: item.id, prioritaria, displayId: item.displayId });
  };
  return { estado, pendente, pedir };
}

/**
 * O CONTROLE — `tamanho` "md" na ficha e na Revisão, "sm" na linha da Gráfica,
 * "toque" no celular. `eventoFinalizado`: pedir some (a rota recusa); retirar
 * continua (recuar nunca é barrado).
 */
export function PrioridadeNaImpressao({ item, eventoFinalizado = false, tamanho = "md", fonte, alvo, larguraCheia = false, naFilaDaGrafica = false, envolver, style }: {
  item: PecaComPrioridade | null | undefined;
  eventoFinalizado?: boolean;
  tamanho?: "sm" | "md" | "toque";
  /** Na linha da Gráfica: o corpo de letra da célula (o mesmo do Travar). */
  fonte?: number;
  /** Na linha da Gráfica: a altura mínima do alvo (o mesmo do Travar). */
  alvo?: number;
  /** No celular: o botão ocupa a linha inteira. */
  larguraCheia?: boolean;
  /**
   * Na fila da Gráfica: rótulo curto ("Pedir prioridade" — a tela já é a da
   * impressão, e a coluna Status não pode alargar) e, pedida, só o Retirar:
   * o selo "Prioritária" já está na peça e o grupo do topo diz o resto.
   */
  naFilaDaGrafica?: boolean;
  /** Estilo de um invólucro que só existe quando o controle aparece (ex.: a linha própria no cartão). */
  envolver?: React.CSSProperties;
  style?: React.CSSProperties;
}) {
  const { estado, pendente, pedir } = usePrioridadeNaImpressao(item);
  if (!item || !estado) return null;
  if (estado === "pedir" && eventoFinalizado) return null;
  const peca: PecaComPrioridade = item;
  const controle = desenharControle();
  return envolver ? <span style={envolver}>{controle}</span> : controle;

  function desenharControle() {
    const letra = fonte ? Math.max(fonte, FS.meta) : undefined;
    const altura = alvo ? { minHeight: alvo } : {};
    if (estado === "pedir") {
      return (
        <Botao
          variante="secundario"
          tamanho={tamanho}
          icone={ArrowUpToLine}
          carregando={pendente}
          onClick={(e) => { e.stopPropagation(); pedir(true); }}
          data-testid={`button-pedir-prioridade-${peca.id}`}
          aria-label={`${ROTULO_PEDIR_PRIORIDADE}: ${peca.displayId ?? "peça"}`}
          title="A Gráfica é avisada e a peça passa à frente das outras na fila da Gráfica e na de Máquinas"
          larguraCheia={larguraCheia}
          style={{ ...altura, ...(letra ? { fontSize: letra } : {}), ...style }}
        >
          {pendente ? "Pedindo…" : naFilaDaGrafica ? "Pedir prioridade" : ROTULO_PEDIR_PRIORIDADE}
        </Botao>
      );
    }
    return (
      <div className="prio-pedida" data-testid={`prioridade-pedida-${peca.id}`} style={style}>
        {!naFilaDaGrafica && <Selo tom="perigo" forma="retangulo" icone={AlertTriangle} title="Pedida para a impressão: a peça está à frente das outras na fila da Gráfica e na de Máquinas" style={{ padding: "3px 8px", ...(letra ? { fontSize: letra } : {}) }}>
          {ROTULO_PRIORIDADE_PEDIDA}
        </Selo>}
        <Botao
          variante="fantasma"
          tamanho={tamanho}
          icone={X}
          carregando={pendente}
          onClick={(e) => { e.stopPropagation(); pedir(false); }}
          data-testid={`button-retirar-prioridade-${peca.id}`}
          aria-label={`${ROTULO_RETIRAR_PRIORIDADE}: ${peca.displayId ?? "peça"}`}
          title="Tira o pedido: a peça volta para a ordem normal da fila"
          style={{ ...altura, color: TOM.perigo.text, ...(letra ? { fontSize: letra } : {}) }}
        >
          {pendente ? "Retirando…" : ROTULO_RETIRAR_PRIORIDADE}
        </Botao>
      </div>
    );
  }
}

/**
 * O MESMO PEDIDO EM ÍCONE, para a coluna de ações da lista do Detalhe do
 * Evento (os outros gestos dali — direto para a Gráfica, reaproveitar,
 * editar, excluir — são ícones de 32px, 44px no toque). Liga/desliga: aceso
 * no tom de perigo quando pedida. O rótulo por extenso vai no title e no
 * aria-label; na ficha da peça o mesmo pedido aparece escrito.
 */
export function PrioridadeNaImpressaoIcone({ item, eventoFinalizado = false, noCartao = false }: {
  item: PecaComPrioridade;
  eventoFinalizado?: boolean;
  /** No cartão do celular: 44px com borda, como os vizinhos. */
  noCartao?: boolean;
}) {
  const { estado, pendente, pedir } = usePrioridadeNaImpressao(item);
  if (!estado) return null;
  if (estado === "pedir" && eventoFinalizado) return null;
  const pedida = estado === "pedida";
  const rotulo = pedida ? `${ROTULO_PRIORIDADE_PEDIDA} — clique para retirar` : ROTULO_PEDIR_PRIORIDADE;
  const Icone = pedida ? AlertTriangle : ArrowUpToLine;
  return (
    <button
      type="button"
      className={`evd-acao ${pedida ? "prio-acao-ativa" : "prio-acao"}`}
      onClick={(e) => { e.stopPropagation(); pedir(!pedida); }}
      disabled={pendente}
      aria-pressed={pedida}
      aria-label={`${rotulo}: ${item.displayId ?? "peça"}`}
      title={pedida
        ? "Prioridade na impressão pedida — a peça está à frente na fila da Gráfica e na de Máquinas. Clique para retirar."
        : "Pedir prioridade na impressão — a Gráfica é avisada e a peça passa à frente das outras na fila dela e na de Máquinas"}
      data-testid={`button-prioridade-icone-${item.id}`}
      style={noCartao ? { minHeight: 44, width: 44, border: `1px solid ${T.border}`, cursor: pendente ? "wait" : "pointer" } : { cursor: pendente ? "wait" : "pointer" }}
    >
      <Icone aria-hidden="true" style={{ width: 16, height: 16 }} />
    </button>
  );
}

/**
 * O controle aparece para esta pessoa nesta peça? Para os slots que testam o
 * nó por verdade (a `topActions` da ficha deixa um respiro vazio quando
 * recebe um elemento que desenha nada).
 */
export function mostraPrioridadeNaImpressao(
  item: PecaComPrioridade | null | undefined,
  user: { role?: string | null; kit?: boolean | null; id?: string | null } | null | undefined,
  eventoFinalizado = false,
): boolean {
  const estado = estadoDaPrioridadeNaImpressao(item, { papel: user?.role, kit: user?.kit === true, userId: user?.id ?? null });
  return estado === "pedida" || (estado === "pedir" && !eventoFinalizado);
}
