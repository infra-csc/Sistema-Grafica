// ─────────────────────────────────────────────────────────────────────────────
// A DECISÃO DE UM PATROCINADOR no modal de revisão: o estado dele, os botões
// (aprovar, reprovar, desvincular, revogar) e o campo do motivo.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { CheckCircle, Clock, Loader2, Undo2, XCircle } from "lucide-react";
import { TextoComLinks } from "@/components/texto-com-links";
import { Botao } from "@/components/ui/botao";
import { alvo } from "@/hooks/use-mobile";
import { FS, T, TOM } from "@/lib/theme";
import { KBD, MOTIVO_MIN, approvalVisual, motivoCurto } from "./regras";
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

export function LinhaDeDecisao({
  sponsor, sponsorApprovals, selectedItem, user, canDecide, isMobile, dedo, tamBotao, rejectingSponsorId, setRejectingSponsorId,
  rejectionReason, setRejectionReason, pecaRecemAberta, decisaoTravada, setConfirmApproveIndividual, setDesvincularAlvo, acoes,
}: PropsDaLinhaDeDecisao) {
  const { individualApproveMutation, individualRejectMutation, revertApprovalMutation, desvincularSponsorMutation } = acoes;
  const approval = sponsorApprovals.find(a => a.sponsorId === sponsor.id);
  const status = approval?.status || 'pending';
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

  return (
    <div
      style={{
        padding: '14px 16px', borderRadius: 12,
        border: '1.5px solid',
        borderColor: isApproved ? TOM.sucesso.border : isRejected ? TOM.perigo.border : T.border,
        backgroundColor: isApproved ? TOM.sucesso.bg : isRejected ? TOM.perigo.bg : T.bg,
      }}
    >
      {/* flexWrap (31/08, print 'cortando ainda'): com 3 botões
          (Reprovar/Aprovar/Desvincular) a fileira estourava a
          largura do painel e nascia rolagem horizontal. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: isRejectingThis ? 12 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            backgroundColor: isApproved ? TOM.sucesso.border : isRejected ? TOM.perigo.border : TOM.laranja.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: isPending ? `1.5px solid ${TOM.laranja.border}` : 'none',
          }}>
            {isApproved
              ? <CheckCircle style={{ width: 14, height: 14, color: TOM.sucesso.text }} />
              : isRejected
              ? <XCircle style={{ width: 14, height: 14, color: TOM.perigo.text }} />
              : <Clock style={{ width: 14, height: 14, color: T.accent }} />}
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0 }}>{sponsor.name}</p>
            {/* Cores de `approvalVisual`, a fonte da tela:
                "Nova versão" era AZUL só aqui (#0369a1)
                e âmbar em todo o resto — o mesmo estado
                com duas cores. E #b91c1c no reprovado:
                #dc2626 fica abaixo de AA sobre o rosa. */}
            <p style={{
              fontSize: 12, margin: '2px 0 0', fontWeight: 700,
              color: isApproved ? TOM.sucesso.text : isRejected ? TOM.perigo.text : isNewVersion ? TOM.alerta.text : TOM.alerta.text,
            }}>
              {isApproved ? 'Aprovado' : isRejected ? 'Reprovado' : isNewVersion ? 'Nova versão para decidir' : 'Aguardando decisão'}
            </p>
          </div>
        </div>

        {isPending && !isRejectingThis && (
          <div style={{ display: 'flex', gap: 6, flexDirection: isMobile ? 'column' : 'row', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              onClick={() => { if (!decisaoTravada()) setRejectingSponsorId(sponsor.id); }}
              disabled={individualRejectMutation.isPending || !canDecide || pecaRecemAberta}
              // "Reprovar faz o quê?" antes do clique (rodada 4).
              title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : `Abre o campo do motivo. A Arte refaz a arte por causa de ${sponsor.name}; os patrocinadores com aprovação estrita também esperam a nova versão, e os demais pendentes seguem podendo aprovar.`}
              style={{
                padding: '8px 16px', borderRadius: 8,
                backgroundColor: TOM.perigo.bg, border: `1px solid ${TOM.perigo.border}`,
                color: TOM.perigo.text, fontSize: 13, fontWeight: 700,
                cursor: canDecide ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
                opacity: canDecide && !pecaRecemAberta ? 1 : 0.5,
                minHeight: alvo(36, dedo),
                width: isMobile ? '100%' : undefined,
              }}
              aria-label={`Reprovar para ${sponsor.name}`}
            >
              Reprovar
            </button>
            <button
              onClick={() => { if (!decisaoTravada()) setConfirmApproveIndividual({ itemId: selectedItem.id, sponsorId: sponsor.id, sponsorName: sponsor.name || 'Patrocinador' }); }}
              disabled={individualApproveMutation.isPending || !canDecide || pecaRecemAberta}
              title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : `Registra a aprovação de ${sponsor.name} (dá para revogar depois)`}
              data-testid={`button-approve-sponsor-${sponsor.id}`}
              style={{
                padding: '8px 16px', borderRadius: 8,
                backgroundColor: TOM.sucesso.bg, border: `1px solid ${TOM.sucesso.border}`,
                color: TOM.sucesso.text, fontSize: 13, fontWeight: 700,
                cursor: canDecide ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
                opacity: canDecide && !pecaRecemAberta ? 1 : 0.5,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                minHeight: alvo(36, dedo),
                width: isMobile ? '100%' : undefined,
              }}
              aria-label={`Aprovar para ${sponsor.name}`}
            >
              {individualApproveMutation.isPending
                ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />
                : <CheckCircle style={{ width: 12, height: 12 }} />}
              Aprovar
            </button>
            {/* DESVINCULAR (25/08, admin): a marca não é desta
                peça — sai, e a pendência dele deixa de contar.
                Se era o único que faltava, a peça segue. */}
            {user?.role === "admin" && (
              <Botao
                variante="secundario"
                tamanho={tamBotao}
                larguraCheia={isMobile}
                onClick={() => setDesvincularAlvo({ itemId: selectedItem.id, sponsorId: sponsor.id, sponsorName: sponsor.name || "Patrocinador" })}
                disabled={desvincularSponsorMutation.isPending}
                title="Desvincular este patrocinador da peça — a aprovação pendente dele deixa de contar (admin)"
                data-testid={`button-desvincular-sponsor-${sponsor.id}`}
              >
                Desvincular
              </Botao>
            )}
          </div>
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
          >
            {isApproved ? 'Revogar' : 'Reverter'}
          </Botao>
        )}
      </div>

      {/* AVISO (dono, 31/08): a Arte está REFAZENDO por esta
          reprovação — quem reprovou só volta a decidir quando
          a nova arte chegar; os DEMAIS aprovam normalmente.
          Largura total, fora do cabeçalho flex (a 1ª versão
          nasceu dentro dele e virava uma coluna espremida). */}
      {v.isAwaitingArte && (
        <div data-testid={`aviso-refazendo-${sponsor.id}`} style={{ marginTop: 10, padding: '10px 12px', background: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderLeft: `3px solid ${TOM.alerta.dot}`, borderRadius: 8, fontSize: 12.5, color: TOM.alerta.text, lineHeight: 1.55 }}>
          A <strong>Arte está refazendo uma nova versão</strong> por causa da reprovação de <strong>{sponsor.name}</strong>{approval?.rejectionReason ? <>: <em>“{approval.rejectionReason}”</em></> : null}. Ele só volta a decidir quando a nova arte chegar — os demais patrocinadores seguem aprovando normalmente.
        </div>
      )}
      {/* Motivo de reprovação existente (o aviso acima já o
          cita quando a linha está com a Arte) */}
      {isRejected && !v.isAwaitingArte && approval?.rejectionReason && (
        <div style={{ marginTop: 10, padding: '10px 12px', backgroundColor: T.surface, borderRadius: 8, border: `1px solid ${TOM.perigo.border}`, borderLeft: `3px solid ${TOM.perigo.text}` }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: TOM.perigo.text, margin: '0 0 4px' }}>Motivo</p>
          <p style={{ fontSize: 13, fontStyle: 'italic', color: T.apoio, margin: 0, lineHeight: 1.5 }}>
            "<TextoComLinks texto={approval.rejectionReason} />"
          </p>
        </div>
      )}

      {/* Formulário de reprovação inline */}
      {isRejectingThis && (
        <div style={{ marginTop: 12 }}>
          {/* Label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
            <div style={{ width: 2, height: 12, borderRadius: 999, backgroundColor: TOM.perigo.text, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: TOM.perigo.text }}>Motivo da reprovação</span>
            <span style={{ fontSize: 11, color: TOM.perigo.text, fontWeight: 700, lineHeight: 1 }}>*</span>
          </div>
          {/* O EFEITO, antes de escrever (rodada 4): a dúvida
              "reprovar trava a peça inteira?" segurava o
              clique. Não trava — só esta marca espera a
              nova arte. */}
          <p style={{ margin: '0 0 7px', fontSize: 12, color: T.apoio, lineHeight: 1.45 }}>
            A Arte recebe este motivo e refaz a arte. {sponsor.name} e os patrocinadores com aprovação estrita (que perdem a aprovação já dada) esperam a nova versão; os demais pendentes seguem podendo aprovar.
          </p>

          {/* Textarea nativa — sem reset de className interferindo no foco */}
          {/* autoFocus: "Reprovar" abre este campo para
              ESCREVER — sem o foco, era um segundo clique
              obrigatório em toda reprovação. Ctrl+Enter
              confirma pela MESMA trava do botão abaixo. */}
          <textarea
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
              width: '100%', boxSizing: 'border-box',
              padding: '10px 12px', fontSize: isMobile ? FS.lead : FS.body,
              fontFamily: 'inherit', color: T.text,
              backgroundColor: T.surface,
              border: `1.5px solid ${rejectionReason.trim() ? TOM.perigo.text : T.border}`,
              borderRadius: 8, resize: 'none', lineHeight: 1.5,
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = TOM.perigo.text; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(220,38,38,0.08)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = rejectionReason.trim() ? TOM.perigo.text : T.border; e.currentTarget.style.boxShadow = 'none'; }}
            aria-label={`Motivo da reprovação de ${sponsor.name}`}
            aria-required="true"
            aria-describedby={motivoCurto(rejectionReason) ? `falta-motivo-${sponsor.id}` : undefined}
          />
          {/* A régua de 10 caracteres só existia no `title` do botão
              (hover, e só no desktop). Dizer quanto falta, à vista,
              é o mesmo que o "Devolver" da Arte já faz. */}
          {motivoCurto(rejectionReason) ? (
            <p id={`falta-motivo-${sponsor.id}`} style={{ margin: '5px 0 0', fontSize: 11.5, color: T.second }}>
              {rejectionReason.trim()
                ? `Faltam ${Math.max(0, MOTIVO_MIN - rejectionReason.trim().replace(/\s+/g, " ").length)} caracteres — a Arte precisa saber o que refazer.`
                : `Mínimo de ${MOTIVO_MIN} caracteres — a Arte precisa saber o que refazer.`}
            </p>
          ) : (
            <p style={{ margin: '5px 0 0', fontSize: 11.5, color: T.apoio }}>
              Pronto. <kbd style={KBD}>Ctrl</kbd>+<kbd style={KBD}>Enter</kbd> confirma.
            </p>
          )}

          {/* Botões */}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Botao
              variante="secundario"
              tamanho={tamBotao}
              onClick={() => { setRejectingSponsorId(null); setRejectionReason(""); }}
              style={{ flex: 1 }}
            >
              Cancelar
            </Botao>
            {/* Travado pela MESMA régua do Ctrl+Enter
                (motivoCurto); o quanto falta está escrito
                logo acima do botão. */}
            <Botao
              variante="perigo"
              tamanho={tamBotao}
              icone={XCircle}
              carregando={individualRejectMutation.isPending}
              onClick={() => individualRejectMutation.mutate({ itemId: selectedItem.id, sponsorId: sponsor.id, reason: rejectionReason })}
              disabled={motivoCurto(rejectionReason)}
              title={motivoCurto(rejectionReason) ? `Explique em pelo menos ${MOTIVO_MIN} caracteres — a Arte precisa saber o que refazer.` : undefined}
              data-testid={`button-confirm-reject-${sponsor.id}`}
              style={{ flex: 2 }}
            >
              {individualRejectMutation.isPending ? 'Registrando…' : 'Reprovar e devolver à Arte'}
            </Botao>
          </div>
        </div>
      )}
    </div>
  );
}
