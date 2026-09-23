// ─────────────────────────────────────────────────────────────────────────────
// KIT DENTRO DO EVENTO (dono, 14/09): as remessas do Kit deste evento, com as
// datas do Kit (entrega do material, carga e saída do caminhão).
//
// "NOVA REMESSA DO KIT" É UMA TELA SÓ: "o perfeito seria uma tela só que
// preenche os itens e esses dados". Envia a planilha do Kit → o cabeçalho
// preenche a remessa e a tabela vira a lista de peças; um botão cria a
// remessa e importa as peças juntas. Sem planilha, cria só a remessa.
// "Nas próximas remessas, se tiver, já vem os dados": a remessa nova abre com
// o solicitante e as datas da última, e a versão seguinte.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, FileSpreadsheet, Package, Plus, Trash2, X } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { diaMesDoKit, type RemessaDoKit } from "@shared/kit";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalHeader, modalSurface } from "@/components/modal-shell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { alvo, useIsMobile, usePonteiroGrosso } from "@/hooks/use-mobile";
import { T, FS, R, N, TOM, FONT } from "@/lib/theme";

const ROTULO: React.CSSProperties = { display: "block", fontSize: FS.small, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: T.apoio, marginBottom: 5 };
const CAMPO: React.CSSProperties = { width: "100%", boxSizing: "border-box", height: 38, padding: "0 10px", borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, fontSize: 14, color: T.text, fontFamily: "inherit" };

