import { useQuery, useMutation } from "@tanstack/react-query";
import { miniatura } from "@/lib/miniatura";
import { SeloKit } from "@/components/kit/selo-kit";
import { SeloMolde } from "@/components/kit/selo-kit";
import { AcoesDoMolde } from "@/components/grafica/acoes-do-molde";
import { ehMolde, statusDeExibicao, statusParaContagem } from "@shared/molde";
import { AvisoDoEstoqueNaPeca } from "@/components/consulta-de-estoque/aviso-na-grafica";
import { EsqueletoDeFila } from "@/components/esqueleto-de-fila";
import { Link } from "wouter";
import { prefetchRota } from "@/lib/prefetch-de-rota";
import { FilterSelect, ShortcutPill } from "@/components/filter-select";
import { AlertCircle, AlertTriangle, Package, CheckCircle, Truck, Calendar, Eye, Check, Camera, Search, Play, X, Filter, ChevronDown, Printer, RotateCcw, ImagePlus, FileSpreadsheet, ListChecks, PlusCircle, Trash2, Undo2, Loader2, Recycle, Tag, MoreHorizontal, Lock, Unlock } from "lucide-react";
import { Fragment, useState, useMemo, useEffect, useLayoutEffect, useRef, startTransition } from "react";
// Fila de ~4 mil peças: linha memoizada + desenho por lotes (ver o arquivo).
import { LinhaMemo, SentinelaDaLista } from "@/components/grafica/lista-incremental";
import { recorteSoDaBusca, recorteSemABusca } from "@/components/grafica/recorte-da-busca";
// Teclado virtual: modal e fila sobem junto com ele (ver o arquivo).
import { useAcompanharAreaVisivel } from "@/components/grafica/area-visivel";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { parseDateLocal } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest, queryClient, getCurrentUserName } from "@/lib/queryClient";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { useToast } from "@/hooks/use-toast";
import { ObjectUploader } from "@/components/ObjectUploader";
import { TubosDialog } from "@/components/tubos-dialog";
import { AbaTubos } from "@/components/grafica/aba-tubos";
import { linhaDaLista } from "@/lib/etiqueta-lista";
import { eventoBarraImpressas } from "@shared/impressao-dividida";
import { aEmbalar, embaladaDe, parteDoTotal, seloDosVolumes, statusEmbalavel, CONFERIR_E_EMBALAR, type LinhaDoVolume } from "@shared/embalagem";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import { useIsMobile, useElementSize, densityFromWidth } from "@/hooks/use-mobile";
import {
  getStatusMeta, getStatusLabel, getPriorityMeta, descricaoDoStatus,
  seloPecaEventoFinalizado, motivoAcaoBloqueada, todayBusinessMs,
} from "@/lib/status";
import type { SeloPecaEventoFinalizado } from "@/lib/status";
import { StatusPill } from "@/components/status-pill";
import { diasNaFase, tomDaIdade } from "@/lib/idade-na-fase";
import { useAuth } from "@/contexts/auth-context";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { GalpaoFila, type GalpaoDados } from "@/components/galpao-fila";
import { EM_REVISAO, rotuloDaMaquina, podeIrParaTubo, MAQUINAS_DE_IMPRESSAO } from "@shared/fluxo-peca";
import { estaDividida, partesDaPeca, resumoDaDivisao } from "@shared/impressao-dividida";
import { partesAtivas } from "@shared/impressao-dividida";
import { semImpressora } from "@shared/reserva-de-impressora";
// A peça na impressora em UMA fonte (21/09: "Máquinas e Gráfica têm que se
// conversar"): os números, o selo da fila, quem ocupa cada impressora e os
// links de ida e volta são os mesmos do cartão de Máquinas.
import { numerosDaImpressao, fraseDaFila, ocupacaoDasImpressoras, linkDaImpressoraEmMaquinas, estaEmImpressao, estaLiberada } from "@shared/progresso-da-impressao";
import { invalidarGraficaEMaquinas } from "@/lib/tempo-real-grafica";
// TRAVA DA SOLICITAÇÃO (21/09): a regra (quem trava, o que bloqueia, as frases)
// mora em shared/trava-da-peca.ts; aqui só o botão, o modal e o selo.
import { pecaTravada, fraseDaTrava, seloDaTrava, podeTravar, lerMotivo, SUGESTOES_DE_MOTIVO, MOTIVO_MINIMO } from "@shared/trava-da-peca";
// Aritmética de saldo: fonte única em lib/saldo.ts. Estes onze cálculos
// (quanto falta produzir, conferir, entregar, reaproveitar; quanto de m²
// realmente vai para a impressora) viviam duplicados como consts locais no
// topo deste arquivo e eram refeitos "na mão" na ficha da peça e nos modais —
// toda vez que uma regra mudou, uma das cópias ficou para trás. Aqui a lista,
// os modais e a ficha leem os MESMOS números.
import {
  isDelivered, isPacked, isConferred, isPosConferencia, isProduced, isInProd,
  qtyOf, producedOf, conferredOf, deliveredOf, reusedOf, reusedTotalOf,
  m2ToProduce, remainingProduce, remainingConfer, remainingReuse,
  canConfer as canConferBase,
  isComplement, complementsQtyOf, contractedTotalOf,
} from "@/lib/saldo";
// Leitura/ordenação do código da peça: fonte única em lib/displayId.ts, o mesmo
// módulo que Painel Geral, Arte e Vincular usam (e espelho de server/storage.ts).
// "#0062-C1" tem de ordenar COLADO em "#0062" — com o replace(/\D/g,'') antigo
// virava 621 e o complemento aparecia centenas de linhas longe da mãe.
import { compareDisplayId, splitDisplayId } from "@/lib/displayId";
// Recorte da fila: fonte única em lib/grafica-filtros.ts. Os doze filtros eram
// doze useState soltos e cada lugar que perguntava "há filtro ativo?" mantinha a
// lista À MÃO — foi assim que Grupo e Percurso entraram sem entrar no
// `hasActiveFilters` e o vazio por filtro passou a dizer "Nenhuma peça liberada
// ainda". Agora o recorte é UM objeto: contagem, descrição, URL e casamento
// item↔filtro saem todos dele.
import {
  FILTROS_VAZIOS, filtrosDaURL, filtrosParaQuery, itemCasaFiltros, itemPercursos,
  contarFiltrosAtivos, temFiltroAtivo, descreverFiltros, nomeDoMes, escondeEntregues,
  hojeEmUTC, normKey, ordemPercurso, itemMes, itemImpressoras, SEM_IMPRESSORA, casaStatus,
  type GraficaFiltros, type FacetaGrafica,
} from "@/lib/grafica-filtros";
// Lançamento de produção: o único campo do app cujo contrato é ABSOLUTO ao lado
// de dois vizinhos incrementais. A regra (teto, lock otimista, confirmação da
// redução) mora em lib/grafica-producao.ts.
import { tetoDeProducao } from "@/lib/grafica-producao";
// O modal de impressão (iniciar / informar impressas / mandar para acabamento /
// trocar de máquina) é COMPARTILHADO com a aba Máquinas: as mutations, os
// toasts e o formulário moram em components/grafica/modal-impressao.tsx.
import {
  useMutacoesDeImpressao, FormularioDeImpressao, cabecalhoDoModalDeImpressao,
  progressoDaImpressao, rotuloCurtoDaAcao, BarraDeImpressao,
} from "@/components/grafica/modal-impressao";
// Selo "Atualizado há X" — o mesmo formatador da Gestão de Prazos e das
// Análises, para as três telas dizerem a idade do dado com as mesmas palavras.
import { fmtRelative } from "@/components/prazos/tokens";
import { FS, FW, FONT, R, T, N, TOM, SHADOW } from "@/lib/theme";
import { P } from "@/lib/status";
import { Botao } from "@/components/ui/botao";
import { Abas } from "@/components/ui/abas";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { CartaoKpi } from "@/components/ui/cartao-kpi";
import { Selo, type TomDoSelo } from "@/components/ui/selo";
import { EstadoVazio, EstadoErro } from "@/components/ui/estados";
import { useConfirmar } from "@/components/ui/usar-confirmar";
import { usePonteiroGrosso, alvo as alvoDeToque } from "@/hooks/use-mobile";
// AUMENTAR QUANTIDADE nasce AQUI. Esta é a tela onde as peças em produção
// vivem e onde o aumento precisa ser visto — o Detalhe do Evento ficou só com
// a REDUÇÃO (campo Qtd. com piso físico) e aponta para cá. O gate é
// `podeMexerNaQuantidade` (admin | solicitacao), NUNCA `canProduce`: o operador
// da Gráfica vê a peça, o selo, o motivo e o botão Produzir — e não vê Aumentar.
import {
  AumentarQuantidadeDialog,
  ComplementoDaFicha,
  temBlocoDeComplemento,
  podeAumentarQuantidade,
  podeMexerNaQuantidade,
} from "@/components/aumentar-quantidade-dialog";

// Número de colunas da tabela: NÃO é mais constante. Estava escrito "10" em
// quatro lugares (cabeçalho de grupo, de evento, de tipo e linha de
// observação) e virou `COLS`; agora sai do comprimento da lista `colunas`
// dentro do componente, porque a tabela compacta (notebook com a sidebar
// aberta) funde Material e m² em outras células. Uma fonte só para o colSpan.

// ─────────────────────────────────────────────────────────────────────────────
// COMPLEMENTO — aumento de quantidade DEPOIS que a peça entrou em produção.
//
// A peça original nunca muda: a diferença nasce como peça-filha (#0062-C1),
// com quantidade, ciclo de produção, conferência, entrega e ativos próprios.
// Nesta tela isso precisa gritar — é trabalho NOVO numa fila que o operador já
// tinha dado por fechada, e o número da linha já é exatamente o que falta
// imprimir (a Gráfica não faz conta).
//
// Tokens da família laranja (TOM.laranja = P.orange), nada inventado.
// Regra da casa respeitada: T.accent entra só como faixa/bolinha (fundo), nunca
// como cor de TEXTO; T.accentText aparece como texto sobre tint claro (4.96:1)
// e como fundo sólido com texto branco (5.18:1 — AA em 10px/800).
// ─────────────────────────────────────────────────────────────────────────────
const CO = {
  solidBg: T.accentText, solidText: T.surface,
  // hoverBg é o ÚNICO degrau sem token (orange-100): fica entre o bg e a borda
  // de propósito — é ele que separa "selecionada" de "complemento" na linha.
  bg: TOM.laranja.bg, hoverBg: "#ffedd5", border: TOM.laranja.border,
  text: T.accentText,        // 4.96:1 sobre TOM.laranja.bg — AA
  // O texto do motivo do complemento: mesmo laranja legível da família (era
  // orange-900, um tom fora da paleta; accentText já passa AA no tint).
  textStrong: T.accentText,
  stripe: T.accent,          // SÓ fundo/faixa
  suffix: T.accentText,      // o "-C1" dentro do displayId
  connector: TOM.laranja.border, // conector em L (traço, não texto)
};

/**
 * A AÇÃO NA COR DA ETAPA, por cima do <Botao>. O botão da linha diz a etapa
 * pela cor (Conferir ciano, Embalar/Entregar azul, complemento laranja) — é a
 * regra do dono que a fila inteira segue. O Botao dá forma, foco, hover e
 * spinner; estes dois só trocam a tinta. Os tons são AA com branco (sólido)
 * ou sobre o próprio bg (tintado).
 */
const corDaAcao = (cor: string): React.CSSProperties => ({ backgroundColor: cor, border: `1px solid ${cor}`, color: T.surface });
const corTintada = (tom: { bg: string; border: string; text: string }): React.CSSProperties => ({ backgroundColor: tom.bg, border: `1px solid ${tom.border}`, color: tom.text });

/** displayId da peça-mãe. Usa o enrich do servidor e, se faltar, deriva do id. */
const parentDisplayIdOf = (item: any) =>
  item?.parent?.displayId || splitDisplayId(item?.displayId).base;
/**
 * O destaque FORTE (fundo, faixa, selo sólido e linha de motivo) vale enquanto
 * o complemento não foi entregue. Entre produzir e entregar ainda há
 * conferência e a carga do caminhão, e o complemento é justamente o lote que
 * corre risco de perder a janela logística. Depois de entregue sobra só a
 * identidade permanente ("complemento de #0062") — o alarme some sozinho, sem
 * ninguém precisar confirmar nada.
 */
// Rótulo da ação principal da peça que JÁ está na máquina: diz em qual
// impressora ela está (o nome do dono, de shared/fluxo-peca) e o que falta
// fazer. Peça antiga, que entrou "Em Impressão" antes de existir a escolha,
// não tem máquina — aí o botão só diz a ação, em vez de "máquina não informada".
// Curto de propósito (dono, 21/09: "quantos estão na impressora tem que ser
// mais claro"): a impressora e o progresso saem do botão e vão para a linha de
// status logo acima (ProgressoImpressao); o botão só diz o gesto — "Impressas"
// enquanto falta, "Mandar p/ acabamento" quando todas saíram. A frase inteira
// fica no `title` (tituloAcaoImpressao).
const rotuloAcaoImpressao = (item: any) => rotuloCurtoDaAcao(producedOf(item), tetoDeProducao(item));
const tituloAcaoImpressao = (item: any) =>
  producedOf(item) >= tetoDeProducao(item) && tetoDeProducao(item) > 0
    ? `Todas as ${tetoDeProducao(item)} saíram da ${rotuloDaMaquina(item.printMachine)} — mandar a peça para o acabamento`
    : `Em impressão na ${rotuloDaMaquina(item.printMachine)} — informar quantas já saíram (${progressoDaImpressao(producedOf(item), tetoDeProducao(item))})`;

/**
 * A linha de progresso da peça EM IMPRESSÃO, logo abaixo da pílula de status
 * (onde as outras etapas mostram "há 6d"): impressora + "3 de 10 impressas ·
 * 7 na impressora" + uma barra fina na cor da etapa. Tabela e cartão do
 * celular usam a MESMA (paridade); `duasLinhas` quebra impressora e
 * progresso em linhas separadas para a coluna Status não alargar.
 */
function ProgressoImpressao({ item, fonte, duasLinhas, onIniciarResto }: { item: any; fonte: number; duasLinhas?: boolean; /** "Iniciar o resto": a peça entrou em impressão só com PARTE das unidades (21/09). */ onIniciarResto?: () => void }) {
  // Os números saem de numerosDaImpressao (shared) — a MESMA conta do cartão
  // de Máquinas e do modal. Peça DIVIDIDA: "Impressora 1 · 1 de 3 un. /
  // Impressora 2 · 0 de 2 un." no lugar de uma impressora só.
  const n = numerosDaImpressao(item);
  const resto = n.semImpressora;
  const feitas = n.feitas;
  const teto = n.teto;
  const dividida = n.dividida;
  const maquina = n.onde;
  // A impressora vira LINK para o cartão dela em Máquinas (aba Agora, em foco,
  // com esta peça realçada) — a volta é o "Ver na Gráfica" de lá.
  const alvo = dividida ? null : item.printMachine as string | null;
  return (
    <div data-testid={`progresso-impressao-${item.id}`} style={{ marginTop: 4, maxWidth: duasLinhas ? 190 : undefined, whiteSpace: "normal" }}>
      <div style={{ fontSize: fonte, color: T.accentText, fontWeight: 700, lineHeight: 1.3, fontVariantNumeric: "tabular-nums" }}>
        {maquina && (
          <span style={{ display: duasLinhas ? "block" : "inline" }}>
            <Link href={linkDaImpressoraEmMaquinas(alvo ?? Object.keys(n.partes)[0] ?? "", item.id)} onClick={(e) => e.stopPropagation()} data-testid={`link-ver-na-maquina-${item.id}`} title="Ver esta peça no cartão da impressora, em Máquinas" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2, display: "inline-flex", alignItems: "center", minHeight: fonte >= 12 ? 44 : 24 }}>{maquina}</Link>
            {!duasLinhas && " · "}
          </span>
        )}
        <span style={{ fontWeight: 600 }}>{n.frase}</span>
        {resto > 0 && <span data-testid={`resto-sem-impressora-${item.id}`} style={{ display: "block", fontWeight: 700 }}>{resto} sem impressora</span>}
      </div>
      {resto > 0 && onIniciarResto && (
        <Botao tamanho="sm" icone={Play} onClick={(e) => { e.stopPropagation(); onIniciarResto(); }} data-testid={`button-iniciar-resto-${item.id}`} title={`Iniciar a impressão das ${resto} un. que ainda não estão em nenhuma impressora`}
          style={{ marginTop: 4, minHeight: fonte >= 12 ? 44 : 32, color: T.accentText, borderColor: TOM.laranja.border }}>
          Iniciar o resto
        </Botao>
      )}
      {/* Sem barra com 0 impressas (o trilho vazio parecia um corte); dividida = uma barra por impressora. */}
      {dividida
        ? Object.entries(n.partes).map(([m, x]) => (
          <BarraDeImpressao key={m} feitas={x.impressas} teto={x.atrib} rotulo={`${item.displayId ?? "peça"} na ${rotuloDaMaquina(m)}: ${x.impressas} de ${x.atrib} impressas`} />
        ))
        : <BarraDeImpressao feitas={feitas} teto={teto} rotulo={`${item.displayId ?? "peça"}: ${feitas} de ${teto} impressas`} />}
    </div>
  );
}
/**
 * A TRAVA DA SOLICITAÇÃO na linha e no cartão (21/09): travada, a faixa
 * vermelho-escura "Travada: <motivo> · por Fulano, há 2h" (+ "Destravar" para
 * quem pode); livre, o botão "Travar" (cadeado) só para a Solicitação/admin.
 */
/**
 * O vinho da TRAVA (red-900) — o mesmo selo de Máquinas. Fica hex: é um degrau
 * ABAIXO de TOM.perigo de propósito (a trava não é erro, é parada decidida) e a
 * paleta ainda não tem esse tom. Branco sobre ele: 10,4:1.
 */
const VINHO_DA_TRAVA = "#7f1d1d";

function TravaDaPeca({ item, podeMexer, fonte, alvo, onTravar, onDestravar, destravando }: {
  item: any; podeMexer: boolean; fonte: number; alvo: number;
  onTravar: () => void; onDestravar: () => void; destravando?: boolean;
}) {
  const travada = pecaTravada(item);
  if (!travada && !podeMexer) return null;
  if (!travada) {
    if (isDelivered(item)) return null;
    return (
      <Botao tamanho="sm" icone={Lock} onClick={(e) => { e.stopPropagation(); onTravar(); }} data-testid={`button-travar-${item.id}`} title="Travar a peça: a Gráfica não consegue fazê-la andar até alguém da Solicitação destravar"
        style={{ minHeight: alvo, marginTop: 4, color: TOM.perigo.text, fontSize: Math.max(fonte, FS.meta) }}>
        Travar
      </Botao>
    );
  }
  return (
    <div role="status" data-testid={`selo-travada-${item.id}`} title={fraseDaTrava(item)} style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "4px 8px", borderRadius: R.sm, background: VINHO_DA_TRAVA, color: T.surface, fontSize: fonte, fontWeight: FW.forte, lineHeight: 1.35, whiteSpace: "normal", overflowWrap: "anywhere" }}>
      <Lock aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0 }} />
      <span style={{ flex: "1 1 140px", minWidth: 0 }}>{seloDaTrava(item)}</span>
      {podeMexer && (
        <Botao tamanho="sm" icone={Unlock} carregando={destravando} onClick={(e) => { e.stopPropagation(); onDestravar(); }} data-testid={`button-destravar-${item.id}`}
          style={{ minHeight: alvo, color: TOM.perigo.text, borderColor: TOM.perigo.border, fontSize: Math.max(fonte, FS.meta) }}>
          {destravando ? "Destravando…" : "Destravar"}
        </Botao>
      )}
    </div>
  );
}

/**
 * TIRAR DA IMPRESSORA quando o modal não abre (revisão adversarial, 22/09): a
 * peça TRAVADA ou de EVENTO FINALIZADO em impressão tinha o único "Tirar" dentro
 * do modal — que essas peças não abrem — e prendia a impressora. Recuar nunca
 * é barrado (o servidor também não barra quem SAI): um botão por impressora
 * com parte ativa, com confirmação leve ali mesmo.
 */
function TirarDaImpressoraBloqueada({ item, fonte, alvo, pendente, onTirar }: { item: any; fonte: number; alvo: number; pendente: boolean; onTirar: (maquina: string) => void }) {
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const partes = partesDaPeca(item);
  const maquinas = Object.keys(partesAtivas(partes));
  if (!maquinas.length) return null;
  const estilo: React.CSSProperties = { minHeight: alvo, fontSize: Math.max(fonte, FS.meta) };
  return (
    <span data-testid={`tirar-bloqueada-${item.id}`} style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 6 }} onClick={(e) => e.stopPropagation()}>
      {maquinas.map((m) => {
        const x = partes[m];
        const falta = Math.max(0, x.atrib - x.impressas);
        return confirmando === m ? (
          <span key={m} role="alertdialog" aria-label="Tirar da impressora" data-testid={`confirmar-tirar-bloqueada-${item.id}-${m}`} style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 6, fontSize: fonte, fontWeight: 700, color: TOM.alerta.text }}>
            <span>Tirar da {rotuloDaMaquina(m)}? {x.impressas} de {x.atrib} ficam anotadas; {falta} {falta === 1 ? "volta" : "voltam"} para a fila dela.</span>
            <Botao variante="primario" tamanho="sm" carregando={pendente} onClick={() => { setConfirmando(null); onTirar(m); }} data-testid={`button-confirmar-tirar-bloqueada-${item.id}-${m}`} style={estilo}>{pendente ? "Tirando…" : "Tirar"}</Botao>
            <Botao variante="fantasma" tamanho="sm" onClick={() => setConfirmando(null)} style={estilo}>Cancelar</Botao>
          </span>
        ) : (
          <Botao key={m} tamanho="sm" icone={Undo2} disabled={pendente} onClick={() => setConfirmando(m)} data-testid={`button-tirar-bloqueada-${item.id}-${m}`} title={`Tirar da ${rotuloDaMaquina(m)}: o que já saiu fica anotado e o resto volta para a fila dela — a impressora fica livre`} style={estilo}>
            {maquinas.length > 1 ? `Tirar da ${rotuloDaMaquina(m)}` : "Tirar da impressora"}
          </Botao>
        );
      })}
    </span>
  );
}

/** Os atributos que DESABILITAM um botão de ação da peça travada (com o motivo no title). */
const bloqueioDaTrava = (item: any): Record<string, unknown> =>
  pecaTravada(item) ? { disabled: true, title: fraseDaTrava(item), "data-travada": "true", "aria-disabled": true } : {};
/** O botão desabilitado pela trava fica apagado mesmo com o estilo inline da linha. */
const CSS_DA_TRAVA = "button[data-travada]{opacity:.45!important;cursor:not-allowed!important}";

/**
 * "Fila: Impressora 2" — a peça liberada já tem impressora RESERVADA na aba
 * Máquinas (dono, 21/09: "isso refletir na tela da Gráfica"). Só leitura:
 * a reserva se faz lá; aqui nada muda de status.
 */
function SeloFilaDaImpressora({ item, fonte }: { item: any; fonte: number }) {
  // A frase é a de fraseDaFila (shared): "Fila: Impressora 2", "Fila:
  // Impressora 2 (20) · 14 sem impressora", "Pausada · Fila: …" — a mesma
  // conta das filas dos cartões de Máquinas.
  // Peça JÁ em impressão com parte reservada a uma impressora (revisão
  // adversarial, 22/09): o selo mostra a reserva com o número ("Fila:
  // Impressora 1 (8)") — a linha de progresso só conta o que está NA impressora.
  const frase = fraseDaFila(item, { emImpressao: isInProd(item) });
  if (!frase) return null;
  const maquina = String(item.maquinaPrevista ?? "");
  const dividida = frase.length > 26;
  return (
    <span data-testid="selo-fila-impressora" title={`Reservada na fila da ${maquina ? rotuloDaMaquina(maquina) : "impressora"} (Máquinas) — a etapa não muda até iniciar a impressão`} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: fonte, fontWeight: 700, color: T.apoio, background: N.n2, border: `1px solid ${T.border}`, borderRadius: 6, padding: "1px 6px", whiteSpace: dividida ? "normal" : "nowrap" }}>
      <Printer aria-hidden="true" style={{ width: 11, height: 11, flexShrink: 0 }} />
      {frase}
    </span>
  );
}
// Resumo de tubo que a fila lê (número por id). Constante vazia ESTÁVEL: ver
// o useQuery de /api/tubos.
type TuboResumo = { id: string; numero: number; avulso?: boolean; eventId: string; entregueEm: string | null; fechadoEm?: string | null;
  /** EMBALAGEM COM QUANTIDADE (21/09): o que está em cada volume, e quanto. */
  linhas?: Array<{ itemId: string; quantidade: number; entregue: boolean }> };
const SEM_TUBOS: TuboResumo[] = [];

const complementOpen = (item: any) => isComplement(item) && !isDelivered(item);
/** Espelha o gate do servidor no DELETE /api/items/:id/complement. */
const complementUntouched = (item: any) =>
  producedOf(item) === 0 && reusedOf(item) === 0 && conferredOf(item) === 0 && deliveredOf(item) === 0;

/** "13/08 14:22" — timestamp real (fuso local), diferente da Saída, que é UTC. */
const fmtDataHora = (v?: string | Date | null) => {
  if (!v) return "";
  const d = new Date(v as any);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};

/**
 * Fundo da linha da tabela — UMA função para as três mãos (style inicial,
 * onMouseEnter e onMouseLeave). Antes a cor era decidida em três lugares
 * desalinhados: passar o mouse por cima apagava qualquer realce que não
 * estivesse repetido nos três, e o realce do complemento seria a primeira
 * vítima. Precedência: RECÉM-CRIADO > seleção em lote > complemento em aberto >
 * reaproveitado. A seleção passou de #fff7ed para #ffedd5 justamente para não
 * empatar com o fundo do complemento.
 *
 * `isNovo` é o realce de 5 s da peça que acabou de nascer nesta sessão: ele
 * vem primeiro porque é o único que responde a "cadê o que eu acabei de criar?".
 */
const rowBg = (item: any, isSelected: boolean, hover: boolean, isNovo = false) => {
  if (isNovo) return hover ? CO.border : CO.hoverBg;
  if (isSelected) return hover ? CO.border : CO.hoverBg;
  if (complementOpen(item)) return hover ? CO.hoverBg : CO.bg;
  // Hover do reaproveitado: green-100, o degrau ENTRE o bg e a borda do
  // TOM.sucesso — sem token de propósito (a borda seria forte demais na linha).
  if (item?.isReuse) return hover ? "#dcfce7" : TOM.sucesso.bg;
  // Branco explícito (e não ""): a célula de Ações é `position: sticky` e herda
  // esta cor com `background: inherit`. Fundo transparente deixaria o conteúdo
  // rolando por baixo dela — sticky só existe se a célula for opaca.
  return hover ? T.bg : T.surface;
};

/** Motivo legível da primeira recusa de um lote (allSettled) — ou null. */
const motivoDaPrimeiraFalha = (resultados: PromiseSettledResult<unknown>[]): string | null => {
  const r = resultados.find((x): x is PromiseRejectedResult => x.status === "rejected");
  if (!r) return null;
  const txt = apiErrorMessage(r.reason).trim().replace(/[.\s]+$/, "");
  return txt || null;
};

/** Mensagem legível de um erro da API (apiRequest devolve o corpo cru). */
const apiErrorMessage = (error: any) => {
  const raw = String(error?.message ?? "");
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error) return String(parsed.error);
  } catch { /* não era JSON — usa o texto como veio */ }
  return raw || "Erro inesperado";
};

// Chip de quantidade do card mobile (reaproveitado/produzido/conferido/
// entregue). Tons 700 sobre fundo claro (AA). 12px, não 10: é o card do
// celular, lido de braço esticado no galpão — "PROD. 5" em 10px virava mancha.
const qtyChip = (color: string, bg: string): React.CSSProperties => ({
  fontSize: FS.meta, fontWeight: FW.rotulo, color, backgroundColor: bg,
  border: `1px solid ${color}33`, borderRadius: R.sm, padding: "1px 6px",
  whiteSpace: "nowrap",
});

// Chip de prazo da Produção Gráfica — o mesmo visual sobre o cabeçalho escuro
// do evento, tanto na tabela desktop quanto no card mobile.
function DeadlineChip({ event, fonte = FS.small }: { event: any; /** Celular: 12 (informação ≥ 12px). */ fonte?: number }) {
  if (!event?.truckDepartureDate) return null;
  const days = event.deadlineProducaoGrafica ?? -1;
  // Conta e formata em UTC — a mesma convenção da "Saída" exibida ao lado.
  // Em fuso local o chip podia mostrar um dia a menos que a data do cabeçalho.
  const base = new Date(event.truckDepartureDate);
  const dUTC = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days);
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((dUTC - todayUTC) / 86400000);
  const ds = new Date(dUTC).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  // Tons CLAROS para o cabeçalho ESCURO do evento: a paleta TOM é de texto
  // escuro sobre fundo claro e não serve aqui; estes três hexes ficam.
  const s = diff < 0
    ? { bg: "rgba(255,80,80,0.22)", border: "rgba(255,80,80,0.38)", text: "#ffb3b3" }
    : diff === 0
    ? { bg: "rgba(255,200,80,0.28)", border: "rgba(255,200,80,0.45)", text: "#ffe59c" }
    : diff <= 3
    ? { bg: "rgba(255,160,50,0.22)", border: "rgba(255,160,50,0.38)", text: "#ffc78a" }
    : { bg: "rgba(255,255,255,0.12)", border: "rgba(255,255,255,0.2)", text: "rgba(255,255,255,0.72)" };
  // O sufixo só aparecia entre 0 e 14 dias: com o prazo VENCIDO o chip ficava
  // "Produção Gráfica · 09/08" em vermelho, sem número — exatamente o caso em
  // que a magnitude decide a ordem do galpão. Há diferença operacional enorme
  // entre "venceu ontem" e "venceu há duas semanas".
  const sufixo = diff < 0 ? `atrasado ${Math.abs(diff)}d`
    : diff === 0 ? "hoje"
    : diff <= 14 ? `${diff}d`
    : "";
  return (
    <span
      title={`Marco de Produção Gráfica em ${ds}${sufixo ? ` — ${sufixo}` : ""}`}
      aria-label={`Prazo de produção gráfica: ${ds}${sufixo ? `, ${sufixo}` : ""}`}
      // flexWrap + maxWidth: o selo vivia em `nowrap` e, com a tabela mais
      // larga que a tela (sidebar aberta), saía pela direita cortado ao meio
      // ("Produção Gráfica · 10/09 · atras…"). Agora quebra dentro da pílula.
      style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", maxWidth: "100%", gap: 5, backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: 999, padding: "3px 9px", fontSize: fonte, fontWeight: 700, color: s.text, letterSpacing: "0.04em", alignSelf: "flex-start" }}
    >
      <span style={{ whiteSpace: "nowrap" }}>Produção Gráfica · {ds}</span>{sufixo && <span style={{ whiteSpace: "nowrap", opacity: diff < 0 ? 0.95 : 0.8, fontWeight: diff < 0 ? 700 : 500 }}>· {sufixo}</span>}
    </span>
  );
}

// Seletor de fotos (câmera + galeria) com miniaturas e remoção — unifica as
// três cópias que existiam (modais individuais, entrega e conferência em lote).
// `normKey` (casar type com o catálogo de Modelos) e `itemPercursos` (a
// distância que vive no TEXTO da peça, porque o app não tem campo para ela)
// moram em lib/grafica-filtros.ts, junto com o resto da regra de recorte.

// Renderização incremental: cada evento desenha até ROW_CAP linhas e o resto
// entra sob demanda — o mesmo teto do Painel Geral, da Arte e do Vincular. A
// fila inclui as entregues de todo o histórico; sem o teto, cada entrada na rota
// pintava milhares de linhas concluídas (com miniatura e handlers de hover) em
// máquinas modestas de galpão.
const ROW_CAP = 50;
// …e o teto por evento não bastava: com dezenas de eventos pequenos cada bloco
// cabia inteiro e a soma passava de 4 mil linhas (55 mil elementos DOM medidos
// em produção, aba congelada por 45 s). A fila inteira agora entra no DOM em
// lotes deste tamanho, conforme a rolagem se aproxima do fim do que já está
// desenhado. Contadores, seleção "Todas", exportação e fila do celular seguem
// lendo o recorte INTEIRO — o lote só decide o que vai para a tela.
const LINHAS_POR_LOTE = 60;

function PhotoPicker({ photos, onAdd, onRemove, onError, label = "Fotos", hint, dense = false, onEnviandoMudou }: {
  photos: string[];
  onAdd: (url: string) => void;
  onRemove: (url: string) => void;
  onError: (error: Error) => void;
  label?: string;
  hint?: string;
  dense?: boolean;
  /** Quantos envios estão em andamento (câmera + galeria) — quem confirma espera. */
  onEnviandoMudou?: (emAndamento: number) => void;
}) {
  const [enviando, setEnviando] = useState<Record<string, boolean>>({});
  const emAndamento = Object.values(enviando).filter(Boolean).length;
  useEffect(() => { onEnviandoMudou?.(emAndamento); }, [emAndamento]); // eslint-disable-line react-hooks/exhaustive-deps
  // Saiu da tela no meio do envio: não deixa o "Enviando foto…" preso.
  useEffect(() => () => onEnviandoMudou?.(0), []); // eslint-disable-line react-hooks/exhaustive-deps
  const buttons = [
    { capture: true, Icon: Camera, text: dense ? "Câmera" : "Tirar Foto" },
    { capture: false, Icon: ImagePlus, text: dense ? "Galeria" : "Anexar Fotos" },
  ];
  // Celular: rótulo ≥ 12px (10px maiúsculo não se lê no sol do galpão).
  const noCelular = useIsMobile();
  // Remover foto pergunta antes (o X fica colado na miniatura) — pela caixa
  // do app, não pelo window.confirm do navegador.
  const { confirmar, dialogo } = useConfirmar();
  const pedirRemocao = async (url: string) => {
    const ok = await confirmar({
      titulo: "Remover esta foto?",
      descricao: "Ela sai da lista antes de confirmar; nada foi enviado ainda para a peça.",
      confirmar: "Remover",
      cancelar: "Manter",
      perigo: true,
      icone: Trash2,
    });
    if (ok) onRemove(url);
  };
  return (
    <div>
      {dialogo}
      {/* Rótulo em caixa normal: a caixa-alta de 10px era ruído, não ênfase. */}
      <label style={{ display: "block", fontSize: noCelular ? FS.meta : FS.small, fontWeight: FW.forte, color: T.apoio, marginBottom: 10 }}>
        {label} {hint && <span style={{ color: T.second, fontWeight: FW.corpo }}>{hint}</span>}
        {/* Contador vivo: depois de voltar da câmera, a pessoa precisa saber de
            relance que a foto ENTROU — a miniatura pode estar fora da dobra. */}
        {photos.length > 0 && (
          <span role="status" style={{ marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 3, color: TOM.sucesso.text, fontWeight: FW.rotulo }}>
            <Check aria-hidden="true" style={{ width: 11, height: 11 }} />
            {photos.length} anexada{photos.length !== 1 ? "s" : ""}
          </span>
        )}
      </label>

      <div style={{ display: "flex", gap: 12 }}>
        {buttons.map(({ capture, Icon, text }) => (
          <div key={text} style={{ flex: 1 }}>
            <ObjectUploader
              {...(capture ? { capture: true } : { multiple: true })}
              maxFileSize={10485760}
              buttonVariant="ghost"
              // min-h: durante o envio o ObjectUploader troca o conteúdo por
              // "Enviando x%" (uma linha) e o botão encolhia de ~64 para ~20px
              // — o layout pulava e o Confirmar mudava de lugar sob o dedo.
              buttonClassName="w-full h-full min-h-[64px] p-0 border-0 hover:bg-transparent"
              onComplete={r => onAdd(r.url)}
              onError={onError}
              onEnviandoMudou={(b) => setEnviando(prev => (prev[text] === b ? prev : { ...prev, [text]: b }))}
            >
              <div style={{ width: "100%", minHeight: 64, boxSizing: "border-box", padding: dense ? "12px 0" : "14px 0", backgroundColor: N.n2, borderRadius: R.md, border: `2px dashed ${T.bdark}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: dense ? 5 : 6, cursor: "pointer" }}>
                <Icon aria-hidden="true" style={{ width: dense ? 18 : 20, height: dense ? 18 : 20, color: T.second }} />
                <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.apoio }}>{text}</span>
              </div>
            </ObjectUploader>
          </div>
        ))}
      </div>

      {photos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${dense ? 72 : 84}px, 1fr))`, gap: 8, marginTop: dense ? 10 : 12 }}>
          {photos.map(url => (
            <div key={url} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", border: `1px solid ${T.border}`, backgroundColor: N.n2 }}>
              <img loading="lazy" decoding="async" src={url} alt="Foto anexada" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              {/* Alvo de toque 44×44 (área invisível maior que o X visível) e
                  confirmação antes de remover — o botão de 20px colado na
                  miniatura removia a foto num toque acidental, sem volta. */}
              <button
                type="button"
                onClick={() => { void pedirRemocao(url); }}
                title="Remover foto"
                aria-label="Remover foto"
                style={{ position: "absolute", top: 0, right: 0, width: 44, height: 44, background: "transparent", border: "none", display: "flex", alignItems: "flex-start", justifyContent: "flex-end", padding: 4, cursor: "pointer" }}
              >
                <span style={{ width: 20, height: 20, borderRadius: "50%", backgroundColor: "rgba(28,25,23,0.75)", color: T.surface, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <X style={{ width: 11, height: 11 }} />
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Dialog dos modos em lote — um único componente para conferência e entrega,
// que eram duas cópias de ~150 linhas divergindo aos poucos.
function BulkActionDialog({
  open, onClose, items, photos, onAddPhoto, onRemovePhoto, onPhotoError,
  notes, onNotesChange, isSubmitting, onConfirm, qtyFor,
}: {
  open: boolean;
  onClose: () => void;
  items: any[];
  photos: string[];
  onAddPhoto: (url: string) => void;
  onRemovePhoto: (url: string) => void;
  onPhotoError: (error: Error) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  isSubmitting: boolean;
  onConfirm: () => void;
  qtyFor: (item: any) => number;
}) {
  const isMobileLote = useIsMobile();
  // Só CONFERÊNCIA: a entrega por peça está aposentada (quem entrega é o volume).
  const tint = TOM.ciano.text;
  // A FOTO LIBERA O BOTÃO.
  const canSubmit = photos.length > 0;
  const HeaderIcon = CheckCircle;
  const count = items.length;
  // "Todas (2.000)" e Continuar abria o diálogo com DUAS MIL linhas de uma vez
  // (miniatura, selos, descrição): o toque travava a tela justamente no último
  // passo do lote. A lista entra em lotes dentro da própria caixa rolável; o
  // título, o contador e o registro continuam valendo para TODAS as peças.
  const [pecasDesenhadas, setPecasDesenhadas] = useState(LINHAS_POR_LOTE);
  useEffect(() => { if (open) setPecasDesenhadas(LINHAS_POR_LOTE); }, [open]);
  const pecasNaLista = items.length > pecasDesenhadas ? items.slice(0, pecasDesenhadas) : items;
  // Teclado virtual aberto (observações): o modal encolhe para a área
  // visível e o rodapé com o Confirmar continua à vista (ver area-visivel.ts).
  const superficieRef = useRef<HTMLDivElement>(null);
  useAcompanharAreaVisivel(superficieRef, "centro", open && isMobileLote);
  // Celular: ≥ 12px para informação, 16px nos campos (abaixo disso o iOS dá
  // zoom na página ao focar) e 16px de margem interna (24 roubava largura).
  const fs = (n: number) => (isMobileLote ? Math.max(12, n) : n);
  const pad = isMobileLote ? 16 : 24;
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent ref={superficieRef} className={HIDE_NATIVE_CLOSE} style={modalSurface(460)}>
        <DialogTitle className="sr-only">Confirmar Conferência em Lote</DialogTitle>
        <DialogDescription className="sr-only">Confira várias peças de uma vez, com a mesma foto</DialogDescription>

        <ModalHeader
          icon={HeaderIcon}
          tint={tint}
          title="Conferência em lote"
          subtitle={`${count} peça${count !== 1 ? "s" : ""} selecionada${count !== 1 ? "s" : ""}`}
          onClose={onClose}
        />

        {/* Body — rola dentro do modal (mesmo padrão do modal individual): o
            modalSurface corta com overflow hidden, e no celular com várias
            fotos o botão Confirmar saía da tela sem caminho até ele.

            ALTURA: era `calc(88vh - 96px)` — um desconto FIXO, com 96 chutado
            para o cabeçalho (que mede 93). A conta ficava 93 + 88vh − 96, ou
            seja `88vh − 3`, e isso por acaso cabia no teto de `100vh − 48`
            sempre que a janela passava de 375px de altura: medi 389px em 445 e
            947px em 1080, contra 397 e 1032 disponíveis. Este modal NÃO cortava.
            Mesmo assim o desconto sai: ele acerta por coincidência aritmética e
            quebra ao primeiro subtítulo que quebre em duas linhas. Com o teto no
            DialogContent (via `modalSurface`), `flex: 1 1 auto` + `minHeight: 0`
            entrega a este corpo exatamente o que sobrar do cabeçalho medido. */}
        <div style={{ padding: `20px ${pad}px`, display: "flex", flexDirection: "column", gap: 18, background: T.bg, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
          <PhotoPicker
            dense
            photos={photos}
            onAdd={onAddPhoto}
            onRemove={onRemovePhoto}
            onError={onPhotoError}
            label="Foto da conferência *"
            hint="· mesma para todas as peças"
          />

          {/* Sem escolha de tubo (dono, 21/09): conferir é só conferir com
              foto. O tubo entra depois, no "Embalar" da peça conferida (ou no
              "Embalar em lote"). */}

          {/* Observações */}
          <div>
            <label style={{ display: "block", fontSize: fs(FS.small), fontWeight: FW.forte, color: T.apoio, marginBottom: 8 }}>
              Observações <span style={{ fontWeight: FW.corpo, color: T.second }}>(opcional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => onNotesChange(e.target.value)}
              placeholder="Ex.: conferido contra o romaneio, sem avarias..."
              rows={2}
              style={{ width: "100%", minHeight: 64, boxSizing: "border-box", padding: "12px 14px", background: T.surface, border: `1.5px solid ${T.border}`, borderRadius: 12, fontSize: isMobileLote ? 16 : 13, fontFamily: "inherit", color: T.text, resize: "none", lineHeight: 1.5 }}
            />
          </div>

          {/* Peças selecionadas — com a ARTE e a DESCRIÇÃO de cada uma: é a
              última conferência antes de registrar em lote, e "Banner · 3 un."
              repetido cinco vezes não diz ao operador o que ele está
              confirmando. maxHeight maior porque a linha agora tem miniatura. */}
          <div>
            <label style={{ display: "block", fontSize: fs(FS.small), fontWeight: FW.forte, color: T.apoio, marginBottom: 8 }}>
              Peças selecionadas <span style={{ fontWeight: FW.corpo, color: T.second }}>({count})</span>
            </label>
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, maxHeight: 232, overflowY: "auto" }}>
              {pecasNaLista.map((item: any, idx: number) => (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: idx < count - 1 ? `1px solid ${N.n2}` : "none" }}>
                  <div style={{
                    width: 44, height: 44, flexShrink: 0, borderRadius: 8, overflow: "hidden",
                    border: `1px solid ${T.border}`, backgroundColor: T.bg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {item.approvalThumbUrl ? (
                      <img
                        src={convertGCSUrlToLocalPath(item.approvalThumbUrl)}
                        alt=""
                        loading="lazy" decoding="async"
                        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <Package aria-hidden="true" style={{ width: 16, height: 16, color: T.second }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* flexWrap: código + selo Kit + "Compl. de #0062" não cabiam
                        numa linha em 360px e empurravam a caixa para o lado. */}
                    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", rowGap: 2 }}>
                      <span style={{ fontFamily: FONT.mono, fontSize: fs(11), fontWeight: 700, color: tint, flexShrink: 0 }}>{item.displayId}</span>
                      <SeloKit peca={item} style={{ flexShrink: 0 }} />
                      <AvisoDoEstoqueNaPeca peca={item} style={{ flexShrink: 0 }} />
                      {/* O complemento tem a MESMA arte, o mesmo tipo e quase a
                          mesma descrição da peça original: numa conferência em
                          lote com as duas selecionadas, sem este selo as duas
                          linhas são indistinguíveis — e é aqui que o operador
                          dá o último olhar antes de registrar tudo de uma vez. */}
                      {isComplement(item) && (
                        <span
                          title={item.complementReason ? `Complemento — motivo: ${item.complementReason}` : "Peça complementar (aumento de quantidade)"}
                          data-testid={`badge-complemento-lote-${item.id}`}
                          style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, backgroundColor: CO.solidBg, color: CO.solidText, borderRadius: R.sm, padding: "1px 6px", fontSize: fs(FS.micro), fontWeight: FW.rotulo, whiteSpace: "nowrap" }}
                        >
                          <PlusCircle style={{ width: 9, height: 9 }} />
                          Compl. de {parentDisplayIdOf(item)}
                        </span>
                      )}
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{item.type}</span>
                    </div>
                    {item.description && item.description !== item.type && (
                      <div style={{ fontSize: 12, color: T.second, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.description}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: fs(11), fontWeight: 700, color: T.second, flexShrink: 0 }}>{qtyFor(item)} un.</span>
                </div>
              ))}
              <SentinelaDaLista
                mostradas={pecasNaLista.length}
                total={count}
                lote={LINHAS_POR_LOTE}
                onMais={() => setPecasDesenhadas(n => n + LINHAS_POR_LOTE)}
                compacto
              />
            </div>
          </div>

          {/* Rodapé GRUDADO no fim do corpo rolável: com várias fotos e a lista
              de peças, o Confirmar ficava abaixo da dobra no celular e era
              preciso rolar para achá-lo depois de tirar a foto — o mesmo
              conserto que os modais individuais já tinham (modalActionsStyle). */}
          {/* Recorte seguro em LONGOS (paddingBottom): o atalho `padding` com
              env() some inteiro no parser do jsdom e o teste não o enxergaria. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, position: "sticky", bottom: -20, margin: `0 -${pad}px -20px`, paddingTop: 12, paddingLeft: pad, paddingRight: pad, paddingBottom: "calc(12px + env(safe-area-inset-bottom))", background: T.bg, borderTop: `1px solid ${T.border}` }}>
            {/* Por que o Conferir está apagado — à vista, não num title. */}
            {!canSubmit && !isSubmitting && (
              <p data-testid="motivo-conferir-lote" style={{ margin: 0, fontSize: fs(FS.meta), color: T.apoio }}>Anexe a foto da conferência para liberar o botão.</p>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <Botao tamanho="toque" onClick={onClose} style={{ flex: 1, minHeight: 48 }}>
                Cancelar
              </Botao>
              {/* O rótulo diz o RESULTADO do toque ("Conferir 5 peças"), não
                  um "Confirmar" genérico — é a última leitura antes de gravar. */}
              <Botao
                variante="primario"
                tamanho="toque"
                icone={HeaderIcon}
                carregando={isSubmitting}
                onClick={onConfirm}
                disabled={!canSubmit}
                style={{ flex: 2, minHeight: 48 }}
              >
                {isSubmitting ? `Conferindo ${count} peça${count !== 1 ? "s" : ""}…` : `Conferir ${count} peça${count !== 1 ? "s" : ""}`}
              </Botao>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * ANTES DE PRODUZIR — a janela em que a peça ainda pode voltar.
 *
 * Espelha `STATUS_ANTES_DE_PRODUZIR` em server/routes/items.ts. A partir do
 * momento em que a produção começa existe material físico, `quantityProduced`
 * contado e ativos de inventário criados: devolver para uma fila que assume
 * que nada foi feito exigiria um estorno que não existe.
 */
/**
 * Os status de cada cartão da fila — a MESMA lista conta o número e vira o
 * filtro do clique (casaStatus junta as grafias legadas e os três status da
 * revisão sob a chave canônica).
 */
const FILTRO_DOS_CARTOES: Record<"revisao" | "liberados" | "emProducao" | "produzidos" | "conferidos" | "embalados" | "entregues", string[]> = {
  revisao: ["awaiting_final_review"],
  liberados: ["ready_for_production", "approved"],
  emProducao: ["inProduction"],
  produzidos: ["produced"],
  conferidos: ["conferred"],
  embalados: ["packed"],
  entregues: ["delivered"],
};

/**
 * O tom do CartaoKpi de cada etapa — o MESMO da pílula de status (lib/status)
 * sempre que a paleta TOM o tem. Duas etapas não têm: a Revisão (fúcsia) fica
 * NEUTRA — é trabalho chegando, sem ação da Gráfica — e o Impresso (rosa) vai
 * para o roxo, o vizinho mais próximo. O CartaoKpi não aceita `cores` livres.
 */
const TOM_DA_ETAPA: Record<string, TomDoSelo> = {
  "stat-revisao": "neutro",
  "stat-approved": "turquesa",
  "stat-production": "laranja",
  "stat-produced": "roxo",
  "stat-conferred": "ciano",
  "stat-packed": "info",
  "stat-delivered": "esmeralda",
};

/**
 * Cartão de etapa do CELULAR. Fica local porque o rótulo do CartaoKpi é 10px
 * em caixa-alta e o galpão não lê nada abaixo de 12px, de braço esticado e no
 * sol; em 3 colunas de 360px, 12px em caixa normal é o que cabe inteiro.
 * Ativo = preenchido na cor da etapa + ✓ (não só a cor).
 */
function CartaoDeEtapaCelular({ rotulo, valor, carregando, ativo, onClick, ariaLabel, title, testId, faixa, tinta, colunas }: {
  rotulo: string; valor: React.ReactNode; carregando: boolean; ativo: boolean; onClick: () => void;
  ariaLabel: string; title: string; testId: string; faixa: string; tinta: string; colunas?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      data-testid={testId}
      className="ds-botao"
      style={{
        display: "block", width: "100%", minWidth: 0, minHeight: 44, textAlign: "left", font: "inherit",
        gridColumn: colunas ? `span ${colunas}` : undefined,
        backgroundColor: ativo ? tinta : T.surface,
        border: `1px solid ${ativo ? tinta : T.border}`,
        borderLeft: `4px solid ${faixa}`,
        borderRadius: R.md,
        padding: "7px 8px",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: FS.meta, fontWeight: FW.forte, color: ativo ? T.surface : T.second, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", lineHeight: 1.2 }}>
        {ativo && <Check aria-hidden="true" data-testid={`${testId}-ativo`} style={{ width: 12, height: 12, flexShrink: 0 }} />}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{rotulo}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: FW.rotulo, letterSpacing: "-0.03em", fontFamily: FONT.display, color: ativo ? T.surface : carregando ? T.second : tinta, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{valor}</div>
    </button>
  );
}

const STATUS_ANTES_DE_PRODUZIR = ["ready_for_production", "pronto_para_producao", "approved", "liberado"];
const podeDevolverParaRevisao = (item: any): boolean =>
  STATUS_ANTES_DE_PRODUZIR.includes(item?.status);

/** A mesma régua das outras devoluções do app (`lerMotivoDevolucao`). */
const MOTIVO_MIN_DEVOLUCAO = 10;

export default function Grafica() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  // DOIS gates, porque o servidor tem dois — e por muito tempo um só fazia o
  // papel dos dois aqui.
  //
  // PRODUZIR é de quem tem a impressora: grafica|admin, espelho de
  // `start-production`. Ampliar este gate faria a Solicitação ver um convite
  // que o servidor recusa com 403 depois do clique.
  const canProduce = ["grafica", "admin"].includes(user?.role ?? "");
  // CONFERIR e ENTREGAR são as duas etapas finais, e agora têm os mesmos
  // donos: grafica|solicitacao|admin. A conferência estava presa em
  // `canProduce` só porque as duas nasceram juntas — e o efeito era a
  // Solicitação ver a peça do acervo parada sem nenhum caminho adiante,
  // porque a entrega sai do conferido.
  const podeConferir = ["grafica", "solicitacao", "admin"].includes(user?.role ?? "");
  // KIT (dono, 15/09): a Solicitação da Arena VÊ a peça do Kit na Gráfica, mas
  // só como visualizadora — conferir e entregar a peça do Kit não é dela (o
  // servidor também barra). O usuário do Kit só recebe as peças dele.
  const soVisualizaKit = (item: any) => user?.role === "solicitacao" && !user?.kit && !!item?.kitRemessaId;
  const canConfer = (item: any) => !soVisualizaKit(item) && canConferBase(item);
  // ENTREGA POR PEÇA APOSENTADA (dono, 21/09: "todas são embaladas"): o
  // caminho é Conferido → Embalado → Entregue, e quem entrega é o VOLUME
  // ("Entregar tubo" / aba Tubos). A tela não tem mais "Entregar" por peça.
  // EMBALAR (dono, 21/09): a ÚNICA ação da peça CONFERIDA — "todas são
  // embaladas", não existe entrega antes de embalar. Mesmos papéis das rotas
  // de tubos, e sem exigir evento aberto: conferir/embalar/entregar passam no
  // finalizado.
  // Com QUANTIDADE: embala quem tem unidade conferida ainda não embalada — a
  // conferida inteira, a PARCIAL (7 de 10 conferidas) e a que já foi em parte.
  // O STATUS manda (revisão adversarial, 21/09): aEmbalar() já devolve 0 para
  // cancelada, arquivada, em aprovação ou em revisão (statusEmbalavel, em
  // shared/embalagem.ts) — nem o reaproveitamento antigo embala antes da produção.
  const podeEmbalar = (item: any) =>
    !EM_REVISAO.has(item.status) && !soVisualizaKit(item) && !isDelivered(item) && !isPacked(item) && !!item.eventId && aEmbalar(item) > 0;
  // CONFERIR E EMBALAR: só quando esta conferência zera o que falta conferir e
  // a peça poderá ser embalada logo depois (status embalável, ou a conferência
  // fecha a peça inteira) — senão a embalagem seria recusada.
  const oferecerEmbalarJunto = (item: any, qtd: number) =>
    CONFERIR_E_EMBALAR && !!item?.eventId && !soVisualizaKit(item) && qtd > 0
    && qtd >= remainingConfer(item)
    && (statusEmbalavel(item.status) || conferredOf(item) + qtd >= qtyOf(item));
  // "Embalar" quando é tudo; "Embalar 3" quando é só o que falta (ou a parte conferida).
  const rotuloEmbalar = (item: any) => (aEmbalar(item) < qtyOf(item) ? `Embalar ${aEmbalar(item)}` : "Embalar");
  // Abre o painel de tubos do evento da peça já com ela marcada para embalar.
  // `lote`: veio do "Embalar em lote" — o painel não entra no atalho de peça sozinha.
  const abrirEmbalar = (itensPedidos: any[], lote = false) => {
    // Travada não embala: sai do lote, com aviso (o servidor também barra).
    const travadas = itensPedidos.filter((i) => pecaTravada(i));
    if (travadas.length) toast({ title: travadas.length === 1 ? `${travadas[0].displayId ?? "Peça"} está travada` : `${travadas.length} peças travadas ficaram de fora`, description: fraseDaTrava(travadas[0]), variant: "warning" });
    const itens = itensPedidos.filter((i) => !pecaTravada(i));
    const primeira = itens[0];
    if (!primeira) return;
    setTubosDoEvento({ id: String(primeira.eventId), name: primeira.event?.name ?? "Evento", embalar: itens.map((i) => i.id), ...(lote ? { lote: true } : {}) });
  };
  // MEXER NA QUANTIDADE (criar complemento e cancelar complemento) é outro
  // papel: admin | solicitacao, espelho de `podeMudarQuantidade` no servidor.
  // `canProduce` (grafica|admin) NÃO participa deste gate em ponto nenhum — a
  // Gráfica produz o que pedem, não muda o pedido.
  const podeMexerQtd = podeMexerNaQuantidade(user?.role);
  // TETO do Reaproveitar: no fluxo normal, o que resta sem produzir nem
  // reaproveitar; após Produzido (dono, 27/08 — só admin|solicitacao, espelho
  // do mark-reuse no servidor) a ação CONVERTE produzidas em reaproveitadas,
  // então o teto é o que ainda não está marcado como reuso.
  const tetoReaproveitar = (item: any) =>
    isProduced(item) ? Math.max(0, qtyOf(item) - reusedTotalOf(item)) : remainingReuse(item);
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalType, setModalType] = useState<"production" | "conference" | null>(null);
  const [viewDetailsItem, setViewDetailsItem] = useState<any>(null);
  // ── RECORTE (os doze filtros) ─────────────────────────────────────────────
  // UM objeto, inicializado da URL: F5 não perde o trabalho de filtrar e dá
  // para mandar no WhatsApp o link de "peças do evento de sábado que faltam
  // entregar". Mesmo padrão de outras nove telas do app.
  //
  // Dentro dele: busca, status, evento, GRUPO ("Placa km") e PERCURSO (5k, 10k)
  // — pedido da Gráfica, o único jeito de montar o lote certo com dezenas de
  // placas quase idênticas na fila —, tipo, material, acabamento, mês,
  // próximos 10 dias, o chip de complementos e o "mostrar entregues".
  //
  // O chip de complementos recorta a fila para os aumentos pedidos depois que a
  // peça já estava em produção. Os complementos NÃO são pinados no topo da lista
  // (arrancá-los do bloco do evento duplicaria cabeçalhos, e a Gráfica trabalha
  // POR EVENTO com o caminhão marcado) — o acesso rápido vem deste filtro.
  const [filtros, setFiltros] = useState<GraficaFiltros>(() => filtrosDaURL(window.location.search));
  const patchFiltros = (p: Partial<GraficaFiltros>) => setFiltros(f => ({ ...f, ...p }));
  // Busca com debounce: o input responde a cada tecla, o RECORTE só 200ms
  // depois. Sem isto, cada tecla refiltrava, reordenava e reagrupava a base
  // inteira — que inclui todo o histórico de entregues — e recalculava as seis
  // listas de faceta.
  const [buscaInput, setBuscaInput] = useState(() => filtrosDaURL(window.location.search).busca);
  // Grupos por evento já expandidos além do ROW_CAP.
  const [gruposExpandidos, setGruposExpandidos] = useState<Set<string>>(new Set());
  // Confirmação em dois toques do "cancelar complemento" — mesmo idioma dos
  // botões de reaproveitamento desta tela, e nunca destrutivo num clique só.
  const [cancelComplementId, setCancelComplementId] = useState<string | null>(null);
  // ── Aumentar quantidade (o gatilho mora nesta tela) ──
  // complementoItem: a peça-MÃE em foco no modal.
  // novoComplementoId: a peça-filha recém-criada — realce de 5 s + rolagem.
  // bannerComplemento: rede de segurança para quando a filha nasce FORA do
  //   recorte de filtros do operador (a rolagem falharia em silêncio).
  const [complementoItem, setComplementoItem] = useState<any>(null);
  const [novoComplementoId, setNovoComplementoId] = useState<string | null>(null);
  const [bannerComplemento, setBannerComplemento] = useState<{ id: string; displayId: string } | null>(null);
  const abrirComplemento = (item: any) => setComplementoItem(item);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  // A folha de filtros do CELULAR (ver a barra de filtros no JSX).
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  // Último "quem recebeu" registrado NESTA sessão (entrega do volume). Só
  // memória da tela: vira atalho de um toque no campo da aba/painel de tubos.
  const [ultimoRecebedor, setUltimoRecebedor] = useState("");
  const [conferQty, setConferQty] = useState(0);   // conferência parcial
  // CONFERIR E EMBALAR (decisão CONFERIR_E_EMBALAR): a conferência que zera o
  // que falta conferir oferece, já marcado, embalar em volume avulso com a
  // MESMA foto. `conferindoEEmbalando` cobre a segunda ida ao servidor.
  const [jaEmbalar, setJaEmbalar] = useState(CONFERIR_E_EMBALAR);
  const [conferindoEEmbalando, setConferindoEEmbalando] = useState(false);
  // Envios de foto em andamento no modal (vindo do uploader): enquanto sobe,
  // o Conferir espera — senão a conferência sai sem a foto que está chegando.
  const [fotosSubindo, setFotosSubindo] = useState(0);
  // Cada abertura do modal ganha uma CHAVE: a foto que termina de subir depois
  // de o modal fechar ou mudar de peça é descartada (não vai parar na próxima).
  const [aberturaDoModal, setAberturaDoModal] = useState(0);
  const chaveDoModalRef = useRef("");
  // Fotos anexadas no modal de conferência. Várias por vez.
  const [photos, setPhotos] = useState<string[]>([]);
  // A URL assinada do GCS perde o token ao ser gravada; o app serve os arquivos
  // por /objects/... — sem converter, a foto salva não abre depois.
  const addPhoto = (url: string) => setPhotos(prev => [...prev, convertGCSUrlToLocalPath(url)]);
  const removePhoto = (url: string) => setPhotos(prev => prev.filter(p => p !== url));
  const [modalNotes, setModalNotes] = useState("");
  const [reuseConfirmItemId, setReuseConfirmItemId] = useState<string | null>(null);
  // Menu "⋯" das ações SECUNDÁRIAS da linha na tabela compacta (ver a célula
  // de Ações): qual linha está com ele aberto.
  const [menuAcoesId, setMenuAcoesId] = useState<string | null>(null);
  // Abre para CIMA quando falta espaço embaixo na janela (últimas linhas).
  const [menuParaCima, setMenuParaCima] = useState(false);
  const [reuseQty, setReuseQty] = useState(0); // reaproveitamento parcial
  const [correctReuseItemId, setCorrectReuseItemId] = useState<string | null>(null);
  const [correctReuseQty, setCorrectReuseQty] = useState(0); // quantidade corrigida
  // Seleção dos modos de lote (conferir / embalar)
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  // ── Conferência em lote ──
  const [bulkConferMode, setBulkConferMode] = useState(false);
  // EMBALAR EM LOTE (dono, 21/09): marcar várias conferidas e mandar todas
  // para um tubo de uma vez. Sem foto e sem dialog próprio — o "Continuar"
  // abre o painel de tubos do evento já com as peças marcadas.
  const [bulkPackMode, setBulkPackMode] = useState(false);
  const [bulkConferOpen, setBulkConferOpen] = useState(false);
  const [bulkConferNotes, setBulkConferNotes] = useState("");
  const [bulkConferPhotos, setBulkConferPhotos] = useState<string[]>([]);
  const addBulkConferPhoto = (url: string) => setBulkConferPhotos(prev => [...prev, convertGCSUrlToLocalPath(url)]);
  const isMobile = useIsMobile();
  // Tablet do galpão: o ponteiro é o dedo em qualquer largura — os alvos do
  // topo e dos chips sobem para 44px por isto, não pela largura da janela.
  const ponteiroGrosso = usePonteiroGrosso();
  /** Botão de ação dentro da LINHA da tabela: 32px no mouse, 44 no dedo. */
  const tamLinha = ponteiroGrosso ? ("toque" as const) : ("sm" as const);
  // A pergunta de confirmação é do app, não do navegador (ver useConfirmar).
  const { confirmar, dialogo: dialogoDeConfirmacao } = useConfirmar();
  /** Celular: nenhuma informação abaixo de 12px (o galpão lê no sol, de braço esticado). */
  const fsMin = (n: number) => (isMobile ? Math.max(12, n) : n);
  /**
   * Alvo de 44px num botão que mora NO MEIO DE UMA FRASE (resumo da lista):
   * a altura vira área de toque e a margem negativa devolve a linha de texto
   * ao tamanho normal — o parágrafo não engorda, o dedo acerta.
   */
  const alvoNoTexto: React.CSSProperties = isMobile
    ? { display: "inline-flex", alignItems: "center", minHeight: 44, margin: "-14px 0", verticalAlign: "middle" }
    : {};
  // Folha de filtros do celular: acompanha o teclado virtual (area-visivel.ts).
  const folhaFiltrosRef = useRef<HTMLDivElement>(null);
  useAcompanharAreaVisivel(folhaFiltrosRef, "tela-cheia", isMobile && filtrosAbertos);
  // DENSIDADE PELA LARGURA DO CONTEÚDO, não da janela (mesma régua do Painel
  // Geral). O tablet do galpão em pé (768–1024px) com a sidebar aberta deixa
  // 500–700px de conteúdo — e `isMobile` respondia "desktop": caía na tabela
  // de dez colunas com rolagem lateral, o pior formato possível para quem
  // trabalha com a peça na mão. Abaixo de 820px de conteúdo a fila vira cards;
  // entre 820 e 1180 a tabela funde colunas secundárias. O padding de 24px de
  // cada lado sai da conta porque a medida é da caixa da raiz.
  const { ref: raizRef, width: larguraRaiz } = useElementSize<HTMLDivElement>();
  const larguraConteudo = larguraRaiz - (isMobile ? 24 : 48);
  // ── A TABELA QUE NÃO CABE (dono, 17/09: "cortando quando o menu está aberto,
  // cortando o status") ──────────────────────────────────────────────────────
  // Os limites 820/1180 são um CHUTE sobre a largura mínima da tabela — e ela
  // depende do conteúdo: descrição longa, selos, quantos botões a linha tem.
  // Com a barra lateral aberta (~1.380px úteis) a tabela cheia passava da
  // caixa: a coluna de Ações (sticky à direita) cobria o Status ("PR", "há 1")
  // e o botão principal saía pela borda. Agora a tabela se MEDE depois de
  // desenhada: se rolou para o lado, esta largura de conteúdo fica marcada
  // como "não cabe" para aquela densidade e a tela desce um degrau (cheia →
  // compacta → cartões). Marca a LARGURA, não um booleano: alargar a janela
  // além dela tenta de novo o degrau de cima (e, se estourar, remarca).
  const [estouroEm, setEstouroEm] = useState<{ full: number; compact: number }>({ full: 0, compact: 0 });
  const densidadeBase = larguraRaiz === 0 ? (isMobile ? "cards" : "full") : densityFromWidth(larguraConteudo);
  const densidade = larguraRaiz === 0 ? densidadeBase
    : densidadeBase === "full" && larguraConteudo <= estouroEm.full
      ? (larguraConteudo <= estouroEm.compact ? "cards" : "compact")
    : densidadeBase === "compact" && larguraConteudo <= estouroEm.compact ? "cards"
    : densidadeBase;
  const usaCards = isMobile || densidade === "cards";
  const compacto = !usaCards && densidade === "compact";
  /** A caixa de rolagem lateral da tabela — é nela que se mede o estouro. */
  const tabelaRolagemRef = useRef<HTMLDivElement>(null);
  // Colunas da tabela. Eram dez, com REAPROV. e PROD como colunas próprias
  // quase sempre "—": viraram linhas pequenas DENTRO da célula de Qtd, onde a
  // pergunta "quanto desta peça já andou?" nasce. Na densidade compacta,
  // Material desce para baixo da descrição e o m² para baixo das medidas — a
  // informação fica, a rolagem lateral some. `direita` = coluna numérica.
  const colunas: { rotulo: string; direita?: boolean }[] = [
    { rotulo: "ID" },
    { rotulo: "Peça" },
    { rotulo: "Qtd", direita: true },
    { rotulo: "Medidas (ARQ / VIS)" },
    ...(compacto ? [] : [{ rotulo: "m² a produzir", direita: true }, { rotulo: "Material" }]),
    { rotulo: "Status" },
    { rotulo: "" },
  ];
  const nColunas = colunas.length;
  /** m² a produzir de uma linha — a coluna cheia e a versão compacta leem daqui. */
  const m2DaLinha = (item: any): React.ReactNode => {
    const total = Number(item.calculatedM2) || 0;
    if (!total) return "—";
    const toPrint = m2ToProduce(item);
    if (reusedTotalOf(item) === 0) return total.toFixed(2);
    return (
      <span title={`Total da peça: ${total.toFixed(2)} m² · reaproveitado não é impresso`}>
        <span style={{ color: toPrint === 0 ? TOM.esmeralda.text : T.text }}>{toPrint.toFixed(2)}</span>
        <span style={{ display: "block", fontSize: FS.small, fontWeight: FW.corpo, color: T.second, textDecoration: "line-through" }}>
          {total.toFixed(2)}
        </span>
      </span>
    );
  };

  /**
   * MODO GALPÃO (celular): conferir em fila, uma peça por vez (a entrega é do
   * volume, na aba Tubos — não há mais fila de entrega por peça).
   *
   * As mutações daqui não passam pelas useMutation dos modais de propósito:
   * o onSuccess delas fecha modal, zera fotos e dispara um toast por peça —
   * efeitos do fluxo de bancada. Na fila, o avanço é do componente e o resumo
   * é um só, na saída.
   */
  const [galpao, setGalpao] = useState<null | "confer">(null);
  const registrarNoGalpao = async (item: any, dados: GalpaoDados) => {
    await apiRequest("POST", `/api/items/${item.id}/confer`, {
      conferencePhotoUrl: dados.photoUrl, qty: dados.qty, notes: "",
    });
    // Invalidação POR PEÇA, não só na saída: esta é a tela em que duas pessoas
    // trabalham a mesma fila ao mesmo tempo — o computador da bancada precisa
    // ver a peça sumir enquanto o conferente anda com o celular.
    invalidarGraficaEMaquinas();
  };
  const fecharGalpao = (feitas: number) => {
    setGalpao(null);
    if (feitas > 0) {
      toast({
        title: "Conferência feita",
        description: `${feitas} peça${feitas !== 1 ? "s" : ""} conferida${feitas !== 1 ? "s" : ""} pela fila. Agora é embalar. As etiquetas já podem ser impressas — atalho no cabeçalho do evento.`,
      });
    }
  };
  const { data: pecasDoServidor = [], isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery<any[]>({
    queryKey: ["/api/items/approved"],
    // Override LOCAL do default global (staleTime: Infinity, sem refetch em
    // foco). Esta é a única tela do app em que DUAS PESSOAS trabalham a mesma
    // fila ao mesmo tempo — o operador no computador ao lado da impressora e o
    // conferente com o celular ao lado do material — e a aba fica aberta o dia
    // inteiro. O WebSocket agora invalida esta chave em conferência,
    // reaproveitamento e entrega (ver use-websocket.ts); este polling é a rede
    // de segurança para o socket morrer em silêncio.
    staleTime: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 300_000, // 5min (auditoria 27/08): o WebSocket cobre o tempo real; isto é só a rede de segurança de socket morto
  });
  // ── Evento FINALIZADO CONTINUA NA FILA ────────────────────────────────────
  // Regra do dono (17/08): "os eventos finalizados devem aparecer ainda na
  // Revisão e Gráfica". Esta tela filtrava as peças de evento encerrado à mão
  // ou já realizado; não filtra mais.
  //
  // POR QUE AQUI VOLTA E EM ARTE/ATENDIMENTO/VINCULAR CONTINUA ESCONDIDO — é a
  // pergunta óbvia de quem olhar as cinco filas. A guarda do servidor
  // (server/routes/eventoFinalizado.ts) barra o que faz o trabalho ANDAR e
  // permite o que ARRUMA A CASA; das ações que ela permite, CONFERIR e
  // REGISTRAR ENTREGA são desta tela. E não são caso raro: a papelada da
  // entrega chega no dia seguinte ao evento, exatamente quando ele vira
  // "realizado". Esconder a peça tornava impossível executar o que o servidor
  // autoriza — o material saiu, o canhoto chegou, e não havia linha onde
  // clicar. Nas outras três filas nada de permitido sobrou, então lá esconder
  // continua certo: a peça visível só ofereceria 409.
  //
  // A contrapartida está logo abaixo e é obrigatória: `seloDoItem` declara a
  // peça na linha e no card, e os botões barrados (produzir, reaproveitar,
  // corrigir reaproveitamento, aumentar quantidade) vêm DESABILITADOS com o
  // motivo no `title`. Peça de evento morto sem sinal, com botão que só
  // devolve 409, seria pior do que escondê-la.
  //
  // `item.event` vem CRU do storage (nunca passa por enrichEvent): traz
  // `status` ("closed") e `startDate` — as duas colunas que o predicado lê.
  const hojeBusinessMs = todayBusinessMs();
  const items = pecasDoServidor as any[];
  // Um selo por peça, calculado uma vez. `null` = evento em jogo, linha normal.
  const selosPorItem = useMemo(() => {
    const m = new Map<string, SeloPecaEventoFinalizado>();
    for (const i of items) {
      const s = seloPecaEventoFinalizado(i.event, hojeBusinessMs);
      if (s) m.set(i.id, s);
    }
    return m;
  }, [items, hojeBusinessMs]);
  const seloDoItem = (item: any): SeloPecaEventoFinalizado | null => selosPorItem.get(item.id) ?? null;
  // INFORMAR IMPRESSAS no evento realizado (decisão IMPRESSAS_EM_EVENTO_REALIZADO):
  // a peça que já estava na impressora segue podendo dizer o que saiu — o selo
  // só barra o botão de impressão quando o servidor também barraria.
  const seloDaImpressao = (item: any, selo: SeloPecaEventoFinalizado | null): SeloPecaEventoFinalizado | null =>
    selo && eventoBarraImpressas(selo.motivo, item?.status) ? selo : null;

  // Sem botão "Atualizar" (regra do dono): a tela se atualiza sozinha. O selo
  // "Atualizado há X" é a promessa de veracidade e o spinner ao lado é o único
  // sinal de recarga em curso. O "Tentar novamente" do estado de ERRO fica: lá
  // a recarga automática falhou e o clique é recuperação, não rotina.
  //
  // Tick de 1 min: "há 12 min" calculado no render congelaria no primeiro paint.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Debounce da busca (200ms) — ver o comentário do estado `buscaInput`.
  // Busca igual à do recorte devolve o MESMO objeto: um objeto novo com o mesmo
  // conteúdo (o disparo da montagem, por exemplo) refazia a filtragem, as oito
  // facetas e os contadores sobre a base inteira sem mudar nada na tela.
  useEffect(() => {
    const t = setTimeout(() => setFiltros(f => (f.busca === buscaInput ? f : { ...f, busca: buscaInput })), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaInput]);

  // URL espelhando o recorte (replaceState: não polui o histórico). Com o mesmo
  // debounce de 200ms da busca, para digitar não escrever uma entrada por tecla.
  // `filtrosParaQuery` parte da query ATUAL e sobrescreve só as chaves
  // gerenciadas — o `?item=` do deep link do sino sobrevive até o efeito dele
  // limpá-lo, e qualquer param alheio também.
  useEffect(() => {
    const t = setTimeout(() => {
      const qs = filtrosParaQuery(window.location.search, filtros);
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    }, 200);
    return () => clearTimeout(t);
  }, [filtros]);

  // Voltar/avançar do navegador: reidrata o recorte a partir da URL. Sem isto o
  // back trocava a URL e a tela continuava com os filtros novos.
  useEffect(() => {
    const onPop = () => {
      const f = filtrosDaURL(window.location.search);
      setFiltros(f);
      setBuscaInput(f.busca);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // Enquanto o `npm run db:push` das colunas de complemento não roda, o SELECT
  // do Drizzle pede colunas que não existem e a leitura inteira falha (não só
  // o recurso). Sem esta detecção a tela diria "verifique sua conexão" e o
  // operador ligaria para o suporte errado.
  const migracaoPendente = /parent_item_id|complement_|migra[çc][ãa]o pendente|42703/i
    .test(String((error as any)?.message ?? ""));
  // Histórico DA PEÇA aberta, com escopo no servidor. A listagem global tem
  // teto de 500 registros — peça antiga caía fora da janela e a ficha
  // mostrava "sem histórico" (bug reportado pelo dono).
  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs", "item", viewDetailsItem?.id],
    queryFn: () =>
      fetch(`/api/audit-logs?entityType=item&entityId=${viewDetailsItem!.id}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`Falha ao carregar o histórico (HTTP ${r.status})`))),
    select: d => (Array.isArray(d) ? d : []),
    enabled: !!viewDetailsItem?.id,
    placeholderData: [],
  });
  const { data: standardItems = [] } = useQuery<any[]>({ queryKey: ['/api/standard-items'] });
  const typeToGroup = useMemo(() => {
    const map: Record<string, string> = {};
    (standardItems as any[]).forEach((s: any) => { if (s.group) map[s.name] = s.group; });
    return map;
  }, [standardItems]);

  // Resolve o GRUPO da peça (catálogo de Modelos) tolerando maiúscula, acento
  // e espaço — mesma regra da Arte: o type casa com o NOME de um modelo
  // (name → group) ou direto com um NOME DE GRUPO, para itens vindos da
  // planilha caírem no grupo certo. É o que a Gráfica usa para separar, por
  // exemplo, as placas de 5km das de 10km.
  const groupMaps = useMemo(() => {
    const byName: Record<string, string> = {};
    const byGroup: Record<string, string> = {};
    (standardItems as any[]).forEach((s: any) => {
      if (s.group) {
        byName[normKey(s.name)] = s.group;
        byGroup[normKey(s.group)] = s.group;
      }
    });
    return { byName, byGroup };
  }, [standardItems]);
  // Memoizado com as deps reais: `groupOf` entra no ctx de TODA avaliação de
  // filtro (a lista, o pool dos KPIs e as seis facetas). Como identidade nova a
  // cada render, ele invalidava todos os useMemo derivados de uma vez.
  const groupOf = useMemo(() => {
    const cache = new Map<string, string>();
    return (type: string): string => {
      const achado = cache.get(type);
      if (achado !== undefined) return achado;
      const k = normKey(type);
      // normalize("NFD") + duas regex por chamada, várias vezes por render e
      // sobre a base inteira: o cache por `type` (dezenas de valores distintos,
      // não milhares) tira a conta do caminho quente da digitação.
      const g = groupMaps.byName[k] || groupMaps.byGroup[k] || "";
      cache.set(type, g);
      return g;
    };
  }, [groupMaps]);

  // Âncora temporal dos filtros de data, em UTC (o mesmo fuso da Saída exibida).
  // Presa ao tick de 1 min para a virada de meia-noite não exigir F5.
  // A dependência é o DIA (número), não o tick: com `agora` nas deps o contexto
  // mudava a cada minuto e toda a filtragem, as facetas e os contadores eram
  // refeitos sobre a base inteira uma vez por minuto, sem nada ter mudado.
  const hojeUTC = hojeEmUTC(new Date(agora));
  const ctxFiltros = useMemo(() => ({ groupOf, hojeUTC }), [groupOf, hojeUTC]);

  // O modal de impressão é compartilhado com a aba Máquinas (components/
  // grafica/modal-impressao.tsx): as duas mutations, os toasts e o formulário
  // moram lá. Aqui só se diz o que fazer ao gravar — fechar o modal.
  const mutacoesDeImpressao = useMutacoesDeImpressao({ onSucesso: () => { setSelectedItem(null); setModalType(null); } });
  // "Tirar da impressora" da peça que o modal não abre (travada / evento
  // finalizado): o MESMO gesto (POST /pausar) do modal e do cartão de Máquinas.
  const tirarBloqueada = (item: any, maquina: string) => {
    const x = partesDaPeca(item)[maquina];
    mutacoesDeImpressao.mexerNaImpressoraMutation.mutate({ maquina, sai: { id: item.id, displayId: item.displayId ?? null, impressas: x?.impressas ?? 0, teto: x?.atrib ?? 0 } });
  };
  const podeTirarBloqueada = (item: any, selo: unknown) => canProduce && isInProd(item) && (pecaTravada(item) || !!selo);

  // DEVOLVER PARA A REVISÃO.
  //
  // O operador abre o arquivo na hora de imprimir e vê que está errado. Até
  // aqui ele tinha duas saídas ruins: imprimir mesmo assim, ou deixar a peça
  // parada na fila — onde ela continuava contando como "Pronto para Produção"
  // para o resto do app, inclusive para a Gestão de Prazos, que a cobrava da
  // Gráfica sem que ninguém soubesse que ela estava travada.
  const [devolverItem, setDevolverItem] = useState<any>(null);
  const [devolverMotivo, setDevolverMotivo] = useState("");
  const devolverMutation = useMutation({
    mutationFn: async ({ itemId, notes }: { itemId: string; notes: string }) =>
      await apiRequest("PATCH", `/api/items/${itemId}/return-to-review`, { notes }),
    onSuccess: () => {
      invalidarGraficaEMaquinas();
      setDevolverItem(null);
      setDevolverMotivo("");
      toast({ title: "Devolvida para a Revisão Final", description: "A peça saiu da fila da Gráfica e o motivo foi registrado." });
    },
    // Recusa típica: a peça já entrou em produção por outra pessoa. A fila
    // recarrega para o botão Devolver sumir de onde ele não vale mais.
    onError: (error: Error) => {
      invalidarGraficaEMaquinas();
      toast({ title: "Não foi possível devolver", description: apiErrorMessage(error), variant: "destructive" });
    },
  });

  // TUBOS (dono, 14/09): cada evento abre o painel de tubos para agrupar e
  // entregar por tubo. Desde 21/09 ("o tubo só na hora de embalar; tire da
  // conferência") a escolha de tubo NÃO mora mais na conferência — nem na
  // individual, nem no lote: conferir é só conferir com foto. O tubo entra
  // pelo "Embalar" da peça conferida (`embalar`: o painel abre já com a peça
  // marcada, focado em escolher o tubo) e pelo "Entregar tubo" da embalada
  // (`entregarTubo`: abre no formulário daquele tubo).
  // A ABA DA TELA — "fila" (padrão) ou "tubos", em `?aba=`. replaceState: trocar
  // de aba não empilha histórico nem mexe nos outros parâmetros (os filtros).
  const [abaDaTela, setAbaDaTela] = useState<"fila" | "tubos">(() => (new URLSearchParams(window.location.search).get("aba") === "tubos" ? "tubos" : "fila"));
  const irParaAba = (aba: "fila" | "tubos") => {
    const u = new URL(window.location.href);
    if (aba === "fila") u.searchParams.delete("aba"); else u.searchParams.set("aba", aba);
    window.history.replaceState(null, "", u.pathname + u.search);
    setAbaDaTela(aba);
  };
  const [tubosDoEvento, setTubosDoEvento] = useState<{ id: string; name: string; embalar?: string[]; lote?: boolean; entregarTubo?: string; verTubo?: string } | null>(null);
  // Sem `= []` no destructuring: o array novo a cada render mudaria o
  // `numeroDoTubo` (e as deps de TODAS as linhas memoizadas) a cada render.
  const { data: todosOsTubos = SEM_TUBOS } = useQuery<TuboResumo[]>({
    queryKey: ["/api/tubos"],
    refetchInterval: 60_000,
  });
  // O número da aba: tubos de verdade, abertos, com alguma coisa dentro.
  const tubosAbertosNaTela = useMemo(() => todosOsTubos.filter((t) => !t.avulso && !t.entregueEm && (t.linhas ?? []).some((l) => !l.entregue)).length, [todosOsTubos]);
  const numeroDoTubo = useMemo(() => new Map(todosOsTubos.map((t) => [t.id, t.numero])), [todosOsTubos]);
  // Quando o tubo foi FECHADO (foto tirada) — "fechado 14:32" na peça embalada
  // (dono, 21/09). Só hora: a fila é do dia, e a data já está no cabeçalho.
  const fechamentoDoTubo = useMemo(() => new Map(
    todosOsTubos.filter((t) => t.fechadoEm).map((t) => [t.id, new Date(t.fechadoEm as string).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })]),
  ), [todosOsTubos]);
  // O QUE ESTÁ EM CADA TUBO (dono, 21/09: "tem que sinalizar quais itens estão
  // no tubo"): o selo diz "Tubo 1 · 4 peças" e o title lista código + a mesma
  // linha da etiqueta ("2x1 Ministério - 16"). Sai da fila que já está na
  // memória — nenhuma consulta nova. Tocar no selo abre o painel naquele tubo.
  const conteudoDoTubo = useMemo(() => {
    const porId = new Map((pecasDoServidor as any[]).map((i) => [i.id, i]));
    const m = new Map<string, { total: number; lista: string }>();
    for (const t of todosOsTubos) {
      const dentro = (t.linhas ?? []).filter((l) => porId.has(l.itemId));
      if (!dentro.length) continue;
      m.set(t.id, {
        total: dentro.length,
        // A quantidade é a QUE ESTÁ NAQUELE volume; "(7 de 10)" quando dividida.
        lista: dentro.map((l) => { const x = porId.get(l.itemId); return `${x.displayId ?? "—"} · ${linhaDaLista({ ...x, quantity: l.quantidade })} ${parteDoTotal(l.quantidade, qtyOf(x))}`.trim(); }).join("\n"),
      });
    }
    return m;
  }, [pecasDoServidor, todosOsTubos]);
  // Os volumes ABERTOS de cada peça, com a quantidade em cada um — o selo da
  // linha ("Tubo 1 (7) · Tubo 2 (3)" / "Embalada (10)") sai daqui.
  const volumesDaPeca = useMemo(() => {
    const m = new Map<string, LinhaDoVolume[]>();
    for (const t of todosOsTubos) {
      for (const l of t.linhas ?? []) {
        if (l.entregue) continue;
        m.set(l.itemId, [...(m.get(l.itemId) ?? []), { tuboId: t.id, quantidade: l.quantidade, numero: t.numero, avulso: !!t.avulso }]);
      }
    }
    return m;
  }, [todosOsTubos]);
  const temVolumeAberto = (item: any) => (volumesDaPeca.get(item.id)?.length ?? 0) > 0 && !!item.tuboId;
  // EMBALADA SOZINHA (dono, 21/09: "nem sempre vai ser 'entregar tubo'"): o
  // volume avulso nunca é "Tubo N" — o selo diz "Embalada", a ação é
  // "Entregar" e o desfazer é "Desfazer embalagem".
  const tubosAvulsos = useMemo(() => new Set(todosOsTubos.filter((t) => t.avulso).map((t) => t.id)), [todosOsTubos]);
  const ehAvulsa = (item: any) => !!item.tuboAvulso || (!!item.tuboId && tubosAvulsos.has(item.tuboId));
  const seloDoTubo = (item: any): string | null => {
    const volumes = volumesDaPeca.get(item.id) ?? [];
    if (!volumes.length) return null;
    // "7 de 10 embaladas" na frente quando ainda falta embalar o resto.
    const falta = embaladaDe(item) < qtyOf(item) ? `${embaladaDe(item)} de ${qtyOf(item)} embaladas · ` : "";
    return falta + seloDosVolumes(volumes);
  };
  const tituloDoTubo = (item: any): string => {
    const c = conteudoDoTubo.get(item.tuboId);
    const foto = fechamentoDoTubo.get(item.tuboId);
    if (ehAvulsa(item)) return `Embalada sozinha${foto ? ` · foto ${foto}` : ""}\nToque para ver a embalagem.`;
    return `Tubo ${numeroDoTubo.get(item.tuboId) ?? ""} · ${c?.total ?? 1} ${(c?.total ?? 1) === 1 ? "peça" : "peças"}${foto ? ` · foto ${foto}` : " · sem foto"}\n${c?.lista ?? ""}\nToque para abrir o tubo.`;
  };
  // O toque no SELO abre o modal DAQUELE tubo ("devia abrir um modal para saber
  // quais peças estão junto com ele") — não mais o painel do evento inteiro,
  // que continua no botão Tubos do cabeçalho do evento.
  const abrirTuboDaPeca = (item: any) =>
    setTubosDoEvento({ id: String(item.eventId), name: item.event?.name ?? "Evento", verTubo: item.tuboId });

  // TIRAR DO TUBO direto da fila (21/09): a peça Embalado volta a Conferido —
  // o servidor faz a transição e escreve a trilha. É o mesmo PATCH do modal.
  const tirarDoTuboMutation = useMutation({
    mutationFn: async ({ itemId, tuboId }: { itemId: string; tuboId: string; displayId?: string }) =>
      await apiRequest("PATCH", `/api/tubos/${tuboId}/itens`, { remover: [itemId] }),
    onSuccess: (_r, vars) => {
      invalidarGraficaEMaquinas();
      queryClient.invalidateQueries({ queryKey: ["/api/tubos"] });
      toast({ title: tubosAvulsos.has(vars.tuboId) ? `Embalagem de ${vars.displayId ?? "peça"} desfeita` : `${vars.displayId ?? "Peça"} saiu do Tubo ${numeroDoTubo.get(vars.tuboId) ?? ""}`, description: "Voltou para Conferido." });
    },
    onError: (error: Error) => {
      invalidarGraficaEMaquinas();
      toast({ title: "Não foi possível tirar do tubo", description: apiErrorMessage(error), variant: "destructive" });
    },
  });
  // Mesmo desenho de sempre: o toast nomeia a peça e a quantidade, e o erro
  // recarrega a fila (o colega pode ter conferido a mesma peça no celular).
  const conferMutation = useMutation({
    mutationFn: async ({ itemId, conferencePhotoUrl, qty, notes }: { itemId: string; conferencePhotoUrl: string; qty: number; notes?: string; displayId?: string; vaiEmbalar?: boolean }) =>
      await apiRequest("POST", `/api/items/${itemId}/confer`, { conferencePhotoUrl, qty, notes }),
    onSuccess: (_r, vars) => {
      invalidarGraficaEMaquinas();
      setSelectedItem(null); setModalType(null);
      setPhotos([]);
      // Conferir e embalar: quem avisa é o handler, depois da embalagem.
      if (vars.vaiEmbalar) return;
      toast({
        title: `Conferência feita${vars.displayId ? ` · ${vars.displayId}` : ""}`,
        description: `${vars.qty} un. conferida${vars.qty !== 1 ? "s" : ""} — agora é embalar. As etiquetas ficam no cabeçalho do evento.`,
      });
    },
    onError: (error: Error) => {
      invalidarGraficaEMaquinas();
      toast({ title: "Não foi possível conferir", description: `${apiErrorMessage(error).replace(/[.\s]*$/, ".")}${navigator.onLine ? " A fila foi recarregada com o estado atual." : ""}`, variant: "destructive" });
    },
  });

  const markReuseMutation = useMutation({
    // apiRequest devolve o Response cru — sem o .json() o onSuccess lia
    // quantity/reuseQty como undefined e o toast sempre dizia "peça inteira".
    // qty = SOMA (fluxo normal); reuseTotal = valor ABSOLUTO (via pós-
    // Produzido, ajusta nas duas direções — espelho do mark-reuse).
    mutationFn: async ({ itemId, qty, reuseTotal }: { itemId: string; qty?: number; reuseTotal?: number }) =>
      await (await apiRequest("POST", `/api/items/${itemId}/mark-reuse`, reuseTotal != null ? { reuseTotal } : { qty })).json(),
    onSuccess: (updated: any) => {
      invalidarGraficaEMaquinas();
      setReuseConfirmItemId(null);
      setMenuAcoesId(null);
      const falta = (updated?.quantity ?? 0) - (updated?.reuseQty ?? 0);
      toast({
        title: "Reaproveitamento registrado",
        description: falta > 0
          ? `${updated.reuseQty} un. reaproveitada(s). Faltam ${falta} un. para produzir.`
          : "Peça inteira reaproveitada. Segue para conferência.",
      });
    },
    onError: (error: Error) => {
      setReuseConfirmItemId(null);
      toast({ title: "Erro ao marcar reaproveitamento", description: error.message, variant: "destructive" });
    },
  });

  // Corrige reaproveitamento total marcado por engano (só disponível antes de conferir)
  const correctReuseMutation = useMutation({
    // Mesmo caso do mark-reuse: o toast lia o Response cru e anunciava
    // "voltou com as 0 un." — o .json() entrega o item atualizado de verdade.
    mutationFn: async ({ itemId, correctedReuseQty }: { itemId: string; correctedReuseQty: number }) =>
      await (await apiRequest("POST", `/api/items/${itemId}/correct-reuse`, { correctedReuseQty })).json(),
    onSuccess: (updated: any) => {
      invalidarGraficaEMaquinas();
      setCorrectReuseItemId(null);
      setMenuAcoesId(null);
      const qty = Number(updated?.quantity) || 0;
      const reused = Number(updated?.reuseQty) || 0;
      toast({
        title: reused === 0 ? "Reaproveitamento removido" : "Reaproveitamento corrigido",
        description: reused === 0
          ? `A peça voltou para a fila de produção com as ${qty} un.`
          : `${reused} un. reaproveitadas. As outras ${qty - reused} voltaram para produção.`,
      });
    },
    onError: (error: Error) => {
      setCorrectReuseItemId(null);
      toast({ title: "Erro ao corrigir reaproveitamento", description: error.message, variant: "destructive" });
    },
  });

  // Cancelar complemento — a janela de arrependimento, aberta também para a
  // Gráfica (é quem percebe o engano na hora, com a fila na frente). O servidor
  // recusa se QUALQUER unidade já foi produzida, reaproveitada, conferida ou
  // entregue; o botão só aparece nesse mesmo caso, para não convidar a uma ação
  // que voltaria como erro. O número -C1 não é reciclado: o próximo será -C2.
  const cancelComplementMutation = useMutation({
    mutationFn: async ({ itemId }: { itemId: string; displayId: string }) =>
      await (await apiRequest("DELETE", `/api/items/${itemId}/complement`)).json(),
    onSuccess: (_data: any, vars) => {
      invalidarGraficaEMaquinas();
      setCancelComplementId(null);
      setMenuAcoesId(null);
      toast({ title: "Complemento cancelado", description: `${vars.displayId} removido da fila.` });
    },
    onError: (error: Error) => {
      setCancelComplementId(null);
      // O corpo do 409/503 vem como JSON cru dentro da mensagem — sem traduzir,
      // o operador leria {"error":"…","code":"COMPLEMENT_TOUCHED"} no toast.
      toast({ title: "Não foi possível cancelar", description: apiErrorMessage(error), variant: "destructive" });
    },
  });

  // ── TRAVAR / DESTRAVAR (Solicitação e admin, 21/09) ───────────────────────
  // A Solicitação sem Kit não trava peça do Kit (o mesmo recorte de sempre).
  const podeMexerNaTrava = (item: any) => podeTravar(user?.role) && !soVisualizaKit(item);
  const [travandoItem, setTravandoItem] = useState<any>(null);
  const [motivoDaTrava, setMotivoDaTrava] = useState("");
  const travarMutation = useMutation({
    mutationFn: async ({ itemId, motivo }: { itemId: string; motivo: string; displayId?: string }) =>
      await apiRequest("POST", `/api/items/${itemId}/travar`, { motivo }),
    onSuccess: (_r, v) => {
      invalidarGraficaEMaquinas();
      setTravandoItem(null); setMotivoDaTrava("");
      toast({ title: `${v.displayId ?? "Peça"} travada`, description: `A Gráfica vê o motivo e não consegue fazê-la andar até alguém destravar: ${v.motivo}` });
    },
    onError: (error: Error) => {
      invalidarGraficaEMaquinas();
      toast({ title: "Não foi possível travar", description: apiErrorMessage(error), variant: "destructive" });
    },
  });
  const destravarMutation = useMutation({
    mutationFn: async ({ itemId }: { itemId: string; displayId?: string }) =>
      await apiRequest("POST", `/api/items/${itemId}/destravar`, {}),
    onSuccess: (_r, v) => {
      invalidarGraficaEMaquinas();
      toast({ title: `${v.displayId ?? "Peça"} destravada`, description: "A Gráfica já pode seguir com ela." });
    },
    onError: (error: Error) => {
      invalidarGraficaEMaquinas();
      toast({ title: "Não foi possível destravar", description: apiErrorMessage(error), variant: "destructive" });
    },
  });
  /** A porta de toda ação que faz a peça andar: travada, avisa e não abre. */
  const avisarTravada = (item: any): boolean => {
    if (!pecaTravada(item)) return false;
    toast({ title: `${item.displayId ?? "Peça"} está travada`, description: fraseDaTrava(item), variant: "warning" });
    return true;
  };
  const travaDaLinha = (item: any, fonte: number, alvo: number) => (
    <TravaDaPeca
      item={item} fonte={fonte} alvo={alvo} podeMexer={podeMexerNaTrava(item)}
      onTravar={() => { setMotivoDaTrava(""); setTravandoItem(item); }}
      onDestravar={() => destravarMutation.mutate({ itemId: item.id, displayId: item.displayId })}
      destravando={destravarMutation.isPending && destravarMutation.variables?.itemId === item.id}
    />
  );
  const nTravadas = useMemo(() => (pecasDoServidor as any[]).filter((i) => pecaTravada(i) && !isDelivered(i)).length, [pecasDoServidor]);

  // ── A PEÇA MUDOU ENQUANTO O MODAL ESTAVA ABERTO ────────────────────────────
  // A Gráfica é a tela em que duas pessoas trabalham a mesma fila. O modal de
  // conferir guardava a peça do momento em que abriu: se o colega conferisse
  // pelo celular (WebSocket/polling trazem o dado novo), o modal seguia
  // dizendo "A conferir: 5" e o clique virava erro.
  // Agora o modal acompanha a fila: saldo novo atualiza os números na hora; se
  // não resta nada a fazer, fecha e diz por quê. Produção fica de fora DE
  // PROPÓSITO: o valor que o operador leu é a base do lock otimista
  // (expectedProduced) — trocar a peça por baixo dele anularia a proteção.
  // Enquanto a própria mutação está em voo não mexe: o eco do WebSocket da
  // ação dele mesmo chega antes da resposta e seria lido como "outra pessoa".
  useEffect(() => {
    if (!selectedItem || modalType !== "conference") return;
    if (conferMutation.isPending || conferindoEEmbalando) return;
    const fresca = (items as any[]).find((i: any) => i.id === selectedItem.id);
    if (fresca === selectedItem) return;
    if (!fresca || !canConfer(fresca)) {
      setSelectedItem(null); setModalType(null); setPhotos([]);
      toast({
        title: `${selectedItem.displayId} mudou enquanto você conferia`,
        description: "Outra pessoa já conferiu esta peça — não resta nada a conferir. A fila está atualizada.",
        variant: "warning",
      });
      return;
    }
    setSelectedItem(fresca);
    setConferQty(q => Math.max(1, Math.min(q, remainingConfer(fresca))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, conferMutation.isPending, conferindoEEmbalando]);

  // ── O MODAL DE IMPRESSÃO TAMBÉM ACOMPANHA A FILA (revisão adversarial, 22/09) ──
  // Ficava de fora de propósito (o valor lido era a base do lock otimista),
  // mas o efeito colateral era pior: depois de um 409 PRODUCTION_CONFLICT a fila
  // recarregava e o modal seguia com o `jaSairam`/`expectedProduced` VELHOS —
  // cada nova tentativa batia no mesmo 409. Agora a peça do modal é trocada
  // pela da fila nova; o campo "saíram AGORA" é incremental, então o total
  // enviado passa a somar sobre o número certo (e o operador o vê na linha da
  // conta). Enquanto uma gravação da própria tela está em voo NÃO mexe: o eco do
  // WebSocket do gesto dele chega antes da resposta e seria lido como alheio.
  const impressaoEmVoo = mutacoesDeImpressao.startProductionMutation.isPending || mutacoesDeImpressao.startPrintingMutation.isPending
    || mutacoesDeImpressao.mexerNaImpressoraMutation.isPending || mutacoesDeImpressao.reservarMutation.isPending;
  useEffect(() => {
    if (!selectedItem || modalType !== "production" || impressaoEmVoo) return;
    const fresca = (items as any[]).find((i: any) => i.id === selectedItem.id);
    if (!fresca || fresca === selectedItem) return;
    // Saiu do alcance do modal (mandada para o acabamento, cancelada…): fecha e diz por quê.
    if (!isInProd(fresca) && !estaLiberada(fresca)) {
      setSelectedItem(null); setModalType(null);
      toast({ title: `${selectedItem.displayId} mudou enquanto você informava`, description: `Outra pessoa já a levou para ${getStatusLabel(fresca.status)} — a fila está atualizada.`, variant: "warning" });
      return;
    }
    setSelectedItem(fresca);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, impressaoEmVoo]);

  // Filtros facetados: cada dropdown lista só o que existe no recorte atual,
  // aplicando os OUTROS filtros ativos (com contagem por opção) — o
  // comportamento correto, que a maioria dos apps erra. A regra é a MESMA da
  // lista (`itemCasaFiltros`), só com o próprio filtro excluído: antes o pool
  // das facetas ignorava busca, mês e próximos-10-dias, então digitar na busca
  // encolhia a lista e as contagens dos dropdowns continuavam prometendo o
  // número antigo.
  //
  // A REGRA QUE VALE PARA AS OITO FACETAS, e que alguém quebra ao acrescentar a
  // nona (o texto por extenso e o porquê estão em lib/grafica-filtros, em
  // FacetaGrafica): o pool de um dropdown é o recorte QUE O CLIQUE PRODUZ, não o
  // de agora. Onde os dois diferem é na ocultação das entregues — se clicar
  // naquela opção REVELA as entregues, a faceta as conta e oferece a opção com
  // esse número; se não revela, não conta. Hoje revelam STATUS ("Entregues" é o
  // par do KPI) e EVENTO (o relato do dono do NORTE: "Primavera Manaus", com as
  // 77 peças entregues, sumia deste menu e só aparecia pela busca livre).
  //
  // useMemo obrigatório: eram SEIS varreduras da base a cada tecla digitada,
  // sem memo nenhum, cada uma chamando `groupOf` (normalize + duas regex) e
  // `itemPercursos` (exec em laço) sobre todo o histórico.
  //
  // A BUSCA UMA VEZ SÓ. Com texto na busca, cada uma das ONZE varreduras do
  // recorte (lista, pool dos cards, oito facetas, entregues ocultas) normalizava
  // quatro campos de cada peça (NFD + regex): ~500 ms de CPU a cada clique de
  // aba ou pausa na digitação, com 4 mil peças. Agora o texto é casado UMA vez
  // (`poolDaBusca`, que só depende do texto — trocar de aba não a refaz) e as
  // passadas rodam sobre o que sobrou com `recorteDasPassadas`: o mesmo
  // recorte sem o texto e com o efeito dele em `escondeEntregues` preservado.
  // A identidade e o porquê estão em components/grafica/recorte-da-busca.ts,
  // com teste peça a peça — a regra continua inteira em `itemCasaFiltros`.
  const poolDaBusca = useMemo(
    () => {
      if (!filtros.busca.trim()) return items as any[];
      const soBusca = recorteSoDaBusca(filtros.busca);
      return (items as any[]).filter((i: any) => itemCasaFiltros(i, soBusca, ctxFiltros, { ignorarStatus: true }));
    },
    [items, filtros.busca, ctxFiltros],
  );
  const recorteDasPassadas = useMemo(() => recorteSemABusca(filtros), [filtros]);
  const gFacetPool = useMemo(() => {
    const cache = new Map<FacetaGrafica, any[]>();
    return (excluir: FacetaGrafica): any[] => {
      const pronto = cache.get(excluir);
      if (pronto) return pronto;
      const pool = poolDaBusca.filter((i: any) => itemCasaFiltros(i, recorteDasPassadas, ctxFiltros, { excluir }));
      cache.set(excluir, pool);
      return pool;
    };
  }, [poolDaBusca, recorteDasPassadas, ctxFiltros]);

  const countField = (excluir: FacetaGrafica, key: 'type' | 'material' | 'finish') => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    gFacetPool(excluir).forEach((i: any) => {
      const v = i[key];
      if (!v) return;
      const cur = map.get(v);
      if (cur) cur.count++;
      else map.set(v, { value: v, label: v, count: 1 });
    });
    return Array.from(map.values());
  };

  const eventFilterOptions = useMemo(() => {
    // Cores de prioridade vêm da fonte única (lib/status) — o mapa hex local
    // divergia dela ("alta" laranja aqui, âmbar no resto do app).
    // 'urgent' é grafia legada de 'urgente' que ainda existe em eventos antigos.
    const dotFor = (priority: string | undefined) =>
      getPriorityMeta(priority === 'urgent' ? 'urgente' : priority)?.dot;
    const map = new Map<string, { value: string; label: string; count: number; dotColor?: string }>();
    gFacetPool('evento').forEach((i: any) => {
      if (!i.eventId) return;
      const cur = map.get(i.eventId);
      if (cur) cur.count++;
      else map.set(i.eventId, { value: i.eventId, label: i.event?.name || 'Sem evento', count: 1, dotColor: dotFor(i.event?.priority) });
    });
    return Array.from(map.values());
  }, [gFacetPool]);
  const typeFilterOptions = useMemo(() => countField('tipo', 'type'), [gFacetPool]);
  const materialFilterOptions = useMemo(() => countField('material', 'material'), [gFacetPool]);
  const finishFilterOptions = useMemo(() => countField('acabamento', 'finish'), [gFacetPool]);

  // Grupos presentes no recorte atual (ex.: 5KM, 10KM, PÓRTICO). Derivado do
  // catálogo de Modelos, então o filtro só aparece quando há grupo cadastrado
  // e nunca oferece uma opção que não bate em nada.
  const groupFilterOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    gFacetPool('grupo').forEach((i: any) => {
      const g = groupOf(i.type);
      if (!g) return;
      const cur = map.get(g);
      if (cur) cur.count++;
      else map.set(g, { value: g, label: g, count: 1 });
    });
    // Ordem natural: "5KM" antes de "10KM" (alfabética inverteria os dois).
    return Array.from(map.values())
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { numeric: true }))
      .map((o) => ({ ...o, pinned: true }));
  }, [gFacetPool, groupOf]);

  // Percursos presentes no recorte (5k, 10k...). Uma placa "5k/10k" conta nos
  // dois — é peça compartilhada e tem de aparecer em qualquer um dos filtros.
  const percursoFilterOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; count: number; sort: number }>();
    gFacetPool('percurso').forEach((i: any) => {
      itemPercursos(i).forEach((p) => {
        const cur = map.get(p);
        if (cur) cur.count++;
        else map.set(p, { value: p, label: p, count: 1, sort: ordemPercurso(p) });
      });
    });
    return Array.from(map.values())
      .sort((a, b) => a.sort - b.sort)
      .map(({ value, label, count }) => ({ value, label, count, pinned: true }));
  }, [gFacetPool]);

  // ── STATUS e MÊS: as duas facetas que eram lista FIXA ─────────────────────
  // Eram os dois únicos dropdowns da barra escritos à mão — seis etapas e doze
  // meses, sempre todos, sem contagem. Ou seja, uma SEGUNDA fonte de verdade
  // sobre o mesmo recorte: a fila só tem peça de Agosto e o menu oferecia
  // Janeiro; ninguém entregou nada hoje e "Entregues" continuava lá. O clique
  // devolvia lista vazia, e um menu que oferece o que não existe é
  // indistinguível de uma tela quebrada.
  //
  // Agora saem do MESMO `gFacetPool` das outras cinco (ver a invariante em
  // lib/grafica-filtros: faceta e lista saem do mesmo pool), com a contagem que
  // o clique vai entregar.

  // "pronto_para_producao" é grafia legada da MESMA etapa de
  // "ready_for_production" — a faceta tem de somá-las numa opção só, senão a
  // contagem mentiria por baixo (é o que `casaStatus` faz do outro lado).
  const STATUS_DA_FILA = [
    { value: "awaiting_final_review", label: "Em Revisão" },
    { value: "ready_for_production", label: "Pronto p/ Produção" },
    { value: "approved",             label: "Liberados" },
    { value: "inProduction",         label: "Em Impressão" },
    { value: "produced",             label: "Impresso / Acabamento" },
    { value: "conferred",            label: "Conferidos" },
    { value: "packed",               label: "Embalados" },
    { value: "delivered",            label: "Entregues" },
  ] as const;
  const statusFilterOptions = useMemo(() => {
    const conta = new Map<string, number>();
    gFacetPool('status').forEach((i: any) => {
      const s = statusParaContagem(i); // molde produzido = Entregues (shared/molde)
      const chave = s === "pronto_para_producao" ? "ready_for_production"
        : (s === "awaiting_review" || s === "in_review") ? "awaiting_final_review"
        : s;
      conta.set(chave, (conta.get(chave) ?? 0) + 1);
    });
    // O status ESCOLHIDO fica na lista mesmo com zero peças: fora dela, o chip
    // do filtro mostrava a chave crua ("inProduction") em vez de "Em Impressão".
    return STATUS_DA_FILA
      .filter(s => (conta.get(s.value) ?? 0) > 0 || filtros.status.includes(s.value))
      // `title` com o significado do status (lib/status): "Liberados" e "Pronto
      // p/ Produção" lado a lado no menu eram dúvida de quem filtrava.
      .map(s => ({ value: s.value, label: s.label, count: conta.get(s.value) ?? 0, pinned: true, title: descricaoDoStatus(s.value) ?? undefined }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gFacetPool, filtros.status]);

  const mesFilterOptions = useMemo(() => {
    const conta = new Map<string, number>();
    gFacetPool('mes').forEach((i: any) => {
      const m = itemMes(i);
      if (!m) return;
      conta.set(m, (conta.get(m) ?? 0) + 1);
    });
    return Array.from(conta.entries())
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([m, count]) => ({ value: m, label: nomeDoMes(m), count, pinned: true }));
  }, [gFacetPool]);

  // Impressoras presentes no recorte (dono, 21/09). A ordem é fixa — as quatro
  // máquinas de shared/fluxo-peca e depois "Sem impressora" (peça em impressão
  // sem máquina, legado de antes do controle de máquinas). Como no Status, a
  // opção ESCOLHIDA fica na lista mesmo com zero peças: fora dela o chip do
  // filtro mostrava a chave crua ("3") em vez do nome da máquina.
  const impressoraFilterOptions = useMemo(() => {
    const conta = new Map<string, number>();
    gFacetPool('impressora').forEach((i: any) => {
      // Uma peça conta em CADA impressora dela (a dividida é da 1 e da 2) —
      // a mesma régua do cartão de Máquinas.
      for (const m of itemImpressoras(i)) conta.set(m, (conta.get(m) ?? 0) + 1);
    });
    const ordem = [...MAQUINAS_DE_IMPRESSAO, SEM_IMPRESSORA];
    return ordem
      .filter(m => (conta.get(m) ?? 0) > 0 || filtros.impressora.includes(m))
      .map(m => ({
        value: m,
        label: m === SEM_IMPRESSORA ? "Sem impressora" : rotuloDaMaquina(m),
        count: conta.get(m) ?? 0,
        pinned: true,
        title: m === SEM_IMPRESSORA
          ? "Em impressão sem a máquina informada (peças de antes do controle de máquinas)."
          : "Peças desta impressora — imprimindo, reservadas na fila dela ou já impressas nela (o mesmo cartão de Máquinas).",
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gFacetPool, filtros.impressora]);

  // O casamento item↔recorte mora em lib/grafica-filtros.ts. A lista e o pool
  // dos KPIs usam a MESMA função; a única diferença é `ignorarStatus`, que
  // desliga os três recortes com forma de status (o filtro de status, o chip de
  // complementos e a ocultação das entregues) para cada card poder mostrar a
  // contagem do seu próprio status dentro do recorte atual.
  //
  // ORDENAR UMA VEZ, FILTRAR MUITAS. A ordem da fila não depende do recorte,
  // mas era refeita (4 mil peças, dois `new Date` por comparação) a cada tecla
  // da busca e a cada clique de aba. Agora a base ordenada fica guardada por
  // versão de `items` e o recorte só filtra — `filter` preserva a ordem e o
  // `sort` é estável, então o resultado é idêntico ao de filtrar e depois
  // ordenar. A data de saída é lida uma vez por peça, não por comparação.
  const filaOrdenadaRef = useRef<{ base: any[]; ordenada: any[] } | null>(null);
  const filteredItems = useMemo(() => {
    if (filaOrdenadaRef.current?.base !== items) {
      const saidaMs = new Map<any, number>();
      for (const i of items as any[]) {
        saidaMs.set(i, i.event?.truckDepartureDate ? new Date(i.event.truckDepartureDate).getTime() : Infinity);
      }
      filaOrdenadaRef.current = { base: items, ordenada: [...(items as any[])].sort((a: any, b: any) => {
        // Urgência primeiro: evento com saída do caminhão mais próxima no topo;
        // sem data vai para o fim. Nome desempata (e mantém os grupos estáveis).
        const da = saidaMs.get(a)!;
        const db = saidaMs.get(b)!;
        if (da !== db) return da - db;
        const ea = a.event?.name || ""; const eb = b.event?.name || "";
        if (ea !== eb) return ea.localeCompare(eb);
        // PRIORITÁRIA sobe DENTRO do bloco do evento (dono, 27/08): o macro é
        // do caminhão (a Gráfica trabalha por evento e data de saída), mas
        // dentro do evento a peça marcada sai na frente.
        const prio = Number(!!b.isPriority) - Number(!!a.isPriority);
        if (prio !== 0) return prio;
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        // 4º critério: o complemento COLA na peça original. #0062 → #0062-C1 →
        // #0062-C2 → #0063. O filho herda eventId e type, então os três
        // critérios anteriores sempre empatam e ele cai logo abaixo da mãe —
        // sem isso "#0062-C1" ordenaria como 621 e apareceria a centenas de
        // linhas dela, criando exatamente a duplicidade confusa que o modelo
        // de complemento existe para evitar. Os cabeçalhos de evento/grupo/tipo
        // (derivados por comparação com a linha anterior) seguem corretos.
        return compareDisplayId(a.displayId, b.displayId);
      }) };
    }
    // Com busca, só entra quem passou por ela (`poolDaBusca`, uma passada só).
    const naBusca = poolDaBusca === items ? null : new Set(poolDaBusca);
    return filaOrdenadaRef.current.ordenada.filter((item: any) =>
      (naBusca === null || naBusca.has(item)) && itemCasaFiltros(item, recorteDasPassadas, ctxFiltros));
  }, [items, poolDaBusca, recorteDasPassadas, ctxFiltros]);

  // statsPool: todos os filtros ativos EXCETO os de forma de status — os cards
  // mostram a contagem de cada status dentro do recorte atual. É também de onde
  // sai o "Entregues ocultas (N)": o KPI Entregues não pode ler 0 justamente
  // porque as entregues estão ocultas.
  const statsPool = useMemo(() =>
    poolDaBusca.filter((item: any) => itemCasaFiltros(item, recorteDasPassadas, ctxFiltros, { ignorarStatus: true })),
    [poolDaBusca, recorteDasPassadas, ctxFiltros]);
  // A REGRA DOS NÚMEROS DESTA TELA, uma só: TODO contador conta o que a tela
  // MOSTRA. Com as peças de evento finalizado de volta à fila, elas entram nos
  // seis cards, no "N peças" do recorte e no rodapé de m² — pelo mesmo motivo
  // que o Painel Geral adotou ao revelar as dele: número que não bate com a
  // lista logo abaixo é o defeito mais caro de todos, porque não dá para
  // perceber. Quem quiser o recorte "só trabalho vivo" tem os filtros; o que
  // não pode existir é um KPI dizendo 12 sobre uma lista de 15.
  //
  // O QUE ESSA REGRA DEVE, e o chip abaixo paga: sozinho, "18 A PRODUZIR"
  // esconde que 6 são de evento que já aconteceu. O número segue a lista, e o
  // chip diz quanto dele é trabalho morto.
  // Memoizado: eram seis varreduras do pool a CADA render da página (cada tecla,
  // cada modal aberto, cada peça marcada no lote), sem o recorte ter mudado.
  // Mesmas seis perguntas, mesmas contagens.
  // CONTA E FILTRO COM A MESMA LISTA: cada cartão conta com `casaStatus` — a
  // mesma régua que o filtro aplica ao clicar (lib/grafica-filtros). Antes a
  // conta era escrita à parte ("Em Revisão" contava 3 status e filtrava 1;
  // "Liberados" contava a grafia legada e não a filtrava) e o número do cartão
  // não batia com a lista que o clique abria. MOLDE: statusParaContagem manda
  // o produzido para Entregues.
  const stats = useMemo(() => {
    const conta = (vals: readonly string[]) => statsPool.filter((i: any) => vals.some((v) => casaStatus(statusParaContagem(i), v))).length;
    return {
      revisao:    conta(FILTRO_DOS_CARTOES.revisao),
      liberados:  conta(FILTRO_DOS_CARTOES.liberados),
      emProducao: conta(FILTRO_DOS_CARTOES.emProducao),
      produzidos: conta(FILTRO_DOS_CARTOES.produzidos),
      conferidos: conta(FILTRO_DOS_CARTOES.conferidos),
      embalados:  conta(FILTRO_DOS_CARTOES.embalados),
      entregues:  conta(FILTRO_DOS_CARTOES.entregues),
      total:      statsPool.length,
    };
  }, [statsPool]);

  // Quanto do recorte é peça de evento finalizado — o contrapeso do parágrafo
  // acima. Sai do MESMO `statsPool` dos cards, senão o chip contaria uma
  // população e os KPIs outra.
  const finalizadasNoRecorte = useMemo(() => {
    let encerrado = 0, realizado = 0;
    for (const i of statsPool) {
      const s = selosPorItem.get(i.id);
      if (s?.motivo === "encerrado") encerrado++;
      else if (s?.motivo === "realizado") realizado++;
    }
    return { encerrado, realizado, total: encerrado + realizado };
  }, [statsPool, selosPorItem]);

  // ── Complementos no recorte atual (alimenta o chip do cabeçalho) ──
  // Em ABERTO = ainda não entregues: é o trabalho que apareceu depois e ainda
  // não terminou. O chip aparece também quando o filtro está ligado e o recorte
  // esvaziou — senão o botão sumiria com o filtro preso e sem caminho de volta.
  const complementosAbertos = useMemo(
    () => statsPool.filter((i: any) => isComplement(i) && !isDelivered(i)),
    [statsPool],
  );
  const complementosNaLista = useMemo(
    () => statsPool.filter((i: any) => isComplement(i)),
    [statsPool],
  );
  const complementoUn = complementosAbertos.reduce((s: number, i: any) => s + qtyOf(i), 0);
  const complementoAProduzir = complementosAbertos.reduce((s: number, i: any) => s + remainingProduce(i), 0);
  /**
   * Peças com reaproveitamento no recorte atual (total ou parcial) — a mesma
   * régua dos chips verdes da linha. Conta SEM a própria dimensão (o pool que
   * alimenta os cards), senão ligar o chip zeraria o número dele.
   */
  const comReusoNaLista = useMemo(
    () => (statsPool as any[]).filter((i: any) => i.isReuse || reusedTotalOf(i) > 0).length,
    [statsPool],
  );

  const complementoChipLabel = complementosAbertos.length > 0
    // "a produzir" só quando ainda há impressão pela frente; se já produziu
    // tudo e falta conferir/entregar, o texto seria mentira.
    ? `+${complementoUn} un. em ${complementosAbertos.length} complemento${complementosAbertos.length !== 1 ? "s" : ""} ${complementoAProduzir > 0 ? "a produzir" : "em aberto"}`
    : `${complementosNaLista.length} complemento${complementosNaLista.length !== 1 ? "s" : ""} na lista`;

  // ── Entregues ocultas ─────────────────────────────────────────────────────
  // A tela abre na FILA DO QUE FALTA, não no arquivo de tudo que já foi
  // liberado. Esconder dado sem dizer que está escondido, porém, é pior que o
  // problema: este número alimenta o chip de reversão do rodapé e o atalho do
  // empty state, que são parte da feature e não um extra.
  //
  // O número é O QUE O CLIQUE TRAZ, não o que está escondido — a mesma régua dos
  // menus de filtro (lib/grafica-filtros), aplicada a um chip. Contando "as
  // entregues do statsPool", com o status "Em produção" escolhido o chip
  // prometia "5 entregues ocultas · mostrar" e o clique não trazia nenhuma: o
  // filtro de status continua excluindo as entregues depois de revelá-las.
  // Simular o recorte pós-clique é a única conta que não pode mentir.
  const entreguesOcultas = useMemo(() => {
    if (!escondeEntregues(filtros)) return 0;
    const aoMostrar = (items as any[])
      .filter((i: any) => itemCasaFiltros(i, { ...filtros, entregues: true }, ctxFiltros)).length;
    return Math.max(0, aoMostrar - filteredItems.length);
  }, [items, filtros, ctxFiltros, filteredItems]);

  // Contagem e descrição do recorte — derivadas da tabela de campos da lib, não
  // de uma lista escrita à mão que o próximo filtro esqueceria de atualizar.
  const nFiltros = contarFiltrosAtivos(filtros);
  // No celular o EVENTO fica à vista na barra (dono, 21/09) — o "Filtros (N)"
  // da folha conta só o que está DENTRO dela.
  const nFiltrosNaFolha = nFiltros - (filtros.evento.length > 0 ? 1 : 0);
  const haFiltro = temFiltroAtivo(filtros);
  const limparFiltros = () => {
    setFiltros({ ...FILTROS_VAZIOS, entregues: filtros.entregues });
    setBuscaInput("");
  };
  // Rótulos bonitos para o empty state: status e evento são chaves/ids na URL.
  const descricaoFiltros = descreverFiltros(filtros, {
    status: (v) => v.map(getStatusLabel).join(", "),
    evento: (v) => v.map(id => eventFilterOptions.find(o => o.value === id)?.label ?? id).join(", "),
    mes: (v) => v.map(nomeDoMes).join(", "),
    impressora: (v) => v.map(m => m === SEM_IMPRESSORA ? "Sem impressora" : rotuloDaMaquina(m)).join(", "),
  });

  // ── Renderização incremental ──────────────────────────────────────────────
  // Cada bloco de evento desenha até ROW_CAP linhas; o resto entra por "Mostrar
  // todas". A fila inclui as entregues de todo o histórico e o endpoint não tem
  // recorte de período, então sem teto a tela pintava milhares de linhas
  // concluídas (miniatura, badges e handlers de hover em cada uma) a cada
  // entrada na rota. `filteredItems` já vem ordenado por evento, então as peças
  // de um mesmo evento são contíguas e o Map preserva a ordem.
  // (Mora ANTES dos efeitos de rolagem até a peça recém-criada, que precisam
  // saber se a linha dela já está desenhada.)
  const { linhasVisiveis, cortePorItem } = useMemo(() => {
    const porEvento = new Map<string, any[]>();
    for (const i of filteredItems as any[]) {
      const chave = String(i.eventId ?? i.event?.name ?? "sem-evento");
      const arr = porEvento.get(chave);
      if (arr) arr.push(i); else porEvento.set(chave, [i]);
    }
    const linhas: any[] = [];
    const corte = new Map<string, { chave: string; total: number; ocultas: number }>();
    porEvento.forEach((arr, chave) => {
      const aberto = gruposExpandidos.has(chave) || arr.length <= ROW_CAP;
      const visiveis = aberto ? arr : arr.slice(0, ROW_CAP);
      linhas.push(...visiveis);
      if (!aberto) {
        // Marca a ÚLTIMA linha visível do bloco: é depois dela que entra o
        // "Mostrar todas", dentro do bloco a que o número pertence.
        corte.set(visiveis[visiveis.length - 1].id, { chave, total: arr.length, ocultas: arr.length - visiveis.length });
      }
    });
    return { linhasVisiveis: linhas, cortePorItem: corte };
  }, [filteredItems, gruposExpandidos]);

  const expandirGrupo = (chave: string) =>
    setGruposExpandidos(prev => { const n = new Set(prev); n.add(chave); return n; });

  // ── Lotes de linhas no DOM (LINHAS_POR_LOTE) ──
  // O orçamento vale para UM recorte: guardado junto do objeto `filtros` em que
  // nasceu, ele volta ao primeiro lote sozinho quando o recorte muda (lista
  // nova começa do topo) e sobrevive às revalidações — quem rolou até a linha
  // 400 não é devolvido à 60 quando o polling ou o WebSocket trazem dado novo.
  const [orcamentoLinhas, setOrcamentoLinhas] = useState<{ recorte: GraficaFiltros; n: number }>(
    () => ({ recorte: filtros, n: LINHAS_POR_LOTE }),
  );
  const limiteLinhas = orcamentoLinhas.recorte === filtros ? orcamentoLinhas.n : LINHAS_POR_LOTE;
  const linhasRenderizadas = useMemo(
    () => (linhasVisiveis.length > limiteLinhas ? linhasVisiveis.slice(0, limiteLinhas) : linhasVisiveis),
    [linhasVisiveis, limiteLinhas],
  );
  // Números do resumo do recorte ("N peças · M eventos · X m² a produzir…").
  // Eram cinco varreduras de `filteredItems` (duas delas criando um Set) a CADA
  // render da página — cada tecla, cada modal, cada peça marcada. Uma passada,
  // na mesma ordem e com as mesmas regras: entregue fica fora das somas de m² e
  // de reaproveitamento; evento sem id não conta.
  const resumoDaLista = useMemo(() => {
    let complementos = 0, entreguesNaLista = 0, totalM2 = 0, printM2 = 0, reusedUn = 0;
    const eventos = new Set<unknown>();
    for (const i of filteredItems as any[]) {
      if (isComplement(i)) complementos++;
      if (i.eventId) eventos.add(i.eventId);
      if (isDelivered(i)) { entreguesNaLista++; continue; }
      totalM2 += Number(i.calculatedM2) || 0;
      printM2 += m2ToProduce(i);
      reusedUn += reusedTotalOf(i);
    }
    return { complementos, eventos: eventos.size, entreguesNaLista, totalM2, printM2, reusedUn };
  }, [filteredItems]);

  /** Garante ao menos `minimo` linhas no DOM (padrão: mais um lote). */
  const desenharMaisLinhas = (minimo = limiteLinhas + LINHAS_POR_LOTE) =>
    // Transição: o lote novo entra sem travar a rolagem nem o que se digita.
    startTransition(() => setOrcamentoLinhas(o => {
      const atual = o.recorte === filtros ? o.n : LINHAS_POR_LOTE;
      return minimo <= atual ? o : { recorte: filtros, n: minimo };
    }));

  // Deep link do sino: /grafica?item=<id> cai aqui vindo da notificação de
  // complemento. Joga o displayId no campo de busca (que já procura por ele) e
  // limpa a URL, para um F5 não reaplicar o recorte — mesmo padrão do
  // event-detail. Espera a lista chegar: com o cache vazio o uuid não
  // resolveria para displayId e a busca cairia em "nenhuma peça encontrada".
  useEffect(() => {
    if (isLoading) return;
    const alvoId = new URLSearchParams(window.location.search).get("item");
    if (!alvoId) return;
    const alvo = (items as any[]).find((i: any) => i.id === alvoId);
    const busca = alvo?.displayId ?? alvoId;
    setBuscaInput(busca);
    patchFiltros({ busca });
    // Remove só o `item=`: o recorte do operador (que agora vive na URL) tem de
    // sobreviver ao deep link. Antes o replaceState apagava a query inteira.
    const p = new URLSearchParams(window.location.search);
    p.delete("item");
    const qs = p.toString();
    window.history.replaceState({}, "", qs ? `?${qs}` : window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, isLoading]);

  // ── Depois de confirmar o aumento ──────────────────────────────────────────
  // A peça-filha nasce COLADA na mãe (compareDisplayId já garante a ordem), mas
  // "nasceu em algum lugar da lista" não é resposta para quem acabou de clicar.
  // A sequência: o modal fecha e invalida as queries → a linha aparece → esta
  // tela rola até ela, realça por 5 s e devolve o foco. A ficha NÃO abre: as
  // portas continuam sendo o olho da linha e o "Mostrar" do banner.
  const handleComplementoCriado = (child: any) => {
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
    const noRecorte = (filteredItems as any[]).find((i: any) => i.id === novoComplementoId);
    if (!noRecorte) {
      const naLista = (items as any[]).find((i: any) => i.id === novoComplementoId);
      if (naLista) setBannerComplemento({ id: naLista.id, displayId: naLista.displayId });
      return;
    }
    const alvo = document.querySelector(`[data-item-row="${novoComplementoId}"]`);
    // Está no recorte e fora do teto do evento, mas ainda num LOTE que não foi
    // desenhado: traz o DOM até ela (e um lote de folga) e deixa o efeito rodar
    // de novo — `limiteLinhas` está nas deps.
    const posicao = alvo ? -1 : linhasVisiveis.findIndex((i: any) => i.id === novoComplementoId);
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
    if ((filteredItems as any[]).some((i: any) => i.id === bannerComplemento.id)) setBannerComplemento(null);
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

  // Modais de produzir/conferir/entregar e de devolver: no celular, com o
  // teclado virtual aberto, encolhem para a área visível — o rodapé com o
  // Confirmar fica logo acima do teclado (ver components/grafica/area-visivel).
  const modalPecaRef = useRef<HTMLDivElement>(null);
  useAcompanharAreaVisivel(modalPecaRef, "centro", isMobile && !!selectedItem && !!modalType);
  const modalDevolverRef = useRef<HTMLDivElement>(null);
  useAcompanharAreaVisivel(modalDevolverRef, "centro", isMobile && !!devolverItem);
  /** Margem interna do corpo dos modais: 24 roubava 48px de largura em 360. */
  const padModal = isMobile ? 16 : 24;

  // A chave desta abertura do modal (ver aberturaDoModal): a foto guarda a
  // chave de quando o envio começou e só entra se o modal ainda for o mesmo.
  const chaveDoModal = `${aberturaDoModal}:${modalType ?? ""}:${selectedItem?.id ?? ""}`;
  chaveDoModalRef.current = chaveDoModal;
  const fotoDaAbertura = (chave: string) => (url: string) => {
    if (chave !== chaveDoModalRef.current) return;
    addPhoto(url);
  };

  const handleSubmitConference = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    if (fotosSubindo > 0) return; // o botão já diz "Enviando foto…"
    if (!photos.length) {
      toast({ title: "Foto obrigatória", description: "Envie ao menos uma foto da conferência.", variant: "warning" });
      return;
    }
    const peca = selectedItem;
    const vaiEmbalar = oferecerEmbalarJunto(peca, conferQty) && jaEmbalar;
    // Mutation PRIMEIRO (a primeira foto vai nela como conferencePhotoUrl, o
    // campo que o restante do app lê); a galeria só recebe as fotos depois do
    // sucesso — mesma disciplina do lote. Antes uma conferência recusada
    // deixava fotos órfãs na galeria.
    const itemId = selectedItem.id;
    const photosToAttach = photos;
    const qtd = conferQty;
    if (vaiEmbalar) setConferindoEEmbalando(true);
    try {
      await conferMutation.mutateAsync({ itemId, displayId: peca.displayId, conferencePhotoUrl: photosToAttach[0], qty: qtd, notes: modalNotes, vaiEmbalar });
    } catch {
      setConferindoEEmbalando(false);
      return; // o onError da mutation já mostrou o toast
    }
    const results = await Promise.allSettled(photosToAttach.map(photoUrl =>
      apiRequest("POST", `/api/items/${itemId}/photos`, {
        photoUrl, kind: "conference",
        uploadedBy: getCurrentUserName(),
      })
    ));
    const fotosFalharam = results.some(r => r.status === "rejected");
    if (vaiEmbalar) {
      // A conferência já está feita: se a embalagem falhar, ela FICA e o toast
      // diz o que falta. Mesma rota do "Embalar sozinha" do painel de tubos.
      try {
        await apiRequest("POST", `/api/events/${peca.eventId}/tubos`, { itens: [{ id: itemId, quantidade: qtd }], fotos: photosToAttach.slice(0, 20), avulso: true });
        toast({
          title: `Conferida e embalada · ${peca.displayId}`,
          description: `${qtd} un. conferida${qtd !== 1 ? "s" : ""} e embalada${qtd !== 1 ? "s" : ""} sozinha${qtd !== 1 ? "s" : ""}. Falta só entregar o volume (aba Tubos).${fotosFalharam ? " Parte das fotos não entrou na galeria da peça." : ""}`,
        });
      } catch (err) {
        toast({
          title: `Conferência feita · ${peca.displayId}`,
          description: `Mas a embalagem não saiu: ${apiErrorMessage(err).replace(/[.s]*$/, "")}. Falta embalar — use o botão Embalar da peça.`,
          variant: "destructive",
        });
      } finally {
        setConferindoEEmbalando(false);
        queryClient.invalidateQueries({ queryKey: [`/api/events/${peca.eventId}/tubos`] });
        queryClient.invalidateQueries({ queryKey: ["/api/tubos"] });
      }
    } else if (fotosFalharam) {
      toast({ title: "Conferência feita", description: "Parte das fotos não pôde ser anexada.", variant: "warning" });
    }
    invalidarGraficaEMaquinas();
  };

  const onPhotoError = (error: Error) =>
    toast({ title: "Erro no upload", description: error.message, variant: "destructive" });

  // Barra de ações dos modais. No celular o conteúdo (arte grande + specs +
  // fotos + observação) passa da altura da tela, e o botão de confirmar ficava
  // no fim da rolagem: depois de tirar a foto era preciso procurar por ele.
  //
  // COLADA NA BORDA DE BAIXO, com o recorte seguro. Era `bottom: 0` dentro de
  // um corpo com 24px de padding: o sticky respeita o padding do scrollport,
  // então a barra parava 24px ACIMA da borda e o conteúdo rolava visível por
  // baixo dela; e sem `env(safe-area-inset-bottom)` o Confirmar encostava no
  // home indicator do iPhone. `bottom` e margens negativas iguais ao padding do
  // corpo (o mesmo conserto do diálogo de lote). É a ÚLTIMA peça do formulário:
  // o aviso "falta a foto" mora dentro dela, em vez de depois.
  const modalActionsStyle: React.CSSProperties = {
    display: "flex", flexWrap: "wrap", gap: 10,
    position: "sticky", bottom: -padModal,
    backgroundColor: T.surface,
    marginTop: -4, marginLeft: -padModal, marginRight: -padModal, marginBottom: -padModal,
    paddingTop: 12, paddingLeft: padModal, paddingRight: padModal,
    paddingBottom: `calc(12px + env(safe-area-inset-bottom))`,
    borderTop: `1px solid ${N.n3}`,
    boxShadow: "0 -8px 12px -8px rgba(28,25,23,0.18)",
  };

  const renderNotesField = (placeholder: string) => (
    <div>
      <label htmlFor="input-observacao-modal" style={{ display: "block", fontSize: fsMin(FS.small), fontWeight: FW.forte, color: T.apoio, marginBottom: 8 }}>
        Observação <span style={{ color: T.second, fontWeight: FW.corpo }}>(opcional)</span>
      </label>
      <textarea
        id="input-observacao-modal"
        value={modalNotes}
        onChange={e => setModalNotes(e.target.value)}
        placeholder={placeholder}
        rows={2}
        data-testid="input-notes"
        style={{ width: "100%", minHeight: 64, boxSizing: "border-box", padding: "10px 14px", backgroundColor: N.n3, border: "1px solid transparent", borderRadius: 8, fontSize: isMobile ? 16 : 13, color: T.text, resize: "vertical", fontFamily: "inherit" }}
      />
    </div>
  );

  // `resto`: a peça já está em impressão com PARTE das unidades; o modal abre
  // na etapa 1 (escolher impressora + quantidade) para o que está sem impressora.
  const [iniciandoResto, setIniciandoResto] = useState(false);
  const openProductionModal = (item: any, resto = false) => {
    if (avisarTravada(item)) return;
    setIniciandoResto(resto);
    setSelectedItem(item);
    setModalType("production");
    // A máquina e a quantidade nascem da peça DENTRO do FormularioDeImpressao
    // (montado com key={item.id}); nada a pré-preencher aqui.
  };

  // Exporta a lista visível. Manda os ids em vez de repetir os filtros no
  // servidor — o arquivo sai idêntico ao que está na tela.
  const handleExportXlsx = async () => {
    if (!filteredItems.length) return;
    setIsExporting(true);
    try {
      const statusNames = filtros.status.map(s => getStatusLabel(s));
      const title = statusNames.length
        ? `Produção — ${statusNames.join(", ")}`
        : "Produção — Gráfica";

      const res = await fetch("/api/items/export-xlsx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ itemIds: filteredItems.map((i: any) => i.id), title }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Falha ao gerar o arquivo");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({ title: "Erro ao exportar", description: error.message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const openConferenceModal = (item: any) => {
    if (avisarTravada(item)) return;
    setSelectedItem(item);
    setModalType("conference");
    setPhotos([]); setModalNotes("");
    setConferQty(remainingConfer(item)); // padrão: o que falta conferir
    setJaEmbalar(CONFERIR_E_EMBALAR);
    setAberturaDoModal(n => n + 1);
  };

  // ── LOTE E EVENTO FINALIZADO: aqui não há o que separar ───────────────────
  // As ações em lote desta tela são CONFERIR (POST /api/items/:id/confer) e
  // EMBALAR (rotas de tubos) — que a guarda de evento finalizado deixa passar
  // de propósito. Logo, um lote misto
  // (peça viva + peça de evento acabado) roda inteiro, sem 409 e sem falha
  // silenciosa: não existe caso a separar, e um filtro aqui só REMOVERIA da
  // conferência em lote justamente as peças cuja papelada chega depois do
  // evento. A separação de lote misto que a Revisão Final precisa fazer
  // (solicitacao.tsx) não tem paralelo nesta tela.
  //
  // Conferíveis no filtro atual (para o modo conferência em lote)
  // !EM_REVISAO: peça em revisão com reaproveitamento marcado passaria no
  // canConfer (o reuso não olha status) — e ela está aqui só para ser VISTA.
  /**
   * ETIQUETAS NO CAMINHO DE QUEM CONFERE (pedido do dono, 25/08): depois de
   * conferir, a etiqueta se imprime — e a porta ficava só no Detalhe do
   * Evento, fora do fluxo da Gráfica. Conta as peças já conferidas de cada
   * evento NO RECORTE ATUAL; o cabeçalho do evento ganha o atalho quando
   * há alguma.
   */
  const etiquetaveisPorEvento = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of filteredItems as any[]) {
      if (ehMolde(i) || !(conferredOf(i) > 0 || isPosConferencia(i) || isDelivered(i))) continue; // molde não tem etiqueta
      const id = String(i.eventId ?? "");
      if (!id) continue;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [filteredItems]);

  // TUBOS (dono, 14/09): peças que já saíram da impressão ou estão num tubo —
  // o cabeçalho do evento ganha o botão "Tubos" quando há alguma.
  const tubaveisPorEvento = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of filteredItems as any[]) {
      if (ehMolde(i) || !(podeIrParaTubo(i.status) || i.tuboId)) continue; // molde não vai para tubo
      const id = String(i.eventId ?? "");
      if (!id) continue;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [filteredItems]);

  const conferableInFilter = useMemo(
    () => (filteredItems as any[]).filter(i => canConfer(i) && !EM_REVISAO.has(i.status)),
    [filteredItems],
  );
  // Embaláveis no filtro atual (modo "Embalar em lote"): conferidas sem tubo.
  const packableInFilter = useMemo(
    () => (filteredItems as any[]).filter(i => podeEmbalar(i)),
    [filteredItems],
  );
  // Um modo de lote por vez; a lista elegível depende do modo ativo.
  const bulkOn = bulkConferMode || bulkPackMode;
  const bulkEligibleList = bulkConferMode ? conferableInFilter : bulkPackMode ? packableInFilter : [];
  const allDeliverableSelected =
    bulkEligibleList.length > 0 && bulkEligibleList.every((i: any) => bulkSelectedIds.has(i.id));

  const toggleBulkItem = (id: string) =>
    setBulkSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Índice por id da lista COMPLETA. Resolver o lote com `find` era O(lote ×
  // fila): "Todas (2.000)" numa fila de 4 mil davam 4 milhões de comparações a
  // cada peça marcada — e de novo ao confirmar.
  const itemPorId = useMemo(() => new Map((items as any[]).map((i: any) => [i.id, i])), [items]);

  // Peças do lote resolvidas na lista COMPLETA (para os dialogs de lote).
  const bulkSelectedItems = useMemo(
    () => Array.from(bulkSelectedIds).map(id => itemPorId.get(id)).filter(Boolean) as any[],
    [bulkSelectedIds, itemPorId],
  );

  // Eventos do lote — um tubo pertence a um evento só, e o "Embalar em lote"
  // manda as conferidas marcadas para UM tubo: por isso exige um evento só
  // (com vários, a barra avisa em vez de abrir o painel).
  const eventosDoLote = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of bulkSelectedItems) if (i.eventId) m.set(String(i.eventId), i.event?.name ?? "Evento");
    return Array.from(m, ([id, nome]) => ({ id, nome }));
  }, [bulkSelectedItems]);

  const bulkConfirmRef = useRef<HTMLButtonElement>(null);

  // Ao entrar num modo de lote o foco vai para o Confirmar da barra fixa —
  // sem isso, teclado e leitor de tela ficavam perdidos no meio da tabela.
  useEffect(() => {
    if (bulkOn) bulkConfirmRef.current?.focus();
  }, [bulkOn]);

  // Filtros podem mudar com o lote ativo: poda a seleção para manter apenas
  // ids visíveis e elegíveis — evita confirmar peça que não está mais na tela.
  useEffect(() => {
    if (!bulkOn) return;
    setBulkSelectedIds(prev => {
      const eligible = new Set(bulkEligibleList.map((i: any) => i.id));
      const next = new Set(Array.from(prev).filter(id => eligible.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkOn, bulkEligibleList]);

  // A FOTO PERTENCE ÀS PEÇAS FOTOGRAFADAS. Ela sobrevive a fechar e reabrir o
  // diálogo — mas só enquanto a seleção for EXATAMENTE a mesma de quando foi
  // anexada. Sem essa trava, fechar, desmarcar tudo e marcar peças de outro
  // evento mandava o comprovante de um lote como prova de outro. Qualquer
  // mudança no conjunto (marcar, desmarcar, poda por filtro) descarta as fotos
  // do lote; reabrir para conferir/ajustar sem trocar peças continua valendo.
  const chaveSelecaoLote = (ids: Iterable<string>) => Array.from(ids).sort().join("|");
  const selecaoDaFotoRef = useRef<string | null>(null);
  // Memoizada: com "Todas (2.000)" marcadas, ordenar e juntar os ids a cada
  // render da página (cada tecla, cada abrir de modal) custava à toa.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const chaveSelecaoAtual = useMemo(() => chaveSelecaoLote(bulkSelectedIds), [bulkSelectedIds]);
  const temFotoNoLote = bulkConferPhotos.length > 0;
  useEffect(() => {
    if (!temFotoNoLote) { selecaoDaFotoRef.current = null; return; }
    // Primeira foto: amarra ao conjunto marcado neste momento.
    if (selecaoDaFotoRef.current === null) { selecaoDaFotoRef.current = chaveSelecaoAtual; return; }
    if (selecaoDaFotoRef.current !== chaveSelecaoAtual) {
      selecaoDaFotoRef.current = null;
      setBulkConferPhotos([]);
    }
  }, [temFotoNoLote, chaveSelecaoAtual]);

  // SAIR DO LOTE — um lugar só (X da barra e Esc). A foto e as observações do
  // lote SOBREVIVEM a fechar o diálogo com a mesma seleção (ver acima), e por
  // isso são descartadas AQUI também, quando o lote acaba sem registrar nada.
  const sairDoLote = () => {
    setBulkConferMode(false);
    setBulkPackMode(false);
    setBulkSelectedIds(new Set());
    setBulkConferPhotos([]);
    setBulkConferNotes("");
  };

  // Escape sai do modo lote — mas não quando há dialog aberto: o Escape do
  // dialog fecha o dialog, e o estado ainda aponta "aberto" quando este
  // handler roda, então os dois não conflitam.
  useEffect(() => {
    if (!bulkOn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (bulkConferOpen || tubosDoEvento || viewDetailsItem || selectedItem) return;
      sairDoLote();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bulkOn, bulkConferOpen, tubosDoEvento, viewDetailsItem, selectedItem]);

  // Conferência em lote: allSettled + tolerância a falha parcial. Foto é obrigatória (regra do servidor); a primeira vira o
  // conferencePhotoUrl de cada peça e todas entram na galeria (kind conference).
  const handleBulkConference = async () => {
    if (isBulkSubmitting) return; // Enter repetido no dialog disparava o lote 2x
    if (bulkConferPhotos.length === 0) {
      toast({ title: "Foto obrigatória", description: "Envie ao menos uma foto da conferência.", variant: "warning" });
      return;
    }
    setIsBulkSubmitting(true);
    // Busca cada peça na lista COMPLETA (items) — buscar em filteredItems fazia
    // a peça "sumir" quando o filtro mudava com o lote aberto, e o fallback
    // qty: 1 registrava conferência de 1 unidade em vez do restante real.
    // Peça não encontrada SAI do lote em vez de ir com quantidade chutada.
    const entries = Array.from(bulkSelectedIds)
      .map(id => itemPorId.get(id))
      .filter(Boolean) as any[];
    const ids = entries.map(i => i.id);
    try {
      const confer = await Promise.allSettled(entries.map(item =>
        apiRequest("POST", `/api/items/${item.id}/confer`, {
          conferencePhotoUrl: bulkConferPhotos[0],
          qty: remainingConfer(item),
          notes: bulkConferNotes || null,
        })
      ));

      const okIds = ids.filter((_, i) => confer[i].status === "fulfilled");
      const failedIds = ids.filter((_, i) => confer[i].status === "rejected");
      const failed = failedIds.length;

      let photoFailed = 0;
      if (okIds.length > 0) {
        const photos = await Promise.allSettled(
          okIds.flatMap(itemId =>
            bulkConferPhotos.map(photoUrl =>
              apiRequest("POST", `/api/items/${itemId}/photos`, {
                photoUrl, kind: "conference", uploadedBy: getCurrentUserName(),
              })
            )
          )
        );
        photoFailed = photos.filter(p => p.status === "rejected").length;
      }

      // Conferir é só conferir (dono, 21/09): nada de tubo aqui. Conferidas,
      // as peças ganham o botão Embalar na fila (ou o "Embalar em lote").
      invalidarGraficaEMaquinas();

      if (failed > 0) {
        // O MOTIVO da recusa entra no toast (o primeiro, que costuma ser o de
        // todas): "falhou" sem porquê deixava o operador reenviando às cegas —
        // e a causa mais comum é o colega ter conferido a mesma peça antes.
        const motivo = motivoDaPrimeiraFalha(confer);
        toast({
          title: `${okIds.length} de ${ids.length} conferida${ids.length !== 1 ? "s" : ""}`,
          description: `${failed} não ${failed !== 1 ? "passaram" : "passou"}${motivo ? ` — ${motivo}` : ""}. ${failed !== 1 ? "Continuam selecionadas" : "Continua selecionada"} para tentar de novo.`,
          variant: "destructive",
        });
      } else if (photoFailed > 0) {
        toast({
          title: `${okIds.length} peça(s) conferida(s)`,
          description: "A conferência foi feita, mas parte das fotos não pôde ser anexada.",
          variant: "warning",
        });
      } else {
        toast({
          title: `${okIds.length} peça${okIds.length !== 1 ? "s" : ""} conferida${okIds.length !== 1 ? "s" : ""}`,
          description: "Agora é embalar: o botão Embalar da peça (ou Embalar em lote) escolhe o tubo. As etiquetas ficam no cabeçalho do evento.",
        });
      }

      setBulkConferOpen(false);
      if (failed > 0) {
        // O toast promete que as peças que falharam "continuam na lista":
        // mantém o modo ativo com SÓ elas selecionadas (e a foto/notas para
        // reenviar), em vez de zerar a seleção. As que falharam estavam NA
        // foto: a trava de "seleção mudou" é reamarrada a esse subconjunto.
        selecaoDaFotoRef.current = chaveSelecaoLote(failedIds);
        setBulkSelectedIds(new Set(failedIds));
      } else {
        setBulkConferMode(false);
        setBulkSelectedIds(new Set());
        setBulkConferNotes("");
        setBulkConferPhotos([]);
      }
    } catch (e: any) {
      // Mesmas chaves do fluxo feliz — invalidar só /approved deixava as
      // outras telas com o cache velho.
      invalidarGraficaEMaquinas();
      toast({ title: "Erro na conferência em lote", description: e.message, variant: "destructive" });
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  // ── Dependências das linhas memoizadas (LinhaMemo) ─────────────────────────
  // Cada tecla na busca, cada modal aberto e cada revalidação (polling,
  // WebSocket, foco) re-renderizava TODAS as linhas desenhadas, mesmo sem
  // mudança nenhuma nelas. Agora uma linha só roda de novo quando muda algo
  // que ela LÊ — e esta lista é o inventário disso. Estado novo lido dentro
  // da linha entra aqui, senão a linha fica com o valor (e o handler) velho.
  //   • da página: papel do usuário (todos os gates derivam dele), modo de
  //     lote, densidade da tabela, o dia (selo de evento finalizado, prazo) e
  //     o "enviando" das três mutações que desabilitam botões na linha;
  //   • da linha: a peça (referência — a revalidação preserva a das
  //     inalteradas), realce de recém-criada, seleção no lote, dias na fase e
  //     o valor em edição SÓ se a edição aberta for a dela.
  // Os handlers (abrir modal, marcar, expandir) só chamam setState e
  // `mutation.mutate`, estáveis entre renders — não precisam entrar.
  const agoraDaTela = new Date();
  const depsDasLinhas: unknown[] = [
    user, bulkOn, bulkConferMode, bulkPackMode, compacto,
    hojeBusinessMs, hojeUTC,
    // O alvo dos botões da linha segue o ponteiro (tablet com o dedo).
    ponteiroGrosso,
    markReuseMutation.isPending, correctReuseMutation.isPending, cancelComplementMutation.isPending,
  ];
  const depsDaLinha = (item: any, daPosicao: unknown[]): unknown[] => [
    ...depsDasLinhas,
    item,
    item.id === novoComplementoId,
    bulkSelectedIds.has(item.id),
    diasNaFase(item, agoraDaTela),
    reuseConfirmItemId === item.id ? reuseQty : null,
    correctReuseItemId === item.id ? correctReuseQty : null,
    cancelComplementId === item.id,
    // o menu "⋯" das ações secundárias (tabela compacta) aberto NESTA linha
    menuAcoesId === item.id,
    // …ou aberto por uma edição em linha dele (z-index da célula), e o lado
    idMenuAberto === item.id,
    idMenuAberto === item.id && menuParaCima,
    // TUBOS: o chip "Tubo N" da linha e o botão "Tubos" do cabeçalho do evento
    // leem estes dois; sem eles a linha memoizada não redesenhava quando a
    // peça entrava num tubo ou o evento ganhava a primeira peça tubável.
    item.tuboId ? numeroDoTubo.get(item.tuboId) ?? null : null,
    // …e o "fechado 14:32" do selo (21/09): a linha redesenha quando o tubo fecha.
    item.tuboId ? fechamentoDoTubo.get(item.tuboId) ?? null : null,
    // …e o "· 4 peças" + a lista do title: muda quando outra peça entra ou sai.
    item.tuboId ? conteudoDoTubo.get(item.tuboId)?.lista ?? null : null,
    // "Embalada" × "Tubo N", "Entregar" × "Entregar tubo".
    ehAvulsa(item),
    // o selo com as quantidades por volume e o "Embalar 3"
    seloDoTubo(item), aEmbalar(item),
    // Só a linha DESTA peça fica "pendente" ao tirar do tubo — o booleano
    // global redesenhava a fila inteira a cada clique.
    tirarDoTuboMutation.isPending && tirarDoTuboMutation.variables?.itemId === item.id,
    tubaveisPorEvento.get(String(item.eventId)) ?? 0,
    ...daPosicao,
  ];

  // Mede a tabela depois de desenhada (ver `estouroEm`). useLayoutEffect: a
  // troca de densidade acontece antes da pintura — ninguém vê a tabela cortada
  // piscar. Roda quando muda a largura, a densidade ou o recorte desenhado; não
  // a cada tecla. No jsdom scrollWidth é 0 e nada acontece.
  useLayoutEffect(() => {
    const caixa = tabelaRolagemRef.current;
    if (!caixa || usaCards || larguraRaiz === 0) return;
    if (caixa.scrollWidth - caixa.clientWidth > 1) {
      const chave = compacto ? "compact" : "full";
      setEstouroEm(e => (e[chave] >= larguraConteudo ? e : { ...e, [chave]: larguraConteudo }));
    }
    // bulkOn: sair do lote devolve os botões à coluna de Ações — a mesma
    // largura de tela pode deixar de caber.
  }, [larguraRaiz, larguraConteudo, compacto, usaCards, linhasRenderizadas, bulkOn]);

  // Menu "⋯": fecha ao tocar fora dele ou com Esc. O menu fica aberto também
  // enquanto uma edição em linha DELE está aberta (Reaproveitar, Corrigir,
  // Cancelar complemento) — então "aberto" e "fechar" olham os QUATRO estados.
  // Antes só o menuAcoesId: Esc no meio de um Reaproveitar deixava o menu na
  // tela, sem listener e atrás da célula sticky da linha de baixo.
  // Só na tabela compacta: na cheia e nos cartões essas edições são inline e
  // continuam com o próprio Cancelar, como sempre.
  const idMenuAberto = compacto ? (menuAcoesId ?? reuseConfirmItemId ?? correctReuseItemId ?? cancelComplementId) : null;
  const fecharMenuAcoes = () => {
    setMenuAcoesId(null);
    setReuseConfirmItemId(null);
    setCorrectReuseItemId(null);
    setCancelComplementId(null);
  };
  useEffect(() => {
    if (!idMenuAberto) return;
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Element | null;
      if (!alvo?.closest?.(`[data-menu-acoes="${idMenuAberto}"]`)) fecharMenuAcoes();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      fecharMenuAcoes();
      // O menu vira display:none e o foco cairia no <body>: devolve ao "⋯".
      document.querySelector<HTMLElement>(`button[data-menu-acoes="${idMenuAberto}"]`)?.focus();
    };
    document.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", fora); window.removeEventListener("keydown", esc); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idMenuAberto]);

  // ── Botões do topo ────────────────────────────────────────────────────────
  // UMA ação primária por contexto. No celular a primária é a FILA (uma foto
  // por peça, dois toques). O lote, Máquinas e o Excel são secundários. No
  // desktop não há primária no topo: o trabalho primário mora na LINHA (um
  // botão sólido por peça), e os lotes são modos, não o gesto do dia inteiro.
  // Tamanho pelo PONTEIRO, não pela largura: o tablet do galpão é dedo.
  const tamanhoDoTopo = isMobile || ponteiroGrosso ? "toque" : "md";
  const exportDesabilitado = isExporting || filteredItems.length === 0;
  // Máquinas é um <Link> (navegação), não um <button>: veste a MESMA pele do
  // Botao secundário pela classe .ds-botao, que dá hover e foco sem handlers.
  const linkSecundario: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
    minHeight: alvoDeToque(36, isMobile || ponteiroGrosso), padding: "0 14px",
    backgroundColor: T.surface, color: T.strong, border: `1px solid ${T.border}`, borderRadius: R.md,
    fontFamily: FONT.corpo, fontSize: FS.body, fontWeight: FW.forte, whiteSpace: "nowrap", textDecoration: "none",
  };

  // paddingBottom no lote: a barra fixa do celular tem DUAS linhas (≈120px +
  // recorte seguro); com os 88 do desktop ela cobria a última peça.
  return (
    <div ref={raizRef} style={{ display: "flex", flexDirection: "column", gap: isMobile ? 10 : 16, padding: isMobile ? "12px 12px" : 24, paddingBottom: bulkOn ? (isMobile ? 'calc(140px + env(safe-area-inset-bottom))' : 'calc(88px + env(safe-area-inset-bottom))') : isMobile ? 12 : 24, backgroundColor: T.bg, height: "100%", overflowY: "auto" }}>
      {dialogoDeConfirmacao}

      {/* ── Cabeçalho ── onde estou (título) · como está (quantas peças na
          fila e a idade do dado) · o que posso fazer (ações). Sem botão
          "Atualizar" (regra do dono): a tela se atualiza sozinha (WebSocket +
          polling + refetch no foco) e o selo de frescor é a promessa de
          veracidade; o spinner ao lado é o único sinal de recarga em curso.
          O wrapper leva o testid antigo do título (os testes medem a ordem da
          primeira dobra a partir dele) e devolve a margem que o gap já dá. */}
      <div data-testid="title-grafica" style={{ marginBottom: -20 }}>
        <CabecalhoDaPagina
          titulo="Gráfica"
          subtitulo={isLoading || isError ? undefined
            : `${stats.total} peça${stats.total !== 1 ? "s" : ""} na fila · a ordem segue a saída do caminhão`}
          frescor={!isLoading && !isError ? (
            <span
              data-testid="selo-atualizado"
              title={new Date(dataUpdatedAt).toLocaleString("pt-BR")}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: FS.meta, color: T.second, whiteSpace: "nowrap" }}
            >
              {isFetching && <RotateCcw aria-hidden="true" className="animate-spin" style={{ width: 11, height: 11 }} />}
              Atualizado {fmtRelative(new Date(dataUpdatedAt).toISOString(), agora)}
            </span>
          ) : undefined}
          acoes={bulkOn ? undefined : (
            // Some inteira no modo lote: a barra fixa de baixo passa a ser o
            // único lugar de ação.
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap", width: isMobile ? "100%" : undefined }}>
              {/* CONFERIR EM FILA — o caminho do celular, e por isso a
                  primária dele: uma foto POR peça. A entrega é do volume. */}
              {isMobile && podeConferir && conferableInFilter.length > 0 && (
                <Botao
                  variante="primario"
                  tamanho="toque"
                  icone={Camera}
                  larguraCheia
                  onClick={() => setGalpao("confer")}
                  data-testid="button-fila-conferir"
                  aria-label={`Conferir em fila, uma peça por vez com foto — ${conferableInFilter.length} peças`}
                >
                  Conferir <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.85 }}>({conferableInFilter.length})</span>
                </Botao>
              )}
              {/* Dois "Conferir" lado a lado sem dizer a diferença era a
                  primeira dúvida de quem chega: uma linha curta resolve. */}
              {isMobile && podeConferir && conferableInFilter.length > 0 && (
                <p data-testid="dica-fila-lote" style={{ margin: 0, width: "100%", fontSize: FS.meta, color: T.second, lineHeight: 1.35 }}>
                  <strong style={{ color: T.strong }}>Fila:</strong> uma foto por peça · <strong style={{ color: T.strong }}>Lote:</strong> uma foto só
                </p>
              )}
              {/* Conferência em lote — só para quem pode conferir (gate do servidor). */}
              {podeConferir && conferableInFilter.length > 0 && (
                <Botao
                  tamanho={tamanhoDoTopo}
                  icone={ListChecks}
                  onClick={() => { setBulkConferMode(true); setBulkSelectedIds(new Set()); }}
                  data-testid="button-bulk-confer"
                  title="Selecionar várias peças e conferir com uma foto só"
                  style={{ flex: isMobile ? "1 1 0" : undefined }}
                >
                  Conferir em lote
                  {/* No celular a contagem já está na fila logo acima. */}
                  {!isMobile && <span style={{ color: T.second, fontVariantNumeric: "tabular-nums" }}>{conferableInFilter.length}</span>}
                </Botao>
              )}
              {/* Embalar em lote (dono, 21/09) — várias conferidas num tubo. */}
              {podeConferir && packableInFilter.length > 0 && (
                <Botao
                  tamanho={tamanhoDoTopo}
                  icone={Package}
                  onClick={() => { setBulkPackMode(true); setBulkSelectedIds(new Set()); }}
                  data-testid="button-bulk-pack"
                  title="Marcar várias peças conferidas e pôr todas num tubo"
                  style={{ flex: isMobile ? "1 1 0" : undefined }}
                >
                  Embalar em lote
                  {!isMobile && <span style={{ color: T.second, fontVariantNumeric: "tabular-nums" }}>{packableInFilter.length}</span>}
                </Botao>
              )}
              {/* A aba MÁQUINAS (dono, 14/09). Recortada numa impressora só,
                  a ida leva ao CARTÃO dela em Máquinas. No celular vira só o
                  ícone; o chunk começa a descer no hover/foco/toque. */}
              <Link
                href={filtros.impressora.length === 1 && filtros.impressora[0] !== SEM_IMPRESSORA ? linkDaImpressoraEmMaquinas(filtros.impressora[0]) : "/grafica/maquinas"}
                data-testid="link-maquinas"
                className="ds-botao"
                aria-label={isMobile ? "Máquinas: o que cada impressora imprime agora e o histórico do dia" : undefined}
                title={filtros.impressora.length === 1 && filtros.impressora[0] !== SEM_IMPRESSORA ? `Ver a ${rotuloDaMaquina(filtros.impressora[0])} em Máquinas` : "O que cada impressora imprime agora e o histórico do dia"}
                onMouseEnter={() => prefetchRota("/grafica/maquinas")}
                onFocus={() => prefetchRota("/grafica/maquinas")}
                onTouchStart={() => prefetchRota("/grafica/maquinas")}
                style={{ ...linkSecundario, ...(isMobile ? { width: 44, padding: 0, flex: "0 0 44px" } : null) }}
              >
                <Printer aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }} />
                {!isMobile && "Máquinas"}
              </Link>
              {/* Exportar Excel — só um download; no celular vira só o ícone
                  (o rótulo vai no aria-label). O motivo do desabilitado fica
                  VISÍVEL no desktop; no celular o botão de 44px não tem onde
                  pôr a frase e ela vai no aria-label. */}
              <Botao
                tamanho={tamanhoDoTopo}
                icone={FileSpreadsheet}
                carregando={isExporting}
                disabled={exportDesabilitado}
                motivo={!isMobile && !isExporting && filteredItems.length === 0 ? "Nada para exportar" : undefined}
                alinharMotivo="end"
                onClick={handleExportXlsx}
                data-testid="button-export-xlsx"
                aria-label={isMobile ? (filteredItems.length ? `Exportar ${filteredItems.length} peça(s) em Excel` : "Nada para exportar") : undefined}
                title={filteredItems.length ? `Exportar ${filteredItems.length} peça(s) em Excel` : "Nada para exportar"}
                style={isMobile ? { width: 44, padding: 0, flex: "0 0 44px" } : undefined}
              >
                {!isMobile && (isExporting ? "Gerando…" : "Exportar Excel")}
              </Botao>
            </div>
          )}
        />
      </div>

      {/* ── As abas da tela: Fila | Tubos (dono, 21/09: "Tubos põe na mesma da
          Gráfica, uma abinha separada, não precisa ser uma página"). O <Abas>
          do design system — o mesmo de Máquinas: tablist, setas, roving
          tabindex e 44px. O número de tubos abertos vai no contador da aba.
          `?aba=tubos` na URL; cada aba monta SÓ o próprio painel. */}
      <div data-testid="abas-grafica">
        <Abas
          rotuloDaLista="Seções da Gráfica"
          prefixoDeTestId="aba-grafica"
          ativo={abaDaTela}
          aoTrocar={(id) => irParaAba(id === "tubos" ? "tubos" : "fila")}
          itens={[
            { id: "fila", rotulo: "Fila" },
            { id: "tubos", rotulo: "Tubos", contador: tubosAbertosNaTela > 0 ? tubosAbertosNaTela : undefined, tom: "info" },
          ]}
        />
      </div>

      {abaDaTela === "tubos" && (
        <AbaTubos sugestaoRecebedor={ultimoRecebedor} onEntregou={setUltimoRecebedor}
          onAbrirPeca={(id) => { const peca = itemPorId.get(id); if (peca) setViewDetailsItem(peca); }} />
      )}

      {abaDaTela === "fila" && (
      <div id="painel-fila" role="tabpanel" aria-label="Fila" style={{ display: "contents" }}>
      {/* ── Cartões de etapa ──
          Os cartões do dono (17/09: "os cards antigos estavam melhores")
          agora são o <CartaoKpi> do design system: número na cor da etapa,
          faixa do tom e aria-pressed de verdade. Continua valendo: "—"
          enquanto carrega (zero seria afirmar fila vazia), o subtítulo com o
          próximo passo, e o significado do status no title.
          NO CELULAR o cartão segue local (CartaoDeEtapaCelular): o rótulo do
          CartaoKpi é 10px em caixa-alta, e o galpão não lê nada abaixo de 12px.
          Os números seguem a lista (regra do dono) — ver `stats`. */}
      <div role="group" aria-label="Filtrar a fila por etapa" style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(auto-fit, minmax(150px, 1fr))", gap: isMobile ? 8 : 12 }}>
        {[
          // O KPI Liberados agrega dois status; ele seleciona os DOIS valores
          // no filtro (o filtro em si é estrito — ver matchesFilters).
          // "Em Revisão" vem ANTES de Liberados porque é o degrau anterior
          // do fluxo: é o trabalho CHEGANDO — visível, sem ação da Gráfica.
          { label: "Em Revisão",   value: stats.revisao,    sub: "Chegando da Revisão",  testId: "stat-revisao",    filterVals: FILTRO_DOS_CARTOES.revisao },
          { label: "Liberados",    value: stats.liberados,  sub: "Aguardam produção",    testId: "stat-approved",   filterVals: FILTRO_DOS_CARTOES.liberados },
          { label: "Em Impressão", value: stats.emProducao, sub: "Na máquina",           testId: "stat-production", filterVals: FILTRO_DOS_CARTOES.emProducao },
          { label: "Impresso",     value: stats.produzidos, sub: "No acabamento",        testId: "stat-produced",   filterVals: FILTRO_DOS_CARTOES.produzidos },
          { label: "Conferidos",   value: stats.conferidos, sub: "Aguardam embalagem", testId: "stat-conferred", filterVals: FILTRO_DOS_CARTOES.conferidos },
          // EMBALADO (dono, 21/09): conferida e dentro do tubo — entre Conferidos e Entregues.
          { label: "Embalados",    value: stats.embalados,  sub: "Aguardam o caminhão",  testId: "stat-packed",     filterVals: FILTRO_DOS_CARTOES.embalados },
          { label: "Entregues",    value: stats.entregues,  sub: "Já saíram",            testId: "stat-delivered",  filterVals: FILTRO_DOS_CARTOES.entregues },
        ].map(kpi => {
          const isActive = kpi.filterVals.every(v => filtros.status.includes(v)) && filtros.status.length === kpi.filterVals.length;
          // O title diz o que a etapa SIGNIFICA e quem age (a mesma frase do
          // StatusPill da tabela), não só o subtítulo que já está à vista.
          const significado = descricaoDoStatus(kpi.filterVals[0]) ?? kpi.sub;
          const titulo = isActive ? `${significado} — clique para ver todas` : significado;
          const alternar = () => patchFiltros({ status: isActive ? [] : kpi.filterVals });
          const rotuloAcessivel = `Filtrar por ${kpi.label} — ${kpi.value} peças`;
          if (isMobile) {
            // Celular: cores do MESMO mapa dos pills (lib/status).
            const m = getStatusMeta(kpi.filterVals[0]);
            return (
              <CartaoDeEtapaCelular key={kpi.label} rotulo={kpi.label} valor={isLoading ? "—" : kpi.value} carregando={isLoading}
                ativo={isActive} onClick={alternar} ariaLabel={rotuloAcessivel} title={titulo}
                testId={kpi.testId} faixa={m.dot} tinta={m.text} />
            );
          }
          return (
            // O <span title> carrega o significado: o CartaoKpi não repassa `title`.
            <span key={kpi.label} title={titulo} style={{ display: "grid", minWidth: 0 }}>
              <CartaoKpi
                tom={TOM_DA_ETAPA[kpi.testId] ?? "neutro"}
                rotulo={kpi.label}
                valor={isLoading ? "—" : kpi.value}
                sub={isActive ? "Clique para limpar" : kpi.sub}
                ativo={isActive}
                onClick={alternar}
                aria-label={rotuloAcessivel}
                data-testid={kpi.testId}
              />
            </span>
          );
        })}
        {/* Total — mostra todas as etapas. O ✓ (stat-total-ativo) diz "ativo"
            sem depender de cor. No celular (sete etapas + Total = 8 em 3
            colunas) ele ocupa as duas colunas que sobram da última linha. */}
        {isMobile ? (
          <CartaoDeEtapaCelular rotulo="Total" valor={isLoading ? "—" : stats.total} carregando={isLoading}
            ativo={filtros.status.length === 0} onClick={() => patchFiltros({ status: [] })}
            ariaLabel={`Mostrar todos os status — ${stats.total} peças`}
            title={filtros.status.length === 0 ? "Mostrando todas as etapas" : "Ver todas as etapas"}
            testId="stat-total" faixa={T.accent} tinta={T.text} colunas={2} />
        ) : (
          <span title={filtros.status.length === 0 ? "Mostrando todas as etapas" : "Ver todas as etapas"} style={{ display: "grid", minWidth: 0 }}>
            <CartaoKpi
              tom="neutro"
              rotulo="Total"
              valor={isLoading ? "—" : stats.total}
              sub={filtros.status.length === 0
                ? <span data-testid="stat-total-ativo" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Check aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0 }} />Todas as etapas</span>
                : "Ver todas"}
              ativo={filtros.status.length === 0}
              onClick={() => patchFiltros({ status: [] })}
              aria-label={`Mostrar todos os status — ${stats.total} peças`}
              data-testid="stat-total"
            />
          </span>
        )}
      </div>

      {/* O guia "Como funciona a fila" saiu daqui a pedido do dono (17/09):
          a explicação das etapas já vive no balão de cada selo de status. */}

      {/* ── Filters Bar ───────────────────────────────────────────────────────
          DESKTOP: a faixa horizontal de sempre — os selects viraram um map
          sobre SELECTS_PRINCIPAIS apenas para o celular reutilizar EXATAMENTE
          os mesmos campos (uma lista, duas apresentações; JSX duplicado foi a
          dívida que esta base já pagou cara demais).
          CELULAR: a pilha de sete gatilhos empurrava a fila para fora da
          dobra — o operador rolava uma tela de filtros antes de ver a primeira
          peça. Vira busca + "Filtros (N)", que abre uma FOLHA em tela cheia
          com os mesmos campos empilhados, de dedo (100dvh: o 100vh clássico
          esconde o rodapé atrás da barra do navegador). Nada some: mesmo
          vocabulário, mesmos testids, mesma URL. */}
      {(() => {
        // O gatilho usa a pele PADRÃO do FilterSelect. O override antigo
        // (fundo #e8e8e7, sem borda, cor fixa) vinha DEPOIS do estilo calculado
        // e apagava o tint de "filtro ativo": com Grupo escolhido o campo ficava
        // idêntico a um vazio — e o de Evento, que nunca recebeu o override,
        // era o único branco da fileira.
        const trigger: React.CSSProperties = {};
        const SELECTS_PRINCIPAIS = [
          // O reaproveitamento mora DENTRO do menu de Status (pedido do dono,
          // 25/08 — o chip solto ficava longe de onde se filtra). "reuso" é um
          // valor sintético: entra e sai do boolean, nunca do array de status.
          { label: "Status", allLabel: "Todos os status",
            values: filtros.reaproveitamento ? [...filtros.status, "reuso"] : filtros.status,
            set: (v: string[]) => patchFiltros({ status: v.filter((x) => x !== "reuso"), reaproveitamento: v.includes("reuso") }),
            options: comReusoNaLista > 0 || filtros.reaproveitamento
              ? [...statusFilterOptions, { value: "reuso", label: "♻ Com reaproveitamento", count: comReusoNaLista, pinned: true }]
              : statusFilterOptions,
            testId: "select-status-filter", sempre: true, busca: "Buscar status...", vazio: "Nenhum status nesta fila." },
          // Só aparece quando há peça com impressora no recorte (`sempre: false`):
          // numa fila sem nada em impressão o campo seria um menu vazio.
          { label: "Impressora", allLabel: "Todas as impressoras", values: filtros.impressora, set: (v: string[]) => patchFiltros({ impressora: v }), options: impressoraFilterOptions, testId: "select-impressora-filter", sempre: false, busca: "Buscar impressora...", vazio: "Nenhuma peça com impressora nesta fila." },
          { label: "Grupo", allLabel: "Todos os grupos", values: filtros.grupo, set: (v: string[]) => patchFiltros({ grupo: v }), options: groupFilterOptions, testId: "select-group-filter", sempre: false, busca: "Buscar grupo...", vazio: "Nenhum grupo encontrado." },
          { label: "Percurso", allLabel: "Todos os percursos", values: filtros.percurso, set: (v: string[]) => patchFiltros({ percurso: v }), options: percursoFilterOptions, testId: "select-percurso-filter", sempre: false, busca: "Buscar percurso...", vazio: "Nenhum percurso encontrado." },
          { label: "Mês", allLabel: "Todos os meses", values: filtros.mes, set: (v: string[]) => patchFiltros({ mes: v }), options: mesFilterOptions, testId: "select-month-filter", sempre: true, busca: "Buscar mês...", vazio: "Nenhuma saída de caminhão nesta fila." },
        ];
        const AVANCADOS = [
          { label: "Tipo", allLabel: "Todos os tipos", values: filtros.tipo, set: (v: string[]) => patchFiltros({ tipo: v }), options: typeFilterOptions, testId: "select-type-filter" },
          { label: "Material", allLabel: "Todos os materiais", values: filtros.material, set: (v: string[]) => patchFiltros({ material: v }), options: materialFilterOptions, testId: "select-material-filter" },
          { label: "Acabamento", allLabel: "Todos os acabamentos", values: filtros.acabamento, set: (v: string[]) => patchFiltros({ acabamento: v }), options: finishFilterOptions, testId: "select-finish-filter" },
        ];
        // O QUE CADA FILTRO RECORTA — "Grupo" e "Percurso" não se explicam
        // sozinhos (um vem do catálogo de Modelos, o outro do TEXTO da peça).
        // Na folha do celular, onde há largura de sobra, a frase fica embaixo
        // do campo; na barra do desktop o espaço é da fileira de campos.
        const DICA_DO_FILTRO: Record<string, string> = {
          Status: "Etapa da peça na fila; também filtra “♻ com reaproveitamento”.",
          Impressora: "Máquina em que a peça começou a imprimir; também as que estão imprimindo ou reservadas nela (o cartão de Máquinas); “Sem impressora” é a peça em impressão sem máquina informada.",
          Grupo: "Grupo do catálogo de Modelos (ex.: placas de 5KM × 10KM).",
          Percurso: "Distância escrita na peça (5k, 10k…).",
          "Mês": "Mês da saída do caminhão do evento.",
        };
        const selects = (fullWidth: boolean) => SELECTS_PRINCIPAIS.map(f => (
          <Fragment key={f.label}>
            <FilterSelect
              showAllLabelWhenEmpty hideWhenEmpty={f.sempre ? false : undefined}
              fullWidth={fullWidth}
              label={f.label} allLabel={f.allLabel}
              values={f.values} onValuesChange={f.set}
              options={f.options}
              searchPlaceholder={f.busca} emptyText={f.vazio}
              testId={f.testId}
              triggerStyle={trigger}
            />
            {fullWidth && (f.sempre || f.options.length > 0) && DICA_DO_FILTRO[f.label] && (
              <p style={{ margin: "-4px 0 2px", fontSize: 12, color: T.second, lineHeight: 1.4 }}>{DICA_DO_FILTRO[f.label]}</p>
            )}
          </Fragment>
        ));
        const avancados = (fullWidth: boolean) => AVANCADOS.map(f => (
          <FilterSelect
            key={f.label}
            fullWidth={fullWidth || undefined} showAllLabelWhenEmpty hideWhenEmpty={false}
            label={f.label} allLabel={f.allLabel}
            values={f.values} onValuesChange={f.set}
            options={f.options}
            searchPlaceholder={`Buscar ${f.label.toLowerCase()}...`}
            emptyText="Nada encontrado."
            testId={f.testId}
            triggerStyle={trigger}
          />
        ));
        // 280px de base: o placeholder cabia em 168px úteis e saía cortado
        // ("…ou eve"). No tablet (lista em cards) a busca ocupa a linha
        // inteira — senão "Mais filtros" quebrava sozinho para a linha de
        // baixo, o mesmo defeito que esta barra tinha no notebook.
        const campoBusca = (
          <div style={{ position: "relative", flex: isMobile ? "1 1 auto" : usaCards ? "1 1 100%" : "1 1 280px", minWidth: isMobile ? 0 : usaCards ? 0 : 280 }}>
            {/* #78716c em vez de T.muted (#a8a29e): 2,06:1 sobre o fundo
                #e8e8e7 do input reprovava o mínimo de 3:1 de elemento não
                textual. E a borda de 1px devolve ao campo a cara de campo. */}
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: T.second }} />
            <input
              type="text"
              // No celular a busca divide a linha com "Filtros": o texto longo
              // saía cortado no meio ("Buscar por ID, descr").
              placeholder={isMobile ? "Código, peça ou evento" : "Buscar por ID, descrição ou evento"}
              aria-label="Buscar peças"
              value={buscaInput}
              onChange={e => setBuscaInput(e.target.value)}
              data-testid="input-search-filter"
              style={{ width: "100%", height: isMobile ? 44 : 36, paddingLeft: 32, paddingRight: 12, backgroundColor: T.surface, border: `1px solid ${T.bdark}`, borderRadius: 8, fontSize: isMobile ? 16 : 13, color: T.text, boxSizing: "border-box" }}
              onFocus={e => { e.currentTarget.style.borderColor = T.accentText; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(194,65,12,0.18)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = T.bdark; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>
        );
        // "Travadas (N)" (21/09): só aparece quando há peça travada (ou o filtro está ligado).
        const pillTravadas = (nTravadas > 0 || filtros.travadas) ? (
          <ShortcutPill
            label={`Travadas (${nTravadas})`}
            icon={Lock}
            active={filtros.travadas}
            onClick={() => patchFiltros({ travadas: !filtros.travadas })}
            testId="button-travadas-filter"
            title="Só as peças travadas pela Solicitação — com o motivo e quem travou"
          />
        ) : null;
        const pillProximos = (
          <ShortcutPill
            label="Próximos 10 dias"
            icon={Truck}
            active={filtros.proximos10}
            onClick={() => patchFiltros({ proximos10: !filtros.proximos10 })}
            testId="button-next-10-days-filter"
            title="Só peças de evento cujo caminhão sai nos próximos 10 dias"
          />
        );
        // "N filtros ativos · Limpar": a contagem é TEXTO (o que está valendo) e
        // o botão é só o verbo. Antes era um pill vermelho "Limpar tudo (3)" —
        // vermelho é cor de perigo, e limpar filtro não destrói nada.
        const botaoLimpar = haFiltro && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: isMobile ? 0 : "auto", fontSize: FS.meta, color: T.second, whiteSpace: "nowrap" }}>
            {!isMobile && (
              <span data-testid="texto-filtros-ativos" title={descricaoFiltros.join(" · ")}>
                <strong style={{ color: T.text, fontVariantNumeric: "tabular-nums" }}>{nFiltros}</strong> filtro{nFiltros !== 1 ? "s" : ""} ativo{nFiltros !== 1 ? "s" : ""}
                <span aria-hidden="true"> ·</span>
              </span>
            )}
            <Botao
              variante={isMobile ? "secundario" : "fantasma"}
              tamanho={isMobile || ponteiroGrosso ? "toque" : "sm"}
              icone={isMobile ? X : undefined}
              onClick={limparFiltros}
              data-testid="button-limpar-filtros"
              aria-label={`Limpar ${nFiltros} filtro${nFiltros !== 1 ? "s" : ""}: ${descricaoFiltros.join(" · ")}`}
              title={`Limpar: ${descricaoFiltros.join(" · ")}`}
              style={isMobile ? undefined : { color: T.text, textDecoration: "underline", textUnderlineOffset: 3 }}
            >
              Limpar
            </Botao>
          </span>
        );

        // Quantos filtros AVANÇADOS estão valendo — o botão que os abre diz o
        // número, senão um recorte por Material fica invisível com a gaveta fechada.
        const nAvancados = [filtros.tipo, filtros.material, filtros.acabamento].filter(v => v.length > 0).length;
        // DUAS LINHAS DE PROPÓSITO, não por quebra: antes era uma fileira só
        // que estourava e deixava "Filtros" sozinho na segunda linha, com o
        // placeholder da busca cortado. Linha 1 = achar (busca + atalhos);
        // linha 2 = recortar (os selects) com o resumo "N filtros ativos ·
        // Limpar" encostado à direita, onde a pessoa termina de filtrar.
        if (!isMobile) return (
          <div style={{ backgroundColor: T.low, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {campoBusca}
              {pillProximos}
              {pillTravadas}
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(v => !v)}
                data-testid="button-toggle-advanced-filters"
                aria-expanded={showAdvancedFilters}
                className="ds-botao"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: alvoDeToque(36, ponteiroGrosso), backgroundColor: showAdvancedFilters ? T.text : "transparent", color: showAdvancedFilters ? T.surface : T.apoio, border: `1px solid ${showAdvancedFilters ? T.text : T.bdark}`, borderRadius: R.pill, padding: "0 12px", fontSize: FS.meta, fontWeight: FW.medio, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                <Filter aria-hidden="true" style={{ width: 13, height: 13 }} />
                Mais filtros
                {nAvancados > 0 && (
                  <span style={{ fontSize: FS.small, fontWeight: FW.forte, padding: "1px 7px", borderRadius: R.pill, backgroundColor: showAdvancedFilters ? "rgba(255,255,255,0.2)" : T.border, color: showAdvancedFilters ? T.surface : T.apoio, fontVariantNumeric: "tabular-nums" }}>{nAvancados}</span>
                )}
                <ChevronDown aria-hidden="true" style={{ width: 12, height: 12, transform: showAdvancedFilters ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <EventFilterDropdown
                values={filtros.evento}
                onValuesChange={v => patchFiltros({ evento: v })}
                options={eventFilterOptions}
              />
              {selects(false)}
              {botaoLimpar}
            </div>
            {showAdvancedFilters && (
              <div style={{ width: "100%", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
                {avancados(true)}
                {(filtros.tipo.length > 0 || filtros.material.length > 0 || filtros.acabamento.length > 0) && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <Botao variante="fantasma" tamanho={ponteiroGrosso ? "toque" : "sm"} onClick={() => patchFiltros({ tipo: [], material: [], acabamento: [] })} data-testid="button-reset-advanced-filters">
                      Limpar filtros avançados
                    </Botao>
                  </div>
                )}
              </div>
            )}
          </div>
        );

        // ── CELULAR: busca sempre à mão + a folha de filtros ──
        // PRIMEIRA DOBRA: busca e "Filtros" dividem UMA linha, e a segunda
        // linha junta os atalhos (Próximos 10 dias, Limpar) com o gatilho do
        // guia. Antes eram busca / Filtros+atalhos / guia em cartão, dentro de
        // uma faixa cinza com 10px de respiro: ~170px até a lista, agora 96.
        return (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {campoBusca}
                {/* Escuro quando há filtro na folha: o recorte ligado se vê
                    sem abrir a folha. */}
                <Botao
                  variante={nFiltrosNaFolha > 0 ? "primario" : "secundario"}
                  tamanho="toque"
                  icone={Filter}
                  onClick={() => setFiltrosAbertos(true)}
                  data-testid="button-abrir-filtros-mobile"
                  aria-haspopup="dialog"
                  style={{ flex: "0 0 auto", padding: "0 12px" }}
                >
                  Filtros{nFiltrosNaFolha > 0 ? ` (${nFiltrosNaFolha})` : ""}
                </Botao>
              </div>
              {/* O EVENTO À VISTA (dono, 21/09: "filtro de eventos no mobile na tela
                  inicial da Gráfica, sem precisar clicar em Filtros"). O MESMO
                  componente, estado e URL da folha — só mudou de lugar: linha
                  própria, largura total, logo abaixo da busca. O X limpa só o
                  evento; o resto da folha fica como está. */}
              <div data-testid="filtro-evento-mobile" style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
                <div style={{ flex: "1 1 0", minWidth: 0 }}>
                  <EventFilterDropdown
                    values={filtros.evento}
                    onValuesChange={v => patchFiltros({ evento: v })}
                    options={eventFilterOptions}
                  />
                </div>
                {filtros.evento.length > 0 && (
                  <Botao tamanho="toque" icone={X} onClick={() => patchFiltros({ evento: [] })} data-testid="button-limpar-evento-mobile"
                    aria-label="Limpar o filtro de evento" title="Limpar o filtro de evento"
                    style={{ flex: "0 0 44px", width: 44, padding: 0 }} />
                )}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {/* "Próximos 10 dias" é o recorte do dia a dia do galpão (o
                    caminhão que sai já): morava DENTRO da folha, a três toques
                    (abrir, ligar, ver). Aqui fica a um. */}
                {pillProximos}
                {pillTravadas}
                {botaoLimpar}
              </div>
            </div>

            {filtrosAbertos && (
              <div
                ref={folhaFiltrosRef}
                role="dialog"
                aria-modal="true"
                aria-label="Filtros da fila"
                data-testid="folha-filtros-mobile"
                style={{
                  position: "fixed", inset: 0, zIndex: 90,
                  height: "100dvh",
                  backgroundColor: T.bg,
                  display: "flex", flexDirection: "column",
                  overscrollBehavior: "contain",
                }}
              >
                {/* Recorte seguro em cima (notch/ilha) e embaixo (home
                    indicator), nos LONGOS — ver o rodapé. */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: "calc(6px + env(safe-area-inset-top))", paddingBottom: 6, paddingLeft: 14, paddingRight: 6, borderBottom: `1px solid ${T.border}`, backgroundColor: T.surface }}>
                  <Filter style={{ width: 16, height: 16, color: T.second }} />
                  <span style={{ fontSize: FS.strong, fontWeight: FW.rotulo, fontFamily: FONT.display, color: T.text }}>
                    Filtros{nFiltros > 0 ? ` · ${nFiltros} ativo${nFiltros !== 1 ? "s" : ""}` : ""}
                  </span>
                  <span style={{ flex: 1 }} />
                  <Botao variante="fantasma" tamanho="toque" icone={X} onClick={() => setFiltrosAbertos(false)}
                    aria-label="Fechar filtros" data-testid="button-fechar-filtros-mobile"
                    style={{ width: 44, padding: 0 }} />
                </div>

                {/* Os MESMOS campos da barra, empilhados. A lista some ao vivo
                    atrás da folha; o rodapé diz quantas sobraram. */}
                <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {selects(true)}
                  <p style={{ margin: "8px 0 0", fontSize: FS.meta, fontWeight: FW.forte, color: T.apoio }}>
                    Avançados
                  </p>
                  {avancados(true)}
                  {(filtros.tipo.length > 0 || filtros.material.length > 0 || filtros.acabamento.length > 0) && (
                    <Botao variante="fantasma" tamanho="toque" onClick={() => patchFiltros({ tipo: [], material: [], acabamento: [] })} data-testid="button-reset-advanced-filters" style={{ alignSelf: "flex-start" }}>
                      Limpar filtros avançados
                    </Botao>
                  )}
                </div>

                {/* LONGOS, não `padding: "10px 14px calc(…env())"`: o valor é o
                    mesmo no navegador, e o atalho com env() some inteiro no
                    parser do jsdom — o teste do celular não o enxergava. */}
                <div style={{ display: "flex", gap: 8, paddingTop: 10, paddingLeft: 14, paddingRight: 14, paddingBottom: "calc(10px + env(safe-area-inset-bottom))", borderTop: `1px solid ${T.border}`, backgroundColor: T.surface }}>
                  {haFiltro && (
                    <Botao tamanho="toque" onClick={limparFiltros} style={{ minHeight: 48 }}>
                      Limpar ({nFiltros})
                    </Botao>
                  )}
                  <Botao variante="primario" tamanho="toque" onClick={() => setFiltrosAbertos(false)} data-testid="button-aplicar-filtros-mobile" style={{ flex: 1, minHeight: 48 }}>
                    Ver {filteredItems.length} peça{filteredItems.length !== 1 ? "s" : ""}
                  </Botao>
                </div>
              </div>
            )}
          </>
        );
      })()}

      {/* ── Tabela Principal ── */}
      <div style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 12 }}>
        {/* ── Resumo do recorte ──
            Era o RODAPÉ da tabela: com 200 peças, "quantas são, quanto m² falta
            e que há entregues escondidas" ficava a metros de rolagem de quem
            precisa decidir o dia. Subiu para a borda de cima da lista, junto dos
            dois chips que descrevem o recorte (e que antes disputavam espaço com
            os botões do cabeçalho). Mesmo texto, mesmas contas, mesmos testids. */}
        {!isLoading && !isError && (filteredItems.length > 0 || complementosAbertos.length > 0 || filtros.complementos || finalizadasNoRecorte.total > 0) && (
          <div
            data-testid="resumo-da-lista"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px 12px", padding: isMobile ? "10px 12px" : "10px 16px", borderBottom: `1px solid ${T.border}`, fontSize: isMobile ? 12 : 13, color: T.second, lineHeight: 1.5 }}
          >
            <div style={{ minWidth: 0, flex: "1 1 320px" }}>
              <span aria-live="polite"><strong style={{ color: T.text, fontVariantNumeric: "tabular-nums" }}>{filteredItems.length}</strong> peça{filteredItems.length !== 1 ? "s" : ""}</span>
              {/* O complemento é +1 linha na contagem (é peça de verdade, com
                  produção própria). Dizer quantas são evita a pergunta "por que
                  agora são 43 se o evento tem 42?". */}
              {(() => {
                const n = resumoDaLista.complementos;
                return n > 0 ? <span style={{ color: CO.text }}> ({n} complemento{n !== 1 ? "s" : ""})</span> : null;
              })()}
              {" · "}
              <strong style={{ color: T.text }}>{resumoDaLista.eventos}</strong> evento{resumoDaLista.eventos !== 1 ? "s" : ""}
              {(() => {
                // O total que importa para a Gráfica é o que AINDA vai ser
                // impresso: peça entregue já saiu da fila e não entra na soma
                // (nem na economia — senão o entregue viraria "economia" falsa).
                // As contas moram em `resumoDaLista` (uma passada, memoizada).
                const { totalM2, printM2, reusedUn } = resumoDaLista;
                if (!totalM2) return null;
                return (
                  <>
                    {" · "}<strong style={{ color: T.text }}>{printM2.toFixed(2)} m²</strong> a produzir
                    {reusedUn > 0 && (
                      /* #047857 (emerald-700, 5,48:1) no lugar de #059669: 3,77:1
                         reprova AA em 13px. Fonte: P.emerald.text de lib/status. */
                      <span style={{ color: TOM.esmeralda.text }}>
                        {" "}(economia de {(totalM2 - printM2).toFixed(2)} m² · {reusedUn} un. reaproveitada{reusedUn !== 1 ? "s" : ""})
                      </span>
                    )}
                  </>
                );
              })()}
              {/* O espelho da regra acima: mostrar dado sem dizer POR QUE ele
                  apareceu também confunde. Escolher um evento revela as entregues
                  DELE (lib/grafica-filtros: a faceta de evento é oferecida porque
                  o clique revela), e a fila de quem filtra por evento passa a ter
                  linhas já terminadas. Uma frase basta — quem quiser só o que
                  falta tem as abas de etapa logo acima. */}
              {(() => {
                // Conta na LISTA, não no statsPool: com um status escolhido junto
                // (evento + "Em produção") não há entregue nenhuma na tela, e a
                // frase seria falsa — o defeito que esta tela mais teme é número
                // que não bate com a lista logo acima.
                if (filtros.evento.length === 0 || filtros.entregues) return null;
                const n = resumoDaLista.entreguesNaLista;
                if (n === 0) return null;
                return (
                  <span data-testid="nota-entregues-do-evento">
                    {" · "}inclui {n} entregue{n !== 1 ? "s" : ""} do evento escolhido
                  </span>
                );
              })()}
              {/* Esconder dado sem dizer que está escondido é pior que o problema:
                  o chip de reversão é parte da feature, não um extra. */}
              {entreguesOcultas > 0 && (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={() => patchFiltros({ entregues: true })}
                    data-testid="chip-entregues-ocultas"
                    title="A tela abre na fila do que falta fazer. Clique para trazer o histórico de entregas de volta."
                    style={{ background: "none", border: "none", padding: 0, fontSize: "inherit", fontWeight: 700, color: TOM.ciano.text, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", ...alvoNoTexto }}
                  >
                    {entreguesOcultas} entregue{entreguesOcultas !== 1 ? "s" : ""} oculta{entreguesOcultas !== 1 ? "s" : ""} · mostrar
                  </button>
                </>
              )}
              {filtros.entregues && (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={() => patchFiltros({ entregues: false })}
                    data-testid="chip-ocultar-entregues"
                    style={{ background: "none", border: "none", padding: 0, fontSize: "inherit", fontWeight: 700, color: TOM.ciano.text, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", ...alvoNoTexto }}
                  >
                    ocultar entregues
                  </button>
                </>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {/* Chip de complementos — clicável e visível TAMBÉM no celular:
                  importante demais para sumir justamente na tela de quem está no
                  galpão. É o atalho para a fila de aumentos sem tirar a peça do
                  bloco do evento a que ela pertence. */}
              {(complementosAbertos.length > 0 || filtros.complementos) && (
                <button
                  type="button"
                  onClick={() => patchFiltros({ complementos: !filtros.complementos })}
                  aria-pressed={filtros.complementos}
                  data-testid="chip-complementos"
                  title={filtros.complementos
                    ? "Mostrando só complementos — toque para ver a lista inteira"
                    : "Mostrar só as peças complementares (aumentos de quantidade pedidos após a produção)"}
                  className="ds-botao"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    minHeight: alvoDeToque(28, isMobile || ponteiroGrosso),
                    backgroundColor: filtros.complementos ? CO.hoverBg : CO.bg,
                    color: CO.text,
                    border: `1px solid ${filtros.complementos ? CO.stripe : CO.border}`,
                    borderRadius: R.pill, padding: "0 12px",
                    fontSize: fsMin(FS.small), fontWeight: FW.forte, cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {filtros.complementos
                    ? <Check aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0 }} />
                    : <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: CO.stripe, display: "inline-block", flexShrink: 0 }} />}
                  {complementoChipLabel}
                </button>
              )}
              {/* Quanto do recorte é evento que já acabou. NÃO é botão: não há o
                  que alternar — a regra do dono é que estas peças aparecem, e um
                  chip que as escondesse desfaria a decisão num clique. É o
                  contrapeso da regra dos contadores (ver `stats`): os números
                  seguem a lista, e este chip diz quanto da lista é trabalho morto
                  que só aceita conferência e entrega.
                  Selo neutro: TOM.neutro.text sobre o bg → 9,42:1. */}
              {finalizadasNoRecorte.total > 0 && (
                <Selo
                  tom="neutro"
                  ponto
                  data-testid="chip-evento-finalizado"
                  title={
                    [
                      finalizadasNoRecorte.encerrado > 0
                        ? `${finalizadasNoRecorte.encerrado} em evento encerrado por um administrador (reabrir o evento traz o trabalho de volta)`
                        : null,
                      finalizadasNoRecorte.realizado > 0
                        ? `${finalizadasNoRecorte.realizado} em evento cuja data já passou (não há volta)`
                        : null,
                    ].filter(Boolean).join(" e ")
                    + ". Elas continuam na fila porque conferir e registrar entrega seguem liberados;"
                    + " produzir, reaproveitar e aumentar quantidade estão bloqueados nelas."
                  }
                  style={{ minHeight: isMobile ? 32 : 28, fontSize: fsMin(FS.small) }}
                >
                  {finalizadasNoRecorte.total} de evento finalizado
                </Selo>
              )}
            </div>
          </div>
        )}
        {/* Rede de segurança do recorte. A peça-filha pode nascer FORA dos
            filtros do operador (status, busca, grupo, percurso, evento, chip de
            complementos): aí a rolagem falharia em silêncio, o pior desfecho
            possível logo depois de um clique. O recorte NUNCA é limpo sozinho —
            só por este botão, quando a pessoa pedir. */}
        {bannerComplemento && (
          <div
            role="status"
            data-testid="banner-complemento-fora-do-recorte"
            style={{ background: CO.bg, border: `1px solid ${CO.border}`, borderRadius: R.md, padding: "10px 12px", margin: "12px 12px 0", fontSize: FS.meta, color: CO.textStrong, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
          >
            <span style={{ flex: 1, minWidth: 0, lineHeight: 1.45 }}>
              <strong>{bannerComplemento.displayId} criado</strong> — está fora dos filtros atuais.
            </span>
            <Botao
              variante="fantasma"
              tamanho={isMobile || ponteiroGrosso ? "toque" : "sm"}
              onClick={mostrarComplementoCriado}
              data-testid="button-mostrar-complemento"
              style={{ color: CO.text, textDecoration: "underline", flexShrink: 0 }}
            >
              Mostrar
            </Botao>
            <Botao
              variante="fantasma"
              tamanho={isMobile || ponteiroGrosso ? "toque" : "sm"}
              icone={X}
              onClick={() => setBannerComplemento(null)}
              aria-label="Dispensar"
              data-testid="button-dispensar-banner-complemento"
              style={{ width: isMobile || ponteiroGrosso ? 44 : 32, padding: 0, color: CO.text, flexShrink: 0 }}
            />
          </div>
        )}
        {isLoading ? (
          /* Silhueta em vez de spinner (UX 27/08): o spinner colapsava a
             altura e a fila chegava EMPURRANDO a tela. */
          <EsqueletoDeFila linhas={8} />
        ) : isError ? (
          /* Erro NÃO é vazio: diz o que falhou e oferece tentar de novo
             (EstadoErro já leva role="alert" e o botão). A margem o descola
             das bordas do cartão da lista. */
          <div style={{ margin: 12 }}>
            <EstadoErro
              titulo={migracaoPendente ? "Atualização do banco pendente" : "Não foi possível carregar as peças"}
              detalhe={migracaoPendente
                ? "Falta rodar a atualização do banco (npm run db:push) para o recurso de aumento de quantidade. Fale com o administrador."
                : "Verifique sua conexão e tente novamente."}
              aoTentarDeNovo={isFetching ? undefined : () => { void refetch(); }}
            />
          </div>
        ) : filteredItems.length === 0 ? (
          /* Três motivos diferentes, três respostas diferentes: recorte
             filtrado (com botão de volta e a lista do que está ativo), só
             entregues escondidas (mostrar é um clique), ou a fila vazia mesmo.
             `temFiltroAtivo` deriva da tabela de campos da lib — era essa lista
             mantida à mão que fazia a tela dizer "Nenhuma peça liberada ainda"
             depois de filtrar por Grupo.

             OS DOIS MOTIVOS JUNTOS: filtrar por Material/Grupo/Percurso/Mês cujo
             recorte inteiro já foi entregue caía no primeiro caso e só oferecia
             "Limpar filtros" — as entregues do recorte ficavam escondidas SEM
             aviso, e limpar o filtro era jogar fora justamente a pergunta que a
             pessoa fez. É o mesmo beco do relato do NORTE, na versão das facetas
             que NÃO revelam (evento e status revelam; ver a regra em
             lib/grafica-filtros). Aqui ele se paga com o aviso e o atalho: o
             botão de mostrar vira o principal, porque é o que a pessoa procura. */
          <div style={{ margin: 12 }}>
            <EstadoVazio
              icone={Package}
              titulo={haFiltro && entreguesOcultas > 0 ? "Neste recorte, já foi tudo entregue"
                : haFiltro ? "Nenhuma peça encontrada"
                : entreguesOcultas > 0 ? "Tudo entregue por aqui"
                : "Nenhuma peça liberada ainda"}
              descricao={
                <>
                  {haFiltro ? `Recorte atual: ${descricaoFiltros.join(" · ")}`
                    : entreguesOcultas > 0 ? `${entreguesOcultas} peça${entreguesOcultas !== 1 ? "s" : ""} já entregue${entreguesOcultas !== 1 ? "s" : ""} ${entreguesOcultas !== 1 ? "estão" : "está"} fora da fila.`
                    : "Quando a Arte liberar peças para produção, elas aparecem aqui"}
                  {haFiltro && entreguesOcultas > 0 && (
                    <span style={{ display: "block", marginTop: 6 }}>
                      {entreguesOcultas} peça{entreguesOcultas !== 1 ? "s" : ""} deste recorte {entreguesOcultas !== 1 ? "estão" : "está"} fora da fila por já ter{entreguesOcultas !== 1 ? "em" : ""} sido entregue{entreguesOcultas !== 1 ? "s" : ""}.
                    </span>
                  )}
                </>
              }
              acao={(entreguesOcultas > 0 || haFiltro) ? (
                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                  {/* Mostrar as entregues é o principal quando existe: é o que
                      a pessoa procura — limpar o filtro jogaria fora a pergunta. */}
                  {entreguesOcultas > 0 && (
                    <Botao variante="primario" tamanho="toque" onClick={() => patchFiltros({ entregues: true })} data-testid="button-mostrar-entregues-vazio">
                      {entreguesOcultas === 1 ? "Mostrar a peça entregue" : `Mostrar as ${entreguesOcultas} entregues`}
                    </Botao>
                  )}
                  {haFiltro && (
                    <Botao variante={entreguesOcultas > 0 ? "secundario" : "primario"} tamanho="toque" onClick={limparFiltros} data-testid="button-limpar-filtros-vazio">
                      Limpar filtros ({nFiltros})
                    </Botao>
                  )}
                </div>
              ) : undefined}
            />
          </div>
        ) : usaCards ? (
          /* ── Cards: celular E tablet (conteúdo < 820px, ver `densidade`) ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 8px' }}>
            {(linhasRenderizadas as any[]).map((item: any, index: number) => {
              const prev = index > 0 ? (linhasRenderizadas as any[])[index - 1] : null;
              const corte = cortePorItem.get(item.id);
              const showEvHeader = !prev || prev.event?.name !== item.event?.name;
              const isSelected = bulkSelectedIds.has(item.id);
              // Em revisão = só leitura: o trabalho está CHEGANDO, não chegou.
              const emRevisao = EM_REVISAO.has(item.status);
              const canConferItem = canConfer(item) && !emRevisao;
              const podeEmbalarPeca = podeEmbalar(item);
              const bulkEligible = bulkConferMode ? canConferItem : bulkPackMode ? podeEmbalarPeca : false;
              // ── Complemento: os mesmos três números do desktop ──
              const ehComplemento = isComplement(item);
              const coAberto = complementOpen(item);
              const maeDisplayId = ehComplemento ? parentDisplayIdOf(item) : "";
              const complQty = complementsQtyOf(item); // > 0 → esta é a MÃE
              const isNovo = item.id === novoComplementoId;
              // Trilho de ações: dois grupos separados por um divisor. FLUXO
              // (sólidos, o que a Gráfica faz com a peça) e CONTRATO (tintados,
              // o que muda o pedido — papel admin|solicitacao).
              // !emRevisao em TODAS: em Revisão a Gráfica só OLHA (regra do
              // dono, 25/08) — a peça é trabalho chegando, não chegou.
              const mostraAumentar = !bulkOn && !emRevisao && !soVisualizaKit(item) && podeAumentarQuantidade(item, podeMexerQtd);
              const podeProduzirAqui = !emRevisao && canProduce && coAberto && !isProduced(item) && !isPosConferencia(item) && !item.isReuse && remainingProduce(item) > 0;
              const podeCancelarCompl = podeMexerQtd && !soVisualizaKit(item) && ehComplemento && complementUntouched(item);
              // Evento finalizado: o botão continua na tela, DESABILITADO com o
              // motivo — sumir devolveria o buraco que esconder a peça criava
              // (nada explica por que aquela linha não faz o que as vizinhas
              // fazem). Espelha as rotas: produzir e aumentar quantidade são
              // 409; conferir, entregar e cancelar complemento passam.
              const selo = seloDoItem(item);
              // AS AÇÕES DA TABELA, NO CARD. Desde que o card passou a valer
              // também para o tablet (conteúdo < 820px), ele virou o ÚNICO
              // layout dessa faixa — e sem estes quatro, Produzir/Continuar da
              // peça comum, Reaproveitar, Ajustar e Corrigir reaproveitamento e
              // Devolver para a Revisão ficavam inalcançáveis ali (a ficha de
              // detalhe não os tem). As condições são CÓPIA LITERAL dos gates da
              // coluna de Ações da tabela, lá embaixo: se mudar um, mude o
              // outro — `grafica-mobile.test.ts` confere que as duas batem.
              // O `!bulkOn` já vem do trilho, que só existe fora do lote.
              const podeProduzirPeca = !emRevisao && canProduce && !isDelivered(item) && !isProduced(item) && !isPosConferencia(item) && !item.isReuse;
              const podeReaproveitarPeca = !emRevisao && !pecaTravada(item) && !soVisualizaKit(item) && !isDelivered(item) && !isPosConferencia(item) && (!isProduced(item) ? tetoReaproveitar(item) > 0 : podeMexerQtd && qtyOf(item) > 0);
              const podeCorrigirReaprov = !emRevisao && !soVisualizaKit(item) && (isProduced(item) || isAdmin) && reusedTotalOf(item) > 0
                && conferredOf(item) === 0 && deliveredOf(item) === 0;
              const podeDevolverPeca = canProduce && podeDevolverParaRevisao(item);
              const temGrupoFluxo = podeProduzirAqui || podeProduzirPeca || podeReaproveitarPeca || podeCorrigirReaprov || podeDevolverPeca || podeEmbalarPeca || isPacked(item) || (podeConferir && canConferItem) || isDelivered(item);
              const temGrupoContrato = mostraAumentar || podeCancelarCompl;

              return (
                <LinhaMemo key={item.id} deps={depsDaLinha(item, [index > 0, showEvHeader, corte?.chave, corte?.total, corte?.ocultas, etiquetaveisPorEvento.get(String(item.eventId)) ?? 0])} render={() => (
                <Fragment>
                  {showEvHeader && (
                    <div style={{ padding: '8px 10px 8px', marginTop: index > 0 ? 8 : 0, background: T.text, borderRadius: '8px 8px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Package aria-hidden="true" style={{ width: 14, height: 14, color: T.accent, flexShrink: 0 }} />
                        {/* 13px (era 11): é o nome que o operador procura com o
                            caminhão parado na porta. Quebra linha, nunca corta. */}
                        <span style={{ fontSize: FS.read, fontWeight: FW.rotulo, color: T.surface, fontFamily: FONT.display, minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.25 }}>
                          {item.event?.name || 'Sem Evento'}
                        </span>
                        {/* A data aqui era o INÍCIO do evento — para a Gráfica o
                            que manda é a SAÍDA do caminhão, a mesma que ordena
                            a lista e o cabeçalho do desktop. */}
                        {item.event?.truckDepartureDate && (
                          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flexShrink: 0 }}>
                            <Truck aria-hidden="true" style={{ width: 12, height: 12 }} />
                            Saída {new Date(item.event.truckDepartureDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: 'UTC' })}
                          </span>
                        )}
                      </div>
                      {/* Prazo e etiquetas NA MESMA linha (eram duas): o link
                          ganha alvo de 44px com a pílula visível de ~30 dentro. */}
                      {(item.event || (etiquetaveisPorEvento.get(String(item.eventId)) || 0) > 0 || (tubaveisPorEvento.get(String(item.eventId)) || 0) > 0) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {item.event && <DeadlineChip event={item.event} fonte={12} />}
                          {(etiquetaveisPorEvento.get(String(item.eventId)) ?? 0) > 0 && (
                            <Link
                              href={`/eventos/${item.eventId}/etiquetas?de=grafica`}
                              data-testid={`link-etiquetas-mobile-${item.eventId}`}
                              title="Imprimir as etiquetas das peças já conferidas deste evento"
                              style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', minHeight: 44, textDecoration: 'none' }}
                            >
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.28)', color: T.surface, fontSize: FS.meta, fontWeight: FW.rotulo }}>
                                <Tag aria-hidden="true" style={{ width: 12, height: 12 }} />
                                Etiquetas ({etiquetaveisPorEvento.get(String(item.eventId))})
                              </span>
                            </Link>
                          )}
                          {/* TUBOS (dono, 14/09): o painel de agrupar e entregar
                              por tubo, na mesma linha e no mesmo desenho das
                              Etiquetas — alvo de 44px com a pílula dentro. */}
                          {(tubaveisPorEvento.get(String(item.eventId)) ?? 0) > 0 && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setTubosDoEvento({ id: String(item.eventId), name: item.event?.name ?? "Evento" }); }}
                              data-testid={`button-tubos-mobile-${item.eventId}`}
                              title="Agrupar as peças em tubos e entregar por tubo"
                              style={{ marginLeft: (etiquetaveisPorEvento.get(String(item.eventId)) || 0) > 0 ? 0 : 'auto', display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: 0, background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.28)', color: T.surface, fontSize: FS.meta, fontWeight: FW.rotulo }}>
                                <Package aria-hidden="true" style={{ width: 12, height: 12 }} />
                                Tubos
                              </span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div
                    style={{
                      // Altura acompanha a arte: com a peça na mão, é pelo
                      // desenho que se reconhece o item na lista.
                      display: 'flex', alignItems: 'stretch', minHeight: 74,
                      // Complemento em aberto tinge o card inteiro — no celular
                      // não há coluna nenhuma para carregar o sinal, e é no
                      // celular que a Gráfica trabalha com a peça na mão.
                      background: isNovo ? CO.hoverBg : isSelected ? CO.hoverBg : coAberto ? CO.bg : T.surface,
                      border: `1.5px solid ${isSelected ? T.accent : (isNovo || coAberto) ? CO.border : T.border}`,
                      // Realce de 5 s da peça recém-criada: no card o anel é
                      // caminho livre (a tabela é que não pinta boxShadow).
                      boxShadow: isNovo ? '0 0 0 3px rgba(249,115,22,0.45)' : undefined,
                      borderRadius: showEvHeader ? '0 0 12px 12px' : 12,
                      overflow: 'hidden',
                      cursor: bulkOn ? (bulkEligible ? 'pointer' : undefined) : 'pointer',
                      transition: 'border-color 0.12s, background 0.12s',
                    }}
                    data-item-row={item.id}
                    /* O "checkbox" da esquerda é um <div> desenhado, não um
                       campo: em modo de entrega em lote não havia como marcar
                       peça alguma sem mouse. role/aria-checked dão ao card o
                       papel que a caixinha só aparenta ter. */
                    {...(bulkOn && bulkEligible ? {
                      role: 'checkbox' as const,
                      tabIndex: 0,
                      'aria-checked': isSelected,
                      'aria-label': `Selecionar ${item.displayId} para ${bulkConferMode ? 'conferência' : 'entrega'}`,
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBulkItem(item.id); }
                      },
                    } : {})}
                    // Fora do modo lote o toque no corpo do card abre o detalhe
                    // — o ramo mobile não tinha NENHUM caminho até ele (a arte
                    // e os botões de ação já fazem stopPropagation).
                    onClick={bulkOn
                      ? (bulkEligible ? () => toggleBulkItem(item.id) : undefined)
                      : () => setViewDetailsItem(item)}
                  >
                    {/* Left stripe / checkbox */}
                    {bulkOn ? (
                      bulkEligible ? (
                        <div style={{ width: 52, flexShrink: 0, background: isSelected ? T.accent : N.n2, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
                          <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isSelected ? T.surface : T.bdark}`, background: isSelected ? 'rgba(255,255,255,0.25)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {isSelected && <Check style={{ width: 14, height: 14, color: T.surface }} />}
                          </div>
                        </div>
                      ) : (
                        <div style={{ width: 4, flexShrink: 0, background: coAberto ? CO.stripe : T.border }} />
                      )
                    ) : (
                      // A tarja do complemento vem ANTES do verde/laranja/cinza:
                      // enquanto ele não é entregue, é o sinal mais forte do card.
                      <div style={{ width: 4, flexShrink: 0, background: coAberto ? CO.stripe : isDelivered(item) ? TOM.esmeralda.border : T.border }} />
                    )}

                    {/* COLUNA: [arte + texto] em cima, AÇÕES embaixo na largura
                        inteira do cartão. As ações moravam DENTRO da coluna de
                        texto, ao lado da arte de 88px: em 360px sobravam ~205px
                        e cada botão caía sozinho numa linha (Produzir /
                        Reaproveitar / Devolver empilhados, 150px de botões). */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'stretch', minHeight: item.approvalThumbUrl ? 104 : 74 }}>
                    {/* Arte aprovada — no celular é ela que identifica a peça
                        de relance, na hora de conferir com o material na mão.
                        Some no modo lote era o pior momento possível para
                        escondê-la: é exatamente aí que o operador está com a
                        peça na mão marcando o que já conferiu. No lote ela
                        fica mais estreita para conviver com a caixa de seleção,
                        e vira <div> (não link) para o toque continuar
                        selecionando o card em vez de abrir outra aba. */}
                    {item.approvalThumbUrl && (() => {
                      const thumbW = bulkOn ? 64 : 88;
                      const thumbImg = (
                        <img src={convertGCSUrlToLocalPath(item.approvalThumbUrl)} alt={`Arte da peça ${item.displayId}`}
                          loading="lazy" decoding="async"
                          style={{ maxWidth: '100%', maxHeight: 104, objectFit: 'contain', display: 'block' }}
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      );
                      const boxStyle: React.CSSProperties = {
                        width: thumbW, minHeight: 44, flexShrink: 0, alignSelf: 'stretch', backgroundColor: T.bg,
                        borderRight: `1px solid ${T.border}`, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', padding: 5,
                      };
                      if (bulkOn) {
                        return (
                          <div style={boxStyle} data-testid={`thumb-art-mobile-${item.id}`}>{thumbImg}</div>
                        );
                      }
                      return (
                        <a
                          href={convertGCSUrlToLocalPath(item.approvalThumbUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          title="Abrir a arte aprovada"
                          data-testid={`thumb-art-mobile-${item.id}`}
                          style={boxStyle}
                        >
                          {thumbImg}
                        </a>
                      );
                    })()}

                    {/* Content */}
                    <div style={{ flex: 1, padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        {/* #047857 (5,48:1) e não #059669 (3,77:1): 13px/700
                            precisa passar AA. Ver lib/status.ts P.emerald. */}
                        {/* 15px (era 13): o código é o que se confere contra a
                            etiqueta do material, de relance. */}
                        <span style={{ fontFamily: FONT.mono, fontSize: 15, fontWeight: 700, color: item.isReuse ? TOM.esmeralda.text : T.accentText }}>
                          {(() => { const { base, suffix } = splitDisplayId(item.displayId); return (<>{base}{suffix && <span style={{ color: CO.suffix }}>{suffix}</span>}</>); })()}
                        </span>
                        <StatusPill status={statusDeExibicao(item)} size="sm" showDot={false} />
                        <SeloMolde peca={item} />
                        {(() => {
                          const d = diasNaFase(item, new Date());
                          if (d === null || d < 1) return null;
                          const tom = tomDaIdade(d);
                          return <span title={`Está neste status há ${d} dia(s)`} style={{ fontSize: 12, fontFamily: FONT.mono, fontWeight: tom.peso, color: tom.cor, whiteSpace: 'nowrap' }}>há {d}d</span>;
                        })()}
                        {/* Paridade com a tabela: o progresso da impressão
                            ocupa a linha inteira do cartão (flexBasis 100%). */}
                        {isInProd(item) && <span style={{ flexBasis: '100%' }}><ProgressoImpressao item={item} fonte={12} onIniciarResto={podeProduzirPeca && !selo ? () => openProductionModal(item, true) : undefined} /></span>}
                        {(pecaTravada(item) || podeMexerNaTrava(item)) && <span style={{ flexBasis: '100%' }}>{travaDaLinha(item, 12, 44)}</span>}
                        {(isInProd(item) || item.maquinaPrevista) && <SeloFilaDaImpressora item={item} fonte={12} />}
                        {item.isReuse && <Selo forma="retangulo" tom="esmeralda" style={{ fontSize: FS.meta, padding: '1px 6px' }}>Reaprov.</Selo>}
                        {/* Selo do complemento: sólido enquanto o lote está em
                            aberto (trabalho novo), outline depois de entregue —
                            a identidade fica, o alarme não. */}
                        {ehComplemento && (
                          <Selo
                            forma="retangulo"
                            cores={coAberto ? { bg: CO.solidBg, text: CO.solidText, border: CO.solidBg } : TOM.laranja}
                            data-testid={`badge-complemento-mobile-${item.id}`}
                            title={item.complementReason ? `Motivo: ${item.complementReason}` : `Complemento de ${maeDisplayId}`}
                            style={{ fontSize: FS.meta, padding: '1px 6px' }}
                          >
                            {coAberto ? `+${qtyOf(item)} compl.` : 'Compl.'}
                          </Selo>
                        )}
                        {/* Mãe: selo espelho. Sem ele ninguém entende por que
                            uma peça entregue "ganhou parente" logo abaixo. */}
                        {complQty > 0 && (
                          <Selo
                            forma="retangulo"
                            tom="laranja"
                            title={`Contratado total: ${contractedTotalOf(item)} un. (${qtyOf(item)} + ${complQty})`}
                            style={{ fontSize: FS.meta, padding: '1px 6px' }}
                          >
                            Tem +{complQty}
                          </Selo>
                        )}
                        {/* EVENTO FINALIZADO — o selo que paga a volta destas
                            peças à fila. Sem ele o operador não tem como saber
                            que o evento acabou, e é essa informação que muda a
                            decisão dele: nesta linha só conferência e entrega
                            funcionam. Fica na MESMA faixa do status, porque é
                            do mesmo tipo de fato. */}
                        {selo && (
                          <Selo
                            forma="retangulo"
                            ponto
                            cores={selo}
                            data-testid={`badge-evento-finalizado-mobile-${item.id}`}
                            title={selo.hint}
                            style={{ fontSize: FS.meta, padding: '1px 6px' }}
                          >
                            {selo.label}
                          </Selo>
                        )}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.type}</div>
                      {/* Identidade permanente: de quem este lote é complemento,
                          quem pediu e quando. Não some depois da entrega. */}
                      {ehComplemento && (
                        <div style={{ fontSize: 12, fontWeight: 600, color: CO.textStrong, lineHeight: 1.3 }}>
                          Complemento de {maeDisplayId}
                          {item.complementRequestedBy ? ` · ${item.complementRequestedBy}` : ''}
                          {item.complementRequestedAt ? `, ${fmtDataHora(item.complementRequestedAt)}` : ''}
                        </div>
                      )}
                      {/* A DESCRIÇÃO é o que distingue duas peças do mesmo tipo
                          ("Banner" x "Banner"): o desktop sempre mostrou, o
                          celular não — e é no celular que se confere com a
                          peça na mão. Duas linhas: nome de peça costuma ser
                          longo e uma linha só virava reticência inútil. */}
                      {item.description && item.description !== item.type && (
                        <div style={{
                          fontSize: 13, color: item.isReuse ? TOM.esmeralda.text : T.second,
                          fontWeight: item.isReuse ? 600 : 400, lineHeight: 1.35,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}>
                          {item.description}
                        </div>
                      )}
                      {/* QUANTIDADES — o desktop tem as colunas QTD, REAPROV. e
                          PROD; o celular não mostrava número nenhum, e é nele
                          que se produz e confere com a peça na mão. Cada etapa
                          só aparece depois de existir, para a linha não virar
                          uma fileira de zeros. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: T.text, fontFamily: FONT.display, lineHeight: 1 }}>
                          {qtyOf(item)}
                          <span style={{ fontSize: 12, fontWeight: 600, color: T.second, marginLeft: 3 }}>un.</span>
                        </span>
                        {item.isPriority && (
                          <span data-testid={`chip-prioritaria-${item.id}`} style={qtyChip(TOM.perigo.text, TOM.perigo.bg)} title="Peça prioritária — marcada pela Solicitação para sair na frente">
                            Prioritária
                          </span>
                        )}
                        {emRevisao && (
                          <span data-testid={`chip-revisao-${item.id}`} style={qtyChip(P.fuchsia.text, P.fuchsia.bg)} title="Esta peça ainda está na Revisão Final — aparece aqui para a Gráfica ver o que está chegando. As ações liberam quando a Revisão Final aprovar.">
                            Em revisão
                          </span>
                        )}
                        {reusedTotalOf(item) > 0 && (
                          <span style={qtyChip(TOM.esmeralda.text, TOM.esmeralda.bg)} title={item.isReuse ? 'Peça inteira reaproveitada' : `${reusedTotalOf(item)} de ${qtyOf(item)} un. reaproveitadas`}>
                            Reaprov. {reusedTotalOf(item)}
                          </span>
                        )}
                        {producedOf(item) > 0 && (
                          <span style={qtyChip(T.accentText, TOM.laranja.bg)} title={`${producedOf(item)} de ${qtyOf(item)} un. produzidas`}>
                            Prod. {producedOf(item)}
                          </span>
                        )}
                        {conferredOf(item) > 0 && (
                          <span style={qtyChip(TOM.ciano.text, TOM.ciano.bg)} title={`${conferredOf(item)} de ${qtyOf(item)} un. conferidas`}>
                            Conf. {conferredOf(item)}
                          </span>
                        )}
                        {deliveredOf(item) > 0 && (
                          <span style={qtyChip(TOM.sucesso.text, TOM.sucesso.bg)} title={`${deliveredOf(item)} de ${qtyOf(item)} un. entregues`}>
                            Entreg. {deliveredOf(item)}
                          </span>
                        )}
                        {/* Paridade com a tabela: o tubo em que a peça vai. */}
                        {seloDoTubo(item) && (
                          <button type="button" data-testid={`chip-tubo-card-${item.id}`} title={tituloDoTubo(item)}
                            aria-label={`${seloDoTubo(item)} — ver o que está no tubo`}
                            onClick={e => { if (bulkOn) return; e.stopPropagation(); abrirTuboDaPeca(item); }}
                            /* Alvo de 44px no dedo; o desenho do selo fica no span de dentro. */
                            style={{ minHeight: 44, flexBasis: '100%', padding: 0, border: 'none', background: 'none', display: 'flex', alignItems: 'center', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                            <span style={{ ...qtyChip(T.accentText, TOM.laranja.bg), border: `1px solid ${TOM.laranja.border}`, whiteSpace: 'normal' }}>
                              {fechamentoDoTubo.has(item.tuboId) && <Camera aria-hidden="true" style={{ width: 10, height: 10, marginRight: 3, verticalAlign: -1 }} />}
                              {seloDoTubo(item) ?? ""}
                            </span>
                          </button>
                        )}
                      </div>
                      {/* MOTIVO do aumento — a informação principal deste card,
                          por extenso (duas linhas): é o "e claro isso ficar nos
                          logs" resolvido sem abrir ficha nenhuma. */}
                      {coAberto && item.complementReason && (
                        <div style={{ fontSize: 12, color: CO.textStrong, display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 2, lineHeight: 1.35 }}>
                          <PlusCircle style={{ width: 11, height: 11, color: CO.text, flexShrink: 0, marginTop: 1 }} />
                          <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {item.complementReason}
                          </span>
                        </div>
                      )}
                      {item.observations && (
                        <div style={{ fontSize: 12, color: TOM.alerta.text, display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 1, lineHeight: 1.35 }}>
                          <AlertCircle aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0, marginTop: 1 }} />{item.observations}
                        </div>
                      )}
                    </div>
                    </div>

                      {/* AÇÕES — faixa no PÉ do card, não mais um trilho de 116px à
                          direita. O trilho roubava um terço da largura em 390px e
                          espremia tipo e descrição em reticências justamente na
                          tela de quem confere com a peça na mão; no pé, cada botão
                          ganha largura de dedo (≥ 112px, 44 de altura) e o texto da
                          peça respira. Some em QUALQUER modo de lote (senão os
                          botões disputavam o toque com a seleção). */}
                      {/* ORDEM VISUAL (CSS order, o DOM segue o da tabela): a
                          ação PRINCIPAL da etapa — Produzir/Continuar, Conferir,
                          Entregar — vem primeiro e mais larga (2 1 150px); as
                          secundárias (Reaproveitar, Corrigir, Devolver) dividem a
                          linha de baixo; contrato (Aumentar, Cancelar) por último.
                          8px entre botões: com 6 o dedo de luva pegava o vizinho. */}
                      {/* MOLDE (22/09): uma ação só — "Marcar como produzido" (ou desfazer). */}
                      {!bulkOn && ehMolde(item) && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 8, padding: '0 12px 12px' }}>
                          <AcoesDoMolde item={item} podeProduzir={canProduce} selo={selo} cartao />
                        </div>
                      )}
                      {!bulkOn && !ehMolde(item) && (temGrupoFluxo || temGrupoContrato) && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 8, padding: '0 12px 12px' }}>
                          {/* PRODUZIR — o celular só tinha Entregar e Conferir.
                              Num complemento isso é o pior buraco possível: a
                              Gráfica em campo vê o alerta laranja e não tem o que
                              fazer com ele. Este é o "Produzir N" do complemento
                              aberto; a peça comum usa o Produzir/Continuar logo
                              abaixo. Mesmo gate de papel do desktop, que o
                              servidor também valida. */}
                          {podeProduzirAqui && (
                            <Botao
                              variante="primario"
                              tamanho="toque"
                              icone={Play}
                              onClick={e => { e.stopPropagation(); if (!seloDaImpressao(item, selo)) openProductionModal(item); }}
                              disabled={!!seloDaImpressao(item, selo)}
                              title={seloDaImpressao(item, selo) ? motivoAcaoBloqueada(seloDaImpressao(item, selo)!.motivo, "produzir") : undefined}
                              data-testid={`button-production-mobile-${item.id}`}
                              {...bloqueioDaTrava(item)}
                              // Laranja sólido do complemento: é trabalho NOVO. A
                              // quebra de linha é permitida (o rótulo com a
                              // impressora não cabe numa linha em 360px).
                              style={{ ...corDaAcao(CO.solidBg), order: 0, flex: '2 1 150px', minHeight: 48, padding: '0 12px', whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.15 }}
                            >
                              {isInProd(item) ? rotuloAcaoImpressao(item) : `Imprimir ${remainingProduce(item)}`}
                            </Botao>
                          )}
                          {/* PRODUZIR / CONTINUAR da peça comum — o mesmo botão
                              da tabela (mesmo gate, mesmo modal, mesmo bloqueio
                              de evento finalizado). O complemento aberto já tem
                              o "Produzir N" logo acima; não repete. */}
                          {podeProduzirPeca && !podeProduzirAqui && (
                            <Botao
                              variante="primario"
                              tamanho="toque"
                              icone={Play}
                              onClick={e => { e.stopPropagation(); if (!seloDaImpressao(item, selo)) openProductionModal(item); }}
                              disabled={!!seloDaImpressao(item, selo)}
                              title={seloDaImpressao(item, selo)
                                ? motivoAcaoBloqueada(seloDaImpressao(item, selo)!.motivo, "produzir")
                                : isInProd(item) ? tituloAcaoImpressao(item) : "Escolher a máquina e iniciar a impressão"}
                              data-testid={`button-production-card-${item.id}`}
                              {...bloqueioDaTrava(item)}
                              style={{ order: 0, flex: '2 1 150px', minHeight: 48, padding: '0 12px', whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.15 }}
                            >
                              {isInProd(item) ? rotuloAcaoImpressao(item) : 'Imprimir'}
                            </Botao>
                          )}
                          {podeTirarBloqueada(item, selo) && (
                            <span style={{ order: 0, flex: '1 1 100%' }}>
                              <TirarDaImpressoraBloqueada item={item} fonte={13} alvo={44} pendente={mutacoesDeImpressao.mexerNaImpressoraMutation.isPending} onTirar={(m) => tirarBloqueada(item, m)} />
                            </span>
                          )}
                          {/* REAPROVEITAR / AJUSTAR — mesma edição em linha da
                              tabela (mesmo estado, mesma mutação), só que com
                              alvos de 44px e ocupando a largura do card: o
                              campo numérico ao lado de outros botões é onde o
                              dedo erra. */}
                          {podeReaproveitarPeca && (
                            reuseConfirmItemId === item.id ? (
                              <div style={{ order: 1, flex: '1 1 100%', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }} onClick={e => e.stopPropagation()}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: TOM.esmeralda.text, whiteSpace: 'nowrap' }}>
                                  {isProduced(item) ? 'Reaprov. total:' : 'Reaproveitar:'}
                                </span>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  min={isProduced(item) ? 0 : 1}
                                  max={isProduced(item) ? qtyOf(item) : tetoReaproveitar(item)}
                                  value={reuseQty}
                                  onChange={e => setReuseQty(Math.max(isProduced(item) ? 0 : 1, Math.min(isProduced(item) ? qtyOf(item) : tetoReaproveitar(item), parseInt(e.target.value) || 0)))}
                                  aria-label={isProduced(item) ? `Total reaproveitado de ${item.displayId}` : `Quantas unidades de ${item.displayId} reaproveitar`}
                                  data-testid={`input-reuse-qty-card-${item.id}`}
                                  // 16px: abaixo disso o iOS dá zoom na página ao focar o campo.
                                  style={{ width: 72, minHeight: 44, padding: '0 6px', borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 16, fontWeight: 700, color: T.text, textAlign: 'center' }}
                                />
                                <span style={{ fontSize: 13, color: T.second, whiteSpace: 'nowrap' }}>de {isProduced(item) ? qtyOf(item) : tetoReaproveitar(item)}</span>
                                <Botao
                                  variante="primario"
                                  tamanho="toque"
                                  carregando={markReuseMutation.isPending}
                                  onClick={() => markReuseMutation.mutate(isProduced(item)
                                    ? { itemId: item.id, reuseTotal: reuseQty }
                                    : { itemId: item.id, qty: reuseQty })}
                                  data-testid={`button-reuse-confirm-card-${item.id}`}
                                  style={{ ...corDaAcao(TOM.esmeralda.text), flex: '1 1 auto' }}
                                >
                                  Confirmar
                                </Botao>
                                <Botao
                                  tamanho="toque"
                                  icone={X}
                                  onClick={() => setReuseConfirmItemId(null)}
                                  aria-label="Cancelar reaproveitamento"
                                  style={{ width: 44, padding: 0, flexShrink: 0 }}
                                />
                              </div>
                            ) : (
                              <Botao
                                tamanho="toque"
                                icone={Recycle}
                                onClick={e => { e.stopPropagation(); if (selo) return; setReuseConfirmItemId(item.id); setReuseQty(isProduced(item) ? reusedTotalOf(item) : tetoReaproveitar(item)); }}
                                disabled={!!selo}
                                title={selo
                                  ? motivoAcaoBloqueada(selo.motivo, "marcar reaproveitamento")
                                  : isProduced(item)
                                    ? `Ajustar reaproveitamento (0 a ${qtyOf(item)}) — converte entre produzidas e reaproveitadas, nas duas direções`
                                    : `Reaproveitar (pula produção) — até ${remainingReuse(item)} un.`}
                                data-testid={`button-reuse-card-${item.id}`}
                                style={{ ...corTintada(TOM.esmeralda), order: 1, flex: '1 1 100px', padding: '0 10px', fontSize: FS.body }}
                              >
                                {isProduced(item) ? 'Ajustar reaprov.' : 'Reaproveitar'}
                              </Botao>
                            )
                          )}
                          {/* CORRIGIR REAPROVEITAMENTO — idem, espelho da tabela. */}
                          {podeCorrigirReaprov && (
                            correctReuseItemId === item.id ? (
                              <div style={{ order: 1, flex: '1 1 100%', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }} onClick={e => e.stopPropagation()}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: TOM.alerta.text, whiteSpace: 'nowrap' }}>Reaprov.:</span>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  min={0}
                                  max={isAdmin ? qtyOf(item) : qtyOf(item) - 1}
                                  value={correctReuseQty}
                                  autoFocus
                                  onFocus={e => e.currentTarget.select()}
                                  onChange={e => setCorrectReuseQty(Math.max(0, Math.min(isAdmin ? qtyOf(item) : qtyOf(item) - 1, parseInt(e.target.value) || 0)))}
                                  aria-label="Quantidade reaproveitada corrigida"
                                  data-testid={`input-correct-reuse-card-${item.id}`}
                                  style={{ width: 72, minHeight: 44, padding: '0 6px', borderRadius: 8, border: `1px solid ${TOM.alerta.dot}`, fontSize: 16, fontWeight: 700, color: T.text, textAlign: 'center' }}
                                />
                                <span style={{ fontSize: 13, color: T.second, whiteSpace: 'nowrap' }}>de {qtyOf(item)}</span>
                                <Botao
                                  variante="primario"
                                  tamanho="toque"
                                  carregando={correctReuseMutation.isPending}
                                  onClick={() => correctReuseMutation.mutate({ itemId: item.id, correctedReuseQty: correctReuseQty })}
                                  data-testid={`button-correct-reuse-confirm-card-${item.id}`}
                                  style={{ ...corDaAcao(TOM.alerta.text), flex: '1 1 auto' }}
                                >
                                  Confirmar
                                </Botao>
                                <Botao
                                  tamanho="toque"
                                  icone={X}
                                  onClick={() => setCorrectReuseItemId(null)}
                                  aria-label="Cancelar correção do reaproveitamento"
                                  style={{ width: 44, padding: 0, flexShrink: 0 }}
                                />
                              </div>
                            ) : (
                              <Botao
                                tamanho="toque"
                                icone={RotateCcw}
                                onClick={e => { e.stopPropagation(); if (selo) return; setCorrectReuseItemId(item.id); setCorrectReuseQty(reusedTotalOf(item)); }}
                                disabled={!!selo}
                                title={selo
                                  ? motivoAcaoBloqueada(selo.motivo, "corrigir o reaproveitamento")
                                  : "Corrigir a quantidade reaproveitada desta peça"}
                                data-testid={`button-correct-reuse-card-${item.id}`}
                                style={{ ...corTintada(TOM.alerta), order: 1, flex: '1 1 100px', padding: '0 10px', fontSize: FS.body }}
                              >
                                Corrigir reaprov.
                              </Botao>
                            )
                          )}
                          {/* DEVOLVER PARA A REVISÃO — contorno, saída de exceção.
                              No card cabe o rótulo (não há coluna sticky
                              roubando largura, que era o motivo do só-ícone na
                              tabela). Sem bloqueio de evento finalizado, como lá. */}
                          {podeDevolverPeca && (
                            <Botao
                              tamanho="toque"
                              icone={Undo2}
                              onClick={e => { e.stopPropagation(); setDevolverItem(item); setDevolverMotivo(""); }}
                              title="Devolver para a Revisão Final — a peça sai da fila da Gráfica"
                              aria-label={`Devolver ${item.displayId} para a Revisão Final`}
                              data-testid={`button-devolver-revisao-card-${item.id}`}
                              style={{ order: 1, flex: '1 1 100px', padding: '0 10px', fontSize: FS.body, color: TOM.perigo.text, borderColor: TOM.perigo.border }}
                            >
                              Devolver
                            </Botao>
                          )}
                          {podeConferir && canConferItem && (
                            <Botao
                              variante="primario"
                              tamanho="toque"
                              icone={CheckCircle}
                              onClick={e => { e.stopPropagation(); openConferenceModal(item); }}
                              data-testid={`button-conferir-card-${item.id}`}
                              {...bloqueioDaTrava(item)}
                              // Ciano da etapa (TOM.ciano.text, 5,36:1 com branco) —
                              // o mesmo do desktop, do lote e do modal.
                              style={{ ...corDaAcao(TOM.ciano.text), order: 0, flex: '2 1 150px', minHeight: 48, padding: '0 12px' }}
                            >
                              {/* Na conferência parcial o botão diz QUANTO falta. */}
                              {conferredOf(item) > 0 ? `Conferir ${remainingConfer(item)}` : 'Conferir'}
                            </Botao>
                          )}
                          {/* EMBALAR (dono, 21/09): a principal da peça CONFERIDA — abre
                              o painel de tubos já com a peça marcada. Azul do Embalado
                              (#1d4ed8, 6,3:1 com branco). É a ÚNICA ação da conferida:
                              o Entregar abaixo só existe para a entrega PARCIAL da
                              peça ainda em acabamento. */}
                          {podeEmbalarPeca && (
                            <Botao
                              variante="primario"
                              tamanho="toque"
                              icone={Package}
                              onClick={e => { e.stopPropagation(); abrirEmbalar([item]); }}
                              data-testid={`button-embalar-card-${item.id}`}
                              {...bloqueioDaTrava(item)}
                              style={{ ...corDaAcao(TOM.info.text), order: 0, flex: '2 1 150px', minHeight: 48, padding: '0 12px' }}
                            >
                              {rotuloEmbalar(item)}
                            </Botao>
                          )}
                          {/* Embalada: entregar o TUBO inteiro — o painel abre já no
                              formulário daquele tubo (quem recebeu). É a PRINCIPAL da
                              embalada (sólida, azul do Embalado, primeira no DOM e na
                              tela — Tab e dedo chegam nela antes do "Tirar"). */}
                          {podeConferir && !soVisualizaKit(item) && temVolumeAberto(item) && item.eventId && (
                            <Botao
                              variante="primario"
                              tamanho="toque"
                              icone={Truck}
                              onClick={e => { e.stopPropagation(); setTubosDoEvento({ id: String(item.eventId), name: item.event?.name ?? "Evento", entregarTubo: item.tuboId }); }}
                              data-testid={`button-entregar-tubo-card-${item.id}`}
                              {...bloqueioDaTrava(item)}
                              style={{ ...corDaAcao(TOM.info.text), order: 0, flex: '2 1 150px', minHeight: 48, padding: '0 12px' }}
                            >
                              {ehAvulsa(item) ? "Entregar" : "Entregar tubo"}
                            </Botao>
                          )}
                          {/* Embalado: tirar do tubo devolve a Conferido (21/09) — a
                              secundária, de contorno, depois da principal. */}
                          {podeConferir && !soVisualizaKit(item) && temVolumeAberto(item) && (
                            <Botao
                              tamanho="toque"
                              icone={Undo2}
                              onClick={e => { e.stopPropagation(); tirarDoTuboMutation.mutate({ itemId: item.id, tuboId: item.tuboId, displayId: item.displayId }); }}
                              carregando={tirarDoTuboMutation.isPending && tirarDoTuboMutation.variables?.itemId === item.id}
                              data-testid={`button-tirar-do-tubo-card-${item.id}`}
                              style={{ order: 0, flex: '1 1 130px', minHeight: 48, padding: '0 12px' }}
                            >
                              {ehAvulsa(item) ? "Desfazer embalagem" : "Tirar do tubo"}
                            </Botao>
                          )}
                          {isDelivered(item) && (
                            <span style={{ order: 0, flex: '1 1 auto', minHeight: 32, fontSize: FS.read, color: TOM.sucesso.text, display: 'flex', alignItems: 'center', gap: 4, fontWeight: FW.forte }}>
                              <Check aria-hidden="true" style={{ width: 13, height: 13 }} /> Entregue
                            </span>
                          )}

                          {/* Divisor entre FLUXO e CONTRATO. Só existe quando há
                              botão dos dois lados — para a Solicitação o grupo de
                              fluxo costuma estar vazio e "Aumentar" fica sozinho
                              no trilho inteiro, com salência máxima e sem truque. */}
                          {temGrupoFluxo && temGrupoContrato && (
                            <div aria-hidden="true" style={{ order: 2, width: 1, alignSelf: 'stretch', background: T.border, margin: '2px 0' }} />
                          )}

                          {/* AUMENTAR — o gatilho primário do celular. Tintado (não
                              sólido): não é etapa do fluxo de produção, é mudança
                              de contrato. Papel admin|solicitacao. */}
                          {mostraAumentar && (
                            <Botao
                              tamanho="toque"
                              icone={PlusCircle}
                              onClick={e => { e.stopPropagation(); if (!selo) abrirComplemento(item); }}
                              disabled={!!selo}
                              // Só o ícone (decisão do dono); o aria-label carrega o
                              // significado e o alvo continua com 44px.
                              aria-label={`Aumentar a quantidade de ${item.displayId} — cria uma peça complementar`}
                              data-testid={`button-aumentar-quantidade-mobile-${item.id}`}
                              title={selo ? motivoAcaoBloqueada(selo.motivo, "aumentar a quantidade") : "Aumentar quantidade"}
                              style={{ ...corTintada(TOM.laranja), order: 3, width: 44, padding: 0, flexShrink: 0 }}
                            />
                          )}
                          {/* Cancelar complemento criado por engano — dois toques
                              (o segundo confirma), nunca destrutivo de primeira.
                              Alvo de 44px: os 36 de antes reprovavam a régua da
                              casa justo num botão destrutivo. */}
                          {podeCancelarCompl && (
                            <Botao
                              // Segundo toque = destrutivo de verdade (apaga o
                              // complemento): só então vira `perigo`.
                              variante={cancelComplementId === item.id ? "perigo" : "secundario"}
                              tamanho="toque"
                              icone={Trash2}
                              carregando={cancelComplementMutation.isPending}
                              onClick={e => {
                                e.stopPropagation();
                                if (cancelComplementId === item.id) cancelComplementMutation.mutate({ itemId: item.id, displayId: item.displayId });
                                else setCancelComplementId(item.id);
                              }}
                              title={`Cancelar ${item.displayId} — só enquanto nada foi produzido`}
                              data-testid={`button-cancel-complement-mobile-${item.id}`}
                              style={{ order: 3, flex: '1 1 100px', padding: '0 10px', fontSize: FS.body, ...(cancelComplementId === item.id ? null : { color: TOM.perigo.text }) }}
                            >
                              {cancelComplementMutation.isPending ? 'Cancelando…' : cancelComplementId === item.id ? 'Confirmar?' : 'Cancelar'}
                            </Botao>
                          )}
                          {/* POR QUE O BOTÃO ESTÁ CINZA — no toque. O motivo
                              morava no `title` dos botões desabilitados, e no
                              celular/tablet o `title` não existe: tocar num botão
                              cinza não fazia nada e não dizia nada. A frase sai
                              do mesmo selo (lib/status) e só aparece quando há
                              botão barrado neste card. */}
                          {selo && (podeProduzirAqui || podeProduzirPeca || podeReaproveitarPeca || podeCorrigirReaprov || mostraAumentar) && (
                            <p data-testid={`motivo-bloqueio-card-${item.id}`} style={{ order: 4, flex: '1 1 100%', margin: 0, fontSize: 12, color: T.apoio, lineHeight: 1.4 }}>
                              {selo.motivo === 'encerrado'
                                ? 'Evento encerrado por um administrador: aqui só conferir e entregar. Reabrir o evento libera o resto.'
                                : 'Evento já realizado: aqui só conferir e entregar — produzir, reaproveitar e aumentar ficam bloqueados.'}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Renderização incremental: o bloco deste evento tem mais
                      peças do que o teto. O botão fica DENTRO do bloco, com o
                      número, para não parecer fim de lista. */}
                  {corte && (
                    <Botao
                      tamanho="toque"
                      larguraCheia
                      onClick={() => expandirGrupo(corte.chave)}
                      data-testid={`button-mostrar-todas-${corte.chave}`}
                      style={{ marginTop: 2, background: N.n2, borderStyle: 'dashed', fontSize: FS.body }}
                    >
                      Mostrar todas as {corte.total} peças (+{corte.ocultas})
                    </Botao>
                  )}
                </Fragment>
                )} />
              );
            })}
          </div>
        ) : (
          /* ── View desktop: tabela ── */
          <div ref={tabelaRolagemRef} data-testid="tabela-rolagem" style={{ overflowX: idMenuAberto ? "visible" : "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              {/* Cabeçalho CLARO: a tabela tinha três faixas escuras seguidas
                  (thead preto, cabeçalho de evento marrom, linha de tipo) e o
                  olho não sabia qual delas era o agrupamento. O escuro fica só
                  com o EVENTO — é ele que manda na ordem do galpão. */}
              <tr style={{ backgroundColor: T.bg, borderBottom: `1px solid ${T.border}` }}>
                {colunas.map(({ rotulo: col, direita }) => (
                  /* A coluna de AÇÕES é `sticky right`: são 10 colunas e num
                     notebook 1366 (menos a sidebar fixa de 16rem sobram ~1110px)
                     ela ficava fora da vista. O usuário recorrente faz o mesmo
                     gesto o dia inteiro — achar a linha e clicar no botão —, e
                     rolar para a direita e voltar a cada peça triplica o custo e
                     ainda perde a linha no caminho. */
                  <th key={col || "acoes"} scope="col" style={{
                    padding: "10px 16px", textAlign: col === "" || direita ? "right" : "left",
                    fontSize: FS.small, fontWeight: FW.forte, color: T.apoio,
                    whiteSpace: "nowrap",
                    ...(col === "" ? { position: "sticky" as const, right: 0, zIndex: 2, backgroundColor: T.bg } : {}),
                  }}>
                    {col === "" ? <span className="sr-only">Ações</span> : col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhasRenderizadas.map((item: any, index: number) => {
                const prev = index > 0 ? linhasRenderizadas[index - 1] : null;
                const corte = cortePorItem.get(item.id);
                const showEvHeader = !prev || (prev as any).event?.name !== item.event?.name;
                const showTypeHeader = !prev || (prev as any).event?.name !== item.event?.name || (prev as any).type !== item.type;
                // Mesmo padrão do mobile: elegível conforme o modo de lote
                // ativo — antes só a entrega em lote tinha checkbox na tabela.
                const isSelected = bulkSelectedIds.has(item.id);
                const emRevisao = EM_REVISAO.has(item.status);
                const podeEmbalarPeca = podeEmbalar(item);
                const bulkEligible = !emRevisao && (bulkConferMode ? canConfer(item) : bulkPackMode ? podeEmbalarPeca : false);
                // ── Complemento ──
                // ehComplemento: esta linha nasceu de um aumento de quantidade.
                // coAberto: o realce FORTE ainda vale (não foi entregue).
                // complQty: soma dos complementos vivos → esta linha é a MÃE.
                const ehComplemento = isComplement(item);
                const coAberto = complementOpen(item);
                const maeDisplayId = ehComplemento ? parentDisplayIdOf(item) : "";
                const complQty = complementsQtyOf(item);
                const { base: idBase, suffix: idSuffix } = splitDisplayId(item.displayId);
                // Recém-criada nesta sessão: realce de 5 s (fundo + faixa 4px).
                const isNovo = item.id === novoComplementoId;
                // O gatilho de AUMENTAR. Some em qualquer modo de lote: o
                // complemento exige quantidade e justificativa POR PEÇA.
                const mostraAumentar = !bulkOn && !emRevisao && !soVisualizaKit(item) && podeAumentarQuantidade(item, podeMexerQtd);
                // Evento finalizado: selo na linha e botões barrados
                // desabilitados. Ver o comentário de `items`, no topo.
                const selo = seloDoItem(item);

                return (
                  <LinhaMemo key={item.id} deps={depsDaLinha(item, [showEvHeader, showTypeHeader, typeToGroup[item.type] || '', prev ? (typeToGroup[(prev as any).type] || '') : '', corte?.chave, corte?.total, corte?.ocultas, etiquetaveisPorEvento.get(String(item.eventId)) ?? 0])} render={() => (
                  <Fragment>
                    {/* Cabeçalho de Evento */}
                    {(() => {
                      const groupName = typeToGroup[item.type] || '';
                      const prevGroupName = prev ? (typeToGroup[(prev as any).type] || '') : '';
                      const showGroupHeader = !showEvHeader && groupName !== '' && groupName !== prevGroupName;
                      // Grupo em NEUTRO: era azul (#dbeafe/#1d4ed8) — a única
                      // faixa azul da tela, sem significado nenhum de status.
                      return showGroupHeader ? (
                        <tr style={{ backgroundColor: T.surface, borderTop: `1px solid ${T.border}` }}>
                          <td colSpan={nColunas} style={{ padding: '7px 16px 5px' }}>
                            <span style={{ fontSize: FS.small, fontWeight: FW.rotulo, color: T.apoio }}>{groupName}</span>
                          </td>
                        </tr>
                      ) : null;
                    })()}
                    {showEvHeader && (
                      <tr style={{ backgroundColor: T.dark }}>
                        <td colSpan={nColunas} style={{ padding: "10px 16px" }}>
                          {/* flexWrap: com a caixa estreita as datas, o prazo e
                              as etiquetas descem para uma segunda linha em vez
                              de sair pela direita cortados. */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                              <Package style={{ width: 16, height: 16, color: T.accent }} />
                              <span style={{ fontSize: FS.read, fontWeight: FW.rotulo, color: T.surface, fontFamily: FONT.display }}>
                                {item.event?.name || "Sem Evento"}
                              </span>
                            </div>
                            {item.event && (
                              <div style={{ display: "flex", alignItems: "center", gap: "6px 16px", flexWrap: "wrap", minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.72)" }}>
                                  <Calendar style={{ width: 12, height: 12 }} />
                                  Início: <strong style={{ color: "rgba(255,255,255,0.85)" }}>{parseDateLocal(item.event.startDate).toLocaleDateString("pt-BR")}</strong>
                                </div>
                                <span style={{ color: "rgba(255,255,255,0.72)", fontSize: FS.small }}>|</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.72)" }}>
                                  <Truck style={{ width: 12, height: 12 }} />
                                  Saída: <strong style={{ color: "rgba(255,255,255,0.85)" }}>
                                    {new Date(item.event.truckDepartureDate).toLocaleDateString("pt-BR", { timeZone: 'UTC' })} às {new Date(item.event.truckDepartureDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: 'UTC' })}
                                  </strong>
                                </div>
                                <DeadlineChip event={item.event} />
                                {(etiquetaveisPorEvento.get(String(item.eventId)) ?? 0) > 0 && (
                                  <Link
                                    href={`/eventos/${item.eventId}/etiquetas?de=grafica`}
                                    data-testid={`link-etiquetas-${item.eventId}`}
                                    title="Imprimir as etiquetas das peças já conferidas deste evento"
                                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: T.surface, fontSize: FS.small, fontWeight: FW.rotulo, textDecoration: "none", whiteSpace: "nowrap" }}
                                  >
                                    <Tag style={{ width: 11, height: 11 }} />
                                    Etiquetas ({etiquetaveisPorEvento.get(String(item.eventId))})
                                  </Link>
                                )}
                                {(tubaveisPorEvento.get(String(item.eventId)) ?? 0) > 0 && (
                                  <button
                                    type="button"
                                    className="ds-botao"
                                    onClick={(e) => { e.stopPropagation(); setTubosDoEvento({ id: String(item.eventId), name: item.event?.name ?? "Evento" }); }}
                                    data-testid={`button-tubos-${item.eventId}`}
                                    title="Agrupar as peças em tubos e entregar por tubo"
                                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: T.surface, fontSize: FS.small, fontWeight: FW.rotulo, whiteSpace: "nowrap", cursor: "pointer" }}
                                  >
                                    <Package style={{ width: 11, height: 11 }} />
                                    Tubos
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Cabeçalho de Tipo */}
                    {showTypeHeader && (
                      <tr style={{ backgroundColor: N.n2 }}>
                        <td colSpan={nColunas} style={{ padding: "6px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 3, height: 14, backgroundColor: T.accent, borderRadius: 999, flexShrink: 0 }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{item.type}</span>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Linha do item */}
                    <tr
                      // Fundo em UMA função (rowBg) usada nas três mãos: antes
                      // style, onMouseEnter e onMouseLeave decidiam a cor cada
                      // um por conta própria e o hover apagava qualquer realce
                      // que não estivesse repetido nos três.
                      style={{ borderBottom: `1px solid ${coAberto ? CO.border : item.isReuse ? TOM.sucesso.border : N.n2}`, cursor: "pointer", transition: "background-color 0.1s", backgroundColor: rowBg(item, isSelected, false, isNovo) || undefined }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = rowBg(item, isSelected, true, isNovo); }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = rowBg(item, bulkSelectedIds.has(item.id), false, isNovo); }}
                      onClick={bulkOn && bulkEligible ? () => toggleBulkItem(item.id) : () => setViewDetailsItem(item)}
                      data-item-row={item.id}
                      data-testid={`row-item-${item.id}`}
                    >
                      {/* ID — a linha abre o detalhe no clique, mas <tr> não
                          recebe foco: sem mouse não havia como abrir peça
                          nenhuma. O ID vira o alvo focável, o rótulo natural da
                          linha (#047857 sobre branco passa AA e continua
                          sinalizando reaproveitamento).
                          A FAIXA LATERAL do complemento mora aqui, como
                          boxShadow inset da primeira célula: com
                          border-collapse a <tr> não renderiza borda esquerda de
                          forma confiável. Ela some quando o lote é entregue; o
                          conector em L (o traço que amarra o filho à mãe logo
                          acima) fica para sempre. */}
                      <td style={{ padding: "13px 16px", boxShadow: isNovo ? `inset 4px 0 0 ${CO.stripe}` : coAberto ? `inset 3px 0 0 ${CO.stripe}` : undefined }}>
                        {ehComplemento && (
                          <span aria-hidden="true" style={{ display: "inline-block", width: 10, height: 8, marginRight: 6, marginBottom: 2, borderLeft: `1px solid ${CO.connector}`, borderBottom: `1px solid ${CO.connector}`, borderBottomLeftRadius: 3, verticalAlign: "middle" }} />
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); setViewDetailsItem(item); }}
                          aria-label={ehComplemento
                            ? `Ver detalhes da peça ${item.displayId}, complemento de ${maeDisplayId}`
                            : `Ver detalhes da peça ${item.displayId}`}
                          style={{ fontSize: 13, fontFamily: FONT.mono, color: item.isReuse ? TOM.esmeralda.text : T.accentText, fontWeight: 700, letterSpacing: "0.04em", background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                          data-testid={`text-display-id-${item.id}`}
                        >
                          {idBase}{idSuffix && <span style={{ color: CO.suffix }}>{idSuffix}</span>}
                        </button>
                        {/* Kit (14/09): a peça do Kit se declara na fila, com a entrega. */}
                        <SeloKit peca={item} style={{ display: "flex", width: "fit-content", marginTop: 4 }} />
                        <AvisoDoEstoqueNaPeca peca={item} style={{ marginTop: 4 }} />
                        {seloDoTubo(item) && (
                          <button type="button" data-testid={`chip-tubo-${item.id}`} title={tituloDoTubo(item)}
                            aria-label={`${seloDoTubo(item)} — ver o que está no tubo`}
                            onClick={e => { if (bulkOn) return; e.stopPropagation(); abrirTuboDaPeca(item); }}
                            /* LINHA PRÓPRIA, abaixo do código (dono, 21/09: "muito grudado no número
                               do item") — como o selo KIT; quebra sem cortar quando a peça
                               está em mais de um tubo. */
                            style={{ display: "flex", width: "fit-content", maxWidth: "100%", flexWrap: "wrap", alignItems: "center", gap: 3, marginTop: 6, padding: "2px 7px", borderRadius: R.pill, fontSize: FS.small, fontWeight: FW.rotulo, lineHeight: 1.35, textAlign: "left", color: T.accentText, background: TOM.laranja.bg, border: `1px solid ${TOM.laranja.border}`, whiteSpace: "normal", cursor: "pointer", fontFamily: "inherit" }}>
                            {fechamentoDoTubo.has(item.tuboId) && <Camera aria-hidden="true" style={{ width: 10, height: 10 }} />}
                            {seloDoTubo(item)}
                          </button>
                        )}
                      </td>
                      {/* Descrição — com a arte ao lado: a Gráfica identifica a
                          peça pelo desenho, não pelo texto, e antes era preciso
                          abrir o detalhe de cada uma para saber o que era. */}
                      {/* O TETO DE LARGURA MORA NA DIV, não na <td>. `max-width`
                          numa célula de tabela automática é ignorado pelo
                          Chrome: a descrição em `nowrap` (com reticências só
                          visuais) fazia a coluna Peça medir a frase INTEIRA —
                          era esta coluna que empurrava a tabela para fora da
                          caixa com a barra lateral aberta. Numa div o teto vale
                          e limita também a largura mínima que ela pede. */}
                      <td style={{ padding: "13px 16px" }}>
                        <div data-testid={`celula-peca-${item.id}`} style={{ display: "flex", alignItems: "flex-start", gap: 10, maxWidth: compacto ? 260 : 320, minWidth: 160 }}>
                          {item.approvalThumbUrl && (
                            <a
                              href={convertGCSUrlToLocalPath(item.approvalThumbUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              title="Abrir a arte aprovada"
                              data-testid={`thumb-art-${item.id}`}
                              style={{ display: "block", width: 44, height: 44, borderRadius: 6, overflow: "hidden", border: `1px solid ${T.border}`, backgroundColor: T.surface, flexShrink: 0 }}
                            >
                              <img src={convertGCSUrlToLocalPath(item.approvalThumbUrl)} alt="Arte"
                                loading="lazy" decoding="async"
                                style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            </a>
                          )}
                          <div style={{ minWidth: 0, flex: 1 }}>
                        {/* SELO DO COMPLEMENTO — o sinal mais forte da tela, no
                            topo da pilha de badges. Sólido (não outline) porque
                            significa TRABALHO NOVO na fila: o número que está na
                            linha já é exatamente o que falta imprimir, sem
                            conta nenhuma. Depois da entrega vira outline: a
                            identidade permanece, o alarme não. */}
                        {ehComplemento && (
                          <Selo
                            forma="retangulo"
                            icone={PlusCircle}
                            cores={coAberto ? { bg: CO.solidBg, text: CO.solidText, border: CO.solidBg } : TOM.laranja}
                            data-testid={`badge-complemento-${item.id}`}
                            title={item.complementReason ? `Motivo: ${item.complementReason}` : `Complemento de ${maeDisplayId}`}
                            style={{ padding: "2px 8px", marginBottom: 5, marginRight: 5 }}
                          >
                            {coAberto
                              ? `+${qtyOf(item)} un. — complemento de ${maeDisplayId}`
                              : `Complemento de ${maeDisplayId}`}
                          </Selo>
                        )}
                        {/* MÃE — selo espelho, sempre outline: ela não tem
                            trabalho pendente (nada nela mudou), mas sem isto o
                            operador não entende por que uma peça entregue
                            ganhou uma linha nova logo abaixo. */}
                        {complQty > 0 && (
                          <Selo
                            forma="retangulo"
                            tom="laranja"
                            icone={PlusCircle}
                            data-testid={`badge-tem-complemento-${item.id}`}
                            title={`Contratado total: ${contractedTotalOf(item)} un. (${qtyOf(item)} + ${complQty}) · ${(item.complements ?? []).map((c: any) => `${c.displayId} (+${c.quantity})`).join(", ")}`}
                            style={{ padding: "2px 8px", marginBottom: 5, marginRight: 5 }}
                          >
                            Tem complemento (+{complQty})
                          </Selo>
                        )}
                        {/* EVENTO FINALIZADO — a peça voltou para a fila (ver
                            `items`), então ela tem de se declarar. Sem este
                            selo o operador vê "Produzir" apagado e conclui que
                            o sistema quebrou; com ele, sabe que o evento acabou
                            e que só restam conferência e entrega. */}
                        {selo && (
                          <Selo
                            forma="retangulo"
                            ponto
                            cores={selo}
                            data-testid={`badge-evento-finalizado-${item.id}`}
                            title={selo.hint}
                            style={{ padding: "2px 8px", marginBottom: 5, marginRight: 5 }}
                          >
                            {selo.label}
                          </Selo>
                        )}
                        {/* PRIORITÁRIA (dono, 27/08: "na Gráfica também") — o
                            mesmo selo da Arte e da lista do evento; aqui ela
                            também sobe para o topo do bloco do seu evento. */}
                        {item.isPriority && (
                          <Selo
                            forma="retangulo"
                            tom="perigo"
                            icone={AlertTriangle}
                            data-testid={`selo-prioritaria-${item.id}`}
                            title="Peça prioritária — marcada pela Solicitação para sair na frente"
                            style={{ padding: "2px 8px", marginBottom: 5, marginRight: 5 }}
                          >
                            Prioritária
                          </Selo>
                        )}
                        {/* A cor verde da linha sozinha não diz o que é: o rótulo
                            precisa aparecer sempre que houver reaproveitamento,
                            inclusive nas peças marcadas antes de reuseQty existir. */}
                        {(item.isReuse || reusedOf(item) > 0) && (
                          /* Tint claro com texto TOM.esmeralda.text (5,4:1): era
                             branco sobre o verde saturado, 2,54:1, justo no
                             rótulo que decide se a peça vai para a impressora. */
                          <Selo forma="retangulo" tom="esmeralda" icone={RotateCcw}
                            title={item.isReuse ? "Peça inteira reaproveitada" : `${reusedOf(item)} de ${qtyOf(item)} un. reaproveitadas`}
                            style={{ padding: "2px 8px", marginBottom: 5 }}>
                            {item.isReuse ? "Reaproveitamento" : `Reaproveitamento ${reusedOf(item)}/${qtyOf(item)}`}
                          </Selo>
                        )}
                        {item.description ? (
                          <div style={{ fontSize: 13, color: item.isReuse ? TOM.esmeralda.text : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: item.isReuse ? 600 : 400 }}>{item.description}</div>
                        ) : (
                          <div style={{ fontSize: 13, color: T.second }}>—</div>
                        )}
                        {/* A observação em itálico que morava aqui saiu: a linha
                            âmbar logo abaixo da peça já mostra o texto INTEIRO.
                            Eram duas cópias da mesma frase, uma cortada. */}
                        {/* Compacta: Material e acabamento descem para cá — são
                            o que a impressora pede, então não podem sumir. */}
                        {/* `material || finish`: peça só com acabamento perdia
                            o acabamento inteiro, porque a linha dependia do
                            material. Junta só o que existe, sem "·" órfão. */}
                        {compacto && (item.material || item.finish) && (
                          <div style={{ fontSize: 11, color: T.second, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {[item.material, item.finish].filter(Boolean).join(" · ")}
                          </div>
                        )}
                        {item.referenceUrl && (
                          <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Ver referência do solicitante" style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 3, fontSize: 10, fontWeight: 700, color: T.accentText, textDecoration: "none", backgroundColor: TOM.laranja.bg, border: `1px solid ${TOM.laranja.border}`, borderRadius: 6, padding: "1px 5px" }} data-testid={`link-reference-grafica-${item.id}`}>
                            <img loading="lazy" decoding="async" src={miniatura(item.referenceUrl)} style={{ width: 12, height: 12, objectFit: "cover", borderRadius: 999 }} alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            REF
                          </a>
                        )}
                        {/* Arquivo final foi substituído pela Arte após envio inicial */}
                        {item.previousFinalFileUrl && (
                          <Selo
                            forma="retangulo"
                            tom="alerta"
                            icone={AlertTriangle}
                            title={`Anterior: ${item.previousFinalFileUrl}`}
                            data-testid={`badge-arquivo-atualizado-${item.id}`}
                            style={{ marginTop: 4, padding: "2px 7px" }}
                          >
                            Arquivo atualizado
                          </Selo>
                        )}
                          </div>
                        </div>
                      </td>
                      {/* Qtd — na MÃE ganha o chip "+N": era a única coluna
                          numérica sem tratamento, e é onde a pergunta "afinal,
                          quantas foram contratadas?" nasce. A quantidade da mãe
                          NÃO muda (o complemento é linha própria); o chip mostra
                          o que veio depois e o tooltip soma os dois.

                          É TAMBÉM onde nasce o gatilho de AUMENTAR: a ação é
                          sobre este número, e foi exatamente na coluna de Ações
                          (espremida entre três ícones) que ela se perdeu no
                          Detalhe do Evento. A célula vira uma pilha:
                          número → chip +N → botão. Nada de hover-reveal: o
                          botão é persistente em 100% das linhas elegíveis.
                          Padding 12px em vez de 16 para o botão caber; número à
                          DIREITA com algarismos tabulares (coluna numérica). */}
                      <td style={{ padding: "13px 12px", textAlign: "right", whiteSpace: "nowrap", fontSize: 14, fontWeight: 700, color: T.text, fontVariantNumeric: "tabular-nums" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                          <div>{item.quantity}</div>
                          {/* PRODUZIDAS e REAPROVEITADAS — eram duas colunas
                              inteiras (PROD, REAPROV.), "—" em quase todas as
                              linhas. Agora só aparecem quando existem, pequenas,
                              logo abaixo do número de que são parte. Mesmas
                              contas e mesmas cores de antes. */}
                          {item.quantityProduced > 0 && (
                            <div title={`${item.quantityProduced} de ${qtyOf(item)} un. produzidas`} style={{ fontSize: 11, fontWeight: 600, color: T.accentText, marginTop: 1 }}>
                              prod. {item.quantityProduced}
                            </div>
                          )}
                          {reusedTotalOf(item) > 0 && (
                            <div title={item.isReuse ? "Peça inteira reaproveitada" : `${reusedTotalOf(item)} de ${qtyOf(item)} un. reaproveitadas`} style={{ fontSize: 11, fontWeight: 600, color: TOM.esmeralda.text, marginTop: 1 }}>
                              reap. {reusedTotalOf(item)}{reusedTotalOf(item) < qtyOf(item) && <span style={{ color: T.second, fontWeight: 400 }}>/{qtyOf(item)}</span>}
                            </div>
                          )}
                          {complQty > 0 && (
                            <div
                              data-testid={`chip-qtd-complemento-${item.id}`}
                              title={`Contratado total: ${contractedTotalOf(item)} un. — complementos: ${(item.complements ?? []).map((c: any) => `${c.displayId} (+${c.quantity})`).join(", ")}`}
                              style={{ marginTop: 2, display: "inline-block", padding: "0 5px", borderRadius: R.sm, backgroundColor: CO.hoverBg, border: `1px solid ${CO.border}`, color: CO.text, fontSize: FS.small, fontWeight: FW.rotulo }}
                            >
                              +{complQty}
                            </div>
                          )}
                          {mostraAumentar && (
                            // Só o ícone (decisão do dono): o title e o aria-label
                            // carregam o significado.
                            <Botao
                              tamanho={tamLinha}
                              icone={PlusCircle}
                              onClick={e => { e.stopPropagation(); if (!selo) abrirComplemento(item); }}
                              disabled={!!selo}
                              aria-label={`Aumentar a quantidade de ${item.displayId} — cria uma peça complementar`}
                              title={selo
                                ? motivoAcaoBloqueada(selo.motivo, "aumentar a quantidade")
                                : `Aumentar quantidade — cria uma peça complementar ligada a ${item.displayId}`}
                              data-testid={`button-aumentar-quantidade-${item.id}`}
                              style={{ ...corTintada(TOM.laranja), marginTop: 6, width: alvoDeToque(32, ponteiroGrosso), padding: 0 }}
                            />
                          )}
                        </div>
                      </td>
                      {/* ── MEDIDAS: o ARQ vem primeiro e escuro ──

                          Esta coluna mostrava o VISUAL em cima, escuro, e o
                          arquivo embaixo, apagado — nesta tela, que é a que
                          IMPRIME, e o que a impressora recebe é o ARQ (com
                          sangria; é dele que sai o m² cobrado). A peça #2472
                          teve o arquivo corrigido e a gráfica seguiu lendo a
                          linha escura de cima, que era o outro par.

                          E havia um buraco: o ARQ só aparecia SE o visual
                          existisse — peça só com medida de arquivo mostrava
                          "—" na tela de produção. Cada par agora se mostra
                          por si. */}
                      <td style={{ padding: "13px 16px" }}>
                        {(item.fileWidth && item.fileHeight) || (item.visualWidth && item.visualHeight) ? (
                          <div>
                            {item.fileWidth && item.fileHeight && (
                              <div style={{ fontSize: 11, color: T.text, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                                <span style={{ fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.06em", color: TOM.alerta.text }}>ARQ</span> {item.fileWidth}×{item.fileHeight}
                              </div>
                            )}
                            {item.visualWidth && item.visualHeight && (
                              <div style={{ fontSize: 11, color: T.second, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                                <span style={{ fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.06em" }}>VIS</span> {item.visualWidth}×{item.visualHeight}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: 13, color: T.second }}>—</span>
                        )}
                        {/* Compacta: o m² a produzir desce para baixo das medidas
                            (é conta delas), com a mesma regra da coluna cheia. */}
                        {compacto && Number(item.calculatedM2) > 0 && (
                          <div style={{ marginTop: 3, fontSize: 12, fontWeight: 700, color: T.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                            {m2DaLinha(item)} <span style={{ fontSize: FS.small, fontWeight: FW.medio, color: T.second }}>m²</span>
                          </div>
                        )}
                      </td>
                      {!compacto && (
                        <>
                          {/* m² a produzir — o reaproveitado não vai para a
                              impressora. À direita e com algarismos tabulares:
                              é coluna para somar de olho, casa decimal embaixo
                              de casa decimal. */}
                          <td style={{ padding: "13px 16px", textAlign: "right", fontSize: 13, fontWeight: 700, color: T.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                            {m2DaLinha(item)}
                          </td>
                          {/* Material — secundário: 12px e acabamento apagado. */}
                          <td style={{ padding: "13px 16px" }}>
                            <div style={{ fontSize: 12, color: T.text }}>{item.material}</div>
                            {item.finish && <div style={{ fontSize: 11, color: T.second, marginTop: 2 }}>{item.finish}</div>}
                          </td>
                        </>
                      )}
                      {/* Status + IDADE NA FASE (UX 27/08): a mesma régua
                          7/14 dias da Arte — a Gráfica via a MESMA peça sem
                          saber há quanto tempo ela estava parada ali. */}
                      {/* nowrap na célula: a pílula nunca quebra ao meio e a
                          coluna reserva a largura dela inteira. "há Nd" já é
                          uma linha própria (div) logo abaixo. */}
                      <td style={{ padding: "13px 16px", whiteSpace: "nowrap" }}>
                        <StatusPill status={statusDeExibicao(item)} size="sm" showDot={false} />
                        {(() => {
                          const d = diasNaFase(item, new Date());
                          if (d === null || d < 1) return null;
                          const tom = tomDaIdade(d);
                          return <div title={`Está neste status há ${d} dia(s)`} style={{ marginTop: 3, fontSize: FS.small, fontFamily: FONT.mono, fontWeight: tom.peso, color: tom.cor }}>há {d}d</div>;
                        })()}
                        {/* Em impressão: impressora + "3 de 10 impressas · 7 na
                            impressora" + barra (dono, 21/09). Duas linhas para a
                            coluna Status não alargar. */}
                        {isInProd(item) && <ProgressoImpressao item={item} fonte={10.5} duasLinhas onIniciarResto={canProduce && !seloDoItem(item) ? () => openProductionModal(item, true) : undefined} />}
                        {travaDaLinha(item, 10.5, 28)}
                        {(isInProd(item) ? !!fraseDaFila(item, { emImpressao: true }) : !!item.maquinaPrevista) && <div style={{ marginTop: 4 }}><SeloFilaDaImpressora item={item} fonte={10.5} /></div>}
                      </td>
                      {/* Ações — `sticky right` com sombra à esquerda marcando a
                          borda. `background: inherit` copia a cor da <tr>,
                          inclusive quando o hover a troca por JS (por isso
                          rowBg devolve branco explícito e nunca ""). */}
                      <td
                        style={{
                          padding: "13px 16px", textAlign: "right",
                          // zIndex 3 com o menu aberto: a célula sticky da linha
                          // de baixo (z 1, depois no DOM) pintaria por cima dele.
                          position: "sticky", right: 0, zIndex: idMenuAberto === item.id ? 3 : 1,
                          background: "inherit",
                          boxShadow: "-8px 0 8px -8px rgba(28,25,23,0.28)",
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        {/* Em modo lote sobram só conteúdo e checkbox, como no
                            card mobile já fazia. Na tabela a correção nunca foi
                            propagada: numa "conferência em lote", cada linha
                            elegível exibia um botão Conferir ciano cheio colado
                            no checkbox, disputando o clique com a seleção. */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                          {/* Ver detalhes */}
                          {!bulkOn && (
                          <Botao
                            variante="fantasma"
                            tamanho={tamLinha}
                            icone={Eye}
                            onClick={() => setViewDetailsItem(item)}
                            title="Ver detalhes"
                            aria-label={`Ver detalhes de ${item.displayId}`}
                            data-testid={`button-view-${item.id}`}
                            style={{ width: alvoDeToque(32, ponteiroGrosso), padding: 0 }}
                          />
                          )}

                          {/* MOLDE (22/09): o trilho inteiro vira UMA ação — "Marcar como
                              produzido" (ou desfazer). Nada de impressora, conferir,
                              embalar, tubo ou entregar: o fluxo dele morre no Produzido. */}
                          {ehMolde(item) ? (!bulkOn && <AcoesDoMolde item={item} podeProduzir={canProduce} selo={selo} />) : (<>
                          {/* ── MENU "⋯" DAS SECUNDÁRIAS (tabela COMPACTA) ──
                              Na faixa compacta (notebook, sidebar aberta) a
                              coluna de Ações é sticky: cada px dela sai das
                              colunas de baixo, e com Reaproveitar + Corrigir
                              reaprov. + Devolver ao lado do botão principal ela
                              cobria o Status. Ali as SECUNDÁRIAS moram num menu
                              e a principal (Produzir/Conferir/Entregar) fica à
                              vista. Os blocos abaixo são os MESMOS, com os
                              mesmos gates (paridade com o cartão); só o
                              invólucro muda: `display: contents` na tabela
                              cheia (nada muda) e caixa flutuante na compacta.
                              O menu fica aberto enquanto uma edição em linha
                              dele estiver aberta. */}
                          {(() => {
                            const temSecundaria = !bulkOn && (
                              (podeMexerQtd && !soVisualizaKit(item) && ehComplemento && complementUntouched(item))
                              || (!emRevisao && !pecaTravada(item) && !soVisualizaKit(item) && !isDelivered(item) && !isPosConferencia(item) && (!isProduced(item) ? tetoReaproveitar(item) > 0 : podeMexerQtd && qtyOf(item) > 0))
                              || (!emRevisao && !soVisualizaKit(item) && (isProduced(item) || isAdmin) && reusedTotalOf(item) > 0 && conferredOf(item) === 0 && deliveredOf(item) === 0)
                              || (canProduce && podeDevolverParaRevisao(item)));
                            if (!compacto || !temSecundaria) return null;
                            const aberto = menuAcoesId === item.id || reuseConfirmItemId === item.id || correctReuseItemId === item.id || cancelComplementId === item.id;
                            return (
                              <button
                                type="button"
                                data-menu-acoes={item.id}
                                onClick={e => {
                                  if (aberto) { fecharMenuAcoes(); return; }
                                  // Um menu por vez: abrir outro fecha as edições do anterior.
                                  const r = e.currentTarget.getBoundingClientRect();
                                  setMenuParaCima(window.innerHeight - r.bottom < 240);
                                  fecharMenuAcoes();
                                  setMenuAcoesId(item.id);
                                }}
                                aria-haspopup="true"
                                aria-expanded={aberto}
                                aria-label={`Mais ações de ${item.displayId}`}
                                title="Mais ações"
                                data-testid={`button-mais-acoes-${item.id}`}
                                className="ds-botao"
                                style={{ width: alvoDeToque(32, ponteiroGrosso), height: alvoDeToque(32, ponteiroGrosso), padding: 0, borderRadius: R.md, border: `1px solid ${aberto ? T.text : T.border}`, background: aberto ? N.n2 : T.surface, color: T.text, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
                              >
                                <MoreHorizontal aria-hidden="true" style={{ width: 16, height: 16 }} />
                              </button>
                            );
                          })()}
                          <div
                            data-menu-acoes={item.id}
                            data-testid={compacto ? `menu-acoes-${item.id}` : undefined}
                            role={compacto ? "group" : undefined}
                            aria-label={compacto ? `Mais ações de ${item.displayId}` : undefined}
                            style={!compacto
                              ? { display: "contents" }
                              : (menuAcoesId === item.id || reuseConfirmItemId === item.id || correctReuseItemId === item.id || cancelComplementId === item.id)
                                ? { position: "absolute", right: 16, ...(menuParaCima ? { bottom: "calc(100% - 6px)" } : { top: "calc(100% - 6px)" }), zIndex: 5, minWidth: 220, display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6, padding: 8, background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md, boxShadow: SHADOW.lg, textAlign: "left" }
                                : { display: "none" }}
                          >
                          {/* Cancelar complemento — a janela de arrependimento.
                              Mesmo papel de quem CRIA o complemento (admin |
                              solicitacao), espelho de `podeMudarQuantidade` no
                              DELETE /api/items/:id/complement. Estava com
                              `canProduce`: a Gráfica via um convite falso que
                              virava 403, e quem realmente pode cancelar (a
                              Solicitação) não via botão nenhum.
                              Só enquanto NADA foi produzido, reaproveitado,
                              conferido ou entregue: uma única unidade já é
                              material no galpão. Confirmação em dois passos, no
                              mesmo idioma dos botões de reaproveitamento. */}
                          {!bulkOn && podeMexerQtd && !soVisualizaKit(item) && ehComplemento && complementUntouched(item) && (
                            cancelComplementId === item.id ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
                                <span style={{ fontSize: FS.meta, fontWeight: FW.forte, color: TOM.perigo.text, whiteSpace: "nowrap" }}>Cancelar {item.displayId}?</span>
                                <Botao
                                  variante="perigo"
                                  tamanho={tamLinha}
                                  carregando={cancelComplementMutation.isPending}
                                  onClick={() => cancelComplementMutation.mutate({ itemId: item.id, displayId: item.displayId })}
                                  data-testid={`button-cancel-complement-confirm-${item.id}`}
                                >
                                  {cancelComplementMutation.isPending ? "Cancelando…" : "Sim, remover"}
                                </Botao>
                                <Botao
                                  tamanho={tamLinha}
                                  icone={X}
                                  onClick={() => setCancelComplementId(null)}
                                  title="Manter o complemento"
                                  aria-label="Manter o complemento"
                                  style={{ width: alvoDeToque(32, ponteiroGrosso), padding: 0 }}
                                />
                              </div>
                            ) : (
                              <Botao
                                onClick={e => { e.stopPropagation(); setCancelComplementId(item.id); }}
                                title={`Cancelar ${item.displayId} — só enquanto nada foi produzido`}
                                aria-label={`Cancelar o complemento ${item.displayId}`}
                                data-testid={`button-cancel-complement-${item.id}`}
                                variante="fantasma"
                                tamanho={tamLinha}
                                icone={Trash2}
                                style={{ color: TOM.perigo.text, border: `1px solid ${T.border}` }}
                              >
                                Cancelar compl.
                              </Botao>
                            )
                          )}


                          {/* Reaproveitar — total ou parcial, enquanto ainda há
                              unidades sem produzir nem reaproveitar.
                              APÓS PRODUZIDO (dono, 27/08): a ação continua, mas
                              só para admin|solicitacao (podeMexerQtd) — e vira
                              CONVERSÃO de produzidas em reaproveitadas; a peça
                              segue "Produzido". Conferida/entregue, acabou.
                              Em evento finalizado o gatilho vem DESABILITADO
                              (POST /api/items/:id/mark-reuse é barrado): marcar
                              reaproveitamento é decidir o que entra na fila de
                              produção, ou seja, faz o trabalho andar. */}
                          {!bulkOn && !emRevisao && !pecaTravada(item) && !soVisualizaKit(item) && !isDelivered(item) && !isPosConferencia(item) && (!isProduced(item) ? tetoReaproveitar(item) > 0 : podeMexerQtd && qtyOf(item) > 0) && (
                            reuseConfirmItemId === item.id ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
                                {/* Rótulo, como no "Corrigir": sem ele o campo
                                    aberto era um número solto com "OK" — nada
                                    dizia que ali se marcava reaproveitamento. */}
                                <span style={{ fontSize: FS.meta, fontWeight: FW.forte, color: TOM.esmeralda.text, whiteSpace: "nowrap" }}>{isProduced(item) ? "Reaprov. total:" : "Reaproveitar:"}</span>
                                <input
                                  type="number"
                                  min={isProduced(item) ? 0 : 1}
                                  max={isProduced(item) ? qtyOf(item) : tetoReaproveitar(item)}
                                  value={reuseQty}
                                  onChange={e => setReuseQty(Math.max(isProduced(item) ? 0 : 1, Math.min(isProduced(item) ? qtyOf(item) : tetoReaproveitar(item), parseInt(e.target.value) || 0)))}
                                  title={isProduced(item)
                                    ? `Total reaproveitado desta peça (0 a ${qtyOf(item)}) — o resto conta como produzido`
                                    : `Quantas unidades reaproveitar (até ${tetoReaproveitar(item)})`}
                                  data-testid={`input-reuse-qty-${item.id}`}
                                  style={{ width: 56, height: alvoDeToque(32, ponteiroGrosso), padding: "0 6px", borderRadius: R.sm, border: `1px solid ${T.border}`, fontSize: FS.body, fontWeight: FW.forte, color: T.text, textAlign: "center" }}
                                />
                                <span style={{ fontSize: FS.small, color: T.second, whiteSpace: "nowrap" }}>de {isProduced(item) ? qtyOf(item) : tetoReaproveitar(item)}</span>
                                <Botao
                                  variante="primario"
                                  tamanho={tamLinha}
                                  carregando={markReuseMutation.isPending}
                                  onClick={() => markReuseMutation.mutate(isProduced(item)
                                    ? { itemId: item.id, reuseTotal: reuseQty }
                                    : { itemId: item.id, qty: reuseQty })}
                                  title="Confirmar reaproveitamento"
                                  data-testid={`button-reuse-confirm-${item.id}`}
                                  style={corDaAcao(TOM.esmeralda.text)}
                                >
                                  OK
                                </Botao>
                                <Botao
                                  tamanho={tamLinha}
                                  icone={X}
                                  onClick={() => setReuseConfirmItemId(null)}
                                  title="Cancelar"
                                  aria-label="Cancelar reaproveitamento"
                                  style={{ width: alvoDeToque(32, ponteiroGrosso), padding: 0 }}
                                />
                              </div>
                            ) : (
                              <Botao
                                variante="fantasma"
                                tamanho={tamLinha}
                                icone={Recycle}
                                onClick={e => { e.stopPropagation(); if (selo) return; setReuseConfirmItemId(item.id); setReuseQty(isProduced(item) ? reusedTotalOf(item) : tetoReaproveitar(item)); }}
                                disabled={!!selo}
                                aria-label={`Reaproveitar ${item.displayId}`}
                                title={selo
                                  ? motivoAcaoBloqueada(selo.motivo, "marcar reaproveitamento")
                                  : isProduced(item)
                                    ? `Ajustar reaproveitamento (0 a ${qtyOf(item)}) — converte entre produzidas e reaproveitadas, nas duas direções`
                                    : `Reaproveitar (pula produção) — até ${remainingReuse(item)} un.`}
                                data-testid={`button-reuse-${item.id}`}
                                // ♻ e não a seta circular: ao lado de "Produzir" a
                                // seta se lia como "desfazer". No menu "⋯" o ícone
                                // sozinho não diz o que faz, então ganha rótulo.
                                style={{ color: TOM.esmeralda.text, width: compacto ? "auto" : alvoDeToque(32, ponteiroGrosso), padding: compacto ? "0 8px" : 0, justifyContent: compacto ? "flex-start" : "center" }}
                              >
                                {compacto && (isProduced(item) ? "Ajustar reaproveitamento" : "Reaproveitar")}
                              </Botao>
                            )
                          )}

                          {/* Corrigir reaproveitamento — para quando a marcação foi
                              feita errada, total ou parcial, e a peça ainda não
                              começou a ser conferida nem entregue.
                              O `isProduced` sozinho escondia o caso mais comum:
                              a quantidade sai errada e o erro é notado antes de
                              produzir, com a peça em "Pronto p/ Produção". O
                              admin corrige em qualquer etapa anterior à
                              conferência; para a Gráfica segue como estava. */}
                          {!bulkOn && !emRevisao && !soVisualizaKit(item) && (isProduced(item) || isAdmin) && reusedTotalOf(item) > 0
                            && conferredOf(item) === 0 && deliveredOf(item) === 0 && (
                            correctReuseItemId === item.id ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
                                {/* Rótulo explícito: sem ele este campo fica ao
                                    lado do de "Produzir", que também é um
                                    número seguido de "de N" — dava para digitar
                                    no lugar errado sem perceber. */}
                                <span style={{ fontSize: FS.meta, fontWeight: FW.forte, color: TOM.alerta.text, whiteSpace: "nowrap" }}>Reaprov.:</span>
                                {/* O teto era quantidade-1, então quem marcou
                                    parcial por engano não conseguia voltar para
                                    reaproveitamento total. O admin alcança o
                                    total; para a Gráfica o limite continua
                                    sendo o parcial. */}
                                <input
                                  type="number"
                                  min={0}
                                  max={isAdmin ? qtyOf(item) : qtyOf(item) - 1}
                                  value={correctReuseQty}
                                  autoFocus
                                  onFocus={e => e.currentTarget.select()}
                                  onChange={e => setCorrectReuseQty(Math.max(0, Math.min(isAdmin ? qtyOf(item) : qtyOf(item) - 1, parseInt(e.target.value) || 0)))}
                                  aria-label="Quantidade reaproveitada corrigida"
                                  title={`Quantas unidades reaproveitadas (0 a ${isAdmin ? qtyOf(item) : qtyOf(item) - 1})`}
                                  style={{ width: 56, height: alvoDeToque(32, ponteiroGrosso), padding: "0 6px", borderRadius: R.sm, border: `1px solid ${TOM.alerta.dot}`, fontSize: FS.body, fontWeight: FW.forte, color: T.text, textAlign: "center" }}
                                />
                                <span style={{ fontSize: FS.small, color: T.second, whiteSpace: "nowrap" }}>de {qtyOf(item)}</span>
                                <Botao
                                  variante="primario"
                                  tamanho={tamLinha}
                                  carregando={correctReuseMutation.isPending}
                                  onClick={() => correctReuseMutation.mutate({ itemId: item.id, correctedReuseQty: correctReuseQty })}
                                  title="Confirmar correção"
                                  style={corDaAcao(TOM.alerta.text)}
                                >
                                  OK
                                </Botao>
                                <Botao
                                  tamanho={tamLinha}
                                  icone={X}
                                  onClick={() => setCorrectReuseItemId(null)}
                                  title="Cancelar"
                                  aria-label="Cancelar correção do reaproveitamento"
                                  style={{ width: alvoDeToque(32, ponteiroGrosso), padding: 0 }}
                                />
                              </div>
                            ) : (
                              /* Era um ícone solto com o texto só no `title`:
                                 ninguém achava o caminho para corrigir. Com
                                 rótulo, a ação fica óbvia ao lado do número
                                 errado. E o campo abre com a quantidade ATUAL,
                                 não com quantidade-1 — quem corrige parte do
                                 valor que está lá, não de um chute. */
                              <Botao
                                tamanho={tamLinha}
                                icone={RotateCcw}
                                onClick={e => { e.stopPropagation(); if (selo) return; setCorrectReuseItemId(item.id); setCorrectReuseQty(reusedTotalOf(item)); }}
                                disabled={!!selo}
                                title={selo
                                  ? motivoAcaoBloqueada(selo.motivo, "corrigir o reaproveitamento")
                                  : "Corrigir a quantidade reaproveitada desta peça"}
                                aria-label={`Corrigir reaproveitamento de ${item.displayId}`}
                                data-testid={`button-correct-reuse-${item.id}`}
                                style={corTintada(TOM.alerta)}
                              >
                                Corrigir reaprov.
                              </Botao>
                            )
                          )}

                          {/* Conferir — etapa entre Produzido e Entregue (com foto);
                              gate igual ao do servidor (grafica/admin) */}
                          {/* DEVOLVER — contorno, não preenchido: é a saída de
                              exceção ao lado de "Produzir", que é o caminho
                              normal. Só antes de produzir; depois disso o botão
                              some, porque não há estorno do que já foi impresso.

                              SÓ O ÍCONE, e por um motivo mecânico além do peso
                              visual: a coluna de Ações é `sticky right`, então
                              tudo o que ela ganha de largura ela TIRA das colunas
                              de baixo — com o rótulo escrito, o selo de status da
                              linha aparecia cortado ao meio ("PRONTO PROD…").
                              Um botão de exceção não paga esse preço.

                              O que o rótulo dizia está no `title` e no
                              `aria-label`, que já eram a fonte do leitor de tela. */}
                          {!bulkOn && canProduce && podeDevolverParaRevisao(item) && (
                            <Botao
                              tamanho={tamLinha}
                              icone={Undo2}
                              onClick={() => { setDevolverItem(item); setDevolverMotivo(""); }}
                              title="Devolver para a Revisão Final — a peça sai da fila da Gráfica"
                              aria-label={`Devolver ${item.displayId} para a Revisão Final`}
                              data-testid={`button-devolver-revisao-${item.id}`}
                              style={{ color: TOM.perigo.text, borderColor: TOM.perigo.border, width: compacto ? "auto" : alvoDeToque(32, ponteiroGrosso), padding: compacto ? "0 8px" : 0, flexShrink: 0, justifyContent: compacto ? "flex-start" : "center" }}
                            >
                              {compacto && "Devolver para a Revisão"}
                            </Botao>
                          )}
                          </div>

                          {/* Iniciar / Continuar Produção — oculto para reaproveitamento
                              e para quem o servidor recusa (só grafica/admin produzem).
                              Depois de conferida, a peça só tem a entrega pela frente.
                              Vem DEPOIS das secundárias: a ação principal de cada
                              etapa (Produzir, Conferir, Entregar) fica sempre na
                              ponta direita, onde o olho já procura. */}
                          {!bulkOn && !emRevisao && canProduce && !isDelivered(item) && !isProduced(item) && !isPosConferencia(item) && !item.isReuse && (
                            <Botao
                              variante="primario"
                              tamanho={tamLinha}
                              icone={Play}
                              onClick={() => { if (!seloDaImpressao(item, selo)) openProductionModal(item); }}
                              disabled={!!seloDaImpressao(item, selo)}
                              /* PATCH /api/items/:id/start-production tem a
                                 guarda de evento finalizado: clicar aqui só
                                 renderia 409. */
                              title={seloDaImpressao(item, selo)
                                ? motivoAcaoBloqueada(seloDaImpressao(item, selo)!.motivo, "produzir")
                                : isInProd(item) ? tituloAcaoImpressao(item) : "Escolher a máquina e iniciar a impressão"}
                              data-testid={`button-production-${item.id}`}
                              {...bloqueioDaTrava(item)}
                            >
                              {isInProd(item) ? rotuloAcaoImpressao(item) : "Imprimir"}
                            </Botao>
                          )}
                          {!bulkOn && podeTirarBloqueada(item, selo) && (
                            <TirarDaImpressoraBloqueada item={item} fonte={12} alvo={32} pendente={mutacoesDeImpressao.mexerNaImpressoraMutation.isPending} onTirar={(m) => tirarBloqueada(item, m)} />
                          )}

                          {emRevisao && (
                            <Selo cores={P.fuchsia} icone={Eye} data-testid={`selo-revisao-${item.id}`} title="Esta peça ainda está na Revisão Final — aparece aqui para a Gráfica ver o que está chegando. As ações liberam quando a Revisão Final aprovar." style={{ padding: '4px 9px' }}>
                              Em revisão
                            </Selo>
                          )}
                          {!bulkOn && !emRevisao && podeConferir && canConfer(item) && (
                            <Botao
                              variante="primario"
                              tamanho={tamLinha}
                              icone={CheckCircle}
                              onClick={() => openConferenceModal(item)}
                              title={`Conferir (faltam ${remainingConfer(item)} de ${qtyOf(item)})`}
                              data-testid={`button-confer-${item.id}`}
                              {...bloqueioDaTrava(item)}
                              style={corDaAcao(TOM.ciano.text)}
                            >
                              {conferredOf(item) > 0 ? `Conferir ${remainingConfer(item)}` : "Conferir"}
                            </Botao>
                          )}

                          {/* Checkbox seleção em lote — nos DOIS modos (a
                              conferência em lote não tinha checkbox na tabela) */}
                          {bulkOn && bulkEligible && (
                            <div
                              role="checkbox"
                              tabIndex={0}
                              aria-checked={isSelected}
                              aria-label={`Selecionar ${item.displayId} para ${bulkConferMode ? 'conferência' : 'entrega'}`}
                              onClick={e => { e.stopPropagation(); toggleBulkItem(item.id); }}
                              // Mesmo suporte a teclado do card mobile: sem isto
                              // o role="checkbox" nem recebia foco.
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleBulkItem(item.id); }
                              }}
                              style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, border: `2px solid ${isSelected ? T.accent : T.bdark}`, background: isSelected ? T.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.12s' }}
                            >
                              {isSelected && <Check style={{ width: 13, height: 13, color: T.surface }} />}
                            </div>
                          )}
                          {/* EMBALAR (dono, 21/09): a principal da peça CONFERIDA — abre
                              o painel de tubos do evento já com a peça marcada, focado em
                              escolher o tubo. Azul do Embalado (#1d4ed8, 6,3:1 com branco). */}
                          {!bulkOn && podeEmbalarPeca && (
                            <Botao
                              variante="primario"
                              tamanho={tamLinha}
                              icone={Package}
                              onClick={() => abrirEmbalar([item])}
                              title="Pôr no tubo — escolhe o tubo no painel do evento"
                              data-testid={`button-embalar-${item.id}`}
                              {...bloqueioDaTrava(item)}
                              style={corDaAcao(TOM.info.text)}
                            >
                              {rotuloEmbalar(item)}
                            </Botao>
                          )}

                          {/* Embalada: entregar o TUBO inteiro — abre o painel já no
                              formulário daquele tubo (quem recebeu). Principal da
                              embalada, antes do "Tirar" (paridade com o cartão). */}
                          {!bulkOn && podeConferir && !soVisualizaKit(item) && temVolumeAberto(item) && item.eventId && (
                            <Botao
                              variante="primario"
                              tamanho={tamLinha}
                              icone={Truck}
                              onClick={() => setTubosDoEvento({ id: String(item.eventId), name: item.event?.name ?? "Evento", entregarTubo: item.tuboId })}
                              data-testid={`button-entregar-tubo-${item.id}`}
                              title="Entregar o tubo inteiro — a peça embalada só sai com o tubo"
                              {...bloqueioDaTrava(item)}
                              style={corDaAcao(TOM.info.text)}
                            >
                              {ehAvulsa(item) ? "Entregar" : "Entregar tubo"}
                            </Botao>
                          )}
                          {/* Embalado: tirar do tubo devolve a Conferido (21/09) — secundária. */}
                          {!bulkOn && podeConferir && !soVisualizaKit(item) && temVolumeAberto(item) && (
                            <Botao
                              tamanho={tamLinha}
                              icone={Undo2}
                              onClick={() => tirarDoTuboMutation.mutate({ itemId: item.id, tuboId: item.tuboId, displayId: item.displayId })}
                              carregando={tirarDoTuboMutation.isPending && tirarDoTuboMutation.variables?.itemId === item.id}
                              data-testid={`button-tirar-do-tubo-${item.id}`}
                              title="Tira a peça do tubo — ela volta a Conferido"
                            >
                              {ehAvulsa(item) ? "Desfazer embalagem" : "Tirar do tubo"}
                            </Botao>
                          )}

                          {/* Entregue */}
                          {!bulkOn && isDelivered(item) && (
                            <span style={{ fontSize: FS.body, color: TOM.sucesso.text, display: "inline-flex", alignItems: "center", gap: 4, fontWeight: FW.medio }}>
                              <Check style={{ width: 13, height: 13 }} /> Entregue
                            </span>
                          )}
                          </>)}
                        </div>
                      </td>
                    </tr>

                    {/* MOTIVO DO AUMENTO — linha de largura total logo abaixo do
                        complemento, no mesmo molde da de observações (as duas
                        coexistem). SEM truncar: a observação corta com
                        reticências porque é acessório; aqui a justificativa é a
                        informação principal, e é o "isso fica nos logs" do
                        pedido resolvido sem abrir ficha nenhuma. Some junto com
                        o resto do realce quando o lote é entregue. */}
                    {coAberto && item.complementReason && (
                      <tr style={{ backgroundColor: CO.bg, borderBottom: `1px solid ${CO.border}` }}>
                        <td colSpan={nColunas} style={{ padding: "5px 16px 7px 34px" }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                            <PlusCircle style={{ width: 12, height: 12, color: CO.text, marginTop: 1, flexShrink: 0 }} />
                            <span style={{ fontSize: FS.meta, color: CO.textStrong, lineHeight: 1.4 }} data-testid={`text-motivo-complemento-${item.id}`}>
                              <strong>
                                Aumento pedido{item.complementRequestedBy ? ` por ${item.complementRequestedBy}` : ""}
                              </strong>
                              {item.complementRequestedAt ? ` (${fmtDataHora(item.complementRequestedAt)})` : ""}: {item.complementReason}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Linha de observação */}
                    {item.observations && (
                      <tr style={{ backgroundColor: TOM.alerta.bg, borderBottom: `1px solid ${TOM.alerta.border}` }}>
                        <td colSpan={nColunas} style={{ padding: "8px 16px" }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                            <AlertCircle style={{ width: 14, height: 14, color: TOM.alerta.text, marginTop: 1, flexShrink: 0 }} />
                            <span style={{ fontSize: 13, color: TOM.alerta.text }}>
                              <strong>Observações:</strong> {item.observations}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Renderização incremental: fim do teto deste evento. */}
                    {corte && (
                      <tr style={{ backgroundColor: T.bg, borderBottom: `1px solid ${T.border}` }}>
                        <td colSpan={nColunas} style={{ padding: "8px 16px", textAlign: "center" }}>
                          <Botao
                            variante="fantasma"
                            tamanho={tamLinha === "toque" ? "toque" : "md"}
                            onClick={e => { e.stopPropagation(); expandirGrupo(corte.chave); }}
                            data-testid={`button-mostrar-todas-${corte.chave}`}
                            style={{ border: `1px dashed ${T.border}`, color: T.text }}
                          >
                            Mostrar todas as {corte.total} peças deste evento (+{corte.ocultas})
                          </Botao>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                  )} />
                );
              })}
            </tbody>
          </table>
          </div>
        )}
        {/* Próximo lote de linhas: entra sozinho quando a rolagem chega perto
            do fim do que está desenhado, ou pelo botão (teclado, leitor de
            tela). Fora do ramo de carregando/erro, onde não há lista. */}
        {/* Sem a condição "falta desenhar": o próprio sentinela some quando a
            lista está completa, e precisa continuar montado no último lote
            pedido pelo botão para levar o foco ao texto do fim. */}
        {!isLoading && !isError && (
          <SentinelaDaLista
            mostradas={linhasRenderizadas.length}
            total={linhasVisiveis.length}
            lote={LINHAS_POR_LOTE}
            onMais={() => desenharMaisLinhas()}
            compacto={usaCards}
          />
        )}

      </div>
      </div>
      )}

      {/* ── Barra flutuante dos modos em lote (entrega, conferência OU embalar) ── */}
      {bulkOn && (
        <div
          role="toolbar"
          aria-label={bulkConferMode ? "Ações da conferência em lote" : bulkPackMode ? "Ações do embalar em lote" : "Ações da entrega em lote"}
          style={{
            // A barra ancora na COLUNA DE CONTEÚDO. Com left:0 e zIndex 50 ela
            // passava por cima da sidebar (fixed, z-10) e cobria a navegação e o
            // bloco de usuário/Sair enquanto o operador montava o lote. No
            // celular a sidebar não é fixa, então ali continua colada na borda.
            position: 'fixed', bottom: 0, left: isMobile ? 0 : 'var(--sidebar-width, 16rem)', right: 0, zIndex: 50,
            background: T.text,
            // LONGOS: o atalho com env() some no parser do jsdom (ver o teste
            // grafica-celular). O valor no navegador é o mesmo de antes.
            paddingTop: isMobile ? 10 : 12, paddingLeft: isMobile ? 12 : 16, paddingRight: isMobile ? 12 : 16,
            paddingBottom: isMobile ? 'calc(10px + env(safe-area-inset-bottom))' : 'calc(12px + env(safe-area-inset-bottom))',
            // CELULAR EM DUAS LINHAS: em 360px os quatro itens numa linha
            // deixavam ~20px para o bloco "Conferência · 3 de 40" — o contador
            // sumia. Linha 1: modo + contador e o X; linha 2: Todas e o
            // "Continuar para a foto (N)" largo, na zona do polegar.
            display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 10, flexWrap: isMobile ? 'wrap' : 'nowrap',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.28)',
          }}>
          {/* Selecionar tudo / desmarcar */}
          <button
            onClick={() => allDeliverableSelected
              ? setBulkSelectedIds(new Set())
              : setBulkSelectedIds(new Set(bulkEligibleList.map((i: any) => i.id)))
            }
            // "Sel. 12" era abreviação de planilha; o botão agora diz a ação por
            // extenso e tem alvo de dedo (44px) no celular.
            aria-label={allDeliverableSelected ? 'Desmarcar todas as peças' : `Selecionar todas as ${bulkEligibleList.length} peças elegíveis`}
            // A barra é ESCURA: os botões dela ficam locais (o Botao é pele de
            // fundo claro), mas com a classe .ds-botao — hover e foco da casa.
            className="ds-botao"
            style={{ order: isMobile ? 2 : undefined, minHeight: isMobile ? 48 : alvoDeToque(36, ponteiroGrosso), padding: isMobile ? '0 10px' : '0 12px', borderRadius: R.md, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)', fontSize: isMobile ? FS.read : FS.body, fontWeight: FW.forte, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {/* "Sel. 1" lia como "1 selecionada" com nada selecionado — o
                operador achava que o Confirmar estava quebrado (dono, 14/09).
                No celular a barra é estreita: "Todas (N)" diz o mesmo. */}
            {allDeliverableSelected ? 'Desmarcar' : isMobile ? `Todas (${bulkEligibleList.length})` : `Selecionar todas (${bulkEligibleList.length})`}
          </button>

          {/* Modo + contador. O MODO morava num selo do cabeçalho ("Modo
              conferência em lote ativo"), lá em cima, longe da barra onde a
              pessoa age — e sumido da vista assim que rolava a lista. Agora é o
              rótulo da própria barra, na cor da etapa (bolinha, não texto).
              aria-live só no contador: anuncia a contagem a cada seleção. */}
          {/* Celular: base "100% − X − espaço" força a quebra — esta linha é
              só modo + contador e o X; os botões descem para a de baixo. */}
          <span style={{ order: isMobile ? 0 : undefined, flex: isMobile ? '1 1 calc(100% - 52px)' : 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: isMobile ? FS.meta : FS.small, fontWeight: FW.rotulo, color: 'rgba(255,255,255,0.78)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, backgroundColor: bulkConferMode ? TOM.ciano.dot : bulkPackMode ? TOM.info.dot : T.accent }} />
              {bulkConferMode ? 'Conferência em lote' : bulkPackMode ? 'Embalar em lote' : 'Entrega em lote'}
            </span>
            <span aria-live="polite" style={{ color: bulkSelectedIds.size > 0 ? T.surface : 'rgba(255,255,255,0.78)', fontSize: isMobile ? FS.read : FS.body, fontWeight: FW.forte, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {bulkSelectedIds.size > 0
                ? (isMobile
                  ? `${bulkSelectedIds.size} de ${bulkEligibleList.length} marcada${bulkSelectedIds.size !== 1 ? 's' : ''}`
                  : `${bulkSelectedIds.size} peça${bulkSelectedIds.size !== 1 ? 's' : ''} selecionada${bulkSelectedIds.size !== 1 ? 's' : ''}`)
                : isMobile ? 'Toque nas peças para marcar'
                // Conferência em lote: diz QUAIS peças tocar (as em acabamento);
                // embalar em lote: as conferidas.
                : bulkConferMode
                  ? (usaCards ? 'Toque nas peças em acabamento para conferir' : 'Clique nas linhas em acabamento para conferir')
                  : bulkPackMode
                    ? (usaCards ? 'Toque nas peças conferidas para embalar' : 'Clique nas linhas conferidas para embalar')
                    : (usaCards ? 'Toque nas peças para selecionar' : 'Clique nas linhas para selecionar')}
              {isMobile && bulkSelectedIds.size > 0 && <span className="sr-only"> peças</span>}
            </span>
          </span>

          {/* Confirmar — aria-disabled (não disabled) para poder receber o foco
              ao entrar no modo; o onClick já ignora o clique sem seleção. */}
          {/* "Confirmar" aqui NÃO registrava nada — abria a foto. Quem tocava
              achava que já tinha conferido e saía. O rótulo agora diz o
              próximo passo, e o toque sem seleção responde em vez de calar. */}
          <button
            ref={bulkConfirmRef}
            onClick={() => {
              if (bulkSelectedIds.size === 0) {
                toast({ title: "Nenhuma peça marcada", description: `${usaCards ? "Toque nas peças" : "Clique nas linhas"} (ou em Todas) para escolher o que ${bulkConferMode ? "conferir" : "embalar"}.`, variant: "warning" });
                return;
              }
              if (bulkConferMode) { setBulkConferOpen(true); return; }
              // Embalar em lote: um tubo pertence a um evento — com peças de
              // vários eventos marcadas, avisa em vez de abrir o painel.
              if (eventosDoLote.length > 1) {
                toast({ title: "Marque peças de um evento só", description: `Um tubo pertence a um evento. Há peças de ${eventosDoLote.length} eventos marcadas (${eventosDoLote.map((e) => e.nome).join(", ")}).`, variant: "warning" });
                return;
              }
              abrirEmbalar(bulkSelectedItems, true);
            }}
            aria-disabled={bulkSelectedIds.size === 0}
            data-testid="button-bulk-continuar"
            className="ds-botao"
            title={bulkSelectedIds.size > 0 ? (bulkPackMode ? "Abre a escolha do tubo — nada é registrado antes disso" : "Abre a foto e a confirmação — nada é registrado antes disso") : "Marque ao menos uma peça"}
            style={{
              order: isMobile ? 3 : undefined, flex: isMobile ? '1 1 0' : undefined, minWidth: 0, justifyContent: 'center',
              minHeight: isMobile ? 48 : 44, padding: isMobile ? '0 12px' : '0 18px', borderRadius: R.md, border: 'none', flexShrink: 0,
              background: bulkSelectedIds.size === 0 ? 'rgba(255,255,255,0.15)' : bulkConferMode ? TOM.ciano.text : bulkPackMode ? TOM.info.text : T.accentText,
              // 0.35 de branco sumia no preto; 0.6 ainda lê "inativo" e se lê.
              color: bulkSelectedIds.size === 0 ? 'rgba(255,255,255,0.6)' : T.surface,
              fontSize: FS.body, fontWeight: FW.rotulo, fontFamily: FONT.corpo,
              cursor: bulkSelectedIds.size === 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 7,
              boxShadow: bulkSelectedIds.size > 0 ? (bulkConferMode ? '0 4px 16px rgba(14,116,144,0.4)' : bulkPackMode ? '0 4px 16px rgba(29,78,216,0.4)' : '0 4px 16px rgba(194,65,12,0.4)') : 'none',
              transition: 'all 0.15s',
            }}
          >
            {bulkPackMode
              ? <Package aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0 }} />
              : <Camera aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0 }} />}
            {/* O rótulo inteiro também no celular: "Continuar" sozinho não
                dizia que o próximo passo é a FOTO (nada é gravado ainda). No
                embalar, o próximo passo é escolher o TUBO. */}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: isMobile ? 14 : undefined }}>
              {bulkPackMode ? "Escolher o tubo" : "Continuar para a foto"}{bulkSelectedIds.size > 0 && ` (${bulkSelectedIds.size})`}
            </span>
          </button>

          {/* Cancelar modo — o rótulo responde "perco alguma coisa?": só a
              seleção e a foto ainda não enviada; nada foi registrado. */}
          <button
            onClick={sairDoLote}
            aria-label="Sair do modo lote sem registrar"
            title="Sair do lote (Esc) — desmarca as peças; nada é registrado"
            className="ds-botao"
            style={{ order: isMobile ? 1 : undefined, width: isMobile ? 44 : alvoDeToque(36, ponteiroGrosso), height: isMobile ? 44 : alvoDeToque(36, ponteiroGrosso), borderRadius: R.md, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>
      )}

      {/* ── Dialogs dos modos em lote (componente único, ver BulkActionDialog) ── */}
      {/* Fechar NÃO descarta a foto; trocar as peças marcadas, sim: ver
          `selecaoDaFotoRef` e `sairDoLote`. */}
      <BulkActionDialog
        open={bulkConferOpen}
        onClose={() => setBulkConferOpen(false)}
        items={bulkSelectedItems}
        photos={bulkConferPhotos}
        onAddPhoto={addBulkConferPhoto}
        onRemovePhoto={url => setBulkConferPhotos(prev => prev.filter(u => u !== url))}
        onPhotoError={onPhotoError}
        notes={bulkConferNotes}
        onNotesChange={setBulkConferNotes}
        isSubmitting={isBulkSubmitting}
        onConfirm={handleBulkConference}
        qtyFor={remainingConfer}
      />

      {/* ── Dialog de Detalhes ── */}
      {/* O bloco de complemento da ficha é o MESMO componente das outras telas —
          zero desenho novo. Na mãe: a lista de complementos com status e o total
          realmente contratado; no filho: "complemento de #0062" com motivo,
          autor e data. `onAbrirPeca` resolve o beco sem saída — do complemento
          (que nunca tem o gatilho) chega-se à mãe em um clique.
          `temBlocoDeComplemento` é obrigatório: o slot é testado por verdade do
          nó, e um elemento que renderiza null deixa 36px de buraco em toda peça
          normal. */}
      <ItemDetailsDialog
        item={viewDetailsItem}
        auditLogs={auditLogs}
        open={!!viewDetailsItem}
        onOpenChange={(open) => !open && setViewDetailsItem(null)}
        customActions={temBlocoDeComplemento(viewDetailsItem, podeMexerQtd)
          ? (
            <ComplementoDaFicha
              item={viewDetailsItem}
              canEditLists={podeMexerQtd}
              /* Terceira porta para POST /api/items/:id/complement, que a
                 guarda de evento finalizado barra. Sem `onAumentar` o
                 ComplementoDaFicha não desenha o botão — e aqui HIDE em vez de
                 disable é o certo: a ficha é uma sobreposição, e quem chegou
                 nela veio da linha, onde o selo e o botão desabilitado com o
                 motivo já contaram a história. */
              onAumentar={seloPecaEventoFinalizado(viewDetailsItem?.event, hojeBusinessMs) ? undefined : abrirComplemento}
              onAbrirPeca={(id) => setViewDetailsItem((items as any[]).find((i: any) => i.id === id) ?? viewDetailsItem)}
            />
          )
          : undefined}
      />

      {/* ── Aumentar quantidade: o modal, montado uma vez para a tela ── */}
      <AumentarQuantidadeDialog
        item={complementoItem}
        event={complementoItem?.event ?? null}
        open={!!complementoItem}
        onOpenChange={(o) => { if (!o) setComplementoItem(null); }}
        onCreated={handleComplementoCriado}
      />

      {/* ── Modal de Impressão / Conferência ── */}
      <Dialog open={!!selectedItem && !!modalType} onOpenChange={open => { if (!open) { setSelectedItem(null); setModalType(null); } }}>
        <DialogContent ref={modalPecaRef} className={HIDE_NATIVE_CLOSE} style={modalSurface(468)}>
          <DialogTitle className="sr-only">
            {modalType === "production" ? "Impressão da peça" : "Conferir peça"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {modalType === "production" ? "Inicie a impressão ou informe quantas unidades já saíram da impressora"
              : "Anexe a foto da conferência e confirme a quantidade"}
          </DialogDescription>

          {/* rgba(255,255,255,0.4) media ~3.9:1 sobre o cabeçalho escuro — a
              legenda que diz o que fazer era a coisa menos legível do modal. */}
          {/* `tint` na COR DA AÇÃO. Os três tipos recebiam T.accent, então a
              conferência — ciano em toda a tela — abria com um ladrilho laranja,
              a cor da entrega: por um instante some a certeza de ter aberto a
              coisa certa, um instante antes de uma ação irreversível.
              O subtítulo da produção diz o contrato do campo: ele grava o TOTAL,
              e "Continuar" é exatamente a palavra que ensina a ler ao contrário. */}
          <ModalHeader
            icon={modalType === "production" ? Play : CheckCircle}
            tint={modalType === "conference" ? TOM.ciano.text : T.text}
            title={modalType === "production"
              ? cabecalhoDoModalDeImpressao(selectedItem).title
              : "Conferir peça"}
            subtitle={modalType === "production"
              ? cabecalhoDoModalDeImpressao(selectedItem).subtitle
              : "Compare a peça pronta com a arte e tire a foto"}
            onClose={() => { setSelectedItem(null); setModalType(null); }}
          />

          {/* ── Corpo ── */}
          {/* ALTURA: era `calc(88vh - 112px)`, outro desconto FIXO (112 chutado
              para um cabeçalho que mede 93). Dava `88vh − 19` de modal, que cabe
              no teto de `100vh − 48` em qualquer janela acima de ~242px — este
              modal NÃO cortava. O desconto sai pelo mesmo motivo do modal em
              lote acima: acerta por coincidência e quebra assim que o subtítulo
              ganhar uma linha. Com o teto no DialogContent (via `modalSurface`),
              `flex: 1 1 auto` + `minHeight: 0` dá a este corpo o que sobrar do
              cabeçalho medido pelo navegador. */}
          <div style={{ padding: padModal, display: "flex", flexDirection: "column", gap: isMobile ? 16 : 20, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>

            {/* Arte aprovada em destaque — na conferência é o que a pessoa
                compara com a peça na mão, quase sempre pelo celular. Precisa ser
                a maior coisa da tela, não uma miniatura ao lado do texto. */}
            {selectedItem?.approvalThumbUrl && modalType !== "production" && (
              <a
                href={convertGCSUrlToLocalPath(selectedItem.approvalThumbUrl)}
                target="_blank"
                rel="noopener noreferrer"
                title="Tocar para abrir em tamanho real"
                data-testid="thumb-approved-art"
                style={{
                  display: "block", position: "relative", width: "100%",
                  // Nunca mais que um terço da tela: em 640px de altura os 240
                  // fixos empurravam a foto e o Confirmar para fora da dobra.
                  height: isMobile ? "min(240px, 34dvh)" : 200,
                  // O corpo do modal é um flex column com rolagem: sem
                  // flexShrink 0 este bloco era espremido até uma linha fina
                  // quando o conteúdo passava da altura máxima.
                  flexShrink: 0,
                  borderRadius: 12, overflow: "hidden",
                  backgroundColor: T.surface, border: `1px solid ${T.border}`,
                }}
              >
                <img loading="lazy" decoding="async" src={convertGCSUrlToLocalPath(selectedItem.approvalThumbUrl)}
                  alt="Arte aprovada"
                  style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
                <span style={{ position: "absolute", top: 8, left: 8, backgroundColor: "rgba(28,25,23,0.78)", color: T.surface, fontSize: fsMin(FS.small), fontWeight: FW.rotulo, padding: "4px 8px", borderRadius: R.sm }}>
                  Arte aprovada
                </span>
                <span style={{ position: "absolute", bottom: 8, right: 8, backgroundColor: "rgba(28,25,23,0.78)", color: T.surface, fontSize: fsMin(FS.small), fontWeight: FW.forte, padding: "4px 8px", borderRadius: R.sm, display: "flex", alignItems: "center", gap: 4 }}>
                  <Search aria-hidden="true" style={{ width: 12, height: 12 }} /> Ampliar
                </span>
              </a>
            )}

            {/* Card de identificação */}
            {selectedItem && (
              <div style={{ backgroundColor: N.n2, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ backgroundColor: T.surface, borderRadius: 8, padding: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", flexShrink: 0 }}>
                    {modalType === "production"
                      ? <Printer style={{ width: 20, height: 20, color: T.accent }} />
                      : <CheckCircle style={{ width: 20, height: 20, color: TOM.ciano.text }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 3 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: 6, minWidth: 0 }}>
                        <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: isMobile ? 16 : 13, color: selectedItem.isReuse ? TOM.esmeralda.text : T.accentText }}>{selectedItem.displayId}</span>
                        <SeloKit peca={selectedItem} style={{ flexShrink: 0 }} />
                        <AvisoDoEstoqueNaPeca peca={selectedItem} style={{ flexShrink: 0 }} />
                        {/* Produzir/conferir/entregar um complemento é registrar
                            um LOTE SEPARADO: o modal precisa dizer isso, senão
                            o operador acha que está lançando na peça original. */}
                        {isComplement(selectedItem) && (
                          <span style={{ backgroundColor: CO.solidBg, color: CO.solidText, borderRadius: R.sm, padding: "1px 6px", fontSize: fsMin(FS.micro), fontWeight: FW.rotulo, whiteSpace: "nowrap" }}>
                            Compl. de {parentDisplayIdOf(selectedItem)}
                          </span>
                        )}
                      </span>
                      <StatusPill status={statusDeExibicao(selectedItem)} size="sm" showDot={false} />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{selectedItem.type}</div>
                    {selectedItem.description && selectedItem.description !== selectedItem.type && (
                      <div style={{ fontSize: 13, color: T.second, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedItem.description}</div>
                    )}
                    {selectedItem.event?.name && (
                      <div style={{ fontSize: 13, color: T.second, marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
                        <Calendar style={{ width: 11, height: 11, flexShrink: 0 }} />
                        {selectedItem.event.name}
                      </div>
                    )}
                  </div>
                </div>

                {/* Grade de specs */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ background: T.surface, borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: fsMin(FS.small), fontWeight: FW.forte, color: T.apoio, marginBottom: 3 }}>Material</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{selectedItem.material || '—'}</div>
                    {selectedItem.visualWidth && (
                      <div style={{ fontSize: fsMin(11), color: T.second, marginTop: 1 }}>{selectedItem.visualWidth} × {selectedItem.visualHeight}m</div>
                    )}
                  </div>
                  <div style={{ background: T.surface, borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: fsMin(FS.small), fontWeight: FW.forte, color: T.apoio, marginBottom: 3 }}>Acabamento</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{selectedItem.finish || '—'}</div>
                    {Number(selectedItem.calculatedM2) > 0 && (
                      <div style={{ fontSize: fsMin(11), color: T.second, marginTop: 1 }}>{m2ToProduce(selectedItem).toFixed(2)} m²</div>
                    )}
                  </div>
                  <div style={{ background: T.surface, borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: fsMin(FS.small), fontWeight: FW.forte, color: T.apoio, marginBottom: 2 }}>Quantidade</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: T.text, fontFamily: FONT.display, lineHeight: 1 }}>{qtyOf(selectedItem)}<span style={{ fontSize: fsMin(11), fontWeight: 500, color: T.second, marginLeft: 3 }}>un.</span></div>
                    {selectedItem.isReuse && <div style={{ fontSize: fsMin(FS.small), color: TOM.esmeralda.text, marginTop: 2, fontWeight: FW.medio }}>Reaproveitado</div>}
                  </div>
                  {/* Tile de contexto — nos dois tipos. A produção era o
                      único modal que nunca dizia quanto já foi produzido, e é
                      justamente o único cujo campo é ABSOLUTO: sem este número
                      na tela, quem digitava "o que fez hoje" apagava o resto e
                      não havia nada, em lugar nenhum, mostrando o valor
                      anterior. Ciano único #0e7490 (5,36:1); #0891b2 dava
                      3,68:1 em 18px/800. */}
                  {(modalType === "conference" || modalType === "production") && (
                    <div style={{
                      background: modalType === "conference" ? TOM.ciano.bg : N.n2,
                      borderRadius: 8, padding: '8px 10px',
                      border: `1px solid ${modalType === "conference" ? TOM.ciano.border : T.bdark}`,
                    }}>
                      <div style={{ fontSize: fsMin(FS.small), fontWeight: FW.forte, color: modalType === "conference" ? TOM.ciano.text : T.apoio, marginBottom: 2 }}>
                        {modalType === "conference" ? "A Conferir" : (isInProd(selectedItem) && !iniciandoResto ? "Na impressora" : "A imprimir")}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: modalType === "conference" ? TOM.ciano.text : T.text, fontFamily: FONT.display, lineHeight: 1 }}>
                        {modalType === "conference" ? remainingConfer(selectedItem)
                          : iniciandoResto ? semImpressora(selectedItem) : remainingProduce(selectedItem)}<span style={{ fontSize: fsMin(11), fontWeight: 500, marginLeft: 3 }}>un.</span>
                      </div>
                      {modalType === "conference" && conferredOf(selectedItem) > 0 && (
                        <div style={{ fontSize: fsMin(FS.small), color: TOM.ciano.text, marginTop: 2 }}>{conferredOf(selectedItem)} já conferida{conferredOf(selectedItem) !== 1 ? 's' : ''}</div>
                      )}
                      {modalType === "production" && (
                        <div data-testid="text-ja-produzidas" style={{ fontSize: fsMin(FS.small), color: T.apoio, marginTop: 2 }}>
                          {producedOf(selectedItem)} já impressa{producedOf(selectedItem) !== 1 ? 's' : ''} de {qtyOf(selectedItem)}
                          {reusedTotalOf(selectedItem) > 0 && ` · ${reusedTotalOf(selectedItem)} reaproveitada${reusedTotalOf(selectedItem) !== 1 ? 's' : ''}`}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Motivo do aumento — quem está com a peça na mão lê aqui por
                    que este lote existe, antes de mandar para a impressora. */}
                {isComplement(selectedItem) && selectedItem.complementReason && (
                  <div style={{ background: CO.bg, border: `1px solid ${CO.border}`, borderRadius: 8, padding: '8px 10px', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                    <PlusCircle aria-hidden="true" style={{ width: 12, height: 12, color: CO.text, flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 13, color: CO.textStrong, lineHeight: 1.4 }}>
                      <strong>
                        Aumento pedido{selectedItem.complementRequestedBy ? ` por ${selectedItem.complementRequestedBy}` : ""}
                      </strong>
                      {selectedItem.complementRequestedAt ? ` (${fmtDataHora(selectedItem.complementRequestedAt)})` : ""}: {selectedItem.complementReason}
                    </span>
                  </div>
                )}

                {/* Observações */}
                {selectedItem.observations && (
                  <div style={{ background: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: 8, padding: '8px 10px', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                    <AlertCircle style={{ width: 12, height: 12, color: TOM.alerta.text, flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 13, color: TOM.alerta.text, lineHeight: 1.4 }}>{selectedItem.observations}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── FORM: IMPRESSÃO — compartilhado com a aba Máquinas ── */}
            {/* key={id}: a máquina e a quantidade nascem da peça dentro do
                formulário; trocar a peça remonta limpo, sem efeito de sync. */}
            {selectedItem && modalType === "production" && (
              <FormularioDeImpressao
                // A etapa entra na chave: a peça que muda de "liberada" para "em impressão"
                // (ou volta) enquanto o modal está aberto remonta o formulário certo.
                key={`${selectedItem.id}:${iniciandoResto ? "resto" : ""}:${isInProd(selectedItem) ? "imp" : "lib"}`}
                parteAIniciar={iniciandoResto ? { quantidade: semImpressora(selectedItem), daReserva: false } : null}
                item={selectedItem}
                // Uma peça por vez por impressora: quem ocupa cada impressora sai
                // de ocupacaoDasImpressoras — a MESMA régua (e o mesmo formato)
                // que a aba Máquinas passa ao modal; com o ocupante inteiro o
                // modal oferece "Imprimir esta no lugar". O 409 do servidor
                // continua sendo a autoridade.
                ocupadas={ocupacaoDasImpressoras((pecasDoServidor as any[]).filter(estaEmImpressao), selectedItem.id)}
                onFechar={() => { setSelectedItem(null); setModalType(null); }}
                padModal={padModal}
                mutacoes={mutacoesDeImpressao}
              />
            )}

            {selectedItem && modalType === "conference" && (() => {
              const faltam = remainingConfer(selectedItem);
              const aindaNaImpressora = Math.max(0, qtyOf(selectedItem) - conferredOf(selectedItem) - faltam);
              const embalarJunto = oferecerEmbalarJunto(selectedItem, conferQty);
              const ocupado = conferMutation.isPending || conferindoEEmbalando;
              const bloqueado = ocupado || !photos.length || fotosSubindo > 0;
              const rotulo = conferindoEEmbalando && !conferMutation.isPending ? "Embalando…"
                : conferMutation.isPending ? "Conferindo…"
                : fotosSubindo > 0 ? "Enviando foto…"
                : !photos.length ? "Falta a foto"
                : embalarJunto && jaEmbalar ? `Conferir e embalar ${conferQty} un.` : `Conferir ${conferQty} un.`;
              return (
              <form onSubmit={handleSubmitConference} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <p style={{ fontSize: 13, color: T.apoio, margin: 0 }}>
                  Confira a peça e anexe a foto. Pode conferir parcialmente — depois é só conferir o restante.
                </p>
                {aindaNaImpressora > 0 && (
                  <p data-testid="aviso-conferir-so-impressas" style={{ fontSize: 13, color: TOM.ciano.text, margin: "-8px 0 0", lineHeight: 1.4 }}>
                    Só dá para conferir o que já saiu da impressora: {aindaNaImpressora} un. ainda não {aindaNaImpressora !== 1 ? "foram impressas" : "foi impressa"}.
                  </p>
                )}
                {faltam > 1 && (
                  <div>
                    <label htmlFor="input-qtd-conferir" style={{ display: "block", fontSize: fsMin(FS.small), fontWeight: FW.forte, color: T.apoio, marginBottom: 8 }}>
                      Quantidade a conferir agora <span style={{ color: T.second, fontWeight: FW.corpo }}>· já conferido {conferredOf(selectedItem)}/{qtyOf(selectedItem)}, disponíveis {faltam}</span>
                    </label>
                    <input id="input-qtd-conferir" type="number" inputMode="numeric" pattern="[0-9]*" min={1} max={faltam} value={conferQty}
                      onChange={e => setConferQty(Math.max(1, Math.min(faltam, parseInt(e.target.value) || 1)))}
                      style={{ width: "100%", boxSizing: "border-box", minHeight: 44, padding: "10px 14px", backgroundColor: N.n3, border: "1px solid transparent", borderRadius: 8, fontSize: 16, fontWeight: 700, color: T.text }} />
                  </div>
                )}
                {/* A foto que termina de subir depois de o modal fechar ou mudar
                    de peça é descartada (chave da abertura). */}
                <PhotoPicker photos={photos} onAdd={fotoDaAbertura(chaveDoModal)} onRemove={removePhoto} onError={onPhotoError} onEnviandoMudou={setFotosSubindo} hint="· obrigatória, pode anexar várias" />

                {/* CONFERIR E EMBALAR (decisão CONFERIR_E_EMBALAR): quando esta
                    conferência zera o que falta, embala já em volume avulso com
                    a mesma foto. Desmarcado, a peça ganha o Embalar na fila. */}
                {embalarJunto && (
                  <label data-testid="opcao-ja-embalar" style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, padding: "0 12px", background: TOM.info.bg, border: `1px solid ${TOM.info.border}`, borderRadius: 8, fontSize: 14, fontWeight: 600, color: TOM.info.text, cursor: "pointer" }}>
                    <input type="checkbox" checked={jaEmbalar} onChange={e => setJaEmbalar(e.target.checked)} data-testid="checkbox-ja-embalar"
                      style={{ width: 22, height: 44, margin: 0, accentColor: TOM.info.text, flexShrink: 0, cursor: "pointer" }} />
                    Já embalar (volume avulso) com esta foto
                  </label>
                )}

                {renderNotesField("Ex.: cor puxando para o escuro, ilhós faltando…")}
                <div style={modalActionsStyle}>
                  <Botao tamanho="toque" onClick={() => { setSelectedItem(null); setModalType(null); }}
                    style={{ flex: 1, minHeight: isMobile ? 48 : 44 }}>
                    Cancelar
                  </Botao>
                  {/* Ativo: o ciano da etapa. Desabilitado: a frase do que
                      falta logo abaixo (aria-describedby), à vista. */}
                  <Botao type="submit" variante="primario" tamanho="toque" disabled={bloqueado}
                    carregando={ocupado || fotosSubindo > 0}
                    data-testid="button-confirm-conference"
                    aria-describedby={!ocupado && (fotosSubindo > 0 || !photos.length) ? "aviso-foto-conferencia" : undefined}
                    style={{ ...corDaAcao(TOM.ciano.text), flex: 2, minHeight: isMobile ? 48 : 44 }}>
                    {rotulo}
                  </Botao>
                  {!ocupado && (fotosSubindo > 0 || !photos.length) && (
                    <p id="aviso-foto-conferencia" style={{ flex: "1 1 100%", margin: "-2px 0 0", fontSize: fsMin(FS.small), color: T.apoio, textAlign: "center" }}>
                      {fotosSubindo > 0
                        ? "A foto ainda está subindo — o Conferir libera quando ela chegar."
                        : "Anexe ao menos uma foto para confirmar a conferência."}
                    </p>
                  )}
                </div>
              </form>
              );
            })()}

          </div>
        </DialogContent>
      </Dialog>

      {/* Devolver para a Revisão — o motivo é obrigatório pela mesma régua das
          outras devoluções: quem recebe a peça de volta precisa saber o que
          refazer, senão é ida e volta garantida. */}
      {/* TRAVAR A PEÇA (Solicitação e admin, 21/09): motivo obrigatório, com
          atalhos. A Gráfica lê o motivo no selo e no title dos botões. */}
      <style>{CSS_DA_TRAVA}</style>
      <Dialog open={!!travandoItem} onOpenChange={(o) => { if (!o) { setTravandoItem(null); setMotivoDaTrava(""); } }}>
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(440)} data-testid="modal-travar">
          <DialogTitle className="sr-only">Travar peça</DialogTitle>
          <DialogDescription className="sr-only">Diga o motivo — a Gráfica não consegue fazer a peça andar até alguém destravar</DialogDescription>
          <ModalHeader icon={Lock} tint={TOM.perigo.text} title={`Travar ${travandoItem?.displayId ?? "peça"}`} subtitle="A Gráfica vê o motivo e não consegue fazer a peça andar até alguém da Solicitação destravar" onClose={() => { setTravandoItem(null); setMotivoDaTrava(""); }} />
          {travandoItem && (() => {
            const lido = lerMotivo(motivoDaTrava);
            const pode = lido.ok && !travarMutation.isPending;
            const enviar = () => { if (lido.ok && !travarMutation.isPending) travarMutation.mutate({ itemId: travandoItem.id, motivo: lido.motivo, displayId: travandoItem.displayId }); };
            return (
              <div style={{ padding: isMobile ? 16 : 24, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
                <div role="group" aria-label="Motivos comuns" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {SUGESTOES_DE_MOTIVO.map((s) => (
                    <button key={s} type="button" className="ds-botao" onClick={() => setMotivoDaTrava(s)} data-testid={`chip-motivo-${s}`} aria-pressed={motivoDaTrava === s} style={{ minHeight: alvoDeToque(32, isMobile || ponteiroGrosso), padding: "0 12px", borderRadius: 999, border: `1px solid ${motivoDaTrava === s ? TOM.perigo.text : T.bdark}`, background: motivoDaTrava === s ? TOM.perigo.bg : T.surface, color: TOM.perigo.text, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: "pointer" }}>{s}</button>
                  ))}
                </div>
                <label htmlFor="input-motivo-trava" style={{ fontSize: FS.meta, fontWeight: FW.forte, color: T.apoio }}>Motivo (obrigatório)</label>
                <textarea
                  id="input-motivo-trava"
                  value={motivoDaTrava}
                  onChange={(e) => setMotivoDaTrava(e.target.value)}
                  rows={3}
                  maxLength={300}
                  placeholder="Ex.: a arte vai mudar — segurar a impressão"
                  data-testid="input-motivo-trava"
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.bdark}`, fontSize: isMobile ? 16 : 13, fontFamily: "inherit", resize: "vertical" }}
                />
                {!lido.ok && motivoDaTrava.trim().length > 0 && (
                  <div role="status" data-testid="aviso-motivo-trava" style={{ fontSize: 12, color: TOM.alerta.text }}>Pelo menos {MOTIVO_MINIMO} letras — é o que a Gráfica vai ler.</div>
                )}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingBottom: "env(safe-area-inset-bottom)" }}>
                  <Botao tamanho="toque" onClick={() => { setTravandoItem(null); setMotivoDaTrava(""); }} style={{ flex: 1 }}>Cancelar</Botao>
                  {/* Travar é destrutivo para o fluxo (a peça para): perigo. */}
                  <Botao variante="perigo" tamanho="toque" icone={Lock} carregando={travarMutation.isPending} onClick={enviar} disabled={!pode} data-testid="button-confirmar-trava" style={{ flex: 2 }}>
                    {travarMutation.isPending ? "Travando…" : "Travar peça"}
                  </Botao>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
      <TubosDialog evento={tubosDoEvento} onClose={() => setTubosDoEvento(null)}
        itensIniciais={tubosDoEvento?.embalar} emLote={tubosDoEvento?.lote} tuboInicial={tubosDoEvento?.entregarTubo}
        verTubo={tubosDoEvento?.verTubo}
        onAbrirPeca={(id) => { const peca = itemPorId.get(id); if (peca) { setTubosDoEvento(null); setViewDetailsItem(peca); } }}
        onEmbalou={() => { if (bulkPackMode) sairDoLote(); }}
        sugestaoRecebedor={ultimoRecebedor} onEntregou={setUltimoRecebedor} />

      {galpao && (
        <GalpaoFila
          mode={galpao}
          itens={conferableInFilter}
          onClose={fecharGalpao}
          onConfirmar={registrarNoGalpao}
          sugestaoRecebedor={ultimoRecebedor}
        />
      )}

      <Dialog open={!!devolverItem} onOpenChange={o => { if (!o) { setDevolverItem(null); setDevolverMotivo(""); } }}>
        <DialogContent ref={modalDevolverRef} className={HIDE_NATIVE_CLOSE} style={modalSurface(460)}>
          <DialogTitle className="sr-only">Devolver peça para a Revisão Final</DialogTitle>
          <ModalHeader
            variant="confirm"
            icon={Undo2}
            tint={TOM.perigo.text}
            title="Devolver para a Revisão Final"
            subtitle={devolverItem ? `${devolverItem.displayId} · ${devolverItem.type ?? ""}` : undefined}
            onClose={() => { setDevolverItem(null); setDevolverMotivo(""); }}
          />
          <div style={{ padding: `18px ${padModal}px`, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
            <p style={{ fontSize: 13, color: T.apoio, lineHeight: 1.6, margin: "0 0 14px" }}>
              A peça sai da fila da Gráfica e volta para <strong style={{ color: T.text }}>Aguardando Revisão Final</strong>. Nada foi produzido, então não há material a estornar.
            </p>
            <label htmlFor="textarea-devolver-motivo" style={{ display: "block", fontSize: fsMin(FS.small), fontWeight: FW.forte, color: T.apoio, marginBottom: 6 }}>
              Motivo da devolução
            </label>
            <textarea
              value={devolverMotivo}
              onChange={e => setDevolverMotivo(e.target.value)}
              placeholder="O que está errado? Ex.: arquivo em baixa resolução, medida diferente do pedido..."
              rows={3}
              id="textarea-devolver-motivo"
              data-testid="textarea-devolver-revisao-motivo"
              style={{
                width: "100%", minHeight: 80, boxSizing: "border-box", padding: "10px 12px",
                fontSize: isMobile ? 16 : 13, fontFamily: "inherit", color: T.text,
                backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md,
                resize: "vertical", outlineOffset: 2,
              }}
            />
            {/* O mínimo aparece SEMPRE, não só depois de errar: botão
                desabilitado sem explicação é o que faz a pessoa achar que o
                app travou. */}
            <p style={{ fontSize: fsMin(FS.small), color: T.second, margin: "6px 0 0" }}>
              Mínimo de {MOTIVO_MIN_DEVOLUCAO} caracteres — {devolverMotivo.trim().replace(/\s+/g, " ").length}/{MOTIVO_MIN_DEVOLUCAO}
            </p>
          </div>
          {/* Rodapé fora do corpo rolável (flexShrink 0) e com o recorte
              seguro; no celular os dois botões dividem a largura — com
              "Devolver para a Revisão Final" por extenso, a fileira alinhada à
              direita passava de 360px e empurrava o botão para fora. */}
          <div style={{ flexShrink: 0, paddingTop: 12, paddingLeft: padModal, paddingRight: padModal, paddingBottom: "calc(12px + env(safe-area-inset-bottom))", borderTop: `1px solid ${N.n3}`, backgroundColor: T.bg, display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
            <Botao tamanho={isMobile ? "toque" : "md"} onClick={() => { setDevolverItem(null); setDevolverMotivo(""); }}
              style={{ flex: isMobile ? "1 1 auto" : undefined, minHeight: isMobile ? 48 : undefined }}>
              Cancelar
            </Botao>
            {/* Contorno vermelho, não preenchido: devolver tira o trabalho da
                mão de alguém, e botão vermelho cheio convida ao clique reflexo.
                O motivo do desabilitado é a contagem logo acima, sempre à vista. */}
            <Botao
              tamanho={isMobile ? "toque" : "md"}
              icone={Undo2}
              carregando={devolverMutation.isPending}
              onClick={() => devolverItem && devolverMutation.mutate({ itemId: devolverItem.id, notes: devolverMotivo })}
              disabled={devolverMotivo.trim().replace(/\s+/g, " ").length < MOTIVO_MIN_DEVOLUCAO}
              data-testid="button-confirmar-devolver-revisao"
              style={{ flex: isMobile ? "2 1 auto" : undefined, minHeight: isMobile ? 48 : undefined, color: TOM.perigo.text, border: `1.5px solid ${TOM.perigo.text}` }}
            >
              {isMobile ? "Devolver à Revisão" : "Devolver para a Revisão Final"}
            </Botao>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
