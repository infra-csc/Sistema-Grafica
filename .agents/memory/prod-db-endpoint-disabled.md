---
name: Prod DB "endpoint has been disabled"
description: How to recognize a platform-level suspension of the production database (not a code bug) and what to tell the user
---

When the published app returns `{"error":"Erro interno do servidor"}` everywhere and deployment logs show
`The endpoint has been disabled. Enable it using the API and retry.` plus `timeout exceeded when trying to connect`,
the production database compute has been suspended at the platform level. It is not caused by the code.

**Why:** On 2026-10-16 this happened for hours while read-only production queries from the agent still worked. That made it look as if the DB was fine, but the deployed app's pool could not connect at all.

**How to apply:** Do not change code or republish to "fix" it. Confirm the problem with a DB-backed production request (for example, the checklist integration endpoint taking about 10s and then returning 500). Then tell the user to open Database → Production and click "Unpause database", and to check billing or usage. If there is no button, they should contact Replit support.
