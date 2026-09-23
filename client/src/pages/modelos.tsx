import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Layers, Search, Check, ChevronsUpDown, Pencil, Trash2, Ruler, X, Settings, ChevronLeft, ChevronRight, AlertTriangle, Copy } from "lucide-react";
import { FilterSelect } from "@/components/filter-select";
import { useState, useEffect, useRef } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FreezeWhileClosing, HIDE_NATIVE_CLOSE, ModalFooter, ModalHeader, modalSurface } from "@/components/modal-shell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { FS, R, T, N, FW, FONT, TOM } from "@/lib/theme";
import { useConfirmar } from "@/components/ui/usar-confirmar";
import { EstadoVazio, EstadoErro, Esqueleto } from "@/components/ui/estados";
import { Botao } from "@/components/ui/botao";
import { Abas } from "@/components/ui/abas";
import { Selo } from "@/components/ui/selo";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { useIsMobile, useDensidadeDoConteudo, usePonteiroGrosso, alvo } from "@/hooks/use-mobile";
import { useFiltrosNaUrl, paginaValida } from "@/hooks/use-filtros-na-url";
import { TIPOS_DE_PECA } from "@shared/molde";
import type { ModeloComUso } from "@shared/api";

// Delega o comportamento ao filtro padrão do app (busca, ordem alfabética,
// contagem). Aqui o "sem filtro" é "" em vez de "all", então traduzimos nas
// duas pontas. O rótulo em caixa alta que ficava EM CIMA de cada filtro saiu:
// era a única barra de filtros do app com rótulo externo, e o próprio gatilho
// já diz a dimensão ("Grupo", "Tipo"…) enquanto está vazio — igual a Usuários
// e Logs.
function SearchableSelect({
  label, placeholder, value, options, onChange, testId, counts,
}: {
  label: string; placeholder: string; value: string;
  options: string[]; onChange: (v: string) => void; testId?: string;
  counts?: Record<string, number>;
}) {
  return (
    <FilterSelect
      label={label}
      allLabel={placeholder}
      hideWhenEmpty={false}
      value={value === "" ? "all" : value}
      onChange={v => onChange(v === "all" ? "" : v)}
      options={options.map(o => ({ value: o, label: o, count: counts?.[o] }))}
      searchPlaceholder={`Buscar ${label.toLowerCase()}...`}
      emptyText="Nenhuma opção"
      panelWidth={220}
      testId={testId}
      triggerStyle={{
        height: 40, padding: "0 12px", fontSize: FS.meta, fontWeight: FW.forte, color: T.second,
        backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md,
      }}
    />
  );
}

/* Os botões desta tela são o <Botao> do design system: os estilos BTN_* que
   eram copiados entre Usuários, Patrocinadores, Modelos e Logs saíram daqui —
   hover, foco e desabilitado passam a vir da classe .ds-botao. */

/**
 * PAGINAÇÃO — janela de até 5 páginas em volta da atual, alvos de 32px (44 no
 * celular e no tablet de dedo) e a página atual cheia em escuro. Some com uma
 * página só.
 */
function Paginacao({ pagina, totalPaginas, onIr, toque }: { pagina: number; totalPaginas: number; onIr: (p: number) => void; toque: number }) {
  if (totalPaginas <= 1) return null;
  const inicio = Math.max(1, Math.min(pagina - 2, totalPaginas - 4));
  const paginas = Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => inicio + i);
  const tamanho = toque >= 44 ? "toque" : "sm";
  // Quadrado: a largura mínima acompanha a altura do alvo.
  const quadrado: React.CSSProperties = { minWidth: toque, padding: "0 6px" };
  return (
    <nav aria-label="Paginação" style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <Botao tamanho={tamanho} icone={ChevronLeft} onClick={() => onIr(pagina - 1)} disabled={pagina === 1} aria-label="Página anterior" style={quadrado} />
      {paginas.map(p => (
        <Botao key={p} variante={p === pagina ? "primario" : "secundario"} tamanho={tamanho} onClick={() => onIr(p)}
          aria-label={`Página ${p}`} aria-current={p === pagina ? "page" : undefined} style={quadrado}>
          {p}
        </Botao>
      ))}
      <Botao tamanho={tamanho} icone={ChevronRight} onClick={() => onIr(pagina + 1)} disabled={pagina === totalPaginas} aria-label="Próxima página" style={quadrado} />
    </nav>
  );
}

// A lista única de tipos (com o Molde, 22/09) mora em shared/molde.ts.
const itemTypes = [...TIPOS_DE_PECA];
const materials = ["Adesivo", "Lona", "Madeira", "Sanett", "Tecido", "Tecido Pet"];
const finishes = ["Dupla Face", "Ilhós", "Impressão UV", "Impresso", "Recorte", "Refile"];

/**
 * A SANGRIA, DERIVADA — e validada.
 *
 * VIS 3.00 × 2.40 e ARQ 3.05 × 2.45 ficavam lado a lado e a diferença — 5 cm,
 * que é a sangria — o leitor calculava de cabeça. E nada impedia cadastrar
 * arquivo MENOR que o visual, o que produz peça cortada.
 *
 * Três estados, por eixo e depois combinados: `menor` se QUALQUER eixo do
 * arquivo é menor que o visual (é o que corta a peça); `sem` se os dois são
 * iguais (sem margem para o refile); senão a folga em cm — um número só
 * quando os eixos coincidem, "L/A" quando não. Null quando falta medida.
 */
type Sangria = { estado: "menor" | "sem" | "ok"; rotulo: string; title: string };
function sangriaDe(visW: unknown, visH: unknown, arqW: unknown, arqH: unknown): Sangria | null {
  const n = (v: unknown) => { const x = parseFloat(String(v ?? "")); return Number.isFinite(x) && x > 0 ? x : null; };
  const vw = n(visW), vh = n(visH), aw = n(arqW), ah = n(arqH);
  if (vw === null || vh === null || aw === null || ah === null) return null;
  const dW = Math.round((aw - vw) * 100), dH = Math.round((ah - vh) * 100);
  if (dW < 0 || dH < 0) {
    return { estado: "menor", rotulo: "arquivo menor", title: "O arquivo é menor que o visual — a peça sairia cortada. Confira o cadastro." };
  }
  if (dW === 0 && dH === 0) {
    return { estado: "sem", rotulo: "sem sangria", title: "Arquivo igual ao visual — sem margem para o refile" };
  }
  const rotulo = dW === dH ? `+${dW}cm` : `+${dW}/${dH}cm`;
  const title = dW === dH ? `Sangria de ${dW} cm em cada eixo` : `Sangria de ${dW} cm na largura e ${dH} cm na altura`;
  return { estado: "ok", rotulo, title };
}
/**
 * O selo, na tabela e no formulário — uma casca só.
 *
 * Os três tons vêm de TOM (o espelho da paleta de status) em vez dos nove
 * hexes que estavam escritos aqui. O "sem sangria" usava o amber 800 sobre o
 * amber 50 — um degrau mais escuro do que o amber do app: contraste igualmente
 * bom, e o MESMO alerta com cor diferente a três telas de distância.
 *
 * Contrastes conferidos: alerta 5,0:1; perigo 6,5:1; neutro 7,6:1.
 */
const SANGRIA_TOM: Record<Sangria["estado"], { bg: string; border: string; color: string }> = {
  ok:    { bg: TOM.neutro.bg, border: TOM.neutro.border, color: T.apoio },
  sem:   { bg: TOM.alerta.bg, border: TOM.alerta.border, color: TOM.alerta.text },
  menor: { bg: TOM.perigo.bg, border: TOM.perigo.border, color: TOM.perigo.text },
};
function ChipSangria({ s, testId }: { s: Sangria; testId: string }) {
  const t = SANGRIA_TOM[s.estado];
  return (
    <span data-testid={testId} title={s.title} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS.micro, fontWeight: FW.forte, letterSpacing: "0.04em", borderRadius: R.sm, padding: "1px 6px", backgroundColor: t.bg, border: `1px solid ${t.border}`, color: t.color, whiteSpace: "nowrap", fontFamily: s.estado === "ok" ? FONT.mono : "inherit" }}>
      {s.estado === "menor" && <AlertTriangle aria-hidden="true" style={{ width: 10, height: 10, flexShrink: 0 }} />}
      {s.rotulo}
    </span>
  );
}

/** O corpo de POST/PATCH /api/standard-items: o formulário com os opcionais vazios como null. */
type CorpoDoModelo = Omit<typeof EMPTY_FORM, "group" | "material" | "finish" | "area" | "visual" | "visualWidth" | "visualHeight" | "fileWidth" | "fileHeight"> & {
  group: string | null;
  material: string | null;
  finish: string | null;
  area: string | null;
  visual: string | null;
  visualWidth: string | null;
  visualHeight: string | null;
  fileWidth: string | null;
  fileHeight: string | null;
};

const EMPTY_FORM = {
  name: "",
  type: "",
  group: "",
  area: "",
  visual: "",
  visualWidth: "",
  visualHeight: "",
  fileWidth: "",
  fileHeight: "",
  material: "",
  finish: "",
  hasVariableMeasurement: false,
};

/* pill color by tipo */
function tipoPillStyle(type: string) {
  const orange = ["Palco", "Stand", "Arena"];
  const blue = ["Pórtico", "WindBanner", "Percurso"];
  if (orange.includes(type)) return { backgroundColor: TOM.laranja.bg, color: T.accentText };
  if (blue.includes(type)) return { backgroundColor: TOM.info.bg, color: TOM.info.text };
  return { backgroundColor: T.low, color: T.apoio };
}

/* ── Linha do modal "Gerenciar Categorias" ──
   Fica FORA do componente da página de propósito: definida dentro do render,
   ela virava um componente NOVO a cada tecla digitada no rename — o React
   desmontava e remontava a linha e o input perdia o foco a cada caractere. */
function CatRow({ name, count, accentColor, accentBg,
  isEditing, editValue, onEditChange, onEditConfirm, onEditCancel, isPendingRename,
  isDeleting, onDeleteConfirm, onDeleteCancel, isPendingDelete,
  onStartEdit, onStartDelete, toque = 32,
}: {
  name: string; count: number; accentColor: string; accentBg: string;
  isEditing: boolean; editValue: string; onEditChange: (v: string) => void;
  onEditConfirm: () => void; onEditCancel: () => void; isPendingRename: boolean;
  isDeleting: boolean; onDeleteConfirm: () => void; onDeleteCancel: () => void; isPendingDelete: boolean;
  onStartEdit: () => void; onStartDelete: () => void;
  /** Alvo dos botões da linha: 32 no mouse, 44 no dedo. */
  toque?: number;
}) {
  const tamanho = toque >= 44 ? "toque" : "sm";
  // Botão só de ícone: quadrado, com o alvo inteiro clicável.
  const soIcone: React.CSSProperties = { width: toque, padding: 0, flexShrink: 0 };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: R.lg, backgroundColor: isDeleting ? TOM.perigo.bg : T.bg, border: `1px solid ${isDeleting ? TOM.perigo.border : N.n3}`, transition: "all 0.15s" }}>
      {/* Dot */}
      <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: accentColor, flexShrink: 0, opacity: isDeleting ? 0.4 : 1 }} />

      {isEditing ? (
        <>
          <input autoFocus value={editValue} onChange={e => onEditChange(e.target.value)}
            aria-label={`Novo nome para "${name}"`}
            onKeyDown={e => { if (e.key === "Enter") onEditConfirm(); if (e.key === "Escape") onEditCancel(); }}
            style={{ flex: 1, minWidth: 0, fontSize: toque >= 44 ? FS.lead : FS.body, fontWeight: FW.medio, borderRadius: R.md, padding: "5px 10px", border: `1.5px solid ${accentColor}`, color: T.text, background: accentBg }}
          />
          {/* O confirmar mantém a cor da aba: é o que amarra a linha à categoria. */}
          <Botao variante="primario" tamanho={tamanho} icone={Check} onClick={onEditConfirm} carregando={isPendingRename}
            aria-label={`Confirmar novo nome de "${name}"`}
            style={{ ...soIcone, backgroundColor: accentColor, border: `1px solid ${accentColor}` }} />
          <Botao tamanho={tamanho} icone={X} onClick={onEditCancel} aria-label="Cancelar renomeação" style={soIcone} />
        </>
      ) : isDeleting ? (
        <>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: FS.body, fontWeight: FW.medio, color: TOM.perigo.text }}>Remover </span>
            <span style={{ fontSize: FS.body, fontWeight: FW.rotulo, color: TOM.perigo.text }}>"{name}"</span>
            <span style={{ fontSize: FS.body, color: TOM.perigo.text }}> de {count} {count === 1 ? "modelo" : "modelos"}?</span>
          </div>
          <Botao variante="perigo" tamanho={tamanho} onClick={onDeleteConfirm} carregando={isPendingDelete} style={{ flexShrink: 0 }}>
            {isPendingDelete ? "Removendo..." : "Remover"}
          </Botao>
          <Botao tamanho={tamanho} onClick={onDeleteCancel} style={{ flexShrink: 0 }}>
            Cancelar
          </Botao>
        </>
      ) : (
        <>
          <span style={{ flex: 1, fontSize: FS.body, fontWeight: FW.medio, color: T.text }}>{name}</span>
          {/* T.apoio, e não T.second: sobre o n3 o n7 fica em 4,38:1. */}
          <span style={{ fontSize: FS.small, fontWeight: FW.medio, color: T.apoio, backgroundColor: N.n3, borderRadius: R.sm, padding: "2px 8px", marginRight: 2 }}>
            {count} {count === 1 ? "modelo" : "modelos"}
          </span>
          <Botao variante="fantasma" tamanho={tamanho} icone={Pencil} onClick={onStartEdit}
            title={`Renomear "${name}"`} aria-label={`Renomear "${name}"`} style={soIcone} />
          <Botao variante="fantasma" tamanho={tamanho} icone={Trash2} onClick={onStartDelete}
            title={`Remover "${name}"`} aria-label={`Remover "${name}"`} style={soIcone} />
        </>
      )}
    </div>
  );
}

