# 004 — Retime overlay entrances to the audit's duration budget

- **Status**: DONE
- **Commit**: uncommitted (working tree)
- **Severity**: HIGH
- **Category**: Easing & duration (audit §2)
- **Estimated scope**: 3 files, 1 line each

## Problem

Three overlays animate at `duration-100` (100ms) with `tw-animate-css` default
easing:

```tsx
/* web/components/ui/dialog.tsx:34 — overlay, current */
"fixed inset-0 isolate z-50 bg-black/30 duration-100 supports-backdrop-filter:backdrop-blur-sm data-open:animate-in data-open:fade-in-0 ..."

/* web/components/ui/dialog.tsx:56 — content, current */
"... shadow-[var(--shadow-subtle-3)] duration-100 outline-none sm:max-w-md data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 ..."

/* web/components/ui/select.tsx:86 — popup, current */
"... rounded-[var(--radius-inputs)] bg-popover ... duration-100 data-[align-trigger=true]:animate-none ..."
```

Audit §2 duration table: **modals and drawers 200-500ms**, **dropdowns and
selects 150-250ms**. At 100ms a modal that also scales from 0.95 reads as a
flicker rather than an arrival: the eye registers the scale change as a glitch
because there aren't enough frames to perceive it as movement. The select popup
at 100ms is under the dropdown floor too.

Neither carries an explicit easing, so both inherit a symmetric curve where
audit §2 requires `ease-out` for entrances.

## Target

```tsx
/* web/components/ui/dialog.tsx:34 — overlay target */
"... bg-black/30 duration-[var(--duration-modal)] ease-[var(--ease-out)] supports-backdrop-filter:backdrop-blur-sm data-open:animate-in ..."

/* web/components/ui/dialog.tsx:56 — content target */
"... duration-[var(--duration-modal)] ease-[var(--ease-out)] outline-none ..."

/* web/components/ui/select.tsx:86 — popup target */
"... duration-[var(--duration-dropdown)] ease-[var(--ease-out)] data-[align-trigger=true]:animate-none ..."
```

Resolved values from plan 001: `--duration-modal: 240ms` (inside the 200-500ms
modal budget), `--duration-dropdown: 200ms` (inside 150-250ms),
`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`.

The tooltip at `web/components/ui/tooltip.tsx:53` carries no `duration-*` class
and already lands inside the 125-200ms tooltip budget on the library default.
Add `duration-[var(--duration-tooltip)] ease-[var(--ease-out)]` to make it
explicit and consistent, not because the current feel is wrong.

## Repo conventions to follow

- Overlay classes are single long strings inside `cn(...)`. Keep the existing
  class order; insert the duration and easing where `duration-100` sits today.
- Token consumption pattern exemplar: `web/components/ui/card.tsx:15`.

## Steps

1. `web/components/ui/dialog.tsx:34` — replace `duration-100` with
   `duration-[var(--duration-modal)] ease-[var(--ease-out)]`.
2. `web/components/ui/dialog.tsx:56` — same replacement.
3. `web/components/ui/select.tsx:86` — replace `duration-100` with
   `duration-[var(--duration-dropdown)] ease-[var(--ease-out)]`.
4. `web/components/ui/tooltip.tsx:53` — insert
   `duration-[var(--duration-tooltip)] ease-[var(--ease-out)]` immediately after
   the leading `z-50`.

## Boundaries

- Do NOT change `zoom-in-95` to any other scale value. 0.95 is already correct
  per audit §3 (never `scale(0)`, target 0.9-0.97).
- Do NOT add `transform-origin` to the dialog. Modals are exempt; centre origin
  is correct there.
- Do NOT touch the `data-closed:` exit classes; exits stay as-is.
- Do NOT add dependencies.

## Verification

- **Mechanical**: `cd web; bun run build` exits 0.
- **Feel check**: open the feedback dialog and a model select. In DevTools
  Animations panel set playback speed to 10% and confirm:
  - The dialog scales up from 0.95 and decelerates into place; it never appears
    to snap or flicker.
  - The select popup grows from the trigger edge, not from its own centre.
  - The overlay's blur and fade finish together with the content, not after it.
- **Done when**: no `duration-100` remains in `web/components/ui/`.
