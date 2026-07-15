---
name: Norte Excel parser quirks
description: Known structural variations in Norte production spreadsheets that require special-case parsing logic
---

## Norte Excel Format (sheet2 data sheet)

Standard column mapping: A=event_code, B=group, C=item_name, D=cód_peça, E=qtde, G=visual_width, H=visual(height), I=material, J=acabamento, K=medida_do_arquivo(fileW), L=fileH

## Three Known Quirks

### 1. Bare-integer B values are NOT group names
Between groups, the B column contains shared-string indices (numeric strings like "54", "87").
These must be ignored when updating `currentGroup`.
**Fix:** `!/^\d+$/.test(row[groupCol].trim())` before updating currentGroup.

### 2. Some groups store qty in D (code col) instead of E (qty col)
Affected: groups like "PÓRTICO (BOCA DE 6)" — their rows have D="2" (qty) and E=empty.
Without fix, these items get qty=0 and are skipped entirely.
**Fix:** If E is empty AND D is a pure integer, use D as qty fallback.

### 3. Floating-point noise from xlsx numeric storage
Spreadsheet stores values like 3.0100000000000002, 0.6863999999999999.
**Fix:** Round all parseNum() results to 4 decimal places: `Math.round(n * 10000) / 10000`.
Also round calculatedM2 the same way.

**Why:** IEEE-754 binary floating point cannot represent decimals like 0.2 or 3.01 exactly.
**How to apply:** In the preview-xlsx route, parseNum function + calculatedM2 line.

### 4. Multi-sheet workbooks: wrong sheet selected first
Some files (e.g. BOTA_PARA_CORRER_SP) have a secondary sheet with a header-like row but no data rows.
Old logic stopped at the first sheet where header was found → 0 items → error.
**Fix:** Try ALL sheets; keep the candidate that yields the most valid items (`bestItems`).
Also changed qty parsing from `parseInt(qtyStr)` to `Math.floor(parseFloat(...))` to handle decimal qty values.
**Why:** Multi-sheet workbooks often have a summary/legend sheet that coincidentally matches header predicates.
**How to apply:** Sheet loop in preview-xlsx must NOT break early; iterate all sheets and compare item counts.
