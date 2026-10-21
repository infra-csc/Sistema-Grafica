// ─────────────────────────────────────────────────────────────────────────────
// OPERADORES DE UM LOGIN COMPARTILHADO — as regras, num lugar só (dono, 21/10).
//
// A Gráfica entra com um login só ("Produção Grafica"). Quem está na máquina
// (Gilmar, Elias, Harisson) se identifica com o PRÓPRIO PIN, e tudo o que ele
// faz entra na trilha como "Produção Grafica (Gilmar)". A troca é o fluxo
// principal: no almoço ou na troca de turno, quem assume digita o PIN DELE —
// ninguém age em nome do outro sem o PIN do outro.
//
// Este arquivo é puro (sem banco, sem Express): o servidor (server/operadores.ts)
// e as telas (components/operadores/) leem daqui as mesmas regras.
// ─────────────────────────────────────────────────────────────────────────────

/** O PIN tem de 4 a 6 dígitos — curto para digitar no tablet, longo o bastante para não ser o de outro. */
export const PIN_MIN = 4;
export const PIN_MAX = 6;

/**
 * BLOQUEIO: 5 PINs errados seguidos travam AQUELE operador por 15 minutos (os
 * outros seguem entrando). Acertar zera a contagem; o admin também zera ao
 * redefinir o PIN. A contagem mora na tabela limite_de_tentativas (a mesma do
 * login, migração 0002) — vale entre as cópias do servidor.
 */
export const TENTATIVAS_DE_PIN = 5;
export const BLOQUEIO_DO_PIN_MS = 15 * 60 * 1000;

/**
 * REDE DE SEGURANÇA DA INATIVIDADE. O fluxo normal é a pessoa sair ("Sair para
 * o almoço / encerrar meu turno") ou o próximo trocar. Se ninguém fizer isso,
 * a máquina volta a perguntar "Quem está na máquina?":
 *   · depois de 2 h sem NENHUMA ação gravada (consultar tela não conta), ou
 *   · 12 h depois de a pessoa assumir, mesmo com ações (nenhum turno passa disso).
 */
export const OCIOSO_MS = 2 * 60 * 60 * 1000;
export const TURNO_MAX_MS = 12 * 60 * 60 * 1000;

/** O nome que a trilha grava: "Produção Grafica (Gilmar)". */
export function nomeComOperador(nomeDoLogin: string, nomeDoOperador: string): string {
  return `${nomeDoLogin} (${nomeDoOperador})`;
}

/** Nome de operador: 1 a 40 caracteres, sem os parênteses que a trilha usa. */
export const NOME_DO_OPERADOR_MAX = 40;
export function problemaNoNomeDoOperador(nome: unknown): string | null {
  if (typeof nome !== "string" || !nome.trim()) return "Informe o nome do operador.";
  const limpo = nome.trim();
  if (limpo.length > NOME_DO_OPERADOR_MAX) return `O nome pode ter até ${NOME_DO_OPERADOR_MAX} caracteres.`;
  if (/[()]/.test(limpo)) return "O nome não pode ter parênteses.";
  return null;
}
export const limparNomeDoOperador = (nome: string) => nome.trim().replace(/\s+/g, " ");

/**
 * O PIN serve? Só dígitos, de 4 a 6, e nada que se adivinhe na primeira
 * tentativa: todos iguais (0000, 111111) ou em sequência (1234, 654321).
 * Devolve a frase para a tela, ou null quando está bom.
 */
export function problemaNoPin(pin: unknown): string | null {
  if (typeof pin !== "string" || !/^\d+$/.test(pin)) return "O PIN tem só números.";
  if (pin.length < PIN_MIN || pin.length > PIN_MAX) return `O PIN tem de ${PIN_MIN} a ${PIN_MAX} números.`;
  if (/^(\d)\1+$/.test(pin)) return "Escolha um PIN com números diferentes — todos iguais é fácil de adivinhar.";
  const d = pin.split("").map(Number);
  const sobe = d.every((n, i) => i === 0 || n === d[i - 1] + 1);
  const desce = d.every((n, i) => i === 0 || n === d[i - 1] - 1);
  if (sobe || desce) return "Escolha um PIN que não seja uma sequência (como 1234) — é fácil de adivinhar.";
  return null;
}

export type MotivoDoFim = "ocioso" | "turno" | "desativado";

/**
 * O turno de quem está na máquina ainda vale? `entrouEm`/`ultimaAcaoEm` são ms.
 * Sem carimbo (sessão antiga), conta como vencido — pedir o PIN de novo é o
 * lado seguro.
 */
export function situacaoDoTurno(
  turno: { entrouEm?: number; ultimaAcaoEm?: number },
  agora: number,
): { valido: true; expiraEm: number } | { valido: false; motivo: MotivoDoFim } {
  const entrou = turno.entrouEm;
  if (typeof entrou !== "number" || !Number.isFinite(entrou)) return { valido: false, motivo: "turno" };
  const ultima = typeof turno.ultimaAcaoEm === "number" && Number.isFinite(turno.ultimaAcaoEm) ? Math.max(turno.ultimaAcaoEm, entrou) : entrou;
  const fimDoTurno = entrou + TURNO_MAX_MS;
  const fimPorOcio = ultima + OCIOSO_MS;
  if (agora >= fimDoTurno) return { valido: false, motivo: "turno" };
  if (agora >= fimPorOcio) return { valido: false, motivo: "ocioso" };
  return { valido: true, expiraEm: Math.min(fimDoTurno, fimPorOcio) };
}

/** Por que saiu — o complemento da frase "Gilmar saiu às 12:00 …" na trilha. */
export type MotivoDaSaida = "almoco" | "fim-do-turno" | "troca" | "sair";
export const MOTIVOS_DA_SAIDA: MotivoDaSaida[] = ["almoco", "fim-do-turno", "troca", "sair"];

// ── O contrato da API (GET /api/operadores e cia.) ─────────────────────────

/** Um cartão da tela "Quem está na máquina?". */
export interface OperadorParaEscolher {
  id: string;
  nome: string;
  /** false = primeiro acesso: a tela pede "Crie seu PIN". */
  temPin: boolean;
  /** ISO; presente enquanto o PIN estiver bloqueado por tentativas erradas. */
  bloqueadoAte: string | null;
}

/** GET /api/operadores — o estado da máquina para a sessão atual. */
export interface EstadoDosOperadores {
  /** O login tem operadores ativos: sem operador escolhido, nada se grava. */
  exigeOperador: boolean;
  /** O nome do login compartilhado ("Produção Grafica"). */
  login: string;
  atual: { id: string; nome: string; entrouEm: string; expiraEm: string } | null;
  operadores: OperadorParaEscolher[];
}

/** Linha da seção "Operadores deste login" (admin). Nunca traz o PIN nem o hash. */
export interface OperadorDoAdmin {
  id: string;
  nome: string;
  ativo: boolean;
  temPin: boolean;
  bloqueadoAte: string | null;
  /** Há uma sessão com este operador ativo agora (assumiu e não saiu). */
  naMaquina: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

/** Código no corpo do 428 — o cliente reconhece e abre "Quem está na máquina?". */
export const CODIGO_OPERADOR_NECESSARIO = "operador-necessario";
