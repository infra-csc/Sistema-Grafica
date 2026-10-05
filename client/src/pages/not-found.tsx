import { Compass, ArrowLeft, Search, LayoutDashboard } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { abrirBuscaGlobal } from "@/components/busca-global";
import { FS, FW, FONT, R, T, N, TOM, H } from "@/lib/theme";

// ─────────────────────────────────────────────────────────────────────────────
// 404 NA LÍNGUA DA CASA.
//
// Era o card genérico do template: fundo cinza de tela cheia (dentro da casca,
// empilhava 100vh abaixo da topbar e criava rolagem à toa), ícone de alerta
// VERMELHO — como se o usuário tivesse errado — e uma única saída. Quem cai
// aqui quase sempre veio de um link antigo colado no WhatsApp: o que ajuda é
// dizer qual endereço falhou e oferecer as três saídas reais — voltar, ir ao
// Painel e procurar a peça pela busca global.
//
// 02/10: cores e medidas dos tokens (eram hex à mão), as duas saídas com a mesma altura
// (Voltar à esquerda, a principal à direita, como nos modais), e o endereço que falhou numa linha própria,
// legível, que quebra em vez de vazar.
// ─────────────────────────────────────────────────────────────────────────────
export default function NotFound() {
  const [location] = useLocation();
  const { isAuthenticated } = useAuth();
  const podeVoltar = typeof window !== "undefined" && window.history.length > 1;

  const botao: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    minHeight: H.toque - 4, padding: "0 18px",
    borderRadius: R.md, border: `1px solid ${T.bdark}`, backgroundColor: T.surface,
    fontSize: FS.body, fontWeight: FW.forte, color: T.text, cursor: "pointer", fontFamily: "inherit",
    textDecoration: "none",
  };

  return (
    <div style={{ minHeight: "min(100%, calc(100dvh - 64px))", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 16px" }}>
      <div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
        <div aria-hidden="true" style={{ width: 56, height: 56, margin: "0 auto 20px", borderRadius: R.lg, backgroundColor: TOM.laranja.bg, border: `1px solid ${TOM.laranja.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Compass style={{ width: 26, height: 26, color: T.accentText }} />
        </div>
        <p style={{ margin: "0 0 8px", fontSize: FS.small, fontWeight: FW.rotulo, letterSpacing: "0.12em", textTransform: "uppercase", color: T.second }}>
          Erro 404
        </p>
        {/* Título de página na régua da casa (Space Grotesk, FS.h1, 700): o 404
            era a única tela com h1 em 22/800 na fonte do corpo. */}
        <h1 style={{ margin: "0 0 10px", fontFamily: FONT.display, fontSize: FS.h1, fontWeight: FW.forte, letterSpacing: "-0.03em", lineHeight: 1.1, color: T.text }}>
          Página não encontrada
        </h1>
        <p style={{ margin: "0 0 14px", fontSize: FS.read, lineHeight: 1.6, color: T.apoio }}>
          O endereço que você tentou abrir não existe ou mudou de lugar. Nada foi alterado.
        </p>
        <p style={{ margin: "0 0 26px" }}>
          <code style={{ display: "inline-block", maxWidth: "100%", fontFamily: FONT.mono, fontSize: FS.meta, color: T.apoio, backgroundColor: N.n2, border: `1px solid ${T.border}`, borderRadius: R.sm, padding: "3px 8px", overflowWrap: "anywhere", textAlign: "left" }}>{location}</code>
        </p>

        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {podeVoltar && (
            <button type="button" onClick={() => window.history.back()} className="ds-botao" style={botao}>
              <ArrowLeft aria-hidden="true" style={{ width: 15, height: 15 }} />
              Voltar
            </button>
          )}
          <Link
            href="/"
            className="ds-botao"
            style={{ ...botao, backgroundColor: T.text, borderColor: T.text, color: T.surface }}
          >
            <LayoutDashboard aria-hidden="true" style={{ width: 15, height: 15 }} />
            Ir ao Painel Geral
          </Link>
        </div>

        {/* A busca global só existe dentro da casca autenticada. */}
        {isAuthenticated && (
          <button
            type="button"
            onClick={abrirBuscaGlobal}
            className="csc-acao-laranja"
            style={{ marginTop: 18, display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36, padding: "0 12px", border: "none", borderRadius: R.md, background: "none", fontSize: FS.body, fontWeight: FW.medio, color: T.accentText, cursor: "pointer", fontFamily: "inherit" }}
          >
            <Search aria-hidden="true" style={{ width: 14, height: 14 }} />
            Procurando uma peça ou evento? Buscar
          </button>
        )}
      </div>
    </div>
  );
}
