import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CorpoDoLogin, UsuarioSemSenha } from "@shared/api";
import { useToast } from "@/hooks/use-toast";
import { Compass, Lock, Loader2, AlertTriangle, ChevronDown, ArrowRight, Eye, EyeOff, Info } from "lucide-react";
import { T, FS, R, N, FW, FONT, TOM, ESCURO, H } from "@/lib/theme";

const SSO_ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  sso_user_not_found: {
    title: "Acesso não autorizado",
    description:
      "Seu e-mail não está cadastrado no sistema. Entre em contato com o administrador para solicitar acesso.",
  },
  sso_invalid_token: {
    title: "Token SSO inválido",
    description:
      "O link de autenticação expirou ou é inválido. Tente novamente pelo portal ou contate o administrador.",
  },
  sso_exchange_failed: {
    title: "Falha na autenticação SSO",
    description:
      "Não foi possível completar a autenticação. Tente novamente pelo portal ou contate o administrador.",
  },
};

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha obrigatória"),
});

type LoginForm = z.infer<typeof loginSchema>;

/**
 * O CAMINHO DA PEÇA — a coluna da marca conta o que o sistema FAZ.
 *
 * Eram dois cartões de vitrine ("Notificações em tempo real", "Rastreamento
 * completo") que caberiam em qualquer SaaS. O que distingue este produto é o
 * trajeto que toda peça percorre, na mesma ordem do menu "Fluxo da peça" —
 * quem chega pela primeira vez já aprende o vocabulário da casa. Só texto:
 * nenhuma regra, permissão ou rota nasce daqui.
 */
const CAMINHO_DA_PECA: Array<{ etapa: string; detalhe: string }> = [
  { etapa: "Vincular patrocinadores", detalhe: "quais marcas aparecem em cada peça" },
  { etapa: "Arte", detalhe: "o layout e o arquivo final" },
  { etapa: "Atendimento", detalhe: "a aprovação de cada patrocinador" },
  { etapa: "Revisão final", detalhe: "a conferência antes de produzir" },
  { etapa: "Gráfica", detalhe: "produção, conferência e entrega" },
];

/** Rótulo de campo: a mesma régua de caixa-alta da casa. */
const ROTULO: React.CSSProperties = {
  fontSize: FS.micro, fontWeight: FW.forte,
  textTransform: "uppercase", letterSpacing: "0.1em",
  color: T.apoio,
};

/** A marca NORTE — o mesmo desenho da barra lateral (bússola + nome + linha). */
function MarcaNorte({ escura = false }: { escura?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span aria-hidden="true" style={{
        width: 40, height: 40, borderRadius: R.lg, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: escura ? ESCURO.fundoAlto : T.text,
        border: `1px solid ${escura ? ESCURO.borda : T.text}`,
      }}>
        <Compass style={{ width: 20, height: 20, color: ESCURO.foco, strokeWidth: 2.2 }} />
      </span>
      <span style={{ display: "flex", flexDirection: "column" }}>
        <span style={{
          fontFamily: FONT.display, fontSize: 17, fontWeight: FW.rotulo,
          letterSpacing: "-0.04em", textTransform: "uppercase", lineHeight: 1,
          color: escura ? ESCURO.texto : T.text,
        }}>NORTE</span>
        <span style={{
          fontFamily: FONT.display, fontSize: FS.micro, fontWeight: FW.forte,
          letterSpacing: "0.22em", textTransform: "uppercase", lineHeight: 1, marginTop: 5,
          color: escura ? ESCURO.apoio : T.second,
        }}>Marketing Esportivo</span>
      </span>
    </div>
  );
}

