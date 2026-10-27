// ANÁLISES › STATUS POR EVENTO — um evento por vez: datas, situação,
// o alerta das fases vencidas, as fases com prazo e pendências, as peças por
// fase e a lista de peças. Abre pelo seletor ou pelo clique no evento das
// outras abas.
//
// PEÇAS SEM APROVAÇÃO (Pedro/dono, 26/10): a fase mostra o prazo que vale (o
// Layout ajustado quando só restam peças sem aprovação — `prazoEfetivo`); o
// subestado "Layout — Aguardando arte do cliente" (RF07) vem contado em
// "Peças por fase"; a lista traz os selos e o "Layout normal → ajustado".
import * as React from "react";
import { AlertTriangle, ArrowRight, Calendar, CalendarClock, CheckCircle2, Clock, Hourglass } from "lucide-react";
import {
  FASE_ENTREGUE, FASES_DO_PAINEL, eventoPadrao, pecasPorFase, rotuloDaEtapaNoPainel,
  type FaseDoEvento, type PecaDaLinha,
} from "@shared/painel-operacional";
import { FilterSelect } from "@/components/filter-select";
import { BotaoLink } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/estados";
import { T, TOM, FS, FW, R, FONT } from "@/lib/theme";
import { COR_DO_ATRASO_DO_CLIENTE } from "@/components/selo-sem-aprovacao";
import { urlPecaNoEvento } from "@/components/prazos/tokens";
import { SecaoDaAnalise, TabelaCompacta, idDaPeca } from "../blocos";
import { AtrasoDaLinha, BarrasEmpilhadas, COR, PrazoDaLinha, SeloDaSituacao, StatusDaLinha, dm, dma, fmt0, fmt1 } from "../comum";
import { SUBESTADO_AGUARDANDO_ARTE } from "@shared/prazo-sem-aprovacao";
import type { ContextoDoPainel } from "../contexto";

