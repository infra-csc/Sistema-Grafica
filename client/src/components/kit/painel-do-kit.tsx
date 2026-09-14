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
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Package, Plus, X } from "lucide-react";
import { diaMesDoKit, type RemessaDoKit } from "@shared/kit";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalHeader, modalSurface } from "@/components/modal-shell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, FS, R } from "@/lib/theme";

const ROTULO: React.CSSProperties = { display: "block", fontSize: FS.small, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#57534e", marginBottom: 5 };
const CAMPO: React.CSSProperties = { width: "100%", boxSizing: "border-box", height: 38, padding: "0 10px", borderRadius: R.md, border: "1px solid #d6d3d1", background: "#fff", fontSize: 14, color: T.text, fontFamily: "inherit" };

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

export function PainelDoKit({ eventId, pecas, podeCriar, usuarioDoKit, nomeDoUsuario, dataDoEvento, saidaDoEvento, eventoFinalizado }: {
  eventId: string;
  pecas: Array<{ kitRemessaId?: string | null; deletedAt?: unknown }>;
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
  const [aberto, setAberto] = useState(false);
  const { data: remessas = [] } = useQuery<RemessaDoKit[]>({ queryKey: [chaveDasRemessas(eventId)], enabled: !!eventId });

  const [form, setForm] = useState({ versao: "V1", solicitante: "", entregaMaterial: "", dataEvento: "", cargaCaminhao: "", saidaCaminhao: "" });
  const [planilha, setPlanilha] = useState<{ nome: string; pecas: PecaDaPlanilha[]; departamento: string | null; dataSolicitacao: string | null } | null>(null);
  const [lendoPlanilha, setLendoPlanilha] = useState(false);

  // Cada abertura: a versão seguinte e os dados da ÚLTIMA remessa (quando há).
  useEffect(() => {
    if (!aberto) return;
    const ultima = remessas[0];
    setPlanilha(null);
    setForm({
      versao: proximaVersao(remessas),
      solicitante: ultima?.solicitante || nomeDoUsuario,
      entregaMaterial: dataDoCampo(ultima?.entregaMaterial),
      dataEvento: dataDoCampo(ultima?.dataEvento) || dataDoCampo(dataDoEvento),
      cargaCaminhao: dataDoCampo(ultima?.cargaCaminhao),
      saidaCaminhao: dataDoCampo(ultima?.saidaCaminhao),
    });
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

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
        description: r.pecas > 0 ? "As peças entraram na lista do evento com o selo KIT." : "Adicione as peças escolhendo esta remessa, ou crie outra com a planilha.",
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

  const campo = (id: string, rotulo: string, chave: keyof typeof form, tipo: "text" | "date" = "text") => (
    <div>
      <label htmlFor={`remessa-${id}`} style={ROTULO}>{rotulo}</label>
      <input id={`remessa-${id}`} data-testid={`input-remessa-${id}`} type={tipo} value={form[chave]}
        onChange={(e) => setForm((f) => ({ ...f, [chave]: e.target.value }))} style={CAMPO} />
    </div>
  );

  return (
    <section data-testid="painel-do-kit" aria-labelledby="titulo-painel-do-kit"
      style={{ backgroundColor: "#fff", border: "1px solid #e7e5e4", borderLeft: "3px solid #7c3aed", borderRadius: R.lg, padding: "14px 20px", marginBottom: 24, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Package style={{ width: 16, height: 16, color: "#6d28d9" }} aria-hidden="true" />
        <h2 id="titulo-painel-do-kit" style={{ margin: 0, fontSize: 13, fontWeight: 800, color: T.text, textTransform: "uppercase", letterSpacing: "0.04em" }}>Kit</h2>
        <span style={{ fontSize: FS.body, color: "#57534e" }}>
          {remessas.length === 0 ? "Nenhuma remessa do Kit neste evento." : `${remessas.length} ${remessas.length === 1 ? "remessa" : "remessas"} — datas próprias do Kit`}
        </span>
        {podeCriar && (
          <button type="button" data-testid="button-nova-remessa-kit" disabled={eventoFinalizado} onClick={() => setAberto(true)}
            title={eventoFinalizado ? "Evento finalizado — não recebe peças" : undefined}
            style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, height: isMobile ? 44 : 34, padding: "0 14px", borderRadius: R.md, border: "1px solid #ddd6fe", background: eventoFinalizado ? "#f5f5f4" : "#f5f3ff", color: eventoFinalizado ? "#a8a29e" : "#5b21b6", fontSize: 12.5, fontWeight: 800, cursor: eventoFinalizado ? "not-allowed" : "pointer" }}>
            <Plus size={14} aria-hidden="true" /> Nova remessa do Kit
          </button>
        )}
      </div>
      {usuarioDoKit && remessas.length === 0 && (
        <p style={{ margin: 0, fontSize: FS.body, color: "#92400e" }}>Crie a remessa do Kit — com a planilha, as datas e as peças entram juntas.</p>
      )}
      {remessas.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8 }}>
          {remessas.map((r) => (
            <li key={r.id} data-testid={`remessa-kit-${r.id}`}
              style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 12px", borderRadius: R.md, border: "1px solid #ddd6fe", background: "#faf5ff", minWidth: 200 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#4c1d95" }}>KIT {r.versao} · {pecasDe(r.id)} {pecasDe(r.id) === 1 ? "peça" : "peças"}</span>
              <span style={{ fontSize: FS.small, color: "#44403c" }}>
                Entrega do material <strong>{diaMesDoKit(r.entregaMaterial) ?? "—"}</strong>
                {r.saidaCaminhao ? <> · saída do caminhão <strong>{diaMesDoKit(r.saidaCaminhao)}</strong></> : null}
                {r.saidaCaminhao && saidaDoEvento && diaMesDoKit(r.saidaCaminhao) !== diaMesDoKit(saidaDoEvento) ? ` (Arena: ${diaMesDoKit(saidaDoEvento)})` : ""}
              </span>
              <span style={{ fontSize: FS.small, color: "#57534e" }}>{r.solicitante ?? r.criadoPor ?? "—"}{r.arquivo ? ` · ${r.arquivo}` : ""}</span>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={aberto} onOpenChange={(o) => { if (!o && !criar.isPending) setAberto(false); }}>
        <DialogContent data-testid="dialog-nova-remessa-kit" className={HIDE_NATIVE_CLOSE} style={modalSurface(nPecas > 0 ? 1100 : 600)}>
          <DialogTitle className="sr-only">Nova remessa do Kit</DialogTitle>
          <DialogDescription className="sr-only">Planilha do Kit, datas da remessa e peças numa tela só.</DialogDescription>
          <ModalHeader icon={Package} tint="#6d28d9" title="Nova remessa do Kit"
            subtitle={remessas.length > 0 ? `Começa com os dados da ${remessas[0].versao} — a planilha, se tiver, substitui.` : "Envie a planilha do Kit: as datas e as peças entram juntas."}
            onClose={criar.isPending ? undefined : () => setAberto(false)} />

          <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: isMobile ? 16 : "16px 24px", display: "grid", gap: 16,
            gridTemplateColumns: !isMobile && nPecas > 0 ? "minmax(0, 360px) minmax(0, 1fr)" : "minmax(0, 1fr)", alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
              <label data-testid="button-planilha-remessa-kit"
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "12px 10px", borderRadius: R.md, border: `1.5px dashed ${planilha ? "#16a34a" : "#a78bfa"}`, background: planilha ? "#f0fdf4" : "#faf5ff", color: planilha ? "#166534" : "#5b21b6", cursor: lendoPlanilha ? "wait" : "pointer", textAlign: "center" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 800 }}>
                  <FileSpreadsheet size={16} aria-hidden="true" />
                  {lendoPlanilha ? "Lendo a planilha…" : planilha ? planilha.nome : "Enviar a planilha do Kit (.xlsx)"}
                </span>
                <span style={{ fontSize: FS.small, color: "#57534e" }}>
                  {planilha ? `${nPecas} ${nPecas === 1 ? "peça" : "peças"} · clique para trocar` : "Preenche as datas e traz as peças. Opcional."}
                </span>
                <input type="file" accept=".xlsx" hidden disabled={lendoPlanilha}
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
              <div style={{ minWidth: 0, border: "1px solid #e7e5e4", borderRadius: R.lg, overflow: "hidden" }}>
                <div style={{ padding: "8px 12px", background: "#fafaf9", borderBottom: "1px solid #e7e5e4", fontSize: FS.small, fontWeight: 800, color: "#57534e", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Peças da planilha · {nPecas}
                </div>
                <div style={{ overflowX: "auto", maxHeight: isMobile ? 320 : "52vh" }}>
                  <table data-testid="tabela-pecas-remessa-kit" style={{ width: "100%", minWidth: 560, borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#fff", position: "sticky", top: 0 }}>
                        {["Peça", "Qtd", "Material · Acab.", "Arquivo (m)", "m²", ""].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10.5, color: "#57534e", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #f0efed" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {planilha.pecas.map((p, i) => (
                        <tr key={p._chave} style={{ borderBottom: "1px solid #f5f4f2" }}>
                          <td style={{ padding: "7px 10px", color: T.text, fontWeight: 600 }}>{p.description || p.type}</td>
                          <td style={{ padding: "7px 10px", fontVariantNumeric: "tabular-nums" }}>{p.quantity}</td>
                          <td style={{ padding: "7px 10px", color: "#44403c" }}>{[p.material, p.finish].filter(Boolean).join(" · ")}</td>
                          <td style={{ padding: "7px 10px", fontVariantNumeric: "tabular-nums", color: "#44403c" }}>{p.fileWidth && p.fileHeight ? `${p.fileWidth} × ${p.fileHeight}` : "—"}</td>
                          <td style={{ padding: "7px 10px", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{Number(p.calculatedM2 || 0).toFixed(2)}</td>
                          <td style={{ padding: "4px 6px" }}>
                            <button type="button" aria-label={`Tirar ${p.description || p.type}`} onClick={() => tirarPeca(i)}
                              style={{ width: 28, height: 28, borderRadius: R.md, border: "none", background: "transparent", color: "#a8a29e", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
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

          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, flexWrap: "wrap", padding: isMobile ? "12px 16px" : "14px 24px", borderTop: "1px solid #ebe8e4", flexShrink: 0 }}>
            {faltando && <span aria-live="polite" style={{ fontSize: FS.body, color: "#92400e", marginRight: "auto" }}>{faltando}.</span>}
            <button type="button" onClick={() => setAberto(false)} disabled={criar.isPending}
              style={{ height: 44, padding: "0 18px", borderRadius: R.md, border: "1px solid #e7e5e4", background: "#fff", color: "#44403c", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              Cancelar
            </button>
            <button type="button" data-testid="button-criar-remessa-kit" disabled={!!faltando || criar.isPending} onClick={() => criar.mutate()}
              style={{ height: 44, padding: "0 22px", borderRadius: R.md, border: "none", background: faltando || criar.isPending ? "#e7e5e4" : "#6d28d9", color: faltando || criar.isPending ? "#78716c" : "#fff", fontSize: 14, fontWeight: 800, cursor: faltando ? "not-allowed" : "pointer" }}>
              {criar.isPending ? "Criando…" : nPecas > 0 ? `Criar remessa e importar ${nPecas} ${nPecas === 1 ? "peça" : "peças"}` : "Criar remessa"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
