// ─────────────────────────────────────────────────────────────────────────────
// BUSCAR ARTE JÁ FEITA (dono, 21/09) — aberto de dentro da peça, na Arte.
//
// "Preciso ter como se fosse uma busca na arte para achar artes já feitas no
// app, para ele não precisar colocar o arquivo ou a thumb de novo e só
// referenciar — com o mesmo patrocinador e eventos 'parecidos', como
// Estações."
//
// Abre JÁ COM AS SUGESTÕES daquela peça (mesmo patrocinador, mesmo tipo,
// evento do mesmo circuito) — quem chega aqui não quer digitar, quer ver a
// arte do Bradesco das Estações do ano passado. O campo de busca é para o
// caso em que a sugestão não bastou.
//
// O QUE ESTE MODAL NÃO FAZ: gravar. Ele devolve a arte escolhida para a tela
// da Arte, que grava pelo caminho de sempre (submit-for-approval /
// update-thumb / sponsor-approvals/resubmit / submit-final-file) — mesmos
// efeitos, mesma trilha, mesma versão de arte. Reaproveitar muda só a ORIGEM
// da URL: em vez de um upload, a URL que já existe. A peça segue o fluxo
// normal de aprovação depois.
//
// Por que referenciar a URL basta (e não se copia o arquivo): nada neste app
// apaga objeto do bucket — excluir peça é soft delete e trocar a arte guarda
// a URL anterior de propósito. A conta inteira está em
// server/routes/artes-busca.ts.
//
// Animação: o app tem uma regra global de `prefers-reduced-motion` em
// index.css que zera duração de animação e transição — não se repete aqui.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, ImageIcon, Search, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalFooter, ModalHeader, modalSurface } from "@/components/modal-shell";
import { miniatura } from "@/lib/miniatura";

export interface ArteEncontrada {
  id: string;
  displayId: string | null;
  tipo: string;
  descricao: string | null;
  eventId: string | null;
  eventName: string | null;
  eventInicio: string | null;
  patrocinadores: string[];
  thumbUrl: string | null;
  previewUrl: string | null;
  arquivoFinalUrl: string | null;
  arquivoFinalNome: string | null;
  temThumb: boolean;
  temPrevia: boolean;
  temArquivoFinal: boolean;
  mesmoPatrocinador: boolean;
  mesmoTipo: boolean;
  eventoParecido: boolean;
  /** Aprovada pelo patrocinador (as reprovadas nem chegam: a rota as tira). */
  aprovada?: boolean;
  aprovadaPor?: string | null;
  aprovadaEm?: string | null;
}

interface Resposta {
  alvo: { id: string; displayId: string | null; tipo: string; eventName: string | null; patrocinadores: string[] };
  total: number;
  cortou: boolean;
  artes: ArteEncontrada[];
}

/**
 * A IMAGEM DA ARTE — a única (revisão 22/09). O cartão mostrava o thumb, a
 * prévia do rodapé mostrava a prévia do final, e "Usar esta arte" gravava o
 * thumb: quem escolhia pela prévia podia levar outra imagem. Agora cartão,
 * prévia e aplicação leem desta função. A rota só devolve URL `/objects/`.
 */
export const imagemDaArte = (arte: Pick<ArteEncontrada, "thumbUrl" | "previewUrl">): string | null =>
  arte.thumbUrl ?? arte.previewUrl ?? null;

/** LAÇO INFINITO: `useQuery({ data: x = [] })` cria um array NOVO a cada
 *  render, e um efeito que leia essa lista e chame setState nunca para. A
 *  constante vazia é estável — a mesma referência sempre. */
const SEM_ARTES: ArteEncontrada[] = [];

const dia = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