export default function AbaEvento({ ctx, trocarEvento }: { ctx: ContextoDoPainel; trocarEvento: (chave: string | null) => void }) {
  const { painel, isMobile, eventoAberto } = ctx;
  const eventos = React.useMemo(() => [...painel.eventos].sort((a, b) => a.dataEvento.localeCompare(b.dataEvento)), [painel.eventos]);
  const chave = eventoAberto && eventos.some((e) => e.chave === eventoAberto) ? eventoAberto : eventoPadrao(eventos);
  const ev = eventos.find((e) => e.chave === chave) ?? null;
  const pecas = React.useMemo(() => (ev ? painel.pecas.filter((p) => p.evento === ev.chave) : []), [painel.pecas, ev]);
  const porFase = React.useMemo(() => (ev ? pecasPorFase(painel.pecas, ev.chave) : []), [painel.pecas, ev]);
  // RF07: o subestado do Layout — as do evento que esperam a arte do cliente.
  const aguardandoArte = pecas.filter((p) => p.aguardandoArteCliente && p.fase < FASE_ENTREGUE);
  const aguardandoComAtraso = aguardandoArte.filter((p) => p.atrasoDoCliente).length;

  if (!ev) {
    return <EstadoVazio icone={Calendar} titulo="Nenhum evento ativo" descricao="Quando houver evento na Gestão de Prazos, o status dele aparece aqui." testId="op-evento-vazio" />;
  }

  const vencidas = ev.fases.filter((f) => f.situacao === "Atrasada");
  const proximas = ev.fases.filter((f) => f.situacao === "Vence em breve");
  const diasAtras = (prazo: string) => Math.round((Date.parse(painel.hoje) - Date.parse(prazo)) / 86_400_000);
  const fato = (rotulo: string, valor: React.ReactNode, testId: string, perigo = false) => (
    <div data-testid={testId} style={{ minWidth: 0 }}>
      <div style={{ fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.1em", textTransform: "uppercase", color: T.second }}>{rotulo}</div>
      <div style={{ marginTop: 4, fontFamily: FONT.display, fontSize: FS.h2, fontWeight: FW.forte, color: perigo ? TOM.perigo.text : T.text, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{valor}</div>
    </div>
  );

  return (
    <div data-testid="aba-painel-evento" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="pop-controles" style={{ backgroundColor: T.low, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: "10px 14px" }}>
        <FilterSelect
          showAllLabelWhenEmpty hideWhenEmpty={false} hideClear
          label="Evento" icon={Calendar} activeAppearance="tint"
          value={ev.chave}
          onChange={(v) => { if (v && v !== "all") trocarEvento(v); }}
          options={eventos.map((e) => ({ value: e.chave, label: `${e.nome} · ${dm(e.dataEvento)}` }))}
          searchPlaceholder="Buscar evento…" emptyText="Nenhum evento encontrado."
          testId="op-evento-seletor" fullWidth={isMobile} panelWidth={isMobile ? undefined : 380} triggerStyle={isMobile ? undefined : { minWidth: 280 }}
        />
      </div>

      <section aria-labelledby="h-op-ev-fatos" className="pop-fatos" data-testid="op-evento-fatos"
        style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: isMobile ? "16px 14px" : "18px 22px" }}>
        <h2 id="h-op-ev-fatos" style={{ margin: "0 0 14px", fontFamily: FONT.display, fontSize: FS.title, fontWeight: FW.forte, color: T.text, letterSpacing: "-0.02em", overflowWrap: "anywhere" }}>{ev.nome}</h2>
        <div className="pop-fatos-grade">
          {fato("Data do evento", dma(ev.dataEvento), "op-fato-data")}
          {fato("Saída do caminhão", dma(ev.saidaCaminhao), "op-fato-saida")}
          {fato("Situação", <SeloDaSituacao situacao={ev.situacao} />, "op-fato-situacao")}
          {fato("Peças", fmt0(ev.totalPecas), "op-fato-pecas")}
          {fato("Entregues", fmt0(ev.entregues), "op-fato-entregues")}
          {fato("Peças em atraso", fmt0(ev.pecasEmAtraso), "op-fato-atraso", ev.pecasEmAtraso > 0)}
        </div>
      </section>

      <div
        role="status"
        data-testid="op-evento-alerta"
        style={{
          display: "flex", gap: 10, alignItems: "flex-start", borderRadius: R.lg, padding: "12px 16px",
          backgroundColor: vencidas.length ? TOM.perigo.bg : proximas.length ? TOM.alerta.bg : TOM.sucesso.bg,
          border: `1px solid ${vencidas.length ? TOM.perigo.border : proximas.length ? TOM.alerta.border : TOM.sucesso.border}`,
        }}
      >
        {vencidas.length
          ? <AlertTriangle aria-hidden="true" style={{ width: 16, height: 16, color: TOM.perigo.text, flexShrink: 0, marginTop: 2 }} />
          : proximas.length
            ? <Clock aria-hidden="true" style={{ width: 16, height: 16, color: TOM.alerta.text, flexShrink: 0, marginTop: 2 }} />
            : <CheckCircle2 aria-hidden="true" style={{ width: 16, height: 16, color: TOM.sucesso.text, flexShrink: 0, marginTop: 2 }} />}
        <div style={{ minWidth: 0 }}>
          <strong style={{ fontSize: FS.read, color: vencidas.length ? TOM.perigo.text : proximas.length ? TOM.alerta.text : TOM.sucesso.text }}>
            {vencidas.length
              ? `${vencidas.length} ${vencidas.length > 1 ? "fases atrasadas" : "fase atrasada"}`
              : proximas.length ? "Nenhuma fase atrasada — atenção aos prazos próximos" : "Nenhuma fase atrasada"}
          </strong>
          {(vencidas.length > 0 || proximas.length > 0) && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: FS.body, lineHeight: 1.6 }}>
              {vencidas.map((f) => (
                <li key={f.ordem} style={{ color: TOM.perigo.text }}>
                  <strong>{f.etapa}</strong>: venceu em {dma(f.prazoEfetivo)}{f.prazoEfetivo !== f.prazo ? " (prazo ajustado)" : ""} ({diasAtras(f.prazoEfetivo)} {diasAtras(f.prazoEfetivo) === 1 ? "dia" : "dias"}) · {fmt0(f.pendentes)} {f.pendentes === 1 ? "peça pendente" : "peças pendentes"}
                </li>
              ))}
              {proximas.map((f) => (
                <li key={f.ordem} style={{ color: TOM.alerta.text }}>
                  <strong>{f.etapa}</strong>: {f.prazoEfetivo === painel.hoje ? "vence hoje" : `vence em ${dma(f.prazoEfetivo)}`}{f.prazoEfetivo !== f.prazo ? " (prazo ajustado)" : ""} · {fmt0(f.pendentes)} {f.pendentes === 1 ? "peça pendente" : "peças pendentes"}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="pop-grade-2">
        <SecaoDaAnalise id="h-op-ev-fases" testId="op-evento-fases" titulo="Fases e prazos" descricao="Prazo de cada fase do evento e quantas peças ainda estão nela ou antes dela.">
          <TabelaCompacta<FaseDoEvento>
            testId="op-tabela-fases"
            legenda="Fases do evento com prazo, peças pendentes e situação"
            linhas={ev.fases}
            chave={(f) => String(f.ordem)}
            limite={6}
            minLargura={0}
            larguraDaPrimeira={isMobile ? 120 : 150}
            encolherAoTransbordar={false}
            ordemInicial={{ coluna: "prazo", direcao: "asc" }}
            colunas={[
              // No celular a situação vem sob o nome da fase: a 4ª coluna não cabia em 390px.
              { id: "fase", rotulo: "Fase", valor: (f) => f.etapa,
                render: (f) => (isMobile
                  ? <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>{f.etapa}<SeloDaSituacao situacao={f.situacao} /></span>
                  : f.etapa) },
              { id: "prazo", rotulo: "Prazo", ordenavel: true, valor: (f) => f.prazoEfetivo,
                render: (f) => {
                  const data = isMobile ? dm(f.prazoEfetivo) : dma(f.prazoEfetivo);
                  if (f.prazoEfetivo === f.prazo) return data;
                  // Só restam peças sem aprovação nesta fase: vale o Layout ajustado.
                  return (
                    <span
                      data-testid={`op-fase-prazo-ajustado-${f.ordem}`}
                      title={`Prazo do evento ${dm(f.prazo)} — só há peças sem aprovação nesta fase (Layout + dias da Aprovação, corridos).`}
                      style={{ display: "flex", flexDirection: "column", gap: 2 }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {data}<CalendarClock aria-hidden="true" style={{ width: 12, height: 12, color: TOM.turquesa.text, flexShrink: 0 }} />
                      </span>
                      <span style={{ fontSize: FS.meta, color: T.second, whiteSpace: "nowrap" }}>ajustado · evento {dm(f.prazo)}</span>
                    </span>
                  );
                } },
              { id: "pendentes", rotulo: "Pendentes", titulo: "Peças nesta fase ou em fase anterior", alinhar: "direita", ordenavel: true, valor: (f) => f.pendentes },
              { id: "situacao", rotulo: "Situação", ordenavel: true, ocultarNoCelular: true, valor: (f) => f.situacao, render: (f) => <SeloDaSituacao situacao={f.situacao} /> },
            ]}
          />
        </SecaoDaAnalise>
        <SecaoDaAnalise id="h-op-ev-porfase" testId="op-evento-porfase" titulo="Peças por fase" descricao="Em vermelho, as que passaram do prazo da fase.">
          <BarrasEmpilhadas
            testId="op-barras-fase"
            legenda="Peças do evento por fase"
            linhas={porFase.map((r) => ({ id: String(r.fase), rotulo: r.rotulo, partes: { noPrazo: r.noPrazo, atrasadas: r.atrasadas, entregues: r.entregues } }))}
            series={[
              { chave: "noPrazo", nome: "No prazo", cor: COR.prazo },
              { chave: "atrasadas", nome: "Atrasadas", cor: COR.atrasado },
              { chave: "entregues", nome: "Entregues", cor: COR.neutro },
            ]}
            formato={fmt0}
            vazio="Evento sem peças cadastradas."
          />
          {aguardandoArte.length > 0 && (
            <p
              data-testid="op-evento-aguardando-arte"
              style={{
                display: "flex", alignItems: "flex-start", gap: 8, margin: "12px 0 0", padding: "8px 10px", borderRadius: R.md,
                backgroundColor: TOM.turquesa.bg, border: `1px solid ${TOM.turquesa.border}`, fontSize: FS.body, color: T.text, lineHeight: 1.5,
              }}
            >
              <Hourglass aria-hidden="true" style={{ width: 14, height: 14, color: TOM.turquesa.text, flexShrink: 0, marginTop: 3 }} />
              <span>
                <strong>{SUBESTADO_AGUARDANDO_ARTE}:</strong>{" "}
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt0(aguardandoArte.length)}</span> {aguardandoArte.length === 1 ? "peça" : "peças"}
                {aguardandoComAtraso > 0 && (
                  <span style={{ color: COR_DO_ATRASO_DO_CLIENTE.text, fontWeight: FW.medio }}> · {fmt0(aguardandoComAtraso)} com atraso do cliente</span>
                )}
                <span style={{ color: T.second }}> — contam na fase de Layout; esperam o arquivo do cliente.</span>
              </span>
            </p>
          )}
        </SecaoDaAnalise>
      </div>

      <SecaoDaAnalise id="h-op-ev-pecas" testId="op-evento-pecas" titulo="Peças do evento" descricao={`${fmt0(pecas.length)} ${pecas.length === 1 ? "peça" : "peças"}. m² = área × unidades a imprimir (sem reuso).`}>
        <TabelaCompacta<PecaDaLinha>
          testId="op-tabela-evento-pecas"
          larguraDaPrimeira={84}
          encolherAoTransbordar={false}
          legenda="Peças do evento"
          linhas={pecas}
          chave={(p) => p.id}
          limite={20}
          minLargura={1000}
          alturaMaxima={620}
          ordemInicial={{ coluna: "atraso", direcao: "desc" }}
          vazio="Evento sem peças cadastradas."
          colunas={[
            { id: "peca", rotulo: "Peça", ordenavel: true, valor: (p) => p.displayId,
              render: (p) => (
                <BotaoLink href={urlPecaNoEvento(p.eventoId, p.id)} variante="fantasma" tamanho="sm" aria-label={`Abrir a peça ${idDaPeca(p)}`} style={{ fontFamily: FONT.mono, paddingLeft: 4, paddingRight: 4 }}>
                  {idDaPeca(p)}<ArrowRight aria-hidden="true" style={{ width: 11, height: 11 }} />
                </BotaoLink>
              ) },
            { id: "tipo", rotulo: "Tipo", ordenavel: true, ocultarNoCelular: true, valor: (p) => p.tipo || null },
            { id: "descricao", rotulo: "Descrição", ordenavel: true, valor: (p) => p.descricao || null,
              render: (p) => <span className="pop-texto-longo" title={p.descricao} style={{ fontSize: FS.body }}>{p.descricao || "—"}</span> },
            { id: "medida", rotulo: "Medida", ordenavel: true, ocultarNoCelular: true, valor: (p) => p.medida || null },
            { id: "qtd", rotulo: "Qtd", alinhar: "direita", ordenavel: true, valor: (p) => p.quantidade },
            { id: "m2", rotulo: "m²", alinhar: "direita", ordenavel: true, ocultarNoCelular: true, valor: (p) => p.m2, render: (p) => fmt1(p.m2) },
            { id: "status", rotulo: "Status", ordenavel: true, valor: (p) => rotuloDaEtapaNoPainel(p.etapa), render: (p) => <StatusDaLinha p={p} /> },
            { id: "fase", rotulo: "Fase", ordenavel: true, ocultarNoCelular: true, valor: (p) => FASES_DO_PAINEL[p.fase] ?? "—" },
            { id: "prazo", rotulo: "Prazo da fase", ordenavel: true, ocultarNoCelular: true, valor: (p) => (p.fase === FASE_ENTREGUE ? null : p.prazoFase),
              render: (p) => <PrazoDaLinha p={p} entregue={p.fase === FASE_ENTREGUE} /> },
            { id: "atraso", rotulo: "Atraso (dias)", alinhar: "direita", ordenavel: true, valor: (p) => p.diasAtraso, render: (p) => <AtrasoDaLinha p={p} /> },
          ]}
        />
      </SecaoDaAnalise>
    </div>
  );
}
