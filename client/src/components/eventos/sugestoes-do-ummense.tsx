// SUGESTÕES DO UMMENSE (dono, 15/10) — os eventos do calendário do Ummense que
// ainda não estão no app, com os patrocinadores. O botão mora no cabeçalho de
// Eventos; o painel lista, por mês, com "Criar evento" (abre o MESMO
// formulário de criação, pré-preenchido) e "Ignorar" (por pessoa, neste
// navegador — ver use-eventos-sugeridos).
//
// A lista vem de uma FOTO do Ummense (o app não fala com o Ummense); a data
// da foto fica visível no topo para ninguém achar que é ao vivo.
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { CalendarPlus, EyeOff, Plus, Search, Undo2, AlertTriangle, ChevronDown } from "lucide-react";
import { normalizar, type EventoSugerido } from "@shared/eventos-sugeridos";
import { T } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { EstadoVazio, EstadoErro, Esqueleto } from "@/components/ui/estados";
import { MONTH_NAMES } from "./constantes";
import type { EventosSugeridosAbertos } from "./use-eventos-sugeridos";

const ddmm = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");
const diaDaSemana = (d: string) =>
  new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
    .toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");

/** O botão do cabeçalho: "Sugestões do Ummense (N)". */
export function BotaoDeSugestoes({ sug, onAbrir, isMobile }: {
  sug: EventosSugeridosAbertos;
  onAbrir: () => void;
  isMobile: boolean;
}) {
  // Sem foto no servidor (arquivo ausente), não há o que sugerir: sem botão.
  if (!sug.carregando && !sug.erro && !sug.dados?.fotoDe) return null;
  const n = sug.visiveis.length;
  return (
    <Botao
      variante="secundario"
      tamanho={isMobile ? "toque" : "md"}
      icone={CalendarPlus}
      onClick={onAbrir}
      larguraCheia={isMobile}
      data-testid="button-sugestoes-ummense"
      aria-label={sug.carregando ? "Sugestões do Ummense" : `Sugestões do Ummense: ${n} evento${n === 1 ? "" : "s"} para criar`}
      style={{ flexShrink: 0 }}
    >
      Sugestões do Ummense
      {!sug.carregando && !sug.erro && (
        <span className={`sug-ev-contagem${n === 0 ? " sug-ev-contagem-zero" : ""}`} data-testid="contagem-sugestoes-ummense">{n}</span>
      )}
    </Botao>
  );
}

