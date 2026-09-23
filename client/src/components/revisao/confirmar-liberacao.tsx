// A confirmação de LIBERAR a peça aberta na ficha — com a conta do estoque, a
// trava (liberar e destravar, ou liberar mantendo) e o pedido ao estoque em
// aberto ditos antes do clique.
//
// As confirmações da Revisão usam a casca da casa: `modalSurface(470)` +
// ModalHeader `confirm` + corpo rolável + fileira de <Botao>. O título visível
// é o do ModalHeader; o AlertDialogTitle fica só para o leitor de tela. Os
// botões passam pelas primitivas Cancel/Action (asChild): o Action FECHA no
// clique, e o Cancel é o foco inicial — salvo aqui, onde o foco vai no Liberar.
import type { RefObject } from "react";
import { Check, Unlock } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
// A primitiva, e não o AlertDialogAction/Cancel de ui/: aqueles aplicam as
// classes do botão do shadcn, que brigariam com o <Botao> passado por asChild.
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { Botao } from "@/components/ui/botao";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { seloDaTrava } from "@shared/trava-da-peca";
import type { propostaDaLiberacao } from "@shared/consultas-de-estoque";
import { T, TOM } from "@/lib/theme";
import { CORPO_DA_CONFIRMACAO, RODAPE_DA_CONFIRMACAO, TEXTO_DA_CONFIRMACAO } from "./estilos";
import { reaproveitamentoTotal } from "./regras";
import type { PecaDaRevisao } from "./tipos";

/** O que a ficha manda ao liberar: a sugestão do estoque ou "usar menos", e a trava. */
export type PedidoDeLiberacao = {
  itemId: string;
  corpo?: { reuseQty: number; peloEstoque: true };
  trava?: "destravar" | "manter";
};

