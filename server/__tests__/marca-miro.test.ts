// ─────────────────────────────────────────────────────────────────────────────
// MARCA MIRÓ COMUNICAÇÃO VISUAL (30/10) — o kit do dono no lugar da NORTE:
// logo + "Comunicação Visual" no menu, na entrada e no carregamento; símbolo no
// trilho, no favicon e nos ícones do celular; "Miró — Página" na aba. Fica
// NORTE o que é da empresa (o portal NORTE, o formato de planilha NORTE).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

const raiz = path.resolve(__dirname, "../..");
const ler = (f: string) => readFileSync(path.join(raiz, f), "utf8");
const ARQUIVOS = ["miro-logo-20261030.svg", "miro-logo-escuro-20261030.svg", "miro-simbolo-20261030.svg", "miro-simbolo-escuro-20261030.svg", "miro-favicon-20261030.svg"];

describe("marca Miró", () => {
  it("os arquivos existem, nas cores do kit; a versão escura troca só o grafite", () => {
    for (const f of ARQUIVOS) expect(existsSync(path.join(raiz, "client/public/brand", f)), f).toBe(true);
    const clara = ler("client/public/brand/miro-logo-20261030.svg");
    const escura = ler("client/public/brand/miro-logo-escuro-20261030.svg");
    expect(clara).toContain("#211E1B");
    expect(clara).toContain("#E45B12");
    expect(escura).not.toContain("#211E1B");
    expect(escura).toContain("#E45B12");
    expect(ler("client/public/brand/miro-favicon-20261030.svg")).toContain("prefers-color-scheme: dark");
    for (const f of ARQUIVOS) expect(ler(`client/public/brand/${f}`), f).not.toMatch(/<script|onload=|href=/i);
  });

  it("menu, entrada, carregamento, favicon, manifest e aba usam a Miró", () => {
    // Um desenho só (components/marca-miro): o logo do kit + "Comunicação
    // Visual" em TEXTO — a linha do SVG de assinatura ficava com ~5px no menu.
    const marca = ler("client/src/components/marca-miro.tsx");
    expect(marca).toContain('"/brand/miro-logo-20261030.svg"');
    expect(marca).toContain("Comunicação Visual");
    const menu = ler("client/src/components/app-sidebar.tsx");
    expect(menu).toContain("<MarcaMiro altura={30} />");
    expect(menu).toContain('src="/brand/miro-simbolo-20261030.svg"');
    const entrada = ler("client/src/pages/login.tsx");
    expect(entrada).toContain("Entrar na Miró");
    expect(entrada).toContain("<MarcaMiro altura={40} fundoEscuro />");
    expect(ler("client/src/components/full-page-loader.tsx")).toContain("<MarcaMiro altura={36} decorativa />");
    const html = ler("client/index.html");
    expect(html).toContain('href="/brand/miro-favicon-20261030.svg"');
    expect(html).toContain('content="Miró"');
    expect(JSON.parse(ler("client/public/manifest.webmanifest")).short_name).toBe("Miró");
    expect(ler("client/src/App.tsx")).toContain("`Miró — ${pageLabel}`");
    // O tema escuro mostra a versão escura — sem o filtro que apagava o laranja.
    const css = ler("client/src/styles/color-mode.css");
    expect(css).toContain(".dark .marca-escura { display: block !important; }");
    expect(css).not.toContain("grafica-logo");
  });

  it("o portal continua sendo o NORTE (é da empresa, não do app)", () => {
    expect(ler("client/src/pages/login.tsx")).toContain("Entre no portal NORTE");
  });
});
