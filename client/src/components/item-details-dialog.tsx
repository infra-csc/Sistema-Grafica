// ─────────────────────────────────────────────────────────────────────────────
// A FICHA DA PEÇA — aberta pela Arte, Gráfica, Máquinas, Vincular, Painel Geral
// e Detalhe do Evento.
//
// Este arquivo é a COMPOSIÇÃO: o esqueleto do modal (cabeçalho, faixa, miolo
// que rola, rodapé) e o estado que as partes compartilham. Cada seção, o
// diálogo de transferência, as leituras, as correções e as regras puras moram
// em components/ficha-da-peca/.
// ─────────────────────────────────────────────────────────────────────────────
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { T, FONT, FS } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { CabecalhoDaFicha } from "@/components/ficha-da-peca/cabecalho";
import { FaixaDeResolucao } from "@/components/ficha-da-peca/faixa-de-resolucao";
import { SecaoEspecificacao } from "@/components/ficha-da-peca/secao-especificacao";
import { SecaoPatrocinadores } from "@/components/ficha-da-peca/secao-patrocinadores";
import { SecaoPercurso } from "@/components/ficha-da-peca/secao-percurso";
import { SecaoArte } from "@/components/ficha-da-peca/secao-arte";
import { SecaoArquivos } from "@/components/ficha-da-peca/secao-arquivos";
import { SecaoRegistrosDaGrafica } from "@/components/ficha-da-peca/secao-registros-grafica";
import { DialogoTransferirEvento } from "@/components/ficha-da-peca/dialogo-transferir-evento";
import { useFichaDados } from "@/components/ficha-da-peca/use-ficha-dados";
import { useFichaAcoes } from "@/components/ficha-da-peca/use-ficha-acoes";
import { montarPercurso } from "@/components/ficha-da-peca/regras-do-percurso";
import { resolverFaixa } from "@/components/ficha-da-peca/regras-da-faixa";
import type { CampoEditavel, ItemDaFicha, RegistroDaFicha } from "@/components/ficha-da-peca/tipos";

export type { ItemDaFicha, RegistroDaFicha } from "@/components/ficha-da-peca/tipos";

