// ─────────────────────────────────────────────────────────────────────────────
// ESTOQUE — A BARRA DA SITUAÇÃO (redesign 06/10).
//
// "30 no galpão (4 separadas) · 4 em uso" é a frase certa, mas o olho não
// compara frases numa coluna de quarenta materiais. A barra mostra a mesma
// conta em proporção: verde é o que está livre no galpão, azul o que está no
// galpão mas separado/reservado, laranja o que saiu, âmbar o que está em
// reparo. A frase continua ao lado (é ela que o leitor de tela lê) — a barra é
// decorativa (aria-hidden) e não acrescenta dado nenhum.
// ─────────────────────────────────────────────────────────────────────────────
import { N, TOM } from "@/lib/theme";

const ORDEM: { chave: string; cor: string }[] = [
  { chave: "LIVRE", cor: TOM.sucesso.dot },
  { chave: "SEPARADA", cor: TOM.info.dot },
  { chave: "EM_USO", cor: TOM.laranja.dot },
  { chave: "EM_MANUTENCAO", cor: TOM.alerta.dot },
  { chave: "AGUARDANDO_TRIAGEM", cor: TOM.alerta.border },
  { chave: "DESCARTADO", cor: N.n5 },
];

/** Cor da bolinha de cada situação — a mesma da barra. */
export const COR_DA_SITUACAO: Record<string, string> = {
  NO_GALPAO: TOM.sucesso.dot,
  EM_USO: TOM.laranja.dot,
  EM_MANUTENCAO: TOM.alerta.dot,
  AGUARDANDO_TRIAGEM: TOM.alerta.border,
  DESCARTADO: N.n5,
};

export function BarraDeSituacao({ porSituacao, separadas = 0, largura = "100%", altura = 6 }: {
  porSituacao: Record<string, number>;
  /** Unidades no galpão que não estão livres (reservadas ou separadas). */
  separadas?: number;
  largura?: number | string;
  altura?: number;
}) {
  const galpao = porSituacao.NO_GALPAO ?? 0;
  const partes: Record<string, number> = {
    LIVRE: Math.max(0, galpao - separadas),
    SEPARADA: Math.min(galpao, separadas),
    EM_USO: porSituacao.EM_USO ?? 0,
    EM_MANUTENCAO: porSituacao.EM_MANUTENCAO ?? 0,
    AGUARDANDO_TRIAGEM: porSituacao.AGUARDANDO_TRIAGEM ?? 0,
    DESCARTADO: porSituacao.DESCARTADO ?? 0,
  };
  const total = Object.values(partes).reduce((s, n) => s + n, 0);
  if (total === 0) return null;
  return (
    <div aria-hidden="true" className="est-barra" style={{ width: largura, height: altura }}>
      {ORDEM.filter((p) => partes[p.chave] > 0).map((p) => (
        <span key={p.chave} style={{ flexGrow: partes[p.chave], backgroundColor: p.cor }} />
      ))}
    </div>
  );
}
