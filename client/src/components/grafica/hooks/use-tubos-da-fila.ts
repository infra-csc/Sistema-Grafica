// ─────────────────────────────────────────────────────────────────────────────
// OS TUBOS NA FILA — o que a linha da peça sabe dos volumes.
//
// Cada evento abre o painel de tubos para agrupar e entregar por tubo. A
// escolha de tubo NÃO mora na conferência — conferir é só conferir com foto.
// O tubo entra pelo "Embalar" da peça conferida (`embalar`: o painel abre já
// com a peça marcada, focado em escolher o tubo) e pelo "Entregar tubo" da
// embalada (`entregarTubo`: abre no formulário daquele tubo).
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { invalidarGraficaEMaquinas } from "@/lib/tempo-real-grafica";
import { linhaDaLista } from "@/lib/etiqueta-lista";
import { embaladaDe, parteDoTotal, seloDosVolumes, type LinhaDoVolume } from "@shared/embalagem";
import { qtyOf } from "@/lib/saldo";
import type { PainelDeTubos, PecaDaFila, TuboResumo } from "@/components/grafica/tipos";
import { apiErrorMessage } from "@/components/grafica/fila/regras";

/** O selo "Tubo N · 4 peças" e a lista do title (ver `conteudoDoTubo`). */
type ConteudoDoTubo = { total: number; lista: string };

// O formatador da hora do fechamento, criado UMA vez (perf, 07/10):
// `toLocaleTimeString("pt-BR", …)` monta um formatador do Intl a cada chamada
// — com centenas de tubos, ~60 ms por versão da lista de tubos. Mesmas opções,
// mesmo texto ("14:32").
const HORA_DO_FECHAMENTO = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

// Constante vazia ESTÁVEL: ver o useQuery de /api/tubos.
const SEM_TUBOS: TuboResumo[] = [];

export type TubosDaFila = ReturnType<typeof useTubosDaFila>;

