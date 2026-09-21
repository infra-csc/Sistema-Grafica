// ─────────────────────────────────────────────────────────────────────────────
// OS REGISTROS DOS TUBOS (dono, 21/09: "inclusive isso aparecer nos registros:
// todos os itens que foram no tubo").
//
// A galeria de Registros é UMA FOTO POR PEÇA — e a foto do tubo é UMA para
// várias peças. Em vez de repetir a mesma imagem em cada uma (76 peças, 76
// vezes a mesma foto), o tubo tem a SUA entrada: "Tubo 2 · entregue a Fulano em
// 21/09 14:32 · 4 peças / 61 un.", que abre para mostrar TUDO o que foi junto
// (código, tipo + descrição, a quantidade naquele tubo e "(7 de 10)" se a peça
// foi dividida), as fotos da embalagem e o comprovante, se houver. A embalada
// SOZINHA tem o registro dela, sem a palavra "tubo".
//
// Respeita o filtro de evento e a busca da própria página (chegam por props) —
// a busca acha por código, descrição, evento, nº do tubo e quem recebeu.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Package, Truck } from "lucide-react";
import { nomeDaPeca } from "@shared/nome-da-peca";
import { parteDoTotal } from "@shared/embalagem";
import { semAcento } from "@/lib/etiqueta-lista";
import { useIsMobile } from "@/hooks/use-mobile";

export type RegistroDeTubo = {
  id: string; numero: number; avulso: boolean; eventId: string; eventName: string;
  fotos: string[]; embaladoEm: string | null; embaladoPor: string | null;
  entregueEm: string | null; recebidoPor: string | null; entreguePor: string | null; comprovante: string | null; observacao: string | null;
  itens: Array<{ id: string; displayId: string | null; type: string; description: string | null; quantity: number; quantidadeNoTubo: number; excluida?: boolean }>;
  unidades: number;
};
const SEM_REGISTROS: RegistroDeTubo[] = [];
const LOTE = 12;
const COR = { texto: "#1c1917", sec: "#57534e", borda: "#e7e5e4", fundo: "#fafaf9", laranja: "#c2410c", verde: "#15803d", azul: "#1d4ed8" };
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "Tubo 2 · entregue a Fulano em 21/09 14:32 · 4 peças / 61 un." — a frase do registro, inteira. */
export function fraseDoRegistro(t: RegistroDeTubo): string {
  const quem = t.avulso ? `${t.itens[0]?.displayId ?? "Peça"} embalada sozinha` : `Tubo ${t.numero}`;
  const estado = t.entregueEm
    ? `entregue${t.recebidoPor ? ` a ${t.recebidoPor}` : ""} em ${quando(t.entregueEm)}`
    : `embalado${t.embaladoPor ? ` por ${t.embaladoPor}` : ""}${t.embaladoEm ? ` em ${quando(t.embaladoEm)}` : ""} — aguarda a entrega`;
  return `${quem} · ${estado} · ${plural(t.itens.length, "peça", "peças")} / ${t.unidades} un.`;
}

export function registroCasa(t: RegistroDeTubo, busca: string): boolean {
  const palavras = semAcento(busca).trim().split(/ +/).filter(Boolean);
  if (!palavras.length) return true;
  const alvo = semAcento([t.avulso ? "sozinha" : `tubo ${t.numero}`, t.eventName, t.recebidoPor ?? "", t.embaladoPor ?? "", ...t.itens.flatMap((i) => [i.displayId ?? "", i.type, i.description ?? ""])].join(" "));
  return palavras.every((p) => alvo.includes(p));
}

