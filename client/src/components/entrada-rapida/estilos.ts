// Estilo dos campos da grade e o foco que acende a borda e avança com Enter.
import { T, FONT } from "@/lib/theme";

/* ── Styles ─────────────────────────────────────────────────────────── */
export const fieldStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: T.low,
  border: '1.5px solid transparent',
  borderRadius: '6px',
  fontSize: '13px',
  padding: '5px 8px',
 
  fontFamily: FONT.corpo,
  color: T.text,
  boxSizing: 'border-box',
  transition: 'border-color 0.12s',
};

// `selectStyle` saiu junto com os dois `<select>` nativos que ele vestia. Era
// a tentativa de disfarçar o controle do sistema operacional: `appearance:
// none` mais uma seta ▾ desenhada à mão em #a8a29e — cor que a régua da casa
// não aceita nem como glifo (2,52:1 sobre o fundo do campo, abaixo dos 3:1 de
// objeto gráfico). O disfarce só valia para o gatilho: o MENU continuava
// sendo o do Windows. Ver `CampoDaGrade`, mais abaixo.

export function makeFocusHandlers(onNav?: () => void) {
  return {
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
      e.currentTarget.style.borderColor = T.accent;
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
      e.currentTarget.style.borderColor = 'transparent';
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (e.key === 'Enter') { e.preventDefault(); onNav?.(); }
    },
  };
}