export default function Modelos() {
  const isMobile = useIsMobile();
  // RÉGUA PELA ÁREA ÚTIL: com a barra lateral aberta num tablet a janela diz
  // "desktop" e sobram ~700px — a busca e as ações do topo precisam saber
  // disso. `isMobile` segue para o que é de fato celular (gutter, modais).
  const { ref: raizRef, cards: apertado } = useDensidadeDoConteudo<HTMLDivElement>(isMobile ? 32 : 64);
  const ponteiroGrosso = usePonteiroGrosso();
  const [open, setOpen] = useState(false);
  // RECORTE NA URL (regra da casa): busca, os quatro filtros e a página
  // sobrevivem ao F5 e ao link mandado a quem vai cadastrar a peça. Filtro
  // novo volta à página 1 no mesmo update, como já era. Renomear/remover uma
  // categoria no "Gerenciar" continua acompanhando o filtro ativo.
  const { valores: filtros, definir, atualizar, limpar } = useFiltrosNaUrl(
    { busca: "", grupo: "", tipo: "", material: "", acabamento: "", pagina: 1 },
    { aceita: { pagina: paginaValida } },
  );
  const searchTerm = filtros.busca;
  const filterGroup = filtros.grupo;
  const filterType = filtros.tipo;
  const filterMaterial = filtros.material;
  const filterFinish = filtros.acabamento;
  const page = filtros.pagina;
  const setPage = (p: number) => definir("pagina", p);
  const setFilterGroup = (v: string) => definir("grupo", v);
  const setFilterMaterial = (v: string) => definir("material", v);
  const setFilterFinish = (v: string) => definir("acabamento", v);
  // 44 também no tablet do galpão, onde o ponteiro é o dedo em qualquer largura.
  const toque = alvo(32, isMobile || ponteiroGrosso);
  const tamBotao = toque >= 44 ? "toque" : "md";
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);
  const [materialPopoverOpen, setMaterialPopoverOpen] = useState(false);
  const [finishPopoverOpen, setFinishPopoverOpen] = useState(false);
  const [groupPopoverOpen, setGroupPopoverOpen] = useState(false);
  const [customTypeInput, setCustomTypeInput] = useState("");
  const [customMaterialInput, setCustomMaterialInput] = useState("");
  const [customFinishInput, setCustomFinishInput] = useState("");
  const [customGroupInput, setCustomGroupInput] = useState("");
  const { toast } = useToast();
  const { confirmar, dialogo } = useConfirmar();
  const [editingItem, setEditingItem] = useState<ModeloComUso | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ModeloComUso | null>(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  // DUPLICAR abre o formulário COMO CRIAÇÃO, pré-preenchido, com o foco no
  // nome e o texto selecionado — para trocar direto. Nada é salvo antes de
  // confirmar. O flag só serve para o foco inicial.
  const [duplicando, setDuplicando] = useState(false);
  const nomeRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open || !duplicando) return;
    const t = window.setTimeout(() => { nomeRef.current?.focus(); nomeRef.current?.select(); }, 60);
    return () => window.clearTimeout(t);
  }, [open, duplicando]);
  // O aviso de "arquivo menor" no formulário: aparece no blur dos campos de
  // arquivo e exige ser VISTO — não bloqueia o salvamento (há recorte
  // legítimo), mas o botão só libera depois que a pessoa marca que entendeu.
  const [arqTocado, setArqTocado] = useState(false);
  const [cienteDoCorte, setCienteDoCorte] = useState(false);
  // Manage modal
  const [manageOpen, setManageOpen] = useState(false);
  const [manageTab, setManageTab] = useState<"group"|"material"|"finish">("group");
  const [mgEditingGroup, setMgEditingGroup] = useState<string | null>(null);
  const [mgEditGroupValue, setMgEditGroupValue] = useState("");
  const [mgEditingFinish, setMgEditingFinish] = useState<string | null>(null);
  const [mgEditFinishValue, setMgEditFinishValue] = useState("");
  const [mgEditingMaterial, setMgEditingMaterial] = useState<string | null>(null);
  const [mgEditMaterialValue, setMgEditMaterialValue] = useState("");
  const [mgDeleteGroupConfirm, setMgDeleteGroupConfirm] = useState<string | null>(null);
  const [mgDeleteFinishConfirm, setMgDeleteFinishConfirm] = useState<string | null>(null);
  const [mgDeleteMaterialConfirm, setMgDeleteMaterialConfirm] = useState<string | null>(null);

  const { data: standardItems = [], isLoading, isError, refetch } = useQuery<ModeloComUso[]>({
    queryKey: ["/api/standard-items"],
  });

  const { data: catalogOptions = [], isError: catalogError, refetch: refetchCatalog } = useQuery<{ kind: string; value: string }[]>({
    queryKey: ["/api/catalog-options"],
  });

  const createCatalogOptionMutation = useMutation({
    mutationFn: async ({ kind, value }: { kind: string; value: string }) =>
      await apiRequest("POST", "/api/catalog-options", { kind, value }),
    // Títulos de erro dizem O QUE falhou: um "Erro" solto, no modal de
    // categorias com três abas, não dizia nem em qual delas.
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/catalog-options"] });
      toast({ title: "Opção adicionada", description: `"${vars.value}" já aparece nos formulários de modelo.`, variant: "success" });
    },
    onError: (error: Error) => toast({ title: "Não foi possível adicionar a opção", description: error.message, variant: "destructive" }),
  });

  const deleteCatalogOptionMutation = useMutation({
    mutationFn: async ({ kind, value }: { kind: string; value: string }) =>
      await apiRequest("DELETE", "/api/catalog-options", { kind, value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/catalog-options"] }),
    onError: (error: Error) => toast({ title: "Não foi possível remover a opção do catálogo", description: error.message, variant: "destructive" }),
  });

  const [newCatValue, setNewCatValue] = useState("");

  const renameGroupMutation = useMutation({
    mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) =>
      await apiRequest("PATCH", "/api/standard-items/rename-group", { oldName, newName }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/standard-items"] });
      if (filterGroup === vars.oldName) setFilterGroup(vars.newName);
      setMgEditingGroup(null);
      setMgEditGroupValue("");
      toast({ title: "Grupo renomeado", description: `"${vars.oldName}" → "${vars.newName}"`, variant: "success" });
    },
    onError: (error: Error) => {
      toast({ title: "Não foi possível renomear o grupo", description: error.message, variant: "destructive" });
    },
  });

  // Remoção de categoria é uma operação ENCADEADA (limpa os modelos e depois
  // remove a opção do catálogo): o toast de sucesso fica com o chamador, para
  // só aparecer depois que AS DUAS etapas concluírem — antes, "Grupo removido"
  // disparava aqui e, se o encadeado falhasse, convivia com o toast de erro.
  const deleteGroupMutation = useMutation({
    mutationFn: async (name: string) =>
      await apiRequest("DELETE", "/api/standard-items/clear-group", { name }),
    onSuccess: (_data, name) => {
      queryClient.invalidateQueries({ queryKey: ["/api/standard-items"] });
      if (filterGroup === name) setFilterGroup("");
      setMgDeleteGroupConfirm(null);
    },
    onError: (error: Error) => {
      toast({ title: "Não foi possível remover o grupo", description: error.message, variant: "destructive" });
    },
  });

  const renameFinishMutation = useMutation({
    mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) =>
      await apiRequest("PATCH", "/api/standard-items/rename-finish", { oldName, newName }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/standard-items"] });
      if (filterFinish === vars.oldName) setFilterFinish(vars.newName);
      setMgEditingFinish(null);
      setMgEditFinishValue("");
      toast({ title: "Acabamento renomeado", description: `"${vars.oldName}" → "${vars.newName}"`, variant: "success" });
    },
    onError: (error: Error) => {
      toast({ title: "Não foi possível renomear o acabamento", description: error.message, variant: "destructive" });
    },
  });

  const deleteFinishMutation = useMutation({
    mutationFn: async (name: string) =>
      await apiRequest("DELETE", "/api/standard-items/clear-finish", { name }),
    onSuccess: (_data, name) => {
      queryClient.invalidateQueries({ queryKey: ["/api/standard-items"] });
      if (filterFinish === name) setFilterFinish("");
      setMgDeleteFinishConfirm(null);
      // Toast de sucesso com o chamador, após o encadeado (ver deleteGroupMutation).
    },
    onError: (error: Error) => {
      toast({ title: "Não foi possível remover o acabamento", description: error.message, variant: "destructive" });
    },
  });

  const renameMaterialMutation = useMutation({
    mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) =>
      await apiRequest("PATCH", "/api/standard-items/rename-material", { oldName, newName }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/standard-items"] });
      if (filterMaterial === vars.oldName) setFilterMaterial(vars.newName);
      setMgEditingMaterial(null);
      setMgEditMaterialValue("");
      toast({ title: "Material renomeado", description: `"${vars.oldName}" → "${vars.newName}"`, variant: "success" });
    },
    onError: (error: Error) => {
      toast({ title: "Não foi possível renomear o material", description: error.message, variant: "destructive" });
    },
  });

  const deleteMaterialMutation = useMutation({
    mutationFn: async (name: string) =>
      await apiRequest("DELETE", "/api/standard-items/clear-material", { name }),
    onSuccess: (_data, name) => {
      queryClient.invalidateQueries({ queryKey: ["/api/standard-items"] });
      if (filterMaterial === name) setFilterMaterial("");
      setMgDeleteMaterialConfirm(null);
      // Toast de sucesso com o chamador, após o encadeado (ver deleteGroupMutation).
    },
    onError: (error: Error) => {
      toast({ title: "Não foi possível remover o material", description: error.message, variant: "destructive" });
    },
  });

  // "SALVAR E CADASTRAR OUTRO" — o Duplicar resolve "um parecido com ESTE";
  // faltava "vários seguidos" sem fechar e reabrir. Mesmo POST, mesmo
  // onSuccess; só não fecha: limpa o NOME, mantém o resto (tipo, grupo,
  // material, acabamento e medidas — é o que se repete numa família de
  // peças) e diz isso na faixa verde, para a medida herdada não passar
  // despercebida. Ref, não estado: só o onSuccess lê.
  const continuarRef = useRef(false);
  const [criadosNestaSequencia, setCriadosNestaSequencia] = useState<string[]>([]);

  const createStandardItemMutation = useMutation({
    mutationFn: async (data: typeof formData | CorpoDoModelo) => {
      if (editingItem) {
        return await apiRequest("PATCH", `/api/standard-items/${editingItem.id}`, data);
      }
      return await apiRequest("POST", "/api/standard-items", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/standard-items"] });
      if (continuarRef.current && !editingItem) {
        continuarRef.current = false;
        const proximo = { ...formData, name: "" };
        setCriadosNestaSequencia(prev => [...prev, formData.name]);
        setFormData(proximo);
        // A "foto" da guarda de descarte passa a ser o formulário novo: fechar
        // agora sem mexer em nada não pode perguntar "descartar?".
        formInicialRef.current = JSON.stringify(proximo);
        setDuplicando(false); setArqTocado(false); setCienteDoCorte(false);
        toast({ title: "Modelo criado", description: `"${formData.name}" já está no catálogo. Preencha o próximo.`, variant: "success" });
        window.setTimeout(() => nomeRef.current?.focus(), 0);
        return;
      }
      continuarRef.current = false;
      setOpen(false);
      setEditingItem(null);
      setFormData({ ...EMPTY_FORM });
      setDuplicando(false); setArqTocado(false); setCienteDoCorte(false);
      toast({
        title: editingItem ? "Modelo atualizado" : "Modelo criado",
        description: `"${formData.name}" ${editingItem ? "foi atualizado" : "já está no catálogo"}.`,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      // O modal continua aberto com tudo o que foi digitado — o título diz
      // que nada se perdeu e que dá para tentar de novo dali mesmo.
      continuarRef.current = false;
      toast({ title: editingItem ? "Não foi possível salvar o modelo" : "Não foi possível criar o modelo", description: `${error.message} — nada foi salvo; o que você digitou continua no formulário.`, variant: "destructive" });
    },
  });

  const deleteStandardItemMutation = useMutation({
    mutationFn: async (id: string) => await apiRequest("DELETE", `/api/standard-items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/standard-items"] });
      const nome = deleteConfirm?.name;
      setDeleteConfirm(null);
      toast({ title: "Modelo excluído", description: nome ? `"${nome}" saiu do catálogo.` : undefined, variant: "success" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir modelo", description: error.message, variant: "destructive" });
    },
  });

  const sangriaDoForm = formData.hasVariableMeasurement ? null : sangriaDe(formData.area, formData.visual, formData.fileWidth, formData.fileHeight);
  const corteNoForm = sangriaDoForm?.estado === "menor";
  // O aviso aparece no blur dos campos de arquivo OU quando a pessoa tenta
  // salvar sem ter passado por eles — os dois caminhos terminam no mesmo lugar.
  const mostrarAvisoDeCorte = corteNoForm && arqTocado;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (corteNoForm && !cienteDoCorte) {
      // Não bloqueia de vez: força o aviso a aparecer e pede o "entendi".
      // O pedido de "cadastrar outro" não sobrevive à parada: o próximo
      // Enter não pode herdá-lo sem o clique no botão.
      continuarRef.current = false;
      setArqTocado(true);
      return;
    }
    const toStr = (v: string) => (v === "" || v === null || v === undefined) ? null : String(v);
    // Com medida variável, as medidas fixas saem no SUBMIT (viram null), não no
    // toggle: assim desligar o interruptor devolve os valores que a pessoa
    // tinha digitado, em vez de apagá-los sem aviso.
    const variable = formData.hasVariableMeasurement;
    const dataToSubmit: CorpoDoModelo = {
      ...formData,
      group: formData.group || null,
      material: formData.material || null,
      finish: formData.finish || null,
      area: variable ? null : toStr(formData.area),
      visual: variable ? null : toStr(formData.visual),
      visualWidth: variable ? null : toStr(formData.visualWidth),
      visualHeight: variable ? null : toStr(formData.visualHeight),
      fileWidth: variable ? null : toStr(formData.fileWidth),
      fileHeight: variable ? null : toStr(formData.fileHeight),
    };
    createStandardItemMutation.mutate(dataToSubmit);
  };

  const handleEdit = (item: ModeloComUso) => {
    setDuplicando(false); setArqTocado(false); setCienteDoCorte(false);
    setEditingItem(item);
    setFormData({
      name: item.name,
      type: item.type,
      group: item.group || "",
      area: item.area || "",
      visual: item.visual || "",
      visualWidth: item.visualWidth || "",
      visualHeight: item.visualHeight || "",
      fileWidth: item.fileWidth || "",
      fileHeight: item.fileHeight || "",
      material: item.material || "",
      finish: item.finish || "",
      hasVariableMeasurement: item.hasVariableMeasurement || false,
    });
    setOpen(true);
  };

  /**
   * DUPLICAR. Cadastrar "Pórtico chegada 6m" a partir do "Pórtico largada 8m"
   * era redigitar sete campos. Abre o formulário de CRIAÇÃO (editingItem
   * nulo → o submit faz POST), com todos os valores do original e o nome
   * sufixado; o foco vai para o nome com o texto selecionado.
   */
  const handleDuplicate = (item: ModeloComUso) => {
    setEditingItem(null);
    setFormData({
      name: `${item.name} (cópia)`,
      type: item.type || "",
      group: item.group || "",
      area: item.area || "",
      visual: item.visual || "",
      visualWidth: item.visualWidth || "",
      visualHeight: item.visualHeight || "",
      fileWidth: item.fileWidth || "",
      fileHeight: item.fileHeight || "",
      material: item.material || "",
      finish: item.finish || "",
      hasVariableMeasurement: item.hasVariableMeasurement || false,
    });
    setArqTocado(false); setCienteDoCorte(false);
    setCriadosNestaSequencia([]);
    setDuplicando(true);
    setOpen(true);
  };

  const handleCloseDialog = () => {
    setCriadosNestaSequencia([]);
    setOpen(false);
    setEditingItem(null);
    setFormData({ ...EMPTY_FORM });
    setDuplicando(false);
    setArqTocado(false); setCienteDoCorte(false);
  };

  // GUARDA DE DESCARTE — o mesmo contrato de Usuários e Patrocinadores. Este é
  // o formulário mais longo dos cadastros (até 11 campos), e um Esc ou clique
  // fora do modal jogava tudo fora sem perguntar. A "foto" do formulário é
  // tirada ao abrir (criar, editar ou duplicar); só pergunta se algo mudou.
  const formInicialRef = useRef(JSON.stringify(EMPTY_FORM));
  useEffect(() => {
    if (open) formInicialRef.current = JSON.stringify(formData);
    // Só na ABERTURA: a foto é o ponto de partida, não o estado corrente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const requestCloseDialog = async () => {
    if (JSON.stringify(formData) === formInicialRef.current) { handleCloseDialog(); return; }
    // A pergunta é do app e não do navegador. Aqui a diferença é concreta:
    // `window.confirm` TRAVA a thread, e com o Dialog do Radix no meio de uma
    // animação de saída isso deixava o modal congelado atrás da caixa cinza do
    // sistema operacional — a mesma classe de problema que o
    // FreezeWhileClosing já tinha vindo resolver.
    const descartar = await confirmar({
      titulo: "Descartar as alterações deste modelo?",
      descricao: "O que você preencheu se perde. O modelo continua como estava.",
      confirmar: "Descartar",
      cancelar: "Continuar editando",
      perigo: true,
    });
    if (descartar) handleCloseDialog();
  };

  // Uma porta só para "Novo Modelo": o botão do vazio abria o modal SEM zerar
  // o formulário e podia herdar o rascunho de uma edição anterior.
  const openCreate = () => {
    setEditingItem(null); setFormData({ ...EMPTY_FORM }); setDuplicando(false);
    setCriadosNestaSequencia([]);
    setArqTocado(false); setCienteDoCorte(false); setOpen(true);
  };

  // Opções de catálogo cadastradas avulsas (material/acabamento/grupo)
  const catMats = catalogOptions.filter(o => o.kind === "material").map(o => o.value);
  const catFinishes = catalogOptions.filter(o => o.kind === "finish").map(o => o.value);
  const catGroups = catalogOptions.filter(o => o.kind === "group").map(o => o.value);

  // Unique values for filter chips
  const allGroups = Array.from(new Set([...catGroups, ...standardItems.map((s) => s.group).filter(Boolean)])).sort() as string[];
  const allTypes  = Array.from(new Set(standardItems.map((s) => s.type).filter(Boolean))).sort() as string[];
  const allMats     = Array.from(new Set([...materials,  ...catMats,     ...standardItems.map((s) => s.material).filter(Boolean)])).sort() as string[];
  const allFinishes = Array.from(new Set([...finishes,   ...catFinishes, ...standardItems.map((s) => s.finish).filter(Boolean)])).sort() as string[];

  const filteredItems = standardItems.filter((item) => {
    const q = searchTerm.toLowerCase();
    const matchSearch = !q || item.name.toLowerCase().includes(q) || item.type?.toLowerCase().includes(q) || (item.group || "").toLowerCase().includes(q);
    const matchGroup  = !filterGroup   || item.group    === filterGroup;
    const matchType   = !filterType    || item.type     === filterType;
    const matchMat    = !filterMaterial || item.material === filterMaterial;
    const matchFinish = !filterFinish   || item.finish   === filterFinish;
    return matchSearch && matchGroup && matchType && matchMat && matchFinish;
  }).sort((a, b) => {
    const ga = (a.group || "").localeCompare(b.group || "", "pt-BR");
    if (ga !== 0) return ga;
    return a.name.localeCompare(b.name, "pt-BR");
  });

  const activeFilters = [filterGroup, filterType, filterMaterial, filterFinish].filter(Boolean).length;

  // Contagens facetadas: cada filtro conta aplicando os OUTROS filtros ativos.
  const mFacetCounts = (field: 'group' | 'type' | 'material' | 'finish') => {
    const out: Record<string, number> = {};
    standardItems.forEach((item) => {
      if (field !== 'group' && filterGroup && item.group !== filterGroup) return;
      if (field !== 'type' && filterType && item.type !== filterType) return;
      if (field !== 'material' && filterMaterial && item.material !== filterMaterial) return;
      if (field !== 'finish' && filterFinish && item.finish !== filterFinish) return;
      const v = item[field];
      if (!v) return;
      out[v] = (out[v] || 0) + 1;
    });
    return out;
  };
  const groupCounts = mFacetCounts('group');
  const typeCounts = mFacetCounts('type');
  const materialCounts = mFacetCounts('material');
  const finishCounts = mFacetCounts('finish');

  // Paginação client-side: o catálogo cresce e a tabela renderizava tudo.
  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedItems = filteredItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Opções do combobox de Tipo: catálogo fixo + valores já usados nos modelos
  // (fim do palco/Palco/PALCO — quem digita escolhe um valor existente).
  const allTypeOptions = Array.from(new Set([...itemTypes, ...allTypes])).sort((a, b) => a.localeCompare(b, "pt-BR"));

  // "Limpar" do campo: fantasma, colado embaixo do seletor.
  const LIMPAR_CAMPO: React.CSSProperties = { marginTop: 4, padding: "0 6px" };
  /* ── shared field style ── */
  const fieldStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px", backgroundColor: N.n3,
    // Raio 8 (R.md), o dos campos de Usuários e Patrocinadores — era 12.
    // 16px no celular: abaixo disso o iOS dá zoom ao focar o campo.
    border: "none", borderRadius: R.md, fontSize: isMobile ? FS.lead : FS.body, color: T.text,
    fontFamily: FONT.display,
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: FS.micro, fontWeight: FW.forte, color: T.second,
    textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, marginLeft: 2,
  };

  return (
    <div ref={raizRef} className="modelos-page" style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: isMobile ? "16px 16px 48px" : "28px 32px 64px" }}>
      {/* Placeholder nativo dos inputs: o cinza padrão do navegador reprova
          contraste. T.apoio (n8) e não T.second (n7) porque o fundo destes
          campos é o n3 — o único degrau claro em que o n7 fica em 4,38:1. É a
          exceção que o próprio token documenta. */}
      <style>{`
        .modelos-page input::placeholder, .modelos-page textarea::placeholder { color: ${T.apoio}; opacity: 1; }
        .modelos-page tr.linha-modelo:hover { background-color: ${T.bg}; }
      `}</style>

      {/* ── Cabeçalho da casa ── o subtítulo diz o ESTADO do catálogo; a
          explicação de uso fica na linha logo abaixo. */}
      <CabecalhoDaPagina
        titulo="Modelos"
        icone={Layers}
        subtitulo={isLoading ? "Carregando o catálogo…"
          : isError ? "Catálogo indisponível no momento"
          : `${standardItems.length} ${standardItems.length === 1 ? "modelo" : "modelos"} no catálogo`}
        acoes={
          <>
            {/* "Gerenciar" o quê? O modal que abre é de grupos, materiais e
                acabamentos — o rótulo passa a dizer. */}
            <Botao data-testid="button-manage-categories" variante="secundario" tamanho={tamBotao} icone={Settings}
              onClick={() => setManageOpen(true)}>
              {apertado ? "Categorias" : "Gerenciar categorias"}
            </Botao>
            <Botao data-testid="button-new-model" variante="primario" tamanho={tamBotao} icone={Plus} onClick={openCreate}>
              Novo Modelo
            </Botao>
          </>
        }
      />
      {/* ONDE O MODELO É USADO. "Catálogo reutilizável" não dizia onde ele
          reaparece. Conferido no código: o formulário de peça do evento
          lista os modelos no campo Tipo e, escolhido um, preenche medidas,
          material e acabamento (event-detail.tsx, "Selecionar um Modelo
          pré-preenche"); o Grupo Pai agrupa as peças no evento, na Arte e
          na Gráfica (`groupOf`). */}
      <p style={{ fontSize: FS.body, color: T.second, margin: "-8px 0 24px", lineHeight: 1.5, maxWidth: 680 }}>
        Peças padrão com medidas prontas. Ao adicionar uma peça no evento, escolher o modelo no campo Tipo já preenche medidas, material e acabamento.
      </p>

      {/* ── Filter Bar ── */}
      {/* A busca desceu do cabeçalho para cá: em Usuários, Patrocinadores e
          Logs ela abre a barra de filtros, e é onde o olho a procura. */}
      {!isLoading && standardItems.length > 0 && (
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: apertado ? "1 1 100%" : "0 1 320px" }}>
            <Search aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: T.muted }} />
            <input
              type="search"
              aria-label="Buscar modelos por nome, tipo ou grupo"
              placeholder="Buscar por nome, tipo ou grupo..."
              value={searchTerm}
              onChange={(e) => atualizar({ busca: e.target.value, pagina: 1 })}
              data-testid="input-search-models"
              style={{ width: "100%", height: toque >= 44 ? 44 : 40, padding: "0 12px 0 36px", backgroundColor: N.n3, border: "none", borderRadius: R.md, fontSize: isMobile ? FS.lead : FS.body, color: T.text, transition: "background-color 0.15s ease, box-shadow 0.15s ease" }}
              onFocus={e => { e.currentTarget.style.backgroundColor = T.surface; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
              onBlur={e => { e.currentTarget.style.backgroundColor = N.n3; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>

          {allGroups.length > 0 && (
            <SearchableSelect label="Grupo" placeholder="Todos os grupos" value={filterGroup} options={allGroups} counts={groupCounts} onChange={v => atualizar({ grupo: v, pagina: 1 })} testId="filter-group-select" />
          )}
          {allTypes.length > 0 && (
            <SearchableSelect label="Tipo" placeholder="Todos os tipos" value={filterType} options={allTypes} counts={typeCounts} onChange={v => atualizar({ tipo: v, pagina: 1 })} testId="filter-type-select" />
          )}
          {allMats.length > 0 && (
            <SearchableSelect label="Material" placeholder="Todos os materiais" value={filterMaterial} options={allMats} counts={materialCounts} onChange={v => atualizar({ material: v, pagina: 1 })} testId="filter-material-select" />
          )}
          {allFinishes.length > 0 && (
            <SearchableSelect label="Acabamento" placeholder="Todos os acabamentos" value={filterFinish} options={allFinishes} counts={finishCounts} onChange={v => atualizar({ acabamento: v, pagina: 1 })} testId="filter-finish-select" />
          )}

          {/* Limpar — o mesmo "Limpar (N)" das outras telas, e agora conta e
              desfaz a busca também (antes a busca ficava para trás). */}
          {(activeFilters > 0 || searchTerm) && (
            <Botao tamanho={tamBotao} icone={X} onClick={() => limpar()}>
              Limpar ({activeFilters + (searchTerm ? 1 : 0)})
            </Botao>
          )}
        </div>
      )}

      {/* Falha na query auxiliar do catálogo de opções: avisa sem esconder a tabela */}
      {catalogError && (
        <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 16px", backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: R.md, marginBottom: 12 }}>
          <AlertTriangle aria-hidden="true" style={{ width: 14, height: 14, color: TOM.alerta.text, flexShrink: 0 }} />
          <span style={{ fontSize: FS.meta, color: TOM.alerta.text, flex: 1, minWidth: 200 }}>
            Falha ao carregar as opções de catálogo — grupos, materiais e acabamentos podem aparecer incompletos.
          </span>
          <Botao tamanho={toque >= 44 ? "toque" : "sm"} onClick={() => refetchCatalog()}>
            Tentar novamente
          </Botao>
        </div>
      )}

      {/* ── Table Card ── */}
      {isLoading ? (
        // Esqueleto na silhueta da tabela, o mesmo das outras telas de
        // cadastro — o anel girando era o único carregamento diferente.
        <Esqueleto variante="tabela" rotulo="Carregando modelos" />
      ) : isError ? (
        // Erro NÃO é vazio: quem vê "Nenhum modelo" depois de a rede cair
        // conclui que o catálogo sumiu.
        <EstadoErro
          titulo="Não foi possível carregar os modelos"
          detalhe="Verifique sua conexão e tente novamente."
          aoTentarDeNovo={() => refetch()}
        />
      ) : standardItems.length === 0 ? (
        <EstadoVazio
          icone={Layers}
          titulo="Nenhum modelo criado"
          descricao="Crie modelos para reutilizar configurações de itens"
          acao={
            <Botao variante="primario" icone={Plus} onClick={openCreate}>
              Criar Primeiro Modelo
            </Botao>
          }
        />
      ) : (
        <div style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden" }}>

          {/* Tool strip */}
          <div style={{ padding: apertado ? "12px 16px" : "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: T.surface, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div aria-hidden="true" style={{ width: 36, height: 36, borderRadius: R.md, backgroundColor: TOM.laranja.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Layers style={{ width: 18, height: 18, color: T.accent }} />
              </div>
              <div>
                <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.text, display: "block" }}>
                  {filteredItems.length} modelo{filteredItems.length !== 1 ? "s" : ""}
                  {/* "filtrado de" valia só para a busca: com um filtro de
                      Grupo ativo, "3 modelos · Total no Catálogo" lia como se
                      o catálogo inteiro tivesse 3. */}
                  {(searchTerm || activeFilters > 0) && <span style={{ color: T.second, fontWeight: 400 }}> — filtrado de {standardItems.length}</span>}
                </span>
                <span style={{ fontSize: FS.micro, fontWeight: FW.forte, color: T.second, textTransform: "uppercase", letterSpacing: "0.08em" }}>{searchTerm || activeFilters > 0 ? "Recorte atual" : "Total no Catálogo"}</span>
              </div>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            // Uma saída só: antes havia "Limpar busca" lá no topo do card e
            // "Limpar filtros" aqui, cada um desfazendo metade do recorte — e
            // nenhum voltava a paginação para a página 1.
            <div style={{ padding: 16 }}>
              <EstadoVazio
                compacto
                icone={Search}
                titulo="Nenhum modelo encontrado"
                descricao={searchTerm && activeFilters > 0
                  ? "Nenhum modelo corresponde à busca e aos filtros atuais"
                  : searchTerm
                  ? "Tente buscar com outro termo"
                  : "Nenhum modelo encontrado com os filtros atuais"}
                acao={
                  <Botao icone={X} onClick={() => limpar()}>
                    {searchTerm && activeFilters > 0 ? "Limpar busca e filtros" : searchTerm ? "Limpar busca" : "Limpar filtros"}
                  </Botao>
                }
              />
            </div>
          ) : (
            <div className="scrollbar-visible" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: T.low, borderBottom: `1px solid ${T.border}` }}>
                    {["Nome", "Grupo", "Tipo", "Medidas", "Uso", "Material", "Acabamento", "Ações"].map(col => (
                      <th key={col} scope="col" style={{
                        padding: "12px 24px",
                        textAlign: col === "Ações" ? "right" : "left",
                        fontSize: FS.micro, fontWeight: FW.rotulo, color: T.second,
                        textTransform: "uppercase", letterSpacing: "0.16em", whiteSpace: "nowrap",
                      }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody style={{ borderTop: "none" }}>
                  {paginatedItems.map((item) => {
                    const pillStyle = tipoPillStyle(item.type || "");
                    // O realce de hover vem da classe (linha-modelo, no <style>
                    // da página): o par onMouseEnter/Leave que trocava a cor
                    // re-renderizava a tabela a cada linha.
                    return (
                      <tr
                        key={item.id}
                        data-testid={`row-model-${item.id}`}
                        className="linha-modelo"
                        style={{ borderBottom: `1px solid ${N.n3}`, transition: "background-color 0.1s" }}
                      >
                        {/* Nome */}
                        <td style={{ padding: "18px 24px", minWidth: 200 }}>
                          <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.text, display: "block" }}>{item.name}</span>
                          {item.hasVariableMeasurement && (
                            <span style={{ fontSize: FS.micro, color: T.second, marginTop: 2, display: "block" }}>Medida variável</span>
                          )}
                        </td>

                        {/* Grupo */}
                        <td style={{ padding: "18px 24px", whiteSpace: "nowrap" }}>
                          {item.group ? (
                            <Selo tom="ceu" tamanho="sm">{item.group}</Selo>
                          ) : <span style={{ color: T.second, fontSize: FS.body }}>—</span>}
                        </td>

                        {/* Tipo */}
                        <td style={{ padding: "18px 24px" }}>
                          {item.type ? (
                            <Selo tamanho="sm" cores={{ bg: pillStyle.backgroundColor, text: pillStyle.color, border: pillStyle.backgroundColor }}>
                              {item.type}
                            </Selo>
                          ) : <span style={{ color: T.second, fontSize: FS.body }}>—</span>}
                        </td>

                        {/* Medidas */}
                        <td style={{ padding: "18px 24px", whiteSpace: "nowrap" }}>
                          {item.hasVariableMeasurement ? (
                            <Selo tom="info" tamanho="sm" icone={Ruler}>Variável</Selo>
                          ) : (item.area || item.visual || item.fileWidth || item.fileHeight) ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              {(item.area || item.visual) && (
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  {/* T.apoio sobre o n3: o n7 ficaria em 4,38:1. */}
                                  <span style={{ fontSize: FS.micro, fontWeight: FW.forte, color: T.apoio, backgroundColor: N.n3, borderRadius: R.sm, padding: "1px 5px", letterSpacing: "0.06em" }}>VIS</span>
                                  <span style={{ fontSize: FS.body, fontWeight: FW.medio, color: T.text, fontFamily: FONT.mono }}>
                                    {item.area ?? "—"} × {item.visual ?? "—"}m
                                  </span>
                                </div>
                              )}
                              {(item.fileWidth || item.fileHeight) && (
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ fontSize: FS.micro, fontWeight: FW.forte, color: TOM.alerta.text, backgroundColor: TOM.alerta.bg, borderRadius: R.sm, padding: "1px 5px", letterSpacing: "0.06em" }}>ARQ</span>
                                  <span style={{ fontSize: FS.body, fontWeight: FW.medio, color: T.apoio, fontFamily: FONT.mono }}>
                                    {item.fileWidth ?? "—"} × {item.fileHeight ?? "—"}m
                                  </span>
                                  {/* A sangria, calculada — e o arquivo menor, denunciado. */}
                                  {(() => {
                                    const s = sangriaDe(item.area, item.visual, item.fileWidth, item.fileHeight);
                                    return s ? <ChipSangria s={s} testId={`chip-sangria-${item.id}`} /> : null;
                                  })()}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: FS.body, color: T.second }}>—</span>
                          )}
                        </td>

                        {/* Uso — quantas peças usam este modelo. Duas medidas,
                            rotuladas de forma diferente de propósito: "N peças"
                            é vínculo gravado (criadas a partir); "~N compatíveis"
                            é peça antiga sem vínculo que bate tipo, material e
                            medidas — compatibilidade, não origem. A tela não
                            promete o que não sabe. TOM.ceu: texto sobre o
                            próprio fundo em 5,9:1. */}
                        <td style={{ padding: "18px 24px", whiteSpace: "nowrap" }} data-testid={`cell-uso-${item.id}`}>
                          {(() => {
                            const uso = item.uso ?? { exato: 0, compativel: 0, ultimaEm: null };
                            const nenhum = uso.exato === 0 && uso.compativel === 0;
                            return (
                              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                {uso.exato > 0 ? (
                                  <Selo tom="ceu" forma="retangulo" title={`${uso.exato} ${uso.exato === 1 ? 'peça já foi criada' : 'peças já foram criadas'} a partir deste modelo; excluí-lo não altera nenhuma delas`}
                                    style={{ alignSelf: "flex-start", fontFamily: FONT.mono }}>
                                    {uso.exato} {uso.exato === 1 ? 'peça' : 'peças'}
                                  </Selo>
                                ) : nenhum ? (
                                  // TOM.neutro, e não T.second sobre o n3: aquele par ficava em 4,38:1.
                                  <Selo tom="neutro" forma="retangulo" title="Nenhuma peça foi criada a partir deste modelo — excluir não afeta nada"
                                    style={{ alignSelf: "flex-start", fontWeight: FW.medio }}>
                                    sem uso
                                  </Selo>
                                ) : null}
                                {uso.compativel > 0 && (
                                  <span title={`${uso.compativel} ${uso.compativel === 1 ? 'peça antiga' : 'peças antigas'} com o mesmo tipo, material e medidas — criadas antes de o vínculo existir. Compatibilidade, não origem.`} style={{ fontSize: FS.micro, color: T.second, fontFamily: FONT.mono }}>
                                    ~{uso.compativel} compat.
                                  </span>
                                )}
                                {uso.ultimaEm && (
                                  <span style={{ fontSize: FS.micro, color: T.second }}>última em {new Date(uso.ultimaEm).toLocaleDateString("pt-BR")}</span>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                        {/* Material */}
                        <td style={{ padding: "18px 24px" }}>
                          <span style={{ fontSize: FS.body, color: item.material ? T.apoio : T.second }}>
                            {item.material || "—"}
                          </span>
                        </td>

                        {/* Acabamento */}
                        <td style={{ padding: "18px 24px" }}>
                          <span style={{ fontSize: FS.body, color: item.finish ? T.apoio : T.second }}>
                            {item.finish || "—"}
                          </span>
                        </td>

                        {/* Ações — o gate real de escrita é o requireRole
                            (solicitacao/admin) do servidor + o guard da rota */}
                        <td style={{ padding: "18px 24px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                            <HoverIconBtn
                              icon={<Pencil style={{ width: 16, height: 16 }} />}
                              onClick={() => handleEdit(item)}
                              testId={`button-edit-model-${item.id}`}
                              title="Editar modelo"
                              ariaLabel={`Editar modelo ${item.name}`}
                              tamanho={toque}
                            />
                            <HoverIconBtn
                              icon={<Copy style={{ width: 16, height: 16 }} />}
                              onClick={() => handleDuplicate(item)}
                              testId={`button-duplicate-model-${item.id}`}
                              title="Duplicar modelo"
                              ariaLabel={`Duplicar modelo ${item.name}`}
                              tamanho={toque}
                            />
                            <HoverIconBtn
                              icon={<Trash2 style={{ width: 16, height: 16 }} />}
                              onClick={() => setDeleteConfirm(item)}
                              testId={`button-delete-model-${item.id}`}
                              title="Excluir modelo"
                              ariaLabel={`Excluir modelo ${item.name}`}
                              tamanho={toque}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginação */}
          {filteredItems.length > PAGE_SIZE && (
            <div style={{ padding: "10px 24px", borderTop: `1px solid ${T.border}`, backgroundColor: T.low, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <span style={{ fontSize: FS.small, color: T.second, fontWeight: FW.medio }}>
                Exibindo {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredItems.length)} de {filteredItems.length} modelos
              </span>
              <Paginacao pagina={safePage} totalPaginas={totalPages} onIr={setPage} toque={toque} />
            </div>
          )}
        </div>
      )}

      {/* ── Modal Criar / Editar ── */}
      <Dialog open={open} onOpenChange={open => { if (!open) requestCloseDialog(); }}>
        {/* Casca da casa (`modalSurface` + ModalHeader + ModalFooter), a mesma
            dos cadastros de Usuários e Patrocinadores. Antes: teto de 90vh,
            raio próprio, sem X desenhado e salvar em laranja. */}
        <DialogContent className={`p-0 gap-0 border-none ${HIDE_NATIVE_CLOSE}`} style={modalSurface(640)}>
          {/* POR QUE congelar aqui: este é o modal com MAIS primitivas do Radix
              do app — 4 Popover + 4 Command (com CommandInput/List/Empty/Group
              e uma CommandItem por opção do catálogo), além do título e da
              descrição. Salvar invalida /api/standard-items, fecha, zera
              `editingItem` e devolve `formData` ao EMPTY_FORM no mesmo commit:
              o título vira "Novo Modelo de Item" e os campos esvaziam à vista.
              Com esse volume de primitivas, cada render da janela de saída
              custa uma rodada de desanexa+reanexa por primitiva dentro de uma
              subárvore em desmontagem — é o pior caso do React #185 na base.
              Mecanismo por extenso em components/modal-shell.tsx. */}
          <FreezeWhileClosing open={open}>
          <DialogTitle className="sr-only">{editingItem ? "Editar modelo de item" : "Novo modelo de item"}</DialogTitle>
          <DialogDescription className="sr-only">Definição técnica do modelo: nome, tipo, grupo, medidas, material e acabamento</DialogDescription>

          {/* Header — o X passa pelo `requestCloseDialog` (guarda de descarte). */}
          <ModalHeader
            icon={editingItem ? Pencil : duplicando ? Copy : Layers}
            tint={T.accentText}
            title={editingItem ? "Editar modelo de item" : duplicando ? "Duplicar modelo de item" : "Novo modelo de item"}
            subtitle="Definição Técnica do Template"
            onClose={requestCloseDialog}
          />

          {/* Body */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }}>
            <div style={{ padding: isMobile ? "20px 18px" : "24px 28px", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>

              {/* "SALVOU?" com o modal aberto — e o aviso de que o resto do
                  formulário veio do modelo anterior (medida herdada sem aviso
                  vira peça errada). */}
              {!editingItem && criadosNestaSequencia.length > 0 && (
                <p role="status" data-testid="modelos-criados-na-sequencia" style={{ gridColumn: "1 / -1", margin: 0, padding: "9px 12px", borderRadius: 6, backgroundColor: TOM.sucesso.bg, border: `1px solid ${TOM.sucesso.border}`, fontSize: 12, lineHeight: 1.45, color: TOM.sucesso.text }}>
                  {criadosNestaSequencia.length === 1 ? "1 modelo criado" : `${criadosNestaSequencia.length} modelos criados`} nesta sequência: {criadosNestaSequencia.join(", ")}. Tipo, grupo, medidas, material e acabamento ficaram como no anterior — confira antes de salvar o próximo.
                </p>
              )}

              {/* Nome */}
              <div>
                <label htmlFor="model-name" style={labelStyle}>Nome do Modelo</label>
                <input
                  id="model-name"
                  ref={nomeRef}
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Backdrop Premium v2"
                  required
                  data-testid="input-model-name"
                  style={fieldStyle}
                />
                {/* Cada campo diz ONDE reaparece — é o que decide como
                    preenchê-lo. T.apoio sobre o branco do modal = 7,6:1.
                    A dica do começo do nome é regra, não estilo: a peça criada
                    do modelo recebe o NOME como tipo, e o Auto-vincular por
                    cota casa o grupo pelo INÍCIO do tipo (matchesGroup em
                    server/storage.ts) — "Backdrop Palco" não cai em "Palco". */}
                <p style={{ margin: "5px 2px 0", fontSize: 11, lineHeight: 1.4, color: T.apoio }}>Aparece no campo Tipo ao adicionar peça no evento. Comece pelo Tipo (ex.: “Palco Lateral”) para o Auto-vincular por cota reconhecer a peça.</p>
              </div>

              {/* Tipo — combobox: catálogo + valores já usados, com criação.
                  O texto livre gerava variações como palco/Palco/PALCO. */}
              <div>
                <label htmlFor="model-type" style={labelStyle}>
                  Tipo{" "}
                  <span style={{ fontWeight: 400, color: T.second, textTransform: "none", letterSpacing: 0 }}>(opcional)</span>
                </label>
                <Popover open={typePopoverOpen} onOpenChange={open => { setTypePopoverOpen(open); if (!open) setCustomTypeInput(""); }}>
                  <PopoverTrigger asChild>
                    <button type="button" id="model-type" data-testid="input-model-type"
                      style={{ ...fieldStyle, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", color: formData.type ? T.text : T.second }}>
                      {formData.type ? (
                        <span style={{ ...tipoPillStyle(formData.type), display: "inline-flex", alignItems: "center", borderRadius: 6, padding: "2px 10px", fontSize: 13, fontWeight: FW.medio }}>
                          {formData.type}
                        </span>
                      ) : (
                        <span>Selecionar ou criar tipo...</span>
                      )}
                      <ChevronsUpDown style={{ width: 14, height: 14, color: T.muted, flexShrink: 0, marginLeft: 4 }} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent style={{ width: 300, padding: 0 }} align="start">
                    {/* Congelado enquanto SAI: o popover fecha com o modal
                        ainda aberto — ver popover-congelado.test.ts. */}
                    <FreezeWhileClosing open={typePopoverOpen}>
                    <Command>
                      <CommandInput placeholder="Buscar ou criar tipo..." value={customTypeInput} onValueChange={setCustomTypeInput} />
                      <CommandList>
                        <CommandEmpty>
                          {customTypeInput ? (
                            <div style={{ padding: "8px 12px" }}>
                              <Botao variante="primario" tamanho="sm" larguraCheia icone={Plus} style={{ justifyContent: "flex-start" }}
                                onClick={() => { setFormData({ ...formData, type: customTypeInput }); setCustomTypeInput(""); setTypePopoverOpen(false); }}>
                                Criar "{customTypeInput}"
                              </Botao>
                            </div>
                          ) : (
                            <p style={{ padding: "12px 16px", fontSize: 13, color: T.second, margin: 0 }}>Nenhum tipo cadastrado</p>
                          )}
                        </CommandEmpty>
                        {allTypeOptions.length > 0 && (
                          <CommandGroup heading="Tipos existentes">
                            {allTypeOptions.map(t => (
                              <CommandItem key={t} value={t}
                                onSelect={() => { setFormData({ ...formData, type: t }); setCustomTypeInput(""); setTypePopoverOpen(false); }}>
                                <span style={{ ...tipoPillStyle(t), display: "inline-flex", alignItems: "center", borderRadius: 6, padding: "2px 10px", fontSize: 13, fontWeight: FW.medio, marginRight: 8 }}>
                                  {t}
                                </span>
                                <Check className={cn("ml-auto h-4 w-4", formData.type === t ? "opacity-100" : "opacity-0")} />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                        {customTypeInput && !allTypeOptions.some(t => t.toLowerCase() === customTypeInput.toLowerCase()) && (
                          <CommandGroup heading="Novo">
                            <CommandItem value={`__new__${customTypeInput}`}
                              onSelect={() => { setFormData({ ...formData, type: customTypeInput }); setCustomTypeInput(""); setTypePopoverOpen(false); }}>
                              <Plus style={{ width: 14, height: 14, marginRight: 8, color: T.apoio }} />
                              <span style={{ fontSize: 13, color: T.apoio, fontWeight: FW.medio }}>Criar "{customTypeInput}"</span>
                            </CommandItem>
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </FreezeWhileClosing>
                  </PopoverContent>
                </Popover>
                {formData.type && (
                  <Botao variante="fantasma" tamanho="sm" onClick={() => setFormData({ ...formData, type: "" })} style={LIMPAR_CAMPO}>
                    Limpar
                  </Botao>
                )}
                {/* /api/quota-rules/groups lista o `type` dos modelos: é daqui
                    que nasce a linha da grade de Configurar Cotas. */}
                <p style={{ margin: "5px 2px 0", fontSize: 11, lineHeight: 1.4, color: T.apoio }}>Vira uma linha em Configurar Cotas (ex.: Palco, Pórtico).</p>
              </div>

              {/* Grupo Pai */}
              <div>
                <label htmlFor="model-group" style={labelStyle}>
                  Grupo Pai{" "}
                  <span style={{ fontWeight: 400, color: T.second, textTransform: "none", letterSpacing: 0 }}>(opcional)</span>
                </label>
                <Popover open={groupPopoverOpen} onOpenChange={open => { setGroupPopoverOpen(open); if (!open) setCustomGroupInput(""); }}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      id="model-group"
                      data-testid="input-model-group"
                      style={{
                        ...fieldStyle,
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        cursor: "pointer",
                        color: formData.group ? T.text : T.second,
                      }}
                    >
                      {formData.group ? (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          backgroundColor: TOM.info.border, color: TOM.info.text,
                          borderRadius: 6, padding: "2px 10px 2px 8px",
                          fontSize: 13, fontWeight: FW.forte,
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: TOM.info.dot, flexShrink: 0 }} />
                          {formData.group}
                        </span>
                      ) : (
                        <span>Selecionar ou criar grupo...</span>
                      )}
                      <ChevronsUpDown style={{ width: 14, height: 14, color: T.muted, flexShrink: 0, marginLeft: 4 }} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent style={{ width: 300, padding: 0 }} align="start">
                    {/* Congelado enquanto SAI: o popover fecha com o modal
                        ainda aberto — ver popover-congelado.test.ts. */}
                    <FreezeWhileClosing open={groupPopoverOpen}>
                    <Command>
                      <CommandInput
                        placeholder="Buscar ou criar grupo..."
                        value={customGroupInput}
                        onValueChange={setCustomGroupInput}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {customGroupInput ? (
                            <div style={{ padding: "8px 12px" }}>
                              <Botao variante="primario" tamanho="sm" larguraCheia icone={Plus} style={{ justifyContent: "flex-start" }}
                                onClick={() => { setFormData({ ...formData, group: customGroupInput }); setCustomGroupInput(""); setGroupPopoverOpen(false); }}>
                                Criar grupo "{customGroupInput}"
                              </Botao>
                            </div>
                          ) : (
                            <p style={{ padding: "12px 16px", fontSize: 13, color: T.second, margin: 0 }}>Nenhum grupo cadastrado</p>
                          )}
                        </CommandEmpty>
                        {allGroups.length > 0 && (
                          <CommandGroup heading="Grupos existentes">
                            {allGroups.map(g => (
                              <CommandItem
                                key={g}
                                value={g}
                                onSelect={() => { setFormData({ ...formData, group: g }); setCustomGroupInput(""); setGroupPopoverOpen(false); }}
                              >
                                <span style={{
                                  display: "inline-flex", alignItems: "center", gap: 6,
                                  backgroundColor: formData.group === g ? TOM.info.border : TOM.ceu.bg,
                                  color: TOM.info.text, borderRadius: 6,
                                  padding: "2px 10px 2px 8px", fontSize: 13, fontWeight: FW.medio,
                                  marginRight: 8,
                                }}>
                                  <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: TOM.info.dot, flexShrink: 0 }} />
                                  {g}
                                </span>
                                <Check className={cn("ml-auto h-4 w-4", formData.group === g ? "opacity-100" : "opacity-0")} />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                        {customGroupInput && allGroups.some(g => g.toLowerCase() === customGroupInput.toLowerCase()) === false && (
                          <CommandGroup heading="Novo">
                            <CommandItem
                              value={`__new__${customGroupInput}`}
                              onSelect={() => { setFormData({ ...formData, group: customGroupInput }); setCustomGroupInput(""); setGroupPopoverOpen(false); }}
                            >
                              <Plus style={{ width: 14, height: 14, marginRight: 8, color: TOM.info.text }} />
                              <span style={{ fontSize: 13, color: TOM.info.text, fontWeight: FW.medio }}>Criar "{customGroupInput}"</span>
                            </CommandItem>
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </FreezeWhileClosing>
                  </PopoverContent>
                </Popover>
                {formData.group && (
                  <Botao variante="fantasma" tamanho="sm" onClick={() => setFormData({ ...formData, group: "" })} style={LIMPAR_CAMPO}>
                    Limpar
                  </Botao>
                )}
                <p style={{ margin: "5px 2px 0", fontSize: 11, lineHeight: 1.4, color: T.apoio }}>Agrupa as peças nas listas do evento, da Arte e da Gráfica.</p>
              </div>

              {/* Toggle Medida Variável — col-span-2 */}
              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", paddingBottom: 4 }}>
                {/* Interruptor desenhado com <div>: não havia campo por trás,
                    então alternar "medida variável" era exclusivamente com
                    mouse. role="switch" dá o papel que a aparência promete e
                    aria-checked informa o estado. */}
                <label
                  role="switch"
                  tabIndex={0}
                  aria-checked={formData.hasVariableMeasurement}
                  aria-label="Medida variável"
                  onClick={() => setFormData({ ...formData, hasVariableMeasurement: !formData.hasVariableMeasurement })}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setFormData({ ...formData, hasVariableMeasurement: !formData.hasVariableMeasurement });
                    }
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                >
                  <div
                    style={{ position: "relative", width: 40, height: 22, borderRadius: 999, backgroundColor: formData.hasVariableMeasurement ? T.accent : T.bdark, transition: "background-color 0.2s", cursor: "pointer", flexShrink: 0 }}
                  >
                    <div style={{ position: "absolute", top: 3, left: formData.hasVariableMeasurement ? 21 : 3, width: 16, height: 16, borderRadius: "50%", backgroundColor: T.surface, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                  </div>
                  <span style={{ fontSize: FS.small, fontWeight: FW.forte, color: T.apoio, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Medida Variável
                  </span>
                </label>
              </div>

              {/* ── Medidas visuais ── */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ ...labelStyle, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  Medidas Visuais
                  <span style={{ fontSize: FS.micro, fontWeight: FW.forte, color: T.apoio, backgroundColor: N.n3, borderRadius: R.sm, padding: "2px 6px", letterSpacing: "0.06em" }}>VIS.</span>
                  {/* VIS × ARQ era sigla sem legenda para quem chega. */}
                  <span style={{ fontSize: FS.micro, fontWeight: FW.corpo, color: T.second, textTransform: "none", letterSpacing: 0 }}>— o que aparece na peça montada</span>
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label htmlFor="model-vis-w" style={{ ...labelStyle, color: T.second }}>Largura — VIS. L (m)</label>
                    <input
                      id="model-vis-w"
                      type="number" step="0.01" min="0"
                      value={formData.area}
                      onChange={e => {
                        const v = e.target.value;
                        // auto-sync ARQ.L if it was empty or matched the old visual value
                        const autoSync = !formData.fileWidth || formData.fileWidth === formData.area;
                        setFormData(prev => ({ ...prev, area: v, fileWidth: autoSync ? v : prev.fileWidth }));
                      }}
                      placeholder="0.00"
                      disabled={formData.hasVariableMeasurement}
                      data-testid="input-model-area"
                      style={{ ...fieldStyle, opacity: formData.hasVariableMeasurement ? 0.5 : 1, cursor: formData.hasVariableMeasurement ? "not-allowed" : "text" }}
                    />
                  </div>
                  <div>
                    <label htmlFor="model-vis-h" style={{ ...labelStyle, color: T.second }}>Altura — VIS. A (m)</label>
                    <input
                      id="model-vis-h"
                      type="number" step="0.01" min="0"
                      value={formData.visual}
                      onChange={e => {
                        const v = e.target.value;
                        const autoSync = !formData.fileHeight || formData.fileHeight === formData.visual;
                        setFormData(prev => ({ ...prev, visual: v, fileHeight: autoSync ? v : prev.fileHeight }));
                      }}
                      placeholder="0.00"
                      disabled={formData.hasVariableMeasurement}
                      data-testid="input-model-visual"
                      style={{ ...fieldStyle, opacity: formData.hasVariableMeasurement ? 0.5 : 1, cursor: formData.hasVariableMeasurement ? "not-allowed" : "text" }}
                    />
                  </div>
                </div>
              </div>

              {/* ── Medidas do arquivo ── */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ ...labelStyle, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  Medidas do Arquivo
                  <span style={{ fontSize: FS.micro, fontWeight: FW.forte, color: TOM.alerta.text, backgroundColor: TOM.alerta.bg, borderRadius: R.sm, padding: "2px 6px", letterSpacing: "0.06em" }}>ARQ.</span>
                  <span style={{ fontSize: FS.micro, fontWeight: FW.corpo, color: T.second, textTransform: "none", letterSpacing: 0 }}>— o que vai para impressão, com a sangria; pré-preenchido igual ao visual</span>
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label htmlFor="model-arq-w" style={{ ...labelStyle, color: T.second }}>Largura — ARQ. L (m)</label>
                    <input
                      id="model-arq-w"
                      type="number" step="0.01" min="0"
                      value={formData.fileWidth}
                      onChange={e => setFormData({ ...formData, fileWidth: e.target.value })}
                      onBlur={() => setArqTocado(true)}
                      placeholder="0.00"
                      disabled={formData.hasVariableMeasurement}
                      data-testid="input-model-fileWidth"
                      style={{ ...fieldStyle, opacity: formData.hasVariableMeasurement ? 0.5 : 1, cursor: formData.hasVariableMeasurement ? "not-allowed" : "text" }}
                    />
                  </div>
                  <div>
                    <label htmlFor="model-arq-h" style={{ ...labelStyle, color: T.second }}>Altura — ARQ. A (m)</label>
                    <input
                      id="model-arq-h"
                      type="number" step="0.01" min="0"
                      value={formData.fileHeight}
                      onChange={e => setFormData({ ...formData, fileHeight: e.target.value })}
                      onBlur={() => setArqTocado(true)}
                      placeholder="0.00"
                      disabled={formData.hasVariableMeasurement}
                      data-testid="input-model-fileHeight"
                      style={{ ...fieldStyle, opacity: formData.hasVariableMeasurement ? 0.5 : 1, cursor: formData.hasVariableMeasurement ? "not-allowed" : "text" }}
                    />
                  </div>
                </div>
                {/* A MESMA conta da tabela, aqui: o aviso no formulário evita o
                    cadastro errado; na tabela só o denuncia depois. Não bloqueia
                    — há recorte legítimo — mas exige que a pessoa veja. */}
                {sangriaDoForm && (arqTocado || sangriaDoForm.estado !== "ok") && (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <ChipSangria s={sangriaDoForm} testId="chip-sangria-form" />
                    {sangriaDoForm.estado === "sem" && (
                      <span style={{ fontSize: 11, color: TOM.alerta.text }}>Arquivo igual ao visual: sem margem para o refile.</span>
                    )}
                  </div>
                )}
                {mostrarAvisoDeCorte && (
                  <div role="alert" data-testid="aviso-arquivo-menor" style={{ marginTop: 8, padding: "10px 12px", borderRadius: 8, backgroundColor: TOM.perigo.bg, border: `1px solid ${TOM.perigo.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
                    <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: TOM.perigo.text }}>
                      <strong>O arquivo é menor que o visual</strong> — a peça sairia cortada. Confira o cadastro antes de salvar.
                    </p>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: TOM.perigo.text, cursor: "pointer" }}>
                      <input type="checkbox" checked={cienteDoCorte} onChange={e => setCienteDoCorte(e.target.checked)} data-testid="checkbox-ciente-do-corte" />
                      Entendi — o recorte é intencional, salvar assim mesmo
                    </label>
                  </div>
                )}
              </div>

              {/* Material */}
              <div>
                {/* "(opcional)" como em Tipo e Grupo: os quatro campos vão
                    nulos quando vazios, e só dois deles diziam isso. */}
                <label htmlFor="model-material" style={labelStyle}>
                  Material Base{" "}
                  <span style={{ fontWeight: 400, color: T.second, textTransform: "none", letterSpacing: 0 }}>(opcional)</span>
                </label>
                <Popover open={materialPopoverOpen} onOpenChange={open => { setMaterialPopoverOpen(open); if (!open) setCustomMaterialInput(""); }}>
                  <PopoverTrigger asChild>
                    <button type="button" id="model-material" data-testid="input-model-material"
                      style={{ ...fieldStyle, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", color: formData.material ? T.text : T.second }}>
                      {formData.material ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, backgroundColor: TOM.laranja.bg, color: T.accentText, borderRadius: 6, padding: "2px 10px 2px 8px", fontSize: 13, fontWeight: FW.medio }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: T.accent, flexShrink: 0 }} />
                          {formData.material}
                        </span>
                      ) : (
                        <span>Selecionar ou criar material...</span>
                      )}
                      <ChevronsUpDown style={{ width: 14, height: 14, color: T.muted, flexShrink: 0, marginLeft: 4 }} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent style={{ width: 300, padding: 0 }} align="start">
                    {/* Congelado enquanto SAI: o popover fecha com o modal
                        ainda aberto — ver popover-congelado.test.ts. */}
                    <FreezeWhileClosing open={materialPopoverOpen}>
                    <Command>
                      <CommandInput placeholder="Buscar ou criar material..." value={customMaterialInput} onValueChange={setCustomMaterialInput} />
                      <CommandList>
                        <CommandEmpty>
                          {customMaterialInput ? (
                            <div style={{ padding: "8px 12px" }}>
                              <Botao variante="primario" tamanho="sm" larguraCheia icone={Plus} style={{ justifyContent: "flex-start" }}
                                onClick={() => { setFormData({ ...formData, material: customMaterialInput }); setCustomMaterialInput(""); setMaterialPopoverOpen(false); }}>
                                Criar "{customMaterialInput}"
                              </Botao>
                            </div>
                          ) : (
                            <p style={{ padding: "12px 16px", fontSize: 13, color: T.second, margin: 0 }}>Nenhum material cadastrado</p>
                          )}
                        </CommandEmpty>
                        {allMats.length > 0 && (
                          <CommandGroup heading="Materiais existentes">
                            {allMats.map(m => (
                              <CommandItem key={m} value={m}
                                onSelect={() => { setFormData({ ...formData, material: m }); setCustomMaterialInput(""); setMaterialPopoverOpen(false); }}>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, backgroundColor: formData.material === m ? TOM.laranja.border : TOM.laranja.bg, color: T.accentText, borderRadius: 6, padding: "2px 10px 2px 8px", fontSize: 13, fontWeight: FW.medio, marginRight: 8 }}>
                                  <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: T.accent, flexShrink: 0 }} />
                                  {m}
                                </span>
                                <Check className={cn("ml-auto h-4 w-4", formData.material === m ? "opacity-100" : "opacity-0")} />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                        {customMaterialInput && !allMats.some(m => m.toLowerCase() === customMaterialInput.toLowerCase()) && (
                          <CommandGroup heading="Novo">
                            <CommandItem value={`__new__${customMaterialInput}`}
                              onSelect={() => { setFormData({ ...formData, material: customMaterialInput }); setCustomMaterialInput(""); setMaterialPopoverOpen(false); }}>
                              {/* T.accentText: o laranja anterior dava 3,6:1 no texto. */}
                              <Plus style={{ width: 14, height: 14, marginRight: 8, color: T.accentText }} />
                              <span style={{ fontSize: 13, color: T.accentText, fontWeight: FW.medio }}>Criar "{customMaterialInput}"</span>
                            </CommandItem>
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </FreezeWhileClosing>
                  </PopoverContent>
                </Popover>
                {formData.material && (
                  <Botao variante="fantasma" tamanho="sm" onClick={() => setFormData({ ...formData, material: "" })} style={LIMPAR_CAMPO}>
                    Limpar
                  </Botao>
                )}
              </div>

              {/* Acabamento */}
              <div>
                <label htmlFor="model-finish" style={labelStyle}>
                  Acabamento{" "}
                  <span style={{ fontWeight: 400, color: T.second, textTransform: "none", letterSpacing: 0 }}>(opcional)</span>
                </label>
                <Popover open={finishPopoverOpen} onOpenChange={open => { setFinishPopoverOpen(open); if (!open) setCustomFinishInput(""); }}>
                  <PopoverTrigger asChild>
                    <button type="button" id="model-finish" data-testid="input-model-finish"
                      style={{ ...fieldStyle, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", color: formData.finish ? T.text : T.second }}>
                      {formData.finish ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, backgroundColor: N.n3, color: T.apoio, borderRadius: 6, padding: "2px 10px 2px 8px", fontSize: 13, fontWeight: FW.medio }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: T.muted, flexShrink: 0 }} />
                          {formData.finish}
                        </span>
                      ) : (
                        <span>Selecionar ou criar acabamento...</span>
                      )}
                      <ChevronsUpDown style={{ width: 14, height: 14, color: T.muted, flexShrink: 0, marginLeft: 4 }} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent style={{ width: 300, padding: 0 }} align="start">
                    {/* Congelado enquanto SAI: o popover fecha com o modal
                        ainda aberto — ver popover-congelado.test.ts. */}
                    <FreezeWhileClosing open={finishPopoverOpen}>
                    <Command>
                      <CommandInput placeholder="Buscar ou criar acabamento..." value={customFinishInput} onValueChange={setCustomFinishInput} />
                      <CommandList>
                        <CommandEmpty>
                          {customFinishInput ? (
                            <div style={{ padding: "8px 12px" }}>
                              <Botao variante="primario" tamanho="sm" larguraCheia icone={Plus} style={{ justifyContent: "flex-start" }}
                                onClick={() => { setFormData({ ...formData, finish: customFinishInput }); setCustomFinishInput(""); setFinishPopoverOpen(false); }}>
                                Criar "{customFinishInput}"
                              </Botao>
                            </div>
                          ) : (
                            <p style={{ padding: "12px 16px", fontSize: 13, color: T.second, margin: 0 }}>Nenhum acabamento cadastrado</p>
                          )}
                        </CommandEmpty>
                        {allFinishes.length > 0 && (
                          <CommandGroup heading="Acabamentos existentes">
                            {allFinishes.map(f => (
                              <CommandItem key={f} value={f}
                                onSelect={() => { setFormData({ ...formData, finish: f }); setCustomFinishInput(""); setFinishPopoverOpen(false); }}>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, backgroundColor: formData.finish === f ? T.border : N.n3, color: T.apoio, borderRadius: 6, padding: "2px 10px 2px 8px", fontSize: 13, fontWeight: FW.medio, marginRight: 8 }}>
                                  <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: T.muted, flexShrink: 0 }} />
                                  {f}
                                </span>
                                <Check className={cn("ml-auto h-4 w-4", formData.finish === f ? "opacity-100" : "opacity-0")} />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                        {customFinishInput && !allFinishes.some(f => f.toLowerCase() === customFinishInput.toLowerCase()) && (
                          <CommandGroup heading="Novo">
                            <CommandItem value={`__new__${customFinishInput}`}
                              onSelect={() => { setFormData({ ...formData, finish: customFinishInput }); setCustomFinishInput(""); setFinishPopoverOpen(false); }}>
                              <Plus style={{ width: 14, height: 14, marginRight: 8, color: T.second }} />
                              <span style={{ fontSize: 13, color: T.second, fontWeight: FW.medio }}>Criar "{customFinishInput}"</span>
                            </CommandItem>
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </FreezeWhileClosing>
                  </PopoverContent>
                </Popover>
                {formData.finish && (
                  <Botao variante="fantasma" tamanho="sm" onClick={() => setFormData({ ...formData, finish: "" })} style={LIMPAR_CAMPO}>
                    Limpar
                  </Botao>
                )}
              </div>

            </div>

            {/* Footer — primário ESCURO, como o de todo cadastro. O laranja
                cheio daqui era o único botão de salvar laranja do app. */}
            <ModalFooter>
              <Botao type="submit" variante="primario" tamanho="toque"
                carregando={createStandardItemMutation.isPending}
                data-testid="button-submit-model"
                onClick={() => { continuarRef.current = false; }}
              >
                {createStandardItemMutation.isPending
                  ? (editingItem ? "Atualizando…" : "Criando…")
                  : (editingItem ? "Salvar alterações" : "Salvar modelo")}
              </Botao>
              {/* Só na criação (e na duplicação, que também cria): mesmo
                  submit, sem fechar o modal. */}
              {!editingItem && (
                <Botao type="submit" variante="secundario" tamanho="toque"
                  disabled={createStandardItemMutation.isPending}
                  data-testid="button-submit-model-e-outro"
                  onClick={() => { continuarRef.current = true; }}
                >
                  Salvar e cadastrar outro
                </Botao>
              )}
              <Botao variante="fantasma" tamanho="toque" onClick={requestCloseDialog}>
                {/* Depois de criar na sequência, "Cancelar" sugeria desfazer. */}
                {criadosNestaSequencia.length > 0 && !editingItem ? "Fechar" : "Cancelar"}
              </Botao>
            </ModalFooter>
          </form>
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>

      {/* ── Manage Categories Modal ── */}
      <Dialog open={manageOpen} onOpenChange={o => { if (!o) { setManageOpen(false); setMgEditingGroup(null); setMgEditingFinish(null); setMgEditingMaterial(null); } }}>
        {/* HIDE_NATIVE_CLOSE: o cabeçalho deste modal desenha o próprio X (o
            que também limpa os seis estados de edição pendentes), e o
            DialogContent base já renderiza um X no canto — ficavam DOIS botões
            de fechar sobrepostos, e o de cima fechava sem limpar nada. Mesmo
            defeito que o cadastro de patrocinador tinha. */}
        <DialogContent className={`p-0 gap-0 border-none ${HIDE_NATIVE_CLOSE}`} style={modalSurface(580)}>
          <DialogTitle className="sr-only">Gerenciar categorias</DialogTitle>
          <DialogDescription className="sr-only">Grupos, materiais e acabamentos usados nos modelos</DialogDescription>


          {manageOpen && (
          <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, overflow: "hidden" }}>

            {/* Header — cabeçalho da casa, o mesmo do formulário de modelo. O X
                também limpa os seis estados de edição pendentes. */}
            <ModalHeader
              icon={Settings}
              tint={T.accentText}
              title="Gerenciar categorias"
              subtitle="Renomeie ou remova categorias dos modelos em lote"
              onClose={() => { setManageOpen(false); setMgEditingGroup(null); setMgEditingFinish(null); setMgEditingMaterial(null); setMgDeleteGroupConfirm(null); setMgDeleteFinishConfirm(null); setMgDeleteMaterialConfirm(null); }}
            />
            <div style={{ padding: isMobile ? "12px 16px 0" : "16px 28px 0", flexShrink: 0, overflowX: "auto" }}>

              {/* Abas da casa: setas/Home/End e roving tabindex vêm do
                  componente. newCatValue zera na troca: o rascunho digitado
                  numa aba não pode virar cadastro acidental em outra. */}
              <Abas
                rotuloDaLista="Tipo de categoria"
                prefixoDeTestId="tab-categoria"
                ativo={manageTab}
                aoTrocar={id => { setManageTab(id as "group" | "material" | "finish"); setNewCatValue(""); setMgEditingGroup(null); setMgEditingFinish(null); setMgEditingMaterial(null); setMgDeleteGroupConfirm(null); setMgDeleteFinishConfirm(null); setMgDeleteMaterialConfirm(null); }}
                itens={[
                  { id: "group",    rotulo: "Grupos Pai", contador: allGroups.length },
                  { id: "material", rotulo: "Material",   contador: allMats.length },
                  { id: "finish",   rotulo: "Acabamento", contador: allFinishes.length },
                ]}
              />
            </div>

            {/* Body — scrollable list */}
            <div style={{ overflowY: "auto", padding: isMobile ? "12px 16px 20px" : "16px 28px 24px", flex: "1 1 auto", minHeight: 0 }}>
              {(() => {
                const tabCfg = {
                  group:    { items: allGroups,   color: TOM.ceu.text, bg: TOM.ceu.border, empty: "Nenhum grupo cadastrado." },
                  material: { items: allMats,      color: TOM.alerta.text, bg: TOM.alerta.bg, empty: "Nenhum material cadastrado." },
                  finish:   { items: allFinishes,  color: TOM.sucesso.text, bg: TOM.sucesso.bg, empty: "Nenhum acabamento cadastrado." },
                }[manageTab];

                const addLabel = manageTab === "group" ? "grupo" : manageTab === "material" ? "material" : "acabamento";
                const submitNew = () => {
                  const v = newCatValue.trim();
                  if (!v) return;
                  // Duplicata avisa em vez de sumir com o texto: o silêncio
                  // parecia "adicionou" (ou "quebrou") — e mantém o digitado
                  // para a pessoa corrigir.
                  if (tabCfg.items.some(i => i.toLowerCase() === v.toLowerCase())) {
                    toast({ title: "Opção já cadastrada", description: `"${v}" já existe em ${addLabel === "grupo" ? "grupos" : addLabel === "material" ? "materiais" : "acabamentos"}.`, variant: "warning" });
                    return;
                  }
                  createCatalogOptionMutation.mutate({ kind: manageTab, value: v });
                  setNewCatValue("");
                };

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 4 }}>
                    {/* Adicionar nova opção */}
                    <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                      <input
                        value={newCatValue}
                        onChange={e => setNewCatValue(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submitNew(); } }}
                        placeholder={`Adicionar ${addLabel}...`}
                        data-testid="input-new-catalog-option"
                        aria-label={`Nome do novo ${addLabel}`}
                        style={{ flex: 1, minWidth: 0, height: toque >= 44 ? 44 : 40, padding: "0 12px", borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.bg, fontSize: isMobile ? FS.lead : FS.body, color: T.text }}
                      />
                      {/* O motivo do desabilitado fica VISÍVEL embaixo do
                          botão: apagado sem frase lê-se como app travado. */}
                      <Botao variante="primario" tamanho={toque >= 44 ? "toque" : "md"} icone={Plus} onClick={submitNew}
                        carregando={createCatalogOptionMutation.isPending}
                        disabled={!newCatValue.trim()}
                        motivo={!newCatValue.trim() ? "Digite um nome" : undefined}
                        alinharMotivo="end"
                        data-testid="button-add-catalog-option"
                        style={{ minHeight: toque >= 44 ? 44 : 40 }}>
                        Adicionar
                      </Botao>
                    </div>

                    {tabCfg.items.length === 0 && (
                      <p style={{ fontSize: FS.body, color: T.second, margin: "12px 0", textAlign: "center" }}>{tabCfg.empty}</p>
                    )}
                    {tabCfg.items.map(name => {
                      const count = manageTab === "group"
                        ? standardItems.filter(s => s.group === name).length
                        : manageTab === "material"
                        ? standardItems.filter(s => s.material === name).length
                        : standardItems.filter(s => s.finish === name).length;

                      if (manageTab === "group") return (
                        <CatRow key={name} name={name} count={count} accentColor={tabCfg.color} accentBg={tabCfg.bg} toque={toque}
                          isEditing={mgEditingGroup === name} editValue={mgEditGroupValue} onEditChange={setMgEditGroupValue}
                          onEditConfirm={() => { const t = mgEditGroupValue.trim(); if (t && t !== name) renameGroupMutation.mutate({ oldName: name, newName: t }); else setMgEditingGroup(null); }}
                          onEditCancel={() => setMgEditingGroup(null)} isPendingRename={renameGroupMutation.isPending}
                          isDeleting={mgDeleteGroupConfirm === name}
                          onDeleteConfirm={() => deleteGroupMutation.mutate(name, {
                            onSuccess: () => deleteCatalogOptionMutation.mutate({ kind: "group", value: name }, {
                              onSuccess: () => toast({ title: "Grupo removido", description: `"${name}" foi removido de todos os modelos`, variant: "success" }),
                            }),
                          })} onDeleteCancel={() => setMgDeleteGroupConfirm(null)} isPendingDelete={deleteGroupMutation.isPending}
                          onStartEdit={() => { setMgEditingGroup(name); setMgEditGroupValue(name); setMgDeleteGroupConfirm(null); }}
                          onStartDelete={() => { setMgDeleteGroupConfirm(name); setMgEditingGroup(null); }}
                        />
                      );
                      if (manageTab === "material") return (
                        <CatRow key={name} name={name} count={count} accentColor={tabCfg.color} accentBg={tabCfg.bg} toque={toque}
                          isEditing={mgEditingMaterial === name} editValue={mgEditMaterialValue} onEditChange={setMgEditMaterialValue}
                          onEditConfirm={() => { const t = mgEditMaterialValue.trim(); if (t && t !== name) renameMaterialMutation.mutate({ oldName: name, newName: t }); else setMgEditingMaterial(null); }}
                          onEditCancel={() => setMgEditingMaterial(null)} isPendingRename={renameMaterialMutation.isPending}
                          isDeleting={mgDeleteMaterialConfirm === name}
                          onDeleteConfirm={() => deleteMaterialMutation.mutate(name, {
                            onSuccess: () => deleteCatalogOptionMutation.mutate({ kind: "material", value: name }, {
                              onSuccess: () => toast({ title: "Material removido", description: `"${name}" foi removido de todos os modelos`, variant: "success" }),
                            }),
                          })} onDeleteCancel={() => setMgDeleteMaterialConfirm(null)} isPendingDelete={deleteMaterialMutation.isPending}
                          onStartEdit={() => { setMgEditingMaterial(name); setMgEditMaterialValue(name); setMgDeleteMaterialConfirm(null); }}
                          onStartDelete={() => { setMgDeleteMaterialConfirm(name); setMgEditingMaterial(null); }}
                        />
                      );
                      return (
                        <CatRow key={name} name={name} count={count} accentColor={tabCfg.color} accentBg={tabCfg.bg} toque={toque}
                          isEditing={mgEditingFinish === name} editValue={mgEditFinishValue} onEditChange={setMgEditFinishValue}
                          onEditConfirm={() => { const t = mgEditFinishValue.trim(); if (t && t !== name) renameFinishMutation.mutate({ oldName: name, newName: t }); else setMgEditingFinish(null); }}
                          onEditCancel={() => setMgEditingFinish(null)} isPendingRename={renameFinishMutation.isPending}
                          isDeleting={mgDeleteFinishConfirm === name}
                          onDeleteConfirm={() => deleteFinishMutation.mutate(name, {
                            onSuccess: () => deleteCatalogOptionMutation.mutate({ kind: "finish", value: name }, {
                              onSuccess: () => toast({ title: "Acabamento removido", description: `"${name}" foi removido de todos os modelos`, variant: "success" }),
                            }),
                          })} onDeleteCancel={() => setMgDeleteFinishConfirm(null)} isPendingDelete={deleteFinishMutation.isPending}
                          onStartEdit={() => { setMgEditingFinish(name); setMgEditFinishValue(name); setMgDeleteFinishConfirm(null); }}
                          onStartDelete={() => { setMgDeleteFinishConfirm(name); setMgEditingFinish(null); }}
                        />
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      {/* Confirmação da casa (variante `confirm`): a MESMA casca das exclusões
          de Usuários e Patrocinadores. Era o AlertDialog genérico do shadcn,
          com um vermelho que reprovava AA e o "Cancelar" à esquerda — um terceiro
          desenho de "tem certeza?" entre três telas vizinhas. Uma diferença de
          comportamento também saiu: o AlertDialogAction fechava o diálogo NO
          CLIQUE, antes de a exclusão responder; agora ele fica aberto com
          "Excluindo…" e fecha no sucesso (quem fecha é o onSuccess, que já
          zerava `deleteConfirm`). */}
      <Dialog open={!!deleteConfirm} onOpenChange={o => { if (!o) setDeleteConfirm(null); }}>
        <DialogContent
          className={`p-0 gap-0 border-none ${HIDE_NATIVE_CLOSE}`}
          style={modalSurface(440)}
          // Foco inicial no "Manter": o Enter distraído recua, não exclui.
          onOpenAutoFocus={e => { e.preventDefault(); document.querySelector<HTMLButtonElement>('[data-testid="button-cancel-delete-model"]')?.focus(); }}
        >
          {/* Congelado enquanto sai: o onSuccess zera `deleteConfirm`, que é o
              mesmo estado que desenha o corpo — sem congelar, o nome some no
              primeiro frame do fade. */}
          <FreezeWhileClosing open={!!deleteConfirm}>
          <DialogTitle className="sr-only">Excluir modelo</DialogTitle>
          <DialogDescription className="sr-only">Confirme a exclusão do modelo</DialogDescription>
          {deleteConfirm && (
            <>
              <ModalHeader
                icon={Trash2}
                variant="confirm"
                tint={TOM.perigo.text}
                title={`Excluir ${deleteConfirm.name}?`}
                subtitle="Esta ação não pode ser desfeita."
                onClose={() => setDeleteConfirm(null)}
              />
              <div style={{ padding: "16px 24px", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
                {/* O IMPACTO, que a coluna Uso já sabia: a pergunta "posso
                    excluir?" é respondida aqui, não num tooltip da tabela. */}
                {(() => {
                  const exato = deleteConfirm.uso?.exato ?? 0;
                  return (
                    <p data-testid="delete-model-impacto" style={{ margin: 0, padding: "9px 12px", borderRadius: R.sm, fontSize: 12, lineHeight: 1.5, backgroundColor: N.n3, border: `1px solid ${T.border}`, color: T.apoio }}>
                      {exato > 0
                        ? `${exato} ${exato === 1 ? "peça foi criada" : "peças foram criadas"} a partir dele — ${exato === 1 ? "ela continua" : "elas continuam"} como estão.`
                        : "Nenhuma peça foi criada a partir dele."}
                    </p>
                  );
                })()}
              </div>
              <ModalFooter>
                <Botao
                  variante="perigo"
                  tamanho="toque"
                  onClick={() => deleteStandardItemMutation.mutate(deleteConfirm.id)}
                  carregando={deleteStandardItemMutation.isPending}
                  data-testid="button-confirm-delete-model"
                >
                  {deleteStandardItemMutation.isPending ? "Excluindo…" : "Sim, excluir"}
                </Botao>
                <Botao
                  variante="fantasma"
                  tamanho="toque"
                  data-testid="button-cancel-delete-model"
                  onClick={() => setDeleteConfirm(null)}
                >
                  Manter
                </Botao>
              </ModalFooter>
            </>
          )}
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>
      {dialogo}
    </div>
  );
}

/* ── Ação de linha, só com ícone ──
   É o <Botao> fantasma: o realce de hover E de foco de teclado vem da classe
   .ds-botao-fantasma. Antes um estado `hovered`, ligado por mouse e foco,
   pintava cada ação de uma cor — e re-renderizava a linha a cada passada. */
function HoverIconBtn({ icon, onClick, testId, title, ariaLabel, tamanho = 32 }: {
  icon: React.ReactNode;
  onClick: () => void; testId: string; title: string; ariaLabel?: string;
  /** 32 no mouse, 44 no dedo — o alvo de toque das outras tabelas. */
  tamanho?: number;
}) {
  return (
    <Botao variante="fantasma" tamanho={tamanho >= 44 ? "toque" : "sm"} onClick={onClick}
      data-testid={testId} title={title} aria-label={ariaLabel ?? title}
      style={{ width: tamanho, minHeight: tamanho, padding: 0 }}>
      {icon}
    </Botao>
  );
}
