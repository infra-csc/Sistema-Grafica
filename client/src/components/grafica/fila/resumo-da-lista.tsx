// A borda de cima da lista: o resumo do recorte (quantas peças, quanto m²
// falta, entregues escondidas) e o aviso da peça-filha que nasceu fora dele.
import type React from "react";
import { Check, X } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { FS, FW, R, T, TOM } from "@/lib/theme";
import { alvo as alvoDeToque } from "@/hooks/use-mobile";
import type { FilaDaGrafica } from "@/components/grafica/hooks/use-fila-da-grafica";
import { CO } from "./aparencia";

/**
 * Resumo do recorte. Era o RODAPÉ da tabela: com 200 peças, "quantas são,
 * quanto m² falta e que há entregues escondidas" ficava a metros de rolagem de
 * quem precisa decidir o dia. Mora na borda de cima da lista, junto dos dois
 * chips que descrevem o recorte.
 */
export function ResumoDaLista({ fila, isMobile, ponteiroGrosso, alvoNoTexto, fsMin }: {
  fila: FilaDaGrafica;
  isMobile: boolean;
  ponteiroGrosso: boolean;
  /** Alvo de 44px num botão que mora no meio de uma frase (celular). */
  alvoNoTexto: React.CSSProperties;
  /** Celular: nenhuma informação abaixo de 12px. */
  fsMin: (n: number) => number;
}) {
  const {
    isLoading, isError, filteredItems, complementosAbertos, filtros, patchFiltros, finalizadasNoRecorte,
    resumoDaLista, entreguesOcultas, complementoChipLabel,
  } = fila;
  const temOQueDizer = filteredItems.length > 0 || complementosAbertos.length > 0 || filtros.complementos || finalizadasNoRecorte.total > 0;
  if (isLoading || isError || !temOQueDizer) return null;
  return (
    <div
      data-testid="resumo-da-lista"
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px 12px", padding: isMobile ? "10px 12px" : "10px 16px", borderBottom: `1px solid ${T.border}`, fontSize: isMobile ? 12 : 13, color: T.second, lineHeight: 1.5 }}
    >
      <div style={{ minWidth: 0, flex: "1 1 320px" }}>
        <span aria-live="polite"><strong style={{ color: T.text, fontVariantNumeric: "tabular-nums" }}>{filteredItems.length}</strong> peça{filteredItems.length !== 1 ? "s" : ""}</span>
        {/* O complemento é +1 linha na contagem (é peça de verdade, com
            produção própria). Dizer quantas são evita a pergunta "por que
            agora são 43 se o evento tem 42?". */}
        {(() => {
          const n = resumoDaLista.complementos;
          return n > 0 ? <span style={{ color: CO.text }}> ({n} complemento{n !== 1 ? "s" : ""})</span> : null;
        })()}
        {" · "}
        <strong style={{ color: T.text }}>{resumoDaLista.eventos}</strong> evento{resumoDaLista.eventos !== 1 ? "s" : ""}
        {(() => {
          // O total que importa para a Gráfica é o que AINDA vai ser
          // impresso: peça entregue já saiu da fila e não entra na soma
          // (nem na economia — senão o entregue viraria "economia" falsa).
          // As contas moram em `resumoDaLista` (uma passada, memoizada).
          const { totalM2, printM2, reusedUn } = resumoDaLista;
          if (!totalM2) return null;
          return (
            <>
              {" · "}<strong style={{ color: T.text }}>{printM2.toFixed(2)} m²</strong> a produzir
              {reusedUn > 0 && (
                /* #047857 (emerald-700, 5,48:1) no lugar de #059669: 3,77:1
                   reprova AA em 13px. Fonte: P.emerald.text de lib/status. */
                <span style={{ color: TOM.esmeralda.text }}>
                  {" "}(economia de {(totalM2 - printM2).toFixed(2)} m² · {reusedUn} un. reaproveitada{reusedUn !== 1 ? "s" : ""})
                </span>
              )}
            </>
          );
        })()}
        {/* O espelho da regra acima: mostrar dado sem dizer POR QUE ele
            apareceu também confunde. Escolher um evento revela as entregues
            DELE (lib/grafica-filtros: a faceta de evento é oferecida porque
            o clique revela), e a fila de quem filtra por evento passa a ter
            linhas já terminadas. Uma frase basta — quem quiser só o que
            falta tem as abas de etapa logo acima. */}
        {(() => {
          // Conta na LISTA, não no statsPool: com um status escolhido junto
          // (evento + "Em produção") não há entregue nenhuma na tela, e a
          // frase seria falsa — o defeito que esta tela mais teme é número
          // que não bate com a lista logo acima.
          if (filtros.evento.length === 0 || filtros.entregues) return null;
          const n = resumoDaLista.entreguesNaLista;
          if (n === 0) return null;
          return (
            <span data-testid="nota-entregues-do-evento">
              {" · "}inclui {n} entregue{n !== 1 ? "s" : ""} do evento escolhido
            </span>
          );
        })()}
        {/* Esconder dado sem dizer que está escondido é pior que o problema:
            o chip de reversão é parte da feature, não um extra. */}
        {entreguesOcultas > 0 && (
          <>
            {" · "}
            <button
              type="button"
              onClick={() => patchFiltros({ entregues: true })}
              data-testid="chip-entregues-ocultas"
              title="A tela abre na fila do que falta fazer. Clique para trazer o histórico de entregas de volta."
              style={{ background: "none", border: "none", padding: 0, fontSize: "inherit", fontWeight: 700, color: TOM.ciano.text, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", ...alvoNoTexto }}
            >
              {entreguesOcultas} entregue{entreguesOcultas !== 1 ? "s" : ""} oculta{entreguesOcultas !== 1 ? "s" : ""} · mostrar
            </button>
          </>
        )}
        {filtros.entregues && (
          <>
            {" · "}
            <button
              type="button"
              onClick={() => patchFiltros({ entregues: false })}
              data-testid="chip-ocultar-entregues"
              style={{ background: "none", border: "none", padding: 0, fontSize: "inherit", fontWeight: 700, color: TOM.ciano.text, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", ...alvoNoTexto }}
            >
              ocultar entregues
            </button>
          </>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {/* Chip de complementos — clicável e visível TAMBÉM no celular:
            importante demais para sumir justamente na tela de quem está no
            galpão. É o atalho para a fila de aumentos sem tirar a peça do
            bloco do evento a que ela pertence. */}
        {(complementosAbertos.length > 0 || filtros.complementos) && (
          <button
            type="button"
            onClick={() => patchFiltros({ complementos: !filtros.complementos })}
            aria-pressed={filtros.complementos}
            data-testid="chip-complementos"
            title={filtros.complementos
              ? "Mostrando só complementos — toque para ver a lista inteira"
              : "Mostrar só as peças complementares (aumentos de quantidade pedidos após a produção)"}
            className="ds-botao"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              minHeight: alvoDeToque(28, isMobile || ponteiroGrosso),
              backgroundColor: filtros.complementos ? CO.hoverBg : CO.bg,
              color: CO.text,
              border: `1px solid ${filtros.complementos ? CO.stripe : CO.border}`,
              borderRadius: R.pill, padding: "0 12px",
              fontSize: fsMin(FS.small), fontWeight: FW.forte, cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {filtros.complementos
              ? <Check aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0 }} />
              : <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: CO.stripe, display: "inline-block", flexShrink: 0 }} />}
            {complementoChipLabel}
          </button>
        )}
        {/* Quanto do recorte é evento que já acabou. NÃO é botão: não há o
            que alternar — a regra do dono é que estas peças aparecem, e um
            chip que as escondesse desfaria a decisão num clique. É o
            contrapeso da regra dos contadores (ver `stats`): os números
            seguem a lista, e este chip diz quanto da lista é trabalho morto
            que só aceita conferência e entrega.
            Selo neutro: TOM.neutro.text sobre o bg → 9,42:1. */}
        {finalizadasNoRecorte.total > 0 && (
          <Selo
            tom="neutro"
            ponto
            data-testid="chip-evento-finalizado"
            title={
              [
                finalizadasNoRecorte.encerrado > 0
                  ? `${finalizadasNoRecorte.encerrado} em evento encerrado por um administrador (reabrir o evento traz o trabalho de volta)`
                  : null,
                finalizadasNoRecorte.realizado > 0
                  ? `${finalizadasNoRecorte.realizado} em evento cuja data já passou (não há volta)`
                  : null,
              ].filter(Boolean).join(" e ")
              + ". Elas continuam na fila porque conferir e registrar entrega seguem liberados;"
              + " produzir, reaproveitar e aumentar quantidade estão bloqueados nelas."
            }
            style={{ minHeight: isMobile ? 32 : 28, fontSize: fsMin(FS.small) }}
          >
            {finalizadasNoRecorte.total} de evento finalizado
          </Selo>
        )}
      </div>
    </div>
  );
}

/**
 * Rede de segurança do recorte. A peça-filha pode nascer FORA dos filtros do
 * operador (status, busca, grupo, percurso, evento, chip de complementos): aí a
 * rolagem falharia em silêncio, o pior desfecho possível logo depois de um
 * clique. O recorte NUNCA é limpo sozinho — só por este botão, quando a pessoa
 * pedir.
 */
export function BannerDoComplemento({ bannerComplemento, mostrarComplementoCriado, setBannerComplemento, isMobile, ponteiroGrosso }: {
  bannerComplemento: { id: string; displayId: string } | null;
  mostrarComplementoCriado: () => void;
  setBannerComplemento: (b: { id: string; displayId: string } | null) => void;
  isMobile: boolean;
  ponteiroGrosso: boolean;
}) {
  if (!bannerComplemento) return null;
  return (
    <div
      role="status"
      data-testid="banner-complemento-fora-do-recorte"
      style={{ background: CO.bg, border: `1px solid ${CO.border}`, borderRadius: R.md, padding: "10px 12px", margin: "12px 12px 0", fontSize: FS.meta, color: CO.textStrong, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
    >
      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.45 }}>
        <strong>{bannerComplemento.displayId} criado</strong> — está fora dos filtros atuais.
      </span>
      <Botao
        variante="fantasma"
        tamanho={isMobile || ponteiroGrosso ? "toque" : "sm"}
        onClick={mostrarComplementoCriado}
        data-testid="button-mostrar-complemento"
        style={{ color: CO.text, textDecoration: "underline", flexShrink: 0 }}
      >
        Mostrar
      </Botao>
      <Botao
        variante="fantasma"
        tamanho={isMobile || ponteiroGrosso ? "toque" : "sm"}
        icone={X}
        onClick={() => setBannerComplemento(null)}
        aria-label="Dispensar"
        data-testid="button-dispensar-banner-complemento"
        style={{ width: isMobile || ponteiroGrosso ? 44 : 32, padding: 0, color: CO.text, flexShrink: 0 }}
      />
    </div>
  );
}
