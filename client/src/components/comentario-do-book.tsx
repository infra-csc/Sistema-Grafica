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
import { useId, useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

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
  // Celular: nada abaixo de 12px e o campo em 16px (o iOS dá zoom abaixo disso).
  const celular = useIsMobile();
  const fsc = (n: number) => (celular ? Math.max(12, n) : n);
  // Rótulo e aviso AMARRADOS ao campo: o título era um <p> solto, então o
  // leitor de tela anunciava "campo de edição" sem dizer qual — e o aviso de
  // obrigatório nunca era lido junto.
  const idBase = useId();
  const idRotulo = `${idBase}-rotulo`;
  const idAviso = `${idBase}-aviso`;
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const faltam = Math.max(0, COMENTARIO_MINIMO - valor.trim().length);

  const inserirChip = (nome: string) => {
    const base = valor.trimEnd();
    // já começou a linha desse patrocinador? então só leva o cursor para lá
    // (não duplica); senão abre "Nome: " numa linha nova.
    if (base.includes(`${nome}:`)) return;
    aoMudar(base ? `${base}\n${nome}: ` : `${nome}: `);
    // O chip abre a linha para a pessoa COMPLETAR — o foco tem de ir junto,
    // senão ela clica no chip e ainda precisa clicar de novo no campo.
    requestAnimationFrame(() => {
      const el = campoRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  return (
    <div data-testid="comentario-do-book">
      <p id={idRotulo} style={{ margin: "0 0 6px", fontSize: fsc(11), fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#57534e" }}>
        O que mudou nesta versão
        {/* #78716c e não #a8a29e: é texto informativo (diz se o campo é
            obrigatório), e #a8a29e não passa 4,5:1 sobre o branco. */}
        <span style={{ marginLeft: 6, fontWeight: 600, textTransform: "none", letterSpacing: 0, color: republicacao ? "#c2410c" : "#78716c" }}>
          {republicacao ? "— obrigatório na republicação: é o que sai no e-mail" : "— opcional na primeira publicação"}
        </span>
      </p>
      {patrocinadores.length > 0 && (
        <div role="group" aria-label="Começar uma linha por patrocinador" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {patrocinadores.map((nome) => {
            const usado = valor.includes(`${nome}:`);
            return (
              <button
                key={nome}
                type="button"
                onClick={() => inserirChip(nome)}
                aria-pressed={usado}
                data-testid={`chip-comentario-${nome}`}
                title={`Começa a linha "${nome}: " no comentário`}
                // 32px de alvo (eram 26): os chips são o atalho mais usado da
                // caixa, e em 26px ficavam abaixo do mínimo confortável ao toque.
                style={{
                  minHeight: 32, padding: "0 12px", borderRadius: 999, cursor: "pointer",
                  border: usado ? "1px solid #fdba74" : "1px solid #e7e5e4",
                  background: usado ? "#fff7ed" : "#fafaf9",
                  color: usado ? "#c2410c" : "#57534e",
                  fontSize: fsc(12), fontWeight: 600, transition: "all 0.12s",
                }}
              >
                {nome}
              </button>
            );
          })}
        </div>
      )}
      <textarea
        ref={campoRef}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        rows={3}
        maxLength={1000}
        data-testid="textarea-comentario-do-book"
        aria-labelledby={idRotulo}
        aria-describedby={republicacao && invalido ? idAviso : undefined}
        aria-invalid={republicacao && invalido && valor.trim().length > 0 ? true : undefined}
        aria-required={republicacao || undefined}
        placeholder={
          republicacao
            ? "Ex.: Livelo: trocamos a arte do pórtico. Ministério: entrou o selo novo."
            : "Se quiser, um contexto para quem recebe o book por e-mail."
        }
        // Sem `outline: "none"`: ele apagava o anel de foco global, e quem
        // chega pelo Tab não via onde estava escrevendo.
        style={{
          width: "100%", boxSizing: "border-box", resize: "vertical",
          padding: "10px 12px", borderRadius: 10, fontSize: celular ? 16 : 13, lineHeight: 1.5,
          fontFamily: "inherit", color: "#1c1917", backgroundColor: "#fff",
          border: `1px solid ${invalido && valor.trim().length > 0 ? "#fca5a5" : "#e7e5e4"}`,
        }}
      />
      {republicacao && invalido && (
        <p id={idAviso} data-testid="comentario-obrigatorio-aviso" style={{ margin: "4px 0 0", fontSize: fsc(11.5), color: "#b91c1c", fontWeight: 600 }}>
          {/* Com texto começado, diz QUANTO falta — "mín. 5" obriga a contar. */}
          {valor.trim().length > 0
            ? `Faltam ${faltam} ${faltam === 1 ? "caractere" : "caracteres"} para poder republicar.`
            : <>Este evento já tem book publicado — escreva o que mudou (mín. {COMENTARIO_MINIMO} caracteres) para poder republicar.</>}
        </p>
      )}
      {/* O OUTRO LADO DA RÉGUA. O aviso vermelho sumia ao atingir o mínimo e
          nada tomava o lugar: a pessoa não sabia se o campo tinha "passado".
          Uma linha verde curta confirma — e lembra para onde o texto vai. */}
      {republicacao && !invalido && (
        <p role="status" data-testid="comentario-pronto" style={{ margin: "4px 0 0", fontSize: fsc(11.5), color: "#15803d", fontWeight: 600 }}>
          Pronto — este texto vai no e-mail da republicação.
        </p>
      )}
    </div>
  );
}
