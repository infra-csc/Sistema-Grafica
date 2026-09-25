// ─────────────────────────────────────────────────────────────────────────────
// useConfirmar() — a confirmação do app, no lugar do window.confirm.
//
// API
//   const { confirmar, dialogo } = useConfirmar();
//   ...
//   const ok = await confirmar({
//     titulo: "Excluir o modelo?",
//     descricao: "As peças já criadas a partir dele continuam existindo.",
//     confirmar: "Excluir",          // rótulo do botão que AGE (pd. "Confirmar")
//     cancelar: "Manter",            // (pd. "Cancelar")
//     perigo: true,                  // pinta o botão de ação como destrutivo
//     icone: Trash2,
//   });
//   if (!ok) return;
//   ...
//   return (<>{conteúdo}{dialogo}</>);   // o `dialogo` precisa estar montado
//
// POR QUE TROCAR O window.confirm. Ele é uma caixa do SISTEMA OPERACIONAL:
// ignora a tipografia, a cor e o idioma do app, mostra a URL do servidor em
// cima da pergunta, e o navegador oferece "impedir que esta página crie mais
// diálogos" — quem marca isso passa a ter as ações executadas SEM PERGUNTA
// nenhuma, porque `confirm()` retorna `false`... ou `true`, dependendo do
// navegador. Numa tela em que confirmar significa apagar, isso não é detalhe
// de estilo.
//
// Além disso ele TRAVA a thread: enquanto a caixa está aberta, nada na página
// re-renderiza. É por isso que a versão anterior, chamada dentro de um handler
// de modal, deixava o modal congelado atrás dela.
//
// O RÓTULO DO BOTÃO DIZ O QUE VAI ACONTECER. "Excluir", não "OK". Quem lê
// rápido lê o BOTÃO, não a pergunta — e "OK" combina igualmente bem com
// "Excluir?" e com "Manter?".
//
// A PROMESSA RESOLVE UMA VEZ SÓ, e resolve `false` se o diálogo for fechado no
// Esc, no clique fora ou porque a tela desmontou: `await` que nunca resolve é
// um handler que fica pendurado para sempre.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { AlertTriangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { Botao } from "@/components/ui/botao";
import { T, FS } from "@/lib/theme";

export interface PedidoDeConfirmacao {
  titulo: string;
  descricao?: React.ReactNode;
  /** Rótulo do botão que AGE. Diga o verbo: "Excluir", "Enviar", "Cancelar pedido". */
  confirmar?: string;
  cancelar?: string;
  perigo?: boolean;
  icone?: LucideIcon;
}

interface Pendente extends PedidoDeConfirmacao {
  resolver: (ok: boolean) => void;
}

export function useConfirmar() {
  const [pendente, setPendente] = React.useState<Pendente | null>(null);
  // A pergunta que está saindo continua desenhada durante a animação de saída;
  // sem guardá-la, o texto sumia e o modal fechava mostrando uma caixa vazia.
  const ultima = React.useRef<Pendente | null>(null);
  if (pendente) ultima.current = pendente;

  const confirmar = React.useCallback((pedido: PedidoDeConfirmacao) => {
    return new Promise<boolean>((resolve) => {
      setPendente({ ...pedido, resolver: resolve });
    });
  }, []);

  const responder = React.useCallback((ok: boolean) => {
    setPendente((atual) => {
      atual?.resolver(ok);
      return null;
    });
  }, []);

  // Tela desmontada com pergunta no ar: resolve `false` para ninguém ficar
  // esperando um `await` que nunca volta.
  React.useEffect(() => () => { ultima.current?.resolver(false); }, []);

  const p = pendente ?? ultima.current;

  const dialogo = (
    <AlertDialog open={Boolean(pendente)} onOpenChange={(aberto) => { if (!aberto) responder(false); }}>
      <AlertDialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(470)} data-testid="confirmacao">
        {p && (
          <>
            <ModalHeader
              variant="confirm"
              icon={p.icone ?? (p.perigo ? AlertTriangle : undefined)}
              tint={p.perigo ? "#b91c1c" : T.dark}
              title={p.titulo}
              onClose={() => responder(false)}
            />
            {/* AlertDialogTitle é obrigatório para o Radix: sem ele o diálogo
                sobe sem nome acessível. O título VISÍVEL é o do ModalHeader,
                então este fica só para o leitor de tela. */}
            <AlertDialogTitle className="sr-only">{p.titulo}</AlertDialogTitle>

            {/* O CORPO ROLA (25/09): o `modalSurface` tem teto de altura com
                overflow hidden — uma descrição longa numa janela baixa (tablet
                deitado, celular com o teclado aberto) empurrava o rodapé, e o
                botão de confirmar sumia sem barra de rolagem. */}
            {p.descricao ? (
              <AlertDialogDescription asChild>
                <div style={{ padding: "4px 24px 18px", fontSize: FS.body, lineHeight: 1.55, color: T.apoio, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
                  {p.descricao}
                </div>
              </AlertDialogDescription>
            ) : (
              <AlertDialogDescription className="sr-only">{p.titulo}</AlertDialogDescription>
            )}

            <div
              style={{
                // QUEBRA em vez de vazar (rótulo longo em 360px) e respeita o
                // recorte seguro embaixo. LONGOS: o atalho com env() some no jsdom.
                display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 8, flexShrink: 0,
                paddingTop: 14, paddingLeft: 24, paddingRight: 24, paddingBottom: "calc(14px + env(safe-area-inset-bottom))",
                borderTop: `1px solid ${T.border}`,
              }}
            >
              <Botao variante="fantasma" onClick={() => responder(false)} data-testid="confirmacao-cancelar">
                {p.cancelar ?? "Cancelar"}
              </Botao>
              <Botao
                variante={p.perigo ? "perigo" : "primario"}
                onClick={() => responder(true)}
                data-testid="confirmacao-confirmar"
              >
                {p.confirmar ?? "Confirmar"}
              </Botao>
            </div>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirmar, dialogo };
}
