// ─────────────────────────────────────────────────────────────────────────────
// A LINHA EXPANDIDA "Vai direto para a Gráfica" da Entrada rápida (dono, 07/10:
// "uma coluna com uma caixinha 'Gráfica' em cada linha, mais o campo de
// instruções, para lançar várias peças internas de uma vez").
//
// Marcar a caixinha da linha abre ESTE bloco logo abaixo dela: as instruções
// para a Gráfica e, opcional, o caminho do arquivo colado. É a versão de grade
// do bloco do formulário de uma peça (components/campo-producao-interna.tsx) —
// mesmos campos, mesmas regras, mesmo azul-céu —, sem o "Subir arquivo": a
// grade é de digitação rápida, e quem tem arquivo no servidor cola o caminho
// (subir arquivo segue no formulário de uma peça).
//
// Por que NÃO o campo Obs da linha: a observação é interna e tem outro
// destino (vai para a Arte e para a ficha). A instrução é o que a Gráfica lê
// no lugar do arquivo.
//
// A instrução é exigida no ENVIO da lista, não aqui (shared/producao-interna):
// o bloco avisa, sem travar o rascunho — como o formulário de uma peça faz.
// ─────────────────────────────────────────────────────────────────────────────
import { Factory, FolderOpen } from "lucide-react";
import { FW, R, T, TOM } from "@/lib/theme";
import { INSTRUCOES_MAXIMO, INSTRUCOES_MINIMO } from "@shared/producao-interna";
import { linhaSemInstrucoes } from "./regras";
import type { BulkItemRow } from "./tipos";

const nomeDoCaminho = (v: string) => v.split(/[\\/]/).filter(Boolean).pop() ?? v;

type Parcial = Partial<Pick<BulkItemRow, "instrucoesGrafica" | "arquivoGrafica" | "arquivoGraficaNome">>;

export function LinhaDaGrafica({ row, ri, colSpan, motivo, onChange, onNavegarProximaLinha }: {
  row: BulkItemRow;
  ri: number;
  colSpan: number;
  /** A linha virou molde ou reaproveitamento total depois de marcada. */
  motivo: string | null;
  onChange: (parcial: Parcial) => void;
  /** Enter no caminho do arquivo: segue para a linha seguinte, como o resto da grade. */
  onNavegarProximaLinha: () => void;
}) {
  const temArquivo = !!row.arquivoGrafica.trim();
  const aviso = linhaSemInstrucoes(row);
  const borda = (alerta: boolean) => `1px solid ${alerta ? TOM.alerta.border : T.bdark}`;
  const idInstr = `lote-pi-instrucoes-${row.id}`;
  const idArq = `lote-pi-arquivo-${row.id}`;
  const idAviso = `lote-pi-aviso-${row.id}`;

  return (
    <tr data-testid={`linha-grafica-${ri}`}>
      <td colSpan={colSpan} style={{ padding: '0 4px 6px' }}>
        {/* sticky + largura da janela: no celular a grade rola de lado (1032px)
            e o bloco ficaria metade fora da tela; assim ele acompanha a
            rolagem e cabe na largura visível. */}
        <div
          className="erp-pi-linha"
          style={{
            position: 'sticky', left: 0,
            backgroundColor: TOM.ceu.bg, borderLeft: `4px solid ${TOM.ceu.dot}`,
            borderRadius: `0 0 ${R.md}px ${R.md}px`,
            padding: '8px 12px 10px',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', color: TOM.ceu.text, fontSize: 12 }}>
            <Factory aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }} />
            <span style={{ fontWeight: FW.forte }}>Linha {ri + 1} · vai direto para a Gráfica</span>
            <span>no envio da lista — sem Vinculação, Arte, Aprovação nem Revisão Final.</span>
          </div>

          {motivo ? (
            // Molde ou reaproveitamento total marcados: o envio do lote para
            // aqui com a mesma frase (handleSubmit); o bloco já diz o porquê.
            <p role="alert" data-testid={`motivo-grafica-${ri}`} style={{ margin: 0, fontSize: 12, color: TOM.perigo.text, fontWeight: FW.medio }}>
              {motivo} Desmarque "Gráfica" nesta linha.
            </p>
          ) : (
            <div className="erp-pi-campos">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <label htmlFor={idInstr} style={{ fontSize: 12, fontWeight: FW.forte, color: T.text }}>
                  Instruções para a Gráfica{' '}
                  <span style={{ fontWeight: FW.corpo, color: temArquivo ? T.second : TOM.alerta.text }}>
                    {temArquivo ? '(opcional)' : '(obrigatório sem arquivo)'}
                  </span>
                </label>
                <textarea
                  id={idInstr}
                  className="erp-pi-campo"
                  value={row.instrucoesGrafica}
                  maxLength={INSTRUCOES_MAXIMO}
                  rows={2}
                  onChange={e => onChange({ instrucoesGrafica: e.target.value })}
                  placeholder="O que fazer: medida, material, acabamento, onde está a arte…"
                  aria-describedby={aviso ? idAviso : undefined}
                  aria-invalid={aviso || undefined}
                  data-nav-row={ri} data-nav-field="pi"
                  data-testid={`textarea-instrucoes-grafica-${ri}`}
                  onFocus={e => { e.currentTarget.style.borderColor = T.accent; }}
                  onBlur={e => { e.currentTarget.style.borderColor = aviso ? TOM.alerta.border : T.bdark; }}
                  style={{
                    width: '100%', boxSizing: 'border-box', resize: 'vertical',
                    padding: '6px 8px', borderRadius: R.sm, border: borda(aviso),
                    background: T.surface, color: T.text, fontFamily: 'inherit', lineHeight: 1.4,
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <label htmlFor={idArq} style={{ fontSize: 12, fontWeight: FW.forte, color: T.text }}>
                  Arquivo <span style={{ fontWeight: FW.corpo, color: T.second }}>(opcional — cole o caminho)</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <FolderOpen aria-hidden="true" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: T.apoio }} />
                  <input
                    id={idArq}
                    className="erp-pi-campo"
                    value={row.arquivoGrafica}
                    onChange={e => onChange({ arquivoGrafica: e.target.value, arquivoGraficaNome: nomeDoCaminho(e.target.value.trim()) })}
                    placeholder="\\servidor\pasta\arquivo.pdf"
                    data-testid={`input-arquivo-grafica-${ri}`}
                    onFocus={e => { e.currentTarget.style.borderColor = T.accent; }}
                    onBlur={e => { e.currentTarget.style.borderColor = T.bdark; }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onNavegarProximaLinha(); } }}
                    style={{
                      width: '100%', boxSizing: 'border-box', height: 32, paddingLeft: 28, paddingRight: 8,
                      borderRadius: R.sm, border: borda(false), background: T.surface, color: T.text,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {!motivo && aviso && (
            <p id={idAviso} data-testid={`aviso-instrucoes-grafica-${ri}`} style={{ margin: 0, fontSize: 12, color: TOM.alerta.text }}>
              Sem arquivo, a Gráfica faz a peça pelas instruções — escreva pelo menos {INSTRUCOES_MINIMO} letras antes de enviar a lista.
            </p>
          )}
        </div>
      </td>
    </tr>
  );
}
