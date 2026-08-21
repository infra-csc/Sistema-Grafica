---
name: Resend sender setup
description: Operational constraint for the project’s Resend email connection.
---

The connected Resend credential is intentionally restricted to email sending. Domain-management API calls return a restricted-key response, so verify or add sending domains in the Resend dashboard rather than from the application.

**Why:** Keeping a send-only credential in the application limits the impact of a compromised runtime while still allowing transactional notifications.

**How to apply:** Before enabling a new sender, authenticate the sender domain in Resend’s dashboard and publish its required DNS records. Keep email delivery code limited to the Resend send endpoint.