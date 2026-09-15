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
import { Search, CalendarDays, FileText, CornerDownLeft, Loader2 } from "lucide-react";
import { getStatusLabel } from "@/lib/status";

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
  margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#78716c",
};
const MENSAGEM: React.CSSProperties = { margin: 0, padding: "20px 16px", fontSize: 13, color: "#746e69", lineHeight: 1.5 };

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
    display: "flex", alignItems: "center", gap: 10, width: "100%",
    minHeight: 44, padding: "8px 10px", border: "none", borderRadius: 8,
    backgroundColor: ativo === i ? "#fff7ed" : "transparent",
    cursor: "pointer", textAlign: "left", font: "inherit",
  });

  return (
    <div
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        backgroundColor: "rgba(28,25,23,0.4)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "12vh 16px 16px",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Busca global"
        data-testid="busca-global"
        className="norte-surge"
        style={{
          width: "100%", maxWidth: 560,
          backgroundColor: "#ffffff", borderRadius: 12,
          boxShadow: "0 20px 50px rgba(28,25,23,0.22)",
          overflow: "hidden", display: "flex", flexDirection: "column",
          maxHeight: "70vh",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 10px 0 16px", borderBottom: "1px solid #e7e5e4" }}>
          {/* Lupa vira giro enquanto a consulta está no ar: sem isto, os 250ms
              de debounce + a ida ao servidor pareciam "não achou nada". */}
          {buscando
            ? <Loader2 aria-hidden="true" className="animate-spin" style={{ width: 16, height: 16, color: "#746e69", flexShrink: 0 }} />
            : <Search aria-hidden="true" style={{ width: 16, height: 16, color: "#a8a29e", flexShrink: 0 }} />}
          <input
            ref={inputRef}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Código da peça (#2993), descrição ou evento…"
            aria-label="Buscar peça ou evento"
            role="combobox"
            aria-expanded={linhas.length > 0}
            aria-controls="busca-global-resultados"
            aria-activedescendant={linhas[ativo] ? idOpcao(ativo) : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            data-testid="input-busca-global"
            style={{
              flex: 1, minWidth: 0, height: 52, border: "none", outline: "none",
              fontSize: 15, fontFamily: "inherit", color: "#1c1917",
              backgroundColor: "transparent",
            }}
          />
          {/* O "Esc" era só um desenho de tecla: no celular, onde não existe
              Esc, não havia como fechar a paleta além de tocar no escuro em
              volta. Agora é um botão de verdade, e continua dizendo o atalho. */}
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar busca"
            style={{ flexShrink: 0, minWidth: 36, height: 32, padding: "0 8px", fontSize: 11, fontWeight: 600, color: "#746e69", background: "#ffffff", border: "1px solid #e7e5e4", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}
          >
            Esc
          </button>
        </div>

        <div ref={listaRef} id="busca-global-resultados" role="listbox" aria-label="Resultados" style={{ overflowY: "auto", overscrollBehavior: "contain", padding: linhas.length ? 8 : 0 }}>
          {t.length < 2 && (
            <p style={MENSAGEM}>
              Digite ao menos 2 caracteres. Dica: o código funciona com ou sem o “#”.
            </p>
          )}
          {t.length >= 2 && buscando && linhas.length === 0 && (
            <p role="status" style={MENSAGEM}>Buscando “{t}”…</p>
          )}
          {erro && !buscando && (
            <p role="alert" data-testid="busca-erro" style={{ ...MENSAGEM, color: "#b91c1c" }}>
              Não deu para buscar agora. Confira a conexão e digite de novo.
            </p>
          )}
          {semResultado && (
            <p data-testid="busca-sem-resultado" style={MENSAGEM}>
              Nada com “{t}” — nem peça, nem evento. Peças excluídas não aparecem aqui.
            </p>
          )}

          {resultado.pecas.length > 0 && (
            <p style={{ ...ROTULO_SECAO, padding: "6px 10px 4px" }}>Peças</p>
          )}
          {resultado.pecas.map((p, i) => (
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
              <FileText aria-hidden="true" style={{ width: 15, height: 15, color: "#c2410c", flexShrink: 0 }} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "#1c1917", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.displayId} · {p.type}{p.description ? ` — ${p.description}` : ""}
                </span>
                <span style={{ display: "block", fontSize: 11.5, color: "#746e69", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.eventName ?? "Sem evento"} · {getStatusLabel(p.status)}
                </span>
              </span>
              {ativo === i && <CornerDownLeft aria-hidden="true" style={{ width: 13, height: 13, color: "#a8a29e", flexShrink: 0 }} />}
            </button>
          ))}

          {resultado.eventos.length > 0 && (
            <p style={{ ...ROTULO_SECAO, padding: "10px 10px 4px" }}>Eventos</p>
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
                <CalendarDays aria-hidden="true" style={{ width: 15, height: 15, color: "#1d4ed8", flexShrink: 0 }} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "#1c1917", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.name}</span>
                  {ev.truckDepartureDate && (
                    <span style={{ display: "block", fontSize: 11.5, color: "#746e69" }}>
                      Saída {new Date(ev.truckDepartureDate).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                    </span>
                  )}
                </span>
                {ativo === i && <CornerDownLeft aria-hidden="true" style={{ width: 13, height: 13, color: "#a8a29e", flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>

        {/* Rodapé de atalhos — só com resultado na tela e só onde há teclado
            (escondido abaixo de 768px). Quem nunca usou a paleta aprende as
            setas sem precisar de manual. */}
        {linhas.length > 0 && (
          <div aria-hidden="true" className="max-md:hidden" style={{ display: "flex", gap: 14, padding: "8px 16px", borderTop: "1px solid #f1efec", fontSize: 11, color: "#746e69" }}>
            <span>↑ ↓ para escolher</span>
            <span>Enter para abrir</span>
            <span>Esc para fechar</span>
          </div>
        )}
      </div>
    </div>
  );
}
