// ─────────────────────────────────────────────────────────────────────────────
// ABA "PESSOAS" — quanto cada pessoa e cada setor REGISTROU no sistema no
// período, por natureza da ação (enviar arte, aprovar, conferir, embalar…).
//
// O QUE ESTA ABA NÃO É, E DIZ NO TOPO: nota de desempenho. Ela conta linhas da
// trilha. Uma ação pode levar um minuto ou um dia; quem destrava um problema
// difícil por telefone aparece com pouco; o perfil Admin faz de tudo um pouco.
// O aviso fica FORA do bloco do servidor de propósito: ele aparece antes do
// número, inclusive enquanto o número carrega — ninguém lê o ranking sem ele.
//
// Tudo aqui vem do levantamento do servidor (a trilha não chega ao cliente):
// são agregados, não conjuntos de peças, e por isso nenhum número abre lista.
// A ordem das naturezas é a do contrato (NATUREZAS_DAS_ACOES = ordem do fluxo);
// natureza que o servidor passe a mandar e a tela ainda não conheça aparece no
// fim, nunca some.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { Segmentado } from "@/components/ui/abas";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/estados";
import { T, TOM, FS, FW } from "@/lib/theme";
import { roleLabel } from "@/lib/utils";
import { NATUREZAS_DAS_ACOES, type OperacaoDaAnalise, type PessoasDaOperacao } from "@shared/analises-operacao-contract";
import type { ContextoDaAnalise } from "../contexto";
import {
  AvisoDeCobertura, BlocoDaOperacao, GradeDeNumeros, ListaDeBarras, NumeroDoServidor, SecaoDaAnalise, TabelaCompacta,
  fmtInt, plural, rotuloDaJanela, type ColunaDaTabela,
} from "../componentes";

/** A linha da tabela: a pessoa do servidor + a posição (o mesmo nome pode vir duas vezes). */
type Pessoa = PessoasDaOperacao["porPessoa"][number] & { indice: number };

/**
 * COMO A NATUREZA APARECE. A chave do contrato é curta e em minúscula
 * ("evento", "aprovar") porque é chave; o gestor lê o rótulo. `curto` é o do
 * cabeçalho da tabela (cabe numa coluna), `longo` o das listas. Chave que o
 * servidor passe a mandar e não esteja aqui aparece com a primeira maiúscula.
 */
const ROTULO_DA_NATUREZA: Record<string, { longo: string; curto: string }> = {
  "evento": { longo: "Criar ou editar evento", curto: "Evento" },
  "pedido de peça": { longo: "Pedido de peça", curto: "Pedido de peça" },
  "criar peça": { longo: "Criar peça", curto: "Criar peça" },
  "editar peça": { longo: "Editar peça", curto: "Editar peça" },
  "vincular patrocinador": { longo: "Vincular patrocinador", curto: "Vincular" },
  "enviar lista": { longo: "Enviar a lista", curto: "Enviar lista" },
  "enviar arte": { longo: "Enviar arte", curto: "Enviar arte" },
  "trocar arte": { longo: "Trocar arte já enviada", curto: "Trocar arte" },
  "aprovar": { longo: "Registrar aprovação", curto: "Aprovação" },
  "reprovar": { longo: "Registrar reprovação", curto: "Reprovação" },
  "liberar": { longo: "Liberar na Revisão Final", curto: "Liberar" },
  "devolver": { longo: "Devolver peça", curto: "Devolver" },
  "travar": { longo: "Travar ou destravar", curto: "Travar" },
  "estoque": { longo: "Estoque e reaproveitamento", curto: "Estoque" },
  "imprimir": { longo: "Imprimir", curto: "Imprimir" },
  "etiquetas": { longo: "Etiquetas", curto: "Etiquetas" },
  "conferir": { longo: "Conferir", curto: "Conferir" },
  "embalar": { longo: "Embalar", curto: "Embalar" },
  "entregar": { longo: "Entregar", curto: "Entregar" },
  "cancelar": { longo: "Cancelar ou restaurar peça", curto: "Cancelar" },
  "prazos": { longo: "Registro na Gestão de Prazos", curto: "Prazos" },
  "cadastros": { longo: "Cadastros", curto: "Cadastros" },
  "outras": { longo: "Outras ações", curto: "Outras" },
};
const maiuscula = (t: string) => (t ? t[0].toLocaleUpperCase("pt-BR") + t.slice(1) : t);
const rotuloDaNatureza = (k: string) => ROTULO_DA_NATUREZA[k]?.longo ?? maiuscula(k);
const curtoDaNatureza = (k: string) => ROTULO_DA_NATUREZA[k]?.curto ?? maiuscula(k);

