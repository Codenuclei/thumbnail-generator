# 005 — Animate studio step panel changes

- **Status**: DONE
- **Commit**: uncommitted (working tree)
- **Severity**: MEDIUM
- **Category**: Missed opportunity (audit §8)
- **Estimated scope**: 1 file, ~6 lines

## Problem

`web/components/ui/tabs.tsx:71` — current:

```tsx
function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}
```

There is no enter animation. This primitive renders all five studio steps
(`web/components/StudioShell.tsx:250-288`: Topic, Media, Research, Style,
Generate), so every step change hard-swaps an entire panel of form content. The
step stepper is the app's primary navigation and is used tens of times per
session, which audit §8 calls out precisely: a state change that teleports,
where a brief transition would prevent a jarring change.

Audit §1's frequency table puts "tens of times/day" at *drastically reduced*
motion, not zero, so this wants a short fade with a small rise, not a slide.

## Target

```tsx
function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn(
        "flex-1 outline-none",
        "animate-in fade-in-0 slide-in-from-bottom-1 duration-[var(--duration-panel)] ease-[var(--ease-out)]",
        className
      )}
      {...props}
    />
  )
}
```

Resolved values: `--duration-panel: 200ms`,
`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`.
`slide-in-from-bottom-1` is a 4px rise (Tailwind spacing 1), deliberately small:
the panel is tall and a larger offset would read as a slide, which at this
frequency becomes tiring.

**Why the classes are unconditional.** Verified in the installed version at
`web/node_modules/@base-ui/react/tabs/panel/TabsPanel.mjs:31,104`:
`keepMounted = false` by default and `shouldRender = keepMounted || mounted`, so
an inactive panel is **unmounted**. Each step change therefore mounts a fresh
panel and the CSS animation runs again. No `data-*` gate is needed, and gating on
`data-activation-direction` would not help anyway: a CSS animation does not
re-trigger when an attribute value changes, only on mount or animation-name
change. If a future change passes `keepMounted`, this animation will fire only
once and must be revisited.

## Repo conventions to follow

- The project already uses `tw-animate-css` entrance utilities on Base UI
  `data-*` state attributes. Exemplar: `web/components/ui/select.tsx:86` uses
  `data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95`.
- Reduced motion is handled centrally by plan 002, which sets
  `transform: none` on `[data-slot="tabs-content"]`. Do NOT add a second
  reduced-motion query here.

## Steps

1. Open `web/components/ui/tabs.tsx`, find `TabsContent` at line 71.
2. Replace the single `cn("flex-1 outline-none", className)` argument list with
   the three-argument form in Target above.
3. Change nothing else in the file. `TabsList` and `TabsTrigger` stay as they are.

## Boundaries

- Do NOT animate `TabsTrigger`; the stepper buttons are hit constantly and
  audit §1 says high-frequency controls should not animate beyond colour.
- Do NOT add a direction-aware transition (different direction going back).
  That needs state the primitive does not expose here and is out of scope.
- Do NOT change `StudioShell.tsx` in this plan.
- Do NOT add dependencies.

## Verification

- **Mechanical**: `cd web; bunx tsc --noEmit -p tsconfig.json` exits 0.
- **Feel check**: click through all five steps forward, then back. Confirm:
  - Each panel fades in with a barely perceptible upward settle.
  - Clicking rapidly between two steps never queues or stutters; the newest
    panel always wins.
  - Scroll position inside a long panel is not visibly thrown by the 4px offset.
  - With `prefers-reduced-motion: reduce` emulated, panels cross-fade with no
    vertical movement at all.
- **Done when**: switching steps no longer produces an instant content snap.
