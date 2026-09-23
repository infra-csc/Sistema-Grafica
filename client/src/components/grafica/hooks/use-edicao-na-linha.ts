// ─────────────────────────────────────────────────────────────────────────────
// AS EDIÇÕES EM LINHA DA FILA — reaproveitar, corrigir reaproveitamento,
// cancelar complemento e o menu "⋯" das ações secundárias (tabela compacta).
//
// Cada uma abre NA linha (um campo, OK e X), e só uma linha por vez.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { invalidarGraficaEMaquinas } from "@/lib/tempo-real-grafica";
import type { PecaDaFila } from "@/components/grafica/tipos";
import { apiErrorMessage } from "@/components/grafica/fila/regras";

/** A peça que mark-reuse e correct-reuse devolvem — só o que o toast lê. */
type PecaAtualizada = Pick<PecaDaFila, "quantity" | "reuseQty">;

export type EdicaoNaLinha = ReturnType<typeof useEdicaoNaLinha>;

export function useEdicaoNaLinha(compacto: boolean) {
  const { toast } = useToast();
  // Confirmação em dois toques do "cancelar complemento" — mesmo idioma dos
  // botões de reaproveitamento desta tela, e nunca destrutivo num clique só.
  const [cancelComplementId, setCancelComplementId] = useState<string | null>(null);
  const [reuseConfirmItemId, setReuseConfirmItemId] = useState<string | null>(null);
  // Menu "⋯" das ações SECUNDÁRIAS da linha na tabela compacta (ver a célula
  // de Ações): qual linha está com ele aberto.
  const [menuAcoesId, setMenuAcoesId] = useState<string | null>(null);
  // Abre para CIMA quando falta espaço embaixo na janela (últimas linhas).
  const [menuParaCima, setMenuParaCima] = useState(false);
  const [reuseQty, setReuseQty] = useState(0); // reaproveitamento parcial
  const [correctReuseItemId, setCorrectReuseItemId] = useState<string | null>(null);
  const [correctReuseQty, setCorrectReuseQty] = useState(0); // quantidade corrigida

  const markReuseMutation = useMutation({
    // apiRequest devolve o Response cru — sem o .json() o onSuccess lia
    // quantity/reuseQty como undefined e o toast sempre dizia "peça inteira".
    // qty = SOMA (fluxo normal); reuseTotal = valor ABSOLUTO (via pós-
    // Produzido, ajusta nas duas direções — espelho do mark-reuse).
    mutationFn: async ({ itemId, qty, reuseTotal }: { itemId: string; qty?: number; reuseTotal?: number }) =>
      await (await apiRequest("POST", `/api/items/${itemId}/mark-reuse`, reuseTotal != null ? { reuseTotal } : { qty })).json(),
    onSuccess: (updated: PecaAtualizada) => {
      invalidarGraficaEMaquinas();
      setReuseConfirmItemId(null);
      setMenuAcoesId(null);
      const falta = (updated?.quantity ?? 0) - (updated?.reuseQty ?? 0);
      toast({
        title: "Reaproveitamento registrado",
        description: falta > 0
          ? `${updated.reuseQty} un. reaproveitada(s). Faltam ${falta} un. para produzir.`
          : "Peça inteira reaproveitada. Segue para conferência.",
      });
    },
    onError: (error: Error) => {
      setReuseConfirmItemId(null);
      toast({ title: "Erro ao marcar reaproveitamento", description: error.message, variant: "destructive" });
    },
  });

  // Corrige reaproveitamento total marcado por engano (só disponível antes de conferir)
  const correctReuseMutation = useMutation({
    // Mesmo caso do mark-reuse: o toast lia o Response cru e anunciava
    // "voltou com as 0 un." — o .json() entrega o item atualizado de verdade.
    mutationFn: async ({ itemId, correctedReuseQty }: { itemId: string; correctedReuseQty: number }) =>
      await (await apiRequest("POST", `/api/items/${itemId}/correct-reuse`, { correctedReuseQty })).json(),
    onSuccess: (updated: PecaAtualizada) => {
      invalidarGraficaEMaquinas();
      setCorrectReuseItemId(null);
      setMenuAcoesId(null);
      const qty = Number(updated?.quantity) || 0;
      const reused = Number(updated?.reuseQty) || 0;
      toast({
        title: reused === 0 ? "Reaproveitamento removido" : "Reaproveitamento corrigido",
        description: reused === 0
          ? `A peça voltou para a fila de produção com as ${qty} un.`
          : `${reused} un. reaproveitadas. As outras ${qty - reused} voltaram para produção.`,
      });
    },
    onError: (error: Error) => {
      setCorrectReuseItemId(null);
      toast({ title: "Erro ao corrigir reaproveitamento", description: error.message, variant: "destructive" });
    },
  });

  // Cancelar complemento — a janela de arrependimento, aberta também para a
  // Gráfica (é quem percebe o engano na hora, com a fila na frente). O servidor
  // recusa se QUALQUER unidade já foi produzida, reaproveitada, conferida ou
  // entregue; o botão só aparece nesse mesmo caso, para não convidar a uma ação
  // que voltaria como erro. O número -C1 não é reciclado: o próximo será -C2.
  const cancelComplementMutation = useMutation({
    mutationFn: async ({ itemId }: { itemId: string; displayId: string }) =>
      await (await apiRequest("DELETE", `/api/items/${itemId}/complement`)).json(),
    onSuccess: (_data: unknown, vars) => {
      invalidarGraficaEMaquinas();
      setCancelComplementId(null);
      setMenuAcoesId(null);
      toast({ title: "Complemento cancelado", description: `${vars.displayId} removido da fila.` });
    },
    onError: (error: Error) => {
      setCancelComplementId(null);
      // O corpo do 409/503 vem como JSON cru dentro da mensagem — sem traduzir,
      // o operador leria {"error":"…","code":"COMPLEMENT_TOUCHED"} no toast.
      toast({ title: "Não foi possível cancelar", description: apiErrorMessage(error), variant: "destructive" });
    },
  });

  // Menu "⋯": fecha ao tocar fora dele ou com Esc. O menu fica aberto também
  // enquanto uma edição em linha DELE está aberta (Reaproveitar, Corrigir,
  // Cancelar complemento) — então "aberto" e "fechar" olham os QUATRO estados.
  // Antes só o menuAcoesId: Esc no meio de um Reaproveitar deixava o menu na
  // tela, sem listener e atrás da célula sticky da linha de baixo.
  // Só na tabela compacta: na cheia e nos cartões essas edições são inline e
  // continuam com o próprio Cancelar, como sempre.
  const idMenuAberto = compacto ? (menuAcoesId ?? reuseConfirmItemId ?? correctReuseItemId ?? cancelComplementId) : null;
  const fecharMenuAcoes = () => {
    setMenuAcoesId(null);
    setReuseConfirmItemId(null);
    setCorrectReuseItemId(null);
    setCancelComplementId(null);
  };
  useEffect(() => {
    if (!idMenuAberto) return;
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Element | null;
      if (!alvo?.closest?.(`[data-menu-acoes="${idMenuAberto}"]`)) fecharMenuAcoes();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      fecharMenuAcoes();
      // O menu vira display:none e o foco cairia no <body>: devolve ao "⋯".
      document.querySelector<HTMLElement>(`button[data-menu-acoes="${idMenuAberto}"]`)?.focus();
    };
    document.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", fora); window.removeEventListener("keydown", esc); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idMenuAberto]);

  return {
    reuseConfirmItemId, setReuseConfirmItemId, reuseQty, setReuseQty,
    correctReuseItemId, setCorrectReuseItemId, correctReuseQty, setCorrectReuseQty,
    cancelComplementId, setCancelComplementId,
    menuAcoesId, setMenuAcoesId, menuParaCima, setMenuParaCima, idMenuAberto, fecharMenuAcoes,
    markReuseMutation, correctReuseMutation, cancelComplementMutation,
  };
}
