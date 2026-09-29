// ─────────────────────────────────────────────────────────────────────────────
// A COLUNA DE LEITURA no modal de revisão: arte, especificações, arquivos e o
// histórico de alterações da peça.
//
// Um scrollport só para tudo isso. Antes eram TRÊS scrollports lado a lado,
// cada um com a sua barra e a sua altura — e o histórico, que é o mais
// comprido, era o mais estreito dos três.
//
// DUAS METADES EXPORTADAS (29/09): `ArteDaRevisao` e `DetalhesDaRevisao`. No
// desktop elas moram juntas na coluna da esquerda (`LeituraDaRevisao`); no
// celular a DECISÃO entra entre elas — a pessoa vê a arte e decide, sem rolar
// especificações, arquivos e histórico inteiros antes de achar os botões.
// ─────────────────────────────────────────────────────────────────────────────
import { Clock, Download, FileText, Package } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FilePreview } from "@/components/file-preview";
import { fmtRelative } from "@/components/prazos/tokens";
import { FS, FW, R, T, N } from "@/lib/theme";
import { ACTION_CONFIG } from "./regras";
import { letra, rotuloDeSecao } from "./estilos";
import type { PecaAtendimento, RegistroDeAuditoria } from "./tipos";

/** A arte que o patrocinador vai ver — e de quando ela é. */
export function ArteDaRevisao({ selectedItem, thumbUrl, finalUrl, toque, compacta = false }: {
  selectedItem: PecaAtendimento;
  thumbUrl: string | null;
  finalUrl: string | null;
  toque: boolean;
  /** Celular: menos respiro em volta (a largura é pouca). */
  compacta?: boolean;
}) {
  // "DE QUANDO É ESTA ARTE" (29/09): numa versão nova, a pergunta antes de
  // apresentar é "esta é a arte nova?". `approvalThumbUpdatedAt` é quando a
  // Arte trocou o thumb — o mesmo campo que o card da lista lê.
  const desde = selectedItem.approvalThumbUpdatedAt
    ? fmtRelative(new Date(selectedItem.approvalThumbUpdatedAt).toISOString(), Date.now())
    : null;
  return (
    <div style={{ padding: compacta ? '16px 16px 4px' : '24px 24px 0' }}>
      <div style={{
        aspectRatio: '16/9', backgroundColor: N.n2,
        borderRadius: R.lg, overflow: 'hidden',
        border: `1px solid ${T.border}`, position: 'relative',
      }}>
        {thumbUrl ? (
          <FilePreview url={thumbUrl} linkUrl={finalUrl || thumbUrl} objectFit="contain" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Package aria-hidden="true" style={{ width: 36, height: 36, color: T.bdark }} />
            <p style={{ fontSize: FS.body, fontWeight: FW.medio, color: T.second, margin: 0 }}>Sem thumb de aprovação</p>
          </div>
        )}
      </div>
      {thumbUrl && desde && (
        <p data-testid="arte-atualizada-em" title={new Date(selectedItem.approvalThumbUpdatedAt!).toLocaleString("pt-BR")} style={{ margin: '8px 2px 0', fontSize: letra(FS.meta, toque), color: T.second, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0 }} />
          Enviada pela Arte {desde}
        </p>
      )}
    </div>
  );
}

