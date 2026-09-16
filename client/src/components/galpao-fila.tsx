// ─────────────────────────────────────────────────────────────────────────────
// MODO GALPÃO — conferir/entregar em fila, uma peça por vez, no celular.
// (Sugestão 19 da análise de evolução; prioridade do dono: "a Gráfica usa
// muito o celular, tem que ser bem bom no mobile".)
//
// A conferência acontece com o material numa mão e o telefone na outra. A
// tela da Gráfica funciona no celular, mas cobra o preço do desktop: achar a
// linha na tabela, abrir o modal, mirar em botões de mouse — 85 peças vezes
// cada toque a mais. Este modo inverte o desenho: a FILA dirige, não a lista.
//
//  · UMA peça por vez, em tela cheia: a arte grande para bater com o material,
//    o código enorme para conferir de relance.
//  · DOIS toques no caminho feliz: [câmera] → [confirmar]. A quantidade já vem
//    preenchida com o saldo (lib/saldo, a mesma conta da lista) e só é tocada
//    na exceção. Confirmar avança sozinho para a próxima.
//  · A ORDEM é a da lista ("fila do dia": saída do caminhão mais próxima
//    primeiro) — o que o operador vê aqui é o que a tela já mostrava, sem uma
//    segunda ordenação para divergir.
//  · Na ENTREGA, quem recebeu fica preenchido de uma peça para a outra: o
//    caminhão é um só, quem assina costuma ser a mesma pessoa.
//  · Foto obrigatória nos dois modos — é a regra do servidor, dita aqui antes
//    do toque, não depois como erro.
//
// O que este modo NÃO faz, de propósito: produzir, reaproveitar, devolver,
// complemento. Exceção é trabalho de bancada — a lista continua lá para isso.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { miniatura } from "@/lib/miniatura";
import { Camera, Check, ChevronRight, ImagePlus, Loader2, Truck, X } from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";
import { SugestaoRecebedor } from "@/components/sugestao-recebedor";
import { remainingConfer } from "@/lib/saldo";
// Só LEITURA do saldo, para dizer quantas unidades a entrega leva: a rota
// entrega o que resta conferido quando não recebe `qty` — o número mostrado é
// essa mesma conta, da mesma fonte da lista.
import { remainingDeliver as saldoAEntregar } from "@/lib/saldo";

export interface GalpaoDados { photoUrl: string; qty?: number; receivedBy?: string }

interface Props {
  mode: "confer" | "deliver";
  itens: any[];
  /** Recebe quantas peças foram registradas — o resumo de saída é de quem monta. */
  onClose: (feitas: number) => void;
  /** Confirma UMA peça no servidor; lança em erro (a mensagem aparece aqui). */
  onConfirmar: (item: any, dados: GalpaoDados) => Promise<void>;
  /** Último "quem recebeu" desta sessão — oferecido como atalho, NUNCA pré-preenchido. */
  sugestaoRecebedor?: string;
}

const dataCurta = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }) : null;

