// A rota da tela de Análises — SÓ ADMIN (é a tela do gestor).
//
// Desde 16/10 a Análises é o Painel operacional da gráfica (dono: "subir isso
// no Análises, no nosso layout, exatamente esses dados" e "pode tirar o que já
// tem no Análises hoje"). As rotas da Análises de status (tempo por etapa e
// operação) saíram junto com as abas que as liam.
//
// Esta camada é I/O + memo. A REGRA mora em @shared/painel-operacional (pura,
// testada em server/__tests__/painel-operacional.test.ts); a leitura do banco,
// em ../services/painel-operacional.ts.
import type { Express } from "express";
import { requireAdmin } from "./shared";
import { db } from "../db";
import type { PainelOperacional } from "@shared/painel-operacional";
import { carregarPainelOperacional } from "../services/painel-operacional";

/**
 * Memo curto do painel. A tela revalida no foco e a cada 5 minutos, e dois
 * gestores abrindo juntos não precisam de duas varreduras: 60s é curto o
 * bastante para o número não envelhecer e longo o bastante para absorver a
 * rajada de quem troca de aba. Uma entrada só — a rota não tem parâmetros.
 */
const TTL_MS = 60_000;
let memo: { em: number; payload: PainelOperacional } | null = null;

export function registerAnaliseRoutes(app: Express): void {
  /**
   * GET /api/analises/painel-operacional — o Painel operacional da gráfica
   * (contrato em shared/painel-operacional.ts). Sem parâmetros: os filtros da
   * tela (evento, medida, dia da projeção, processos) recortam no cliente,
   * com as funções de derivação do mesmo módulo.
   */
  app.get("/api/analises/painel-operacional", requireAdmin, async (_req, res) => {
    try {
      const agora = Date.now();
      if (memo && agora - memo.em <= TTL_MS) return res.json(memo.payload);
      const payload = await carregarPainelOperacional(db, agora);
      memo = { em: agora, payload };
      res.json(payload);
    } catch (error) {
      console.error("[analises] painel operacional falhou:", error);
      res.status(500).json({ error: "Não foi possível montar o painel operacional agora. Tente de novo em instantes." });
    }
  });
}

/** Só para o teste — o memo é global e vazaria de um caso para o outro. */
export function limparMemoAnalises(): void {
  memo = null;
}
