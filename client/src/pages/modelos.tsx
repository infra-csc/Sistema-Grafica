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
import { EstadoVazio } from "@/components/ui/estados";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFiltrosNaUrl, paginaValida } from "@/hooks/use-filtros-na-url";
import { TIPOS_DE_PECA } from "@shared/molde";

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
        height: 40, padding: "0 12px", fontSize: 12, fontWeight: 700, color: T.second,
        backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md,
      }}
    />
  );
}

/* ── Desenho comum das telas de cadastro ──
   Usuários, Patrocinadores, Modelos e Logs repetem estes controles com as
   MESMAS medidas (40px de alvo, raio 8, rótulo 12/800 em caixa alta). Esta
   tela era a que mais destoava: raio 12, botão de salvar LARANJA e busca no
   cabeçalho. Copiado (e não importado) porque cada tela é dona do próprio
   arquivo; se mudar aqui, mude nas outras três. */
const BTN_PRIMARIO: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
  height: 40, padding: "0 18px", backgroundColor: T.dark, color: T.surface,
  border: "none", borderRadius: R.md, cursor: "pointer",
  fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em",
  whiteSpace: "nowrap", transition: "background-color 0.15s ease",
};
const BTN_LIMPAR: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px",
  backgroundColor: TOM.perigo.bg, border: `1px solid ${TOM.perigo.border}`, borderRadius: R.md, cursor: "pointer",
  fontSize: 11, fontWeight: 800, color: TOM.perigo.text, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap",
};

/**
 * PAGINAÇÃO — janela de até 5 páginas em volta da atual, alvos de 32px (44 no
 * celular) e a página atual cheia em escuro. Some com uma página só.
 */
function Paginacao({ pagina, totalPaginas, onIr, toque }: { pagina: number; totalPaginas: number; onIr: (p: number) => void; toque: number }) {
  if (totalPaginas <= 1) return null;
  const inicio = Math.max(1, Math.min(pagina - 2, totalPaginas - 4));
  const paginas = Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => inicio + i);
  const base: React.CSSProperties = {
    minWidth: toque, height: toque, padding: "0 6px", display: "inline-flex", alignItems: "center", justifyContent: "center",
    borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.surface, color: T.second,
    fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "background-color 0.12s ease, border-color 0.12s ease",
  };
  const seta = (desligada: boolean): React.CSSProperties => ({ ...base, opacity: desligada ? 0.4 : 1, cursor: desligada ? "not-allowed" : "pointer" });
  return (
    <nav aria-label="Paginação" style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button type="button" onClick={() => onIr(pagina - 1)} disabled={pagina === 1} aria-label="Página anterior" style={seta(pagina === 1)}>
        <ChevronLeft aria-hidden="true" style={{ width: 14, height: 14 }} />
      </button>
      {paginas.map(p => (
        <button key={p} type="button" onClick={() => onIr(p)} aria-label={`Página ${p}`} aria-current={p === pagina ? "page" : undefined}
          style={p === pagina ? { ...base, backgroundColor: T.dark, borderColor: T.dark, color: T.surface } : base}>
          {p}
        </button>
      ))}
      <button type="button" onClick={() => onIr(pagina + 1)} disabled={pagina === totalPaginas} aria-label="Próxima página" style={seta(pagina === totalPaginas)}>
        <ChevronRight aria-hidden="true" style={{ width: 14, height: 14 }} />
      </button>
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
    <span data-testid={testId} title={s.title} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", borderRadius: 6, padding: "1px 6px", backgroundColor: t.bg, border: `1px solid ${t.border}`, color: t.color, whiteSpace: "nowrap", fontFamily: s.estado === "ok" ? "monospace" : "inherit" }}>
      {s.estado === "menor" && <AlertTriangle aria-hidden="true" style={{ width: 10, height: 10, flexShrink: 0 }} />}
      {s.rotulo}
    </span>
  );
}

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
  onStartEdit, onStartDelete,
}: {
  name: string; count: number; accentColor: string; accentBg: string;
  isEditing: boolean; editValue: string; onEditChange: (v: string) => void;
  onEditConfirm: () => void; onEditCancel: () => void; isPendingRename: boolean;
  isDeleting: boolean; onDeleteConfirm: () => void; onDeleteCancel: () => void; isPendingDelete: boolean;
  onStartEdit: () => void; onStartDelete: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 12, backgroundColor: isDeleting ? TOM.perigo.bg : T.bg, border: `1px solid ${isDeleting ? TOM.perigo.border : N.n3}`, transition: "all 0.15s" }}>
      {/* Dot */}
      <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: accentColor, flexShrink: 0, opacity: isDeleting ? 0.4 : 1 }} />

      {isEditing ? (
        <>
          <input autoFocus value={editValue} onChange={e => onEditChange(e.target.value)}
            aria-label={`Novo nome para "${name}"`}
            onKeyDown={e => { if (e.key === "Enter") onEditConfirm(); if (e.key === "Escape") onEditCancel(); }}
            style={{ flex: 1, fontSize: 13, fontWeight: 600, borderRadius: 8, padding: "5px 10px", border: `1.5px solid ${accentColor}`, color: T.text, background: accentBg }}
          />
          <button onClick={onEditConfirm} disabled={isPendingRename} aria-label={`Confirmar novo nome de "${name}"`}
            style={{ width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer", backgroundColor: accentColor, color: T.surface, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Check style={{ width: 13, height: 13 }} />
          </button>
          <button onClick={onEditCancel} aria-label="Cancelar renomeação"
            style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, cursor: "pointer", backgroundColor: T.surface, color: T.second, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <X style={{ width: 13, height: 13 }} />
          </button>
        </>
      ) : isDeleting ? (
        <>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: TOM.perigo.text }}>Remover </span>
            <span style={{ fontSize: 13, fontWeight: 800, color: TOM.perigo.text }}>"{name}"</span>
            <span style={{ fontSize: 13, color: TOM.perigo.text }}> de {count} {count === 1 ? "modelo" : "modelos"}?</span>
          </div>
          <button onClick={onDeleteConfirm} disabled={isPendingDelete}
            style={{ padding: "5px 14px", borderRadius: 8, border: "none", cursor: isPendingDelete ? "not-allowed" : "pointer", backgroundColor: TOM.perigo.text, color: T.surface, fontSize: 13, fontWeight: 700, flexShrink: 0, opacity: isPendingDelete ? 0.7 : 1 }}>
            {isPendingDelete ? "Removendo..." : "Remover"}
          </button>
          <button onClick={onDeleteCancel}
            style={{ padding: "5px 14px", borderRadius: 8, border: `1px solid ${T.border}`, cursor: "pointer", backgroundColor: T.surface, color: T.second, fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
            Cancelar
          </button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.text }}>{name}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: T.second, backgroundColor: N.n3, borderRadius: 6, padding: "2px 8px", marginRight: 2 }}>
            {count} {count === 1 ? "modelo" : "modelos"}
          </span>
          <button onClick={onStartEdit} title={`Renomear "${name}"`} aria-label={`Renomear "${name}"`}
            style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid transparent", cursor: "pointer", backgroundColor: "transparent", color: T.second, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = accentBg; (e.currentTarget as HTMLButtonElement).style.color = accentColor; (e.currentTarget as HTMLButtonElement).style.borderColor = accentColor + "40"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = T.second; (e.currentTarget as HTMLButtonElement).style.borderColor = "transparent"; }}>
            <Pencil style={{ width: 12, height: 12 }} />
          </button>
          <button onClick={onStartDelete} title={`Remover "${name}"`} aria-label={`Remover "${name}"`}
            style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid transparent", cursor: "pointer", backgroundColor: "transparent", color: T.second, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = TOM.perigo.bg; (e.currentTarget as HTMLButtonElement).style.color = TOM.perigo.text; (e.currentTarget as HTMLButtonElement).style.borderColor = TOM.perigo.border; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = T.second; (e.currentTarget as HTMLButtonElement).style.borderColor = "transparent"; }}>
            <Trash2 style={{ width: 12, height: 12 }} />
          </button>
        </>
      )}
    </div>
  );
}

