// ─────────────────────────────────────────────────────────────────────────────
// BUSCA GLOBAL (Ctrl+K) — o "ir para" do app.
//
// Peça citada no WhatsApp ("vê a #2993") exigia escolher uma tela, achar a
// busca local daquela tela e torcer para o recorte dela conter a peça. Esta
// paleta responde de qualquer lugar e leva DIRETO ao destino: peça abre no
// Detalhe do Evento (que todo papel enxerga, e que já aceita ?item=), evento
// abre a própria página.
//
// O que ela NÃO é, de propósito: uma "command palette" com ações. Só ir-para.
// Ação mora nas telas, com as guardas e os avisos que cada uma já tem —
// duplicá-las aqui criaria um segundo lugar para cada regra.
//
// Desenho:
//  · Overlay próprio, sem Radix: a lista re-renderiza a cada tecla e o custo
//    dos refs compostos do Radix em lista viva é conhecido nesta base (#185).
//  · Debounce de 250ms; a rota /api/busca faz o recorte no SQL.
//  · Teclado completo: ↑/↓ percorre, Enter abre, Esc fecha. O item ativo tem
//    aria-selected e a lista é role=listbox — a paleta é utilizável sem ver.
//  · Fecha ao navegar, ao clicar fora e ao Esc; zera o texto ao fechar
//    (paleta reaberta é pergunta nova, não a resposta velha).
//  · Ao fechar, o foco volta para onde estava (o botão da barra, o campo da
//    tela) — antes caía no <body> e o próximo Tab recomeçava do topo.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Search, SearchX, CalendarDays, FileText, CornerDownLeft, Loader2, X, AlertTriangle } from "lucide-react";
import { getStatusLabel, getStatusMeta, guiaDoStatus } from "@/lib/status";
import { T, FS, R, N, FW, FONT, TOM } from "@/lib/theme";

interface PecaEncontrada {
  id: string; displayId: string; type: string; description: string | null;
  status: string; eventId: string; eventName: string | null;
}
interface EventoEncontrado { id: string; name: string; truckDepartureDate: string | null; }
interface Resultado { pecas: PecaEncontrada[]; eventos: EventoEncontrado[]; }

const VAZIO: Resultado = { pecas: [], eventos: [] };

/**
 * Evento que abre a paleta de fora (o botão da barra usa). Evento de janela em
 * vez de estado içado: o App não precisa conhecer a paleta além de montá-la,
 * e qualquer tela futura pode abrir a busca sem receber props para isso.
 */
export const ABRIR_BUSCA_EVENT = "norte:abrir-busca-global";
export function abrirBuscaGlobal() {
  window.dispatchEvent(new Event(ABRIR_BUSCA_EVENT));
}

// Rótulo de seção: #78716c e não #a8a29e — é texto, e #a8a29e é proibido
// como texto (2,5:1 sobre branco).
const ROTULO_SECAO: React.CSSProperties = {
  margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.second,
};
const MENSAGEM: React.CSSProperties = { margin: 0, padding: "20px 16px", fontSize: 13, color: T.second, lineHeight: 1.5 };

