// ─────────────────────────────────────────────────────────────────────────────
// ARENA OU KIT? (dono, 14/09): "na hora de importar tinha que ter algum modal
// antes para sinalizar que é Arena ou Kit".
//
// Abre ao clicar em "Importar N peças". Arena = lista do evento, com as datas
// da Arena. Kit = uma remessa com as datas do Kit: nova (preenchida com o
// cabeçalho da planilha do Kit, quando ela tem) ou uma que já existe. O
// usuário do Kit só importa peça do Kit.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { FileSpreadsheet, Package, Warehouse } from "lucide-react";
import { rotuloDaRemessa, type CabecalhoDoKit, type RemessaDoKit } from "@shared/kit";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalFooter, ModalHeader, modalSurface } from "@/components/modal-shell";
import { alvo, useIsMobile, usePonteiroGrosso } from "@/hooks/use-mobile";
import { T, FS, R } from "@/lib/theme";

export type NovaRemessaDoKit = {
  versao: string;
  solicitante: string | null;
  departamento: string | null;
  dataSolicitacao: string | null;
  entregaMaterial: string;
  dataEvento: string | null;
  cargaCaminhao: string | null;
  saidaCaminhao: string | null;
  arquivo: string | null;
};

export type DestinoDaImportacao =
  | { tipo: "arena" }
  | { tipo: "remessa"; kitRemessaId: string }
  | { tipo: "nova"; kitNovaRemessa: NovaRemessaDoKit };

