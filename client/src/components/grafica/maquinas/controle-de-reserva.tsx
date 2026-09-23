// ─────────────────────────────────────────────────────────────────────────────
// MÁQUINAS DA GRÁFICA — reservar impressora (e "Imprimir agora") numa linha da
// fila geral.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from "react";
import { Play } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { T, FS, FW, R } from "@/lib/theme";
import { rotuloDaMaquina } from "@shared/fluxo-peca";
import { AMBAR, VERMELHO } from "./constantes";
import { impressorasComLivresPrimeiro, perguntaDaTroca } from "./regras";
import type { OcupacaoDasImpressoras, OcupanteDaImpressora } from "./tipos";

const SEM_OCUPACAO: OcupacaoDasImpressoras = {};

/**
 * "Reservar": impressora + QUANTIDADE — além de reservar, dá para direcionar a
 * quantidade e para qual impressora vai. A quantidade nasce com tudo o que
 * ainda está sem impressora; reservar menos deixa o resto na fila geral, para
 * outra impressora.
 */
export function ControleDeReserva({ id, codigoDaPeca, semImpressora, disabled, alvo, isMobile, ocupacao = SEM_OCUPACAO, imprimindo = false, onReservar, onImprimir, onTrocar }: {
  id: string; codigoDaPeca?: string | null; semImpressora: number; disabled?: boolean; alvo: number; isMobile: boolean;
  ocupacao?: OcupacaoDasImpressoras; /** O "Imprimir agora" DESTA linha está em voo. */ imprimindo?: boolean;
  onReservar: (maquina: string, quantidade: number) => void;
  /** "Imprimir agora": põe direto em impressão, sem modal. Ausente = só reservar. */
  onImprimir?: (maquina: string, quantidade: number) => void;
  /** Impressora ocupada: tirar a peça atual e imprimir esta no lugar (troca por prioridade). */
  onTrocar?: (maquina: string, quantidade: number, sai: OcupanteDaImpressora) => void;
}) {
  const [maquina, setMaquina] = useState("");
  const [qtd, setQtd] = useState<number | "">("");
  // Impressora ocupada pede uma confirmação leve, aqui mesmo na linha.
  const [confirmando, setConfirmando] = useState(false);
  // Enter segurado / duplo clique: a trava por ref vale antes do próximo render.
  const travaRef = useRef(false);
  const n = qtd === "" ? semImpressora : qtd;
  const valida = n >= 1 && n <= semImpressora;
  const ocupada = !!maquina && (ocupacao[maquina]?.n ?? 0) > 0;
  const atual = ocupada ? ocupacao[maquina]?.atual ?? null : null;
  const gesto = (fazer: () => void) => {
    if (!maquina || !valida || travaRef.current || imprimindo) return;
    travaRef.current = true;
    setTimeout(() => { travaRef.current = false; }, 1500);
    setConfirmando(false);
    fazer();
  };
  // UMA PEÇA POR VEZ: com a impressora ocupada não há "imprimir junto".
  const imprimir = () => { if (onImprimir && !ocupada) gesto(() => onImprimir(maquina, n)); };
  const trocar = () => { if (onTrocar && atual) gesto(() => onTrocar(maquina, n, atual)); };
  const campo: React.CSSProperties = { minHeight: alvo, height: alvo, boxSizing: "border-box", borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, color: T.text, fontSize: isMobile ? 16 : 12, fontWeight: FW.forte };
  // Rótulo dos botões da linha: 13 no celular, 12 na linha densa do desktop.
  const letra = isMobile ? 13 : 12;
  // O motivo dos botões apagados, À VISTA (não só no `title`, que o dedo não lê).
  // A ocupada já tem a linha própria logo abaixo. Sem impressora escolhida, o
  // próprio seletor ("Impressora…") já pede a escolha — o aviso só aparece
  // quando a pessoa começou pela quantidade, para não repetir em cada linha da fila.
  const motivoApagado = disabled ? null
    : !valida ? `A quantidade vai de 1 a ${semImpressora}.`
    : !maquina && qtd !== "" ? "Escolha a impressora para reservar ou imprimir."
    : null;
  return (
    <div role="group" aria-label="Reservar impressora" data-testid={`controle-reserva-${id}`} style={{ display: isMobile ? "flex" : "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", ...(isMobile ? { flex: "1 1 100%", width: "100%" } : {}) }}>
      <select aria-label="Impressora" value={maquina} disabled={disabled} onChange={(e) => { setMaquina(e.target.value); setConfirmando(false); }} data-testid={`reservar-fila-${id}`} style={{ ...campo, padding: "0 8px", cursor: disabled ? "not-allowed" : "pointer", maxWidth: "100%", ...(isMobile ? { flex: "1 1 100%", width: "100%" } : {}) }}>
        <option value="">Impressora…</option>
        {impressorasComLivresPrimeiro(ocupacao).map((m) => (
          <option key={m} value={m}>{rotuloDaMaquina(m)}{onImprimir ? ((ocupacao[m]?.n ?? 0) > 0 ? ` — imprimindo ${ocupacao[m].primeira ?? ocupacao[m].n}` : " — livre") : ""}</option>
        ))}
      </select>
      <input
        type="number" inputMode="numeric" pattern="[0-9]*" min={1} max={semImpressora}
        value={qtd} placeholder={String(semImpressora)} disabled={disabled}
        onChange={(e) => setQtd(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0))}
        aria-label={`Quantas das ${semImpressora} un. reservar (vazio = todas)`}
        aria-invalid={!valida || undefined}
        title={valida ? undefined : `De 1 a ${semImpressora}`}
        data-testid={`qtd-reservar-${id}`}
        style={{ ...campo, width: 68, textAlign: "center", padding: "0 6px", borderColor: valida ? T.bdark : VERMELHO.border, ...(isMobile ? { flex: "0 0 84px", width: 84 } : {}) }}
      />
      {onImprimir && (
        <Botao
          variante="primario"
          icone={Play}
          carregando={imprimindo}
          disabled={disabled || imprimindo || !maquina || !valida || ocupada}
          onClick={imprimir}
          data-testid={`button-imprimir-agora-${id}`}
          title={!maquina ? "Escolha a impressora" : ocupada ? `${rotuloDaMaquina(maquina)} está com ${ocupacao[maquina]?.primeira ?? "outra peça"}` : !valida ? `De 1 a ${semImpressora}` : `Pôr ${n} un. em impressão na ${rotuloDaMaquina(maquina)} agora`}
          style={{ minHeight: alvo, padding: "0 12px", fontSize: letra, ...(isMobile ? { flex: "1 1 100%", width: "100%", order: -1 } : {}) }}
        >
          {imprimindo ? "Iniciando…" : "Imprimir agora"}
        </Botao>
      )}
      <Botao
        variante="secundario"
        disabled={disabled || !maquina || !valida}
        onClick={() => { if (maquina && valida) { onReservar(maquina, n); setQtd(""); setMaquina(""); setConfirmando(false); } }}
        data-testid={`button-reservar-${id}`}
        title={!maquina ? "Escolha a impressora" : !valida ? `De 1 a ${semImpressora}` : `Reservar ${n} un. para a ${rotuloDaMaquina(maquina)}`}
        style={{ minHeight: alvo, padding: "0 12px", border: `1px solid ${T.bdark}`, color: T.text, fontSize: letra, ...(isMobile ? { flex: "1 1 auto" } : {}) }}
      >
        Reservar
      </Botao>
      {ocupada && onImprimir && (
        <div data-testid={`ocupada-${id}`} style={{ flex: "1 1 100%", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: isMobile ? 12 : FS.small, color: AMBAR.text }}>
          <span role="status" style={{ flex: "1 1 200px", fontWeight: FW.forte }}>
            {rotuloDaMaquina(maquina)} está com {ocupacao[maquina]?.primeira ?? "outra peça"} — dá para reservar, ou imprimir esta no lugar.
          </span>
          {onTrocar && atual && !confirmando && (
            <Botao variante="secundario" disabled={disabled || imprimindo || !valida} onClick={() => setConfirmando(true)} data-testid={`button-imprimir-no-lugar-${id}`} style={{ minHeight: alvo, padding: "0 12px", border: `1px solid ${T.text}`, color: T.text, fontSize: letra, ...(isMobile ? { flex: "1 1 100%" } : {}) }}>
              Imprimir esta no lugar
            </Botao>
          )}
        </div>
      )}
      {motivoApagado && (
        <span role="status" data-testid={`motivo-reserva-${id}`} style={{ flex: "1 1 100%", fontSize: isMobile ? 12 : FS.small, color: valida ? T.apoio : AMBAR.text, lineHeight: 1.4 }}>
          {motivoApagado}
        </span>
      )}
      {confirmando && ocupada && atual && (
        <div role="alertdialog" aria-label="Trocar a peça da impressora" data-testid={`confirmar-troca-${id}`} style={{ flex: "1 1 100%", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 10px", borderRadius: R.md, background: AMBAR.bg, border: `1px solid ${AMBAR.border}`, color: AMBAR.text, fontSize: isMobile ? 13 : 12, lineHeight: 1.45 }}>
          <span style={{ flex: "1 1 240px", fontWeight: FW.forte }}>{perguntaDaTroca(atual, codigoDaPeca ?? null, maquina)}</span>
          <Botao variante="primario" disabled={disabled || imprimindo} onClick={trocar} data-testid={`button-trocar-${id}`} style={{ minHeight: alvo, padding: "0 14px", fontSize: letra, ...(isMobile ? { flex: "1 1 100%" } : {}) }}>Trocar</Botao>
          <Botao variante="secundario" onClick={() => setConfirmando(false)} data-testid={`button-cancelar-troca-${id}`} style={{ minHeight: alvo, padding: "0 12px", fontSize: letra, ...(isMobile ? { flex: "1 1 100%" } : {}) }}>Cancelar</Botao>
        </div>
      )}
    </div>
  );
}
