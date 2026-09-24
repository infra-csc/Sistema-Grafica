// ── A BARRA DE FILTROS DA FILA ───────────────────────────────────────────────
// DESKTOP: a faixa horizontal de sempre — os selects são um map sobre
// SELECTS_PRINCIPAIS apenas para o celular reutilizar EXATAMENTE os mesmos
// campos (uma lista, duas apresentações; JSX duplicado foi a dívida que esta
// base já pagou cara demais).
// CELULAR: a pilha de sete gatilhos empurrava a fila para fora da dobra — o
// operador rolava uma tela de filtros antes de ver a primeira peça. Vira busca
// + "Filtros (N)", que abre uma FOLHA em tela cheia com os mesmos campos
// empilhados, de dedo (100dvh: o 100vh clássico esconde o rodapé atrás da
// barra do navegador). Nada some: mesmo vocabulário, mesmos testids, mesma URL.
import { Fragment } from "react";
import type React from "react";
import { Filter, ChevronDown, Search, Truck, Lock, X } from "lucide-react";
import { FilterSelect, ShortcutPill } from "@/components/filter-select";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { Botao } from "@/components/ui/botao";
import { FONT, FS, FW, R, T } from "@/lib/theme";
import { alvo as alvoDeToque } from "@/hooks/use-mobile";
import type { FilaDaGrafica } from "@/components/grafica/hooks/use-fila-da-grafica";

