// ─────────────────────────────────────────────────────────────────────────────
// ENCERRAR / REABRIR EVENTO — a MESMA confirmação na lista e no detalhe.
//
// POR QUE UM COMPONENTE SÓ. Os dois diálogos viviam duplicados em eventos.tsx e
// event-detail.tsx, e já tinham divergido: um dizia o filtro onde o evento ia
// parar, o outro não; um avisava das peças pendentes numa tarja, o outro no
// meio do parágrafo; um gritava em caixa alta, o outro não. É a mesma decisão
// nas duas telas — tem de ser a mesma frase.
//
// O QUE FICA NAS PÁGINAS. As mutações (POST /close e /reopen), as invalidações
// e os toasts continuam em cada página, intocados: a lista e o detalhe
// invalidam chaves diferentes e o toast da lista oferece "Mostrar". Este
// arquivo é só apresentação — recebe os números e devolve o clique.
//
// A CONFIRMAÇÃO DIZ O NÚMERO REAL ("12 peças pendentes, sendo 3 em produção")
// e o que a ação FAZ e NÃO FAZ. Nenhuma peça muda de status: é por isso que
// reabrir devolve o evento exatamente como estava.
// ─────────────────────────────────────────────────────────────────────────────
import { AlertTriangle, Lock, Unlock } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ModalHeader, modalSurface } from "@/components/modal-shell";
import { Botao } from "@/components/ui/botao";
import { T, TOM, FS, FW, R } from "@/lib/theme";

export function EncerrarEventoDialog({
  modo,
  open,
  onFechar,
  onConfirmar,
  pendente,
  nomeDoEvento,
  abertas,
  emProducao,
  ativas,
}: {
  modo: "encerrar" | "reabrir";
  open: boolean;
  /** Pedido de fechar (Cancelar, Esc). Ignorado enquanto a mutação corre. */
  onFechar: () => void;
  onConfirmar: () => void;
  pendente: boolean;
  nomeDoEvento?: string | null;
  /** Peças ativas ainda não entregues. `null` = contagem indisponível. */
  abertas?: number | null;
  emProducao?: number | null;
  /** Peças ativas (fora canceladas/excluídas). */
  ativas?: number | null;
}) {
  const encerrar = modo === "encerrar";
  const nAbertas = abertas ?? 0;
  const nProducao = emProducao ?? 0;
  const temContagem = abertas !== null && abertas !== undefined;
  const nome = nomeDoEvento || "este evento";
  const Icone = encerrar ? Lock : Unlock;
  const forte: React.CSSProperties = { color: T.text, fontWeight: FW.medio };
  // As cores agora são TOKENS (eram hex escritos aqui): encerrar é o cinza de
  // apoio (decisão neutra, não destrutiva), reabrir é o verde de "voltar".
  const tinta = encerrar ? T.apoio : TOM.sucesso.text;

  return (
    // Fechar durante a mutação perderia o toast com a contagem real — por isso
    // o pedido de fechar só passa quando nada está correndo.
    <AlertDialog open={open} onOpenChange={(o) => { if (!o && !pendente) onFechar(); }}>
      {/* `modalSurface` traz o teto de altura e a coluna flex; o corpo é o
          único trecho que rola, então título e botões nunca saem da tela numa
          janela baixa. `gap: 0` anula o `gap-4` da classe base do AlertDialog. */}
      <AlertDialogContent style={{ ...modalSurface(460), gap: 0 }}>
        <AlertDialogTitle className="sr-only">{encerrar ? "Encerrar evento" : "Reabrir evento"}</AlertDialogTitle>
        <ModalHeader
          variant="confirm"
          icon={Icone}
          tint={tinta}
          title={encerrar ? "Encerrar evento" : "Reabrir evento"}
          // Sem subtítulo com o nome: o corpo já o diz em negrito, na frase
          // que explica a ação — repetido no cabeçalho, eram duas leituras.
        />

        <div style={{ padding: "18px 24px 8px", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
          {/* A tarja vem ANTES do parágrafo: é a frase que faz alguém parar. */}
          {encerrar && nAbertas > 0 && (
            <div
              role="note"
              style={{ marginBottom: 14, padding: "12px 14px", backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: R.md, display: "flex", alignItems: "flex-start", gap: 10 }}
            >
              <AlertTriangle aria-hidden="true" style={{ width: 16, height: 16, color: TOM.alerta.text, flexShrink: 0, marginTop: 2 }} />
              <p style={{ fontSize: FS.body, color: T.strong, margin: 0, lineHeight: 1.55 }}>
                Este evento tem{" "}
                <strong>{nAbertas} {nAbertas === 1 ? "peça pendente" : "peças pendentes"}</strong>
                {nProducao > 0 ? `, sendo ${nProducao} em produção` : ""}
                . Elas <strong>não são canceladas nem entregues</strong> — continuam na lista do evento, mas saem da Gestão de Prazos e das filas de trabalho.
              </p>
            </div>
          )}

          <AlertDialogDescription style={{ fontSize: FS.read, color: T.apoio, lineHeight: 1.6, margin: 0 }}>
            {encerrar ? (
              <>
                Encerrar <strong style={forte}>{nome}</strong>
                {temContagem && nAbertas === 0
                  ? (ativas ?? 0) > 0
                    ? ` — todas as ${ativas} peças já estão entregues.`
                    : " — este evento não tem nenhuma peça."
                  : "."}
                {" "}Ele sai da Gestão de Prazos e das filas de trabalho e continua visível no histórico, na consulta e em <strong style={forte}>Encerrados</strong> na lista de eventos. A ação fica registrada com seu nome e horário, e pode ser desfeita em <strong style={forte}>Reabrir evento</strong>.
              </>
            ) : (
              <>
                <strong style={forte}>{nomeDoEvento || "Este evento"}</strong> volta para a Gestão de Prazos e para as filas de trabalho
                {nAbertas > 0
                  ? <> com <strong style={forte}>{nAbertas} {nAbertas === 1 ? "peça em aberto" : "peças em aberto"}</strong>{nProducao > 0 ? ` (${nProducao} em produção)` : ""}</>
                  : null}
                . Os prazos voltam a contar normalmente. A reabertura fica registrada com seu nome e horário.
              </>
            )}
          </AlertDialogDescription>
        </div>

        {/* Rodapé fora do trecho que rola (`flexShrink: 0`): Confirmar sempre à vista. */}
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "14px 24px 20px", flexShrink: 0 }}>
          {/* <Botao> (hover, foco e carregando no .ds-botao), 44px de alvo. */}
          <AlertDialogCancel asChild>
            <Botao variante="secundario" tamanho="toque" disabled={pendente} style={{ margin: 0 }}>
              Cancelar
            </Botao>
          </AlertDialogCancel>
          <AlertDialogAction
            asChild
            // preventDefault: o AlertDialogAction fecha no clique; sem isto o
            // diálogo some antes da resposta e o toast com a contagem se perde.
            // O fechamento acontece no onSuccess da mutação, em cada página.
            onClick={(e) => { e.preventDefault(); if (!pendente) onConfirmar(); }}
          >
            <Botao
              variante="primario"
              tamanho="toque"
              icone={Icone}
              carregando={pendente}
              data-testid={encerrar ? "button-confirm-close-event" : "button-confirm-reopen-event"}
              style={{ backgroundColor: tinta, borderColor: tinta, padding: "0 20px" }}
            >
              {encerrar
                ? (pendente ? "Encerrando…" : "Encerrar evento")
                : (pendente ? "Reabrindo…" : "Reabrir evento")}
            </Botao>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
