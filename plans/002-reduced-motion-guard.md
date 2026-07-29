# 002 — Add a global reduced-motion guard

- **Status**: DONE
- **Commit**: uncommitted (working tree)
- **Severity**: HIGH
- **Category**: Accessibility (audit §6)
- **Estimated scope**: 1 file, ~20 lines

## Problem

Grepping the whole `web/` tree for `prefers-reduced-motion` returns **zero
matches**. Every animation in the app runs unconditionally, including:

- 20+ infinite spinners, e.g. `web/components/StatusDialog.tsx:34`
  (`<Loader2 className="size-6 animate-spin text-[#38296c]" />`) and six more in
  `web/app/page.tsx` at lines 1897, 1948, 2032, 2181, 2331, 2539.
- The infinite `animate-pulse` on every skeleton, `web/components/ui/skeleton.tsx:7`:
  ```tsx
  className={cn("animate-pulse rounded-[20px] bg-[#efefef]", className)}
  ```
- Every overlay zoom entrance, e.g. `web/components/ui/dialog.tsx:56`
  (`data-open:zoom-in-95`).

Audit §6 is explicit that reduced motion means fewer and gentler animations,
**not zero** — opacity and colour feedback should survive, movement should not.

## Target

Append to `web/app/globals.css`, after the closing brace of the existing
`@layer utilities` block:

```css
/* Reduced motion: keep opacity and colour feedback, drop movement.
   Spinners slow rather than stop, so loading is still legible. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  /* Loading indicators must stay animated to read as "working",
     just slower and without the implication of speed. */
  .animate-spin {
    animation-duration: 1.6s !important;
    animation-iteration-count: infinite !important;
  }

  .animate-pulse {
    animation-duration: 3s !important;
    animation-iteration-count: infinite !important;
  }

  /* Entrances keep their fade, lose their translate and scale. */
  [data-slot="dialog-content"],
  [data-slot="select-popup"],
  [data-slot="tooltip-popup"],
  [data-slot="tabs-content"] {
    transform: none !important;
  }
}
```

## Repo conventions to follow

- `web/app/globals.css` already uses `@layer base` (line 220) and
  `@layer utilities` (line 238). This block goes at file scope after them, since
  a media query with `!important` overrides should not sit inside a layer.
- Components are addressable by `data-slot`, set by every primitive. Exemplar:
  `web/components/ui/tabs.tsx:74` sets `data-slot="tabs-content"`.

## Steps

1. Open `web/app/globals.css` and go to the end of the file.
2. Append the `@media (prefers-reduced-motion: reduce)` block above verbatim.
3. Do not modify any component in this plan.

## Boundaries

- Do NOT delete any animation from a component to "handle" reduced motion. The
  guard is centralised here on purpose.
- Do NOT set `animation: none` on spinners; a frozen spinner reads as a hung app.
- Do NOT add dependencies.

## Verification

- **Mechanical**: `cd web; bun run build` exits 0.
- **Feel check**: open DevTools, Rendering panel, set
  "Emulate CSS prefers-reduced-motion: reduce". Then confirm:
  - Opening the feedback dialog still fades in but does not scale or slide.
  - Switching studio steps swaps content instantly with no vertical movement.
  - A spinner during generation still rotates, visibly slower.
  - Skeletons still pulse, slower.
- **Done when**: with reduced motion emulated, no element translates or scales,
  and no loading indicator is frozen.
