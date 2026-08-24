// ─────────────────────────────────────────────────────────────────────────────
// A BUSCA DO HISTÓRICO SAI DA JANELA (frente 2 do diagnóstico de 24/08).
//
// A trilha caminhada para em 20.000 registros, de propósito — sem teto, em
// dois anos a tela traria o banco inteiro para a memória do navegador. O
// problema era a BUSCA herdar o teto: buscar "#2993" numa peça cujo histórico
// ficou além da janela respondia "nada", errado por omissão.
//
// O desenho: quem busca pergunta ao SERVIDOR (?busca= consulta a tabela
// inteira, ILIKE em details/user_name/entity_id), e a tela mescla o resultado
// na janela. A lista cronológica sem filtro continua janela + teto — o teto
// protege a memória; a busca não precisa mais dele.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const STORAGE = readFileSync(new URL("../storage.ts", import.meta.url), "utf8");
const ROTA = readFileSync(new URL("../routes/audit-logs.ts", import.meta.url), "utf8");
const TELA = readFileSync(new URL("../../client/src/pages/historico.tsx", import.meta.url), "utf8");

describe("o servidor busca na tabela inteira", () => {
  it("ILIKE nas três colunas que carregam texto", () => {
    expect(STORAGE).toContain("ilike(auditLogs.details, padrao)");
    expect(STORAGE).toContain("ilike(auditLogs.userName, padrao)");
    expect(STORAGE).toContain("ilike(auditLogs.entityId, padrao)");
  });

  it("o termo é literal: %, _ e \\ são escapados", () => {
    // Sem isto, buscar "100%" viraria "tudo que contém 100" — e um termo com
    // "_" casaria qualquer caractere naquela posição.
    expect(STORAGE).toContain('t.replace(/[\\\\%_]/g, (c) => "\\\\" + c)');
  });

  it("termo vazio não vira filtro — a listagem normal fica intocada", () => {
    expect(STORAGE).toContain("const t = termo?.trim();");
    expect(STORAGE).toContain("if (!t) return undefined;");
  });

  it("a busca compõe com cursor e recorte — mesma cláusula, mesmo funil", () => {
    expect(STORAGE).toContain("auditLogsBefore(opts.cursor), auditLogsBusca(opts.busca)");
  });

  it("a rota repassa ?busca= para a listagem E para a contagem", () => {
    expect(ROTA).toContain('busca: typeof busca === "string" ? busca : undefined');
    const i = ROTA.indexOf("getAuditLogsCount(");
    expect(ROTA.slice(i, i + 220)).toContain('typeof busca === "string"');
  });

  it("há UMA só declaração do helper e do campo — o duplo-patch já mordeu aqui", () => {
    expect(STORAGE.match(/function auditLogsBusca/g)?.length).toBe(1);
    expect(STORAGE.match(/busca\?: string \| null;/g)?.length).toBe(1);
  });
});

describe("a tela pede o que a janela não alcança", () => {
  it("busca com ≥2 caracteres e janela incompleta consulta o servidor", () => {
    expect(TELA).toContain("const querBusca = termo.length >= 2 && !janelaCompleta;");
    expect(TELA).toContain("busca=${encodeURIComponent(termo)}");
  });

  it("a trilha por peça consulta por entityId — o histórico da peça inteiro", () => {
    expect(TELA).toContain("entityType=item&entityId=${encodeURIComponent(trilhaItemId)}");
  });

  it("com a janela completa, não há o que pedir — nenhuma consulta extra", () => {
    expect(TELA).toContain("if (!querBusca && !querTrilha) return;");
  });

  it("o resultado entra pelo MESMO funil das páginas caminhadas", () => {
    // Registros crus mesclados com dedup por id antes do buildTimeline: mesma
    // aparência, mesmo autor, mesma navegação — não uma segunda lista.
    expect(TELA).toContain("const [alemDaJanela, setAlemDaJanela] = useState<any[]>([]);");
    expect(TELA).toContain("paginasSeguintes.concat(alemDaJanela)");
  });

  it("chegada de busca não dispara a pílula de novidade", () => {
    // O passado que o usuário PEDIU para ver não é "N novas atividades".
    const i = TELA.indexOf("setAlemDaJanela((prev) => {");
    expect(TELA.slice(i - 300, i)).toContain("adoptNextRef.current = true;");
  });

  it("com debounce — a consulta é na tabela toda, uma por tecla seria grosseria", () => {
    expect(TELA).toContain("}, 350);");
  });
});
