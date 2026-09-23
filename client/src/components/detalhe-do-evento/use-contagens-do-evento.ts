// ─────────────────────────────────────────────────────────────────────────────
// AS CONTAGENS DO EVENTO — rascunhos, peças que contam, m², marcos e fases.
// Calculadas uma vez e lidas pelo cabeçalho, pela timeline, pelo card de
// rascunhos e pela confirmação de encerrar.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from "react";
import { contarPorFase, FORA_DO_FUNIL } from "@/lib/fases";
import { MARCOS_DO_EVENTO } from "@shared/prazo-dates";
import { statusParaContagem } from "@shared/molde";
import { compareDisplayId } from "@/lib/displayId";
import { calcularMarcos, contarTrabalhoAberto, estaAtrasDoMarco, fraseDeResolucao } from "./regras";
import type { EventoDoDetalhe, PecaDoEvento, UsuarioLogado } from "./tipos";

export function useContagensDoEvento(rawItems: PecaDoEvento[], event: EventoDoDetalhe | undefined, user: UsuarioLogado) {
  // Ordenação por displayId ciente de COMPLEMENTO: "#0062-C1" com o
  // replace(/\D/g,'') de antes virava 621 e a peça-filha aparecia centenas de
  // linhas longe da mãe — exatamente a duplicidade confusa que o modelo de
  // complemento existe para evitar. Base primeiro, sufixo -C depois:
  // #0062 < #0062-C1 < #0062-C2 < #0063.
  // Fonte única em lib/displayId.ts — o mesmo comparador da Gráfica, do Painel
  // Geral, da Arte e do Vincular (e espelho de server/storage.ts).
  const items = useMemo(
    () => [...rawItems].sort((a, b) => compareDisplayId(a.displayId, b.displayId)),
    [rawItems],
  );

  // Rascunhos vivem SÓ no card "Peças em Rascunho"; a listagem principal fica
  // com o restante. Antes o mesmo item aparecia nos dois lugares ao mesmo tempo.
  const draftItems = useMemo(
    () => items.filter(i => i.status === 'draft' || i.status === 'requested'),
    [items],
  );
  const mainItems = useMemo(
    () => items.filter(i => i.status !== 'draft' && i.status !== 'requested'),
    [items],
  );

  // QUAIS RASCUNHOS O BOTÃO "ENVIAR" LEVA DE VERDADE. O servidor (POST
  // /api/events/:id/items/submit) recorta por quem envia: admin leva tudo; o
  // usuário do Kit, só as peças do Kit que ele criou; a Solicitação da Arena,
  // só as que não são do Kit. A tela contava TODOS os rascunhos — prometia
  // "12 peças serão enviadas" e mandava 8, e um rascunho só do Kit deixava o
  // botão ativo para devolver "Nenhum item em rascunho". Isto é espelho de
  // APRESENTAÇÃO (contagem e lista da confirmação); quem decide é o servidor.
  const rascunhosQueEuEnvio = useMemo(() => {
    if (user?.role === 'admin') return draftItems;
    if (user?.kit) return draftItems.filter((i) => !!i.kitRemessaId && i.criadoPorId === user.id);
    return draftItems.filter((i) => !i.kitRemessaId);
  }, [draftItems, user]);

  // Chips de status do cabeçalho: contagem por status presente + m² total.
  // Derivados de mainItems (não de items): o filtro por chip roda sobre
  // mainItems — chips de rascunho/solicitado filtravam o nada (lista vazia).
  // Os rascunhos já têm o card próprio logo abaixo.
  const statusChips = useMemo(() => {
    const counts = new Map<string, number>();
    mainItems.forEach(i => counts.set(i.status, (counts.get(i.status) || 0) + 1));
    return Array.from(counts.entries());
  }, [mainItems]);
  // AS PEÇAS QUE CONTAM — a mesma régua do cartão de Eventos (lib/fases):
  // cancelada sai do denominador, do m² e da barra; rascunho mora no card
  // próprio. Antes o Detalhe somava tudo: um evento com 10 peças e 3
  // canceladas mostrava "7/10 entregues" para sempre, e o m² contava lona
  // que ninguém vai imprimir.
  const pecasNaConta = useMemo(
    () => mainItems.filter(i => !FORA_DO_FUNIL.has(i.status)),
    [mainItems],
  );
  const canceladasForaDaConta = mainItems.length - pecasNaConta.length;
  const totalM2 = useMemo(
    () => pecasNaConta.reduce((acc, i) => acc + (parseFloat(String(i.calculatedM2 ?? '0')) || 0), 0),
    [pecasNaConta],
  );
  // Quantas das peças listadas são complemento (aumento pós-produção). O m²
  // total não precisa de tratamento: as duas linhas somam sozinhas.
  const complementCount = useMemo(
    () => pecasNaConta.filter((i) => !!i.parentItemId).length,
    [pecasNaConta],
  );

  // ── A TIMELINE DIZ QUANTAS PEÇAS ESTÃO ATRÁS DE CADA MARCO ──
  // Os marcos (datas) e as peças atrás de cada um (status), calculados uma
  // vez e lidos pelo cabeçalho, pela timeline e pelo filtro da lista.
  const hoje = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const marcosDoEvento = useMemo(
    () => (event?.truckDepartureDate ? calcularMarcos(event, hoje) : null),
    [event, hoje],
  );
  const atrasDoMarco = useMemo(
    () => MARCOS_DO_EVENTO.map((_, i) => pecasNaConta.filter(it => estaAtrasDoMarco(statusParaContagem(it), i)).length),
    [pecasNaConta],
  );
  // Fases de produção — a MESMA contagem do cartão de Eventos (lib/fases).
  const fases = useMemo(() => contarPorFase(pecasNaConta), [pecasNaConta]);
  // Molde produzido (fim do fluxo dele) conta como entregue — shared/molde.ts.
  const entregues = useMemo(() => pecasNaConta.filter(i => { const s = statusParaContagem(i); return s === 'delivered' || s === 'entregue'; }).length, [pecasNaConta]);
  // A frase de resolução: onde o evento está, em uma linha derivada dos dados.
  const fraseResolucao = useMemo(
    () => fraseDeResolucao(pecasNaConta.length, entregues, marcosDoEvento, atrasDoMarco),
    [pecasNaConta.length, entregues, marcosDoEvento, atrasDoMarco],
  );

  // Peças que ficaram para trás — o número que a confirmação precisa dizer.
  const openWork = useMemo(() => contarTrabalhoAberto(items), [items]);

  return {
    items, draftItems, mainItems, rascunhosQueEuEnvio, statusChips, pecasNaConta, canceladasForaDaConta,
    totalM2, complementCount, marcosDoEvento, atrasDoMarco, fases, entregues, fraseResolucao, openWork,
  };
}