export function BuscaGlobal() {
  const [, setLocation] = useLocation();
  const [aberta, setAberta] = useState(false);
  const [termo, setTermo] = useState("");
  const [resultado, setResultado] = useState<Resultado>(VAZIO);
  const [buscando, setBuscando] = useState(false);
  // Falha de rede/servidor. Antes a paleta "errava calada" e mostrava
  // "Nada com X" — o usuário concluía que a peça não existia.
  const [erro, setErro] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const focoAnterior = useRef<HTMLElement | null>(null);

  // ── abrir/fechar ─────────────────────────────────────────────────────────
  const fechar = useCallback(() => { setAberta(false); setTermo(""); setResultado(VAZIO); setAtivo(0); setErro(false); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+K (⌘K no Mac). `k` já é do navegador em alguns contextos — o
      // preventDefault fica DENTRO da condição para não engolir nada além.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberta((v) => !v);
      }
    };
    const onAbrir = () => setAberta(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(ABRIR_BUSCA_EVENT, onAbrir);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(ABRIR_BUSCA_EVENT, onAbrir);
    };
  }, []);

  useEffect(() => {
    if (aberta) {
      focoAnterior.current = document.activeElement as HTMLElement | null;
      inputRef.current?.focus();
    } else if (focoAnterior.current) {
      // Só devolve se o elemento ainda está na página: ao navegar, o destino
      // é outra tela e o foco segue com ela.
      const alvo = focoAnterior.current;
      focoAnterior.current = null;
      if (document.contains(alvo)) alvo.focus();
    }
  }, [aberta]);

  // ── a consulta, com debounce ─────────────────────────────────────────────
  useEffect(() => {
    if (!aberta) return;
    const t = termo.trim();
    if (t.length < 2) { setResultado(VAZIO); setBuscando(false); setErro(false); return; }
    setBuscando(true);
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/busca?q=${encodeURIComponent(t)}`, { credentials: "include", signal: ctrl.signal });
        if (!res.ok) { setErro(true); return; }
        const corpo: Resultado = await res.json();
        setErro(false);
        setResultado(corpo);
        setAtivo(0);
      } catch {
        // Abortada = o usuário digitou de novo, nada a dizer. Rede caída vira
        // a linha de erro discreta na própria paleta — nunca um toast em cima
        // de quem está digitando.
        if (!ctrl.signal.aborted) setErro(true);
      } finally {
        if (!ctrl.signal.aborted) setBuscando(false);
      }
    }, 250);
    return () => { window.clearTimeout(timer); ctrl.abort(); };
  }, [termo, aberta]);

  // ── navegação por teclado ────────────────────────────────────────────────
  // A lista achatada segue a ordem visual: peças primeiro (o caso principal),
  // eventos depois.
  const linhas: Array<{ tipo: "peca"; p: PecaEncontrada } | { tipo: "evento"; ev: EventoEncontrado }> = [
    ...resultado.pecas.map((p) => ({ tipo: "peca" as const, p })),
    ...resultado.eventos.map((ev) => ({ tipo: "evento" as const, ev })),
  ];

  const abrirLinha = useCallback((linha: (typeof linhas)[number]) => {
    focoAnterior.current = null;
    fechar();
    if (linha.tipo === "peca") setLocation(`/eventos/${linha.p.eventId}?item=${encodeURIComponent(linha.p.id)}`);
    else setLocation(`/eventos/${linha.ev.id}`);
  }, [fechar, setLocation]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); fechar(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setAtivo((a) => Math.min(a + 1, linhas.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter" && linhas[ativo]) { e.preventDefault(); abrirLinha(linhas[ativo]); }
  };

  // O item ativo acompanha a rolagem — sem isto, ↓ além da dobra some.
  useEffect(() => {
    listaRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [ativo]);

  if (!aberta) return null;

  const t = termo.trim();
  const semResultado = t.length >= 2 && !buscando && !erro && linhas.length === 0;
  const idOpcao = (i: number) => `busca-global-opcao-${i}`;

  const estiloOpcao = (i: number): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 12, width: "100%",
    minHeight: 48, padding: "8px 10px", border: "none", borderRadius: R.md,
    backgroundColor: ativo === i ? TOM.laranja.bg : "transparent",
    // O ativo ganha também um contorno: o fundo creme sozinho some em tela
    // com brilho alto, e é ele que diz onde o Enter vai cair.
    boxShadow: ativo === i ? `inset 0 0 0 1px ${TOM.laranja.border}` : "none",
    cursor: "pointer", textAlign: "left", font: "inherit",
    transition: "background-color 0.08s ease",
  });

  // O ladrilho do tipo: a peça em laranja (a matéria-prima da casa), o evento
  // em azul — a mesma leitura dos selos no resto do app.
  const ladrilho = (fundo: string): React.CSSProperties => ({
    width: 32, height: 32, borderRadius: R.md, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    backgroundColor: fundo,
  });

  return (
    <div
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        backgroundColor: "rgba(28,25,23,0.42)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "max(12px, 11vh) 12px 12px",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Busca global"
        data-testid="busca-global"
        className="norte-surge"
        style={{
          width: "100%", maxWidth: 600,
          backgroundColor: T.surface, borderRadius: R.xl,
          border: `1px solid ${T.border}`,
          boxShadow: "0 24px 56px -12px rgba(28,25,23,0.30)",
          overflow: "hidden", display: "flex", flexDirection: "column",
          maxHeight: "min(72vh, 640px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 10px 0 18px", borderBottom: `1px solid ${T.border}` }}>
          {/* Lupa vira giro enquanto a consulta está no ar: sem isto, os 250ms
              de debounce + a ida ao servidor pareciam "não achou nada". */}
          {buscando
            ? <Loader2 aria-hidden="true" className="animate-spin" style={{ width: 18, height: 18, color: T.accentText, flexShrink: 0 }} />
            : <Search aria-hidden="true" style={{ width: 18, height: 18, color: T.second, flexShrink: 0 }} />}
          <input
            ref={inputRef}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={onInputKey}
            // Curto para caber inteiro a 390px (o longo era cortado no meio);
            // o que dá para buscar está explicado logo abaixo.
            placeholder="Buscar peça ou evento…"
            aria-label="Buscar peça ou evento"
            role="combobox"
            aria-expanded={linhas.length > 0}
            aria-controls="busca-global-resultados"
            aria-activedescendant={linhas[ativo] ? idOpcao(ativo) : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
            data-testid="input-busca-global"
            className="csc-busca-input"
            style={{
              // 16px: abaixo disso o iOS dá zoom ao focar — e a paleta inteira
              // pulava de lugar no celular.
              flex: 1, minWidth: 0, height: 56, border: "none", outline: "none",
              fontSize: FS.lead, fontFamily: "inherit", color: T.text,
              backgroundColor: "transparent",
            }}
          />
          {/* O "Esc" era só um desenho de tecla: no celular, onde não existe
              Esc, não havia como fechar a paleta além de tocar no escuro em
              volta. Agora é um botão de verdade — "Esc" onde há teclado, um X
              de 44px onde é o dedo. */}
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar busca"
            className="csc-busca-fechar"
            style={{ flexShrink: 0, minWidth: 36, height: 32, padding: "0 8px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: FS.small, fontWeight: FW.forte, color: T.second, background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.sm, cursor: "pointer", fontFamily: "inherit" }}
          >
            <span className="max-md:hidden">Esc</span>
            <X aria-hidden="true" className="md:hidden" style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div ref={listaRef} id="busca-global-resultados" role="listbox" aria-label="Resultados" style={{ overflowY: "auto", overscrollBehavior: "contain", padding: linhas.length ? 8 : 0 }}>
          {/* O QUE DÁ PARA BUSCAR, E O QUE ACONTECE AO ESCOLHER. A dica antiga
              só dizia o mínimo de caracteres — quem abria a paleta pela
              primeira vez não sabia se "Banner" ou o nome do patrocinador
              achariam alguma coisa (o primeiro acha; o segundo não: /api/busca
              olha código, tipo e descrição da peça e o nome do evento). */}
          {t.length < 2 && (
            <div style={{ padding: "18px 18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ margin: 0, fontSize: FS.body, color: T.strong, fontWeight: FW.medio, lineHeight: 1.5 }}>
                Busque por código da peça, tipo, descrição ou nome do evento.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, fontSize: FS.meta, color: T.second }}>
                <span>Ex.:</span>
                {["#2993", "Banner", "nome do evento"].map((ex) => (
                  <span key={ex} style={{ display: "inline-flex", alignItems: "center", minHeight: 24, padding: "0 8px", borderRadius: R.sm, backgroundColor: N.n2, border: `1px solid ${T.border}`, fontSize: FS.meta, fontWeight: FW.medio, color: T.strong }}>{ex}</span>
                ))}
              </div>
              <p style={{ margin: 0, fontSize: FS.meta, color: T.second, lineHeight: 1.55 }}>
                Digite ao menos 2 caracteres — o código funciona com ou sem o “#”. A peça abre na ficha dela, dentro do evento; o evento abre a página dele.
              </p>
            </div>
          )}
          {t.length >= 2 && buscando && linhas.length === 0 && (
            <p role="status" style={{ ...MENSAGEM, display: "flex", alignItems: "center", gap: 8 }}>
              Buscando “{t}”…
            </p>
          )}
          {erro && !buscando && (
            <div role="alert" data-testid="busca-erro" style={{ display: "flex", alignItems: "flex-start", gap: 10, margin: 12, padding: "12px 14px", borderRadius: R.md, backgroundColor: TOM.perigo.bg, border: `1px solid ${TOM.perigo.border}` }}>
              <AlertTriangle aria-hidden="true" style={{ width: 16, height: 16, color: TOM.perigo.text, flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: FS.body, color: TOM.perigo.text, lineHeight: 1.5 }}>
                Não deu para buscar agora. Confira a conexão e digite de novo.
              </p>
            </div>
          )}
          {semResultado && (
            <div data-testid="busca-sem-resultado" style={{ padding: "26px 18px 28px", textAlign: "center" }}>
              <SearchX aria-hidden="true" style={{ width: 26, height: 26, color: T.bdark, margin: "0 auto 10px", display: "block" }} />
              <p style={{ margin: "0 0 4px", fontSize: FS.read, fontWeight: FW.forte, color: T.text, overflowWrap: "anywhere" }}>Nada com “{t}”</p>
              <p style={{ margin: 0, fontSize: FS.meta, color: T.second, lineHeight: 1.5 }}>
                Nem peça, nem evento. Confira o código ou tente outra palavra. Peças excluídas não aparecem aqui.
              </p>
            </div>
          )}

          {resultado.pecas.length > 0 && (
            <p style={{ ...ROTULO_SECAO, padding: "6px 10px 6px" }}>Peças <span style={{ fontWeight: FW.medio, letterSpacing: 0 }}>· {resultado.pecas.length}</span></p>
          )}
          {resultado.pecas.map((p, i) => {
            const st = getStatusMeta(p.status);
            const vez = guiaDoStatus(p.status)?.vez;
            return (
              <button
                key={p.id}
                id={idOpcao(i)}
                type="button"
                role="option"
                aria-selected={ativo === i}
                data-testid={`busca-peca-${p.id}`}
                onClick={() => abrirLinha({ tipo: "peca", p })}
                onMouseEnter={() => setAtivo(i)}
                style={estiloOpcao(i)}
              >
                <span aria-hidden="true" style={ladrilho(ativo === i ? T.surface : TOM.laranja.bg)}>
                  <FileText style={{ width: 16, height: 16, color: T.accentText }} />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  {/* Duas linhas antes da reticência: no celular a uma linha
                      cortava justamente o que distingue uma peça da outra
                      ("Wind banner de per…"). */}
                  <span className="csc-duas-linhas" style={{ display: "block", fontSize: FS.body, fontWeight: FW.medio, color: T.text, lineHeight: 1.4 }}>
                    <span style={{ fontFamily: FONT.mono, fontSize: FS.meta, fontWeight: FW.forte }}>{realcar(p.displayId, t)}</span>
                    {" · "}{realcar(p.type, t)}{p.description ? <> — {realcar(p.description, t)}</> : null}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "2px 6px", marginTop: 2, fontSize: FS.meta, color: T.second, lineHeight: 1.4 }}>
                    <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{p.eventName ? realcar(p.eventName, t) : "Sem evento"}</span>
                    {/* A ETAPA com a bolinha da cor dela — a mesma do selo nas
                        telas — e "de quem é a vez": quem busca uma peça citada
                        no WhatsApp quase sempre quer saber com quem ela está. */}
                    <span aria-hidden="true">·</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
                      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: R.pill, backgroundColor: st.dot, flexShrink: 0 }} />
                      <span style={{ color: T.apoio, fontWeight: FW.medio }}>{getStatusLabel(p.status)}</span>
                      {vez ? <span>({vez})</span> : null}
                    </span>
                  </span>
                </span>
                {ativo === i && <CornerDownLeft aria-hidden="true" className="max-md:hidden" style={{ width: 14, height: 14, color: T.accentText, flexShrink: 0 }} />}
              </button>
            );
          })}

          {resultado.eventos.length > 0 && (
            <p style={{ ...ROTULO_SECAO, padding: resultado.pecas.length ? "12px 10px 6px" : "6px 10px 6px" }}>Eventos <span style={{ fontWeight: FW.medio, letterSpacing: 0 }}>· {resultado.eventos.length}</span></p>
          )}
          {resultado.eventos.map((ev, j) => {
            const i = resultado.pecas.length + j;
            return (
              <button
                key={ev.id}
                id={idOpcao(i)}
                type="button"
                role="option"
                aria-selected={ativo === i}
                data-testid={`busca-evento-${ev.id}`}
                onClick={() => abrirLinha({ tipo: "evento", ev })}
                onMouseEnter={() => setAtivo(i)}
                style={estiloOpcao(i)}
              >
                <span aria-hidden="true" style={ladrilho(ativo === i ? T.surface : TOM.info.bg)}>
                  <CalendarDays style={{ width: 16, height: 16, color: TOM.info.text }} />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="csc-duas-linhas" style={{ display: "block", fontSize: FS.body, fontWeight: FW.medio, color: T.text, lineHeight: 1.4 }}>{realcar(ev.name, t)}</span>
                  <span style={{ display: "block", marginTop: 2, fontSize: FS.meta, color: T.second }}>
                    {ev.truckDepartureDate
                      ? `Saída ${new Date(ev.truckDepartureDate).toLocaleDateString("pt-BR", { timeZone: "UTC" })}`
                      : "Evento"}
                  </span>
                </span>
                {ativo === i && <CornerDownLeft aria-hidden="true" className="max-md:hidden" style={{ width: 14, height: 14, color: T.accentText, flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>

        {/* Rodapé de atalhos — só com resultado na tela e só onde há teclado
            (escondido abaixo de 768px). Quem nunca usou a paleta aprende as
            setas sem precisar de manual. O `display` mora na CLASSE: inline,
            ele vencia o `max-md:hidden` e o rodapé de teclado aparecia no
            celular. */}
        {linhas.length > 0 && (
          <div aria-hidden="true" className="flex max-md:hidden" style={{ alignItems: "center", gap: 16, padding: "9px 18px", borderTop: `1px solid ${N.n3}`, backgroundColor: N.n1, fontSize: FS.small, color: T.second }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Tecla>↑</Tecla><Tecla>↓</Tecla> escolher</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Tecla>Enter</Tecla> abrir</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Tecla>Esc</Tecla> fechar</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Uma tecla desenhada — para o rodapé de atalhos. */
function Tecla({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 20, height: 20, padding: "0 5px", borderRadius: 5, border: `1px solid ${T.border}`, borderBottomWidth: 2, backgroundColor: T.surface, fontFamily: FONT.corpo, fontSize: FS.micro, fontWeight: FW.forte, color: T.apoio, boxSizing: "border-box" }}>
      {children}
    </kbd>
  );
}

/**
 * O trecho que casou com o termo, sublinhado em laranja claro: numa lista de
 * oito "WindBanner — Wind banner de percurso", é o realce que mostra POR QUE
 * cada linha apareceu. Só apresentação — a busca de verdade é a do servidor
 * (que também olha o código sem o "#"); aqui, sem casamento literal, o texto
 * passa intacto.
 */
function realcar(texto: string, termo: string): React.ReactNode {
  const alvo = termo.replace(/^#/, "").trim();
  if (alvo.length < 2) return texto;
  const i = texto.toLocaleLowerCase("pt-BR").indexOf(alvo.toLocaleLowerCase("pt-BR"));
  if (i < 0) return texto;
  return (
    <>
      {texto.slice(0, i)}
      <mark style={{ backgroundColor: "transparent", color: "inherit", fontWeight: FW.forte, boxShadow: `inset 0 -0.4em 0 ${TOM.laranja.border}`, borderRadius: 2 }}>
        {texto.slice(i, i + alvo.length)}
      </mark>
      {texto.slice(i + alvo.length)}
    </>
  );
}
