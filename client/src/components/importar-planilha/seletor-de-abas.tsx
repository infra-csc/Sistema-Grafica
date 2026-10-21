// ─────────────────────────────────────────────────────────────────────────────
// QUAL ABA DA PLANILHA (dono, 21/10 — "New Balance BSB.xlsx"): a pasta tinha
// as abas "KIT" e "Arena", e o importador pegava uma em silêncio (a de mais
// peças). Com mais de uma aba com peças, a tela mostra as abas, quantas peças
// cada uma tem, qual foi lida — e deixa trocar. Usado na importação do evento
// e na "Nova remessa do Kit".
// ─────────────────────────────────────────────────────────────────────────────
import { Package } from "lucide-react";
import type { AbaComPecasDaPlanilha } from "@shared/api";
import { T, TOM, R, FS, FW } from "@/lib/theme";
import { alvo, usePonteiroGrosso, useIsMobile } from "@/hooks/use-mobile";

/** "?para=kit" e/ou "?aba=KIT": a leitura para o Kit e a aba escolhida na tela. */
export function consultaDaPrevia(para?: "kit", aba?: string): string {
  const q = new URLSearchParams();
  if (para === "kit") q.set("para", "kit");
  if (aba) q.set("aba", aba);
  const t = q.toString();
  return t ? `?${t}` : "";
}

export function SeletorDeAbas({ abas, pendente, onEscolher }: {
  abas: readonly AbaComPecasDaPlanilha[];
  pendente: boolean;
  onEscolher: (nome: string) => void;
}) {
  const grosso = usePonteiroGrosso();
  const mobile = useIsMobile();
  const dedo = grosso || mobile;
  if (abas.length < 2) return null;
  return (
    <div data-testid="seletor-de-abas" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span id="rotulo-abas-da-planilha" style={{ fontSize: FS.small, fontWeight: FW.rotulo, letterSpacing: "0.08em", textTransform: "uppercase", color: T.apoio }}>
        Aba da planilha
      </span>
      <div role="radiogroup" aria-labelledby="rotulo-abas-da-planilha" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {abas.map((a) => {
          const cor = a.doKit ? TOM.roxo : TOM.sucesso;
          return (
            <button key={a.nome} type="button" role="radio" aria-checked={a.lida} disabled={pendente}
              data-testid={`aba-da-planilha-${a.nome}`}
              onClick={() => { if (!a.lida) onEscolher(a.nome); }}
              title={a.lida ? `As peças em revisão são da aba ${a.nome}` : `Ler as ${a.pecas} peças da aba ${a.nome}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, minHeight: alvo(30, dedo), padding: "0 10px",
                borderRadius: R.pill, border: `1px solid ${a.lida ? cor.text : T.border}`,
                background: a.lida ? cor.bg : T.surface, color: a.lida ? cor.text : T.strong,
                fontSize: FS.meta, fontWeight: a.lida ? FW.forte : FW.rotulo, cursor: pendente ? "wait" : a.lida ? "default" : "pointer",
              }}>
              {a.doKit && <Package size={12} aria-hidden="true" />}
              {a.nome} · {a.pecas} {a.pecas === 1 ? "peça" : "peças"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
