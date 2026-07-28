---
name: Silent db:push failure via session table
description: Why drizzle-kit push silently aborts and how that broke production schema sync
---

**Rule:** The `session` table (connect-pg-simple) must stay declared in `shared/schema.ts`. Never remove it.

**Why:** drizzle-kit push flags any DB table not in schema.ts for deletion and shows an interactive prompt. Non-interactive runs (post-merge script `npm run db:push`) silently abort at that prompt → dev DB drifts from schema.ts → Replit's publish-time diff (dev DB vs prod DB) misses new columns → published app 500s with "column does not exist" (happened with `items.book_url`, July 2026).

**How to apply:**
- After any merge/pull that touches `shared/schema.ts`, run `npm run db:push` and confirm it ends with "Changes applied" (no prompt), then restart the workflow (tsx does not hot-reload server code).
- Production schema fix = re-publish (publish flow applies the dev→prod diff). Never run DDL against production.
- Stale `.git/*.lock` files can block `git pull`; remove locks older than a few minutes if no git process is running.
