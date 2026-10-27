// ─────────────────────────────────────────────────────────────────────────────
// PEÇAS SEM APROVAÇÃO — as AÇÕES (Pedro/dono, 26/10):
//   · "Arte recebida" (RF03) — o diálogo com o dia da chegada (padrão hoje).
//     Na mesa da Arte (Aguardando Envio) a peça vai direto para a Finalização;
//     antes disso a chegada fica registrada e a peça segue o fluxo;
//   · marcar/desmarcar "Sem patrocínio" e "Arte do cliente" EM LOTE (RF02),
//     em peças do mesmo evento. Fora do Layout só o admin muda (RN07): o
//     diálogo diz quantas vão ficar de fora antes do clique.
// As regras moram em @shared/prazo-sem-aprovacao; as rotas em
// server/routes/itens/sem-aprovacao.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileInput, Tags } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Botao } from "@/components/ui/botao";
import { ModalHeader, ModalFooter, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useDiasDaAprovacao } from "@/hooks/use-configuracoes";
import { FS, FW, R, T, TOM } from "@/lib/theme";
import { todayBusinessStr } from "@shared/prazo-dates";
import {
  FRASE_MARCA_TRAVADA, PAPEIS_QUE_MARCAM, ROTULO_ARTE_DO_CLIENTE, ROTULO_SEM_PATROCINIO,
  marcasEditaveis, prazoDeLayoutAjustado, prazoDeLayoutDoEvento,
} from "@shared/prazo-sem-aprovacao";

const brAno = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

function invalidarPecas(eventId?: string | null) {
  if (eventId) queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
  queryClient.invalidateQueries({ queryKey: ["/api/items"] });
  queryClient.invalidateQueries({ queryKey: ["/api/prazos"] });
  queryClient.invalidateQueries({ queryKey: ["/api/analises/painel-operacional"] });
}

// ─── Arte recebida ───────────────────────────────────────────────────────────

export type PecaDaArteRecebida = {
  id: string;
  displayId: string;
  eventId: string;
  status: string;
  arteRecebidaEm?: string | null;
};

export function useArteRecebida(aoConcluir?: () => void) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ peca, data }: { peca: PecaDaArteRecebida; data: string }) => {
      const res = await apiRequest<{ status: string; displayId: string }>("POST", `/api/items/${peca.id}/arte-recebida`, { data });
      return { peca, depois: await res.json() };
    },
    onSuccess: ({ peca, depois }) => {
      invalidarPecas(peca.eventId);
      const foi = depois.status !== peca.status;
      // Revisão 27/10: a peça cuja arte JÁ tinha chegado não "recebe" de novo —
      // ou foi para a Finalização, ou teve o dia corrigido.
      const jaTinha = !!peca.arteRecebidaEm;
      toast({
        variant: "success",
        title: foi
          ? (jaTinha ? `${peca.displayId} foi para a Finalização` : `${peca.displayId}: arte recebida — foi para a Finalização`)
          : (jaTinha ? `${peca.displayId}: dia da chegada salvo` : `${peca.displayId}: arte do cliente recebida`),
        description: foi
          ? "Pulou a Arte/layout e a Aprovação. Na Finalização, confira a medida do arquivo do cliente."
          : "A chegada ficou registrada. Quando a peça chegar à Arte, é só enviá-la direto para a Finalização — sem thumb e sem Aprovação.",
      });
      aoConcluir?.();
    },
    // O servidor explica a recusa (peça fora do Layout, evento fechado, molde…):
    // a frase dele chega à pessoa — o diálogo continua aberto para corrigir.
    onError: (error: Error) => toast({ variant: "destructive", title: "Não deu para registrar a chegada da arte", description: error.message }),
  });
}

/**
 * O diálogo "Arte recebida": o dia (padrão hoje; nunca no futuro) e o que vai
 * acontecer, dito antes do clique.
 */
