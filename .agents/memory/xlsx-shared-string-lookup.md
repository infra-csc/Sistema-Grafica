---
name: XLSX shared-string numeric index bug
description: Excel sheets can store formula-computed text values as bare numeric shared-string indices in non-"s" cells; the parser must resolve them manually.
---

## The Rule
When a cell in the "group" column (B) has a numeric value (not t="s") and the "item" column (C) is empty, try `sharedStrings[parseInt(B)]` as the item description.

**Why:** The EcoRun file uses Excel formulas in column B that emit the *shared-string index* as their calculated numeric value (stored in `<v>` with no t="s" attribute). The XML parser correctly reads it as a number, but the actual text lives at `sharedStrings[that number]`. Without this lookup, all rows except the first of each group are skipped (empty itemVal → `continue`).

**How to apply:** In both `preview-xlsx` and `import-xlsx` parsing loops in `server/routes.ts`, after the normal itemVal read from colMap["item"], add:
```ts
if (!itemVal && groupCol && row[groupCol] && /^\d+$/.test(row[groupCol].trim())) {
  const ssIdx = parseInt(row[groupCol].trim());
  if (ssIdx > 0 && sharedStrings[ssIdx]) itemVal = sharedStrings[ssIdx].trim();
}
```
Also ensure the `currentGroup` update guard uses `!/^\d+$/.test(...)` to avoid polluting the group name with the numeric index.