const dataDoCampo = (d: string | Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const proximaVersao = (remessas: RemessaDoKit[]) => {
  const numeros = remessas.map((r) => parseInt(String(r.versao).replace(/\D/g, ""), 10)).filter((n) => Number.isFinite(n));
  return `V${(numeros.length ? Math.max(...numeros) : remessas.length) + 1}`;
};

export const chaveDasRemessas = (eventId: string) => `/api/kit/remessas?eventId=${eventId}`;

type PecaDaPlanilha = {
  type: string; description: string; quantity: number;
  visualWidth: number | null; visualHeight: number | null; fileWidth: number | null; fileHeight: number | null;
  calculatedM2: number; material: string; finish: string; measurement: string; observations: string;
  suggestedSponsorIds?: string[];
  /** Identidade da linha na tela (a descrição pode repetir e não é chave). */
  _chave: string;
};

export function PainelDoKit({ eventId, pecas, podeCriar, usuarioDoKit, nomeDoUsuario, dataDoEvento, saidaDoEvento, eventoFinalizado, onAbrirPeca, onAdicionarPeca }: {
  eventId: string;
  pecas: any[];
  /** Abre o detalhe da peça (o mesmo da lista da Arena). */
  onAbrirPeca?: (peca: any) => void;
  /** Inclusão individual (15/09): abre "Adicionar Peça" já na remessa. */
  onAdicionarPeca?: (remessaId: string) => void;
  /** admin | solicitacao (inclui o usuário do Kit) — a régua do servidor. */
  podeCriar: boolean;
  usuarioDoKit: boolean;
  nomeDoUsuario: string;
  dataDoEvento: string | null;
  saidaDoEvento: string | null;
  eventoFinalizado: boolean;
}) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  /** Dedo (celular OU tablet do galpão): manda no TAMANHO do alvo, só nele. */
  const dedo = usePonteiroGrosso() || isMobile;
  const [aberto, setAberto] = useState(false);
  const { data: remessas = [] } = useQuery<RemessaDoKit[]>({ queryKey: [chaveDasRemessas(eventId)], enabled: !!eventId });

  const [form, setForm] = useState({ versao: "V1", solicitante: "", entregaMaterial: "", dataEvento: "", cargaCaminhao: "", saidaCaminhao: "" });
  const [planilha, setPlanilha] = useState<{ nome: string; pecas: PecaDaPlanilha[]; departamento: string | null; dataSolicitacao: string | null } | null>(null);
  const [lendoPlanilha, setLendoPlanilha] = useState(false);
  // Detalhe das peças de cada remessa, com status (15/09: "igual o da Arena").
  const [remessaAberta, setRemessaAberta] = useState<string | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<string | null>(null);
  // DESCARTE COM PERGUNTA — só quando há o que perder. O modal abre já
  // preenchido com os dados da última remessa; fechar isso sem mexer não custa
  // nada, e perguntar ali seria um clique a mais. Perder uma planilha lida (ou
  // datas digitadas à mão) custa refazer tudo: é aí que se pergunta.
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);
  const formInicialRef = useRef<string>("");
  const continuarRef = useRef<HTMLButtonElement | null>(null);

  const excluir = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/kit/remessas/${id}`)).json(),
    onSuccess: (r: any) => {
      toast({ title: "Remessa do Kit excluída", description: r?.excluidas ? `${r.excluidas} ${r.excluidas === 1 ? "peça foi para" : "peças foram para"} Peças Excluídas.` : undefined });
      setConfirmandoExclusao(null);
      setRemessaAberta(null);
      queryClient.invalidateQueries({ queryKey: [chaveDasRemessas(eventId)] });
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    },
    onError: (e: any) => toast({ title: "Não deu para excluir a remessa", description: String(e?.message ?? "").replace(/^\d{3}:\s*/, "").replace(/^\{"error":"(.*)"\}$/, "$1"), variant: "destructive" }),
  });

  // Cada abertura: a versão seguinte e os dados da ÚLTIMA remessa (quando há).
  useEffect(() => {
    if (!aberto) return;
    const ultima = remessas[0];
    setPlanilha(null);
    setConfirmandoDescarte(false);
    const inicial = {
      versao: proximaVersao(remessas),
      solicitante: ultima?.solicitante || nomeDoUsuario,
      entregaMaterial: dataDoCampo(ultima?.entregaMaterial),
      dataEvento: dataDoCampo(ultima?.dataEvento) || dataDoCampo(dataDoEvento),
      cargaCaminhao: dataDoCampo(ultima?.cargaCaminhao),
      saidaCaminhao: dataDoCampo(ultima?.saidaCaminhao),
    };
    // A foto do formulário como abriu: é contra ela que "mexeu?" é medido.
    formInicialRef.current = JSON.stringify(inicial);
    setForm(inicial);
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  // O foco vai para "Continuar editando" quando a pergunta aparece: o botão
  // que tinha o foco (Cancelar) acabou de sair da tela, e um Enter distraído
  // tem de cair na opção que NÃO perde nada. Esc de novo também volta.
  useEffect(() => {
    if (confirmandoDescarte) continuarRef.current?.focus();
  }, [confirmandoDescarte]);

  const lerPlanilha = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setLendoPlanilha(true);
    try {
      const corpo = new FormData();
      corpo.append("file", arquivo);
      const resposta = await fetch(`/api/events/${eventId}/preview-xlsx`, { method: "POST", body: corpo, credentials: "include" });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(dados?.error || "Não deu para ler a planilha");
      const c = dados?.kit ?? null;
      const lidas: PecaDaPlanilha[] = Array.isArray(dados?.items)
        ? dados.items.map((p: Omit<PecaDaPlanilha, "_chave">, i: number) => ({ ...p, _chave: `${Date.now()}-${i}` }))
        : [];
      if (c) {
        setForm((f) => ({
          versao: c.versao || f.versao,
          solicitante: c.solicitante || f.solicitante,
          entregaMaterial: c.entregaMaterial || f.entregaMaterial,
          dataEvento: c.dataEvento || f.dataEvento,
          cargaCaminhao: c.cargaCaminhao || f.cargaCaminhao,
          saidaCaminhao: c.saidaCaminhao || f.saidaCaminhao,
        }));
      }
      setPlanilha({ nome: dados?.fileName ?? arquivo.name, pecas: lidas, departamento: c?.departamento ?? null, dataSolicitacao: c?.dataSolicitacao ?? null });
      toast(c
        ? { title: `Planilha do Kit lida: ${lidas.length} ${lidas.length === 1 ? "peça" : "peças"}`, description: "Datas e versão preenchidas pelo cabeçalho — confira antes de criar." }
        : { title: `${lidas.length} ${lidas.length === 1 ? "peça lida" : "peças lidas"}`, description: "A planilha não tem o cabeçalho do Kit: preencha as datas à mão." });
    } catch (e: any) {
      toast({ title: "Não deu para ler a planilha", description: e?.message, variant: "destructive" });
    } finally {
      setLendoPlanilha(false);
    }
  };

  const criar = useMutation({
    mutationFn: async () => {
      const remessa = {
        versao: form.versao.trim(),
        solicitante: form.solicitante.trim() || null,
        departamento: planilha?.departamento || "Kit",
        dataSolicitacao: planilha?.dataSolicitacao || null,
        entregaMaterial: form.entregaMaterial,
        dataEvento: form.dataEvento || null,
        cargaCaminhao: form.cargaCaminhao || null,
        saidaCaminhao: form.saidaCaminhao || null,
        arquivo: planilha?.nome || null,
      };
      // Com peças: a importação cria a remessa e as peças numa ida só.
      if (planilha && planilha.pecas.length > 0) {
        const r = await apiRequest("POST", `/api/events/${eventId}/confirm-import`, {
          items: planilha.pecas.map(({ _chave, ...p }) => ({ ...p, suggestedSponsorIds: [] })),
          fileName: planilha.nome,
          kitNovaRemessa: remessa,
        });
        return { pecas: (await r.json())?.imported ?? planilha.pecas.length };
      }
      await apiRequest("POST", "/api/kit/remessas", { eventId, ...remessa });
      return { pecas: 0 };
    },
    onSuccess: (r) => {
      toast({
        title: r.pecas > 0 ? `Remessa ${form.versao.trim()} criada com ${r.pecas} ${r.pecas === 1 ? "peça" : "peças"}` : "Remessa do Kit criada",
        // As peças nascem em RASCUNHO: sem dizer, quem importou achava que a
        // remessa já tinha seguido para a vinculação.
        description: r.pecas > 0 ? "As peças entraram em Rascunho com o selo KIT — envie para a vinculação no card “Peças em Rascunho”." : "Adicione as peças escolhendo esta remessa, ou crie outra com a planilha.",
      });
      queryClient.invalidateQueries({ queryKey: [chaveDasRemessas(eventId)] });
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setAberto(false);
    },
    onError: (e: any) => toast({ title: "Não deu para criar a remessa", description: String(e?.message ?? "").replace(/^\d{3}:\s*/, ""), variant: "destructive" }),
  });

  if (remessas.length === 0 && !podeCriar) return null;
  const pecasDe = (id: string) => pecas.filter((p) => p.kitRemessaId === id && !p.deletedAt).length;
  const faltando = !form.versao.trim() ? "Informe a versão" : !form.entregaMaterial ? "Informe a data de entrega do material" : lendoPlanilha ? "Aguarde a leitura da planilha" : null;
  const nPecas = planilha?.pecas.length ?? 0;
  const tirarPeca = (i: number) => setPlanilha((p) => (p ? { ...p, pecas: p.pecas.filter((_, j) => j !== i) } : p));
  const temAlgoAPerder = !!planilha || JSON.stringify(form) !== formInicialRef.current;
  // Toda saída que não é "Criar" passa por aqui: X, Cancelar, Esc e clique fora.
  const pedirParaFechar = () => {
    if (criar.isPending) return;
    if (confirmandoDescarte) { setConfirmandoDescarte(false); return; }
    if (temAlgoAPerder) { setConfirmandoDescarte(true); return; }
    setAberto(false);
  };

  const campo = (id: string, rotulo: string, chave: keyof typeof form, tipo: "text" | "date" = "text") => (
    <div>
      <label htmlFor={`remessa-${id}`} style={ROTULO}>{rotulo}</label>
      <input id={`remessa-${id}`} data-testid={`input-remessa-${id}`} type={tipo} value={form[chave]}
        onChange={(e) => setForm((f) => ({ ...f, [chave]: e.target.value }))} style={CAMPO} />
    </div>
  );

  return (
    <section data-testid="painel-do-kit" aria-labelledby="titulo-painel-do-kit"
      style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderLeft: `3px solid ${TOM.roxo.text}`, borderRadius: R.lg, padding: "14px 20px", marginBottom: 24, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Package style={{ width: 16, height: 16, color: TOM.roxo.text }} aria-hidden="true" />
        <h2 id="titulo-painel-do-kit" style={{ margin: 0, fontSize: 13, fontWeight: 800, color: T.text, textTransform: "uppercase", letterSpacing: "0.04em" }}>Kit</h2>
        {/* Sem remessa, o painel aparece em TODO evento para quem pode criar:
            a frase diz para que ele serve, e que ignorá-lo é normal quando o
            evento não tem Kit. */}
        <span style={{ fontSize: FS.body, color: T.apoio }}>
          {remessas.length === 0
            ? (usuarioDoKit ? "Nenhuma remessa do Kit neste evento." : "Nenhuma remessa. Só é usado se o evento tiver Kit, com datas próprias de entrega e caminhão.")
            : `${remessas.length} ${remessas.length === 1 ? "remessa" : "remessas"} — datas próprias do Kit`}
        </span>
        {podeCriar && (
          <button type="button" data-testid="button-nova-remessa-kit" disabled={eventoFinalizado} onClick={() => setAberto(true)}
            title={eventoFinalizado ? "Evento finalizado — não recebe peças" : undefined}
            // Desabilitado em #78716c, não #a8a29e: o rótulo continua sendo
            // TEXTO lido (2,5:1 reprovava), só perde a cor de ação.
            style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, height: alvo(34, dedo), padding: "0 14px", borderRadius: R.md, border: `1px solid ${TOM.roxo.border}`, background: eventoFinalizado ? N.n2 : TOM.roxo.bg, color: eventoFinalizado ? T.second : TOM.roxo.text, fontSize: 12.5, fontWeight: 800, cursor: eventoFinalizado ? "not-allowed" : "pointer" }}>
            <Plus size={14} aria-hidden="true" /> Nova remessa do Kit
          </button>
        )}
      </div>
      {usuarioDoKit && remessas.length === 0 && (
        <p style={{ margin: 0, fontSize: FS.body, color: TOM.alerta.text }}>Crie a remessa do Kit — com a planilha, as datas e as peças entram juntas.</p>
      )}
      {remessas.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8 }}>
          {remessas.map((r) => (
            <li key={r.id} data-testid={`remessa-kit-${r.id}`}
              style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 12px", borderRadius: R.md, border: `1px solid ${TOM.roxo.border}`, background: TOM.roxo.bg, minWidth: 200 }}>
              <button type="button" aria-expanded={remessaAberta === r.id} data-testid={`button-abrir-remessa-${r.id}`}
                onClick={() => { setRemessaAberta((a) => (a === r.id ? null : r.id)); setConfirmandoExclusao(null); }}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: 0, border: "none", background: "none", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 800, color: TOM.roxo.text, minHeight: isMobile ? 44 : undefined }}>
                KIT {r.versao} · {pecasDe(r.id)} {pecasDe(r.id) === 1 ? "peça" : "peças"}
                <ChevronDown size={14} aria-hidden="true" style={{ transform: remessaAberta === r.id ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
              </button>
              <span style={{ fontSize: FS.small, color: T.strong }}>
                Entrega do material <strong>{diaMesDoKit(r.entregaMaterial) ?? "—"}</strong>
                {r.saidaCaminhao ? <> · saída do caminhão <strong>{diaMesDoKit(r.saidaCaminhao)}</strong></> : null}
                {r.saidaCaminhao && saidaDoEvento && diaMesDoKit(r.saidaCaminhao) !== diaMesDoKit(saidaDoEvento) ? ` (Arena: ${diaMesDoKit(saidaDoEvento)})` : ""}
              </span>
              <span style={{ fontSize: FS.small, color: T.apoio }}>{r.solicitante ?? r.criadoPor ?? "—"}{r.arquivo ? ` · ${r.arquivo}` : ""}</span>
            </li>
          ))}
        </ul>
      )}

      {/* AS PEÇAS DA REMESSA ABERTA, com o status de cada uma — a mesma leitura
          da lista da Arena. Clicar abre o detalhe da peça. */}
      {(() => {
        const r = remessas.find((x) => x.id === remessaAberta);
        if (!r) return null;
        const daRemessa = pecas
          .filter((p) => p.kitRemessaId === r.id && !p.deletedAt)
          .sort((a, b) => String(a.displayId ?? "").localeCompare(String(b.displayId ?? ""), "pt-BR", { numeric: true }));
        return (
          <div data-testid={`pecas-remessa-${r.id}`} style={{ border: `1px solid ${TOM.roxo.border}`, borderRadius: R.lg, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 12px", background: TOM.roxo.bg, borderBottom: `1px solid ${TOM.roxo.bg}` }}>
              <span style={{ fontSize: FS.small, fontWeight: 800, color: TOM.roxo.text, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Peças do KIT {r.versao} · entrega {diaMesDoKit(r.entregaMaterial) ?? "—"}
              </span>
              {podeCriar && onAdicionarPeca && confirmandoExclusao !== r.id && (
                <button type="button" data-testid={`button-adicionar-peca-remessa-${r.id}`} disabled={eventoFinalizado}
                  onClick={() => onAdicionarPeca(r.id)}
                  title={eventoFinalizado ? "Evento finalizado — não recebe peças" : `Adicionar uma peça à KIT ${r.versao}`}
                  style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, height: alvo(32, dedo), padding: "0 12px", borderRadius: R.md, border: "none", background: eventoFinalizado ? T.border : TOM.roxo.text, color: eventoFinalizado ? T.second : T.surface, fontSize: 12.5, fontWeight: 800, cursor: eventoFinalizado ? "not-allowed" : "pointer" }}>
                  <Plus size={13} aria-hidden="true" /> Adicionar peça ao KIT {r.versao}
                </button>
              )}
              {podeCriar && (confirmandoExclusao === r.id ? (
                <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {/* A frase diz o tamanho real do estrago — "e as 1 peças" e
                      "e as 0 peças" liam como erro de digitação justo na hora
                      de confirmar uma exclusão. */}
                  <span role="alert" style={{ fontSize: FS.body, color: TOM.perigo.text, fontWeight: 700 }}>
                    {daRemessa.length === 0
                      ? `Excluir a KIT ${r.versao}? Ela não tem peças.`
                      : `Excluir a KIT ${r.versao} e ${daRemessa.length === 1 ? "a peça dela" : `as ${daRemessa.length} peças dela`}?`}
                  </span>
                  {/* A REGRA À VISTA antes do clique — ela morava só no `title`
                      do botão, e a recusa do servidor chegava como surpresa. */}
                  {daRemessa.length > 0 && (
                    <span style={{ fontSize: FS.small, color: T.apoio, flexBasis: "100%" }}>
                      Vão para Peças Excluídas. Só é possível enquanto nenhuma peça saiu do rascunho.
                    </span>
                  )}
                  <button type="button" data-testid={`button-confirmar-excluir-remessa-${r.id}`} disabled={excluir.isPending} onClick={() => excluir.mutate(r.id)}
                    style={{ height: alvo(32, dedo), padding: "0 12px", borderRadius: R.md, border: "none", background: TOM.perigo.text, color: T.surface, fontSize: 12.5, fontWeight: 800, cursor: excluir.isPending ? "wait" : "pointer" }}>
                    {excluir.isPending ? "Excluindo…" : "Excluir"}
                  </button>
                  <button type="button" onClick={() => setConfirmandoExclusao(null)} disabled={excluir.isPending}
                    style={{ height: alvo(32, dedo), padding: "0 8px", border: "none", background: "none", color: T.apoio, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                    Voltar
                  </button>
                </span>
              ) : (
                <button type="button" data-testid={`button-excluir-remessa-${r.id}`} onClick={() => setConfirmandoExclusao(r.id)}
                  title="Excluir a remessa e as peças dela — só enquanto nenhuma peça foi enviada"
                  style={{ marginLeft: onAdicionarPeca ? 0 : "auto", display: "inline-flex", alignItems: "center", gap: 5, height: alvo(32, dedo), padding: "0 10px", borderRadius: R.md, border: `1px solid ${TOM.perigo.border}`, background: T.surface, color: TOM.perigo.text, fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
                  <Trash2 size={13} aria-hidden="true" /> Excluir remessa
                </button>
              ))}
            </div>
            {daRemessa.length === 0 ? (
              <p style={{ margin: 0, padding: "14px 12px", fontSize: FS.body, color: T.apoio }}>Nenhuma peça nesta remessa ainda — use “Adicionar peça ao KIT {r.versao}”.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      {["ID", "Peça", "Qtd", "Material · Acab.", "Status"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 10.5, color: T.apoio, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${N.n3}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {daRemessa.map((p) => (
                      <tr key={p.id} data-testid={`peca-remessa-${p.id}`} onClick={() => onAbrirPeca?.(p)}
                        style={{ borderBottom: `1px solid ${N.n3}`, cursor: onAbrirPeca ? "pointer" : "default" }}>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                          <button type="button" onClick={(e) => { e.stopPropagation(); onAbrirPeca?.(p); }} aria-label={`Ver detalhes da peça ${p.displayId}`}
                            style={{ padding: 0, border: "none", background: "none", fontFamily: FONT.mono, fontWeight: 700, color: T.accentText, fontSize: 13, cursor: "pointer" }}>
                            {p.displayId}
                          </button>
                        </td>
                        <td style={{ padding: "8px 12px", color: T.text, fontWeight: 600 }}>
                          {p.type}{p.description ? <span style={{ display: "block", fontWeight: 400, color: T.apoio, fontSize: 12 }}>{p.description}</span> : null}
                        </td>
                        <td style={{ padding: "8px 12px", fontVariantNumeric: "tabular-nums" }}>{p.quantity}</td>
                        <td style={{ padding: "8px 12px", color: T.strong }}>{[p.material, p.finish].filter(Boolean).join(" · ")}</td>
                        <td style={{ padding: "8px 12px" }}><StatusBadge status={p.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      <Dialog open={aberto} onOpenChange={(o) => { if (!o) pedirParaFechar(); }}>
        <DialogContent data-testid="dialog-nova-remessa-kit" className={HIDE_NATIVE_CLOSE} style={modalSurface(nPecas > 0 ? 1100 : 600)}>
          <DialogTitle className="sr-only">Nova remessa do Kit</DialogTitle>
          <DialogDescription className="sr-only">Planilha do Kit, datas da remessa e peças numa tela só.</DialogDescription>
          <ModalHeader icon={Package} tint={TOM.roxo.text} title="Nova remessa do Kit"
            subtitle={remessas.length > 0 ? `Começa com os dados da ${remessas[0].versao} — a planilha, se tiver, substitui.` : "Envie a planilha do Kit: as datas e as peças entram juntas."}
            onClose={criar.isPending ? undefined : pedirParaFechar} />

          <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: isMobile ? 16 : "16px 24px", display: "grid", gap: 16,
            gridTemplateColumns: !isMobile && nPecas > 0 ? "minmax(0, 360px) minmax(0, 1fr)" : "minmax(0, 1fr)", alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
              {/* O input era `hidden`: invisível E fora da ordem de Tab — sem
                  mouse não havia como enviar a planilha. `sr-only` mantém o
                  campo focável, e o anel no rótulo mostra onde o foco está. */}
              <label data-testid="button-planilha-remessa-kit"
                className="focus-within:ring-2 focus-within:ring-violet-600 focus-within:ring-offset-2"
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "12px 10px", borderRadius: R.md, border: `1.5px dashed ${planilha ? TOM.sucesso.text : TOM.roxo.dot}`, background: planilha ? TOM.sucesso.bg : TOM.roxo.bg, color: planilha ? TOM.sucesso.text : TOM.roxo.text, cursor: lendoPlanilha ? "wait" : "pointer", textAlign: "center" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 800 }}>
                  <FileSpreadsheet size={16} aria-hidden="true" />
                  {lendoPlanilha ? "Lendo a planilha…" : planilha ? planilha.nome : "Enviar a planilha do Kit (.xlsx)"}
                </span>
                <span style={{ fontSize: FS.small, color: T.apoio }}>
                  {planilha ? `${nPecas} ${nPecas === 1 ? "peça" : "peças"} · clique para trocar` : "Preenche as datas e traz as peças. Opcional."}
                </span>
                <input type="file" accept=".xlsx" className="sr-only" disabled={lendoPlanilha}
                  aria-label="Enviar a planilha do Kit (.xlsx)"
                  onChange={(e) => { void lerPlanilha(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                {campo("versao", "Versão", "versao")}
                {campo("solicitante", "Solicitante", "solicitante")}
                {campo("entrega", "Entrega do material", "entregaMaterial", "date")}
                {campo("evento", "Data do evento", "dataEvento", "date")}
                {campo("carga", "Carga do caminhão", "cargaCaminhao", "date")}
                {campo("saida", "Saída do caminhão", "saidaCaminhao", "date")}
              </div>
            </div>

            {nPecas > 0 && planilha && (
              <div style={{ minWidth: 0, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden" }}>
                <div style={{ padding: "8px 12px", background: T.bg, borderBottom: `1px solid ${T.border}`, fontSize: FS.small, fontWeight: 800, color: T.apoio, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Peças da planilha · {nPecas}
                </div>
                <div style={{ overflowX: "auto", maxHeight: isMobile ? 320 : "52vh" }}>
                  <table data-testid="tabela-pecas-remessa-kit" style={{ width: "100%", minWidth: 560, borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: T.surface, position: "sticky", top: 0 }}>
                        {["Peça", "Qtd", "Material · Acab.", "Arquivo (m)", "m²", ""].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10.5, color: T.apoio, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${N.n3}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {planilha.pecas.map((p, i) => (
                        <tr key={p._chave} style={{ borderBottom: `1px solid ${N.n3}` }}>
                          <td style={{ padding: "7px 10px", color: T.text, fontWeight: 600 }}>{p.description || p.type}</td>
                          <td style={{ padding: "7px 10px", fontVariantNumeric: "tabular-nums" }}>{p.quantity}</td>
                          <td style={{ padding: "7px 10px", color: T.strong }}>{[p.material, p.finish].filter(Boolean).join(" · ")}</td>
                          <td style={{ padding: "7px 10px", fontVariantNumeric: "tabular-nums", color: T.strong }}>{p.fileWidth && p.fileHeight ? `${p.fileWidth} × ${p.fileHeight}` : "—"}</td>
                          <td style={{ padding: "7px 10px", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{Number(p.calculatedM2 || 0).toFixed(2)}</td>
                          <td style={{ padding: "4px 6px" }}>
                            <button type="button" aria-label={`Tirar ${p.description || p.type} da remessa`} title="Tirar esta peça da remessa" onClick={() => tirarPeca(i)}
                              style={{ width: isMobile ? 44 : 28, height: isMobile ? 44 : 28, borderRadius: R.md, border: "none", background: "transparent", color: T.second, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <X size={14} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {confirmandoDescarte ? (
            // A pergunta mora NO rodapé, no lugar dos botões — o mesmo padrão
            // da exclusão de remessa neste painel. Um segundo modal por cima
            // deste esconderia justamente o que a pessoa está decidindo perder.
            <div data-testid="confirmar-descarte-remessa-kit" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, flexWrap: "wrap", padding: isMobile ? "12px 16px" : "14px 24px", borderTop: `1px solid ${TOM.perigo.border}`, background: TOM.perigo.bg, flexShrink: 0 }}>
              <span role="alert" style={{ fontSize: FS.body, color: TOM.perigo.text, fontWeight: 700, marginRight: "auto" }}>
                {planilha
                  ? `Descartar a planilha lida${nPecas > 0 ? ` (${nPecas} ${nPecas === 1 ? "peça" : "peças"})` : ""} e os dados da remessa?`
                  : "Descartar os dados da remessa que você preencheu?"}
              </span>
              <button type="button" ref={continuarRef} onClick={() => setConfirmandoDescarte(false)}
                style={{ height: 44, padding: "0 18px", borderRadius: R.md, border: `1px solid ${T.border}`, background: T.surface, color: T.strong, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                Continuar editando
              </button>
              <button type="button" data-testid="button-descartar-remessa-kit" onClick={() => { setConfirmandoDescarte(false); setAberto(false); }}
                style={{ height: 44, padding: "0 18px", borderRadius: R.md, border: "none", background: TOM.perigo.text, color: T.surface, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                Descartar
              </button>
            </div>
          ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, flexWrap: "wrap", padding: isMobile ? "12px 16px" : "14px 24px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
            {faltando && <span aria-live="polite" style={{ fontSize: FS.body, color: TOM.alerta.text, marginRight: "auto" }}>{faltando}.</span>}
            <button type="button" onClick={pedirParaFechar} disabled={criar.isPending}
              style={{ height: 44, padding: "0 18px", borderRadius: R.md, border: `1px solid ${T.border}`, background: T.surface, color: T.strong, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              Cancelar
            </button>
            <button type="button" data-testid="button-criar-remessa-kit" disabled={!!faltando || criar.isPending} onClick={() => criar.mutate()}
              style={{ height: 44, padding: "0 22px", borderRadius: R.md, border: "none", background: faltando || criar.isPending ? T.border : TOM.roxo.text, color: faltando || criar.isPending ? T.second : T.surface, fontSize: 14, fontWeight: 800, cursor: criar.isPending ? "wait" : faltando ? "not-allowed" : "pointer" }}>
              {criar.isPending ? "Criando…" : nPecas > 0 ? `Criar remessa e importar ${nPecas} ${nPecas === 1 ? "peça" : "peças"}` : "Criar remessa"}
            </button>
          </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
