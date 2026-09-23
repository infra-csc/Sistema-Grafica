import { useEffect, useState, useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { formatFrescor } from "@/lib/painel-frescor";
import { FS, FW, T, TOM } from "@/lib/theme";

// ─── Carimbo de frescor com relógio PRÓPRIO ─────────────────────────────────
// O relógio de 30s que envelhece o "Atualizado há 2 min" morava em PainelGeral
// — e um setState no topo re-renderizava a página inteira a cada 30 segundos.
// Pelo mesmo motivo `isFetching`/`dataUpdatedAt` saíram do useQuery da página:
// o React Query só notifica quem LÊ a propriedade, e cada revalidação (duas
// trocas de isFetching) virava dois renders da lista mesmo sem dado novo.
// Aqui o carimbo assina o estado da query direto no cache, sem observer novo
// (nenhuma mudança de refetch), e só ele re-renderiza.
const CHAVE_ITENS = ["/api/items"];
const HASH_ITENS = JSON.stringify(CHAVE_ITENS);
function assinarEstadoDosItens(avisar: () => void) {
  return queryClient.getQueryCache().subscribe((ev) => {
    if (ev.query.queryHash === HASH_ITENS) avisar();
  });
}
function lerEstadoDosItens(): string {
  const s = queryClient.getQueryState(CHAVE_ITENS);
  return `${s?.fetchStatus ?? "idle"}|${s?.dataUpdatedAt ?? 0}`;
}

export function CarimboDeFrescor() {
  const [fetchStatus, atualizadoEm] = useSyncExternalStore(assinarEstadoDosItens, lerEstadoDosItens).split("|");
  const isFetching = fetchStatus === "fetching";
  // Relógio de parede só para o carimbo envelhecer sozinho na tela: sem ele,
  // "há 2 min" ficava escrito até a próxima revalidação.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const frescor = formatFrescor(Number(atualizadoEm), agora);
  if (!frescor) return null;
  return (
    <div
      /* A promessa tem de bater com o código: "a cada minuto" era a
         regra antiga — hoje quem traz a mudança na hora é o aviso do
         servidor, e a revalidação de segurança roda a cada 5 min. */
      title={`${frescor.srLabel}. Esta tela se atualiza sozinha: na hora em que alguém muda uma peça, ao voltar para a aba e, por segurança, a cada 5 minutos. Ponto verde = atualizada há menos de 3 minutos.`}
      data-testid="painel-frescor"
      style={{ display: "flex", alignItems: "center", gap: 6, fontSize: FS.small, fontWeight: FW.forte, color: T.second, whiteSpace: "nowrap" }}
    >
      {isFetching
        ? <Loader2 className="animate-spin" style={{ width: 11, height: 11, color: T.second }} aria-hidden="true" />
        : <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: frescor.tone === "fresco" ? TOM.sucesso.text : TOM.alerta.text, flexShrink: 0 }} />}
      {/* Sem aria-live aqui de propósito: quem anuncia mudança é o
          contador de resultados. Duas regiões vivas competindo fazem o
          leitor de tela falar por cima de si mesmo a cada minuto. */}
      <span>{isFetching ? "Atualizando…" : `Atualizado ${frescor.texto}`}</span>
    </div>
  );
}
