// ─────────────────────────────────────────────────────────────────────────────
// RELATÓRIO DAS MÁQUINAS — a conta, pura (dono, 21/09: "não tem relatório
// diário, não tem relatório para exportar").
//
// Entra a lista crua de registros_de_impressao de um período (já no fuso da
// operação, com o dia e a hora prontos), sai o resumo por dia × impressora:
// quantas unidades saíram, quantas peças passaram, quais concluíram, quais
// ainda estão na máquina, primeira e última atividade e quem operou.
//
// Pura de propósito: a tela (Resumo do dia) e o Excel (aba "Resumo") leem a
// MESMA conta, e o teste roda sem banco. A rota (routes/maquinas.ts) só busca
// as linhas e aplica o filtro do Kit; o Excel (services/xlsxExport.ts) só
// desenha.
// ─────────────────────────────────────────────────────────────────────────────
import { MAQUINAS_DE_IMPRESSAO, rotuloDaMaquina } from "@shared/fluxo-peca";

export type TipoDeRegistro = "inicio" | "troca" | "parcial" | "conclusao";

/** Uma linha do diário como a rota devolve (e o Excel lista na aba "Registros"). */
export type RegistroDoPeriodo = {
  id: string;
  itemId: string;
  displayId: string | null;
  tipoPeca: string;
  evento: string | null;
  maquina: string;
  tipo: TipoDeRegistro;
  quantidade: number;
  totalDepois: number | null;
  aImprimir: number;
  /** AAAA-MM-DD no fuso da operação. */
  dia: string;
  /** HH:MM no fuso da operação. */
  hora: string;
  /** Milissegundos desde a época — só para ordenar e medir o tempo ativo. */
  em: number;
  quem: string | null;
};

export type ResumoDaMaquinaNoDia = {
  dia: string;
  maquina: string;
  rotulo: string;
  unidades: number;
  pecas: number;
  concluidas: number;
  aindaNaMaquina: number;
  primeira: string | null;
  ultima: string | null;
  /** Minutos entre a primeira e a última atividade do dia nessa máquina. */
  minutosAtivos: number;
  quem: string[];
};

export type ResumoDoDia = {
  dia: string;
  maquinas: ResumoDaMaquinaNoDia[];
  total: { unidades: number; pecas: number; concluidas: number; aindaNaMaquina: number; minutosAtivos: number };
};

const DIA_VALIDO = /^\d{4}-\d{2}-\d{2}$/;
/** Teto do período: um ano cabe num Excel; mais que isso é pedido errado. */
export const MAXIMO_DE_DIAS = 366;

/**
 * Valida o período pedido (?de=&ate=). Sem `de`/`ate`, é o dia de hoje. O fim
 * não passa de hoje, o início não passa do fim, e o intervalo tem teto —
 * uma URL torta nunca vira erro de tela nem consulta de meses.
 */
export function periodoValido(de: unknown, ate: unknown, hoje: string): { de: string; ate: string } {
  const fim = typeof ate === "string" && DIA_VALIDO.test(ate) && ate <= hoje ? ate : hoje;
  let inicio = typeof de === "string" && DIA_VALIDO.test(de) && de <= fim ? de : fim;
  if (diasEntre(inicio, fim) + 1 > MAXIMO_DE_DIAS) inicio = somarDias(fim, -(MAXIMO_DE_DIAS - 1));
  return { de: inicio, ate: fim };
}

export function somarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function diasEntre(de: string, ate: string): number {
  const ms = (s: string) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((ms(ate) - ms(de)) / 86_400_000);
}

const imprimiu = (r: RegistroDoPeriodo) => r.tipo === "parcial" || r.tipo === "conclusao";

/**
 * O resumo do período, um bloco por dia (do mais recente para o mais antigo),
 * cada um com as quatro impressoras — inclusive as que não imprimiram nada,
 * para a tabela ter sempre a mesma forma.
 *
 * "Ainda na máquina": peça que passou pela impressora no dia e cujo ÚLTIMO
 * lançamento no período (em qualquer máquina) ainda a deixa nela — não
 * concluiu nem foi trocada para outra. É a leitura do próprio diário, então
 * vale para dias passados; o retrato "Agora" continua sendo o do banco.
 */
