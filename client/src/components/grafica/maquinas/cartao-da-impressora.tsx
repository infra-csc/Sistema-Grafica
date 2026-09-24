// ─────────────────────────────────────────────────────────────────────────────
// MÁQUINAS DA GRÁFICA — o cartão de cada impressora na aba Agora: a peça que
// está nela (com as ações do mesmo modal da fila) e a fila reservada para ela.
// ─────────────────────────────────────────────────────────────────────────────
import { useContext, useState, type Dispatch, type SetStateAction } from "react";
import { Link } from "wouter";
import { ArrowLeftRight, ArrowRight, ChevronDown, ChevronRight, ExternalLink, Play, Printer } from "lucide-react";
import { alvo as alvoDe } from "@/hooks/use-mobile";
import { Botao } from "@/components/ui/botao";
import { BarraDeImpressao, progressoDaImpressao, rotuloCurtoDaAcao, horaDeInicio } from "@/components/grafica/modal-impressao";
import { miniatura } from "@/lib/miniatura";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { T, FS, FW, R } from "@/lib/theme";
import { rotuloDaMaquina } from "@shared/fluxo-peca";
import { nomeDaPeca } from "@shared/nome-da-peca";
import { fraseDaTrava } from "@shared/trava-da-peca";
import { eventoBarraImpressas } from "@shared/impressao-dividida";
import { numerosDaImpressao, linkDaPecaNaGrafica, linkDaImpressoraNaGrafica } from "@shared/progresso-da-impressao";
import { AMBAR, IMP, LIVRE, ROTULO_MICRO, TITULO, VERMELHO } from "./constantes";
import { ToqueContext } from "./contexto";
import { Pilula, SeletorDeReserva, SeloDePrazo, TituloDaPeca } from "./pedacos";
import {
  apoioDaPeca, haQuanto, motivoBloqueio, motivoImpressoraOcupada, ordenarFila, pecaParaOModal, perguntaDaTroca, plural, prazoDaPeca, rotuloDoDia, seloDaPecaNaMaquina,
} from "./regras";
import type { Maquina, OcupacaoDasImpressoras, OcupanteDaImpressora, PecaNaFila, PecaNaMaquina } from "./tipos";

/** Celular: quantas peças da fila de UM cartão ficam à vista antes do "Ver as N". */
const FILA_DO_CARTAO_NO_CELULAR = 3;
/** Desktop: passa disso, o cartão ganha "Ver as N da fila" — um cartão não vira parede ao lado de um "Livre". */
const FILA_DO_CARTAO_NO_DESKTOP = 5;

