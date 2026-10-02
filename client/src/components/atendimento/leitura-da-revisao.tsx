// ─────────────────────────────────────────────────────────────────────────────
// O QUE SE LÊ no modal de revisão: a arte, a ficha da peça (especificações e
// arquivos) e o histórico de alterações.
//
// AS PARTES SÃO MONTADAS CONFORME A LARGURA (29/09, 2ª passada):
//   · DESKTOP — à esquerda a ARTE numa "mesa de luz" alta (é ela que se
//     compara com o patrocinador) e o histórico abaixo; à direita, junto da
//     decisão, a FICHA (o que é a peça) e os arquivos. Antes a arte era um
//     quadro 16:9 com a miniatura no tamanho natural boiando no meio, e a
//     coluna da decisão sobrava vazia com um patrocinador só.
//   · EMPILHADO (celular/tablet) — arte → decisão → ficha → histórico.
// ─────────────────────────────────────────────────────────────────────────────
import { Clock, Download, ExternalLink, FileText, Package } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FilePreview } from "@/components/file-preview";
import { fmtRelative } from "@/components/prazos/tokens";
import { FS, FW, R, T, N } from "@/lib/theme";
import { ACTION_CONFIG } from "./regras";
import { letra, rotuloDeSecao } from "./estilos";
import type { PecaAtendimento, RegistroDeAuditoria } from "./tipos";

