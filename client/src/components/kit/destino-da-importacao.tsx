// ─────────────────────────────────────────────────────────────────────────────
// ARENA OU KIT? (dono, 14/09): "na hora de importar tinha que ter algum modal
// antes para sinalizar que é Arena ou Kit".
//
// Abre ao clicar em "Importar N peças". Arena = lista do evento. Kit = as peças
// entram no KIT DO EVENTO — uma inclusão só (dono, 23/10: "seria tudo a mesma
// inclusão, e ele não precisaria colocar as datas"): a primeira planilha cria o
// Kit, as seguintes acrescentam peças a ele. Sem formulário de datas: o Kit
// segue os prazos do evento a partir da Aprovação de layout. O usuário do Kit
// só importa peça do Kit.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { FileSpreadsheet, Package, Warehouse } from "lucide-react";
import type { CabecalhoDoKit } from "@shared/kit";
import type { AbaComPecasDaPlanilha } from "@shared/api";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalFooter, ModalHeader, modalSurface } from "@/components/modal-shell";
import { alvo, useIsMobile, usePonteiroGrosso } from "@/hooks/use-mobile";
import { T, FS, R, N, TOM, FW } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";

/** O que a planilha do Kit leva para a inclusão (o resto do cabeçalho é ignorado). */
export type DadosDoKitNaImportacao = { solicitante: string | null; departamento: string | null };

export type DestinoDaImportacao =
  | { tipo: "arena" }
  | { tipo: "kit"; kit: DadosDoKitNaImportacao };

/** A frase do Kit que já existe: "O Kit deste evento já tem 10 peças — estas 3 entram junto." */
export function fraseDoKitExistente(pecasNoKit: number, quantidade: number): string {
  const entram = `${quantidade === 1 ? "esta peça entra" : `estas ${quantidade} entram`} junto`;
  return pecasNoKit > 0
    ? `O Kit deste evento já tem ${pecasNoKit} ${pecasNoKit === 1 ? "peça" : "peças"} — ${entram}.`
    : `Primeira inclusão do Kit neste evento.`;
}

