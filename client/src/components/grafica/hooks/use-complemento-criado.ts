// ─────────────────────────────────────────────────────────────────────────────
// AUMENTAR QUANTIDADE nasce na Gráfica — esta é a tela onde as peças em
// produção vivem e onde o aumento precisa ser visto. Aqui mora o que acontece
// DEPOIS de confirmar: pousar na peça-filha, realçá-la por 5 s e, se ela
// nasceu fora do recorte, avisar em vez de mexer nos filtros sozinho.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { FILTROS_VAZIOS } from "@/lib/grafica-filtros";
import type { PecaDaFila } from "@/components/grafica/tipos";
import { LINHAS_POR_LOTE } from "@/components/grafica/fila/regras";
import type { FilaDaGrafica } from "./use-fila-da-grafica";

export type ComplementoCriado = ReturnType<typeof useComplementoCriado>;

export function useComplementoCriado(fila: FilaDaGrafica) {
  const {
    items, filteredItems, linhasVisiveis, limiteLinhas, gruposExpandidos, setGruposExpandidos,
    setOrcamentoLinhas, filtros, setFiltros, setBuscaInput,
  } = fila;
  // ── Aumentar quantidade (o gatilho mora nesta tela) ──
  // complementoItem: a peça-MÃE em foco no modal.
  // novoComplementoId: a peça-filha recém-criada — realce de 5 s + rolagem.
  // bannerComplemento: rede de segurança para quando a filha nasce FORA do
  //   recorte de filtros do operador (a rolagem falharia em silêncio).
  const [complementoItem, setComplementoItem] = useState<PecaDaFila | null>(null);
  const [novoComplementoId, setNovoComplementoId] = useState<string | null>(null);
  const [bannerComplemento, setBannerComplemento] = useState<{ id: string; displayId: string } | null>(null);
  const abrirComplemento = (item: PecaDaFila) => setComplementoItem(item);

  // ── Depois de confirmar o aumento ──────────────────────────────────────────
  // A peça-filha nasce COLADA na mãe (compareDisplayId já garante a ordem), mas
  // "nasceu em algum lugar da lista" não é resposta para quem acabou de clicar.
  // A sequência: o modal fecha e invalida as queries → a linha aparece → esta
  // tela rola até ela, realça por 5 s e devolve o foco. A ficha NÃO abre: as
  // portas continuam sendo o olho da linha e o "Mostrar" do banner.
  const handleComplementoCriado = (child: { id?: string } | null | undefined) => {
    if (!child?.id) return;
    setNovoComplementoId(child.id);
    setBannerComplemento(null);
  };

  // O realce dura 5 s. Criar outra peça reinicia a contagem.
  useEffect(() => {
    if (!novoComplementoId) return;
    const t = setTimeout(() => setNovoComplementoId(null), 5000);
    return () => clearTimeout(t);
  }, [novoComplementoId]);

  // Pousar na linha. Enquanto a invalidação não trouxe a peça, nada acontece
  // (nem banner): só depois que ela EXISTE na lista completa e mesmo assim não
  // está no recorte é que o silêncio vira o pior desfecho — e aí abre o banner.
  useEffect(() => {
    if (!novoComplementoId) return;
    const noRecorte = filteredItems.find((i) => i.id === novoComplementoId);
    if (!noRecorte) {
      const naLista = items.find((i) => i.id === novoComplementoId);
      if (naLista) setBannerComplemento({ id: naLista.id, displayId: naLista.displayId });
      return;
    }
    const alvo = document.querySelector(`[data-item-row="${novoComplementoId}"]`);
    // Está no recorte e fora do teto do evento, mas ainda num LOTE que não foi
    // desenhado: traz o DOM até ela (e um lote de folga) e deixa o efeito rodar
    // de novo — `limiteLinhas` está nas deps.
    const posicao = alvo ? -1 : linhasVisiveis.findIndex((i) => i.id === novoComplementoId);
    if (posicao >= limiteLinhas) {
      setOrcamentoLinhas({ recorte: filtros, n: posicao + LINHAS_POR_LOTE });
      return;
    }
    if (!alvo) {
      // Está no recorte, mas ALÉM do teto de linhas do bloco do evento: abre o
      // bloco e deixa o efeito rodar de novo (gruposExpandidos está nas deps).
      // Sem isto a rolagem falharia em silêncio — o pior desfecho possível logo
      // depois de um clique, que é justamente o que este bloco existe para
      // evitar. Devolver `prev` quando já está aberto corta qualquer laço.
      const chave = String(noRecorte.eventId ?? noRecorte.event?.name ?? "sem-evento");
      setGruposExpandidos(prev => (prev.has(chave) ? prev : new Set(prev).add(chave)));
      return;
    }
    alvo.scrollIntoView({ behavior: "smooth", block: "center" });
    // Quem veio pelo teclado não pode ser despejado no <body>, e o leitor de
    // tela precisa anunciar a peça que acabou de nascer.
    (document.querySelector(`[data-testid="text-display-id-${novoComplementoId}"]`) as HTMLElement | null)
      ?.focus({ preventScroll: true });
  }, [items, filteredItems, novoComplementoId, gruposExpandidos, linhasVisiveis, limiteLinhas]);

  // O banner some sozinho assim que a peça entra no recorte — inclusive quando
  // é o operador que afrouxa um filtro por conta própria.
  useEffect(() => {
    if (!bannerComplemento) return;
    if (filteredItems.some((i) => i.id === bannerComplemento.id)) setBannerComplemento(null);
  }, [filteredItems, bannerComplemento]);

  // "Mostrar": limpa o recorte e busca a peça. Mesmo mecanismo já provado do
  // deep link do sino. Nunca é automático — mexer no recorte do operador sem
  // ele pedir é justamente o que este banner existe para evitar.
  const mostrarComplementoCriado = () => {
    if (!bannerComplemento) return;
    // Zera o recorte inteiro e busca a peça. `entregues: true` porque o
    // complemento pode nascer num evento cujo recorte é o arquivo — e um botão
    // chamado "Mostrar" que não mostra é o pior desfecho possível.
    setFiltros({ ...FILTROS_VAZIOS, busca: bannerComplemento.displayId, entregues: true });
    setBuscaInput(bannerComplemento.displayId);
    setNovoComplementoId(bannerComplemento.id);
    setBannerComplemento(null);
  };

  return {
    complementoItem, setComplementoItem, novoComplementoId, bannerComplemento, setBannerComplemento,
    abrirComplemento, handleComplementoCriado, mostrarComplementoCriado,
  };
}
