import { Compass, ArrowLeft, Search } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { abrirBuscaGlobal } from "@/components/busca-global";

// ─────────────────────────────────────────────────────────────────────────────
// 404 NA LÍNGUA DA CASA.
//
// Era o card genérico do template: fundo cinza de tela cheia (dentro da casca,
// empilhava 100vh abaixo da topbar e criava rolagem à toa), ícone de alerta
// VERMELHO — como se o usuário tivesse errado — e uma única saída. Quem cai
// aqui quase sempre veio de um link antigo colado no WhatsApp: o que ajuda é
// dizer qual endereço falhou e oferecer as três saídas reais — voltar, ir ao
// Painel e procurar a peça pela busca global.
// ─────────────────────────────────────────────────────────────────────────────
export default function NotFound() {
  const [location] = useLocation();
  const { isAuthenticated } = useAuth();
  const podeVoltar = typeof window !== "undefined" && window.history.length > 1;

  const botaoSecundario: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 8, minHeight: 40, padding: "0 16px",
    borderRadius: 9, border: "1px solid #d6d3d1", backgroundColor: "#ffffff",
    fontSize: 13, fontWeight: 700, color: "#1c1917", cursor: "pointer", fontFamily: "inherit",
  };

  return (
    <div style={{ minHeight: "min(100%, calc(100dvh - 64px))", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 16px" }}>
      <div style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
        <div aria-hidden="true" style={{ width: 52, height: 52, margin: "0 auto 18px", borderRadius: 14, backgroundColor: "#fff7ed", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Compass style={{ width: 24, height: 24, color: "#c2410c" }} />
        </div>
        <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#746e69" }}>
          Erro 404
        </p>
        <h1 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "#1c1917" }}>
          Página não encontrada
        </h1>
        <p style={{ margin: "0 0 6px", fontSize: 13.5, lineHeight: 1.6, color: "#57534e" }}>
          O endereço que você tentou abrir não existe ou mudou de lugar.
        </p>
        <p style={{ margin: "0 0 24px", fontSize: 12, color: "#746e69", wordBreak: "break-all" }}>
          <code style={{ fontFamily: "'DM Mono', Menlo, monospace", backgroundColor: "#f5f5f4", borderRadius: 4, padding: "1px 6px" }}>{location}</code>
        </p>

        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {podeVoltar && (
            <button type="button" onClick={() => window.history.back()} style={botaoSecundario}>
              <ArrowLeft aria-hidden="true" style={{ width: 15, height: 15 }} />
              Voltar
            </button>
          )}
          <Link
            href="/"
            style={{ ...botaoSecundario, backgroundColor: "#1c1917", borderColor: "#1c1917", color: "#ffffff", textDecoration: "none" }}
          >
            Ir ao Painel Geral
          </Link>
        </div>

        {/* A busca global só existe dentro da casca autenticada. */}
        {isAuthenticated && (
          <button
            type="button"
            onClick={abrirBuscaGlobal}
            style={{ marginTop: 18, display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36, padding: "0 10px", border: "none", background: "none", fontSize: 12.5, fontWeight: 600, color: "#c2410c", cursor: "pointer", fontFamily: "inherit" }}
          >
            <Search aria-hidden="true" style={{ width: 14, height: 14 }} />
            Procurando uma peça ou evento? Buscar
          </button>
        )}
      </div>
    </div>
  );
}
