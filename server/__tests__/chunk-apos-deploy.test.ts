// ─────────────────────────────────────────────────────────────────────────────
// CHUNK PERDIDO DEPOIS DO DEPLOY — a blindagem (31/08).
//
// O print do dono: "/grafica" com "Failed to fetch dynamically imported
// module: .../assets/grafica-BrXTdZZg.js". É o modo de falha clássico do code
// splitting: o navegador segura um index.html velho que aponta para hashes
// que o Republicar acabou de apagar. A defesa tem três camadas, e este
// arquivo pina as três:
//
//   1. SERVIDOR: index.html com no-store (nunca envelhece) e /assets com
//      cache de 1 ano immutable (hash no nome = seguro).
//   2. lazyPage: recarrega sozinho UMA vez por deploy — e devolve a recarga
//      quando um chunk carrega, senão o 2º deploy da sessão cai no erro cru.
//   3. ErrorBoundary: se ainda assim chegar lá, a tela fala português
//      ("O sistema acabou de ser atualizado") e o botão RECARREGA de
//      verdade — setState não cura lazy rejeitado.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const VITE = ler("server/vite.ts");
const APP = ler("client/src/App.tsx");

describe("o servidor", () => {
  it("nunca deixa o index.html envelhecer no cache — e o fall-through da SPA também é no-store", () => {
    expect(VITE).toContain('res.setHeader("Cache-Control", "no-store")');
    expect(VITE).toContain('filePath.endsWith("index.html")');
  });

  it("os chunks com hash vivem 1 ano, immutable", () => {
    expect(VITE).toContain('maxAge: "365d", immutable: true');
  });
});

describe("o cliente", () => {
  it("lazyPage recarrega uma vez por deploy — e DEVOLVE a recarga quando o chunk carrega", () => {
    expect(APP).toContain("CHAVE_RELOAD_DE_CHUNK");
    expect(APP).toContain("sessionStorage.removeItem(CHAVE_RELOAD_DE_CHUNK)");
    expect(APP).toContain("window.location.reload()");
  });

  it("chunk perdido ganha tela em português com botão que recarrega — não stack trace vermelho", () => {
    expect(APP).toContain("ehChunkPerdido");
    expect(APP).toContain("dynamically imported module");
    expect(APP).toContain("O sistema acabou de ser atualizado");
    expect(APP).toContain("Recarregar agora");
    // o botão do caminho de chunk recarrega a página, não faz setState
    const tela = APP.slice(APP.indexOf("tela-nova-versao"));
    expect(tela.slice(0, 1400)).toContain("window.location.reload()");
  });
});
