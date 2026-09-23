// ─── Os estados da lista que não são a lista: carga e vazio ─────────────────
import { Search } from "lucide-react";
import type { Sponsor } from "@shared/schema";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/estados";
import { getStatusLabel } from "@/lib/status";
import type { ChipOcultas } from "@/lib/painel-encerrados";
import { FW, T, N } from "@/lib/theme";
import { DATE_FILTER_LABELS, FOCO_LABELS } from "./regras";
import type { FiltrosDoPainel } from "./use-filtros-do-painel";

export function EsqueletoDaLista() {
  // O SKELETON TEM DE SER O RETRATO DA TABELA QUE VAI CHEGAR.
  //
  // A ideia estava certa — silhueta em vez de spinner central, que
  // causava layout shift —, mas o retrato ficou desatualizado. Ele
  // desenhava uma FAIXA PRETA de 40px porque o cabeçalho da tabela
  // era escuro; o cabeçalho virou claro (#fafaf9 com texto #57534e)
  // numa passada anterior e ninguém voltou aqui. Resultado: durante o
  // carregamento a tela mostrava uma tarja preta larga — que ainda por
  // cima lê como erro ou censura — e ela sumia quando os dados
  // chegavam. Um piscar de um design que não existe mais.
  //
  // Os outros dois números também haviam se soltado do real, medidos
  // no DOM: a linha da tabela tem 63px e o skeleton fazia ~38; a zebra
  // é #f6f4f1 e o skeleton usava #fafaf9. Skeleton que não bate com o
  // conteúdo entrega justamente o layout shift que ele existe para
  // evitar.
  //
  // Os valores abaixo são os MEDIDOS da tabela real: thead 44px em
  // #fafaf9 com filete #e7e5e4, linha 63px, zebra #ffffff/#f6f4f1.
  return (
    <div style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }} aria-busy="true" aria-label="Carregando peças">
      <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="animate-pulse" style={{ width: 180, height: 16, borderRadius: 4, backgroundColor: T.border }} />
        <div className="animate-pulse" style={{ width: 70, height: 20, borderRadius: 999, backgroundColor: N.n2 }} />
      </div>
      <div style={{ height: 44, backgroundColor: T.bg, borderBottom: `1px solid ${T.border}` }} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 24, height: 63, boxSizing: "border-box", padding: "0 16px", backgroundColor: i % 2 ? N.n2 : T.surface }}>
          <div className="animate-pulse" style={{ width: 48, height: 12, borderRadius: 4, backgroundColor: T.border }} />
          <div className="animate-pulse" style={{ width: `${34 - i * 3}%`, height: 12, borderRadius: 4, backgroundColor: T.border }} />
          <div className="animate-pulse" style={{ width: 60, height: 12, borderRadius: 4, backgroundColor: N.n3, marginLeft: "auto" }} />
          <div className="animate-pulse" style={{ width: 90, height: 22, borderRadius: 999, backgroundColor: N.n3 }} />
        </div>
      ))}
    </div>
  );
}

export function VazioDaLista({ filtros, chipOcultasDados, nomeDoEvento, sponsors }: {
  filtros: FiltrosDoPainel;
  chipOcultasDados: ChipOcultas | null;
  nomeDoEvento: (id: string) => string | undefined;
  sponsors: Sponsor[];
}) {
  const {
    hasActiveFilters, activeFilterCount, clearAllFilters, mostrarFinalizados, setMostrarFinalizados,
    searchTerm, eventFilter, typeFilter, sponsorFilter, statusFilter, dateFilter, focoFilter,
  } = filtros;
  // Empty state com contexto e ação: diz POR QUE está vazio (filtros
  // ativos vs sistema sem peças) e oferece o caminho de volta ali
  // mesmo. Suprimido quando um banner da visão Excluídos já explicou o
  // motivo — antes os dois apareciam empilhados, e o segundo (maior e
  // com botão) contava uma história falsa.
  // Três motivos, três respostas. O terceiro é o que evita a pior
  // leitura desta feature: lista vazia com peças ocultas por trás lida
  // como "não existe" quando o certo é "não está aqui, e está a um
  // clique".
  return (
    <EstadoVazio
      icone={Search}
      titulo={hasActiveFilters ? "Nenhuma peça encontrada"
        : chipOcultasDados && !mostrarFinalizados ? "Só sobrou o que já acabou"
        : "Nenhuma peça cadastrada ainda"}
      descricao={
        /* "FILTREI — POR QUE SUMIU TUDO?" A frase antiga mandava
           ajustar sem dizer O QUÊ: os filtros ativos são nomeados
           aqui (os mesmos rótulos dos chips acima), a busca diz onde
           procura, e as peças ocultas ganham a sua própria saída —
           com filtro ligado elas também podem ser a resposta. */
        hasActiveFilters
          ? <>
              Nenhuma peça corresponde a {activeFilterCount === 1 ? "este filtro" : `estes ${activeFilterCount} filtros`}:{" "}
              <strong style={{ color: T.strong, fontWeight: FW.medio }}>
                {[
                  searchTerm && `busca "${searchTerm}"`,
                  ...eventFilter.map(id => `evento ${nomeDoEvento(id) ?? ""}`.trim()),
                  ...typeFilter.map(t => `tipo ${t}`),
                  ...sponsorFilter.map(id => `patrocinador ${sponsors.find(s => s.id === id)?.name ?? ""}`.trim()),
                  ...statusFilter.map(s => `status ${s === "deleted" ? "Excluídos" : getStatusLabel(s)}`),
                  ...dateFilter.map(d => `saída ${(DATE_FILTER_LABELS[d] ?? d).toLowerCase()}`),
                  ...focoFilter.map(f => `foco ${(FOCO_LABELS[f] ?? f).toLowerCase()}`),
                ].filter(Boolean).join(" · ")}
              </strong>.
              {searchTerm ? " A busca procura no código da peça, no nome do evento, no tipo, na descrição e no patrocinador." : ""}
              {chipOcultasDados && !mostrarFinalizados ? ` ${chipOcultasDados.total} ${chipOcultasDados.total === 1 ? "peça de evento encerrado ou realizado está oculta" : "peças de evento encerrado ou realizado estão ocultas"} e podem ser o que você procura.` : ""}
            </>
          : chipOcultasDados && !mostrarFinalizados
            ? `${chipOcultasDados.total} ${chipOcultasDados.total === 1 ? "peça está fora" : "peças estão fora"} da lista porque o evento delas foi encerrado ou já foi realizado.`
            : "As peças aparecem aqui quando forem adicionadas a um evento."
      }
      acao={hasActiveFilters ? (
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
          <Botao variante="primario" onClick={clearAllFilters}>
            Limpar filtros
          </Botao>
          {chipOcultasDados && !mostrarFinalizados && (
            /* Secundário: é a saída de apoio. Mesmo estado do chip da
               faixa de atenção — revela sem mexer nos filtros. */
            <Botao
              variante="secundario"
              onClick={() => setMostrarFinalizados(true)}
              data-testid="button-incluir-ocultas-vazio"
            >
              Procurar também nas {chipOcultasDados.total} ocultas
            </Botao>
          )}
        </div>
      ) : chipOcultasDados && !mostrarFinalizados ? (
        <Botao
          variante="primario"
          onClick={() => setMostrarFinalizados(true)}
          data-testid="button-mostrar-ocultas-vazio"
        >
          Mostrar as {chipOcultasDados.total} {chipOcultasDados.total === 1 ? "peça oculta" : "peças ocultas"}
        </Botao>
      ) : undefined}
    />
  );
}
