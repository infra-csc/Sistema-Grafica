// ─────────────────────────────────────────────────────────────────────────────
// "ENVIAR DIRETO PARA A GRÁFICA" — a confirmação, para 1 ou N peças (dono,
// 02/10: "liberar eventualmente alguma coisa direto pra gráfica… coisas que
// não passam pela arte… peças que fazemos internamente, sem logo de
// patrocinador, e que não necessariamente têm um arquivo").
//
// O que a tela diz antes do clique:
//   · o que acontece, em linguagem simples (pula Vinculação, Arte, Aprovação
//     e Revisão Final; cai em Pronto para Produção com o selo Produção interna);
//   · quais peças vão e quais ficam de fora, com o motivo ("tem patrocinador",
//     "já está com a Arte"…) — a MESMA regra que o servidor aplica
//     (shared/producao-interna.ts), para a lista não prometer o que a rota recusa;
//   · as instruções para a Gráfica: obrigatórias quando falta arquivo (é por
//     elas que a peça será feita); num lote, uma instrução comum;
//   · o arquivo (opcional) só no envio de UMA peça — um arquivo para N peças
//     diferentes seria o arquivo errado em quase todas. É o mesmo campo que a
//     Arte preenche: caminho de rede colado, ou um arquivo subido pelo app.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Factory, FileCheck, FolderOpen, Lock, Upload, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { useIsMobile, usePonteiroGrosso } from "@/hooks/use-mobile";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useEnviarDiretoParaGrafica, type ResultadoDoEnvioDireto } from "@/hooks/use-enviar-direto-grafica";
import { FONT, FS, FW, R, T, TOM } from "@/lib/theme";
import {
  motivoParaNaoEnviarDireto, faltamInstrucoes, INSTRUCOES_MINIMO, INSTRUCOES_MAXIMO,
  type PecaDaProducaoInterna,
} from "@shared/producao-interna";

/** A peça como o Detalhe do Evento a tem (GET /api/items/:eventId), no que o diálogo lê. */
export type PecaParaEnvioDireto = PecaDaProducaoInterna & {
  id: string;
  displayId?: string | null;
  description?: string | null;
  quantity?: number | string | null;
  instrucoesGrafica?: string | null;
  finalFileName?: string | null;
};

/** Teto do upload — o mesmo do servidor (MAX_UPLOAD_BYTES, 50 MB). */
const MAX_ARQUIVO = 50 * 1024 * 1024;

/** Nome legível de um caminho de rede ou de uma URL ("…\Rolo.tif" → "Rolo.tif"). */
const nomeDoCaminho = (v: string) => v.split(/[\\/]/).filter(Boolean).pop() ?? v;

