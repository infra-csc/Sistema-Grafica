// ─────────────────────────────────────────────────────────────────────────────
// PRODUÇÃO INTERNA — o SELO e o bloco das INSTRUÇÕES (dono, 02/10: "essa peça
// tem que indicar NA SOLICITAÇÃO que vai direto para a Gráfica"; "as
// instruções aparecem em destaque para a Gráfica").
//
// Um componente só para as telas não inventarem cada uma o seu:
//   · na lista da Solicitação (Detalhe do Evento) o selo diz "Direto para a
//     Gráfica" — é o que vai acontecer no envio;
//   · na Gráfica, no Painel e na ficha diz "Produção interna" — é o que a peça
//     É (não passou pela Arte), e explica por que não há thumb aprovado.
//
// Cor: o azul-céu (TOM.ceu) — informação fria, sem o peso de alerta. O âmbar
// já é da observação, o vermelho da prioridade e o laranja do complemento; a
// instrução não pode se confundir com nenhum deles.
// ─────────────────────────────────────────────────────────────────────────────
import type { CSSProperties } from "react";
import { Factory, ClipboardList } from "lucide-react";
import { Selo } from "@/components/ui/selo";
import { FS, FW, R, T, TOM, TOM_FORTE } from "@/lib/theme";
import { ROTULO_DIRETO_PARA_A_GRAFICA, ROTULO_PRODUCAO_INTERNA } from "@shared/producao-interna";

type PecaComMarca = {
  id?: string;
  producaoInterna?: boolean | null;
  instrucoesGrafica?: string | null;
  finalFileUrl?: string | null;
};

/**
 * O selo da peça marcada. `onde="lista"` (Solicitação, antes do envio) diz
 * "Direto para a Gráfica"; o resto diz "Produção interna". Não renderiza nada
 * na peça comum — pode ser posto em qualquer linha sem `if` em volta.
 */
export function SeloProducaoInterna({ peca, onde = "grafica", tamanho = "sm", style }: {
  peca: PecaComMarca | null | undefined;
  onde?: "lista" | "grafica";
  tamanho?: "sm" | "md";
  style?: CSSProperties;
}) {
  if (!peca?.producaoInterna) return null;
  const rotulo = onde === "lista" ? ROTULO_DIRETO_PARA_A_GRAFICA : ROTULO_PRODUCAO_INTERNA;
  const semArquivo = !peca.finalFileUrl;
  const dica = onde === "lista"
    ? "Peça de produção interna: no envio da lista ela vai direto para a Gráfica, sem Vinculação, Arte, Aprovação nem Revisão Final."
    : `Produção interna — veio direto da Solicitação, sem passar pela Arte.${semArquivo ? " Sem arquivo: faça pelas instruções." : ""}`;
  return (
    <Selo
      forma="retangulo"
      tamanho={tamanho}
      icone={Factory}
      cores={TOM.ceu}
      title={dica}
      aria-label={dica}
      data-testid={peca.id ? `selo-producao-interna-${peca.id}` : "selo-producao-interna"}
      style={{ padding: "2px 8px", ...style }}
    >
      {rotulo}
    </Selo>
  );
}

/**
 * O indicador de ARQUIVO da peça de produção interna: sem arquivo final não é
 * erro — é "faça pelas instruções". Devolve null na peça comum (a tela segue
 * com o indicador dela).
 */
export function fraseDoArquivoDaProducaoInterna(peca: PecaComMarca | null | undefined): string | null {
  if (!peca?.producaoInterna) return null;
  return peca.finalFileUrl ? "Produção interna — com arquivo" : "Produção interna — ver instruções";
}

/**
 * AS INSTRUÇÕES EM DESTAQUE — o bloco que a Gráfica lê para fazer a peça.
 * Texto inteiro (quebras de linha mantidas), letra de leitura (14px) e faixa
 * forte à esquerda: na fila, é a informação que substitui o arquivo.
 * `compacto` é a versão da linha da tabela (uma faixa, sem caixa).
 */
export function InstrucoesParaAGrafica({ peca, compacto = false, style }: {
  peca: PecaComMarca | null | undefined;
  compacto?: boolean;
  style?: CSSProperties;
}) {
  const texto = peca?.instrucoesGrafica?.trim();
  if (!peca?.producaoInterna || !texto) return null;
  const semArquivo = !peca.finalFileUrl;
  return (
    <div
      role="note"
      aria-label="Instruções para a Gráfica"
      data-testid={peca.id ? `instrucoes-grafica-${peca.id}` : "instrucoes-grafica"}
      style={{
        display: "flex", gap: 8, alignItems: "flex-start",
        background: TOM_FORTE.ceu.bg,
        border: compacto ? "none" : `1px solid ${TOM_FORTE.ceu.border}`,
        borderLeft: `4px solid ${TOM.ceu.dot}`,
        borderRadius: compacto ? 0 : R.md,
        padding: compacto ? "8px 12px" : "10px 12px",
        ...style,
      }}
    >
      <ClipboardList aria-hidden="true" style={{ width: 16, height: 16, color: TOM_FORTE.ceu.text, flexShrink: 0, marginTop: 1 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: FS.meta, fontWeight: FW.rotulo, letterSpacing: "0.06em", textTransform: "uppercase", color: TOM_FORTE.ceu.text }}>
          Instruções para a Gráfica{semArquivo ? " · sem arquivo" : ""}
        </div>
        <div style={{ fontSize: FS.read, color: T.text, lineHeight: 1.45, whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginTop: 2 }}>
          {texto}
        </div>
      </div>
    </div>
  );
}
