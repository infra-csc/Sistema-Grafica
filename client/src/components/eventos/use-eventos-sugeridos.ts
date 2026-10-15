// As sugestões do Ummense (GET /api/eventos-sugeridos) e o "Ignorar".
//
// IGNORAR É POR PESSOA, NESTE NAVEGADOR (localStorage). O app não tem tabela
// de configuração/chave-valor compartilhada, e guardar isto no banco pediria
// migração nova — decisão do dono. A chave leva o id do usuário: quem divide
// o computador não herda o que o outro ignorou. O id da sugestão é estável
// entre fotos enquanto nome e data não mudam no Ummense.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { RespostaEventosSugeridos } from "@shared/eventos-sugeridos";

export const CHAVE_DOS_IGNORADOS = (userId: string) => `sug-ev-ignorados:${userId}`;

function lerIgnorados(chave: string | null): string[] {
  if (!chave) return [];
  try {
    const cru = JSON.parse(window.localStorage.getItem(chave) || "[]");
    return Array.isArray(cru) ? cru.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function useEventosSugeridos({ habilitado, userId }: { habilitado: boolean; userId: string | null | undefined }) {
  const consulta = useQuery<RespostaEventosSugeridos>({
    queryKey: ["/api/eventos-sugeridos"],
    enabled: habilitado,
    // A foto muda raramente (alguém gera de novo); o que muda é o app — e a
    // criação de evento invalida esta consulta.
    staleTime: 5 * 60_000,
  });
  const chave = userId ? CHAVE_DOS_IGNORADOS(userId) : null;
  const [ignorados, setIgnorados] = useState<string[]>(() => lerIgnorados(chave));
  // O usuário chega depois do primeiro render (auth carregando): relê com a chave dele.
  useEffect(() => { setIgnorados(lerIgnorados(chave)); }, [chave]);
  const gravar = useCallback((lista: string[]) => {
    setIgnorados(lista);
    if (!chave) return;
    try { window.localStorage.setItem(chave, JSON.stringify(lista)); } catch { /* sem armazenamento: vale só nesta visita */ }
  }, [chave]);
  const ignorar = useCallback((id: string) => gravar(Array.from(new Set([...ignorados, id]))), [gravar, ignorados]);
  const voltarASugerir = useCallback((id: string) => gravar(ignorados.filter((x) => x !== id)), [gravar, ignorados]);

  const dados = consulta.data && Array.isArray(consulta.data.sugestoes) ? consulta.data : null;
  const conjunto = useMemo(() => new Set(ignorados), [ignorados]);
  const visiveis = useMemo(() => (dados?.sugestoes ?? []).filter((s) => !conjunto.has(s.id)), [dados, conjunto]);
  const ignoradas = useMemo(() => (dados?.sugestoes ?? []).filter((s) => conjunto.has(s.id)), [dados, conjunto]);

  return {
    dados,
    carregando: consulta.isLoading,
    erro: consulta.isError,
    recarregar: consulta.refetch,
    visiveis,
    ignoradas,
    ignorar,
    voltarASugerir,
  };
}

export type EventosSugeridosAbertos = ReturnType<typeof useEventosSugeridos>;