export function GalpaoFila({ mode, itens, onClose, onConfirmar, sugestaoRecebedor = "" }: Props) {
  const isConfer = mode === "confer";
  const tinta = isConfer ? "#0e7490" : "#15803d";

  const [idx, setIdx] = useState(0);
  const [foto, setFoto] = useState<string | null>(null);
  const [qty, setQty] = useState(0);
  // Quem recebe assina o caminhão inteiro — o nome atravessa as peças.
  // Só as DESTA fila. Entre filas, não: a fila abre VAZIA e o nome da anterior
  // aparece só como atalho de um toque (SugestaoRecebedor). Abrir com ele
  // preenchido gravava um recebedor que ninguém digitou nesta entrega.
  const [receivedBy, setReceivedBy] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feitas, setFeitas] = useState(0);
  // PULADAS — "se eu pular, perco a peça?". Não: ela continua na lista da
  // Gráfica. O contador no topo diz quantas ficaram para depois.
  const [puladas, setPuladas] = useState(0);
  // Espelhos em ref para o atalho de teclado (Esc) ler o valor ATUAL sem
  // reassinar o listener a cada foto ou envio.
  const feitasRef = useRef(0);
  feitasRef.current = feitas;
  const enviandoRef = useRef(false);
  enviandoRef.current = enviando;
  const caixaRef = useRef<HTMLDivElement>(null);
  // FOCO E ESC. A fila é um diálogo em tela cheia (aria-modal), mas o foco
  // ficava no botão da lista que a abriu, ATRÁS dela — Tab andava pela tela
  // escondida. Ao abrir, o foco entra na fila; ao sair, volta para quem abriu.
  // Esc sai (com o resumo do que já foi feito), exceto durante um envio: sair
  // no meio do POST deixaria a contagem do toast sem a última peça.
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    caixaRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || enviandoRef.current) return;
      e.preventDefault();
      onClose(feitasRef.current);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      anterior?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Confirmação entre uma peça e a próxima. A fila avança sozinha, e sem este
  // aviso a tela simplesmente TROCAVA de peça: quem está com o material na mão
  // não sabia se o toque registrou ou se a tela pulou. Some em 2,4 s.
  const [registrouAgora, setRegistrouAgora] = useState<string | null>(null);
  useEffect(() => {
    if (!registrouAgora) return;
    const t = setTimeout(() => setRegistrouAgora(null), 2400);
    return () => clearTimeout(t);
  }, [registrouAgora]);
  // A fila é a foto do momento de abertura: confirmar muda o status da peça e
  // uma lista viva a REMOVERIA sob o dedo, pulando a seguinte sem aviso.
  const filaRef = useRef<any[]>(itens);
  const fila = filaRef.current;
  const item = fila[idx];

  // …mas a VERDADE da peça vem da lista viva. Esta é a tela em que duas
  // pessoas trabalham a mesma fila: se o colega da bancada conferiu/entregou a
  // peça depois que a fila abriu, ela sai de `itens` (WebSocket/polling). A
  // ordem continua sendo a da foto; o saldo e o "já foi feita" são os de agora.
  const vivo = item ? itens.find((i) => i.id === item.id) : undefined;
  const jaRegistradaPorOutro = !!item && !vivo;
  const saldoVivo = item && isConfer ? remainingConfer(vivo ?? item) : null;

  // Cada peça nova zera o que é DA peça (foto, erro) e repõe o saldo dela.
  useEffect(() => {
    setFoto(null);
    setErro(null);
    if (item && isConfer) setQty(remainingConfer(item));
  }, [idx, item, isConfer]);

  // Saldo encolheu por baixo (conferência parcial do colega): a quantidade
  // escolhida nunca fica acima do que ainda falta.
  // `idx` também: a peça seguinte pode ter o MESMO saldo vivo da anterior e,
  // só com `saldoVivo`, o teto não rodava — a quantidade ficava a da foto.
  useEffect(() => {
    if (saldoVivo != null && saldoVivo > 0) setQty((q) => Math.min(q, saldoVivo));
  }, [saldoVivo, idx]);

  if (!item) return null;

  const avancar = (totalFeitas: number) => {
    if (idx + 1 < fila.length) setIdx(idx + 1);
    else onClose(totalFeitas);
  };
  const pular = () => {
    if (!jaRegistradaPorOutro) setPuladas((p) => p + 1);
    avancar(feitas);
  };

  const confirmar = async () => {
    if (!foto || enviando) return;
    if (jaRegistradaPorOutro) {
      setErro("Esta peça saiu da fila depois que ela abriu. Toque em Pular para seguir.");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      await onConfirmar(item, {
        photoUrl: foto,
        ...(isConfer ? { qty } : { receivedBy: receivedBy.trim() || undefined }),
      });
      // `feitas + 1` na mão, não o estado: o setState ainda não aplicou e o
      // fechamento da última peça levaria a contagem velha para o resumo.
      const totalFeitas = feitas + 1;
      setFeitas(totalFeitas);
      setRegistrouAgora(isConfer ? `${item.displayId} conferida · ${qty} un.` : `${item.displayId} entregue`);
      avancar(totalFeitas);
    } catch (e: any) {
      // O erro fica NA tela, colado no botão — toast por cima de quem está
      // com o material na mão passa despercebido.
      setErro(e?.message ?? "Não foi possível registrar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  };

  const saldo = saldoVivo;
  const arte = item.approvalThumbUrl || item.finalPreviewUrl || null;

  return (
    <div
      ref={caixaRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={isConfer ? "Conferência em fila" : "Entrega em fila"}
      data-testid="galpao-fila"
      style={{
        position: "fixed", inset: 0, zIndex: 180, backgroundColor: "#fafaf9",
        display: "flex", flexDirection: "column", outline: "none",
      }}
    >
      {/* ── topo: progresso + sair ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid #e7e5e4", backgroundColor: "#ffffff" }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: tinta, textTransform: "uppercase", letterSpacing: "0.06em", display: "inline-flex", alignItems: "center", gap: 6 }}>
          {isConfer ? <Check style={{ width: 15, height: 15 }} /> : <Truck style={{ width: 15, height: 15 }} />}
          {isConfer ? "Conferindo" : "Entregando"}
        </span>
        <span data-testid="galpao-progresso" style={{ fontSize: 13, fontWeight: 700, color: "#44403c", fontVariantNumeric: "tabular-nums" }}>
          {idx + 1} de {fila.length}
        </span>
        {feitas > 0 && (
          <span style={{ fontSize: 12, fontWeight: 600, color: "#57534e", fontVariantNumeric: "tabular-nums" }}>
            · {feitas} registrada{feitas !== 1 ? "s" : ""}
          </span>
        )}
        {puladas > 0 && (
          <span data-testid="galpao-puladas" title="As peças puladas continuam na lista da Gráfica" style={{ fontSize: 12, fontWeight: 600, color: "#57534e", fontVariantNumeric: "tabular-nums" }}>
            · {puladas} pulada{puladas !== 1 ? "s" : ""}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {/* Sair não desfaz nada: o que foi registrado JÁ está no servidor
            (cada Confirmar grava na hora). O rótulo responde a dúvida. */}
        <button type="button" onClick={() => onClose(feitas)}
          aria-label={feitas > 0 ? `Sair da fila — as ${feitas} registradas ficam salvas` : "Sair da fila"}
          title={feitas > 0 ? "Sair — o que já foi registrado fica salvo" : "Sair da fila"}
          data-testid="galpao-sair"
          style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", cursor: "pointer", color: "#78716c" }}>
          <X style={{ width: 20, height: 20 }} />
        </button>
      </div>

      {/* PROGRESSO VISÍVEL — "7 de 40" em texto pequeno não se lê de relance com
          a peça na mão; a barra se lê. Avança ao CONFIRMAR ou PULAR (é a posição
          na fila, não o total registrado, que já tem o próprio contador). A
          transição some sozinha com prefers-reduced-motion (regra global). */}
      <div
        role="progressbar"
        aria-label="Posição na fila"
        aria-valuemin={1}
        aria-valuemax={fila.length}
        aria-valuenow={idx + 1}
        style={{ height: 4, backgroundColor: "#e7e5e4", flexShrink: 0 }}
      >
        <div style={{ height: "100%", width: `${((idx + 1) / fila.length) * 100}%`, backgroundColor: tinta, transition: "width 0.25s ease-out" }} />
      </div>

      {/* Faixa do "registrou" — região viva sempre montada (o leitor de tela
          só anuncia mudança dentro de uma região que já existia). A entrada
          desliza só para quem não pediu movimento reduzido. */}
      <style>{`@media (prefers-reduced-motion: no-preference) { .galpao-registrou { animation: galpao-registrou-in 180ms ease-out; } } @keyframes galpao-registrou-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }`}</style>
      <div aria-live="polite" data-testid="galpao-registrou">
        {registrouAgora && (
          <div className="galpao-registrou" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", backgroundColor: "#f0fdf4", borderBottom: "1px solid #bbf7d0", color: "#15803d", fontSize: 13, fontWeight: 700 }}>
            <Check aria-hidden="true" style={{ width: 16, height: 16 }} />
            {registrouAgora}{fila[idx] ? " — próxima peça" : ""}
          </div>
        )}
      </div>

      {/* ── a peça ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 8px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Texto neutro: a peça sai da lista viva também quando é devolvida
            para a Revisão ou muda de recorte — afirmar "outra pessoa conferiu"
            seria mentira nesses casos. E some durante o PRÓPRIO envio: o eco
            do WebSocket pode chegar antes da resposta HTTP. */}
        {jaRegistradaPorOutro && !enviando && (
          <div role="status" data-testid="galpao-ja-registrada" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, backgroundColor: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
            <span style={{ flex: 1 }}>
              Esta peça saiu da fila depois que ela abriu — já foi {isConfer ? "conferida" : "entregue"} ou mudou de etapa. Nada a fazer aqui.
            </span>
            <button type="button" onClick={pular}
              style={{ minHeight: 44, padding: "0 14px", borderRadius: 10, border: "none", backgroundColor: "#92400e", color: "#ffffff", fontSize: 13, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>
              Pular
            </button>
          </div>
        )}
        <div>
          <p style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em", color: "#1c1917" }} data-testid="galpao-codigo">
            {item.displayId} <span style={{ fontWeight: 700, fontSize: 18, color: "#44403c" }}>· {item.type}</span>
          </p>
          {item.description && (
            <p style={{ margin: "2px 0 0", fontSize: 14, color: "#57534e", lineHeight: 1.4 }}>{item.description}</p>
          )}
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#78716c" }}>
            {item.event?.name ?? "Sem evento"}
            {item.event?.truckDepartureDate && <> · saída <strong style={{ color: "#b45309" }}>{dataCurta(item.event.truckDepartureDate)}</strong></>}
          </p>
        </div>

        {/* A arte grande — conferir É comparar o material com ela. */}
        {arte ? (
          <img loading="lazy" decoding="async" src={miniatura(arte)} alt={`Arte da peça ${item.displayId}`}
            style={{ width: "100%", maxHeight: "34vh", objectFit: "contain", borderRadius: 10, border: "1px solid #e7e5e4", backgroundColor: "#ffffff" }} />
        ) : (
          <p style={{ margin: 0, padding: "14px 12px", fontSize: 13, color: "#78716c", backgroundColor: "#f5f5f4", borderRadius: 10 }}>
            Esta peça não tem arte anexada — confira pela descrição.
          </p>
        )}

        {/* Quantidade (só conferência; entrega é sempre o total conferido) */}
        {isConfer && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#57534e", flex: 1 }}>
              Conferidas agora
              <span style={{ display: "block", fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 11.5, color: "#78716c" }}>
                faltam {saldo} de {item.quantity}
              </span>
            </span>
            <button type="button" aria-label="Uma a menos" data-testid="galpao-qty-menos"
              onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1}
              style={{ width: 52, height: 52, borderRadius: 10, border: "1px solid #d6d3d1", backgroundColor: "#fff", fontSize: 22, fontWeight: 700, color: qty <= 1 ? "#d6d3d1" : "#1c1917", cursor: qty <= 1 ? "not-allowed" : "pointer" }}>−</button>
            <span data-testid="galpao-qty" style={{ minWidth: 44, textAlign: "center", fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 900, color: "#1c1917", fontVariantNumeric: "tabular-nums" }}>{qty}</span>
            <button type="button" aria-label="Uma a mais" data-testid="galpao-qty-mais"
              onClick={() => setQty((q) => Math.min(saldo ?? q, q + 1))} disabled={saldo != null && qty >= saldo}
              style={{ width: 52, height: 52, borderRadius: 10, border: "1px solid #d6d3d1", backgroundColor: "#fff", fontSize: 22, fontWeight: 700, color: saldo != null && qty >= saldo ? "#d6d3d1" : "#1c1917", cursor: saldo != null && qty >= saldo ? "not-allowed" : "pointer" }}>+</button>
          </div>
        )}

        {/* Quantas unidades esta entrega leva — antes a fila não dizia, e quem
            estava com a pilha na mão não sabia se era a peça inteira. */}
        {!isConfer && (
          <p data-testid="galpao-qtd-entrega" style={{ margin: 0, fontSize: 13, color: "#44403c" }}>
            Entrega de <strong style={{ fontSize: 18, color: "#1c1917", fontVariantNumeric: "tabular-nums" }}>{saldoAEntregar(vivo ?? item)} un.</strong>
            <span style={{ color: "#78716c" }}> — tudo o que já foi conferido desta peça</span>
          </p>
        )}

        {/* Quem recebeu (só entrega) */}
        {!isConfer && (
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#57534e" }}>
              Quem recebeu <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#78716c" }}>(opcional — fica para as próximas)</span>
            </span>
            <input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} data-testid="galpao-recebido-por"
              placeholder="Nome de quem assinou"
              style={{ width: "100%", marginTop: 6, height: 48, borderRadius: 10, border: "1px solid #d6d3d1", padding: "0 12px", fontSize: 15, fontFamily: "inherit", color: "#1c1917", backgroundColor: "#ffffff", boxSizing: "border-box" }} />
          </label>
        )}
        {!isConfer && (
          <SugestaoRecebedor nome={sugestaoRecebedor} atual={receivedBy} onUsar={setReceivedBy} />
        )}

        {/* A foto — o primeiro dos dois toques */}
        {foto ? (
          <div style={{ position: "relative", alignSelf: "flex-start" }}>
            <img loading="lazy" decoding="async" src={miniatura(foto)} alt="Foto registrada" style={{ height: 96, borderRadius: 10, border: `2px solid ${tinta}` }} />
            {/* Alvo de 44px (área invisível) em volta do X visível de 32 — o
                botão colado na miniatura era menor que a ponta do dedo. */}
            <button type="button" aria-label="Tirar outra foto" data-testid="galpao-refazer-foto"
              onClick={() => setFoto(null)}
              style={{ position: "absolute", top: -14, right: -14, width: 44, height: 44, borderRadius: "50%", border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
              <span style={{ width: 32, height: 32, borderRadius: "50%", backgroundColor: "#1c1917", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X style={{ width: 14, height: 14 }} />
              </span>
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 2.2 }}>
              <ObjectUploader capture maxFileSize={10485760} buttonVariant="ghost" buttonClassName="w-full h-full p-0 border-0 hover:bg-transparent"
                onComplete={(r) => { setFoto(r.url); setErro(null); }}
                onError={(e) => setErro(e.message)}>
                <div data-testid="galpao-camera" style={{ width: "100%", padding: "22px 0", backgroundColor: tinta, borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <Camera style={{ width: 28, height: 28, color: "#ffffff" }} />
                  <span style={{ fontSize: 15, fontWeight: 800, color: "#ffffff" }}>Tirar foto</span>
                </div>
              </ObjectUploader>
            </div>
            <div style={{ flex: 1 }}>
              <ObjectUploader maxFileSize={10485760} buttonVariant="ghost" buttonClassName="w-full h-full p-0 border-0 hover:bg-transparent"
                onComplete={(r) => { setFoto(r.url); setErro(null); }}
                onError={(e) => setErro(e.message)}>
                <div style={{ width: "100%", padding: "22px 0", backgroundColor: "#f4f3f0", borderRadius: 12, border: "2px dashed #d6d3d1", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <ImagePlus style={{ width: 22, height: 22, color: "#78716c" }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#57534e" }}>Galeria</span>
                </div>
              </ObjectUploader>
            </div>
          </div>
        )}
        {/* POR QUE A FOTO — dito antes do toque. O motivo vivia no `title` do
            Confirmar cinza, que no celular ninguém lê. Enquanto a foto sobe, o
            próprio botão da câmera mostra "Enviando…" com o percentual. */}
        {!foto && (
          <p style={{ margin: "-4px 0 0", fontSize: 12, color: "#57534e", lineHeight: 1.4 }}>
            {isConfer
              ? "Foto obrigatória: é o registro de que a peça foi conferida."
              : "Foto obrigatória: é o comprovante de que o material foi entregue."}
          </p>
        )}

        {erro && (
          <p data-testid="galpao-erro" role="alert" style={{ margin: 0, padding: "10px 12px", fontSize: 13, fontWeight: 600, color: "#b91c1c", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10 }}>
            {erro}
          </p>
        )}
      </div>

      {/* ── rodapé: o segundo toque ── */}
      <div style={{ padding: "10px 14px calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid #e7e5e4", backgroundColor: "#ffffff", display: "flex", gap: 10 }}>
        <button type="button" onClick={pular} data-testid="galpao-pular"
          title="Deixar para depois — a peça continua na lista"
          style={{ height: 56, padding: "0 16px", borderRadius: 12, border: "1px solid #d6d3d1", backgroundColor: "#ffffff", color: "#57534e", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
          Pular <ChevronRight style={{ width: 16, height: 16 }} />
        </button>
        <button type="button" onClick={confirmar} disabled={!foto || enviando} data-testid="galpao-confirmar"
          title={!foto ? "A foto é obrigatória — é o registro da conferência/entrega." : undefined}
          style={{
            flex: 1, height: 56, borderRadius: 12, border: "none",
            backgroundColor: !foto || enviando || jaRegistradaPorOutro ? "#e7e5e4" : tinta,
            color: !foto || enviando || jaRegistradaPorOutro ? "#57534e" : "#ffffff",
            fontSize: 16, fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif",
            letterSpacing: "-0.01em", cursor: !foto || enviando || jaRegistradaPorOutro ? "not-allowed" : "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
          {enviando && <Loader2 aria-hidden="true" className="animate-spin" style={{ width: 18, height: 18 }} />}
          {enviando ? "Registrando…"
            : jaRegistradaPorOutro ? "Já registrada"
            : !foto ? "Falta a foto"
            : isConfer ? `Conferir ${qty} un.`
            : `Entregar ${saldoAEntregar(vivo ?? item)} un.`}
        </button>
      </div>
    </div>
  );
}
