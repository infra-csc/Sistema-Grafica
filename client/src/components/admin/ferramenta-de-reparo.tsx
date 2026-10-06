// ─────────────────────────────────────────────────────────────────────────────
// A FERRAMENTA DE REPARO — a anatomia comum de Correção de textos, Reparo de
// vínculos e Inferir executivos (Administração).
//
// As três fazem a mesma coisa em domínios diferentes: mostram uma PRÉVIA do
// que está errado, aplicam de uma vez só (transação no servidor) e gravam uma
// linha por alteração na trilha. Cada uma desenhava o próprio topo, a própria
// faixa colorida e o próprio aviso azul — e nenhuma dizia, antes do clique, o
// que exatamente muda e o que fica como está. Aqui mora essa gramática:
//
//   CascaDaFerramenta      o papel da página (fundo, respiro, largura)
//   CabecalhoDaFerramenta  "Ferramenta de reparo · uso pontual" + título + estado
//   PassosDoReparo         revisar → aplicar uma vez → conferir nos Logs
//   PainelDoEfeito         O NÚMERO, "Ao aplicar" × "Não muda", a garantia e
//                          a ação — com os estados aplicando e falhou
//   ResultadoDoReparo      o que aconteceu, e fica na tela (o toast some)
//   ResumoDaConfirmacao    o miolo do diálogo de confirmação
//   NadaPendente, SemPermissao, EsqueletoDaFerramenta, TituloDeSecao, ChipsDeIds
//
// NADA AQUI DECIDE REGRA. Os componentes recebem números e frases prontas; a
// tela continua dona da consulta, da mutação e do texto do que o servidor faz.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { Link } from "wouter";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle, ArrowUpRight, Check, CheckCircle2, Lock, Minus, RotateCw, ShieldCheck, Wrench,
} from "lucide-react";
import { T, TOM, FS, FW, R, FONT, type NomeDeTom } from "@/lib/theme";
import { useIsMobile } from "@/hooks/use-mobile";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EstadoVazio } from "@/components/ui/estados";

/** "1 registro" / "3 registros" — nunca "registro(s)". */
export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * O 403 do `requireAdmin` chega como Error("Acesso negado - apenas
 * administradores") — o queryClient já tirou o status. Sessão em que o papel
 * mudou (ou o "ver como") cai aqui; tratá-lo como "verifique a conexão" mandava
 * a pessoa tentar de novo algo que nunca vai funcionar.
 */
export function ehSemPermissao(erro: unknown): boolean {
  const msg = erro instanceof Error ? erro.message : String(erro ?? "");
  return /acesso negado|apenas administradores|^403\b/i.test(msg);
}

const ROTULO: React.CSSProperties = {
  fontSize: FS.micro, fontWeight: FW.rotulo, textTransform: "uppercase", letterSpacing: "0.12em",
};

// ── Casca ───────────────────────────────────────────────────────────────────

/**
 * <div>, não <main>: o SidebarInset do App já É o <main> — um segundo
 * landmark principal aninhado confundia a navegação por regiões. Coluna
 * alinhada à esquerda, como Usuários, Logs e Notificações.
 */
export function CascaDaFerramenta({ children, testId }: { children: React.ReactNode; testId?: string }) {
  const isMobile = useIsMobile();
  const [ref, largura] = useLarguraDoElemento<HTMLDivElement>();
  return (
    <div data-testid={testId} style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: isMobile ? "16px 16px 48px" : "28px 32px 64px" }}>
      <div ref={ref} style={{ maxWidth: 1240 }}>
        <LarguraDaCasca.Provider value={largura}>{children}</LarguraDaCasca.Provider>
      </div>
    </div>
  );
}

/**
 * A LARGURA DO CONTEÚDO, não a da janela. No tablet (768) a barra lateral
 * fica aberta e sobram ~510px: decidir pelo `useIsMobile` deixava o painel em
 * três colunas espremidas, com uma palavra por linha. Os blocos se arrumam
 * pela largura que de fato têm.
 */
