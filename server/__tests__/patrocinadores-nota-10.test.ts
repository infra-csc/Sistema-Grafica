// ─────────────────────────────────────────────────────────────────────────────
// PATROCINADORES nota 10 — a coluna Resposta, o uso que leva às peças, e o
// formulário de três campos.
//
// Duas das três mudanças do handoff, mais um adendo do dono:
//
// 1 · RESPOSTA: o app inteiro depende da resposta do patrocinador (a Arte
//     precisou de "quem está travando"; o Painel conta peças paradas), e este
//     cadastro — o registro de quem aprova — não dizia nada sobre aprovar.
//     Duas medidas numa célula: pendências AGORA e tempo MÉDIO de resposta,
//     no MESMO agregado que já devolvia o uso (getSponsorUsage), não em N
//     requisições. Sem histórico de decisão, a média é "—": zero leria como
//     "responde na hora", que é o oposto.
// 2 · "SEM E-MAIL = NÃO RECEBE APROVAÇÃO" — PULADA, com motivo: o app não
//     envia nada ao patrocinador por e-mail (quem registra aprovar/reprovar é
//     o Atendimento, em nome dele — ver arte-nota-10). O selo seria uma
//     afirmação falsa sobre um canal que não existe. E o dono tirou o e-mail
//     do formulário no mesmo dia.
// 3 · O USO LEVA ÀS PEÇAS: "12 eventos · 148 pç" vira link para o Painel
//     Geral, que já aceita ?patrocinador=. A linha inteira abre a edição —
//     daí o stopPropagation. "sem evento" continua selo.
// ADENDO DO DONO: o formulário fica SÓ com nome, executivo responsável e cor.
//     Empresa, contato, telefone, e-mail e observações saem do modal; as
//     colunas continuam no banco e na tabela para o que já foi preenchido.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const P = ler("client/src/pages/patrocinadores.tsx");
const STORAGE = ler("server/storage.ts");
const semCom = (s: string) => s.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map(l => l.replace(/^\s*\/\/.*$/, "")).join("\n");

describe("1 · a coluna Resposta", () => {
  it("o agregado vem no MESMO endpoint do uso — pendências e média, em duas queries a mais", () => {
    const i = STORAGE.indexOf("async getSponsorUsage()");
    const corpo = STORAGE.slice(i, i + 2600);
    expect(corpo).toContain("pendencias: number; mediaDias: number | null");
    expect(corpo).toContain("in ('pending', 'new_version_pending')");
    expect(corpo).toContain("avg(extract(epoch from (coalesce(");
    // Sem decisão, sem média — nunca zero.
    expect(corpo).toContain("mediaDias: null as number | null");
    expect(corpo).toContain("Number.isFinite(m) ? Math.max(0, Math.round(m)) : null");
  });

  it("a célula diz as duas medidas, com os tons da escala", () => {
    expect(P).toContain("data-testid={`cell-resposta-${sponsor.id}`}");
    expect(P).toContain('const corPend = pend === 0 ? "#15803d" : pend >= 5 ? "#b91c1c" : "#b45309";');
    expect(P).toContain('const corMedia = media === null ? T.second : media >= 14 ? "#b91c1c" : media >= 7 ? "#b45309" : "#57534e";');
    expect(P).toContain('{pend === 0 ? "em dia" : `${pend} pend.`}');
    expect(P).toContain('{media === null ? "—" : `${media}d`}');
  });

  it("o title diz as duas por extenso, e 'nunca respondeu' em vez de média inventada", () => {
    expect(P).toContain("aprovação agora`} · ${media === null ? \"nunca respondeu a um pedido — sem média\"");
    expect(P).toContain("em média para responder`}`;");
  });

  it("a coluna entra entre Eventos e Contato", () => {
    const th = P.indexOf('title="Pendências de aprovação agora · tempo médio de resposta">Resposta</th>');
    expect(th).toBeGreaterThan(-1);
    expect(th).toBeLessThan(P.indexOf("<th style={thStyle}>Contato Responsável</th>"));
  });
});

