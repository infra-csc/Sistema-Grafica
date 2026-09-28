// ─────────────────────────────────────────────────────────────────────────────
// DEVOLVER AS PEÇAS DO EVENTO PARA A ARTE — admin, com motivo (dono, 28/09:
// "Night Run CWB mudou de data e com isso mudam todos os logos de Ministério e
// Lei… como fazemos pra retornar tudo pra Arte?").
//
// A régua de QUEM volta é shared/devolver-evento-para-arte.ts — a mesma da
// rota POST /api/events/:id/devolver-para-a-arte. O diálogo mostra as que
// voltam (marcadas, por etapa, com filtro por patrocinador) e as que ficam de
// fora COM o porquê; o motivo vai para a Arte na peça e no aviso.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Botao } from "@/components/ui/botao";
import { HIDE_NATIVE_CLOSE, ModalFooter, ModalHeader, modalSurface } from "@/components/modal-shell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getStatusLabel } from "@/lib/status";
import { FS, FW, R, T, TOM } from "@/lib/theme";
import type { useToast } from "@/hooks/use-toast";
import {
  situacaoParaVoltarAArte, ROTULO_DE_FORA, MOTIVO_DEVOLVER_EVENTO_MIN, type ForaDaDevolucao,
} from "@shared/devolver-evento-para-arte";
import type { PecaDoEvento } from "./tipos";

type Resposta = { devolvidas: number; recusadas: Array<{ itemId: string; displayId: string | null; error: string }> };

