// ─────────────────────────────────────────────────────────────────────────────
// OS REGISTROS DOS TUBOS (dono, 21/09: "inclusive isso aparecer nos registros:
// todos os itens que foram no tubo").
//
// A galeria de Registros é UMA FOTO POR PEÇA — e a foto do tubo é UMA para
// várias peças. Em vez de repetir a mesma imagem em cada uma (76 peças, 76
// vezes a mesma foto), o volume tem o SEU cartão.
//
// FORMA (dono, 22/09: "as visões do tubo têm que ser semelhantes à conferência
// e à entrega"): o mesmo CARTÃO COM FOTO da galeria — foto quadrada, selo do
// tipo em cima à esquerda, código à direita, e a legenda embaixo. A lista do
// que foi junto (código, tipo + descrição, a quantidade naquele volume e
// "(7 de 10)" quando a peça foi dividida) abre dentro do próprio cartão, e a
// foto amplia na mesma lupa da galeria, com ← → entre as fotos do volume e o
// comprovante da entrega. A embalada SOZINHA tem o cartão dela, sem a palavra
// "tubo".
//
// Respeita o filtro de evento, o PERÍODO e a busca da própria página (chegam
// por props) — a busca acha por código, descrição, evento, nº do tubo e quem
// recebeu. Os três vão ao servidor, que devolve só a PÁGINA pedida (os mais
// recentes primeiro); "Mostrar mais" pede a próxima (revisão de 22/09).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, Package, Truck, ZoomIn, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { nomeDaPeca } from "@shared/nome-da-peca";
import { parteDoTotal } from "@shared/embalagem";
import { semAcento } from "@/lib/etiqueta-lista";
import { useIsMobile, usePonteiroGrosso, alvo as alvoDoPonteiro } from "@/hooks/use-mobile";
import { T, TOM, FS, FW, FONT, R, SHADOW } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";

export type RegistroDeTubo = {
  id: string; numero: number; avulso: boolean; eventId: string; eventName: string;
  fotos: string[]; embaladoEm: string | null; embaladoPor: string | null;
  entregueEm: string | null; recebidoPor: string | null; entreguePor: string | null; comprovante: string | null; observacao: string | null;
  itens: Array<{ id: string; displayId: string | null; type: string; description: string | null; quantity: number; quantidadeNoTubo: number; excluida?: boolean }>;
  unidades: number;
};
const SEM_REGISTROS: RegistroDeTubo[] = [];
const LOTE = 12;
const COR = { texto: T.text, sec: T.apoio, borda: T.border, fundo: T.bg, laranja: T.accentText, verde: TOM.sucesso.text, azul: TOM.info.text };
// Os mesmos dois selos da galeria: a entrega é roxa como a foto de entrega, e
// a embalagem (que a galeria não tem) fica azul — nunca laranja, que é o
// destaque da marca.
const SELO = {
  embalado: { rotulo: "Embalagem", cor: TOM.info.text, icone: Package },
  entregue: { rotulo: "Entrega", cor: TOM.roxo.text, icone: Truck },
} as const;
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "Tubo 2" / "#0390 embalada sozinha" — o nome do volume. */
export function nomeDoVolume(t: RegistroDeTubo): string {
  return t.avulso ? `${t.itens[0]?.displayId ?? "Peça"} embalada sozinha` : `Tubo ${t.numero}`;
}

/** "Tubo 2 · entregue a Fulano em 21/09 14:32 · 4 peças / 61 un." — a frase do registro, inteira. */
export function fraseDoRegistro(t: RegistroDeTubo): string {
  const estado = t.entregueEm
    ? `entregue${t.recebidoPor ? ` a ${t.recebidoPor}` : ""} em ${quando(t.entregueEm)}`
    : `embalado${t.embaladoPor ? ` por ${t.embaladoPor}` : ""}${t.embaladoEm ? ` em ${quando(t.embaladoEm)}` : ""} — aguarda a entrega`;
  return `${nomeDoVolume(t)} · ${estado} · ${plural(t.itens.length, "peça", "peças")} / ${t.unidades} un.`;
}