export function EnviarDiretoGraficaDialog({ aberto, aoFechar, pecas, papel, eventId, aoConcluir }: {
  aberto: boolean;
  aoFechar: () => void;
  /** As peças escolhidas (1 = ação da linha; N = lote). As que não valem aparecem "de fora", com o motivo. */
  pecas: PecaParaEnvioDireto[];
  /** O papel de quem envia (admin/solicitacao enviam). */
  papel: string | null | undefined;
  /** Para invalidar a lista do evento depois do envio. */
  eventId?: string;
  /** Depois do sucesso (ex.: limpar a seleção do lote). */
  aoConcluir?: (r: ResultadoDoEnvioDireto) => void;
}) {
  const isMobile = useIsMobile();
  const dedo = usePonteiroGrosso() || isMobile;

  // As que vão e as que ficam — a mesma régua da rota.
  const { aptas, impedidas } = useMemo(() => {
    const aptas: PecaParaEnvioDireto[] = [];
    const impedidas: Array<{ peca: PecaParaEnvioDireto; motivo: string }> = [];
    for (const p of pecas) {
      const m = motivoParaNaoEnviarDireto(p, { papel });
      if (m) impedidas.push({ peca: p, motivo: m.frase });
      else aptas.push(p);
    }
    return { aptas, impedidas };
  }, [pecas, papel]);
  const umaSo = aptas.length === 1 && pecas.length === 1;
  const lote = pecas.length > 1;

  const [instrucoes, setInstrucoes] = useState("");
  const [caminho, setCaminho] = useState("");
  const [arquivoSubido, setArquivoSubido] = useState<{ url: string; nome: string } | null>(null);
  // Ref, não estado: o upload termina com o closure do clique.
  const nomeSubindo = useRef("");
  const [erro, setErro] = useState<string | null>(null);

  // Abriu: começa do que a peça já tem (a instrução escrita na lista).
  useEffect(() => {
    if (!aberto) return;
    setInstrucoes(umaSo ? (aptas[0].instrucoesGrafica ?? "") : "");
    setCaminho("");
    setArquivoSubido(null);
    setErro(null);
    // Só ao abrir: reescrever a cada render apagaria o que a pessoa digitou.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const upload = useFileUpload({
    maxFileSize: MAX_ARQUIVO,
    onComplete: ({ url }) => { setArquivoSubido({ url, nome: nomeSubindo.current || nomeDoCaminho(url) }); setCaminho(""); setErro(null); },
    onError: (e) => setErro(e.message),
  });

  const envio = useEnviarDiretoParaGrafica({
    eventId,
    aoConcluir: (r) => { aoConcluir?.(r); aoFechar(); },
  });

  // O arquivo que vai junto (só numa peça): o subido vence o caminho colado.
  const arquivo = umaSo
    ? (arquivoSubido ? { url: arquivoSubido.url, nome: arquivoSubido.nome } : caminho.trim() ? { url: caminho.trim(), nome: nomeDoCaminho(caminho.trim()) } : null)
    : null;

  // Quem precisa de instrução: a peça sem arquivo (o dela, ou o deste envio)
  // e sem instrução própria — a instrução digitada aqui vale para todas.
  const instrucoesDigitadas = instrucoes.trim();
  const curtaDemais = instrucoesDigitadas.length > 0 && instrucoesDigitadas.length < INSTRUCOES_MINIMO;
  const valeDigitada = instrucoesDigitadas.length >= INSTRUCOES_MINIMO ? instrucoesDigitadas : "";
  // NO LOTE, a peça sem arquivo e sem instrução (e sem a comum) fica DE FORA,
  // como o servidor faz — as outras seguem. Escrever a instrução comum a traz
  // de volta. Numa peça só, a instrução é exigida (o botão diz por quê).
  const semNadaNoLote = lote ? aptas.filter((p) => faltamInstrucoes(p.instrucoesGrafica?.trim() ? p.instrucoesGrafica : valeDigitada, !!p.finalFileUrl)) : [];
  const vao = aptas.filter((p) => !semNadaNoLote.includes(p));
  const fora = [...impedidas, ...semNadaNoLote.map((peca) => ({ peca, motivo: "Sem arquivo e sem instruções — escreva as instruções abaixo para incluí-la." }))];
  const semNada = lote ? [] : vao.filter((p) => faltamInstrucoes(instrucoesDigitadas || p.instrucoesGrafica, !!p.finalFileUrl || (umaSo && !!arquivo)));
  const exigeInstrucoes = aptas.some((p) => !p.finalFileUrl && !(umaSo && arquivo) && faltamInstrucoes(p.instrucoesGrafica, false));

  const motivoDoBotao = vao.length === 0
    ? (semNadaNoLote.length > 0
        ? `Escreva as instruções para a Gráfica (pelo menos ${INSTRUCOES_MINIMO} letras) — sem arquivo, é o que ela vai seguir.`
        : "Nenhuma das peças pode ir direto para a Gráfica — veja o motivo de cada uma.")
    : upload.isUploading ? "Esperando o arquivo terminar de subir."
    : semNada.length > 0 || curtaDemais ? `Escreva as instruções para a Gráfica (pelo menos ${INSTRUCOES_MINIMO} letras) — sem arquivo, é o que ela vai seguir.`
    : undefined;

  const confirmar = () => {
    if (motivoDoBotao) { setErro(motivoDoBotao); return; }
    setErro(null);
    envio.mutate(
      { itemIds: vao.map((p) => p.id), instrucoes: instrucoesDigitadas || undefined, arquivo },
      { onError: (e: Error) => setErro(e.message || "Não foi possível enviar — tente de novo.") },
    );
  };

  const n = vao.length;
  const tamanho = dedo ? "toque" : "md";

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v && !envio.isPending) aoFechar(); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(600)} data-testid="dialog-enviar-direto-grafica">
        <DialogTitle className="sr-only">Enviar direto para a Gráfica</DialogTitle>
        <DialogDescription className="sr-only">
          A peça pula Vinculação, Arte, Aprovação e Revisão Final e entra na fila da Gráfica como Pronto para Produção.
        </DialogDescription>
        <ModalHeader
          variant="confirm"
          icon={Factory}
          tint={TOM.ceu.text}
          title="Enviar direto para a Gráfica"
          subtitle={n === 0
            ? "Nenhuma das peças escolhidas pode ir direto."
            : `${n} ${n === 1 ? "peça vai" : "peças vão"} para Pronto para Produção, sem passar pela Arte.`}
          onClose={() => { if (!envio.isPending) aoFechar(); }}
          testIdDoFechar="button-fechar-direto-grafica"
        />

        <div style={{ overflowY: "auto", flex: "1 1 auto", minHeight: 0, padding: isMobile ? "14px 16px 6px" : "16px 24px 6px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* O QUE ACONTECE — em frases curtas: é a única tela que mostra o atalho antes de ele valer. */}
          <div style={{ background: TOM.ceu.bg, border: `1px solid ${TOM.ceu.border}`, borderRadius: R.md, padding: "10px 12px" }}>
            <p style={{ margin: 0, fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>O que acontece</p>
            <ul style={{ listStyle: "disc", margin: "6px 0 0", paddingLeft: 18, fontSize: FS.body, color: T.strong, lineHeight: 1.5 }}>
              <li>Pula <strong>Vinculação, Arte, Aprovação do patrocinador e Revisão Final</strong>.</li>
              <li>Entra na fila da Gráfica como <strong>Pronto para Produção</strong>, com o selo <strong>Produção interna</strong>.</li>
              <li>Serve para peça feita aqui dentro, <strong>sem logo de patrocinador</strong>.</li>
              <li>Não dá para desfazer por aqui — se precisar, a Gráfica devolve para a Revisão Final.</li>
            </ul>
          </div>

          {vao.length > 0 && (
            <section aria-label="Peças que vão" data-testid="lista-direto-grafica-vao">
              <p style={{ margin: "0 0 6px", fontSize: FS.meta, fontWeight: FW.rotulo, letterSpacing: "0.06em", textTransform: "uppercase", color: T.apoio }}>
                {n === 1 ? "Vai" : `Vão (${n})`}
              </p>
              <div style={{ border: `1px solid ${T.border}`, borderRadius: R.md, overflow: "hidden", maxHeight: 220, overflowY: "auto" }}>
                {vao.map((p, i) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderTop: i === 0 ? "none" : `1px solid ${T.border}`, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: FONT.mono, fontSize: FS.meta, fontWeight: FW.forte, color: T.accentText, flexShrink: 0 }}>{p.displayId ?? "—"}</span>
                    <span style={{ flex: "1 1 160px", minWidth: 0, fontSize: FS.body, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.description || p.type || undefined}>
                      {p.description || p.type}{p.quantity ? <span style={{ color: T.second }}> · {p.quantity} un.</span> : null}
                    </span>
                    <Selo tamanho="sm" tom={p.finalFileUrl ? "sucesso" : p.instrucoesGrafica?.trim() ? "ceu" : "neutro"}>
                      {p.finalFileUrl ? "com arquivo" : p.instrucoesGrafica?.trim() ? "com instruções" : "sem arquivo"}
                    </Selo>
                  </div>
                ))}
              </div>
            </section>
          )}

          {fora.length > 0 && (
            <section aria-label="Peças que ficam de fora" data-testid="lista-direto-grafica-fora">
              <p style={{ margin: "0 0 6px", fontSize: FS.meta, fontWeight: FW.rotulo, letterSpacing: "0.06em", textTransform: "uppercase", color: TOM.alerta.text }}>
                Ficam de fora ({fora.length})
              </p>
              <div style={{ border: `1px solid ${TOM.alerta.border}`, background: TOM.alerta.bg, borderRadius: R.md, overflow: "hidden", maxHeight: 180, overflowY: "auto" }}>
                {fora.map(({ peca, motivo }, i) => (
                  <div key={peca.id} style={{ display: "flex", gap: 8, padding: "8px 12px", borderTop: i === 0 ? "none" : `1px solid ${TOM.alerta.border}`, fontSize: FS.body, color: TOM.alerta.text, lineHeight: 1.4 }}>
                    <span style={{ fontFamily: FONT.mono, fontWeight: FW.forte, flexShrink: 0 }}>{peca.displayId ?? "—"}</span>
                    <span>{motivo}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {aptas.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="instrucoes-grafica" style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>
                Instruções para a Gráfica{" "}
                <span style={{ fontWeight: FW.corpo, color: exigeInstrucoes ? TOM.alerta.text : T.second }}>
                  {exigeInstrucoes ? (lote ? "(obrigatório para as sem arquivo)" : "(obrigatório sem arquivo)") : "(opcional)"}
                </span>
              </label>
              <textarea
                id="instrucoes-grafica"
                data-testid="input-instrucoes-grafica"
                value={instrucoes}
                maxLength={INSTRUCOES_MAXIMO}
                onChange={(e) => { setInstrucoes(e.target.value); if (erro) setErro(null); }}
                rows={isMobile ? 4 : 3}
                placeholder="O que fazer: medida, material, acabamento, quantidade de cópias, onde está a arte…"
                aria-describedby="instrucoes-grafica-ajuda"
                aria-invalid={curtaDemais || (semNada.length > 0 && !!erro) ? true : undefined}
                style={{ width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 88, padding: "10px 12px", borderRadius: R.md, border: `1px solid ${curtaDemais ? TOM.alerta.border : T.bdark}`, background: T.surface, color: T.text, fontFamily: "inherit", fontSize: isMobile ? FS.lead : FS.body, lineHeight: 1.45 }}
              />
              <p id="instrucoes-grafica-ajuda" style={{ margin: 0, fontSize: FS.meta, color: T.apoio, lineHeight: 1.45 }}>
                {umaSo
                  ? "Aparece em destaque na fila da Gráfica, junto da peça."
                  : "Vale para as peças sem instrução própria — as que já têm a sua seguem com ela."}
                {curtaDemais ? ` Ainda curta: pelo menos ${INSTRUCOES_MINIMO} letras.` : ""}
              </p>
            </div>
          )}

          {umaSo && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="arquivo-grafica" style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>
                Arquivo <span style={{ fontWeight: FW.corpo, color: T.second }}>(opcional)</span>
              </label>
              {vao[0].finalFileUrl && !arquivo && (
                <p style={{ margin: 0, fontSize: FS.meta, color: T.apoio }}>
                  A peça já tem arquivo: <span style={{ fontFamily: FONT.mono }}>{vao[0].finalFileName || nomeDoCaminho(vao[0].finalFileUrl)}</span> — escolha outro só se for trocar.
                </p>
              )}
              {arquivoSubido ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: R.md, background: TOM.sucesso.bg, border: `1px solid ${TOM.sucesso.border}`, color: TOM.sucesso.text, fontSize: FS.body, minWidth: 0 }}>
                  <FileCheck aria-hidden="true" style={{ width: 16, height: 16, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }} data-testid="arquivo-grafica-subido">{arquivoSubido.nome}</span>
                  <button type="button" onClick={() => setArquivoSubido(null)} aria-label="Tirar o arquivo"
                    style={{ minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", color: TOM.sucesso.text, cursor: "pointer", borderRadius: R.sm }}>
                    <X aria-hidden="true" style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch" }}>
                  <div style={{ position: "relative", flex: "1 1 220px", minWidth: 0 }}>
                    <FolderOpen aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: T.apoio }} />
                    <input
                      id="arquivo-grafica"
                      data-testid="input-arquivo-grafica"
                      value={caminho}
                      onChange={(e) => setCaminho(e.target.value)}
                      placeholder={isMobile ? "Cole o caminho do arquivo…" : "Cole o caminho do arquivo, com nome e extensão…"}
                      style={{ width: "100%", boxSizing: "border-box", height: 44, paddingLeft: 36, paddingRight: 12, borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, color: T.text, fontSize: isMobile ? FS.lead : FS.body }}
                    />
                  </div>
                  <input
                    ref={upload.fileInputRef}
                    type="file"
                    accept="image/*,application/pdf,.zip"
                    style={{ display: "none" }}
                    data-testid="input-arquivo-grafica-upload"
                    onChange={(e) => {
                      const f = upload.validateAndGetFile(e);
                      if (!f) return;
                      nomeSubindo.current = f.name;
                      void upload.uploadFile(f);
                    }}
                  />
                  <Botao
                    variante="secundario"
                    tamanho="toque"
                    icone={Upload}
                    carregando={upload.isUploading}
                    onClick={() => upload.fileInputRef.current?.click()}
                    data-testid="button-subir-arquivo-grafica"
                  >
                    {upload.isUploading ? `Subindo${upload.envio ? ` ${upload.envio.percentual}%` : "…"}` : "Subir arquivo"}
                  </Botao>
                </div>
              )}
            </div>
          )}

          {erro && (
            <div role="alert" data-testid="erro-direto-grafica" style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", borderRadius: R.md, background: TOM.perigo.bg, border: `1px solid ${TOM.perigo.border}`, color: TOM.perigo.text, fontSize: FS.body, lineHeight: 1.45 }}>
              <AlertCircle aria-hidden="true" style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }} />
              <span>{erro}</span>
            </div>
          )}
        </div>

        {/* O RODAPÉ: o motivo do botão travado mora AO LADO dos botões (no
            celular, acima) — embaixo do botão ele esticava o botão até a
            largura da frase. Ligado por aria-describedby. */}
        <div style={{ display: "flex", gap: isMobile ? 10 : 16, flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", padding: isMobile ? "12px 16px 16px" : "14px 24px 20px", borderTop: `1px solid ${T.border}`, background: T.surface, flexShrink: 0}}>
          <p id="motivo-direto-grafica" data-testid="motivo-direto-grafica" aria-live="polite" style={{ flex: "1 1 auto", margin: 0, minWidth: 0, display: motivoDoBotao ? "flex" : "none", gap: 6, alignItems: "flex-start", fontSize: FS.meta, color: T.apoio, lineHeight: 1.45 }}>
            <Lock aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0, marginTop: 2, color: T.second }} />
            <span>{motivoDoBotao}</span>
          </p>
          <div style={{ display: "flex", gap: 8, flexDirection: isMobile ? "column-reverse" : "row", marginLeft: isMobile ? 0 : "auto", flexShrink: 0 }}>
            <Botao variante="secundario" tamanho={tamanho} larguraCheia={isMobile} onClick={aoFechar} disabled={envio.isPending} data-testid="button-cancelar-direto-grafica">
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              tamanho={tamanho}
              larguraCheia={isMobile}
              icone={Factory}
              carregando={envio.isPending}
              disabled={!!motivoDoBotao}
              aria-describedby={motivoDoBotao ? "motivo-direto-grafica" : undefined}
              onClick={confirmar}
              data-testid="button-confirmar-direto-grafica"
            >
              {envio.isPending ? "Enviando…" : n > 1 ? `Enviar ${n} direto para a Gráfica` : "Enviar direto para a Gráfica"}
            </Botao>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
