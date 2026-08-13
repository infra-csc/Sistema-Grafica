// ─────────────────────────────────────────────────────────────────────────────
// AUMENTAR QUANTIDADE — o gatilho do modelo de COMPLEMENTO.
//
// A REGRA, em uma frase: enquanto a peça NÃO entrou em produção, aumentar é
// editar a quantidade (o campo Qtd. de sempre). Depois que entrou, aumentar é
// criar um COMPLEMENTO — uma peça-filha (#0062-C1) com a diferença, ciclo de
// produção próprio e a peça original INTOCADA. Reduzir continua sendo edição,
// com piso físico.
//
// A assimetria é deliberada: aumentar cria trabalho novo (ordem de serviço,
// metragem, alerta para a Gráfica); reduzir só corta a meta e não gera lote.
//
// ONDE O GESTO NASCE: na tela da GRÁFICA (client/src/pages/grafica.tsx) — é lá
// que as peças em produção vivem e é lá que o aumento precisa ser visto. O
// Detalhe do Evento mantém só a REDUÇÃO (campo Qtd. com piso físico) e aponta
// para a Gráfica. Este componente não sabe de qual tela veio: recebe a peça-mãe
// e (opcionalmente) o evento, e resolve tudo sozinho — a permissão já foi
// checada por quem abriu, mas o SERVIDOR revalida (403) e a mensagem real dele
// é o que aparece na tela.
//
// Espelho de POST /api/items/:id/complement (server/routes/items.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  PlusCircle, AlertTriangle, Recycle, Truck, RotateCw, Database,
  Minus, Plus, Lock, Package, Calendar, Check, Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModalHeader, ModalFooter, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { StatusPill } from "@/components/status-pill";
import { PRODUCTION_STATUSES, getStatusLabel } from "@/lib/status";
import { getSaldo } from "@/lib/saldo";
import { splitDisplayId } from "@/lib/displayId";
import { calculateM2 } from "@/lib/calculateM2";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulário e gates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Status em que a peça JÁ entrou em produção — aqui aumentar cria COMPLEMENTO,
 * nunca altera a quantidade. Espelho literal do servidor
 * (server/routes/items.ts → COMPLEMENT_ALLOWED_STATUSES).
 *
 * A base canônica vem de PRODUCTION_STATUSES (lib/status.ts, fonte única): o
 * que se acrescenta aqui são APENAS as grafias legadas em português, que ainda
 * circulam no banco e fazem qualquer gate que compare só com a grafia canônica
 * nunca disparar. Quando `COMPLEMENT_ALLOWED_STATUSES` nascer em lib/status.ts
 * (frente 1B da spec), esta constante vira um re-export de uma linha.
 */
export const COMPLEMENT_ALLOWED_STATUSES: readonly string[] = [
  ...PRODUCTION_STATUSES,
  "em_producao", "produzido", "entregue",
];

/** A peça já entrou em produção (aumentar aqui = complemento). */
export function entrouEmProducao(item: any): boolean {
  return !!item && COMPLEMENT_ALLOWED_STATUSES.includes(item.status);
}

/**
 * O botão "Aumentar" aparece? Mesmo predicado do servidor, na ordem dele: papel
 * que pode mexer na quantidade + peça viva + peça que NÃO é ela mesma um
 * complemento (complemento de complemento é 409 IS_COMPLEMENT: o segundo
 * aumento se pede na mãe) + peça em produção.
 *
 * `podeMexerNaQuantidade` espelha o gate do servidor (`podeMudarQuantidade` em
 * server/routes/items.ts): SÓ admin e solicitacao. É deliberadamente mais
 * estrito que o `canEditLists` de uma tela de evento — criar peça no evento que
 * você mesmo criou é uma coisa; alterar o contrato de uma peça que já virou
 * lona impressa no galpão é outra. A GRÁFICA NÃO ENTRA: ela vê a peça, o selo,
 * o motivo e o botão Produzir — ela produz o que pedem, não muda o pedido.
 */
export function podeMexerNaQuantidade(role?: string | null): boolean {
  return role === "admin" || role === "solicitacao";
}

