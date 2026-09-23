// ─────────────────────────────────────────────────────────────────────────────
// ERROS QUE CHEGAM À TELA — em português e sem vazar o servidor.
//
// As rotas de criar peça, lote, clonar, importar e editar evento respondiam
// `error.message` cru: um ZodError virava o JSON inteiro dos issues em inglês
// ("[{ "code": "too_small", ... }]") dentro do toast, e uma falha de banco
// mostrava a consulta SQL ao usuário. Aqui ficam as três peças que resolvem:
//   · `fraseDoZod` — "Campo Quantidade: precisa ser no mínimo 1";
//   · `responderErro` — 400 com a frase para validação, 500 genérico (e o
//     erro inteiro no log) para o resto;
//   · `corpoEventoFechado` — o corpo 409 com `code`/`reason`, igual ao que
//     `barraEventoFinalizado` devolve, para o cliente não parsear a frase.
// ─────────────────────────────────────────────────────────────────────────────
import { z } from "zod";
import type { Response } from "express";
import { erroEventoFechado } from "./routes/eventoFinalizado";
import type { EventoFinalizadoMotivo } from "@shared/prazo-dates";

/** Frases que não passam de uma rota para a tela em inglês. */
export const PECA_NAO_ENCONTRADA = "Peça não encontrada";
export const EVENTO_NAO_ENCONTRADO = "Evento não encontrado";
export const ERRO_INTERNO = "Não foi possível concluir agora. Tente de novo em instantes — se persistir, avise o suporte.";

/** O nome que o usuário conhece de cada campo (o resto sai como veio). */
const ROTULOS: Record<string, string> = {
  eventId: "Evento",
  type: "Tipo",
  description: "Descrição",
  quantity: "Quantidade",
  area: "Área",
  visual: "Visual",
  visualWidth: "Largura visual",
  visualHeight: "Altura visual",
  fileWidth: "Largura do arquivo",
  fileHeight: "Altura do arquivo",
  material: "Material",
  finish: "Acabamento",
  measurement: "Medida",
  calculatedM2: "m²",
  observations: "Observações",
  name: "Nome",
  startDate: "Data do evento",
  truckDepartureDate: "Saída do caminhão",
  priority: "Prioridade",
  items: "Peças",
  sourceEventId: "Evento de origem",
  itemIds: "Peças selecionadas",
  group: "Grupo",
  kind: "Tipo",
  value: "Valor",
};

function rotuloDoCaminho(caminho: (string | number)[]): string {
  const partes = caminho.map((p) => (typeof p === "number" ? `linha ${p + 1}` : ROTULOS[p] ?? p));
  return partes.length > 0 ? partes.join(" › ") : "Dados";
}

/** Mensagem que o próprio schema escreveu (em pt-BR) vence a tradução. */
function mensagemPropria(issue: z.ZodIssue): string | null {
  const m = issue.message ?? "";
  // As mensagens padrão do zod são em inglês e começam com estas palavras.
  if (/^(Required|Expected|Invalid|Number must|String must|Array must|Unrecognized|Too small|Too big)/.test(m)) return null;
  return m || null;
}

function fraseDoIssue(issue: z.ZodIssue): string {
  const propria = mensagemPropria(issue);
  if (propria && issue.code === "custom") return propria;
  switch (issue.code) {
    case "invalid_type":
      return issue.received === "undefined" || issue.received === "null"
        ? "é obrigatório"
        : issue.expected === "number" || issue.expected === "integer"
          ? "precisa ser um número"
          : "valor inválido";
    case "too_small":
      if (issue.type === "string") return Number(issue.minimum) <= 1 ? "não pode ficar vazio" : `precisa ter pelo menos ${issue.minimum} caracteres`;
      if (issue.type === "array") return Number(issue.minimum) <= 1 ? "escolha pelo menos um" : `escolha pelo menos ${issue.minimum}`;
      return `precisa ser no mínimo ${issue.minimum}`;
    case "too_big":
      if (issue.type === "string") return `pode ter no máximo ${issue.maximum} caracteres`;
      if (issue.type === "array") return `no máximo ${issue.maximum}`;
      return `precisa ser no máximo ${issue.maximum}`;
    case "invalid_enum_value":
      return `valor fora das opções (${issue.options.join(", ")})`;
    case "invalid_date":
      return "data inválida";
    case "invalid_string":
      return "formato inválido";
    default:
      return propria ?? "valor inválido";
  }
}

/**
 * "Campo Quantidade: precisa ser no mínimo 1" — o primeiro problema, que é o
 * que o toast consegue mostrar; os demais aparecem quando esse for corrigido.
 */
export function fraseDoZod(error: z.ZodError): string {
  const issue = error.errors[0];
  if (!issue) return "Dados inválidos";
  const propria = mensagemPropria(issue);
  // Mensagem escrita à mão no schema já é a frase inteira ("Informe o evento…").
  if (propria) return propria;
  return `Campo ${rotuloDoCaminho(issue.path)}: ${fraseDoIssue(issue)}`;
}

/**
 * O `catch` das rotas: validação vira 400 com a frase; o resto é 500 sem
 * `error.message` (vai inteiro para o log, com o contexto).
 * `httpStatus` + `publico` num erro lançado de propósito passam como estão.
 */
export function responderErro(res: Response, error: unknown, contexto: string) {
  return responderFalha(res, error, contexto, 500);
}

/**
 * O mesmo `responderErro`, mantendo o status que a rota já respondia no erro
 * inesperado (várias rotas antigas respondiam 400 com `error.message` cru —
 * trocar o texto não pode mudar o código que a tela recebe).
 */
export function responderFalha(res: Response, error: unknown, contexto: string, statusPadrao = 500) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: fraseDoZod(error) });
  }
  const e = error as { httpStatus?: unknown; publico?: unknown; corpo?: Record<string, unknown> } | null;
  if (e && typeof e.httpStatus === "number" && typeof e.publico === "string") {
    return res.status(e.httpStatus).json({ error: e.publico, ...(e.corpo ?? {}) });
  }
  console.error(`[${contexto}]`, error);
  return res.status(statusPadrao).json({ error: ERRO_INTERNO });
}

/** A mensagem de um erro qualquer, para o log (nunca para a tela). */
export const mensagemDoErro = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Um erro com frase para o usuário — `responderErro` o devolve como está. */
export function erroPublico(httpStatus: number, publico: string, corpo?: Record<string, unknown>): Error {
  return Object.assign(new Error(publico), { httpStatus, publico, corpo });
}

/** O 409 de evento fechado com `code`/`reason`, igual ao de barraEventoFinalizado. */
export function corpoEventoFechado(motivo: EventoFinalizadoMotivo) {
  return { error: erroEventoFechado(motivo), code: "EVENT_FINALIZED", reason: motivo };
}
