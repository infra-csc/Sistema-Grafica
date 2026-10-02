// A metade direita da faixa de decisão da ficha: patrocinadores e histórico,
// com teto próprio — listas crescem, decisões não podem descer. Só props,
// sem hook: mora dentro do FreezeWhileClosing do modal.
import { Clock } from "lucide-react";
import { Selo } from "@/components/ui/selo";
import { STATUS, getStatusMeta } from "@/lib/status";
import { T, TOM, N, FS, R, FONT } from "@/lib/theme";
import { TI } from "./regras";
import { letra } from "./estilos";
import type { PecaDaRevisao, RegistroDoHistorico } from "./tipos";

// Ações de log que correspondem a status do vocabulário herdam rótulo e cor
// de lib/status; o mapa abaixo cobre só os tipos de log que NÃO são status.
// `dot` (tom saturado 500) é só da bolinha; `text` (tom escuro 700, AA sobre
// fundo claro) é o que vai no rótulo — mesma disciplina do StatusMeta.
const NON_STATUS_LOG_CFG: Record<string, { label: string; dot: string; text: string }> = {
  updated:          { label: "Atualizado",            dot: T.accent, text: T.accentText },
  rejected:         { label: "Reprovado",             dot: TOM.perigo.dot, text: TOM.perigo.text },
  submitted:        { label: "Enviado",               dot: TOM.ciano.text, text: TOM.ciano.text },
  linked:           { label: "Vinculado",             dot: TOM.turquesa.text, text: TOM.turquesa.text },
  released:         { label: "Liberado",              dot: TOM.info.dot, text: TOM.info.text },
  status_changed:   { label: "Status alterado",       dot: T.accent, text: T.accentText },
  sponsor_approved: { label: "Patrocinador aprovado", dot: TOM.esmeralda.dot, text: TOM.esmeralda.text },
  sponsor_rejected: { label: "Patrocinador reprovou", dot: TOM.perigo.dot, text: TOM.perigo.text },
  file_uploaded:    { label: "Arquivo enviado",       dot: TOM.roxo.text, text: TOM.roxo.text },
  thumb_uploaded:   { label: "Thumb enviado",         dot: TOM.roxo.text, text: TOM.roxo.text },
};

export function getLogCfg(log: Pick<RegistroDoHistorico, "action" | "details"> | null | undefined): { label: string; dot: string; text: string } {
  const action = log?.action;
  if (action && STATUS[action]) {
    const m = getStatusMeta(action);
    return { label: m.label, dot: m.dot, text: m.text };
  }
  if (action && NON_STATUS_LOG_CFG[action]) return NON_STATUS_LOG_CFG[action];
  // Tipo de log sem rótulo: o nome interno ("creator_review") não diz nada a
  // quem revisa — o detalhe, quando existe, aparece logo abaixo.
  return { label: action ? "Alteração na peça" : (log?.details || "Alteração na peça"), dot: T.muted, text: T.second };
}

export function FichaHistorico({ selectedItem, isMobile, empilhado = isMobile, historicoCarregando, itemAuditLogs }: {
  selectedItem: PecaDaRevisao | null;
  isMobile: boolean;
  /** A faixa de decisão está empilhada (celular e tablet): sem base zero. */
  empilhado?: boolean;
  historicoCarregando: boolean;
  itemAuditLogs: RegistroDoHistorico[];
}) {
  return (
    // No celular sem teto nem rolagem própria: o corpo da ficha já rola, e uma
    // caixa rolando dentro de outra prendia o dedo.
    // Sem teto próprio (02/10): quem rola é a coluna da decisão ou o corpo.
    <div style={{ flex: empilhado ? undefined : "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
      {(selectedItem?.sponsors?.length ?? 0) > 0 && (
        <div>
          <h3 style={{ fontSize: letra(FS.small, isMobile), fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TI.secondary, paddingBottom: 8, borderBottom: `1px solid ${N.n3}`, margin: "0 0 10px" }}>
            Patrocinadores da peça
          </h3>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {selectedItem?.sponsors?.map((s) => (
              <Selo key={s.id} cores={{ bg: N.n2, border: T.border, text: TI.secondary }} style={{ fontSize: letra(FS.small, isMobile) }}>
                {s.name}
              </Selo>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 style={{ fontSize: letra(FS.small, isMobile), fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TI.secondary, paddingBottom: 8, borderBottom: `1px solid ${N.n3}`, margin: "0 0 14px" }}>
          Histórico
        </h3>
        {historicoCarregando ? (
          <p role="status" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: FS.body, color: T.apoio, margin: 0 }}>
            <span aria-hidden="true" className="animate-pulse" style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: T.bdark, flexShrink: 0 }} />
            Carregando o histórico…
          </p>
        ) : itemAuditLogs.length === 0 ? (
          // Uma linha discreta, e não o cartão tracejado de estado vazio: a
          // ausência de histórico é rara e não é notícia — o cartão de 130px
          // em negrito pesava mais que os botões de decisão ao lado.
          <p data-testid="historico-vazio" style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, fontSize: FS.body, color: T.apoio }}>
            <Clock aria-hidden="true" style={{ width: 14, height: 14, color: T.muted, flexShrink: 0 }} />
            Nenhum registro desta peça ainda.
          </p>
        ) : (
          <div style={{ position: "relative", paddingLeft: 24 }}>
            <div style={{ position: "absolute", left: 11, top: 8, bottom: 0, width: 2, backgroundColor: N.n3 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {itemAuditLogs.map((log, idx) => {
                const cfg = getLogCfg(log);
                return (
                  <div key={log.id || idx} style={{ position: "relative" }}>
                    <span style={{
                      position: "absolute", left: -22, top: 2,
                      width: 16, height: 16, borderRadius: "50%",
                      backgroundColor: T.surface, border: `4px solid ${cfg.dot}`, zIndex: 1,
                    }} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div>
                        <p style={{ fontSize: FS.body, fontWeight: 700, color: cfg.text, margin: 0 }}>{cfg.label}</p>
                        {log.userName && <p style={{ fontSize: letra(FS.micro, isMobile), color: TI.secondary, margin: "2px 0 0" }}>{log.userName}</p>}
                        {log.details && log.action && (
                          <p style={{ fontSize: letra(FS.small, isMobile), fontStyle: "italic", color: TI.secondary, backgroundColor: T.low, padding: "6px 8px", borderRadius: R.sm, margin: "6px 0 0" }}>
                            "{log.details}"
                          </p>
                        )}
                      </div>
                      <span style={{ fontSize: letra(FS.micro, isMobile), fontWeight: 700, color: T.second, whiteSpace: "nowrap", fontFamily: FONT.mono }}>
                        {log.createdAt ? new Date(log.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