/** Quantas naturezas viram coluna na tabela (as mais frequentes do recorte); o resto soma em "Demais". */
const COLUNAS_DE_NATUREZA = 5;

const SEM_SETOR = "__sem__";
const chaveDoSetor = (papel: string | null) => papel ?? SEM_SETOR;
const rotuloDoSetor = (chave: string) => (chave === SEM_SETOR ? "Sem cadastro ligado" : roleLabel(chave) || chave);

/** As naturezas presentes, na ordem do contrato; as desconhecidas no fim, da maior para a menor. */
function naturezasPresentes(pessoas: ReadonlyArray<{ porAcao: Record<string, number> }>): { natureza: string; total: number }[] {
  const totais = new Map<string, number>();
  for (const p of pessoas) for (const [k, n] of Object.entries(p.porAcao)) totais.set(k, (totais.get(k) ?? 0) + n);
  const conhecidas: readonly string[] = NATUREZAS_DAS_ACOES;
  const ordem = conhecidas.filter((k) => (totais.get(k) ?? 0) > 0);
  const extras = Array.from(totais.keys()).filter((k) => !conhecidas.includes(k) && (totais.get(k) ?? 0) > 0)
    .sort((a, b) => (totais.get(b) ?? 0) - (totais.get(a) ?? 0));
  return [...ordem, ...extras].map((natureza) => ({ natureza, total: totais.get(natureza) ?? 0 }));
}

/** "aprovar 30 · enviar arte 12 · conferir 4" — as maiores naturezas de um conjunto. */
function principais(porAcao: Record<string, number>, quantas = 3): string {
  return Object.entries(porAcao).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, quantas)
    .map(([k, n]) => `${rotuloDaNatureza(k)} ${fmtInt(n)}`).join(" · ");
}

export default function AbaPessoas({ ctx }: { ctx: ContextoDaAnalise }) {
  const { filtros } = ctx;
  const ignorados = [
    filtros.tipo !== "all" && "tipo de peça",
    filtros.soAtrasadas && "só atrasadas",
    filtros.soTravadas && "só travadas",
    filtros.soPrioritarias && "só prioritárias",
  ].filter(Boolean) as string[];

  return (
    <div data-testid="aba-pessoas" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <AvisoDeCobertura
        tom="alerta"
        testId="pessoas-aviso-volume"
        itens={[
          <strong key="t" style={{ fontWeight: FW.forte }}>Volume de ações, não nota de desempenho.</strong>,
          "Aqui se contam os registros que cada pessoa deixou na trilha do sistema. Uma ação pode levar um minuto ou um dia, quem resolve um problema por telefone ou pessoalmente aparece com pouco, e cada setor registra de um jeito.",
          "Use para ver onde o trabalho se concentra, não para comparar pessoas.",
        ]}
      />
      {ignorados.length > 0 && (
        <AvisoDeCobertura
          testId="pessoas-filtros-ignorados"
          itens={[`Esta aba segue o evento e o patrocinador do topo, mas não ${ignorados.length === 1 ? "o filtro" : "os filtros"} ${ignorados.join(", ")}: a trilha registra ações, e esses recortes são do estado das peças hoje.`]}
        />
      )}
      <BlocoDaOperacao ctx={ctx} titulo="Ações por pessoa">
        {(op) => <Corpo ctx={ctx} op={op} />}
      </BlocoDaOperacao>
    </div>
  );
}

