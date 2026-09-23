// A BARRA FLUTUANTE DOS MODOS EM LOTE (conferir ou embalar): selecionar
// todas, o modo com o contador, o próximo passo (foto ou tubo) e sair.
import { Camera, Package, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { alvo as alvoDeToque } from "@/hooks/use-mobile";
import { FONT, FS, FW, R, T, TOM } from "@/lib/theme";
import type { SelecaoEmLote } from "@/components/grafica/hooks/use-selecao-em-lote";

export function BarraDoLote({ lote, isMobile, ponteiroGrosso, usaCards }: {
  lote: SelecaoEmLote;
  isMobile: boolean;
  ponteiroGrosso: boolean;
  usaCards: boolean;
}) {
  const { toast } = useToast();
  const {
    bulkOn, bulkConferMode, bulkPackMode, bulkSelectedIds, setBulkSelectedIds, bulkEligibleList, allDeliverableSelected,
    bulkConfirmRef, setBulkConferOpen, eventosDoLote, abrirEmbalar, bulkSelectedItems, sairDoLote,
  } = lote;
  if (!bulkOn) return null;
  return (
    <div
      role="toolbar"
      aria-label={bulkConferMode ? "Ações da conferência em lote" : bulkPackMode ? "Ações do embalar em lote" : "Ações da entrega em lote"}
      style={{
        // A barra ancora na COLUNA DE CONTEÚDO. Com left:0 e zIndex 50 ela
        // passava por cima da sidebar (fixed, z-10) e cobria a navegação e o
        // bloco de usuário/Sair enquanto o operador montava o lote. No
        // celular a sidebar não é fixa, então ali continua colada na borda.
        position: 'fixed', bottom: 0, left: isMobile ? 0 : 'var(--sidebar-width, 16rem)', right: 0, zIndex: 50,
        background: T.text,
        // LONGOS: o atalho com env() some no parser do jsdom (ver o teste
        // grafica-celular). O valor no navegador é o mesmo de antes.
        paddingTop: isMobile ? 10 : 12, paddingLeft: isMobile ? 12 : 16, paddingRight: isMobile ? 12 : 16,
        paddingBottom: isMobile ? 'calc(10px + env(safe-area-inset-bottom))' : 'calc(12px + env(safe-area-inset-bottom))',
        // CELULAR EM DUAS LINHAS: em 360px os quatro itens numa linha
        // deixavam ~20px para o bloco "Conferência · 3 de 40" — o contador
        // sumia. Linha 1: modo + contador e o X; linha 2: Todas e o
        // "Continuar para a foto (N)" largo, na zona do polegar.
        display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 10, flexWrap: isMobile ? 'wrap' : 'nowrap',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.28)',
      }}>
      {/* Selecionar tudo / desmarcar */}
      <button
        onClick={() => allDeliverableSelected
          ? setBulkSelectedIds(new Set())
          : setBulkSelectedIds(new Set(bulkEligibleList.map((i) => i.id)))
        }
        // "Sel. 12" era abreviação de planilha; o botão agora diz a ação por
        // extenso e tem alvo de dedo (44px) no celular.
        aria-label={allDeliverableSelected ? 'Desmarcar todas as peças' : `Selecionar todas as ${bulkEligibleList.length} peças elegíveis`}
        // A barra é ESCURA: os botões dela ficam locais (o Botao é pele de
        // fundo claro), mas com a classe .ds-botao — hover e foco da casa.
        className="ds-botao"
        style={{ order: isMobile ? 2 : undefined, minHeight: isMobile ? 48 : alvoDeToque(36, ponteiroGrosso), padding: isMobile ? '0 10px' : '0 12px', borderRadius: R.md, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)', fontSize: isMobile ? FS.read : FS.body, fontWeight: FW.forte, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
      >
        {/* "Sel. 1" lia como "1 selecionada" com nada selecionado — o
            operador achava que o Confirmar estava quebrado (dono, 14/09).
            No celular a barra é estreita: "Todas (N)" diz o mesmo. */}
        {allDeliverableSelected ? 'Desmarcar' : isMobile ? `Todas (${bulkEligibleList.length})` : `Selecionar todas (${bulkEligibleList.length})`}
      </button>

      {/* Modo + contador. O MODO morava num selo do cabeçalho ("Modo
          conferência em lote ativo"), lá em cima, longe da barra onde a
          pessoa age — e sumido da vista assim que rolava a lista. Agora é o
          rótulo da própria barra, na cor da etapa (bolinha, não texto).
          aria-live só no contador: anuncia a contagem a cada seleção. */}
      {/* Celular: base "100% − X − espaço" força a quebra — esta linha é
          só modo + contador e o X; os botões descem para a de baixo. */}
      <span style={{ order: isMobile ? 0 : undefined, flex: isMobile ? '1 1 calc(100% - 52px)' : 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: isMobile ? FS.meta : FS.small, fontWeight: FW.rotulo, color: 'rgba(255,255,255,0.78)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, backgroundColor: bulkConferMode ? TOM.ciano.dot : bulkPackMode ? TOM.info.dot : T.accent }} />
          {bulkConferMode ? 'Conferência em lote' : bulkPackMode ? 'Embalar em lote' : 'Entrega em lote'}
        </span>
        <span aria-live="polite" style={{ color: bulkSelectedIds.size > 0 ? T.surface : 'rgba(255,255,255,0.78)', fontSize: isMobile ? FS.read : FS.body, fontWeight: FW.forte, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {bulkSelectedIds.size > 0
            ? (isMobile
              ? `${bulkSelectedIds.size} de ${bulkEligibleList.length} marcada${bulkSelectedIds.size !== 1 ? 's' : ''}`
              : `${bulkSelectedIds.size} peça${bulkSelectedIds.size !== 1 ? 's' : ''} selecionada${bulkSelectedIds.size !== 1 ? 's' : ''}`)
            : isMobile ? 'Toque nas peças para marcar'
            // Conferência em lote: diz QUAIS peças tocar (as em acabamento);
            // embalar em lote: as conferidas.
            : bulkConferMode
              ? (usaCards ? 'Toque nas peças em acabamento para conferir' : 'Clique nas linhas em acabamento para conferir')
              : bulkPackMode
                ? (usaCards ? 'Toque nas peças conferidas para embalar' : 'Clique nas linhas conferidas para embalar')
                : (usaCards ? 'Toque nas peças para selecionar' : 'Clique nas linhas para selecionar')}
          {isMobile && bulkSelectedIds.size > 0 && <span className="sr-only"> peças</span>}
        </span>
      </span>

      {/* Confirmar — aria-disabled (não disabled) para poder receber o foco
          ao entrar no modo; o onClick já ignora o clique sem seleção. */}
      {/* "Confirmar" aqui NÃO registrava nada — abria a foto. Quem tocava
          achava que já tinha conferido e saía. O rótulo agora diz o
          próximo passo, e o toque sem seleção responde em vez de calar. */}
      <button
        ref={bulkConfirmRef}
        onClick={() => {
          if (bulkSelectedIds.size === 0) {
            toast({ title: "Nenhuma peça marcada", description: `${usaCards ? "Toque nas peças" : "Clique nas linhas"} (ou em Todas) para escolher o que ${bulkConferMode ? "conferir" : "embalar"}.`, variant: "warning" });
            return;
          }
          if (bulkConferMode) { setBulkConferOpen(true); return; }
          // Embalar em lote: um tubo pertence a um evento — com peças de
          // vários eventos marcadas, avisa em vez de abrir o painel.
          if (eventosDoLote.length > 1) {
            toast({ title: "Marque peças de um evento só", description: `Um tubo pertence a um evento. Há peças de ${eventosDoLote.length} eventos marcadas (${eventosDoLote.map((e) => e.nome).join(", ")}).`, variant: "warning" });
            return;
          }
          abrirEmbalar(bulkSelectedItems, true);
        }}
        aria-disabled={bulkSelectedIds.size === 0}
        data-testid="button-bulk-continuar"
        className="ds-botao"
        title={bulkSelectedIds.size > 0 ? (bulkPackMode ? "Abre a escolha do tubo — nada é registrado antes disso" : "Abre a foto e a confirmação — nada é registrado antes disso") : "Marque ao menos uma peça"}
        style={{
          order: isMobile ? 3 : undefined, flex: isMobile ? '1 1 0' : undefined, minWidth: 0, justifyContent: 'center',
          minHeight: isMobile ? 48 : 44, padding: isMobile ? '0 12px' : '0 18px', borderRadius: R.md, border: 'none', flexShrink: 0,
          background: bulkSelectedIds.size === 0 ? 'rgba(255,255,255,0.15)' : bulkConferMode ? TOM.ciano.text : bulkPackMode ? TOM.info.text : T.accentText,
          // 0.35 de branco sumia no preto; 0.6 ainda lê "inativo" e se lê.
          color: bulkSelectedIds.size === 0 ? 'rgba(255,255,255,0.6)' : T.surface,
          fontSize: FS.body, fontWeight: FW.rotulo, fontFamily: FONT.corpo,
          cursor: bulkSelectedIds.size === 0 ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 7,
          boxShadow: bulkSelectedIds.size > 0 ? (bulkConferMode ? '0 4px 16px rgba(14,116,144,0.4)' : bulkPackMode ? '0 4px 16px rgba(29,78,216,0.4)' : '0 4px 16px rgba(194,65,12,0.4)') : 'none',
          transition: 'all 0.15s',
        }}
      >
        {bulkPackMode
          ? <Package aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0 }} />
          : <Camera aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0 }} />}
        {/* O rótulo inteiro também no celular: "Continuar" sozinho não
            dizia que o próximo passo é a FOTO (nada é gravado ainda). No
            embalar, o próximo passo é escolher o TUBO. */}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: isMobile ? 14 : undefined }}>
          {bulkPackMode ? "Escolher o tubo" : "Continuar para a foto"}{bulkSelectedIds.size > 0 && ` (${bulkSelectedIds.size})`}
        </span>
      </button>

      {/* Cancelar modo — o rótulo responde "perco alguma coisa?": só a
          seleção e a foto ainda não enviada; nada foi registrado. */}
      <button
        onClick={sairDoLote}
        aria-label="Sair do modo lote sem registrar"
        title="Sair do lote (Esc) — desmarca as peças; nada é registrado"
        className="ds-botao"
        style={{ order: isMobile ? 1 : undefined, width: isMobile ? 44 : alvoDeToque(36, ponteiroGrosso), height: isMobile ? 44 : alvoDeToque(36, ponteiroGrosso), borderRadius: R.md, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
      >
        <X style={{ width: 16, height: 16 }} />
      </button>
    </div>
  );
}
