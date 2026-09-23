// ─────────────────────────────────────────────────────────────────────────────
// A COLUNA DE LEITURA no modal de revisão: arte, especificações, arquivos e o
// histórico de alterações da peça.
//
// Um scrollport só para tudo isso. Antes eram TRÊS scrollports lado a lado,
// cada um com a sua barra e a sua altura — e o histórico, que é o mais
// comprido, era o mais estreito dos três.
// ─────────────────────────────────────────────────────────────────────────────
import { Clock, Download, Package } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FilePreview } from "@/components/file-preview";
import { T, N, TOM } from "@/lib/theme";
import { ACTION_CONFIG } from "./regras";
import type { PecaAtendimento, RegistroDeAuditoria } from "./tipos";

export function LeituraDaRevisao({ selectedItem, thumbUrl, finalUrl, itemLogs, isMobile }: {
  selectedItem: PecaAtendimento;
  thumbUrl: string | null;
  finalUrl: string | null;
  itemLogs: RegistroDeAuditoria[];
  isMobile: boolean;
}) {
  return (
    <div style={{ overflowY: "auto", minWidth: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Preview de imagem */}
          <div style={{
            aspectRatio: '16/9', backgroundColor: N.n2,
            borderRadius: 12, overflow: 'hidden',
            border: `1px solid ${T.border}`, position: 'relative',
          }}>
            {thumbUrl ? (
              <FilePreview url={thumbUrl} linkUrl={finalUrl || thumbUrl} objectFit="contain" />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Package style={{ width: 40, height: 40, color: T.muted }} />
                <p style={{ fontSize: 13, color: T.second, margin: 0 }}>Sem thumb de aprovação</p>
              </div>
            )}
          </div>

      </div>
      {/* Especificações e arquivos — abaixo da arte, não ao lado.

          Sem borda e sem scroll próprios: eram de coluna, e esta
          deixou de ser uma. Quem rola agora é o pai. */}
      <div style={{
        padding: '0 24px 24px',
        display: 'flex', flexDirection: 'column', gap: 24,
      }}>
        <div>
          <h4 style={{ fontSize: 11, fontWeight: 700, color: T.second, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>
            Especificações
          </h4>
          {/* GRADE de quatro células, não quatro caixas empilhadas.

              Cada uma tinha borda, raio e fundo próprios: quatro
              molduras para quatro pares rótulo/valor que ninguém
              lê um por vez. Numa superfície só, divididas por
              hairline, elas viram uma tabela — que é o que sempre
              foram. */}
          <div style={{
            display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0,1fr))',
            backgroundColor: T.surface, border: `1px solid ${N.n3}`,
            borderRadius: 8, overflow: 'hidden',
          }}>
            {[
              { label: 'Tipo / Formato', value: selectedItem.type || '—' },
              { label: 'Descrição', value: selectedItem.description || '—' },
              { label: 'Quantidade', value: selectedItem.quantity ? `${selectedItem.quantity}x` : '—' },
              { label: 'Dimensões / Tamanho', value: (() => {
                const vw = selectedItem.visualWidth; const vh = selectedItem.visualHeight;
                const fw = selectedItem.fileWidth;  const fh = selectedItem.fileHeight;
                const visual = vw && vh ? `${parseFloat(vw)}×${parseFloat(vh)} m (visual)` : null;
                const file   = fw && fh ? `${parseFloat(fw)}×${parseFloat(fh)} m (arquivo)` : null;
                return [visual, file].filter(Boolean).join(' · ') || '—';
              })() },
            ].map(({ label, value }, i) => (
              <div key={label} style={{
                padding: '10px 12px',
                // Hairline de grade: a borda de baixo some na
                // última linha e a da direita na última coluna,
                // senão a superfície ganha uma moldura dupla.
                borderBottom: i < 2 ? `1px solid ${N.n3}` : undefined,
                borderRight: !isMobile && i % 2 === 0 ? `1px solid ${N.n3}` : undefined,
                minWidth: 0,
              }}>
                <p style={{ fontSize: 10, color: T.second, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 4px' }}>{label}</p>
                <p title={String(value)} style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Links para arquivos */}
        <div>
          <h4 style={{ fontSize: 11, fontWeight: 700, color: T.second, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
            Arquivos
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {thumbUrl && (
              <a
                href={thumbUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', borderRadius: 8,
                  backgroundColor: 'rgba(253,118,26,0.05)',
                  border: '1px solid rgba(253,118,26,0.15)',
                  color: T.accentText, textDecoration: 'none',
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                }}
              >
                <span>Arquivo para aprovação</span>
                <Download style={{ width: 14, height: 14 }} />
              </a>
            )}
            {finalUrl && (
              <a
                href={finalUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', borderRadius: 8,
                  backgroundColor: 'rgba(0,99,152,0.05)',
                  border: '1px solid rgba(0,99,152,0.15)',
                  color: TOM.ceu.text, textDecoration: 'none',
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                }}
              >
                <span>Arquivo Final</span>
                <Download style={{ width: 14, height: 14 }} />
              </a>
            )}
            {!thumbUrl && !finalUrl && (
              <p style={{ fontSize: 13, color: T.second }}>Nenhum arquivo disponível</p>
            )}
          </div>
        </div>
      </div>
      {/* Histórico — o bloco mais COMPRIDO da ficha, e era o mais
          estreito dos três. Aqui ele tem a largura inteira da
          coluna de leitura e rola junto com o resto. */}
      <div style={{
        padding: '0 24px 24px',
        borderTop: `1px solid ${N.n3}`, paddingTop: 24,
      }}>
        <h4 style={{ fontSize: 11, fontWeight: 700, color: T.second, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 24px' }}>
          Histórico de Alterações
        </h4>

        {itemLogs.length === 0 ? (
          <p style={{ fontSize: 13, color: T.second }}>Sem registros de histórico</p>
        ) : (
          <div style={{ position: 'relative' }}>
            {/* Linha vertical */}
            <div style={{
              position: 'absolute', left: 10, top: 8, bottom: 8,
              width: 1, backgroundColor: T.border,
            }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {itemLogs.slice(0, 10).map((log, i) => {
                // ACTION_CONFIG é const de módulo (topo do arquivo).
                const cfg = ACTION_CONFIG[log.action] ?? { label: log.action?.replace(/_/g, ' ') ?? 'Ação', bg: T.border, iconColor: T.muted, icon: Clock };
                const IconComp = cfg.icon;
                const isSystemLog = ['updated', 'status_changed', 'file_uploaded', 'thumb_uploaded'].includes(log.action);
                return (
                  // SEM o esmaecimento por opacidade. O registro
                  // mais antigo chegava a 40%: o cinza #746e69 a 40%
                  // sobre branco mede ~1,8:1 — o histórico ficava
                  // ilegível justamente no que se abre para ler. A
                  // hierarquia agora é de PESO: log de sistema
                  // (upload, status) em rótulo 600; decisão, 700.
                  <div key={log.id} style={{ paddingLeft: 32, position: 'relative' }}>
                    <div style={{
                      position: 'absolute', left: 0, top: 2,
                      width: 20, height: 20, borderRadius: '50%',
                      backgroundColor: cfg.bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
                    }}>
                      <IconComp style={{ width: 10, height: 10, color: cfg.iconColor }} />
                    </div>
                    <p style={{ fontSize: 12, fontWeight: isSystemLog ? 600 : 700, color: isSystemLog ? T.apoio : T.text, margin: 0 }}>
                      {cfg.label}
                    </p>
                    <p style={{ fontSize: 11, color: T.second, margin: '2px 0 0' }}>
                      {log.userName && <><span style={{ fontWeight: 600, color: T.second }}>{log.userName}</span> · </>}
                      {format(new Date(log.createdAt), "dd MMM, yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                    {log.details && (
                      <p style={{
                        fontSize: 11, margin: '6px 0 0',
                        backgroundColor: T.surface, border: `1px solid ${cfg.bg}`,
                        padding: '6px 10px', borderRadius: 6,
                        color: T.apoio, fontStyle: 'italic',
                      }}>
                        "{typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}"
                      </p>
                    )}
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
