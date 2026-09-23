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
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { EstadoVazio, EstadoErro } from "@/components/ui/estados";
import { miniatura } from "@/lib/miniatura";
import { T, N, TOM, FS, FW, R, SHADOW } from "@/lib/theme";

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

/** Texto que quebra em até duas linhas e só então corta. */
const DUAS_LINHAS: React.CSSProperties = {
  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
};

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

/** Selo compacto do cartão: 2px de altura a menos que o padrão, porque são
 *  até quatro por cartão de 180px. */
const SELO_DO_CARTAO: React.CSSProperties = { padding: "2px 8px", lineHeight: 1.5 };

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
        background: T.surface, borderRadius: R.lg,
        border: escolhida ? `2px solid ${T.text}` : `1px solid ${T.border}`,
        boxShadow: escolhida ? SHADOW.md : "none",
        transition: "border-color 0.12s, box-shadow 0.12s",
      }}
    >
      <div style={{ width: "100%", aspectRatio: "4 / 3", borderRadius: R.md, overflow: "hidden", background: N.n2, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {url && !falhou
          ? <img src={miniatura(url)} alt="" loading="lazy" decoding="async" onError={() => setFalhou(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <ImageIcon size={22} color={T.second} aria-hidden="true" />}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        {/* Em até DUAS linhas, e não reticência: o fim do nome do evento
            ("Estações — Primavera") é justamente o que diferencia um cartão do
            outro, e no toque não existe hover para ler o resto. */}
        <span style={{ fontSize: FS.body, fontWeight: FW.rotulo, color: T.text, ...DUAS_LINHAS }}>
          {arte.displayId ?? "Peça"} · {arte.tipo}
        </span>
        <span style={{ fontSize: FS.meta, color: T.apoio, ...DUAS_LINHAS }}>
          {arte.eventName ?? "Sem evento"}{dia(arte.eventInicio) ? ` · ${dia(arte.eventInicio)}` : ""}
        </span>
        {arte.descricao && (
          <span style={{ fontSize: FS.meta, color: T.second, ...DUAS_LINHAS }}>
            {arte.descricao}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {arte.mesmoPatrocinador && <Selo tom="esmeralda" style={SELO_DO_CARTAO}>mesmo patrocinador</Selo>}
        {arte.eventoParecido && <Selo tom="info" style={SELO_DO_CARTAO}>evento parecido</Selo>}
        {arte.mesmoTipo && <Selo tom="neutro" style={SELO_DO_CARTAO}>mesmo tipo</Selo>}
        {arte.aprovada && (
          <Selo tom="esmeralda" style={SELO_DO_CARTAO} title={textoDaAprovacao(arte) ?? undefined}>
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
        style={{ ...modalSurface(820), backgroundColor: T.bg }}
      >
        <DialogTitle className="sr-only">Buscar arte já feita</DialogTitle>
        <DialogDescription className="sr-only">
          Artes já enviadas no app, do mesmo patrocinador e de eventos do mesmo circuito. Escolher uma aplica a arte nesta peça, sem subir o arquivo de novo.
        </DialogDescription>

        <ModalHeader
          icon={Sparkles}
          tint={TOM.roxo.text}
          title="Buscar arte já feita"
          subtitle={data?.alvo
            ? `Para ${data.alvo.displayId ?? "esta peça"} · ${data.alvo.tipo} — mesmo patrocinador e eventos do mesmo circuito primeiro.`
            : "Procurando artes parecidas…"}
          onClose={onClose}
        />

        <div style={{ padding: "12px 20px", background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <Search size={15} aria-hidden="true" style={{ position: "absolute", left: 12, color: T.second }} />
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
                width: "100%", minHeight: 44, padding: "0 12px 0 34px", fontSize: FS.lead,
                borderRadius: R.md, border: `1px solid ${T.bdark}`, background: T.surface, color: T.text,
              }}
            />
          </div>
          {termoBuscado === "" && (
            <p style={{ margin: "8px 0 0", fontSize: FS.meta, color: T.second }}>
              Sugestões para esta peça. Digite para procurar em todo o acervo de artes.
            </p>
          )}
        </div>

        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {(isLoading || digitando) && (
            <div aria-busy="true" aria-label="Procurando artes" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="animate-pulse" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ width: "100%", aspectRatio: "4 / 3", borderRadius: R.md, background: T.border }} />
                  <div style={{ width: "70%", height: 11, borderRadius: R.sm, background: T.border }} />
                  <div style={{ width: "90%", height: 10, borderRadius: R.sm, background: N.n2 }} />
                </div>
              ))}
            </div>
          )}

          {isError && !isLoading && (
            // O EstadoErro já anuncia com role="alert"; a caixa só guarda o testid.
            <div data-testid="erro-buscar-arte">
              <EstadoErro
                compacto
                titulo="Não foi possível procurar as artes agora."
                detalhe="A peça continua como está — nada foi alterado."
                aoTentarDeNovo={() => refetch()}
              />
            </div>
          )}

          {!isLoading && !isError && !digitando && artes.length === 0 && (
            <div data-testid="vazio-buscar-arte">
              <EstadoVazio
                compacto
                icone={ImageIcon}
                titulo="Nenhuma arte encontrada"
                descricao={termoBuscado
                  ? <>Nada com “{termoBuscado}”{querArquivoFinal ? " que tenha arquivo final" : ""}. Tente o nome do patrocinador ou do circuito — “estações”, por exemplo.</>
                  : querArquivoFinal
                    ? "Nenhuma peça com arquivo final até agora. Suba o arquivo desta vez."
                    : "Nenhuma peça com arte no app ainda. Suba a imagem desta vez."}
              />
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
            <p style={{ margin: 0, fontSize: FS.meta, color: T.second, textAlign: "center" }}>
              Mostrando as {artes.length} artes mais parecidas. Refine a busca para achar outra.
            </p>
          )}
        </div>

        {escolhida && (
          <ModalFooter>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ width: 72, height: 54, borderRadius: R.md, overflow: "hidden", background: N.n2, border: `1px solid ${T.border}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {previa
                  ? <img src={miniatura(previa)} alt={`Prévia da arte de ${escolhida.displayId ?? "peça"}`} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <ImageIcon size={18} color={T.second} aria-hidden="true" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: FS.body, fontWeight: FW.rotulo, color: T.text, ...DUAS_LINHAS }}>
                  {escolhida.displayId ?? "Peça"} · {escolhida.eventName ?? "Sem evento"}
                </div>
                {/* Os patrocinadores são a razão de escolher ESTA arte: em
                    duas linhas, não cortados. */}
                <div style={{ fontSize: FS.meta, color: T.apoio, marginTop: 2, ...DUAS_LINHAS }}>
                  {escolhida.patrocinadores.length > 0 ? escolhida.patrocinadores.join(", ") : "Sem patrocinador"}
                  {escolhida.temArquivoFinal && <> · <FileText size={11} aria-hidden="true" style={{ display: "inline", verticalAlign: "-1px" }} /> arquivo final</>}
                </div>
                {escolhida.aprovada && (
                  <div data-testid="texto-aprovacao-escolhida" style={{ fontSize: FS.meta, color: TOM.esmeralda.text, marginTop: 2, ...DUAS_LINHAS }}>
                    {textoDaAprovacao(escolhida)}
                  </div>
                )}
              </div>
            </div>
            <Botao
              variante="primario"
              tamanho="toque"
              larguraCheia
              data-testid="button-usar-esta-arte"
              onClick={() => onUsar(escolhida)}
            >
              Usar esta arte
            </Botao>
            {/* Dizer ANTES do clique que nada pula etapa: reaproveitar não é
                atalho de aprovação, é só não subir o arquivo de novo. */}
            <p style={{ margin: 0, fontSize: FS.meta, color: T.second, textAlign: "center", lineHeight: 1.45 }}>
              A arte é aplicada nesta peça e ela segue o fluxo normal de aprovação.
            </p>
          </ModalFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
