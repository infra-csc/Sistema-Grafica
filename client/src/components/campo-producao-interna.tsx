// ─────────────────────────────────────────────────────────────────────────────
// O CAMPO "VAI DIRETO PARA A GRÁFICA" do formulário da peça (dono, 02/10:
// "essa peça tem que indicar NA SOLICITAÇÃO que vai direto para a Gráfica").
//
// Um bloco pronto para o formulário de criar/editar peça: a caixinha, as
// instruções para a Gráfica e o arquivo opcional (caminho de rede colado ou
// arquivo subido pelo app — o mesmo campo que a Arte preencheria). Fica
// fora de components/detalhe-do-evento/ de propósito: o formulário só o
// monta (ver o trecho de ligação no relatório de 02/10).
//
// A instrução é COBRADA no envio da lista, não aqui (shared/producao-interna):
// o bloco avisa que ela será exigida, sem travar o rascunho.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from "react";
import { Factory, FileCheck, FolderOpen, Upload, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Botao } from "@/components/ui/botao";
import { useFileUpload } from "@/hooks/use-file-upload";
import { FS, FW, R, T, TOM } from "@/lib/theme";
import { INSTRUCOES_MAXIMO, INSTRUCOES_MINIMO, type CamposDaProducaoInterna } from "@shared/producao-interna";

// Os campos e as contas puras do formulário moram em shared/producao-interna
// (regras.ts do Detalhe do Evento os lê sem arrastar React); reexportados aqui.
export {
  CAMPOS_VAZIOS_DA_PRODUCAO_INTERNA, camposDaProducaoInternaDaPeca, corpoDaProducaoInterna, mostraCampoProducaoInterna,
  type CamposDaProducaoInterna,
} from "@shared/producao-interna";

const nomeDoCaminho = (v: string) => v.split(/[\\/]/).filter(Boolean).pop() ?? v;
/** A URL crua do bucket vira /objects/… (o servidor faz o mesmo) — é o que diz "arquivo subido". */
const paraObjects = (url: string) => {
  const m = url.match(/\/\.private\/(.+?)(?:\?|$)/);
  return m ? `/objects/${m[1]}` : url;
};

