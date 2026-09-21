/**
 * O THUMB SÓ PODE SER UM OBJETO DO NOSSO STORAGE (revisão de 21/09).
 *
 * As três rotas que gravam thumb (submit-for-approval, update-thumb,
 * sponsor-approvals/resubmit, em items.ts) aceitavam qualquer string — um
 * link para fora viraria imagem quebrada na aprovação do patrocinador, ou
 * pior, um endereço que ninguém controla. Aqui a régua: a URL tem de ser
 * `/objects/...`; a forma crua do bucket
 * (`https://storage.googleapis.com/.../.private/<x>`) é aceita e normalizada
 * para `/objects/<x>`, igual ao `convertGCSUrlToLocalPath` da tela — é o que
 * o uploader devolve. Devolve null quando não serve.
 *
 * O CAMINHO DO ARQUIVO FINAL NÃO ENTRA nesta régua: por regra da casa ele é
 * um caminho de rede ("…\Rolo_Ministerio.tif"), não um upload.
 *
 * Módulo próprio, e puro, para o teste importar sem arrastar a árvore de
 * items.ts (exceljs, storage, db).
 */
export function urlDeThumbValida(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;
  if (v.startsWith("/objects/") && v.length > "/objects/".length) return v;
  if (v.startsWith("https://storage.googleapis.com/")) {
    const m = v.match(/\/\.private\/(.+?)(?:\?|$)/);
    if (m) return `/objects/${m[1]}`;
  }
  return null;
}

export const ERRO_THUMB_FORA_DO_STORAGE =
  "O thumb precisa ser um arquivo enviado pelo app (endereço /objects/…). Suba a imagem ou use \"Buscar arte já feita\".";
