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
import { Camera, Check, ChevronRight, ImagePlus, Truck, X } from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";
import { SugestaoRecebedor } from "@/components/sugestao-recebedor";
import { remainingConfer } from "@/lib/saldo";
import { useAcompanharAreaVisivel } from "@/components/grafica/area-visivel";
import { T, N, TOM, FS, FW, FONT, R } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import type { PecaDaFila } from "@/components/grafica/tipos";
// Só LEITURA do saldo, para dizer quantas unidades a entrega leva: a rota
// entrega o que resta conferido quando não recebe `qty` — o número mostrado é
// essa mesma conta, da mesma fonte da lista.
import { remainingDeliver as saldoAEntregar } from "@/lib/saldo";

export interface GalpaoDados { photoUrl: string; qty?: number; receivedBy?: string }

interface Props {
  mode: "confer" | "deliver";
  itens: PecaDaFila[];
  /** Recebe quantas peças foram registradas — o resumo de saída é de quem monta. */
  onClose: (feitas: number) => void;
  /** Confirma UMA peça no servidor; lança em erro (a mensagem aparece aqui). */
  onConfirmar: (item: PecaDaFila, dados: GalpaoDados) => Promise<void>;
  /** Último "quem recebeu" desta sessão — oferecido como atalho, NUNCA pré-preenchido. */
  sugestaoRecebedor?: string;
}

const dataCurta = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }) : null;

