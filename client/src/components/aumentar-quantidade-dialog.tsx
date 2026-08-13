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
// "3 telas, 1 código": este mesmo modal é montado pelo Detalhe do Evento, pelo
// Painel Geral e pela Revisão (Solicitação). Ele não sabe de qual tela veio —
// recebe a peça-mãe e (opcionalmente) o evento, e resolve tudo sozinho:
// permissão já foi checada por quem abriu, mas o SERVIDOR revalida (403) e a
// mensagem real dele é o que aparece na tela.
//
// Espelho de POST /api/items/:id/complement (server/routes/items.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { PlusCircle, AlertTriangle, Recycle, Truck, FileWarning, RotateCw, Database } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModalHeader, ModalFooter, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { StatusPill } from "@/components/status-pill";
import { PRODUCTION_STATUSES } from "@/lib/status";
import { getSaldo } from "@/lib/saldo";
import { calculateM2 } from "@/lib/calculateM2";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
 * O botão "Aumentar quantidade" aparece? Mesmo predicado do servidor, na ordem
 * dele: papel que cria peças no evento + peça viva + peça que NÃO é ela mesma
 * um complemento (complemento de complemento é 409 IS_COMPLEMENT: o segundo
 * aumento se pede na mãe) + peça em produção.
 *
 * `podeMexerNaQuantidade` espelha o gate do servidor (`podeMudarQuantidade` em
 * server/routes/items.ts): SÓ admin e solicitacao. É deliberadamente mais
 * estrito que o `canEditLists` da tela — criar peça no evento que você mesmo
 * criou é uma coisa; alterar o contrato de uma peça que já virou lona impressa
 * no galpão é outra. A Gráfica não entra: ela produz o que pedem.
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
 * Como o roteamento do complemento depende do `code` (USE_COMPLEMENT abre o
 * modal, MIGRATION_PENDING troca o formulário pelo aviso do db:push,
 * QUANTITY_FLOOR explica o piso), ele é reconstruído aqui pela frase canônica
 * que o servidor escreve. Cada padrão casa com um trecho ESTÁVEL da mensagem —
 * a parte que não muda com displayId nem com números.
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
 * Normaliza o erro de qualquer rota em `{ message, code, data }`.
 *
 * Aceita as DUAS formas: o corpo JSON cru (caso algum chamador use `fetch`
 * direto) e a mensagem já desembrulhada pelo `apiRequest` — nesta, o `code` é
 * reconstruído por CODIGO_POR_MENSAGEM. Sem isso, `code` era sempre
 * `undefined` e todo o roteamento por código virava código morto: o 409 que
 * deveria ABRIR o modal de complemento saía como um toast vermelho comum, e o
 * 503 de migração pendente ganhava um botão "Tentar de novo" que jamais
 * funcionaria.
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
 * rodapé, então o pior caso é o rodapé dizer -C2 e sair -C3 — nunca um número
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