export default function Modelos() {
  const isMobile = useIsMobile();
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
  const toque = isMobile ? 44 : 32;
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
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
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
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
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

  const { data: standardItems = [], isLoading, isError, refetch } = useQuery<any[]>({
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
      toast({ title: "Opção adicionada", description: `"${vars.value}" já aparece nos formulários de modelo.` });
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
      toast({ title: "Grupo renomeado", description: `"${vars.oldName}" → "${vars.newName}"` });
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
      toast({ title: "Acabamento renomeado", description: `"${vars.oldName}" → "${vars.newName}"` });
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
      toast({ title: "Material renomeado", description: `"${vars.oldName}" → "${vars.newName}"` });
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
    mutationFn: async (data: typeof formData) => {
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
        toast({ title: "Modelo criado", description: `"${formData.name}" já está no catálogo. Preencha o próximo.` });
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
      toast({ title: "Modelo excluído", description: nome ? `"${nome}" saiu do catálogo.` : undefined });
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
    const dataToSubmit: any = {
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

  const handleEdit = (item: any) => {
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
  const handleDuplicate = (item: any) => {
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
  const allGroups = Array.from(new Set([...catGroups, ...standardItems.map((s: any) => s.group).filter(Boolean)])).sort() as string[];
  const allTypes  = Array.from(new Set(standardItems.map((s: any) => s.type).filter(Boolean))).sort() as string[];
  const allMats     = Array.from(new Set([...materials,  ...catMats,     ...standardItems.map((s: any) => s.material).filter(Boolean)])).sort() as string[];
  const allFinishes = Array.from(new Set([...finishes,   ...catFinishes, ...standardItems.map((s: any) => s.finish).filter(Boolean)])).sort() as string[];

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
    standardItems.forEach((item: any) => {
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

  /* ── shared field style ── */
  const fieldStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px", backgroundColor: N.n3,
    // Raio 8 (R.md), o dos campos de Usuários e Patrocinadores — era 12.
    border: "none", borderRadius: R.md, fontSize: 13, color: T.text,
    fontFamily: FONT.display,
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 10, fontWeight: 700, color: T.second,
    textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, marginLeft: 2,
  };

  return (
    <div className="modelos-page" style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: isMobile ? "16px 16px 48px" : "28px 32px 64px" }}>
      {/* Placeholder nativo dos inputs: o cinza padrão do navegador reprova
          contraste. T.apoio (n8) e não T.second (n7) porque o fundo destes
          campos é o n3 — o único degrau claro em que o n7 fica em 4,38:1. É a
          exceção que o próprio token documenta. */}
      <style>{`
        .modelos-page input::placeholder, .modelos-page textarea::placeholder { color: ${T.apoio}; opacity: 1; }
      `}</style>

      {/* ── Page Header ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: FS.h1, fontWeight: 700, color: T.text, margin: "0 0 6px", letterSpacing: "-0.03em", lineHeight: 1.1, fontFamily: FONT.display }}>
            Modelos
          </h1>
          {/* ONDE O MODELO É USADO. "Catálogo reutilizável" não dizia onde ele
              reaparece. Conferido no código: o formulário de peça do evento
              lista os modelos no campo Tipo e, escolhido um, preenche medidas,
              material e acabamento (event-detail.tsx, "Selecionar um Modelo
              pré-preenche"); o Grupo Pai agrupa as peças no evento, na Arte e
              na Gráfica (`groupOf`). */}
          <p style={{ fontSize: FS.body, color: T.second, margin: 0, lineHeight: 1.5, maxWidth: 680 }}>
            Peças padrão com medidas prontas. Ao adicionar uma peça no evento, escolher o modelo no campo Tipo já preenche medidas, material e acabamento.
          </p>
        </div>

        {/* flexWrap: no celular os dois botões dividem a linha em vez de
            empurrar um deles para fora da tela. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", width: isMobile ? "100%" : undefined }}>
          {/* Manage Categories Button — secundário (contorno) */}
          <button
            data-testid="button-manage-categories"
            onClick={() => setManageOpen(true)}
            style={{ ...BTN_PRIMARIO, flex: isMobile ? "1 1 0" : undefined, backgroundColor: T.surface, color: T.text, border: `1px solid ${T.bdark}` }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = T.low; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = T.surface; }}
          >
            <Settings aria-hidden="true" style={{ width: 15, height: 15 }} />
            {/* "Gerenciar" o quê? O modal que abre é de grupos, materiais e
                acabamentos — o rótulo passa a dizer. */}
            {isMobile ? "Categorias" : "Gerenciar categorias"}
          </button>

          {/* New Model Button */}
          <button
            data-testid="button-new-model"
            onClick={openCreate}
            style={{ ...BTN_PRIMARIO, flex: isMobile ? "1 1 0" : undefined }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = T.strong)}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = T.dark)}
          >
            <Plus aria-hidden="true" style={{ width: 15, height: 15 }} />
            Novo Modelo
          </button>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      {/* A busca desceu do cabeçalho para cá: em Usuários, Patrocinadores e
          Logs ela abre a barra de filtros, e é onde o olho a procura. */}
      {!isLoading && standardItems.length > 0 && (
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : "0 1 320px" }}>
            <Search aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: T.muted }} />
            <input
              type="search"
              aria-label="Buscar modelos por nome, tipo ou grupo"
              placeholder="Buscar por nome, tipo ou grupo..."
              value={searchTerm}
              onChange={(e) => atualizar({ busca: e.target.value, pagina: 1 })}
              data-testid="input-search-models"
              style={{ width: "100%", height: 40, padding: "0 12px 0 36px", backgroundColor: N.n3, border: "none", borderRadius: R.md, fontSize: 13, color: T.text, transition: "background-color 0.15s ease, box-shadow 0.15s ease" }}
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
            <button
              type="button"
              onClick={() => limpar()}
              style={BTN_LIMPAR}
            >
              <X aria-hidden="true" style={{ width: 11, height: 11 }} />
              Limpar ({activeFilters + (searchTerm ? 1 : 0)})
            </button>
          )}
        </div>
      )}

      {/* Falha na query auxiliar do catálogo de opções: avisa sem esconder a tabela */}
      {catalogError && (
        <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: 10, marginBottom: 12 }}>
          <AlertTriangle style={{ width: 14, height: 14, color: TOM.alerta.text, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: TOM.alerta.text, flex: 1 }}>
            Falha ao carregar as opções de catálogo — grupos, materiais e acabamentos podem aparecer incompletos.
          </span>
          <button onClick={() => refetchCatalog()}
            style={{ padding: "6px 12px", backgroundColor: T.surface, border: `1px solid ${TOM.alerta.border}`, borderRadius: 6, cursor: "pointer", fontSize: 10, fontWeight: 800, color: TOM.alerta.text, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
            Tentar novamente
          </button>
        </div>
      )}

      {/* ── Table Card ── */}
      {isLoading ? (
        // Esqueleto na silhueta da linha (nome · selos · medidas), como em
        // Usuários, Patrocinadores e Logs — o anel girando era o único
        // carregamento diferente entre as telas de cadastro.
        <div role="status" aria-label="Carregando modelos" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden", padding: "8px 0" }}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="motion-safe:animate-pulse" style={{ display: "flex", alignItems: "center", gap: 24, padding: "20px 24px", borderBottom: `1px solid ${T.low}` }}>
              <div style={{ width: 180, height: 12, borderRadius: 4, backgroundColor: T.low }} />
              <div style={{ width: 70, height: 18, borderRadius: 999, backgroundColor: T.low }} />
              <div style={{ width: 70, height: 18, borderRadius: 999, backgroundColor: T.low }} />
              <div style={{ width: 110, height: 12, borderRadius: 4, backgroundColor: T.low }} />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "56px 24px", textAlign: "center" }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: "0 0 4px" }}>Não foi possível carregar os modelos</p>
          <p style={{ fontSize: 12, color: T.second, margin: "0 0 16px" }}>Verifique sua conexão e tente novamente.</p>
          <button type="button" onClick={() => refetch()}
            style={{ ...BTN_PRIMARIO, height: 36, fontSize: 11 }}>
            Tentar novamente
          </button>
        </div>
      ) : standardItems.length === 0 ? (
        <div style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "56px 24px", textAlign: "center" }}>
          <Layers aria-hidden="true" style={{ width: 40, height: 40, color: T.muted, margin: "0 auto 12px" }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: "0 0 6px" }}>Nenhum modelo criado</p>
          <p style={{ fontSize: 13, color: T.second, margin: "0 0 16px" }}>Crie modelos para reutilizar configurações de itens</p>
          <button type="button" onClick={openCreate}
            style={{ ...BTN_PRIMARIO, height: 36, fontSize: 11 }}>
            <Plus aria-hidden="true" style={{ width: 13, height: 13 }} /> Criar Primeiro Modelo
          </button>
        </div>
      ) : (
        <div style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>

          {/* Tool strip */}
          <div style={{ padding: isMobile ? "12px 16px" : "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: T.surface, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div aria-hidden="true" style={{ width: 36, height: 36, borderRadius: R.md, backgroundColor: TOM.laranja.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Layers style={{ width: 18, height: 18, color: T.accent }} />
              </div>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text, display: "block" }}>
                  {filteredItems.length} modelo{filteredItems.length !== 1 ? "s" : ""}
                  {/* "filtrado de" valia só para a busca: com um filtro de
                      Grupo ativo, "3 modelos · Total no Catálogo" lia como se
                      o catálogo inteiro tivesse 3. */}
                  {(searchTerm || activeFilters > 0) && <span style={{ color: T.second, fontWeight: 400 }}> — filtrado de {standardItems.length}</span>}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: T.second, textTransform: "uppercase", letterSpacing: "0.08em" }}>{searchTerm || activeFilters > 0 ? "Recorte atual" : "Total no Catálogo"}</span>
              </div>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center" }}>
              <Search aria-hidden="true" style={{ width: 32, height: 32, color: T.muted, margin: "0 auto 12px" }} />
              <p style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: "0 0 4px" }}>Nenhum modelo encontrado</p>
              <p style={{ fontSize: 13, color: T.second, margin: "0 0 16px" }}>
                {searchTerm && activeFilters > 0
                  ? "Nenhum modelo corresponde à busca e aos filtros atuais"
                  : searchTerm
                  ? "Tente buscar com outro termo"
                  : "Nenhum modelo encontrado com os filtros atuais"}
              </p>
              {/* Uma saída só: antes havia "Limpar busca" lá no topo do card e
                  "Limpar filtros" aqui, cada um desfazendo metade do recorte —
                  e nenhum voltava a paginação para a página 1. */}
              <button
                type="button"
                onClick={() => limpar()}
                style={{ ...BTN_PRIMARIO, height: 36, backgroundColor: T.surface, color: T.text, border: `1px solid ${T.bdark}`, fontSize: 11 }}>
                <X aria-hidden="true" style={{ width: 11, height: 11 }} /> {searchTerm && activeFilters > 0 ? "Limpar busca e filtros" : searchTerm ? "Limpar busca" : "Limpar filtros"}
              </button>
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
                        fontSize: 10, fontWeight: 900, color: T.second,
                        textTransform: "uppercase", letterSpacing: "0.16em", whiteSpace: "nowrap",
                      }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody style={{ borderTop: "none" }}>
                  {paginatedItems.map((item) => {
                    const isHovered = hoveredRow === item.id;
                    const pillStyle = tipoPillStyle(item.type || "");
                    return (
                      <tr
                        key={item.id}
                        data-testid={`row-model-${item.id}`}
                        onMouseEnter={() => setHoveredRow(item.id)}
                        onMouseLeave={() => setHoveredRow(null)}
                        style={{ borderBottom: `1px solid ${N.n3}`, backgroundColor: isHovered ? "rgba(250,250,249,0.8)" : T.surface, transition: "background-color 0.1s" }}
                      >
                        {/* Nome */}
                        <td style={{ padding: "18px 24px", minWidth: 200 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: T.text, display: "block" }}>{item.name}</span>
                          {item.hasVariableMeasurement && (
                            <span style={{ fontSize: 10, color: T.second, marginTop: 2, display: "block" }}>Medida variável</span>
                          )}
                        </td>

                        {/* Grupo */}
                        <td style={{ padding: "18px 24px", whiteSpace: "nowrap" }}>
                          {item.group ? (
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", borderRadius: 999, padding: "3px 10px", display: "inline-block", backgroundColor: TOM.ceu.bg, color: TOM.ceu.text, whiteSpace: "nowrap" }}>
                              {item.group}
                            </span>
                          ) : <span style={{ color: T.second, fontSize: 13 }}>—</span>}
                        </td>

                        {/* Tipo */}
                        <td style={{ padding: "18px 24px" }}>
                          {item.type ? (
                            <span style={{ ...pillStyle, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", borderRadius: 999, padding: "3px 10px", display: "inline-block", whiteSpace: "nowrap" }}>
                              {item.type}
                            </span>
                          ) : <span style={{ color: T.second, fontSize: 13 }}>—</span>}
                        </td>

                        {/* Medidas */}
                        <td style={{ padding: "18px 24px", whiteSpace: "nowrap" }}>
                          {item.hasVariableMeasurement ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, backgroundColor: TOM.info.bg, color: TOM.info.text, borderRadius: 999, padding: "3px 10px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              <Ruler style={{ width: 10, height: 10 }} /> Variável
                            </span>
                          ) : (item.area || item.visual || item.fileWidth || item.fileHeight) ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              {(item.area || item.visual) && (
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: T.second, backgroundColor: N.n3, borderRadius: 6, padding: "1px 5px", letterSpacing: "0.06em" }}>VIS</span>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text, fontFamily: FONT.mono }}>
                                    {item.area ?? "—"} × {item.visual ?? "—"}m
                                  </span>
                                </div>
                              )}
                              {(item.fileWidth || item.fileHeight) && (
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: TOM.alerta.text, backgroundColor: TOM.alerta.bg, borderRadius: 6, padding: "1px 5px", letterSpacing: "0.06em" }}>ARQ</span>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: T.apoio, fontFamily: FONT.mono }}>
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
                            <span style={{ fontSize: 13, color: T.second }}>—</span>
                          )}
                        </td>

                        {/* Uso — quantas peças usam este modelo. Duas medidas,
                            rotuladas de forma diferente de propósito: "N peças"
                            é vínculo gravado (criadas a partir); "~N compatíveis"
                            é peça antiga sem vínculo que bate tipo, material e
                            medidas — compatibilidade, não origem. A tela não
                            promete o que não sabe. #0369a1/#f0f9ff 5,9:1. */}
                        <td style={{ padding: "18px 24px", whiteSpace: "nowrap" }} data-testid={`cell-uso-${item.id}`}>
                          {(() => {
                            const uso = item.uso ?? { exato: 0, compativel: 0, ultimaEm: null };
                            const nenhum = uso.exato === 0 && uso.compativel === 0;
                            return (
                              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                {uso.exato > 0 ? (
                                  <span title={`${uso.exato} ${uso.exato === 1 ? 'peça já foi criada' : 'peças já foram criadas'} a partir deste modelo; excluí-lo não altera nenhuma delas`} style={{ display: "inline-flex", alignSelf: "flex-start", fontSize: 11, fontWeight: 700, backgroundColor: TOM.ceu.bg, color: TOM.ceu.text, border: `1px solid ${TOM.ceu.border}`, borderRadius: 6, padding: "2px 8px", fontFamily: FONT.mono }}>
                                    {uso.exato} {uso.exato === 1 ? 'peça' : 'peças'}
                                  </span>
                                ) : nenhum ? (
                                  <span title="Nenhuma peça foi criada a partir deste modelo — excluir não afeta nada" style={{ display: "inline-flex", alignSelf: "flex-start", fontSize: 11, fontWeight: 600, backgroundColor: N.n3, color: T.second, border: `1px solid ${T.border}`, borderRadius: 6, padding: "2px 8px" }}>
                                    sem uso
                                  </span>
                                ) : null}
                                {uso.compativel > 0 && (
                                  <span title={`${uso.compativel} ${uso.compativel === 1 ? 'peça antiga' : 'peças antigas'} com o mesmo tipo, material e medidas — criadas antes de o vínculo existir. Compatibilidade, não origem.`} style={{ fontSize: 10, color: T.second, fontFamily: FONT.mono }}>
                                    ~{uso.compativel} compat.
                                  </span>
                                )}
                                {uso.ultimaEm && (
                                  <span style={{ fontSize: 10, color: T.second }}>última em {new Date(uso.ultimaEm).toLocaleDateString("pt-BR")}</span>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                        {/* Material */}
                        <td style={{ padding: "18px 24px" }}>
                          <span style={{ fontSize: 13, color: item.material ? T.apoio : T.second }}>
                            {item.material || "—"}
                          </span>
                        </td>

                        {/* Acabamento */}
                        <td style={{ padding: "18px 24px" }}>
                          <span style={{ fontSize: 13, color: item.finish ? T.apoio : T.second }}>
                            {item.finish || "—"}
                          </span>
                        </td>

                        {/* Ações — o gate real de escrita é o requireRole
                            (solicitacao/admin) do servidor + o guard da rota */}
                        <td style={{ padding: "18px 24px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                            <HoverIconBtn
                              icon={<Pencil style={{ width: 16, height: 16 }} />}
                              hoverBg={TOM.laranja.bg} hoverColor={T.accentText}
                              onClick={() => handleEdit(item)}
                              testId={`button-edit-model-${item.id}`}
                              title="Editar modelo"
                              ariaLabel={`Editar modelo ${item.name}`}
                              tamanho={toque}
                            />
                            <HoverIconBtn
                              icon={<Copy style={{ width: 16, height: 16 }} />}
                              hoverBg={TOM.ceu.bg} hoverColor={TOM.ceu.text}
                              onClick={() => handleDuplicate(item)}
                              testId={`button-duplicate-model-${item.id}`}
                              title="Duplicar modelo"
                              ariaLabel={`Duplicar modelo ${item.name}`}
                              tamanho={toque}
                            />
                            <HoverIconBtn
                              icon={<Trash2 style={{ width: 16, height: 16 }} />}
                              hoverBg={TOM.perigo.bg} hoverColor={TOM.perigo.text}
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
              <span style={{ fontSize: 11, color: T.second, fontWeight: 600 }}>
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
                    preenchê-lo. #57534e sobre o branco do modal = 7,6:1.
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
                        <span style={{ ...tipoPillStyle(formData.type), display: "inline-flex", alignItems: "center", borderRadius: 6, padding: "2px 10px", fontSize: 13, fontWeight: 600 }}>
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
                              <button type="button"
                                onClick={() => { setFormData({ ...formData, type: customTypeInput }); setCustomTypeInput(""); setTypePopoverOpen(false); }}
                                style={{ width: "100%", padding: "8px 12px", backgroundColor: T.text, color: T.surface, border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                                <Plus style={{ width: 13, height: 13, display: "inline", marginRight: 6 }} />
                                Criar "{customTypeInput}"
                              </button>
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
                                <span style={{ ...tipoPillStyle(t), display: "inline-flex", alignItems: "center", borderRadius: 6, padding: "2px 10px", fontSize: 13, fontWeight: 600, marginRight: 8 }}>
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
                              <span style={{ fontSize: 13, color: T.apoio, fontWeight: 600 }}>Criar "{customTypeInput}"</span>
                            </CommandItem>
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </FreezeWhileClosing>
                  </PopoverContent>
                </Popover>
                {formData.type && (
                  <button type="button" onClick={() => setFormData({ ...formData, type: "" })}
                    style={{ marginTop: 4, fontSize: 11, color: T.second, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    Limpar
                  </button>
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
                          fontSize: 13, fontWeight: 700,
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
                              <button
                                type="button"
                                onClick={() => { setFormData({ ...formData, group: customGroupInput }); setCustomGroupInput(""); setGroupPopoverOpen(false); }}
                                style={{ width: "100%", padding: "8px 12px", backgroundColor: TOM.info.text, color: T.surface, border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}
                              >
                                + Criar grupo "{customGroupInput}"
                              </button>
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
                                  padding: "2px 10px 2px 8px", fontSize: 13, fontWeight: 600,
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
                              <span style={{ fontSize: 13, color: TOM.info.text, fontWeight: 600 }}>Criar "{customGroupInput}"</span>
                            </CommandItem>
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </FreezeWhileClosing>
                  </PopoverContent>
                </Popover>
                {formData.group && (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, group: "" })}
                    style={{ marginTop: 4, fontSize: 11, color: T.second, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    Limpar
                  </button>
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
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.apoio, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Medida Variável
                  </span>
                </label>
              </div>

              {/* ── Medidas visuais ── */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ ...labelStyle, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  Medidas Visuais
                  <span style={{ fontSize: 10, fontWeight: 700, color: T.second, backgroundColor: N.n3, borderRadius: 6, padding: "2px 6px", letterSpacing: "0.06em" }}>VIS.</span>
                  {/* VIS × ARQ era sigla sem legenda para quem chega. */}
                  <span style={{ fontSize: 10, fontWeight: 500, color: T.second, textTransform: "none", letterSpacing: 0 }}>— o que aparece na peça montada</span>
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
                  <span style={{ fontSize: 10, fontWeight: 700, color: TOM.alerta.text, backgroundColor: TOM.alerta.bg, borderRadius: 6, padding: "2px 6px", letterSpacing: "0.06em" }}>ARQ.</span>
                  <span style={{ fontSize: 10, fontWeight: 500, color: T.second, textTransform: "none", letterSpacing: 0 }}>— o que vai para impressão, com a sangria; pré-preenchido igual ao visual</span>
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
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, backgroundColor: TOM.laranja.bg, color: T.accentText, borderRadius: 6, padding: "2px 10px 2px 8px", fontSize: 13, fontWeight: 600 }}>
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
                              <button type="button"
                                onClick={() => { setFormData({ ...formData, material: customMaterialInput }); setCustomMaterialInput(""); setMaterialPopoverOpen(false); }}
                                style={{ width: "100%", padding: "8px 12px", backgroundColor: T.accentText, color: T.surface, border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                                <Plus style={{ width: 13, height: 13, display: "inline", marginRight: 6 }} />
                                Criar "{customMaterialInput}"
                              </button>
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
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, backgroundColor: formData.material === m ? TOM.laranja.border : TOM.laranja.bg, color: T.accentText, borderRadius: 6, padding: "2px 10px 2px 8px", fontSize: 13, fontWeight: 600, marginRight: 8 }}>
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
                              {/* #c2410c: o #ea580c anterior dava 3,6:1 no texto. */}
                              <Plus style={{ width: 14, height: 14, marginRight: 8, color: T.accentText }} />
                              <span style={{ fontSize: 13, color: T.accentText, fontWeight: 600 }}>Criar "{customMaterialInput}"</span>
                            </CommandItem>
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </FreezeWhileClosing>
                  </PopoverContent>
                </Popover>
                {formData.material && (
                  <button type="button" onClick={() => setFormData({ ...formData, material: "" })}
                    style={{ marginTop: 4, fontSize: 11, color: T.second, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    Limpar
                  </button>
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
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, backgroundColor: N.n3, color: T.apoio, borderRadius: 6, padding: "2px 10px 2px 8px", fontSize: 13, fontWeight: 600 }}>
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
                              <button type="button"
                                onClick={() => { setFormData({ ...formData, finish: customFinishInput }); setCustomFinishInput(""); setFinishPopoverOpen(false); }}
                                style={{ width: "100%", padding: "8px 12px", backgroundColor: T.apoio, color: T.surface, border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                                <Plus style={{ width: 13, height: 13, display: "inline", marginRight: 6 }} />
                                Criar "{customFinishInput}"
                              </button>
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
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, backgroundColor: formData.finish === f ? T.border : N.n3, color: T.apoio, borderRadius: 6, padding: "2px 10px 2px 8px", fontSize: 13, fontWeight: 600, marginRight: 8 }}>
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
                              <span style={{ fontSize: 13, color: T.second, fontWeight: 600 }}>Criar "{customFinishInput}"</span>
                            </CommandItem>
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </FreezeWhileClosing>
                  </PopoverContent>
                </Popover>
                {formData.finish && (
                  <button type="button" onClick={() => setFormData({ ...formData, finish: "" })}
                    style={{ marginTop: 4, fontSize: 11, color: T.second, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    Limpar
                  </button>
                )}
              </div>

            </div>

            {/* Footer — primário ESCURO, como o de todo cadastro. O laranja
                cheio daqui era o único botão de salvar laranja do app. */}
            <ModalFooter>
              <button type="submit" disabled={createStandardItemMutation.isPending}
                aria-busy={createStandardItemMutation.isPending}
                data-testid="button-submit-model"
                style={{ height: toque + 4, borderRadius: R.md, border: "none", backgroundColor: T.dark, color: T.surface, fontSize: 14, fontWeight: 800, cursor: createStandardItemMutation.isPending ? "wait" : "pointer", opacity: createStandardItemMutation.isPending ? 0.7 : 1, transition: "background-color 0.15s ease" }}
                onMouseEnter={e => { if (!createStandardItemMutation.isPending) e.currentTarget.style.backgroundColor = T.strong; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = T.dark; }}
                onClick={() => { continuarRef.current = false; }}
              >
                {createStandardItemMutation.isPending
                  ? (editingItem ? "Atualizando…" : "Criando…")
                  : (editingItem ? "Salvar alterações" : "Salvar modelo")}
              </button>
              {/* Só na criação (e na duplicação, que também cria): mesmo
                  submit, sem fechar o modal. */}
              {!editingItem && (
                <button type="submit" disabled={createStandardItemMutation.isPending}
                  data-testid="button-submit-model-e-outro"
                  onClick={() => { continuarRef.current = true; }}
                  style={{ height: toque + 4, borderRadius: R.md, border: `1px solid ${T.bdark}`, backgroundColor: T.surface, color: T.text, fontSize: 13, fontWeight: 800, cursor: createStandardItemMutation.isPending ? "wait" : "pointer", opacity: createStandardItemMutation.isPending ? 0.7 : 1, transition: "background-color 0.15s ease" }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = T.low; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = T.surface; }}
                >
                  Salvar e cadastrar outro
                </button>
              )}
              <button type="button" onClick={requestCloseDialog}
                style={{ height: toque, borderRadius: R.md, border: "none", backgroundColor: "transparent", color: T.apoio, fontSize: FS.body, fontWeight: 700, cursor: "pointer" }}
              >
                {/* Depois de criar na sequência, "Cancelar" sugeria desfazer. */}
                {criadosNestaSequencia.length > 0 && !editingItem ? "Fechar" : "Cancelar"}
              </button>
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

              {/* Tabs */}
              {(() => {
                const tabs: { key: "group"|"material"|"finish"; label: string; color: string; bg: string; count: number }[] = [
                  { key: "group",    label: "Grupos Pai", color: TOM.ceu.text, bg: TOM.ceu.border, count: allGroups.length },
                  { key: "material", label: "Material",   color: TOM.alerta.text, bg: TOM.alerta.bg, count: allMats.length },
                  { key: "finish",   label: "Acabamento", color: TOM.sucesso.text, bg: TOM.sucesso.bg, count: allFinishes.length },
                ];
                return (
                  <div role="tablist" aria-label="Tipo de categoria" style={{ display: "flex", gap: 4, borderBottom: `1px solid ${N.n3}` }}>
                    {/* Aba inativa em #746e69 (não #a8a29e): é texto acionável,
                        precisa do piso 4.5:1 — o cinza decorativo reprovava.
                        newCatValue zera na troca: o rascunho digitado numa aba
                        não pode virar cadastro acidental em outra. */}
                    {tabs.map(t => (
                      <button key={t.key} role="tab" aria-selected={manageTab === t.key} onClick={() => { setManageTab(t.key); setNewCatValue(""); setMgEditingGroup(null); setMgEditingFinish(null); setMgEditingMaterial(null); setMgDeleteGroupConfirm(null); setMgDeleteFinishConfirm(null); setMgDeleteMaterialConfirm(null); }}
                        style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 16px", border: "none", borderRadius: "8px 8px 0 0", cursor: "pointer", fontSize: 13, fontWeight: manageTab === t.key ? 700 : 500, transition: "all 0.15s",
                          backgroundColor: manageTab === t.key ? T.surface : "transparent",
                          color: manageTab === t.key ? t.color : T.second,
                          borderBottom: manageTab === t.key ? `2px solid ${t.color}` : "2px solid transparent",
                          marginBottom: -1,
                        }}>
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 6, backgroundColor: manageTab === t.key ? t.bg : N.n3, fontSize: 11, fontWeight: 800, color: manageTab === t.key ? t.color : T.second, flexShrink: 0 }}>
                          {t.count}
                        </span>
                        {t.label}
                      </button>
                    ))}
                  </div>
                );
              })()}
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
                    toast({ title: "Opção já cadastrada", description: `"${v}" já existe em ${addLabel === "grupo" ? "grupos" : addLabel === "material" ? "materiais" : "acabamentos"}.` });
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
                        style={{ flex: 1, minWidth: 0, height: 40, padding: "0 12px", borderRadius: 8, border: `1px solid ${T.border}`, backgroundColor: T.bg, fontSize: 13, color: T.text }}
                      />
                      {/* Desabilitado: texto #746e69 sobre o cinza claro — o
                          branco de antes sumia no fundo, e o #a8a29e que o
                          substituiu é cinza decorativo, proibido como texto. */}
                      <button type="button" onClick={submitNew} disabled={createCatalogOptionMutation.isPending || !newCatValue.trim()}
                        data-testid="button-add-catalog-option"
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 40, padding: "0 14px", borderRadius: 8, border: "none", cursor: newCatValue.trim() ? "pointer" : "not-allowed", backgroundColor: newCatValue.trim() ? tabCfg.color : T.border, color: newCatValue.trim() ? T.surface : T.second, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", transition: "background-color 0.15s ease" }}>
                        <Plus style={{ width: 14, height: 14 }} /> Adicionar
                      </button>
                    </div>

                    {tabCfg.items.length === 0 && (
                      <p style={{ fontSize: 13, color: T.second, margin: "12px 0", textAlign: "center" }}>{tabCfg.empty}</p>
                    )}
                    {tabCfg.items.map(name => {
                      const count = manageTab === "group"
                        ? (standardItems as any[]).filter(s => s.group === name).length
                        : manageTab === "material"
                        ? (standardItems as any[]).filter(s => s.material === name).length
                        : (standardItems as any[]).filter(s => s.finish === name).length;

                      if (manageTab === "group") return (
                        <CatRow key={name} name={name} count={count} accentColor={tabCfg.color} accentBg={tabCfg.bg}
                          isEditing={mgEditingGroup === name} editValue={mgEditGroupValue} onEditChange={setMgEditGroupValue}
                          onEditConfirm={() => { const t = mgEditGroupValue.trim(); if (t && t !== name) renameGroupMutation.mutate({ oldName: name, newName: t }); else setMgEditingGroup(null); }}
                          onEditCancel={() => setMgEditingGroup(null)} isPendingRename={renameGroupMutation.isPending}
                          isDeleting={mgDeleteGroupConfirm === name}
                          onDeleteConfirm={() => deleteGroupMutation.mutate(name, {
                            onSuccess: () => deleteCatalogOptionMutation.mutate({ kind: "group", value: name }, {
                              onSuccess: () => toast({ title: "Grupo removido", description: `"${name}" foi removido de todos os modelos` }),
                            }),
                          })} onDeleteCancel={() => setMgDeleteGroupConfirm(null)} isPendingDelete={deleteGroupMutation.isPending}
                          onStartEdit={() => { setMgEditingGroup(name); setMgEditGroupValue(name); setMgDeleteGroupConfirm(null); }}
                          onStartDelete={() => { setMgDeleteGroupConfirm(name); setMgEditingGroup(null); }}
                        />
                      );
                      if (manageTab === "material") return (
                        <CatRow key={name} name={name} count={count} accentColor={tabCfg.color} accentBg={tabCfg.bg}
                          isEditing={mgEditingMaterial === name} editValue={mgEditMaterialValue} onEditChange={setMgEditMaterialValue}
                          onEditConfirm={() => { const t = mgEditMaterialValue.trim(); if (t && t !== name) renameMaterialMutation.mutate({ oldName: name, newName: t }); else setMgEditingMaterial(null); }}
                          onEditCancel={() => setMgEditingMaterial(null)} isPendingRename={renameMaterialMutation.isPending}
                          isDeleting={mgDeleteMaterialConfirm === name}
                          onDeleteConfirm={() => deleteMaterialMutation.mutate(name, {
                            onSuccess: () => deleteCatalogOptionMutation.mutate({ kind: "material", value: name }, {
                              onSuccess: () => toast({ title: "Material removido", description: `"${name}" foi removido de todos os modelos` }),
                            }),
                          })} onDeleteCancel={() => setMgDeleteMaterialConfirm(null)} isPendingDelete={deleteMaterialMutation.isPending}
                          onStartEdit={() => { setMgEditingMaterial(name); setMgEditMaterialValue(name); setMgDeleteMaterialConfirm(null); }}
                          onStartDelete={() => { setMgDeleteMaterialConfirm(name); setMgEditingMaterial(null); }}
                        />
                      );
                      return (
                        <CatRow key={name} name={name} count={count} accentColor={tabCfg.color} accentBg={tabCfg.bg}
                          isEditing={mgEditingFinish === name} editValue={mgEditFinishValue} onEditChange={setMgEditFinishValue}
                          onEditConfirm={() => { const t = mgEditFinishValue.trim(); if (t && t !== name) renameFinishMutation.mutate({ oldName: name, newName: t }); else setMgEditingFinish(null); }}
                          onEditCancel={() => setMgEditingFinish(null)} isPendingRename={renameFinishMutation.isPending}
                          isDeleting={mgDeleteFinishConfirm === name}
                          onDeleteConfirm={() => deleteFinishMutation.mutate(name, {
                            onSuccess: () => deleteCatalogOptionMutation.mutate({ kind: "finish", value: name }, {
                              onSuccess: () => toast({ title: "Acabamento removido", description: `"${name}" foi removido de todos os modelos` }),
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
          com o vermelho #dc2626 e o "Cancelar" à esquerda — um terceiro
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
                <button
                  type="button"
                  onClick={() => deleteStandardItemMutation.mutate(deleteConfirm.id)}
                  disabled={deleteStandardItemMutation.isPending}
                  aria-busy={deleteStandardItemMutation.isPending}
                  data-testid="button-confirm-delete-model"
                  style={{ height: toque + 4, borderRadius: R.md, border: "none", backgroundColor: TOM.perigo.text, color: T.surface, fontSize: 14, fontWeight: 800, cursor: deleteStandardItemMutation.isPending ? "wait" : "pointer", opacity: deleteStandardItemMutation.isPending ? 0.7 : 1, transition: "background-color 0.15s ease" }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = TOM.perigo.text)}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = TOM.perigo.text)}
                >
                  {deleteStandardItemMutation.isPending ? "Excluindo…" : "Sim, excluir"}
                </button>
                <button
                  type="button"
                  data-testid="button-cancel-delete-model"
                  onClick={() => setDeleteConfirm(null)}
                  style={{ height: toque, borderRadius: R.md, border: "none", backgroundColor: "transparent", color: T.apoio, fontSize: FS.body, fontWeight: 700, cursor: "pointer" }}
                >
                  Manter
                </button>
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

/* ── Icon button with hover color ── */
function HoverIconBtn({ icon, hoverBg, hoverColor, onClick, testId, title, ariaLabel, tamanho = 32 }: {
  icon: React.ReactNode; hoverBg: string; hoverColor: string;
  onClick: () => void; testId: string; title: string; ariaLabel?: string;
  /** 32 no desktop, 44 no celular — o alvo de toque das outras tabelas. */
  tamanho?: number;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button type="button" onClick={onClick} data-testid={testId} title={title} aria-label={ariaLabel ?? title}
      // Foco de teclado acende o mesmo realce do hover: antes só o mouse
      // mostrava qual ação estava sob o cursor.
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)} onBlur={() => setHovered(false)}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: tamanho, height: tamanho, borderRadius: 8, border: "none", cursor: "pointer",
        backgroundColor: hovered ? hoverBg : "transparent",
        color: hovered ? hoverColor : T.second,
        transition: "background-color 0.15s ease, color 0.15s ease",
      }}
    >
      {icon}
    </button>
  );
}
