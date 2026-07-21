---
name: Item status naming
description: Canonical English item statuses vs legacy Portuguese statuses that may linger in the prod DB
---

Canonical item statuses are English camel/snake case: requested → awaiting_linking → awaiting_submission → awaiting_sponsor_approval → sponsor_approved → awaiting_final_review → ready_for_production → inProduction → produced → delivered.

**Why:** Older code (and possibly prod DB rows) used Portuguese statuses (`pronto_para_producao`, `liberado`, `em_producao`, `produzido`, `entregue`) and a ghost `approved` status no endpoint ever sets. Mixing them made items invisible to dashboards and gates.

**How to apply:** Never introduce a new status string without checking every gate: storage queries (getPendingItems/getApprovedItems IN clauses), route status checks, and frontend STATUS_CONFIG maps in painel-geral, grafica, arte, vincular-patrocinadores, event-detail (BLOCKED_EDIT_STATUSES). Keep `pronto_para_producao` as a legacy fallback in read paths until prod data is migrated; write paths must emit English names only.

## awaiting_creator_review semantics
- `awaiting_creator_review` = sponsor approval SKIPPED (skipApproval flag or no sponsors at thumb submission). Same workflow stage as `sponsor_approved`: waiting for ARTE to upload the final file — NOT waiting for the creator.
- **Why:** the name is misleading; it once got grouped/labeled as "Aguard. Revisão" and the submit-final-file endpoint only accepted sponsor_approved, leaving items permanently stuck with a 409.
- **How to apply:** anywhere sponsor_approved appears (tab pools, counters, endpoint gates, labels "Aguard. Finalização"), awaiting_creator_review must be treated identically. Creator review stage = `awaiting_final_review` only.