// ─── A peça reservada, dentro do cartão da impressora ─────────────────────────
// (Uma impressora pode ter mais de uma peça ao mesmo tempo — "Imprimindo 2" —
// então iniciar nunca é barrado por ela estar ocupada.)
export function PecaNaFilaDoCartao({ p, podeAgir, hojeMs, isMobile, proxima = false, ocupante = null, mexendo = false, onTrocar, onIniciar, onReservar }: {
  p: PecaNaFila; podeAgir: boolean; hojeMs: number; isMobile: boolean; /** Impressora LIVRE: esta é a próxima a entrar — o Iniciar ganha destaque. */ proxima?: boolean;
  /** A peça que OCUPA a impressora agora: com ela, a fila não inicia (uma por vez) — só troca por prioridade. */
  ocupante?: OcupanteDaImpressora | null; /** Tirar/trocar em voo: sem segundo disparo. */ mexendo?: boolean; onTrocar?: (p: PecaNaFila, sai: OcupanteDaImpressora) => void; onIniciar: (p: PecaNaFila) => void; onReservar: (p: PecaNaFila, maquina: string | null, quantidade: number | null) => void;
}) {
  const ocupado = !!ocupante;
  const [confirmandoTroca, setConfirmandoTroca] = useState(false);
  // Quantas unidades estão reservadas PARA ESTA impressora; mover/devolver
  // aceita uma parte delas (campo ao lado do seletor; vazio = todas).
  const reservadas = p.reservadas ?? p.aImprimir;
  const [qtd, setQtd] = useState<number | "">("");
  const qtdValida = qtd === "" || (qtd >= 1 && qtd <= reservadas);
  const jaImprimindo = (p.imprimindoEm ?? []).filter((m) => m !== p.maquinaPrevista);
  const selo = seloDaPecaNaMaquina(p, hojeMs);
  const toque = useContext(ToqueContext) || isMobile;
  const alvo = alvoDe(34, toque);
  const letra = isMobile ? 13 : 12;
  const prazo = prazoDaPeca(p.saidaCaminhao, p.prazoProducaoGrafica);
  // Celular: com várias peças na fila, Iniciar + quantidade + select por peça
  // viravam uma parede (e a quantidade ao lado do Iniciar parecia ser DELE).
  // Iniciar fica à vista; "Mover…" abre a quantidade e o destino só da peça
  // tocada. No desktop continua tudo na linha.
  const [moverAberto, setMoverAberto] = useState(false);
  const mostrarMover = !isMobile || moverAberto;
  const idMover = `mover-painel-${p.id}`;
  return (
    <div data-testid={`peca-na-fila-${p.id}`} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 0", borderTop: `1px solid ${T.low}` }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span style={{ flex: "1 1 140px", minWidth: 0, display: "flex" }}>
          <TituloDaPeca id={p.id} codigo={p.displayId} tipo={p.tipo} descricao={p.descricao} isMobile={isMobile} testId={`nome-fila-${p.id}`} />
        </span>
        <SeloDePrazo p={prazo} fonte={isMobile ? 12 : FS.small} />
      </div>
      <div style={{ fontSize: isMobile ? 12 : FS.small, color: T.second, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>
        {[p.pausadaEm ? "Pausada — volta primeiro" : null, p.evento, reservadas < p.aImprimir ? `${reservadas} de ${p.aImprimir} un.` : `${p.aImprimir} un.`, p.impressas > 0 ? `${p.impressas} de ${p.aImprimir} já impressas` : null, p.m2 != null ? `${p.m2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²` : null].filter(Boolean).join(" · ")}
      </div>
      {jaImprimindo.length > 0 && (
        <div data-testid={`ja-imprimindo-${p.id}`} style={{ fontSize: isMobile ? 12 : FS.small, color: IMP.text, fontWeight: FW.forte }}>
          {reservadas} un. na fila · peça já em impressão na {jaImprimindo.map((m) => rotuloDaMaquina(m)).join(" e na ")}
        </div>
      )}
      {podeAgir && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {/* IMPRESSORA OCUPADA (relato do dono, 24/09: "quando a fila está
              grande de uma impressora, está puxando todas"): cada peça da fila
              repetia o aviso "a impressora está com #X…" + um Iniciar
              desabilitado + "Imprimir esta no lugar" — três linhas por peça, e a
              fila virava parede. Agora o aviso sai UMA vez no topo da fila
              (CartaoDaImpressora) e a ação da peça é a que ela TEM: trocar. */}
          {ocupado && onTrocar && !selo ? (
            <Botao variante="secundario" icone={ArrowLeftRight} disabled={mexendo || confirmandoTroca} onClick={() => setConfirmandoTroca(true)} data-testid={`button-imprimir-no-lugar-fila-${p.id}`}
              title={`${motivoImpressoraOcupada(ocupante?.displayId ?? null)}. Tira a peça atual (as impressas ficam anotadas) e imprime esta no lugar.`}
              style={{ flex: isMobile ? "1 1 100%" : "1 1 130px", minHeight: alvo, padding: "0 12px", border: `1px solid ${T.text}`, color: T.text, fontSize: letra }}>
              Imprimir esta no lugar
            </Botao>
          ) : (
          <Botao
            // A PRÓXIMA da impressora livre é a ação do cartão (sólida); as outras, contorno escuro.
            variante={proxima && !selo ? "primario" : "secundario"}
            icone={Play}
            onClick={() => { if (!selo) onIniciar(p); }}
            disabled={!!selo || ocupado}
            data-testid={`button-iniciar-fila-${p.id}`}
            title={selo ? motivoBloqueio(selo, "iniciar impressão", p) : ocupado ? motivoImpressoraOcupada(ocupante?.displayId ?? null) : `Iniciar a impressão na ${rotuloDaMaquina(p.maquinaPrevista)}`}
            data-proxima={proxima || undefined}
            style={{ flex: isMobile ? "2 1 150px" : "1 1 130px", minHeight: alvo, padding: "0 10px", fontSize: letra, ...(proxima && !selo ? {} : { border: `1px solid ${selo || ocupado ? T.border : T.text}`, color: T.text }) }}
          >
            {proxima
              ? `Próxima: ${p.displayId ?? "peça"} · Iniciar ${reservadas} un.`
              : p.reservadas != null && reservadas < p.aImprimir ? `Iniciar ${reservadas} un.` : "Iniciar impressão"}
          </Botao>
          )}
          {isMobile && (
            <Botao
              variante="secundario"
              aria-expanded={moverAberto}
              aria-controls={idMover}
              onClick={() => setMoverAberto((v) => !v)}
              data-testid={`abrir-mover-fila-${p.id}`}
              style={{ flex: "1 1 104px", minHeight: alvo, padding: "0 10px", gap: 5, border: `1px solid ${T.bdark}`, background: moverAberto ? T.low : T.surface, color: T.text, fontSize: 13 }}
            >
              Mover…
              <ChevronDown aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0, transform: moverAberto ? "rotate(180deg)" : "none" }} />
            </Botao>
          )}
          {mostrarMover && (
          <div id={idMover} role="group" aria-label="Mover ou devolver" data-testid={idMover} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", ...(isMobile ? { flex: "1 1 100%", width: "100%" } : { flex: "0 1 auto" }) }}>
          {isMobile && reservadas > 1 && (
            <label htmlFor={`qtd-mover-${p.id}`} style={{ flex: "1 1 0%", minWidth: 0, fontSize: FS.meta, color: T.second, lineHeight: 1.3 }}>
              Quantas das {reservadas} un. (vazio = todas)
            </label>
          )}
          {reservadas > 1 && (
            <input
              id={`qtd-mover-${p.id}`}
              type="number" inputMode="numeric" pattern="[0-9]*" min={1} max={reservadas}
              value={qtd} placeholder={String(reservadas)}
              onChange={(e) => setQtd(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0))}
              aria-label={`Quantas das ${reservadas} un. mover ou devolver (vazio = todas)`}
              aria-invalid={!qtdValida || undefined}
              data-testid={`qtd-mover-fila-${p.id}`}
              style={{ width: isMobile ? 84 : 64, ...(isMobile ? { flex: "0 0 84px" } : {}), minHeight: alvo, height: alvo, boxSizing: "border-box", textAlign: "center", borderRadius: R.md, border: `1px solid ${qtdValida ? T.bdark : VERMELHO.border}`, background: T.surface, color: T.text, fontSize: isMobile ? 16 : 12, fontWeight: FW.forte, padding: "0 6px" }}
            />
          )}
          <SeletorDeReserva valor={p.maquinaPrevista} excluir={p.maquinaPrevista} disabled={!qtdValida || !!selo} alvo={alvo} isMobile={isMobile} testId={`mover-fila-${p.id}`} rotulo={qtd === "" ? "Mover para…" : `Mover ${qtd} para…`} onEscolher={(m) => onReservar(p, m, qtd === "" ? null : qtd)} />
          </div>
          )}
        </div>
      )}
      {/* BLOQUEADA (evento finalizado ou travada): nada de iniciar nem mover —
          mas DEVOLVER à fila geral é recuo e sempre passa: sem isto a peça
          ficava presa no topo da fila da impressora. */}
      {podeAgir && selo && (
        <Botao variante="secundario" onClick={() => onReservar(p, null, null)} data-testid={`button-devolver-fila-${p.id}`} title="Tirar esta peça da fila desta impressora — ela volta para a fila geral" style={{ alignSelf: isMobile ? "stretch" : "flex-start", minHeight: alvo, padding: "0 12px", border: `1px solid ${T.bdark}`, color: T.text, fontSize: letra }}>
          Devolver à fila geral
        </Botao>
      )}
      {/* Travada pela Solicitação: o MESMO selo da Gráfica, à vista (não só no title). */}
      {selo?.motivo === "travada" && (
        <div data-testid={`fila-travada-${p.id}`} title={fraseDaTrava(p)} style={{ fontSize: isMobile ? 12 : FS.small, fontWeight: FW.forte, color: selo.text, overflowWrap: "anywhere" }}>{selo.label}</div>
      )}
      {confirmandoTroca && ocupante && onTrocar && (
        <div role="alertdialog" aria-label="Trocar a peça da impressora" data-testid={`confirmar-troca-fila-${p.id}`} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 10px", borderRadius: R.md, background: AMBAR.bg, border: `1px solid ${AMBAR.border}`, color: AMBAR.text, fontSize: isMobile ? 13 : 12, lineHeight: 1.45 }}>
          <span style={{ flex: "1 1 200px", fontWeight: FW.forte }}>{perguntaDaTroca(ocupante, [p.displayId, `(${nomeDaPeca(p.tipo, p.descricao)})`].filter(Boolean).join(" "), p.maquinaPrevista ?? "")}</span>
          <Botao variante="primario" disabled={mexendo} onClick={() => { setConfirmandoTroca(false); onTrocar(p, ocupante); }} data-testid={`button-trocar-fila-${p.id}`} style={{ minHeight: alvo, padding: "0 14px", fontSize: letra, ...(isMobile ? { flex: "1 1 100%" } : {}) }}>Trocar</Botao>
          <Botao variante="secundario" onClick={() => setConfirmandoTroca(false)} style={{ minHeight: alvo, padding: "0 12px", fontSize: letra, ...(isMobile ? { flex: "1 1 100%" } : {}) }}>Cancelar</Botao>
        </div>
      )}
    </div>
  );
}