const AVISO_BASE: React.CSSProperties = {
  display: "flex", gap: 8, alignItems: "flex-start",
  padding: "10px 12px", borderRadius: 8, fontSize: 12, lineHeight: 1.5,
};

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
  const [qtdRaw, setQtdRaw] = useState("1");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<ApiError | null>(null);
  const [tocouMotivo, setTocouMotivo] = useState(false);
  const qtdRef = useRef<HTMLInputElement>(null);

  // Cada abertura começa limpa: reaproveitar o motivo da peça anterior é o
  // caminho mais curto para uma justificativa errada virar histórico.
  useEffect(() => {
    if (!open) return;
    const inicial = sugestao && sugestao > 0 ? Math.min(9999, Math.floor(sugestao)) : 1;
    setQtdRaw(String(inicial));
    setMotivo("");
    setErro(null);
    setTocouMotivo(false);
    const t = setTimeout(() => qtdRef.current?.select(), 60);
    return () => clearTimeout(t);
  }, [open, sugestao, item?.id]);

  const s = useMemo(() => getSaldo(item ?? {}), [item]);
  const qtd = Math.floor(Number(qtdRaw)) || 0;
  const qtdValida = qtd >= 1 && qtd <= 9999;
  const motivoLimpo = motivo.trim();
  const motivoValido = motivoLimpo.length >= 10 && motivoLimpo.length <= 500;
  const m2 = qtdValida ? m2DoComplemento(item, qtd) : null;
  const totalDepois = s.contractedTotal + (qtdValida ? qtd : 0);
  const sufixo = proximoSufixo(item);
  const displayFilho = `${item?.displayId ?? ""}-C${sufixo}`;

  // Caminhão já saiu: o lote nasce atrasado e a logística precisa ser combinada
  // ANTES de a Gráfica imprimir. Formatado em UTC como no restante da tela de
  // evento (o valor gravado É o horário que a pessoa digitou).
  const saidaCaminhao = useMemo(() => {
    const raw = event?.truckDepartureDate;
    if (!raw) return null;
    const d = new Date(raw as any);
    if (isNaN(d.getTime())) return null;
    return d.getTime() < Date.now()
      ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })
      : null;
  }, [event?.truckDepartureDate]);

  const migracaoPendente = erro?.code === "MIGRATION_PENDING";
  const erroRetentavel = !!erro && !erro.code && !ERRO_SEM_RETRY.test(erro.message);

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
            description: `${child?.displayId ?? displayFilho} — +${qtd} un. Ele aparece na lista logo abaixo de ${item?.displayId}. A Gráfica foi avisada.`,
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
          description: "Apenas Solicitação, admin ou o criador do evento podem aumentar a quantidade.",
          variant: "destructive",
        });
      }
    },
  });

  const pendente = criarMutation.isPending;
  const podeEnviar = qtdValida && motivoValido && !pendente && !migracaoPendente;

  const submeter = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!podeEnviar || !item) return;
    setErro(null);
    criarMutation.mutate();
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !pendente) onOpenChange(false); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(520)}>
        <DialogTitle className="sr-only">Aumentar quantidade</DialogTitle>
        <DialogDescription className="sr-only">
          Cria uma peça complementar com as unidades a mais. A peça original não é alterada.
        </DialogDescription>

        <ModalHeader
          variant="confirm"
          icon={PlusCircle}
          tint="#c2410c"
          title="Aumentar quantidade"
          subtitle={`${item.displayId} · ${item.type}${item.description ? ` — ${item.description}` : ""}`}
          onClose={() => { if (!pendente) onOpenChange(false); }}
        />

        {migracaoPendente ? (
          <div style={{ padding: "24px" }}>
            <div style={{ ...AVISO_BASE, backgroundColor: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c" }}>
              <Database style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1 }} />
              <span>
                <strong style={{ display: "block", marginBottom: 2 }}>Recurso indisponível</strong>
                Falta rodar a atualização do banco (<code style={{ fontFamily: "'DM Mono', monospace" }}>npm run db:push</code>).
                Fale com o administrador — até lá, o aumento precisa ser combinado por fora do sistema.
              </span>
            </div>
          </div>
        ) : (
          <form onSubmit={submeter}>
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18, maxHeight: "60vh", overflowY: "auto" }}>

              <div style={{ backgroundColor: "#fafaf9", border: "1px solid #ebe8e4", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <StatusPill status={item.status} />
                  {s.complementsQty > 0 && (
                    <span style={{ backgroundColor: "#ffedd5", border: "1px solid #fed7aa", color: "#c2410c", borderRadius: 999, padding: "2px 9px", fontSize: 10, fontWeight: 800 }}>
                      JÁ TEM +{s.complementsQty}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "#57534e" }}>
                  {([
                    ["Contratado", s.qty],
                    ["Produzido", s.produced],
                    ["Conferido", s.conferred],
                    ["Entregue", s.delivered],
                  ] as const).map(([rotulo, valor]) => (
                    <span key={rotulo}>
                      {rotulo}{" "}
                      <strong style={{ color: "#1c1917", fontFamily: "'DM Mono', monospace" }}>{valor}</strong>
                    </span>
                  ))}
                </div>
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "#746e69", lineHeight: 1.5 }}>
                  Esta peça <strong style={{ color: "#1c1917" }}>não será alterada</strong>. O aumento vira uma peça nova, ligada a ela.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="complemento-qtd" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#746e69" }}>
                  Quantas unidades a mais?
                </label>
                <input
                  id="complemento-qtd"
                  ref={qtdRef}
                  type="number"
                  min={1}
                  max={9999}
                  step={1}
                  inputMode="numeric"
                  value={qtdRaw}
                  onChange={(e) => setQtdRaw(e.target.value)}
                  disabled={pendente}
                  data-testid="input-complemento-quantidade"
                  style={{
                    width: "100%", backgroundColor: "#f3f4f3", border: "none", borderRadius: 8,
                    padding: "12px 16px", fontSize: 20, fontWeight: 800, color: "#1a1c1c",
                    fontFamily: "'DM Mono', monospace", textAlign: "center",
                  }}
                  onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 2px rgba(194,65,12,0.25)")}
                  onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
                />
                <p style={{ margin: 0, fontSize: 12, color: qtdValida ? "#57534e" : "#b91c1c", lineHeight: 1.5 }}>
                  {qtdValida
                    ? `${qtd} un.${m2 !== null ? ` · ${fmtM2(m2)} m²` : " · m² a definir (a peça original não tem medida de arquivo)"} · o total contratado passa a ${totalDepois} un.`
                    : "Informe de 1 a 9999 unidades."}
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="complemento-motivo" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#746e69" }}>
                  Por que o aumento? <span style={{ color: "#c2410c" }}>(obrigatório)</span>
                </label>
                <textarea
                  id="complemento-motivo"
                  value={motivo}
                  maxLength={500}
                  rows={3}
                  onChange={(e) => setMotivo(e.target.value)}
                  onBlur={() => setTocouMotivo(true)}
                  disabled={pendente}
                  placeholder="Ex.: cliente confirmou dois pórticos extras para a ativação de sábado"
                  data-testid="input-complemento-motivo"
                  style={{
                    width: "100%", backgroundColor: "#f3f4f3", border: "none", borderRadius: 8,
                    padding: "12px 16px", fontSize: 14, color: "#1a1c1c", fontFamily: "inherit",
                    resize: "vertical", lineHeight: 1.5,
                  }}
                  onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 2px rgba(194,65,12,0.25)")}
                />
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
                  <span style={{ color: tocouMotivo && !motivoValido ? "#b91c1c" : "#746e69", lineHeight: 1.4 }}>
                    {tocouMotivo && !motivoValido
                      ? "Explique o motivo (mín. 10 caracteres)"
                      : "Vai para a fila da Gráfica, para o sino e para o histórico da peça."}
                  </span>
                  <span style={{ color: "#746e69", fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
                    {motivoLimpo.length}/500
                  </span>
                </div>
              </div>

              {s.isInProd && s.toProduce > 0 && (
                <div style={{ ...AVISO_BASE, backgroundColor: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}>
                  <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }} />
                  <span>Ainda faltam {s.toProduce} un. na peça original. O complemento é um lote separado.</span>
                </div>
              )}

              {(item.isReuse || s.reused > 0) && (
                <div style={{ ...AVISO_BASE, backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d" }}>
                  <Recycle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }} />
                  <span>A original foi reaproveitada. As novas nascem para impressão; a Gráfica pode marcar reaproveitamento depois.</span>
                </div>
              )}

              {!item.finalFileUrl && (
                <div style={{ ...AVISO_BASE, backgroundColor: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}>
                  <FileWarning style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }} />
                  <span>A peça original não tem arquivo final registrado. A Gráfica vai receber o complemento sem arquivo.</span>
                </div>
              )}

              {saidaCaminhao && (
                <div style={{ ...AVISO_BASE, backgroundColor: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c" }}>
                  <Truck style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }} />
                  <span>O caminhão deste evento saiu em {saidaCaminhao}. Combine a logística antes de confirmar.</span>
                </div>
              )}

              {erro && (
                <div
                  role="alert"
                  data-testid="erro-complemento"
                  style={{ ...AVISO_BASE, backgroundColor: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", flexDirection: "column", gap: 8 }}
                >
                  <span style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }} />
                    <span>{erro.message}</span>
                  </span>
                  {erroRetentavel && (
                    <button
                      type="button"
                      onClick={() => submeter()}
                      disabled={pendente}
                      data-testid="button-retry-complemento"
                      style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #fecaca", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 800, color: "#b91c1c", cursor: pendente ? "wait" : "pointer" }}
                    >
                      <RotateCw style={{ width: 12, height: 12 }} />
                      Tentar de novo
                    </button>
                  )}
                </div>
              )}
            </div>

            <ModalFooter>
              <p style={{ margin: "0 0 2px", fontSize: 11, color: "#746e69", textAlign: "center", lineHeight: 1.5 }}>
                Será criada a peça <strong style={{ color: "#1c1917", fontFamily: "'DM Mono', monospace" }}>{displayFilho}</strong> e a Gráfica é avisada na hora.
              </p>
              <button
                type="submit"
                disabled={!podeEnviar}
                data-testid="button-criar-complemento"
                title={!motivoValido ? "Explique o motivo (mín. 10 caracteres)" : undefined}
                style={{
                  width: "100%", height: 44, borderRadius: 8, border: "none",
                  backgroundColor: podeEnviar ? "#c2410c" : "#e7e5e4",
                  color: podeEnviar ? "#fff" : "#746e69",
                  fontSize: 13, fontWeight: 800, cursor: podeEnviar ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  transition: "background-color 0.15s",
                }}
                onMouseEnter={(e) => { if (podeEnviar) e.currentTarget.style.backgroundColor = "#9a3412"; }}
                onMouseLeave={(e) => { if (podeEnviar) e.currentTarget.style.backgroundColor = "#c2410c"; }}
              >
                <PlusCircle style={{ width: 15, height: 15 }} />
                {pendente ? "Criando…" : "Criar complemento"}
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={pendente}
                data-testid="button-cancelar-complemento"
                style={{ width: "100%", height: 36, borderRadius: 8, border: "none", background: "none", fontSize: 13, fontWeight: 600, color: "#746e69", cursor: pendente ? "wait" : "pointer" }}
              >
                Cancelar
              </button>
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
 */