export function BarraDeFiltros({ fila, isMobile, usaCards, ponteiroGrosso, showAdvancedFilters, setShowAdvancedFilters, filtrosAbertos, setFiltrosAbertos, folhaFiltrosRef }: {
  fila: FilaDaGrafica;
  isMobile: boolean;
  usaCards: boolean;
  ponteiroGrosso: boolean;
  showAdvancedFilters: boolean;
  setShowAdvancedFilters: React.Dispatch<React.SetStateAction<boolean>>;
  /** A folha de filtros do CELULAR. */
  filtrosAbertos: boolean;
  setFiltrosAbertos: (aberto: boolean) => void;
  /** A folha acompanha o teclado virtual (area-visivel.ts) — o hook mora na página. */
  folhaFiltrosRef: React.RefObject<HTMLDivElement>;
}) {
  const {
    filtros, patchFiltros, buscaInput, setBuscaInput, filteredItems, nTravadas, comReusoNaLista,
    statusFilterOptions, impressoraFilterOptions, groupFilterOptions, percursoFilterOptions, mesFilterOptions,
    typeFilterOptions, materialFilterOptions, finishFilterOptions, eventFilterOptions,
    haFiltro, nFiltros, nFiltrosNaFolha, descricaoFiltros, limparFiltros,
  } = fila;
  // O gatilho usa a pele PADRÃO do FilterSelect. O override antigo
  // (fundo #e8e8e7, sem borda, cor fixa) vinha DEPOIS do estilo calculado
  // e apagava o tint de "filtro ativo": com Grupo escolhido o campo ficava
  // idêntico a um vazio — e o de Evento, que nunca recebeu o override,
  // era o único branco da fileira.
  const trigger: React.CSSProperties = {};
  const SELECTS_PRINCIPAIS = [
    // O reaproveitamento mora DENTRO do menu de Status (pedido do dono,
    // 25/08 — o chip solto ficava longe de onde se filtra). "reuso" é um
    // valor sintético: entra e sai do boolean, nunca do array de status.
    { label: "Status", allLabel: "Todos os status",
      values: filtros.reaproveitamento ? [...filtros.status, "reuso"] : filtros.status,
      set: (v: string[]) => patchFiltros({ status: v.filter((x) => x !== "reuso"), reaproveitamento: v.includes("reuso") }),
      options: comReusoNaLista > 0 || filtros.reaproveitamento
        ? [...statusFilterOptions, { value: "reuso", label: "♻ Com reaproveitamento", count: comReusoNaLista, pinned: true }]
        : statusFilterOptions,
      testId: "select-status-filter", sempre: true, busca: "Buscar status...", vazio: "Nenhum status nesta fila." },
    // Só aparece quando há peça com impressora no recorte (`sempre: false`):
    // numa fila sem nada em impressão o campo seria um menu vazio.
    { label: "Impressora", allLabel: "Todas as impressoras", values: filtros.impressora, set: (v: string[]) => patchFiltros({ impressora: v }), options: impressoraFilterOptions, testId: "select-impressora-filter", sempre: false, busca: "Buscar impressora...", vazio: "Nenhuma peça com impressora nesta fila." },
    { label: "Grupo", allLabel: "Todos os grupos", values: filtros.grupo, set: (v: string[]) => patchFiltros({ grupo: v }), options: groupFilterOptions, testId: "select-group-filter", sempre: false, busca: "Buscar grupo...", vazio: "Nenhum grupo encontrado." },
    { label: "Percurso", allLabel: "Todos os percursos", values: filtros.percurso, set: (v: string[]) => patchFiltros({ percurso: v }), options: percursoFilterOptions, testId: "select-percurso-filter", sempre: false, busca: "Buscar percurso...", vazio: "Nenhum percurso encontrado." },
    { label: "Mês", allLabel: "Todos os meses", values: filtros.mes, set: (v: string[]) => patchFiltros({ mes: v }), options: mesFilterOptions, testId: "select-month-filter", sempre: true, busca: "Buscar mês...", vazio: "Nenhuma saída de caminhão nesta fila." },
  ];
  const AVANCADOS = [
    { label: "Tipo", allLabel: "Todos os tipos", values: filtros.tipo, set: (v: string[]) => patchFiltros({ tipo: v }), options: typeFilterOptions, testId: "select-type-filter" },
    { label: "Material", allLabel: "Todos os materiais", values: filtros.material, set: (v: string[]) => patchFiltros({ material: v }), options: materialFilterOptions, testId: "select-material-filter" },
    { label: "Acabamento", allLabel: "Todos os acabamentos", values: filtros.acabamento, set: (v: string[]) => patchFiltros({ acabamento: v }), options: finishFilterOptions, testId: "select-finish-filter" },
  ];
  // O QUE CADA FILTRO RECORTA — "Grupo" e "Percurso" não se explicam
  // sozinhos (um vem do catálogo de Modelos, o outro do TEXTO da peça).
  // Na folha do celular, onde há largura de sobra, a frase fica embaixo
  // do campo; na barra do desktop o espaço é da fileira de campos.
  const DICA_DO_FILTRO: Record<string, string> = {
    Status: "Etapa da peça na fila; também filtra “♻ com reaproveitamento”.",
    Impressora: "Máquina em que a peça começou a imprimir; também as que estão imprimindo ou reservadas nela (o cartão de Máquinas); “Sem impressora” é a peça em impressão sem máquina informada.",
    Grupo: "Grupo do catálogo de Modelos (ex.: placas de 5KM × 10KM).",
    Percurso: "Distância escrita na peça (5k, 10k…).",
    "Mês": "Mês da saída do caminhão do evento.",
  };
  const selects = (fullWidth: boolean) => SELECTS_PRINCIPAIS.map(f => (
    <Fragment key={f.label}>
      <FilterSelect
        showAllLabelWhenEmpty hideWhenEmpty={f.sempre ? false : undefined}
        fullWidth={fullWidth}
        label={f.label} allLabel={f.allLabel}
        values={f.values} onValuesChange={f.set}
        options={f.options}
        searchPlaceholder={f.busca} emptyText={f.vazio}
        testId={f.testId}
        triggerStyle={trigger}
      />
      {fullWidth && (f.sempre || f.options.length > 0) && DICA_DO_FILTRO[f.label] && (
        <p style={{ margin: "-4px 0 2px", fontSize: 12, color: T.second, lineHeight: 1.4 }}>{DICA_DO_FILTRO[f.label]}</p>
      )}
    </Fragment>
  ));
  const avancados = (fullWidth: boolean) => AVANCADOS.map(f => (
    <FilterSelect
      key={f.label}
      fullWidth={fullWidth || undefined} showAllLabelWhenEmpty hideWhenEmpty={false}
      label={f.label} allLabel={f.allLabel}
      values={f.values} onValuesChange={f.set}
      options={f.options}
      searchPlaceholder={`Buscar ${f.label.toLowerCase()}...`}
      emptyText="Nada encontrado."
      testId={f.testId}
      triggerStyle={trigger}
    />
  ));
  // 280px de base: o placeholder cabia em 168px úteis e saía cortado
  // ("…ou eve"). No tablet (lista em cards) a busca ocupa a linha
  // inteira — senão "Mais filtros" quebrava sozinho para a linha de
  // baixo, o mesmo defeito que esta barra tinha no notebook.
  const campoBusca = (
    <div style={{ position: "relative", flex: isMobile ? "1 1 auto" : usaCards ? "1 1 100%" : "1 1 280px", minWidth: isMobile ? 0 : usaCards ? 0 : 280 }}>
      {/* #78716c em vez de T.muted (#a8a29e): 2,06:1 sobre o fundo
          #e8e8e7 do input reprovava o mínimo de 3:1 de elemento não
          textual. E a borda de 1px devolve ao campo a cara de campo. */}
      <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: T.second }} />
      <input
        type="text"
        // No celular a busca divide a linha com "Filtros": o texto longo
        // saía cortado no meio ("Buscar por ID, descr").
        placeholder={isMobile ? "Código, peça ou evento" : "Buscar por ID, descrição ou evento"}
        aria-label="Buscar peças"
        value={buscaInput}
        onChange={e => setBuscaInput(e.target.value)}
        data-testid="input-search-filter"
        style={{ width: "100%", height: isMobile ? 44 : 36, paddingLeft: 32, paddingRight: 12, backgroundColor: T.surface, border: `1px solid ${T.bdark}`, borderRadius: 8, fontSize: isMobile ? 16 : 13, color: T.text, boxSizing: "border-box" }}
        onFocus={e => { e.currentTarget.style.borderColor = T.accentText; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(194,65,12,0.18)"; }}
        onBlur={e => { e.currentTarget.style.borderColor = T.bdark; e.currentTarget.style.boxShadow = "none"; }}
      />
    </div>
  );
  // "Travadas (N)" (21/09): só aparece quando há peça travada (ou o filtro está ligado).
  const pillTravadas = (nTravadas > 0 || filtros.travadas) ? (
    <ShortcutPill
      label={`Travadas (${nTravadas})`}
      icon={Lock}
      active={filtros.travadas}
      onClick={() => patchFiltros({ travadas: !filtros.travadas })}
      testId="button-travadas-filter"
      title="Só as peças travadas pela Solicitação — com o motivo e quem travou"
    />
  ) : null;
  const pillProximos = (
    <ShortcutPill
      label="Próximos 10 dias"
      icon={Truck}
      active={filtros.proximos10}
      onClick={() => patchFiltros({ proximos10: !filtros.proximos10 })}
      testId="button-next-10-days-filter"
      title="Só peças de evento cujo caminhão sai nos próximos 10 dias"
    />
  );
  // "N filtros ativos · Limpar": a contagem é TEXTO (o que está valendo) e
  // o botão é só o verbo. Antes era um pill vermelho "Limpar tudo (3)" —
  // vermelho é cor de perigo, e limpar filtro não destrói nada.
  const botaoLimpar = haFiltro && (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: isMobile ? 0 : "auto", fontSize: FS.meta, color: T.second, whiteSpace: "nowrap" }}>
      {!isMobile && (
        <span data-testid="texto-filtros-ativos" title={descricaoFiltros.join(" · ")}>
          <strong style={{ color: T.text, fontVariantNumeric: "tabular-nums" }}>{nFiltros}</strong> filtro{nFiltros !== 1 ? "s" : ""} ativo{nFiltros !== 1 ? "s" : ""}
          <span aria-hidden="true"> ·</span>
        </span>
      )}
      <Botao
        variante={isMobile ? "secundario" : "fantasma"}
        tamanho={isMobile || ponteiroGrosso ? "toque" : "sm"}
        icone={isMobile ? X : undefined}
        onClick={limparFiltros}
        data-testid="button-limpar-filtros"
        aria-label={`Limpar ${nFiltros} filtro${nFiltros !== 1 ? "s" : ""}: ${descricaoFiltros.join(" · ")}`}
        title={`Limpar: ${descricaoFiltros.join(" · ")}`}
        style={isMobile ? undefined : { color: T.text, textDecoration: "underline", textUnderlineOffset: 3 }}
      >
        Limpar
      </Botao>
    </span>
  );

  // Quantos filtros AVANÇADOS estão valendo — o botão que os abre diz o
  // número, senão um recorte por Material fica invisível com a gaveta fechada.
  const nAvancados = [filtros.tipo, filtros.material, filtros.acabamento].filter(v => v.length > 0).length;
  // DUAS LINHAS DE PROPÓSITO, não por quebra: antes era uma fileira só
  // que estourava e deixava "Filtros" sozinho na segunda linha, com o
  // placeholder da busca cortado. Linha 1 = achar (busca + atalhos);
  // linha 2 = recortar (os selects) com o resumo "N filtros ativos ·
  // Limpar" encostado à direita, onde a pessoa termina de filtrar.
  if (!isMobile) return (
    <div style={{ backgroundColor: T.low, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {campoBusca}
        {pillProximos}
        {pillTravadas}
        <button
          type="button"
          onClick={() => setShowAdvancedFilters(v => !v)}
          data-testid="button-toggle-advanced-filters"
          aria-expanded={showAdvancedFilters}
          className="ds-botao"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: alvoDeToque(36, ponteiroGrosso), backgroundColor: showAdvancedFilters ? T.text : "transparent", color: showAdvancedFilters ? T.surface : T.apoio, border: `1px solid ${showAdvancedFilters ? T.text : T.bdark}`, borderRadius: R.pill, padding: "0 12px", fontSize: FS.meta, fontWeight: FW.medio, cursor: "pointer", whiteSpace: "nowrap" }}
        >
          <Filter aria-hidden="true" style={{ width: 13, height: 13 }} />
          Mais filtros
          {nAvancados > 0 && (
            <span style={{ fontSize: FS.small, fontWeight: FW.forte, padding: "1px 7px", borderRadius: R.pill, backgroundColor: showAdvancedFilters ? "rgba(255,255,255,0.2)" : T.border, color: showAdvancedFilters ? T.surface : T.apoio, fontVariantNumeric: "tabular-nums" }}>{nAvancados}</span>
          )}
          <ChevronDown aria-hidden="true" style={{ width: 12, height: 12, transform: showAdvancedFilters ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <EventFilterDropdown
          values={filtros.evento}
          onValuesChange={v => patchFiltros({ evento: v })}
          options={eventFilterOptions}
        />
        {selects(false)}
        {botaoLimpar}
      </div>
      {showAdvancedFilters && (
        <div style={{ width: "100%", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
          {avancados(true)}
          {(filtros.tipo.length > 0 || filtros.material.length > 0 || filtros.acabamento.length > 0) && (
            <div style={{ gridColumn: "1 / -1" }}>
              <Botao variante="fantasma" tamanho={ponteiroGrosso ? "toque" : "sm"} onClick={() => patchFiltros({ tipo: [], material: [], acabamento: [] })} data-testid="button-reset-advanced-filters">
                Limpar filtros avançados
              </Botao>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── CELULAR: busca sempre à mão + a folha de filtros ──
  // PRIMEIRA DOBRA: busca e "Filtros" dividem UMA linha, e a segunda
  // linha junta os atalhos (Próximos 10 dias, Limpar) com o gatilho do
  // guia. Antes eram busca / Filtros+atalhos / guia em cartão, dentro de
  // uma faixa cinza com 10px de respiro: ~170px até a lista, agora 96.
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {campoBusca}
          {/* Escuro quando há filtro na folha: o recorte ligado se vê
              sem abrir a folha. */}
          <Botao
            variante={nFiltrosNaFolha > 0 ? "primario" : "secundario"}
            tamanho="toque"
            icone={Filter}
            onClick={() => setFiltrosAbertos(true)}
            data-testid="button-abrir-filtros-mobile"
            aria-haspopup="dialog"
            style={{ flex: "0 0 auto", padding: "0 12px" }}
          >
            Filtros{nFiltrosNaFolha > 0 ? ` (${nFiltrosNaFolha})` : ""}
          </Botao>
        </div>
        {/* O EVENTO À VISTA (dono, 21/09: "filtro de eventos no mobile na tela
            inicial da Gráfica, sem precisar clicar em Filtros"). O MESMO
            componente, estado e URL da folha — só mudou de lugar: linha
            própria, largura total, logo abaixo da busca. O X limpa só o
            evento; o resto da folha fica como está. */}
        {/* UMA LINHA QUE ROLA PARA O LADO (revisão de celular, 24/09): evento
            e atalhos eram duas linhas — 52px a mais antes da primeira peça.
            A linha sangra até a borda da tela (margens negativas iguais ao
            respiro da página), então o chip cortado na borda direita diz
            "tem mais para o lado". O menu do evento abre em portal: a rolagem
            não o corta. */}
        <div data-testid="linha-atalhos-mobile" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "nowrap", overflowX: "auto", marginLeft: -12, marginRight: -12, paddingLeft: 12, paddingRight: 12, scrollbarWidth: "none", overscrollBehaviorX: "contain" }}>
          <div data-testid="filtro-evento-mobile" style={{ display: "flex", gap: 8, alignItems: "center", flex: "0 0 auto" }}>
            <EventFilterDropdown
              values={filtros.evento}
              onValuesChange={v => patchFiltros({ evento: v })}
              options={eventFilterOptions}
            />
            {filtros.evento.length > 0 && (
              <Botao tamanho="toque" icone={X} onClick={() => patchFiltros({ evento: [] })} data-testid="button-limpar-evento-mobile"
                aria-label="Limpar o filtro de evento" title="Limpar o filtro de evento"
                style={{ flex: "0 0 44px", width: 44, padding: 0 }} />
            )}
          </div>
          {/* "Próximos 10 dias" é o recorte do dia a dia do galpão (o
              caminhão que sai já): morava DENTRO da folha, a três toques
              (abrir, ligar, ver). Aqui fica a um. */}
          <span style={{ flex: "0 0 auto", display: "inline-flex" }}>{pillProximos}</span>
          {pillTravadas && <span style={{ flex: "0 0 auto", display: "inline-flex" }}>{pillTravadas}</span>}
          {botaoLimpar && <span style={{ flex: "0 0 auto", display: "inline-flex" }}>{botaoLimpar}</span>}
        </div>
      </div>

      {filtrosAbertos && (
        <div
          ref={folhaFiltrosRef}
          role="dialog"
          aria-modal="true"
          aria-label="Filtros da fila"
          data-testid="folha-filtros-mobile"
          style={{
            position: "fixed", inset: 0, zIndex: 90,
            height: "100dvh",
            backgroundColor: T.bg,
            display: "flex", flexDirection: "column",
            overscrollBehavior: "contain",
          }}
        >
          {/* Recorte seguro em cima (notch/ilha) e embaixo (home
              indicator), nos LONGOS — ver o rodapé. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: "calc(6px + env(safe-area-inset-top))", paddingBottom: 6, paddingLeft: 14, paddingRight: 6, borderBottom: `1px solid ${T.border}`, backgroundColor: T.surface }}>
            <Filter style={{ width: 16, height: 16, color: T.second }} />
            <span style={{ fontSize: FS.strong, fontWeight: FW.rotulo, fontFamily: FONT.display, color: T.text }}>
              Filtros{nFiltros > 0 ? ` · ${nFiltros} ativo${nFiltros !== 1 ? "s" : ""}` : ""}
            </span>
            <span style={{ flex: 1 }} />
            <Botao variante="fantasma" tamanho="toque" icone={X} onClick={() => setFiltrosAbertos(false)}
              aria-label="Fechar filtros" data-testid="button-fechar-filtros-mobile"
              style={{ width: 44, padding: 0 }} />
          </div>

          {/* Os MESMOS campos da barra, empilhados. A lista some ao vivo
              atrás da folha; o rodapé diz quantas sobraram. */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            {selects(true)}
            <p style={{ margin: "8px 0 0", fontSize: FS.meta, fontWeight: FW.forte, color: T.apoio }}>
              Avançados
            </p>
            {avancados(true)}
            {(filtros.tipo.length > 0 || filtros.material.length > 0 || filtros.acabamento.length > 0) && (
              <Botao variante="fantasma" tamanho="toque" onClick={() => patchFiltros({ tipo: [], material: [], acabamento: [] })} data-testid="button-reset-advanced-filters" style={{ alignSelf: "flex-start" }}>
                Limpar filtros avançados
              </Botao>
            )}
          </div>

          {/* LONGOS, não `padding: "10px 14px calc(…env())"`: o valor é o
              mesmo no navegador, e o atalho com env() some inteiro no
              parser do jsdom — o teste do celular não o enxergava. */}
          <div style={{ display: "flex", gap: 8, paddingTop: 10, paddingLeft: 14, paddingRight: 14, paddingBottom: "calc(10px + env(safe-area-inset-bottom))", borderTop: `1px solid ${T.border}`, backgroundColor: T.surface }}>
            {haFiltro && (
              <Botao tamanho="toque" onClick={limparFiltros} style={{ minHeight: 48 }}>
                Limpar ({nFiltros})
              </Botao>
            )}
            <Botao variante="primario" tamanho="toque" onClick={() => setFiltrosAbertos(false)} data-testid="button-aplicar-filtros-mobile" style={{ flex: 1, minHeight: 48 }}>
              Ver {filteredItems.length} peça{filteredItems.length !== 1 ? "s" : ""}
            </Botao>
          </div>
        </div>
      )}
    </>
  );
}
