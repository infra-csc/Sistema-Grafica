// A linha de progresso da peça EM IMPRESSÃO — tabela e cartão do celular usam
// a MESMA (paridade).
import { Link } from "wouter";
import { Play } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { T, TOM } from "@/lib/theme";
import { rotuloDaMaquina } from "@shared/fluxo-peca";
// A peça na impressora em UMA fonte: os números, o selo da fila, quem ocupa
// cada impressora e os links de ida e volta são os mesmos do cartão de Máquinas.
import { numerosDaImpressao, linkDaImpressoraEmMaquinas } from "@shared/progresso-da-impressao";
import { BarraDeImpressao } from "@/components/grafica/modal-impressao";
import type { PecaDaFila } from "@/components/grafica/tipos";

/**
 * A linha de progresso da peça EM IMPRESSÃO, logo abaixo da pílula de status
 * (onde as outras etapas mostram "há 6d"): impressora + "3 de 10 impressas ·
 * 7 na impressora" + uma barra fina na cor da etapa. Tabela e cartão do
 * celular usam a MESMA (paridade); `duasLinhas` quebra impressora e
 * progresso em linhas separadas para a coluna Status não alargar.
 */
export function ProgressoImpressao({ item, fonte, duasLinhas, onIniciarResto }: { item: PecaDaFila; fonte: number; duasLinhas?: boolean; /** "Iniciar o resto": a peça entrou em impressão só com PARTE das unidades. */ onIniciarResto?: () => void }) {
  // Os números saem de numerosDaImpressao (shared) — a MESMA conta do cartão
  // de Máquinas e do modal. Peça DIVIDIDA: "Impressora 1 · 1 de 3 un. /
  // Impressora 2 · 0 de 2 un." no lugar de uma impressora só.
  const n = numerosDaImpressao(item);
  const resto = n.semImpressora;
  const feitas = n.feitas;
  const teto = n.teto;
  const dividida = n.dividida;
  const maquina = n.onde;
  // A impressora vira LINK para o cartão dela em Máquinas (aba Agora, em foco,
  // com esta peça realçada) — a volta é o "Ver na Gráfica" de lá.
  const alvo = dividida ? null : item.printMachine as string | null;
  return (
    <div data-testid={`progresso-impressao-${item.id}`} style={{ marginTop: 4, maxWidth: duasLinhas ? 190 : undefined, whiteSpace: "normal" }}>
      <div style={{ fontSize: fonte, color: T.accentText, fontWeight: 700, lineHeight: 1.3, fontVariantNumeric: "tabular-nums" }}>
        {maquina && (
          <span style={{ display: duasLinhas ? "block" : "inline" }}>
            <Link href={linkDaImpressoraEmMaquinas(alvo ?? Object.keys(n.partes)[0] ?? "", item.id)} onClick={(e) => e.stopPropagation()} data-testid={`link-ver-na-maquina-${item.id}`} title="Ver esta peça no cartão da impressora, em Máquinas" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2, display: "inline-flex", alignItems: "center", minHeight: fonte >= 12 ? 44 : 24 }}>{maquina}</Link>
            {!duasLinhas && " · "}
          </span>
        )}
        <span style={{ fontWeight: 600 }}>{n.frase}</span>
        {resto > 0 && <span data-testid={`resto-sem-impressora-${item.id}`} style={{ display: "block", fontWeight: 700 }}>{resto} sem impressora</span>}
      </div>
      {resto > 0 && onIniciarResto && (
        <Botao tamanho="sm" icone={Play} onClick={(e) => { e.stopPropagation(); onIniciarResto(); }} data-testid={`button-iniciar-resto-${item.id}`} title={`Iniciar a impressão das ${resto} un. que ainda não estão em nenhuma impressora`}
          style={{ marginTop: 4, minHeight: fonte >= 12 ? 44 : 32, color: T.accentText, borderColor: TOM.laranja.border }}>
          Iniciar o resto
        </Botao>
      )}
      {/* Sem barra com 0 impressas (o trilho vazio parecia um corte); dividida = uma barra por impressora. */}
      {dividida
        ? Object.entries(n.partes).map(([m, x]) => (
          <BarraDeImpressao key={m} feitas={x.impressas} teto={x.atrib} rotulo={`${item.displayId ?? "peça"} na ${rotuloDaMaquina(m)}: ${x.impressas} de ${x.atrib} impressas`} />
        ))
        : <BarraDeImpressao feitas={feitas} teto={teto} rotulo={`${item.displayId ?? "peça"}: ${feitas} de ${teto} impressas`} />}
    </div>
  );
}