// ─── A peça dentro do cartão da impressora ────────────────────────────────────
export function PecaNoCartao({ p, agora, podeAgir, hojeMs, isMobile, onAgir, onTirar, mexendo = false, emFoco = false }: {
  /** Veio da Gráfica por esta peça (?item=): realce. */
  emFoco?: boolean;
  p: PecaNaMaquina; agora: number; podeAgir: boolean; hojeMs: number; isMobile: boolean; onAgir: (p: PecaNaMaquina, trocar: boolean) => void;
  /** "Tirar da impressora": pausa a peça (as impressas ficam anotadas; o resto volta para o topo da fila dela). */
  onTirar?: (p: PecaNaMaquina) => void;
  /** Um gesto de tirar/trocar está em voo: nada de segundo disparo. */
  mexendo?: boolean;
}) {
  // Dividida: o cartão mostra e age sobre a PARTE desta impressora.
  // (Vale também com UMA parte só: a peça que iniciou apenas a parte reservada
  // a esta impressora tem teto menor que a peça.)
  // Os números saem de numerosDaImpressao (shared) — a MESMA conta da linha
  // da Gráfica e do modal. Com a peça por partes, os da parte desta impressora.
  const n = numerosDaImpressao(pecaParaOModal(p), p.parte ? p.maquina : null);
  const dividida = n.daParte;
  const feitas = n.feitas;
  const teto = n.teto;
  const desde = haQuanto(p.desde, agora);
  const hora = horaDeInicio(p.desde);
  const selo = seloDaPecaNaMaquina(p, hojeMs);
  // INFORMAR IMPRESSAS no evento realizado (IMPRESSAS_EM_EVENTO_REALIZADO): a
  // peça já está na impressora, então o que sai dela segue sendo informado.
  // A trava da Solicitação e o encerrado à mão continuam barrando.
  const seloImpressas = selo && (selo.motivo === "travada" || eventoBarraImpressas(selo.motivo, "inProduction")) ? selo : null;
  const toque = useContext(ToqueContext) || isMobile;
  const alvo = alvoDe(34, toque);
  const letra = isMobile ? 13 : 12;
  const thumb = p.miniatura ? miniatura(convertGCSUrlToLocalPath(p.miniatura)) : undefined;
  const rotuloAcao = rotuloCurtoDaAcao(feitas, teto);
  const concluir = rotuloAcao !== "Impressas";
  // Parte desta impressora já esgotada (o servidor nem a manda mais como
  // "imprimindo"; guarda de um retrato antigo): sem ação de impressas.
  const parteEsgotada = dividida && feitas >= teto;
  const [semThumb, setSemThumb] = useState(false);
  // Celular: cada ação ocupa a linha inteira do cartão
  // — três alvos de 44px empilhados, a principal em cima, sem dois botões
  // disputando 330px. No desktop dividem a linha como antes.
  const largura = (desktop: string): React.CSSProperties => ({ flex: isMobile ? "1 1 100%" : desktop });

  return (
    <div data-testid={`peca-na-maquina-${p.id}`} data-em-foco={emFoco || undefined} style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 8, ...(emFoco ? { outline: `2px solid ${IMP.text}`, outlineOffset: 4, borderRadius: R.sm } : {}) }}>
      <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
        {/* A arte em miniatura: é o que o galpão reconhece de relance. */}
        <div aria-hidden="true" style={{ width: 48, height: 48, borderRadius: R.md, background: T.low, border: `1px solid ${T.border}`, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {thumb && !semThumb
            ? <img src={thumb} alt="" loading="lazy" decoding="async" onError={() => setSemThumb(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            : <Printer style={{ width: 16, height: 16, color: T.muted }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* "#0386 Placa de octanorme (..." não pode cortar:
              o nome quebra em até duas linhas e só então reticencia. */}
          <TituloDaPeca id={p.id} codigo={p.displayId} tipo={p.tipo} descricao={p.descricao} isMobile={isMobile} testId={`nome-peca-${p.id}`} />
          {(p.evento || apoioDaPeca(p)) && (
            <div title={[p.evento, apoioDaPeca(p)].filter(Boolean).join(" · ")} style={{ fontSize: isMobile ? 12 : FS.small, color: T.second, marginTop: 2, lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>
              {[p.evento, apoioDaPeca(p)].filter(Boolean).join(" · ")}
            </div>
          )}
          <div style={{ fontSize: isMobile ? 12 : FS.small, color: T.second, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
            {hora ? `Desde ${hora}` : "Na máquina"}{desde ? ` · ${desde}` : ""}
          </div>
        </div>
      </div>

      {/* Progresso: o número em palavras (o que se lê) e a barra (o que se vê de longe). */}
      <div>
        <div data-testid={`progresso-${p.id}`} style={{ fontSize: isMobile ? 12 : FS.small, fontWeight: FW.forte, color: IMP.text, fontVariantNumeric: "tabular-nums" }}>
          {dividida
            ? `${feitas} de ${teto} nesta impressora · peça ${n.feitasDaPeca} de ${n.tetoDaPeca} no total`
            : n.frase}
        </div>
        <BarraDeImpressao feitas={feitas} teto={teto} rotulo={`${p.displayId ?? "peça"}: ${feitas} de ${teto} impressas${dividida ? " nesta impressora" : ""}`} />
      </div>

      {/* Ações: a principal (o mesmo modal da fila), a troca de máquina
          e a volta para a Gráfica. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {podeAgir && !parteEsgotada && (
          <Botao
            variante="primario"
            icone={Play}
            onClick={() => { if (!seloImpressas) onAgir(p, false); }}
            disabled={!!seloImpressas}
            aria-describedby={seloImpressas ? `motivo-bloqueio-${p.id}` : undefined}
            data-testid={`button-impressas-${p.id}`}
            title={seloImpressas
              ? motivoBloqueio(seloImpressas, "informar impressas", p)
              : concluir ? `Todas as ${teto} saíram${dividida ? " desta impressora" : " — mandar a peça para o acabamento"}` : `Informar quantas já saíram da ${rotuloDaMaquina(p.maquina)} (${progressoDaImpressao(feitas, teto)})`}
            // O motivo do bloqueio já está à vista no parágrafo abaixo (motivo-bloqueio), ligado por aria-describedby.
            style={{ ...largura("1 1 140px"), minHeight: alvo, padding: "0 12px", fontSize: letra }}
          >
            {rotuloAcao}
          </Botao>
        )}
        {podeAgir && (
          <Botao
            variante="secundario"
            onClick={() => { if (!selo) onAgir(p, true); }}
            disabled={!!selo}
            aria-describedby={selo ? `motivo-bloqueio-${p.id}` : undefined}
            data-testid={`button-trocar-maquina-${p.id}`}
            title={selo ? motivoBloqueio(selo, "trocar de máquina", p) : `Mover esta peça da ${rotuloDaMaquina(p.maquina)} para outra impressora`}
            style={{ ...largura("1 1 120px"), minHeight: alvo, padding: "0 10px", gap: 5, border: `1px solid ${T.bdark}`, color: T.text, fontSize: letra }}
          >
            <ArrowLeftRight aria-hidden="true" style={{ width: 12, height: 12, color: T.accentText, flexShrink: 0 }} />
            Trocar de máquina
          </Botao>
        )}
        {podeAgir && onTirar && !parteEsgotada && (
          <Botao
            variante="secundario"
            // SEM o bloqueio de evento finalizado (selo): tirar não faz trabalho
            // andar, só recua — e a peça de evento já realizado travaria a
            // impressora para sempre. O servidor também não barra quem SAI.
            onClick={() => onTirar(p)}
            disabled={mexendo}
            aria-busy={mexendo || undefined}
            data-testid={`button-tirar-da-impressora-${p.id}`}
            title={`Tirar da ${rotuloDaMaquina(p.maquina)}: o que já saiu fica anotado e o resto volta para o topo da fila dela — a impressora fica livre`}
            style={{ ...largura("1 1 120px"), minHeight: alvo, padding: "0 10px", gap: 5, border: `1px solid ${T.bdark}`, color: T.text, fontSize: letra, cursor: mexendo ? "wait" : "pointer" }}
          >
            Tirar da impressora
          </Botao>
        )}
        <Link
          href={linkDaPecaNaGrafica(p.id)}
          className="mq-acao"
          data-testid={`link-peca-grafica-${p.id}`}
          title="Abrir esta peça na fila da Gráfica"
          style={{ ...largura(podeAgir ? "1 1 110px" : "1 1 140px"), minHeight: alvo, padding: "0 10px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, color: T.text, fontSize: letra, fontWeight: FW.forte, textDecoration: "none", whiteSpace: "nowrap" }}
        >
          <ExternalLink aria-hidden="true" style={{ width: 12, height: 12, color: T.accentText }} />
          Ver na Gráfica
        </Link>
      </div>
      {selo && (
        <div data-testid={`selo-evento-${p.id}`} title={selo.hint} style={{ fontSize: isMobile ? 12 : FS.small, color: selo.text, fontWeight: FW.forte }}>
          {selo.label} — {selo.hint}
        </div>
      )}
      {podeAgir && selo && (
        <p id={`motivo-bloqueio-${p.id}`} data-testid={`motivo-bloqueio-${p.id}`} style={{ margin: 0, fontSize: isMobile ? 12 : FS.small, color: T.apoio, lineHeight: 1.4 }}>
          {seloImpressas
            ? motivoBloqueio(seloImpressas, "informar impressas nem trocar de máquina", p)
            : `Dá para informar as impressas (é o registro do que já saiu). ${motivoBloqueio(selo, "trocar de máquina", p)}`}
        </p>
      )}
    </div>
  );
}

// ─── O cartão da impressora (aba Agora) ───────────────────────────────────────
// O que ela imprime agora, a fila reservada para ela, o atalho para a Gráfica
// recortada nela e o rodapé com o que saiu no dia aberto. O estado (seletor,
// filas abertas, gestos em voo) mora na página.
export function CartaoDaImpressora({ m, maquinaEmFoco, itemEmFoco, agora, hojeMs, isMobile, toque, podeAgir, ocupacao, mexendo, filasAbertas, dia, hoje, botaoNeutro, setSeletorDaMaquina, abrirModal, mexer, iniciarDaFila, reservar, setFilasAbertas, escreverURL }: {
  m: Maquina; maquinaEmFoco: string | null; itemEmFoco: string | null; agora: number; hojeMs: number; isMobile: boolean; toque: boolean; podeAgir: boolean;
  ocupacao: OcupacaoDasImpressoras; /** Tirar/trocar em voo: sem segundo disparo. */ mexendo: boolean; filasAbertas: Set<string>;
  /** O dia aberto no diário e o hoje do servidor (rodapé do cartão). */ dia: string | null; hoje: string | null; botaoNeutro: React.CSSProperties;
  setSeletorDaMaquina: (codigo: string) => void;
  abrirModal: (peca: PecaNaMaquina, trocar: boolean) => void;
  mexer: (v: { maquina: string; sai: OcupanteDaImpressora; entra?: PecaNaFila | null; quantidade?: number | null }) => void;
  iniciarDaFila: (p: PecaNaFila) => void;
  reservar: (itemIds: string[], maquina: string | null, quantidade?: number | null, deMaquina?: string | null) => void;
  setFilasAbertas: Dispatch<SetStateAction<Set<string>>>;
  escreverURL: (mudancas: Record<string, string | null>) => void;
}) {
  const ocupada = m.imprimindo.length > 0;
  const naFila = ordenarFila(m.naFila ?? []);
  // "Próxima" é a primeira que PODE entrar: a peça de evento finalizado
  // ou travada, pausada no topo, não fica anunciada como a próxima — ela
  // só oferece "Devolver".
  const idDaProxima = naFila.find((x) => !seloDaPecaNaMaquina(x, hojeMs))?.id ?? null;
  return (
    <article aria-label={m.rotulo} data-testid={`maquina-agora-${m.codigo}`} data-em-foco={maquinaEmFoco === m.codigo || undefined} style={{ ...(maquinaEmFoco === m.codigo ? { boxShadow: `0 0 0 3px ${IMP.border}` } : {}), background: T.surface, border: `1px solid ${maquinaEmFoco === m.codigo ? IMP.text : ocupada ? IMP.border : T.border}`, borderRadius: R.lg, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      {/* O nome inteiro ("Impressora 1 (New XT)") quebra em duas
          linhas se precisar; a pílula não disputa espaço com
          ele — vai para a direita ou para a linha de baixo. */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ ...TITULO, fontSize: FS.strong, lineHeight: 1.25, flex: "1 1 140px", minWidth: 0, overflowWrap: "anywhere" }}>{m.rotulo}</h3>
        <Pilula pal={ocupada ? IMP : LIVRE} testId={`estado-${m.codigo}`} fonte={isMobile ? 12 : FS.small}>
          {ocupada ? (m.imprimindo.length === 1 ? "Imprimindo" : `Imprimindo ${m.imprimindo.length}`) : "Livre"}
          {naFila.length > 0 && <span style={{ fontWeight: FW.medio }}> · Na fila {naFila.length}</span>}
        </Pilula>
      </div>

      {!ocupada && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ margin: 0, fontSize: FS.body, color: T.second }}>
            {naFila.length ? "Nenhuma peça imprimindo agora — a fila abaixo espera." : "Nenhuma peça nesta máquina."}
          </p>
          {podeAgir && (
            <Botao variante="secundario" onClick={() => setSeletorDaMaquina(m.codigo)} data-testid={`link-escolher-peca-${m.codigo}`} title="Escolher, entre as peças liberadas, a que vai imprimir nesta impressora" style={{ ...botaoNeutro, width: isMobile ? "100%" : "fit-content" }}>
              Escolher peça para imprimir <ArrowRight aria-hidden="true" style={{ width: 12, height: 12, color: T.accentText }} />
            </Botao>
          )}
        </div>
      )}

      {m.imprimindo.map((p) => (
        <PecaNoCartao key={p.id} emFoco={itemEmFoco === p.id} p={p.maquina ? p : { ...p, maquina: m.codigo }} agora={agora} podeAgir={podeAgir} hojeMs={hojeMs} isMobile={isMobile} onAgir={abrirModal} mexendo={mexendo} onTirar={(peca) => mexer({ maquina: m.codigo, sai: { id: peca.id, displayId: peca.displayId, nome: nomeDaPeca(peca.tipo, peca.descricao), impressas: peca.parte ? peca.parte.impressas : peca.impressas, teto: peca.parte ? peca.parte.atrib : peca.aImprimir } })} />
      ))}

      {/* A fila DESTA impressora: reservadas, na
          ordem da saída do caminhão. Só controle — a etapa da
          peça não muda até "Iniciar impressão". */}
      {naFila.length > 0 && (
        <div data-testid={`fila-maquina-${m.codigo}`} style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
          <div style={{ ...ROTULO_MICRO, fontSize: isMobile ? 12 : FS.micro, paddingTop: 6 }}>Na fila desta impressora · {naFila.length}</div>
          {ocupada && podeAgir && (
            <p role="status" data-testid={`fila-ocupada-maquina-${m.codigo}`} style={{ margin: "2px 0 4px", fontSize: isMobile ? 12 : FS.meta, color: AMBAR.text, fontWeight: FW.forte, lineHeight: 1.4 }}>
              {motivoImpressoraOcupada(ocupacao[m.codigo]?.atual?.displayId ?? m.imprimindo[0]?.displayId ?? null)}
            </p>
          )}
          {(!filasAbertas.has(m.codigo) ? naFila.slice(0, isMobile ? FILA_DO_CARTAO_NO_CELULAR : FILA_DO_CARTAO_NO_DESKTOP) : naFila).map((p) => (
            <PecaNaFilaDoCartao key={p.id} p={p} proxima={!ocupada && p.id === idDaProxima} ocupante={ocupada ? ocupacao[m.codigo]?.atual ?? null : null} mexendo={mexendo} onTrocar={(entra, sai) => mexer({ maquina: m.codigo, sai, entra, quantidade: entra.reservadas ?? null })} podeAgir={podeAgir} hojeMs={hojeMs} isMobile={isMobile} onIniciar={iniciarDaFila} onReservar={(peca, maquina, quantidade) => reservar([peca.id], maquina, quantidade ?? (peca.reservadas != null ? peca.reservadas : null), peca.reservadas != null ? m.codigo : null)} />
          ))}
          {!filasAbertas.has(m.codigo) && naFila.length > (isMobile ? FILA_DO_CARTAO_NO_CELULAR : FILA_DO_CARTAO_NO_DESKTOP) && (
            <Botao variante="secundario" onClick={() => setFilasAbertas((s) => new Set(s).add(m.codigo))} data-testid={`fila-maquina-ver-todas-${m.codigo}`} style={{ ...botaoNeutro, width: "100%", fontSize: 13 }}>
              Ver as {naFila.length} da fila <ChevronDown aria-hidden="true" style={{ width: 13, height: 13 }} />
            </Botao>
          )}
          {filasAbertas.has(m.codigo) && naFila.length > (isMobile ? FILA_DO_CARTAO_NO_CELULAR : FILA_DO_CARTAO_NO_DESKTOP) && (
            <Botao variante="secundario" onClick={() => setFilasAbertas((s) => { const n = new Set(s); n.delete(m.codigo); return n; })} data-testid={`fila-maquina-recolher-${m.codigo}`} style={{ ...botaoNeutro, width: "100%", fontSize: 13 }}>
              Mostrar só as {isMobile ? FILA_DO_CARTAO_NO_CELULAR : FILA_DO_CARTAO_NO_DESKTOP} primeiras <ChevronDown aria-hidden="true" style={{ width: 13, height: 13, transform: "rotate(180deg)" }} />
            </Botao>
          )}
        </div>
      )}

      {/* Ida para a Gráfica recortada NESTA impressora — o filtro
          "Impressora" de lá usa a mesma régua deste cartão
          (impressorasDaPeca: imprimindo, reservada ou impressa nela). */}
      <Link href={linkDaImpressoraNaGrafica(m.codigo)} className="mq-link" data-testid={`link-impressora-na-grafica-${m.codigo}`} title={`Abrir a fila da Gráfica filtrada na ${m.rotulo}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: alvoDe(28, toque), fontSize: isMobile ? 12 : FS.small, fontWeight: FW.forte, color: T.second, textDecoration: "none", width: "fit-content" }}>
        Peças desta impressora na Gráfica <ArrowRight aria-hidden="true" style={{ width: 12, height: 12, color: T.accentText }} />
      </Link>

      {/* Rodapé: o que saiu desta máquina no dia aberto — e o atalho para o diário dela. */}
      <button
        type="button"
        className="mq-acao"
        onClick={() => escreverURL({ maquina: m.codigo, aba: "diario" })}
        data-testid={`resumo-dia-${m.codigo}`}
        title={`Ver o diário da ${m.rotulo} neste dia`}
        style={{ marginTop: "auto", minHeight: alvoDe(32, toque), padding: "6px 8px", border: "none", borderTop: `1px solid ${T.low}`, borderRadius: `0 0 ${R.sm}px ${R.sm}px`, background: "transparent", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: isMobile ? 12 : FS.small, color: T.second, fontVariantNumeric: "tabular-nums" }}
      >
        <span>
          <span style={{ ...ROTULO_MICRO, fontSize: isMobile ? 12 : FS.micro }}>{dia && hoje ? rotuloDoDia(dia, hoje) : "Dia"}</span>{" "}
          {m.unidadesNoDia === 0 && m.registros.length === 0
            ? "nada impresso"
            : `${plural(m.unidadesNoDia, "un. impressa", "un. impressas")} · ${plural(m.pecasNoDia, "peça", "peças")}`}
        </span>
        <ChevronRight aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0 }} />
      </button>
    </article>
  );
}