export function useLarguraDoElemento<E extends HTMLElement>(): [React.RefObject<E>, number] {
  const ref = React.useRef<E>(null);
  const [largura, setLargura] = React.useState(() => (typeof window === "undefined" ? 1080 : Math.min(window.innerWidth, 1080)));
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.clientWidth) setLargura(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entradas) => {
      const w = entradas[0]?.contentRect.width;
      if (w) setLargura(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, largura];
}

const LarguraDaCasca = React.createContext<number>(1080);
export const useLarguraDaCasca = () => React.useContext(LarguraDaCasca);

export function CabecalhoDaFerramenta({
  titulo, estado, descricao, acoes, testId,
}: { titulo: string; estado?: React.ReactNode; descricao: React.ReactNode; acoes?: React.ReactNode; testId?: string }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ marginBottom: 20 }}>
      {/* Onde estou ANTES do título: esta não é uma tela de rotina. */}
      <p style={{ ...ROTULO, display: "flex", alignItems: "center", gap: 6, margin: "0 0 8px", color: T.second }}>
        <Wrench aria-hidden="true" style={{ width: 12, height: 12 }} />
        Ferramenta de reparo · uso pontual
      </p>
      {/* No celular as ações descem para DEPOIS da explicação: entre o título
          e a frase elas cortavam a leitura ao meio. */}
      <CabecalhoDaPagina titulo={titulo} subtitulo={estado} acoes={isMobile ? undefined : acoes} testId={testId} margemInferior={10} />
      <p style={{ margin: 0, maxWidth: 680, fontSize: FS.body, lineHeight: 1.55, color: T.apoio }}>{descricao}</p>
      {isMobile && acoes && <div style={{ marginTop: 14 }}>{acoes}</div>}
    </div>
  );
}

// ── Passos ──────────────────────────────────────────────────────────────────

export type EtapaDoReparo = "revisar" | "feito";

/**
 * O roteiro em três passos. Não é enfeite: é a resposta a "isto é rotina?"
 * (não é — aplica-se UMA vez) e a "como sei que funcionou?" (nos Logs).
 */
export function PassosDoReparo({ etapa, hrefDosLogs }: { etapa: EtapaDoReparo; hrefDosLogs: string }) {
  const feito = etapa === "feito";
  const passos: Array<{ rotulo: React.ReactNode; estado: "feito" | "atual" | "depois" }> = [
    { rotulo: "Revise a prévia", estado: feito ? "feito" : "atual" },
    { rotulo: "Aplique uma vez", estado: feito ? "feito" : "depois" },
    {
      rotulo: <Link href={hrefDosLogs} className="adm-link">Confira nos Logs do Sistema</Link>,
      estado: feito ? "atual" : "depois",
    },
  ];
  return (
    <ol aria-label="Como usar esta ferramenta" className="adm-passos" style={{ listStyle: "none", margin: "0 0 18px", padding: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 10px" }}>
      {passos.map((p, i) => {
        const cor = p.estado === "feito" ? TOM.sucesso.text : p.estado === "atual" ? T.text : T.second;
        return (
          <li key={i} aria-current={p.estado === "atual" ? "step" : undefined} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: FS.meta, fontWeight: p.estado === "atual" ? FW.forte : FW.medio, color: cor }}>
            <span aria-hidden="true" style={{
              width: 20, height: 20, borderRadius: R.pill, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontFamily: FONT.mono, fontSize: FS.small, fontWeight: FW.forte,
              backgroundColor: p.estado === "feito" ? TOM.sucesso.bg : p.estado === "atual" ? T.dark : T.surface,
              color: p.estado === "feito" ? TOM.sucesso.text : p.estado === "atual" ? T.surface : T.second,
              border: `1px solid ${p.estado === "feito" ? TOM.sucesso.border : p.estado === "atual" ? T.dark : T.bdark}`,
            }}>
              {p.estado === "feito" ? <Check style={{ width: 12, height: 12 }} /> : i + 1}
            </span>
            <span>{p.estado === "feito" && <span className="sr-only">Concluído: </span>}{p.rotulo}</span>
            {i < passos.length - 1 && <span aria-hidden="true" className="adm-passo-fio" style={{ width: 28, height: 1, backgroundColor: T.bdark, marginLeft: 2 }} />}
          </li>
        );
      })}
    </ol>
  );
}

