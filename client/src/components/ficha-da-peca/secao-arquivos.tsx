// ARQUIVOS — o arquivo final (com o caminho copiável) e o book de aprovação.
import { Copy, FileImage, FolderOpen } from "lucide-react";
import { isWebUrl } from "@/components/file-preview";
import { useToast } from "@/hooks/use-toast";
import { hrefSeguro } from "@shared/url-segura";
import { T, N, TOM, FS, FW, R } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { CARTAO, TITULO_SECAO, useLetraDaFicha } from "./estilos";
import { fmtShort } from "./formatos";
import type { ItemDaFicha } from "./tipos";

export function SecaoArquivos({ item, ALVO }: {
  item: ItemDaFicha;
  /** Alvo de toque / de ponteiro. */
  ALVO: number;
}) {
  const fsf = useLetraDaFicha();
  const { toast } = useToast();

  return (
    <section>
      <h3 style={{ ...TITULO_SECAO, fontSize: fsf(10), marginBottom: 10 }}>Arquivos</h3>
      <div style={{ ...CARTAO, overflow: "hidden" }}>
        {/* Arquivo final. A AUSÊNCIA É UM ESTADO NORMAL do fluxo, não
            um card vazio de 100px: até a arte ser aprovada não existe
            arquivo final, e a ficha dizia isso com uma caixa
            tracejada do tamanho de um erro. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, borderBottom: `1px solid ${N.n2}` }}>
          <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, backgroundColor: item.finalFileUrl ? TOM.ciano.bg : N.n2, color: item.finalFileUrl ? TOM.ciano.text : T.second, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FolderOpen style={{ width: 15, height: 15 }} />
          </span>
          <div style={{ minWidth: 0, flex: "1 1 auto" }}>
            {/* O caminho completo no title: a linha corta em elipse,
                e \\10.100.1.7\TTKGrafica\PROVAS 2026\… é longo por
                natureza. */}
            <p title={item.finalFileUrl || undefined} style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.finalFileUrl ? (item.finalFileName || item.finalFileUrl) : "Arquivo final"}
            </p>
            <p style={{ fontSize: 12, color: T.apoio, margin: "2px 0 0" }}>
              {item.finalFileUrl
                ? `Pronto para impressão${item.finalFileUpdatedAt ? ` · ${fmtShort(item.finalFileUpdatedAt)}` : ""}`
                : "Fica pronto quando a Arte finalizar o layout aprovado"}
            </p>
          </div>
          {item.finalFileUrl ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {/* COPIAR é o gesto que faltava. O arquivo da gráfica
                  é um caminho de rede (\\10.100.1.7\…): o navegador
                  não abre, e a linha cortada em elipse não deixava
                  nem selecionar o texto. Sem este botão, o caminho
                  estava na tela e fora do alcance. */}
              <Botao
                variante="secundario"
                icone={Copy}
                data-testid="button-copiar-caminho-final"
                title={`Copiar caminho: ${item.finalFileUrl}`}
                aria-label="Copiar caminho do arquivo final"
                onClick={() => {
                  navigator.clipboard.writeText(item.finalFileUrl!)
                    .then(() => toast({ title: "Caminho copiado", description: isWebUrl(item.finalFileUrl!) ? "Cole no navegador para abrir." : "Cole no Explorer para abrir o arquivo.", variant: "success" }))
                    .catch(() => toast({ title: "Não foi possível copiar", description: "Selecione o caminho e copie manualmente.", variant: "warning" }));
                }}
                style={{ minHeight: ALVO, padding: "0 12px", color: T.text, fontSize: FS.meta }}
              >
                Copiar
              </Botao>
              {/* "Abrir" só quando o navegador consegue abrir. */}
              {isWebUrl(item.finalFileUrl) && (
                <a
                  href={hrefSeguro(item.finalFileUrl)} target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", height: ALVO, padding: "0 12px", borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.surface, color: T.text, fontSize: FS.meta, fontWeight: FW.forte, textDecoration: "none" }}
                >
                  Abrir
                </a>
              )}
            </div>
          ) : (
            <Selo tom="neutro" style={{ flexShrink: 0, fontSize: fsf(11) }}>
              Pendente
            </Selo>
          )}
        </div>

        {/* Book do evento */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12 }}>
          <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, backgroundColor: item.bookUrl ? TOM.roxo.bg : N.n2, color: item.bookUrl ? TOM.roxo.text : T.second, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FileImage style={{ width: 15, height: 15 }} />
          </span>
          <div style={{ minWidth: 0, flex: "1 1 auto" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0 }}>Book de aprovação</p>
            <p style={{ fontSize: 12, color: T.apoio, margin: "2px 0 0" }}>
              {item.bookUrl
                ? (item.bookPage ? `Esta peça está na página ${item.bookPage}` : "Cobre esta peça")
                : "A peça não entrou em nenhum book"}
            </p>
          </div>
          {item.bookUrl && (
            <a
              href={hrefSeguro(item.bookUrl)} target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", height: ALVO, padding: "0 12px", borderRadius: 8, border: `1px solid ${T.border}`, backgroundColor: T.surface, color: T.text, fontSize: 12, fontWeight: 700, textDecoration: "none", flexShrink: 0 }}
            >
              Abrir
            </a>
          )}
        </div>

        {item.previousFinalFileUrl && (
          <div style={{ padding: "10px 12px", borderTop: `1px solid ${N.n2}`, backgroundColor: TOM.alerta.bg }}>
            <p style={{ fontSize: 12, color: TOM.alerta.text, margin: 0, lineHeight: 1.45 }}>
              Substituiu <strong>{item.previousFinalFileName || "a versão anterior"}</strong> —{" "}
              <a href={hrefSeguro(item.previousFinalFileUrl)} target="_blank" rel="noopener noreferrer" style={{ color: TOM.alerta.text, fontWeight: 700 }}>ver anterior</a>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
