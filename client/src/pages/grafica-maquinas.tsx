// ─────────────────────────────────────────────────────────────────────────────
// MÁQUINAS DA GRÁFICA (dono, 14/09; revisão de produto 21/09).
//
// "A Gráfica ter uma aba onde faz o controle de impressão por máquinas: ver
// quais máquinas estão imprimindo o quê, qual o histórico do que foi impresso
// naquela máquina naquele dia e tudo mais."
//
// Duas perguntas, na ordem em que o galpão faz:
//   1. AGORA — o que cada impressora está imprimindo, quantas já saíram e
//      quantas ainda estão nela, desde quando. Máquina sem peça diz "Livre".
//   2. O DIA — o diário de impressão de um dia (hoje por padrão), lançamento
//      por lançamento: hora, máquina, peça, o que aconteceu, quem lançou.
//
// E a tela AGE (dono, 21/09: "com base no que está aqui eles fazem a
// manutenção e ajustam"): do cartão da impressora — e da linha do diário de
// uma peça ainda em impressão — o operador informa quantas saíram, manda para
// o acabamento ou troca de máquina, pelo MESMO modal da fila (components/
// grafica/modal-impressao.tsx). Nenhuma regra mora aqui: os endpoints, as
// permissões (grafica/admin agem; solicitacao só vê) e o bloqueio de evento
// finalizado são os de items.ts.
//
// Painel de parede tanto quanto consulta: atualiza sozinha (WebSocket em
// production_started/updated + polling de 60s + ao voltar para a aba), e diz
// "atualizado há X". Dia e impressora escolhidos vivem na URL (?dia=&maquina=)
// para um F5 — ou um link colado — abrir o mesmo recorte.
//
// Aqui mora o estado (URL, consultas, gestos em voo); os blocos da tela, as
// regras puras e os tipos moram em components/grafica/maquinas/.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useIsMutating, useMutation } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { AlertTriangle, ArrowLeft, ArrowRight, HelpCircle, Printer, RotateCcw } from "lucide-react";
import { useIsMobile, useDensidadeDoConteudo, densityFromWidth, usePonteiroGrosso, alvo as alvoDe } from "@/hooks/use-mobile";
import { Botao } from "@/components/ui/botao";
import { Abas } from "@/components/ui/abas";
import { EstadoVazio } from "@/components/ui/estados";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { MAQUINAS_DE_IMPRESSAO, rotuloDaMaquina } from "@shared/fluxo-peca";
import { nomeDaPeca } from "@shared/nome-da-peca";
import { T, FS, FW, R } from "@/lib/theme";
import { todayBusinessMs } from "@/lib/status";
import { fmtRelative } from "@/components/prazos/tokens";
import { ModalImpressao, mensagemDeErroDaApi, useMexerNaImpressora, useReservarImpressora } from "@/components/grafica/modal-impressao";
import { invalidarGraficaEMaquinas } from "@/lib/tempo-real-grafica";
import { intervaloDePolling } from "@/hooks/use-websocket";
import { ocupacaoDasImpressoras, linkDaPecaNaGrafica } from "@shared/progresso-da-impressao";
import {
  ABAS, AMBAR, CSS_DA_TELA, GRAFICA_EM_IMPRESSAO, GRAFICA_LIBERADOS, INICIO_DO_DIARIO, LENTO_APOS_MS, LOTE, TITULO, VERMELHO,
} from "@/components/grafica/maquinas/constantes";
import { FichaContext, ToqueContext } from "@/components/grafica/maquinas/contexto";
import {
  AVISO_SERVIDOR_ANTIGO, ehServidorNaVersaoAnterior, intervaloDoPeriodo, mensagemDoErro, ordenarFila, pecaParaOModal, periodoBR, plural, rolarAte,
} from "@/components/grafica/maquinas/regras";
import type { Aba, Linha, OcupacaoDasImpressoras, OcupanteDaImpressora, PecaNaFila, PecaNaMaquina, Periodo, Relatorio, Retrato } from "@/components/grafica/maquinas/tipos";
import { Atualizado, Esqueleto, FechoDaLista, SeletorDeReserva } from "@/components/grafica/maquinas/pedacos";
import { CartaoDaImpressora } from "@/components/grafica/maquinas/cartao-da-impressora";
import { LOTE_DA_FILA, LinhaDaFilaGeral } from "@/components/grafica/maquinas/fila-geral";
import { SeletorDePeca } from "@/components/grafica/maquinas/seletor-de-peca";
import { AbaResumo } from "@/components/grafica/maquinas/resumo";
import { AbaDiario } from "@/components/grafica/maquinas/diario";
import { FichaDaPeca } from "@/components/grafica/maquinas/ficha-da-peca";

// O que a página exportava antes de ser dividida (testes e outras telas importam daqui).
export {
  ehServidorNaVersaoAnterior, intervaloDoPeriodo, oQueAconteceu, prazoDaPeca, textoDoPrazo, impressorasComLivresPrimeiro, textoDoDirecionamento,
  candidatasParaImprimir, motivoImpressoraOcupada, perguntaDaTroca,
} from "@/components/grafica/maquinas/regras";
export type { OcupacaoDasImpressoras, OcupanteDaImpressora } from "@/components/grafica/maquinas/tipos";

