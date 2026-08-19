// @vitest-environment jsdom
//
// O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR
//
// Três telas registravam um botão de recuperação no toast e as três eram
// descartadas em silêncio: o `Toaster` da casa — o único montado no app —
// nunca leu o campo `action`.
//
//   • Gestão de Prazos: "Desfazer" depois que o Esc limpa NOVE filtros de uma
//     vez. Não havia caminho de volta nenhum.
//   • Eventos: "Abrir evento" depois de criar (o comentário na origem diz que
//     sem ele "o usuário precisa caçar o card recém-criado, que pode estar
//     fora do filtro ativo").
//   • Eventos: "Mostrar" depois de encerrar (o comentário diz que sem ele
//     "pode reabrir a qualquer momento" só é verdade para quem já sabe onde o
//     evento foi parar).
//
// O tipo existia no hook, o TypeScript aceitava, e nada avisava. Um teste que
// só lesse o código-fonte da PÁGINA teria passado — o buraco estava do outro
// lado, em quem renderiza.
import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement } from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { Toaster } from "@/components/ui/toaster";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";

afterEach(() => cleanup());

function abrirToastComAcao(onClick: () => void) {
  render(createElement(Toaster));
  act(() => {
    toast({
      title: "Filtros limpos",
      action: createElement(ToastAction, { altText: "Desfazer a limpeza", onClick }, "Desfazer"),
    });
  });
}

describe("o toast mostra o caminho de volta", () => {
  it("renderiza o botão da ação", () => {
    abrirToastComAcao(() => {});
    expect(screen.getByText("Desfazer")).toBeTruthy();
  });

  it("clicar na ação executa o que a tela registrou — exatamente uma vez", () => {
    const desfazer = vi.fn();
    abrirToastComAcao(desfazer);
    fireEvent.click(screen.getByText("Desfazer"));
    expect(desfazer).toHaveBeenCalledTimes(1);
  });

  it("o alvo da ação respeita a régua de 36px da casa", () => {
    abrirToastComAcao(() => {});
    // 36 e não os 32 do shadcn: o toast dura 4,2s, então é o pior lugar
    // possível para um alvo apertado.
    expect((screen.getByText("Desfazer") as HTMLElement).style.height).toBe("36px");
  });

  it("o botão de fechar também está na régua (era 24px)", () => {
    abrirToastComAcao(() => {});
    const fechar = screen.getByLabelText("Fechar aviso") as HTMLElement;
    expect(fechar.style.width).toBe("36px");
    expect(fechar.style.height).toBe("36px");
  });
});
