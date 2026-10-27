// ─────────────────────────────────────────────────────────────────────────────
// O KIT DENTRO DO EVENTO (dono, 14/09; simplificado em 23/10).
//
// "O kit não precisa ser tão diferente das peças normais [...] não seriam
// várias remessas, seria tudo a mesma inclusão, e ele não precisaria colocar as
// datas, mas seguiremos com a planilha de inclusão do kit." (dono, 23/10)
//
// UM BLOCO SÓ: "Kit · N peças". As peças do Kit são peças do evento, com o selo
// KIT, e seguem os prazos do evento a partir da Entrega de layouts. Nada de
// V1/V2, de datas próprias, de "Editar remessa" ou "Nova remessa".
//
// "INCLUIR PEÇAS DO KIT" É A PLANILHA: subir a planilha do Kit (aba KIT, com o
// seletor de abas quando a pasta tem várias) → prévia das peças → incluir. A
// primeira planilha cria o Kit do evento; as seguintes só acrescentam peças.
// "Adicionar peça" abre o formulário de sempre, já marcado Kit.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, FileSpreadsheet, Package, Plus, X } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import type { InclusaoDoKit } from "@shared/kit";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalHeader, modalSurface } from "@/components/modal-shell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { alvo, useIsMobile, usePonteiroGrosso } from "@/hooks/use-mobile";
import { T, FS, R, N, TOM, FONT, FW, SHADOW } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { SeletorDeAbas, consultaDaPrevia } from "@/components/importar-planilha/seletor-de-abas";
import type { AbaComPecasDaPlanilha } from "@shared/api";

/** A chave da query do Kit do evento (GET /api/kit/remessas?eventId=). */
export const chaveDasRemessas = (eventId: string) => `/api/kit/remessas?eventId=${eventId}`;

/** A frase dos prazos do Kit, a mesma em toda tela do evento. */
export const FRASE_DOS_PRAZOS_DO_KIT = "Seguem os prazos do evento a partir da Entrega de layouts.";

type PecaDaPlanilha = {
  type: string; description: string; quantity: number;
  visualWidth: number | null; visualHeight: number | null; fileWidth: number | null; fileHeight: number | null;
  calculatedM2: number; material: string; finish: string; measurement: string; observations: string;
  suggestedSponsorIds?: string[];
  /** Identidade da linha na tela (a descrição pode repetir e não é chave). */
  _chave: string;
};

/** A peça do evento, no que o painel lê para listar o Kit. */
export interface PecaDoKit {
  id: string;
  kitRemessaId?: string | null;
  deletedAt?: string | Date | null;
  displayId?: string | null;
  type?: string | null;
  description?: string | null;
  quantity?: number | null;
  material?: string | null;
  finish?: string | null;
  status: string;
}

const pecas1 = (n: number) => `${n} ${n === 1 ? "peça" : "peças"}`;

