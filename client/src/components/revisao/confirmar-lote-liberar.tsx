// A confirmação de LIBERAR EM LOTE: quantas vão, para onde, o que entra com o
// estoque e o que fica de fora (sem arquivo, travada, evento finalizado) —
// tudo dito antes do clique.
import { Check } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { Botao } from "@/components/ui/botao";
import { useIsMobile } from "@/hooks/use-mobile";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { resumoDoLoteComEstoque } from "@shared/consultas-de-estoque";
import { T, TOM } from "@/lib/theme";
import { TEXTO_DA_CONFIRMACAO, corpoDaConfirmacao, rodapeDaConfirmacao } from "./estilos";
import type { useFilaDaRevisao } from "./use-fila-da-revisao";

type Fila = ReturnType<typeof useFilaDaRevisao>;

export function ConfirmarLoteLiberar({
  open, onOpenChange, dedo, loteDeLiberar, selecaoLote, reaproveitadasNoLote, propostasDoLote,
  avisoLoteFinalizadas, liberando, aoLiberar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dedo: boolean;
  loteDeLiberar: Fila["loteDeLiberar"];
  selecaoLote: Fila["selecaoLote"];
  reaproveitadasNoLote: number;
  propostasDoLote: Fila["propostasDoLote"];
  avisoLoteFinalizadas: Fila["avisoLoteFinalizadas"];
  liberando: boolean;
  aoLiberar: () => void;
}) {
  const celular = useIsMobile();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(470)}>
        {/* POR QUE congelar aqui: o onSuccess troca a seleção pelo conjunto do
            que FALHOU e fecha o diálogo no mesmo commit. O título é contado a
            partir desse conjunto — "Liberar 12" virava "Liberar 0" enquanto a
            caixa saía de cena. */}
        <FreezeWhileClosing open={open}>
        <ModalHeader
          variant="confirm"
          compacto={celular}
          icon={Check}
          tint={T.text}
          title={`Liberar ${loteDeLiberar.prontas.length} ${loteDeLiberar.prontas.length === 1 ? "peça" : "peças"}`}
          onClose={() => onOpenChange(false)}
        />
        <AlertDialogTitle className="sr-only">Liberar {loteDeLiberar.prontas.length} {loteDeLiberar.prontas.length === 1 ? "peça" : "peças"}</AlertDialogTitle>
        <div style={corpoDaConfirmacao(celular)}>
          <AlertDialogDescription asChild>
            <div style={TEXTO_DA_CONFIRMACAO}>
              {loteDeLiberar.prontas.length === 1 ? "A peça sai" : `As ${loteDeLiberar.prontas.length} peças saem`} da Revisão Final
              {reaproveitadasNoLote > 0 && reaproveitadasNoLote === loteDeLiberar.prontas.length
                ? <> e {reaproveitadasNoLote === 1 ? "vai" : "vão"} direto para Impresso / Acabamento (conferência da Gráfica): reaproveitamento total, sem impressão e sem precisar de arquivo final.</>
                : <> e {loteDeLiberar.prontas.length === 1 ? "entra" : "entram"} na fila da Gráfica como Pronto para Produção.</>}
              {reaproveitadasNoLote > 0 && reaproveitadasNoLote < loteDeLiberar.prontas.length && (
                <span data-testid="aviso-bulk-release-reaproveitadas" style={{ display: "block", marginTop: 8 }}>
                  Exceção: {reaproveitadasNoLote === 1 ? "1 é" : `${reaproveitadasNoLote} são`} de reaproveitamento total e {reaproveitadasNoLote === 1 ? "vai" : "vão"} direto para Impresso / Acabamento (conferência da Gráfica), sem impressão e sem precisar de arquivo final.
                </span>
              )}
              {propostasDoLote.some(x => x.reaproveitadas > 0) && (
                <span data-testid="aviso-bulk-release-estoque" style={{ display: "block", marginTop: 8, color: TOM.sucesso.text }}>
                  <strong>{resumoDoLoteComEstoque(loteDeLiberar.prontas.length, propostasDoLote)}</strong> — entram com o que o estoque atendeu, sem digitar nada.
                </span>
              )}
              {/* FICAM DE FORA, dito antes: sem arquivo final o servidor recusa
                  (reaproveitamento total não conta — não imprime), e travada
                  pede a escolha da trava, que é da ficha. Nenhuma das duas vai;
                  as duas seguem marcadas com o motivo na linha. */}
              {loteDeLiberar.nSemArquivo > 0 && (
                <span data-testid="aviso-bulk-release-sem-arquivo" style={{ display: "block", marginTop: 8 }}>
                  {loteDeLiberar.nSemArquivo === 1 ? "1 ainda não tem" : `${loteDeLiberar.nSemArquivo} ainda não têm`} arquivo final da Arte e {loteDeLiberar.nSemArquivo === 1 ? "fica de fora — continua marcada" : "ficam de fora — continuam marcadas"}.
                </span>
              )}
              {loteDeLiberar.nTravadas > 0 && (
                <span data-testid="aviso-bulk-release-travadas" style={{ display: "block", marginTop: 8 }}>
                  {loteDeLiberar.nTravadas === 1 ? "1 está travada" : `${loteDeLiberar.nTravadas} estão travadas`} pela Solicitação e {loteDeLiberar.nTravadas === 1 ? "fica" : "ficam"} de fora: libere pela ficha, escolhendo destravar ou manter a trava.
                </span>
              )}
              {selecaoLote.finalizadas > 0 && (
                <span data-testid="aviso-bulk-release-finalizadas" style={{ display: "block", marginTop: 8 }}>
                  {avisoLoteFinalizadas()}
                </span>
              )}
            </div>
          </AlertDialogDescription>
        </div>
        <div style={rodapeDaConfirmacao(celular)}>
          <AlertDialogPrimitive.Cancel asChild>
            <Botao variante="fantasma" tamanho={dedo || celular ? "toque" : "md"} data-testid="button-bulk-release-cancel">Cancelar</Botao>
          </AlertDialogPrimitive.Cancel>
          <AlertDialogPrimitive.Action asChild>
            <Botao
              variante="primario"
              tamanho={dedo || celular ? "toque" : "md"}
              icone={Check}
              onClick={aoLiberar}
              disabled={liberando || loteDeLiberar.prontas.length === 0}
              data-testid="button-bulk-release-confirm"
            >
              {liberando
                ? "Liberando..."
                : selecaoLote.finalizadas > 0 || loteDeLiberar.nFora > 0 ? `Liberar ${loteDeLiberar.prontas.length === 1 ? "a pronta" : `as ${loteDeLiberar.prontas.length} prontas`}` : "Liberar todas"}
            </Botao>
          </AlertDialogPrimitive.Action>
        </div>
        </FreezeWhileClosing>
      </AlertDialogContent>
    </AlertDialog>
  );
}
