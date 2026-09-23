// REGISTROS DA GRÁFICA — andamento, tubo, fotos extras da conferência e da entrega.
import { AlertTriangle, Camera } from "lucide-react";
import { RegistrosDeTubos } from "@/components/registros-de-tubos";
import { T, TOM, FONT } from "@/lib/theme";
import { CARTAO, TITULO_SECAO } from "./estilos";
import { PhotoGrid } from "./fotos";
import type { ItemDaFicha } from "./tipos";

export function SecaoRegistrosDaGrafica({ item, rawStatus, conferencePhotos, deliveryPhotos }: {
  item: ItemDaFicha;
  rawStatus: string;
  /** Fotos da conferência e da entrega (galeria + campo antigo), já convertidas. */
  conferencePhotos: string[];
  deliveryPhotos: string[];
}) {
  // ── Andamento na gráfica ──────────────────────────────────────────────────
  const andamentoGrafica = ([
    ["Reaproveitado", item.reuseQty,        TOM.esmeralda.text],
    ["Impresso",      item.quantityProduced,TOM.roxo.text],
    ["Conferido",     item.conferredQty,    TOM.ciano.text],
    ["Entregue",      item.deliveredQty,    TOM.esmeralda.text],
  ] as const).filter(([, v]) => (v ?? 0) > 0);

  const isDeliveredItem  = ["delivered", "entregue"].includes(rawStatus);
  // Entregue POR VOLUME com fotos da embalagem (revisão de 22/09): o comprovante
  // da entrega é opcional por decisão do dono — as fotos do tubo/da embalagem
  // documentam o material, então não é "sem comprovante". `tuboFechadoEm` só
  // existe quando o volume ganhou foto. Peça antiga, sem volume nem foto,
  // continua acusando como antes.
  const entregueComFotoDaEmbalagem = !!item.tuboId && !!item.tuboFechadoEm;
  const missingDeliveryProof = isDeliveredItem && deliveryPhotos.length === 0 && !entregueComFotoDaEmbalagem;
  const temRegistrosGrafica = conferencePhotos.length > 0 || deliveryPhotos.length > 0
    || !!item.conferenceNotes || !!item.deliveryNotes
    || missingDeliveryProof || andamentoGrafica.length > 0 || !!item.receivedBy || !!item.tuboId;

  if (!temRegistrosGrafica) return null;

  // Ausente conta como zero nas comparações do cabeçalho da seção.
  const entregues = item.deliveredQty ?? 0;
  const quantidade = item.quantity ?? 0;

  return (
    <section data-testid="section-registros-grafica">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <h3 style={TITULO_SECAO}>Registros da gráfica</h3>
        {entregues > 0 && quantidade > 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, color: entregues < quantidade ? T.accentText : TOM.sucesso.text }}>
            {item.deliveredQty} de {item.quantity} entregues
          </span>
        )}
      </div>

      <div style={{ ...CARTAO, padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* O TUBO COMO UM TODO (dono, 21/09): a peça que foi em tubo mostra o
            registro do tubo — a quem, quando, as fotos e TUDO o que foi junto. */}
        {item.tuboId && <RegistrosDeTubos itemId={item.id} />}
        {andamentoGrafica.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 22px" }}>
            {andamentoGrafica.map(([label, valor, cor]) => (
              <div key={label}>
                <p style={{ fontSize: 10, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>{label}</p>
                <p style={{ fontFamily: FONT.mono, fontSize: 15, fontWeight: 700, color: cor, margin: "2px 0 0" }}>
                  {valor}<span style={{ color: T.second, fontWeight: 400 }}>/{item.quantity}</span>
                </p>
              </div>
            ))}
            {item.receivedBy && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>Recebido por</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: "2px 0 0" }}>{item.receivedBy}</p>
              </div>
            )}
          </div>
        )}

        {/* A FOTO DA CONFERÊNCIA MORA AO LADO DA ARTE — e só lá.
            Ela já aparece na faixa de comparação (é a conferência
            inteira: o que saiu da impressora contra o que foi
            aprovado), e aparecia DE NOVO aqui embaixo, a mesma
            imagem duas vezes na mesma ficha. Aqui ficam só o
            que NÃO está lá em cima: as fotos EXTRAS (a segunda em
            diante, que a faixa resume como "+N") e a observação. */}
        {(conferencePhotos.length > 1 || item.conferenceNotes) && (
          <div>
            <p style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: TOM.ciano.text, margin: "0 0 8px" }}>
              <Camera aria-hidden="true" style={{ width: 12, height: 12 }} />
              Conferência{conferencePhotos.length > 1 ? ` · mais ${conferencePhotos.length - 1} ${conferencePhotos.length - 1 === 1 ? "foto" : "fotos"}` : ""}
            </p>
            {conferencePhotos.length > 1 && <PhotoGrid urls={conferencePhotos.slice(1)} alt="Foto da conferência" />}
            {item.conferenceNotes && (
              <p style={{ fontSize: 12, color: T.apoio, fontStyle: "italic", lineHeight: 1.5, margin: "8px 0 0" }}>"{item.conferenceNotes}"</p>
            )}
          </div>
        )}

        {(deliveryPhotos.length > 0 || item.deliveryNotes) && (
          <div>
            <p style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: TOM.esmeralda.text, margin: "0 0 8px" }}>
              <Camera aria-hidden="true" style={{ width: 12, height: 12 }} />
              Entrega{deliveryPhotos.length > 1 ? ` · ${deliveryPhotos.length} fotos` : ""}
            </p>
            {deliveryPhotos.length > 0 && <PhotoGrid urls={deliveryPhotos} alt="Foto da entrega" />}
            {item.deliveryNotes && (
              <p style={{ fontSize: 12, color: T.apoio, fontStyle: "italic", lineHeight: 1.5, margin: "8px 0 0" }}>"{item.deliveryNotes}"</p>
            )}
          </div>
        )}

        {missingDeliveryProof && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: 8, padding: "10px 12px" }}>
            <AlertTriangle aria-hidden="true" style={{ width: 14, height: 14, color: TOM.alerta.text, flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: TOM.alerta.text, margin: 0 }}>Entregue sem comprovante fotográfico</p>
              <p style={{ fontSize: 12, color: TOM.alerta.text, margin: "2px 0 0", lineHeight: 1.45 }}>
                A foto da entrega é opcional{item.receivedBy ? ` — consta apenas o recebimento por ${item.receivedBy}` : ""}.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
