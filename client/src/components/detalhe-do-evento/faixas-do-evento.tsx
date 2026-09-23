// ─────────────────────────────────────────────────────────────────────────────
// AS FAIXAS DO EVENTO FINALIZADO — encerrado à mão (com quem e quando, e a
// saída ali mesmo) ou já realizado (a data passou; não se reabre).
// ─────────────────────────────────────────────────────────────────────────────
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, Lock, Unlock } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { T, N, TOM } from "@/lib/theme";
import type { LogDeAuditoria, TrabalhoAberto } from "./tipos";

// Helper para formatar data/hora
const formatDateTime = (date: string | Date) => {
  return format(new Date(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
};

export function FaixasDoEvento({ isEventClosed, motivoEventoFim, closureLog, openWork, canCloseEvent, isMobile, onReabrir }: {
  isEventClosed: boolean;
  motivoEventoFim: "encerrado" | "realizado" | null;
  closureLog: LogDeAuditoria | undefined;
  openWork: TrabalhoAberto;
  canCloseEvent: boolean;
  isMobile: boolean;
  onReabrir: () => void;
}) {
  return (
    <>
      {/* Evento ENCERRADO: a faixa é a primeira coisa depois do breadcrumb.
          Quem abre este evento precisa saber, antes de qualquer número, que
          nada aqui está sendo cobrado — e por decisão de quem. */}
      {isEventClosed && (
        <div
          data-testid="banner-event-closed"
          style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12, padding: '14px 18px', marginBottom: 22, backgroundColor: N.n2, border: `1px solid ${T.bdark}`, borderLeft: `4px solid ${T.second}`, borderRadius: 10 }}
        >
          <Lock className="h-4 w-4" style={{ color: T.apoio, flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.strong }}>
              Evento encerrado
              {closureLog?.userName ? ` por ${closureLog.userName}` : ''}
              {closureLog?.createdAt ? ` em ${formatDateTime(closureLog.createdAt)}` : ''}
            </p>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, color: T.apoio, lineHeight: 1.6 }}>
              {openWork.abertas > 0
                ? `${openWork.abertas} ${openWork.abertas === 1 ? 'peça continua' : 'peças continuam'} em aberto${openWork.emProducao > 0 ? ` (${openWork.emProducao} em produção)` : ''} e ${openWork.abertas === 1 ? 'segue listada' : 'seguem listadas'} abaixo — mas o evento não é mais cobrado na Gestão de Prazos nem aparece nas filas de trabalho.`
                : 'Não é mais cobrado na Gestão de Prazos nem aparece nas filas de trabalho.'}
            </p>
          </div>
          {/* A faixa dizia 'Use "Reabrir Evento"' e o botão morava longe, no
              cabeçalho. Agora a saída fica onde o aviso está — o menu "Mais"
              continua com o mesmo item, para quem já procura lá. */}
          {canCloseEvent && (
            <Botao
              variante="secundario"
              tamanho={isMobile ? 'toque' : 'md'}
              icone={Unlock}
              data-testid="button-reopen-event-faixa"
              onClick={onReabrir}
              // O verde diz "sair do encerramento" — mantido sobre o secundário.
              style={{ alignSelf: 'center', flexShrink: 0, color: TOM.sucesso.text, borderColor: TOM.sucesso.border }}
            >
              Reabrir evento
            </Botao>
          )}
        </div>
      )}

      {/* Evento JÁ REALIZADO: a outra origem da finalização, e a que ninguém
          percebe — não há decisão de gente para exibir, só a data que passou.
          Sem esta faixa, os botões travados logo abaixo pareceriam bug. Aqui
          NÃO se oferece "reabrir": a data não volta. */}
      {motivoEventoFim === 'realizado' && (
        <div
          data-testid="banner-event-realizado"
          style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px', marginBottom: 22, backgroundColor: N.n2, border: `1px solid ${T.bdark}`, borderLeft: `4px solid ${T.second}`, borderRadius: 10 }}
        >
          <Calendar className="h-4 w-4" style={{ color: T.apoio, flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.strong }}>
              Evento já realizado
            </p>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, color: T.apoio, lineHeight: 1.6 }}>
              A data do evento já passou, então a lista fica aqui como registro: as peças não
              avançam mais no fluxo e não aparecem nas filas de trabalho. Conferir e registrar
              entrega continuam liberados — é o que fecha a conta do que já saiu.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
