// ─────────────────────────────────────────────────────────────────────────────
// A CAIXINHA DO "O QUE MUDOU" (pedido do dono, 25/08).
//
// Um book republicado chega por e-mail a quem já viu a versão anterior — e a
// pergunta é sempre a mesma: "o que mudou?". A regra, espelhada no servidor
// (COMENTARIO_OBRIGATORIO em items.ts): primeira publicação, comentário
// OPCIONAL; republicação, OBRIGATÓRIO (mínimo 5 caracteres).
//
// Os chips de patrocinador existem para FACILITAR a escrita ("as mudanças são
// quase sempre por patrocinador"): clicar em um chip começa/continua uma linha
// "Nome: " para a pessoa completar. Chip não é seleção — é atalho de texto; o
// que vale é o texto final.
//
// Usada nos DOIS pontos que publicam book: o Gerador (book-gerador.tsx) e o
// modal da Arte (arte.tsx). Se nascer um terceiro ponto, usa esta.
// ─────────────────────────────────────────────────────────────────────────────

export const COMENTARIO_MINIMO = 5;

/** A MESMA régua do servidor: obrigatório só na republicação. */
export function comentarioDoBookValido(republicacao: boolean, texto: string): boolean {
  return !republicacao || texto.trim().length >= COMENTARIO_MINIMO;
}

export function ComentarioDoBook({
  republicacao,
  valor,
  aoMudar,
  patrocinadores,
}: {
  /** true = já existe book publicado neste evento (comentário obrigatório) */
  republicacao: boolean;
  valor: string;
  aoMudar: (v: string) => void;
  /** nomes (únicos) dos patrocinadores das peças do book — viram chips-atalho */
  patrocinadores: string[];
}) {
  const invalido = !comentarioDoBookValido(republicacao, valor);

  const inserirChip = (nome: string) => {
    const base = valor.trimEnd();
    // já começou a linha desse patrocinador? então só leva o cursor para lá
    // (não duplica); senão abre "Nome: " numa linha nova.
    if (base.includes(`${nome}:`)) return;
    aoMudar(base ? `${base}\n${nome}: ` : `${nome}: `);
  };

  return (
    <div data-testid="comentario-do-book">
      <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#57534e" }}>
        O que mudou nesta versão
        <span style={{ marginLeft: 6, fontWeight: 600, textTransform: "none", letterSpacing: 0, color: republicacao ? "#c2410c" : "#a8a29e" }}>
          {republicacao ? "— obrigatório na republicação: é o que sai no e-mail" : "— opcional na primeira publicação"}
        </span>
      </p>
      {patrocinadores.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {patrocinadores.map((nome) => (
            <button
              key={nome}
              type="button"
              onClick={() => inserirChip(nome)}
              data-testid={`chip-comentario-${nome}`}
              title={`Começa a linha "${nome}: " no comentário`}
              style={{
                height: 26, padding: "0 10px", borderRadius: 999, cursor: "pointer",
                border: valor.includes(`${nome}:`) ? "1px solid #fdba74" : "1px solid #e7e5e4",
                background: valor.includes(`${nome}:`) ? "#fff7ed" : "#fafaf9",
                color: valor.includes(`${nome}:`) ? "#c2410c" : "#57534e",
                fontSize: 12, fontWeight: 600, transition: "all 0.12s",
              }}
            >
              {nome}
            </button>
          ))}
        </div>
      )}
      <textarea
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        rows={3}
        maxLength={1000}
        data-testid="textarea-comentario-do-book"
        placeholder={
          republicacao
            ? "Ex.: Livelo: trocamos a arte do pórtico. Ministério: entrou o selo novo."
            : "Se quiser, um contexto para quem recebe o book por e-mail."
        }
        style={{
          width: "100%", boxSizing: "border-box", resize: "vertical",
          padding: "10px 12px", borderRadius: 10, fontSize: 13, lineHeight: 1.5,
          fontFamily: "inherit", color: "#1c1917", backgroundColor: "#fff",
          border: `1px solid ${invalido && valor.trim().length > 0 ? "#fca5a5" : "#e7e5e4"}`,
          outline: "none",
        }}
      />
      {republicacao && invalido && (
        <p data-testid="comentario-obrigatorio-aviso" style={{ margin: "4px 0 0", fontSize: 11.5, color: "#b91c1c", fontWeight: 600 }}>
          Este evento já tem book publicado — escreva o que mudou (mín. {COMENTARIO_MINIMO} caracteres) para poder republicar.
        </p>
      )}
    </div>
  );
}
