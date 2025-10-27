/**
 * Calcula os metros quadrados (m²) de um item baseado na medida do arquivo.
 * 
 * Fórmula: m² = largura × altura × quantidade
 * 
 * @param quantity - Quantidade de itens
 * @param fileWidth - Largura do arquivo em metros
 * @param fileHeight - Altura do arquivo em metros
 * @returns Metros quadrados calculados
 */
export function calculateM2(
  quantity: number,
  fileWidth: number,
  fileHeight: number
): number {
  const q = quantity || 0;
  const w = fileWidth || 0;
  const h = fileHeight || 0;
  
  return q * w * h;
}

// Versão para strings (usada no bulk entry)
export function calculateM2FromStrings(
  quantity: string,
  fileWidth: string,
  fileHeight: string
): number {
  return calculateM2(
    parseFloat(quantity) || 0,
    parseFloat(fileWidth) || 0,
    parseFloat(fileHeight) || 0
  );
}
