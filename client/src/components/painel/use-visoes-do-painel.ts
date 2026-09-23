// ─── Visões salvas do Painel Geral ──────────────────────────────────────────
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { useToast } from "@/hooks/use-toast";
import {
  visoesParaPapel, visaoEstaAtiva, chaveVisaoPadrao, type Visao, type VisaoFiltros,
} from "@/lib/painel-visoes";

export function useVisoesDoPainel({
  role, filtrosAtuais, urlParams, toast, setStatusFilter, setDateFilter, setFocoFilter,
}: {
  role: string | null | undefined;
  filtrosAtuais: VisaoFiltros;
  urlParams: URLSearchParams;
  toast: ReturnType<typeof useToast>["toast"];
  setStatusFilter: Dispatch<SetStateAction<string[]>>;
  setDateFilter: Dispatch<SetStateAction<string[]>>;
  setFocoFilter: Dispatch<SetStateAction<string[]>>;
}) {
  const visoes = useMemo(() => visoesParaPapel(role), [role]);
  const aplicarVisao = (v: Visao) => {
    const ativa = visaoEstaAtiva(v, filtrosAtuais);
    setStatusFilter(ativa ? [] : [...v.filtros.status]);
    setDateFilter(ativa ? [] : [...v.filtros.saida]);
    setFocoFilter(ativa ? [] : [...v.filtros.foco]);
  };
  const [visaoPadrao, setVisaoPadrao] = useState<string | null>(null);
  useEffect(() => {
    try { setVisaoPadrao(localStorage.getItem(chaveVisaoPadrao(role))); } catch { /* modo privado */ }
  }, [role]);
  const fixarVisaoPadrao = (v: Visao) => {
    const novo = visaoPadrao === v.id ? null : v.id;
    setVisaoPadrao(novo);
    try {
      if (novo) localStorage.setItem(chaveVisaoPadrao(role), novo);
      else localStorage.removeItem(chaveVisaoPadrao(role));
    } catch { /* modo privado */ }
    toast({
      title: novo ? "Visão padrão definida" : "Visão padrão removida",
      description: novo ? `"${v.label}" será aplicada ao abrir o Painel sem filtros na URL.` : "O Painel volta a abrir sem recorte.",
      variant: "success",
    });
  };
  // Aplica a visão padrão UMA vez, e só quando a URL não trouxe filtro nenhum —
  // um link compartilhado sempre vence a preferência local, senão o colega abre
  // o link e vê outra coisa. O chip do filtro aparece normalmente: nunca é um
  // recorte silencioso.
  const visaoPadraoAplicada = useRef(false);
  useEffect(() => {
    if (visaoPadraoAplicada.current || visaoPadrao === null) return;
    visaoPadraoAplicada.current = true;
    if (urlParams.toString()) return;
    const v = visoes.find(x => x.id === visaoPadrao);
    if (!v) return;
    setStatusFilter([...v.filtros.status]);
    setDateFilter([...v.filtros.saida]);
    setFocoFilter([...v.filtros.foco]);
  }, [visaoPadrao, visoes, urlParams]);

  return { visoes, aplicarVisao, visaoPadrao, fixarVisaoPadrao };
}
