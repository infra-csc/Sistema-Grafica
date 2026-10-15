// Os patrocinadores que o Ummense dá para o evento sugerido, no formulário de
// criação: quantos já vieram marcados (lista abaixo, com a cota do Ummense) e
// os que NÃO existem no cadastro — com "Criar no cadastro", que só cria se a
// pessoa clicar (POST /api/sponsors, os mesmos papéis que criam evento).
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Plus, Archive } from "lucide-react";
import type { Sponsor } from "@shared/schema";
import type { PatrocinadorSugerido } from "@shared/eventos-sugeridos";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Botao } from "@/components/ui/botao";
import type { FormularioDoEventoAberto } from "./use-formulario-do-evento";

const VISIVEIS = 4;
const mensagem = (e: unknown) => (e instanceof Error && e.message) || "Tente de novo.";

export function PatrocinadoresDoUmmense({ form, isMobile }: { form: FormularioDoEventoAberto; isMobile: boolean }) {
  const { sugestaoDoUmmense: sugestao, selectedSponsorIds, setSelectedSponsorIds, setSponsorQuotaMap } = form;
  const { toast } = useToast();
  // Nome do Ummense → patrocinador criado agora (some do "criar", vira "marcado").
  const [criados, setCriados] = useState<Record<string, string>>({});
  const [criando, setCriando] = useState<string | null>(null);
  // Lista longa (o Night Run SP tem 11 sem cadastro) empurrava a escolha de
  // patrocinadores para longe: mostra 4 e o resto sob demanda.
  const [verTodos, setVerTodos] = useState(false);

  const criar = useMutation({
    mutationFn: async (p: PatrocinadorSugerido) => {
      const r = await apiRequest("POST", "/api/sponsors", { name: p.nomeNoUmmense.trim() });
      return { p, sponsor: (await r.json()) as Sponsor };
    },
    onMutate: (p) => setCriando(p.nomeNoUmmense),
    onSuccess: ({ p, sponsor }) => {
      setCriados((prev) => ({ ...prev, [p.nomeNoUmmense]: sponsor.id }));
      setSelectedSponsorIds((prev) => (prev.includes(sponsor.id) ? prev : [...prev, sponsor.id]));
      if (p.cotaNoApp) setSponsorQuotaMap((prev) => ({ ...prev, [sponsor.id]: p.cotaNoApp! }));
      queryClient.invalidateQueries({ queryKey: ["/api/sponsors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/eventos-sugeridos"] });
      toast({ title: "Patrocinador cadastrado", description: `"${sponsor.name}" foi criado e já está marcado neste evento.`, variant: "success" });
    },
    onError: (e, p) => toast({ title: `Não foi possível cadastrar "${p.nomeNoUmmense}"`, description: mensagem(e), variant: "destructive" }),
    onSettled: () => setCriando(null),
  });

  if (!sugestao || sugestao.patrocinadores.length === 0) return null;
  // Os casados com o cadastro e os criados agora, que estão marcados na lista.
  const marcados = sugestao.patrocinadores.filter((p) => {
    const id = p.sponsorId && !p.arquivado ? p.sponsorId : criados[p.nomeNoUmmense];
    return !!id && selectedSponsorIds.includes(id);
  }).length;
  const semCadastro = sugestao.patrocinadores.filter((p) => !p.sponsorId);
  const arquivados = sugestao.patrocinadores.filter((p) => p.sponsorId && p.arquivado);
  const faltam = semCadastro.filter((p) => !criados[p.nomeNoUmmense]).length;

  return (
    <section className="sug-ev-bloco" aria-labelledby="sug-ev-bloco-titulo" data-testid="patrocinadores-do-ummense">
      <div className="sug-ev-bloco-cab">
        <span id="sug-ev-bloco-titulo" className="sug-ev-bloco-titulo">Patrocinadores no Ummense</span>
        <span className="sug-ev-bloco-resumo">
          {sugestao.patrocinadores.length} no Ummense · {marcados} já marcado{marcados === 1 ? "" : "s"} abaixo com a cota de lá
          {faltam > 0 ? ` · ${faltam} sem cadastro` : ""}
        </span>
      </div>

      {semCadastro.length > 0 && (
        <ul className="sug-ev-lista-patr" aria-label="Sem cadastro no app">
          {(verTodos ? semCadastro : semCadastro.slice(0, VISIVEIS)).map((p) => {
            const criado = criados[p.nomeNoUmmense];
            return (
              <li key={p.nomeNoUmmense} className="sug-ev-patr" data-testid={`patr-sem-cadastro-${p.nomeNoUmmense}`}>
                <span className="sug-ev-patr-nome">
                  {p.nomeNoUmmense}
                  {p.cota && <span className="sug-ev-cota">{p.cota}</span>}
                </span>
                {criado ? (
                  <span className="sug-ev-patr-feito"><Check aria-hidden="true" style={{ width: 14, height: 14 }} /> Cadastrado e marcado</span>
                ) : (
                  <Botao
                    variante="secundario"
                    tamanho={isMobile ? "toque" : "sm"}
                    icone={Plus}
                    carregando={criando === p.nomeNoUmmense}
                    disabled={!!criando}
                    onClick={() => criar.mutate(p)}
                    aria-label={`Criar "${p.nomeNoUmmense}" no cadastro de patrocinadores`}
                    data-testid={`criar-patrocinador-${p.nomeNoUmmense}`}
                  >
                    {isMobile ? "Cadastrar" : "Criar no cadastro"}
                  </Botao>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {semCadastro.length > VISIVEIS && (
        <button type="button" className="sug-ev-ver-todos" aria-expanded={verTodos} onClick={() => setVerTodos((v) => !v)} data-testid="ver-todos-sem-cadastro">
          {verTodos ? "Mostrar menos" : `Mostrar os outros ${semCadastro.length - VISIVEIS} sem cadastro`}
        </button>
      )}

      {arquivados.length > 0 && (
        <p className="sug-ev-arquivados" data-testid="patr-arquivados">
          <Archive aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0 }} />
          <span>
            Arquivado{arquivados.length === 1 ? "" : "s"} no cadastro, não marcado{arquivados.length === 1 ? "" : "s"}: {arquivados.map((p) => p.nomeNoApp ?? p.nomeNoUmmense).join(", ")}. Restaure em Patrocinadores para usar.
          </span>
        </p>
      )}
    </section>
  );
}
