# 003 — Scope the progress bar off `transition-all`

- **Status**: DONE
- **Commit**: uncommitted (working tree)
- **Severity**: HIGH
- **Category**: Performance (audit §5)
- **Estimated scope**: 1 file, 1 line

## Problem

`web/components/ui/progress.tsx:48` — current:

```tsx
className={cn("h-full bg-[#38296c] transition-all", className)}
```

Audit §5 states `transition: all` is always a finding: it animates unintended
properties off the GPU. This is not a dormant component. `Progress` is imported
and rendered in `web/components/StatusDialog.tsx:10` and
`web/components/GenerationCanvas.tsx:12`, so it is on screen during every
generation run, which is the app's most computationally busy moment.

Base UI's `Progress.Indicator` drives the fill by writing an inline `width`
percentage, so `transition-all` currently animates `width` **plus** every
inherited property that happens to change.

## Target

```tsx
className={cn(
  "h-full bg-[#38296c] transition-[width] duration-[var(--duration-panel)] ease-[var(--ease-out)]",
  className
)}
```

Honest tradeoff to record: `width` is a layout property, which `baseline-ui`
tells us never to animate. Base UI owns the fill mechanism here, so switching to
a compositor-only `transform: scaleX()` would mean re-implementing the primitive.
Narrowing `all` to the single property Base UI actually changes removes the
unintended off-GPU work, and the animated element is a 1.5px tall bar
(`web/components/ui/progress.tsx:32`), so the layout cost is negligible. The
alternative was rejected deliberately, not overlooked.

## Repo conventions to follow

- Motion tokens from plan 001 are consumed as Tailwind arbitrary values.
  Exemplar: `rounded-[var(--radius-inputs)]` in `web/components/ui/input.tsx:12`.
- Every `ui/` primitive merges incoming `className` last via `cn(...)`, so a
  caller can still override the duration.

## Steps

1. Open `web/components/ui/progress.tsx`, find `ProgressIndicator` at line 41.
2. Replace `transition-all` on line 48 with
   `transition-[width] duration-[var(--duration-panel)] ease-[var(--ease-out)]`.
3. Change nothing else in the file.

## Boundaries

- Do NOT rewrite `ProgressIndicator` to use `transform: scaleX()`; that changes
  the primitive's contract with Base UI and is out of scope.
- Do NOT touch `ProgressTrack`, `ProgressLabel`, or `ProgressValue`.
- Do NOT add dependencies.

## Verification

- **Mechanical**: `cd web; bunx tsc --noEmit -p tsconfig.json` exits 0.
- **Feel check**: start a generation so the status dialog appears. In DevTools
  Performance panel, record while the bar fills and confirm:
  - The bar advances smoothly with no visible stepping.
  - The Animations panel lists only `width` as the transitioning property, not
    a list of several.
- **Done when**: no `transition-all` remains in `web/components/ui/`.
