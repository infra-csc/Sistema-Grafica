// ─────────────────────────────────────────────────────────────────────────────
// A CHAMADA À IA — Anthropic Messages API por `fetch` (sem SDK, decisão do
// dono), em streaming.
//
// Por que streaming: um book de 26 páginas com raciocínio pode passar de 5
// minutos, e o Node derruba uma resposta que demora isso para mandar o
// cabeçalho. Em streaming o cabeçalho chega na hora e o corpo vem aos poucos.
//
// Por que a ferramenta não é forçada (`tool_choice: tool`): o modelo padrão
// (claude-opus-5-5) recusa a escolha forçada com 400. A ferramenta vai com
// `strict: true` (a entrada sempre bate com o schema) e as instruções mandam
// chamá-la; se mesmo assim ela não vier, a auditoria vira "erro" com o motivo.
// ─────────────────────────────────────────────────────────────────────────────
import { FERRAMENTA, INSTRUCOES, NOME_DA_FERRAMENTA } from "./prompt";

/** ANTHROPIC_BASE_URL (a mesma variável dos SDKs) troca o servidor — usada no teste local com uma API de mentira. */
export const urlDaApi = () => `${(process.env.ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com").replace(/\/+$/, "")}/v1/messages`;
export const MODELO_PADRAO = "claude-opus-5-5";
/** Limite da API por requisição (o PDF vai em base64 dentro do JSON). */
export const LIMITE_DA_REQUISICAO_BYTES = 32 * 1024 * 1024;
/** Limite de páginas que o dono definiu para um book (a API aceita mais). */
export const LIMITE_DE_PAGINAS = 100;
const TEMPO_MAXIMO_MS = 15 * 60_000;
const TENTATIVAS = 3;

export const modeloDaAuditoria = () => process.env.BOOK_AUDIT_MODEL?.trim() || MODELO_PADRAO;

/**
 * Esforço de raciocínio. "high" por padrão: a auditoria é trabalho de
 * comparação minuciosa, e o padrão do Opus 5.5 é "medium". Vazio desliga o
 * campo (para modelo antigo que não o aceita).
 */
const esforco = () => {
  const v = process.env.BOOK_AUDIT_EFFORT;
  return v === undefined ? "high" : v.trim() || null;
};

/**
 * Modelos com o desvio automático do servidor quando os filtros de segurança
 * recusam o pedido (`fallbacks: "default"`). Book de evento não deveria
 * esbarrar nisso — é seguro barato contra um falso positivo.
 */
const temDesvioAutomatico = (modelo: string) => /^claude-(opus-5|fable-5-1|sonnet-5-5)/.test(modelo);

export class ErroDaIA extends Error {
  constructor(message: string, readonly repetivel = false) {
    super(message);
    this.name = "ErroDaIA";
  }
}

export interface ResultadoDaIA {
  /** A entrada da ferramenta, ainda sem validar (ver normalizar.ts). */
  entrada: unknown;
  modelo: string;
  tokensEntrada: number | null;
  tokensSaida: number | null;
}

export function montarRequisicao(pdfBase64: string, listaDePecas: string, modelo: string) {
  const corpo: Record<string, unknown> = {
    model: modelo,
    max_tokens: 32000,
    stream: true,
    system: INSTRUCOES,
    tools: [FERRAMENTA],
    tool_choice: { type: "auto" },
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
        { type: "text", text: `${listaDePecas}\n\nAudite o book acima contra esta lista e registre o resultado com a ferramenta ${NOME_DA_FERRAMENTA}.` },
      ],
    }],
  };
  const e = esforco();
  if (e) corpo.output_config = { effort: e };
  const cabecalhos: Record<string, string> = {
    "content-type": "application/json",
    "anthropic-version": "2023-06-01",
  };
  if (temDesvioAutomatico(modelo)) {
    corpo.fallbacks = "default";
    cabecalhos["anthropic-beta"] = "server-side-fallback-2026-07-01";
  }
  return { corpo, cabecalhos };
}

type Evento = { type?: string; [k: string]: any };

