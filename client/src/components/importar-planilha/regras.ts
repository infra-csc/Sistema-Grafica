// Regras puras da IMPORTAÇÃO DE PLANILHA: grupo, colunas, identidade e defeitos da linha.
import type { LinhaDaImportacao } from "./tipos";

/**
 * O QUE FALTA NUMA LINHA, em uma função só.
 *
 * A triagem conta com ela e a linha se pinta com ela: dois cálculos do mesmo
 * defeito divergiriam no primeiro ajuste, e o balde passaria a prometer um
 * número que a tabela não entrega.
 *
 * A gravidade separa o que impede de produzir do que só muda o caminho da
 * peça: sem medida ou sem m² a gráfica não tem o que imprimir; sem
 * patrocinador a peça entra e segue, só não passa por aprovação.
 */
/**
 * A CHAVE DE GRUPO, num lugar só.
 *
 * A barra lateral conta grupos e a tabela desenha seções: se cada uma
 * derivar a chave do seu jeito, o número e as seções divergem no primeiro
 * ajuste. Quando a reimportação mostrou "145 grupos", os dois concordavam
 * (145 = 145) — o erro estava no parser, que mandava o ID como tipo. Mas o
 * acordo era coincidência de implementação; agora é contrato.
 */
export const tipoDoGrupo = (row: Pick<LinhaDaImportacao, 'type'> | null | undefined): string => String(row?.type || '').trim() || '—';

/**
 * AS COLUNAS DA TABELA, com largura. `table-layout: fixed` + <colgroup>:
 * a soma das larguras É a largura da tabela, então o painel ROLA quando
 * não cabe em vez de a última coluna sair pela borda. Patrocinador é a
 * coluna mais larga (contador, chips, "+ Adicionar", "Todos") e vem
 * ANTES de Obs — no fim, sem largura garantida, era a que o corte comia.
 */
export function colunasDaImportacao(mostrarVisual: boolean) {
  const cols: { label: string; tip: string; w: number }[] = [
    { label: 'Descrição', tip: 'Nome da peça', w: 200 },
    { label: 'Qtd', tip: 'Quantidade', w: 56 },
  ];
  if (mostrarVisual) cols.push({ label: 'Visual', tip: 'VIS. — o que se vê na peça montada (m)', w: 112 });
  cols.push(
    { label: 'Arquivo', tip: 'ARQ. — o que a impressora recebe (m); o m² sai daqui', w: 120 },
    { label: 'M²', tip: 'Metros quadrados calculados', w: 72 },
    { label: 'Material', tip: '', w: 104 },
    { label: 'Acabamento', tip: '', w: 104 },
    { label: 'Patrocinador', tip: 'Sugestão automática — clique para alterar', w: 250 },
    { label: 'Obs', tip: 'Observações', w: 150 },
    { label: '', tip: '', w: 36 },
  );
  return cols;
}

export type DefeitoImport =
  | 'qtd-invalida' | 'repetida-na-planilha'
  | 'sem-patrocinador' | 'sem-medida' | 'm2-nao-fecha' | 'sem-material' | 'ja-existe';

/** Quantidade que o servidor aceita: inteiro a partir de 1. */
export const quantidadeValida = (v: unknown): boolean => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isInteger(n) && n >= 1;
};

/**
 * A IDENTIDADE DE UMA LINHA DENTRO DA PLANILHA: tipo, descrição e medida de
 * arquivo (espelho de chaveNaPlanilha em server/services/xlsxImport.ts). Dois
 * "Testeira" de tamanhos diferentes são peças diferentes; iguais em tudo, é
 * linha copiada duas vezes — e a gráfica imprimiria as duas.
 */
export function chaveNaPlanilha(row: Pick<LinhaDaImportacao, 'type' | 'description' | 'fileWidth' | 'fileHeight'>): string {
  const medida = (v: unknown) => { const n = parseFloat(String(v ?? '')); return Number.isFinite(n) ? n.toFixed(2) : ''; };
  return chaveDaPeca(row) + '|' + medida(row.fileWidth) + '|' + medida(row.fileHeight);
}