export function DestinoDaImportacaoDialog({ aberto, quantidade, arquivo, pecasNoKit, cabecalho, somenteKit, abas = [], onTrocarAba, pendente, onConfirmar, onFechar }: {
  aberto: boolean;
  quantidade: number;
  arquivo: string;
  /** Quantas peças o Kit do evento já tem (as que a pessoa vê). */
  pecasNoKit: number;
  cabecalho: CabecalhoDoKit | null;
  /** Usuário do Kit: Arena não é opção. */
  somenteKit: boolean;
  /** As abas com peças da pasta (21/10) e a troca da aba lida. */
  abas?: AbaComPecasDaPlanilha[];
  onTrocarAba?: (nome: string) => void;
  pendente: boolean;
  onConfirmar: (destino: DestinoDaImportacao) => void;
  onFechar: () => void;
}) {
  const isMobile = useIsMobile();
  /** Dedo (celular OU tablet do galpão): manda no TAMANHO do alvo, só nele. */
  const dedo = usePonteiroGrosso() || isMobile;
  const [tipo, setTipo] = useState<"arena" | "kit" | null>(null);

  // Cada abertura: planilha do Kit (ou usuário do Kit) já começa em Kit; o
  // resto começa sem escolha — a pessoa precisa dizer.
  useEffect(() => {
    if (!aberto) return;
    setTipo(cabecalho || somenteKit ? "kit" : null);
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const falta = tipo === null ? "Escolha se as peças são da Arena ou do Kit" : null;

  // A aba lida é a do outro destino? (Kit ← aba Arena; Arena ← aba KIT.)
  const lida = abas.find((a) => a.lida);
  const certa = tipo === "kit" ? abas.find((a) => a.doKit) : tipo === "arena" ? abas.find((a) => !a.doKit) : undefined;
  const abaErrada = lida && certa && certa.nome !== lida.nome && lida.doKit !== (tipo === "kit") ? { lida: lida.nome, certa } : null;

  const confirmar = () => {
    if (falta || pendente) return;
    if (tipo === "arena") return onConfirmar({ tipo: "arena" });
    onConfirmar({ tipo: "kit", kit: { solicitante: cabecalho?.solicitante ?? null, departamento: cabecalho?.departamento ?? null } });
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
          border: `2px solid ${ativo ? cor : T.border}`, background: bloqueio ? N.n2 : ativo ? `${cor}0f` : T.surface, opacity: bloqueio ? 0.6 : 1 }}>
        <Icone size={20} color={bloqueio ? T.second : cor} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          <span style={{ display: "block", fontSize: FS.strong, fontWeight: FW.rotulo, color: T.text }}>{titulo}</span>
          <span style={{ display: "block", fontSize: FS.body, color: T.apoio, marginTop: 2, lineHeight: 1.4 }}>{bloqueio ?? texto}</span>
        </span>
      </button>
    );
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !pendente) onFechar(); }}>
      <DialogContent data-testid="dialog-destino-importacao" className={HIDE_NATIVE_CLOSE} style={modalSurface(620)}>
        <DialogTitle className="sr-only">Estas peças são da Arena ou do Kit?</DialogTitle>
        <DialogDescription className="sr-only">{quantidade} peças da planilha {arquivo}</DialogDescription>
        <ModalHeader icon={FileSpreadsheet} tint={T.text} title="Estas peças são da Arena ou do Kit?" subtitle={`${quantidade} ${quantidade === 1 ? "peça" : "peças"}${arquivo ? ` · ${arquivo}` : ""}`} onClose={pendente ? undefined : onFechar} />

        <div style={{ padding: isMobile ? 16 : "16px 24px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
          <div role="radiogroup" aria-label="Destino das peças" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {cartao({ valor: "arena", titulo: "Arena", texto: "Lista do evento.", icone: Warehouse, cor: T.accentText,
              bloqueio: somenteKit ? "Usuário do Kit importa só peças do Kit." : undefined })}
            {cartao({ valor: "kit", titulo: "Kit", texto: "Entram no Kit do evento, com o selo KIT. Seguem os prazos do evento a partir da Aprovação de layout.", icone: Package, cor: TOM.roxo.text })}
          </div>

          {/* PASTA COM AS ABAS "KIT" E "ARENA" (New Balance BSB, 21/10): as
              peças em revisão podem ser da aba do OUTRO destino. Kit com as
              peças da aba Arena (ou Arena com as da aba KIT) é engano — o
              aviso diz de qual aba elas são e lê a certa num clique. */}
          {abaErrada && (
            <div data-testid="aviso-aba-do-destino" role="status" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: FS.body, color: TOM.alerta.text, background: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: R.md, padding: "8px 12px", lineHeight: 1.45 }}>
              <span style={{ flex: "1 1 260px" }}>
                {`Estas ${quantidade} ${quantidade === 1 ? "peça é" : "peças são"} da aba “${abaErrada.lida}”. A aba “${abaErrada.certa.nome}” tem ${abaErrada.certa.pecas} ${abaErrada.certa.pecas === 1 ? "peça" : "peças"}${tipo === "kit" ? " do Kit" : ""}.`}
              </span>
              {onTrocarAba && (
                <Botao variante="secundario" tamanho="sm" data-testid="button-ler-aba-do-destino" onClick={() => onTrocarAba(abaErrada.certa.nome)} disabled={pendente}
                  style={{ minHeight: alvo(32, dedo), padding: "0 12px" }}>
                  {`Ler a aba ${abaErrada.certa.nome}`}
                </Botao>
              )}
            </div>
          )}

          {tipo === "kit" && (
            <p data-testid="aviso-kit-do-evento" style={{ margin: 0, fontSize: FS.body, color: TOM.roxo.text, background: TOM.roxo.bg, border: `1px solid ${TOM.roxo.border}`, borderRadius: R.md, padding: "8px 12px", lineHeight: 1.45 }}>
              {cabecalho ? `Planilha do Kit${cabecalho.evento ? ` (${cabecalho.evento})` : ""}${cabecalho.solicitante ? ` · ${cabecalho.solicitante}` : ""}. ` : ""}
              {fraseDoKitExistente(pecasNoKit, quantidade)}
            </p>
          )}
        </div>

        <ModalFooter>
          {/* Primário preto nos dois destinos (o roxo do Kit fica nos cartões
              de escolha, acima). Travado, o próprio RÓTULO diz o que falta —
              é o motivo visível, então o Botao não repete `motivo`. */}
          <Botao variante="primario" data-testid="button-confirmar-destino" disabled={!!falta} carregando={pendente} onClick={confirmar} title={falta ?? undefined}
            style={{ minHeight: 46, fontSize: FS.read, fontWeight: FW.rotulo }}>
            {pendente ? "Importando…" : falta ? falta : `Importar ${quantidade} ${quantidade === 1 ? "peça" : "peças"} ${tipo === "kit" ? "no Kit" : "da Arena"}`}
          </Botao>
          <Botao variante="fantasma" onClick={onFechar} disabled={pendente} style={{ minHeight: 40 }}>
            Voltar à revisão
          </Botao>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
