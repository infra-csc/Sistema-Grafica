// ─────────────────────────────────────────────────────────────────────────────
// EVENTOS (/eventos) — índice operacional por evento.
//
// A pergunta que o usuário traz para cá é sempre a mesma: *qual evento sai
// primeiro, ele está no prazo, e onde clico para abrir*. Três decisões desta
// tela saem daí:
//
// 1. ESTADO HONESTO. O servidor deixou de carimbar "Concluído" por DATA e passou
//    a mandar `lifecycle` (active | completed | realizado | manually_closed)
//    junto com `allDelivered`/`eventHasPassed`. Antes, um evento que só COMEÇOU virava
//    verde, perdia a bandeira de prioridade, caía para o último balde da
//    ordenação e ainda exibia "3/20 Entregues" ao lado de "Concluído" — a tela
//    escondia exatamente o caso que ela existe para revelar. Aqui os três
//    estados são distintos em borda, badge, ordenação e rodapé.
// 2. A TELA FALA DE PRAZO. É onde os 5 marcos nascem e era a única do sistema
//    que não os mostrava (só /prazos, restrita a admin). O card agora traz o
//    PRÓXIMO MARCO com semáforo, direto de `event.nextMilestone` — cálculo do
//    servidor, mesma âncora (saída do caminhão) e mesmo ajuste de fim de semana
//    de /api/prazos. NÃO recalcule no cliente: `daysRemaining` já vem no fuso do
//    negócio (America/Sao_Paulo).
// 3. NADA DE TRABALHO PERDIDO. X, Esc e clique-fora do modal passam pela MESMA
//    pergunta de descarte, comparada contra um snapshot (e não contra "está em
//    modo edição").
// ─────────────────────────────────────────────────────────────────────────────
//
// A página é a COMPOSIÇÃO; os pedaços moram em components/eventos/ — dados,
// filtros e recorte, formulário, ações sobre o evento, cartão e linha.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { T } from "@/lib/theme";
import { useAuth } from "@/contexts/auth-context";
import { useIsMobile, usePonteiroGrosso } from "@/hooks/use-mobile";
import { EncerrarEventoDialog } from "@/components/encerrar-evento-dialog";
import { useEventosDados } from "@/components/eventos/use-eventos-dados";
import { useFiltrosDeEventos } from "@/components/eventos/use-filtros-de-eventos";
import { useEventosFiltrados } from "@/components/eventos/use-eventos-filtrados";
import { useFormularioDoEvento } from "@/components/eventos/use-formulario-do-evento";
import { useAcoesDoEvento } from "@/components/eventos/use-acoes-do-evento";
import { CabecalhoDeEventos } from "@/components/eventos/cabecalho-de-eventos";
import { FaixaDePedidos } from "@/components/eventos/faixa-de-pedidos";
import { ModalDoEvento } from "@/components/eventos/modal-do-evento";
import { BarraDeFiltros } from "@/components/eventos/barra-de-filtros";
import { BarraDeOrdem } from "@/components/eventos/barra-de-ordem";
import { ListaDeEventos } from "@/components/eventos/lista-de-eventos";
import { DialogoDeArquivar } from "@/components/eventos/dialogo-de-arquivar";
import { DialogoDePrioridade } from "@/components/eventos/dialogo-de-prioridade";

