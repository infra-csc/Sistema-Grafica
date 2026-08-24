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
  for (const src of fontes.values()) {
    for (const m of src.matchAll(/const (require\w+) = requireRole\(([^)]*)\)/g)) {
      const papeis = [...m[2].matchAll(/["'](\w+)["']/g)].map((x) => x[1]);
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
  for (const f of src.matchAll(/function (\w+)\(req[^)]*\)[^{]*\{\s*\n\s*return ([^;]+);\s*\n\s*\}/g)) {
    const [, nome, corpo] = f;
    const papeis = [...corpo.matchAll(/userRole === ["'](\w+)["']/g)].map((x) => x[1]);
    const soPapel = corpo.replace(/req\.userRole === ["']\w+["']/g, "").replace(/[\s|()]/g, "") === "";
    if (papeis.length && soPapel) m.set(nome, papeis.sort());
  }
  return m;
}

/**
 * Varre as rotas de ESCRITA (post/patch/put/delete) e devolve as que têm
 * papel declarado. Rota só com `requireAuth` (qualquer logado) fica de fora —
 * a tabela declara restrições, não a ausência delas.
 */
export function lerReguaDoServidor(dirRoutes?: string): RotaComPapel[] {
  const dir = dirRoutes ?? path.resolve(__dirname, "routes");
  const fontes = new Map<string, string>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    fontes.set(f, readFileSync(path.join(dir, f), "utf8"));
  }
  const aliases = coletarAliases(fontes);
  const saida: RotaComPapel[] = [];

  for (const [arquivo, src] of fontes) {
    const linhas = src.split(/\r?\n/);
    for (let i = 0; i < linhas.length; i++) {
      const m = linhas[i].match(/app\.(post|patch|put|delete)\(\s*["'`]([^"'`]+)["'`](.*)$/);
      if (!m) continue;
      const [, metodo, rota, resto] = m;

      const papeis = new Set<string>();

      // 1 · guardas na assinatura (requireRole inline ou alias)
      const inline = resto.match(/requireRole\(([^)]*)\)/);
      if (inline) for (const p of [...inline[1].matchAll(/["'](\w+)["']/g)]) papeis.add(p[1]);
      for (const [nome, lista] of aliases) {
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

      const negados = [...corpo.matchAll(/userRole !== ["'](\w+)["']/g)].map((x) => x[1]);
      if (negados.length) for (const p of negados) papeis.add(p);

      // 3 · a forma afirmativa (`const isAdmin = userRole === 'admin'`) e os
      //     PREDICADOS PUROS (`podeMudarQuantidade`), resolvidos do fonte. Um
      //     predicado só entra se o corpo dele for exclusivamente comparação
      //     de papel — `canCreateItemsFor` mistura "criador do evento" e não
      //     pode virar lista de papéis, senão a tabela afirmaria uma
      //     restrição mais dura do que a real.
      if (papeis.size === 0) {
        for (const x of corpo.matchAll(/userRole === ["'](\w+)["']/g)) papeis.add(x[1]);
      }
      if (papeis.size === 0) {
        for (const [nome, lista] of predicadosPuros(src)) {
          if (corpo.includes(`${nome}(req`)) for (const p of lista) papeis.add(p);
        }
      }

      if (papeis.size === 0) continue;
      saida.push({ metodo: metodo.toUpperCase(), rota, papeis: [...papeis].sort(), arquivo });
    }
  }
  return saida.sort((a, b) => a.rota.localeCompare(b.rota) || a.metodo.localeCompare(b.metodo));
}
