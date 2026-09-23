// ─────────────────────────────────────────────────────────────────────────────
// OS DOIS MAPAS DA TELA: patrocinadores e aprovações de cada peça.
//
// Vêm de UMA chamada (GET /api/items/batch-approval-data) e alimentam a fila,
// o placar, o lote, o Histórico e o book de exportação.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { FORMATO_COMPACTO, ehAprovacoesCompactas, expandirAprovacoes } from "@shared/itens-compactos";
import type { LoteDeAprovacoes, Patrocinador, PecaAtendimento, SponsorApproval } from "./tipos";

export function useAprovacoesDoLote(items: PecaAtendimento[], awaitingItems: PecaAtendimento[]) {
  // Map para rastrear patrocinadores de cada item
  const [itemSponsorsMap, setItemSponsorsMap] = useState<Record<string, Patrocinador[]>>({});
  const [loadingSponsors, setLoadingSponsors] = useState(false);

  // Map para rastrear aprovações de cada item (para mostrar na tabela)
  const [itemApprovalsMap, setItemApprovalsMap] = useState<Record<string, SponsorApproval[]>>({});

  // Request ID para evitar race conditions
  const requestIdRef = useRef(0);
  // O conjunto (tamanho do acervo + marca de cada peça em aprovação) que
  // motivou o último download do lote, e as peças que ESTA tela decidiu e
  // remendou desde então — ver o efeito de carga do lote.
  const loteBaixadoRef = useRef<{ tamanho: number; marcas: Map<string, string> } | null>(null);
  const decididasAquiRef = useRef<Set<string>>(new Set());

  // Chave estável do conjunto de peças em aprovação: o efeito abaixo só refaz
  // o batch quando uma peça ENTRA ou SAI do fluxo, quando o total de itens
  // muda (p.ex. no primeiro carregamento) OU quando uma peça em aprovação é
  // atualizada (fingerprint com approvalThumbUrl + updatedAt — o servidor
  // grava updatedAt em todo updateItem). Sem o fingerprint, a nova versão da
  // Arte (resubmit muda o thumb sem tirar a peça de awaiting_sponsor_approval)
  // não refazia o batch e a peça sumia da contagem até um F5.
  const awaitingKey = useMemo(
    () => `${items.length}:${awaitingItems
      .map(i => `${i.id}:${i.approvalThumbUrl ?? ''}:${i.updatedAt ?? ''}`)
      .sort()
      .join('|')}`,
    [items.length, awaitingItems]
  );

  // Carregar patrocinadores e aprovações — uma única chamada batch.
  // Carrega sempre (não só quando há itens pendentes) para alimentar também
  // a aba Histórico, que mostra itens já aprovados em qualquer status.
  useEffect(() => {
    // AS MUDANÇAS QUE ESTA TELA MESMA FEZ NÃO RE-BAIXAM O LOTE (5,8 MB em
    // produção). Aprovar a última marca de uma peça aqui já remenda a peça
    // (applyItemDecisionToCache) e a aprovação (applyApprovalToCache) com a
    // resposta do servidor; mesmo assim, a peça saindo de "aguardando" mudava
    // a chave e o lote INTEIRO voltava — um download e um parse de megabytes
    // por peça aprovada, no meio do "aprovar e seguir para a próxima". Pula só
    // quando TODA a diferença é de peças marcadas em decididasAquiRef (ver
    // individualApproveMutation) e sem troca de thumb; peça que entra, some
    // por outra mão, é reprovada ou ganha arte nova segue buscando o lote.
    const marcas = new Map<string, string>(
      awaitingItems.map(i => [i.id, `${i.approvalThumbUrl ?? ''}:${i.updatedAt ?? ''}`]),
    );
    const anterior = loteBaixadoRef.current;
    const decididas = decididasAquiRef.current;
    if (anterior && items.length > 0 && anterior.tamanho === items.length) {
      const thumbDe = (m: string | undefined) => (m ?? '').slice(0, (m ?? '').lastIndexOf(':'));
      let soDecisoesDaqui = true;
      const tocadas: string[] = [];
      marcas.forEach((m, id) => {
        const antes = anterior.marcas.get(id);
        if (antes === m) return;
        if (antes !== undefined && decididas.has(id) && thumbDe(antes) === thumbDe(m)) { tocadas.push(id); return; }
        soDecisoesDaqui = false;
      });
      anterior.marcas.forEach((_m, id) => {
        if (marcas.has(id)) return;
        if (decididas.has(id)) tocadas.push(id); else soDecisoesDaqui = false;
      });
      if (soDecisoesDaqui) {
        loteBaixadoRef.current = { tamanho: items.length, marcas };
        tocadas.forEach(id => decididas.delete(id));
        return;
      }
    }
    loteBaixadoRef.current = { tamanho: items.length, marcas };
    decididas.clear();

    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    if (items.length === 0) {
      loteBaixadoRef.current = null;
      setItemSponsorsMap({});
      setItemApprovalsMap({});
      setLoadingSponsors(false);
      return;
    }

    setLoadingSponsors(true);

    // FORMATO COMPACTO (perf, 17/09): o lote tinha 5,8 MB em produção porque o
    // patrocinador ia inteiro em cada vínculo e de novo em cada aprovação. Com
    // `?formato=compacto` ele vai uma vez (shared/itens-compactos.ts) e
    // `expandirAprovacoes` devolve os MESMOS dois mapas de sempre — nada abaixo
    // muda. Resposta que não é compacta (servidor antigo no meio do deploy)
    // passa intacta.
    apiRequest("GET", `/api/items/batch-approval-data?formato=${FORMATO_COMPACTO}`)
      .then(res => res.json())
      // O corpo é o JSON da rota: os dois mapas, compactos ou não. A forma é a
      // do servidor (routes/items), não algo que dê para provar aqui.
      .then((corpo: unknown) => (ehAprovacoesCompactas(corpo) ? expandirAprovacoes(corpo) : corpo) as LoteDeAprovacoes | undefined)
      .then(({ sponsorsByItem = {}, approvalsByItem = {} } = {}) => {
        if (currentRequestId !== requestIdRef.current) return;
        setItemSponsorsMap(sponsorsByItem);
        setItemApprovalsMap(approvalsByItem);
        setLoadingSponsors(false);
      })
      .catch(err => {
        console.error("Erro ao carregar dados de aprovação em lote:", err);
        if (currentRequestId === requestIdRef.current) setLoadingSponsors(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- awaitingKey é a chave estável de awaitingItems
  }, [awaitingKey]);

  return { itemSponsorsMap, setItemSponsorsMap, itemApprovalsMap, setItemApprovalsMap, loadingSponsors, decididasAquiRef };
}
