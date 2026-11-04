// ─────────────────────────────────────────────────────────────────────────────
// AS OBSERVAÇÕES DA PEÇA, À VISTA (dono, 30/10: "observação mais fácil de
// visualizar na conferência"; "no conferir, embalar e entrega tem que ter
// observação"). Um bloco só, em âmbar e com o texto INTEIRO, para quem está com
// a peça na mão: o que a Solicitação escreveu e o que a conferência anotou —
// quem embala e quem entrega lê o que veio antes.
// ─────────────────────────────────────────────────────────────────────────────
import { AlertCircle } from "lucide-react";
import { FS, FW, R, TOM } from "@/lib/theme";

export type PecaComObservacoes = {
  id?: string;
  observations?: string | null;
  conferenceNotes?: string | null;
  avisoDaConferencia?: string | null;
};

/** As linhas do bloco (pura). Vazia = nada a mostrar. */
export function linhasDeObservacao(peca: PecaComObservacoes, extras: { rotulo: string; texto?: string | null }[] = []): { rotulo: string; texto: string }[] {
  return [
    { rotulo: "Aviso sobre o arquivo", texto: peca.avisoDaConferencia },
    { rotulo: "Observação da peça", texto: peca.observations },
    { rotulo: "Na conferência", texto: peca.conferenceNotes },
    ...extras,
  ].flatMap(({ rotulo, texto }) => (texto?.trim() ? [{ rotulo, texto: texto.trim() }] : []));
}

export function ObservacoesDaPeca({ peca, extras, compacto = false, identificacao, testId }: {
  peca: PecaComObservacoes;
  /** Outras anotações do mesmo contexto (ex.: a da embalagem, que é do volume). */
  extras?: { rotulo: string; texto?: string | null }[];
  /** Dentro de lista: mais baixo, mesmo tamanho de letra. */
  compacto?: boolean;
  /** Com várias peças na tela: de qual peça é a anotação (#0012). */
  identificacao?: string | null;
  testId?: string;
}) {
  const linhas = linhasDeObservacao(peca, extras);
  if (linhas.length === 0) return null;
  return (
    <div
      data-testid={testId ?? (peca.id ? `observacoes-da-peca-${peca.id}` : "observacoes-da-peca")}
      style={{
        display: "flex", gap: 8, alignItems: "flex-start", flexShrink: 0,
        padding: compacto ? "6px 8px" : "10px 12px",
        background: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: R.md,
      }}
    >
      <AlertCircle aria-hidden="true" style={{ width: 15, height: 15, color: TOM.alerta.text, flexShrink: 0, marginTop: 2 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        {identificacao && <strong style={{ fontSize: FS.meta, fontWeight: FW.rotulo, color: TOM.alerta.text }}>{identificacao}</strong>}
        {linhas.map(({ rotulo, texto }) => (
          <p key={rotulo} style={{ margin: 0, fontSize: compacto ? FS.meta : FS.read, lineHeight: 1.4, color: TOM.alerta.text, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
            <strong style={{ fontWeight: FW.rotulo }}>{rotulo}:</strong> {texto}
          </p>
        ))}
      </div>
    </div>
  );
}
