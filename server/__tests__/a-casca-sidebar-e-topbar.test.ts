// ─────────────────────────────────────────────────────────────────────────────
// A CASCA — SIDEBAR E TOPBAR.
//
// O refino da casca é o mais fácil de desfazer sem ninguém notar: ela não tem
// tela própria, aparece em todas, e nenhum teste de fluxo passa por ela.
//
// O que este arquivo guarda:
//
//   1. A ESTRUTURA NÃO MUDOU. Mesmos 18 itens, mesma ordem, mesmo controle de
//      permissão. O refino era de acabamento; se um item sumir junto, o
//      "acabamento" virou outra coisa.
//
//   2. 18 ITENS CABEM. Cada item passou a ter ALTURA de controle (36/44) em
//      vez de padding, e `flexShrink: 0` — sem isso, numa janela de 768px de
//      altura o flex comprime os itens até o texto encostar na borda. Foi o
//      motivo de a régua entre grupos ter substituído os 20px de vão: 1px no
//      lugar de 20, quatro vezes, devolve quase uma dobra.
//
//   3. O TÍTULO DA TOPBAR NÃO ATROPELA OS CONTROLES. Ele passou a aparecer ao
//      rolar (antes era `md:hidden`, e quem rolava uma lista longa ficava sem
//      nenhuma indicação de onde estava). Só pode entrar com `minWidth: 0` e
//      reticência, senão empurra sino e conta para fora em 1024px.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const sidebar = ler("client/src/components/app-sidebar.tsx");
const app = ler("client/src/App.tsx");
const sino = ler("client/src/components/notification-bell.tsx");

const soCodigo = (fonte: string) => fonte
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

describe("1. a estrutura do menu não mudou", () => {
  it("continuam 24 itens — incluindo ações administrativas e páginas novas", () => {
    // VINTE E UM. Eram 19 quando este teste nasceu (o prompt do refino dizia 18);
    // o vigésimo é "Correção de textos", a tela de reparo dos motivos, que
    // entrou depois; o vigésimo primeiro é "Versões aprovadas" (21/08/2026).
    // O vigésimo terceiro é "Solicitação de peças", a caixa da Solicitação (14/09).
    // As ações administrativas incluem Notificações, Reparar vínculos e Inferir
    // executivos; o vigésimo quarto é "Máquinas da Gráfica".
    // O teste existe para a mudança ser DECLARADA, não impedida.
    const itens = (sidebar.match(/\{ title: "/g) ?? []).length;
    expect(itens).toBe(26); // + Inferir executivos e Reparo de vínculos (vieram do Replit, 21/09)
  });

  it("e o controle de permissão segue de pé", () => {
    expect(sidebar).toContain("filterByRole");
    expect(sidebar).toContain("hasPermission");
  });
});

describe("2. os 18 itens cabem sem serem esmagados", () => {
  const codigo = soCodigo(sidebar);

  it("o item tem altura de controle, não de padding", () => {
    // 36 no mouse, 44 com o dedo — pelo ponteiro (vale no tablet também),
    // não mais só abaixo de 768px de janela.
    expect(codigo).toContain("height: alvo(H.md, grosso)");
    expect(codigo).toContain("const grosso = usePonteiroGrosso() || isMobileCasca;");
    expect(codigo).not.toContain('padding: "8px 12px"');
  });

  it("e não encolhe quando a coluna aperta", () => {
    expect(codigo).toContain("flexShrink: 0");
  });

  it("a separação entre grupos é régua, não vão de 20px", () => {
    // O hex saiu: a régua usa o n3 da escada de neutros (#f0efee). Antes era
    // #f1efec, um cinza que só existia nesta linha.
    expect(codigo).toContain('backgroundColor: N.n3, margin: "14px 18px 0"');
    expect(codigo).not.toContain('"20px 0 4px"');
  });

  it("o rótulo mais longo do menu trunca com title", () => {
    // "Vincular Patrocinadores" era o único que podia encostar na borda.
    // 16/09: o title passou a dizer também PARA QUE SERVE a tela.
    expect(codigo).toContain("<span title={DESCRICAO_DA_TELA[item.url] ? `${item.title} — ${DESCRICAO_DA_TELA[item.url]}` : item.title}");
  });
});

describe("3. o título da topbar aparece ao rolar, sem atropelar", () => {
  const codigo = soCodigo(app);

  it("observa o h1 da página", () => {
    expect(codigo).toContain('document.querySelector("main h1")');
    expect(codigo).toContain("IntersectionObserver");
  });

  it("desconta a própria topbar na margem do observador", () => {
    // Sem isto, o h1 que passou POR BAIXO da barra ainda conta como visível.
    expect(codigo).toContain('rootMargin: "-64px 0px 0px 0px"');
  });

  it("e encolhe com reticência em vez de empurrar os controles", () => {
    expect(codigo).toContain('flex: "1 1 auto", minWidth: 0');
    expect(codigo).toContain('textOverflow: "ellipsis"');
  });

  it("a barra fecha com borda, não com sombra sobre fundo quase igual", () => {
    expect(codigo).toContain('borderBottom: "1px solid #e7e5e4"');
    expect(codigo).not.toContain("0 16px 32px -12px");
  });
});

describe("4. o sino", () => {
  const codigo = soCodigo(sino);

  it("o contador saiu de dentro do ícone", () => {
    expect(codigo).toContain('position: "absolute", top: -5, right: -5');
    // O vermelho de alarme da casa é TOM.perigo.text (#b91c1c), o mesmo da
    // pílula de status. O #dc2626 que rondava estas telas dá 4,0:1 como texto
    // e reprova AA — por isso o token, e não o hex.
    expect(codigo).toContain("backgroundColor: TOM.perigo.text");
  });

  it("e não treme com dois dígitos", () => {
    expect(codigo).toContain('fontVariantNumeric: "tabular-nums"');
  });

  it("o rodapé deixou de ser a única faixa invertida da casca", () => {
    expect(codigo).not.toContain('color: "#d4d0ce"');
  });

  it("o fundo creme de não lida saiu — o sinal é o ponto e o peso", () => {
    expect(codigo).not.toContain("#fffbf5");
    expect(codigo).toContain("fontWeight: !n.isRead ? 700 : 500");
  });
});

describe("5. a rolagem da sidebar não pula", () => {
  const css = readFileSync(path.resolve(__dirname, "../../client/src/index.css"), "utf8");

  it("a largura da barra é constante — só a cor muda no hover", () => {
    // Antes ela era escondida em repouso e passava a 8px no hover: a lista
    // inteira se deslocava quando o ponteiro entrava na sidebar, e voltava
    // quando saía. Com 19 itens, que já obrigam a rolar, era um pula-pula a
    // cada passada do mouse.
    expect(css).toContain(".sidebar-scroll::-webkit-scrollbar {");
    expect(css).not.toContain(".sidebar-no-scroll");
  });

  it("e o polegar é discreto parado, firme sob o ponteiro", () => {
    expect(css).toContain("scrollbar-color: #e7e5e4 transparent;");
    expect(css).toContain("scrollbar-color: #a8a29e #f5f5f4;");
  });

  it("o hover saiu do React — era render para trocar classe", () => {
    expect(soCodigo(sidebar)).not.toContain("contentHover");
    expect(soCodigo(sidebar)).toContain('className="sidebar-scroll"');
  });
});