/** Lê o corpo SSE da API e devolve os eventos já interpretados. */
async function* lerEventos(corpo: ReadableStream<Uint8Array>): AsyncGenerator<Evento> {
  const leitor = corpo.getReader();
  const decodificador = new TextDecoder();
  let resto = "";
  for (;;) {
    const { value, done } = await leitor.read();
    if (value) resto += decodificador.decode(value, { stream: true });
    if (done) resto += decodificador.decode();
    let fim: number;
    while ((fim = resto.search(/\r?\n\r?\n/)) >= 0) {
      const bloco = resto.slice(0, fim);
      resto = resto.slice(fim).replace(/^\r?\n\r?\n/, "");
      const dados = bloco.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
      if (!dados) continue;
      try { yield JSON.parse(dados); } catch { /* linha que não é JSON: ignora */ }
    }
    if (done) return;
  }
}

/** Junta o stream: a entrada da ferramenta, os tokens e como terminou. */
export async function juntarStream(corpo: ReadableStream<Uint8Array>) {
  const blocos = new Map<number, { tipo: string; nome?: string; json: string; texto: string }>();
  let tokensEntrada: number | null = null;
  let tokensSaida: number | null = null;
  let stopReason: string | null = null;
  let modelo: string | null = null;
  for await (const ev of lerEventos(corpo)) {
    switch (ev.type) {
      case "message_start": {
        const u = ev.message?.usage ?? {};
        modelo = ev.message?.model ?? modelo;
        tokensEntrada = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
        if (typeof u.output_tokens === "number") tokensSaida = u.output_tokens;
        break;
      }
      case "content_block_start":
        blocos.set(ev.index, { tipo: ev.content_block?.type ?? "", nome: ev.content_block?.name, json: "", texto: "" });
        break;
      case "content_block_delta": {
        const b = blocos.get(ev.index);
        if (!b) break;
        if (ev.delta?.type === "input_json_delta") b.json += ev.delta.partial_json ?? "";
        else if (ev.delta?.type === "text_delta") b.texto += ev.delta.text ?? "";
        break;
      }
      case "message_delta": {
        stopReason = ev.delta?.stop_reason ?? stopReason;
        const u = ev.usage ?? {};
        if (typeof u.output_tokens === "number") tokensSaida = u.output_tokens;
        // O total de entrada também chega aqui nas versões novas da API (e
        // inclui o que um desvio automático gastou).
        if (typeof u.input_tokens === "number") {
          tokensEntrada = u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
        }
        break;
      }
      case "error":
        throw new ErroDaIA(`A API respondeu com erro no meio do caminho: ${ev.error?.message ?? ev.error?.type ?? "desconhecido"}`, ev.error?.type === "overloaded_error");
      default:
        break;
    }
  }
  const ferramentas = Array.from(blocos.values()).filter((b) => b.tipo === "tool_use" && b.nome === NOME_DA_FERRAMENTA);
  const texto = Array.from(blocos.values()).filter((b) => b.tipo === "text").map((b) => b.texto).join("\n");
  return { ferramenta: ferramentas[ferramentas.length - 1] ?? null, texto, tokensEntrada, tokensSaida, stopReason, modelo };
}

