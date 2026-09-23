// PATROCINADORES — em ordem de urgência, com a reversão da decisão (admin/Atendimento).
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Undo2 } from "lucide-react";
import { POS_APROVACAO } from "@shared/fluxo-peca";
import { useAuth } from "@/contexts/auth-context";
import { T, N, TOM } from "@/lib/theme";
import { Selo } from "@/components/ui/selo";
import { CARTAO, TITULO_SECAO } from "./estilos";
import type { LinhaDePatrocinador } from "./regras-da-faixa";

export function SecaoPatrocinadores({
  linhasPatrocinador, patrocinadoresOrdenados, aprovados, rawStatus, ALVO,
  revertingSponsorId, handleRevertApproval,
}: {
  linhasPatrocinador: LinhaDePatrocinador[];
  patrocinadoresOrdenados: LinhaDePatrocinador[];
  aprovados: LinhaDePatrocinador[];
  rawStatus: string;
  /** Alvo de toque / de ponteiro. */
  ALVO: number;
  revertingSponsorId: string | null;
  handleRevertApproval: (sponsorId: string, sponsorName: string | null | undefined) => void;
}) {
  const { user } = useAuth();
  return (
    <section data-testid="section-patrocinadores">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <h3 style={TITULO_SECAO}>Patrocinadores</h3>
        <span style={{ fontSize: 12, fontWeight: 700, color: aprovados.length === linhasPatrocinador.length ? TOM.sucesso.text : T.accentText }}>
          {aprovados.length} de {linhasPatrocinador.length} aprovaram
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {patrocinadoresOrdenados.map(({ sponsor: s, approval, meta }) => {
          const pendente = meta.tone === "waiting";
          // O detalhe em 12px #57534e (7,63 sobre branco), e não no
          // monospace de 10px de antes: é frase, não carimbo — e a
          // observação da reprovação, que é a informação mais útil
          // da tela, era a menos legível dela.
          const detalhe = approval?.approvedAt
            ? `Aprovou em ${format(new Date(approval.approvedAt), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}${approval.approvedBy ? ` · ${approval.approvedBy}` : ""}`
            : approval?.rejectedAt
              ? `Reprovou em ${format(new Date(approval.rejectedAt), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}${approval.rejectedBy ? ` · ${approval.rejectedBy}` : ""}`
              : null;
          return (
            <div
              key={s.id}
              data-testid={`linha-patrocinador-${s.id}`}
              style={{
                ...CARTAO,
                border: `1px solid ${pendente || meta.isRejection ? meta.border : T.border}`,
                padding: 12,
                display: "flex", alignItems: "flex-start", gap: 12,
              }}
            >
              <span aria-hidden="true" style={{
                width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                backgroundColor: N.n2,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 15, fontWeight: 700, color: s.color || T.text,
              }}>
                {(s.name || "?")[0].toUpperCase()}
              </span>

              <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: T.text }}>{s.name}</span>
                  <Selo
                    cores={meta}
                    ponto
                    title={meta.hint}
                    data-testid={`chip-aprovacao-${s.id}`}
                  >
                    {meta.short}
                  </Selo>
                </div>
                {detalhe && (
                  <p style={{ fontSize: 12, color: T.apoio, margin: "4px 0 0", lineHeight: 1.45 }}>{detalhe}</p>
                )}
                {/* O pedido de ajuste, entre aspas e por extenso. */}
                {approval?.rejectionReason && (
                  <p style={{ fontSize: 12, color: TOM.perigo.text, margin: "4px 0 0", lineHeight: 1.5, fontStyle: "italic" }}>
                    "{String(approval.rejectionReason).trim()}"
                  </p>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {/* Revogar a aprovação / reverter a reprovação. Admin
                    sempre; Atendimento enquanto a peça está em aprovação
                    ou na finalização da Arte (pedido do dono, 21/08).

                    LINHA PENDENTE também mostra o botão quando a peça
                    JÁ AVANÇOU (caso #4176, 24/08): é o estado incoerente
                    herdado do atalho antigo — "Aguardando" com a peça em
                    Finalização — e o servidor sabe REABRIR a partir dele.
                    Sem o botão aqui, o conserto existia e não havia onde
                    clicar: a peça seguia presa fora da fila do
                    Atendimento. Pendente com a peça ainda em aprovação
                    continua sem botão — aí não há mesmo o que fazer. */}
                {approval && (() => {
                  // Era uma CÓPIA da lista, e a cópia cobrou o preço (25/08): o
                  // apelido legado awaiting_creator_review entrou na canônica e
                  // esta ficou para trás — o aviso de reabertura sumia justamente
                  // na peça em revisão. Agora importa de @shared/fluxo-peca.
                  const pecaAvancada = POS_APROVACAO.includes(rawStatus);
                  const reabrirIncoerente = approval?.status === "pending" && pecaAvancada;
                  const podeAgir = user?.role === "admin" || (user?.role === "atendimento" && (rawStatus === "awaiting_sponsor_approval" || rawStatus === "sponsor_approved"));
                  return podeAgir && approval && (approval.status !== "pending" || reabrirIncoerente);
                })() && (
                  <button
                    type="button"
                    onClick={() => handleRevertApproval(s.id, s.name)}
                    disabled={revertingSponsorId === s.id}
                    title={approval.status === "pending"
                      ? "Reabrir a aprovação — a peça avançou com este patrocinador ainda aguardando; ela volta pendente na fila do Atendimento"
                      : `${approval.status === "approved" ? "Revogar a aprovação" : "Reverter a decisão"} — volta a aguardar (estava ${meta.label.toLowerCase()})`}
                    aria-label={`Reverter a decisão de ${s.name}`}
                    data-testid={`button-revert-approval-${s.id}`}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: ALVO, height: ALVO, borderRadius: 8, border: `1px solid ${T.border}`,
                      backgroundColor: T.surface, color: T.apoio,
                      cursor: revertingSponsorId === s.id ? "default" : "pointer",
                      opacity: revertingSponsorId === s.id ? 0.5 : 1, flexShrink: 0,
                    }}
                  >
                    <Undo2 style={{ width: 14, height: 14 }} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