// ── Painel do efeito ────────────────────────────────────────────────────────

export interface PainelDoEfeitoProps {
  /** O número que a ação move. */
  numero: number;
  rotuloDoNumero: string;
  detalheDoNumero?: React.ReactNode;
  /** O que a aplicação FAZ — frases curtas, com o número dentro. */
  faz: React.ReactNode[];
  /** O que ela NÃO toca — a resposta a "e se der errado?". */
  naoMuda: React.ReactNode[];
  /** A garantia do servidor (compara antes de gravar, só acrescenta…). */
  garantia: React.ReactNode;
  rotuloDaAcao: string;
  iconeDaAcao: LucideIcon;
  aoAplicar: () => void;
  aplicando: boolean;
  /** Mensagem da última tentativa que falhou (some ao tentar de novo). */
  erro?: string | null;
  tom?: NomeDeTom;
  testId?: string;
}

export function PainelDoEfeito({
  numero, rotuloDoNumero, detalheDoNumero, faz, naoMuda, garantia, rotuloDaAcao, iconeDaAcao,
  aoAplicar, aplicando, erro, tom = "laranja", testId = "adm-painel-efeito",
}: PainelDoEfeitoProps) {
  const isMobile = useIsMobile();
  const largura = useLarguraDaCasca();
  // Três colunas só com folga; no meio, o número à esquerda e as duas listas
  // empilhadas à direita; estreito, tudo em coluna.
  const estreito = largura < 600;
  const medio = !estreito && largura < 860;
  const idTitulo = React.useId();
  return (
    <section
      aria-labelledby={idTitulo}
      aria-busy={aplicando}
      data-testid={testId}
      className="adm-entra"
      style={{ position: "relative", backgroundColor: T.surface, border: `1px solid ${erro ? TOM.perigo.border : T.border}`, borderRadius: R.lg, overflow: "hidden", marginBottom: 28 }}
    >
      {/* Barra indeterminada no topo enquanto o servidor grava. */}
      {aplicando && <div className="adm-progresso" aria-hidden="true" />}

      <div style={{ display: "grid", gridTemplateColumns: estreito ? "1fr" : medio ? "minmax(150px, 190px) 1fr" : "minmax(170px, 210px) 1fr 1fr", gap: estreito ? 18 : medio ? "18px 24px" : 28, padding: estreito ? "18px 16px" : "22px 24px" }}>
        <div style={{ gridRow: medio ? "span 2" : undefined }}>
          <p id={idTitulo} style={{ ...ROTULO, margin: "0 0 6px", color: T.second }}>Prévia</p>
          <p style={{ margin: 0, fontFamily: FONT.display, fontSize: FS.h1 + 10, lineHeight: 1, fontWeight: FW.forte, letterSpacing: "-0.03em", color: TOM[tom].text, fontVariantNumeric: "tabular-nums" }}>
            {numero}
          </p>
          <p style={{ margin: "6px 0 0", fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>{rotuloDoNumero}</p>
          {detalheDoNumero && <p style={{ margin: "2px 0 0", fontSize: FS.meta, color: T.second, lineHeight: 1.45 }}>{detalheDoNumero}</p>}
        </div>
        <ListaDeEfeito titulo="Ao aplicar" itens={faz} icone={Check} cor={TOM.sucesso.text} />
        <ListaDeEfeito titulo="Não muda" itens={naoMuda} icone={Minus} cor={T.second} />
      </div>

      <div style={{ display: "flex", alignItems: estreito ? "stretch" : "center", justifyContent: "space-between", gap: estreito ? 14 : 20, flexDirection: estreito ? "column" : "row", padding: estreito ? "14px 16px 16px" : "14px 24px", borderTop: `1px solid ${T.border}`, backgroundColor: T.bg }}>
        <div aria-live="polite" style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: FS.meta, lineHeight: 1.5, color: T.apoio, maxWidth: 620 }}>
          {aplicando ? (
            <>
              <RotateCw aria-hidden="true" className="adm-gira" style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2, color: T.apoio }} />
              <span><strong style={{ color: T.text }}>Aplicando…</strong> o servidor grava tudo de uma vez. Não feche esta tela.</span>
            </>
          ) : erro ? (
            <>
              <AlertTriangle aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2, color: TOM.perigo.text }} />
              <span role="alert">
                <strong style={{ color: TOM.perigo.text }}>A aplicação falhou:</strong>{" "}
                {erro} A aplicação é feita de uma vez só: quando falha, nenhum registro é alterado.
              </span>
            </>
          ) : (
            <>
              <ShieldCheck aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2, color: TOM.info.text }} />
              <span>{garantia}</span>
            </>
          )}
        </div>
        <Botao
          variante="primario"
          tamanho={isMobile ? "toque" : "md"}
          icone={erro && !aplicando ? RotateCw : iconeDaAcao}
          onClick={aoAplicar}
          carregando={aplicando}
          larguraCheia={estreito}
          data-testid="adm-aplicar"
          style={{ flexShrink: 0 }}
        >
          {aplicando ? "Aplicando…" : erro ? "Tentar de novo" : rotuloDaAcao}
        </Botao>
      </div>
    </section>
  );
}

