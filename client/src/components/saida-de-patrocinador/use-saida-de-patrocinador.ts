// ─────────────────────────────────────────────────────────────────────────────
// QUANDO UM PATROCINADOR SAI DO EVENTO, PERGUNTAR ANTES (dono, 20/10).
//
// O caso: "Longevidade Bradesco - Manaus" (16/10). Na mesma edição entrou
// "Bradesco Seguros" e saiu "Bradesco" — e o salvar cancelou as 13 peças que
// só tinham o Bradesco. A intenção era TROCAR. Agora, antes de gravar, a tela
// pergunta, para cada patrocinador que sai E tem peças: passar as peças para
// outro (POST …/sponsors/trocar, nenhuma cancelada) ou só remover (o DELETE de
// sempre, que cancela as que ficarem sem patrocinador).
//
// Usado pelas duas portas que tiram patrocinador do evento: o formulário
// Editar Evento (components/eventos/use-formulario-do-evento) e o "Patrocinadores
// do evento" da Vinculação (components/vinculacao/use-acoes-da-vinculacao).
// O diálogo mora em ./dialogo-de-saida.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { runInBatches } from "@/lib/utils";
import {
  destinosPreSelecionados,
  type DecisaoDeSaida, type PecaNaSaida, type ResultadoDaTroca,
} from "@shared/troca-de-patrocinador";

export interface PerguntaDeSaida {
  eventId: string;
  /** Quem estava no evento e sai nesta edição. */
  removidos: string[];
  /** Quem entra nesta edição (a pré-seleção do destino olha para eles). */
  entrantes: string[];
  /** Como o evento fica depois de salvar — os destinos "do evento". */
  doEvento: string[];
}

export interface SaidaEmAberto extends PerguntaDeSaida {
  /** Só os removidos que TÊM peças — quem não tem sai sem pergunta. */
  comPecas: string[];
  pecas: PecaNaSaida[];
  preSelecionados: Record<string, string>;
}

/** A decisão de cada removido com peças. Removido sem decisão = "Só remover". */
export type DecisoesDeSaida = Record<string, DecisaoDeSaida>;

export function useSaidaDePatrocinador() {
  const [aberta, setAberta] = useState<SaidaEmAberto | null>(null);
  const [verificando, setVerificando] = useState(false);
  const resolver = useRef<((d: DecisoesDeSaida | null) => void) | null>(null);

  /**
   * Pergunta, se precisar. Devolve as decisões (objeto vazio = ninguém com
   * peças, siga como sempre) ou `null` = a pessoa cancelou: não grave nada.
   * Se a conferência das peças falhar, LANÇA — salvar sem saber poderia
   * cancelar peças, que é justamente o que esta pergunta existe para evitar.
   */
  const perguntar = useCallback(async (p: PerguntaDeSaida): Promise<DecisoesDeSaida | null> => {
    if (p.removidos.length === 0) return {};
    let pecas: PecaNaSaida[];
    setVerificando(true);
    try {
      const res = await apiRequest("GET", `/api/events/${p.eventId}/sponsors/pecas?ids=${encodeURIComponent(p.removidos.join(","))}`);
      const corpo = (await res.json()) as { pecas?: PecaNaSaida[] } | null;
      pecas = Array.isArray(corpo?.pecas) ? corpo!.pecas! : [];
    } finally {
      setVerificando(false);
    }
    // Quem tem MAIS peças primeiro: é a decisão que mais pesa.
    const contagem = (s: string) => pecas.filter((x) => x.sponsorIds.includes(s)).length;
    const comPecas = p.removidos.filter((s) => contagem(s) > 0).sort((a, b) => contagem(b) - contagem(a));
    if (comPecas.length === 0) return {};
    return new Promise<DecisoesDeSaida | null>((resolve) => {
      resolver.current = resolve;
      setAberta({ ...p, comPecas, pecas, preSelecionados: destinosPreSelecionados(comPecas, p.entrantes) });
    });
  }, []);

  const responder = useCallback((d: DecisoesDeSaida | null) => {
    const r = resolver.current;
    resolver.current = null;
    setAberta(null);
    r?.(d);
  }, []);

  return { aberta, verificando, perguntar, responder };
}

export type SaidaDePatrocinador = ReturnType<typeof useSaidaDePatrocinador>;

/**
 * Executa as saídas já decididas. As TROCAS rodam uma de cada vez (duas para
 * o mesmo destino disputariam o vínculo dele com o evento) e ANTES das
 * remoções — é o que garante que uma peça com o trocado e o removido nunca
 * fique vazia no meio do caminho e seja cancelada. Quem falhou volta pelo nome.
 */
export async function executarSaidas(
  eventId: string,
  removidos: string[],
  decisoes: DecisoesDeSaida,
  nomeDe: (id: string) => string,
): Promise<{ trocas: Array<ResultadoDaTroca & { nomeDe: string; nomePara: string }>; falhas: string[] }> {
  const trocas: Array<ResultadoDaTroca & { nomeDe: string; nomePara: string }> = [];
  const falhas: string[] = [];
  for (const s of removidos) {
    const d = decisoes[s];
    if (d?.tipo !== "trocar") continue;
    try {
      const r = await apiRequest("POST", `/api/events/${eventId}/sponsors/trocar`, { de: s, para: d.para });
      trocas.push({ ...((await r.json()) as ResultadoDaTroca), nomeDe: nomeDe(s), nomePara: nomeDe(d.para) });
    } catch {
      falhas.push(nomeDe(s));
    }
  }
  const soRemover = removidos.filter((s) => decisoes[s]?.tipo !== "trocar");
  await runInBatches(soRemover, async (s) => {
    try {
      await apiRequest("DELETE", `/api/events/${eventId}/sponsors/${s}`);
    } catch {
      falhas.push(nomeDe(s));
    }
  }, 5);
  return { trocas, falhas };
}

/** A frase do aviso depois de salvar: o que aconteceu com as peças de cada troca. */
export function fraseDasTrocas(trocas: Array<ResultadoDaTroca & { nomeDe: string; nomePara: string }>): string {
  return trocas.map((t) => {
    const n = t.passaram;
    const base = n === 0
      ? `"${t.nomeDe}" trocado por "${t.nomePara}"`
      : `${n === 1 ? "A peça" : `As ${n} peças`} de "${t.nomeDe}" ${n === 1 ? "passou" : "passaram"} para "${t.nomePara}" — nenhuma cancelada`;
    const extra = t.pendenciasAbertas > 0
      ? `; ${t.pendenciasAbertas} ${t.pendenciasAbertas === 1 ? "aprovação pendente aberta" : "aprovações pendentes abertas"} para o novo`
      : "";
    return `${base}${extra}.`;
  }).join(" ");
}
