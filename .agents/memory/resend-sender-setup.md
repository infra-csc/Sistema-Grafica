---
name: Resend deployment identity
description: Version-specific connector identity behavior that can make Resend work locally but fail in production.
---

Use `@replit/connectors-sdk` 0.4.3 or newer for Resend calls from deployments.

**Why:** With 0.4.2, the refreshed production Resend connection authenticated both domain reads and the email endpoint locally, but a newly published deployment still received HTTP 401. Version 0.4.3 changed deployment identity minting to use the local deployment identity endpoint with retry support, matching this local-success/production-failure symptom.

**How to apply:** If a connector call succeeds locally but returns an authentication error only after publishing, verify the SDK is at least 0.4.3 before rotating credentials again or changing providers. Validate email authentication with an intentionally incomplete request that cannot send; a 422 missing-field response proves the credential reached Resend.