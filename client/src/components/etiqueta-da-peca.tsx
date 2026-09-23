// A ETIQUETA INDIVIDUAL (meia folha A4) de Etiquetas do Evento: o nome do
// evento gigante — o que se lê de longe na pilha —, a arte, a descrição, o
// código e a quantidade, com o volume (tubo) quando há.
import { miniatura } from "@/lib/miniatura";
import { infoDoVolume, type EtiquetaIndividual, type PecaComTubo } from "@/lib/etiqueta-lista";
import { FONT, T } from "@/lib/theme";
import type { EventoDaPeca, PecaDaFila } from "@/components/grafica/tipos";

/** A peça de GET /api/items/:eventId — o mesmo enrich da fila da Gráfica, com
 *  os volumes já entregues (services/tubosDaPeca.ts) que a etiqueta também lê. */
export type PecaDoEvento = PecaDaFila & Pick<PecaComTubo, "tuboVolumesEntregues">;

export const dataBR = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }) : null;

export function EtiquetaDaPeca({ e, i, testid, event, logo, usarLogo, gigante, prefixo, nome }: {
  e: EtiquetaIndividual<PecaDoEvento>;
  /** Posição na folha: a primeira leva a linha de corte embaixo. */
  i: number;
  testid: string;
  event: EventoDaPeca | undefined;
  logo: string | null;
  usarLogo: boolean;
  gigante: string;
  prefixo: string;
  nome: string;
}) {
  const p = e.parte.peca;
  const volume = infoDoVolume(e.parte);
  return (
    <div data-testid={testid} className="etq-etiqueta" style={{
      display: "flex", alignItems: "stretch", gap: 18, padding: "22px 26px",
      // PAPEL: a linha de corte e o cinza do "Saída" ficam em hex
      // literal — não há token com o mesmo valor, e trocar mudaria
      // o que sai na impressora.
      borderBottom: i === 0 ? "2px dashed #d6d3d1" : "none",
    }}>
      {/* O NOME DO EVENTO — o que se lê de longe na pilha */}
      <div style={{ flex: "1.2 1 0", minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#78716c" }}>
          {event?.truckDepartureDate ? `Saída ${dataBR(event.truckDepartureDate)}` : " "}
        </p>
        {/* Dois níveis, como no modelo: a marca (o LOGO do book,
            quando existe; senão o texto de cima) e a palavra
            GIGANTE — é ela que se lê de longe. */}
        {/* SEM loading="lazy" nas duas imagens da etiqueta: o
            window.print() sai no mesmo clique, e imagem preguiçosa
            numa folha fora da vista (16 folhas no "uma por
            unidade") pode ir em BRANCO para o papel. */}
        {logo && usarLogo && (
          <img decoding="async" src={logo} alt="Logo do evento" data-testid="logo-etiqueta"
            style={{ maxHeight: 92, maxWidth: "60%", objectFit: "contain", alignSelf: "flex-start", margin: "4px 0 6px" }} />
        )}
        {/* Sem palavra gigante (campo apagado), o nome sai UMA vez,
            no tamanho médio — nunca duplicado. */}
        {!(logo && usarLogo) && gigante && prefixo && (
          <p style={{ margin: "4px 0 0", fontFamily: FONT.display, fontWeight: 800, fontSize: "clamp(16px, 2vw, 24px)", textTransform: "uppercase", letterSpacing: "0.01em", color: T.text, lineHeight: 1.1 }}>
            {prefixo}
          </p>
        )}
        <p style={{
          margin: "2px 0 0", fontFamily: FONT.display,
          fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em",
          color: T.text, lineHeight: 0.95,
          // Gigante de várias palavras (nome inteiro, cidade composta) desce
          // um degrau: 104px em três palavras estourava a meia folha.
          fontSize: gigante && gigante.length <= 12 ? "clamp(56px, 8vw, 104px)" : "clamp(34px, 5.2vw, 64px)",
          overflowWrap: "anywhere",
        }}>
          {gigante || prefixo || nome}
        </p>
      </div>

      {/* A PEÇA: arte + código + descrição + quantidade */}
      <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", gap: 16, alignItems: "center" }}>
        {(p.approvalThumbUrl || p.finalPreviewUrl) && (
          <img decoding="async" src={miniatura(p.approvalThumbUrl || p.finalPreviewUrl)} alt=""
            style={{ width: 150, height: 150, objectFit: "contain", borderRadius: 10, border: `1px solid ${T.border}`, backgroundColor: T.bg, flexShrink: 0 }} />
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          {/* A DESCRIÇÃO manda: é ela que
              identifica o material na pilha — "Testeira Vale Local"
              diz mais que #2219. */}
          <p style={{ margin: 0, fontFamily: FONT.display, fontSize: 30, fontWeight: 900, letterSpacing: "-0.01em", lineHeight: 1.12, color: T.text, overflowWrap: "anywhere" }}>
            {p.description || p.type}
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 16, lineHeight: 1.3 }}>
            <span style={{ color: T.strong, textTransform: "uppercase", fontWeight: 700 }}>{p.type}</span>
            {" "}<span style={{ color: T.accentText, fontWeight: 700 }}>{p.displayId}</span>
          </p>
        </div>
        <div style={{ alignSelf: "flex-start", textAlign: "right", flexShrink: 0 }}>
          {/* O VOLUME: "TUBO 2" em destaque, colado à
              quantidade; "EMBALADA" se foi sozinha; nada se não
              foi embalada. O número do tubo pode ter sido
              editado para a impressão. */}
          {volume.selo && (
            <p data-testid="tubo-na-etiqueta" style={{ margin: "0 0 6px", display: "inline-block", padding: "3px 10px", borderRadius: 6, backgroundColor: T.text, color: "#ffffff", fontFamily: FONT.display, fontSize: volume.selo.startsWith("TUBO") ? 30 : 22, fontWeight: 900, lineHeight: 1.1, whiteSpace: "nowrap" }}>
              {volume.selo}
            </p>
          )}
          <p data-testid="quantidade-na-etiqueta" style={{ margin: 0, fontFamily: FONT.display, fontSize: 30, fontWeight: 900, color: T.text, whiteSpace: "nowrap" }}>
            {e.n > 0 ? e.total : e.parte.quantidade} un.
          </p>
          {e.n === 0 && volume.detalhe && (
            <p data-testid="detalhe-do-volume" style={{ margin: "2px 0 0", fontSize: 15, fontWeight: 700, color: T.strong, whiteSpace: "nowrap" }}>
              {volume.detalhe}
            </p>
          )}
          {/* "Uma por unidade": cada volume sabe qual ele é no lote. */}
          {e.n > 0 && (
            <p style={{ margin: "2px 0 0", fontFamily: FONT.display, fontSize: 18, fontWeight: 900, color: T.accentText, whiteSpace: "nowrap" }}>
              {e.n} de {e.total}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
