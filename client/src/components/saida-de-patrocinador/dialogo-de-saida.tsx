// ─────────────────────────────────────────────────────────────────────────────
// "‹Patrocinador› sai do evento — o que fazer com as peças dele?" (dono, 20/10)
//
// Uma decisão por patrocinador que sai e TEM peças:
//   · Passar para ‹outro› (a principal) — as peças continuam vivas, com a
//     marca nova; nenhuma é cancelada. Vem PRÉ-ESCOLHIDA quando, na mesma
//     edição, saiu um e entrou exatamente um (o caso Kakau, 16/10);
//   · Só remover — o comportamento de sempre, com o aviso explícito de
//     quantas peças serão canceladas (as que ficam sem patrocinador);
//   · Cancelar — volta ao formulário sem gravar nada.
//
// O estado (aberto, peças, pré-seleção) vem de ./use-saida-de-patrocinador; a
// conta de cada aviso, de @shared/troca-de-patrocinador.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeftRight, AlertTriangle, Search, Check } from "lucide-react";
import type { Sponsor } from "@shared/schema";
import { impactoDaSaida, seriaCancelada, type DecisaoDeSaida } from "@shared/troca-de-patrocinador";
import { T, FS, R, FW, FONT, TOM, N } from "@/lib/theme";
import { normalizarBusca } from "@/lib/utils";
import { Botao } from "@/components/ui/botao";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { modalSurface } from "@/components/modal-shell";
import type { DecisoesDeSaida, SaidaDePatrocinador, SaidaEmAberto } from "./use-saida-de-patrocinador";

type PatrocinadorDaLista = Pick<Sponsor, "id" | "name"> & { arquivadoEm?: Date | string | null };

/** "Passar" escolhido mas sem destino ainda: `para` vazio. */
type Rascunho = { tipo: "trocar"; para: string } | { tipo: "remover" } | undefined;

const pecasTxt = (n: number) => (n === 1 ? "1 peça" : `${n} peças`);

