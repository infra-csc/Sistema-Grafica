// ─────────────────────────────────────────────────────────────────────────────
// KIT DENTRO DO EVENTO (dono, 14/09): as remessas do Kit deste evento, com as
// datas do Kit (entrega do material, carga e saída do caminhão), e "Nova
// remessa" — cada planilha ou criação à mão é uma remessa; cada versão, uma
// remessa nova. As peças do Kit são criadas no formulário de peça escolhendo a
// remessa, ou importadas.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Package, Plus } from "lucide-react";
import { diaMesDoKit, type RemessaDoKit } from "@shared/kit";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalFooter, ModalHeader, modalSurface } from "@/components/modal-shell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, FS, R } from "@/lib/theme";

const ROTULO: React.CSSProperties = { display: "block", fontSize: FS.small, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#57534e", marginBottom: 6 };
const CAMPO: React.CSSProperties = { width: "100%", boxSizing: "border-box", height: 40, padding: "0 12px", borderRadius: R.md, border: "1px solid #d6d3d1", background: "#fff", fontSize: 14, color: T.text, fontFamily: "inherit" };

const dataDoCampo = (d: string | Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export const chaveDasRemessas = (eventId: string) => `/api/kit/remessas?eventId=${eventId}`;

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
  useEffect(() => {
    if (!aberto) return;
    setForm({
      versao: `V${remessas.length + 1}`,
      solicitante: nomeDoUsuario,
      entregaMaterial: "",
      dataEvento: dataDoCampo(dataDoEvento),
      cargaCaminhao: "",
      saidaCaminhao: "",
    });
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  // PREENCHER PELO TEMPLATE (dono, 14/09): "esses dados podem ser preenchidos
  // via template". Lê o cabeçalho da planilha do Kit (a mesma leitura da
  // importação) e preenche os campos para conferir.
  const [lendoPlanilha, setLendoPlanilha] = useState(false);
  const preencherComPlanilha = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setLendoPlanilha(true);
    try {
      const corpo = new FormData();
      corpo.append("file", arquivo);
      const resposta = await fetch(`/api/events/${eventId}/preview-xlsx`, { method: "POST", body: corpo, credentials: "include" });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(dados?.error || "Não deu para ler a planilha");
      const c = dados?.kit;
      if (!c) {
        toast({ title: "Esta planilha não tem o cabeçalho do Kit", description: "Procurei “Data de Entrega do material” e “Data Saída Caminhão” nas primeiras linhas.", variant: "destructive" });
        return;
      }
      setForm((f) => ({
        versao: c.versao || f.versao,
        solicitante: c.solicitante || f.solicitante,
        entregaMaterial: c.entregaMaterial || f.entregaMaterial,
        dataEvento: c.dataEvento || f.dataEvento,
        cargaCaminhao: c.cargaCaminhao || f.cargaCaminhao,
        saidaCaminhao: c.saidaCaminhao || f.saidaCaminhao,
      }));
      toast({ title: "Datas preenchidas pela planilha", description: `Confira e crie a remessa. ${Array.isArray(dados.items) && dados.items.length ? `As ${dados.items.length} peças entram por “Importar Excel”.` : ""}` });
    } catch (e: any) {
      toast({ title: "Não deu para ler a planilha", description: e?.message, variant: "destructive" });
    } finally {
      setLendoPlanilha(false);
    }
  };

  const criar = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/kit/remessas", {
      eventId,
      versao: form.versao.trim(),
      solicitante: form.solicitante.trim() || null,
      departamento: "Kit",
      entregaMaterial: form.entregaMaterial,
      dataEvento: form.dataEvento || null,
      cargaCaminhao: form.cargaCaminhao || null,
      saidaCaminhao: form.saidaCaminhao || null,
    })).json(),
    onSuccess: () => {
      toast({ title: "Remessa do Kit criada", description: "Agora é só adicionar as peças escolhendo esta remessa." });
      queryClient.invalidateQueries({ queryKey: [chaveDasRemessas(eventId)] });
      setAberto(false);
    },
    onError: (e: any) => toast({ title: "Não deu para criar a remessa", description: String(e?.message ?? "").replace(/^\d{3}:\s*/, ""), variant: "destructive" }),
  });

  if (remessas.length === 0 && !podeCriar) return null;
  const pecasDe = (id: string) => pecas.filter((p) => p.kitRemessaId === id && !p.deletedAt).length;
  const faltando = !form.versao.trim() ? "Informe a versão" : !form.entregaMaterial ? "Informe a data de entrega do material" : null;

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
        <p style={{ margin: 0, fontSize: FS.body, color: "#92400e" }}>Crie a remessa do Kit com as datas (entrega do material e caminhão) antes de adicionar ou importar peças.</p>
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
                {r.saidaCaminhao && saidaDoEvento && diaMesDoKit(r.saidaCaminhao) !== diaMesDoKit(saidaDoEvento) ? " (Arena: " + diaMesDoKit(saidaDoEvento) + ")" : ""}
              </span>
              <span style={{ fontSize: FS.small, color: "#57534e" }}>{r.solicitante ?? r.criadoPor ?? "—"}</span>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={aberto} onOpenChange={(o) => { if (!o && !criar.isPending) setAberto(false); }}>
        <DialogContent data-testid="dialog-nova-remessa-kit" className={HIDE_NATIVE_CLOSE} style={modalSurface(560)}>
          <DialogTitle className="sr-only">Nova remessa do Kit</DialogTitle>
          <DialogDescription className="sr-only">As datas do Kit para este evento.</DialogDescription>
          <ModalHeader icon={Package} tint="#6d28d9" title="Nova remessa do Kit" subtitle="As datas do Kit valem só para as peças desta remessa — as da Arena não mudam." onClose={criar.isPending ? undefined : () => setAberto(false)} />
          <form id="form-remessa-kit" onSubmit={(e) => { e.preventDefault(); if (!faltando && !criar.isPending) criar.mutate(); }}
            style={{ padding: "16px 24px", display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
            <label data-testid="button-preencher-remessa-planilha"
              style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 44, borderRadius: R.md, border: "1.5px dashed #a78bfa", background: "#faf5ff", color: "#5b21b6", fontSize: 13.5, fontWeight: 800, cursor: lendoPlanilha ? "wait" : "pointer" }}>
              <FileSpreadsheet size={16} aria-hidden="true" />
              {lendoPlanilha ? "Lendo a planilha…" : "Preencher com a planilha do Kit (.xlsx)"}
              <input type="file" accept=".xlsx" hidden disabled={lendoPlanilha}
                onChange={(e) => { void preencherComPlanilha(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <div>
              <label htmlFor="remessa-versao" style={ROTULO}>Versão</label>
              <input id="remessa-versao" data-testid="input-remessa-versao" value={form.versao} onChange={(e) => setForm((f) => ({ ...f, versao: e.target.value }))} style={CAMPO} />
            </div>
            <div>
              <label htmlFor="remessa-solicitante" style={ROTULO}>Solicitante</label>
              <input id="remessa-solicitante" value={form.solicitante} onChange={(e) => setForm((f) => ({ ...f, solicitante: e.target.value }))} style={CAMPO} />
            </div>
            <div>
              <label htmlFor="remessa-entrega" style={ROTULO}>Entrega do material</label>
              <input id="remessa-entrega" data-testid="input-remessa-entrega" type="date" required value={form.entregaMaterial} onChange={(e) => setForm((f) => ({ ...f, entregaMaterial: e.target.value }))} style={CAMPO} />
            </div>
            <div>
              <label htmlFor="remessa-evento" style={ROTULO}>Data do evento</label>
              <input id="remessa-evento" type="date" value={form.dataEvento} onChange={(e) => setForm((f) => ({ ...f, dataEvento: e.target.value }))} style={CAMPO} />
            </div>
            <div>
              <label htmlFor="remessa-carga" style={ROTULO}>Carga do caminhão</label>
              <input id="remessa-carga" type="date" value={form.cargaCaminhao} onChange={(e) => setForm((f) => ({ ...f, cargaCaminhao: e.target.value }))} style={CAMPO} />
            </div>
            <div>
              <label htmlFor="remessa-saida" style={ROTULO}>Saída do caminhão</label>
              <input id="remessa-saida" data-testid="input-remessa-saida" type="date" value={form.saidaCaminhao} onChange={(e) => setForm((f) => ({ ...f, saidaCaminhao: e.target.value }))} style={CAMPO} />
            </div>
          </form>
          <ModalFooter>
            <button type="submit" form="form-remessa-kit" data-testid="button-criar-remessa-kit" disabled={!!faltando || criar.isPending}
              title={faltando ?? undefined}
              style={{ height: 44, borderRadius: R.md, border: "none", background: faltando || criar.isPending ? "#e7e5e4" : "#6d28d9", color: faltando || criar.isPending ? "#78716c" : "#fff", fontSize: 14, fontWeight: 800, cursor: faltando ? "not-allowed" : "pointer" }}>
              {criar.isPending ? "Criando…" : "Criar remessa"}
            </button>
            <button type="button" onClick={() => setAberto(false)} disabled={criar.isPending}
              style={{ height: 40, borderRadius: R.md, border: "none", background: "transparent", color: "#57534e", fontSize: FS.body, fontWeight: 700, cursor: "pointer" }}>
              Voltar
            </button>
          </ModalFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
