// ─────────────────────────────────────────────────────────────────────────────
// A DECISÃO DE UM PATROCINADOR no modal de revisão: o estado dele, os botões
// (aprovar, reprovar, desvincular, revogar) e o campo do motivo.
//
// OS BOTÕES SÃO OS DA CASA (29/09). Reprovar e Aprovar eram <button> com
// estilo próprio — sem hover, sem anel de foco da casa, e o desligado era um
// `opacity: 0.5` escrito à mão. Agora são <Botao>: Reprovar em
// `perigoSecundario` (vermelho de contorno: ele só ABRE o motivo) e Aprovar em
// secundário no tom de sucesso — o verde de TINTA fica para o estado
// "Aprovado", que a linha inteira vira depois da decisão.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { format } from "date-fns";
import { CheckCircle, Clock, RotateCcw, Undo2, Unlink, XCircle } from "lucide-react";
import { TextoComLinks } from "@/components/texto-com-links";
import { Botao } from "@/components/ui/botao";
import { FS, FW, R, T, TOM } from "@/lib/theme";
import { KBD, MOTIVO_MIN, approvalVisual, motivoCurto } from "./regras";
import { letra } from "./estilos";
import type { AcoesDoAtendimento } from "./use-atendimento-acoes";
import type { AlvoDePatrocinador, Patrocinador, PecaAtendimento, SponsorApproval, TamanhoDoBotao, UsuarioDaTela } from "./tipos";

export interface PropsDaLinhaDeDecisao {
  sponsor: Patrocinador;
  sponsorApprovals: SponsorApproval[];
  selectedItem: PecaAtendimento;
  user: UsuarioDaTela;
  canDecide: boolean;
  isMobile: boolean;
  dedo: boolean;
  tamBotao: TamanhoDoBotao;
  rejectingSponsorId: string | null;
  setRejectingSponsorId: Dispatch<SetStateAction<string | null>>;
  rejectionReason: string;
  setRejectionReason: Dispatch<SetStateAction<string>>;
  /** Trava de ~600 ms depois do avanço automático (ver a página). */
  pecaRecemAberta: boolean;
  decisaoTravada: () => boolean;
  setConfirmApproveIndividual: Dispatch<SetStateAction<AlvoDePatrocinador | null>>;
  setDesvincularAlvo: Dispatch<SetStateAction<AlvoDePatrocinador | null>>;
  acoes: Pick<AcoesDoAtendimento, "individualApproveMutation" | "individualRejectMutation" | "revertApprovalMutation" | "desvincularSponsorMutation">;
}

const dataCurta = (d: string | Date | null | undefined) => (d ? format(new Date(d), "dd/MM 'às' HH:mm") : null);

