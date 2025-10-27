/**
 * Calcula os metros quadrados (m²) de um item baseado nas dimensões fornecidas.
 * 
 * Prioridade de cálculo:
 * 1. Se fileWidth e fileHeight estiverem disponíveis, usa-os
 * 2. Caso contrário, usa area × visual como fallback
 * 
 * @param quantity - Quantidade de itens
 * @param fileWidth - Largura do arquivo em pixels (opcional)
 * @param fileHeight - Altura do arquivo em pixels (opcional)
 * @param area - Área em metros (fallback)
 * @param visual - Visual em metros (fallback)
 * @returns Metros quadrados calculados
 */

// Fator de conversão de pixels para metros
// TODO: Confirmar valor correto com stakeholder
// Valor atual: 1.000.000 pixels² = 1 m²  (equivalente a ~1000 px/metro ou ~25.4 DPI)
const PIXELS_TO_M2_FACTOR = 1000000;

export function calculateM2(
  quantity: number,
  fileWidth: number | null | undefined,
  fileHeight: number | null | undefined,
  area: number,
  visual: number
): number {
  const q = quantity || 0;
  const fw = fileWidth || 0;
  const fh = fileHeight || 0;
  
  // Prioridade: usar fileWidth × fileHeight se disponíveis
  if (fw > 0 && fh > 0) {
    // Conversão de pixels² para m²
    return q * (fw * fh) / PIXELS_TO_M2_FACTOR;
  }
  
  // Fallback: area × visual (em metros)
  const a = area || 0;
  const v = visual || 0;
  return q * a * v;
}

// Versão para strings (usada no bulk entry)
export function calculateM2FromStrings(
  quantity: string,
  fileWidth: string,
  fileHeight: string,
  area: string,
  visual: string
): number {
  return calculateM2(
    parseFloat(quantity) || 0,
    fileWidth ? parseFloat(fileWidth) : null,
    fileHeight ? parseFloat(fileHeight) : null,
    parseFloat(area) || 0,
    parseFloat(visual) || 0
  );
}