function ListaDeEfeito({ titulo, itens, icone: Icone, cor }: { titulo: string; itens: React.ReactNode[]; icone: LucideIcon; cor: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ ...ROTULO, margin: "0 0 10px", color: T.second }}>{titulo}</p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 9 }}>
        {itens.map((item, i) => (
          <li key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: FS.body, lineHeight: 1.45, color: T.strong }}>
            <Icone aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2, color: cor }} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Resultado ───────────────────────────────────────────────────────────────

/**
 * O que aconteceu, NA TELA. O toast continua (é o aviso do momento), mas some
 * em segundos — e "quantos foram preservados?" é pergunta de minutos depois.
 */
export function ResultadoDoReparo({
  titulo, linhas, hrefDosLogs, quando, rodape,
}: { titulo: string; linhas: React.ReactNode[]; hrefDosLogs: string; quando: Date; rodape?: React.ReactNode }) {
  const isMobile = useIsMobile();
  const estreito = useLarguraDaCasca() < 600;
  const hora = quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <section
      role="status"
      data-testid="adm-resultado"
      className="adm-entra"
      style={{ display: "flex", gap: 14, alignItems: estreito ? "stretch" : "flex-start", flexDirection: estreito ? "column" : "row", justifyContent: "space-between", padding: estreito ? "16px" : "18px 22px", border: `1px solid ${TOM.sucesso.border}`, borderRadius: R.lg, backgroundColor: TOM.sucesso.bg, marginBottom: 28 }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0 }}>
        <CheckCircle2 aria-hidden="true" style={{ width: 22, height: 22, flexShrink: 0, color: TOM.sucesso.text, marginTop: 1 }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontFamily: FONT.display, fontSize: FS.lead, fontWeight: FW.forte, color: TOM.sucesso.text }}>{titulo}</p>
          <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            {linhas.map((l, i) => <li key={i} style={{ fontSize: FS.body, lineHeight: 1.5, color: T.strong }}>{l}</li>)}
          </ul>
          <p style={{ margin: "6px 0 0", fontSize: FS.meta, color: T.apoio }}>
            Aplicado às {hora}, em seu nome.{rodape ? <> {rodape}</> : null}
          </p>
        </div>
      </div>
      <BotaoLink href={hrefDosLogs} variante="secundario" tamanho={isMobile ? "toque" : "md"} icone={ArrowUpRight} larguraCheia={estreito} style={{ flexShrink: 0 }}>
        Ver nos Logs do Sistema
      </BotaoLink>
    </section>
  );
}

