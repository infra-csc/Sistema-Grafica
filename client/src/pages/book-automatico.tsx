// RASCUNHO DO BOOK (04/11): monta o book sozinho a partir dos thumbs de agora, no
// padrão dos books do circuito. É um teste ao lado do fluxo atual: não envia e-mail,
// não muda o book das peças e não abre aprovação. Depois de gerado, ele se refaz
// sozinho quando um thumb muda. As regras moram em @shared/book-automatico.
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Check, ExternalLink, FileWarning, RefreshCw, TriangleAlert } from "lucide-react";
import { useRoute } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile, usePonteiroGrosso } from "@/hooks/use-mobile";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FONT, FS, FW, N, R, T, TOM } from "@/lib/theme";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EstadoErro, EstadoVazio } from "@/components/ui/estados";
import { Selo } from "@/components/ui/selo";
import { EsqueletoDeFila } from "@/components/esqueleto-de-fila";
import type { MudancasDoBook } from "@shared/book-automatico";

type Pagina = { rotulo: string; pecas: Array<string | null>; conferir: string | null };
type Fora = { id: string; displayId: string | null; tipo: string; descricao: string | null; motivo: string };
type Versao = {
  id: string; versao: number; pdfUrl: string; paginas: number; pecasNoBook: number; plano: Pagina[]; fora: Fora[]; mudancas: MudancasDoBook | null;
  modeloEvento: string | null; geradoPor: string; automatico: boolean; tamanho: number | null; criadoEm: string;
};
type Resposta = {
  evento: { id: string; nome: string };
  versoes: Versao[];
  pendente: MudancasDoBook | null;
  oficial: { url: string; pecas: number; por: string | null; em: string; publicacoes: number } | null;
};

