// BOOKS (dono, 06/11: "o book poderia ficar em uma tela só pra ele", "está muito
// escondido"). Junta o que estava espalhado: o book oficial de cada evento por vir
// (que vivia em Versões e no "Mais ações" da Arte), quantas peças mudaram desde ele,
// o rascunho automático (que vivia no menu do evento), o que a Conferência de arte
// ainda pede e, para o admin, a conferência do book com a lista de peças.
// Por enquanto só Arte e admin.
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BookOpen, Calendar, Check, Download, FileSearch, ListChecks, RefreshCw, Sparkles, TriangleAlert, Truck, Upload } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile, usePonteiroGrosso } from "@/hooks/use-mobile";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { normalizarBusca, parseDateLocal } from "@/lib/utils";
import { todayBusinessMs } from "@/lib/status";
import { FONT, FS, FW, N, R, T, TOM, type NomeDeTom } from "@/lib/theme";
import { Abas } from "@/components/ui/abas";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EstadoErro, EstadoVazio } from "@/components/ui/estados";
import { Selo } from "@/components/ui/selo";
import { EsqueletoDeFila } from "@/components/esqueleto-de-fila";
import { PainelDoBook } from "@/components/eventos/painel-do-book";
import { useAuditoriasDoBook } from "@/components/eventos/use-auditorias-do-book";
import { canceladasEmAberto, divergenciasEmAberto, faltandoEmAberto } from "@shared/auditoria-do-book";

type LinhaDoBook = {
  id: string; nome: string; inicio: string | null; saida: string | null; pecas: number; comArte: number;
  bookUrl: string | null; bookPecas: number | null; bookPor: string | null; bookEm: string | null; bookComentario: string | null; publicacoes: number;
  mudaram: number | null;
  rascunhoVersao: number | null; rascunhoEm: string | null; rascunhoUrl: string | null; rascunhoPaginas: number | null; rascunhoOrigens: Record<string, number> | null;
  conferenciaPendente: number;
};
type Aba = "atencao" | "todos" | "sem_book";

const CHAVE = ["/api/books"];
const FUSO = "America/Sao_Paulo";
/** Sem book e com o caminhão saindo nestes dias: pede atenção. */
const SEM_BOOK_PEDE_ATENCAO_DIAS = 15;

