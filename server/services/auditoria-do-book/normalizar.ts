// ─────────────────────────────────────────────────────────────────────────────
// A RESPOSTA DA IA, VALIDADA — nada do que ela devolve vai para o banco sem
// passar por aqui.
//
//   · número de peça que não existe NESTE evento cai fora (a IA às vezes cita
//     peça de outro evento que viu no detalhe, ou inventa);
//   · divergência que fica sem nenhuma peça válida cai fora inteira;
//   · confiança desconhecida ("média" com acento, "high", vazio) → baixa,
//     exceto as grafias óbvias de média/alta;
//   · texto vazio, página absurda, número negativo: limpos.
// ─────────────────────────────────────────────────────────────────────────────
import type { AchadoCancelada, AchadoFaltando, AchadosDoBook, ConfiancaDoAchado, DivergenciaDoBook } from "@shared/auditoria-do-book";

export interface PecaParaCasar {
  id: string;
  displayId: string;
  /** "#8040 2x1 Bradesco Seguros" — só o das canceladas aparece na tela. */
  rotulo?: string;
}

const texto = (v: unknown, max = 2000): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

const pagina = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/\D+/g, "")) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 10_000 ? Math.floor(n) : null;
};

const contagem = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100_000 ? Math.round(n) : null;
};

export function normalizarConfianca(v: unknown): ConfiancaDoAchado {
  const s = typeof v === "string" ? v.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase() : "";
  if (s === "alta" || s === "high") return "alta";
  if (s === "media" || s === "medium") return "media";
  return "baixa";
}