const FUSO = "America/Sao_Paulo";
function quando(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO });
  const dia = d.toLocaleDateString("pt-BR", { timeZone: FUSO });
  return dia === new Date().toLocaleDateString("pt-BR", { timeZone: FUSO }) ? `hoje às ${hora}` : `${dia.slice(0, 5)} às ${hora}`;
}
const fraseDasMudancas = (m: MudancasDoBook | null): string | null => {
  if (!m) return null;
  const partes = [
    m.trocadas.length ? `${m.trocadas.length} ${m.trocadas.length === 1 ? "thumb trocado" : "thumbs trocados"} (${m.trocadas.slice(0, 6).join(", ")}${m.trocadas.length > 6 ? "…" : ""})` : null,
    m.novas.length ? `${m.novas.length} ${m.novas.length === 1 ? "peça nova" : "peças novas"}` : null,
    m.saiu.length ? `${m.saiu.length} ${m.saiu.length === 1 ? "peça saiu" : "peças saíram"}` : null,
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
};
const cartao = { backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: 16, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 } as const;
const tituloDaSecao = { margin: 0, fontFamily: FONT.display, fontSize: FS.strong, fontWeight: FW.rotulo, color: T.text } as const;

export default function BookAutomatico() {
  const [, params] = useRoute("/eventos/:id/book-automatico");
  const eventId = params?.id ?? "";
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const dedo = usePonteiroGrosso() || isMobile;
  const tamanho = dedo ? "toque" : "md";
  const chave = ["/api/book-automatico", eventId];
  const { data, isLoading, isError, refetch, isFetching } = useQuery<Resposta>({ queryKey: chave, enabled: !!eventId, staleTime: 15_000 });

  const gerar = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/book-automatico/${eventId}/gerar`, {})).json() as Promise<{ versao: number }>,
    onSuccess: (r) => { toast({ title: `Rascunho ${r.versao} pronto`, description: "Não foi enviado a ninguém.", variant: "success" }); void queryClient.invalidateQueries({ queryKey: chave }); },
    onError: (e: Error) => toast({ title: "Não foi possível gerar", description: e.message, variant: "destructive" }),
  });

  const ultima = data?.versoes[0] ?? null;
  const pendente = fraseDasMudancas(data?.pendente ?? null);
  const paraConferir = ultima?.plano.filter((p) => p.conferir) ?? [];

  return (
    <div data-testid="pagina-book-automatico" className="container mx-auto p-4 max-w-6xl 2xl:max-w-[1440px]" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <BotaoLink href={`/eventos/${eventId}`} variante="secundario" tamanho={dedo ? "toque" : "sm"} icone={ArrowLeft} style={{ alignSelf: "flex-start" }}>Voltar ao evento</BotaoLink>
      <CabecalhoDaPagina
        titulo="Rascunho do book"
        subtitulo={data ? data.evento.nome : "Montado sozinho a partir dos thumbs de agora, no padrão dos books do circuito."}
      />
      {isLoading ? <EsqueletoDeFila linhas={4} />
        : isError || !data ? <EstadoErro titulo="Não foi possível carregar o rascunho" detalhe="Verifique sua conexão e tente novamente." aoTentarDeNovo={isFetching ? undefined : () => { void refetch(); }} />
        : (
          <>
            <p data-testid="aviso-rascunho" style={{ margin: 0, display: "flex", gap: 8, alignItems: "flex-start", padding: "9px 12px", borderRadius: R.md, backgroundColor: TOM.info.bg, border: `1px solid ${TOM.info.border}`, color: TOM.info.text, fontSize: FS.body }}>
              <FileWarning aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2 }} />
              <span><strong>Só um teste.</strong> O rascunho não vai para ninguém, não muda o book das peças e não abre aprovação. O book oficial continua sendo o que a Arte publica.</span>
            </p>

            {!ultima ? (
              <section style={cartao}>
                <EstadoVazio icone={BookOpen} testId="vazio-rascunho" titulo="Nenhum rascunho ainda" descricao="Ao gerar, o sistema monta o book com os thumbs de agora. Depois disso, ele se refaz sozinho quando um thumb mudar." />
                <Botao variante="primario" tamanho={tamanho} icone={BookOpen} carregando={gerar.isPending} onClick={() => gerar.mutate()} data-testid="gerar-rascunho" style={{ alignSelf: "center" }}>{gerar.isPending ? "Gerando…" : "Gerar rascunho"}</Botao>
              </section>
            ) : (
              <>
                <section data-testid="rascunho-atual" style={{ ...cartao, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px 20px" }}>
                  <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                      <strong style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: FW.rotulo, color: T.text }}>Versão {ultima.versao}</strong>
                      {pendente ? <Selo tom="alerta" ponto>Desatualizado</Selo> : <Selo tom="sucesso" ponto>Em dia com os thumbs</Selo>}
                    </div>
                    <p style={{ margin: 0, fontSize: FS.body, color: T.apoio }}>{ultima.paginas} páginas · {ultima.pecasNoBook} peças · {ultima.fora.length} fora do book</p>
                    <p style={{ margin: 0, fontSize: FS.meta, color: T.second, overflowWrap: "anywhere" }}>
                      {ultima.automatico ? "Atualizado sozinho" : `Gerado por ${ultima.geradoPor}`} {quando(ultima.criadoEm)}
                      {ultima.modeloEvento ? ` · capa e rodapé de ${ultima.modeloEvento}` : " · sem book anterior do circuito: capa e rodapé simples"}
                    </p>
                    {pendente && <p style={{ margin: 0, fontSize: FS.meta, color: TOM.alerta.text, overflowWrap: "anywhere" }}><strong>Mudou desde esta versão:</strong> {pendente}. Refaz sozinho em até 25 minutos.</p>}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <BotaoLink href={ultima.pdfUrl} externo variante="primario" tamanho={tamanho} icone={ExternalLink} data-testid="abrir-rascunho">Abrir PDF</BotaoLink>
                    <Botao variante="secundario" tamanho={tamanho} icone={RefreshCw} carregando={gerar.isPending} onClick={() => gerar.mutate()} data-testid="gerar-rascunho">{gerar.isPending ? "Gerando…" : "Gerar de novo"}</Botao>
                  </div>
                </section>

                {data.oficial && (
                  <p data-testid="book-oficial" style={{ margin: 0, fontSize: FS.meta, color: T.second, overflowWrap: "anywhere" }}>
                    Book oficial: publicado {quando(data.oficial.em)}{data.oficial.por ? ` por ${data.oficial.por.trim()}` : ""}, cobre {data.oficial.pecas} peças. Este evento já teve {data.oficial.publicacoes} {data.oficial.publicacoes === 1 ? "publicação" : "publicações"}.{" "}
                    <a href={data.oficial.url} target="_blank" rel="noreferrer" style={{ color: T.accentText }}>Abrir para comparar</a>
                  </p>
                )}

                {paraConferir.length > 0 && (
                  <section data-testid="para-conferir" style={{ ...cartao, backgroundColor: TOM.alerta.bg, borderColor: TOM.alerta.border }}>
                    <h2 style={{ ...tituloDaSecao, color: TOM.alerta.text, display: "flex", gap: 8, alignItems: "center" }}><TriangleAlert aria-hidden="true" style={{ width: 16, height: 16 }} /> Vale conferir: {paraConferir.length} {paraConferir.length === 1 ? "página" : "páginas"}</h2>
                    <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4, fontSize: FS.body, color: TOM.alerta.text }}>
                      {paraConferir.map((p, i) => <li key={`${p.rotulo}-${i}`} style={{ overflowWrap: "anywhere" }}><strong>{p.rotulo}:</strong> {p.conferir}</li>)}
                    </ul>
                  </section>
                )}

                <section data-testid="paginas-do-rascunho" style={cartao}>
                  <h2 style={tituloDaSecao}>Páginas</h2>
                  <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
                    <li style={{ padding: "7px 0", display: "flex", gap: 10, fontSize: FS.body, color: T.apoio }}><span style={{ width: 26, flexShrink: 0, color: T.second, fontVariantNumeric: "tabular-nums" }}>1</span>Capa</li>
                    {ultima.plano.map((p, i) => (
                      <li key={`${p.rotulo}-${i}`} style={{ padding: "7px 0", borderTop: `1px solid ${N.n3}`, display: "flex", gap: 10, alignItems: "baseline", minWidth: 0 }}>
                        <span style={{ width: 26, flexShrink: 0, fontSize: FS.body, color: T.second, fontVariantNumeric: "tabular-nums" }}>{i + 2}</span>
                        <span style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", gap: "2px 10px", alignItems: "baseline" }}>
                          <strong style={{ fontSize: FS.body, color: T.text, overflowWrap: "anywhere" }}>{p.rotulo}</strong>
                          <span style={{ fontSize: FS.small, color: T.second, overflowWrap: "anywhere" }}>{p.pecas.length} {p.pecas.length === 1 ? "peça" : "peças"}: {p.pecas.slice(0, 12).join(", ")}{p.pecas.length > 12 ? "…" : ""}</span>
                        </span>
                        {p.conferir ? <Selo tom="alerta" tamanho="sm">Conferir</Selo> : <Check aria-label="Página sem observação" style={{ width: 14, height: 14, color: TOM.sucesso.text, flexShrink: 0 }} />}
                      </li>
                    ))}
                  </ol>
                </section>

                {ultima.fora.length > 0 && (
                  <section data-testid="fora-do-rascunho" style={cartao}>
                    <h2 style={tituloDaSecao}>Fora do book: {ultima.fora.length} {ultima.fora.length === 1 ? "peça" : "peças"}</h2>
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                      {ultima.fora.map((f) => (
                        <li key={f.id} style={{ fontSize: FS.meta, color: T.apoio, overflowWrap: "anywhere" }}>
                          <strong style={{ fontFamily: FONT.mono, color: T.accentText }}>{f.displayId}</strong> {f.tipo}{f.descricao ? ` · ${f.descricao}` : ""} <span style={{ color: T.second }}>({f.motivo})</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {data.versoes.length > 1 && (
                  <section data-testid="versoes-do-rascunho" style={cartao}>
                    <h2 style={tituloDaSecao}>Versões</h2>
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
                      {data.versoes.map((v) => (
                        <li key={v.id} style={{ padding: "7px 0", borderTop: `1px solid ${N.n3}`, display: "flex", flexWrap: "wrap", gap: "2px 10px", alignItems: "baseline", fontSize: FS.meta }}>
                          <a href={v.pdfUrl} target="_blank" rel="noreferrer" style={{ fontWeight: FW.forte, color: T.accentText }}>Versão {v.versao}</a>
                          <span style={{ color: T.second }}>{quando(v.criadoEm)} · {v.automatico ? "automática" : v.geradoPor}</span>
                          <span style={{ color: T.apoio, overflowWrap: "anywhere" }}>{fraseDasMudancas(v.mudancas) ?? (v.mudancas ? "Sem mudança nas artes" : "Primeira versão")}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </>
        )}
    </div>
  );
}