export function agregarRelatorioDeMaquinas(registros: RegistroDoPeriodo[]): ResumoDoDia[] {
  const emOrdem = [...registros].sort((a, b) => a.em - b.em);

  // Onde cada peça terminou o período: a última máquina e o último gesto.
  const ultimoDaPeca = new Map<string, RegistroDoPeriodo>();
  for (const r of emOrdem) ultimoDaPeca.set(r.itemId, r);

  const porDia = new Map<string, RegistroDoPeriodo[]>();
  for (const r of emOrdem) {
    const lista = porDia.get(r.dia);
    if (lista) lista.push(r); else porDia.set(r.dia, [r]);
  }

  const dias = Array.from(porDia.keys()).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return dias.map((dia) => {
    const doDia = porDia.get(dia)!;
    const maquinas = MAQUINAS_DE_IMPRESSAO.map((codigo) => {
      const daMaquina = doDia.filter((r) => r.maquina === codigo);
      const pecas = new Set(daMaquina.map((r) => r.itemId));
      const concluidas = new Set(daMaquina.filter((r) => r.tipo === "conclusao").map((r) => r.itemId));
      const aindaNaMaquina = Array.from(pecas).filter((id) => {
        const u = ultimoDaPeca.get(id);
        return !!u && u.maquina === codigo && u.tipo !== "conclusao";
      });
      const primeira = daMaquina[0] ?? null;
      const ultima = daMaquina[daMaquina.length - 1] ?? null;
      const quem = Array.from(new Set(daMaquina.map((r) => r.quem).filter((q): q is string => !!q)));
      return {
        dia,
        maquina: codigo,
        rotulo: rotuloDaMaquina(codigo),
        // Correção (quantidade negativa) entra com sinal: é o saldo real do dia.
        unidades: daMaquina.reduce((s, r) => s + (imprimiu(r) ? r.quantidade : 0), 0),
        pecas: pecas.size,
        concluidas: concluidas.size,
        aindaNaMaquina: aindaNaMaquina.length,
        primeira: primeira?.hora ?? null,
        ultima: ultima?.hora ?? null,
        minutosAtivos: primeira && ultima ? Math.max(0, Math.round((ultima.em - primeira.em) / 60_000)) : 0,
        quem,
      };
    });
    const total = maquinas.reduce(
      (t, m) => ({
        unidades: t.unidades + m.unidades,
        pecas: t.pecas + m.pecas,
        concluidas: t.concluidas + m.concluidas,
        aindaNaMaquina: t.aindaNaMaquina + m.aindaNaMaquina,
        minutosAtivos: t.minutosAtivos + m.minutosAtivos,
      }),
      { unidades: 0, pecas: 0, concluidas: 0, aindaNaMaquina: 0, minutosAtivos: 0 },
    );
    return { dia, maquinas, total };
  });
}

/** "1h 20min", "45 min", "—" com zero. Vale para a tela e para o Excel. */
export function duracaoCurta(minutos: number): string {
  if (!minutos || minutos <= 0) return "—";
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

/**
 * O que aconteceu naquele lançamento, em palavras do galpão — a MESMA frase
 * do diário na tela (pages/grafica-maquinas.tsx). Mora aqui também porque o
 * Excel é montado no servidor.
 */
export function oQueAconteceuNoRegistro(r: Pick<RegistroDoPeriodo, "tipo" | "quantidade" | "totalDepois" | "aImprimir" | "maquina">): string {
  if (r.tipo === "inicio") return "Iniciou a impressão";
  if (r.tipo === "troca") return `Trocou para ${rotuloDaMaquina(r.maquina)}${r.quantidade > 0 ? ` (${r.quantidade} un. movidas)` : ""}`;
  const total = r.totalDepois == null ? "" : ` (${r.totalDepois} de ${r.aImprimir})`;
  if (r.quantidade < 0) return `Corrigiu para ${r.totalDepois ?? "?"} de ${r.aImprimir} (${r.quantidade})`;
  if (r.tipo === "conclusao") return `Concluiu: ${r.totalDepois ?? r.aImprimir} de ${r.aImprimir} impressas`;
  return `Mandou ${r.quantidade} para acabamento${total}`;
}

export const ROTULO_DO_TIPO: Record<TipoDeRegistro, string> = {
  inicio: "Início", troca: "Troca", parcial: "Impressas", conclusao: "Concluída",
};

/** "maquinas-2026-09-21.xlsx" num dia só; "maquinas-2026-09-15-a-2026-09-21.xlsx" no intervalo. */
export function nomeDoArquivoDoRelatorio(de: string, ate: string): string {
  return de === ate ? `maquinas-${de}.xlsx` : `maquinas-${de}-a-${ate}.xlsx`;
}