export function podeAumentarQuantidade(item: any, podeMexer: boolean): boolean {
  return (
    podeMexer &&
    !!item &&
    !item.deletedAt &&
    !item.parentItemId &&
    entrouEmProducao(item)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Erros da API
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiError {
  /** Mensagem já pronta para o usuário (a do servidor, em pt-BR). */
  message: string;
  /** `code` do corpo JSON: USE_COMPLEMENT, QUANTITY_FLOOR, MIGRATION_PENDING… */
  code?: string;
  /** Corpo inteiro — carrega `suggestedComplement`, `minimum`, `complements`… */
  data?: any;
}

/**
 * ASSINATURAS DE MENSAGEM — como o `code` é recuperado.
 *
 * `apiRequest` (client/src/lib/queryClient.ts → throwIfResNotOk) JÁ DESEMBRULHA
 * o corpo de erro: quando a resposta é `{ error, code, … }`, ele lança
 * `new Error(parsed.error)` — só a frase, em texto puro. O `code` e os campos
 * extras (`suggestedComplement`, `minimum`) NUNCA chegam ao `onError`. Isso não
 * é um bug de lá: aquela camada existe justamente para o usuário nunca ler
 * `{"error":"…"}` num toast, e ela é compartilhada pelo app inteiro.
 *
 * Como o roteamento do complemento depende do `code` (USE_COMPLEMENT vira o
 * aviso que aponta para a Gráfica, MIGRATION_PENDING troca o formulário pelo
 * aviso do db:push, QUANTITY_FLOOR explica o piso), ele é reconstruído aqui
 * pela frase canônica que o servidor escreve. Cada padrão casa com um trecho
 * ESTÁVEL da mensagem — a parte que não muda com displayId nem com números.
 *
 * Regra de manutenção: mudou a frase em server/routes/items.ts, muda o padrão
 * aqui. É o mesmo acoplamento dos dois mapas de status que já convivem.
 */
const CODIGO_POR_MENSAGEM: Array<{ re: RegExp; code: string; extra?: (m: RegExpMatchArray) => any }> = [
  { re: /Para aumentar, use "Aumentar quantidade"/i,          code: "USE_COMPLEMENT" },
  { re: /Mínimo:\s*(\d+)/i,                                    code: "QUANTITY_FLOOR", extra: (m) => ({ minimum: Number(m[1]) }) },
  { re: /Migração pendente/i,                                  code: "MIGRATION_PENDING" },
  { re: /já é um complemento/i,                                code: "IS_COMPLEMENT" },
  { re: /ainda não entrou em produção/i,                       code: "NOT_IN_PRODUCTION" },
  { re: /Não é possível cancelar .*: já há/i,                  code: "COMPLEMENT_TOUCHED" },
  { re: /não é um complemento/i,                               code: "NOT_A_COMPLEMENT" },
  { re: /complemento\(s\) ativo\(s\)/i,                        code: "HAS_COMPLEMENTS" },
  { re: /Outra pessoa lançou produção/i,                       code: "PRODUCTION_CONFLICT" },
];

/**
 * Falha de REDE (o `fetch` nem chegou ao servidor). O navegador escreve isso em
 * inglês e em três dialetos diferentes — e "Failed to fetch" num bloco vermelho
 * de modal em pt-BR não diz nada a quem está com o cliente ao lado. O `code`
 * continua indefinido de propósito: é o caso mais retentável que existe.
 */
const ERRO_DE_REDE = /failed to fetch|networkerror|load failed/i;
const MSG_SEM_REDE = "Sem conexão com o servidor. O complemento não foi criado.";

/**
 * Normaliza o erro de qualquer rota em `{ message, code, data }`.
 *
 * Aceita as DUAS formas: o corpo JSON cru (caso algum chamador use `fetch`
 * direto) e a mensagem já desembrulhada pelo `apiRequest` — nesta, o `code` é
 * reconstruído por CODIGO_POR_MENSAGEM. Sem isso, `code` era sempre
 * `undefined` e todo o roteamento por código virava código morto.
 */
export function parseApiError(err: unknown): ApiError {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  let message = raw;
  let code: string | undefined;
  let data: any;

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      message = String(parsed.error ?? parsed.message ?? raw);
      code = typeof parsed.code === "string" ? parsed.code : undefined;
      data = parsed;
    }
  } catch {
    // Corpo não-JSON — o caso NORMAL: o apiRequest já entregou só a frase.
  }

  // Antes da leitura por frase: nenhum padrão de CODIGO_POR_MENSAGEM casa com
  // uma falha de rede, então trocar aqui mantém `code` indefinido (retentável).
  if (!code && ERRO_DE_REDE.test(message)) message = MSG_SEM_REDE;

  if (!code) {
    for (const alvo of CODIGO_POR_MENSAGEM) {
      const m = message.match(alvo.re);
      if (m) {
        code = alvo.code;
        data = { ...(data ?? {}), ...(alvo.extra?.(m) ?? {}) };
        break;
      }
    }
  }

  return { message: message || "Não foi possível concluir a operação.", code, data };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers locais
// ─────────────────────────────────────────────────────────────────────────────

const fmtM2 = (v: number) => v.toFixed(2).replace(".", ",");

/**
 * m² do complemento, na MESMA ordem do servidor: fórmula normal → rateio do m²
 * da mãe → indefinido. O preview precisa contar a mesma história que o audit
 * log vai gravar; um número diferente aqui viraria discussão no fechamento.
 */
function m2DoComplemento(item: any, quantidade: number): number | null {
  const w = parseFloat(String(item?.fileWidth ?? ""));
  const h = parseFloat(String(item?.fileHeight ?? ""));
  if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0 && quantidade > 0) {
    return calculateM2(quantidade, w, h);
  }
  const total = Number(item?.calculatedM2);
  const qtd = Number(item?.quantity);
  if (Number.isFinite(total) && total > 0 && Number.isFinite(qtd) && qtd > 0) {
    return (total / qtd) * quantidade;
  }
  return null;
}

/**
 * Próximo sufixo do filho (#0062-C1, -C2…). O servidor numera pelo MAIOR
 * sufixo já existente e NUNCA recicla número cancelado; aqui é só previsão de
 * tela, então o pior caso é a tira dizer -C2 e sair -C3 — nunca um número
 * menor, que é o que confundiria.
 */
function proximoSufixo(item: any): number {
  const seqs = (item?.complements ?? [])
    .map((c: any) => Number(c?.complementSeq) || 0)
    .filter((n: number) => n > 0);
  return (seqs.length ? Math.max(...seqs) : 0) + 1;
}

/**
 * Erros em que "Tentar de novo" seria uma promessa falsa. Retentar só faz
 * sentido em falha transitória (rede caiu, 500, servidor reiniciando).
 * `apiRequest` não propaga o status HTTP — sobra o `code` (que marca todos os
 * 409/503) e, para os dois casos que respondem SEM code e também não mudam por
 * insistência (403 e 404), o casamento pela mensagem literal do servidor.
 */
const ERRO_SEM_RETRY = /^(Sem permissão|Peça não encontrada|Evento não encontrado)/i;

/** Título do bloco de erro por código — a mensagem embaixo é sempre a do servidor. */
const TITULO_ERRO: Record<string, string> = {
  IS_COMPLEMENT: "Este já é um complemento",
  NOT_IN_PRODUCTION: "Ainda não entrou em produção",
};

const AVISO_BASE: React.CSSProperties = {
  display: "flex", gap: 8, alignItems: "flex-start",
  padding: "10px 12px", borderRadius: 8, fontSize: 12, lineHeight: 1.5,
};

/** Chips de salto da quantidade. O stepper já cobre o +1 — um chip para ele seria redundante. */
const SALTOS = [2, 5, 10, 20];

/** Atalhos do motivo: preenchem como PREFIXO, com o cursor no fim. */
const ATALHOS_MOTIVO: Array<{ rotulo: string; texto: string }> = [
  { rotulo: "Pedido do cliente",  texto: "Pedido do cliente: " },
  { rotulo: "Erro na quantidade", texto: "Erro na quantidade original: " },
  { rotulo: "Peça danificada",    texto: "Peça danificada ou perdida no local: " },
];

