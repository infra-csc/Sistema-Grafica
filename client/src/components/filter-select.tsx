/**
 * FilterSelect — componente de filtro padrão do app.
 * Suporta seleção simples (value/onChange) e múltipla (values/onValuesChange).
 * accent="orange" (padrão) ou "violet" para contextos com tema violeta.
 *
 * ── Contrastes calculados (WCAG 2.1, texto ≤13px exige 4,5:1) ──────────────
 * Três cores de texto deste menu reprovavam AA em TODAS as ~10 telas que o
 * usam; como são defeitos (e não estilo), a correção é global:
 *   contagem  #6B7280 sobre #F3F4F6 = 4,39:1 ✗  →  #57534e = 6,93:1 ✓
 *   grupo     #9CA3AF sobre #ffffff = 2,54:1 ✗  →  #78716c = 4,80:1 ✓
 *   vazio     #9CA3AF sobre #ffffff = 2,54:1 ✗  →  #78716c = 4,80:1 ✓
 * A linha "Todos" era uma barra sólida #F97316 com texto branco de 12px —
 * 2,90:1, o pior contraste da tela justamente no item mais neutro da lista.
 * Virou tint: #c2410c sobre #FFF7ED = 4,88:1 ✓ (violeta: #5B21B6 sobre
 * #F5F3FF = 8,19:1 ✓). E o "Limpar" do rodapé usava #F97316 como cor de
 * TEXTO, o que a régua da casa proíbe: agora é C.text (#c2410c sobre branco
 * = 5,18:1 ✓).
 */
import { useMemo, useState, useRef, useEffect, useLayoutEffect } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { normalizarBusca } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
  dotColor?: string;
  pinned?: boolean;
  group?: string;
}

interface FilterSelectProps {
  label: string;
  allLabel?: string;
  // ── Modo simples ─────────────────────────────────────────────────────
  value?: string;
  onChange?: (value: string) => void;
  // ── Modo múltiplo ────────────────────────────────────────────────────
  values?: string[];
  onValuesChange?: (values: string[]) => void;
  // ─────────────────────────────────────────────────────────────────────
  options: FilterOption[];
  searchPlaceholder?: string;
  emptyText?: string;
  hideWhenEmpty?: boolean;
  panelWidth?: number;
  testId?: string;
  fullWidth?: boolean;
  variant?: "pill" | "bare";
  triggerStyle?: React.CSSProperties;
  triggerClassName?: string;
  showAllLabelWhenEmpty?: boolean;
  disabled?: boolean;
  dropdownAlign?: "left" | "right";
  hideClear?: boolean;
  accent?: "orange" | "violet";
  // ── Aditivos (padrão = comportamento histórico, nada muda em quem não passa) ──
  /**
   * Ícone da DIMENSÃO filtrada, desenhado à esquerda do rótulo. Existe porque
   * uma faixa com quatro gatilhos cinza idênticos não diz o que cada um recorta
   * — e, quando o rótulo vira "3 ações", é o ícone que segura a identidade do
   * campo. Sem a prop, o gatilho fica exatamente como sempre foi.
   */
  icon?: React.ComponentType<{ style?: React.CSSProperties; "aria-hidden"?: boolean | "true" | "false" }>;
  /**
   * Como o estado ATIVO se anuncia. "tint" (padrão) = fundo claro + borda
   * colorida, o de sempre. "solid" = selo de fundo cheio com texto branco, para
   * faixas onde o ativo precisa se separar do inativo à distância de um relance
   * (borda mais escura sozinha não sobrevive a quatro gatilhos lado a lado).
   */
  activeAppearance?: "tint" | "solid";
  /**
   * Substantivo do que está sendo filtrado. Com ele o gatilho diz o RECORTE
   * ("3 ações", "2 pessoas") em vez do genérico "3 selecionados" — e o selo
   * numérico redundante ao lado do texto deixa de ser desenhado.
   */
  unitLabel?: { one: string; many: string };
  /**
   * Esconde a caixa de busca do menu. Para listas curtas e fixas (o filtro de
   * Período tem três opções): um campo de busca sobre três linhas é ruído, e
   * ainda rouba o foco de abertura de quem só queria escolher com as setas.
   */
  hideSearch?: boolean;
}

