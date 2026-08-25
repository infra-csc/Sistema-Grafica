// ─────────────────────────────────────────────────────────────────────────────
// ETIQUETAS DO EVENTO — o template de colar no material (pedido do dono,
// 24/08, com o PDF do Circuito Vale como modelo).
//
// O que o modelo pede e este arquivo prende: A4 DEITADO com duas etiquetas
// por folha e linha de corte; o nome do evento gigante (é o que se lê de
// longe na pilha); uma peça por etiqueta; e o recorte certo — a etiqueta
// nasce da CONFERÊNCIA, não da lista inteira.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const PAGINA = readFileSync(new URL("../../client/src/pages/etiquetas-evento.tsx", import.meta.url), "utf8");
const APP = readFileSync(new URL("../../client/src/App.tsx", import.meta.url), "utf8");
const DETALHE = readFileSync(new URL("../../client/src/pages/event-detail.tsx", import.meta.url), "utf8");

describe("a página /eventos/:id/etiquetas", () => {
  it("existe na rota, protegida, com a porta no Detalhe do Evento", () => {
    expect(APP).toContain('<Route path="/eventos/:id/etiquetas">');
    expect(APP).toContain("<ProtectedRoute component={EtiquetasEvento} />");
    expect(DETALHE).toContain('data-testid="button-etiquetas-evento"');
  });

  it("A4 nas DUAS orientações, duas por folha, linha de corte, barra fora da impressão", () => {
    // 25/08: a folha ganhou o modo retrato — em pé, com o conteúdo deitado,
    // como o template original do dono (corte vertical, leitura de lado).
    expect(PAGINA).toContain('size: A4 ${orientacao === "retrato" ? "portrait" : "landscape"}');
    expect(PAGINA).toContain("etq-moldura-retrato");
    expect(PAGINA).toContain("transform: rotate(90deg)");
    expect(PAGINA).toContain("pecas.slice(f * 2, f * 2 + 2)");
    // 25/08 (revisão 10/10): a etiqueta virou MEIA FOLHA cravada — a linha de
    // corte cai no meio do papel, onde a guilhotina corta, e não onde o
    // conteúdo mandar. Folha ímpar deixa a metade de baixo vazia.
    expect(PAGINA).toContain('.etq-etiqueta { height: 50%; flex: none; overflow: hidden;');
    expect(PAGINA).toContain('borderBottom: i === 0 ? "2px dashed #d6d3d1" : "none"');
    expect(PAGINA).toContain('aspect-ratio: 297 / 210');
    expect(PAGINA).toContain(".etq-acao { display: none !important; }");
    expect(PAGINA).toContain('className="etq-folha"');
    expect(PAGINA).toContain("page-break-after: always;");
  });

  it("abre nas CONFERIDAS — a etiqueta nasce da conferência", () => {
    expect(PAGINA).toContain('const CONFERIDA = new Set(["conferred", "conferido", "delivered", "entregue"]);');
    expect(PAGINA).toContain("(i.conferredQty ?? 0) > 0");
    expect(PAGINA).toContain("const [incluirTodas, setIncluirTodas] = useState(false);");
    // e o vazio explica de onde as etiquetas vêm, em vez de parecer quebrado
    expect(PAGINA).toContain("a etiqueta nasce da conferência");
  });

  it("dois níveis, como no modelo: a marca pequena e a palavra GIGANTE", () => {
    // No PDF do dono, 'Circuito Corrida Vale 2026' é pequeno e 'ITABIRA' é
    // enorme. O padrão é a última palavra do nome; o campo é editável antes
    // de imprimir porque 'São Paulo' tem duas palavras e nenhuma regra
    // automática acerta todas.
    expect(PAGINA).toContain('const palavraFinal = nome.trim().split(/\\s+/).slice(-1)[0] ?? "";');
    expect(PAGINA).toContain('data-testid="input-destaque"');
    expect(PAGINA).toContain('fontSize: gigante && prefixo ? "clamp(56px, 8vw, 104px)" : "clamp(34px, 5.2vw, 64px)"');
    expect(PAGINA).toContain("compareDisplayId(a.displayId, b.displayId)");
  });

  it("canceladas e excluídas não ganham etiqueta nem no 'incluir todas'", () => {
    expect(PAGINA).toContain('!i.deletedAt && i.status !== "canceled" && i.status !== "archived"');
  });
});
describe("a etiqueta no caminho de quem confere (25/08)", () => {
  // Depois de conferir, a etiqueta se imprime — e a porta ficava só no
  // Detalhe do Evento, fora do fluxo da Gráfica.
  const G = readFileSync(new URL("../../client/src/pages/grafica.tsx", import.meta.url), "utf8");

  it("o cabeçalho de cada evento na Gráfica ganha o atalho, nos dois layouts", () => {
    expect(G).toContain("link-etiquetas-mobile-");
    expect(G).toContain("data-testid={`link-etiquetas-${item.eventId}`}");
    // só quando há conferida no recorte — atalho para lista vazia é ruído
    expect(G.split("(etiquetaveisPorEvento.get(String(item.eventId)) ?? 0) > 0").length - 1).toBe(2);
  });

  it("a contagem é de peça JÁ conferida (total, parcial ou entregue)", () => {
    expect(G).toContain("conferredOf(i) > 0 || isConferred(i) || isDelivered(i)");
  });

  it("o galpão avisa no resumo de saída da conferência", () => {
    expect(G).toContain("As etiquetas já podem ser impressas");
  });
});
describe("seleção e origem (25/08)", () => {
  it("cada peça do pool tem chip de marcar/desmarcar, com todas/nenhuma", () => {
    expect(PAGINA).toContain('data-testid={`selecao-peca-${p.id}`}');
    expect(PAGINA).toContain('data-testid="selecao-todas"');
    expect(PAGINA).toContain('data-testid="selecao-nenhuma"');
    // o conjunto guarda as DESMARCADAS: vazio = todas, e peça nova entra marcada
    expect(PAGINA).toContain("const pecas = useMemo(() => pool.filter((p) => !desmarcadas.has(p.id)), [pool, desmarcadas]);");
  });

  it("quem veio da Gráfica volta para a Gráfica", () => {
    expect(PAGINA).toContain('get("de") === "grafica"');
    expect(PAGINA).toContain("const voltarHref = veioDaGrafica");
    const G = readFileSync(new URL("../../client/src/pages/grafica.tsx", import.meta.url), "utf8");
    expect(G.split("/etiquetas?de=grafica").length - 1).toBe(2);
  });
});
describe("o logo da prova, tirado do book (25/08)", () => {
  it("o recorte da caixa do conteúdo é puro e acha o logo no fundo liso", async () => {
    const { recortarCaixaDoConteudo } = await import("../../client/src/lib/logo-do-book");
    // 10×10 de fundo (200,200,200) com um bloco 3×2 escuro em (4,3)
    const w = 10, h = 10;
    const px = new Uint8ClampedArray(w * h * 4).fill(200);
    for (let y = 3; y < 5; y++) for (let x = 4; x < 7; x++) {
      const i = (y * w + x) * 4; px[i] = 20; px[i+1] = 80; px[i+2] = 60;
    }
    const caixa = recortarCaixaDoConteudo(px, w, h);
    expect(caixa).not.toBeNull();
    // contém o bloco (com folga de 3% arredondada)
    expect(caixa!.x).toBeLessThanOrEqual(4);
    expect(caixa!.x + caixa!.w).toBeGreaterThanOrEqual(7);
    expect(caixa!.y).toBeLessThanOrEqual(3);
    expect(caixa!.y + caixa!.h).toBeGreaterThanOrEqual(5);
    // página toda lisa: nada a recortar
    expect(recortarCaixaDoConteudo(new Uint8ClampedArray(w * h * 4).fill(200), w, h)).toBeNull();
  });

  it("a etiqueta usa o logo quando existe, com interruptor, e cai para o texto", () => {
    expect(PAGINA).toContain('data-testid="logo-etiqueta"');
    expect(PAGINA).toContain('data-testid="check-usar-logo"');
    expect(PAGINA).toContain("{!(logo && usarLogo) && gigante && prefixo && (");
    // nunca lança: sem book a etiqueta segue como era
    const LIB = readFileSync(new URL("../../client/src/lib/logo-do-book.ts", import.meta.url), "utf8");
    expect(LIB).toContain("return null;");
    expect(LIB).toContain("catch {");
  });
});



