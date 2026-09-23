// As duas peças que as duas devoluções (da ficha e em lote) compartilham: a
// escolha de PARA ONDE a peça volta e o contador do motivo.
import { T, TOM, FS, R } from "@/lib/theme";
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
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ margin: "0 0 6px", fontSize: FS.small, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.apoio }}>
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
                textAlign: "left", cursor: "pointer", borderRadius: R.md, padding: "9px 11px",
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
                <span style={{ display: "block", fontSize: FS.small, color: T.apoio, lineHeight: 1.4, marginTop: 1 }}>
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
  const falta = Math.max(0, MOTIVO_MIN - texto.trim().replace(/\s+/g, " ").length);
  return (
    <p aria-live="polite" style={{ margin: "4px 0 0", fontSize: FS.meta, lineHeight: 1.4, color: falta > 0 ? TOM.alerta.text : TOM.esmeralda.text }}>
      {falta > 0 ? `Faltam ${falta} ${falta === 1 ? "caractere" : "caracteres"} — a Arte precisa saber o que corrigir.` : "Motivo pronto."}
    </p>
  );
}