export function FilterSelect({
  label,
  allLabel,
  value,
  onChange,
  values,
  onValuesChange,
  options,
  searchPlaceholder,
  emptyText = "Nada encontrado.",
  hideWhenEmpty = true,
  panelWidth,
  testId,
  fullWidth = false,
  variant = "pill",
  triggerStyle,
  triggerClassName,
  showAllLabelWhenEmpty = false,
  disabled = false,
  dropdownAlign = "left",
  hideClear = false,
  accent = "orange",
  icon: Icon,
  activeAppearance = "tint",
  unitLabel,
  hideSearch = false,
}: FilterSelectProps) {
  const multiple = values !== undefined && onValuesChange !== undefined;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Só a ALTURA muda no mobile (alvo de toque 44px) — componente compartilhado
  // por várias telas, qualquer outra mudança aqui vaza para todas elas.
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Anel de foco. O gatilho tinha `outline: none` e NADA no lugar: quem navega
  // por Tab não enxergava onde estava. O anel só aparece quando o foco chegou
  // pelo teclado — o mousedown (que dispara antes do focus) marca a origem e
  // evita a moldura preta pegajosa depois de cada clique.
  const [focusRing, setFocusRing] = useState(false);
  const pointerRef = useRef(false);

  // Esc fecha o menu e devolve o foco ao gatilho. Fica no onKeyDown do container
  // (não em document): dentro de um Dialog — o export-pdf usa este componente lá
  // —, um listener global fecharia o modal inteiro junto. Parando a propagação
  // no próprio React, o Esc de "fechar menu" nunca vira Esc de "fechar modal".
  const handleEsc = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape" || !open) return;
    e.stopPropagation();
    setOpen(false);
    setSearch("");
    triggerRef.current?.focus();
  };

  // Lado efetivo do painel: começa na preferência do chamador (dropdownAlign)
  // e só vira para o outro lado quando a medição real mostra que ele não cabe
  // na largura da janela — sem isso, um gatilho perto da borda direita abria
  // o painel (até 360px) parcialmente fora da tela. useLayoutEffect (não
  // useEffect) porque a correção precisa acontecer antes do navegador pintar,
  // senão o usuário vê o painel "pular" de lado no primeiro open. Medido no
  // open E a cada resize — o gatilho pode ter mudado de lugar (sidebar,
  // rotação de tela) desde a última medição.
  const [effectiveAlign, setEffectiveAlign] = useState<"left" | "right">(dropdownAlign);
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const width = Math.min(panelWidth ?? (fullWidth ? rect.width : 280), 360);
      const fits = (align: "left" | "right") =>
        align === "right" ? rect.right - width >= 0 : rect.left + width <= window.innerWidth;
      if (fits(dropdownAlign)) { setEffectiveAlign(dropdownAlign); return; }
      const opposite = dropdownAlign === "right" ? "left" : "right";
      setEffectiveAlign(fits(opposite) ? opposite : dropdownAlign);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, dropdownAlign, panelWidth, fullWidth]);

  // ── Paleta de cor baseada no accent ───────────────────────────────────
  // `main` (o 500 saturado: #F97316 / #7C3AED) saiu da paleta em vez de ficar
  // como opção não usada. Era ele que aparecia atrás de texto e de glifos
  // brancos, e é justamente onde não cabe: quem precisa carregar branco por
  // cima usa `text` (o 700), que passa AA. Sem a chave, ninguém reintroduz o
  // problema sem perceber. `border` e `badge` seguem sendo só moldura e selo.
  const C = accent === "violet" ? {
    bg50:    "#F5F3FF",
    border:  "#A78BFA",
    badge:   "#7C3AED",
    text:    "#5B21B6",
    focus:   "rgba(124,58,237,0.15)",
  } : {
    bg50:    "#FFF7ED",
    border:  "#FB923C",
    badge:   "#FB923C",
    text:    "#C2410C",
    focus:   "rgba(251,146,60,0.15)",
  };

  const sorted = useMemo(() => {
    const pinned = options.filter(o => o.pinned);
    const rest = options
      .filter(o => !o.pinned)
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
    return [...pinned, ...rest];
  }, [options]);

  const hasGroups = sorted.some(o => o.group);
  const groupedEntries = useMemo(() => {
    if (!hasGroups) return [];
    const map = new Map<string, FilterOption[]>();
    sorted.forEach(o => {
      const g = o.group || "";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(o);
    });
    return Array.from(map.entries());
  }, [sorted, hasGroups]);

  if (hideWhenEmpty && sorted.length === 0) return null;

  // ── Estado activo ─────────────────────────────────────────────────────
  const isActive = multiple
    ? (values!.length > 0)
    : (value !== undefined && value !== "all");

  // ── Label do trigger ──────────────────────────────────────────────────
  const allLabelText = allLabel || `Todos — ${label.toLowerCase()}`;
  let triggerText: string;
  if (multiple) {
    if (values!.length === 0) {
      triggerText = allLabelText;
    } else if (values!.length === 1) {
      triggerText = sorted.find(o => o.value === values![0])?.label ?? values![0];
    } else {
      // Com unitLabel o gatilho diz o recorte de verdade ("3 ações"); sem ela,
      // o texto genérico de sempre.
      triggerText = unitLabel ? `${values!.length} ${unitLabel.many}` : `${values!.length} selecionados`;
    }
  } else {
    const selected = sorted.find(o => o.value === value);
    const emptyText_ = showAllLabelWhenEmpty ? allLabelText : label;
    triggerText = isActive ? (selected?.label ?? label) : emptyText_;
  }

  // ── dotColor do trigger (modo simples com 1 selecionado) ──────────────
  const triggerDot = !multiple && isActive
    ? sorted.find(o => o.value === value)?.dotColor
    : undefined;

  // ── Busca ─────────────────────────────────────────────────────────────
  // SEM acento (`normalizarBusca`, lib/utils): com `toLowerCase()` puro, "acao"
  // não achava "Ação" e "so quero" não achava "SÓ QUERO PEDALAR SP". Menu que
  // esconde a opção existente é indistinguível de menu que não a tem.
  const searchTrimmed = normalizarBusca(search);
  const filteredSorted = searchTrimmed
    ? sorted.filter(o => normalizarBusca(o.label).includes(searchTrimmed))
    : sorted;

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleSelectSingle = (v: string) => {
    onChange?.(v);
    setSearch("");
    setOpen(false);
  };

  const handleToggleMultiple = (v: string) => {
    const cur = values!;
    const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
    onValuesChange!(next);
  };

  const handleClearMultiple = () => {
    onValuesChange!([]);
  };

  // ── Estilos ───────────────────────────────────────────────────────────
  // Quem monta triggerStyle com `prop: condicao ? valor : undefined` (comum
  // em objetos reaproveitados de outro lugar) mantém a CHAVE mesmo quando a
  // condição é falsa. Espalhar esse objeto direto engolia o valor calculado
  // do componente (ex.: a cor do "filtro ativo") com esse `undefined`, em vez
  // de simplesmente não tocar nele. Tirando as chaves undefined antes do
  // spread, o estilo de quem chama só sobrescreve o que ele de fato definiu —
  // complementa o base em vez de apagar pedaços dele por acidente. Não muda
  // nada para quem já passa objetos totalmente definidos (todo consumidor
  // atual): `{...base, ...limpo}` == `{...base, ...triggerStyle}` quando não
  // há `undefined` no meio.
  const cleanTriggerStyle = triggerStyle
    ? (Object.fromEntries(Object.entries(triggerStyle).filter(([, v]) => v !== undefined)) as React.CSSProperties)
    : undefined;

  // Selo cheio: só quando o chamador pede E o filtro está de fato ativo.
  // #ffffff sobre #c2410c = 5,18:1 ✓ (violeta #5B21B6 = 8,19:1 ✓) — passa AA
  // como texto normal, não só como texto grande.
  const solidActive = isActive && activeAppearance === "solid";

  const pillTrigger: React.CSSProperties = {
    display: "flex", alignItems: "center",
    gap: 6, height: isMobile ? 44 : 36,
    padding: "0 10px 0 12px",
    backgroundColor: solidActive ? C.text : open || isActive ? C.bg50 : "#ffffff",
    border: solidActive ? `1.5px solid ${C.text}` : isActive || open ? `1.5px solid ${C.border}` : "1px solid #e7e5e4",
    borderRadius: 7,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    fontSize: 13, fontWeight: isActive ? 600 : 400,
    color: solidActive ? "#ffffff" : isActive ? C.text : "#1c1917",
    transition: "background 0.15s, border 0.15s, color 0.15s",
    outline: "none", whiteSpace: "nowrap",
    ...(fullWidth ? { width: "100%", justifyContent: "space-between" } : { maxWidth: 260 }),
    ...cleanTriggerStyle,
  };

  const bareTrigger: React.CSSProperties = {
    display: "flex", alignItems: "center",
    gap: 8, padding: "12px 16px",
    border: "none", borderRadius: 8,
    backgroundColor: solidActive ? C.text : isActive ? C.bg50 : "#ffffff",
    color: solidActive ? "#ffffff" : isActive ? C.text : "#1c1917",
    fontSize: 14, fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    outline: "none", whiteSpace: "nowrap",
    ...(fullWidth ? { width: "100%", justifyContent: "space-between" } : { maxWidth: 260 }),
    ...cleanTriggerStyle,
  };

  const resolvedTrigger = triggerClassName
    ? { display: "flex", alignItems: "center", gap: 5, ...cleanTriggerStyle }
    : variant === "bare" ? bareTrigger : pillTrigger;

  // ── Render opção ──────────────────────────────────────────────────────
  const renderOption = (opt: FilterOption) => {
    const isSel = multiple ? values!.includes(opt.value) : value === opt.value;
    return (
      <button
        key={opt.value}
        // aria-pressed: o estado ativo passa a ser ANUNCIADO ("pressionado"),
        // não só pintado — quem usa leitor de tela não via diferença nenhuma
        // entre uma opção marcada e uma opção qualquer.
        aria-pressed={isSel}
        onClick={() => {
          if (disabled) return;
          if (multiple) {
            handleToggleMultiple(opt.value);
          } else {
            handleSelectSingle(opt.value);
          }
        }}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 9,
          padding: "8px 14px", border: "none", cursor: "pointer", textAlign: "left",
          backgroundColor: isSel ? C.bg50 : "transparent",
          transition: "background 0.1s",
        }}
        onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F9FAFB"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = isSel ? C.bg50 : "transparent"; }}
      >
        {/* Checkbox (multi) ou dot (single) */}
        {multiple ? (
          // C.text e não C.main na caixa marcada: o branco do "✓" sobre
          // #f97316 dava 2,90:1 — abaixo dos 3:1 que a WCAG pede para objeto
          // gráfico. Sobre #c2410c são 5,18:1, mesma família de cor.
          <span style={{
            width: 16, height: 16, borderRadius: 4, flexShrink: 0,
            border: isSel ? "none" : "1.5px solid #D1D5DB",
            backgroundColor: isSel ? C.text : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {isSel && <Check style={{ width: 10, height: 10, color: "#fff" }} />}
          </span>
        ) : (
          <span style={{
            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
            backgroundColor: opt.dotColor || (isSel ? C.text : "#D1D5DB"),
          }} />
        )}

        {/* Label */}
        <span style={{
          flex: 1, fontSize: 12, fontWeight: isSel ? 600 : 400,
          color: isSel ? C.text : "#374151",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {opt.label}
        </span>

        {/* Contagem — #57534e sobre #F3F4F6 = 6,93:1 ✓ (era #6B7280 = 4,39:1 ✗
            em 11px). Selecionada: #fff sobre #c2410c = 5,18:1 ✓. */}
        {opt.count !== undefined && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
            backgroundColor: isSel ? C.text : "#F3F4F6",
            color: isSel ? "#fff" : "#57534e", flexShrink: 0,
          }}>
            {opt.count}
          </span>
        )}

        {/* Check mark (modo simples) */}
        {!multiple && isSel && <Check style={{ width: 12, height: 12, color: C.text, flexShrink: 0 }} />}
      </button>
    );
  };

  const panelW = panelWidth ?? (fullWidth ? undefined : 280);

  return (
    <div
      ref={ref}
      onKeyDown={handleEsc}
      style={{ position: "relative", flexShrink: fullWidth ? 0 : undefined, width: fullWidth ? "100%" : undefined }}
    >
      {/* ── Trigger ── */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        data-testid={testId}
        className={triggerClassName}
        title={isActive ? triggerText : label}
        // O rótulo acessível carrega a DIMENSÃO junto do recorte ("Ação: 3
        // ações"): lido isolado, "3 ações" não diz de que campo se trata. Como
        // contém o texto visível, continua valendo a regra "label in name".
        // Quando o gatilho já mostra o próprio nome do campo, não repete.
        aria-label={triggerText === label ? label : `${label}: ${triggerText}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onMouseDown={() => { pointerRef.current = true; }}
        onFocus={() => { if (!pointerRef.current) setFocusRing(true); pointerRef.current = false; }}
        onBlur={() => setFocusRing(false)}
        onClick={() => { if (!disabled) setOpen(v => !v); }}
        style={focusRing
          ? { ...resolvedTrigger, outline: "2px solid #1c1917", outlineOffset: 2 }
          : resolvedTrigger}
      >
        {Icon && (
          <Icon aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0, opacity: isActive ? 1 : 0.75 }} />
        )}
        {triggerDot && (
          <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: triggerDot, flexShrink: 0 }} />
        )}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: fullWidth ? 1 : undefined }}>
          {triggerText}
        </span>

        {/* Badge de contagem (multi, 2+) — some quando unitLabel já colocou o
            número dentro do texto: "3 ações ③" é a mesma informação duas vezes. */}
        {multiple && values!.length > 1 && !unitLabel && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
            backgroundColor: solidActive ? "#ffffff" : C.badge,
            color: solidActive ? C.text : "#fff", flexShrink: 0, marginLeft: 2,
          }}>
            {values!.length}
          </span>
        )}

        {/* Botão X — limpar */}
        {isActive && !hideClear && (
          <span
            role="button"
            // tabIndex + Enter/Espaço: o × fica dentro do <button> do trigger
            // (aninhado), então sem isto era inoperável por teclado.
            tabIndex={0}
            aria-label="Limpar filtro"
            onClick={e => {
              e.stopPropagation();
              if (multiple) handleClearMultiple();
              else onChange?.("all");
              setSearch("");
            }}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault(); e.stopPropagation();
                if (multiple) handleClearMultiple();
                else onChange?.("all");
                setSearch("");
              }
            }}
            style={{ display: "flex", alignItems: "center", color: solidActive ? "#ffffff" : C.border, marginLeft: 2, cursor: "pointer", flexShrink: 0 }}
            title="Limpar filtro"
          >
            <X style={{ width: 13, height: 13 }} />
          </span>
        )}

        <ChevronDown aria-hidden="true" style={{
          width: variant === "bare" ? 14 : 13, height: variant === "bare" ? 14 : 13,
          flexShrink: 0, marginLeft: 2,
          color: solidActive ? "rgba(255,255,255,0.9)" : isActive ? C.border : "#78716c",
          transition: "transform 0.2s",
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
        }} />
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", ...(effectiveAlign === "right" ? { right: 0 } : { left: 0 }), zIndex: 9999,
          backgroundColor: "#fff", border: "1px solid #E5E7EB",
          borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
          ...(panelW ? { width: panelW } : { minWidth: "100%" }),
          maxWidth: 360, overflow: "hidden",
        }}>
          {/* Search */}
          {!hideSearch && (
          <div style={{ padding: "10px 10px 8px" }}>
            <div style={{ position: "relative" }}>
              <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#9CA3AF" }} />
              <input
                autoFocus
                type="text"
                placeholder={searchPlaceholder || `Buscar ${label.toLowerCase()}...`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: "100%", boxSizing: "border-box",
                  paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
                  backgroundColor: "#F9FAFB", border: "1.5px solid #E5E7EB",
                  borderRadius: 6, fontSize: 12, color: "#111827", outline: "none",
                }}
                onFocus={e => { e.target.style.border = `1.5px solid ${C.border}`; e.target.style.boxShadow = `0 0 0 3px ${C.focus}`; }}
                onBlur={e => { e.target.style.border = "1.5px solid #E5E7EB"; e.target.style.boxShadow = "none"; }}
              />
            </div>
          </div>
          )}

          {/* List. Sem a caixa de busca, o menu abre com uma folga mínima no
              topo para o primeiro item não colar na borda do painel. */}
          <div style={{ maxHeight: 280, overflowY: "auto", paddingTop: hideSearch ? 6 : 0, scrollbarWidth: "thin", scrollbarColor: "#E5E7EB transparent" }}>
            {/* "Todos" row */}
            {!searchTrimmed && (
              // "Todos" é o item MAIS NEUTRO da lista e virava a barra mais
              // pesada dela (fundo #F97316 sólido de ponta a ponta, branco de
              // 12px em 2,90:1). Agora é um tint discreto — o realce fica com
              // quem carrega informação, que são as opções escolhidas.
              <button
                aria-pressed={!isActive}
                onClick={() => {
                  if (multiple) {
                    handleClearMultiple();
                  } else {
                    handleSelectSingle("all");
                  }
                }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "9px 14px", border: "none", cursor: "pointer", textAlign: "left",
                  backgroundColor: !isActive ? C.bg50 : "transparent",
                  color: !isActive ? C.text : "#44403c",
                  fontWeight: 700, fontSize: 12,
                  transition: "background 0.1s",
                  borderBottom: "1px solid #F3F4F6",
                }}
                onMouseEnter={e => { if (isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F9FAFB"; }}
                onMouseLeave={e => { if (isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
              >
                {multiple && (
                  <span style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                    border: !isActive ? "none" : "1.5px solid #D1D5DB",
                    backgroundColor: !isActive ? C.text : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {!isActive && <Check style={{ width: 10, height: 10, color: "#fff" }} />}
                  </span>
                )}
                <span style={{ flex: 1 }}>{allLabelText}</span>
                {!multiple && !isActive && <Check style={{ width: 13, height: 13, flexShrink: 0 }} />}
              </button>
            )}

            {/* Opções */}
            {filteredSorted.length === 0 ? (
              <div style={{ padding: "20px 12px", textAlign: "center", fontSize: 12, color: "#78716c" }}>
                {emptyText}
              </div>
            ) : hasGroups ? (
              groupedEntries.map(([groupName, opts]) => (
                // role="group" + aria-label: sem isso o leitor de tela lia 24
                // opções em fila, sem a fase a que cada uma pertence — que é
                // justamente o que o agrupamento visual comunica.
                <div key={groupName || "__sem__"} role="group" aria-label={groupName || undefined}>
                  {groupName && (
                    <div style={{ padding: "8px 14px 3px", fontSize: 11, fontWeight: 800, color: "#78716c", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {groupName}
                    </div>
                  )}
                  {opts.map(renderOption)}
                </div>
              ))
            ) : (
              filteredSorted.map(renderOption)
            )}
          </div>

          {/* Footer — modo múltiplo com seleção ativa */}
          {multiple && values!.length > 0 && (
            <div style={{ padding: "8px 12px", borderTop: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#746e69" }}>
                {values!.length} {values!.length === 1 ? "selecionado" : "selecionados"}
              </span>
              <button
                onClick={handleClearMultiple}
                // C.text e não C.main: #F97316 como cor de TEXTO é proibido pela
                // régua da casa (e dava 2,90:1 sobre branco). #c2410c = 5,18:1 ✓
                style={{ fontSize: 11, fontWeight: 700, color: C.text, background: "none", border: "none", cursor: "pointer", padding: "2px 6px", textDecoration: "underline", textUnderlineOffset: 2 }}
              >
                Limpar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