export function ConfirmarLiberacao({
  open, onOpenChange, dedo, selectedItem, propostaDaFicha, usarMenos, fichaTravada, pecaDaFicha,
  pedidoEmAberto, liberando, botaoConfirmarRef, aoLiberar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dedo: boolean;
  selectedItem: PecaDaRevisao | null;
  propostaDaFicha: ReturnType<typeof propostaDaLiberacao> | null;
  usarMenos: number | null;
  fichaTravada: boolean;
  pecaDaFicha: PecaDaRevisao | null;
  pedidoEmAberto: boolean;
  liberando: boolean;
  botaoConfirmarRef: RefObject<HTMLButtonElement>;
  aoLiberar: (pedido: PedidoDeLiberacao) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {/* FOCO NO "LIBERAR", não no Cancelar (o padrão do Radix). Quem chega
          aqui pelo atalho Enter da ficha apertava Enter de novo e CANCELAVA:
          revisar em fila pelo teclado exigia Tab a cada peça. Liberar não
          destrói nada — é o caminho que a tela existe para percorrer —, e a
          confirmação continua existindo porque a peça sai para impressão. */}
      <AlertDialogContent
        className={HIDE_NATIVE_CLOSE}
        style={modalSurface(470)}
        onOpenAutoFocus={(e) => { e.preventDefault(); botaoConfirmarRef.current?.focus(); }}
      >
        {/* POR QUE congelar aqui: o mesmo onSuccess que fecha esta confirmação
            também faz `setSelectedItem(null)` — e é `selectedItem` que escreve
            o ID e o tipo da peça na descrição. Sem congelar, a frase inteira
            some antes do diálogo terminar de sair. */}
        <FreezeWhileClosing open={open}>
        <ModalHeader variant="confirm" icon={Check} tint={T.text} title="Liberar para produção" onClose={() => onOpenChange(false)} />
        <AlertDialogTitle className="sr-only">Liberar para produção</AlertDialogTitle>
        <div style={CORPO_DA_CONFIRMACAO}>
          <AlertDialogDescription asChild>
            <div style={TEXTO_DA_CONFIRMACAO}>
              {selectedItem && (
                <span>
                  <strong>{selectedItem.displayId}</strong> — {selectedItem.type} sai da Revisão Final e
                  {reaproveitamentoTotal(selectedItem)
                    ? <> vai direto para <strong>Impresso / Acabamento</strong>, na conferência da Gráfica: é reaproveitamento total e não passa pela impressão.</>
                    : <> entra na fila da Gráfica como <strong>Pronto para Produção</strong>. Se algo estiver errado depois, a Gráfica pode devolvê-la para a Revisão Final.</>}
                  {propostaDaFicha && propostaDaFicha.reaproveitadas > 0 && (
                    <span data-testid="confirmacao-com-estoque" style={{ display: "block", marginTop: 8, color: TOM.sucesso.text }}>
                      <strong>{propostaDaFicha.reaproveitadas} un. vêm do estoque</strong> como reaproveitamento
                      {propostaDaFicha.aProduzir > 0 ? <> e a Gráfica produz as outras {propostaDaFicha.aProduzir}.</> : <>: nada a produzir, a peça vai direto para Impresso / Acabamento.</>}
                    </span>
                  )}
                  {fichaTravada && pecaDaFicha && (
                    <span data-testid="confirmacao-travada" style={{ display: "block", marginTop: 8, color: TOM.perigo.text }}>
                      <strong>{seloDaTrava(pecaDaFicha)}.</strong> Liberar mantendo a trava leva a peça à fila da Gráfica, mas ela não anda lá até alguém destravar.
                    </span>
                  )}
                  {pedidoEmAberto && (
                    <span data-testid="confirmacao-pedido-em-aberto" style={{ display: "block", marginTop: 8, color: TOM.alerta.text }}>
                      <strong>Liberar sem esperar a resposta do estoque?</strong> O pedido continua aberto: se a Gráfica atender, o reaproveitamento entra direto na peça já liberada e você é avisada.
                    </span>
                  )}
                </span>
              )}
            </div>
          </AlertDialogDescription>
        </div>
        <div style={RODAPE_DA_CONFIRMACAO}>
          <AlertDialogPrimitive.Cancel asChild>
            <Botao variante="fantasma" tamanho={dedo ? "toque" : "md"} data-testid="button-release-cancel">Cancelar</Botao>
          </AlertDialogPrimitive.Cancel>
          {/* Travada: a segunda saída libera E destrava na mesma gravação. */}
          {fichaTravada && (
            <AlertDialogPrimitive.Action asChild>
              <Botao
                variante="secundario"
                tamanho={dedo ? "toque" : "md"}
                icone={Unlock}
                onKeyDown={(e) => { if (e.repeat) e.preventDefault(); }}
                onClick={() => selectedItem && aoLiberar({
                  itemId: selectedItem.id,
                  ...(propostaDaFicha && usarMenos != null ? { corpo: { reuseQty: propostaDaFicha.reaproveitadas, peloEstoque: true as const } } : {}),
                  trava: "destravar",
                })}
                disabled={liberando}
                data-testid="button-release-destravar"
              >
                Liberar e destravar
              </Botao>
            </AlertDialogPrimitive.Action>
          )}
          <AlertDialogPrimitive.Action asChild>
            <Botao
              ref={botaoConfirmarRef}
              variante="primario"
              tamanho={dedo ? "toque" : "md"}
              icone={Check}
              // Com o foco já no botão, o repeat de um Enter SEGURADO (o mesmo
              // aperto que abriu esta confirmação) ativaria o clique sozinho.
              // Barrar o repeat obriga soltar e apertar de novo: confirmar
              // continua a um Enter, mas nunca por inércia do dedo.
              onKeyDown={(e) => { if (e.repeat) e.preventDefault(); }}
              onClick={() => selectedItem && aoLiberar({
                itemId: selectedItem.id,
                ...(propostaDaFicha && usarMenos != null ? { corpo: { reuseQty: propostaDaFicha.reaproveitadas, peloEstoque: true as const } } : {}),
                ...(fichaTravada ? { trava: "manter" as const } : {}),
              })}
              disabled={liberando}
              data-testid="button-release-confirm"
            >
              {liberando ? "Liberando..." : fichaTravada ? "Liberar mantendo a trava" : "Liberar"}
            </Botao>
          </AlertDialogPrimitive.Action>
        </div>
        </FreezeWhileClosing>
      </AlertDialogContent>
    </AlertDialog>
  );
}