/** "Aprovada por Fulano, 12/09" — o quanto se souber. */
export function textoDaAprovacao(arte: Pick<ArteEncontrada, "aprovada" | "aprovadaPor" | "aprovadaEm">): string | null {
  if (!arte.aprovada) return null;
  const d = arte.aprovadaEm ? new Date(arte.aprovadaEm) : null;
  const quando = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : null;
  const detalhe = [arte.aprovadaPor ? `por ${arte.aprovadaPor}` : null, quando].filter(Boolean).join(", ");
  return detalhe ? `Aprovada ${detalhe}` : "Aprovada";
}

function Selo({ cor, fundo, titulo, children }: { cor: string; fundo: string; titulo?: string; children: React.ReactNode }) {
  return (
    <span title={titulo} style={{
      display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999,
      background: fundo, color: cor, fontSize: 11, fontWeight: 700, lineHeight: 1.5, whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function Cartao({ arte, escolhida, onEscolher }: {
  arte: ArteEncontrada; escolhida: boolean; onEscolher: () => void;
}) {
  const [falhou, setFalhou] = useState(false);
  const url = imagemDaArte(arte);
  return (
    <button
      type="button"
      onClick={onEscolher}
      aria-pressed={escolhida}
      // `card-busca-arte-`: o cartão do celular na Arte já é `card-arte-<id>`.
      data-testid={`card-busca-arte-${arte.id}`}
      style={{
        // 44px é o piso de alvo no celular; o cartão é bem maior que isso, e
        // o `textAlign: left` é porque button centra o texto por padrão.
        minHeight: 44, textAlign: "left", padding: 10, cursor: "pointer",
        display: "flex", flexDirection: "column", gap: 8,
        background: "#fff", borderRadius: 12,
        border: escolhida ? "2px solid #1c1917" : "1px solid #e7e5e4",
        boxShadow: escolhida ? "0 6px 16px -6px rgba(0,0,0,0.25)" : "none",
        transition: "border-color 0.12s, box-shadow 0.12s",
      }}
    >
      <div style={{ width: "100%", aspectRatio: "4 / 3", borderRadius: 8, overflow: "hidden", background: "#f5f5f4", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {url && !falhou
          ? <img src={miniatura(url)} alt="" loading="lazy" decoding="async" onError={() => setFalhou(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <ImageIcon size={22} color="#78716c" aria-hidden="true" />}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#1c1917", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {arte.displayId ?? "Peça"} · {arte.tipo}
        </span>
        <span style={{ fontSize: 12, color: "#57534e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {arte.eventName ?? "Sem evento"}{dia(arte.eventInicio) ? ` · ${dia(arte.eventInicio)}` : ""}
        </span>
        {arte.descricao && (
          <span style={{ fontSize: 11.5, color: "#746e69", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {arte.descricao}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {arte.mesmoPatrocinador && <Selo cor="#065f46" fundo="#d1fae5">mesmo patrocinador</Selo>}
        {arte.eventoParecido && <Selo cor="#1d4ed8" fundo="#eff6ff">evento parecido</Selo>}
        {arte.mesmoTipo && <Selo cor="#44403c" fundo="#e7e5e4">mesmo tipo</Selo>}
        {arte.aprovada && (
          <Selo cor="#065f46" fundo="#ecfdf5" titulo={textoDaAprovacao(arte) ?? undefined}>
            <span data-testid={`selo-aprovada-${arte.id}`}>Aprovada</span>
          </Selo>
        )}
      </div>
    </button>
  );
}

export function BuscarArteDialog({ item, querArquivoFinal, onUsar, onClose }: {
  /** A peça que vai RECEBER a arte. `null` fecha o modal. */
  item: { id: string; displayId?: string | null } | null;
  /** Aberto a partir do arquivo final: só serve arte que TEM arquivo final. */
  querArquivoFinal?: boolean;
  onUsar: (arte: ArteEncontrada) => void;
  onClose: () => void;
}) {
  const [termo, setTermo] = useState("");
  const [termoBuscado, setTermoBuscado] = useState("");
  const [escolhidaId, setEscolhidaId] = useState<string | null>(null);

  // Debounce de 300ms: sem ele cada tecla vira uma ida ao servidor que varre
  // o acervo inteiro de artes.
  useEffect(() => {
    const t = window.setTimeout(() => setTermoBuscado(termo.trim()), 300);
    return () => window.clearTimeout(t);
  }, [termo]);

  // Fechar zera tudo: reabrir na peça seguinte com o termo e a escolha da
  // anterior mostrava a arte errada já selecionada.
  // A dependência é o ID, e não o objeto: quem abre monta `{ id, displayId }`
  // no render, então o objeto é NOVO a cada render e o efeito rodaria sempre.
  const itemId = item?.id ?? null;
  useEffect(() => {
    if (!itemId) { setTermo(""); setTermoBuscado(""); setEscolhidaId(null); }
  }, [itemId]);

  const chave = itemId
    ? `/api/artes/busca?item=${encodeURIComponent(itemId)}${querArquivoFinal ? "&comArquivoFinal=1" : ""}${termoBuscado ? `&q=${encodeURIComponent(termoBuscado)}` : ""}`
    : "";
  const { data, isLoading, isError, refetch } = useQuery<Resposta>({ queryKey: [chave], enabled: !!itemId });

  // O recorte de "só com arquivo final" é do SERVIDOR (comArquivoFinal=1),
  // para que o teto de 60 já venha cheio do que serve. Aqui só se lê.
  const artes = useMemo(() => data?.artes ?? SEM_ARTES, [data]);

  const escolhida = artes.find((a) => a.id === escolhidaId) ?? null;
  const previa = escolhida ? imagemDaArte(escolhida) : null;
  const digitando = termo.trim() !== termoBuscado;

  return (
    <Dialog open={!!item} onOpenChange={(aberto) => { if (!aberto) onClose(); }}>
      <DialogContent
        className={`p-0 gap-0 border-0 ${HIDE_NATIVE_CLOSE}`}
        style={{ ...modalSurface(820), backgroundColor: "#fafaf9" }}
      >
        <DialogTitle className="sr-only">Buscar arte já feita</DialogTitle>
        <DialogDescription className="sr-only">
          Artes já enviadas no app, do mesmo patrocinador e de eventos do mesmo circuito. Escolher uma aplica a arte nesta peça, sem subir o arquivo de novo.
        </DialogDescription>

        <ModalHeader
          icon={Sparkles}
          tint="#6d28d9"
          title="Buscar arte já feita"
          subtitle={data?.alvo
            ? `Para ${data.alvo.displayId ?? "esta peça"} · ${data.alvo.tipo} — mesmo patrocinador e eventos do mesmo circuito primeiro.`
            : "Procurando artes parecidas…"}
          onClose={onClose}
        />

        <div style={{ padding: "12px 20px", background: "#fff", borderBottom: "1px solid #e7e5e4", flexShrink: 0 }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <Search size={15} aria-hidden="true" style={{ position: "absolute", left: 12, color: "#78716c" }} />
            <input
              type="search"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Patrocinador, evento, tipo, descrição ou código"
              aria-label="Buscar arte já feita"
              data-testid="input-buscar-arte"
              style={{
                // 16px: abaixo disso o Safari do iPhone dá zoom no campo ao
                // focar e a tela salta.
                width: "100%", minHeight: 44, padding: "0 12px 0 34px", fontSize: 16,
                borderRadius: 10, border: "1px solid #d6d3d1", background: "#fff", color: "#1c1917",
              }}
            />
          </div>
          {termoBuscado === "" && (
            <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "#78716c" }}>
              Sugestões para esta peça. Digite para procurar em todo o acervo de artes.
            </p>
          )}
        </div>

        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {(isLoading || digitando) && (
            <div aria-busy="true" aria-label="Procurando artes" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="animate-pulse" style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 12, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ width: "100%", aspectRatio: "4 / 3", borderRadius: 8, background: "#e7e5e4" }} />
                  <div style={{ width: "70%", height: 11, borderRadius: 6, background: "#e7e5e4" }} />
                  <div style={{ width: "90%", height: 10, borderRadius: 6, background: "#f5f5f4" }} />
                </div>
              ))}
            </div>
          )}

          {isError && !isLoading && (
            <div role="alert" data-testid="erro-buscar-arte" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "12px 14px", borderRadius: 12, background: "#fef2f2", border: "1px solid #fecaca", fontSize: 13, color: "#b91c1c" }}>
              <span>Não foi possível procurar as artes agora. A peça continua como está — nada foi alterado.</span>
              <button type="button" onClick={() => refetch()} style={{ minHeight: 44, padding: "0 16px", borderRadius: 8, border: "1px solid #fecaca", background: "#fff", color: "#1c1917", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Tentar de novo
              </button>
            </div>
          )}

          {!isLoading && !isError && !digitando && artes.length === 0 && (
            <div data-testid="vazio-buscar-arte" style={{ textAlign: "center", padding: "26px 12px", color: "#57534e" }}>
              <ImageIcon size={26} color="#78716c" aria-hidden="true" />
              <p style={{ margin: "8px 0 2px", fontSize: 14, fontWeight: 800, color: "#1c1917" }}>Nenhuma arte encontrada</p>
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>
                {termoBuscado
                  ? <>Nada com “{termoBuscado}”{querArquivoFinal ? " que tenha arquivo final" : ""}. Tente o nome do patrocinador ou do circuito — “estações”, por exemplo.</>
                  : querArquivoFinal
                    ? "Nenhuma peça com arquivo final até agora. Suba o arquivo desta vez."
                    : "Nenhuma peça com arte no app ainda. Suba a imagem desta vez."}
              </p>
            </div>
          )}

          {!isLoading && !isError && !digitando && artes.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
              {artes.map((a) => (
                <Cartao key={a.id} arte={a} escolhida={a.id === escolhidaId} onEscolher={() => setEscolhidaId(a.id)} />
              ))}
            </div>
          )}

          {data?.cortou && !isLoading && !isError && (
            <p style={{ margin: 0, fontSize: 11.5, color: "#78716c", textAlign: "center" }}>
              Mostrando as {artes.length} artes mais parecidas. Refine a busca para achar outra.
            </p>
          )}
        </div>

        {escolhida && (
          <ModalFooter>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ width: 72, height: 54, borderRadius: 8, overflow: "hidden", background: "#f5f5f4", border: "1px solid #e7e5e4", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {previa
                  ? <img src={miniatura(previa)} alt={`Prévia da arte de ${escolhida.displayId ?? "peça"}`} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <ImageIcon size={18} color="#78716c" aria-hidden="true" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#1c1917", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {escolhida.displayId ?? "Peça"} · {escolhida.eventName ?? "Sem evento"}
                </div>
                <div style={{ fontSize: 11.5, color: "#57534e", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {escolhida.patrocinadores.length > 0 ? escolhida.patrocinadores.join(", ") : "Sem patrocinador"}
                  {escolhida.temArquivoFinal && <> · <FileText size={11} aria-hidden="true" style={{ display: "inline", verticalAlign: "-1px" }} /> arquivo final</>}
                </div>
                {escolhida.aprovada && (
                  <div data-testid="texto-aprovacao-escolhida" style={{ fontSize: 11.5, color: "#065f46", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {textoDaAprovacao(escolhida)}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              data-testid="button-usar-esta-arte"
              onClick={() => onUsar(escolhida)}
              style={{
                width: "100%", minHeight: 44, borderRadius: 9, border: "none",
                background: "#1c1917", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
              }}
            >
              Usar esta arte
            </button>
            {/* Dizer ANTES do clique que nada pula etapa: reaproveitar não é
                atalho de aprovação, é só não subir o arquivo de novo. */}
            <p style={{ margin: 0, fontSize: 11.5, color: "#78716c", textAlign: "center", lineHeight: 1.45 }}>
              A arte é aplicada nesta peça e ela segue o fluxo normal de aprovação.
            </p>
          </ModalFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
