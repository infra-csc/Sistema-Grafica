// ─────────────────────────────────────────────────────────────────────────────
// A PRÉVIA ANTES DA PLANILHA — o painel da direita enquanto nada foi lido.
//
// Antes ele simplesmente não existia: o modal abria com a barra lateral à
// esquerda e uma metade branca, vazia, à direita — cara de tela quebrada. Agora
// o lugar da tabela mostra o que vai aparecer ali (o esqueleto das colunas do
// formato NORTE) e os três passos da tarefa, na ordem em que acontecem.
// Só apresentação: nenhuma regra mora aqui.
// ─────────────────────────────────────────────────────────────────────────────
import { Table2 } from "lucide-react";
import { T, N, FONT, FS, FW, R } from "@/lib/theme";

const COLUNAS = ["Item", "Qtde", "Material", "Acabamento"] as const;
const PASSOS = [
  "Escolha a planilha no formato NORTE (à esquerda).",
  "Pré-visualize: cada linha aparece aqui para revisar e corrigir.",
  "Importe — as peças entram em Rascunho no evento.",
] as const;

export function PreviaVazia() {
  return (
    <div data-testid="previa-vazia" style={{ flex: 1, minWidth: 0, backgroundColor: N.n1, padding: "28px 28px 24px", display: "flex", flexDirection: "column", gap: 20, overflowY: "auto" }}>
      {/* O esqueleto da tabela: as colunas do formato e linhas apagadas. */}
      <div aria-hidden="true" style={{ border: `1px solid ${T.border}`, borderRadius: R.lg, backgroundColor: T.surface, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2.2fr 0.8fr 1.4fr 1.4fr", borderBottom: `1px solid ${T.border}` }}>
          {COLUNAS.map((c) => (
            <span key={c} style={{ padding: "10px 12px", fontSize: FS.micro, fontWeight: FW.forte, letterSpacing: "0.08em", textTransform: "uppercase", color: T.second }}>{c}</span>
          ))}
        </div>
        {[0.9, 0.7, 0.8, 0.6].map((w, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2.2fr 0.8fr 1.4fr 1.4fr", alignItems: "center", borderTop: i === 0 ? "none" : `1px solid ${N.n3}` }}>
            {[w, 0.4, 0.75, 0.6].map((f, j) => (
              <span key={j} style={{ padding: "12px" }}>
                <span style={{ display: "block", height: 8, width: `${f * 100}%`, borderRadius: R.pill, backgroundColor: N.n3 }} />
              </span>
            ))}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div aria-hidden="true" style={{ width: 34, height: 34, borderRadius: R.md, backgroundColor: T.surface, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Table2 style={{ width: 16, height: 16, color: T.second }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontFamily: FONT.display, fontSize: FS.strong, fontWeight: FW.forte, color: T.text, letterSpacing: "-0.01em" }}>
            A prévia da planilha aparece aqui
          </p>
          <ol style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {PASSOS.map((p, i) => (
              <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: FS.body, color: T.apoio, lineHeight: 1.45 }}>
                <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: R.pill, backgroundColor: T.surface, border: `1px solid ${T.border}`, fontFamily: FONT.mono, fontSize: FS.small, fontWeight: FW.forte, color: T.apoio, display: "inline-flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                  {i + 1}
                </span>
                {p}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
