// BOOK × LISTA — o painel de um evento (dono, 19/10). Abre pela faixa
// "peças desenhadas nos books não estão na lista" e pelo aviso do sino.
//
// Cada achado diz a página (com link que abre o PDF NA página), a peça como o
// book mostra, o porquê, e a certeza da IA. Quem monta a lista resolve um a
// um: "Já cadastrei" ou "Não precisa" — a contagem da faixa, do selo e do
// menu cai na hora. As divergências (a peça existe, mas diferente do book)
// vêm numa seção à parte, com "Já conferi".
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ban, Check, ChevronDown, ExternalLink, FileSearch, KeyRound, Loader2, Plus, RefreshCw, Undo2, X,
} from "lucide-react";
import {
  ROTULO_DA_CONFIANCA, canceladasDe, linkDaPagina, nPecas,
  type AchadoCancelada, type AchadoFaltando, type AuditoriaDoBookVista, type ConfiancaDoAchado, type DivergenciaDoBook,
  type MotivoDaResolucao, type ResolucaoDoAchado,
} from "@shared/auditoria-do-book";
import { T, TOM, FS, R, FW, FONT } from "@/lib/theme";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ModalHeader, ModalFooter, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { EstadoVazio, EstadoErro, Esqueleto } from "@/components/ui/estados";
import { CHAVE_DAS_AUDITORIAS, type AuditoriasDoBook } from "./use-auditorias-do-book";

const dataHora = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};
const diaMes = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : null);

const COR_DA_CONFIANCA: Record<ConfiancaDoAchado, { bg: string; border: string; text: string; dot: string }> = {
  alta: TOM.perigo,
  media: TOM.alerta,
  baixa: TOM.neutro,
};

const ROTULO_DO_MOTIVO: Record<MotivoDaResolucao, string> = {
  cadastrada: "Já cadastrada",
  nao_precisa: "Não precisa",
  conferida: "Conferida",
};
/** O mesmo motivo lido no achado de peça CANCELADA no app. */
const ROTULO_DO_MOTIVO_CANCELADA: Partial<Record<MotivoDaResolucao, string>> = {
  cadastrada: "Resolvida",
  nao_precisa: "Cancelada de propósito",
};

const ROTULO: React.CSSProperties = {
  margin: 0, fontSize: FS.micro, fontWeight: FW.rotulo, color: T.second, textTransform: "uppercase", letterSpacing: "0.08em",
};

function LinkDaPagina({ bookUrl, pagina, isMobile = false }: { bookUrl: string; pagina: number | null; isMobile?: boolean }) {
  if (!pagina) return <span style={{ ...ROTULO, letterSpacing: "0.06em" }}>Sem página</span>;
  return (
    <a
      href={linkDaPagina(bookUrl, pagina)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Abrir o book na página ${pagina} (nova aba)`}
      style={{
        // No dedo, 36 de altura: é o atalho para conferir o achado no PDF.
        display: "inline-flex", alignItems: "center", gap: 4, height: isMobile ? 36 : 24, padding: isMobile ? "0 12px" : "0 8px", borderRadius: R.sm,
        border: `1px solid ${T.border}`, backgroundColor: T.surface, color: T.strong, textDecoration: "none",
        fontSize: FS.small, fontWeight: FW.forte, fontFamily: FONT.mono, whiteSpace: "nowrap",
      }}
    >
      Pág. {pagina}
      <ExternalLink aria-hidden="true" style={{ width: 11, height: 11 }} />
    </a>
  );
}

function ChipDeConfianca({ c }: { c: ConfiancaDoAchado }) {
  const cor = COR_DA_CONFIANCA[c];
  return (
    <span
      data-testid={`confianca-${c}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5, height: 22, padding: "0 8px", borderRadius: R.pill,
        backgroundColor: cor.bg, border: `1px solid ${cor.border}`, color: cor.text,
        fontSize: FS.small, fontWeight: FW.forte, whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: cor.dot }} />
      {ROTULO_DA_CONFIANCA[c]}
    </span>
  );
}

const CARTAO: React.CSSProperties = {
  listStyle: "none", border: `1px solid ${T.border}`, borderRadius: R.lg, backgroundColor: T.surface,
  padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6, minWidth: 0,
};

function Acoes({ children, isMobile }: { children: React.ReactNode; isMobile: boolean }) {
  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4, ...(isMobile ? { flexDirection: "row" } : {}) }}>{children}</div>;
}

