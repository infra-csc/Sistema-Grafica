---
name: Radix Checkbox BubbleInput synthetic click causes infinite setState loop
description: Radix Checkbox internally dispatches a synthetic click event (isTrusted=false) via BubbleInput when checked state changes. If a parent div has an onClick that calls setState, this creates an infinite loop.
---

## Rule
When using Radix UI `Checkbox` inside a clickable parent `<div>` that also calls `setState`, always guard the parent's `onClick` with `if (!e.isTrusted) return;`.

**Why:** The Radix `@radix-ui/react-checkbox` contains an internal `BubbleInput` component that keeps a hidden `<input type="checkbox">` in sync with the controlled `checked` prop. Whenever `checked` changes, `BubbleInput` fires `new Event('click', { bubbles: true })` on the hidden input. This synthetic click (`isTrusted=false`) bubbles up through the DOM and triggers any `onClick` handler on ancestor elements. If that ancestor `onClick` calls `setState` to toggle the selection, the Checkbox prop changes again, triggering another BubbleInput event — infinite loop. React reports this as "Maximum update depth exceeded" with a `setRef → Array.map → setRef → dispatchSetState` stack trace (Radix compose-refs chunk).

**How to apply:**
- On any div/element that wraps a Radix Checkbox AND has an onClick that calls setState, add: `onClick={(e) => { if (!e.isTrusted) return; /* ... */ }}`
- Also use functional setState form (`prev => ...`) to avoid stale closures.
- The `Checkbox`'s own `onClick={e => e.stopPropagation()}` does NOT prevent BubbleInput events from reaching the parent because BubbleInput dispatches directly on the hidden `<input>` element, not on the Checkbox button.
