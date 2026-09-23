// Cartão de uma foto na grade de Registros: a foto (abre o zoom), baixar sem
// abrir, a legenda da peça e o botão do par conferência ↔ entrega.
import type { Dispatch, SetStateAction } from "react";
import { Link } from "wouter";
import { ChevronRight, Download, Loader2, ZoomIn } from "lucide-react";
import { alvo } from "@/hooks/use-mobile";
import { T, FS, R, FW, FONT, TOM, SHADOW } from "@/lib/theme";
import { KIND, kindOf, srcOf, fmt, altOf, type Photo } from "./fotos";

export function CartaoDeFoto({
  p, idx, brokenIds, setBrokenIds, setZoomIdx, baixar, baixando, toque,
  contraparteDe, idxPorId, setKindFilter, setAlvoDoPar,
}: {
  p: Photo;
  /** Índice da foto em `filtered` — é ele que o zoom usa. */
  idx: number;
  brokenIds: Set<string>;
  setBrokenIds: Dispatch<SetStateAction<Set<string>>>;
  setZoomIdx: Dispatch<SetStateAction<number | null>>;
  baixar: (p: Photo) => void;
  baixando: boolean;
  toque: boolean;
  contraparteDe: (f: Photo) => Photo | null;
  idxPorId: Map<string, number>;
  setKindFilter: Dispatch<SetStateAction<string[]>>;
  setAlvoDoPar: Dispatch<SetStateAction<string | null>>;
}) {
  const k = KIND[kindOf(p)];
  const Icon = k.icon;
  const notes = kindOf(p) === "conference" ? p.conferenceNotes : p.deliveryNotes;
  return (
    <div key={p.id} data-testid={`card-photo-${p.id}`} className="group reg-cartao"
      style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: SHADOW.sm }}
    >
      <div style={{ position: "relative" }}>
      <button
        onClick={() => setZoomIdx(idx)}
        title="Ampliar"
        aria-label={`Ampliar: ${altOf(p)}`}
        /* QUADRADO, não 4:3. As fotos da Gráfica vêm em
           orientações misturadas, e 4:3 com `objectFit: cover`
           corta topo e base de qualquer foto em pé — justo onde
           a peça está, porque banner e placa são o assunto
           vertical. O quadrado recorta as duas orientações
           igualmente pouco e mantém o ritmo da grade. */
        style={{ display: "block", position: "relative", width: "100%", aspectRatio: "1/1", border: "none", padding: 0, backgroundColor: T.low, cursor: "zoom-in" }}
      >
        {/* lazy: a grade carrega dezenas de fotos; sem isso o
            navegador baixa todas de uma vez ao abrir a tela. */}
        {/* alt era só "Conferência"/"Entrega": um leitor de tela
            repetia a mesma palavra sessenta vezes ao percorrer a
            grade, sem dizer de que peça era cada foto. */}
        {brokenIds.has(p.id) ? (
          <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS.small, color: T.second }}>
            Imagem indisponível
          </span>
        ) : (
          <img src={srcOf(p)} alt={altOf(p)} loading="lazy" decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={() => setBrokenIds(prev => {
              const next = new Set(prev);
              next.add(p.id);
              return next;
            })} />
        )}

        {/* Selo de tipo — sobre a foto, então a legenda abaixo já
            começa direto na informação da peça. */}
        <span style={{ position: "absolute", top: 8, left: 8, display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS.small, fontWeight: FW.forte, color: T.surface, backgroundColor: k.color, borderRadius: R.sm, padding: "3px 7px", boxShadow: SHADOW.sm }}>
          <Icon style={{ width: 10, height: 10 }} /> {k.label}
        </span>
        {/* alfa 0.72: a 0.6 o fundo do ID dependia da foto atrás
            — sobre foto clara o branco caía abaixo de 4,5:1. */}
        {p.displayId && (
          <span style={{ position: "absolute", top: 8, right: 8, fontFamily: FONT.mono, fontSize: FS.small, fontWeight: FW.forte, color: T.surface, backgroundColor: "rgba(28,25,23,0.72)", borderRadius: R.sm, padding: "2px 7px" }}>{p.displayId}</span>
        )}

        {/* Afordância de zoom — só aparece no hover, pra não competir com a foto. */}
        <span className="opacity-0 group-hover:opacity-100" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(28,25,23,0.25)", transition: "opacity 0.15s" }}>
          <ZoomIn style={{ width: 22, height: 22, color: T.surface }} />
        </span>
      </button>

      {/* BAIXAR SEM ABRIR. Salvar é a ação natural de um acervo
          que serve de comprovante, e era alcançável só de dentro
          do zoom: para guardar seis fotos era preciso abrir seis.
          Fora do <button> da foto, porque um botão dentro de
          outro é HTML inválido — e `position: absolute` sobre o
          cartão põe no mesmo lugar. */}
      <button
        onClick={e => { e.stopPropagation(); baixar(p); }}
        disabled={baixando}
        title="Baixar esta foto"
        aria-label={`Baixar: ${altOf(p)}`}
        data-testid={`button-card-download-${p.id}`}
        style={{
          position: "absolute", right: 8, bottom: 8,
          width: alvo(30, toque), height: alvo(30, toque), borderRadius: R.pill,
          border: "none", backgroundColor: "rgba(28,25,23,0.6)", color: T.surface,
          cursor: baixando ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0, zIndex: 1,
        }}
      >
        {baixando
          ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
          : <Download style={{ width: 14, height: 14 }} />}
      </button>
      </div>

      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <p style={{ fontSize: FS.body, fontWeight: 700, color: T.text, margin: 0, lineHeight: 1.3 }}>
          {p.itemType || "Peça removida"}
          {p.itemDescription && <span style={{ fontWeight: 400, color: T.second }}> — {p.itemDescription}</span>}
        </p>
        {/* Leva ao evento da peça — a pergunta seguinte a "vi a foto"
            costuma ser "onde essa peça está". #c2410c: o laranja
            saturado do tema reprovava AA como texto sobre branco. */}
        {p.eventId ? (
          <Link href={`/eventos/${p.eventId}`}
            data-testid={`link-event-${p.id}`}
            className="hover:underline"
            style={{ fontSize: FS.small, color: T.accentText, margin: 0, textDecoration: "none", fontWeight: 600 }}>
            {p.eventName || "Sem evento"}
          </Link>
        ) : (
          <p style={{ fontSize: FS.small, color: T.second, margin: 0 }}>Sem evento</p>
        )}

        {/* A observação é o que a Gráfica escreveu na hora — vale
            mais que os metadados. Fundo levíssimo em vez de só
            itálico, para separá-la do resto sem gritar.
            (#584237 era uma cor solta fora da paleta.) */}
        {notes && (
          <p style={{ fontSize: FS.small, color: T.apoio, fontStyle: "italic", margin: 0, lineHeight: 1.45, backgroundColor: T.low, borderRadius: R.sm, padding: "6px 8px" }}>
            “{notes}”
          </p>
        )}

        {/* ── O PAR ──
            A pergunta central deste acervo é "a peça foi entregue
            como foi conferida?". As duas fotos que respondem isso
            eram cartões independentes, a dezenas de posições de
            distância — e, com o agrupamento por dia, quase sempre
            em grupos diferentes.

            A AUSÊNCIA também é informação, e as duas direções
            dizem coisas diferentes: faltar a entrega é trabalho
            em curso; faltar a conferência é uma peça que SAIU sem
            conferência registrada. */}
        {(() => {
          const outra = contraparteDe(p);
          const ehConferencia = kindOf(p) === "conference";
          if (!outra) {
            return (
              <p style={{ marginTop: "auto", fontSize: FS.small, color: TOM.alerta.text, backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: R.sm, padding: "7px 9px", margin: "auto 0 0", lineHeight: 1.4 }}>
                {ehConferencia ? "Sem foto de entrega ainda" : "Entregue sem foto de conferência"}
              </p>
            );
          }
          const ko = KIND[kindOf(outra)];
          const KoIcone = ko.icon;
          // O índice da contraparte na lista FILTRADA (do mapa —
          // ver idxPorId). Quando ela não passa no filtro em
          // vigor (ex.: filtro de tipo em "Conferência"), o zoom
          // não tem para onde ir — então o clique limpa o filtro
          // de tipo antes de abrir, em vez de não fazer nada.
          const idxOutra = idxPorId.get(outra.id) ?? -1;
          return (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                if (idxOutra >= 0) { setZoomIdx(idxOutra); return; }
                // A contraparte não passa no filtro de tipo em
                // vigor. Limpa o filtro e ANOTA quem abrir; o
                // efeito abaixo abre quando ela entrar em
                // `filtered`. Sem a anotação o clique não faria
                // nada visível e pareceria um botão quebrado.
                setKindFilter([]);
                setAlvoDoPar(outra.id);
              }}
              title={`Abrir a foto de ${ko.label.toLowerCase()} desta peça`}
              data-testid={`button-pair-${p.id}`}
              style={{
                marginTop: "auto", width: "100%",
                minHeight: toque ? 52 : 44, padding: "7px 9px",
                display: "flex", alignItems: "center", gap: 9,
                backgroundColor: ko.bg, border: `1px solid ${ko.border}`,
                borderRadius: R.sm, cursor: "pointer", font: "inherit", textAlign: "left",
              }}
            >
              {/* Era uma <img> de 26px que baixava a foto
                  ORIGINAL da contraparte (megabytes) — em cada
                  cartão da grade, o download dobrava. O ícone do
                  tipo diz o mesmo por zero bytes; a foto de
                  verdade está a um clique. */}
              <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: R.sm, flexShrink: 0, backgroundColor: T.surface, border: `1px solid ${ko.border}`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <KoIcone style={{ width: 14, height: 14, color: ko.color }} />
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                {/* Frase em caixa normal: é um convite ("Ver a
                    entrega"), não um rótulo de categoria — em
                    caixa alta de 10px ele gritava mais que o
                    próprio nome da peça logo acima. */}
                <span style={{ display: "block", fontSize: FS.small, fontWeight: FW.forte, color: ko.color }}>
                  {ehConferencia ? "Ver a entrega" : "Ver a conferência"}
                </span>
                <span style={{ display: "block", fontFamily: FONT.mono, fontSize: FS.small, color: T.apoio }}>
                  {fmt(outra.createdAt)}
                </span>
              </span>
              <ChevronRight aria-hidden="true" style={{ width: 14, height: 14, color: ko.color, flexShrink: 0 }} />
            </button>
          );
        })()}

        <div style={{ paddingTop: 6, borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: FS.small, color: T.second }}>{fmt(p.createdAt)}</span>
          <span style={{ fontSize: FS.small, color: T.second, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {kindOf(p) === "delivery" && p.receivedBy ? `Recebido: ${p.receivedBy}` : (p.uploadedBy || "")}
          </span>
        </div>
      </div>
    </div>
  );
}