export default function Eventos() {
  const { user } = useAuth();
  // Permissões de UI espelham os gates do servidor. Todas leem `user.role`
  // pela MESMA forma — `hasPermission("solicitacao")` já devolve true para
  // admin, então misturar as duas escritas dava a impressão de regras
  // diferentes onde a regra é a mesma.
  const role = user?.role;
  const canEdit = role === 'admin' || role === 'solicitacao';        // PATCH /api/events/:id
  // O Atendimento vincula patrocinadores (dono, 15/09) sem editar o evento:
  // abre a mesma janela só com os patrocinadores e as cotas. As rotas de
  // vínculo já aceitavam o perfil; o PATCH do evento continua fora.
  const soPatrocinadores = !canEdit && role === 'atendimento';
  const canDelete = role === 'admin';                                 // DELETE /api/events/:id (arquiva)
  // Encerrar/reabrir é da mesma classe da exclusão (admin), e não da edição:
  // não muda um dado do evento, tira trabalho do campo de visão de OUTRAS
  // equipes — some da Gestão de Prazos e das filas. Espelha o gate do servidor
  // em POST /api/events/:id/close e /reopen.
  const canClose = role === 'admin';
  const canSetPriority = role === 'admin' || role === 'atendimento' || role === 'solicitacao';
  const canCreate = role === 'admin' || role === 'solicitacao';       // POST /api/events

  const isMobile = useIsMobile();
  /** Dedo (celular OU tablet do galpão): manda no TAMANHO do alvo, só nele. */
  const dedo = usePonteiroGrosso() || isMobile;
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  // RELÓGIO DE MINUTO. Cartão e linha são memoizados (PERF-6) e só desenham de
  // novo quando as props mudam — o relógio lido lá dentro parava junto, e o
  // selo de urgência do caminhão ficava no estado da última mudança do evento.
  // Como prop, o tique de 1 min é o que os faz andar.
  const [agoraMs, setAgoraMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgoraMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const filtros = useFiltrosDeEventos();
  const dados = useEventosDados();
  const { events, isLoading, isError, refetch, sponsors, sponsorById, pedidosPorEvento } = dados;
  const form = useFormularioDoEvento({ sponsors, sponsorById, soPatrocinadores });
  const acoes = useAcoesDoEvento(events, filtros);
  const recorte = useEventosFiltrados(events, sponsorById, pedidosPorEvento, filtros);
  const carregado = !isLoading && !isError;

  return (
    <div style={{ backgroundColor: T.bg, height: '100%', overflowY: 'auto', padding: isMobile ? '12px' : '32px', display: 'flex', flexDirection: 'column', gap: isMobile ? '14px' : '20px' }}>

      {/* ── HEADER ── */}
      <div>
        <CabecalhoDeEventos
          filtros={filtros}
          focoCounts={recorte.focoCounts}
          canCreate={canCreate}
          canDelete={canDelete}
          isMobile={isMobile}
          onNovoEvento={form.abrirNovoEvento}
        />

        {(user?.role === 'solicitacao' || user?.role === 'admin') && (
          <FaixaDePedidos linhasAbertas={dados.linhasAbertas} foco={filtros.foco} setFoco={filtros.setFoco} dedo={dedo} />
        )}

        <ModalDoEvento
          form={form}
          isMobile={isMobile}
          dedo={dedo}
          sponsors={sponsors}
          sponsorsQueryLoading={dados.sponsorsQueryLoading}
          sponsorsQueryError={dados.sponsorsQueryError}
        />
      </div>

      <BarraDeFiltros
        filtros={filtros}
        recorte={recorte}
        totalDeEventos={events.length}
        carregado={carregado}
        isMobile={isMobile}
        dedo={dedo}
      />

      {carregado && (
        <BarraDeOrdem ordem={filtros.ordem} setOrdem={filtros.setOrdem} isMobile={isMobile} dedo={dedo} />
      )}

      <ListaDeEventos
        events={events}
        isLoading={isLoading}
        isError={isError}
        refetch={refetch}
        recorte={recorte}
        densidade={filtros.densidade}
        patrocinadoresDoCartao={dados.patrocinadoresDoCartao}
        pedidosPorEvento={pedidosPorEvento}
        currentYear={currentYear}
        relogioMs={agoraMs}
        isMobile={isMobile}
        permissoes={{ canCreate, canEdit, soPatrocinadores, canDelete, canSetPriority, canClose }}
        acoes={{
          onEdit: form.handleEdit,
          onDelete: acoes.handleDelete,
          onDuplicate: form.handleDuplicate,
          onSetPriority: acoes.handleSetPriority,
          onClose: acoes.handleClose,
          onReopen: acoes.handleReopen,
        }}
        onNovoEvento={form.abrirNovoEvento}
        clearAllEventFilters={filtros.clearAllEventFilters}
      />

      <DialogoDeArquivar acoes={acoes} isMobile={isMobile} />

      {/* ── ENCERRAR / REABRIR ──
          A confirmação é UM componente, o mesmo do detalhe do evento
          (components/encerrar-evento-dialog.tsx): a mesma decisão diz a mesma
          frase nas duas telas. A mutação, as invalidações e o toast com
          "Mostrar" continuam em use-acoes-do-evento. */}
      <EncerrarEventoDialog
        modo="encerrar"
        open={!!acoes.closingEventId}
        onFechar={() => acoes.setClosingEventId(null)}
        onConfirmar={() => { if (acoes.closingEventId) acoes.closeEventMutation.mutate(acoes.closingEventId); }}
        pendente={acoes.closeEventMutation.isPending}
        nomeDoEvento={acoes.closingEvent?.name}
        abertas={acoes.closingStats ? acoes.closingStats.openCount : null}
        emProducao={acoes.closingStats?.inProductionCount ?? null}
        ativas={acoes.closingStats?.activeItemCount ?? null}
      />
      <EncerrarEventoDialog
        modo="reabrir"
        open={!!acoes.reopeningEventId}
        onFechar={() => acoes.setReopeningEventId(null)}
        onConfirmar={() => { if (acoes.reopeningEventId) acoes.reopenEventMutation.mutate(acoes.reopeningEventId); }}
        pendente={acoes.reopenEventMutation.isPending}
        nomeDoEvento={acoes.reopeningEvent?.name}
        abertas={acoes.reopeningStats ? acoes.reopeningStats.openCount : null}
        emProducao={acoes.reopeningStats?.inProductionCount ?? null}
        ativas={acoes.reopeningStats?.activeItemCount ?? null}
      />

      <DialogoDePrioridade acoes={acoes} isMobile={isMobile} />
    </div>
  );
}