export function LinhaDeDecisao({
  sponsor, sponsorApprovals, selectedItem, user, canDecide, isMobile, dedo, tamBotao, rejectingSponsorId, setRejectingSponsorId,
  rejectionReason, setRejectionReason, pecaRecemAberta, decisaoTravada, setConfirmApproveIndividual, setDesvincularAlvo, acoes,
}: PropsDaLinhaDeDecisao) {
  const { individualApproveMutation, individualRejectMutation, revertApprovalMutation, desvincularSponsorMutation } = acoes;
  const approval = sponsorApprovals.find(a => a.sponsorId === sponsor.id);
  const status = approval?.status || 'pending';
  const toque = isMobile || dedo;
  // Neste modal, awaiting_arte conta como reprovado (a Arte
  // está refazendo por causa de uma reprovação).
  const v = approvalVisual(status);
  const { isApproved, isNewVersion } = v;
  const isRejected = v.isRejected || v.isAwaitingArte;
  const isPending = status === 'pending' || isNewVersion;
  const isRejectingThis = rejectingSponsorId === sponsor.id;
  // Revogar (pedido do dono, 21/08): o Atendimento desfaz a
  // decisão enquanto a peça está em aprovação ou na finalização
  // da Arte; o admin, sempre. O servidor confere o mesmo.
  const podeRevogar = user?.role === "admin"
    || (canDecide && (selectedItem.status === "awaiting_sponsor_approval" || selectedItem.status === "sponsor_approved"));

  // A cor da LINHA é o estado: verde decidido, vermelho reprovado, âmbar
  // versão nova (a bola é sua), neutro aguardando.
  const moldura = isApproved ? { bg: TOM.sucesso.bg, borda: TOM.sucesso.border }
    : isRejected ? { bg: TOM.perigo.bg, borda: TOM.perigo.border }
    : isNewVersion ? { bg: T.surface, borda: TOM.alerta.border }
    : { bg: T.surface, borda: T.border };
  const icone = isApproved
    ? { Icone: CheckCircle, fundo: TOM.sucesso.border, cor: TOM.sucesso.text }
    : isRejected
    ? { Icone: XCircle, fundo: TOM.perigo.border, cor: TOM.perigo.text }
    : isNewVersion
    ? { Icone: RotateCcw, fundo: TOM.alerta.bg, cor: TOM.alerta.text }
    : { Icone: Clock, fundo: TOM.laranja.bg, cor: T.accentText };

  return (
    <div
      className="atd-decisao"
      data-testid={`linha-decisao-${sponsor.id}`}
      style={{
        padding: toque ? '14px' : '14px 16px', borderRadius: R.lg,
        border: `1px solid ${moldura.borda}`,
        // O trilho à esquerda repete a cor do estado para o olho que varre
        // a coluna de cima a baixo.
        boxShadow: isNewVersion ? `inset 3px 0 0 ${TOM.alerta.dot}` : undefined,
        backgroundColor: moldura.bg,
      }}
    >
      {/* DUAS LINHAS (29/09, 2ª passada): em cima QUEM é e em que estado está
          — com a ação de manutenção (Desvincular, admin) ou a de desfazer
          (Revogar) encostada à direita; embaixo as DUAS decisões, lado a lado
          e de largura igual. Numa fileira só, com três botões, o nome do
          patrocinador quebrava em duas linhas e o "Desvincular" parecia um
          texto solto ao lado das decisões. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 0%' }}>
          <div aria-hidden="true" style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            backgroundColor: icone.fundo,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: isPending && !isNewVersion ? `1px solid ${TOM.laranja.border}` : 'none',
          }}>
            <icone.Icone style={{ width: 15, height: 15, color: icone.cor }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: letra(FS.read, toque), fontWeight: FW.forte, color: T.text, margin: 0, overflowWrap: 'anywhere' }}>{sponsor.name}</p>
            {/* Cores de `approvalVisual`, a fonte da tela. */}
            <p style={{
              fontSize: letra(FS.meta, toque), margin: '2px 0 0', fontWeight: FW.forte,
              color: isApproved ? TOM.sucesso.text : isRejected ? TOM.perigo.text : isNewVersion ? TOM.alerta.text : TOM.alerta.text,
            }}>
              {isApproved ? 'Aprovado' : isRejected ? 'Reprovado' : isNewVersion ? 'Nova versão para decidir' : 'Aguardando decisão'}
            </p>
          </div>
        </div>

        {/* DESVINCULAR (25/08, admin): a marca não é desta peça — sai, e a
            pendência dele deixa de contar. Se era o único que faltava, a
            peça segue. Ação TERCIÁRIA e destrutiva: fantasma em vermelho,
            com ícone, longe das decisões — e a mesma confirmação de antes. */}
        {isPending && !isRejectingThis && user?.role === "admin" && (
          <Botao
            variante="fantasma"
            tom="perigo"
            tamanho={dedo ? "toque" : "sm"}
            icone={Unlink}
            onClick={() => setDesvincularAlvo({ itemId: selectedItem.id, sponsorId: sponsor.id, sponsorName: sponsor.name || "Patrocinador" })}
            disabled={desvincularSponsorMutation.isPending}
            title="Desvincular este patrocinador da peça — a aprovação pendente dele deixa de contar (admin)"
            aria-label={`Desvincular ${sponsor.name}`}
            data-testid={`button-desvincular-sponsor-${sponsor.id}`}
            style={{ flexShrink: 0 }}
          >
            Desvincular
          </Botao>
        )}

        {/* Revogar a aprovação / reverter a reprovação: volta a
            aguardar decisão. Se a peça já estava "aprovada por
            todos", ela volta para a aprovação e a Arte é avisada. */}
        {!isPending && !isRejectingThis && podeRevogar && (
          <Botao
            variante="secundario"
            tamanho={tamBotao}
            icone={Undo2}
            carregando={revertApprovalMutation.isPending}
            onClick={() => revertApprovalMutation.mutate({ itemId: selectedItem.id, sponsorId: sponsor.id })}
            title={`${isApproved ? 'Revogar a aprovação' : 'Reverter a reprovação'} — volta a aguardar decisão${selectedItem.status === 'sponsor_approved' ? '; a peça volta para a aprovação e a Arte é avisada' : ''}`}
            data-testid={`button-revert-approval-${sponsor.id}`}
            style={{ flexShrink: 0 }}
          >
            {isApproved ? 'Revogar' : 'Reverter'}
          </Botao>
        )}
      </div>

      {isPending && !isRejectingThis && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Botao
            variante="perigoSecundario"
            tamanho={tamBotao}
            onClick={() => { if (!decisaoTravada()) setRejectingSponsorId(sponsor.id); }}
            disabled={individualRejectMutation.isPending || !canDecide || pecaRecemAberta}
            // "Reprovar faz o quê?" antes do clique (rodada 4).
            title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : `Abre o campo do motivo. A Arte refaz a arte por causa de ${sponsor.name}; os patrocinadores com aprovação estrita também esperam a nova versão, e os demais pendentes seguem podendo aprovar.`}
            aria-label={`Reprovar para ${sponsor.name}`}
            data-testid={`button-reject-sponsor-${sponsor.id}`}
            style={{ flex: '1 1 0%' }}
          >
            Reprovar
          </Botao>
          <Botao
            variante="secundario"
            tom="sucesso"
            tamanho={tamBotao}
            icone={CheckCircle}
            carregando={individualApproveMutation.isPending}
            onClick={() => { if (!decisaoTravada()) setConfirmApproveIndividual({ itemId: selectedItem.id, sponsorId: sponsor.id, sponsorName: sponsor.name || 'Patrocinador' }); }}
            disabled={individualApproveMutation.isPending || !canDecide || pecaRecemAberta}
            title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : `Registra a aprovação de ${sponsor.name} (dá para revogar depois)`}
            data-testid={`button-approve-sponsor-${sponsor.id}`}
            aria-label={`Aprovar para ${sponsor.name}`}
            style={{ flex: '1 1 0%', backgroundColor: TOM.sucesso.bg }}
          >
            Aprovar
          </Botao>
        </div>
      )}
      {isRejectingThis && <div style={{ height: 12 }} />}

      {/* A VERSÃO NOVA, COM A MEMÓRIA DA ANTERIOR (29/09). A linha dizia só
          "Nova versão para decidir" — e quem apresenta a arte nova ao
          patrocinador precisa lembrar O QUE ele tinha pedido (para conferir
          se a correção atende) ou que ele já tinha aprovado a anterior. Os
          dois dados já vinham na aprovação; só não eram mostrados. */}
      {isNewVersion && !isRejectingThis && (approval?.rejectionReason || approval?.approvedAt) && (
        <div data-testid={`contexto-versao-nova-${sponsor.id}`} style={{ marginTop: 12, padding: '10px 12px', backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: R.md, fontSize: letra(FS.meta + 0.5, toque), color: T.strong, lineHeight: 1.5 }}>
          {approval?.rejectionReason ? (
            <>
              <span style={{ display: 'block', fontSize: letra(FS.small, toque), fontWeight: FW.rotulo, letterSpacing: '0.06em', textTransform: 'uppercase', color: TOM.alerta.text, marginBottom: 3 }}>
                Pedido na reprovação anterior{approval.rejectedAt ? ` · ${dataCurta(approval.rejectedAt)}` : ''}
              </span>
              <span style={{ fontStyle: 'italic' }}>“<TextoComLinks texto={approval.rejectionReason} />”</span>
            </>
          ) : (
            <>Tinha aprovado a versão anterior{approval?.approvedAt ? ` em ${dataCurta(approval.approvedAt)}` : ''}{approval?.approvedBy ? ` (${approval.approvedBy})` : ''}.</>
          )}
        </div>
      )}

      {/* AVISO (dono, 31/08): a Arte está REFAZENDO por esta
          reprovação — quem reprovou só volta a decidir quando
          a nova arte chegar; os DEMAIS aprovam normalmente.
          Largura total, fora do cabeçalho flex. */}
      {v.isAwaitingArte && (
        <div data-testid={`aviso-refazendo-${sponsor.id}`} style={{ marginTop: 12, padding: '10px 12px', background: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderLeft: `3px solid ${TOM.alerta.dot}`, borderRadius: R.md, fontSize: letra(12.5, toque), color: TOM.alerta.text, lineHeight: 1.55 }}>
          A <strong>Arte está refazendo uma nova versão</strong> por causa da reprovação de <strong>{sponsor.name}</strong>{approval?.rejectionReason ? <>: <em>“{approval.rejectionReason}”</em></> : null}. Ele só volta a decidir quando a nova arte chegar — os demais patrocinadores seguem aprovando normalmente.
        </div>
      )}
      {/* Motivo de reprovação existente (o aviso acima já o
          cita quando a linha está com a Arte) */}
      {isRejected && !v.isAwaitingArte && approval?.rejectionReason && (
        <div style={{ marginTop: 12, padding: '10px 12px', backgroundColor: T.surface, borderRadius: R.md, border: `1px solid ${TOM.perigo.border}`, borderLeft: `3px solid ${TOM.perigo.text}` }}>
          <p style={{ fontSize: letra(FS.small, toque), fontWeight: FW.forte, textTransform: 'uppercase', letterSpacing: '0.06em', color: TOM.perigo.text, margin: '0 0 4px' }}>Motivo</p>
          <p style={{ fontSize: letra(FS.body, toque), fontStyle: 'italic', color: T.apoio, margin: 0, lineHeight: 1.5 }}>
            "<TextoComLinks texto={approval.rejectionReason} />"
          </p>
        </div>
      )}

      {/* Formulário de reprovação inline */}
      {isRejectingThis && (
        <div className="atd-entrar" style={{ marginTop: 4 }}>
          <label htmlFor={`motivo-${sponsor.id}`} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: letra(FS.small, toque), fontWeight: FW.rotulo, textTransform: 'uppercase', letterSpacing: '0.06em', color: TOM.perigo.text }}>Motivo da reprovação</span>
            <span aria-hidden="true" style={{ fontSize: letra(FS.small, toque), color: TOM.perigo.text, fontWeight: FW.forte, lineHeight: 1 }}>*</span>
          </label>
          {/* O EFEITO, antes de escrever (rodada 4): a dúvida
              "reprovar trava a peça inteira?" segurava o
              clique. Não trava — só esta marca espera a
              nova arte. */}
          <p style={{ margin: '0 0 8px', fontSize: letra(FS.meta, toque), color: T.apoio, lineHeight: 1.5 }}>
            A Arte recebe este motivo e refaz a arte. {sponsor.name} e os patrocinadores com aprovação estrita (que perdem a aprovação já dada) esperam a nova versão; os demais pendentes seguem podendo aprovar.
          </p>

          {/* autoFocus: "Reprovar" abre este campo para ESCREVER — sem o
              foco, era um segundo clique obrigatório em toda reprovação.
              Ctrl+Enter confirma pela MESMA trava do botão abaixo. O anel
              de foco é o da casa (sem o onFocus/onBlur que pintava a borda
              à mão). */}
          <textarea
            id={`motivo-${sponsor.id}`}
            autoFocus
            value={rejectionReason}
            onChange={e => setRejectionReason(e.target.value)}
            onKeyDown={e => {
              if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
              e.preventDefault();
              if (individualRejectMutation.isPending || motivoCurto(rejectionReason)) return;
              individualRejectMutation.mutate({ itemId: selectedItem.id, sponsorId: sponsor.id, reason: rejectionReason });
            }}
            placeholder="Descreva o problema para a equipe de Arte..."
            rows={3}
            data-testid={`textarea-reject-reason-${sponsor.id}`}
            style={{
              display: 'block', width: '100%', boxSizing: 'border-box', minHeight: 88,
              padding: '10px 12px', fontSize: isMobile ? FS.lead : FS.body,
              fontFamily: 'inherit', color: T.text,
              backgroundColor: T.surface,
              border: `1px solid ${rejectionReason.trim() ? TOM.perigo.text : T.bdark}`,
              borderRadius: R.md, resize: 'vertical', lineHeight: 1.5,
              boxShadow: 'inset 0 1px 2px rgba(28,25,23,.04)',
              transition: 'border-color var(--dur-rapida) ease',
            }}
            aria-label={`Motivo da reprovação de ${sponsor.name}`}
            aria-required="true"
            aria-describedby={motivoCurto(rejectionReason) ? `falta-motivo-${sponsor.id}` : undefined}
          />
          {/* A régua de 10 caracteres, à vista — o mesmo que o "Devolver"
              da Arte já faz. */}
          {motivoCurto(rejectionReason) ? (
            <p id={`falta-motivo-${sponsor.id}`} style={{ margin: '6px 0 0', fontSize: letra(11.5, toque), color: T.second }}>
              {rejectionReason.trim()
                ? `Faltam ${Math.max(0, MOTIVO_MIN - rejectionReason.trim().replace(/\s+/g, " ").length)} caracteres — a Arte precisa saber o que refazer.`
                : `Mínimo de ${MOTIVO_MIN} caracteres — a Arte precisa saber o que refazer.`}
            </p>
          ) : (
            <p style={{ margin: '6px 0 0', fontSize: letra(11.5, toque), color: T.apoio }}>
              Pronto.{isMobile ? null : <> <kbd style={KBD}>Ctrl</kbd>+<kbd style={KBD}>Enter</kbd> confirma.</>}
            </p>
          )}

          {/* Botões — a ação à direita (e em cima, no celular). */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexDirection: isMobile ? 'column-reverse' : 'row' }}>
            <Botao
              variante="secundario"
              tamanho={tamBotao}
              onClick={() => { setRejectingSponsorId(null); setRejectionReason(""); }}
              style={{ flex: isMobile ? undefined : '1 1 0%' }}
              larguraCheia={isMobile}
            >
              Cancelar
            </Botao>
            {/* Travado pela MESMA régua do Ctrl+Enter (motivoCurto); o
                quanto falta está escrito logo acima do botão. */}
            <Botao
              variante="perigo"
              tamanho={tamBotao}
              icone={XCircle}
              carregando={individualRejectMutation.isPending}
              onClick={() => individualRejectMutation.mutate({ itemId: selectedItem.id, sponsorId: sponsor.id, reason: rejectionReason })}
              disabled={motivoCurto(rejectionReason)}
              title={motivoCurto(rejectionReason) ? `Explique em pelo menos ${MOTIVO_MIN} caracteres — a Arte precisa saber o que refazer.` : undefined}
              data-testid={`button-confirm-reject-${sponsor.id}`}
              style={{ flex: isMobile ? undefined : '2 1 0%' }}
              larguraCheia={isMobile}
            >
              {individualRejectMutation.isPending ? 'Registrando…' : 'Reprovar e devolver à Arte'}
            </Botao>
          </div>
        </div>
      )}
    </div>
  );
}
