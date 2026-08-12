// Auth + user management routes. Extracted from server/routes.ts.
import type { Express } from "express";
import bcrypt from "bcryptjs";
import { storage } from "../storage";
import { pool } from "../db";
import { insertUserSchema, loginSchema, changePasswordSchema } from "@shared/schema";
import {
  requireAuth,
  requireAdmin,
  loginRateLimiter,
  changePasswordRateLimiter,
  createAuditLog,
  sendSensitiveError,
} from "./shared";

export function registerAuthRoutes(app: Express): void {
  // ============ AUTHENTICATION ============

  // Register new user (admin only)
  app.post("/api/auth/register", requireAdmin, async (req, res) => {
    try {
      const { password, ...userData } = insertUserSchema.parse({ ...req.body, password: req.body.password || "sso_placeholder_pw" });
      
      // Check if email already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ error: "Email já cadastrado" });
      }

      // When no password is provided (SSO-only users), generate a random secure hash
      const rawPassword = password && password.length >= 6 ? password : Math.random().toString(36) + Math.random().toString(36) + Date.now().toString(36);
      const passwordHash = await bcrypt.hash(rawPassword, 10);

      // Create user (SSO-only: no password change required)
      const user = await storage.createUser({
        ...userData,
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
    } catch (error: any) {
      sendSensitiveError(res, error, "Register error");
    }
  });

  // Login
  app.post("/api/auth/login", loginRateLimiter, async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      // Find user
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Email ou senha inválidos" });
      }

      // Verify password
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: "Email ou senha inválidos" });
      }

      // Regenerate session ID before writing auth data — prevents session fixation.
      await new Promise<void>((resolve, reject) =>
        req.session.regenerate(err => err ? reject(err) : resolve())
      );
      req.session.userId = user.id;
      req.session.userName = user.name;
      req.session.userRole = user.role;

      // Don't send password hash to client
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
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
      res.json(userWithoutPassword);
    } catch (error: any) {
      sendSensitiveError(res, error, "Get current user error", 500);
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

      // Invalida as DEMAIS sessões ativas do usuário (mesmo padrão da troca de
      // papel em PATCH /api/users/:id), preservando a sessão atual: quem trocou
      // a senha continua logado; qualquer outra sessão (outro navegador, uma
      // sessão comprometida) cai e exige novo login com a senha nova.
      try {
        await pool.query(
          `DELETE FROM session WHERE (sess->>'userId') = $1 AND sid <> $2`,
          [user.id, req.sessionID]
        );
      } catch (sessionErr) {
        // Non-fatal: log the error but don't fail the password change.
        console.error("Failed to invalidate other sessions after password change:", sessionErr);
      }

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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
      sendSensitiveError(res, error, "Get all users error", 500);
    }
  });

  // Update user (admin only)
  app.patch("/api/users/:id", requireAdmin, async (req, res) => {
    try {
      // Validate against the schema so arbitrary fields (e.g. a client-supplied
      // passwordHash, which the schema omits entirely) can never be mass-assigned.
      const { password, ...validatedData } = insertUserSchema.partial().parse(req.body);
      const updateData: any = { ...validatedData };

      // If password is being updated, hash it (only path by which passwordHash is set)
      if (password) {
        updateData.passwordHash = await bcrypt.hash(password, 10);
        updateData.mustChangePassword = true;
      }

      const user = await storage.updateUser(req.params.id, updateData);
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      // If the role changed, invalidate all active sessions for that user so
      // they get the new role on their next login. Session data stores userId
      // as a JSON string field inside the `sess` column.
      if (validatedData.role !== undefined) {
        try {
          await pool.query(
            `DELETE FROM session WHERE (sess->>'userId') = $1`,
            [req.params.id]
          );
        } catch (sessionErr) {
          // Non-fatal: log the error but don't fail the update response.
          console.error("Failed to invalidate user sessions after role change:", sessionErr);
        }
      }

      // Create audit log
      await createAuditLog(
        req.userName!,
        'updated',
        'user',
        user.id,
        `Usuário "${user.name}" atualizado${validatedData.role ? ` (perfil: ${validatedData.role})` : ""}`
      );

      // Don't send password hash to client
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
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

      // Create audit log
      await createAuditLog(
        req.userName!,
        'deleted',
        'user',
        user.id,
        `Usuário "${user.name}" excluído`
      );

      res.json({ message: "Usuário excluído com sucesso" });
    } catch (error: any) {
      sendSensitiveError(res, error, "Delete user error", 500);
    }
  });

}
