// ─────────────────────────────────────────────────────────────────────────────
// O MODAL NÃO PODE SER MAIS POBRE QUE A PÁGINA QUE O ABRE.
//
// O defeito que este arquivo existe para impedir, contado uma vez:
//
// O Painel Geral tem um overlay próprio — a confirmação de exclusão — e ele
// vinha com o shadcn CRU, sem uma linha de estilo. Enquanto isso os três
// diálogos do Detalhe do Evento e o do Estoque já tinham superfície deliberada:
// raio 16, padding 32, sem borda, sombra larga.
//
// É o que mais denuncia uma tela feita pela metade: a página refinada e, ao
// confirmar uma exclusão, um modal com cara de biblioteca instalada ontem. E
// confirmar exclusão é justamente o momento de MAIOR atrito da tela — é onde a
// pessoa para para ler. Ser o componente menos acabado ali é o pior lugar.
//
// Junto ia uma segunda inconsistência: o botão destrutivo usava #dc2626
// enquanto o mesmo arquivo usa #b91c1c em outros oito lugares. Os dois passam
// AA com texto branco (4,83 e 6,47), então não era contraste — era o app ter
// dois vermelhos diferentes para "apagar".
//
// A regra que fica: overlay faz parte da tela. Se a página tem sistema visual e
// o modal não tem, a tela não está pronta — só parece pronta na captura de tela.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const painel = readFileSync(path.resolve(__dirname, "../../client/src/pages/painel-geral.tsx"), "utf8");

/** O bloco do diálogo de exclusão, do <AlertDialog até o fechamento. */
function blocoDoDialogo(): string {
  const i = painel.indexOf("<AlertDialog open={!!deleteConfirmItemId}");
  expect(i).toBeGreaterThan(-1);
  return painel.slice(i, painel.indexOf("</AlertDialog>", i));
}

describe("a confirmação de exclusão tem superfície própria", () => {
  it("não é mais o AlertDialogContent cru", () => {
    expect(blocoDoDialogo()).not.toContain("<AlertDialogContent>");
  });

  it("usa a mesma linguagem de superfície dos outros diálogos do app", () => {
    const b = blocoDoDialogo();
    expect(b).toContain("borderRadius: 16");
    expect(b).toContain("padding: 32");
    expect(b).toContain('border: "none"');
    expect(b).toContain("boxShadow:");
  });

  it("o título e a descrição têm tipografia declarada", () => {
    const b = blocoDoDialogo();
    // Sem isto o modal herda o corpo do shadcn e destoa da página, que usa
    // Space Grotesk nos títulos.
    expect(b).toMatch(/AlertDialogTitle style=/);
    expect(b).toMatch(/AlertDialogDescription style=/);
  });
});

describe("um vermelho destrutivo só", () => {
  it("o botão de excluir usa o vermelho do resto do arquivo", () => {
    expect(blocoDoDialogo()).toContain('backgroundColor: "#b91c1c"');
  });

  it("o vermelho concorrente não voltou como cor de fundo", () => {
    expect(painel).not.toContain('backgroundColor: "#dc2626"');
  });
});

describe("o diálogo continua se comportando durante a ação", () => {
  it("cancelar e confirmar ficam travados enquanto exclui", () => {
    const b = blocoDoDialogo();
    expect(b).toContain("disabled={deleteItemMutation.isPending}");
    // Duas vezes: o cancelar e o confirmar. Travar só um deixa a porta aberta
    // para cancelar no meio da requisição.
    expect(b.split("disabled={deleteItemMutation.isPending}").length - 1).toBe(2);
  });

  it("o diálogo não fecha sozinho antes de a exclusão terminar", () => {
    // preventDefault no clique: sem ele o Radix fecha na hora e o "Excluindo…"
    // nunca chega a aparecer. Quem fecha é o onSuccess da mutação.
    expect(blocoDoDialogo()).toContain("e.preventDefault();");
    expect(blocoDoDialogo()).toContain("Excluindo...");
  });
});
