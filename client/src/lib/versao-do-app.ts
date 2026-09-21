// ─────────────────────────────────────────────────────────────────────────────
// "HÁ UMA VERSÃO NOVA" — a aba antiga fica sabendo (21/09).
//
// O servidor manda `X-App-Versao` em toda resposta /api/* (server/versaoDoApp).
// Aqui mora a memória do cliente: o PRIMEIRO valor visto é a versão desta aba;
// qualquer valor diferente depois significa que houve deploy com a aba aberta.
// A faixa (App.tsx) só OFERECE recarregar — nunca recarrega sozinha: quem está
// no meio de um formulário perderia o que digitou.
//
// Módulo puro (sem React, sem fetch): o queryClient chama `observarVersao` no
// único ponto por onde todo fetch passa, e a faixa assina `onVersaoNova`.
// Uma vez detectada, fica detectada: a aba continua velha até recarregar,
// mesmo que uma resposta antiga em voo chegue depois com o valor anterior.
// ─────────────────────────────────────────────────────────────────────────────
export const CABECALHO_DA_VERSAO = "X-App-Versao";

let versaoDaAba: string | null = null;
let nova = false;
const ouvintes = new Set<() => void>();

/** Chamado a cada resposta. Valor vazio/ausente (proxy, erro de rede) não conta. */
export function observarVersao(valor: string | null | undefined): void {
  const v = (valor ?? "").trim();
  if (!v || nova) return;
  if (versaoDaAba === null) { versaoDaAba = v; return; }
  if (v !== versaoDaAba) {
    nova = true;
    ouvintes.forEach((f) => f());
  }
}

export const haVersaoNova = (): boolean => nova;

/** Assina a detecção; devolve o cancelamento. */
export function onVersaoNova(f: () => void): () => void {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

/** Só para teste. */
export function _zerarVersao(): void {
  versaoDaAba = null; nova = false; ouvintes.clear();
}
