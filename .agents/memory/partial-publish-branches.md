---
name: Partial-publish branch juggling
description: How main is kept "book-only" while full features live on a backup branch
---
User publishes only approved features. Main currently holds the published base + book feature (badges/PDF export) + conferência parcial & entrega parcial (ported from branch on 2026-07-28, WITHOUT the arquivo-final versioning/ack bits) + reaproveitamento→produced on creator-review. Remaining branch-only features (arquivo final upload/versioning/ack, melhorias de importação, alertas em tempo real) live on `todas-mudancas-completas` (superset of origin/main).

**Why:** user wants to test big features before they go live; publish deploys the whole repl.

**How to apply:**
- To restore everything: `git merge todas-mudancas-completas` (or revert the two revert commits on main). Do NOT re-pull expecting a clean merge — git sees those commits as already merged; pulls will conflict while main carries reverts.
- Do NOT push the revert commits to origin (other dev works on GitHub with the full feature set). Local main intentionally stays ahead of origin.
- After restoring, run `npm run db:push` and confirm "Changes applied" without prompts (session table must stay declared in schema.ts).
- Dev DB keeps extra columns not in the reverted schema — harmless; do NOT db:push while main is in reverted (book-only) state.