export function ArteRecebidaDialog({ aberto, aoFechar, peca }: {
  aberto: boolean;
  aoFechar: () => void;
  peca: PecaDaArteRecebida | null;
}) {
  const hoje = todayBusinessStr();
  const [dia, setDia] = useState(hoje);
  // Repõe o dia só ao ABRIR (ou trocar de peça) — não a cada re-render da tela
  // de trás: o Detalhe do Evento recria o objeto da peça em todo refetch, e o
  // dia que a pessoa digitou voltava para hoje (revisão 27/10).
  const chegadaGravada = peca?.arteRecebidaEm ? String(peca.arteRecebidaEm).slice(0, 10) : null;
  useEffect(() => { if (aberto) setDia(chegadaGravada ?? hoje); }, [aberto, peca?.id, chegadaGravada, hoje]);
  const mut = useArteRecebida(aoFechar);
  const naArte = peca?.status === "awaiting_submission";
  // Revisão 27/10: com a arte JÁ registrada o gesto é outro — na mesa da Arte,
  // enviar para a Finalização; antes dela, só corrigir o dia. Título, texto e
  // botão dizem a ação de cada caso (antes falavam de "sair de Aguardando
  // arte do cliente" numa peça que já tinha saído).
  const recebidaEm = peca?.arteRecebidaEm ? String(peca.arteRecebidaEm).slice(0, 10) : null;
  const titulo = recebidaEm
    ? (naArte ? "Enviar para a Finalização" : "Dia da chegada da arte")
    : "Arte recebida";
  const descricao = recebidaEm
    ? (naArte ? "Envie a peça com arte do cliente direto para a Finalização." : "Corrija o dia em que o arquivo do cliente chegou.")
    : "Registre o dia em que o arquivo do cliente chegou.";
  const botao = recebidaEm
    ? (naArte ? "Enviar para a Finalização" : "Salvar o dia")
    : (naArte ? "Registrar e enviar para a Finalização" : "Registrar chegada");
  const valido = /^\d{4}-\d{2}-\d{2}$/.test(dia) && dia <= hoje;
  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(460)} data-testid="dialogo-arte-recebida">
        <DialogTitle className="sr-only">{titulo}</DialogTitle>
        <DialogDescription className="sr-only">{descricao}</DialogDescription>
        <ModalHeader variant="confirm" icon={FileInput} tint={TOM.turquesa.text} title={`${titulo}${peca ? ` · ${peca.displayId}` : ""}`} onClose={aoFechar} />
        <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          <p data-testid="arte-recebida-explica" style={{ margin: 0, fontSize: FS.body, color: T.text, lineHeight: 1.5 }}>
            {recebidaEm && naArte
              ? <>A arte do cliente chegou em <strong>{brAno(recebidaEm)}</strong>. A peça vai <strong>direto para a Finalização</strong> (pula a Arte/layout e a Aprovação). Lá, a Arte confere a medida do arquivo do cliente e anexa o arquivo final.</>
              : recebidaEm
                ? <>A chegada já está registrada em <strong>{brAno(recebidaEm)}</strong>. Mude o dia só se ele estiver errado — a peça segue o fluxo e, quando chegar à Arte, vai para a Finalização sem thumb e sem Aprovação.</>
                : naArte
                  ? <>A peça sai de <strong>Layout — Aguardando arte do cliente</strong> e vai <strong>direto para a Finalização</strong> (pula a Arte/layout e a Aprovação). Lá, a Arte confere a medida do arquivo do cliente e anexa o arquivo final.</>
                  : <>A chegada fica registrada e a espera acaba. A peça segue o fluxo normal até a Arte — e, de lá, é enviada direto para a Finalização, sem thumb e sem Aprovação.</>}
          </p>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: FS.meta, fontWeight: FW.rotulo, color: T.second }}>
            Dia em que a arte chegou
            <input
              type="date"
              value={dia}
              max={hoje}
              onChange={(e) => setDia(e.target.value)}
              data-testid="input-dia-arte-recebida"
              style={{ height: 40, padding: "0 10px", border: `1px solid ${T.bdark}`, borderRadius: R.md, fontSize: FS.body, color: T.text, background: T.surface, maxWidth: 220 }}
            />
          </label>
          {!valido && <span role="alert" style={{ fontSize: FS.meta, color: TOM.perigo.text }}>Informe hoje ou um dia anterior.</span>}
        </div>
        <ModalFooter style={{ flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", rowGap: 8 }}>
          <Botao variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            tom="turquesa"
            carregando={mut.isPending}
            disabled={!peca || !valido || mut.isPending || (!!recebidaEm && !naArte && dia === recebidaEm)}
            onClick={() => peca && mut.mutate({ peca, data: dia })}
            data-testid="confirmar-arte-recebida"
          >
            {botao}
          </Botao>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Marcas em lote ──────────────────────────────────────────────────────────

export type PecaDoLoteDeMarcas = {
  id: string;
  displayId: string;
  eventId: string;
  status: string;
  skipApproval?: boolean | null;
  arteDoCliente?: boolean | null;
  kitRemessaId?: string | null;
};

type Escolha = "manter" | "marcar" | "desmarcar";

export function useMarcasEmLote(aoConcluir?: () => void) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (corpo: { itemIds: string[]; semPatrocinio?: boolean; arteDoCliente?: boolean; eventId: string }) => {
      const { eventId: _e, ...envio } = corpo;
      const res = await apiRequest<{ alteradas: number; ficaramDeFora: Array<{ displayId: string; motivo: string }> }>("POST", "/api/items/marcas-sem-aprovacao", envio);
      return { ...(await res.json()), eventId: corpo.eventId };
    },
    onSuccess: (r) => {
      invalidarPecas(r.eventId);
      const fora = r.ficaramDeFora ?? [];
      const n = r.alteradas ?? 0;
      // Revisão 27/10: "nada mudou" é informação neutra, não sucesso com
      // "0 peças atualizadas".
      if (n === 0 && fora.length === 0) {
        toast({ title: "Nada mudou", description: "As peças já estavam assim." });
        aoConcluir?.();
        return;
      }
      toast({
        variant: fora.length ? "warning" : "success",
        title: n === 0 ? "Nenhuma peça atualizada" : n === 1 ? "1 peça atualizada" : `${n} peças atualizadas`,
        description: fora.length
          ? resumoDasQueFicaramDeFora(fora)
          : "O prazo de Layout de cada peça já está recalculado.",
      });
      aoConcluir?.();
    },
    onError: (error: Error) => toast({ variant: "destructive", title: "Não deu para marcar as peças", description: error.message }),
  });
}