// ── Confirmação ─────────────────────────────────────────────────────────────

/**
 * O miolo do diálogo: os números do que vai acontecer, o que NÃO muda e onde
 * conferir depois. A pergunta sozinha ("Aplicar agora?") obrigava a lembrar
 * da tela de trás.
 */
export function ResumoDaConfirmacao({
  numeros, naoMuda, rodape,
}: { numeros: Array<{ n: number; rotulo: string }>; naoMuda?: React.ReactNode; rodape?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, border: `1px solid ${T.border}`, borderRadius: R.md, overflow: "hidden" }}>
        {numeros.map((linha, i) => (
          <li key={i} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "9px 12px", borderTop: i ? `1px solid ${T.border}` : undefined, backgroundColor: i % 2 ? T.bg : T.surface }}>
            <span style={{ minWidth: 28, textAlign: "right", fontFamily: FONT.display, fontSize: FS.lead, fontWeight: FW.forte, color: T.text, fontVariantNumeric: "tabular-nums" }}>{linha.n}</span>
            <span style={{ fontSize: FS.body, color: T.strong }}>{linha.rotulo}</span>
          </li>
        ))}
      </ul>
      {naoMuda && (
        <p style={{ margin: 0, display: "flex", gap: 8, alignItems: "flex-start", fontSize: FS.body, color: T.apoio }}>
          <ShieldCheck aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2, color: TOM.info.text }} />
          <span>{naoMuda}</span>
        </p>
      )}
      {rodape && <p style={{ margin: 0, fontSize: FS.meta, color: T.second }}>{rodape}</p>}
    </div>
  );
}

// ── Estados ─────────────────────────────────────────────────────────────────

export function NadaPendente({ titulo, descricao, hrefDosLogs, rotuloDosLogs = "Ver o que já foi feito nos Logs" }: { titulo: string; descricao: React.ReactNode; hrefDosLogs: string; rotuloDosLogs?: string }) {
  const isMobile = useIsMobile();
  return (
    <div className="adm-entra" style={{ marginBottom: 28 }}>
      <EstadoVazio
        icone={CheckCircle2}
        tom="sucesso"
        titulo={titulo}
        descricao={descricao}
        testId="adm-nada-pendente"
        acao={<BotaoLink href={hrefDosLogs} variante="secundario" tamanho={isMobile ? "toque" : "md"} icone={ArrowUpRight}>{rotuloDosLogs}</BotaoLink>}
      />
    </div>
  );
}

export function SemPermissao() {
  return (
    <EstadoVazio
      icone={Lock}
      titulo="Ferramenta exclusiva de administradores"
      descricao="Seu perfil não pode ver nem aplicar este reparo. Se ele for necessário, peça a um administrador."
      testId="adm-sem-permissao"
    />
  );
}

function Barra({ w, h = 12, raio = R.sm }: { w: number | string; h?: number; raio?: number }) {
  return <span aria-hidden="true" className="animate-pulse" style={{ display: "block", width: w, height: h, borderRadius: raio, backgroundColor: T.low }} />;
}

