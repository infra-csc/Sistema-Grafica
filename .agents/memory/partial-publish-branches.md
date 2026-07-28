---
name: Partial-publish branch juggling
description: How main is kept "book-only" while full features live on a backup branch
---
User publishes only approved features. Main currently holds the published base + book feature (badges in atendimento/painel-geral + book-aware PDF export); everything else (arquivo final, conferência parcial, melhorias de importação, alertas em tempo real) lives on branch `todas-mudancas-completas` (superset of origin/main).

**Why:** user wants to test big features before they go live; publish deploys the whole repl.

**How to apply:**
- To restore everything: `git merge todas-mudancas-completas` (or revert the two revert commits on main). Do NOT re-pull expecting a clean merge — git sees those commits as already merged; pulls will conflict while main carries reverts.
- Do NOT push the revert commits to origin (other dev works on GitHub with the full feature set). Local main intentionally stays ahead of origin.
- After restoring, run `npm run db:push` and confirm "Changes applied" without prompts (session table must stay declared in schema.ts).
- Dev DB keeps extra columns not in the reverted schema — harmless; do NOT db:push while main is in reverted (book-only) state.