export function RegistrosDeTubos({ eventIds = [], busca = "", itemId, onAbrirPeca }: {
  /** O filtro de evento da página (vazio = todos). */
  eventIds?: string[];
  busca?: string;
  /** Na FICHA da peça: só os volumes em que ESTA peça foi — o tubo como um todo, com o que foi junto. */
  itemId?: string;
  onAbrirPeca?: (itemId: string) => void;
}) {
  const isMobile = useIsMobile();
  const alvo = isMobile ? 44 : 32;
  const { data = SEM_REGISTROS, isError } = useQuery<RegistroDeTubo[]>({ queryKey: ["/api/registros/tubos"], staleTime: 60_000 });
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [mostrando, setMostrando] = useState(LOTE);
  const lista = useMemo(
    () => data.filter((t) => (!itemId || t.itens.some((i) => i.id === itemId)) && (eventIds.length === 0 || eventIds.includes(t.eventId)) && registroCasa(t, busca)),
    [data, eventIds, busca, itemId],
  );
  // Sem tubo nenhum (ou erro nesta consulta), a galeria de sempre segue sozinha:
  // esta seção é um ACRÉSCIMO, nunca um buraco na página.
  if (isError || lista.length === 0) return null;

  return (
    <section data-testid="registros-de-tubos" aria-label="Registros dos tubos e embalagens" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 style={{ margin: 0, fontSize: isMobile ? 14 : 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: COR.sec }}>
        {itemId ? "Embalagem — o que foi junto" : `Tubos e embalagens · ${lista.length}`}
      </h2>
      {lista.slice(0, mostrando).map((t) => {
        const aberto = abertos.has(t.id);
        return (
          <article key={t.id} data-testid={`registro-tubo-${t.id}`} style={{ border: `1px solid ${COR.borda}`, borderRadius: 12, background: "#fff", overflow: "hidden" }}>
            <button type="button" aria-expanded={aberto} data-testid={`abrir-registro-tubo-${t.id}`}
              onClick={() => setAbertos((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: isMobile ? 56 : 48, padding: "8px 12px", border: "none", background: aberto ? COR.fundo : "#fff", textAlign: "left", cursor: "pointer" }}>
              {t.entregueEm ? <Truck aria-hidden="true" style={{ width: 16, height: 16, color: COR.verde, flexShrink: 0 }} /> : <Package aria-hidden="true" style={{ width: 16, height: 16, color: COR.azul, flexShrink: 0 }} />}
              {t.fotos[0] && <img src={t.fotos[0]} alt="" loading="lazy" style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover", border: `1px solid ${COR.borda}`, flexShrink: 0 }} />}
              <span style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: isMobile ? 14 : 13, fontWeight: 700, color: COR.texto, overflowWrap: "anywhere" }}>{fraseDoRegistro(t)}</span>
                <span style={{ fontSize: 12.5, color: COR.sec, overflowWrap: "anywhere" }}>{t.eventName} · {t.fotos.length ? plural(t.fotos.length, "foto", "fotos") : "sem foto da embalagem"}</span>
              </span>
              <ChevronDown aria-hidden="true" style={{ width: 16, height: 16, color: COR.sec, flexShrink: 0, transform: aberto ? "rotate(180deg)" : undefined }} />
            </button>

            {aberto && (
              <div data-testid={`conteudo-registro-tubo-${t.id}`} style={{ padding: "10px 12px 12px", borderTop: `1px solid ${COR.borda}`, display: "flex", flexDirection: "column", gap: 10 }}>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 2 }}>
                  {t.itens.map((i) => {
                    const parte = parteDoTotal(i.quantidadeNoTubo, i.quantity);
                    return (
                      <li key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13, color: COR.texto }}>
                        {onAbrirPeca && !i.excluida ? (
                          <button type="button" onClick={() => onAbrirPeca(i.id)} aria-label={`Abrir a ficha de ${i.displayId ?? "peça"}`}
                            style={{ minHeight: alvo, padding: 0, border: "none", background: "none", fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 700, color: COR.laranja, textDecoration: "underline", cursor: "pointer" }}>
                            {i.displayId ?? "—"}
                          </button>
                        ) : (
                          <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, color: COR.laranja }}>{i.displayId ?? "—"}</span>
                        )}
                        <span style={{ flex: "1 1 140px", minWidth: 0, overflowWrap: "anywhere" }}>{nomeDaPeca(i.type, i.description)}{i.excluida ? " (peça excluída depois)" : ""}</span>
                        <strong style={{ whiteSpace: "nowrap" }}>{i.quantidadeNoTubo} un.{parte ? <span style={{ fontWeight: 400, color: COR.sec }}> {parte}</span> : null}</strong>
                      </li>
                    );
                  })}
                </ul>
                {(t.fotos.length > 0 || t.comprovante) && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {t.fotos.map((url, n) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer" aria-label={`Foto ${n + 1} da embalagem — abrir`} style={{ width: 64, height: 64, borderRadius: 8, overflow: "hidden", border: `1px solid ${COR.borda}`, display: "block" }}>
                        <img src={url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </a>
                    ))}
                    {t.comprovante && (
                      <a href={t.comprovante} target="_blank" rel="noreferrer" aria-label="Comprovante da entrega — abrir" title="Comprovante da entrega" style={{ width: 64, height: 64, borderRadius: 8, overflow: "hidden", border: `2px solid ${COR.verde}`, display: "block" }}>
                        <img src={t.comprovante} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </a>
                    )}
                  </div>
                )}
                <span style={{ fontSize: 12.5, color: COR.sec }}>
                  {t.embaladoPor || t.embaladoEm ? `Embalado${t.embaladoPor ? ` por ${t.embaladoPor}` : ""}${t.embaladoEm ? ` em ${quando(t.embaladoEm)}` : ""}` : "Sem foto da embalagem — as fotos da conferência valem"}
                  {t.entregueEm ? ` · entrega registrada${t.entreguePor ? ` por ${t.entreguePor}` : ""}` : ""}
                  {t.observacao ? ` · obs.: ${t.observacao}` : ""}
                </span>
              </div>
            )}
          </article>
        );
      })}
      {lista.length > mostrando && (
        <button type="button" onClick={() => setMostrando((n) => n + LOTE)} data-testid="registros-de-tubos-mais"
          style={{ alignSelf: "center", minHeight: isMobile ? 48 : 40, padding: "0 18px", borderRadius: 8, border: `1px solid ${COR.borda}`, background: "#fff", color: COR.texto, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Mostrar mais ({lista.length - mostrando} de {lista.length})
        </button>
      )}
    </section>
  );
}
