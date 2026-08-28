// ─────────────────────────────────────────────────────────────────────────────
// TELA NOTIFICAÇÕES (dono, 27/08): "ver o que mandou e o que não mandou" +
// "administrar quem recebe, bem amplo e nota 10".
//
// O que este arquivo prende:
//   · as listas nomeadas saíram do deploy: banco com fallback para a
//     constante — e a REGRA do fallback (substitui, não soma; erro de banco
//     não mata o aviso das 18h);
//   · a primeira personalização COPIA a lista padrão ("adicionar a Lívia"
//     nunca significa "remover todo mundo");
//   · a grade de envios nasce da trilha — e célula vazia em horário passado
//     vira "Não rodou", o caso que não aparecia em lugar nenhum.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const SCHEMA = ler("shared/schema.ts");
const SERVICO = ler("server/services/destinatarios.ts");
const GESTAO = ler("server/services/gestaoDigest.ts");
const REVISAO = ler("server/services/revisaoDigest.ts");
const ITEMS = ler("server/routes/items.ts");
const TELA = ler("client/src/pages/notificacoes.tsx");

describe("destinatários administráveis — a mecânica do fallback", () => {
  it("a tabela existe, e canal sem linha usa a lista padrão do código", () => {
    expect(SCHEMA).toContain('export const emailDestinatarios = pgTable("email_destinatarios", {');
    expect(SERVICO).toContain("return emails.length > 0 ? emails : [...padrao];");
  });

  it("erro de banco (migração pendente) NÃO mata o aviso — cai no padrão", () => {
    const fn = SERVICO.slice(SERVICO.indexOf("export async function destinatariosDoCanal"));
    expect(fn).toContain("} catch {");
    expect(fn).toContain("return [...padrao];");
  });

  it("os três remetentes passam pelo canal — a constante virou padrão, não caminho", () => {
    expect(GESTAO).toContain('await destinatariosDoCanal("gestao", DESTINATARIOS_DA_GESTAO);');
    expect(REVISAO).toContain('await destinatariosDoCanal("revisao", DESTINATARIOS_DA_REVISAO);');
    expect(ITEMS).toContain('await destinatariosDoCanal("book", DESTINATARIOS_NOMEADOS);');
    // e o book mantém o filtro por usuário cadastrado
    expect(ITEMS).toContain("return porFiltro((u) => lista.includes(u.email.trim().toLowerCase()));");
  });

  it("adicionar duas vezes não vira dois e-mails (dedupe no storage)", () => {
    const STORAGE = ler("server/storage.ts");
    const fn = STORAGE.slice(STORAGE.indexOf("async addEmailDestinatario"));
    expect(fn.slice(0, 600)).toContain("const dup = existentes.find((d) => d.email.trim().toLowerCase() === email);");
    expect(fn.slice(0, 600)).toContain("if (dup) return dup;");
  });
});

describe("as rotas de admin", () => {
  const rotaGet = ITEMS.slice(ITEMS.indexOf('app.get("/api/admin/notificacoes"'), ITEMS.indexOf('app.post("/api/admin/notificacoes/destinatarios"'));
  const rotaPost = ITEMS.slice(ITEMS.indexOf('app.post("/api/admin/notificacoes/destinatarios"'), ITEMS.indexOf('app.delete("/api/admin/notificacoes/destinatarios/:id"'));

  it("as três são só de admin, e as duas de escrita estão na régua de papéis", () => {
    expect((ITEMS.match(/api\/admin\/notificacoes[\s\S]{0,300}?userRole !== "admin"/g) ?? []).length).toBe(3);
    const PERM = ler("shared/permissoes.ts");
    expect(PERM).toContain('{ metodo: "POST", rota: "/api/admin/notificacoes/destinatarios", papeis: ["admin"] },');
    expect(PERM).toContain('{ metodo: "DELETE", rota: "/api/admin/notificacoes/destinatarios/:id", papeis: ["admin"] },');
  });

  it("a PRIMEIRA personalização copia a lista padrão — adicionar nunca é remover todo mundo", () => {
    expect(rotaPost).toContain("if (jaTem.length === 0) {");
    expect(rotaPost).toContain('addedBy: "padrão do sistema"');
  });

  it("canal e e-mail são validados; adicionar e remover vão para a trilha", () => {
    expect(rotaPost).toContain("if (!CANAIS_DE_AVISO.includes(canal)) {");
    expect(rotaPost).toContain("E-mail inválido");
    expect(rotaPost).toContain('await createAuditLog(req, "added"');
    expect(ITEMS).toContain('await createAuditLog(req, "deleted"');
  });

  it("o retrato traz as chaves que respondem 'por que ninguém recebeu'", () => {
    for (const chave of ["producao:", "emailsLigados:", "simulacao:", "remetente:", "gestaoLigada:", "revisaoLigada:"]) {
      expect(rotaGet).toContain(chave);
    }
    expect(rotaGet).toContain("edicoes: await historicoDeEnvios()");
  });
});

describe("o histórico lido da trilha", () => {
  it("parseia a marca (dia hora [manual]) dos DOIS avisos e classifica o desfecho", () => {
    expect(GESTAO).toContain("const RE_MARCA_DE_ENVIO =");
    expect(GESTAO).toContain(`sql\`\${auditLogs.entityType} in ('gestao', 'revisao')\``);
    for (const par of ['"enviado"', '"vazio"', '"falhou"', '"simulado"']) {
      expect(GESTAO).toContain(`return ${par};`);
    }
    // linha fora do formato não vira edição inventada
    expect(GESTAO).toContain("if (!m) continue;");
  });
});

describe("a tela", () => {
  it("existe, é rota de admin e está no menu", () => {
    const APP = ler("client/src/App.tsx");
    expect(APP).toContain("component={Notificacoes} allowedRoles={ROLES_ADMIN}");
    expect(ler("client/src/components/app-sidebar.tsx")).toContain('{ title: "Notificações",    url: "/notificacoes", icon: Bell },');
  });

  it("célula sem registro em horário PASSADO diz 'Não rodou' — o caso invisível de 27/08", () => {
    expect(TELA).toContain('texto = "Não rodou";');
    expect(TELA).toContain("const jaPassou = dia < agora.dia || (dia === agora.dia && hora <= agora.hora);");
    // futuro fica em branco — "não rodou" às 9h da manhã seria alarme falso
    expect(TELA).toContain('let texto = "—"');
  });

  it("as listas padrão aparecem como padrão, e a edição avisa que substitui", () => {
    expect(TELA).toContain("Lista padrão do sistema. Ao adicionar o primeiro e-mail, ela é copiada para cá e vira editável.");
    expect(TELA).toContain("Lista editável — é ela que vale, no lugar da padrão.");
  });

  it("o disparo manual dos dois avisos mora na própria tela", () => {
    expect(TELA).toContain("`/api/${aviso}/digest/enviar`");
    expect(TELA).toContain('data-testid={`disparar-${aviso}`}');
  });
});