/** "#6524", "6524", "# 6524" ou o uuid → a peça do evento; nada se não for daqui. */
export function criarCasadorDePecas(pecas: readonly PecaParaCasar[]) {
  const porNumero = new Map<string, PecaParaCasar>();
  const porId = new Map<string, PecaParaCasar>();
  for (const p of pecas) {
    porId.set(p.id, p);
    porNumero.set(p.displayId.replace(/^#/, "").trim().toUpperCase(), p);
  }
  return (ref: unknown): PecaParaCasar | null => {
    if (typeof ref !== "string") return null;
    const s = ref.trim();
    if (porId.has(s)) return porId.get(s)!;
    return porNumero.get(s.replace(/^#\s*/, "").toUpperCase()) ?? null;
  };
}

/** O primeiro "#1234" de um texto que seja peça deste evento. */
function pecaCitada(textoLivre: string, casar: (r: unknown) => PecaParaCasar | null): PecaParaCasar | null {
  for (const m of Array.from(textoLivre.matchAll(/#\s*([A-Za-z0-9-]+)/g))) {
    const p = casar(m[1]);
    if (p) return p;
  }
  return null;
}

export interface RespostaNormalizada {
  achados: AchadosDoBook;
  pecasNoBook: number | null;
  encontradasNoApp: number | null;
}

/**
 * Valida e normaliza a entrada da ferramenta `registrar_auditoria`. Nunca
 * lança: o que não dá para entender vira lista vazia. As chaves dos achados
 * ("f0", "d0"…) são a posição — a auditoria não muda depois de concluída, e é
 * por elas que "Já cadastrei"/"Não precisa" ficam gravados.
 */
export function normalizarResposta(bruta: unknown, pecas: readonly PecaParaCasar[], canceladasDoEvento: readonly PecaParaCasar[] = []): RespostaNormalizada {
  const r = (bruta && typeof bruta === "object" ? bruta : {}) as Record<string, unknown>;
  const casar = criarCasadorDePecas(pecas);
  const casarCancelada = criarCasadorDePecas(canceladasDoEvento);

  const faltando: AchadoFaltando[] = [];
  // "Cancelada no app" só vale apontando peça CANCELADA deste evento. Se a IA
  // citou só número que não é cancelada daqui, a peça do book continua sem
  // cadastro ativo: vira "faltando" com confiança baixa, e o detalhe diz o porquê.
  const canceladas: AchadoCancelada[] = [];
  const viraramFaltando: Array<Record<string, unknown>> = [];
  for (const x of Array.isArray(r.cancelada_no_app) ? r.cancelada_no_app : []) {
    if (!x || typeof x !== "object") continue;
    const c = x as Record<string, unknown>;
    const pecaNoBook = texto(c.peca_no_book, 400);
    const detalhe = texto(c.detalhe);
    if (!pecaNoBook && !detalhe) continue;
    const vistas = new Set<string>();
    const validas: PecaParaCasar[] = [];
    for (const ref of Array.isArray(c.ids) ? c.ids : []) {
      const p = casarCancelada(ref);
      if (p && !vistas.has(p.id)) { vistas.add(p.id); validas.push(p); }
    }
    if (validas.length === 0) {
      // Apontou peça ATIVA: então está encontrada, não é achado.
      if ((Array.isArray(c.ids) ? c.ids : []).some((ref) => casar(ref))) continue;
      viraramFaltando.push({
        pagina: c.pagina, peca_no_book: pecaNoBook,
        detalhe: [detalhe, "A IA apontou uma peça cancelada que não foi encontrada no evento."].filter(Boolean).join(" "),
        confianca: "baixa", candidata_mais_proxima: null,
      });
      continue;
    }
    canceladas.push({
      chave: `c${canceladas.length}`,
      pagina: pagina(c.pagina),
      pecaNoBook: pecaNoBook || detalhe.slice(0, 120),
      detalhe,
      ids: validas.map((p) => p.id),
      rotulos: validas.map((p) => p.rotulo || p.displayId),
    });
  }
  for (const x of [...(Array.isArray(r.faltando_no_app) ? r.faltando_no_app : []), ...viraramFaltando]) {
    if (!x || typeof x !== "object") continue;
    const f = x as Record<string, unknown>;
    const pecaNoBook = texto(f.peca_no_book, 400);
    const detalhe = texto(f.detalhe);
    if (!pecaNoBook && !detalhe) continue;
    const candidata = texto(f.candidata_mais_proxima, 400) || null;
    const peca = candidata ? pecaCitada(candidata, casar) : null;
    faltando.push({
      chave: `f${faltando.length}`,
      pagina: pagina(f.pagina),
      pecaNoBook: pecaNoBook || detalhe.slice(0, 120),
      detalhe,
      confianca: normalizarConfianca(f.confianca),
      candidata,
      candidataId: peca?.id ?? null,
    });
  }

  const divergencias: DivergenciaDoBook[] = [];
  for (const x of Array.isArray(r.divergencias) ? r.divergencias : Array.isArray(r.divergencia) ? r.divergencia : []) {
    if (!x || typeof x !== "object") continue;
    const d = x as Record<string, unknown>;
    const vistas = new Set<string>();
    const validas: PecaParaCasar[] = [];
    for (const ref of Array.isArray(d.ids) ? d.ids : []) {
      const p = casar(ref);
      if (p && !vistas.has(p.id)) { vistas.add(p.id); validas.push(p); }
    }
    if (validas.length === 0) continue;
    const noBook = texto(d.no_book);
    const noApp = texto(d.no_app);
    if (!noBook && !noApp) continue;
    divergencias.push({
      chave: `d${divergencias.length}`,
      pagina: pagina(d.pagina),
      ids: validas.map((p) => p.id),
      displayIds: validas.map((p) => p.displayId),
      noBook,
      noApp,
    });
  }

  const pecasNoBook = contagem(r.pecas_no_book);
  let encontradasNoApp = contagem(r.encontradas_no_app ?? r.pecas_encontradas_no_app);
  if (pecasNoBook !== null && encontradasNoApp !== null && encontradasNoApp > pecasNoBook) encontradasNoApp = pecasNoBook;

  return {
    achados: { faltando, canceladas, divergencias, observacoes: texto(r.observacoes, 4000) || null },
    pecasNoBook,
    encontradasNoApp,
  };
}
