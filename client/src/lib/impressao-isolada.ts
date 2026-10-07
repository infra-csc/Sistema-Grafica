// ─────────────────────────────────────────────────────────────────────────────
// IMPRESSÃO ISOLADA — só o documento vai para o papel, nunca a casca do app.
//
// O DEFEITO (06/10, conferido com page.pdf() + pdf.js): as Etiquetas do evento
// e o Relatório do evento escondiam no @media print só os próprios botões. A
// casca do app (menu lateral, barra de cima e o <main> de altura de tela com
// rolagem própria) ia junto para o papel: o relatório saía espremido ao lado
// do menu e CORTADO na primeira página; as etiquetas saíam com o menu em todas
// as folhas e a A4 cortada pela metade. A Etiqueta do tubo já tinha resolvido
// isso com um portal no <body>.
//
// A REGRA, só CSS e só no papel: todo elemento que NÃO contém o documento, não
// é o documento e não está dentro dele some (display: none); a cadeia de
// ancestrais do documento vira bloco comum, sem altura de tela, sem rolagem e
// sem recuo — o fluxo volta a paginar. Nada muda nas medidas do que imprime
// (o @page, a folha e a etiqueta continuam as da página).
// ─────────────────────────────────────────────────────────────────────────────

/** CSS (para dentro de um `@media print { … }`) que isola `seletor` no papel. */
export function cssDeImpressaoIsolada(seletor: string): string {
  return `
    html, body { height: auto !important; min-height: 0 !important; overflow: visible !important; background: #fff !important; }
    body *:not(:has(${seletor})):not(${seletor}):not(${seletor} *) { display: none !important; }
    body *:has(${seletor}) {
      display: block !important; position: static !important; height: auto !important; min-height: 0 !important; max-height: none !important;
      width: auto !important; min-width: 0 !important; max-width: none !important; overflow: visible !important;
      margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; transform: none !important;
      background: #fff !important; inset: auto !important;
    }
  `;
}