function CartaoFaltando({ f, a, isMobile, onResolver, pendente }: {
  f: AchadoFaltando;
  a: AuditoriaDoBookVista;
  isMobile: boolean;
  onResolver: (chave: string, motivo: MotivoDaResolucao | null) => void;
  pendente: boolean;
}) {
  const tamanho = isMobile ? "toque" : "sm";
  return (
    <li style={CARTAO} data-testid={`achado-${f.chave}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <LinkDaPagina bookUrl={a.bookUrl} pagina={f.pagina} isMobile={isMobile} />
        <ChipDeConfianca c={f.confianca} />
      </div>
      <h4 style={{ margin: 0, fontSize: FS.read, fontWeight: FW.forte, color: T.text, lineHeight: 1.35, overflowWrap: "anywhere" }}>{f.pecaNoBook}</h4>
      {f.detalhe && <p style={{ margin: 0, fontSize: FS.body, lineHeight: 1.5, color: T.apoio, overflowWrap: "anywhere" }}>{f.detalhe}</p>}
      {f.candidata && (
        <p style={{ margin: 0, fontSize: FS.body, lineHeight: 1.5, color: T.apoio }}>
          <span style={{ fontWeight: FW.forte, color: T.strong }}>Mais parecida na lista: </span>
          {f.candidataId ? (
            <Link href={`/eventos/${a.eventId}?item=${f.candidataId}`} style={{ color: T.accentText, fontWeight: FW.forte, textDecoration: "underline", textUnderlineOffset: 2 }}>
              {f.candidata}
            </Link>
          ) : f.candidata}
        </p>
      )}
      <Acoes isMobile={isMobile}>
        <Botao variante="secundarioForte" tamanho={tamanho} icone={Check} disabled={pendente} onClick={() => onResolver(f.chave, "cadastrada")}
          data-testid={`ja-cadastrei-${f.chave}`} aria-label={`Já cadastrei: ${f.pecaNoBook}`}>
          Já cadastrei
        </Botao>
        <Botao variante="fantasma" tamanho={tamanho} icone={X} disabled={pendente} onClick={() => onResolver(f.chave, "nao_precisa")}
          data-testid={`nao-precisa-${f.chave}`} aria-label={`Não precisa: ${f.pecaNoBook}`}>
          Não precisa
        </Botao>
      </Acoes>
    </li>
  );
}

/**
 * Desenhada no book, mas a peça correspondente está CANCELADA no app (dono,
 * 19/10: patrocinador trocado). Não é "esqueceram de cadastrar" — é decidir:
 * o book está velho (cancelada de propósito) ou a peça precisa voltar.
 */
function CartaoCancelada({ c, a, isMobile, onResolver, pendente }: {
  c: AchadoCancelada;
  a: AuditoriaDoBookVista;
  isMobile: boolean;
  onResolver: (chave: string, motivo: MotivoDaResolucao | null) => void;
  pendente: boolean;
}) {
  const tamanho = isMobile ? "toque" : "sm";
  return (
    <li style={CARTAO} data-testid={`cancelada-${c.chave}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <LinkDaPagina bookUrl={a.bookUrl} pagina={c.pagina} isMobile={isMobile} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 22, padding: "0 8px", borderRadius: R.pill, backgroundColor: TOM.neutro.bg, border: `1px solid ${TOM.neutro.border}`, color: TOM.neutro.text, fontSize: FS.small, fontWeight: FW.forte, whiteSpace: "nowrap" }}>
          <Ban aria-hidden="true" style={{ width: 11, height: 11 }} />
          Cancelada no app
        </span>
      </div>
      <h4 style={{ margin: 0, fontSize: FS.read, fontWeight: FW.forte, color: T.text, lineHeight: 1.35, overflowWrap: "anywhere" }}>{c.pecaNoBook}</h4>
      <p style={{ margin: 0, fontSize: FS.body, lineHeight: 1.5, color: T.apoio }}>
        <span style={{ fontWeight: FW.forte, color: T.strong }}>No book, mas cancelada no app — </span>
        {c.ids.map((id, i) => (
          <span key={id}>
            {i > 0 && ", "}
            <Link href={`/eventos/${a.eventId}?item=${id}`} style={{ color: T.accentText, fontWeight: FW.forte, textDecoration: "underline", textUnderlineOffset: 2 }}>
              {c.rotulos[i] ?? "peça"}
            </Link>
          </span>
        ))}
      </p>
      {c.detalhe && <p style={{ margin: 0, fontSize: FS.body, lineHeight: 1.5, color: T.apoio, overflowWrap: "anywhere" }}>{c.detalhe}</p>}
      <Acoes isMobile={isMobile}>
        <Botao variante="secundarioForte" tamanho={tamanho} icone={Check} disabled={pendente} onClick={() => onResolver(c.chave, "cadastrada")}
          data-testid={`ja-resolvi-${c.chave}`} aria-label={`Já resolvi: ${c.pecaNoBook}`}>
          Já resolvi
        </Botao>
        <Botao variante="fantasma" tamanho={tamanho} icone={X} disabled={pendente} onClick={() => onResolver(c.chave, "nao_precisa")}
          data-testid={`cancelada-de-proposito-${c.chave}`} aria-label={`Cancelada de propósito: ${c.pecaNoBook}`}>
          Cancelada de propósito
        </Botao>
      </Acoes>
    </li>
  );
}

