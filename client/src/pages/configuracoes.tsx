// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÕES GERAIS (admin) — nasceu em 26/10 com a duração da etapa de
// Aprovação (Pedro/dono, "Prazos para peças sem aprovação": "editável nas
// configurações — não um valor fixo no código").
//
// O número estende o prazo de Layout das peças "Sem patrocínio" e "Arte do
// cliente" (Layout + N dias CORRIDOS). Vale na hora para toda peça em aberto
// — os prazos são calculados, não gravados — e cada mudança fica na trilha.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Settings2, CalendarClock, Save } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { Botao } from "@/components/ui/botao";
import { EstadoErro } from "@/components/ui/estados";
import { Skeleton } from "@/components/ui/skeleton";
import { FONT, FS, FW, R, T, TOM } from "@/lib/theme";
import { CHAVE_DA_CONFIGURACAO_DE_PRAZOS, useConfiguracaoDePrazos, type ConfiguracaoDePrazos } from "@/hooks/use-configuracoes";
import { DIAS_DA_APROVACAO_MAX, DIAS_DA_APROVACAO_MIN, diasDaAprovacaoValidos, prazoDeLayoutAjustado } from "@shared/prazo-sem-aprovacao";

const EXEMPLO_LAYOUT = "2026-11-10";
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function quando(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function Configuracoes() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useConfiguracaoDePrazos();
  const [valor, setValor] = useState("");
  useEffect(() => { if (data) setValor(String(data.diasDaAprovacao)); }, [data]);

  const salvar = useMutation({
    mutationFn: async (dias: number) => (await apiRequest<ConfiguracaoDePrazos>("PUT", "/api/configuracoes/prazos", { diasDaAprovacao: dias })).json(),
    onSuccess: (c) => {
      queryClient.setQueryData(CHAVE_DA_CONFIGURACAO_DE_PRAZOS, c);
      // Toda tela que mostra prazo recalcula com o número novo.
      for (const k of ["/api/prazos", "/api/events", "/api/analises/painel-operacional"]) queryClient.invalidateQueries({ queryKey: [k] });
      toast({ variant: "success", title: "Configuração salva", description: `As peças sem aprovação passam a ter ${c.diasDaAprovacao} ${c.diasDaAprovacao === 1 ? "dia corrido" : "dias corridos"} a mais no Layout. Os prazos das peças em aberto já foram recalculados.` });
    },
    onError: (error: Error) => toast({ variant: "destructive", title: "Não deu para salvar", description: error.message }),
  });

  const dias = diasDaAprovacaoValidos(valor);
  const mudou = !!data && dias !== null && dias !== data.diasDaAprovacao;

  return (
    <div data-testid="tela-configuracoes" style={{ backgroundColor: T.bg, minHeight: "100%", padding: isMobile ? "16px 16px 48px" : "28px 32px 64px" }}>
      <div style={{ maxWidth: 880 }}>
        <CabecalhoDaPagina
          titulo="Configurações"
          icone={Settings2}
          testId="title-configuracoes"
          subtitulo="Regras gerais do app. Só o admin muda; cada mudança fica no Log do Sistema."
        />

        <section
          aria-labelledby="titulo-prazos"
          style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: isMobile ? 16 : 24 }}
        >
          <h2 id="titulo-prazos" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontFamily: FONT.display, fontSize: FS.title, fontWeight: FW.forte, color: T.text }}>
            <CalendarClock aria-hidden="true" style={{ width: 18, height: 18, color: TOM.turquesa.text }} />
            Prazos das peças sem aprovação
          </h2>
          <p style={{ margin: "6px 0 18px", fontSize: FS.body, color: T.second, lineHeight: 1.55, maxWidth: 680 }}>
            Peças <strong style={{ color: T.text }}>Sem patrocínio</strong> e com <strong style={{ color: T.text }}>Arte do cliente</strong> não passam pela Aprovação.
            O tempo dessa etapa é somado ao prazo de Layout delas — o prazo final, os prazos da Finalização em diante e os prazos das outras peças não mudam.
          </p>

          {isLoading ? (
            <Skeleton style={{ height: 96, borderRadius: R.md }} />
          ) : isError ? (
            <EstadoErro titulo="Não foi possível carregar a configuração" detalhe="Tente de novo em instantes." aoTentarDeNovo={() => refetch()} />
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); if (dias !== null && mudou) salvar.mutate(dias); }}
              style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 16 : 28, alignItems: isMobile ? "stretch" : "flex-start" }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <label htmlFor="dias-da-aprovacao" style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>
                  Dias somados ao Layout das peças sem aprovação
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    id="dias-da-aprovacao"
                    data-testid="input-dias-da-aprovacao"
                    type="number"
                    inputMode="numeric"
                    min={DIAS_DA_APROVACAO_MIN}
                    max={DIAS_DA_APROVACAO_MAX}
                    step={1}
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    aria-describedby="ajuda-dias-da-aprovacao"
                    aria-invalid={dias === null}
                    style={{
                      width: 96, height: 44, padding: "0 12px", fontSize: FS.title, fontFamily: FONT.mono, fontWeight: FW.forte,
                      color: T.text, background: T.surface, borderRadius: R.md,
                      border: `1px solid ${dias === null ? TOM.perigo.border : T.bdark}`,
                    }}
                  />
                  <span style={{ fontSize: FS.body, color: T.second }}>dias corridos</span>
                </div>
                <span id="ajuda-dias-da-aprovacao" style={{ fontSize: FS.meta, color: dias === null ? TOM.perigo.text : T.second }}>
                  {dias === null ? `Use um número inteiro de ${DIAS_DA_APROVACAO_MIN} a ${DIAS_DA_APROVACAO_MAX}.` : `Padrão: ${data?.padrao ?? 7} dias.`}
                </span>
                {data?.atualizadoPor && (
                  <span style={{ fontSize: FS.meta, color: T.second }}>Última mudança: {data.atualizadoPor}{data.atualizadoEm ? `, ${quando(data.atualizadoEm)}` : ""}</span>
                )}
              </div>

              <div
                aria-live="polite"
                data-testid="exemplo-dias-da-aprovacao"
                style={{ flex: 1, minWidth: 0, backgroundColor: TOM.turquesa.bg, border: `1px solid ${TOM.turquesa.border}`, borderRadius: R.md, padding: "12px 14px" }}
              >
                <div style={{ fontSize: FS.meta, fontWeight: FW.rotulo, letterSpacing: "0.06em", textTransform: "uppercase", color: TOM.turquesa.text }}>Exemplo</div>
                <p style={{ margin: "4px 0 0", fontSize: FS.body, color: T.text, lineHeight: 1.5 }}>
                  Layout do evento em <strong>{br(EXEMPLO_LAYOUT)}</strong> → peça sem aprovação vence o Layout em{" "}
                  <strong>{dias !== null ? br(prazoDeLayoutAjustado(EXEMPLO_LAYOUT, dias)) : "—"}</strong>.
                </p>
                <p style={{ margin: "4px 0 0", fontSize: FS.meta, color: T.second, lineHeight: 1.5 }}>
                  Os dias são corridos; se a data cair no sábado vence na sexta, no domingo vence na segunda (a regra do Layout).
                  Com as duas marcas na peça, soma uma vez só.
                </p>
              </div>

              <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "flex-end", paddingTop: isMobile ? 0 : 26 }}>
                <Botao
                  type="submit"
                  variante="primario"
                  icone={Save}
                  carregando={salvar.isPending}
                  disabled={!mudou || salvar.isPending}
                  data-testid="salvar-dias-da-aprovacao"
                  larguraCheia={isMobile}
                >
                  Salvar
                </Botao>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
