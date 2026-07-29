# 001 — Add motion tokens (easing + duration scale)

- **Status**: DONE
- **Commit**: uncommitted (working tree)
- **Severity**: HIGH
- **Category**: Cohesion & tokens (audit §7), Easing & duration (§2)
- **Estimated scope**: 1 file, ~15 lines

## Problem

`web/app/globals.css` defines tokens for colour, radius, shadow, spacing and
type, but **nothing for motion**. Grepping the file for `--ease` and
`--duration` returns no matches. Every transition in the app therefore falls
back to Tailwind's built-in defaults: `transition-colors` resolves to
`150ms cubic-bezier(0.4, 0, 0.2, 1)`, a symmetric ease-in-out.

Per audit §2, built-in CSS easings are too weak for deliberate motion, and an
ease-in-out curve on an entrance starts slow at exactly the moment the user is
watching. There is also no shared duration scale, so plans 004 through 007
would each hand-type their own values and drift apart.

## Target

Add to the `:root` block of `web/app/globals.css`, after the existing
`/* Shadows */` group:

```css
/* Motion
   Easing chosen per audit: ease-out for enter/exit, ease-in-out for
   on-screen movement, drawer curve for panel slides. */
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);

/* Duration budget: UI stays under 300ms */
--duration-press: 160ms;
--duration-tooltip: 150ms;
--duration-dropdown: 200ms;
--duration-panel: 200ms;
--duration-modal: 240ms;
--duration-reveal: 280ms;
```

Values are copied verbatim from the audit playbook's easing block and duration
table (button press 100-160ms, tooltips 125-200ms, dropdowns 150-250ms,
modals 200-500ms).

## Repo conventions to follow

- All tokens live in the single `:root` block at the top of
  `web/app/globals.css`, grouped by a `/* Comment */` header. Exemplar: the
  `/* Border Radius */` group at `web/app/globals.css:96`, which pairs each
  token with a short comment explaining the scale.
- Tokens are consumed as `var(--token)` inside Tailwind arbitrary values, e.g.
  `rounded-[var(--radius-cards)]` in `web/components/ui/card.tsx:15`.

## Steps

1. Open `web/app/globals.css`. Locate the `/* Shadows */` group in `:root`.
2. Insert the `/* Motion */` and duration block above `/* Surfaces */`.
3. Do not remove or renumber any existing token.

## Boundaries

- Do NOT apply these tokens to any component in this plan. Later plans do that.
- Do NOT touch the second `@theme` block lower in the file.
- Do NOT add dependencies.

## Verification

- **Mechanical**: `cd web; bun run build` exits 0.
- **Feel check**: nothing visibly changes yet. Confirm in DevTools that
  `getComputedStyle(document.documentElement).getPropertyValue('--ease-out')`
  returns `cubic-bezier(0.23, 1, 0.32, 1)`.
- **Done when**: the six duration tokens and three easing tokens resolve at
  runtime.