// Genérico na peça: cada tela passa o SEU tipo de peça, e o `onEditSave`
// devolve a peça editada nesse mesmo tipo.
interface ItemDetailsDialogProps<TPeca extends ItemDaFicha> {
  item: TPeca | null;
  auditLogs?: readonly RegistroDaFicha[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customActions?: React.ReactNode;
  topActions?: React.ReactNode;
  /**
   * A AÇÃO DA FASE no rodapé fixo (aditivo, 24/09). Quem abre a ficha para
   * agir (a Arte enviando o arquivo final, no celular) não pode depender de
   * rolar o corpo para achar o botão: com ela, o rodapé mostra a ação ao lado
   * de "Fechar", que passa a secundário. Sem ela, o rodapé é o de sempre.
   */
  acaoNoRodape?: React.ReactNode;
  onEditSave?: (editedItem: TPeca) => void;
}

export function ItemDetailsDialog<TPeca extends ItemDaFicha>({
  item, auditLogs = [], open, onOpenChange,
  customActions, topActions, onEditSave, acaoNoRodape,
}: ItemDetailsDialogProps<TPeca>) {
  const [editMode, setEditMode]     = useState(false);
  const [editedItem, setEditedItem] = useState<TPeca | null>(item);
  const isMobile = useIsMobile();
  // O percurso abre com os 4 mais recentes. Uma peça que foi e voltou três
  // vezes tem trinta registros, e a ficha inteira virava a trilha dela.
  const [percursoAberto, setPercursoAberto] = useState(false);

  const { fetchedApprovals, approvalsOverride, setApprovalsOverride, refetchApprovals, flowPhotos } = useFichaDados(item, open);
  const acoes = useFichaAcoes({ item, onOpenChange, refetchApprovals });

  useEffect(() => {
    setApprovalsOverride(null);
    // Sem este reset, editMode/editedItem sobreviviam entre aberturas: o
    // Salvar da ficha usava o id da peça ANTERIOR.
    setEditMode(false);
    setEditedItem(item);
    setPercursoAberto(false);
  }, [open, item?.id]);

  if (!item) return null;

  const approvalsList = approvalsOverride ?? item.sponsorApprovals ?? fetchedApprovals;

  // Junta as fotos da galeria com os campos antigos do item (uma foto só), sem
  // repetir a mesma URL duas vezes.
  // Registros antigos guardaram a URL assinada do GCS, que não abre depois de o
  // token expirar; converter para /objects/... resolve os dois casos.
  const photosOfKind = (kind: string, legacyUrl?: string | null) => {
    const urls = flowPhotos
      .filter(p => (p.kind ?? "delivery") === kind)
      .map(p => convertGCSUrlToLocalPath(p.photoUrl));
    if (legacyUrl) {
      const converted = convertGCSUrlToLocalPath(legacyUrl);
      if (!urls.includes(converted)) urls.unshift(converted);
    }
    return urls;
  };
  const conferencePhotos = photosOfKind("conference", item.conferencePhotoUrl);
  const deliveryPhotos   = photosOfKind("delivery", item.deliveryPhotoUrl);

  const rawStatus = (item.status || "").trim();

  const handleEditChange = (field: CampoEditavel, value: string) =>
    setEditedItem((p) => (p ? { ...p, [field]: value } : p));
  const handleSave = () => { if (editedItem) onEditSave?.(editedItem); setEditMode(false); };

  const { eventosPercurso, createdBy } = montarPercurso(item, auditLogs);
  const { linhasPatrocinador, patrocinadoresOrdenados, aprovados, bloqueio, vezDeQuem } =
    resolverFaixa({ item, rawStatus, approvalsList, eventosPercurso });

  // ── ESTA FICHA NÃO AGE, SÓ CONTA ──────────────────────────────────────────
  //
  // Decisão do dono (20/08): nada de atalhos aqui — só os dados. A ficha abre
  // em cinco telas, cada uma com o seu próprio conjunto de permissões e de
  // ações; um botão que resolve na Arte é um botão que dá 403 na Gráfica. A
  // faixa de resolução continua dizendo O QUE falta e QUEM precisa agir, que é
  // dado, não ação — quem age vai à tela onde a ação vive.
  //
  // O que sobrou de clicável é leitura ou correção do próprio dado: abrir um
  // arquivo, ampliar uma foto, editar a especificação e reverter uma aprovação
  // lançada por engano (admin).
  const ALVO = isMobile ? 44 : 36;   // alvo de toque / de ponteiro

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`max-w-6xl p-0 gap-0 ${HIDE_NATIVE_CLOSE}`}
        /* O TETO E O SCROLL.
           Antes o DialogContent inteiro era o scroller (`max-h-[90vh]
           overflow-y-auto`): rolar a ficha levava embora o cabeçalho, o status
           e o prazo — exatamente o que se quer manter à vista enquanto se lê o
           resto. Agora ele é coluna flex e SÓ o miolo rola; cabeçalho, faixa e
           rodapé são `flexShrink: 0`.
           `dvh` no mobile: `vh` conta a barra do navegador que se esconde, e o
           rodapé ficava embaixo dela. */
        style={{
          backgroundColor: T.bg, borderRadius: 16,
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.3)",
          maxHeight: isMobile ? "calc(100dvh - 24px)" : "calc(100vh - 48px)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* Sem DialogTitle o Radix anuncia um diálogo sem nome (e reclama no
            console). O cabeçalho visual já mostra a peça, então o título fica
            só para leitor de tela — e é ele que o Radix aponta em
            aria-labelledby. Este componente abre em cinco telas, então a falta
            valia por cinco. */}
        <DialogTitle className="sr-only">
          {item?.displayId ? `Peça ${item.displayId} — ${item.description || item.type || ""}` : "Detalhes da peça"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {bloqueio.frase}{vezDeQuem ? ` ${vezDeQuem}` : ""}
        </DialogDescription>

        <CabecalhoDaFicha
          item={item}
          isMobile={isMobile}
          onTransferir={() => acoes.setTransferOpen(true)}
          onOpenChange={onOpenChange}
        />

        <FaixaDeResolucao
          bloqueio={bloqueio}
          vezDeQuem={vezDeQuem}
          rawStatus={rawStatus}
          isMobile={isMobile}
          descancelando={acoes.descancelando}
          handleUncancel={acoes.handleUncancel}
        />

        {/* ══════════════════════════════════════════════════════════════════
            MIOLO — a única parte que rola.
        ══════════════════════════════════════════════════════════════════ */}
        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", backgroundColor: T.bg }}>

          {/* O bloco de trabalho que a tela hospedeira mandou (a finalização de
              layout, na Arte) abre o miolo: é a tarefa por que a ficha foi
              aberta, e ficava depois de tudo. */}
          {topActions && (
            <div style={{ padding: isMobile ? "16px 16px 0" : "20px 32px 0" }}>{topActions}</div>
          )}

          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "6fr 4fr",
            gap: isMobile ? 20 : 24,
            padding: isMobile ? "16px" : "20px 32px",
            alignItems: "start",
          }}>

            {/* ═══ COLUNA ESQUERDA ═══ */}
            <div style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
              <SecaoEspecificacao
                item={item}
                editedItem={editedItem}
                isMobile={isMobile}
                editMode={editMode}
                podeEditar={!!onEditSave}
                createdBy={createdBy}
                rawStatus={rawStatus}
                onEditar={() => { setEditedItem(item); setEditMode(true); }}
                onCancelarEdicao={() => setEditMode(false)}
                handleEditChange={handleEditChange}
                handleSave={handleSave}
              />

              {linhasPatrocinador.length > 0 && (
                <SecaoPatrocinadores
                  linhasPatrocinador={linhasPatrocinador}
                  patrocinadoresOrdenados={patrocinadoresOrdenados}
                  aprovados={aprovados}
                  rawStatus={rawStatus}
                  ALVO={ALVO}
                  revertingSponsorId={acoes.revertingSponsorId}
                  handleRevertApproval={acoes.handleRevertApproval}
                />
              )}

              <SecaoPercurso
                item={item}
                eventosPercurso={eventosPercurso}
                percursoAberto={percursoAberto}
                setPercursoAberto={setPercursoAberto}
                ALVO={ALVO}
              />
            </div>

            {/* ═══ COLUNA DIREITA ═══ */}
            <div style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
              <SecaoArte item={item} conferencePhotos={conferencePhotos} />
              <SecaoArquivos item={item} ALVO={ALVO} />
              <SecaoRegistrosDaGrafica
                item={item}
                rawStatus={rawStatus}
                conferencePhotos={conferencePhotos}
                deliveryPhotos={deliveryPhotos}
              />
            </div>
          </div>

          {customActions && (
            <div style={{ padding: isMobile ? "0 16px 16px" : "0 32px 20px" }}>{customActions}</div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            RODAPÉ
        ══════════════════════════════════════════════════════════════════ */}
        <footer style={{
          flexShrink: 0, padding: isMobile ? "12px 16px" : "14px 32px",
          borderTop: `1px solid ${T.border}`,
          /* Branco, e não o #f5f4f1 de antes: sobre ele o #78716c da linha
             "Atualizado" dá 4,36 e reprova em 11px. Sobre branco, 4,80. */
          backgroundColor: T.surface,
          display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: acaoNoRodape && isMobile ? 8 : 12,
          ...(isMobile ? { paddingBottom: "calc(12px + env(safe-area-inset-bottom))" } : null),
        }}>
          <span data-testid="rodape-atualizado" style={{ fontFamily: FONT.corpo, fontSize: 12, color: T.second }}>
            {item.updatedAt
              ? `Atualizado ${format(new Date(item.updatedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
              : item.displayId}
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: acaoNoRodape && isMobile ? "nowrap" : "wrap", flex: acaoNoRodape && isMobile ? "1 1 100%" : undefined }}>
            <Botao
              variante={acaoNoRodape ? "secundario" : "primario"}
              tamanho="toque"
              onClick={() => onOpenChange(false)}
              data-testid="button-fechar-rodape"
              style={{ padding: acaoNoRodape && isMobile ? "0 16px" : "0 24px", fontSize: FS.body, flexShrink: 0 }}
            >
              Fechar
            </Botao>
            {acaoNoRodape && <div style={{ flex: isMobile ? "1 1 0" : undefined, minWidth: 0, display: "flex" }}>{acaoNoRodape}</div>}
          </div>
        </footer>
      </DialogContent>

      <DialogoTransferirEvento
        item={item}
        transferOpen={acoes.transferOpen}
        setTransferOpen={acoes.setTransferOpen}
        transferDestino={acoes.transferDestino}
        setTransferDestino={acoes.setTransferDestino}
        transferindo={acoes.transferindo}
        todosEventos={acoes.todosEventos}
        eventosCarregando={acoes.eventosCarregando}
        handleTransferEvent={acoes.handleTransferEvent}
      />
    </Dialog>
  );
}
