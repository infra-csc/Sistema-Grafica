---
name: DB Architecture
description: Which database each environment uses and how to apply schema fixes correctly
---

# DB Architecture

## Connection strings

- `server/db.ts` uses **`DATABASE_URL`** exclusively — this is the Replit-managed PostgreSQL.
- `NEON_DATABASE_URL` is a separately configured Neon project. It is NOT used by the main server at runtime (despite session notes suggesting otherwise).

## Dev vs Production

- **Dev** `DATABASE_URL` → Replit built-in dev PostgreSQL (separate schema from production)
- **Production** `DATABASE_URL` → Replit built-in production PostgreSQL (only accessible via the Publish flow)

Running `node -e "... process.env.DATABASE_URL ..."` in the workspace only touches the **dev** DB. It does NOT fix production.

## How to apply schema fixes to production

The ONLY supported path is **Republish** (click Publish in the Replit UI).  
The Publish flow diffs `shared/schema.ts` against production, resolves any renames, and applies `ALTER TABLE` automatically.

**Why:** There is no direct connection string available to the agent for the production DB. `executeSql({ environment: "production" })` is read-only and cannot run DDL.

## Pre-publish checklist

1. `npx drizzle-kit push` on dev must succeed cleanly (no pending prompt).
2. Session table must remain in `schema.ts` (see schema-push-session-table.md).
3. `audit_logs` btree index issue — if `db:push` prompts on index drop, remove the index from schema and drop from both DBs first.

## Common mistake

Adding a column to `NEON_DATABASE_URL` or `DATABASE_URL` from the dev shell does NOT fix production — only Publish does.
