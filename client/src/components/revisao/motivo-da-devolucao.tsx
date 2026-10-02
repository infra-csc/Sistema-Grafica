// As duas peças que as duas devoluções (da ficha e em lote) compartilham: a
// escolha de PARA ONDE a peça volta e o contador do motivo.
import { useIsMobile } from "@/hooks/use-mobile";
import { T, TOM, FS, R } from "@/lib/theme";
import { letra } from "./estilos";
import { MOTIVO_MIN } from "./regras";
import type { DestinoDaDevolucao } from "./tipos";

const OPCOES_DE_DESTINO: Array<{ valor: DestinoDaDevolucao; titulo: string; desc: string }> = [
  { valor: "finalizacao", titulo: "Só o arquivo final",
    desc: "A arte está certa — a peça volta para a Finalização e a aprovação do patrocinador continua valendo." },
  { valor: "arte", titulo: "A arte inteira",
    desc: "Volta para o começo da Arte. O thumb aprovado é descartado e o patrocinador terá de aprovar de novo." },
];

/**
 * PARA ONDE A PEÇA VOLTA — as duas opções lado a lado, com a consequência
 * escrita em cada uma. Não é um <select>: são duas escolhas e a diferença
 * entre elas custa caro (uma joga fora a aprovação do patrocinador), então as
 * duas ficam à vista sem precisar abrir nada. A opção destrutiva NÃO é a
 * padrão e avisa o que perde.
 */
export function SeletorDeDestino({ destino, aoEscolher }: {
  destino: DestinoDaDevolucao;
  aoEscolher: (d: DestinoDaDevolucao) => void;
}) {
  const celular = useIsMobile();
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ margin: "0 0 6px", fontSize: letra(FS.small, celular), fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.apoio }}>
        O que a Arte precisa refazer?
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {OPCOES_DE_DESTINO.map(op => {
          const ativo = destino === op.valor;
          return (
            <button
              key={op.valor}
              type="button"
              onClick={() => aoEscolher(op.valor)}
              aria-pressed={ativo}
              data-testid={`destino-${op.valor}`}
              style={{
                textAlign: "left", cursor: "pointer", borderRadius: R.md, padding: "9px 11px", minHeight: 44, width: "100%",
                border: `1.5px solid ${ativo ? T.accentText : T.border}`,
                background: ativo ? TOM.laranja.bg : T.surface,
                display: "flex", gap: 9, alignItems: "flex-start", font: "inherit",
              }}
            >
              <span aria-hidden="true" style={{
                width: 14, height: 14, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                border: `1.5px solid ${ativo ? T.accentText : T.bdark}`,
                background: ativo ? T.accentText : "transparent",
                boxShadow: ativo ? `inset 0 0 0 2.5px ${T.surface}` : "none",
              }} />
              <span style={{ minWidth: 0 }}>
                {/* #c2410c sobre #fff7ed = 4,88:1 ✓ · #57534e sobre branco = 7,03:1 ✓ */}
                <span style={{ display: "block", fontSize: FS.body, fontWeight: 700, color: ativo ? T.accentText : T.text }}>
                  {op.titulo}
                </span>
                <span style={{ display: "block", fontSize: letra(FS.small, celular), color: T.apoio, lineHeight: 1.4, marginTop: 1 }}>
                  {op.desc}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Quanto falta para o motivo valer. O botão travado dizia o porquê só no
 * `title` — que não aparece em botão desabilitado nem no toque. A conta fica
 * à vista enquanto se digita, com a mesma régua de `motivoCurto`.
 */
export function ContadorDoMotivo({ texto }: { texto: string }) {
  const escrito = texto.trim().replace(/\s+/g, " ").length;
  const falta = Math.max(0, MOTIVO_MIN - escrito);
  // CAMPO AINDA VAZIO: a régua em tom neutro, não o âmbar de pendência — o
  // diálogo abria já "reclamando" de algo que a pessoa nem tinha começado.
  // Começou a escrever, a conta passa a valer (e a cor com ela).
  const cor = escrito === 0 ? T.apoio : falta > 0 ? TOM.alerta.text : TOM.esmeralda.text;
  return (
    <p aria-live="polite" data-testid="contador-do-motivo" style={{ margin: "6px 0 0", fontSize: FS.meta, lineHeight: 1.4, color: cor }}>
      {escrito === 0
        ? `Pelo menos ${MOTIVO_MIN} caracteres — a Arte precisa saber o que corrigir.`
        : falta > 0
        ? `${falta === 1 ? "Falta 1 caractere" : `Faltam ${falta} caracteres`} — a Arte precisa saber o que corrigir.`
        : "Motivo pronto."}
    </p>
  );
}

/**
 * O RÓTULO VISÍVEL do motivo — o campo só tinha o placeholder (que some ao
 * digitar) e um aria-label. Mesmo desenho do "O que a Arte precisa refazer?"
 * logo acima: as duas perguntas do diálogo se leem como um formulário.
 */
export function RotuloDoMotivo({ htmlFor, children }: { htmlFor: string; children: string }) {
  const celular = useIsMobile();
  return (
    <label htmlFor={htmlFor} style={{ display: "block", margin: "0 0 6px", fontSize: letra(FS.small, celular), fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.apoio }}>
      {children}
    </label>
  );
}