describe("3 · o uso leva às peças", () => {
  it("é um link para o Painel Geral com ?patrocinador=, sem abrir a edição por acidente", () => {
    expect(P).toContain("data-testid={`link-uso-${sponsor.id}`}");
    expect(P).toContain("href={`/?patrocinador=${sponsor.id}`}");
    const i = P.indexOf("data-testid={`link-uso-${sponsor.id}`}");
    expect(P.slice(i - 300, i)).toContain("onClick={e => e.stopPropagation()}");
    // E o Painel de fato lê esse parâmetro.
    expect(ler("client/src/pages/painel-geral.tsx")).toContain('fromCsv("patrocinador")');
  });

  it("'sem evento' continua selo, não link", () => {
    expect(P).toContain('title="Nunca vinculado a um evento"');
    const i = P.indexOf('title="Nunca vinculado a um evento"');
    expect(P.slice(i - 200, i + 300)).not.toContain("<Link");
  });
});

describe("o formulário tem três campos — adendo do dono", () => {
  it("o schema é nome, cor e executivo", () => {
    const i = P.indexOf("const sponsorSchema = z.object({");
    const corpo = P.slice(i, i + 400);
    expect(corpo).toContain("name:");
    expect(corpo).toContain("color:");
    expect(corpo).toContain("accountExecutiveId:");
    for (const campo of ["email", "phone", "company", "contactPerson", "notes"]) {
      expect(corpo).not.toContain(`${campo}:`);
    }
  });

  it("os cinco campos saíram do modal, e a seção 03 junto", () => {
    const cru = semCom(P);
    for (const t of ["input-company", "input-contact-person", "input-phone", "input-email", "input-notes"]) {
      expect(cru).not.toContain(t);
    }
    // A seção 03 de CONTATO saiu; a 03 que existe hoje é a regra de aprovação
    // (patrocinador desaprovador, pedido posterior do dono no mesmo dia).
    expect(cru).toContain('sectionLabel("03", "Regra de aprovação")');
    expect(cru).not.toContain('sectionLabel("03", "Contato")');
    // Os três que ficam.
    expect(P).toContain('data-testid="input-sponsor-name"');
    expect(P).toContain('testId="select-account-executive"');
    expect(P).toContain("data-testid={`color-${c}`}");
  });

  it("e `quota` continua FORA do formulário", () => {
    const i = P.indexOf("const sponsorSchema = z.object({");
    expect(P.slice(i, i + 400)).not.toContain("quota");
  });
});

describe("2 · o selo 'sem e-mail' NÃO entrou — e o motivo está escrito", () => {
  it("nenhum selo afirma um canal que não existe", () => {
    expect(semCom(P)).not.toContain("não recebe aprovação");
    expect(semCom(P)).not.toContain("stat-sem-email");
    // O app não manda e-mail ao patrocinador: nenhuma rota envia nada.
    for (const f of ["server/routes/sponsors.ts", "server/routes/items.ts"]) {
      expect(ler(f)).not.toMatch(/sendMail|nodemailer|resend\(|sgMail/);
    }
  });
});

describe("o que NÃO mexer continua", () => {
  it("Sem Executivo é botão; Limpar conta filtros; FilterSelect; paleta fixa; aria-sort; Freeze", () => {
    expect(P).toContain('data-testid="stat-sem-executivo"');
    expect(P).toContain('Limpar ({(search ? 1 : 0) + (execFilter !== "all" ? 1 : 0)})');
    expect(P).toContain('kind="field"');
    expect(P).toContain("const PRESET_COLORS = [");
    expect(P).toContain('aria-sort={sortBy === col.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}');
    expect((P.match(/<FreezeWhileClosing /g) ?? []).length).toBe(2);
  });
});
