---
name: Norte xlsx format
description: Structure of Norte Marketing Esportivo production xlsx files (Inverno, EcoRun, NightRun pattern).
---

The production xlsx files follow this structure:

- **Active data sheet**: Always sheet2 (sheet1 is a cover/dashboard with no `<v>` tags)
- **Header row**: Row 3 (not row 1) with columns: A=CÓD EVENTO, B=grupo(group), C=item, D=cód peça, E=qtde, G=área(width), H=visual(height), I=material, J=acabamento, K=medida do arquivo width, L=medida do arquivo height
- **Group column**: Column B — only populated on the first row of each group; subsequent rows in same group have B empty
- **XML cell type**: String cells use `t="s"` with `<v>index</v>` referencing sharedStrings.xml. Numeric cells have no `t=` attribute.

**Why:** sheet1 is a styled dashboard/cover sheet with only style attributes (`s="122"`) and no `<v>` tags. All actual data lives in sheet2.

**How to apply:** When parsing xlsx from Norte, try sheet2 first, then fall back to sheet1-4. Look for the header row containing both "item" and "qtde". The column one to the left of "item" (typically B) is the group column.