export function useTubosDaFila(pecasDoServidor: PecaDaFila[]) {
  const { toast } = useToast();
  const [tubosDoEvento, setTubosDoEvento] = useState<PainelDeTubos | null>(null);
  // Sem `= []` no destructuring: o array novo a cada render mudaria o
  // `numeroDoTubo` (e as deps de TODAS as linhas memoizadas) a cada render.
  const { data: todosOsTubos = SEM_TUBOS } = useQuery<TuboResumo[]>({
    queryKey: ["/api/tubos"],
    refetchInterval: 60_000,
  });
  // O número da aba: tubos de verdade, abertos, com alguma coisa dentro.
  const tubosAbertosNaTela = useMemo(() => todosOsTubos.filter((t) => !t.avulso && !t.entregueEm && (t.linhas ?? []).some((l) => !l.entregue)).length, [todosOsTubos]);
  const numeroDoTubo = useMemo(() => new Map<string | null, number>(todosOsTubos.map((t) => [t.id, t.numero])), [todosOsTubos]);
  // Quando o tubo foi FECHADO (foto tirada) — "fechado 14:32" na peça embalada
  // (dono, 21/09). Só hora: a fila é do dia, e a data já está no cabeçalho.
  const fechamentoDoTubo = useMemo(() => new Map<string | null, string>(
    todosOsTubos.filter((t) => t.fechadoEm).map((t) => [t.id, HORA_DO_FECHAMENTO.format(new Date(t.fechadoEm as string))]),
  ), [todosOsTubos]);
  // O QUE ESTÁ EM CADA TUBO (dono, 21/09: "tem que sinalizar quais itens estão
  // no tubo"): o selo diz "Tubo 1 · 4 peças" e o title lista código + a mesma
  // linha da etiqueta ("2x1 Ministério - 16"). Sai da fila que já está na
  // memória — nenhuma consulta nova. Tocar no selo abre o painel naquele tubo.
  //
  // SOB DEMANDA (perf, 07/10): montava o texto de TODOS os tubos (centenas,
  // com a linha da etiqueta de cada peça) a cada versão da fila — só para as
  // dezenas de linhas desenhadas lerem o seu. Agora cada tubo é montado na
  // primeira leitura e guardado até a fila ou os tubos mudarem; quem lê
  // (`get`) recebe o mesmo valor de antes, e o mesmo objeto entre leituras.
  const conteudoDoTubo = useMemo(() => {
    const tuboPorId = new Map(todosOsTubos.map((t) => [t.id, t]));
    let pecaPorId: Map<string, PecaDaFila> | null = null;
    const montados = new Map<string, ConteudoDoTubo | undefined>();
    return {
      get(tuboId: string | null | undefined): ConteudoDoTubo | undefined {
        if (tuboId == null) return undefined;
        if (montados.has(tuboId)) return montados.get(tuboId);
        const t = tuboPorId.get(tuboId);
        let conteudo: ConteudoDoTubo | undefined;
        if (t) {
          const porId = (pecaPorId ??= new Map(pecasDoServidor.map((i) => [i.id, i])));
          const dentro = (t.linhas ?? []).filter((l) => porId.has(l.itemId));
          if (dentro.length) {
            conteudo = {
              total: dentro.length,
              // A quantidade é a QUE ESTÁ NAQUELE volume; "(7 de 10)" quando dividida.
              lista: dentro.map((l) => { const x = porId.get(l.itemId)!; return `${x.displayId ?? "—"} · ${linhaDaLista({ ...x, quantity: l.quantidade })} ${parteDoTotal(l.quantidade, qtyOf(x))}`.trim(); }).join("\n"),
            };
          }
        }
        montados.set(tuboId, conteudo);
        return conteudo;
      },
    };
  }, [pecasDoServidor, todosOsTubos]);
  // Os volumes ABERTOS de cada peça, com a quantidade em cada um — o selo da
  // linha ("Tubo 1 (7) · Tubo 2 (3)" / "Embalada (10)") sai daqui.
  const volumesDaPeca = useMemo(() => {
    const m = new Map<string, LinhaDoVolume[]>();
    for (const t of todosOsTubos) {
      for (const l of t.linhas ?? []) {
        if (l.entregue) continue;
        m.set(l.itemId, [...(m.get(l.itemId) ?? []), { tuboId: t.id, quantidade: l.quantidade, numero: t.numero, avulso: !!t.avulso }]);
      }
    }
    return m;
  }, [todosOsTubos]);
  const temVolumeAberto = (item: PecaDaFila) => (volumesDaPeca.get(item.id)?.length ?? 0) > 0 && !!item.tuboId;
  // EMBALADA SOZINHA (dono, 21/09: "nem sempre vai ser 'entregar tubo'"): o
  // volume avulso nunca é "Tubo N" — o selo diz "Embalada", a ação é
  // "Entregar" e o desfazer é "Desfazer embalagem".
  const tubosAvulsos = useMemo(() => new Set<string | null>(todosOsTubos.filter((t) => t.avulso).map((t) => t.id)), [todosOsTubos]);
  const ehAvulsa = (item: PecaDaFila) => !!item.tuboAvulso || (!!item.tuboId && tubosAvulsos.has(item.tuboId));
  const seloDoTubo = (item: PecaDaFila): string | null => {
    const volumes = volumesDaPeca.get(item.id) ?? [];
    if (!volumes.length) return null;
    // "7 de 10 embaladas" na frente quando ainda falta embalar o resto.
    const falta = embaladaDe(item) < qtyOf(item) ? `${embaladaDe(item)} de ${qtyOf(item)} embaladas · ` : "";
    return falta + seloDosVolumes(volumes);
  };
  const tituloDoTubo = (item: PecaDaFila): string => {
    const c = conteudoDoTubo.get(item.tuboId);
    const foto = fechamentoDoTubo.get(item.tuboId);
    if (ehAvulsa(item)) return `Embalada sozinha${foto ? ` · foto ${foto}` : ""}\nToque para ver a embalagem.`;
    return `Tubo ${numeroDoTubo.get(item.tuboId) ?? ""} · ${c?.total ?? 1} ${(c?.total ?? 1) === 1 ? "peça" : "peças"}${foto ? ` · foto ${foto}` : " · sem foto"}\n${c?.lista ?? ""}\nToque para abrir o tubo.`;
  };
  // O toque no SELO abre o modal DAQUELE tubo ("devia abrir um modal para saber
  // quais peças estão junto com ele") — não mais o painel do evento inteiro,
  // que continua no botão Tubos do cabeçalho do evento.
  const abrirTuboDaPeca = (item: PecaDaFila) =>
    setTubosDoEvento({ id: String(item.eventId), name: item.event?.name ?? "Evento", verTubo: item.tuboId });

  // TIRAR DO TUBO direto da fila (21/09): a peça Embalado volta a Conferido —
  // o servidor faz a transição e escreve a trilha. É o mesmo PATCH do modal.
  const tirarDoTuboMutation = useMutation({
    mutationFn: async ({ itemId, tuboId }: { itemId: string; tuboId: string | null; displayId?: string }) =>
      await apiRequest("PATCH", `/api/tubos/${tuboId}/itens`, { remover: [itemId] }),
    onSuccess: (_r, vars) => {
      invalidarGraficaEMaquinas();
      queryClient.invalidateQueries({ queryKey: ["/api/tubos"] });
      toast({ title: tubosAvulsos.has(vars.tuboId) ? `Embalagem de ${vars.displayId ?? "peça"} desfeita` : `${vars.displayId ?? "Peça"} saiu do Tubo ${numeroDoTubo.get(vars.tuboId) ?? ""}`, description: "Voltou para Conferido." });
    },
    onError: (error: Error) => {
      invalidarGraficaEMaquinas();
      toast({ title: "Não foi possível tirar do tubo", description: apiErrorMessage(error), variant: "destructive" });
    },
  });

  return {
    tubosDoEvento, setTubosDoEvento, todosOsTubos, tubosAbertosNaTela, numeroDoTubo, fechamentoDoTubo, conteudoDoTubo,
    volumesDaPeca, temVolumeAberto, tubosAvulsos, ehAvulsa, seloDoTubo, tituloDoTubo, abrirTuboDaPeca, tirarDoTuboMutation,
  };
}