export function DevolverEventoParaArteDialog({ open, onFechar, eventId, nomeDoEvento, pecas, isMobile, toast }: {
  open: boolean;
  onFechar: () => void;
  eventId: string;
  nomeDoEvento: string;
  pecas: PecaDoEvento[];
  isMobile: boolean;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [motivo, setMotivo] = useState("");
  const [soDoPatrocinador, setSoDoPatrocinador] = useState<string[]>([]);
  const [desmarcadas, setDesmarcadas] = useState<Set<string>>(() => new Set());
  const [enviando, setEnviando] = useState(false);

  const { voltam, deFora, patrocinadores } = useMemo(() => {
    const voltam: PecaDoEvento[] = [];
    const deFora = new Map<ForaDaDevolucao, PecaDoEvento[]>();
    const patrocinadores = new Map<string, string>();
    for (const p of pecas) {
      const s = situacaoParaVoltarAArte(p);
      if (s.volta) {
        voltam.push(p);
        for (const sp of p.sponsors ?? []) patrocinadores.set(sp.id, sp.name);
      } else if (s.grupo !== "cancelada" && s.grupo !== "antes-da-arte") {
        deFora.set(s.grupo, [...(deFora.get(s.grupo) ?? []), p]);
      }
    }
    return { voltam, deFora, patrocinadores: Array.from(patrocinadores.entries()).sort((a, b) => a[1].localeCompare(b[1], "pt-BR")) };
  }, [pecas]);

  // O filtro por patrocinador recorta a lista (vazio = todas as que voltam).
  const visiveis = useMemo(() => soDoPatrocinador.length === 0 ? voltam
    : voltam.filter((p) => (p.sponsors ?? []).some((s) => soDoPatrocinador.includes(s.id))), [voltam, soDoPatrocinador]);
  const marcadas = visiveis.filter((p) => !desmarcadas.has(p.id));
  const porEtapa = useMemo(() => {
    const m = new Map<string, PecaDoEvento[]>();
    for (const p of visiveis) m.set(getStatusLabel(p.status), [...(m.get(getStatusLabel(p.status)) ?? []), p]);
    return Array.from(m.entries());
  }, [visiveis]);

  const motivoLimpo = motivo.trim().replace(/\s+/g, " ");
  const faltam = Math.max(0, MOTIVO_DEVOLVER_EVENTO_MIN - motivoLimpo.length);
  const pode = marcadas.length > 0 && faltam === 0 && !enviando;

  const alternar = (id: string) => setDesmarcadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const fechar = () => { if (!enviando) onFechar(); };

  async function devolver() {
    if (!pode) return;
    setEnviando(true);
    try {
      const r = await apiRequest("POST", `/api/events/${eventId}/devolver-para-a-arte`, {
        itemIds: marcadas.map((p) => p.id), motivo: motivoLimpo,
      });
      const corpo = (await r.json()) as Resposta;
      await queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({
        title: `${corpo.devolvidas} peça${corpo.devolvidas !== 1 ? "s voltaram" : " voltou"} para a Arte`,
        description: corpo.recusadas.length
          ? `${corpo.recusadas.length} ficaram de fora: ${corpo.recusadas.slice(0, 3).map((x) => `${x.displayId ?? "peça"} (${x.error})`).join("; ")}${corpo.recusadas.length > 3 ? "…" : ""}`
          : "A Arte, e quem tinha as peças na fila, foram avisados com o motivo.",
      });
      setMotivo(""); setDesmarcadas(new Set()); setSoDoPatrocinador([]);
      onFechar();
    } catch (e) {
      toast({ title: "Não foi possível devolver as peças", description: e instanceof Error ? e.message : "Tente de novo em instantes.", variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  }

  const letra = (n: number) => (isMobile ? Math.max(12, n) : n);
  const chip = (ativo: boolean): React.CSSProperties => ({
    minHeight: isMobile ? 44 : 32, padding: "0 12px", borderRadius: R.pill, cursor: "pointer",
    border: `1px solid ${ativo ? T.text : T.border}`, background: ativo ? T.text : T.surface, color: ativo ? T.surface : T.text,
    fontSize: letra(FS.meta), fontWeight: FW.forte,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) fechar(); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(600)} data-testid="dialogo-devolver-evento-para-arte">
        <DialogTitle className="sr-only">Devolver peças para a Arte</DialogTitle>
        <DialogDescription className="sr-only">Escolha as peças, escreva o motivo e devolva para a Arte refazer.</DialogDescription>
        <ModalHeader icon={RotateCcw} tint={TOM.perigo.text} title="Devolver peças para a Arte" subtitle={nomeDoEvento} onClose={fechar} compacto={isMobile} />

        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: isMobile ? 16 : 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ margin: 0, fontSize: letra(13), color: T.second, lineHeight: 1.45 }}>
            As peças voltam para <strong style={{ color: T.text }}>Aguardando envio</strong> na Arte, sem thumb, sem arquivo final e sem a aprovação — para refazer a arte (ex.: data nova troca os logos). Saem da fila do Atendimento, da Revisão e da Gráfica.
          </p>

          <div>
            <label htmlFor="motivo-devolver-evento" style={{ display: "block", fontSize: letra(FS.small), fontWeight: FW.forte, color: T.apoio, marginBottom: 6 }}>
              Motivo <span style={{ color: TOM.perigo.text }}>*</span> <span style={{ fontWeight: FW.corpo, color: T.second }}>— a Arte lê isto na peça</span>
            </label>
            <textarea
              id="motivo-devolver-evento" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3}
              placeholder="Ex.: o evento mudou para 15/11 — trocar a data e os logos do Ministério e da Lei."
              data-testid="motivo-devolver-evento"
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, color: T.text, fontSize: isMobile ? 16 : 13, fontFamily: "inherit", resize: "vertical" }}
            />
            {faltam > 0 && <p style={{ margin: "4px 0 0", fontSize: letra(FS.small), color: TOM.alerta.text }}>Faltam {faltam} caractere{faltam !== 1 ? "s" : ""} no motivo.</p>}
          </div>

          {/* Decisão do dono (28/09): "tem que ser todos" — sem opção. */}
          <p data-testid="aviso-nova-aprovacao" style={{ margin: 0, display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", borderRadius: R.md, background: TOM.info.bg, border: `1px solid ${TOM.info.border}`, color: TOM.info.text, fontSize: letra(13), lineHeight: 1.45 }}>
            <strong style={{ whiteSpace: "nowrap" }}>Nova aprovação:</strong>
            <span>todos os patrocinadores aprovam a arte nova — inclusive quem já tinha aprovado a anterior.</span>
          </p>

          {patrocinadores.length > 1 && (
            <div>
              <p style={{ margin: "0 0 6px", fontSize: letra(FS.small), fontWeight: FW.forte, color: T.apoio }}>Só as peças com estes patrocinadores (opcional)</p>
              <div role="group" aria-label="Filtrar por patrocinador" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {patrocinadores.map(([id, nome]) => {
                  const ativo = soDoPatrocinador.includes(id);
                  return (
                    <button key={id} type="button" aria-pressed={ativo} style={chip(ativo)} data-testid={`filtro-patrocinador-devolver-${id}`}
                      onClick={() => setSoDoPatrocinador((l) => ativo ? l.filter((x) => x !== id) : [...l, id])}>{nome}</button>
                  );
                })}
              </div>
            </div>
          )}

          <div data-testid="lista-devolver-evento">
            <p style={{ margin: "0 0 6px", fontSize: letra(FS.small), fontWeight: FW.forte, color: T.apoio }}>
              Voltam para a Arte · {marcadas.length} de {visiveis.length}
            </p>
            {visiveis.length === 0 ? (
              <p style={{ margin: 0, fontSize: letra(13), color: T.second }}>Nenhuma peça deste evento pode voltar para a Arte agora.</p>
            ) : porEtapa.map(([etapa, lista]) => (
              <div key={etapa} style={{ marginBottom: 8 }}>
                <p style={{ margin: "6px 0 2px", fontSize: letra(FS.small), color: T.second }}>{etapa} · {lista.length}</p>
                {lista.map((p) => (
                  <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: isMobile ? 44 : 36, cursor: "pointer", fontSize: letra(13), color: T.text }}>
                    <input type="checkbox" checked={!desmarcadas.has(p.id)} onChange={() => alternar(p.id)} data-testid={`checkbox-devolver-${p.id}`}
                      style={{ width: 18, height: 18, flexShrink: 0, accentColor: T.text }} />
                    <span style={{ fontWeight: FW.forte, color: T.accentText, fontVariantNumeric: "tabular-nums" }}>{p.displayId}</span>
                    <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{p.type}{p.description && p.description !== p.type ? ` — ${p.description}` : ""}</span>
                    {(() => {
                      const s = situacaoParaVoltarAArte(p);
                      const selo = s.volta && s.destrava ? "será destravada" : s.volta && s.jaNaArte ? "já na Arte — recebe o motivo" : null;
                      return selo ? <span style={{ flexShrink: 0, marginLeft: "auto", padding: "2px 8px", borderRadius: R.pill, background: TOM.alerta.bg, color: TOM.alerta.text, fontSize: letra(FS.small), fontWeight: FW.forte, whiteSpace: "nowrap" }}>{selo}</span> : null;
                    })()}
                  </label>
                ))}
              </div>
            ))}
          </div>

          {deFora.size > 0 && (
            <details data-testid="de-fora-devolver-evento">
              <summary style={{ cursor: "pointer", minHeight: 32, fontSize: letra(FS.small), fontWeight: FW.forte, color: T.apoio }}>
                Ficam de fora · {Array.from(deFora.values()).reduce((n, l) => n + l.length, 0)}
              </summary>
              {Array.from(deFora.entries()).map(([grupo, lista]) => (
                <p key={grupo} style={{ margin: "6px 0 0", fontSize: letra(FS.small), color: T.second, lineHeight: 1.45 }}>
                  <strong style={{ color: T.text }}>{ROTULO_DE_FORA[grupo]} ({lista.length}):</strong> {lista.map((p) => p.displayId).join(", ")}
                </p>
              ))}
            </details>
          )}
        </div>

        <ModalFooter style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
          <Botao tamanho={isMobile ? "toque" : "md"} onClick={fechar} disabled={enviando} style={isMobile ? { flex: "1 1 0%" } : undefined}>Cancelar</Botao>
          <Botao variante="perigo" tamanho={isMobile ? "toque" : "md"} icone={RotateCcw} onClick={devolver} disabled={!pode} carregando={enviando}
            data-testid="button-confirmar-devolver-evento" style={isMobile ? { flex: "2 1 0%" } : undefined}>
            Devolver {marcadas.length} peça{marcadas.length !== 1 ? "s" : ""} para a Arte
          </Botao>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
