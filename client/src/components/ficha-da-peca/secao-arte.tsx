// ARTE — referência do solicitante, arte enviada e foto da conferência, lado a lado.
import { Camera, ExternalLink, FileImage, Paperclip } from "lucide-react";
import { FilePreview } from "@/components/file-preview";
import { miniatura } from "@/lib/miniatura";
import { refsDaPeca } from "@/lib/refs-da-peca";
import { hrefSeguro } from "@shared/url-segura";
import { T, N, TOM } from "@/lib/theme";
import { TITULO_SECAO, useLetraDaFicha } from "./estilos";
import { fmtShort, friendlyFileName } from "./formatos";
import type { ItemDaFicha } from "./tipos";

export function SecaoArte({ item, conferencePhotos }: {
  item: ItemDaFicha;
  /** Fotos da conferência (galeria + campo antigo), já convertidas. */
  conferencePhotos: string[];
}) {
  const fsf = useLetraDaFicha();
  const thumbUrl = item.approvalThumbUrl;

  return (
    <section>
      <h3 style={{ ...TITULO_SECAO, fontSize: fsf(10), marginBottom: 10 }}>Arte</h3>
      {/* A COMPARAÇÃO É O QUE SE QUER FAZER AQUI. A referência do
          solicitante vinha num banner de largura inteira no topo da
          ficha e a arte enviada num card no fim da coluna direita —
          uma tela de rolagem entre as duas imagens que existem para
          ser comparadas. */}
      {/* ── A COMPARAÇÃO, com quantos panes houver ──

          Antes esta faixa mostrava ARTE APROVADA × FOTO DA
          CONFERÊNCIA — "o que o patrocinador aprovou" contra "o que
          saiu da impressora". A revisão trocou por REFERÊNCIA ×
          ARTE, que responde outra pergunta igualmente válida ("a
          Arte fez o que foi pedido?"), e ao trocar levou a primeira
          junto — sem que ninguém decidisse abrir mão dela.

          As duas cabem: são três momentos da mesma peça, na ordem em
          que acontecem. O terceiro pane só existe quando há foto de
          conferência, então na maior parte do fluxo a faixa continua
          com dois. */}
      {(() => {
        // VÁRIAS referências (25/08): a primeira ocupa o pane; as
        // demais viram miniaturas clicáveis logo abaixo.
        const refs = refsDaPeca(item);
        const panes = [refs.length > 0, !!thumbUrl, conferencePhotos.length > 0].filter(Boolean).length;
        return (
      <div style={{ display: "grid", gridTemplateColumns: panes >= 3 ? "1fr 1fr 1fr" : panes === 2 ? "1fr 1fr" : "1fr", gap: 10 }}>
        {refs.length > 0 && (
          <div>
            <a
              href={hrefSeguro(refs[0])} target="_blank" rel="noopener noreferrer"
              title="Abrir a referência do solicitante"
              data-testid="link-referencia"
              style={{ display: "block", position: "relative", aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", border: `2px solid ${TOM.laranja.border}`, backgroundColor: TOM.laranja.bg }}
            >
              <img loading="lazy" decoding="async" 
                src={refs[0]} alt="Referência do solicitante"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            </a>
            {refs.length > 1 && (
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                {refs.slice(1).map((u, k) => (
                  <a key={`${u}-${k}`} href={hrefSeguro(u)} target="_blank" rel="noopener noreferrer"
                    title={`Abrir referência ${k + 2} de ${refs.length}`}
                    data-testid={`link-referencia-${k + 2}`}
                    style={{ display: "block", width: 56, height: 42, borderRadius: 6, overflow: "hidden", border: `1px solid ${TOM.laranja.border}`, backgroundColor: TOM.laranja.bg }}>
                    <img loading="lazy" decoding="async" src={miniatura(u)} alt={`Referência ${k + 2} do solicitante`}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  </a>
                ))}
              </div>
            )}
            <p style={{ display: "flex", alignItems: "center", gap: 5, fontSize: fsf(11), fontWeight: 700, color: T.accentText, margin: "6px 0 0" }}>
              <Paperclip aria-hidden="true" style={{ width: 11, height: 11 }} />
              {refs.length > 1 ? `Referências do solicitante (${refs.length})` : "Referência do solicitante"}
            </p>
          </div>
        )}

        {thumbUrl ? (
          <div>
            <div style={{ position: "relative", aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", border: `1px solid ${T.border}`, backgroundColor: N.n2 }}>
              <FilePreview url={thumbUrl} linkUrl={thumbUrl} objectFit="cover" />
            </div>
            <p style={{ fontSize: fsf(11), fontWeight: 700, color: T.apoio, margin: "6px 0 0" }}>
              Arte enviada{item.approvalThumbUpdatedAt ? ` · ${fmtShort(item.approvalThumbUpdatedAt)}` : ""}
            </p>
          </div>
        ) : (
          <div style={{ aspectRatio: "16/9", borderRadius: 10, border: `1px dashed ${T.bdark}`, backgroundColor: T.surface, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <FileImage aria-hidden="true" style={{ width: 24, height: 24, color: T.muted }} />
            <p style={{ fontSize: 12, color: T.apoio, margin: 0 }}>A Arte ainda não enviou</p>
          </div>
        )}

        {/* O QUE SAIU DA IMPRESSORA. Comparar isto com a arte
            aprovada ao lado é a conferência inteira — e era o que
            esta faixa fazia antes da revisão. */}
        {conferencePhotos.length > 0 && (
          <div>
            <a
              href={conferencePhotos[0]} target="_blank" rel="noopener noreferrer"
              title="Abrir a foto da conferência"
              data-testid="link-conferencia"
              style={{ display: "block", position: "relative", aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", border: `1px solid ${TOM.ciano.border}`, backgroundColor: TOM.ciano.bg }}
            >
              <img loading="lazy" decoding="async" 
                src={conferencePhotos[0]} alt="Foto da conferência da gráfica"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
              {conferencePhotos.length > 1 && (
                <span style={{ position: "absolute", bottom: 6, right: 6, backgroundColor: "rgba(14,116,144,0.92)", color: T.surface, fontSize: fsf(11), fontWeight: 700, padding: "2px 7px", borderRadius: 999 }}>
                  +{conferencePhotos.length - 1}
                </span>
              )}
            </a>
            <p style={{ display: "flex", alignItems: "center", gap: 5, fontSize: fsf(11), fontWeight: 700, color: TOM.ciano.text, margin: "6px 0 0" }}>
              <Camera aria-hidden="true" style={{ width: 11, height: 11 }} />
              Conferido pela gráfica
            </p>
          </div>
        )}
      </div>
        );
      })()}

      {thumbUrl && (
        <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
          <a href={thumbUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: T.accentText }}>
            <ExternalLink style={{ width: 11, height: 11 }} /> {friendlyFileName(thumbUrl)}
          </a>
          {item.previousApprovalThumbUrl && (
            <a href={item.previousApprovalThumbUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: T.apoio }}>
              <ExternalLink style={{ width: 11, height: 11 }} /> Versão anterior
            </a>
          )}
        </div>
      )}
    </section>
  );
}
