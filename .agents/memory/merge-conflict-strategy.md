---
name: Merge conflict resolution strategy
description: Non-obvious rules for recurring conflicts caused by partial-publish branches and automatic Replit rebases
---

When `server/__tests__/permissoes-declaradas.test.ts` conflicts on a hardcoded route count, never select HEAD or REMOTE by label. Count the fully merged `REGUA_DE_PAPEIS` and run `lerReguaDoServidor` against the current worktree; both values must match the resolved expectation.

**Why:** Replit publish/sync can start a rebase that replays the executive-inference commit over a base containing newer guarded routes. The same conflict can therefore reappear with different totals even after a previous merge was completed.

**How to apply:** During a merge, resolve and commit. During a rebase, resolve, stage, test, then run `GIT_EDITOR=true git rebase --continue` until `.git/rebase-merge` and `.git/rebase-apply` are absent. Do not run another pull while either operation is active.

When `App.tsx` or the admin sidebar conflicts, preserve lazy route loading and combine all independently added admin pages rather than choosing one side wholesale. In the current feature set, Notificações, Reparar vínculos, and Inferir executivos must coexist.

**Why:** Automatic rebases replayed the repair and inference commits over a base that already contained Notifications and code splitting; selecting either conflict side removed valid routes or restored eager imports.

**How to apply:** Keep each page as a `lazyPage` declaration, retain its protected route and route label, keep all corresponding sidebar entries, then verify the generated build contains separate chunks for all three pages.

For older recurring feature conflicts, preserve the published branch behavior deliberately: HEAD wins for the export route, `awaiting_creator_review` gates, draft/requested compatibility, and the 680px send-confirm dialog. REMOTE wins for `LINKING_STATUSES`/`DOWNSTREAM_STATUSES`, the “Solicitado” translation, and the `awaiting_creator_review` → `awaiting_final_review` bucket.