function quando(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO });
  const dia = d.toLocaleDateString("pt-BR", { timeZone: FUSO });
  return dia === new Date().toLocaleDateString("pt-BR", { timeZone: FUSO }) ? `hoje às ${hora}` : `${dia.slice(0, 5)} às ${hora}`;
}
const diasAte = (d: string | null) => (d ? Math.round((parseDateLocal(d).getTime() - todayBusinessMs()) / 86400000) : null);
function urgencia(saida: string | null): { rotulo: string; tom: NomeDeTom } | null {
  const dias = diasAte(saida);
  if (dias === null) return null;
  if (dias < 0) return { rotulo: dias === -1 ? "saiu ontem" : `saiu há ${-dias} dias`, tom: "neutro" };
  if (dias === 0) return { rotulo: "sai hoje", tom: "perigo" };
  if (dias === 1) return { rotulo: "sai amanhã", tom: "perigo" };
  return { rotulo: `sai em ${dias} dias`, tom: dias <= 3 ? "perigo" : dias <= 7 ? "alerta" : "neutro" };
}
const dataCurta = (d: string | null) => (d ? parseDateLocal(d).toLocaleDateString("pt-BR") : "sem data");
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export default function Books() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const dedo = usePonteiroGrosso() || isMobile;
  const tamanho = dedo ? "toque" : "sm";
  const admin = user?.role === "admin";
  const { data, isLoading, isError, refetch, isFetching } = useQuery<LinhaDoBook[]>({ queryKey: CHAVE, staleTime: 30_000 });
  // A conferência do book com a lista (IA, 19/10) é do admin e da Solicitação; aqui, do admin.
  const aud = useAuditoriasDoBook(admin ? user : null);
  const [painel, setPainel] = useState<{ id: string; nome: string } | null>(null);
  const [abaEscolhida, setAba] = useState<Aba | null>(null);
  const [busca, setBusca] = useState("");

  const achadosPorEvento = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of aud.auditorias) m.set(a.eventId, faltandoEmAberto(a).length + canceladasEmAberto(a).length + divergenciasEmAberto(a).length);
    return m;
  }, [aud.auditorias]);

  const linhas = data ?? [];
  const atencao = (l: LinhaDoBook) => {
    if ((l.mudaram ?? 0) > 0 || l.conferenciaPendente > 0 || (achadosPorEvento.get(l.id) ?? 0) > 0) return true;
    const dias = diasAte(l.saida);
    return !l.bookUrl && l.comArte > 0 && dias !== null && dias >= 0 && dias <= SEM_BOOK_PEDE_ATENCAO_DIAS;
  };
  const grupos = useMemo<Record<Aba, LinhaDoBook[]>>(() => ({
    atencao: linhas.filter(atencao),
    todos: linhas,
    sem_book: linhas.filter((l) => !l.bookUrl),
  }), [linhas, achadosPorEvento]); // eslint-disable-line react-hooks/exhaustive-deps
  const aba: Aba = abaEscolhida ?? (grupos.atencao.length > 0 ? "atencao" : "todos");
  const visiveis = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    return grupos[aba].filter((l) => !termo || normalizarBusca(l.nome).includes(termo));
  }, [grupos, aba, busca]);

  const gerar = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/book-automatico/${id}/gerar`, {})).json() as Promise<{ versao: number }>,
    onSuccess: (r) => { toast({ title: `Rascunho gerado (versão ${r.versao})`, description: "Não foi enviado a ninguém.", variant: "success" }); void queryClient.invalidateQueries({ queryKey: CHAVE }); },
    onError: (e: Error) => toast({ title: "Não foi possível gerar o rascunho", description: e.message, variant: "destructive" }),
  });

  const desatualizados = linhas.filter((l) => (l.mudaram ?? 0) > 0).length;
  const semBook = linhas.filter((l) => !l.bookUrl).length;

  return (
    <div data-testid="pagina-books" className="container mx-auto p-4 max-w-6xl 2xl:max-w-[1440px]" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <CabecalhoDaPagina
        titulo="Books"
        subtitulo={isMobile
          ? "O book de cada evento por vir: oficial, rascunho e o que falta."
          : "O book de cada evento por vir: a versão oficial, quantas peças mudaram depois dela, o rascunho automático e o que ainda falta conferir."}
      />
      {data && (
        <p data-testid="resumo-books" style={{ margin: 0, fontSize: FS.body, color: T.apoio }}>
          {plural(linhas.length, "evento por vir", "eventos por vir")} · <strong style={{ color: desatualizados ? TOM.alerta.text : T.text }}>{plural(desatualizados, "book desatualizado", "books desatualizados")}</strong> · {plural(semBook, "sem book", "sem book")}
        </p>
      )}
      <Abas
        rotuloDaLista="Recorte dos books"
        prefixoDeTestId="aba-books"
        ativo={aba}
        aoTrocar={(id) => setAba(id as Aba)}
        itens={[
          { id: "atencao", rotulo: "Pedem atenção", contador: grupos.atencao.length || undefined, tom: "alerta" },
          { id: "todos", rotulo: "Todos", contador: grupos.todos.length || undefined },
          { id: "sem_book", rotulo: "Sem book", contador: grupos.sem_book.length || undefined },
        ]}
      />
      {linhas.length > 0 && (
        <input
          type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar evento" aria-label="Buscar evento" data-testid="busca-books" className="grf-campo"
          style={{ height: dedo ? 44 : 38, padding: "0 12px", borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.surface, color: T.text, fontSize: FS.body, maxWidth: 420, width: "100%" }}
        />
      )}

      {isLoading ? <EsqueletoDeFila linhas={5} />
        : isError ? <EstadoErro titulo="Não foi possível carregar os books" detalhe="Verifique sua conexão e tente novamente." aoTentarDeNovo={isFetching ? undefined : () => { void refetch(); }} />
        : visiveis.length === 0 ? (
          <EstadoVazio
            icone={BookOpen} testId="vazio-books"
            titulo={busca.trim() ? "Nenhum evento com esse nome" : { atencao: "Nenhum book pedindo atenção", todos: "Nenhum evento por vir", sem_book: "Todo evento por vir já tem book" }[aba]}
            descricao={busca.trim() ? "Mude a busca." : aba === "atencao" ? "Books atualizados, sem conferência pendente e nenhum caminhão próximo sem book." : "Os eventos aparecem aqui até a data de início."}
          />
        ) : (
          <div data-testid="lista-books" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visiveis.map((l) => {
              const u = urgencia(l.saida);
              const achados = achadosPorEvento.get(l.id) ?? 0;
              const o = l.rascunhoOrigens;
              const iguais = (o?.mantida ?? 0), trocadas = (o?.trocada ?? 0), refeitas = (o?.refeita ?? 0) + (o?.nova ?? 0);
              return (
                <article key={l.id} data-testid={`book-${l.id}`} style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: isMobile ? 12 : 16, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
                  <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px" }}>
                    <h2 style={{ margin: 0, flex: "1 1 260px", minWidth: 0, fontFamily: FONT.display, fontSize: FS.strong, fontWeight: FW.rotulo, color: T.text, overflowWrap: "anywhere" }}>{l.nome}</h2>
                    <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px", fontSize: FS.meta, color: T.second }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Calendar aria-hidden="true" style={{ width: 13, height: 13 }} />Início {dataCurta(l.inicio)}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Truck aria-hidden="true" style={{ width: 13, height: 13 }} />Saída {dataCurta(l.saida)}</span>
                      {u && <Selo tom={u.tom} tamanho="sm">{u.rotulo}</Selo>}
                    </span>
                  </header>

                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
                    {/* O book oficial */}
                    <section aria-label="Book oficial" style={{ display: "flex", flexDirection: "column", gap: 6, padding: 12, borderRadius: R.md, backgroundColor: T.low, minWidth: 0 }}>
                      <span style={{ fontSize: FS.small, fontWeight: FW.forte, color: T.apoio, textTransform: "uppercase", letterSpacing: "0.04em" }}>Book oficial</span>
                      {l.bookUrl ? (
                        <>
                          <span style={{ fontSize: FS.body, color: T.text }}>
                            <strong>{l.publicacoes > 1 ? `Versão ${l.publicacoes}` : "Versão 1"}</strong> · {quando(l.bookEm)}{l.bookPor ? ` por ${l.bookPor}` : ""}
                          </span>
                          <span style={{ fontSize: FS.meta, color: T.second }}>{plural(l.bookPecas ?? 0, "peça ligada", "peças ligadas")} de {l.pecas}</span>
                          {(l.mudaram ?? 0) > 0
                            ? <Selo tom="alerta" icone={TriangleAlert} tamanho="sm" data-testid={`desatualizado-${l.id}`}>{plural(l.mudaram!, "peça mudou depois", "peças mudaram depois")}</Selo>
                            : <Selo tom="sucesso" icone={Check} tamanho="sm">Em dia com as artes</Selo>}
                        </>
                      ) : (
                        <span style={{ fontSize: FS.body, color: T.second }}>Ainda sem book · {plural(l.comArte, "peça com arte", "peças com arte")} de {l.pecas}</span>
                      )}
                    </section>

                    {/* O rascunho automático */}
                    <section aria-label="Rascunho automático" style={{ display: "flex", flexDirection: "column", gap: 6, padding: 12, borderRadius: R.md, backgroundColor: T.low, minWidth: 0 }}>
                      <span style={{ fontSize: FS.small, fontWeight: FW.forte, color: T.apoio, textTransform: "uppercase", letterSpacing: "0.04em" }}>Rascunho automático</span>
                      {l.rascunhoVersao ? (
                        <>
                          <span style={{ fontSize: FS.body, color: T.text }}><strong>Versão {l.rascunhoVersao}</strong> · {quando(l.rascunhoEm)} · {plural(l.rascunhoPaginas ?? 0, "página", "páginas")}</span>
                          <span style={{ fontSize: FS.meta, color: T.second }}>
                            {o && (iguais || trocadas || refeitas)
                              ? [iguais ? `${iguais} iguais ao oficial` : null, trocadas ? `${trocadas} com arte trocada` : null, refeitas ? `${refeitas} refeitas` : null].filter(Boolean).join(" · ")
                              : "Montado do zero, no padrão do circuito"}
                          </span>
                        </>
                      ) : (
                        <span style={{ fontSize: FS.body, color: T.second }}>{l.comArte > 0 ? "Ainda não gerado" : "Sem artes para montar"}</span>
                      )}
                    </section>

                    {/* O que falta conferir */}
                    <section aria-label="Conferências" style={{ display: "flex", flexDirection: "column", gap: 6, padding: 12, borderRadius: R.md, backgroundColor: T.low, minWidth: 0 }}>
                      <span style={{ fontSize: FS.small, fontWeight: FW.forte, color: T.apoio, textTransform: "uppercase", letterSpacing: "0.04em" }}>Conferências</span>
                      {l.conferenciaPendente > 0
                        ? <BotaoLink href="/conferencia-arquivos" variante="secundario" tamanho={tamanho} icone={FileSearch} data-testid={`conferencia-${l.id}`} style={{ alignSelf: "flex-start" }}>{plural(l.conferenciaPendente, "arquivo para olhar", "arquivos para olhar")}</BotaoLink>
                        : <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: FS.body, color: T.second }}><Check aria-hidden="true" style={{ width: 14, height: 14, color: TOM.sucesso.text }} />Arquivos finais sem pendência</span>}
                      {admin && (achados > 0
                        ? <Botao variante="secundario" tamanho={tamanho} icone={ListChecks} onClick={() => setPainel({ id: l.id, nome: l.nome })} data-testid={`achados-${l.id}`} style={{ alignSelf: "flex-start" }}>{plural(achados, "achado do book × lista", "achados do book × lista")}</Botao>
                        : achadosPorEvento.has(l.id) ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: FS.body, color: T.second }}><Check aria-hidden="true" style={{ width: 14, height: 14, color: TOM.sucesso.text }} />Book bate com a lista</span> : null)}
                    </section>
                  </div>

                  <footer style={{ display: "flex", flexWrap: "wrap", gap: 8, borderTop: `1px solid ${N.n3}`, paddingTop: 10 }}>
                    {l.bookUrl && <BotaoLink href={l.bookUrl} externo target="_blank" rel="noreferrer" variante="secundario" tamanho={tamanho} icone={Download} data-testid={`baixar-${l.id}`}>Abrir o oficial</BotaoLink>}
                    {l.rascunhoVersao
                      ? <BotaoLink href={`/eventos/${l.id}/book-automatico`} variante="secundario" tamanho={tamanho} icone={Sparkles} data-testid={`rascunho-${l.id}`}>Abrir o rascunho</BotaoLink>
                      : l.comArte > 0 && <Botao variante="secundario" tamanho={tamanho} icone={RefreshCw} carregando={gerar.isPending && gerar.variables === l.id} disabled={gerar.isPending} onClick={() => gerar.mutate(l.id)} data-testid={`gerar-${l.id}`}>Gerar rascunho</Botao>}
                    <BotaoLink href={`/arte?subirBook=${encodeURIComponent(l.id)}`} variante={(l.mudaram ?? 0) > 0 || (!l.bookUrl && l.comArte > 0) ? "primario" : "secundario"} tamanho={tamanho} icone={Upload} data-testid={`publicar-${l.id}`}>{l.bookUrl ? "Publicar nova versão" : "Publicar book"}</BotaoLink>
                  </footer>
                </article>
              );
            })}
          </div>
        )}

      {admin && <PainelDoBook eventId={painel?.id ?? null} nomeDoEvento={painel?.nome} onFechar={() => setPainel(null)} aud={aud} isMobile={isMobile} admin={admin} />}
    </div>
  );
}
