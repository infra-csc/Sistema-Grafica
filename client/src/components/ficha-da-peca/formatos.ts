/**
 * `new Date(x)` do jeito que o JS trata o que vem do log: null vira o
 * instante zero e ausente vira data inválida. Existe só para tipar a
 * conversão sem mudar o resultado de nenhuma conta de ordem ou de janela.
 */
export function dataDoValor(v: string | number | Date | null | undefined): Date {
  if (v === null) return new Date(0);
  if (v === undefined) return new Date(NaN);
  return new Date(v);
}

/**
 * "há 3 dias" — e não "3 dias", que não diz para que lado o tempo corre.
 * Zero vira "hoje" porque "há 0 dias" é como um relógio quebrado: tecnicamente
 * certo, ilegível.
 */
export function haQuantoTempo(dias: number): string {
  if (dias <= 0) return "hoje";
  if (dias === 1) return "há 1 dia";
  return `há ${dias} dias`;
}

/**
 * Nome legível do arquivo. Os uploads ficam no storage com UUID, que não diz
 * nada a quem lê; nesse caso vale mais dizer o que é do que mostrar o hash.
 */
export function friendlyFileName(url: string): string {
  const base = decodeURIComponent((url.split("?")[0].split("/").pop() || "").trim());
  const isUuidish = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(base)
    || (!base.includes(".") && base.length > 20);
  return isUuidish ? "Imagem enviada pela Arte" : (base || "Arquivo");
}

/** "dd/MM HH:mm" — a data curta do percurso e das linhas de arquivo. */
export const fmtShort = (d: string | Date | null | undefined) => {
  const dt = dataDoValor(d);
  return `${dt.getDate().toString().padStart(2,"0")}/${(dt.getMonth()+1).toString().padStart(2,"0")} ${dt.getHours().toString().padStart(2,"0")}:${dt.getMinutes().toString().padStart(2,"0")}`;
};
