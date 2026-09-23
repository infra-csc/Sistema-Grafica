// Auth + user management routes. Extracted from server/routes.ts.
import type { Express } from "express";
import bcrypt from "bcryptjs";
import { storage } from "../storage";
import { pool } from "../db";
import { insertUserSchema, loginSchema, changePasswordSchema, type User } from "@shared/schema";
import {
  requireAuth,
  requireAdmin,
  loginRateLimiter,
  loginPorContaRateLimiter,
  changePasswordRateLimiter,
  createAuditLog,
  sendSensitiveError,
} from "./shared";
import { buscarUsuarioPorEmail, conferirSenha, senhaAleatoria } from "../login-seguro";
import { avisarSessoesEncerradas } from "../sessoes-encerradas";

// Apaga as sessões do usuário (todas, ou todas menos a atual) e avisa o tempo
// real para derrubar os sockets dele. Falha aqui não desfaz a operação.
async function encerrarSessoes(userId: string, exceto?: string): Promise<void> {
  try {
    if (exceto) {
      await pool.query(`DELETE FROM session WHERE (sess->>'userId') = $1 AND sid <> $2`, [userId, exceto]);
    } else {
      await pool.query(`DELETE FROM session WHERE (sess->>'userId') = $1`, [userId]);
    }
  } catch (erro) {
    console.error("Falha ao encerrar as sessões do usuário:", erro);
  }
  avisarSessoesEncerradas(userId);
}