/** Para cada linha que repete uma anterior da MESMA planilha, a linha repetida. */
export function repetidasNaPlanilha(rows: Pick<LinhaDaImportacao, '_id' | 'linha' | 'type' | 'description' | 'fileWidth' | 'fileHeight'>[]): Map<string, number> {
  const primeira = new Map<string, number>();
  const repete = new Map<string, number>();
  rows.forEach((r, i) => {
    const k = chaveNaPlanilha(r);
    const linha = typeof r.linha === 'number' && Number.isInteger(r.linha) ? r.linha : i + 1;
    const antes = primeira.get(k);
    if (antes === undefined) primeira.set(k, linha);
    else repete.set(r._id, antes);
  });
  return repete;
}

/**
 * A IDENTIDADE DE UMA PEÇA, para efeito de reimportação.
 *
 * Tipo + descrição, sem acento, sem caixa, sem espaço duplo. Não entra a
 * quantidade: reimportar a mesma lista com a quantidade corrigida continua
 * sendo a MESMA peça — é justamente o caso mais comum de reimportação, e
 * incluir a quantidade faria a repetida passar despercebida.
 */
export function chaveDaPeca(row: { type?: string | null; description?: string | null }): string {
  const norm = (v: unknown) => String(v ?? '')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
  return norm(row.type) + '\u0000' + norm(row.description);
}

export function defeitosDaLinha(row: LinhaDaImportacao, jaNoEvento?: Set<string>, repetidas?: Map<string, number>): DefeitoImport[] {
  const out: DefeitoImport[] = [];
  // Quantidade inválida IMPEDE a importação (o servidor recusa a linha).
  if (!quantidadeValida(row.quantity)) out.push('qtd-invalida');
  if (repetidas?.has(row._id)) out.push('repetida-na-planilha');
  // A repetida vem primeiro: é a única que não se conserta editando a
  // célula — se resolve tirando a linha, e por isso precisa ser lida antes.
  if (jaNoEvento?.has(chaveDaPeca(row))) out.push('ja-existe');
  if ((row.suggestedSponsorIds ?? []).length === 0) out.push('sem-patrocinador');
  // Medida de ARQUIVO — a visual não serve para produzir.
  const temMedida = !!(parseFloat(String(row.fileWidth)) && parseFloat(String(row.fileHeight)));
  if (!temMedida) out.push('sem-medida');
  if (!(parseFloat(String(row.calculatedM2)) > 0)) out.push('m2-nao-fecha');
  if (!String(row.material ?? '').trim() || !String(row.finish ?? '').trim()) out.push('sem-material');
  return out;
}

/**
 * Vermelho custa dinheiro; âmbar muda o caminho da peça.
 *
 * Sem medida ou sem m², a gráfica não tem o que imprimir. Repetida, ela
 * imprime DUAS VEZES e cobra as duas — o mesmo prejuízo por outro caminho.
 */
export const DEFEITO_GRAVE = new Set<DefeitoImport>(['qtd-invalida', 'repetida-na-planilha', 'sem-medida', 'm2-nao-fecha', 'ja-existe']);

export const DEFEITO_LABEL: Record<DefeitoImport, string> = {
  'qtd-invalida': 'Quantidade inválida',
  'repetida-na-planilha': 'Repetida na planilha',
  'sem-patrocinador': 'Sem patrocinador',
  'sem-medida': 'Sem medida',
  'm2-nao-fecha': 'M² não fecha',
  'sem-material': 'Sem material/acab.',
  'ja-existe': 'Já está no evento',
};

/** A frase por extenso de cada defeito — o `title` da linha. */
export const DEFEITO_FRASE: Record<DefeitoImport, string> = {
  'qtd-invalida': 'quantidade mínima é 1 (número inteiro)',
  'repetida-na-planilha': 'tipo, descrição e medida iguais a outra linha desta planilha',
  'sem-patrocinador': 'entra sem marca e não vai para aprovação',
  'sem-medida': 'a planilha não trouxe largura ou altura de arquivo',
  'm2-nao-fecha': 'o m² veio zerado ou não pôde ser calculado',
  'sem-material': 'a gráfica não consegue produzir sem material e acabamento',
  'ja-existe': 'uma peça com este mesmo tipo e descrição já foi importada para este evento',
};