export function DialogoDeSaida({ saida, sponsors, isMobile }: {
  saida: SaidaDePatrocinador;
  sponsors: PatrocinadorDaLista[];
  isMobile: boolean;
}) {
  const { aberta, responder } = saida;
  // Durante a animação de saída o Radix mantém o conteúdo montado: sem o
  // último estado, a caixa esvaziaria antes de sumir.
  const ultimo = useRef<SaidaEmAberto | null>(null);
  if (aberta) ultimo.current = aberta;
  const atual = aberta ?? ultimo.current;
  return (
    <AlertDialog open={!!aberta} onOpenChange={(v) => { if (!v) responder(null); }}>
      <AlertDialogContent
        data-testid="dialogo-saida-de-patrocinador"
        style={{ ...modalSurface(600), gap: 0 }}
      >
        {atual && <Conteudo key={`${atual.eventId}:${atual.comPecas.join(",")}`} aberta={atual} sponsors={sponsors} isMobile={isMobile} responder={responder} />}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Conteudo({ aberta, sponsors, isMobile, responder }: {
  aberta: SaidaEmAberto;
  sponsors: PatrocinadorDaLista[];
  isMobile: boolean;
  responder: (d: DecisoesDeSaida | null) => void;
}) {
  const { comPecas, pecas, preSelecionados } = aberta;
  const porId = useMemo(() => new Map(sponsors.map((s) => [s.id, s])), [sponsors]);
  const nome = (id: string) => porId.get(id)?.name ?? "este patrocinador";

  const [rascunho, setRascunho] = useState<Record<string, Rascunho>>(() =>
    Object.fromEntries(comPecas.map((s) => [s, preSelecionados[s] ? { tipo: "trocar", para: preSelecionados[s] } : undefined])));

  // Só decisões COMPLETAS contam para os avisos ("Passar" sem destino ainda não é decisão).
  const completas: Record<string, DecisaoDeSaida | undefined> = Object.fromEntries(comPecas.map((s) => {
    const d = rascunho[s];
    return [s, d?.tipo === "remover" || (d?.tipo === "trocar" && d.para) ? d : undefined];
  }));
  const impacto = impactoDaSaida(pecas, comPecas, completas);
  const soRemover = new Set(comPecas.filter((s) => completas[s]?.tipo === "remover"));
  const totalCanceladas = pecas.filter((p) => seriaCancelada(p, soRemover)).length;

  const faltando = comPecas.find((s) => !completas[s]);
  const motivo = faltando
    ? rascunho[faltando]?.tipo === "trocar"
      ? `Escolha para qual patrocinador passam as peças de ${nome(faltando)}.`
      : `Escolha o que fazer com as peças de ${nome(faltando)}.`
    : undefined;

  const um = comPecas.length === 1;
  const n0 = impacto[comPecas[0]]?.pecas ?? 0;
  const titulo = um
    ? `${nome(comPecas[0])} sai do evento — o que fazer com ${n0 === 1 ? "a peça dele" : `as ${n0} peças dele`}?`
    : `${comPecas.length} patrocinadores saem do evento — o que fazer com as peças de cada um?`;

  const confirmar = () => {
    if (faltando) return;
    responder(Object.fromEntries(comPecas.map((s) => [s, completas[s]!])) as DecisoesDeSaida);
  };

  const pad = isMobile ? "20px 16px" : "24px 28px";
  return (
    <>
      <div style={{ padding: pad, paddingBottom: 12, overflowY: "auto", flex: "1 1 auto", minHeight: 0, overscrollBehavior: "contain" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: R.lg, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", backgroundColor: TOM.laranja.bg, border: `1px solid ${TOM.laranja.border}`, color: T.accentText }}>
            <ArrowLeftRight style={{ width: 17, height: 17 }} />
          </span>
          <AlertDialogTitle style={{ fontFamily: FONT.display, fontSize: isMobile ? FS.lead : FS.title, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.3, color: T.dark, margin: 0, paddingTop: isMobile ? 0 : 6 }}>
            {titulo}
          </AlertDialogTitle>
        </div>
        <AlertDialogDescription style={{ fontSize: FS.body, color: T.apoio, lineHeight: 1.55, margin: "12px 0 0" }}>
          {um && (
            <span data-testid="resumo-da-saida" style={{ display: "block", fontWeight: FW.forte, color: T.strong, marginBottom: 4 }}>
              {pecasTxt(n0)} no evento{impacto[comPecas[0]].soEle > 0 ? ` · ${impacto[comPecas[0]].soEle} só ${impacto[comPecas[0]].soEle === 1 ? "tem" : "têm"} ${nome(comPecas[0])} e ${impacto[comPecas[0]].soEle === 1 ? "seria cancelada" : "seriam canceladas"} em “Só remover”` : ""}
            </span>
          )}
          Passar mantém as peças vivas e troca a marca nelas. Só remover tira a marca e cancela as peças que ficarem sem patrocinador.
        </AlertDialogDescription>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
          {comPecas.map((s) => (
            <DecisaoDoPatrocinador
              key={s}
              sponsorId={s}
              mostrarCabecalho={!um}
              nome={nome(s)}
              rascunho={rascunho[s]}
              setRascunho={(d) => setRascunho((prev) => ({ ...prev, [s]: d }))}
              impacto={impacto[s]}
              aberta={aberta}
              sponsors={sponsors}
              porId={porId}
              isMobile={isMobile}
            />
          ))}
        </div>
      </div>

      <div style={{ padding: isMobile ? "12px 16px 16px" : "14px 28px 20px", borderTop: `1px solid ${T.border}`, backgroundColor: T.bg, display: "flex", flexDirection: isMobile ? "column-reverse" : "row", justifyContent: "flex-end", alignItems: isMobile ? "stretch" : "flex-start", gap: 10, flexShrink: 0 }}>
        <Botao
          variante="secundario"
          tamanho={isMobile ? "toque" : "md"}
          onClick={() => responder(null)}
          data-testid="button-cancelar-saida"
        >
          Cancelar
        </Botao>
        <Botao
          variante={totalCanceladas > 0 ? "perigo" : "primario"}
          tamanho={isMobile ? "toque" : "md"}
          disabled={!!faltando}
          motivo={motivo}
          alinharMotivo={isMobile ? "start" : "end"}
          onClick={confirmar}
          data-testid="button-confirmar-saida"
        >
          {totalCanceladas > 0 ? `Salvar e cancelar ${pecasTxt(totalCanceladas)}` : "Salvar alterações"}
        </Botao>
      </div>
    </>
  );
}

function DecisaoDoPatrocinador({ sponsorId, mostrarCabecalho, nome, rascunho, setRascunho, impacto, aberta, sponsors, porId, isMobile }: {
  sponsorId: string;
  mostrarCabecalho: boolean;
  nome: string;
  rascunho: Rascunho;
  setRascunho: (d: Rascunho) => void;
  impacto: ReturnType<typeof impactoDaSaida>[string];
  aberta: SaidaEmAberto;
  sponsors: PatrocinadorDaLista[];
  porId: Map<string, PatrocinadorDaLista>;
  isMobile: boolean;
}) {
  const trocando = rascunho?.tipo === "trocar";
  const removendo = rascunho?.tipo === "remover";
  // O destino escolhido SOBREVIVE a uma ida ao "Só remover": quem compara as
  // duas opções e volta não pode perder a pré-seleção (nem a escolha feita).
  const [ultimoDestino, setUltimoDestino] = useState(rascunho?.tipo === "trocar" ? rascunho.para : "");
  const destinoLembrado = ultimoDestino ? porId.get(ultimoDestino) : undefined;
  const destino = trocando && rascunho.para ? porId.get(rascunho.para) : undefined;
  // Pré-escolhido (ou já escolhido): a lista recolhe e fica só o destino com "Trocar destino".
  const [escolhendo, setEscolhendo] = useState(!destino);
  const n = impacto.pecas;
  // Com outro saindo junto em "Só remover", a conta inclui as peças que tinham
  // os dois — aí a frase não pode dizer "só tinham ele".
  const c = impacto.canceladasSeRemover;

  const descTrocar = [
    `${n === 1 ? "A peça continua viva e passa" : `As ${n} peças continuam vivas e passam`} a ter ${destinoLembrado ? `"${destinoLembrado.name}"` : "o novo patrocinador"}.`,
    impacto.emAprovacao > 0 ? `${impacto.emAprovacao === 1 ? "1 em aprovação ganha" : `${impacto.emAprovacao} em aprovação ganham`} aprovação pendente do novo.` : "",
    impacto.depoisDaAprovacao > 0 ? `${impacto.depoisDaAprovacao === 1 ? "1 já aprovada troca" : `${impacto.depoisDaAprovacao} já aprovadas trocam`} só a marca, sem reabrir a aprovação.` : "",
  ].filter(Boolean).join(" ");

  const nomeDoGrupo = `saida-${sponsorId}`;
  const tamanhoDoRadio = isMobile ? 20 : 18;
  const cartao = (ativo: boolean, perigo = false): CSSProperties => ({
    borderRadius: R.md,
    border: `1px solid ${ativo ? (perigo ? TOM.perigo.border : T.text) : T.border}`,
    boxShadow: ativo ? `inset 0 0 0 1px ${perigo ? TOM.perigo.border : T.text}` : "none",
    backgroundColor: ativo && perigo ? TOM.perigo.bg : T.surface,
  });
  const linhaDaOpcao: CSSProperties = {
    display: "flex", alignItems: "flex-start", gap: 12, padding: isMobile ? "12px 14px" : "12px 14px", minHeight: 44, cursor: "pointer",
  };

  return (
    <fieldset data-testid={`secao-saida-${sponsorId}`} style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
      <legend style={mostrarCabecalho
        ? { padding: 0, marginBottom: 8, fontSize: FS.read, fontWeight: 700, color: T.text, display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 8px" }
        : { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
        {mostrarCabecalho ? (
          <>
            <span>{nome}</span>
            <span style={{ fontSize: FS.meta, fontWeight: FW.medio, color: T.second }}>
              {pecasTxt(n)}{impacto.soEle > 0 ? ` · ${impacto.soEle} só ${impacto.soEle === 1 ? "tem" : "têm"} ele` : ""}
            </span>
          </>
        ) : `O que fazer com as peças de ${nome}`}
      </legend>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* PASSAR — a principal. O seletor fica FORA do <label>: campo dentro de rótulo de rádio marca o rádio a cada clique. */}
        <div style={cartao(trocando)} data-testid={`opcao-trocar-${sponsorId}`}>
          <label style={linhaDaOpcao}>
            <input
              type="radio"
              name={nomeDoGrupo}
              checked={trocando}
              onChange={() => setRascunho({ tipo: "trocar", para: ultimoDestino })}
              data-testid={`radio-trocar-${sponsorId}`}
              style={{ width: tamanhoDoRadio, height: tamanhoDoRadio, margin: "1px 0 0", flexShrink: 0, accentColor: T.dark, cursor: "pointer" }}
            />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: FS.read, fontWeight: 700, color: T.text, lineHeight: 1.35 }}>
                {destinoLembrado ? <>Passar para {destinoLembrado.name}</> : "Passar para outro patrocinador"}
              </span>
              <span style={{ display: "block", fontSize: FS.meta, color: T.apoio, lineHeight: 1.5, marginTop: 2 }}>{descTrocar}</span>
            </span>
          </label>
          {trocando && (
            <div style={{ padding: isMobile ? "0 14px 14px" : "0 14px 14px 44px" }}>
              {destino && !escolhendo ? (
                <div data-testid={`destino-escolhido-${sponsorId}`} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: isMobile ? "10px 12px" : "8px 10px", borderRadius: R.md, backgroundColor: T.low, border: `1px solid ${T.border}` }}>
                  <Check aria-hidden="true" style={{ width: 14, height: 14, color: TOM.sucesso.text, flexShrink: 0 }} />
                  <span style={{ fontSize: FS.body, color: T.apoio }}>Destino:</span>
                  <strong style={{ fontSize: FS.body, color: T.text, minWidth: 0, overflowWrap: "anywhere" }}>{destino.name}</strong>
                  <EtiquetaDoDestino id={destino.id} aberta={aberta} />
                  <Botao
                    variante={isMobile ? "secundario" : "fantasma"}
                    tamanho={isMobile ? "toque" : "sm"}
                    onClick={() => setEscolhendo(true)}
                    data-testid={`button-trocar-destino-${sponsorId}`}
                    // No celular o botão desce para a própria linha, com borda
                    // (solto, sem borda, ele se perdia no fundo cinza).
                    style={isMobile ? { marginTop: 2 } : { marginLeft: "auto" }}
                  >
                    Trocar destino
                  </Botao>
                </div>
              ) : (
                <SeletorDeDestino
                  sponsorId={sponsorId}
                  nomeDe={nome}
                  escolhido={trocando ? rascunho.para : ""}
                  aoEscolher={(id) => { setUltimoDestino(id); setRascunho({ tipo: "trocar", para: id }); setEscolhendo(false); }}
                  aberta={aberta}
                  sponsors={sponsors}
                  isMobile={isMobile}
                />
              )}
            </div>
          )}
        </div>

        {/* SÓ REMOVER — o de sempre, com a conta do que cancela. */}
        <label style={{ ...cartao(removendo, c > 0), ...linhaDaOpcao }} data-testid={`opcao-remover-${sponsorId}`}>
          <input
            type="radio"
            name={nomeDoGrupo}
            checked={removendo}
            onChange={() => setRascunho({ tipo: "remover" })}
            data-testid={`radio-remover-${sponsorId}`}
            style={{ width: tamanhoDoRadio, height: tamanhoDoRadio, margin: "1px 0 0", flexShrink: 0, accentColor: c > 0 ? TOM.perigo.text : T.dark, cursor: "pointer" }}
          />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: FS.read, fontWeight: 700, color: T.text, lineHeight: 1.35 }}>Só remover</span>
            <span style={{ display: "block", fontSize: FS.meta, color: T.apoio, lineHeight: 1.5, marginTop: 2 }}>
              Tira {nome} {n === 1 ? "da peça" : `das ${n} peças`}.
            </span>
            {c > 0 ? (
              <span data-testid={`aviso-cancelamento-${sponsorId}`} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 6, fontSize: FS.body, fontWeight: 700, color: TOM.perigo.text, lineHeight: 1.45 }}>
                <AlertTriangle aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }} />
                {c === 1 ? "1 peça será cancelada" : `${c} peças serão canceladas`}
                {c === impacto.soEle ? ` (só ${c === 1 ? "tinha" : "tinham"} ${nome}).` : ` (${c === 1 ? "fica" : "ficam"} sem nenhum patrocinador).`}
              </span>
            ) : (
              <span data-testid={`aviso-cancelamento-${sponsorId}`} style={{ display: "block", marginTop: 4, fontSize: FS.meta, color: T.second, lineHeight: 1.45 }}>
                Nenhuma peça será cancelada — todas têm outro patrocinador ou já estão na Gráfica.
              </span>
            )}
          </span>
        </label>
      </div>
    </fieldset>
  );
}