function CartaoDivergencia({ d, a, isMobile, onResolver, pendente }: {
  d: DivergenciaDoBook;
  a: AuditoriaDoBookVista;
  isMobile: boolean;
  onResolver: (chave: string, motivo: MotivoDaResolucao | null) => void;
  pendente: boolean;
}) {
  const tamanho = isMobile ? "toque" : "sm";
  return (
    <li style={CARTAO} data-testid={`divergencia-${d.chave}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <LinkDaPagina bookUrl={a.bookUrl} pagina={d.pagina} isMobile={isMobile} />
        {d.ids.map((id, i) => (
          <Link key={id} href={`/eventos/${a.eventId}?item=${id}`}
            style={{ fontFamily: FONT.mono, fontSize: FS.small, fontWeight: FW.forte, color: T.accentText, textDecoration: "underline", textUnderlineOffset: 2, padding: isMobile ? "6px 2px" : 0 }}>
            {d.displayIds[i] ?? "peça"}
          </Link>
        ))}
      </div>
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "86px minmax(0, 1fr)", gap: isMobile ? 2 : "4px 10px", fontSize: FS.body, lineHeight: 1.5 }}>
        <dt style={{ ...ROTULO, paddingTop: isMobile ? 4 : 3 }}>No book</dt>
        <dd style={{ margin: 0, color: T.text, overflowWrap: "anywhere" }}>{d.noBook || "—"}</dd>
        <dt style={{ ...ROTULO, paddingTop: isMobile ? 6 : 3 }}>Na lista</dt>
        <dd style={{ margin: 0, color: T.apoio, overflowWrap: "anywhere" }}>{d.noApp || "—"}</dd>
      </dl>
      <Acoes isMobile={isMobile}>
        <Botao variante="secundarioForte" tamanho={tamanho} icone={Check} disabled={pendente} onClick={() => onResolver(d.chave, "conferida")}
          data-testid={`ja-conferi-${d.chave}`} aria-label={`Já conferi a divergência de ${d.displayIds.join(", ")}`}>
          Já conferi
        </Botao>
        <Botao variante="fantasma" tamanho={tamanho} icone={X} disabled={pendente} onClick={() => onResolver(d.chave, "nao_precisa")}
          data-testid={`nao-precisa-${d.chave}`} aria-label={`Não precisa: divergência de ${d.displayIds.join(", ")}`}>
          Não precisa
        </Botao>
      </Acoes>
    </li>
  );
}

function Secao({ id, titulo, n, children }: { id: string; titulo: string; n: number; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h3 id={id} style={{ margin: 0, display: "flex", alignItems: "baseline", gap: 8, fontFamily: FONT.display, fontSize: FS.strong, fontWeight: FW.forte, color: T.text }}>
        {titulo}
        <span style={{ fontFamily: FONT.mono, fontSize: FS.body, color: T.second, fontVariantNumeric: "tabular-nums" }}>{n}</span>
      </h3>
      {children}
    </section>
  );
}

export function PainelDoBook({ eventId, nomeDoEvento, onFechar, aud, isMobile, admin }: {
  /** null = fechado. */
  eventId: string | null;
  nomeDoEvento?: string | null;
  onFechar: () => void;
  aud: AuditoriasDoBook;
  isMobile: boolean;
  admin: boolean;
}) {
  const aberto = !!eventId;
  const a = useMemo(() => aud.auditorias.find((x) => x.eventId === eventId) ?? null, [aud.auditorias, eventId]);
  const nome = a?.eventName || nomeDoEvento || "Evento";
  const [verResolvidos, setVerResolvidos] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const auditar = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/events/${eventId}/book/auditar`)).json() as Promise<{ semChave?: boolean }>,
    onSuccess: (r) => {
      toast(r?.semChave
        ? { variant: "warning", title: "Auditoria na fila, mas sem chave", description: "Falta o Secret ANTHROPIC_API_KEY — ela roda quando a chave entrar e o app reiniciar." }
        : { title: "Auditoria pedida", description: "A IA lê o book de novo; leva de 1 a 5 minutos." });
      void queryClient.invalidateQueries({ queryKey: CHAVE_DAS_AUDITORIAS });
    },
    onError: (e) => toast({ variant: "destructive", title: "Não deu para auditar de novo", description: e instanceof Error ? e.message : undefined }),
  });

  const resolver = (chave: string, motivo: MotivoDaResolucao | null) => {
    if (!a) return;
    aud.resolver.mutate({ auditoriaId: a.id, chave, motivo });
  };
  const pendente = aud.resolver.isPending;

  const resolvidos = a?.resolvidos ?? {};
  const faltando = a?.achados?.faltando ?? [];
  const divergencias = a?.achados?.divergencias ?? [];
  const canceladas = canceladasDe(a?.achados);
  const faltandoAbertos = faltando.filter((f) => !resolvidos[f.chave]);
  const canceladasAbertas = canceladas.filter((c) => !resolvidos[c.chave]);
  const divergenciasAbertas = divergencias.filter((d) => !resolvidos[d.chave]);
  const jaMarcados: Array<{ chave: string; titulo: string; r: ResolucaoDoAchado }> = [
    ...faltando.filter((f) => resolvidos[f.chave]).map((f) => ({ chave: f.chave, titulo: f.pecaNoBook, r: resolvidos[f.chave] })),
    ...canceladas.filter((c) => resolvidos[c.chave]).map((c) => ({ chave: c.chave, titulo: `${c.pecaNoBook} (cancelada no app)`, r: resolvidos[c.chave] })),
    ...divergencias.filter((d) => resolvidos[d.chave]).map((d) => ({ chave: d.chave, titulo: `Divergência ${d.displayIds.join(", ")}`, r: resolvidos[d.chave] })),
  ];

  const subtitulo = (() => {
    if (!a) return undefined;
    const partes = [a.bookPublicadoEm ? `Book publicado em ${dataHora(a.bookPublicadoEm)}` : null];
    if (a.bookMaisNovoEm) partes[0] = a.bookPublicadoEm ? `Book de ${diaMes(a.bookPublicadoEm)} (o auditado)` : "Book auditado";
    if (a.status === "concluida" && a.pecasNoBook != null) {
      partes.push(`a IA viu ${nPecas(a.pecasNoBook)} no book${a.encontradasNoApp != null ? `, ${a.encontradasNoApp} na lista` : ""}`);
    }
    return partes.filter(Boolean).join(" · ");
  })();

  const pad = isMobile ? "16px" : "20px 28px";

  const corpo = (() => {
    if (aud.carregando) return <Esqueleto variante="lista" linhas={4} rotulo="Carregando a auditoria do book" />;
    if (aud.erro && !a) {
      return <EstadoErro titulo="Não foi possível carregar a auditoria do book." aoTentarDeNovo={() => aud.recarregar()} tamanhoDoBotao={isMobile ? "toque" : "md"} testId="painel-book-erro" />;
    }
    if (!a) {
      return (
        <EstadoVazio compacto icone={FileSearch} testId="painel-book-sem-auditoria"
          titulo="Este evento não tem auditoria do book"
          descricao="A auditoria roda sozinha no 1º book publicado de cada evento. Evento encerrado ou já realizado sai da lista." />
      );
    }
    if (a.status === "pendente" || a.status === "processando") {
      return (
        <EstadoVazio compacto icone={Loader2} testId="painel-book-processando"
          titulo={a.status === "pendente" ? "Auditoria na fila" : "A IA está lendo o book"}
          descricao="Leva de 1 a 5 minutos por book. Esta janela se atualiza sozinha quando terminar." />
      );
    }
    if (a.status === "sem_chave") {
      return (
        <EstadoVazio compacto icone={KeyRound} testId="painel-book-sem-chave"
          titulo="Auditoria com IA desligada"
          descricao="Falta o Secret ANTHROPIC_API_KEY no servidor. Com a chave configurada e o app reiniciado, este book é auditado sozinho." />
      );
    }
    if (a.status === "erro") {
      return (
        <EstadoErro titulo="A auditoria deste book falhou" detalhe={a.erro ?? undefined} testId="painel-book-falhou"
          aoTentarDeNovo={admin ? () => auditar.mutate() : undefined} carregando={auditar.isPending}
          rotuloDoBotao="Auditar de novo" tamanhoDoBotao={isMobile ? "toque" : "md"} />
      );
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <Secao id="book-faltando" titulo="Desenhadas no book, fora da lista" n={faltandoAbertos.length}>
          {faltandoAbertos.length === 0 && canceladasAbertas.length > 0 ? (
            <p style={{ margin: 0, fontSize: FS.body, color: T.apoio }} data-testid="painel-book-sem-faltando">
              Nenhuma peça sem cadastro — {canceladasAbertas.length === 1 ? "a do book está cancelada" : "as do book estão canceladas"} no app (abaixo).
            </p>
          ) : faltandoAbertos.length === 0 ? (
            <EstadoVazio compacto tom="sucesso" icone={Check} testId="painel-book-tudo-na-lista"
              titulo={faltando.length === 0 && canceladas.length === 0 ? "Tudo o que o book mostra está na lista" : "Todas as peças do book foram resolvidas"}
              descricao={faltando.length === 0 ? "A IA casou cada peça do book com uma peça cadastrada." : "Cada achado foi marcado como cadastrado ou como não precisa."} />
          ) : (
            <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {faltandoAbertos.map((f) => <CartaoFaltando key={f.chave} f={f} a={a} isMobile={isMobile} onResolver={resolver} pendente={pendente} />)}
            </ul>
          )}
        </Secao>

        {canceladasAbertas.length > 0 && (
          <Secao id="book-canceladas" titulo="No book, mas canceladas no app" n={canceladasAbertas.length}>
            <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {canceladasAbertas.map((c) => <CartaoCancelada key={c.chave} c={c} a={a} isMobile={isMobile} onResolver={resolver} pendente={pendente} />)}
            </ul>
          </Secao>
        )}

        {divergenciasAbertas.length > 0 && (
          <Secao id="book-divergencias" titulo="Na lista, mas diferente do book" n={divergenciasAbertas.length}>
            <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {divergenciasAbertas.map((d) => <CartaoDivergencia key={d.chave} d={d} a={a} isMobile={isMobile} onResolver={resolver} pendente={pendente} />)}
            </ul>
          </Secao>
        )}

        {jaMarcados.length > 0 && (
          <section>
            <button
              type="button"
              aria-expanded={verResolvidos}
              onClick={() => setVerResolvidos((v) => !v)}
              data-testid="toggle-book-resolvidos"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "none", padding: "6px 0", font: "inherit", fontSize: FS.body, fontWeight: FW.forte, color: T.strong, cursor: "pointer" }}
            >
              <ChevronDown aria-hidden="true" style={{ width: 14, height: 14, transform: verResolvidos ? "rotate(180deg)" : undefined }} />
              Já marcados ({jaMarcados.length})
            </button>
            {verResolvidos && (
              <ul style={{ margin: "6px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                {jaMarcados.map((m) => (
                  <li key={m.chave} data-testid={`resolvido-${m.chave}`} style={{ listStyle: "none", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "6px 0", borderTop: `1px solid ${T.border}` }}>
                    <span style={{ flex: "1 1 220px", minWidth: 0, fontSize: FS.body, color: T.apoio }}>
                      <span style={{ fontWeight: FW.forte, color: T.strong }}>{m.titulo}</span>
                      {" · "}{(m.chave.startsWith("c") ? ROTULO_DO_MOTIVO_CANCELADA[m.r.motivo] : undefined) ?? ROTULO_DO_MOTIVO[m.r.motivo]}{m.r.por ? ` por ${m.r.por}` : ""}{m.r.em ? ` em ${diaMes(m.r.em)}` : ""}
                    </span>
                    <Botao variante="fantasma" tamanho={isMobile ? "toque" : "sm"} icone={Undo2} disabled={pendente} onClick={() => resolver(m.chave, null)} data-testid={`desfazer-${m.chave}`} aria-label={`Desfazer: ${m.titulo}`}>
                      Desfazer
                    </Botao>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {a.bookMaisNovoEm && (
          <p data-testid="painel-book-reenvio" style={{ margin: 0, padding: "10px 12px", borderRadius: R.md, border: `1px solid ${TOM.info.border}`, backgroundColor: TOM.info.bg, color: TOM.info.text, fontSize: FS.body, lineHeight: 1.5 }}>
            O book foi reenviado em {diaMes(a.bookMaisNovoEm)}. A auditoria automática lê só o 1º book do evento — as páginas acima são do book auditado.
            {admin ? " Para conferir o book novo, use “Auditar de novo”." : ""}
          </p>
        )}

        {a.achados?.observacoes && (
          <section aria-label="Nota da IA" style={{ padding: "10px 12px", borderRadius: R.md, backgroundColor: T.low, fontSize: FS.body, lineHeight: 1.5, color: T.apoio }}>
            <p style={{ ...ROTULO, marginBottom: 4 }}>Nota da IA</p>
            <p style={{ margin: 0, overflowWrap: "anywhere" }}>{a.achados.observacoes}</p>
          </section>
        )}
        <p style={{ margin: 0, fontSize: FS.small, color: T.second }}>
          A IA compara o desenho com a lista pelo sentido (tipo, formato, medida, logos) — confira antes de cadastrar.
          {a.modelo ? ` ${a.modelo.startsWith("claude") ? `Lido pela IA (${a.modelo})` : `Origem: ${a.modelo}`}${a.concluidoEm ? ` em ${dataHora(a.concluidoEm)}` : ""}.` : ""}
        </p>
      </div>
    );
  })();

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent
        className={`${HIDE_NATIVE_CLOSE} p-0 gap-0`}
        style={modalSurface(760)}
        data-testid="painel-book"
      >
        <FreezeWhileClosing open={aberto}>
          <DialogTitle className="sr-only">Book × lista — {nome}</DialogTitle>
          <DialogDescription className="sr-only">Peças desenhadas no book que não estão na lista do evento, e as diferenças entre o book e a lista.</DialogDescription>
          <ModalHeader
            icon={FileSearch}
            variant="work"
            tint={T.accentText}
            title={nome}
            subtitle={subtitulo}
            onClose={onFechar}
            compacto={isMobile}
            testIdDoFechar="fechar-painel-book"
          />
          <div style={{ overflowY: "auto", flex: "1 1 auto", minHeight: 0, padding: pad, backgroundColor: T.bg }} data-testid="painel-book-corpo">
            {corpo}
          </div>
          <ModalFooter style={{ flexDirection: isMobile ? "column-reverse" : "row", justifyContent: "flex-end", alignItems: isMobile ? "stretch" : "center", flexWrap: "wrap", padding: isMobile ? "12px 16px" : "14px 28px" }}>
            {/* No erro, o "Auditar de novo" já está no corpo, junto do motivo. */}
            {admin && a && a.status !== "pendente" && a.status !== "processando" && a.status !== "erro" && (
              <Botao variante="fantasma" tamanho={isMobile ? "toque" : "md"} icone={RefreshCw} carregando={auditar.isPending}
                onClick={() => auditar.mutate()} data-testid="auditar-book-de-novo" style={isMobile ? undefined : { marginRight: "auto" }}>
                Auditar de novo
              </Botao>
            )}
            {a && (
              <BotaoLink externo href={a.bookUrl} target="_blank" rel="noopener noreferrer" tamanho={isMobile ? "toque" : "md"} icone={ExternalLink} data-testid="abrir-book-pdf">
                {a.bookMaisNovoEm ? "Abrir o book auditado" : "Abrir o book"}
              </BotaoLink>
            )}
            {eventId && (
              <BotaoLink href={`/eventos/${eventId}`} variante="primario" tamanho={isMobile ? "toque" : "md"} icone={Plus} data-testid="abrir-evento-para-cadastrar">
                Abrir o evento para cadastrar
              </BotaoLink>
            )}
          </ModalFooter>
        </FreezeWhileClosing>
      </DialogContent>
    </Dialog>
  );
}
