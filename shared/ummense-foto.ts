// ─────────────────────────────────────────────────────────────────────────────
// A FOTO DO UMMENSE — do TSV extraído do Ummense para o JSON que o app lê
// (shared/dados/ummense-eventos.json). Quem roda é scripts/importar-ummense.mjs;
// a lógica mora aqui para ser testada.
//
// O TSV (uma linha de cabeçalho): nome · data (YYYY-MM-DD) · estacao · tags
// (separadas por |) · patrocinadores ("Nome:COTA|Nome:COTA…", pode vir vazio).
//
// A CIDADE (o Ummense não tem campo de cidade — ela vem nas TAGS, misturada
// com modalidade, lei e projeto: "BELÉM|CORRIDA|LIE|NIGHT RUN 2|ALÇANDO VOOS"):
//   1. o trecho depois do ÚLTIMO " - " do nome, quando ele é cidade — conhecida
//      (CIDADES_CONHECIDAS) ou confirmada por uma tag igual a ele
//      ("Night Run - Etapa 1 - São Luis" → São Luis; "… - Búzios" + tag BÚZIOS);
//   2. senão, a primeira TAG que é cidade conhecida ("Meia de Sampa" + tag
//      SÃO PAULO → São Paulo; "Treinão Running Land - Plié" → Plié não é
//      cidade, tag RIO DE JANEIRO → Rio de Janeiro);
//   3. senão, null (sem cidade, o casamento usa só marca e data).
// Cidade conhecida sai com a grafia da lista (acentos certos); a confirmada só
// pela tag sai como está no nome.
//
// PATROCINADOR COM "|" NO NOME: "Construjá | FERJÁ:SILVER" chega partido em
// "Construjá " e " FERJÁ:SILVER". Pedaço sem ":COTA" é começo do próximo nome.
// ─────────────────────────────────────────────────────────────────────────────
import {
  ehCidadeConhecida, exibicaoDaCidade, normalizar,
  type EventoDoUmmense, type FotoDoUmmense, type PatrocinadorDoUmmense,
} from "./eventos-sugeridos";

export const ORIGEM_PADRAO = "Ummense — Calendário 2026 + Atribuir Entregas";

/** Id estável: nome normalizado + data ("night-run-etapa-1-belem-2026-10-17"). */
export const idDoEventoDoUmmense = (nome: string, data: string) => `${normalizar(nome).replace(/ /g, "-")}-${data}`;

export function cidadeDoEvento(nome: string, tags: string[]): string | null {
  const partes = nome.split(" - ");
  const sufixo = partes.length > 1 ? partes[partes.length - 1].trim() : "";
  if (sufixo && !/^etapa\b/i.test(sufixo)) {
    if (ehCidadeConhecida(sufixo)) return exibicaoDaCidade(sufixo);
    if (tags.some((t) => normalizar(t) === normalizar(sufixo))) return sufixo;
  }
  const tag = tags.find((t) => ehCidadeConhecida(t));
  return tag ? exibicaoDaCidade(tag) : null;
}

/** "Nome:COTA|Nome:COTA" → lista, juntando nomes que tinham "|" dentro. */
export function lerPatrocinadores(cru: string): PatrocinadorDoUmmense[] {
  const saida: PatrocinadorDoUmmense[] = [];
  let pendente = "";
  for (const pedaco of (cru ?? "").split("|")) {
    const i = pedaco.lastIndexOf(":");
    const cota = i >= 0 ? pedaco.slice(i + 1).trim() : "";
    // Cota é CAIXA-ALTA ("MASTER", "O2 PRIME"); sem isso, é pedaço de nome.
    if (i < 0 || !cota || cota !== cota.toUpperCase()) {
      pendente = pendente ? `${pendente} | ${pedaco.trim()}` : pedaco.trim();
      continue;
    }
    const nome = (pendente ? `${pendente} | ${pedaco.slice(0, i).trim()}` : pedaco.slice(0, i)).trim();
    pendente = "";
    if (!nome) continue;
    if (saida.some((p) => normalizar(p.nome) === normalizar(nome))) continue;
    saida.push({ nome, cota });
  }
  if (pendente) saida.push({ nome: pendente, cota: null });
  return saida;
}

export function fotoDoTsv(tsv: string, fotoDe: string, origem = ORIGEM_PADRAO): FotoDoUmmense {
  const linhas = tsv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const cab = (linhas.shift() ?? "").split("\t").map((c) => normalizar(c));
  const col = (nome: string) => {
    const i = cab.indexOf(nome);
    if (i < 0) throw new Error(`O TSV não tem a coluna "${nome}" (cabeçalho: ${cab.join(", ")}).`);
    return i;
  };
  const [iNome, iData, iEstacao, iTags, iPatr] = ["nome", "data", "estacao", "tags", "patrocinadores"].map(col);
  const eventos: EventoDoUmmense[] = [];
  const ids = new Set<string>();
  linhas.forEach((linha, n) => {
    const c = linha.split("\t");
    const nome = (c[iNome] ?? "").trim();
    const data = (c[iData] ?? "").trim();
    if (!nome) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error(`Linha ${n + 2} ("${nome}"): data "${data}" não é YYYY-MM-DD.`);
    const tags = (c[iTags] ?? "").split("|").map((t) => t.trim()).filter(Boolean);
    const id = idDoEventoDoUmmense(nome, data);
    if (ids.has(id)) return; // a mesma linha duas vezes
    ids.add(id);
    eventos.push({
      id,
      nome,
      data,
      estacao: (c[iEstacao] ?? "").trim() || null,
      cidade: cidadeDoEvento(nome, tags),
      dataNaoConfirmada: tags.some((t) => normalizar(t) === "data nao confirmada"),
      tags,
      patrocinadores: lerPatrocinadores(c[iPatr] ?? ""),
    });
  });
  eventos.sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome, "pt-BR"));
  return { fotoDe, origem, eventos };
}