// Genérico na peça: o `onAbrirPeca` devolve a peça no tipo da tela que a passou.
export function PainelDoKit<TPeca extends PecaDoKit>({ eventId, pecas, inclusao, podeCriar, usuarioDoKit, eventoFinalizado, onAbrirPeca, onAdicionarPeca }: {
  eventId: string;
  pecas: readonly TPeca[];
  /** A inclusão do Kit do evento (null = o evento ainda não tem Kit). */
  inclusao: InclusaoDoKit | null;
  /** Abre o detalhe da peça (o mesmo da lista da Arena). */
  onAbrirPeca?: (peca: TPeca) => void;
  /** Inclusão individual (15/09): abre "Adicionar Peça" já marcado Kit. */
  onAdicionarPeca?: () => void;
  /** admin | solicitacao (inclui o usuário do Kit) — a régua do servidor. */
  podeCriar: boolean;
  usuarioDoKit: boolean;
  eventoFinalizado: boolean;
}) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  /** Dedo (celular OU tablet do galpão): manda no TAMANHO do alvo, só nele. */
  const dedo = usePonteiroGrosso() || isMobile;
  const [aberto, setAberto] = useState(false);
  const [listaAberta, setListaAberta] = useState(false);
  const [planilha, setPlanilha] = useState<{ nome: string; pecas: PecaDaPlanilha[]; solicitante: string | null; departamento: string | null; abas: AbaComPecasDaPlanilha[] } | null>(null);
  // O arquivo, para ler OUTRA aba da mesma pasta sem pedir de novo.
  const arquivoRef = useRef<File | null>(null);
  const [lendoPlanilha, setLendoPlanilha] = useState(false);
  // DESCARTE COM PERGUNTA — só quando há o que perder (uma planilha lida).
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);
  const continuarRef = useRef<HTMLButtonElement | null>(null);

  // Cada abertura começa limpa.
  useEffect(() => {
    if (!aberto) return;
    setPlanilha(null);
    setConfirmandoDescarte(false);
  }, [aberto]);

  // O foco vai para "Continuar" quando a pergunta aparece: o botão que tinha o
  // foco (Cancelar) acabou de sair da tela, e um Enter distraído tem de cair
  // na opção que NÃO perde nada.
  useEffect(() => {
    if (confirmandoDescarte) continuarRef.current?.focus();
  }, [confirmandoDescarte]);

  const lerPlanilha = async (arquivo: File | undefined | null, aba?: string) => {
    if (!arquivo) return;
    arquivoRef.current = arquivo;
    setLendoPlanilha(true);
    try {
      const corpo = new FormData();
      corpo.append("file", arquivo);
      // `para=kit`: numa pasta com as abas "KIT" e "Arena", vale a do Kit
      // (ou a aba que a pessoa escolheu no seletor).
      const resposta = await fetch(`/api/events/${eventId}/preview-xlsx${consultaDaPrevia("kit", aba)}`, { method: "POST", body: corpo, credentials: "include" });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(dados?.error || "Não deu para ler a planilha");
      const c = dados?.kit ?? null;
      const lidas: PecaDaPlanilha[] = Array.isArray(dados?.items)
        ? dados.items.map((p: Omit<PecaDaPlanilha, "_chave">, i: number) => ({ ...p, _chave: `${Date.now()}-${i}` }))
        : [];
      setPlanilha({ nome: dados?.fileName ?? arquivo.name, pecas: lidas, solicitante: c?.solicitante ?? null, departamento: c?.departamento ?? null, abas: Array.isArray(dados?.abas) ? dados.abas : [] });
      // A aba lida entra no título quando a pasta tem várias ("da aba KIT"):
      // é o que mostra que as peças são as do Kit, e não as da Arena.
      const daAba = typeof dados?.aba === "string" && dados.aba ? ` da aba ${dados.aba}` : "";
      toast(lidas.length > 0
        ? { title: `Planilha do Kit lida: ${pecas1(lidas.length)}${daAba}`, description: "Confira as peças antes de incluir.", variant: "success" as const }
        : { title: `Nenhuma peça lida${daAba}`, description: "A planilha não trouxe linhas de peça — confira a aba ou o arquivo.", variant: "warning" as const });
    } catch (e) {
      toast({ title: "Não deu para ler a planilha", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setLendoPlanilha(false);
    }
  };

  const incluir = useMutation({
    mutationFn: async () => {
      if (!planilha || planilha.pecas.length === 0) throw new Error("Envie a planilha do Kit");
      // A importação põe as peças no Kit do evento (cria a inclusão na
      // primeira planilha; nas seguintes, acrescenta).
      const r = await apiRequest("POST", `/api/events/${eventId}/confirm-import`, {
        items: planilha.pecas.map(({ _chave, ...p }) => ({ ...p, suggestedSponsorIds: [] })),
        fileName: planilha.nome,
        kit: { solicitante: planilha.solicitante, departamento: planilha.departamento },
      });
      return { pecas: (await r.json())?.imported ?? planilha.pecas.length };
    },
    onSuccess: (r) => {
      toast({
        title: `${pecas1(r.pecas)} ${r.pecas === 1 ? "incluída" : "incluídas"} no Kit`,
        // As peças nascem em RASCUNHO: sem dizer, quem importou achava que o
        // Kit já tinha seguido para a vinculação.
        description: "Entraram em Rascunho com o selo KIT — envie para a vinculação no card “Peças em Rascunho”.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: [chaveDasRemessas(eventId)] });
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setAberto(false);
    },
    onError: (e) => toast({ title: "Não deu para incluir as peças do Kit", description: String(e?.message ?? "").replace(/^\d{3}:\s*/, "").replace(/^\{"error":"(.*)"\}$/, "$1"), variant: "destructive" }),
  });

  const doKit = pecas
    .filter((p) => !!p.kitRemessaId && !p.deletedAt)
    .sort((a, b) => String(a.displayId ?? "").localeCompare(String(b.displayId ?? ""), "pt-BR", { numeric: true }));
  const n = doKit.length;
  if (n === 0 && !inclusao && !podeCriar) return null;

  const nPecas = planilha?.pecas.length ?? 0;
  const faltando = lendoPlanilha ? "Aguarde a leitura da planilha" : !planilha ? "Envie a planilha do Kit" : nPecas === 0 ? "A planilha não tem peças" : null;
  const tirarPeca = (i: number) => setPlanilha((p) => (p ? { ...p, pecas: p.pecas.filter((_, j) => j !== i) } : p));
  // Toda saída que não é "Incluir" passa por aqui: X, Cancelar, Esc e clique fora.
  const pedirParaFechar = () => {
    if (incluir.isPending) return;
    if (confirmandoDescarte) { setConfirmandoDescarte(false); return; }
    if (planilha) { setConfirmandoDescarte(true); return; }
    setAberto(false);
  };
  const motivoFinalizado = eventoFinalizado ? "Evento finalizado — não recebe peças." : undefined;
  const quem = [inclusao?.solicitante ?? inclusao?.criadoPor, inclusao?.arquivo].filter(Boolean).join(" · ");

  // OCIOSO: o painel aparece em TODO evento para quem pode incluir, e a imensa
  // maioria dos eventos não tem Kit. Sem peça do Kit (e para quem não é do Kit)
  // ele vira uma linha discreta — tracejada, sem o roxo — para não disputar
  // com a lista algo que quase nunca se usa.
  const ocioso = n === 0 && !usuarioDoKit;
  return (
    <section data-testid="painel-do-kit" aria-labelledby="titulo-painel-do-kit"
      style={ocioso
        ? { backgroundColor: "transparent", border: `1px dashed ${T.bdark}`, borderRadius: R.lg, padding: isMobile ? "10px 12px" : "8px 10px 8px 16px", marginBottom: isMobile ? 24 : 32, display: "flex", flexDirection: "column", gap: 10 }
        // Cheio: o MESMO desenho dos cards de rascunhos e de solicitações
        // (borda inteira na tinta da família, ladrilho do ícone, título em display).
        : { backgroundColor: T.surface, border: `1px solid ${TOM.roxo.border}`, borderRadius: R.lg, boxShadow: SHADOW.sm, padding: isMobile ? "16px" : "18px 24px 20px", marginBottom: isMobile ? 24 : 32, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: ocioso ? 10 : 12, flexWrap: "wrap" }}>
        {ocioso
          ? <Package style={{ width: 16, height: 16, color: T.second }} aria-hidden="true" />
          : (
            <div aria-hidden="true" style={{ width: 36, height: 36, borderRadius: R.md, backgroundColor: TOM.roxo.bg, border: `1px solid ${TOM.roxo.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Package style={{ width: 17, height: 17, color: TOM.roxo.text }} />
            </div>
          )}
        <h2 id="titulo-painel-do-kit" style={ocioso
          ? { margin: 0, fontSize: FS.body, fontWeight: FW.rotulo, color: T.apoio, textTransform: "uppercase", letterSpacing: "0.04em" }
          : { margin: 0, fontFamily: FONT.display, fontSize: FS.title, fontWeight: FW.forte, letterSpacing: "-0.02em", color: T.text }}>
          {ocioso ? "Kit" : `Kit · ${pecas1(n)}`}
        </h2>
        <span style={{ fontSize: ocioso ? FS.meta : FS.body, color: ocioso ? T.second : T.apoio, flex: "1 1 240px", minWidth: 0 }}>
          {n === 0
            ? (usuarioDoKit ? "Nenhuma peça do Kit neste evento ainda." : "Nenhuma peça do Kit. Só é usado se o evento tiver Kit.")
            : FRASE_DOS_PRAZOS_DO_KIT}
        </span>
        {podeCriar && (
          /* Secundário no roxo do Kit (a identidade do painel). O motivo do
             desabilitado deixa o `title` e fica VISÍVEL embaixo do botão. */
          // No celular os dois botões dividem a linha inteira (lado a lado, mesmo
          // peso de toque); no desktop ficam à direita do título.
          <span style={isMobile && !ocioso
            ? { display: "grid", gridTemplateColumns: onAdicionarPeca ? "1fr 1fr" : "1fr", gap: 8, width: "100%" }
            : { marginLeft: "auto", display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {onAdicionarPeca && !ocioso && (
              <Botao variante="fantasma" icone={Plus} data-testid="button-adicionar-peca-kit" disabled={eventoFinalizado} onClick={onAdicionarPeca}
                title={motivoFinalizado ?? "Uma peça do Kit pelo formulário"}
                style={{ minHeight: alvo(34, dedo), padding: "0 12px", color: TOM.roxo.text, fontSize: FS.meta, fontWeight: FW.rotulo, ...(isMobile ? { border: `1px solid ${TOM.roxo.border}`, justifyContent: "center" } : null) }}>
                Adicionar peça
              </Botao>
            )}
            <Botao variante={ocioso ? "fantasma" : "secundario"} icone={FileSpreadsheet} data-testid="button-incluir-pecas-kit" disabled={eventoFinalizado} onClick={() => setAberto(true)}
              title={motivoFinalizado}
              motivo={motivoFinalizado} alinharMotivo="end"
              style={ocioso
                ? { minHeight: alvo(32, dedo), padding: "0 12px", color: TOM.roxo.text, fontSize: FS.meta, fontWeight: FW.forte }
                : { minHeight: alvo(34, dedo), padding: "0 14px", borderColor: TOM.roxo.border, background: TOM.roxo.bg, color: TOM.roxo.text, fontSize: FS.meta, fontWeight: FW.rotulo }}>
              {isMobile && !ocioso ? "Incluir planilha" : "Incluir peças do Kit (planilha)"}
            </Botao>
          </span>
        )}
      </div>

      {usuarioDoKit && n === 0 && podeCriar && (
        <p style={{ margin: 0, fontSize: FS.body, color: TOM.alerta.text }}>Inclua as peças do Kit pela planilha — ou uma a uma em “Adicionar Peça”.</p>
      )}

      {/* AS PEÇAS DO KIT, com o status de cada uma — a mesma leitura da lista
          do evento. Clicar abre o detalhe da peça. */}
      {n > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button type="button" aria-expanded={listaAberta} aria-controls="pecas-do-kit" data-testid="button-abrir-pecas-kit"
              onClick={() => setListaAberta((a) => !a)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", minHeight: alvo(32, dedo), borderRadius: R.md, border: `1px solid ${TOM.roxo.border}`, background: TOM.roxo.bg, cursor: "pointer", fontSize: FS.body, fontWeight: FW.rotulo, color: TOM.roxo.text }}>
              {listaAberta ? "Esconder as peças do Kit" : `Ver as ${pecas1(n)} do Kit`}
              <ChevronDown size={14} aria-hidden="true" style={{ transform: listaAberta ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            </button>
            {quem && <span data-testid="kit-quem-incluiu" style={{ fontSize: FS.small, color: T.apoio, minWidth: 0, overflowWrap: "anywhere" }}>{quem}</span>}
          </div>
          {listaAberta && (
            <div id="pecas-do-kit" data-testid="pecas-do-kit" style={{ border: `1px solid ${TOM.roxo.border}`, borderRadius: R.lg, overflow: "hidden" }}>
              {isMobile ? (
                // CELULAR: uma linha por peça (código, peça, status) — a tabela de
                // 5 colunas rolava de lado e cortava o material.
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {doKit.map((p) => (
                    <li key={p.id} data-testid={`peca-kit-${p.id}`} style={{ borderBottom: `1px solid ${N.n3}` }}>
                      <button type="button" onClick={() => onAbrirPeca?.(p)} aria-label={`Ver detalhes da peça ${p.displayId}`}
                        style={{ width: "100%", display: "flex", flexDirection: "column", gap: 4, padding: "10px 12px", minHeight: 44, border: "none", background: "none", textAlign: "left", cursor: "pointer" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontFamily: FONT.mono, fontWeight: 700, color: T.accentText, fontSize: 13 }}>{p.displayId}</span>
                          <span style={{ color: T.text, fontWeight: 600, fontSize: 13 }}>{p.type}</span>
                          <span style={{ color: T.apoio, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>× {p.quantity}</span>
                        </span>
                        {p.description ? <span style={{ color: T.apoio, fontSize: 12 }}>{p.description}</span> : null}
                        <span style={{ alignSelf: "flex-start" }}><StatusBadge status={p.status} /></span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      {["ID", "Peça", "Qtd", "Material · Acab.", "Status"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 10.5, color: T.apoio, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${N.n3}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {doKit.map((p) => (
                      <tr key={p.id} data-testid={`peca-kit-${p.id}`} onClick={() => onAbrirPeca?.(p)}
                        style={{ borderBottom: `1px solid ${N.n3}`, cursor: onAbrirPeca ? "pointer" : "default" }}>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                          <button type="button" onClick={(e) => { e.stopPropagation(); onAbrirPeca?.(p); }} aria-label={`Ver detalhes da peça ${p.displayId}`}
                            style={{ padding: 0, border: "none", background: "none", fontFamily: FONT.mono, fontWeight: 700, color: T.accentText, fontSize: 13, cursor: "pointer" }}>
                            {p.displayId}
                          </button>
                        </td>
                        <td style={{ padding: "8px 12px", color: T.text, fontWeight: 600 }}>
                          {p.type}{p.description ? <span style={{ display: "block", fontWeight: 400, color: T.apoio, fontSize: 12 }}>{p.description}</span> : null}
                        </td>
                        <td style={{ padding: "8px 12px", fontVariantNumeric: "tabular-nums" }}>{p.quantity}</td>
                        <td style={{ padding: "8px 12px", color: T.strong }}>{[p.material, p.finish].filter(Boolean).join(" · ")}</td>
                        <td style={{ padding: "8px 12px" }}><StatusBadge status={p.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={aberto} onOpenChange={(o) => { if (!o) pedirParaFechar(); }}>
        <DialogContent data-testid="dialog-incluir-pecas-kit" className={HIDE_NATIVE_CLOSE} style={modalSurface(nPecas > 0 ? 1100 : 600)}>
          <DialogTitle className="sr-only">Incluir peças do Kit</DialogTitle>
          <DialogDescription className="sr-only">Planilha do Kit: prévia das peças e inclusão no Kit do evento.</DialogDescription>
          <ModalHeader icon={Package} tint={TOM.roxo.text} title="Incluir peças do Kit"
            subtitle={n > 0 ? `O Kit deste evento já tem ${pecas1(n)} — as peças da planilha entram junto.` : "Primeira inclusão do Kit neste evento."}
            onClose={incluir.isPending ? undefined : pedirParaFechar} />

          <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: isMobile ? 16 : "16px 24px", display: "grid", gap: 16,
            gridTemplateColumns: !isMobile && nPecas > 0 ? "minmax(0, 340px) minmax(0, 1fr)" : "minmax(0, 1fr)", alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
              {/* O input é `sr-only`, não `hidden`: fica focável pelo Tab, e o
                  anel no rótulo mostra onde o foco está. */}
              <label data-testid="button-planilha-kit"
                className="focus-within:ring-2 focus-within:ring-violet-600 focus-within:ring-offset-2"
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "14px 10px", borderRadius: R.md, border: `1.5px dashed ${planilha ? TOM.sucesso.text : TOM.roxo.dot}`, background: planilha ? TOM.sucesso.bg : TOM.roxo.bg, color: planilha ? TOM.sucesso.text : TOM.roxo.text, cursor: lendoPlanilha ? "wait" : "pointer", textAlign: "center" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: FS.read, fontWeight: FW.rotulo, overflowWrap: "anywhere" }}>
                  <FileSpreadsheet size={16} aria-hidden="true" />
                  {lendoPlanilha ? "Lendo a planilha…" : planilha ? planilha.nome : "Enviar a planilha do Kit (.xlsx)"}
                </span>
                <span style={{ fontSize: FS.small, color: T.apoio }}>
                  {planilha ? `${pecas1(nPecas)} · clique para trocar` : "A aba KIT da planilha de inclusão. Sem datas: o Kit segue o evento."}
                </span>
                <input type="file" accept=".xlsx" className="sr-only" disabled={lendoPlanilha}
                  aria-label="Enviar a planilha do Kit (.xlsx)"
                  onChange={(e) => { void lerPlanilha(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              {planilha && (
                <SeletorDeAbas abas={planilha.abas} pendente={lendoPlanilha} onEscolher={(nome) => { void lerPlanilha(arquivoRef.current, nome); }} />
              )}
              <p data-testid="aviso-prazos-kit" style={{ margin: 0, fontSize: FS.body, color: TOM.roxo.text, background: TOM.roxo.bg, border: `1px solid ${TOM.roxo.border}`, borderRadius: R.md, padding: "8px 12px", lineHeight: 1.45 }}>
                As peças entram em Rascunho com o selo KIT. {FRASE_DOS_PRAZOS_DO_KIT}
                {planilha?.solicitante ? ` Solicitante: ${planilha.solicitante}.` : ""}
              </p>
            </div>

            {nPecas > 0 && planilha && (
              <div style={{ minWidth: 0, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden" }}>
                <div style={{ padding: "8px 12px", background: T.bg, borderBottom: `1px solid ${T.border}`, fontSize: FS.small, fontWeight: FW.rotulo, color: T.apoio, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Peças da planilha · {nPecas}
                </div>
                {isMobile ? (
                  <ul data-testid="tabela-pecas-kit" style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {planilha.pecas.map((p, i) => (
                      <li key={p._chave} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 4px 8px 12px", borderBottom: `1px solid ${N.n3}` }}>
                        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ color: T.text, fontWeight: 600, fontSize: 13, overflowWrap: "anywhere" }}>{p.description || p.type}</span>
                          <span style={{ color: T.apoio, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                            {[`${p.quantity} un.`, [p.material, p.finish].filter(Boolean).join(" · "), p.fileWidth && p.fileHeight ? `${p.fileWidth} × ${p.fileHeight} m` : null, `${Number(p.calculatedM2 || 0).toFixed(2)} m²`].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <button type="button" aria-label={`Tirar ${p.description || p.type} da inclusão`} onClick={() => tirarPeca(i)}
                          style={{ width: 44, height: 44, flexShrink: 0, borderRadius: R.md, border: "none", background: "transparent", color: T.second, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <X size={16} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                <div style={{ overflowX: "auto", maxHeight: "52vh" }}>
                  <table data-testid="tabela-pecas-kit" style={{ width: "100%", minWidth: 560, borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: T.surface, position: "sticky", top: 0 }}>
                        {["Peça", "Qtd", "Material · Acab.", "Arquivo (m)", "m²", ""].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10.5, color: T.apoio, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${N.n3}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {planilha.pecas.map((p, i) => (
                        <tr key={p._chave} style={{ borderBottom: `1px solid ${N.n3}` }}>
                          <td style={{ padding: "7px 10px", color: T.text, fontWeight: 600 }}>{p.description || p.type}</td>
                          <td style={{ padding: "7px 10px", fontVariantNumeric: "tabular-nums" }}>{p.quantity}</td>
                          <td style={{ padding: "7px 10px", color: T.strong }}>{[p.material, p.finish].filter(Boolean).join(" · ")}</td>
                          <td style={{ padding: "7px 10px", fontVariantNumeric: "tabular-nums", color: T.strong }}>{p.fileWidth && p.fileHeight ? `${p.fileWidth} × ${p.fileHeight}` : "—"}</td>
                          <td style={{ padding: "7px 10px", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{Number(p.calculatedM2 || 0).toFixed(2)}</td>
                          <td style={{ padding: "4px 6px" }}>
                            <button type="button" aria-label={`Tirar ${p.description || p.type} da inclusão`} title="Tirar esta peça da inclusão" onClick={() => tirarPeca(i)}
                              style={{ width: isMobile ? 44 : 28, height: isMobile ? 44 : 28, borderRadius: R.md, border: "none", background: "transparent", color: T.second, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <X size={14} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}
              </div>
            )}
          </div>

          {confirmandoDescarte ? (
            // A pergunta mora NO rodapé, no lugar dos botões: um segundo modal
            // por cima esconderia justamente o que a pessoa está decidindo perder.
            <div data-testid="confirmar-descarte-kit" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, flexWrap: "wrap", padding: isMobile ? "12px 16px" : "14px 24px", borderTop: `1px solid ${TOM.perigo.border}`, background: TOM.perigo.bg, flexShrink: 0 }}>
              <span role="alert" style={{ fontSize: FS.body, color: TOM.perigo.text, fontWeight: FW.forte, marginRight: "auto" }}>
                {`Descartar a planilha lida${nPecas > 0 ? ` (${pecas1(nPecas)})` : ""}?`}
              </span>
              <Botao variante="secundario" tamanho="toque" ref={continuarRef} onClick={() => setConfirmandoDescarte(false)}>
                Continuar
              </Botao>
              <Botao variante="perigo" tamanho="toque" data-testid="button-descartar-kit" onClick={() => { setConfirmandoDescarte(false); setAberto(false); }}>
                Descartar
              </Botao>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, flexWrap: "wrap", padding: isMobile ? "12px 16px" : "14px 24px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
              {faltando && <span aria-live="polite" style={{ fontSize: FS.body, color: T.apoio, marginRight: "auto" }}>{faltando}.</span>}
              {/* O motivo do desabilitado já está VISÍVEL à esquerda (`faltando`),
                  por isso o Botao não repete `motivo`. */}
              <Botao variante="secundario" tamanho="toque" onClick={pedirParaFechar} disabled={incluir.isPending}>
                Cancelar
              </Botao>
              <Botao variante="primario" tamanho="toque" data-testid="button-incluir-no-kit" disabled={!!faltando} carregando={incluir.isPending} onClick={() => incluir.mutate()}
                style={{ padding: "0 22px" }}>
                {incluir.isPending ? "Incluindo…" : nPecas > 0 ? `Incluir ${pecas1(nPecas)} no Kit` : "Incluir no Kit"}
              </Botao>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