export function registerAuthRoutes(app: Express): void {
  // ============ AUTHENTICATION ============

  // Register new user (admin only)
  app.post("/api/auth/register", requireAdmin, async (req, res) => {
    try {
      // Sem senha (usuário que entra por SSO): senha aleatória, que ninguém
      // conhece. Um texto fixo aqui virava a senha real de todo cadastro.
      const senhaInformada = typeof req.body?.password === "string" && req.body.password !== "" ? req.body.password : senhaAleatoria();
      const { password, ...userData } = insertUserSchema.parse({ ...req.body, password: senhaInformada });

      // E-mail sem diferenciar maiúsculas — "Ana@" e "ana@" são a mesma conta.
      const existingUser = await buscarUsuarioPorEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ error: "Email já cadastrado" });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      // Create user (SSO-only: no password change required)
      const user = await storage.createUser({
        ...userData,
        // Usuário do Kit só existe no perfil Solicitação (14/09).
        kit: userData.role === "solicitacao" && userData.kit === true,
        passwordHash,
        mustChangePassword: false,
      });

      // Create audit log
      await createAuditLog(
        req.userName!,
        'created',
        'user',
        user.id,
        `Usuário "${user.name}" criado com perfil "${user.role}"`
      );

      // Don't send password hash to client
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: unknown) {
      sendSensitiveError(res, error, "Register error");
    }
  });

  // Login
  app.post("/api/auth/login", loginRateLimiter, loginPorContaRateLimiter, async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const user = await buscarUsuarioPorEmail(email);
      // Mesmo tempo e mesma resposta para "não existe" e "senha errada": a
      // diferença revelaria quem tem conta.
      const isValid = await conferirSenha(password, user?.passwordHash);
      if (!user || !isValid) {
        return res.status(401).json({ error: "Email ou senha inválidos" });
      }

      // Regenerate session ID before writing auth data — prevents session fixation.
      await new Promise<void>((resolve, reject) =>
        req.session.regenerate(err => err ? reject(err) : resolve())
      );
      req.session.userId = user.id;
      req.session.userName = user.name;
      req.session.userRole = user.role;
      req.session.userKit = user.kit === true;
      req.session.loginEm = Date.now();

      // O carimbo de login. Fora do caminho crítico de propósito: se o UPDATE
      // falhar, a pessoa ENTRA mesmo assim — o registro existe para a gestão
      // de acesso, não para autenticar, e negar login por causa dele seria
      // deixar o termômetro desligar o paciente.
      storage.updateUser(user.id, { lastLoginAt: new Date() }).catch((e) =>
        console.error("lastLoginAt não gravado (login por senha):", e?.message),
      );

      // Don't send password hash to client
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: unknown) {
      sendSensitiveError(res, error, "Login error");
    }
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Erro ao fazer logout" });
      }
      res.json({ message: "Logout realizado com sucesso" });
    });
  });

  // Get current user
  app.get("/api/auth/me", async (req, res) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    try {
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      // Don't send password hash to client
      const { passwordHash: _, ...userWithoutPassword } = user;
      // VER COMO (15/09): enquanto o admin navega como outro perfil, a tela
      // recebe o perfil da sessão — e o perfil real, para a faixa "Voltar".
      const verComo = req.session.papelReal
        ? { role: req.session.userRole, kit: req.session.userKit === true, papelReal: req.session.papelReal }
        : { papelReal: null };
      res.json({ ...userWithoutPassword, ...verComo });
    } catch (error: unknown) {
      sendSensitiveError(res, error, "Get current user error", 500);
    }
  });

  // VER COMO (dono, 15/09): "um botão para trocar meu usuário de perfil e ver
  // como estão os outros perfis". Só quem É admin; troca o perfil da SESSÃO
  // (não do cadastro), e todo o servidor passa a responder como aquele perfil.
  // "admin" volta. Novo login ou troca de perfil no cadastro também desfazem.
  app.post("/api/auth/ver-como", requireAuth, async (req, res) => {
    try {
      const papelReal = req.session.papelReal ?? req.session.userRole;
      if (papelReal !== "admin") {
        return res.status(403).json({ error: "Só o administrador pode ver o sistema como outro perfil." });
      }
      const perfil = typeof req.body?.role === "string" ? req.body.role : "";
      if (!["admin", "solicitacao", "arte", "grafica", "atendimento"].includes(perfil)) {
        return res.status(400).json({ error: "Perfil inválido" });
      }
      const kit = perfil === "solicitacao" && req.body?.kit === true;
      if (perfil === "admin") {
        req.session.userRole = "admin";
        req.session.userKit = false;
        delete req.session.papelReal;
      } else {
        req.session.papelReal = "admin";
        req.session.userRole = perfil;
        req.session.userKit = kit;
      }
      await new Promise<void>((ok, falhou) => req.session.save((e) => (e ? falhou(e) : ok())));
      // Nome puro: a própria troca de perfil não é ação "como" outro perfil.
      await createAuditLog(
        { userName: req.session.userName || req.userName, userId: req.session.userId },
        'updated',
        'user',
        req.session.userId!,
        perfil === "admin" ? "Voltou a ver o sistema como administrador" : `Passou a ver o sistema como ${perfil}${kit ? " (Kit)" : ""}`,
      );
      res.json({ role: perfil, kit, papelReal: perfil === "admin" ? null : "admin" });
    } catch (error: unknown) {
      sendSensitiveError(res, error, "Ver como error", 500);
    }
  });

  // Change password
  app.post("/api/auth/change-password", requireAuth, changePasswordRateLimiter, async (req, res) => {
    try {
      // Get current user first: o flag isFirstAccess do schema é decidido
      // AQUI, pelo registro do usuário — nunca pelo body. Antes, bastava o
      // client omitir currentPassword para trocar a senha de uma sessão
      // aberta sem provar que conhecia a senha atual.
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      const { currentPassword, newPassword } = changePasswordSchema.parse({
        ...req.body,
        isFirstAccess: user.mustChangePassword,
      });

      // Not first login: current password is ALWAYS required and verified.
      if (!user.mustChangePassword) {
        if (!currentPassword) {
          // Redundante com o superRefine do schema, mas explícito de propósito:
          // é a garantia de segurança, não uma regra de formulário.
          return res.status(400).json({ error: "Senha atual é obrigatória" });
        }
        const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isValid) {
          return res.status(401).json({ error: "Senha atual incorreta" });
        }
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 10);

      // Update user
      await storage.updateUser(user.id, {
        passwordHash,
        mustChangePassword: false,
      });

      // Invalida as DEMAIS sessões ativas do usuário, preservando a atual:
      // qualquer outra sessão (outro navegador, uma comprometida) cai.
      await encerrarSessoes(user.id, req.sessionID);

      // Create audit log — ação específica: 'password_changed' tem badge
      // próprio na tela de logs; como 'updated' genérico, a troca de senha
      // sumia no meio das edições comuns de usuário.
      await createAuditLog(
        req.userName!,
        'password_changed',
        'user',
        user.id,
        'Senha alterada'
      );

      res.json({ message: "Senha alterada com sucesso" });
    } catch (error: unknown) {
      sendSensitiveError(res, error, "Change password error");
    }
  });

  // Lista enxuta de usuários (id/nome/perfil) para preencher seletores, como o
  // "executivo responsável" do patrocinador. Não expõe e-mail nem hash — por
  // isso pode ficar disponível a qualquer usuário autenticado.
  app.get("/api/users/basic", requireAuth, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(
        users
          .map(u => ({ id: u.id, name: u.name, role: u.role }))
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      );
    } catch (error: unknown) {
      sendSensitiveError(res, error, "Get basic users error", 500);
    }
  });

  // ============ USER MANAGEMENT (Admin only) ============

  // Get all users
  app.get("/api/users", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      // Don't send password hashes to client
      const usersWithoutPasswords = users.map(({ passwordHash: _, ...user }) => user);
      res.json(usersWithoutPasswords);
    } catch (error: unknown) {
      sendSensitiveError(res, error, "Get all users error", 500);
    }
  });

  // Update user (admin only)
  app.patch("/api/users/:id", requireAdmin, async (req, res) => {
    try {
      // Validate against the schema so arbitrary fields (e.g. a client-supplied
      // passwordHash, which the schema omits entirely) can never be mass-assigned.
      const { password, ...validatedData } = insertUserSchema.partial().parse(req.body);
      // A mesma conta com outra grafia de e-mail não pode nascer por edição.
      if (validatedData.email) {
        const dono = await buscarUsuarioPorEmail(validatedData.email);
        if (dono && dono.id !== req.params.id) {
          return res.status(400).json({ error: "Email já cadastrado" });
        }
      }
      const updateData: Partial<User> = { ...validatedData };

      // If password is being updated, hash it (only path by which passwordHash is set)
      if (password) {
        updateData.passwordHash = await bcrypt.hash(password, 10);
        updateData.mustChangePassword = true;
      }

      const user = await storage.updateUser(req.params.id, updateData);
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      // Perfil, marca do Kit ou senha redefinida pelo admin: todas as sessões
      // da pessoa caem — ela entra de novo com o perfil novo / a senha nova.
      const mudouAcesso = validatedData.role !== undefined || validatedData.kit !== undefined;
      if (mudouAcesso || password) {
        // Só a senha do próprio admin mudou: a sessão em uso fica.
        const manter = !mudouAcesso && req.params.id === req.userId ? req.sessionID : undefined;
        await encerrarSessoes(req.params.id, manter);
      }

      // Create audit log
      await createAuditLog(
        req.userName!,
        'updated',
        'user',
        user.id,
        `Usuário "${user.name}" atualizado${validatedData.role ? ` (perfil: ${validatedData.role})` : ""}`
        + (validatedData.kit !== undefined ? (validatedData.kit ? " — marcado como usuário do Kit" : " — deixou de ser usuário do Kit") : "")
      );

      // Don't send password hash to client
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: unknown) {
      sendSensitiveError(res, error, "Update user error");
    }
  });

  // Delete user (admin only)
  app.delete("/api/users/:id", requireAdmin, async (req, res) => {
    try {
      // Prevent deleting yourself
      if (req.params.id === req.userId) {
        return res.status(400).json({ error: "Você não pode excluir sua própria conta" });
      }

      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      await storage.deleteUser(req.params.id);
      // Excluído não segue navegando com a sessão que já tinha.
      await encerrarSessoes(req.params.id);

      // Create audit log
      await createAuditLog(
        req.userName!,
        'deleted',
        'user',
        user.id,
        `Usuário "${user.name}" excluído`
      );

      res.json({ message: "Usuário excluído com sucesso" });
    } catch (error: unknown) {
      sendSensitiveError(res, error, "Delete user error", 500);
    }
  });

}