/** "entrou agora" / "no evento" / "fora do evento — entra junto". */
function EtiquetaDoDestino({ id, aberta }: { id: string; aberta: SaidaEmAberto }) {
  const [rotulo, tom] = aberta.entrantes.includes(id)
    ? ["entrou agora", TOM.sucesso]
    : aberta.doEvento.includes(id)
      ? ["no evento", TOM.neutro]
      : ["fora do evento — entra junto", TOM.info];
  return (
    <span style={{ fontSize: FS.small, fontWeight: 700, color: tom.text, backgroundColor: tom.bg, border: `1px solid ${tom.border}`, borderRadius: R.pill, padding: "1px 8px", whiteSpace: "nowrap" }}>
      {rotulo}
    </span>
  );
}

function SeletorDeDestino({ sponsorId, nomeDe, escolhido, aoEscolher, aberta, sponsors, isMobile }: {
  sponsorId: string;
  nomeDe: string;
  escolhido: string;
  aoEscolher: (id: string) => void;
  aberta: SaidaEmAberto;
  sponsors: PatrocinadorDaLista[];
  isMobile: boolean;
}) {
  const [busca, setBusca] = useState("");
  const saem = new Set(aberta.removidos);
  const vivos = sponsors.filter((s) => !s.arquivadoEm && !saem.has(s.id));
  const porId = new Map(vivos.map((s) => [s.id, s]));
  const q = normalizarBusca(busca);
  // Sem busca: quem entrou agora no topo, depois os que ficam no evento.
  // Com busca: o catálogo inteiro (quem está fora entra no evento junto).
  const peso = (id: string) => (aberta.entrantes.includes(id) ? 0 : aberta.doEvento.includes(id) ? 1 : 2);
  const lista = q
    ? vivos.filter((s) => normalizarBusca(s.name).includes(q)).sort((a, b) => peso(a.id) - peso(b.id) || a.name.localeCompare(b.name, "pt-BR")).slice(0, 8)
    : Array.from(new Set([...aberta.entrantes, ...aberta.doEvento])).map((id) => porId.get(id)).filter((s): s is PatrocinadorDaLista => !!s);
  const idDaBusca = `busca-destino-${sponsorId}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label htmlFor={idDaBusca} style={{ fontSize: FS.meta, fontWeight: 700, color: T.apoio }}>
        Para qual patrocinador passam as peças de {nomeDe}?
      </label>
      <div style={{ position: "relative" }}>
        <Search aria-hidden="true" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: T.muted, pointerEvents: "none" }} />
        <input
          id={idDaBusca}
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar no catálogo de patrocinadores"
          autoComplete="off"
          data-testid={idDaBusca}
          className="evl-campo"
          style={{ width: "100%", boxSizing: "border-box", height: isMobile ? 44 : 38, padding: "0 12px 0 32px", border: `1px solid ${T.border}`, borderRadius: R.md, backgroundColor: T.surface, color: T.text, fontFamily: FONT.corpo, fontSize: isMobile ? FS.lead : FS.body }}
        />
      </div>
      {lista.length === 0 ? (
        <p data-testid={`destino-vazio-${sponsorId}`} style={{ margin: 0, fontSize: FS.body, color: T.second, lineHeight: 1.5 }}>
          {q ? "Nenhum patrocinador com esse nome no catálogo." : "Nenhum outro patrocinador fica no evento — busque no catálogo acima."}
        </p>
      ) : (
        <div role="radiogroup" aria-label={`Destino das peças de ${nomeDe}`} style={{ display: "flex", flexDirection: "column", border: `1px solid ${T.border}`, borderRadius: R.md, maxHeight: 220, overflowY: "auto", overscrollBehavior: "contain" }}>
          {lista.map((s, i) => (
            <label
              key={s.id}
              data-testid={`opcao-destino-${sponsorId}-${s.id}`}
              style={{ display: "flex", alignItems: "center", gap: 10, minHeight: isMobile ? 44 : 40, padding: "6px 12px", cursor: "pointer", borderTop: i === 0 ? "none" : `1px solid ${N.n3}`, backgroundColor: escolhido === s.id ? T.low : T.surface }}
            >
              <input
                type="radio"
                name={`destino-${sponsorId}`}
                checked={escolhido === s.id}
                onChange={() => aoEscolher(s.id)}
                style={{ width: 16, height: 16, margin: 0, flexShrink: 0, accentColor: T.dark, cursor: "pointer" }}
              />
              <span style={{ flex: 1, minWidth: 0, fontSize: FS.body, fontWeight: 600, color: T.text, overflowWrap: "anywhere" }}>{s.name}</span>
              <EtiquetaDoDestino id={s.id} aberta={aberta} />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