export function GalpaoFila({ mode, itens, onClose, onConfirmar, sugestaoRecebedor = "" }: Props) {
  const isConfer = mode === "confer";
  const tinta = isConfer ? TOM.ciano.text : TOM.sucesso.text;

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
  // Teclado aberto em "Quem recebeu": a fila encolhe para a área visível e o
  // rodapé (Pular / Entregar) sobe junto — antes ficava atrás do teclado.
  useAcompanharAreaVisivel(caixaRef, "tela-cheia", true);
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
  const filaRef = useRef<PecaDaFila[]>(itens);
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
    } catch (e) {
      // O erro fica NA tela, colado no botão — toast por cima de quem está
      // com o material na mão passa despercebido.
      // Quem confirma pode lançar qualquer coisa: lê só a mensagem, se houver.
      setErro((e as { message?: string } | null | undefined)?.message ?? "Não foi possível registrar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  };

  const saldo = saldoVivo;
  const arte = item.approvalThumbUrl || item.finalPreviewUrl || null;

  // Enquanto não dá para confirmar, o botão fica CINZA e legível (não só
  // apagado a 50%): "Falta a foto" é a instrução, e precisa ser lida.
  const confirmarPronto = !!foto && !enviando && !jaRegistradaPorOutro;

  return (
    <div
      ref={caixaRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={isConfer ? "Conferência em fila" : "Entrega em fila"}
      data-testid="galpao-fila"
      style={{
        position: "fixed", inset: 0, zIndex: 180, backgroundColor: T.bg,
        display: "flex", flexDirection: "column", outline: "none",
      }}
    >
      {/* ── topo: progresso + sair ──
          Recorte seguro em cima (notch/ilha no iPhone deitado ou com o app na
          tela inicial) e dos lados (paisagem), nos LONGOS: o atalho `padding`
          com env() some no parser do jsdom e o teste deixaria de enxergá-lo. */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 10, rowGap: 0, paddingTop: "calc(4px + env(safe-area-inset-top))", paddingBottom: 4, paddingLeft: "calc(12px + env(safe-area-inset-left))", paddingRight: "calc(4px + env(safe-area-inset-right))", borderBottom: `1px solid ${T.border}`, backgroundColor: T.surface, flexShrink: 0 }}>
        <span style={{ fontSize: FS.meta, fontWeight: FW.forte, color: tinta, display: "inline-flex", alignItems: "center", gap: 6 }}>
          {isConfer ? <Check style={{ width: 15, height: 15 }} /> : <Truck style={{ width: 15, height: 15 }} />}
          {isConfer ? "Conferindo" : "Entregando"}
        </span>
        <span data-testid="galpao-progresso" style={{ fontSize: FS.strong, fontWeight: FW.rotulo, color: T.text, fontVariantNumeric: "tabular-nums" }}>
          {idx + 1} de {fila.length}
        </span>
        {feitas > 0 && (
          <span style={{ fontSize: FS.meta, fontWeight: FW.medio, color: T.apoio, fontVariantNumeric: "tabular-nums" }}>
            · {feitas} registrada{feitas !== 1 ? "s" : ""}
          </span>
        )}
        {puladas > 0 && (
          <span data-testid="galpao-puladas" title="As peças puladas continuam na lista da Gráfica" style={{ fontSize: FS.meta, fontWeight: FW.medio, color: T.apoio, fontVariantNumeric: "tabular-nums" }}>
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
          className="ds-botao ds-botao-fantasma"
          style={{ width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: R.md, background: "transparent", cursor: "pointer", color: T.apoio }}>
          <X aria-hidden="true" style={{ width: 22, height: 22 }} />
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
        style={{ height: 4, backgroundColor: T.border, flexShrink: 0 }}
      >
        <div style={{ height: "100%", width: `${((idx + 1) / fila.length) * 100}%`, backgroundColor: tinta, transition: "width 0.25s ease-out" }} />
      </div>

      {/* Faixa do "registrou" — região viva sempre montada (o leitor de tela
          só anuncia mudança dentro de uma região que já existia). A entrada
          desliza só para quem não pediu movimento reduzido. */}
      <style>{`@media (prefers-reduced-motion: no-preference) { .galpao-registrou { animation: galpao-registrou-in 180ms ease-out; } } @keyframes galpao-registrou-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }`}</style>
      {/* SOBREPOSTA, altura zero: a faixa entrava NO FLUXO e empurrava a peça
          36px para baixo justo quando o dedo ia para a câmera da próxima —
          toque errado garantido. Agora flutua sobre o topo da peça e some. */}
      <div aria-live="polite" data-testid="galpao-registrou" style={{ position: "relative", height: 0, zIndex: 2 }}>
        {registrouAgora && (
          <div className="galpao-registrou" style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", backgroundColor: TOM.sucesso.bg, borderBottom: `1px solid ${TOM.sucesso.border}`, color: TOM.sucesso.text, fontSize: FS.read, fontWeight: FW.forte, boxShadow: "0 4px 12px -6px rgba(21,128,61,0.35)" }}>
            <Check aria-hidden="true" style={{ width: 16, height: 16 }} />
            {registrouAgora}{fila[idx] ? " — próxima peça" : ""}
          </div>
        )}
      </div>

      {/* ── a peça ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", paddingTop: 14, paddingBottom: 8, paddingLeft: "calc(14px + env(safe-area-inset-left))", paddingRight: "calc(14px + env(safe-area-inset-right))", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Texto neutro: a peça sai da lista viva também quando é devolvida
            para a Revisão ou muda de recorte — afirmar "outra pessoa conferiu"
            seria mentira nesses casos. E some durante o PRÓPRIO envio: o eco
            do WebSocket pode chegar antes da resposta HTTP. */}
        {jaRegistradaPorOutro && !enviando && (
          <div role="status" data-testid="galpao-ja-registrada" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: R.lg, backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, color: TOM.alerta.text, fontSize: FS.body, fontWeight: FW.medio, lineHeight: 1.4 }}>
            <span style={{ flex: 1 }}>
              Esta peça saiu da fila depois que ela abriu — já foi {isConfer ? "conferida" : "entregue"} ou mudou de etapa. Nada a fazer aqui.
            </span>
            <Botao variante="primario" tamanho="toque" onClick={pular}>
              Pular
            </Botao>
          </div>
        )}
        <div>
          {/* 30px: é o número que se confere contra a etiqueta do material, de
              braço esticado. Quebra antes do tipo, nunca no meio do código. */}
          <p style={{ margin: 0, fontFamily: FONT.display, fontSize: 30, fontWeight: 900, letterSpacing: "-0.02em", color: T.text, lineHeight: 1.15 }} data-testid="galpao-codigo">
            <span style={{ whiteSpace: "nowrap" }}>{item.displayId}</span> <span style={{ fontWeight: FW.forte, fontSize: FS.title, color: T.strong }}>· {item.type}</span>
          </p>
          {item.description && (
            <p style={{ margin: "2px 0 0", fontSize: FS.strong, color: T.strong, lineHeight: 1.4 }}>{item.description}</p>
          )}
          <p style={{ margin: "4px 0 0", fontSize: FS.body, color: T.apoio }}>
            {item.event?.name ?? "Sem evento"}
            {item.event?.truckDepartureDate && <> · saída <strong style={{ color: TOM.alerta.text }}>{dataCurta(item.event.truckDepartureDate)}</strong></>}
          </p>
        </div>

        {/* A arte grande — conferir É comparar o material com ela. */}
        {arte ? (
          // ALTURA RESERVADA (não maxHeight): a arte chegava depois e empurrava
          // a câmera para baixo do dedo. `clamp` com dvh: grande no retrato,
          // e em paisagem (≈360px de altura) não toma a tela inteira. Sem
          // `loading="lazy"`: está na primeira dobra por definição.
          <img decoding="async" src={miniatura(arte)} alt={`Arte da peça ${item.displayId}`}
            style={{ width: "100%", height: "clamp(120px, 32dvh, 320px)", flexShrink: 0, objectFit: "contain", borderRadius: R.lg, border: `1px solid ${T.border}`, backgroundColor: T.surface }} />
        ) : (
          <p style={{ margin: 0, padding: "14px 12px", fontSize: FS.body, color: T.second, backgroundColor: N.n2, borderRadius: R.lg }}>
            Esta peça não tem arte anexada — confira pela descrição.
          </p>
        )}

        {/* Quantidade (só conferência; entrega é sempre o total conferido) */}
        {isConfer && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.strong, flex: 1 }}>
              Conferidas agora
              <span style={{ display: "block", fontWeight: FW.corpo, fontSize: FS.body, color: T.apoio }}>
                faltam {saldo} de {item.quantity}
              </span>
            </span>
            <button type="button" aria-label="Uma a menos" data-testid="galpao-qty-menos" className="ds-botao"
              onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1}
              style={{ width: 52, height: 52, borderRadius: R.lg, border: `1px solid ${T.bdark}`, backgroundColor: T.surface, fontSize: FS.h2, fontWeight: FW.forte, color: qty <= 1 ? T.bdark : T.text, cursor: qty <= 1 ? "not-allowed" : "pointer" }}>−</button>
            <span data-testid="galpao-qty" style={{ minWidth: 44, textAlign: "center", fontFamily: FONT.display, fontSize: FS.h1, fontWeight: 900, color: T.text, fontVariantNumeric: "tabular-nums" }}>{qty}</span>
            <button type="button" aria-label="Uma a mais" data-testid="galpao-qty-mais" className="ds-botao"
              onClick={() => setQty((q) => Math.min(saldo ?? q, q + 1))} disabled={saldo != null && qty >= saldo}
              style={{ width: 52, height: 52, borderRadius: R.lg, border: `1px solid ${T.bdark}`, backgroundColor: T.surface, fontSize: FS.h2, fontWeight: FW.forte, color: saldo != null && qty >= saldo ? T.bdark : T.text, cursor: saldo != null && qty >= saldo ? "not-allowed" : "pointer" }}>+</button>
          </div>
        )}

        {/* Quantas unidades esta entrega leva — antes a fila não dizia, e quem
            estava com a pilha na mão não sabia se era a peça inteira. */}
        {!isConfer && (
          <p data-testid="galpao-qtd-entrega" style={{ margin: 0, fontSize: FS.body, color: T.strong }}>
            Entrega de <strong style={{ fontSize: FS.title, color: T.text, fontVariantNumeric: "tabular-nums" }}>{saldoAEntregar(vivo ?? item)} un.</strong>
            <span style={{ color: T.second }}> — tudo o que já foi conferido desta peça</span>
          </p>
        )}

        {/* Quem recebeu (só entrega) */}
        {!isConfer && (
          <label style={{ display: "block" }}>
            <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.strong }}>
              Quem recebeu <span style={{ fontWeight: FW.corpo, color: T.second }}>(opcional — fica para as próximas)</span>
            </span>
            {/* 16px: com 15 o iOS dava zoom na página inteira ao tocar. */}
            <input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} data-testid="galpao-recebido-por"
              placeholder="Nome de quem assinou"
              autoComplete="off" autoCapitalize="words" enterKeyHint="done"
              style={{ width: "100%", marginTop: 6, height: 48, borderRadius: R.md, border: `1px solid ${T.bdark}`, padding: "0 12px", fontSize: FS.lead, fontFamily: "inherit", color: T.text, backgroundColor: T.surface, boxSizing: "border-box" }} />
          </label>
        )}
        {!isConfer && (
          <SugestaoRecebedor nome={sugestaoRecebedor} atual={receivedBy} onUsar={setReceivedBy} />
        )}

        {/* A foto — o primeiro dos dois toques */}
        {foto ? (
          <div style={{ position: "relative", alignSelf: "flex-start" }}>
            <img loading="lazy" decoding="async" src={miniatura(foto)} alt="Foto registrada" style={{ height: 96, borderRadius: R.lg, border: `2px solid ${tinta}` }} />
            {/* Alvo de 44px (área invisível) em volta do X visível de 32 — o
                botão colado na miniatura era menor que a ponta do dedo. */}
            <button type="button" aria-label="Tirar outra foto" data-testid="galpao-refazer-foto"
              onClick={() => setFoto(null)}
              style={{ position: "absolute", top: -14, right: -14, width: 44, height: 44, borderRadius: "50%", border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
              <span style={{ width: 32, height: 32, borderRadius: "50%", backgroundColor: T.dark, color: T.surface, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X style={{ width: 14, height: 14 }} />
              </span>
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 2.2 }}>
              {/* min-h: durante o envio o conteúdo vira "Enviando x%" (uma
                  linha) e o botão encolhia, mudando tudo de lugar sob o dedo. */}
              <ObjectUploader capture maxFileSize={10485760} buttonVariant="ghost" buttonClassName="w-full h-full min-h-[88px] p-0 border-0 hover:bg-transparent"
                onComplete={(r) => { setFoto(r.url); setErro(null); }}
                onError={(e) => setErro(e.message)}>
                <div data-testid="galpao-camera" style={{ width: "100%", padding: "22px 0", backgroundColor: tinta, borderRadius: R.lg, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <Camera aria-hidden="true" style={{ width: 28, height: 28, color: T.surface }} />
                  <span style={{ fontSize: FS.lead, fontWeight: FW.rotulo, color: T.surface }}>Tirar foto</span>
                </div>
              </ObjectUploader>
            </div>
            <div style={{ flex: 1 }}>
              <ObjectUploader maxFileSize={10485760} buttonVariant="ghost" buttonClassName="w-full h-full min-h-[88px] p-0 border-0 hover:bg-transparent"
                onComplete={(r) => { setFoto(r.url); setErro(null); }}
                onError={(e) => setErro(e.message)}>
                <div style={{ width: "100%", padding: "22px 0", backgroundColor: N.n2, borderRadius: R.lg, border: `2px dashed ${T.bdark}`, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <ImagePlus aria-hidden="true" style={{ width: 22, height: 22, color: T.apoio }} />
                  <span style={{ fontSize: FS.read, fontWeight: FW.forte, color: T.strong }}>Galeria</span>
                </div>
              </ObjectUploader>
            </div>
          </div>
        )}
        {/* POR QUE A FOTO — dito antes do toque. O motivo vivia no `title` do
            Confirmar cinza, que no celular ninguém lê. Enquanto a foto sobe, o
            próprio botão da câmera mostra "Enviando…" com o percentual. */}
        {!foto && (
          <p style={{ margin: "-4px 0 0", fontSize: FS.body, color: T.apoio, lineHeight: 1.4 }}>
            {isConfer
              ? "Foto obrigatória: é o registro de que a peça foi conferida."
              : "Foto obrigatória: é o comprovante de que o material foi entregue."}
          </p>
        )}

        {erro && (
          <p data-testid="galpao-erro" role="alert" style={{ margin: 0, padding: "10px 12px", fontSize: FS.read, fontWeight: FW.medio, color: TOM.perigo.text, backgroundColor: TOM.perigo.bg, border: `1px solid ${TOM.perigo.border}`, borderRadius: R.lg }}>
            {erro}
            {/* O Confirmar continua habilitado com a foto: tocar nele de novo
                É o "tentar de novo". A frase diz isso em vez de deixar a dúvida. */}
            {foto && !jaRegistradaPorOutro && <span style={{ display: "block", marginTop: 2, fontWeight: FW.corpo, color: TOM.perigo.text }}>A foto continua anexada — toque no botão abaixo para tentar de novo.</span>}
          </p>
        )}
      </div>

      {/* ── rodapé: o segundo toque ── */}
      {/* Zona do polegar: Pular e Confirmar embaixo, com o recorte seguro do
          home indicator e dos lados (paisagem) nos LONGOS. */}
      <div style={{ flexShrink: 0, paddingTop: 10, paddingBottom: "calc(12px + env(safe-area-inset-bottom))", paddingLeft: "calc(14px + env(safe-area-inset-left))", paddingRight: "calc(14px + env(safe-area-inset-right))", borderTop: `1px solid ${T.border}`, backgroundColor: T.surface, display: "flex", gap: 12 }}>
        <Botao variante="secundario" tamanho="toque" onClick={pular} data-testid="galpao-pular"
          title="Deixar para depois — a peça continua na lista"
          style={{ height: 56, padding: "0 16px", borderRadius: R.lg, border: `1px solid ${T.bdark}`, color: T.strong, gap: 6 }}>
          Pular <ChevronRight aria-hidden="true" style={{ width: 16, height: 16 }} />
        </Botao>
        {/* A cor do modo (ciano conferir, verde entregar) fica: é o que diz de
            relance em qual fila a pessoa está. */}
        <Botao variante="primario" tamanho="toque" onClick={confirmar} disabled={!foto || enviando} carregando={enviando} data-testid="galpao-confirmar"
          title={!foto ? "A foto é obrigatória — é o registro da conferência/entrega." : undefined}
          style={{
            flex: 1, height: 56, borderRadius: R.lg,
            backgroundColor: confirmarPronto ? tinta : T.border,
            border: `1px solid ${confirmarPronto ? tinta : T.border}`,
            color: confirmarPronto ? T.surface : T.apoio,
            // Cinza já diz "não dá"; a opacidade de desabilitado do Botao
            // deixaria "Falta a foto" ilegível.
            opacity: 1,
            fontSize: FS.lead, fontWeight: FW.rotulo, fontFamily: FONT.display,
            letterSpacing: "-0.01em", gap: 8,
          }}>
          {enviando ? "Registrando…"
            : jaRegistradaPorOutro ? "Já registrada"
            : !foto ? "Falta a foto"
            : isConfer ? `Conferir ${qty} un.`
            : `Entregar ${saldoAEntregar(vivo ?? item)} un.`}
        </Botao>
      </div>
    </div>
  );
}