function Corpo({ ctx, op }: { ctx: ContextoDaAnalise; op: OperacaoDaAnalise }) {
  const { cobertura } = op.pessoas;
  const porPessoa: Pessoa[] = React.useMemo(() => op.pessoas.porPessoa.map((p, indice) => ({ ...p, indice })), [op.pessoas.porPessoa]);
  const janela = rotuloDaJanela(op);
  const [setor, setSetor] = React.useState<string>("todos");
  const [todasAsNaturezas, setTodasAsNaturezas] = React.useState(false);

  const dados = React.useMemo(() => {
    const naturezas = naturezasPresentes(porPessoa);
    const setores = new Map<string, { chave: string; pessoas: number; total: number; porAcao: Record<string, number> }>();
    for (const p of porPessoa) {
      const k = chaveDoSetor(p.papel);
      const s = setores.get(k) ?? { chave: k, pessoas: 0, total: 0, porAcao: {} };
      s.pessoas += 1;
      s.total += p.total;
      for (const [a, n] of Object.entries(p.porAcao)) s.porAcao[a] = (s.porAcao[a] ?? 0) + n;
      setores.set(k, s);
    }
    const listaDeSetores = Array.from(setores.values()).sort((a, b) => b.total - a.total);
    const total = porPessoa.reduce((t, p) => t + p.total, 0);
    const maisFrequente = naturezas.reduce<{ natureza: string; total: number } | null>((m, n) => (!m || n.total > m.total ? n : m), null);
    return { naturezas, setores: listaDeSetores, total, maisFrequente };
  }, [porPessoa]);

  // O setor escolhido pode sumir quando o recorte muda: volta para "todos".
  const setorValido = setor === "todos" || dados.setores.some((s) => s.chave === setor) ? setor : "todos";
  const pessoasDoSetor = setorValido === "todos" ? porPessoa : porPessoa.filter((p) => chaveDoSetor(p.papel) === setorValido);
  const naturezasDoSetor = setorValido === "todos" ? dados.naturezas : naturezasPresentes(pessoasDoSetor);

  const avisos = (
    <AvisoDeCobertura
      testId="pessoas-cobertura"
      tom={cobertura.truncado ? "alerta" : "neutro"}
      itens={[
        cobertura.truncado
          ? `A leitura da trilha tem teto de ${fmtInt(cobertura.teto)} linhas e ele foi atingido: ficaram as ações mais recentes, e o começo do período está FORA destes números.`
          : `${fmtInt(cobertura.linhasLidas)} ${plural(cobertura.linhasLidas, "linha da trilha lida", "linhas da trilha lidas")} ${janela} — o período inteiro (teto de ${fmtInt(cobertura.teto)}).`,
        cobertura.soAcoesEmPecas && "Com filtro de evento ou patrocinador, só contam as ações sobre peças desse recorte: tubos, estoque e cadastros não têm evento e ficam de fora.",
        "Rotinas automáticas do sistema não são pessoa e não entram. O setor é o perfil ATUAL de cada usuário.",
      ]}
    />
  );

  if (porPessoa.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <EstadoVazio compacto testId="pessoas-vazio" titulo={`Nenhuma ação registrada ${janela}`} descricao="Neste recorte ninguém registrou ação na trilha." />
        {avisos}
      </div>
    );
  }

  // As colunas: só naturezas com valor no recorte e, por padrão, as
  // COLUNAS_DE_NATUREZA mais frequentes (na ordem do fluxo) + "Demais" — 15
  // colunas rolando de lado não se leem. O botão abre todas.
  const maiores = new Set([...naturezasDoSetor].sort((a, b) => b.total - a.total).slice(0, COLUNAS_DE_NATUREZA).map((n) => n.natureza));
  const visiveis = todasAsNaturezas ? naturezasDoSetor : naturezasDoSetor.filter((n) => maiores.has(n.natureza));
  const demais = todasAsNaturezas ? [] : naturezasDoSetor.filter((n) => !maiores.has(n.natureza)).map((n) => n.natureza);
  const somaDasDemais = (p: Pessoa) => demais.reduce((t, k) => t + (p.porAcao[k] ?? 0), 0);
  const colunasDeNatureza: ColunaDaTabela<Pessoa>[] = [
    ...visiveis.map(({ natureza }): ColunaDaTabela<Pessoa> => ({
      id: `n-${natureza}`,
      rotulo: curtoDaNatureza(natureza),
      titulo: rotuloDaNatureza(natureza),
      alinhar: "direita",
      ordenavel: true,
      ocultarNoCelular: true,
      valor: (p) => p.porAcao[natureza] ?? 0,
      render: (p) => (p.porAcao[natureza] ? fmtInt(p.porAcao[natureza]) : <span style={{ color: T.second }}>—</span>),
    })),
    ...(demais.length > 0 ? [{
      id: "n-demais",
      rotulo: "Demais",
      titulo: `Soma de: ${demais.map(rotuloDaNatureza).join(", ")}`,
      alinhar: "direita" as const,
      ordenavel: true,
      ocultarNoCelular: true,
      valor: somaDasDemais,
      render: (p: Pessoa) => (somaDasDemais(p) ? fmtInt(somaDasDemais(p)) : <span style={{ color: T.second }}>—</span>),
    }] : []),
  ];
  const setorDeMais = dados.setores[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section aria-labelledby="h-pes-resumo">
        <h2 id="h-pes-resumo" className="sr-only">Resumo das ações</h2>
        <GradeDeNumeros minimo={160} rotulo={`Ações ${janela}`}>
          <NumeroDoServidor testId="pessoas-total" rotulo={`Ações registradas ${janela}`} valor={dados.total} />
          <NumeroDoServidor testId="pessoas-n" rotulo="Pessoas com ação" valor={porPessoa.length} />
          <NumeroDoServidor testId="pessoas-acao-mais" rotulo="Ação mais frequente"
            valor={dados.maisFrequente ? rotuloDaNatureza(dados.maisFrequente.natureza) : "—"}
            sub={dados.maisFrequente ? `${fmtInt(dados.maisFrequente.total)} ${plural(dados.maisFrequente.total, "ação", "ações")} · ${Math.round((dados.maisFrequente.total / Math.max(1, dados.total)) * 100)}% do total` : undefined} />
          <NumeroDoServidor testId="pessoas-setor-mais" rotulo="Setor com mais ações"
            valor={setorDeMais ? rotuloDoSetor(setorDeMais.chave) : "—"}
            sub={setorDeMais ? `${fmtInt(setorDeMais.total)} ${plural(setorDeMais.total, "ação", "ações")} · ${fmtInt(setorDeMais.pessoas)} ${plural(setorDeMais.pessoas, "pessoa", "pessoas")}` : undefined} />
        </GradeDeNumeros>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 20, alignItems: "start" }}>
        <SecaoDaAnalise id="h-pes-setores" testId="pessoas-por-setor" titulo="Por setor" descricao="O total de ações de cada setor e as naturezas que mais aparecem nele.">
          <ListaDeBarras
            testId="pessoas-lista-setores"
            legenda={`Ações por setor ${janela}`}
            itens={dados.setores.map((s) => ({
              id: s.chave,
              rotulo: rotuloDoSetor(s.chave),
              valor: s.total,
              cor: TOM.info.dot,
              texto: `${fmtInt(s.total)} ${plural(s.total, "ação", "ações")}`,
              detalhe: <>
                <span>{fmtInt(s.pessoas)} {plural(s.pessoas, "pessoa", "pessoas")}</span>
                <span>{principais(s.porAcao)}</span>
              </>,
            }))}
          />
        </SecaoDaAnalise>
        <SecaoDaAnalise id="h-pes-naturezas" testId="pessoas-por-natureza" titulo="Por natureza" descricao="O que foi feito no período, na ordem do fluxo — da criação do evento à entrega.">
          <ListaDeBarras
            testId="pessoas-lista-naturezas"
            legenda={`Ações por natureza ${janela}`}
            duasColunas={dados.naturezas.length > 6}
            itens={dados.naturezas.map((n) => ({ id: n.natureza, rotulo: rotuloDaNatureza(n.natureza), valor: n.total, cor: TOM.neutro.dot }))}
          />
        </SecaoDaAnalise>
      </div>

      <SecaoDaAnalise
        id="h-pes-tabela"
        testId="pessoas-tabela"
        titulo="Por pessoa"
        descricao={ctx.isMobile
          ? "Cada pessoa com o setor e o total de ações no período."
          : "Cada pessoa com o total e as naturezas mais frequentes em coluna (o resto soma em “Demais”). Ordene por qualquer coluna."}
      >
        {dados.setores.length > 1 && (
          <div style={{ marginBottom: 12, maxWidth: "100%", overflowX: "auto" }}>
            <Segmentado
              rotuloDaLista="Setor"
              prefixoDeTestId="pessoas-setor"
              tamanho={ctx.isMobile ? "toque" : "sm"}
              ativo={setorValido}
              aoTrocar={setSetor}
              itens={[
                { id: "todos", rotulo: "Todos", contador: porPessoa.length },
                ...dados.setores.map((s) => ({ id: s.chave, rotulo: rotuloDoSetor(s.chave), contador: s.pessoas })),
              ]}
            />
          </div>
        )}
        <TabelaCompacta<Pessoa>
          key={`${setorValido}|${todasAsNaturezas}`}
          testId="tabela-pessoas"
          legenda={`Ações por pessoa ${janela}`}
          linhas={pessoasDoSetor}
          chave={(p) => `${p.indice}|${p.nome}`}
          limite={15}
          minLargura={360 + colunasDeNatureza.length * 96}
          ordemInicial={{ coluna: "total", direcao: "desc" }}
          colunas={[
            { id: "nome", rotulo: "Pessoa", ordenavel: true, valor: (p) => p.nome,
              render: (p) => <span style={{ display: "inline-block", minWidth: 120, maxWidth: 220, overflowWrap: "anywhere" }}>{p.nome}</span> },
            { id: "setor", rotulo: "Setor", ordenavel: true, valor: (p) => rotuloDoSetor(chaveDoSetor(p.papel)),
              render: (p) => <span style={{ whiteSpace: "nowrap", color: p.papel ? T.text : T.second }}>{rotuloDoSetor(chaveDoSetor(p.papel))}</span> },
            { id: "total", rotulo: "Total", ordenavel: true, alinhar: "direita", valor: (p) => p.total,
              render: (p) => <strong style={{ fontWeight: FW.forte }}>{fmtInt(p.total)}</strong> },
            ...colunasDeNatureza,
          ]}
        />
        {!ctx.isMobile && naturezasDoSetor.length > COLUNAS_DE_NATUREZA && (
          <Botao variante="fantasma" tamanho="sm" onClick={() => setTodasAsNaturezas((v) => !v)} data-testid="pessoas-todas-naturezas" style={{ marginTop: 8 }}>
            {todasAsNaturezas ? "Mostrar só as mais frequentes" : `Mostrar as ${fmtInt(naturezasDoSetor.length)} naturezas em coluna`}
          </Botao>
        )}
        <p style={{ margin: "8px 0 0", fontSize: FS.small, color: T.second }}>
          “Liberar” é a decisão da Revisão Final; “Devolver” é toda devolução que não é reprovação do patrocinador; “Estoque” junta pedidos, reservas, triagem e reaproveitamento.
        </p>
      </SecaoDaAnalise>

      {avisos}
    </div>
  );
}
