---
name: Vincular-Patrocinadores auto-draft bug
description: Root cause and fix for all event sponsors appearing pre-selected (RASCUNHO) on new items
---

## The Bug
`vincular-patrocinadores.tsx` initialization `useEffect` had logic that auto-drafted ALL event sponsors as pending UI changes for any item with:
- `sponsorIds.length === 0` (no sponsors in DB)
- status `'requested'` or `'awaiting_linking'`

This caused every freshly imported item to show up as RASCUNHO with all 13 (or N) sponsors pre-selected, even though the user had not made any selections. The `originalSponsorsMap` remained empty (0/N CONCLUÍDO badge) but `pendingChanges` was pre-populated.

## The Fix
Removed the `canAutoDraft` block entirely. Items now load only with their DB-saved sponsors. Items with no sponsors show as PENDENTE (clean slate).

**Why:** The intent was to help users by pre-selecting all sponsors as a starting point, but it was misleading and caused confusion — users couldn't tell what was already saved vs. what was suggested.

## Companion fix
Added a per-item "Descartar" (X) button in the RASCUNHO actions area (next to Save) so users can clear pending changes for an individual item with one click, reverting it to PENDENTE.

## How to apply
- Never pre-populate `pendingChanges` in the sponsors initialization effect.
- The `pendingChanges` state should only be modified by explicit user actions (clicking a sponsor chip, toggleAll, toggleSkipApproval) or by the save/discard button handlers.