export function temBlocoDeComplemento(item: any, canEditLists: boolean): boolean {
  if (!item) return false;
  return (
    (item.complements?.length ?? 0) > 0 ||
    !!item.parentItemId ||
    podeAumentarQuantidade(item, canEditLists)
  );
}

/**
 * Bloco de COMPLEMENTO da ficha da peça (slot `customActions` do
 * ItemDetailsDialog) — o mesmo nas 3 telas. Conta a história inteira sem abrir
 * mais nada:
 *  - na MÃE: quais complementos existem, em que pé estão e o total realmente
 *    contratado (a peça-mãe nunca muda, então esse número só existe derivado);
 *  - no FILHO: de quem ele é complemento, por que nasceu, quem pediu e quando;
 *  - e o botão que cria o próximo, quando o papel permite.
 * Devolve `null` quando não há nada a dizer — 100% do acervo atual.
 */
export function ComplementoDaFicha({
  item, canEditLists, onAumentar, onAbrirPeca,
}: {
  item: any | null;
  /** `canCreateItemsFor` da tela: admin, solicitacao ou criador do evento. */
  canEditLists: boolean;
  onAumentar: (item: any) => void;
  /** Troca a peça exibida na ficha (mãe ↔ filho). Opcional. */
  onAbrirPeca?: (itemId: string) => void;
}) {
  if (!item) return null;

  const complementos: any[] = item.complements ?? [];
  const ehFilho = !!item.parentItemId;
  const podeAumentar = podeAumentarQuantidade(item, canEditLists);
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
        <PlusCircle style={{ width: 13, height: 13, color: "#c2410c" }} />
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

      {podeAumentar && (
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
 * Botão de disparo padrão das 3 telas — existe para que o gesto tenha a MESMA
 * cara e o mesmo rótulo em toda parte (foi assim que "Editar quantidade"
 * acabou com três aparências diferentes). `variant`:
 *  - "outline": botão de ficha/menu (Detalhe do Evento, Painel Geral);
 *  - "link":    o `+ Aumentar quantidade` que fica colado no campo Qtd. travado.
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
      <PlusCircle style={{ width: link ? 11 : 14, height: link ? 11 : 14 }} />
      Aumentar quantidade
    </button>
  );
}