const ROTULO: React.CSSProperties = { display: "block", fontSize: FS.small, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#57534e", marginBottom: 5 };
const CAMPO: React.CSSProperties = { width: "100%", boxSizing: "border-box", height: 38, padding: "0 10px", borderRadius: R.md, border: "1px solid #d6d3d1", background: "#fff", fontSize: 14, color: T.text, fontFamily: "inherit" };

export function DestinoDaImportacaoDialog({ aberto, quantidade, arquivo, remessas, cabecalho, somenteKit, pendente, onConfirmar, onFechar }: {
  aberto: boolean;
  quantidade: number;
  arquivo: string;
  remessas: RemessaDoKit[];
  cabecalho: CabecalhoDoKit | null;
  /** Usuário do Kit: Arena não é opção. */
  somenteKit: boolean;
  pendente: boolean;
  onConfirmar: (destino: DestinoDaImportacao) => void;
  onFechar: () => void;
}) {
  const isMobile = useIsMobile();
  /** Dedo (celular OU tablet do galpão): manda no TAMANHO do alvo, só nele. */
  const dedo = usePonteiroGrosso() || isMobile;
  const [tipo, setTipo] = useState<"arena" | "kit" | null>(null);
  const [modoKit, setModoKit] = useState<"nova" | "remessa">("nova");
  const [remessaId, setRemessaId] = useState("");
  const [nova, setNova] = useState({ versao: "V1", solicitante: "", entregaMaterial: "", dataEvento: "", cargaCaminhao: "", saidaCaminhao: "" });

  // Cada abertura: planilha do Kit (ou usuário do Kit) já começa em Kit, com o
  // cabeçalho lido; o resto começa sem escolha — a pessoa precisa dizer.
  useEffect(() => {
    if (!aberto) return;
    setTipo(cabecalho || somenteKit ? "kit" : null);
    setModoKit(cabecalho || remessas.length === 0 ? "nova" : "remessa");
    setRemessaId(remessas[0]?.id ?? "");
    setNova({
      versao: cabecalho?.versao || `V${remessas.length + 1}`,
      solicitante: cabecalho?.solicitante || "",
      entregaMaterial: cabecalho?.entregaMaterial || "",
      dataEvento: cabecalho?.dataEvento || "",
      cargaCaminhao: cabecalho?.cargaCaminhao || "",
      saidaCaminhao: cabecalho?.saidaCaminhao || "",
    });
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const falta = tipo === null ? "Escolha se as peças são da Arena ou do Kit"
    : tipo === "kit" && modoKit === "nova" && !nova.versao.trim() ? "Informe a versão da remessa"
    : tipo === "kit" && modoKit === "nova" && !nova.entregaMaterial ? "Informe a data de entrega do material"
    : tipo === "kit" && modoKit === "remessa" && !remessaId ? "Escolha a remessa do Kit"
    : null;

  const confirmar = () => {
    if (falta || pendente) return;
    if (tipo === "arena") return onConfirmar({ tipo: "arena" });
    if (modoKit === "remessa") return onConfirmar({ tipo: "remessa", kitRemessaId: remessaId });
    onConfirmar({
      tipo: "nova",
      kitNovaRemessa: {
        versao: nova.versao.trim(),
        solicitante: nova.solicitante.trim() || null,
        departamento: cabecalho?.departamento || "Kit",
        dataSolicitacao: cabecalho?.dataSolicitacao || null,
        entregaMaterial: nova.entregaMaterial,
        dataEvento: nova.dataEvento || null,
        cargaCaminhao: nova.cargaCaminhao || null,
        saidaCaminhao: nova.saidaCaminhao || null,
        arquivo: arquivo || null,
      },
    });
  };

  // FUNÇÃO, e não componente (`<Cartao />`). Declarado dentro do render, um
  // componente é um TIPO novo a cada render: escolher "Kit" pelo teclado
  // re-renderizava, o React desmontava o botão e o foco caía no <body> — a
  // pessoa perdia o lugar no meio do formulário. Chamado como função, o botão
  // é o mesmo elemento e o foco fica onde estava.
  const cartao = ({ valor, titulo, texto, icone: Icone, cor, bloqueio }: { valor: "arena" | "kit"; titulo: string; texto: string; icone: typeof Package; cor: string; bloqueio?: string }) => {
    const ativo = tipo === valor;
    return (
      <button key={valor} type="button" role="radio" aria-checked={ativo} disabled={!!bloqueio} onClick={() => setTipo(valor)}
        data-testid={`destino-importacao-${valor}`} title={bloqueio}
        style={{ flex: "1 1 220px", textAlign: "left", display: "flex", gap: 10, alignItems: "flex-start", padding: "14px 14px", borderRadius: R.lg, cursor: bloqueio ? "not-allowed" : "pointer",
          border: `2px solid ${ativo ? cor : "#e7e5e4"}`, background: bloqueio ? "#f5f5f4" : ativo ? `${cor}0f` : "#fff", opacity: bloqueio ? 0.6 : 1 }}>
        <Icone size={20} color={bloqueio ? T.second : cor} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: T.text }}>{titulo}</span>
          <span style={{ display: "block", fontSize: FS.body, color: "#57534e", marginTop: 2, lineHeight: 1.4 }}>{bloqueio ?? texto}</span>
        </span>
      </button>
    );
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !pendente) onFechar(); }}>
      <DialogContent data-testid="dialog-destino-importacao" className={HIDE_NATIVE_CLOSE} style={modalSurface(620)}>
        <DialogTitle className="sr-only">Estas peças são da Arena ou do Kit?</DialogTitle>
        <DialogDescription className="sr-only">{quantidade} peças da planilha {arquivo}</DialogDescription>
        <ModalHeader icon={FileSpreadsheet} tint="#1c1917" title="Estas peças são da Arena ou do Kit?" subtitle={`${quantidade} ${quantidade === 1 ? "peça" : "peças"}${arquivo ? ` · ${arquivo}` : ""}`} onClose={pendente ? undefined : onFechar} />

        <div style={{ padding: isMobile ? 16 : "16px 24px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
          <div role="radiogroup" aria-label="Destino das peças" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {cartao({ valor: "arena", titulo: "Arena", texto: "Lista do evento, com as datas da Arena.", icone: Warehouse, cor: "#c2410c",
              bloqueio: somenteKit ? "Usuário do Kit importa só peças do Kit." : undefined })}
            {cartao({ valor: "kit", titulo: "Kit", texto: "Remessa do Kit, com as datas do Kit (entrega do material e caminhão).", icone: Package, cor: "#6d28d9" })}
          </div>

          {cabecalho && (
            <p data-testid="aviso-planilha-kit" style={{ margin: 0, fontSize: FS.body, color: "#5b21b6", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: R.md, padding: "8px 12px", lineHeight: 1.45 }}>
              Planilha do Kit{cabecalho.evento ? ` (${cabecalho.evento})` : ""}: as datas e a versão abaixo vieram do cabeçalho — confira antes de importar.
            </p>
          )}

          {tipo === "kit" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14, border: "1px solid #ddd6fe", borderRadius: R.lg, background: "#faf5ff" }}>
              {remessas.length > 0 && (
                <div role="radiogroup" aria-label="Remessa do Kit" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {([["nova", "Nova remessa"], ["remessa", "Remessa que já existe"]] as const).map(([valor, rotulo]) => (
                    <button key={valor} type="button" role="radio" aria-checked={modoKit === valor} onClick={() => setModoKit(valor)} data-testid={`modo-kit-${valor}`}
                      style={{ height: alvo(34, dedo), padding: "0 12px", borderRadius: R.pill, border: `1px solid ${modoKit === valor ? "#6d28d9" : "#ddd6fe"}`, background: modoKit === valor ? "#6d28d9" : "#fff", color: modoKit === valor ? "#fff" : "#5b21b6", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
                      {rotulo}
                    </button>
                  ))}
                </div>
              )}
              {modoKit === "remessa" && remessas.length > 0 ? (
                <div>
                  <label htmlFor="destino-remessa" style={ROTULO}>Remessa do Kit</label>
                  <select id="destino-remessa" value={remessaId} onChange={(e) => setRemessaId(e.target.value)} data-testid="select-destino-remessa" style={{ ...CAMPO, cursor: "pointer" }}>
                    {remessas.map((r) => <option key={r.id} value={r.id}>{rotuloDaRemessa(r)}</option>)}
                  </select>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr" }}>
                  <div>
                    <label htmlFor="destino-versao" style={ROTULO}>Versão</label>
                    <input id="destino-versao" data-testid="input-destino-versao" value={nova.versao} onChange={(e) => setNova((n) => ({ ...n, versao: e.target.value }))} style={CAMPO} />
                  </div>
                  <div>
                    <label htmlFor="destino-solicitante" style={ROTULO}>Solicitante</label>
                    <input id="destino-solicitante" value={nova.solicitante} onChange={(e) => setNova((n) => ({ ...n, solicitante: e.target.value }))} style={CAMPO} />
                  </div>
                  <div>
                    <label htmlFor="destino-entrega" style={ROTULO}>Entrega do material</label>
                    <input id="destino-entrega" data-testid="input-destino-entrega" type="date" value={nova.entregaMaterial} onChange={(e) => setNova((n) => ({ ...n, entregaMaterial: e.target.value }))} style={CAMPO} />
                  </div>
                  <div>
                    <label htmlFor="destino-evento" style={ROTULO}>Data do evento</label>
                    <input id="destino-evento" type="date" value={nova.dataEvento} onChange={(e) => setNova((n) => ({ ...n, dataEvento: e.target.value }))} style={CAMPO} />
                  </div>
                  <div>
                    <label htmlFor="destino-carga" style={ROTULO}>Carga do caminhão</label>
                    <input id="destino-carga" type="date" value={nova.cargaCaminhao} onChange={(e) => setNova((n) => ({ ...n, cargaCaminhao: e.target.value }))} style={CAMPO} />
                  </div>
                  <div>
                    <label htmlFor="destino-saida" style={ROTULO}>Saída do caminhão</label>
                    <input id="destino-saida" data-testid="input-destino-saida" type="date" value={nova.saidaCaminhao} onChange={(e) => setNova((n) => ({ ...n, saidaCaminhao: e.target.value }))} style={CAMPO} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <ModalFooter>
          <button type="button" data-testid="button-confirmar-destino" disabled={!!falta || pendente} onClick={confirmar} title={falta ?? undefined}
            style={{ height: 46, borderRadius: R.md, border: "none", fontSize: 14, fontWeight: 800, cursor: falta ? "not-allowed" : "pointer",
              background: falta || pendente ? "#e7e5e4" : tipo === "kit" ? "#6d28d9" : "#1c1917", color: falta || pendente ? T.second : "#fff" }}>
            {pendente ? "Importando…" : falta ? falta : `Importar ${quantidade} ${quantidade === 1 ? "peça" : "peças"} ${tipo === "kit" ? "do Kit" : "da Arena"}`}
          </button>
          <button type="button" onClick={onFechar} disabled={pendente}
            style={{ height: 40, borderRadius: R.md, border: "none", background: "transparent", color: "#57534e", fontSize: FS.body, fontWeight: 700, cursor: "pointer" }}>
            Voltar à revisão
          </button>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