// ─── A página ─────────────────────────────────────────────────────────────────
export default function GraficaMaquinas() {
  const isMobile = useIsMobile();
  // O tablet do galpão é dedo em QUALQUER largura: alvo de 44 pelo ponteiro, não pela janela.
  const toque = usePonteiroGrosso() || isMobile;
  const { user } = useAuth();
  // Quem AGE: os mesmos papéis que os endpoints aceitam (grafica e admin). A
  // Solicitação vê a tela, mas não informa impressas — os botões nem aparecem.
  const podeAgir = user?.role === "grafica" || user?.role === "admin";
  const alvo = alvoDe(34, toque);

  // ── Recorte na URL: ?dia=AAAA-MM-DD&maquina=N ─────────────────────────────
  const search = useSearch();
  const [, navegar] = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const diaEscolhido = params.get("dia");          // null = hoje (o servidor decide o fuso)
  const maquinaFiltro = params.get("maquina") ?? ""; // "" = todas
  // VINDO DA GRÁFICA (21/09): ?foco=N põe o cartão da Impressora N em foco na
  // aba Agora (rola até ele e realça); ?item= realça a peça dentro dele.
  const focoDaURL = params.get("foco");
  const maquinaEmFoco = focoDaURL && MAQUINAS_DE_IMPRESSAO.includes(focoDaURL) ? focoDaURL : null;
  const itemEmFoco = params.get("item");
  // O recorte do resumo/exportação: ?periodo=dia|semana|mes|intervalo (&de=&ate= no intervalo).
  const periodoDaURL = params.get("periodo");
  const periodo: Periodo = periodoDaURL === "semana" || periodoDaURL === "mes" || periodoDaURL === "intervalo" ? periodoDaURL : "dia";
  const deDaURL = params.get("de");
  const ateDaURL = params.get("ate");
  // A aba (dono, 21/09: "deixe isso em outra aba da tela"): agora | diario | resumo.
  const abaDaURL = params.get("aba");
  const aba: Aba = abaDaURL === "diario" || abaDaURL === "resumo" ? abaDaURL : "agora";
  const escreverURL = (mudancas: Record<string, string | null>) => {
    const p = new URLSearchParams(search);
    for (const [k, v] of Object.entries(mudancas)) { if (v) p.set(k, v); else p.delete(k); }
    const qs = p.toString();
    navegar(`/grafica/maquinas${qs ? `?${qs}` : ""}`, { replace: true });
  };

  // ── Dados ─────────────────────────────────────────────────────────────────
  // A chave é [rota, "?dia=…"]: o queryFn padrão junta as duas sem barra, e a
  // invalidação por prefixo ("/api/grafica/maquinas" — WebSocket e modal de
  // impressão) alcança qualquer dia aberto.
  const { data, isLoading, isError, error, isFetching, refetch, dataUpdatedAt } = useQuery<Retrato>({
    queryKey: diaEscolhido ? ["/api/grafica/maquinas", `?dia=${diaEscolhido}`] : ["/api/grafica/maquinas"],
    // 1 min só com o tempo real caído; de pé, o WebSocket traz a mudança e o
    // polling vira rede de segurança (5 min). Aba escondida não busca.
    refetchInterval: intervaloDePolling(60_000),
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  // Aviso de lentidão só no carregamento INICIAL (depois há dado na tela).
  // Rolagem até o diário DEPOIS de a aba montar (o clique só escreve a URL;
  // rolar no clique achava um título que ainda não existia).
  useEffect(() => {
    if (aba === "diario" && maquinaFiltro) rolarAte("titulo-dia");
  }, [aba, maquinaFiltro]);

  useEffect(() => {
    if (aba !== "agora" || !maquinaEmFoco || !data) return;
    const el = document.querySelector<HTMLElement>(`[data-testid="maquina-agora-${maquinaEmFoco}"]`);
    el?.scrollIntoView?.({ block: "center" });
  }, [aba, maquinaEmFoco, !!data]);

  const [lento, setLento] = useState(false);
  useEffect(() => {
    if (!isLoading) return;
    const t = setTimeout(() => setLento(true), LENTO_APOS_MS);
    return () => clearTimeout(t);
  }, [isLoading]);

  // Relógio da tela (para "há 1h 20min"): anda junto com cada chegada de dado
  // e a cada minuto — sem tique por segundo.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    setAgora(Date.now());
    const t = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [dataUpdatedAt]);

  // ── O modal de impressão (o mesmo da fila) ────────────────────────────────
  // `trocar` abre direto no painel de impressora (ação "Trocar de máquina" do cartão).
  // `maquinaInicial`: peça reservada abre em "Iniciar impressão" já com a
  // impressora marcada (o servidor limpa a reserva ao iniciar).
  const [pecaNoModal, setPecaNoModal] = useState<{ peca: PecaNaMaquina; trocar: boolean; maquinaInicial: string | null; parte?: { quantidade: number; daReserva: boolean } | null } | null>(null);
  const itemDoModal = useMemo(() => (pecaNoModal ? pecaParaOModal(pecaNoModal.peca) : null), [pecaNoModal]);
  const abrirModal = (peca: PecaNaMaquina, trocar: boolean) => setPecaNoModal({ peca, trocar, maquinaInicial: null });
  // Do cartão: inicia SÓ a parte reservada àquela impressora (o servidor
  // consome essa reserva; as outras da peça continuam valendo).
  const iniciarDaFila = (p: PecaNaFila) => setPecaNoModal({ peca: p, trocar: false, maquinaInicial: p.maquinaPrevista, parte: p.reservadas != null ? { quantidade: p.reservadas, daReserva: true } : null });
  // A PEÇA DO MODAL ACOMPANHA O RETRATO (revisão adversarial, 22/09): o modal
  // guardava a cópia do momento em que abriu — depois de um 409 (um colega
  // lançou impressas na mesma parte) o retrato recarregava e o modal seguia com
  // o `jaSairam`/`expectedProduced` VELHOS, batendo no mesmo 409 a cada
  // tentativa. Agora a peça é trocada pela do retrato novo, no MESMO lugar
  // (cartão da mesma impressora, ou a mesma fila). Com qualquer gravação em voo
  // não mexe: o eco do próprio gesto chega antes da resposta.
  const gravando = useIsMutating();
  useEffect(() => {
    if (!pecaNoModal || !data || gravando > 0) return;
    const atual = pecaNoModal.peca;
    const daFila = (atual as PecaNaFila).semImpressora !== undefined;
    let fresca: PecaNaMaquina | undefined;
    if (daFila) {
      const prevista = (atual as PecaNaFila).maquinaPrevista;
      const fila = prevista ? data.maquinas.find((m) => m.codigo === prevista)?.naFila ?? [] : data.filaGeral ?? [];
      fresca = fila.find((x) => x.id === atual.id);
    } else {
      fresca = data.maquinas.find((m) => m.codigo === atual.maquina)?.imprimindo.find((x) => x.id === atual.id)
        ?? (data.semMaquina ?? []).find((x) => x.id === atual.id);
    }
    if (fresca === atual) return;
    if (!fresca) {
      // Saiu daquele lugar (mandada para o acabamento, tirada da impressora…): fecha e diz por quê.
      setPecaNoModal(null);
      toast({ title: `${atual.displayId ?? "A peça"} mudou enquanto o modal estava aberto`, description: "Outra pessoa mexeu nela — o cartão está atualizado." });
      return;
    }
    setPecaNoModal({ ...pecaNoModal, peca: fresca });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, gravando]);
  const hojeMs = todayBusinessMs();

  // ── Reservar impressora (fila geral ↔ fila da impressora) ─────────────────
  // A mutation é a do modal compartilhado ("Só reservar"): o MESMO endpoint,
  // os mesmos toasts e as mesmas chaves invalidadas (lib/tempo-real-grafica.ts).
  const reserva = useReservarImpressora();
  const reservar = (itemIds: string[], maquina: string | null, quantidade?: number | null, deMaquina?: string | null) => { if (itemIds.length) reserva.mutate({ itemIds, maquina, quantidade, deMaquina }); };
  // Seleção em lote da fila geral: só ids; some ao mudar o recorte do retrato.
  const [selecionadas, setSelecionadas] = useState<Set<string>>(() => new Set());
  const filaGeral = useMemo(() => ordenarFila(data?.filaGeral ?? []), [data?.filaGeral]);
  const idsDaFila = useMemo(() => new Set(filaGeral.map((p) => p.id)), [filaGeral]);
  const selecionadasVivas = useMemo(() => Array.from(selecionadas).filter((id) => idsDaFila.has(id)), [selecionadas, idsDaFila]);
  // Estáveis (useCallback + ref): a linha da fila é memoizada, e uma função
  // nova a cada render redesenharia as 300 linhas a cada marcação.
  const alternar = useCallback((id: string) => setSelecionadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const reservarRef = useRef(reservar);
  reservarRef.current = reservar;
  const reservarDaLinha = useCallback((id: string, maquina: string, quantidade: number) => reservarRef.current([id], maquina, quantidade), []);

  // ── "Imprimir agora" (dono, 21/09: "quando a impressora estiver vazia, eu
  // poder colocar direto para impressão, e não só reservar") ────────────────
  // O MESMO start-printing do modal, sem abri-lo: a peça inteira (payload de
  // sempre) quando vai tudo, ou só a parte (`iniciarParte` + `quantidade`).
  // UMA RÉGUA SÓ (21/09): quem ocupa cada impressora sai de
  // ocupacaoDasImpressoras (shared) — a mesma do servidor e do modal da
  // Gráfica. Antes era "tem peça no cartão": a peça com 10 de 10 esperando
  // "Mandar p/ acabamento" ocupava a impressora aqui e não na Gráfica.
  const pecasEmImpressao = useMemo(() => {
    const porId = new Map<string, PecaNaMaquina>();
    for (const m of data?.maquinas ?? []) for (const x of m.imprimindo) if (!porId.has(x.id)) porId.set(x.id, x);
    for (const x of data?.semMaquina ?? []) if (!porId.has(x.id)) porId.set(x.id, x);
    return Array.from(porId.values());
  }, [data]);
  const ocupantes = useMemo(() => ocupacaoDasImpressoras(pecasEmImpressao.map(pecaParaOModal)), [pecasEmImpressao]);
  const ocupacao = useMemo<OcupacaoDasImpressoras>(() => {
    const o: OcupacaoDasImpressoras = {};
    for (const m of MAQUINAS_DE_IMPRESSAO) {
      const a = ocupantes[m];
      o[m] = { n: a ? 1 : 0, primeira: a?.displayId ?? null, atual: a ?? null };
    }
    return o;
  }, [ocupantes]);
  const imprimirAgora = useMutation({
    mutationFn: async ({ peca, maquina, quantidade }: { peca: PecaNaFila; maquina: string; quantidade: number }) => {
      const livre = (peca.semImpressora ?? peca.aImprimir) + Object.values(peca.reserva ?? {}).reduce((t, x) => t + x, 0);
      const inteira = peca.status !== "inProduction" && peca.status !== "em_producao" && quantidade === livre && (peca.imprimindoEm ?? []).length === 0;
      return await apiRequest("PATCH", `/api/items/${peca.id}/start-printing`, inteira ? { printMachine: maquina } : { printMachine: maquina, iniciarParte: true, quantidade });
    },
    onSuccess: (_r, v) => {
      invalidarGraficaEMaquinas();
      toast({ title: `${v.peca.displayId ?? "Peça"} ${nomeDaPeca(v.peca.tipo, v.peca.descricao)}: ${v.quantidade} un. em impressão na ${rotuloDaMaquina(v.maquina)}`, description: "Conforme as unidades saírem, informe as impressas no cartão da impressora." });
    },
    onError: (error: Error) => {
      invalidarGraficaEMaquinas();
      toast({ title: "Não foi possível iniciar a impressão", description: mensagemDeErroDaApi(error), variant: "destructive" });
    },
  });
  // ── TIRAR da impressora / TROCAR por prioridade (uma peça por vez) ────────
  // A mesma mutation do modal compartilhado (useMexerNaImpressora).
  const mexerNaImpressora = useMexerNaImpressora();
  // DUPLO DISPARO: a trava por ref vale ANTES do próximo render (duplo clique,
  // Enter segurado); o isPending desabilita os botões enquanto o gesto voa.
  const travaDaImpressoraRef = useRef(false);
  const mexer = (v: { maquina: string; sai: OcupanteDaImpressora; entra?: PecaNaFila | null; quantidade?: number | null }) => {
    if (travaDaImpressoraRef.current || mexerNaImpressora.isPending) return;
    travaDaImpressoraRef.current = true;
    mexerNaImpressora.mutate(v, { onSettled: () => { travaDaImpressoraRef.current = false; } });
  };
  const mexerRef = useRef(mexer);
  mexerRef.current = mexer;
  const trocarDaLinha = useCallback((entra: PecaNaFila, maquina: string, quantidade: number | null, sai: OcupanteDaImpressora) => mexerRef.current({ maquina, sai, entra, quantidade }), []);
  // [modal] impressoras ocupadas → código da peça que está nelas.
  // O MESMO `ocupadas` que a Gráfica passa ao modal: o ocupante inteiro
  // (com ele o modal oferece "Imprimir esta no lugar"), menos a própria peça.
  const ocupadasParaOModal = useMemo(
    () => ocupacaoDasImpressoras(pecasEmImpressao.map(pecaParaOModal), pecaNoModal?.peca.id ?? null),
    [pecasEmImpressao, pecaNoModal],
  );
  const imprimirRef = useRef(imprimirAgora.mutate);
  imprimirRef.current = imprimirAgora.mutate;
  const imprimirDaLinha = useCallback((peca: PecaNaFila, maquina: string, quantidade: number) => imprimirRef.current({ peca, maquina, quantidade }), []);
  const imprimindoId = imprimirAgora.isPending ? imprimirAgora.variables?.peca.id ?? null : null;
  // A fila entra em LOTES (eram 20 e depois "todas": 300+ linhas com select e
  // campo cada travavam o celular). Cada toque traz mais um lote.
  const [filaVisiveis, setFilaVisiveis] = useState(LOTE_DA_FILA);
  // Fila de cada cartão no celular: as primeiras à vista, o resto sob pedido.
  const [filasAbertas, setFilasAbertas] = useState<Set<string>>(() => new Set());
  // O seletor de peça de um cartão "Livre": qual impressora está escolhendo.
  const [seletorDaMaquina, setSeletorDaMaquina] = useState<string | null>(null);

  // ── A FICHA da peça — a MESMA da Gráfica (components/grafica/maquinas/ficha-da-peca.tsx).
  const [fichaId, setFichaId] = useState<string | null>(null);
  const abrirFicha = useCallback((id: string) => setFichaId(id), []);
  const maquinaDoSeletor = useMemo(() => {
    const m = (data?.maquinas ?? []).find((x) => x.codigo === seletorDaMaquina);
    return m ? { codigo: m.codigo, rotulo: m.rotulo, naFila: m.naFila ?? [] } : null;
  }, [data, seletorDaMaquina]);

  // ── Derivados ─────────────────────────────────────────────────────────────
  const hoje = data?.hoje ?? null;
  const dia = data?.dia ?? diaEscolhido;
  const ehHoje = !!hoje && dia === hoje;
  const maquinas = data?.maquinas ?? [];
  // PEÇAS, não linhas de cartão: a peça dividida aparece no cartão de cada
  // impressora, mas é UMA peça — o mesmo número do card "Em Impressão" da Gráfica.
  const totalImprimindo = pecasEmImpressao.length;
  // A linha de estado do topo: impressoras com peça (a mesma régua do "Imprimindo" do cartão).
  const impressorasImprimindo = maquinas.filter((m) => m.imprimindo.length > 0).length;
  // "Liberados" da Gráfica = peças liberadas, com ou sem impressora reservada.
  // Aqui elas se dividem entre a fila geral e as filas dos cartões (a mesma
  // peça pode estar nas duas, com unidades diferentes) — o número é o de lá.
  const liberadasNaTela = useMemo(() => {
    const ids = new Set<string>();
    const lib = (x: { id: string; status: string }) => { if (x.status !== "inProduction" && x.status !== "em_producao") ids.add(x.id); };
    for (const x of data?.filaGeral ?? []) lib(x);
    for (const m of data?.maquinas ?? []) for (const x of m.naFila ?? []) lib(x);
    return ids.size;
  }, [data]);
  const totalReservadas = maquinas.reduce((s, m) => s + (m.naFila?.length ?? 0), 0);
  const irParaAba = (nova: Aba) => escreverURL({ aba: nova === "agora" ? null : nova });
  // Contagem de cada aba: peças em impressão, lançamentos do dia, unidades do período.
  const contagemDaAba: Record<Aba, number | null> = {
    agora: totalImprimindo,
    diario: maquinas.reduce((s, m) => s + m.registros.length, 0),
    resumo: null,
  };
  const unidadesDoDia = maquinas.reduce((s, m) => s + m.unidadesNoDia, 0);

  // ── O relatório (resumo do período) ───────────────────────────────────────
  // O intervalo nasce do dia do diário + o período escolhido; só é pedido
  // quando o retrato já disse qual é "hoje" (o servidor trava o fim em hoje).
  const intervalo = useMemo(
    () => (dia && hoje ? intervaloDoPeriodo(periodo, dia, hoje, deDaURL, ateDaURL) : null),
    [periodo, dia, hoje, deDaURL, ateDaURL],
  );
  const relatorio = useQuery<Relatorio>({
    queryKey: ["/api/grafica/maquinas/relatorio", `?de=${intervalo?.de}&ate=${intervalo?.ate}`],
    // Só na aba Resumo: a aba Agora (painel de parede) não paga essa consulta.
    enabled: !!intervalo && aba === "resumo",
    staleTime: 15_000,
    refetchInterval: intervaloDePolling(60_000),
  });
  const { toast } = useToast();
  const [exportando, setExportando] = useState(false);
  // Baixa o .xlsx do MESMO intervalo do resumo. `fetch` direto (e não
  // apiRequest) porque o corpo é binário e o nome vem do servidor.
  const exportarExcel = async () => {
    if (!intervalo || exportando) return;
    setExportando(true);
    try {
      const res = await fetch(`/api/grafica/maquinas/relatorio.xlsx?de=${intervalo.de}&ate=${intervalo.ate}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Falha ao gerar o arquivo");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = intervalo.de === intervalo.ate ? `maquinas-${intervalo.de}.xlsx` : `maquinas-${intervalo.de}-a-${intervalo.ate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Excel gerado", description: `Resumo e registros de ${periodoBR(intervalo.de, intervalo.ate)}.` });
    } catch (error: unknown) {
      const mensagem = mensagemDoErro(error);
      toast({ title: "Não foi possível exportar", description: mensagem != null ? String(mensagem) : "Erro inesperado", variant: "destructive" });
    } finally {
      setExportando(false);
    }
  };

  // ── Largura útil: o diário vira cartões quando a tabela não cabe ──────────
  // A régua da casa (useDensidadeDoConteudo): mede a ÁREA ÚTIL do conteúdo —
  // menu lateral aberto a 1280px deixa ~1040px; abaixo de 820px nem a tabela
  // reduzida cabe sem cortar coluna. Antes da primeira medida (ou sem
  // ResizeObserver) a largura da janela segura o lugar, como antes.
  const medida = useDensidadeDoConteudo<HTMLDivElement>(0);
  const densidade = medida.largura ? medida.densidade : densityFromWidth(typeof window !== "undefined" ? window.innerWidth : 1280);
  const diarioEmCartoes = isMobile || densidade === "cards";
  const diarioCompacto = !diarioEmCartoes && densidade === "compact";

  // O diário é UM só (todas as máquinas), na ordem do dia; o chip filtra.
  const diario = useMemo<Linha[]>(() => {
    const linhas: Linha[] = [];
    for (const m of maquinas) for (const r of m.registros) linhas.push({ ...r, maquina: m.codigo, rotuloMaquina: m.rotulo });
    linhas.sort((a, b) => a.ordem - b.ordem);
    return maquinaFiltro ? linhas.filter((l) => l.maquina === maquinaFiltro) : linhas;
  }, [maquinas, maquinaFiltro]);

  // "Mostrar mais" sem efeito: o limite guarda o recorte a que pertence e
  // volta ao lote inicial quando o recorte muda.
  const chaveDoRecorte = `${dia ?? ""}|${maquinaFiltro}`;
  const [limite, setLimite] = useState<{ chave: string; n: number }>({ chave: chaveDoRecorte, n: LOTE });
  const visiveis = limite.chave === chaveDoRecorte ? limite.n : LOTE;
  const linhasVisiveis = diario.slice(0, visiveis);

  const irParaDia = (novo: string) => escreverURL({ dia: hoje && novo >= hoje ? null : novo });
  const maquinaFiltrada = maquinas.find((m) => m.codigo === maquinaFiltro) ?? null;
  const antesDoDiario = !!dia && dia < INICIO_DO_DIARIO;

  // Estilos repetidos
  // Links que parecem botão (rota própria, não viram <Botao>) e o override de medida dos <Botao> neutros.
  const botaoNeutro: React.CSSProperties = { minHeight: alvo, padding: "0 12px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, color: T.text, fontSize: FS.meta, fontWeight: FW.forte, cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap" };
  const botaoIcone: React.CSSProperties = { height: alvo, width: alvo, borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: T.text };

  // A barra do lote. Desktop: ao lado do título. Celular: DEPOIS da lista no
  // DOM e grudada embaixo da tela — quem marcou a 15ª peça não rola de volta
  // ao título para achar o "Reservar para…"; o recorte seguro vai no LONGO
  // (o atalho `padding` com env() não sobrevive ao estilo inline).
  // No celular a ação principal (o select, linha inteira) vem em cima; a
  // contagem e o "Limpar" dividem a linha de baixo.
  const contagemDoLote = (
    <span aria-live="polite" style={{ flex: isMobile ? "1 1 0%" : undefined, minWidth: 0, fontSize: FS.body, fontWeight: FW.forte, color: T.text, fontVariantNumeric: "tabular-nums" }}>{plural(selecionadasVivas.length, "selecionada", "selecionadas")}</span>
  );
  const barraDoLoteVisivel = podeAgir && selecionadasVivas.length > 0 && aba === "agora";
  const barraDoLote = podeAgir && selecionadasVivas.length > 0 ? (
    <div
      role="group"
      aria-label="Reservar as selecionadas"
      data-testid="lote-fila"
      style={isMobile
        ? { position: "sticky", bottom: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: T.surface, border: `1px solid ${T.bdark}`, borderRadius: R.lg, boxShadow: "0 -6px 14px -8px rgba(28,25,23,0.25)", paddingTop: 10, paddingLeft: 12, paddingRight: 12, paddingBottom: "calc(10px + env(safe-area-inset-bottom))" }
        : { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
    >
      {!isMobile && contagemDoLote}
      <SeletorDeReserva valor={null} excluir={null} disabled={reserva.isPending} alvo={alvo} isMobile={isMobile} testId="reservar-lote" rotulo={isMobile ? `Reservar ${plural(selecionadasVivas.length, "peça", "peças")} para…` : "Reservar para…"} onEscolher={(m) => { reservar(selecionadasVivas, m); setSelecionadas(new Set()); }} />
      {isMobile && contagemDoLote}
      <Botao variante="secundario" onClick={() => setSelecionadas(new Set())} data-testid="lote-limpar" style={{ ...botaoNeutro, ...(isMobile ? { fontSize: 13 } : {}) }}>Limpar</Botao>
    </div>
  ) : null;

  return (
    <ToqueContext.Provider value={toque}>
    <FichaContext.Provider value={abrirFicha}>
    <div
      data-testid="pagina-maquinas"
      style={{
        backgroundColor: T.bg, minHeight: "100%",
        paddingTop: isMobile ? 12 : 24, paddingLeft: isMobile ? 16 : 24, paddingRight: isMobile ? 16 : 24,
        // Respiro no FIM: a lista nunca termina colada na borda da janela. No
        // celular soma a área segura; com a barra de lote grudada embaixo, o
        // bastante para a última linha não ficar atrás dela.
        paddingBottom: isMobile ? `calc(${barraDoLoteVisivel ? 160 : 72}px + env(safe-area-inset-bottom))` : 80,
      }}
    >
      <style>{CSS_DA_TELA}</style>
      <div ref={medida.ref} style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: isMobile ? 18 : 24 }}>

        {/* ── Cabeçalho: onde estou, o que a tela faz, atalhos ── */}
        <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Link href="/grafica" data-testid="link-voltar-fila" className="mq-link" style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: toque ? 44 : undefined, fontSize: isMobile ? 12 : FS.small, fontWeight: FW.forte, color: T.second, textDecoration: "none", width: "fit-content" }}>
            <ArrowLeft aria-hidden="true" style={{ width: 13, height: 13 }} /> Fila da Gráfica
          </Link>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h1 style={{ ...TITULO, fontSize: isMobile ? 22 : FS.h1, display: "flex", alignItems: "center", gap: 10 }}>
              <Printer aria-hidden="true" style={{ width: isMobile ? 18 : 22, height: isMobile ? 18 : 22, color: T.accentText }} />
              Máquinas
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {data && <Atualizado em={dataUpdatedAt} buscando={isFetching && !isLoading} fonte={isMobile ? 12 : FS.small} />}
              <Link href={GRAFICA_EM_IMPRESSAO} data-testid="link-grafica-em-impressao" className="mq-acao" title='Abrir a fila da Gráfica já filtrada em "Em Impressão"' style={botaoNeutro}>
                Em impressão na Gráfica <ArrowRight aria-hidden="true" style={{ width: 12, height: 12, color: T.accentText }} />
              </Link>
            </div>
          </div>
          {/* UMA linha de ESTADO, como o subtítulo das outras telas; o que a
              tela faz mora no "?" ao lado (à mão, sem ocupar três linhas). */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: FS.body, lineHeight: 1.45, color: T.second }}>
            {data && (
              <span data-testid="estado-maquinas">
                {`${impressorasImprimindo} de ${maquinas.length} impressoras imprimindo · ${plural(liberadasNaTela, "peça", "peças")} na fila`}
              </span>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="O que a tela Máquinas mostra e o que dá para fazer nela"
                  data-testid="button-como-funciona-maquinas"
                  style={{ width: alvoDe(28, toque), height: alvoDe(28, toque), borderRadius: R.pill, border: "none", background: "transparent", color: T.apoio, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, margin: "-4px 0" }}
                >
                  <HelpCircle aria-hidden="true" style={{ width: 16, height: 16 }} />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" data-testid="explicacao-maquinas" style={{ width: 300, maxWidth: "calc(100vw - 32px)", padding: 14 }}>
                <p style={{ margin: 0, fontSize: FS.body, color: T.strong, lineHeight: 1.5 }}>
                  O que cada impressora está imprimindo agora, a fila do que vem, o resumo do período e o diário do que saiu de cada uma.
                  {podeAgir && " Daqui você reserva impressora, inicia, informa as impressas, manda para o acabamento ou troca de máquina."}
                </p>
              </PopoverContent>
            </Popover>
          </div>
        </header>

        {/* As abas: o MESMO <Abas> da Gráfica (Fila | Tubos) e da aba Tubos —
            setas, roving tabindex e alvo de 44px moram no componente. O
            wrapper guarda o testid antigo e a rolagem lateral no celular. */}
        <div data-testid="abas-maquinas" style={{ overflowX: "auto", scrollbarWidth: "none", maxWidth: "100%", marginTop: -8 }}>
          <Abas
            itens={ABAS.map((t) => {
              const n = contagemDaAba[t.id];
              return { id: t.id, rotulo: t.rotulo, ...(n != null && n > 0 ? { contador: n } : {}) };
            })}
            ativo={aba}
            aoTrocar={(id) => irParaAba(id as Aba)}
            rotuloDaLista="Seções da tela"
            prefixoDeTestId="aba"
          />
        </div>

        {isLoading && <Esqueleto lento={lento} />}

        {isError && !data && (
          <div role="alert" data-testid="maquinas-erro" style={{ padding: "14px 16px", borderRadius: R.lg, background: VERMELHO.bg, border: `1px solid ${VERMELHO.border}`, color: VERMELHO.text, fontSize: FS.body, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span>{ehServidorNaVersaoAnterior(error) ? AVISO_SERVIDOR_ANTIGO : "Não foi possível carregar as máquinas. Confira a conexão e tente de novo."}</span>
            <Botao variante="secundario" icone={RotateCcw} onClick={() => refetch()} data-testid="button-tentar-novamente" style={{ minHeight: alvo }}>
              Tentar novamente
            </Botao>
          </div>
        )}

        {data && (
          <>
            {isError && (
              <p role="status" data-testid="maquinas-erro-suave" style={{ margin: 0, fontSize: isMobile ? 12 : FS.small, color: AMBAR.text }}>
                A última atualização falhou — mostrando o retrato de {fmtRelative(new Date(dataUpdatedAt).toISOString(), agora)}. Tentando de novo em breve.
              </p>
            )}

            {/* ── 1 · AGORA ── */}
            {aba === "agora" && (
            <section id="painel-maquinas" role="tabpanel" aria-label="Agora" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <h2 id="titulo-agora" style={{ ...TITULO, fontSize: FS.title }}>Agora</h2>
                <span data-testid="resumo-agora" style={{ fontSize: FS.body, color: T.second }}>
                  {totalImprimindo === 0 ? "nenhuma peça em impressão" : `${plural(totalImprimindo, "peça", "peças")} em impressão`}
                </span>
              </div>

              {data.semMaquina.length > 0 && (
                <div role="status" data-testid="sem-maquina" style={{ padding: "11px 14px", borderRadius: R.lg, background: AMBAR.bg, border: `1px solid ${AMBAR.border}`, color: AMBAR.text, fontSize: isMobile ? 13 : 12.5, lineHeight: 1.5, display: "flex", gap: 8 }}>
                  <AlertTriangle aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2 }} />
                  <span>
                    <strong>{plural(data.semMaquina.length, "peça está", "peças estão")} em impressão sem máquina anotada</strong> — foram
                    iniciadas antes do controle por máquina. Abra na fila e escolha a impressora:{" "}
                    {data.semMaquina.map((p, i) => (
                      <span key={p.id}>
                        {i > 0 && ", "}
                        <Link href={linkDaPecaNaGrafica(p.id)} className="mq-link" style={{ color: AMBAR.text, fontWeight: FW.forte }}>{p.displayId ?? "peça"}</Link>
                      </span>
                    ))}
                  </span>
                </div>
              )}

              {/* alignItems start: a grade esticava TODOS os cartões até a altura do
                  mais comprido — uma impressora com fila grande deixava as livres
                  como colunas brancas da altura da tela (relato do dono, 24/09). */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12, alignItems: "start" }}>
                {maquinas.map((m) => (
                  <CartaoDaImpressora key={m.codigo} m={m} maquinaEmFoco={maquinaEmFoco} itemEmFoco={itemEmFoco} agora={agora} hojeMs={hojeMs} isMobile={isMobile} toque={toque} podeAgir={podeAgir} ocupacao={ocupacao} mexendo={mexerNaImpressora.isPending} filasAbertas={filasAbertas} dia={dia} hoje={hoje} botaoNeutro={botaoNeutro} setSeletorDaMaquina={setSeletorDaMaquina} abrirModal={abrirModal} mexer={mexer} iniciarDaFila={iniciarDaFila} reservar={reservar} setFilasAbertas={setFilasAbertas} escreverURL={escreverURL} />
                ))}
              </div>
            </section>
            )}

            {/* ── 2 · A FILA GERAL (liberadas sem impressora reservada) ── */}
            {aba === "agora" && (
              <section aria-labelledby="titulo-fila" data-testid="secao-fila" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                    <h2 id="titulo-fila" style={{ ...TITULO, fontSize: FS.title }}>Fila geral</h2>
                    <span data-testid="resumo-fila" style={{ fontSize: FS.body, color: T.second }}>
                      {filaGeral.length === 0 ? "nenhuma peça sem impressora" : `${plural(filaGeral.length, "peça liberada", "peças liberadas")} sem impressora`}
                      {totalReservadas > 0 ? ` · ${plural(totalReservadas, "reservada", "reservadas")} nos cartões acima` : ""}
                    </span>
                  </div>
                  {!isMobile && barraDoLote}
                </div>
                <p style={{ margin: 0, fontSize: FS.body, color: T.second, maxWidth: 680 }}>
                  Reservar só organiza a fila desta tela: a peça continua liberada na Gráfica até alguém iniciar a impressão.
                </p>
                <p data-testid="relacao-liberados" style={{ margin: 0, fontSize: isMobile ? 12 : FS.small, color: T.second, maxWidth: 680 }}>
                  {`${plural(liberadasNaTela, "peça liberada", "peças liberadas")} ao todo — é o "Liberados" da Gráfica. `}
                  Uma peça com parte reservada e parte sem impressora aparece aqui e num cartão; a que já imprime só uma parte continua na fila com o resto.
                </p>
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden" }}>
                  {filaGeral.length === 0 ? (
                    <div data-testid="fila-vazia">
                      <EstadoVazio
                        compacto
                        icone={Printer}
                        titulo={totalReservadas > 0 ? "Todas as peças liberadas já têm impressora reservada." : "Nenhuma peça liberada aguardando impressão."}
                        descricao="Quando a Revisão Final liberar, elas aparecem aqui para você reservar uma impressora."
                        acao={(
                          <Link href={GRAFICA_LIBERADOS} className="mq-acao" data-testid="link-fila-ver-na-grafica" style={botaoNeutro}>
                            Ver na Gráfica <ArrowRight aria-hidden="true" style={{ width: 12, height: 12, color: T.accentText }} />
                          </Link>
                        )}
                      />
                    </div>
                  ) : (
                    <div data-testid="fila-geral">
                      {filaGeral.slice(0, filaVisiveis).map((p) => (
                        <LinhaDaFilaGeral key={p.id} p={p} marcada={selecionadas.has(p.id)} podeAgir={podeAgir} ocupado={reserva.isPending || mexerNaImpressora.isPending} hojeMs={hojeMs} isMobile={isMobile} ocupacao={ocupacao} imprimindo={imprimindoId === p.id} onAlternar={alternar} onReservar={reservarDaLinha} onImprimir={imprimirDaLinha} onTrocar={trocarDaLinha} />
                      ))}
                      <FechoDaLista visiveis={Math.min(filaVisiveis, filaGeral.length)} total={filaGeral.length} um="peça" varios="peças" lote={LOTE_DA_FILA} onMais={() => setFilaVisiveis((v) => v + LOTE_DA_FILA)} testId="fecho-fila-geral" botaoTestId="button-fila-toda" isMobile={isMobile} estiloDoBotao={botaoNeutro} />
                    </div>
                  )}
                </div>
                {isMobile && barraDoLote}
              </section>
            )}

            {/* ── 3 · O RESUMO (por dia × impressora, no período escolhido) ── */}
            {aba === "resumo" && (
              <AbaResumo isMobile={isMobile} alvo={alvo} periodo={periodo} intervalo={intervalo} dia={dia} hoje={hoje} ehHoje={ehHoje} relatorio={relatorio} exportando={exportando} exportarExcel={exportarExcel} diarioEmCartoes={diarioEmCartoes} botaoNeutro={botaoNeutro} escreverURL={escreverURL} />
            )}

            {/* ── 4 · O DIÁRIO ── */}
            {aba === "diario" && (
              <AbaDiario isMobile={isMobile} alvo={alvo} dia={dia} hoje={hoje} ehHoje={ehHoje} maquinas={maquinas} maquinaFiltro={maquinaFiltro} maquinaFiltrada={maquinaFiltrada} diario={diario} linhasVisiveis={linhasVisiveis} visiveis={visiveis} chaveDoRecorte={chaveDoRecorte} setLimite={setLimite} unidadesDoDia={unidadesDoDia} antesDoDiario={antesDoDiario} diarioEmCartoes={diarioEmCartoes} diarioCompacto={diarioCompacto} podeAgir={podeAgir} botaoNeutro={botaoNeutro} botaoIcone={botaoIcone} irParaDia={irParaDia} escreverURL={escreverURL} />
            )}
          </>
        )}
      </div>

      {/* O mesmo modal da fila da Gráfica: iniciar não cabe aqui (a peça já
          está na máquina), então ele abre direto em "informar impressas". */}
      <ModalImpressao item={itemDoModal} abrirNaTroca={pecaNoModal?.trocar ?? false} maquinaInicial={pecaNoModal?.maquinaInicial ?? null} maquinaEmQuestao={pecaNoModal?.peca.parte ? pecaNoModal.peca.maquina : null} parteAIniciar={pecaNoModal?.parte ?? null} ocupadas={ocupadasParaOModal} onFechar={() => setPecaNoModal(null)} />

      {/* O seletor de peça do cartão "Livre": fecha e passa a vez ao modal de
          impressão, já com a impressora marcada. */}
      <SeletorDePeca
        maquina={maquinaDoSeletor}
        reservadas={maquinaDoSeletor?.naFila ?? []}
        filaGeral={filaGeral}
        atualizando={isFetching && !isLoading}
        hojeMs={hojeMs}
        onFechar={() => setSeletorDaMaquina(null)}
        onEscolher={(p, codigo) => {
          setSeletorDaMaquina(null);
          // Reservada para esta impressora: só a parte dela. Da fila geral: o
          // que está sem impressora (a peça inteira quando nada foi direcionado).
          const parte = p.reservadas != null ? { quantidade: p.reservadas, daReserva: true }
            : p.semImpressora != null && (p.semImpressora < p.aImprimir || (p.imprimindoEm ?? []).length > 0) ? { quantidade: p.semImpressora, daReserva: false }
            : null;
          setPecaNoModal({ peca: p, trocar: false, maquinaInicial: codigo, parte });
        }}
      />

      {/* A ficha: enquanto a peça completa não chega, um aviso pequeno (com
          saída); depois, o mesmo diálogo que a Gráfica abre no "Ver detalhes". */}
      <FichaDaPeca fichaId={fichaId} setFichaId={setFichaId} isMobile={isMobile} botaoNeutro={botaoNeutro} />
    </div>
    </FichaContext.Provider>
    </ToqueContext.Provider>
  );
}
