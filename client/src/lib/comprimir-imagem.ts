// ─────────────────────────────────────────────────────────────────────────────
// COMPRESSÃO DE FOTO NA CAPTURA (UX, 27/08). A câmera do celular do galpão
// gera 5–8 MB por foto e o upload trava no Wi-Fi de lá — o conferente fica
// olhando o spinner. Para foto de REGISTRO (conferência, entrega, referência
// visual), 1600px em JPEG ~0.82 é indistinguível na tela e sobe em ~300 KB.
//
// O que NÃO passa por aqui: PDF e qualquer arquivo não-imagem (retornam
// intactos), imagem já pequena (abaixo do piso), e os uploads de ARTE da
// página da Arte — aqueles têm caminho próprio (uploadFileRaw) e qualidade é
// requisito lá. Qualquer falha no processo devolve o arquivo ORIGINAL: o
// pior caso é o upload de ontem.
// ─────────────────────────────────────────────────────────────────────────────

const COMPRIMIVEIS = /^image\/(jpeg|png|webp)$/i;
const PISO_BYTES = 800 * 1024; // abaixo disso não vale o trabalho
const LADO_MAXIMO = 1600;
const QUALIDADE = 0.82;

export async function comprimirImagem(file: File): Promise<File> {
  try {
    if (!COMPRIMIVEIS.test(file.type) || file.size < PISO_BYTES) return file;

    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALIDADE),
    );
    // Comprimir tem de comprimir: se o resultado não ficou menor, o original vale mais.
    if (!blob || blob.size >= file.size) return file;

    const nome = file.name.replace(/\.(png|webp|jpeg|jpg)$/i, "") + ".jpg";
    return new File([blob], nome, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}
