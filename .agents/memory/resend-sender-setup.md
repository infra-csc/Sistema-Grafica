---
name: Resend deployment identity
description: A connector connection can work in dev, appear "added", and still fail auth only in production — the fix is a full delete-and-recreate, not a key rotation.
---

Use `@replit/connectors-sdk` 0.4.3+ for Resend calls from deployments (harmless baseline, but see below — it did not fix the real incident).

**Why (confirmed root cause, superseding an earlier wrong hypothesis in this file):** a production deployment got HTTP 401 from Resend with body `No connection found for replid: <repl id> or user: <user id> with connector: resend`, even though the connection showed `added` in the project, the same replid matched `$REPL_ID`, and dev-environment calls authenticated fine. This is the connectors-service backend failing to bind the *specific connection record* to this repl/user pair — a stuck/corrupt association, not a credential problem. Rotating the Resend API key, re-running `addIntegration` on the same connection, and bumping the SDK version all failed to fix it.

**How to apply:** if a connector call fails in production only, with an auth error whose body explicitly says "no connection found for replid/user" (not just a bare 401/403), do not keep rotating the credential or re-authorizing the same connection — that binds to the same broken record. Instead: have the user fully delete the connection from Replit's integrations UI (not just edit/rotate the key) until it reverts to a `not_setup` connector, then `ProposeIntegration` a brand-new connection from scratch. Verify with a real send (not just a 422 malformed-request check, since that only proves the credential reached the provider, not that the deployment's identity binding works) after the next publish.
