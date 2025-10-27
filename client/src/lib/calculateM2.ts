/**
 * Calcula os metros quadrados (m²) de um item baseado nas dimensões visuais.
 * 
 * Fórmula: m² = largura × altura × quantidade
 * 
 * @param quantity - Quantidade de itens
 * @param visualWidth - Largura visual em metros
 * @param visualHeight - Altura visual em metros
 * @returns Metros quadrados calculados
 */
export function calculateM2(
  quantity: number,
  visualWidth: number,
  visualHeight: number
): number {
  const q = quantity || 0;
  const w = visualWidth || 0;
  const h = visualHeight || 0;
  
  return q * w * h;
}

// Versão para strings (usada no bulk entry)
export function calculateM2FromStrings(
  quantity: string,
  visualWidth: string,
  visualHeight: string
): number {
  return calculateM2(
    parseFloat(quantity) || 0,
    parseFloat(visualWidth) || 0,
    parseFloat(visualHeight) || 0
  );
}
