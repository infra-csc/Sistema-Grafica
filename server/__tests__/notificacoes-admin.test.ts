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
const TELA = ler("client/src/pages/notificacoes.tsx");

// A mecânica do fallback, a dedupe no storage, as rotas de admin (papel,
// primeira personalização, validação, trilha, retrato) e o histórico lido da
// trilha agora RODAM em regras-avisos-digest-disparo.test.ts,
// regras-avisos-digest-rotas.test.ts e regras-avisos-digest-storage.test.ts.
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
