// As duas primeiras faixas do corpo da ficha: o motivo da última devolução
// (quando houve) e a COMPARAÇÃO — o aprovado pelo patrocinador × o arquivo
// final da Arte, lado a lado. Só props, sem hook: mora dentro do
// FreezeWhileClosing do modal e não pode redesenhar enquanto ele sai.
import { FileImage, Maximize2, RotateCcw } from "lucide-react";
import { FilePreview, isWebUrl } from "@/components/file-preview";
import { ehMolde } from "@shared/molde";
import { T, TOM, N, FS, R } from "@/lib/theme";
import { alvo } from "@/hooks/use-mobile";
import { TI } from "./regras";
import { letra } from "./estilos";
import type { PecaDaRevisao } from "./tipos";

export function FichaComparacao({ selectedItem, isMobile, dedo = false }: { selectedItem: PecaDaRevisao | null; isMobile: boolean; dedo?: boolean }) {
  return (
    <>
      {/* ── 1b · POR QUE ELA VOLTOU ──
          `rejectionReason` já chega em cada peça (é coluna da própria peça,
          gravada por TODA porta de devolução) e NUNCA é zerada — por isso o
          rótulo diz "última devolução": é histórico, não pendência. Quem
          revisa uma peça que já foi devolvida precisa conferir justamente se
          aquilo foi corrigido. Faixa fixa (flexShrink 0), cortada em duas
          linhas: a comparação continua sendo a faixa que flexiona. */}
      {selectedItem?.rejectionReason && String(selectedItem.rejectionReason).trim() && (
        <div
          data-testid="motivo-ultima-devolucao"
          title={String(selectedItem.rejectionReason).trim()}
          style={{ flexShrink: 0, display: "flex", alignItems: "flex-start", gap: 10, padding: isMobile ? "10px 14px" : "10px 20px", backgroundColor: TOM.laranja.bg, borderBottom: `1px solid ${TOM.laranja.border}` }}
        >
          <RotateCcw aria-hidden="true" style={{ width: 15, height: 15, color: T.accentText, flexShrink: 0, marginTop: 2 }} />
          <p style={{ margin: 0, minWidth: 0, fontSize: FS.body, lineHeight: 1.45, color: TOM.laranja.text, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>
            <strong style={{ fontWeight: 700 }}>Motivo da última devolução: </strong>
            {String(selectedItem.rejectionReason).trim()}
          </p>
        </div>
      )}

      {/* ── 2 · COMPARAÇÃO — a única faixa que flexiona ──
          Os dois arquivos lado a lado na LARGURA INTEIRA do modal: é a
          comparação que esta tela existe para mostrar. `min-height: 200`
          fecha as duas contas — sem piso a faixa colapsa; com 300px ela
          empurra os botões abaixo da dobra numa janela de 540px.
          NO CELULAR TAMBÉM LADO A LADO (25/09): empilhados, cada arquivo
          tinha 180px de altura e o segundo só aparecia rolando — comparar,
          que é o que a tela existe para fazer, virava lembrar do primeiro.
          Lado a lado os dois cabem na primeira dobra; o ampliar abre cada
          um em tela cheia. Os rótulos encurtam para caber em ~150px. */}
      <div data-testid="faixa-comparacao" style={{ flex: isMobile ? "0 0 auto" : "1 1 auto", minHeight: 200, overflow: "hidden", backgroundColor: N.n2, padding: isMobile ? 12 : "14px 20px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: isMobile ? 8 : 14 }}>
        {[
          { label: "Aprovado pelo patrocinador", curto: "Aprovado", url: selectedItem?.approvalThumbUrl, empty: "Sem thumb aprovado" },
          { label: "Arquivo final da Arte", curto: "Arquivo final", url: selectedItem?.finalFileUrl, empty: ehMolde(selectedItem) ? "Molde não tem arquivo final — revise pelo thumb" : "A Arte ainda não subiu o arquivo final" },
        ].map(({ label, curto, url, empty }) => {
          // Caminho de rede/disco (\\10.100.1.7\...): o navegador não abre nem
          // pré-visualiza — sem moldura e sem "ampliar", só o aviso apontando
          // para o caminho copiável na tira abaixo.
          const caminhoDeRede = !!url && !isWebUrl(url);
          return (
            <div key={label} style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 0, overflow: "hidden" }}>
              <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: letra(FS.small, isMobile), fontWeight: 800, color: T.apoio, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0, flexShrink: 0 }}>
                <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: url ? TOM.sucesso.text : T.accentText, flexShrink: 0 }} />
                <span title={label} style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{isMobile ? curto : label}</span>
                {url && isWebUrl(url) && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={"Ampliar: abrir " + label.toLowerCase() + " em nova aba"}
                    aria-label={"Abrir " + label.toLowerCase() + " em nova aba"}
                    // Alvo de 44 no toque: o ícone de 14px com 4 de folga dava 22px.
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 4, minWidth: alvo(22, dedo || isMobile), minHeight: alvo(22, dedo || isMobile), borderRadius: R.sm, color: T.second, flexShrink: 0 }}
                  >
                    <Maximize2 style={{ width: 14, height: 14 }} />
                  </a>
                )}
              </p>
              {/* EIXO DEFINIDO na moldura da pré-visualização:
                  `max-width/max-height` sem largura nem altura resolve para
                  2px — `max-*` LIMITA um tamanho, nunca o produz. A moldura
                  toma a altura que a faixa deu (`flex: 1` num pai de altura
                  definida) e o conteúdo cabe inteiro com `objectFit: contain`. */}
              {caminhoDeRede ? (
                <div style={{ backgroundColor: T.surface, borderRadius: R.md, border: `1px solid ${T.border}`, padding: isMobile ? 10 : "12px 14px", display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: "center", textAlign: isMobile ? "center" : undefined, gap: isMobile ? 6 : 10 }}>
                  <FileImage style={{ width: 20, height: 20, color: T.muted, flexShrink: 0 }} />
                  <p style={{ fontSize: letra(FS.small, isMobile), fontWeight: 600, color: TI.secondary, margin: 0 }}>
                    Arquivo salvo na rede local — sem pré-visualização. Copie o caminho na tira abaixo.
                  </p>
                </div>
              ) : (
              <div style={{ flex: "1 1 auto", minHeight: isMobile ? 150 : 140, height: isMobile ? "clamp(150px, 32dvh, 260px)" : undefined, width: "100%", backgroundColor: T.surface, borderRadius: R.md, overflow: "hidden", border: `1px solid ${T.border}`, boxShadow: "inset 0 1px 4px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {url ? (
                  <FilePreview url={url} noLink objectFit="contain" />
                ) : (
                  <div style={{ textAlign: "center", color: TI.secondary, padding: 12 }}>
                    <FileImage style={{ width: 32, height: 32, margin: "0 auto 8px", color: T.muted }} />
                    <p style={{ fontSize: FS.meta, fontWeight: 600, margin: 0 }}>{empty}</p>
                  </div>
                )}
              </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
