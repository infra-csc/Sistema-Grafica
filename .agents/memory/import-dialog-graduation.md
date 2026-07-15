---
name: Import dialog graduation
description: How the XLSX import UI was redesigned from two dialogs into one split-panel dialog.
---

The original import flow had two separate dialogs: upload (`importDialogOpen`) and preview (`importPreviewOpen`).

**Why merged:** Variante B (SplitPanel) uses a persistent left sidebar that shows upload zone in phase 1 and stats in phase 2, removing the need to navigate between dialogs.

**How to apply:** `importDialogOpen` is now the single open/close state. `importPreviewItems === null` = phase 1 (upload only); `importPreviewItems !== null` = phase 2 (stats + table on right). `importPreviewOpen` state still exists for compatibility but is no longer used to open any dialog.

**Key mutation changes:**
- `previewXlsxMutation.onSuccess`: no longer calls `setImportDialogOpen(false)` or `setImportPreviewOpen(true)`, just sets items.
- `confirmImportMutation.onSuccess`: closes `importDialogOpen` (not `importPreviewOpen`).
- Dialog onOpenChange: resets `importPreviewItems` and `importSearch` on close.

**Dialog sizing:** starts at 540px wide (phase 1), expands to 1200px wide (phase 2) via inline style with `transition: width 0.3s`.
