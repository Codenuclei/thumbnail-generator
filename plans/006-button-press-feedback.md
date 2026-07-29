# 006 — Add press feedback to buttons

- **Status**: DONE
- **Commit**: uncommitted (working tree)
- **Severity**: MEDIUM
- **Category**: Physicality & origin (audit §3)
- **Estimated scope**: 1 file, 1 line

## Problem

`web/components/ui/button.tsx:7` — current base class string:

```tsx
"group/button inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap outline-none select-none transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 type-ui"
```

`transition-colors` is the only motion. There is no `:active` state anywhere, so
**no button in the app gives physical press feedback** — including the primary
Generate CTA in the footer (`web/components/StudioShell.tsx:340`) and the Back
and Next controls used on every step.

Audit §3 specifies press feedback as `transform: scale(0.97)` on `:active` with
`transition: transform 160ms ease-out`, kept subtle in the 0.95-0.98 range. A
button that does not acknowledge the press makes a slow action (generation takes
tens of seconds) feel unresponsive at the exact moment the user is least sure
anything happened.

## Target

```tsx
"group/button inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap outline-none select-none transition-[color,background-color,border-color,transform] duration-[var(--duration-press)] ease-[var(--ease-out)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 type-ui"
```

Resolved values: `--duration-press: 160ms` (audit's 100-160ms press band, top of
range chosen because these buttons are large), `--ease-out:
cubic-bezier(0.23, 1, 0.32, 1)`, scale 0.97 (audit's exact recommended value).

`transition-colors` is replaced with an explicit property list rather than
`transition-all`, because audit §5 bans `all` and `transform` must be included
for the press to animate rather than jump. `disabled:active:scale-100` prevents
a disabled button from appearing to respond.

## Repo conventions to follow

- `buttonVariants` is a `cva` call: the shared base string is argument 1, and
  per-variant classes live in `variants.variant`. Put press feedback in the
  **base string** so all six variants inherit it. Exemplar of the structure:
  `web/components/ui/button.tsx:6-41`.
- Reduced motion is handled centrally by plan 002, whose
  `transition-duration: 0.01ms` override neutralises the press scale. Do NOT add
  a local media query.

## Steps

1. Open `web/components/ui/button.tsx`.
2. Replace the entire base class string on line 7 with the Target string above.
3. Leave `variants`, `size`, and `defaultVariants` untouched.

## Boundaries

- Do NOT add `hover:scale-*`. Audit §6 warns that touch devices fire false
  hovers; press feedback on `:active` is the correct affordance.
- Do NOT add `will-change: transform`; `baseline-ui` bans it outside an active
  animation and the scale is cheap.
- Do NOT apply press feedback to the step stepper buttons in
  `StudioShell.tsx`; those are native `<button>` elements, not this component,
  and are high-frequency navigation.
- Do NOT add dependencies.

## Verification

- **Mechanical**: `cd web; bunx tsc --noEmit -p tsconfig.json` exits 0.
- **Feel check**: press and hold the Generate button, and the Back and Next
  controls. Confirm:
  - The button shrinks very slightly on press and springs back on release.
  - The scale is subtle enough that you notice it only if looking for it. If it
    reads as "bouncy", it is too much.
  - Colour hover still transitions smoothly and was not lost in the property
    list swap.
  - A disabled button (Generate with an empty topic) does not scale on click.
  - With reduced motion emulated, the press produces no scale.
- **Done when**: every button variant responds to `:active` with a 0.97 scale.
