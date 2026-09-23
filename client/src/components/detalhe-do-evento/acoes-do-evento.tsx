// ─────────────────────────────────────────────────────────────────────────────
// AS AÇÕES DO CABEÇALHO — Adicionar peça (primária), Importar Excel e o menu
// "Mais" (book, etiquetas, relatório, Excel, clonar, encerrar/reabrir), com o
// porquê de cada bloqueio escrito ao lado.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, type ReactNode } from "react";
import { Plus, Lock, Unlock, Upload, Copy, ChevronDown, FileSpreadsheet, FileText, Tags, BookOpen, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Botao } from "@/components/ui/botao";
import type { useToast } from "@/hooks/use-toast";
import { eventoTemMoldeSemPrazo, AVISO_MOLDE_SEM_PRAZO } from "@shared/prazo-molde";
import { T, TOM } from "@/lib/theme";
import { MOTIVO_SOMENTE_LEITURA } from "./regras";
import type { EventoDoDetalhe, PecaDoEvento } from "./tipos";

export function AcoesDoEvento({
  event, eventId, rawItems, isMobile, canEditLists, canCloseEvent, isEventClosed, eventoFinalizado, avisoEventoFim,
  abrirEntradaDePecas, setImportDialogOpen, setCloneDialogOpen, setCloseDialogOpen, setReopenDialogOpen,
  setLocation, toast, children,
}: {
  event: EventoDoDetalhe;
  eventId: string | undefined;
  rawItems: PecaDoEvento[];
  isMobile: boolean;
  canEditLists: boolean;
  canCloseEvent: boolean;
  isEventClosed: boolean;
  eventoFinalizado: boolean;
  avisoEventoFim: string;
  abrirEntradaDePecas: () => void;
  setImportDialogOpen: (v: boolean) => void;
  setCloneDialogOpen: (v: boolean) => void;
  setCloseDialogOpen: (v: boolean) => void;
  setReopenDialogOpen: (v: boolean) => void;
  setLocation: (to: string) => void;
  toast: ReturnType<typeof useToast>["toast"];
  /** O modal de entrada de peças mora aqui, junto do botão que o abre. */
  children: ReactNode;
}) {
  // Ação escolhida no menu "Mais" que abre um diálogo — executada só quando o
  // menu termina de fechar (ver onCloseAutoFocus abaixo).
  const acaoAposMenuRef = useRef<(() => void) | null>(null);

  return (
    <div data-testid="acoes-do-evento" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', width: isMobile ? '100%' : undefined }}>
      {(() => {
        // Botões do cabeçalho: <Botao> (hover/foco/desabilitado no
        // .ds-botao); 44px no toque, a altura padrão no ponteiro.
        const tamanhoAcao = isMobile ? 'toque' as const : 'md' as const;
        // Item do menu: 44px no celular, 36 no ponteiro. O foco padrão do
        // menu pinta #f97316 com texto branco (2,8:1, reprova AA) — aqui o
        // realce é pedra clara com texto escuro.
        const itemDoMenu = "min-h-[44px] md:min-h-[36px] cursor-pointer gap-2.5 px-2.5 text-[13px] font-semibold text-stone-800 focus:bg-stone-100 focus:text-stone-900";
        const rotuloDoGrupo: React.CSSProperties = { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.second, padding: '8px 10px 4px' };
        // Diálogo aberto a partir do menu: a abertura espera o menu
        // TERMINAR de fechar (onCloseAutoFocus). Abrindo no mesmo clique,
        // o menu devolve o foco ao gatilho por cima do diálogo e as duas
        // travas de ponteiro do Radix disputam o <body>. Esperando, o foco
        // volta ao "Mais" quando o diálogo fecha — onde a pessoa estava.
        const depoisDoMenu = (acao: () => void) => () => { acaoAposMenuRef.current = acao; };

        const menuMais = (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Botao
                variante="secundario"
                tamanho={tamanhoAcao}
                icone={MoreHorizontal}
                data-testid="button-mais-acoes-evento"
                aria-label="Mais ações do evento"
                style={{ flexShrink: 0 }}
              >
                Mais
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" style={{ color: T.second }} />
              </Botao>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              style={{ minWidth: 248, padding: 6, borderRadius: 10 }}
              onCloseAutoFocus={() => {
                const acao = acaoAposMenuRef.current;
                acaoAposMenuRef.current = null;
                acao?.();
              }}
            >
              {canEditLists && (
                <>
                  {/* Item travado não recebe foco nem mostra `title`: o
                      porquê vai no rótulo do grupo, onde se lê. */}
                  <DropdownMenuLabel style={rotuloDoGrupo}>
                    {eventoFinalizado ? 'Montar a lista · evento finalizado' : 'Montar a lista'}
                  </DropdownMenuLabel>
                  {isMobile && (
                    <DropdownMenuItem
                      data-testid="button-import-xlsx"
                      disabled={eventoFinalizado}
                      onSelect={depoisDoMenu(() => setImportDialogOpen(true))}
                      className={itemDoMenu}
                    >
                      <Upload aria-hidden="true" style={{ color: TOM.sucesso.text }} />
                      Importar Excel
                    </DropdownMenuItem>
                  )}
                  {/* "Clonar Evento" prometia duplicar o EVENTO; a ação
                      copia PEÇAS de outro evento para este. */}
                  <DropdownMenuItem
                    data-testid="button-clone-event"
                    disabled={eventoFinalizado}
                    onSelect={depoisDoMenu(() => setCloneDialogOpen(true))}
                    className={itemDoMenu}
                  >
                    <Copy aria-hidden="true" style={{ color: TOM.info.text }} />
                    Clonar peças de outro evento
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuLabel style={rotuloDoGrupo}>Gerar e exportar</DropdownMenuLabel>
              {/* Gerar book — monta o PDF no padrão do exemplar manual.
                  Montar/prever é para todos; publicar é arte/admin (a
                  página e o servidor validam). */}
              <DropdownMenuItem data-testid="button-gerar-book" onSelect={() => setLocation(`/eventos/${eventId}/gerar-book`)} className={itemDoMenu}>
                <BookOpen aria-hidden="true" style={{ color: TOM.roxo.text }} />
                Gerar book
              </DropdownMenuItem>
              {/* Etiquetas — para colar no material depois da conferência. */}
              <DropdownMenuItem data-testid="button-etiquetas-evento" onSelect={() => setLocation(`/eventos/${eventId}/etiquetas`)} className={itemDoMenu}>
                <Tags aria-hidden="true" style={{ color: T.accentText }} />
                Etiquetas
              </DropdownMenuItem>
              {/* Relatório — o status report de uma página (funil,
                  atrasos, aprovações, fotos); imprime/PDF pelo navegador. */}
              <DropdownMenuItem data-testid="button-relatorio-evento" onSelect={() => setLocation(`/eventos/${eventId}/relatorio`)} className={itemDoMenu}>
                <FileText aria-hidden="true" style={{ color: T.accentText }} />
                Relatório do evento
              </DropdownMenuItem>
              {/* Exportar Excel — leitura, todos os perfis. */}
              <DropdownMenuItem
                data-testid="button-export-xlsx"
                onSelect={() => {
                  // Feedback imediato: o download demora alguns segundos e nada
                  // sinaliza que algo começou.
                  toast({ title: "Gerando Excel...", description: "O download começa em instantes.", variant: "success" });
                  // Âncora com download: não abre aba, não passa pelo bloqueador
                  // de popup. (window.open com 'noopener' retorna null POR
                  // ESPECIFICAÇÃO mesmo quando funciona — a guarda antiga
                  // toastava "bloqueado" em todo download bem-sucedido.)
                  const a = document.createElement('a');
                  a.href = `/api/events/${eventId}/export-items`;
                  a.download = '';
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                }}
                className={itemDoMenu}
              >
                <FileSpreadsheet aria-hidden="true" style={{ color: TOM.sucesso.text }} />
                Exportar Excel
              </DropdownMenuItem>
              {/* Encerrar / Reabrir — só admin (mesmo gate do servidor).
                  No fim do menu e separado: é decisão sobre o EVENTO, não
                  uma saída. O rótulo troca conforme o estado, porque é a
                  mesma decisão nas duas direções. */}
              {canCloseEvent && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    data-testid={isEventClosed ? "button-reopen-event" : "button-close-event"}
                    onSelect={depoisDoMenu(() => (isEventClosed ? setReopenDialogOpen(true) : setCloseDialogOpen(true)))}
                    className={itemDoMenu}
                  >
                    {isEventClosed
                      ? <Unlock aria-hidden="true" style={{ color: TOM.sucesso.text }} />
                      : <Lock aria-hidden="true" style={{ color: T.apoio }} />}
                    {isEventClosed ? 'Reabrir evento' : 'Encerrar evento'}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );

        return (
          <>
            {!isMobile && menuMais}

            {/* Importar Excel — só quem edita a lista; visível fora do celular. */}
            {canEditLists && !isMobile && (
              // Sem `motivo` aqui: o porquê do bloqueio já aparece VISÍVEL,
              // uma vez só, no aviso-evento-finalizado ao lado dos botões.
              <Botao
                variante="secundario"
                tamanho={tamanhoAcao}
                onClick={() => setImportDialogOpen(true)}
                data-testid="button-import-xlsx"
                disabled={eventoFinalizado}
                title={eventoFinalizado ? avisoEventoFim : undefined}
                style={{ flexShrink: 0 }}
              >
                <Upload className="h-4 w-4" aria-hidden="true" style={{ color: eventoFinalizado ? T.muted : TOM.sucesso.text }} />
                Importar Excel
              </Botao>
            )}

            {canEditLists && (
              // Primária da tela (o preto da casa, não mais o âmbar). No
              // celular ocupa a linha e o "Mais" fica ao lado: um polegar,
              // uma ação óbvia.
              <Botao
                variante="primario"
                tamanho={tamanhoAcao}
                icone={Plus}
                onClick={abrirEntradaDePecas}
                data-testid="button-add-item"
                disabled={eventoFinalizado}
                title={eventoFinalizado ? avisoEventoFim : undefined}
                style={{ flex: isMobile ? '1 1 auto' : '0 0 auto' }}
              >
                Adicionar peça
              </Botao>
            )}

            {isMobile && menuMais}
          </>
        );
      })()}

      {/* A explicação fica ao lado dos botões travados: sem ela, botões
          cinzas em sequência leem como bug de permissão. */}
      {canEditLists && eventoFinalizado && (
        <span data-testid="aviso-evento-finalizado" style={{ fontSize: 12, color: T.second, alignSelf: 'center', maxWidth: isMobile ? '100%' : 260, lineHeight: 1.4 }}>
          {avisoEventoFim}
        </span>
      )}

      {/* PRAZO DO MOLDE: aviso discreto, sem bloquear nada — o
          campo é opcional e mora no formulário do evento (Eventos). */}
      {eventoTemMoldeSemPrazo(event, rawItems) && (
        <span data-testid="aviso-molde-sem-prazo" title="Cadastre em Eventos → editar o evento → Prazo do molde (opcional). Não entra na Gestão de Prazos." style={{ fontSize: 12, color: T.second, alignSelf: 'center', lineHeight: 1.4 }}>
          {AVISO_MOLDE_SEM_PRAZO}
        </span>
      )}

      {/* Perfil sem edição: em vez de esconder tudo em silêncio, diz o porquê. */}
      {!canEditLists && (
        <span style={{ fontSize: 12, color: T.second, alignSelf: 'center' }}>
          {MOTIVO_SOMENTE_LEITURA}
        </span>
      )}

      {children}
    </div>
  );
}