export function registroCasa(t: RegistroDeTubo, busca: string): boolean {
  const palavras = semAcento(busca).trim().split(/ +/).filter(Boolean);
  if (!palavras.length) return true;
  const alvo = semAcento([t.avulso ? "sozinha" : `tubo ${t.numero}`, t.eventName, t.recebidoPor ?? "", t.embaladoPor ?? "", ...t.itens.flatMap((i) => [i.displayId ?? "", i.type, i.description ?? ""])].join(" "));
  return palavras.every((p) => alvo.includes(p));
}

/** As fotos ampliáveis de um volume: as da embalagem e, por último, o comprovante. */
function fotosDoVolume(t: RegistroDeTubo): Array<{ url: string; legenda: string }> {
  return [
    ...t.fotos.map((url, n) => ({ url, legenda: `Foto ${n + 1} da embalagem — ${nomeDoVolume(t)}` })),
    ...(t.comprovante ? [{ url: t.comprovante, legenda: `Comprovante da entrega — ${nomeDoVolume(t)}` }] : []),
  ];
}

export function RegistrosDeTubos({ eventIds = [], busca = "", desde = null, itemId, onAbrirPeca }: {
  /** O filtro de evento da página (vazio = todos). */
  eventIds?: string[];
  busca?: string;
  /** O filtro de PERÍODO da página: só volumes embalados/entregues a partir daqui (null = todos). */
  desde?: Date | null;
  /** Na FICHA da peça: só os volumes em que ESTA peça foi — o tubo como um todo, com o que foi junto. */
  itemId?: string;
  onAbrirPeca?: (itemId: string) => void;
}) {
  const isMobile = useIsMobile();
  // Dedo no tablet do galpão também conta, não só a largura de celular.
  const grosso = usePonteiroGrosso() || isMobile;
  const alvo = alvoDoPonteiro(32, grosso);
  // A PÁGINA do servidor: começa com 4 lotes; "Mostrar mais", quando a lista
  // local acaba e o servidor mandou a página cheia, pede mais 4.
  const [pagina, setPagina] = useState(LOTE * 4);
  const desdeIso = desde ? desde.toISOString() : "";
  const filtros = `${eventIds.join(",")}|${busca.trim()}|${desdeIso}|${itemId ?? ""}`;
  const [filtrosVistos, setFiltrosVistos] = useState(filtros);
  const [mostrando, setMostrando] = useState(LOTE);
  // Filtro mudou: volta ao começo (a página e o que está à vista).
  if (filtros !== filtrosVistos) { setFiltrosVistos(filtros); setPagina(LOTE * 4); setMostrando(LOTE); }
  const parametros = new URLSearchParams();
  if (itemId) parametros.set("itemId", itemId);
  if (desdeIso) parametros.set("desde", desdeIso);
  if (eventIds.length) parametros.set("eventos", eventIds.join(","));
  if (busca.trim()) parametros.set("busca", busca.trim());
  parametros.set("limite", String(pagina));
  const { data = SEM_REGISTROS, isError } = useQuery<RegistroDeTubo[]>({
    queryKey: ["/api/registros/tubos", `?${parametros.toString()}`], staleTime: 60_000, placeholderData: keepPreviousData,
  });
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  // A lupa: qual volume e qual foto dele estão ampliados.
  const [zoom, setZoom] = useState<{ tuboId: string; n: number } | null>(null);
  // O servidor já filtrou; o filtro aqui repete a MESMA regra (inofensivo) e
  // cobre a resposta antiga que ainda vier sem recorte.
  const desdeMs = desde ? desde.getTime() : null;
  const lista = useMemo(
    () => data.filter((t) => (!itemId || t.itens.some((i) => i.id === itemId)) && (eventIds.length === 0 || eventIds.includes(t.eventId))
      && (desdeMs === null || new Date(t.entregueEm ?? t.embaladoEm ?? 0).getTime() >= desdeMs) && registroCasa(t, busca)),
    [data, eventIds, busca, itemId, desdeMs],
  );
  const volumeEmZoom = zoom ? lista.find((t) => t.id === zoom.tuboId) ?? null : null;
  const fotosEmZoom = volumeEmZoom ? fotosDoVolume(volumeEmZoom) : [];
  const fotoEmZoom = zoom && fotosEmZoom.length ? fotosEmZoom[Math.min(zoom.n, fotosEmZoom.length - 1)] : null;
  // Teclado na lupa, como na galeria: Esc fecha, ← → andam entre as fotos.
  useEffect(() => {
    if (!fotoEmZoom) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setZoom(null); return; }
      if (e.key === "ArrowLeft") setZoom((z) => (z ? { ...z, n: (z.n - 1 + fotosEmZoom.length) % fotosEmZoom.length } : z));
      if (e.key === "ArrowRight") setZoom((z) => (z ? { ...z, n: (z.n + 1) % fotosEmZoom.length } : z));
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [fotoEmZoom, fotosEmZoom.length]);
  // Página cheia = pode haver mais no servidor.
  const temMaisNoServidor = data.length >= pagina;
  // Sem tubo nenhum (ou erro nesta consulta), a galeria de sempre segue sozinha:
  // esta seção é um ACRÉSCIMO, nunca um buraco na página.
  if (isError || lista.length === 0) return null;

  return (
    <section data-testid="registros-de-tubos" aria-label="Registros dos tubos e embalagens" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h2 style={{ margin: 0, fontFamily: FONT.display, fontSize: isMobile ? FS.read : FS.body, fontWeight: FW.forte, color: COR.sec }}>
          {itemId ? "Embalagem — o que foi junto" : `Tubos e embalagens · ${lista.length}`}
        </h2>
        <span aria-hidden="true" style={{ flex: 1, height: 1, backgroundColor: COR.borda }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(220px, 1fr))", gap: 20 }}>
        {lista.slice(0, mostrando).map((t) => {
          const aberto = abertos.has(t.id);
          const selo = t.entregueEm ? SELO.entregue : SELO.embalado;
          const Icone = selo.icone;
          const fotos = fotosDoVolume(t);
          const capa = fotos[0];
          const estado = t.entregueEm
            ? `Entregue${t.recebidoPor ? ` a ${t.recebidoPor}` : ""} em ${quando(t.entregueEm)}`
            : `Embalado${t.embaladoPor ? ` por ${t.embaladoPor}` : ""}${t.embaladoEm ? ` em ${quando(t.embaladoEm)}` : ""}`;
          return (
            <article key={t.id} data-testid={`registro-tubo-${t.id}`}
              style={{ backgroundColor: T.surface, border: `1px solid ${COR.borda}`, borderRadius: R.lg, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: SHADOW.sm }}>
              <div style={{ position: "relative" }}>
                {capa ? (
                  <button type="button" data-testid={`ampliar-registro-tubo-${t.id}`}
                    onClick={() => setZoom({ tuboId: t.id, n: 0 })}
                    aria-label={`Ampliar: ${capa.legenda}`}
                    /* Quadrado, como os cartões da galeria: a foto do galpão
                       vem em pé e deitada, e o quadrado corta as duas igual. */
                    style={{ display: "block", position: "relative", width: "100%", aspectRatio: "1/1", border: "none", padding: 0, backgroundColor: COR.fundo, cursor: "zoom-in" }}>
                    <img src={capa.url} alt={capa.legenda} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    <span className="opacity-0 group-hover:opacity-100" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(28,25,23,0.18)" }}>
                      <ZoomIn aria-hidden="true" style={{ width: 22, height: 22, color: T.surface }} />
                    </span>
                  </button>
                ) : (
                  <div style={{ width: "100%", aspectRatio: "1/1", backgroundColor: COR.fundo, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS.meta, color: COR.sec, textAlign: "center", padding: 12 }}>
                    Sem foto da embalagem — as fotos da conferência valem
                  </div>
                )}
                <span style={{ position: "absolute", top: 8, left: 8, display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS.small, fontWeight: FW.forte, color: T.surface, backgroundColor: selo.cor, borderRadius: R.sm, padding: "3px 7px" }}>
                  <Icone aria-hidden="true" style={{ width: 10, height: 10 }} /> {selo.rotulo}
                </span>
                <span style={{ position: "absolute", top: 8, right: 8, fontFamily: FONT.mono, fontSize: FS.meta, fontWeight: FW.forte, color: T.surface, backgroundColor: "rgba(28,25,23,0.72)", borderRadius: R.sm, padding: "2px 7px" }}>
                  {t.avulso ? t.itens[0]?.displayId ?? "Avulso" : `Tubo ${t.numero}`}
                </span>
                {fotos.length > 1 && (
                  <span style={{ position: "absolute", left: 8, bottom: 8, fontSize: FS.small, fontWeight: FW.forte, color: T.surface, backgroundColor: "rgba(28,25,23,0.6)", borderRadius: R.pill, padding: "2px 8px" }}>
                    {plural(fotos.length, "foto", "fotos")}
                  </span>
                )}
              </div>

              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                <p style={{ margin: 0, fontSize: FS.read, fontWeight: FW.forte, color: COR.texto, lineHeight: 1.3 }}>
                  {t.avulso ? "Embalada sozinha" : `Tubo ${t.numero}`}
                  <span style={{ fontWeight: 400, color: COR.sec }}> — {plural(t.itens.length, "peça", "peças")} / {t.unidades} un.</span>
                </p>
                {t.eventId ? (
                  <Link href={`/eventos/${t.eventId}`} className="hover:underline" style={{ fontSize: FS.meta, color: COR.laranja, fontWeight: FW.medio, textDecoration: "none" }}>{t.eventName}</Link>
                ) : (
                  <p style={{ margin: 0, fontSize: FS.meta, color: COR.sec }}>Sem evento</p>
                )}
                <p style={{ margin: 0, fontSize: FS.meta, color: COR.sec, lineHeight: 1.45 }}>
                  {estado}
                  {!t.entregueEm ? " — aguarda a entrega" : ""}
                  {t.observacao ? ` · obs.: ${t.observacao}` : ""}
                </p>

                <button type="button" aria-expanded={aberto} data-testid={`abrir-registro-tubo-${t.id}`}
                  onClick={() => setAbertos((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
                  style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%", minHeight: isMobile ? 56 : 44, padding: "0 10px", borderRadius: R.md, border: `1px solid ${COR.borda}`, background: aberto ? COR.fundo : T.surface, color: COR.texto, fontSize: FS.body, fontWeight: FW.forte, cursor: "pointer", textAlign: "left" }}>
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{aberto ? "Ocultar o que foi junto" : `Ver o que foi junto (${t.itens.length})`}</span>
                  <ChevronDown aria-hidden="true" style={{ width: 16, height: 16, color: COR.sec, flexShrink: 0, transform: aberto ? "rotate(180deg)" : undefined }} />
                </button>
                {/* A frase inteira serve ao leitor de tela e à busca da página,
                    sem repetir na tela o que os pedaços acima já dizem. */}
                <span className="sr-only">{fraseDoRegistro(t)}</span>

                {aberto && (
                  <div data-testid={`conteudo-registro-tubo-${t.id}`} style={{ borderTop: `1px solid ${COR.borda}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 2 }}>
                      {t.itens.map((i) => {
                        const parte = parteDoTotal(i.quantidadeNoTubo, i.quantity);
                        return (
                          <li key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: FS.body, color: COR.texto }}>
                            {onAbrirPeca && !i.excluida ? (
                              <button type="button" onClick={() => onAbrirPeca(i.id)} aria-label={`Abrir a ficha de ${i.displayId ?? "peça"}`}
                                style={{ minHeight: alvo, padding: 0, border: "none", background: "none", fontFamily: FONT.mono, fontSize: FS.body, fontWeight: FW.forte, color: COR.laranja, textDecoration: "underline", cursor: "pointer" }}>
                                {i.displayId ?? "—"}
                              </button>
                            ) : (
                              <span style={{ fontFamily: FONT.mono, fontWeight: FW.forte, color: COR.laranja }}>{i.displayId ?? "—"}</span>
                            )}
                            <span style={{ flex: "1 1 140px", minWidth: 0, overflowWrap: "anywhere" }}>{nomeDaPeca(i.type, i.description)}{i.excluida ? " (peça excluída depois)" : ""}</span>
                            <strong style={{ whiteSpace: "nowrap" }}>{i.quantidadeNoTubo} un.{parte ? <span style={{ fontWeight: 400, color: COR.sec }}> {parte}</span> : null}</strong>
                          </li>
                        );
                      })}
                    </ul>
                    {fotos.length > 0 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {fotos.map((f, n) => (
                          <button key={f.url} type="button" onClick={() => setZoom({ tuboId: t.id, n })} aria-label={`${f.legenda} — ampliar`}
                            style={{ width: 64, height: 64, borderRadius: R.md, overflow: "hidden", border: f.url === t.comprovante ? `2px solid ${COR.verde}` : `1px solid ${COR.borda}`, padding: 0, background: "none", cursor: "zoom-in" }}>
                            <img src={f.url} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          </button>
                        ))}
                      </div>
                    )}
                    <span style={{ fontSize: FS.meta, color: COR.sec }}>
                      {t.embaladoPor || t.embaladoEm ? `Embalado${t.embaladoPor ? ` por ${t.embaladoPor}` : ""}${t.embaladoEm ? ` em ${quando(t.embaladoEm)}` : ""}` : "Sem foto da embalagem — as fotos da conferência valem"}
                      {t.entregueEm ? ` · entrega registrada${t.entreguePor ? ` por ${t.entreguePor}` : ""}` : ""}
                    </span>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {(lista.length > mostrando || temMaisNoServidor) && (
        <Botao variante="secundario" tamanho={grosso ? "toque" : "md"} data-testid="registros-de-tubos-mais"
          onClick={() => { if (lista.length <= mostrando + LOTE && temMaisNoServidor) setPagina((n) => n + LOTE * 4); setMostrando((n) => n + LOTE); }}
          style={{ alignSelf: "center" }}>
          {temMaisNoServidor ? "Mostrar mais" : `Mostrar mais (${lista.length - mostrando} de ${lista.length})`}
        </Botao>
      )}

      {fotoEmZoom && volumeEmZoom && (
        <div role="dialog" aria-modal="true" aria-label={fotoEmZoom.legenda} data-testid="zoom-registro-tubo"
          onClick={() => setZoom(null)}
          style={{ position: "fixed", inset: 0, zIndex: 60, backgroundColor: "rgba(28,25,23,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 16 }}>
          <img src={fotoEmZoom.url} alt={fotoEmZoom.legenda} onClick={(e) => e.stopPropagation()} decoding="async"
            style={{ maxWidth: "100%", maxHeight: "72vh", objectFit: "contain", borderRadius: R.md }} />
          <p style={{ margin: 0, color: T.surface, fontSize: FS.body, textAlign: "center" }}>
            {fraseDoRegistro(volumeEmZoom)}{fotosEmZoom.length > 1 ? ` · foto ${Math.min(zoom!.n, fotosEmZoom.length - 1) + 1} de ${fotosEmZoom.length}` : ""}
          </p>
          <button type="button" aria-label="Fechar" onClick={() => setZoom(null)}
            style={{ position: "absolute", top: 12, right: 12, width: 44, height: 44, borderRadius: R.pill, border: "none", background: "rgba(255,255,255,0.14)", color: T.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X aria-hidden="true" style={{ width: 20, height: 20 }} />
          </button>
          {fotosEmZoom.length > 1 && (
            <>
              <button type="button" aria-label="Foto anterior" data-testid="zoom-tubo-anterior"
                onClick={(e) => { e.stopPropagation(); setZoom((z) => (z ? { ...z, n: (z.n - 1 + fotosEmZoom.length) % fotosEmZoom.length } : z)); }}
                style={{ position: "absolute", left: 12, top: "50%", width: 44, height: 44, borderRadius: R.pill, border: "none", background: "rgba(255,255,255,0.14)", color: T.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ChevronLeft aria-hidden="true" style={{ width: 22, height: 22 }} />
              </button>
              <button type="button" aria-label="Próxima foto" data-testid="zoom-tubo-proxima"
                onClick={(e) => { e.stopPropagation(); setZoom((z) => (z ? { ...z, n: (z.n + 1) % fotosEmZoom.length } : z)); }}
                style={{ position: "absolute", right: 12, top: "50%", width: 44, height: 44, borderRadius: R.pill, border: "none", background: "rgba(255,255,255,0.14)", color: T.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ChevronRight aria-hidden="true" style={{ width: 22, height: 22 }} />
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