/** A arte que o patrocinador vai ver — e de quando ela é. */
export function ArteDaRevisao({ selectedItem, thumbUrl, finalUrl, toque, compacta = false, alta = false }: {
  selectedItem: PecaAtendimento;
  thumbUrl: string | null;
  finalUrl: string | null;
  toque: boolean;
  /** Celular: menos respiro em volta (a largura é pouca). */
  compacta?: boolean;
  /** Desktop: a mesa de luz ocupa a altura disponível, não um 16:9 fixo. */
  alta?: boolean;
}) {
  // "DE QUANDO É ESTA ARTE": numa versão nova, a pergunta antes de apresentar
  // é "esta é a arte nova?". `approvalThumbUpdatedAt` é quando a Arte trocou
  // o thumb — o mesmo campo que o card da lista lê.
  const desde = selectedItem.approvalThumbUpdatedAt
    ? fmtRelative(new Date(selectedItem.approvalThumbUpdatedAt).toISOString(), Date.now())
    : null;
  return (
    <div style={{ padding: compacta ? '16px 16px 4px' : '20px 24px 0' }}>
      {/* MESA DE LUZ: fundo neutro discreto e a arte ESTICADA até a borda do
          quadro (contain — nunca corta), em vez da miniatura no tamanho
          natural no meio de um quadro cinza. */}
      <div data-testid="mesa-de-luz" className="atd-mesa-de-luz" style={{
        ...(alta ? { height: 'clamp(300px, 56vh, 640px)' } : { aspectRatio: '16/9' }),
        backgroundColor: N.n2,
        backgroundImage: `radial-gradient(${N.n3} 1px, transparent 1px)`, backgroundSize: '14px 14px',
        borderRadius: R.lg, overflow: 'hidden',
        border: `1px solid ${T.border}`, position: 'relative', padding: 12, boxSizing: 'border-box',
      }}>
        {thumbUrl ? (
          <FilePreview url={thumbUrl} linkUrl={finalUrl || thumbUrl} objectFit="contain" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Package aria-hidden="true" style={{ width: 36, height: 36, color: T.bdark }} />
            <p style={{ fontSize: FS.body, fontWeight: FW.medio, color: T.second, margin: 0 }}>Sem thumb de aprovação</p>
          </div>
        )}
        {/* TAMANHO REAL À VISTA: o clique na arte já abria o arquivo, mas
            nada dizia isso. */}
        {thumbUrl && (
          <a
            href={thumbUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="abrir-arte-tamanho-real"
            className="ds-botao"
            style={{
              position: 'absolute', top: 10, right: 10, display: 'inline-flex', alignItems: 'center', gap: 6,
              minHeight: toque ? 44 : 32, padding: '0 12px', borderRadius: R.md,
              backgroundColor: 'rgba(255,255,255,0.94)', border: `1px solid ${T.border}`, boxShadow: '0 1px 2px rgba(28,25,23,0.08)',
              color: T.strong, fontSize: letra(FS.meta, toque), fontWeight: FW.forte, textDecoration: 'none',
            }}
          >
            <ExternalLink aria-hidden="true" style={{ width: 13, height: 13 }} />
            Tamanho real
          </a>
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

/** A FICHA: o que é a peça (especificações) e os arquivos dela. */
export function FichaDaPeca({ selectedItem, thumbUrl, finalUrl, toque, lado = 24 }: {
  selectedItem: PecaAtendimento;
  thumbUrl: string | null;
  finalUrl: string | null;
  toque: boolean;
  /** Respiro lateral (16 no celular). */
  lado?: number;
}) {
  const specs = [
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
  ];
  const arquivos = [
    thumbUrl ? { href: thumbUrl, rotulo: 'Arquivo para aprovação', apoio: 'o thumb que o patrocinador vê' } : null,
    finalUrl ? { href: finalUrl, rotulo: 'Arquivo final', apoio: 'o arquivo de impressão' } : null,
  ].filter((a): a is { href: string; rotulo: string; apoio: string } => !!a);
  return (
    <div data-testid="ficha-da-peca" style={{ padding: `20px ${lado}px 24px`, display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <h4 style={{ ...rotuloDeSecao(toque), marginBottom: 10 }}>Especificações</h4>
        {/* Uma TABELA de rótulo e valor numa superfície só, dividida por
            hairline — é o que sempre foram. */}
        <dl style={{ margin: 0, backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md, overflow: 'hidden' }}>
          {specs.map(({ label, value }, i) => (
            <div key={label} style={{
              display: 'grid', gridTemplateColumns: 'minmax(0, 132px) minmax(0, 1fr)', columnGap: 12,
              padding: '10px 14px', borderTop: i > 0 ? `1px solid ${N.n3}` : undefined, alignItems: 'baseline',
            }}>
              <dt style={{ fontSize: letra(FS.small, toque), color: T.second, fontWeight: FW.medio }}>{label}</dt>
              <dd title={String(value)} style={{ margin: 0, fontSize: letra(FS.body, toque), fontWeight: FW.medio, color: T.text, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ARQUIVOS — linhas neutras, como o resto da ficha. */}
      <div>
        <h4 style={{ ...rotuloDeSecao(toque), marginBottom: 10 }}>Arquivos</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {arquivos.map((a) => (
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
          {arquivos.length === 0 && (
            <p style={{ margin: 0, padding: '12px 14px', borderRadius: R.md, border: `1px dashed ${T.border}`, fontSize: letra(FS.body, toque), color: T.second }}>Nenhum arquivo disponível</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** O histórico de alterações — os 10 registros mais recentes. */
export function HistoricoDaPeca({ itemLogs, toque, lado = 24 }: {
  itemLogs: RegistroDeAuditoria[];
  toque: boolean;
  lado?: number;
}) {
  return (
    <div data-testid="historico-da-peca" style={{ padding: `22px ${lado}px 28px`, borderTop: `1px solid ${N.n3}` }}>
      <h4 style={{ ...rotuloDeSecao(toque), marginBottom: 16 }}>
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
          <ol style={{ display: 'flex', flexDirection: 'column', gap: 18, listStyle: 'none', margin: 0, padding: 0 }}>
            {itemLogs.slice(0, 10).map((log) => {
              // ACTION_CONFIG é const de módulo.
              const cfg = ACTION_CONFIG[log.action] ?? { label: log.action?.replace(/_/g, ' ') ?? 'Ação', bg: T.border, iconColor: T.muted, icon: Clock };
              const IconComp = cfg.icon;
              const isSystemLog = ['updated', 'status_changed', 'file_uploaded', 'thumb_uploaded'].includes(log.action);
              return (
                // A hierarquia é de PESO (sistema 600, decisão 700) — nunca
                // de opacidade, que deixava o registro antigo ilegível.
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
  );
}

/** Empilhado (celular/tablet): a ficha e o histórico, depois da decisão. */
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
      <FichaDaPeca selectedItem={selectedItem} thumbUrl={thumbUrl} finalUrl={finalUrl} toque={toque} lado={lado} />
      <HistoricoDaPeca itemLogs={itemLogs} toque={toque} lado={lado} />
    </>
  );
}

/** A coluna de leitura do desktop: a arte, alta, e o histórico abaixo. */
export function LeituraDaRevisao({ selectedItem, thumbUrl, finalUrl, itemLogs, toque = false }: {
  selectedItem: PecaAtendimento;
  thumbUrl: string | null;
  finalUrl: string | null;
  itemLogs: RegistroDeAuditoria[];
  isMobile?: boolean;
  toque?: boolean;
}) {
  return (
    <div style={{ overflowY: "auto", minWidth: 0, display: "flex", flexDirection: "column" }}>
      <ArteDaRevisao selectedItem={selectedItem} thumbUrl={thumbUrl} finalUrl={finalUrl} toque={toque} alta />
      <div style={{ height: 20, flexShrink: 0 }} />
      <HistoricoDaPeca itemLogs={itemLogs} toque={toque} />
    </div>
  );
}