export function PainelDeSugestoes({ aberto, onFechar, sug, onCriar, isMobile }: {
  aberto: boolean;
  onFechar: () => void;
  sug: EventosSugeridosAbertos;
  onCriar: (s: EventoSugerido) => void;
  isMobile: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [verIgnoradas, setVerIgnoradas] = useState(false);
  const q = normalizar(busca);
  const filtradas = useMemo(
    () => (q ? sug.visiveis.filter((s) => normalizar(`${s.nome} ${s.cidade ?? ""}`).includes(q)) : sug.visiveis),
    [sug.visiveis, q],
  );
  const porMes = useMemo(() => {
    const grupos: Array<{ chave: string; rotulo: string; itens: EventoSugerido[] }> = [];
    for (const s of filtradas) {
      const chave = s.data.slice(0, 7);
      let g = grupos.find((x) => x.chave === chave);
      if (!g) {
        g = { chave, rotulo: `${MONTH_NAMES[Number(s.data.slice(5, 7)) - 1]} ${s.data.slice(0, 4)}`, itens: [] };
        grupos.push(g);
      }
      g.itens.push(s);
    }
    return grupos;
  }, [filtradas]);
  const d = sug.dados;

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent
        className={`${HIDE_NATIVE_CLOSE} p-0 gap-0`}
        style={{ ...modalSurface(780), maxHeight: "calc(100dvh - 48px)" }}
        data-testid="painel-sugestoes-ummense"
      >
        <FreezeWhileClosing open={aberto}>
          <DialogTitle className="sr-only">Sugestões do Ummense</DialogTitle>
          <DialogDescription className="sr-only">Eventos do calendário do Ummense que ainda não estão no app, com os patrocinadores.</DialogDescription>
          <ModalHeader
            icon={CalendarPlus}
            variant="work"
            tint={T.accentText}
            title="Sugestões do Ummense"
            subtitle={isMobile ? undefined : "Eventos do calendário do Ummense que ainda não estão no app."}
            onClose={onFechar}
            compacto={isMobile}
            testIdDoFechar="fechar-sugestoes-ummense"
          />

          <div className="sug-ev-corpo-do-painel">
            {sug.carregando ? (
              <Esqueleto variante="lista" linhas={6} rotulo="Carregando as sugestões do Ummense" />
            ) : sug.erro ? (
              <EstadoErro titulo="Não foi possível carregar as sugestões do Ummense." aoTentarDeNovo={() => sug.recarregar()} tamanhoDoBotao={isMobile ? "toque" : "md"} />
            ) : (
              <>
                <div className="sug-ev-topo">
                  <p className="sug-ev-foto" data-testid="foto-do-ummense">
                    <strong>Foto do Ummense de {ddmm(d?.fotoDe)}</strong>
                    <span>
                      {" · "}{d?.futurosNaFoto ?? 0} evento{d?.futurosNaFoto === 1 ? "" : "s"} de hoje em diante · {d?.jaNoApp ?? 0} já no app
                    </span>
                  </p>
                  {sug.visiveis.length > 6 && (
                    <label className="sug-ev-busca">
                      <Search aria-hidden="true" style={{ width: 14, height: 14 }} />
                      <input
                        type="search"
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        placeholder="Buscar evento ou cidade"
                        aria-label="Buscar evento ou cidade"
                        data-testid="busca-sugestoes-ummense"
                        autoComplete="off"
                      />
                    </label>
                  )}
                </div>

                {sug.visiveis.length === 0 ? (
                  <EstadoVazio
                    compacto
                    icone={CalendarPlus}
                    titulo={sug.ignoradas.length > 0 ? "Nada novo para criar" : "Tudo da foto já está no app"}
                    descricao={sug.ignoradas.length > 0
                      ? `Os eventos que faltam no app foram ignorados (${sug.ignoradas.length}). Dá para voltar a sugerir abaixo.`
                      : "Quando a foto do Ummense for atualizada, os eventos novos aparecem aqui."}
                    testId="sugestoes-vazio"
                  />
                ) : filtradas.length === 0 ? (
                  <p className="sug-ev-nada">Nenhuma sugestão para "{busca}".</p>
                ) : (
                  porMes.map((g) => (
                    <section key={g.chave} className="sug-ev-mes" aria-labelledby={`sug-ev-mes-${g.chave}`}>
                      <h3 id={`sug-ev-mes-${g.chave}`} className="sug-ev-mes-titulo">
                        {g.rotulo}<span>{g.itens.length}</span>
                      </h3>
                      <ul className="sug-ev-lista">
                        {g.itens.map((s) => (
                          <LinhaDaSugestao key={s.id} s={s} isMobile={isMobile} onCriar={() => onCriar(s)} onIgnorar={() => sug.ignorar(s.id)} onAbrirEvento={onFechar} />
                        ))}
                      </ul>
                    </section>
                  ))
                )}

                {sug.ignoradas.length > 0 && (
                  <section className="sug-ev-ignoradas">
                    <button
                      type="button"
                      className="sug-ev-ignoradas-botao"
                      aria-expanded={verIgnoradas}
                      onClick={() => setVerIgnoradas((v) => !v)}
                      data-testid="toggle-ignoradas"
                    >
                      <ChevronDown aria-hidden="true" style={{ width: 14, height: 14, transform: verIgnoradas ? "rotate(180deg)" : undefined }} />
                      Ignoradas por você ({sug.ignoradas.length})
                    </button>
                    {verIgnoradas && (
                      <ul className="sug-ev-lista-ignoradas">
                        {sug.ignoradas.map((s) => (
                          <li key={s.id} data-testid={`ignorada-${s.id}`}>
                            <span className="sug-ev-ignorada-nome">{s.nome}<span> · {ddmm(s.data)}{s.cidade ? ` · ${s.cidade}` : ""}</span></span>
                            <Botao variante="fantasma" tamanho={isMobile ? "toque" : "sm"} icone={Undo2} onClick={() => sug.voltarASugerir(s.id)} data-testid={`voltar-sugestao-${s.id}`}>
                              Voltar a sugerir
                            </Botao>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}
              </>
            )}
          </div>
        </FreezeWhileClosing>
      </DialogContent>
    </Dialog>
  );
}

function LinhaDaSugestao({ s, isMobile, onCriar, onIgnorar, onAbrirEvento }: {
  s: EventoSugerido;
  isMobile: boolean;
  onCriar: () => void;
  onIgnorar: () => void;
  onAbrirEvento: () => void;
}) {
  const total = s.patrocinadores.length;
  const semCadastro = s.patrocinadores.filter((p) => !p.sponsorId).length;
  const existe = s.podeJaExistir;
  return (
    <li className="sug-ev-item" data-testid={`sugestao-${s.id}`}>
      <div className="sug-ev-data" aria-hidden="true">
        <span className="sug-ev-data-dia">{s.data.slice(8, 10)}</span>
        <span className="sug-ev-data-semana">{diaDaSemana(s.data)}</span>
      </div>
      <div className="sug-ev-corpo">
        <span className="sug-ev-nome">{s.nome}</span>
        <span className="sug-ev-meta">
          <span className="sr-only">{ddmm(s.data)} · </span>
          {s.cidade ?? "Cidade não informada"}
          {" · "}
          {total === 0 ? "sem patrocinadores no Ummense" : `${total} patrocinador${total === 1 ? "" : "es"}`}
          {semCadastro > 0 && (
            <span className="sug-ev-meta-alerta" data-testid={`sem-cadastro-${s.id}`}>
              {" "}({semCadastro} sem cadastro)
            </span>
          )}
          {s.dataNaoConfirmada && <span className="sug-ev-selo">Data não confirmada</span>}
        </span>
        {existe && (
          <span className="sug-ev-aviso" data-testid={`pode-existir-${s.id}`}>
            <AlertTriangle aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0, marginTop: 2 }} />
            <span>
              Pode já existir:{" "}
              {existe.arquivado ? (
                <strong>{existe.nome} (arquivado)</strong>
              ) : (
                <Link href={`/eventos/${existe.id}`} onClick={onAbrirEvento} className="sug-ev-aviso-link" data-testid={`link-pode-existir-${s.id}`}>
                  {existe.nome}
                </Link>
              )}
              <span className="sug-ev-aviso-motivo"> — {existe.motivo}</span>
            </span>
          </span>
        )}
      </div>
      <div className="sug-ev-acoes">
        {/* Secundário forte, não primário: numa lista de dezenas de linhas, um
            botão preto por linha vira uma coluna de tinta (lib Botao: primário
            é UM por bloco). */}
        <Botao variante="secundarioForte" tamanho={isMobile ? "toque" : "sm"} icone={Plus} onClick={onCriar} data-testid={`criar-sugestao-${s.id}`} aria-label={`Criar evento: ${s.nome}`}>
          Criar evento
        </Botao>
        <Botao variante="fantasma" tamanho={isMobile ? "toque" : "sm"} icone={EyeOff} onClick={onIgnorar} data-testid={`ignorar-sugestao-${s.id}`} aria-label={`Ignorar: ${s.nome}`}>
          Ignorar
        </Botao>
      </div>
    </li>
  );
}