/** Até 5 IDs; o resto vira "e mais N". */
function listaDeIds(ids: string[]): string {
  const comId = ids.filter(Boolean);
  const semId = ids.length - comId.length;
  const mostra = comId.slice(0, 5);
  const resto = comId.length - mostra.length + semId;
  return mostra.join(", ") + (resto > 0 ? `${mostra.length ? " e mais " : ""}${resto}` : "");
}

/**
 * As peças que ficaram de fora do lote, AGRUPADAS POR MOTIVO (revisão 27/10).
 * Antes cada peça repetia a frase inteira — com 20 peças travadas, o aviso
 * passava da tela. Ex.: "3 peças já saíram do Layout: #0012, #0013, #0020 —
 * só um admin muda."
 */
export function resumoDasQueFicaramDeFora(fora: ReadonlyArray<{ displayId: string; motivo: string }>): string {
  const porMotivo = new Map<string, string[]>();
  for (const f of fora) porMotivo.set(f.motivo, [...(porMotivo.get(f.motivo) ?? []), f.displayId]);
  const frases: string[] = [];
  porMotivo.forEach((ids, motivo) => {
    const n = ids.length;
    const pecas = n === 1 ? "1 peça" : `${n} peças`;
    if (motivo === FRASE_MARCA_TRAVADA) {
      frases.push(`${pecas} ${n === 1 ? "já saiu" : "já saíram"} do Layout: ${listaDeIds(ids)} — só um admin muda.`);
    } else if (ids.every((id) => !id)) {
      frases.push(`${pecas} não ${n === 1 ? "foi encontrada" : "foram encontradas"} (${n === 1 ? "excluída" : "excluídas"}?).`);
    } else {
      frases.push(`${pecas} ${n === 1 ? "ficou" : "ficaram"} de fora (${listaDeIds(ids)}): ${motivo.replace(/\.$/, "")}.`);
    }
  });
  return frases.join(" ");
}

