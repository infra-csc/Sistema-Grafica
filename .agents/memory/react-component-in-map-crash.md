---
name: React component defined inside .map() causes crash with Radix UI dialogs
description: Defining a React component type inside a .map() callback causes unmount/remount on every render, which can crash the app when a Radix Dialog is open.
---

## Rule
Never define a React component (function that returns JSX and is used as `<Component />`) inside another component's render or inside a `.map()` callback.

**Why:** React uses reference equality to determine component identity. A component defined inside `render()` or `.map()` gets a new function reference on every parent render. React therefore UNMOUNTS the old component and MOUNTS a new one on every render. When a Radix UI Dialog is open, this repeated DOM mutation (unmount/remount) can trigger Radix's `DismissableLayer` to detect "outside interactions" and crash or close the dialog unexpectedly — sometimes causing the entire React tree to unmount (blank white screen).

**How to apply:** Extract all inner component definitions to module-level (outside the parent function) or as named functions before the `return`. Pass the needed closure variables as explicit props.

## Context
Found in `client/src/pages/eventos.tsx`: `ActionButtons` was defined inside `filteredEvents.map(...)`. When edit dialog opened and sponsors fetched via `setSelectedSponsorIds`, the map re-render created new `ActionButtons` types → unmount/remount → crash.

**Fix:** Extracted as `EventCardActions` at module level (before `export default function Eventos`), accepting `event`, `cardBorderHex`, `onEdit`, `onDelete`, `onSetPriority`, `canEdit`, `canDelete` as props.