/** A silhueta do painel do efeito + a lista — o dado chega no lugar dele. */
export function EsqueletoDaFerramenta({ rotulo, linhas = 3 }: { rotulo: string; linhas?: number }) {
  const isMobile = useLarguraDaCasca() < 600;
  return (
    <div role="status" aria-busy="true" aria-live="polite" data-testid="adm-esqueleto">
      <span className="sr-only">{rotulo}…</span>
      <div style={{ border: `1px solid ${T.border}`, borderRadius: R.lg, backgroundColor: T.surface, marginBottom: 28, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(170px, 210px) 1fr 1fr", gap: 28, padding: isMobile ? "18px 16px" : "22px 24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><Barra w={50} h={10} /><Barra w={64} h={36} /><Barra w="70%" /></div>
          {!isMobile && [0, 1].map((k) => (
            <div key={k} style={{ display: "flex", flexDirection: "column", gap: 12 }}><Barra w={70} h={10} /><Barra w="85%" /><Barra w="65%" /></div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "14px 24px", borderTop: `1px solid ${T.border}`, backgroundColor: T.bg }}>
          <Barra w="45%" /><Barra w={150} h={36} raio={R.md} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Barra w={180} h={14} />
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i} style={{ border: `1px solid ${T.border}`, borderRadius: R.lg, backgroundColor: T.surface, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            <Barra w={i % 2 ? "30%" : "22%"} h={10} /><Barra w="88%" /><Barra w="60%" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Peças da prévia ─────────────────────────────────────────────────────────

export function TituloDeSecao({
  titulo, contagem, descricao, tom, icone: Icone, acao, id,
}: { titulo: string; contagem?: number; descricao?: React.ReactNode; tom?: NomeDeTom; icone?: LucideIcon; acao?: React.ReactNode; id?: string }) {
  const cor = tom ? TOM[tom].text : T.text;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
      <div style={{ minWidth: 0 }}>
        <h2 id={id} style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontFamily: FONT.display, fontSize: FS.title, fontWeight: FW.forte, letterSpacing: "-0.02em", color: cor }}>
          {Icone && <Icone aria-hidden="true" style={{ width: 17, height: 17 }} />}
          {titulo}
          {contagem !== undefined && (
            <span style={{ fontFamily: FONT.mono, fontSize: FS.meta, fontWeight: FW.forte, color: tom ? TOM[tom].text : T.apoio, backgroundColor: tom ? TOM[tom].bg : T.low, border: `1px solid ${tom ? TOM[tom].border : T.border}`, borderRadius: R.pill, padding: "1px 8px", letterSpacing: 0 }}>
              {contagem}
            </span>
          )}
        </h2>
        {descricao && <p style={{ margin: "4px 0 0", fontSize: FS.meta, lineHeight: 1.5, color: T.second, maxWidth: 680 }}>{descricao}</p>}
      </div>
      {acao}
    </div>
  );
}

/**
 * Os números das peças/registros, em fichas mono. Até `limite` à vista; o
 * resto atrás de "+N" — a lista inteira cabe, mas não empurra a próxima linha
 * para fora da tela. O "+N" era "…": não dizia quantas, nem deixava ver.
 */
export function ChipsDeIds({ ids, limite = 8, nome = { um: "peça", varios: "peças" } }: { ids: string[]; limite?: number; nome?: { um: string; varios: string } }) {
  const [abertos, setAbertos] = React.useState(false);
  const visiveis = abertos ? ids : ids.slice(0, limite);
  const resto = ids.length - visiveis.length;
  return (
    <ul aria-label={plural(ids.length, nome.um, nome.varios)} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      {visiveis.map((id, i) => (
        <li key={`${id}-${i}`} style={{ fontFamily: FONT.mono, fontSize: FS.small, fontWeight: FW.medio, color: T.strong, backgroundColor: T.low, border: `1px solid ${T.border}`, borderRadius: R.sm, padding: "2px 7px", lineHeight: 1.5, overflowWrap: "anywhere" }}>
          {id}
        </li>
      ))}
      {ids.length > limite && (
        <li>
          <button type="button" className="adm-chip-mais" aria-expanded={abertos} onClick={() => setAbertos((v) => !v)}
            style={{ fontFamily: FONT.corpo, fontSize: FS.small, fontWeight: FW.forte, color: T.apoio, backgroundColor: T.surface, border: `1px dashed ${T.bdark}`, borderRadius: R.sm, padding: "2px 8px", lineHeight: 1.5, cursor: "pointer" }}>
            {abertos ? "mostrar menos" : `+${resto} ${resto === 1 ? nome.um : nome.varios}`}
          </button>
        </li>
      )}
    </ul>
  );
}

/** A linha do "como está → como ficará" e da prévia em geral: o cartão da casa. */
export const CARTAO: React.CSSProperties = {
  backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden",
};

export { ROTULO as ROTULO_CAIXA_ALTA };