function Escolhas({ rotulo, valor, onMudar, testid }: { rotulo: string; valor: Escolha; onMudar: (e: Escolha) => void; testid: string }) {
  const opcoes: Array<[Escolha, string]> = [["manter", "Não mexer"], ["marcar", "Marcar"], ["desmarcar", "Desmarcar"]];
  return (
    <fieldset style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      <legend style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.text, marginBottom: 4 }}>{rotulo}</legend>
      <div role="radiogroup" aria-label={rotulo} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {opcoes.map(([v, txt]) => {
          const on = valor === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onMudar(v)}
              data-testid={`${testid}-${v}`}
              style={{
                minHeight: 36, padding: "0 14px", borderRadius: R.md, cursor: "pointer",
                border: `1px solid ${on ? T.text : T.bdark}`, background: on ? T.text : T.surface,
                color: on ? T.surface : T.text, fontSize: FS.body, fontWeight: on ? FW.forte : FW.medio,
              }}
            >
              {txt}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Marcar/desmarcar "Sem patrocínio" e "Arte do cliente" em várias peças do
 * mesmo evento. O prazo de Layout normal × ajustado do evento vai no corpo,
 * para quem marca saber o que muda.
 */
export function MarcarSemAprovacaoDialog({ aberto, aoFechar, pecas, papel, evento, aoConcluir }: {
  aberto: boolean;
  aoFechar: () => void;
  pecas: PecaDoLoteDeMarcas[];
  papel: string | null | undefined;
  evento?: { id: string; truckDepartureDate?: Date | string | null; deadlineEntregaLayouts?: number | null } | null;
  aoConcluir?: () => void;
}) {
  const [sem, setSem] = useState<Escolha>("manter");
  const [arte, setArte] = useState<Escolha>("manter");
  useEffect(() => { if (aberto) { setSem("manter"); setArte("manter"); } }, [aberto]);
  const dias = useDiasDaAprovacao();
  const mut = useMarcasEmLote(() => { aoConcluir?.(); aoFechar(); });
  const travadas = useMemo(() => pecas.filter((p) => !marcasEditaveis(p.status, papel)), [pecas, papel]);
  const doKit = pecas.filter((p) => !!p.kitRemessaId).length;
  const prazoLayout = prazoDeLayoutDoEvento(evento);
  const podeMarcar = PAPEIS_QUE_MARCAM.includes(String(papel ?? ""));
  const nada = sem === "manter" && arte === "manter";
  const eventId = evento?.id ?? pecas[0]?.eventId ?? "";
  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(520)} data-testid="dialogo-marcas-sem-aprovacao">
        <DialogTitle className="sr-only">Peças sem aprovação</DialogTitle>
        <DialogDescription className="sr-only">Marque ou desmarque Sem patrocínio e Arte do cliente nestas peças.</DialogDescription>
        <ModalHeader
          icon={Tags}
          tint={TOM.alerta.text}
          title="Peças sem aprovação"
          subtitle={`${pecas.length} ${pecas.length === 1 ? "peça" : "peças"}`}
          onClose={aoFechar}
        />
        <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
          <p style={{ margin: 0, fontSize: FS.body, color: T.second, lineHeight: 1.5 }}>
            Com “Sem patrocínio” ou “Arte do cliente”, a peça <strong style={{ color: T.text }}>não passa pela Aprovação</strong> e o prazo de Layout ganha a duração dela
            ({dias} {dias === 1 ? "dia corrido" : "dias corridos"}){prazoLayout ? <>: <strong style={{ color: T.text }}>{brAno(prazoLayout)} → {brAno(prazoDeLayoutAjustado(prazoLayout, dias))}</strong></> : null}.
            Com as duas, os dias contam uma vez só. A Finalização e o prazo final não mudam.
          </p>
          <Escolhas rotulo={ROTULO_SEM_PATROCINIO} valor={sem} onMudar={setSem} testid="lote-sem-patrocinio" />
          <Escolhas rotulo={ROTULO_ARTE_DO_CLIENTE} valor={arte} onMudar={setArte} testid="lote-arte-do-cliente" />
          {arte === "marcar" && (
            <p style={{ margin: 0, fontSize: FS.meta, color: T.second }}>
              As peças ainda em Layout ficam em <strong style={{ color: T.text }}>Layout — Aguardando arte do cliente</strong> até alguém registrar “Arte recebida”.
            </p>
          )}
          {travadas.length > 0 && (
            <p role="note" style={{ margin: 0, padding: "8px 12px", borderRadius: R.md, background: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, fontSize: FS.meta, color: TOM.alerta.text }}>
              {travadas.length === 1 ? "1 peça já saiu do Layout e vai ficar de fora" : `${travadas.length} peças já saíram do Layout e vão ficar de fora`}: {FRASE_MARCA_TRAVADA.replace(/^A peça já saiu do Layout: /, "")}
            </p>
          )}
          {doKit > 0 && (
            <p style={{ margin: 0, fontSize: FS.meta, color: T.second }}>
              {doKit === 1 ? "1 peça é do Kit" : `${doKit} peças são do Kit`}: {doKit === 1 ? "vale para ela" : "vale para elas"} como para as outras.
            </p>
          )}
          {!podeMarcar && <p role="alert" style={{ margin: 0, fontSize: FS.meta, color: TOM.perigo.text }}>Marcar é do admin e da Solicitação.</p>}
        </div>
        <ModalFooter style={{ flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", rowGap: 8 }}>
          <Botao variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            carregando={mut.isPending}
            disabled={nada || !podeMarcar || mut.isPending || pecas.length === travadas.length}
            onClick={() => mut.mutate({
              itemIds: pecas.map((p) => p.id), eventId,
              ...(sem !== "manter" ? { semPatrocinio: sem === "marcar" } : {}),
              ...(arte !== "manter" ? { arteDoCliente: arte === "marcar" } : {}),
            })}
            data-testid="confirmar-marcas-sem-aprovacao"
          >
            Aplicar em {pecas.length - travadas.length} {pecas.length - travadas.length === 1 ? "peça" : "peças"}
          </Botao>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
