// O acesso aos EVENTOS ARQUIVADOS (só admin, que é quem arquiva e restaura).
// Discreto de propósito: é manutenção, não trabalho do dia — só aparece quando
// há algo arquivado, e abre a lista de onde se restaura.
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive, FileSpreadsheet, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile, usePonteiroGrosso } from "@/hooks/use-mobile";
import { Botao } from "@/components/ui/botao";
import { useConfirmar } from "@/components/ui/usar-confirmar";
import { ModalDeArquivados, type LinhaArquivada } from "@/components/modal-de-arquivados";
import { useExportarFechamento } from "@/lib/exportar-fechamento";
import { foiArquivadoAutomaticamente } from "@shared/arquivamento-automatico";

/** Linha de GET /api/events/arquivados (server/storage.ts: EventoArquivado). */
export interface EventoArquivado {
  id: string;
  name: string;
  startDate: string | null;
  arquivadoEm: string | null;
  arquivadoPor: string | null;
  totalPecas: number;
}

export const CHAVE_EVENTOS_ARQUIVADOS = ["/api/events/arquivados"] as const;

function pecas(n: number): string {
  return `${n} ${n === 1 ? "peça" : "peças"}`;
}

function detalheDoEvento(e: EventoArquivado): string {
  const partes = [pecas(e.totalPecas)];
  const inicio = e.startDate ? new Date(e.startDate) : null;
  if (inicio && !Number.isNaN(inicio.getTime())) partes.push(`evento em ${format(inicio, "dd/MM/yyyy", { locale: ptBR })}`);
  return partes.join(" · ");
}

export function EventosArquivados() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const ponteiroGrosso = usePonteiroGrosso();
  const { confirmar, dialogo } = useConfirmar();
  const [aberto, setAberto] = useState(false);
  // O fechamento do evento arquivado (o servidor libera o arquivado só ao
  // admin — services/fechamentoDoEvento.ts). Spinner só na linha baixando.
  const { exportar, exportando } = useExportarFechamento();
  const [baixandoId, setBaixandoId] = useState<string | null>(null);
  const baixarFechamento = async (id: string) => {
    setBaixandoId(id);
    try { await exportar([id]); } finally { setBaixandoId(null); }
  };

  const { data: arquivados = [], isLoading, isError, refetch } = useQuery<EventoArquivado[]>({
    queryKey: CHAVE_EVENTOS_ARQUIVADOS,
  });

  const restaurar = useMutation({
    mutationFn: async (evento: EventoArquivado) => {
      const res = await apiRequest("POST", `/api/events/${evento.id}/restaurar`);
      return (await res.json()) as { items?: number };
    },
    onSuccess: (data, evento) => {
      // O evento volta à lista e as peças dele voltam a todas as telas.
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: CHAVE_EVENTOS_ARQUIVADOS });
      const n = data?.items ?? evento.totalPecas;
      toast({
        variant: "success",
        title: "Evento restaurado",
        description: n > 0
          ? `${evento.name} voltou às telas com ${pecas(n)}, como estava.`
          : `${evento.name} voltou à lista de eventos.`,
      });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Não foi possível restaurar o evento", description: e.message }),
  });

  const pedirRestauracao = async (linha: LinhaArquivada) => {
    const evento = arquivados.find((e) => e.id === linha.id);
    if (!evento) return;
    const ok = await confirmar({
      titulo: `Restaurar ${evento.name}?`,
      descricao: (evento.totalPecas > 0
        ? `O evento volta à lista e as ${pecas(evento.totalPecas)} voltam às filas, exatamente como estavam.`
        : "O evento volta à lista de eventos, exatamente como estava.")
        // Restaurado depois de vencido, o automático não volta a arquivá-lo.
        + (foiArquivadoAutomaticamente(evento.arquivadoPor) ? " O arquivamento automático não mexe mais nele; para tirar de novo, use Excluir." : ""),
      confirmar: "Restaurar",
      cancelar: "Manter arquivado",
      icone: RotateCcw,
    });
    if (ok) restaurar.mutate(evento);
  };

  const linhas: LinhaArquivada[] = arquivados.map((e) => ({
    id: e.id, nome: e.name, detalhe: detalheDoEvento(e), arquivadoEm: e.arquivadoEm, arquivadoPor: e.arquivadoPor,
  }));

  // Nada arquivado, nada a mostrar: o botão só aparece quando há o que restaurar.
  if (!aberto && arquivados.length === 0) return dialogo;

  return (
    <>
      {arquivados.length > 0 && (
        <Botao
          variante="fantasma"
          icone={Archive}
          tamanho={isMobile ? "toque" : "md"}
          onClick={() => setAberto(true)}
          data-testid="button-eventos-arquivados"
          // No celular cabe na linha do título só o ícone e o número; o nome
          // inteiro fica para o leitor de tela e para o toque longo (title).
          aria-label={`Eventos arquivados (${arquivados.length})`}
          title="Eventos arquivados — restaurar"
          style={{ flexShrink: 0 }}
        >
          {isMobile ? arquivados.length : `Arquivados (${arquivados.length})`}
        </Botao>
      )}
      <ModalDeArquivados
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Eventos arquivados"
        explicacao="Eventos excluídos — e os arquivados automaticamente 2 semanas após a data do evento — saem de todas as telas, mas nada foi apagado. Restaurar devolve o evento e as peças dele exatamente como estavam."
        linhas={linhas}
        carregando={isLoading}
        erro={isError}
        aoTentarDeNovo={() => { void refetch(); }}
        aoRestaurar={(l) => { void pedirRestauracao(l); }}
        restaurandoId={restaurar.isPending ? restaurar.variables?.id ?? null : null}
        prefixo="eventos-arquivados"
        acoesDaLinha={(l) => (
          <Botao
            variante="fantasma"
            tamanho={isMobile || ponteiroGrosso ? "toque" : "sm"}
            icone={FileSpreadsheet}
            carregando={baixandoId === l.id}
            disabled={exportando && baixandoId !== l.id}
            onClick={() => { void baixarFechamento(l.id); }}
            data-testid={`eventos-arquivados-fechamento-${l.id}`}
            aria-label={`Baixar fechamento de ${l.nome}`}
            title="Planilha com todas as peças do evento"
            style={{ flexShrink: 0, width: isMobile ? "100%" : undefined }}
          >
            Baixar fechamento
          </Botao>
        )}
      />
      {dialogo}
    </>
  );
}