/** Especificações, arquivos e o histórico de alterações. */
export function DetalhesDaRevisao({ selectedItem, thumbUrl, finalUrl, itemLogs, isMobile, toque }: {
  selectedItem: PecaAtendimento;
  thumbUrl: string | null;
  finalUrl: string | null;
  itemLogs: RegistroDeAuditoria[];
  isMobile: boolean;
  toque: boolean;
}) {
  const lado = isMobile ? 16 : 24;
  return (
    <>
      {/* Especificações e arquivos — abaixo da arte, não ao lado. Sem borda
          e sem scroll próprios: quem rola é o pai. */}
      <div style={{
        padding: `24px ${lado}px 24px`,
        display: 'flex', flexDirection: 'column', gap: 24,
      }}>
        <div>
          <h4 style={{ ...rotuloDeSecao(toque), marginBottom: 12 }}>
            Especificações
          </h4>
          {/* GRADE de quatro células numa superfície só, divididas por
              hairline: uma tabela — que é o que sempre foram. */}
          <div style={{
            display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0,1fr))',
            backgroundColor: T.surface, border: `1px solid ${T.border}`,
            borderRadius: R.md, overflow: 'hidden',
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
                padding: '11px 14px',
                // Hairline de grade: some na última linha e na última coluna,
                // senão a superfície ganha uma moldura dupla. Empilhado, cada
                // célula é uma linha — só a última não tem régua.
                borderBottom: (isMobile ? i < 3 : i < 2) ? `1px solid ${N.n3}` : undefined,
                borderRight: !isMobile && i % 2 === 0 ? `1px solid ${N.n3}` : undefined,
                minWidth: 0,
              }}>
                <p style={{ fontSize: letra(FS.micro, toque), color: T.second, fontWeight: FW.rotulo, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 4px' }}>{label}</p>
                <p title={String(value)} style={{ fontSize: letra(FS.body, toque), fontWeight: FW.medio, color: T.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4 }}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ARQUIVOS — linhas neutras, como o resto da ficha. Eram dois blocos
            tingidos (laranja e azul) em caixa-alta de 11px: pareciam dois
            avisos, e o azul era a única coisa azul do modal. */}
        <div>
          <h4 style={{ ...rotuloDeSecao(toque), marginBottom: 12 }}>
            Arquivos
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              thumbUrl ? { href: thumbUrl, rotulo: 'Arquivo para aprovação', apoio: 'o thumb que o patrocinador vê' } : null,
              finalUrl ? { href: finalUrl, rotulo: 'Arquivo final', apoio: 'o arquivo de impressão' } : null,
            ].filter((a): a is { href: string; rotulo: string; apoio: string } => !!a).map((a) => (
              <a
                key={a.rotulo}
                href={a.href}
                target="_blank"
                rel="noopener noreferrer"
                className="atd-linha"
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  minHeight: toque ? 48 : 44, padding: '8px 12px', borderRadius: R.md,
                  backgroundColor: T.surface, border: `1px solid ${T.border}`,
                  color: T.text, textDecoration: 'none',
                }}
              >
                <FileText aria-hidden="true" style={{ width: 16, height: 16, color: T.second, flexShrink: 0 }} />
                <span style={{ flex: '1 1 0%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: letra(FS.body, toque), fontWeight: FW.forte }}>{a.rotulo}</span>
                  <span style={{ fontSize: letra(FS.small, toque), color: T.second }}>{a.apoio}</span>
                </span>
                <Download aria-hidden="true" style={{ width: 15, height: 15, color: T.apoio, flexShrink: 0 }} />
              </a>
            ))}
            {!thumbUrl && !finalUrl && (
              <p style={{ margin: 0, padding: '12px 14px', borderRadius: R.md, border: `1px dashed ${T.border}`, fontSize: letra(FS.body, toque), color: T.second }}>Nenhum arquivo disponível</p>
            )}
          </div>
        </div>
      </div>
      {/* Histórico — o bloco mais COMPRIDO da ficha, com a largura inteira
          da coluna de leitura, rolando junto com o resto. */}
      <div style={{
        padding: `24px ${lado}px 28px`,
        borderTop: `1px solid ${N.n3}`,
      }}>
        <h4 style={{ ...rotuloDeSecao(toque), marginBottom: 18 }}>
          Histórico de Alterações
        </h4>

        {itemLogs.length === 0 ? (
          <p style={{ margin: 0, fontSize: letra(FS.body, toque), color: T.second }}>Sem registros de histórico</p>
        ) : (
          <div style={{ position: 'relative' }}>
            {/* Linha vertical */}
            <div aria-hidden="true" style={{
              position: 'absolute', left: 10, top: 8, bottom: 8,
              width: 1, backgroundColor: T.border,
            }} />
            <ol style={{ display: 'flex', flexDirection: 'column', gap: 20, listStyle: 'none', margin: 0, padding: 0 }}>
              {itemLogs.slice(0, 10).map((log) => {
                // ACTION_CONFIG é const de módulo.
                const cfg = ACTION_CONFIG[log.action] ?? { label: log.action?.replace(/_/g, ' ') ?? 'Ação', bg: T.border, iconColor: T.muted, icon: Clock };
                const IconComp = cfg.icon;
                const isSystemLog = ['updated', 'status_changed', 'file_uploaded', 'thumb_uploaded'].includes(log.action);
                return (
                  // SEM esmaecimento por opacidade (o mais antigo chegava a
                  // ~1,8:1). A hierarquia é de PESO: log de sistema 600,
                  // decisão 700.
                  <li key={log.id} style={{ paddingLeft: 32, position: 'relative' }}>
                    <div aria-hidden="true" style={{
                      position: 'absolute', left: 0, top: 1,
                      width: 21, height: 21, borderRadius: '50%',
                      backgroundColor: cfg.bg, boxShadow: `0 0 0 3px ${T.surface}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
                    }}>
                      <IconComp style={{ width: 11, height: 11, color: cfg.iconColor }} />
                    </div>
                    <p style={{ fontSize: letra(FS.meta + 0.5, toque), fontWeight: isSystemLog ? FW.medio : FW.forte, color: isSystemLog ? T.apoio : T.text, margin: 0 }}>
                      {cfg.label}
                    </p>
                    <p style={{ fontSize: letra(FS.small, toque), color: T.second, margin: '2px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                      {log.userName && <><span style={{ fontWeight: FW.medio, color: T.apoio }}>{log.userName}</span> · </>}
                      {format(new Date(log.createdAt), "dd MMM, yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                    {log.details && (
                      <p style={{
                        fontSize: letra(FS.meta, toque), margin: '6px 0 0', lineHeight: 1.5,
                        backgroundColor: T.bg, border: `1px solid ${N.n3}`,
                        padding: '7px 10px', borderRadius: R.sm,
                        color: T.apoio,
                      }}>
                        {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </>
  );
}

/** A coluna de leitura do desktop: a arte e, abaixo dela, os detalhes. */
export function LeituraDaRevisao({ selectedItem, thumbUrl, finalUrl, itemLogs, isMobile, toque = false }: {
  selectedItem: PecaAtendimento;
  thumbUrl: string | null;
  finalUrl: string | null;
  itemLogs: RegistroDeAuditoria[];
  isMobile: boolean;
  toque?: boolean;
}) {
  return (
    <div style={{ overflowY: "auto", minWidth: 0, display: "flex", flexDirection: "column" }}>
      <ArteDaRevisao selectedItem={selectedItem} thumbUrl={thumbUrl} finalUrl={finalUrl} toque={toque} />
      <DetalhesDaRevisao selectedItem={selectedItem} thumbUrl={thumbUrl} finalUrl={finalUrl} itemLogs={itemLogs} isMobile={isMobile} toque={toque} />
    </div>
  );
}
