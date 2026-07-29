# 007 — Stagger the variant grid and blur-mask the result reveal

- **Status**: DONE
- **Commit**: uncommitted (working tree)
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens (audit §7), Missed opportunity (§8)
- **Estimated scope**: 2 files, ~25 lines

## Problem

Two seams at the app's payoff moment, when generated thumbnails arrive.

**A. No stagger on the variant grid.** `web/components/GenerationCanvas.tsx:486`:

```tsx
<div className="grid grid-cols-2 gap-3">
  {generatedVariants.map(variantCard)}
```

Four tiles appear simultaneously with no entrance at all. Audit §7 calls for a
**30-80ms stagger** on group entrances, and §1 permits a delight budget here
because this is an occasional, high-emotion moment (it follows a wait of tens of
seconds), unlike the constantly-hit controls.

**B. Hard swap from skeleton to image.** `web/components/GenerationCanvas.tsx:509-541`
renders the loading skeleton grid and the finished `<img>` as siblings gated on
`loading`. When generation finishes the skeleton is removed and the image
appears in the same frame, with no crossfade. Audit §7 notes a jarring crossfade
that double-exposes two states can be masked with a subtle `filter: blur()`
during the transition, and §5 caps transition-time blur at **under 20px**
because heavy blur is expensive, especially in Safari.

## Target

**Add to `web/app/globals.css`** inside the existing `@layer utilities` block:

```css
/* Staggered grid entrance. Consumer sets --stagger-index per child.
   60ms sits mid-range in the audit's 30-80ms window. */
.stagger-item {
  animation: stagger-rise var(--duration-reveal) var(--ease-out) both;
  animation-delay: calc(var(--stagger-index, 0) * 60ms);
}

@keyframes stagger-rise {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.98);
    filter: blur(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
}

/* Blur-masked arrival for a single large image replacing a skeleton. */
.reveal-unblur {
  animation: reveal-unblur var(--duration-reveal) var(--ease-out) both;
}

@keyframes reveal-unblur {
  from {
    opacity: 0;
    filter: blur(12px);
    transform: scale(1.01);
  }
  to {
    opacity: 1;
    filter: blur(0);
    transform: scale(1);
  }
}
```

Blur values 6px and 12px are both well under the 20px ceiling. `scale(0.98)` and
`scale(1.01)` respect the never-`scale(0)` rule. `both` fill mode holds the first
frame during the stagger delay so tiles do not flash at full opacity before
animating.

**Wire the grid** at `web/components/GenerationCanvas.tsx:486`, passing the index
as a custom property so each child's delay is computed in CSS rather than by
writing transforms from JS (audit §5 warns against driving child transforms from
a parent variable; here the variable only feeds `animation-delay`, not a
transform, so no child style recalc cascade):

```tsx
<div className="grid grid-cols-2 gap-3">
  {generatedVariants.map((variant, i) => (
    <div
      key={variant.id}
      className="stagger-item"
      style={{ "--stagger-index": i } as React.CSSProperties}
    >
      {variantCard(variant)}
    </div>
  ))}
```

**Wire the single image** at `web/components/GenerationCanvas.tsx:535`: add
`reveal-unblur` to the existing `<img>` className.

## Repo conventions to follow

- Custom utilities live in the `@layer utilities` block of
  `web/app/globals.css`. Exemplar: `.scrollbar-none` at line 298, and the
  `.type-*` family at line 239.
- Duration and easing tokens come from plan 001; use
  `var(--duration-reveal)` (280ms) and `var(--ease-out)`.
- Reduced motion is handled centrally by plan 002. Its
  `animation-duration: 0.01ms` and `animation-iteration-count: 1` overrides
  collapse both keyframes to a single final frame, so no local media query.

## Steps

1. Add the two utility classes and two `@keyframes` blocks to the
   `@layer utilities` block in `web/app/globals.css`.
2. In `web/components/GenerationCanvas.tsx`, wrap each mapped variant in the
   `.stagger-item` div carrying `--stagger-index`, per Target.
3. Add `reveal-unblur` to the single-image `<img>` className.
4. Leave the skeleton grid markup unchanged; the crossfade comes from the
   incoming image, not from fading the skeleton out.

## Boundaries

- Do NOT raise either blur past 20px.
- Do NOT stagger anything with more than ~8 items. The last item's delay is
  `n * 60ms`, so a long list would leave the final entry visibly late.
- Do NOT add stagger to the reference thumbnail grid in `InspirationGrid.tsx`;
  those can number in the dozens and it would violate the line above.
- Do NOT animate `width`/`height` on the image.
- Do NOT add dependencies.

## Verification

- **Mechanical**: `cd web; bunx tsc --noEmit -p tsconfig.json` exits 0. Confirm
  the `as React.CSSProperties` cast is present, since TypeScript rejects custom
  properties in a `style` object without it.
- **Feel check**: run a generation to completion. In DevTools Animations panel at
  10% playback, confirm:
  - The four tiles arrive in sequence, roughly 60ms apart, not all at once.
  - Each tile resolves *out of* blur rather than popping in sharp.
  - The final tile does not feel detached from the first (total cascade should be
    about 180ms of delay plus 280ms of animation).
  - The single-image path unblurs without a visible double-exposure against the
    skeleton it replaces.
  - Record a Performance profile during the reveal and confirm no dropped frames
    from the blur; if frames drop, lower the tile blur from 6px to 4px.
  - With reduced motion emulated, tiles appear immediately, sharp, no cascade.
- **Done when**: the generation reveal cascades and resolves from blur, and the
  Performance panel shows no dropped frames during it.