/** Plano B: a IA escreveu o JSON em texto em vez de chamar a ferramenta. */
function jsonDoTexto(texto: string): unknown {
  const ini = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (ini < 0 || fim <= ini) return null;
  try {
    const v = JSON.parse(texto.slice(ini, fim + 1));
    return v && typeof v === "object" && "faltando_no_app" in v ? v : null;
  } catch { return null; }
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Manda o book e a lista e devolve o que a IA registrou. Tenta de novo (até 3
 * vezes) quando a API está sobrecarregada, limitando ou fora do ar; erro de
 * pedido (400, chave inválida) falha na hora, com a mensagem da API.
 */
export async function chamarIA(opcoes: {
  pdfBase64: string;
  listaDePecas: string;
  chave: string;
  modelo?: string;
  fetchImpl?: typeof fetch;
  esperarMs?: (tentativa: number, retryAfter: string | null) => number;
}): Promise<ResultadoDaIA> {
  const modelo = opcoes.modelo ?? modeloDaAuditoria();
  const { corpo, cabecalhos } = montarRequisicao(opcoes.pdfBase64, opcoes.listaDePecas, modelo);
  let json = JSON.stringify(corpo);
  if (Buffer.byteLength(json) > LIMITE_DA_REQUISICAO_BYTES) {
    throw new ErroDaIA(`O book é grande demais para a auditoria: a requisição passa de 32 MB (o PDF tem ${Math.round(Buffer.byteLength(opcoes.pdfBase64) * 0.75 / 1024 / 1024)} MB; o limite fica perto de 23 MB). Diminua as imagens do PDF e publique de novo.`);
  }
  const fazer = opcoes.fetchImpl ?? fetch;
  const espera = opcoes.esperarMs ?? ((t, ra) => (ra && Number(ra) > 0 ? Math.min(Number(ra), 120) * 1000 : 5000 * 2 ** (t - 1)));
  let ultimoErro: unknown = null;

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), TEMPO_MAXIMO_MS);
    try {
      const resp = await fazer(urlDaApi(), {
        method: "POST",
        headers: { ...cabecalhos, "x-api-key": opcoes.chave },
        body: json,
        signal: controle.signal,
      });
      if (!resp.ok) {
        const texto = await resp.text().catch(() => "");
        let msg = texto.slice(0, 400);
        try { msg = JSON.parse(texto)?.error?.message ?? msg; } catch { /* corpo não é JSON */ }
        const repetivel = resp.status === 429 || resp.status === 529 || resp.status >= 500;
        if (repetivel && tentativa < TENTATIVAS) {
          ultimoErro = new ErroDaIA(`API ${resp.status}: ${msg}`, true);
          await esperar(espera(tentativa, resp.headers.get("retry-after")));
          continue;
        }
        // O desvio automático é beta: se a conta não o aceitar, o pedido vai
        // de novo sem ele em vez de a auditoria inteira falhar.
        if (resp.status === 400 && "fallbacks" in corpo && /fallback/i.test(msg)) {
          delete corpo.fallbacks;
          delete cabecalhos["anthropic-beta"];
          json = JSON.stringify(corpo);
          tentativa--;
          continue;
        }
        if (resp.status === 401) throw new ErroDaIA("A chave da API (ANTHROPIC_API_KEY) foi recusada — confira o Secret.");
        throw new ErroDaIA(`A API recusou o pedido (${resp.status}): ${msg}`);
      }
      if (!resp.body) throw new ErroDaIA("A API respondeu sem corpo.", true);

      const r = await juntarStream(resp.body);
      if (r.stopReason === "refusal") {
        throw new ErroDaIA("A IA recusou analisar este book (filtro de segurança da API). Peça a um admin para tentar de novo.");
      }
      let entrada: unknown = null;
      if (r.ferramenta) {
        try { entrada = JSON.parse(r.ferramenta.json || "{}"); } catch {
          throw new ErroDaIA(r.stopReason === "max_tokens"
            ? "A resposta da IA foi cortada no limite de tamanho antes de terminar."
            : "A resposta da IA veio incompleta (JSON inválido).");
        }
      } else {
        entrada = jsonDoTexto(r.texto);
        if (!entrada) {
          throw new ErroDaIA(r.stopReason === "max_tokens"
            ? "A IA atingiu o limite de tamanho da resposta antes de registrar a auditoria."
            : "A IA terminou sem registrar a auditoria.");
        }
      }
      return { entrada, modelo: r.modelo ?? modelo, tokensEntrada: r.tokensEntrada, tokensSaida: r.tokensSaida };
    } catch (erro) {
      const abortado = (erro as { name?: string })?.name === "AbortError";
      const deRede = erro instanceof TypeError; // fetch falhou antes da resposta
      const repetivel = erro instanceof ErroDaIA ? erro.repetivel : deRede;
      if (abortado) throw new ErroDaIA("A IA demorou mais de 15 minutos e a auditoria foi interrompida.");
      if (repetivel && tentativa < TENTATIVAS) {
        ultimoErro = erro;
        await esperar(espera(tentativa, null));
        continue;
      }
      if (erro instanceof ErroDaIA) throw erro;
      throw new ErroDaIA(`Falha ao falar com a API: ${erro instanceof Error ? erro.message : String(erro)}`);
    } finally {
      clearTimeout(relogio);
    }
  }
  throw ultimoErro instanceof Error ? ultimoErro : new ErroDaIA("A API não respondeu depois de 3 tentativas.");
}