/** Telas muito estreitas (< 360px): a fileira do rodapé vira coluna. */
function useLarguraAbaixoDe(px: number): boolean {
  const [abaixo, setAbaixo] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${px - 1}px)`);
    const on = () => setAbaixo(mql.matches);
    on();
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, [px]);
  return abaixo;
}

/** Azulejo de número do cartão de identidade (contratado/produzido/…). */
function Azulejo({ rotulo, valor, sub, subCor }: {
  rotulo: string; valor: number; sub?: string | null; subCor?: string;
}) {
  return (
    <div style={{ background: "#fff", borderRadius: 8, padding: "8px 10px", minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#746e69" }}>
        {rotulo}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif", color: "#1c1917", lineHeight: 1, marginTop: 3 }}>
        {valor}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: subCor ?? "#746e69", marginTop: 3, lineHeight: 1.3 }}>{sub}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export interface AumentarQuantidadeDialogProps {
  /** A peça-MÃE. O modal não abre sem ela. */
  item: any | null;
  /** Evento da peça — só para o aviso de caminhão já saído. Opcional. */
  event?: { name?: string | null; truckDepartureDate?: string | Date | null } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Pré-preenche o campo. Vem do 409 `USE_COMPLEMENT` (`suggestedComplement`):
   * quem digitou 14 numa peça de 10 já encontra o 4 escrito.
   */
  sugestao?: number | null;
  /** Chamado com a peça-filha criada (ou reaproveitada pelo dedupe). */
  onCreated?: (child: any) => void;
}

export function AumentarQuantidadeDialog({
  item, event, open, onOpenChange, sugestao, onCreated,
}: AumentarQuantidadeDialogProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const estreito = useLarguraAbaixoDe(360);
  const [qtdRaw, setQtdRaw] = useState("1");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<ApiError | null>(null);
  const [tocouMotivo, setTocouMotivo] = useState(false);
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const qtdRef = useRef<HTMLInputElement>(null);
  const motivoRef = useRef<HTMLTextAreaElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const erroRef = useRef<HTMLDivElement>(null);
  // Último valor válido do campo: o campo pode ficar vazio ENQUANTO se digita
  // (autocorrigir no meio da digitação rouba o teclado), e o blur restaura.
  const ultimoValido = useRef("1");

  // Cada abertura começa limpa: reaproveitar o motivo da peça anterior é o
  // caminho mais curto para uma justificativa errada virar histórico.
  useEffect(() => {
    if (!open) return;
    const inicial = sugestao && sugestao > 0 ? Math.min(9999, Math.floor(sugestao)) : 1;
    setQtdRaw(String(inicial));
    ultimoValido.current = String(inicial);
    setMotivo("");
    setErro(null);
    setTocouMotivo(false);
    setTentouEnviar(false);
  }, [open, sugestao, item?.id]);

  const s = useMemo(() => getSaldo(item ?? {}), [item]);
  const qtd = Math.floor(Number(qtdRaw)) || 0;
  const qtdValida = qtd >= 1 && qtd <= 9999;
  const motivoLimpo = motivo.trim();
  const motivoValido = motivoLimpo.length >= 10 && motivoLimpo.length <= 500;
  const faltamCaracteres = Math.max(0, 10 - motivoLimpo.length);
  const m2 = qtdValida ? m2DoComplemento(item, qtd) : null;
  const totalDepois = s.contractedTotal + (qtdValida ? qtd : 0);
  const sufixo = proximoSufixo(item);
  const displayFilho = `${item?.displayId ?? ""}-C${sufixo}`;
  const { base: idBase, suffix: idSuffix } = splitDisplayId(item?.displayId ?? "");
  const complementos: any[] = item?.complements ?? [];
  const nomeEvento = (item as any)?.event?.name ?? event?.name ?? null;

  // Faixa de sanidade: não bloqueia nada, só pede uma segunda olhada quando o
  // número digitado é grande demais para o tamanho da peça (o dedo escorregou
  // no teclado numérico e virou 250 em vez de 25).
  const foraDaFaixa = qtdValida && qtd >= 10 && qtd > Math.max(s.qty * 3, s.qty + 50);

  // Caminhão já saiu: o lote nasce atrasado e a logística precisa ser combinada
  // ANTES de a Gráfica imprimir. Formatado em UTC como no restante da tela de
  // evento (o valor gravado É o horário que a pessoa digitou).
  const saidaCaminhao = useMemo(() => {
    const raw = event?.truckDepartureDate ?? (item as any)?.event?.truckDepartureDate;
    if (!raw) return null;
    const d = new Date(raw as any);
    if (isNaN(d.getTime())) return null;
    return d.getTime() < Date.now()
      ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })
      : null;
  }, [event?.truckDepartureDate, item]);

  const migracaoPendente = erro?.code === "MIGRATION_PENDING";
  const erroRetentavel = !!erro && !erro.code && !ERRO_SEM_RETRY.test(erro.message);

  // O bloco de erro nasce no fim do corpo rolável: sem isto ele podia aparecer
  // fora da área visível e o clique no primário parecia não fazer nada.
  useEffect(() => {
    if (erro) erroRef.current?.scrollIntoView({ block: "nearest" });
  }, [erro]);

  const criarMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/items/${item.id}/complement`, {
        quantity: qtd,
        reason: motivoLimpo,
      });
      // 200 + X-Complement-Deduped = duplo clique/retry de rede dentro de 60 s.
      // O servidor devolve o complemento QUE JÁ EXISTE em vez de criar um
      // gêmeo na fila da Gráfica — para a tela isto é sucesso, não erro.
      const deduped = res.headers.get("X-Complement-Deduped") === "1";
      const child = await res.json();
      return { child, deduped };
    },
    onSuccess: ({ child, deduped }) => {
      // O servidor faz broadcast, mas quem clicou não pode depender do
      // WebSocket para ver o próprio trabalho: invalidação explícita das
      // listagens que rodam com staleTime Infinity.
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      if (item?.eventId) {
        queryClient.invalidateQueries({ queryKey: ["/api/items", item.eventId] });
        queryClient.invalidateQueries({ queryKey: ["/api/events", item.eventId] });
      }
      // A rota devolve o Item cru; `parent` só é anexado pelo enrich da próxima
      // leitura. Sem esta costura, a ficha da peça recém-criada diria
      // "complemento de peça original" — vazio justamente no momento em que a
      // pessoa precisa confirmar o que acabou de fazer.
      onCreated?.({
        ...child,
        parent: { id: item.id, displayId: item.displayId, quantity: item.quantity, status: item.status },
      });
      onOpenChange(false);
      toast(deduped
        ? {
            title: "Complemento já criado",
            description: `${child?.displayId ?? displayFilho} já havia sido criado agora há pouco — nada foi duplicado.`,
          }
        : {
            title: "Complemento criado",
            description: `${child?.displayId ?? displayFilho} · +${qtd} un. — já está na fila, logo abaixo de ${item?.displayId}.`,
          });
    },
    onError: (e: unknown) => {
      const parsed = parseApiError(e);
      setErro(parsed);
      // Falta de permissão é decisão de acesso, não erro de formulário: além
      // do bloco no modal sai um toast, porque é o caso em que a pessoa
      // precisa procurar outra pessoa e não outro número.
      if (!parsed.code && /^Sem permissão/i.test(parsed.message)) {
        toast({
          title: "Sem permissão",
          description: "Apenas Solicitação e admin podem aumentar a quantidade de uma peça em produção.",
          variant: "destructive",
        });
      }
    },
  });

  const pendente = criarMutation.isPending;
  const formValido = qtdValida && motivoValido;

  const submeter = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!item || pendente || migracaoPendente) return;
    // O primário fica SEMPRE ativo (menos enviando): botão apagado sem motivo
    // dito na tela é um beco sem saída no toque, onde não existe `title`.
    if (!formValido) {
      setTentouEnviar(true);
      setTocouMotivo(true);
      if (!qtdValida) qtdRef.current?.focus();
      else motivoRef.current?.focus();
      return;
    }
    setErro(null);
    criarMutation.mutate();
  };

  /** Sanitiza o campo: só dígitos, teto por construção em 4 casas (9999). */
  const escreverQtd = (v: string) => {
    const limpo = v.replace(/\D/g, "").slice(0, 4);
    setQtdRaw(limpo);
    if (limpo && Number(limpo) >= 1) ultimoValido.current = limpo;
  };
  const passo = (delta: number) => {
    const alvo = Math.max(1, Math.min(9999, (qtd || 0) + delta));
    escreverQtd(String(alvo));
  };

  const aplicarAtalho = (texto: string) => {
    setMotivo(texto);
    requestAnimationFrame(() => {
      const el = motivoRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(texto.length, texto.length);
    });
  };

  if (!item) return null;

  const controlesTravados = pendente;
  const larguraMiniatura = isMobile ? 64 : 56;

  const dicaRodape = pendente
    ? "Criando o complemento…"
    : !qtdValida
    ? "Informe as unidades a mais."
    : !motivoValido
    ? `Escreva o motivo (faltam ${faltamCaracteres} caracteres).`
    : null;

  const rotuloPrimario = pendente
    ? "Criando…"
    : !qtdValida
    ? "Criar complemento"
    : isMobile
    ? `Criar +${qtd} un.`
    : `Criar complemento (+${qtd} un.)`;

  const tituloErro = !erro
    ? ""
    : TITULO_ERRO[erro.code ?? ""]
      ?? (!erro.code && /^Sem permissão/i.test(erro.message) ? "Sem permissão" : "Não foi possível criar");

  const botaoSalto: React.CSSProperties = {
    height: isMobile ? 36 : 30, padding: "0 12px", borderRadius: 999,
    border: "1px solid #e7e5e4", background: "#fff",
    fontSize: 11, fontWeight: 700, color: "#57534e", cursor: "pointer",
    display: "inline-flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap",
  };
  const botaoSaltoAtivo: React.CSSProperties = {
    ...botaoSalto, background: "#fff7ed", border: "1px solid #fed7aa", color: "#c2410c",
  };
  const botaoStepper: React.CSSProperties = {
    width: isMobile ? 56 : 52, height: 56, flexShrink: 0, borderRadius: 8,
    background: "#fff", border: "1px solid #e7e5e4",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "background-color 0.15s",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !pendente) onOpenChange(false); }}>
      <DialogContent
        className={HIDE_NATIVE_CLOSE}
        style={modalSurface(560)}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          // No desktop o campo já entra selecionado (digitar substitui). No
          // celular o foco vai para o título: focar o campo sobe o teclado e
          // enterra justamente a identidade da peça que se veio conferir.
          if (!isMobile) qtdRef.current?.select();
          else tituloRef.current?.focus();
        }}
        onEscapeKeyDown={(e) => { if (pendente) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (pendente) e.preventDefault(); }}
      >
        <DialogTitle ref={tituloRef} tabIndex={-1} className="sr-only">Aumentar quantidade</DialogTitle>
        <DialogDescription className="sr-only">
          Cria uma peça complementar com as unidades a mais. A peça original não é alterada.
        </DialogDescription>

        <ModalHeader
          variant="work"
          icon={PlusCircle}
          tint="#c2410c"
          title="Aumentar quantidade"
          subtitle={`${item.displayId} · ${item.type}`}
          onClose={() => { if (!pendente) onOpenChange(false); }}
        />

        {migracaoPendente ? (
          <>
            <div style={{ padding: isMobile ? 16 : 24 }}>
              <div style={{ ...AVISO_BASE, backgroundColor: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c" }}>
                <Database aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1 }} />
                <span>
                  <strong style={{ display: "block", marginBottom: 2 }}>Recurso indisponível</strong>
                  Falta rodar a atualização do banco (<code style={{ fontFamily: "'DM Mono', monospace" }}>npm run db:push</code>).
                  Fale com o administrador — até lá, o aumento precisa ser combinado por fora do sistema.
                </span>
              </div>
            </div>
            <ModalFooter>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                data-testid="button-entendi-migracao"
                style={{ width: "100%", height: 44, borderRadius: 8, border: "none", background: "none", fontSize: 13, fontWeight: 700, color: "#746e69", cursor: "pointer" }}
              >
                Entendi
              </button>
            </ModalFooter>
          </>
        ) : (
          <form onSubmit={submeter}>
            <div
              style={{
                padding: isMobile ? "16px" : "18px 24px",
                display: "flex", flexDirection: "column", gap: isMobile ? 14 : 16,
                maxHeight: isMobile ? "calc(88vh - 168px)" : "min(62vh, calc(100vh - 300px))",
                overflowY: "auto",
              }}
            >

              <div style={{ background: "#f4f3f0", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <div
                    style={{
                      width: larguraMiniatura, height: larguraMiniatura, flexShrink: 0,
                      borderRadius: 8, border: "1px solid #e7e5e4", background: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
                    }}
                  >
                    {item.approvalThumbUrl ? (
                      <img
                        src={convertGCSUrlToLocalPath(item.approvalThumbUrl)}
                        alt=""
                        loading="lazy" decoding="async"
                        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <Package aria-hidden="true" style={{ width: 16, height: 16, color: "#a8a29e" }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: "#c2410c" }}>
                        {idBase}{idSuffix && <span style={{ color: "#9a3412" }}>{idSuffix}</span>}
                      </span>
                      <StatusPill status={item.status} size="sm" />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1c1917", marginTop: 2 }}>{item.type}</div>
                    {item.description && item.description !== item.type && (
                      <div style={{ fontSize: 13, color: "#746e69", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.description}
                      </div>
                    )}
                    {nomeEvento && (
                      <div style={{ fontSize: 13, color: "#746e69", marginTop: 4, display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                        <Calendar aria-hidden="true" style={{ width: 11, height: 11, flexShrink: 0 }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomeEvento}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,minmax(0,1fr))" : "repeat(4,minmax(0,1fr))", gap: 8 }}>
                  <Azulejo
                    rotulo="Contratado"
                    valor={s.qty}
                    sub={s.complementsQty > 0 ? `+${s.complementsQty} em complementos` : null}
                    subCor="#c2410c"
                  />
                  <Azulejo
                    rotulo="Produzido"
                    valor={s.produced}
                    sub={s.toProduce > 0 ? `faltam ${s.toProduce}` : null}
                  />
                  <Azulejo rotulo="Conferido" valor={s.conferred} />
                  <Azulejo
                    rotulo="Entregue"
                    valor={s.delivered}
                    sub={s.isDelivered ? "peça fechada" : null}
                    subCor="#15803d"
                  />
                </div>

                {complementos.length > 0 && (
                  <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "7px 10px", fontSize: 11, lineHeight: 1.45, color: "#7c2d12" }}>
                    <strong>Já existem:</strong>{" "}
                    {complementos
                      .slice(0, 3)
                      .map((c: any) => `${c.displayId} (+${c.quantity}, ${getStatusLabel(c.status).toLowerCase()})`)
                      .join(" · ")}
                    {complementos.length > 3 && ` · +${complementos.length - 3} mais`}
                  </div>
                )}

                {(item.isReuse || s.reused > 0) && (
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                    <Recycle aria-hidden="true" style={{ width: 12, height: 12, color: "#57534e", flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 11, color: "#746e69", lineHeight: 1.45 }}>
                      A original foi reaproveitada — as novas nascem para impressão.
                    </span>
                  </div>
                )}

                <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "8px 10px", display: "flex", gap: 7, alignItems: "flex-start" }}>
                  <Lock aria-hidden="true" style={{ width: 12, height: 12, color: "#c2410c", flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 12, lineHeight: 1.45, color: "#7c2d12" }}>
                    <strong>{item.displayId} continua com {s.qty} un.</strong> — nada muda nela. O aumento nasce como uma peça nova, com produção própria.
                  </span>
                </div>
              </div>

              {saidaCaminhao && (
                <div style={{ ...AVISO_BASE, backgroundColor: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c" }}>
                  <Truck aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }} />
                  <span>O caminhão deste evento saiu em {saidaCaminhao}. Combine a logística antes de confirmar.</span>
                </div>
              )}

              {((s.isInProd && s.toProduce > 0) || !item.finalFileUrl) && (
                <div style={{ ...AVISO_BASE, backgroundColor: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", flexDirection: "column", gap: 6 }}>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <AlertTriangle aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }} />
                    <strong style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Antes de confirmar
                    </strong>
                  </span>
                  <ul style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 4, listStyle: "none" }}>
                    {s.isInProd && s.toProduce > 0 && (
                      <li style={{ fontSize: 12, lineHeight: 1.5, position: "relative" }}>
                        <span aria-hidden="true" style={{ position: "absolute", left: -14, color: "#d97706", fontWeight: 800 }}>•</span>
                        Ainda faltam {s.toProduce} un. na peça original. O complemento é um lote separado.
                      </li>
                    )}
                    {!item.finalFileUrl && (
                      <li style={{ fontSize: 12, lineHeight: 1.5, position: "relative" }}>
                        <span aria-hidden="true" style={{ position: "absolute", left: -14, color: "#d97706", fontWeight: 800 }}>•</span>
                        A peça original não tem arquivo final registrado. A Gráfica vai receber o complemento sem arquivo.
                      </li>
                    )}
                  </ul>
                </div>
              )}

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                  <label htmlFor="complemento-qtd" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#746e69" }}>
                    Quantas unidades a mais
                  </label>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#746e69", whiteSpace: "nowrap" }}>
                    {item.displayId} tem {s.qty} un.
                  </span>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                  <button
                    type="button"
                    onClick={() => passo(-1)}
                    disabled={controlesTravados || qtd <= 1}
                    aria-label="Diminuir uma unidade"
                    data-testid="button-complemento-menos"
                    style={{
                      ...botaoStepper,
                      opacity: qtd <= 1 ? 0.45 : 1,
                      cursor: controlesTravados ? "wait" : qtd <= 1 ? "not-allowed" : "pointer",
                    }}
                    onMouseEnter={(e) => { if (!controlesTravados && qtd > 1) e.currentTarget.style.backgroundColor = "#f5f5f4"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#fff"; }}
                  >
                    <Minus aria-hidden="true" style={{ width: 18, height: 18, color: "#57534e" }} />
                  </button>

                  <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
                    <input
                      id="complemento-qtd"
                      ref={qtdRef}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      value={qtdRaw}
                      aria-describedby="complemento-resultado"
                      onChange={(e) => escreverQtd(e.target.value)}
                      onFocus={(e) => {
                        e.currentTarget.select();
                        e.currentTarget.style.borderColor = "#c2410c";
                        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(194,65,12,0.18)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "transparent";
                        e.currentTarget.style.boxShadow = "none";
                        if (!qtdRaw || Number(qtdRaw) < 1) setQtdRaw(ultimoValido.current || "1");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowUp") { e.preventDefault(); passo(1); }
                        if (e.key === "ArrowDown") { e.preventDefault(); passo(-1); }
                      }}
                      disabled={controlesTravados}
                      data-testid="input-complemento-quantidade"
                      style={{
                        width: "100%", height: 56, boxSizing: "border-box",
                        background: "#f3f4f3", border: "1.5px solid transparent", borderRadius: 8,
                        textAlign: "center", fontFamily: "'Space Grotesk', sans-serif",
                        fontSize: 30, fontWeight: 800, color: "#1a1c1c",
                        paddingRight: 48, paddingLeft: 14,
                        transition: "border-color 0.15s, box-shadow 0.15s",
                      }}
                    />
                    <span
                      aria-hidden="true"
                      style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 13, fontWeight: 600, color: "#746e69", pointerEvents: "none" }}
                    >
                      un.
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => passo(1)}
                    disabled={controlesTravados || qtd >= 9999}
                    aria-label="Aumentar uma unidade"
                    data-testid="button-complemento-mais"
                    style={{
                      ...botaoStepper,
                      opacity: qtd >= 9999 ? 0.45 : 1,
                      cursor: controlesTravados ? "wait" : qtd >= 9999 ? "not-allowed" : "pointer",
                    }}
                    onMouseEnter={(e) => { if (!controlesTravados && qtd < 9999) e.currentTarget.style.backgroundColor = "#f5f5f4"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#fff"; }}
                  >
                    <Plus aria-hidden="true" style={{ width: 18, height: 18, color: "#57534e" }} />
                  </button>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {SALTOS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => escreverQtd(String(v))}
                      disabled={controlesTravados}
                      aria-pressed={qtd === v}
                      data-testid={`chip-salto-${v}`}
                      style={qtd === v ? botaoSaltoAtivo : botaoSalto}
                    >
                      +{v}
                    </button>
                  ))}
                </div>

                {foraDaFaixa && (
                  <div style={{ ...AVISO_BASE, backgroundColor: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", marginTop: 8 }}>
                    <AlertTriangle aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }} />
                    <span>
                      Confira: <strong>+{qtd} un.</strong> é mais de 3× a quantidade de {item.displayId} ({s.qty} un.). Se for isso mesmo, pode seguir.
                    </span>
                  </div>
                )}

                <div
                  id="complemento-resultado"
                  role="status"
                  aria-live="polite"
                  data-testid="tira-resultado-complemento"
                  style={{
                    display: "flex", gap: 10, marginTop: 10,
                    alignItems: qtdValida && isMobile ? "stretch" : "center",
                    background: qtdValida ? "#fff7ed" : "#fafaf9",
                    border: `1px solid ${qtdValida ? "#fed7aa" : "#ebe8e4"}`,
                    borderRadius: 10, padding: "10px 12px",
                  }}
                >
                  <span className="sr-only">
                    {qtdValida
                      ? `+${qtd} unidades.${m2 !== null ? ` ${fmtM2(m2)} metros quadrados.` : ""} Nova peça ${displayFilho}. Total contratado passa a ${totalDepois} unidades.`
                      : "Informe as unidades para ver o resultado."}
                  </span>

                  {qtdValida ? (
                    (() => {
                      // As três células da equação, escritas uma vez. O desktop
                      // as põe lado a lado com os operadores entre elas; o
                      // celular empilha em 3 linhas com + e = numa calha de
                      // 16px à esquerda, para os números continuarem alinhados.
                      const celulaEsq = (
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 800, color: "#c2410c" }}>
                            {item.displayId}
                          </span>
                          <span style={{ display: "block", fontSize: 11, color: "#7c2d12" }}>{s.qty} un. — não muda</span>
                        </span>
                      );
                      const celulaMeio = (
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: "#7c2d12" }}>+{qtd} un.</span>
                          <span
                            style={{ display: "block", fontSize: 11, color: "#7c2d12" }}
                            title={m2 === null ? "A peça original não tem medida de arquivo — a Gráfica calcula na produção." : undefined}
                          >
                            {m2 !== null ? `${fmtM2(m2)} m²` : "m² a definir"}
                          </span>
                        </span>
                      );
                      const celulaDir = (
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block" }}>
                            <span style={{ background: "#c2410c", color: "#fff", fontSize: 9, fontWeight: 800, borderRadius: 5, padding: "1px 6px", marginRight: 5, letterSpacing: "0.06em" }}>
                              NOVA
                            </span>
                            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 800, color: "#c2410c" }}>
                              {item.displayId}<span style={{ color: "#9a3412" }}>-C{sufixo}</span>
                            </span>
                          </span>
                          <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#7c2d12" }}>{totalDepois} un. no total</span>
                        </span>
                      );
                      const glifo: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: "#7c2d12", flexShrink: 0 };
                      const calha: React.CSSProperties = { ...glifo, width: 16, textAlign: "center" };

                      return isMobile ? (
                        <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", minWidth: 0 }}>
                          <div style={{ display: "flex", gap: 8, minWidth: 0 }}>
                            <span style={{ width: 16, flexShrink: 0 }} />
                            {celulaEsq}
                          </div>
                          <div style={{ display: "flex", gap: 8, minWidth: 0 }}>
                            <span style={calha}>+</span>
                            {celulaMeio}
                          </div>
                          <div style={{ display: "flex", gap: 8, minWidth: 0 }}>
                            <span style={calha}>=</span>
                            {celulaDir}
                          </div>
                        </div>
                      ) : (
                        <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minWidth: 0 }}>
                          <span style={{ flex: 1, minWidth: 0 }}>{celulaEsq}</span>
                          <span style={glifo}>+</span>
                          <span style={{ minWidth: 0 }}>{celulaMeio}</span>
                          <span style={glifo}>=</span>
                          <span style={{ minWidth: 0, textAlign: "right" }}>{celulaDir}</span>
                        </div>
                      );
                    })()
                  ) : (
                    <span aria-hidden="true" style={{ fontSize: 12, color: "#746e69" }}>
                      Informe as unidades para ver o resultado.
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                  <label htmlFor="complemento-motivo" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#746e69" }}>
                    Por que o aumento
                  </label>
                  {motivoValido ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "#15803d", whiteSpace: "nowrap" }}>
                      <Check aria-hidden="true" style={{ width: 12, height: 12 }} />
                      ok
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 700, color: tocouMotivo ? "#b91c1c" : "#746e69", whiteSpace: "nowrap" }}>
                      faltam {faltamCaracteres} caracteres
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {ATALHOS_MOTIVO.map((a) => {
                    const bloqueado = motivo.length > 0 || controlesTravados;
                    return (
                      <button
                        key={a.rotulo}
                        type="button"
                        onClick={() => aplicarAtalho(a.texto)}
                        disabled={bloqueado}
                        title={motivo.length > 0 ? "Apague o texto para usar um atalho" : undefined}
                        data-testid={`chip-motivo-${a.rotulo.toLowerCase().replace(/\s+/g, "-")}`}
                        style={{
                          height: isMobile ? 36 : 28, padding: "0 12px", borderRadius: 999,
                          border: "1px solid #e7e5e4", background: "#fff",
                          fontSize: 11, fontWeight: 700, color: "#57534e",
                          cursor: bloqueado ? "not-allowed" : "pointer",
                          opacity: bloqueado ? 0.5 : 1, whiteSpace: "nowrap",
                        }}
                      >
                        {a.rotulo}
                      </button>
                    );
                  })}
                </div>

                <textarea
                  id="complemento-motivo"
                  ref={motivoRef}
                  value={motivo}
                  maxLength={500}
                  rows={3}
                  onChange={(e) => setMotivo(e.target.value)}
                  onBlur={(e) => {
                    setTocouMotivo(true);
                    e.currentTarget.style.borderColor = motivoValido ? "#e7e5e4" : "#fecaca";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#c2410c";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(194,65,12,0.18)";
                  }}
                  disabled={controlesTravados}
                  placeholder="Ex.: cliente confirmou mais 2 pórticos para a ativação de sábado"
                  data-testid="input-complemento-motivo"
                  style={{
                    width: "100%", boxSizing: "border-box", minHeight: 76,
                    background: "#fff",
                    border: `1.5px solid ${tocouMotivo && !motivoValido ? "#fecaca" : "#e7e5e4"}`,
                    borderRadius: 8, padding: "12px 14px",
                    fontSize: isMobile ? 16 : 14, fontFamily: "inherit", lineHeight: 1.5,
                    color: "#1a1c1c", resize: "vertical",
                    transition: "border-color 0.15s, box-shadow 0.15s",
                  }}
                />

                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: "#746e69", lineHeight: 1.4 }}>
                    Vai para a fila da Gráfica, para o sino e para o histórico da peça.
                  </span>
                  {motivo.length > 400 && (
                    <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: "#746e69", flexShrink: 0 }}>
                      {motivo.length}/500
                    </span>
                  )}
                </div>
              </div>

              {erro && (
                <div
                  ref={erroRef}
                  role="alert"
                  data-testid="erro-complemento"
                  style={{ ...AVISO_BASE, backgroundColor: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", flexDirection: "column", gap: 8 }}
                >
                  <span style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <AlertTriangle aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }} />
                    <span>
                      <strong style={{ display: "block", fontSize: 13, fontWeight: 800, marginBottom: 2 }}>{tituloErro}</strong>
                      <span style={{ fontSize: 12, lineHeight: 1.5 }}>{erro.message}</span>
                    </span>
                  </span>
                  {erroRetentavel && (
                    <button
                      type="button"
                      onClick={() => submeter()}
                      disabled={pendente}
                      data-testid="button-retry-complemento"
                      style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #fecaca", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 800, color: "#b91c1c", cursor: pendente ? "wait" : "pointer" }}
                    >
                      <RotateCw aria-hidden="true" style={{ width: 12, height: 12 }} />
                      Tentar de novo
                    </button>
                  )}
                </div>
              )}
            </div>

            <ModalFooter>
              {dicaRodape && (
                <p style={{ margin: 0, fontSize: 11, fontWeight: 600, textAlign: "center", lineHeight: 1.5, color: tentouEnviar && !pendente ? "#b91c1c" : "#746e69" }}>
                  {dicaRodape}
                </p>
              )}
              <div style={{ display: "flex", gap: 10, flexDirection: estreito ? "column-reverse" : "row" }}>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  disabled={pendente}
                  data-testid="button-cancelar-complemento"
                  style={{
                    flex: estreito ? undefined : 1, width: estreito ? "100%" : undefined,
                    height: 48, borderRadius: 8, background: "transparent",
                    border: "1.5px solid #e7e5e4", fontSize: 13, fontWeight: 700, color: "#746e69",
                    cursor: pendente ? "wait" : "pointer", transition: "background-color 0.15s",
                  }}
                  onMouseEnter={(e) => { if (!pendente) e.currentTarget.style.backgroundColor = "#f5f5f4"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pendente || migracaoPendente}
                  data-testid="button-criar-complemento"
                  style={{
                    flex: estreito ? undefined : 2, width: estreito ? "100%" : undefined,
                    height: 48, borderRadius: 8, border: "none",
                    background: "#c2410c", color: "#fff",
                    fontSize: 13, fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif",
                    cursor: pendente ? "wait" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    boxShadow: "0 4px 14px rgba(194,65,12,0.30)",
                    transition: "background-color 0.15s",
                  }}
                  onMouseEnter={(e) => { if (!pendente) e.currentTarget.style.backgroundColor = "#9a3412"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#c2410c"; }}
                >
                  {pendente
                    ? <Loader2 aria-hidden="true" className="animate-spin" style={{ width: 15, height: 15 }} />
                    : <PlusCircle aria-hidden="true" style={{ width: 15, height: 15 }} />}
                  {rotuloPrimario}
                </button>
              </div>
            </ModalFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * A ficha tem algo de complemento para dizer sobre esta peça?
 *
 * Existe porque o slot `customActions` do ItemDetailsDialog é testado por
 * verdade do NÓ (`{customActions && <div>…}`): passar um elemento que renderiza
 * `null` deixa uma `<div>` vazia num container com `gap: 36` — 36px de buraco
 * em 100% das peças normais. Os consumidores decidem com este predicado.
 *
 * `comBotao = false` para as telas que mostram o BLOCO mas não o gatilho (o
 * Detalhe do Evento, onde aumentar deixou de morar): ali o bloco só existe se
 * houver complemento de verdade para contar.
 */
export function temBlocoDeComplemento(item: any, podeMexer: boolean, comBotao = true): boolean {
  if (!item) return false;
  return (
    (item.complements?.length ?? 0) > 0 ||
    !!item.parentItemId ||
    (comBotao && podeAumentarQuantidade(item, podeMexer))
  );
}

/**
 * Bloco de COMPLEMENTO da ficha da peça (slot `customActions` do
 * ItemDetailsDialog) — o mesmo nas telas que o montam. Conta a história inteira
 * sem abrir mais nada:
 *  - na MÃE: quais complementos existem, em que pé estão e o total realmente
 *    contratado (a peça-mãe nunca muda, então esse número só existe derivado);
 *  - no FILHO: de quem ele é complemento, por que nasceu, quem pediu e quando;
 *  - e o botão que cria o próximo, quando o papel permite E o chamador passa
 *    `onAumentar` (sem ele o bloco é só leitura — é o caso do Detalhe do
 *    Evento, onde o gatilho passou a morar na Gráfica).
 * Devolve `null` quando não há nada a dizer.
 */
export function ComplementoDaFicha({
  item, canEditLists, onAumentar, onAbrirPeca,
}: {
  item: any | null;
  /** Papel que pode mexer na quantidade (admin/solicitacao). */
  canEditLists: boolean;
  /** Ausente = bloco sem gatilho (só leitura). */
  onAumentar?: (item: any) => void;
  /** Troca a peça exibida na ficha (mãe ↔ filho). Opcional. */
  onAbrirPeca?: (itemId: string) => void;
}) {
  if (!item) return null;

  const complementos: any[] = item.complements ?? [];
  const ehFilho = !!item.parentItemId;
  const podeAumentar = !!onAumentar && podeAumentarQuantidade(item, canEditLists);
  if (!complementos.length && !ehFilho && !podeAumentar) return null;

  const total = Number(item.contractedTotal)
    || Number(item.quantity ?? 0) + complementos.reduce((a, c) => a + (Number(c?.quantity) || 0), 0);
  const somaFilhos = total - Number(item.quantity ?? 0);
  const pedidoEm = item.complementRequestedAt
    ? new Date(item.complementRequestedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", margin: 0, display: "flex", alignItems: "center", gap: 6, color: "#746e69" }}>
        <PlusCircle aria-hidden="true" style={{ width: 13, height: 13, color: "#c2410c" }} />
        {ehFilho ? "Esta peça é um complemento" : "Complementos"}
      </h3>

      {ehFilho && (
        <div style={{ backgroundColor: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "12px 14px" }}>
          <p style={{ margin: 0, fontSize: 12, color: "#7c2d12", lineHeight: 1.5 }}>
            Complemento de{" "}
            {onAbrirPeca && item.parent?.id ? (
              <button
                type="button"
                onClick={() => onAbrirPeca(item.parent.id)}
                data-testid="button-abrir-peca-mae"
                style={{ background: "none", border: "none", padding: 0, fontFamily: "'DM Mono', monospace", fontWeight: 800, fontSize: 12, color: "#c2410c", cursor: "pointer", textDecoration: "underline" }}
              >
                {item.parent.displayId}
              </button>
            ) : (
              <strong style={{ fontFamily: "'DM Mono', monospace", color: "#c2410c" }}>{item.parent?.displayId ?? "peça original"}</strong>
            )}
            {" — "}a peça original permanece com {item.parent?.quantity ?? "?"} un. e não foi alterada.
          </p>
          {item.complementReason && (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "#7c2d12", lineHeight: 1.5 }}>
              <strong>Motivo{item.complementRequestedBy ? ` (${item.complementRequestedBy}${pedidoEm ? `, ${pedidoEm}` : ""})` : ""}:</strong>{" "}
              {item.complementReason}
            </p>
          )}
        </div>
      )}

      {complementos.length > 0 && (
        <div style={{ border: "1px solid #fed7aa", borderRadius: 10, overflow: "hidden" }}>
          {complementos.map((c: any) => (
            <div key={c.id} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "10px 14px", backgroundColor: "#fff7ed", borderBottom: "1px solid #fed7aa" }}>
              {onAbrirPeca ? (
                <button
                  type="button"
                  onClick={() => onAbrirPeca(c.id)}
                  data-testid={`button-abrir-complemento-${c.id}`}
                  style={{ background: "none", border: "none", padding: 0, fontFamily: "'DM Mono', monospace", fontWeight: 800, fontSize: 12, color: "#c2410c", cursor: "pointer", textDecoration: "underline" }}
                >
                  {c.displayId}
                </button>
              ) : (
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, fontSize: 12, color: "#c2410c" }}>{c.displayId}</span>
              )}
              <span style={{ backgroundColor: "#c2410c", color: "#ffffff", borderRadius: 6, padding: "2px 7px", fontSize: 10, fontWeight: 800 }}>
                +{c.quantity} UN.
              </span>
              <StatusPill status={c.status} size="sm" />
              <span style={{ fontSize: 11, color: "#7c2d12", fontFamily: "'DM Mono', monospace" }}>
                {Number(c.quantityProduced) || 0}/{Number(c.conferredQty) || 0}/{Number(c.deliveredQty) || 0}
                <span style={{ fontFamily: "inherit", color: "#9a3412" }}> prod./conf./entr.</span>
              </span>
              {c.complementReason && (
                <span style={{ flexBasis: "100%", fontSize: 11, color: "#7c2d12", lineHeight: 1.45 }}>
                  {c.complementRequestedBy ? <strong>{c.complementRequestedBy}: </strong> : null}
                  {c.complementReason}
                </span>
              )}
            </div>
          ))}
          <div style={{ padding: "9px 14px", backgroundColor: "#ffedd5", fontSize: 12, fontWeight: 800, color: "#7c2d12" }}>
            Contratado total: {total} un. ({item.quantity} + {somaFilhos})
          </div>
        </div>
      )}

      {podeAumentar && onAumentar && (
        <div>
          <AumentarQuantidadeButton onClick={() => onAumentar(item)} />
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "#746e69", lineHeight: 1.5 }}>
            A peça em produção não muda de quantidade. O aumento vira uma peça complementar, com ciclo próprio e a mesma arte.
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * Botão de disparo da FICHA da peça — existe para que o gesto tenha a MESMA
 * cara e o mesmo rótulo onde quer que a ficha seja montada (foi assim que
 * "Editar quantidade" acabou com três aparências diferentes). Na LISTA o
 * rótulo é só "Aumentar" (a coluna já diz o substantivo); aqui, sem coluna
 * para apoiar, ele diz a ação inteira.
 */
export function AumentarQuantidadeButton({
  onClick, variant = "outline", disabled, testId = "button-aumentar-quantidade",
}: {
  onClick: () => void;
  variant?: "outline" | "link";
  disabled?: boolean;
  testId?: string;
}) {
  const link = variant === "link";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      title="Aumentar quantidade — cria uma peça complementar"
      style={link
        ? { alignSelf: "flex-start", background: "none", border: "none", padding: 0, fontSize: 11, fontWeight: 800, color: "#c2410c", cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 4 }
        : {
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            backgroundColor: "#fff7ed", border: "1px solid #fed7aa", color: "#c2410c",
            borderRadius: 8, padding: "9px 14px", fontSize: 12, fontWeight: 800,
            cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
          }}
    >
      <PlusCircle aria-hidden="true" style={{ width: link ? 11 : 14, height: link ? 11 : 14 }} />
      Aumentar quantidade
    </button>
  );
}