export function CampoProducaoInterna({ valor, onChange, temPatrocinador = false, jaTemArquivo = false, isMobile = false, idBase = "producao-interna" }: {
  valor: CamposDaProducaoInterna;
  onChange: (v: CamposDaProducaoInterna) => void;
  /** Peça em edição com patrocinador vinculado: a caixinha fica bloqueada, com o motivo. */
  temPatrocinador?: boolean;
  /** A peça já tem arquivo final (edição): a instrução deixa de ser exigida. */
  jaTemArquivo?: boolean;
  isMobile?: boolean;
  idBase?: string;
}) {
  const nomeSubindo = useRef("");
  // O upload termina DEPOIS: lê o formulário de agora, não o do clique (a
  // pessoa pode ter escrito a instrução enquanto o arquivo subia).
  const valorAtual = useRef(valor);
  valorAtual.current = valor;
  const [erro, setErro] = useState<string | null>(null);
  const upload = useFileUpload({
    maxFileSize: 50 * 1024 * 1024,
    onComplete: ({ url }) => { onChange({ ...valorAtual.current, arquivoGrafica: paraObjects(url), arquivoGraficaNome: nomeSubindo.current || nomeDoCaminho(url) }); setErro(null); },
    onError: (e) => setErro(e.message),
  });
  const set = (parcial: Partial<CamposDaProducaoInterna>) => onChange({ ...valor, ...parcial });
  const temArquivo = jaTemArquivo || !!valor.arquivoGrafica.trim();
  const instr = valor.instrucoesGrafica.trim();
  const avisoInstrucao = valor.producaoInterna && !temArquivo && instr.length < INSTRUCOES_MINIMO;
  const desabilitado = temPatrocinador && !valor.producaoInterna;

  return (
    <div data-testid="campo-producao-interna" style={{ backgroundColor: TOM.ceu.bg, borderLeft: `4px solid ${TOM.ceu.dot}`, padding: "14px 16px", borderRadius: 8, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Factory aria-hidden="true" style={{ width: 20, height: 20, color: TOM.ceu.text, flexShrink: 0 }} />
          <label htmlFor={`${idBase}-check`} style={{ fontSize: 15, fontWeight: 500, color: TOM.ceu.text, cursor: desabilitado ? "not-allowed" : "pointer" }}>
            Vai direto para a Gráfica
            <span style={{ display: "block", fontSize: 12, fontWeight: 400, color: TOM.ceu.text }}>
              Produção interna, sem logo de patrocinador: no envio da lista pula Vinculação, Arte, Aprovação e Revisão Final.
            </span>
          </label>
        </div>
        <Checkbox
          id={`${idBase}-check`}
          checked={valor.producaoInterna}
          disabled={desabilitado}
          onCheckedChange={(c) => set({ producaoInterna: !!c })}
          data-testid="checkbox-producao-interna"
          aria-describedby={desabilitado ? `${idBase}-motivo` : undefined}
          style={{ width: 20, height: 20, minWidth: 20, accentColor: TOM.ceu.dot }}
        />
      </div>
      {desabilitado && (
        <p id={`${idBase}-motivo`} style={{ margin: 0, fontSize: FS.meta, color: TOM.ceu.text }}>
          Esta peça tem patrocinador vinculado — produção interna não leva patrocinador. Desvincule antes de marcar.
        </p>
      )}

      {valor.producaoInterna && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor={`${idBase}-instrucoes`} style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>
              Instruções para a Gráfica{" "}
              <span style={{ fontWeight: FW.corpo, color: temArquivo ? T.second : TOM.alerta.text }}>{temArquivo ? "(opcional)" : "(obrigatório sem arquivo)"}</span>
            </label>
            <textarea
              id={`${idBase}-instrucoes`}
              data-testid="textarea-instrucoes-grafica"
              value={valor.instrucoesGrafica}
              maxLength={INSTRUCOES_MAXIMO}
              onChange={(e) => set({ instrucoesGrafica: e.target.value })}
              rows={3}
              placeholder="O que fazer: medida, material, acabamento, onde está a arte…"
              style={{ width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 80, padding: "10px 12px", borderRadius: R.md, border: `1px solid ${avisoInstrucao ? TOM.alerta.border : T.bdark}`, background: T.surface, color: T.text, fontFamily: "inherit", fontSize: isMobile ? FS.lead : FS.body, lineHeight: 1.45 }}
            />
            {avisoInstrucao && (
              <p style={{ margin: 0, fontSize: FS.meta, color: TOM.alerta.text }}>
                Sem arquivo, a Gráfica faz a peça pelas instruções — escreva pelo menos {INSTRUCOES_MINIMO} letras antes de enviar a lista.
              </p>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor={`${idBase}-arquivo`} style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>
              Arquivo <span style={{ fontWeight: FW.corpo, color: T.second }}>(opcional)</span>
            </label>
            {valor.arquivoGrafica && valor.arquivoGrafica.startsWith("/objects/") ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 6px 6px 12px", borderRadius: R.md, background: TOM.sucesso.bg, border: `1px solid ${TOM.sucesso.border}`, color: TOM.sucesso.text, fontSize: FS.body }}>
                <FileCheck aria-hidden="true" style={{ width: 16, height: 16, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{valor.arquivoGraficaNome || nomeDoCaminho(valor.arquivoGrafica)}</span>
                <button type="button" aria-label="Tirar o arquivo" onClick={() => set({ arquivoGrafica: "", arquivoGraficaNome: "" })}
                  style={{ minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", color: TOM.sucesso.text, cursor: "pointer" }}>
                  <X aria-hidden="true" style={{ width: 16, height: 16 }} />
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div style={{ position: "relative", flex: "1 1 200px", minWidth: 0 }}>
                  <FolderOpen aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: T.apoio }} />
                  <input
                    id={`${idBase}-arquivo`}
                    data-testid="input-arquivo-producao-interna"
                    value={valor.arquivoGrafica}
                    onChange={(e) => set({ arquivoGrafica: e.target.value, arquivoGraficaNome: nomeDoCaminho(e.target.value.trim()) })}
                    placeholder="Cole o caminho do arquivo…"
                    style={{ width: "100%", boxSizing: "border-box", height: 44, paddingLeft: 36, paddingRight: 12, borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, color: T.text, fontSize: isMobile ? FS.lead : FS.body }}
                  />
                </div>
                <input ref={upload.fileInputRef} type="file" accept="image/*,application/pdf,.zip" style={{ display: "none" }}
                  onChange={(e) => { const f = upload.validateAndGetFile(e); if (!f) return; nomeSubindo.current = f.name; void upload.uploadFile(f); }} />
                <Botao variante="secundario" tamanho="toque" icone={Upload} carregando={upload.isUploading}
                  onClick={() => upload.fileInputRef.current?.click()} data-testid="button-subir-arquivo-producao-interna">
                  {upload.isUploading ? `Subindo${upload.envio ? ` ${upload.envio.percentual}%` : "…"}` : "Subir arquivo"}
                </Botao>
              </div>
            )}
            {erro && <p role="alert" style={{ margin: 0, fontSize: FS.meta, color: TOM.perigo.text }}>{erro}</p>}
          </div>
        </>
      )}
    </div>
  );
}
