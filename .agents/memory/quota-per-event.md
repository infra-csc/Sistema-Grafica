---
name: Quota per-event design
description: How sponsor quota assignment works in NORTE — per-event, not global
---

## Rule
Sponsor quotas (MASTER/GOLD/SILVER/APOIO/MIDIA/MINISTERIO) are stored per-event in `event_sponsors.quota`, not in the global `sponsors.quota` field.

**Why:** A sponsor can have different tiers in different events. The global `sponsors.quota` field is just a default/hint for pre-filling the UI when selecting a sponsor on an event form.

**How to apply:**
- `previewAutoLink` and `autoLinkByQuota` in storage.ts must JOIN `event_sponsors` and read `eventSponsors.quota`.
- POST `/api/events/:id/sponsors` accepts `{ sponsorId, quota }`.
- PATCH `/api/events/:eventId/sponsors/:sponsorId` updates quota for an existing link.
- `updateEventSponsorQuota(eventId, sponsorId, quota)` is the storage method.
- In `eventos.tsx`: `sponsorQuotaMap: Record<string, string>` state tracks sponsorId→quota; pill selectors appear below each checked sponsor row.