export default function Login() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Erro de credencial também fica inline (role="alert"): o toast some sozinho
  // e quem digitou errado ficava sem pista do que aconteceu.
  const [loginError, setLoginError] = useState<string | null>(null);
  // Caps Lock ligado é a causa nº 1 de "senha inválida" que não é senha
  // inválida — avisar ANTES do envio poupa a tentativa e a frustração.
  const [capsLock, setCapsLock] = useState(false);
  const hubUrl = import.meta.env.VITE_HUB_URL as string | undefined;

  // Abriu o acesso de administrador, o cursor já está no e-mail: o clique
  // no "abrir" é a intenção de digitar.
  useEffect(() => {
    if (showAdminForm) document.getElementById("email")?.focus();
  }, [showAdminForm]);

  const [ssoError] = useState(() => {
    const code = new URLSearchParams(search).get("error") ?? "";
    if (!code) return null;
    // Código desconhecido ainda é uma falha de autenticação: melhor um aviso
    // genérico do que voltar à tela como se nada tivesse acontecido.
    return SSO_ERROR_MESSAGES[code] ?? {
      title: "Falha na autenticação",
      description:
        "Não foi possível completar o acesso pelo portal. Tente novamente ou contate o administrador.",
    };
  });

  // Chegar aqui expulso do meio do trabalho, sem explicação, faz parecer bug do
  // sistema. O ?sessao=expirada vem de handleUnauthorized (lib/queryClient).
  const [sessaoExpirada] = useState(
    () => new URLSearchParams(search).get("sessao") === "expirada",
  );

  useEffect(() => {
    if (ssoError || sessaoExpirada) {
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginForm) => {
      const res = await apiRequest<UsuarioSemSenha, CorpoDoLogin>("POST", "/api/auth/login", data);
      return await res.json();
    },
    onSuccess: async (user) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Login realizado com sucesso", description: `Bem-vindo, ${user.name}!` });
      setTimeout(() => setLocation("/"), 100);
    },
    // Só inline. O toast repetia a mesma frase no canto da tela, longe do
    // formulário — dois avisos do mesmo erro, um deles sumindo sozinho.
    onError: (error) => {
      setLoginError(error.message || "E-mail ou senha inválidos");
    },
  });

  const onSubmit = (data: LoginForm) => {
    setLoginError(null);
    loginMutation.mutate(data);
  };

  const erroEmail = form.formState.errors.email;
  const erroSenha = form.formState.errors.password;

  return (
    <main className="login-main" style={{
      display: "flex",
      height: "100dvh",
      width: "100%",
      overflow: "hidden",
      // Corpo em Inter: a tela de login é formulário, não título. O display
      // fica para o nome do sistema e os títulos.
      fontFamily: FONT.corpo,
      backgroundColor: T.bg,
    }}>
      {/* Responsivo: em telas pequenas esconde a coluna da marca e a marca
          compacta aparece no topo do formulário — os estilos inline vencem
          media queries, por isso o !important. Estados (:hover, :focus) do
          campo e dos botões também moram aqui, onde o inline não alcança. */}
      <style>{`
        .login-campo { transition: border-color var(--dur-rapida) ease, box-shadow var(--dur-rapida) ease; }
        .login-campo:hover { border-color: ${N.n5} !important; }
        .login-campo:focus { outline: none; border-color: ${T.accent} !important; box-shadow: 0 0 0 3px rgba(249,115,22,0.14); }
        .login-campo[aria-invalid="true"] { border-color: ${TOM.perigo.dot} !important; }
        .login-campo::placeholder { color: ${T.second}; opacity: 1; }
        .login-submit-btn { transition: background-color var(--dur-rapida) ease, transform var(--dur-rapida) ease; }
        .login-submit-btn:hover:not(:disabled) { background-color: ${T.strong} !important; }
        .login-submit-btn:active:not(:disabled) { transform: translateY(1px); }
        .login-submit-btn:hover:not(:disabled) .login-seta { transform: translateX(2px); }
        .login-seta { transition: transform var(--dur-media) var(--ease-saida); }
        .login-alternar { transition: border-color var(--dur-rapida) ease, background-color var(--dur-rapida) ease; }
        .login-alternar:hover { border-color: ${N.n5} !important; background-color: ${N.n0} !important; }
        .login-alternar[aria-expanded="true"] .login-chevron { transform: rotate(180deg); }
        .login-chevron { transition: transform var(--dur-media) var(--ease-saida); }
        .login-olho:hover { color: ${T.text} !important; background-color: ${N.n2} !important; }
        .login-portal:hover { background-color: ${T.strong} !important; }
        .login-marca-celular { display: none; }
        @media (max-width: 900px) {
          .login-brand-col { display: none !important; }
          .login-form-col { width: 100% !important; }
          .login-form-miolo { padding: 32px 20px 28px !important; }
          .login-marca-celular { display: block; margin-bottom: 36px; }
          .login-titulo { font-size: 30px !important; }
        }
      `}</style>

      {/* ── COLUNA DA MARCA (42%) ── */}
      <section className="login-brand-col" aria-label="Sobre o NORTE" style={{
        position: "relative",
        // Teto de 720px: num monitor de 1920 a coluna escura passava de 800px
        // com o conteúdo encostado à esquerda e meia coluna vazia.
        width: "clamp(420px, 42%, 720px)", flexShrink: 0,
        backgroundColor: ESCURO.fundo,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 32,
        padding: "44px 48px",
        overflow: "hidden",
      }}>
        {/* Um único brilho, no canto, na cor da marca — o fundo escuro não
            fica chapado e nada compete com o texto. */}
        <div aria-hidden="true" style={{
          position: "absolute", bottom: "-120px", right: "-120px",
          width: "420px", height: "420px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(249,115,22,0.18) 0%, transparent 65%)",
          filter: "blur(60px)", pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <MarcaNorte escura />
        </div>

        <div style={{ position: "relative", zIndex: 1, maxWidth: 420 }}>
          <div aria-hidden="true" style={{ width: 40, height: 3, backgroundColor: T.accent, marginBottom: 18, borderRadius: 2 }} />
          <h2 style={{
            fontFamily: FONT.display,
            fontSize: "clamp(34px, 3.4vw, 46px)", fontWeight: FW.forte, color: ESCURO.texto,
            lineHeight: 1.08, letterSpacing: "-0.04em", margin: "0 0 32px 0",
          }}>
            Sistema de Gestão de Produção Gráfica
          </h2>

          <p style={{ ...ROTULO, color: ESCURO.apoio, margin: "0 0 14px" }}>O caminho de cada peça</p>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
            {CAMINHO_DA_PECA.map((p, i) => {
              const ultima = i === CAMINHO_DA_PECA.length - 1;
              return (
                <li key={p.etapa} style={{ display: "flex", gap: 14, position: "relative", paddingBottom: ultima ? 0 : 14 }}>
                  {/* O fio que liga as etapas: a peça anda, não pula. */}
                  {!ultima && (
                    <span aria-hidden="true" style={{ position: "absolute", left: 11, top: 24, bottom: 0, width: 1, backgroundColor: ESCURO.borda }} />
                  )}
                  <span aria-hidden="true" style={{
                    width: 23, height: 23, borderRadius: R.pill, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: `1px solid ${ESCURO.borda}`,
                    backgroundColor: ESCURO.fundoAlto,
                    fontFamily: FONT.display, fontSize: FS.small, fontWeight: FW.forte,
                    color: ESCURO.foco, fontVariantNumeric: "tabular-nums",
                  }}>
                    {i + 1}
                  </span>
                  <span style={{ paddingTop: 2, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: FS.read, fontWeight: FW.medio, color: ESCURO.texto, lineHeight: 1.3 }}>{p.etapa}</span>
                    <span style={{ display: "block", fontSize: FS.meta, color: ESCURO.apoio, lineHeight: 1.4, marginTop: 1 }}>{p.detalhe}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <footer style={{ position: "relative", zIndex: 1 }}>
          <p style={{ color: ESCURO.apoio, fontSize: FS.small, margin: 0 }}>
            © {new Date().getFullYear()} NORTE Marketing Esportivo. Todos os direitos reservados.
          </p>
        </footer>
      </section>

      {/* ── COLUNA DO FORMULÁRIO (58%) ──
          ROLA quando não cabe. Era `justify-content: center` numa coluna de
          100vh com `overflow: hidden` no <main>: ao abrir o formulário num
          notebook de 768px de altura, o conteúdo transbordava PARA CIMA e para
          baixo — o título sumia sob a borda e o botão Entrar ficava fora de
          alcance, sem rolagem. Agora a coluna rola, e as margens automáticas do
          miolo centralizam quando sobra espaço (e viram 0 quando falta). */}
      <section className="login-form-col" style={{
        flex: 1, minWidth: 0, backgroundColor: T.bg,
        display: "flex", flexDirection: "column",
        alignItems: "center",
        overflowY: "auto",
        overscrollBehavior: "contain",
      }}>
        <div className="login-form-miolo" style={{ width: "100%", maxWidth: 448 + 64, padding: "48px 32px 32px", margin: "auto 0", boxSizing: "border-box" }}>
          <h1 className="sr-only">Entrar no sistema — NORTE Marketing Esportivo</h1>

          <div className="login-marca-celular"><MarcaNorte /></div>

          <header style={{ marginBottom: 32 }}>
            <h3 className="login-titulo" style={{
              fontFamily: FONT.display,
              fontSize: 36, fontWeight: FW.forte, color: T.text,
              letterSpacing: "-0.04em", lineHeight: 1.1, margin: "0 0 8px 0",
            }}>
              {/* "Bem-vindo de volta" pressupunha visita anterior — a primeira
                  tela de quem nunca entrou dizia que ele já tinha estado aqui. */}
              Entrar no NORTE
            </h3>
            <p style={{ color: T.second, fontWeight: FW.corpo, fontSize: FS.read, margin: 0, lineHeight: 1.5 }}>
              Acesse o sistema pelo portal NORTE.
            </p>
          </header>

          {/* Sessão expirada — âmbar, não vermelho: não é erro do usuário nem
              falha do sistema, é só a sessão que acabou. */}
          {sessaoExpirada && !ssoError && (
            <div
              data-testid="banner-sessao-expirada"
              role="status"
              style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`,
                borderRadius: R.lg, padding: "14px 16px", marginBottom: 20,
              }}
            >
              <AlertTriangle aria-hidden="true" style={{ width: 18, height: 18, color: TOM.alerta.text, flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ margin: 0, fontWeight: FW.forte, fontSize: FS.body, color: TOM.alerta.text }}>Sua sessão expirou</p>
                <p style={{ margin: "4px 0 0 0", fontSize: FS.meta, color: TOM.alerta.text, lineHeight: 1.5 }}>
                  Entre novamente para continuar de onde parou.
                </p>
              </div>
            </div>
          )}

          {/* SSO error banner */}
          {ssoError && (
            <div
              data-testid="banner-sso-error"
              role="alert"
              style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                backgroundColor: TOM.perigo.bg, border: `1px solid ${TOM.perigo.border}`,
                borderRadius: R.lg, padding: "14px 16px", marginBottom: 20,
              }}
            >
              <AlertTriangle aria-hidden="true" style={{ width: 18, height: 18, color: TOM.perigo.text, flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ margin: 0, fontWeight: FW.forte, fontSize: FS.body, color: TOM.perigo.text }}>{ssoError.title}</p>
                <p style={{ margin: "4px 0 0 0", fontSize: FS.meta, color: TOM.perigo.text, lineHeight: 1.5 }}>{ssoError.description}</p>
              </div>
            </div>
          )}

          {/* O caminho principal: a conta Microsoft pelo portal. */}
          <div style={{
            backgroundColor: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: R.lg,
            padding: "22px 22px",
            display: "flex", alignItems: "flex-start", gap: 16,
            boxShadow: "0 1px 2px rgba(28,25,23,0.04)",
          }}>
            {/* Logotipo da Microsoft — as quatro cores são da marca dela. */}
            <div aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}>
              <svg width="24" height="24" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
              </svg>
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: "0 0 4px 0", fontWeight: FW.forte, fontSize: FS.strong, color: T.text }}>
                Login via Microsoft
              </p>
              <p style={{ margin: 0, fontSize: FS.body, color: T.apoio, lineHeight: 1.55 }}>
                O acesso ao sistema é feito pelo portal NORTE. Use sua conta Microsoft corporativa para entrar.
              </p>
              {/* O card mandava ir ao portal e não levava até ele. Só aparece
                  quando o endereço do portal está configurado — o mesmo
                  VITE_HUB_URL para onde o "Sair" já devolve. */}
              {hubUrl && (
                <a
                  href={hubUrl}
                  data-testid="link-portal-norte"
                  className="login-portal"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 14, minHeight: 40, padding: "0 16px", borderRadius: R.md, backgroundColor: T.text, color: T.surface, fontSize: FS.body, fontWeight: FW.forte, textDecoration: "none" }}
                >
                  Ir para o portal NORTE
                  <ArrowRight aria-hidden="true" style={{ width: 15, height: 15 }} />
                </a>
              )}
              {/* O caso que travava o primeiro uso: o e-mail não cadastrado
                  só descobria isso DEPOIS de ir ao portal e voltar com erro. */}
              <p style={{ display: "flex", alignItems: "flex-start", gap: 6, margin: "12px 0 0", paddingTop: 12, borderTop: `1px solid ${N.n3}`, fontSize: FS.meta, color: T.second, lineHeight: 1.5 }}>
                <Info aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0, marginTop: 2 }} />
                <span>Ainda sem acesso? Peça ao administrador do sistema para cadastrar o seu e-mail.</span>
              </p>
            </div>
          </div>

          {/* "ou" — o segundo caminho é alternativo, não uma seção do primeiro. */}
          <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0 14px" }}>
            <span style={{ flex: 1, height: 1, backgroundColor: T.border }} />
            <span style={{ fontSize: FS.meta, fontWeight: FW.medio, color: T.second }}>ou</span>
            <span style={{ flex: 1, height: 1, backgroundColor: T.border }} />
          </div>

          {/* O segundo caminho, como BOTÃO de verdade. Era uma linha cinza em
              caixa-alta de 12px que lia como título de seção — ninguém
              adivinhava que abria alguma coisa. */}
          <button
            type="button"
            data-testid="button-toggle-admin-login"
            className="login-alternar"
            onClick={() => setShowAdminForm((v) => !v)}
            aria-expanded={showAdminForm}
            aria-controls="admin-login-form"
            style={{
              width: "100%", minHeight: H.toque,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "0 16px",
              cursor: "pointer",
              backgroundColor: showAdminForm ? N.n0 : "transparent",
              border: `1px solid ${T.border}`, borderRadius: R.md,
              color: T.strong,
              fontSize: FS.body, fontWeight: FW.medio,
              fontFamily: "inherit",
            }}
          >
            {/* O formulário aceita QUALQUER usuário com senha (POST
                /api/auth/login não olha perfil). "Acesso de administrador"
                fazia quem tem senha cadastrada sem ser admin achar que ali não
                era para ele — e não havia outro lugar para usá-la. */}
            <span>Entrar com e-mail e senha</span>
            <ChevronDown aria-hidden="true" className="login-chevron" style={{ width: 15, height: 15, color: T.second }} />
          </button>

          {/* Admin email/password form */}
          {showAdminForm && (
            <form
              id="admin-login-form"
              className="norte-surge"
              onSubmit={form.handleSubmit(onSubmit)}
              noValidate
              style={{
                display: "flex", flexDirection: "column", gap: 18,
                marginTop: 12,
                padding: "20px",
                backgroundColor: T.surface,
                borderRadius: R.lg,
                border: `1px solid ${T.border}`,
              }}
            >
              {/* SEM PROMETER SENHA. A tela Usuários não define senha (o
                  cadastro via POST /api/auth/register grava um hash aleatório
                  quando não recebe senha — conta só-SSO), e o "pede senha nova
                  no primeiro acesso" também não vale: o boot do servidor zera
                  must_change_password de todos (server/index.ts). A frase
                  antiga mandava gente esperar uma senha que ninguém entrega. */}
              <p style={{ margin: 0, fontSize: FS.meta, color: T.apoio, lineHeight: 1.55 }}>
                Só para contas que já têm senha cadastrada. A equipe entra pelo portal NORTE, com a conta Microsoft — o cadastro de usuários não cria senha.
              </p>

              {/* Email */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="email" style={ROTULO}>E-mail</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  placeholder="nome@norte.com.br"
                  {...form.register("email")}
                  aria-invalid={erroEmail ? true : undefined}
                  aria-describedby={erroEmail ? "email-erro" : undefined}
                  data-testid="input-email"
                  className="login-campo"
                  style={{
                    width: "100%", height: 46,
                    backgroundColor: T.surface,
                    border: `1px solid ${N.n5}`,
                    borderRadius: R.md, padding: "0 14px",
                    // 16px: abaixo disso o iOS dá zoom ao focar o campo.
                    fontSize: FS.lead, fontWeight: FW.corpo, color: T.text,
                    boxSizing: "border-box", fontFamily: "inherit",
                  }}
                />
                {/* #b91c1c: #dc2626 sobre o #f5f5f4 do formulário ficava abaixo
                    de 4,5:1 num texto de 12px. */}
                {erroEmail && (
                  <p id="email-erro" style={{ color: TOM.perigo.text, fontSize: FS.meta, fontWeight: FW.medio, margin: 0 }}>{erroEmail.message}</p>
                )}
              </div>

              {/* Password */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="password" style={ROTULO}>Senha</label>
                <div style={{ position: "relative" }}>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    {...form.register("password")}
                    aria-invalid={erroSenha ? true : undefined}
                    aria-describedby={[erroSenha ? "senha-erro" : "", capsLock ? "senha-caps" : ""].filter(Boolean).join(" ") || undefined}
                    onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                    onKeyDown={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                    data-testid="input-password"
                    className="login-campo"
                    style={{
                      width: "100%", height: 46,
                      backgroundColor: T.surface,
                      border: `1px solid ${N.n5}`,
                      borderRadius: R.md, padding: "0 48px 0 14px",
                      fontSize: FS.lead, fontWeight: FW.corpo, color: T.text,
                      boxSizing: "border-box", fontFamily: "inherit",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    aria-pressed={showPassword}
                    className="login-olho"
                    data-alvo-natural=""
                    // 36x36: o alvo era o ícone de 18px com 6 de folga.
                    style={{ position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)", width: 36, height: 36, borderRadius: R.sm, background: "none", border: "none", cursor: "pointer", color: T.second, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    {showPassword ? <EyeOff aria-hidden="true" style={{ width: 18, height: 18 }} /> : <Eye aria-hidden="true" style={{ width: 18, height: 18 }} />}
                  </button>
                </div>
                {capsLock && (
                  <p id="senha-caps" role="status" style={{ color: TOM.alerta.text, fontSize: FS.meta, margin: 0, fontWeight: FW.medio }}>
                    Caps Lock está ligado.
                  </p>
                )}
                {erroSenha && (
                  <p id="senha-erro" style={{ color: TOM.perigo.text, fontSize: FS.meta, fontWeight: FW.medio, margin: 0 }}>{erroSenha.message}</p>
                )}
              </div>

              {loginError && (
                <div
                  role="alert"
                  data-testid="login-error-inline"
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    backgroundColor: TOM.perigo.bg, border: `1px solid ${TOM.perigo.border}`,
                    borderRadius: R.md, padding: "11px 14px",
                  }}
                >
                  <AlertTriangle aria-hidden="true" style={{ width: 16, height: 16, color: TOM.perigo.text, flexShrink: 0, marginTop: 1 }} />
                  <p style={{ margin: 0, fontSize: FS.body, fontWeight: FW.medio, color: TOM.perigo.text, lineHeight: 1.5 }}>{loginError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loginMutation.isPending}
                aria-busy={loginMutation.isPending || undefined}
                data-testid="button-login"
                className="login-submit-btn"
                style={{
                  width: "100%", height: 46,
                  backgroundColor: T.text,
                  color: T.surface, border: "none", borderRadius: R.md,
                  fontSize: FS.read, fontFamily: FONT.display, fontWeight: FW.forte,
                  cursor: loginMutation.isPending ? "wait" : "pointer",
                  opacity: loginMutation.isPending ? 0.85 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 aria-hidden="true" className="animate-spin" style={{ width: 16, height: 16 }} />
                    Entrando…
                  </>
                ) : (
                  <>
                    <span>Entrar</span>
                    <ArrowRight aria-hidden="true" className="login-seta" style={{ width: 16, height: 16 }} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* "SSL 256-bit" era jargão de selo de template — promessa técnica
              que ninguém confere e que não é deste sistema garantir. Fica o
              fato que importa a quem digita a senha. No FLUXO, abaixo do
              conteúdo: o selo absoluto no canto caía por cima do formulário
              aberto em telas baixas. */}
          <footer className="login-seal" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            marginTop: 28,
          }}>
            <Lock aria-hidden="true" style={{ width: 12, height: 12, color: T.second }} />
            <span style={{
              fontSize: FS.micro, fontWeight: FW.forte,
              textTransform: "uppercase", letterSpacing: "0.1em", color: T.second,
            }}>Conexão segura</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
