// CONFERÊNCIA DO ARQUIVO FINAL × THUMB APROVADO (Pedro/dono, 04/11).
//
// O arquivo final mora na pasta da rede (\\10.100.1.7), que o servidor não
// alcança. Quem lê a pasta é o conferidor (scripts/conferidor/), num computador
// da rede: gera uma imagem reduzida e manda para cá. A comparação fica no servidor,
// junto da chave da IA, e o resultado é só um aviso: nunca trava a peça.
//
// Teste de 04/11 com o Haiku em 105 comparações: pegou os arquivos errados e não deu
// alarme falso de arte, mas deixou passar diferença parcial (#8095), que o Sonnet pegou.
// Por isso o dono escolheu o Sonnet (04/11), cerca de 20 vezes mais caro por peça.
// É uma rede a mais, não a conferência humana.

import { urlDaApi } from "./auditoria-do-book/ia";

export const MODELO_DA_CONFERENCIA = "claude-sonnet-5-5";

export const PERGUNTA_DA_CONFERENCIA = `São duas imagens de uma peça gráfica de evento.
Imagem 1: o THUMB aprovado pelo patrocinador.
Imagem 2: o ARQUIVO FINAL que vai para a impressão.

Responda se o arquivo final é a MESMA arte do thumb aprovado. Olhe o conteúdo: marcas e logos, textos em destaque, disposição geral, tipo de peça e proporção.
NÃO conte como diferença: cor ou brilho um pouco diferentes, sangria, área a mais nas bordas, recorte ou proporção um pouco diferentes (o arquivo final costuma ter sangria e o thumb costuma ter borda), marcas de corte, resolução, textos pequenos que não dê para ler, ou detalhes de fundo que você não consiga ver com certeza.
Só responda vale_olhar quando houver diferença clara: outra arte, marca ou logo a mais ou faltando, texto em destaque diferente, ou elemento principal trocado.

Responda só com JSON, sem texto em volta: {"veredito":"confere"} ou {"veredito":"vale_olhar","motivo":"uma frase curta dizendo o que difere"}`;

export type Veredito = "confere" | "vale_olhar" | "nao_deu";

export interface ResultadoDaComparacao {
  veredito: Veredito;
  motivo: string | null;
  modelo: string;
  tokensEntrada: number | null;
  tokensSaida: number | null;
}

/** Lê a resposta do modelo. O que não dá para entender não vira aviso de arte errada. */
export function lerResposta(texto: string): { veredito: Veredito; motivo: string | null } {
  const inicio = texto.indexOf("{"), fim = texto.lastIndexOf("}");
  if (inicio >= 0 && fim > inicio) {
    try {
      const j = JSON.parse(texto.slice(inicio, fim + 1)) as { veredito?: unknown; motivo?: unknown };
      if (j.veredito === "confere") return { veredito: "confere", motivo: null };
      if (j.veredito === "vale_olhar") return { veredito: "vale_olhar", motivo: typeof j.motivo === "string" ? j.motivo.slice(0, 400) : null };
    } catch { /* cai no "não deu" abaixo */ }
  }
  return { veredito: "nao_deu", motivo: "A comparação não trouxe uma resposta clara." };
}

const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Compara as duas imagens (JPEG em base64). Falha da API lança: quem chama decide. */
export async function compararComIA(thumb: string, final: string, chave: string, modelo: string = MODELO_DA_CONFERENCIA): Promise<ResultadoDaComparacao> {
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const r = await fetch(urlDaApi(), {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": chave, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: modelo, max_tokens: 1500, output_config: { effort: "low" },
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: thumb } },
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: final } },
          { type: "text", text: PERGUNTA_DA_CONFERENCIA },
        ] }],
      }),
    });
    if (r.status === 429 || r.status >= 500) { await espera(4000 * (tentativa + 1)); continue; }
    const j = await r.json() as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number }; stop_reason?: string; error?: { message?: string } };
    if (!r.ok) throw new Error(`IA respondeu ${r.status}: ${String(j.error?.message ?? "").slice(0, 160)}`);
    const uso = { modelo, tokensEntrada: j.usage?.input_tokens ?? null, tokensSaida: j.usage?.output_tokens ?? null };
    if (j.stop_reason === "refusal") return { veredito: "nao_deu", motivo: "A comparação foi recusada pela IA.", ...uso };
    return { ...lerResposta(j.content?.find((b) => b.type === "text")?.text ?? ""), ...uso };
  }
  throw new Error("IA indisponível depois de 4 tentativas");
}
