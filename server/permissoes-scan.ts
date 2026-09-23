// ─────────────────────────────────────────────────────────────────────────────
// O LEITOR DA RÉGUA DE PAPÉIS — extrai de server/routes/*.ts quem pode o quê.
//
// Existe para UM consumidor: o teste de conformidade que compara o código com
// a tabela declarada em shared/permissoes.ts. A régua real está espalhada em
// três formas — `requireRole(...)` direto, aliases (`requireAdmin`,
// `requireInventoryWrite`, ...) e checagens à mão (`req.userRole !== "arte"`)
// nas primeiras linhas do corpo — e este módulo entende as três.
//
// NÃO é usado em runtime. Ler o próprio fonte para decidir permissão seria
// bizarro; ler o próprio fonte para PROVAR que a tabela diz a verdade é
// exatamente o trabalho de um teste.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync } from "fs";
import path from "path";

export const PAPEIS_CONHECIDOS = ["admin", "solicitacao", "arte", "grafica", "atendimento"] as const;

export interface RotaComPapel {
  metodo: string;
  rota: string;
  /** Papéis aceitos, ordenados. */
  papeis: string[];
  arquivo: string;
}

/** Aliases de guarda → papéis, resolvidos do próprio fonte. */
function coletarAliases(fontes: Map<string, string>): Map<string, string[]> {
  const aliases = new Map<string, string[]>();
  // requireAdmin é definido em shared.ts checando === "admin".
  aliases.set("requireAdmin", ["admin"]);
  for (const src of Array.from(fontes.values())) {
    for (const m of Array.from(src.matchAll(/const (require\w+) = requireRole\(([^)]*)\)/g))) {
      const papeis = Array.from(m[2].matchAll(/["'](\w+)["']/g)).map((x) => x[1]);
      if (papeis.length) aliases.set(m[1], papeis.sort());
    }
  }
  return aliases;
}

/**
 * Predicados de papel PUROS de um arquivo: função de uma linha cujo corpo é
 * só comparação de `userRole`. `podeMudarQuantidade` entra; `canCreateItemsFor`
 * (que também aceita o criador do evento) fica de fora, de propósito.
 */
function predicadosPuros(src: string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const f of Array.from(src.matchAll(/function (\w+)\(req[^)]*\)[^{]*\{\s*\n\s*return ([^;]+);\s*\n\s*\}/g))) {
    const [, nome, corpo] = f;
    const papeis = Array.from(corpo.matchAll(/userRole === ["'](\w+)["']/g)).map((x) => x[1]);
    const soPapel = corpo.replace(/req\.userRole === ["']\w+["']/g, "").replace(/[\s|()]/g, "") === "";
    if (papeis.length && soPapel) m.set(nome, papeis.sort());
  }
  return m;
}

/** Papéis de guardas `if (![...].includes(<papel>)) return 403` num trecho de corpo. */
export function papeisDeListaNegada(corpo: string): string[] {
  const saida: string[] = [];
  const guarda = /if\s*\(\s*!\s*\[([^\]]*)\]\s*\.includes\(\s*((?:[^()]|\([^()]*\))*?)\s*\)\s*\)\s*\{?\s*return\s+res\s*\.\s*(?:status\(\s*403\s*\)|sendStatus\(\s*403\s*\))/g;
  for (const m of Array.from(corpo.matchAll(guarda))) {
    const [, lista, arg] = m;
    const ehPapel = /userRole/.test(arg)
      || (/^(role|papel)\b/.test(arg) && new RegExp(`const ${arg.match(/^\w+/)![0]}\\s*=\\s*[^;]*userRole`).test(corpo));
    if (!ehPapel) continue;
    for (const p of Array.from(lista.matchAll(/["'](\w+)["']/g))) saida.push(p[1]);
  }
  return saida;
}

/**
 * Varre as rotas de ESCRITA (post/patch/put/delete) e devolve as que têm
 * papel declarado. Rota só com `requireAuth` (qualquer logado) fica de fora —
 * a tabela declara restrições, não a ausência delas.
 */
export function lerReguaDoServidor(dirRoutes?: string): RotaComPapel[] {
  const dir = dirRoutes ?? path.resolve(__dirname, "routes");
  // Recursivo: as rotas da peça moram em routes/itens/ (o items.ts é só o
  // índice). A chave é o caminho relativo ("itens/edicao.ts").
  const fontes = new Map<string, string>();
  const varrer = (sub: string) => {
    for (const e of readdirSync(path.join(dir, sub), { withFileTypes: true })) {
      const rel = sub ? `${sub}/${e.name}` : e.name;
      if (e.isDirectory()) varrer(rel);
      else if (e.name.endsWith(".ts")) fontes.set(rel, readFileSync(path.join(dir, rel), "utf8"));
    }
  };
  varrer("");
  const aliases = coletarAliases(fontes);
  const saida: RotaComPapel[] = [];

  for (const [arquivo, src] of Array.from(fontes.entries())) {
    const linhas = src.split(/\r?\n/);
    for (let i = 0; i < linhas.length; i++) {
      const m = linhas[i].match(/app\.(post|patch|put|delete)\(\s*["'`]([^"'`]+)["'`](.*)$/);
      if (!m) continue;
      const [, metodo, rota, resto] = m;

      const papeis = new Set<string>();

      // 1 · guardas na assinatura (requireRole inline ou alias)
      const inline = resto.match(/requireRole\(([^)]*)\)/);
      if (inline) for (const p of Array.from(inline[1].matchAll(/["'](\w+)["']/g))) papeis.add(p[1]);
      for (const [nome, lista] of Array.from(aliases.entries())) {
        if (resto.includes(nome)) for (const p of lista) papeis.add(p);
      }

      // 2 · checagens à mão no INÍCIO do corpo (até a próxima rota ou 45
      //     linhas — o mesmo recorte usado para escrever a tabela; uma guarda
      //     mais funda que isso está funda demais e merece quebrar o teste
      //     para alguém olhar).
      const corpo = (() => {
        const bloco: string[] = [];
        for (let j = i + 1; j < Math.min(i + 45, linhas.length); j++) {
          if (/app\.(get|post|patch|put|delete)\(/.test(linhas[j])) break;
          // Comentário não é guarda. Sem este corte, o DELETE do complemento
          // ganhava "grafica" de um comentário que explica como REVERTER a
          // regra — o oposto exato do que a rota faz.
          bloco.push(linhas[j].replace(/\/\/.*$/, ""));
        }
        return bloco.join("\n");
      })();

      const negados = Array.from(corpo.matchAll(/userRole !== ["'](\w+)["']/g)).map((x) => x[1]);
      if (negados.length) for (const p of negados) papeis.add(p);

      // A lista negada: `if (!["admin", "arte"].includes(req.userRole ?? ""))`
      // (ou de uma `role` tirada de userRole) que responde 403 NA HORA. Se o
      // bloco faz outra coisa antes (ex.: aceita o criador do evento), não é
      // recorte por papel e fica de fora — como o canCreateItemsFor.
      for (const papel of papeisDeListaNegada(corpo)) papeis.add(papel);

      // 3 · a forma afirmativa (`const isAdmin = userRole === 'admin'`) e os
      //     PREDICADOS PUROS (`podeMudarQuantidade`), resolvidos do fonte. Um
      //     predicado só entra se o corpo dele for exclusivamente comparação
      //     de papel — `canCreateItemsFor` mistura "criador do evento" e não
      //     pode virar lista de papéis, senão a tabela afirmaria uma
      //     restrição mais dura do que a real.
      if (papeis.size === 0) {
        for (const x of Array.from(corpo.matchAll(/userRole === ["'](\w+)["']/g))) papeis.add(x[1]);
      }
      if (papeis.size === 0) {
        for (const [nome, lista] of Array.from(predicadosPuros(src).entries())) {
          if (corpo.includes(`${nome}(req`)) for (const p of lista) papeis.add(p);
        }
      }

      if (papeis.size === 0) continue;
      saida.push({ metodo: metodo.toUpperCase(), rota, papeis: Array.from(papeis).sort(), arquivo });
    }
  }
  return saida.sort((a, b) => a.rota.localeCompare(b.rota) || a.metodo.localeCompare(b.metodo));
}
