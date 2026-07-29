# 008 — baseline-ui pass: z-scale, tabular-nums, text-balance, aria-labels

- **Status**: DONE
- **Commit**: uncommitted (working tree)
- **Severity**: LOW
- **Category**: baseline-ui (Layout, Typography, Components)
- **Estimated scope**: ~5 files

## Problem

Four `baseline-ui` constraints are violated.

**A. Arbitrary z-index** (rule: "MUST use a fixed z-index scale, no arbitrary
`z-*`"). Three ad-hoc values, none coordinated:

```tsx
/* web/components/ColorPicker.tsx:334 */  "fixed z-[9999] w-[260px] ..."
/* web/components/GenerationCanvas.tsx:610 */  "fixed inset-0 z-[90] bg-black/30 backdrop-blur-[2px]"
/* web/components/GenerationCanvas.tsx:617 */  "fixed left-1/2 top-1/2 z-[100] ..."
```

`z-[9999]` means the colour picker floats above the fullscreen viewer and its
own scrim with no stated intent, which is how stacking bugs start.

**B. No `tabular-nums` on changing numbers** (rule: "MUST use `tabular-nums` for
data"). The step counter at `web/components/StudioShell.tsx:157`
(`Step {stepIndex + 1} of 5`) and the count badges at line 229 both shift
horizontally as digits change. `web/components/ui/progress.tsx:68` already does
this correctly and is the exemplar.

**C. No `text-balance` / `text-pretty`** (rule: "MUST use `text-balance` for
headings and `text-pretty` for body"). `web/components/StudioShell.tsx:361` panel
heading and `:371` description both wrap raggedly.

**D. Icon-only buttons without `aria-label`** (rule: "MUST add an `aria-label` to
icon-only buttons"). Ten buttons whose only child is a `lucide-react` icon:

| Site | Icon | Name before fix |
| --- | --- | --- |
| `LayerEditorPanel.tsx:190` | `Undo2` | none |
| `LayerEditorPanel.tsx:198` | `Redo2` | none |
| `LayerEditorPanel.tsx:372` | `Eye`/`EyeOff` | none |
| `LayerEditorPanel.tsx:376` | `ArrowUp` | none |
| `LayerEditorPanel.tsx:385` | `ArrowDown` | none |
| `LayerEditorPanel.tsx:394` | `Trash2` | none |
| `ThumbnailEditor.tsx:186` | `Trash2` | none |
| `OpeningFramesPanel.tsx:213` | `Trash2` | none |
| `HistoryMenu.tsx:129` | `Trash2` | none |
| `InspirationGrid.tsx:94` | `Expand` | `title` only |

The four `Trash2` buttons are the sharpest problem: a screen reader announced
each as just "button", on a **destructive** action.

`InspirationGrid.tsx:94` is a partial case, `title="Expand thumbnail"` does
supply an accessible name as a last-resort fallback, but it is tooltip-dependent
and not announced consistently, so it gets an explicit `aria-label` too.

**Correction to the original audit note.** An earlier draft of this plan listed
`ColorPicker.tsx:353` as missing a label. It is not: line 354 already carries
`aria-label="Close color picker"`. No change was made there.

## Target

**A.** Add a documented z-scale to the `:root` block of `web/app/globals.css`,
below the motion tokens from plan 001:

```css
/* Z-index scale. Nothing between these steps.
   10 in-panel overlay, 50 popovers/menus/dialogs,
   90 fullscreen scrim, 100 fullscreen surface, 120 floating tool. */
--z-overlay: 10;
--z-popover: 50;
--z-scrim: 90;
--z-fullscreen: 100;
--z-floating: 120;
```

Then: `ColorPicker.tsx:334` `z-[9999]` becomes `z-[var(--z-floating)]`,
`GenerationCanvas.tsx:610` `z-[90]` becomes `z-[var(--z-scrim)]`,
`GenerationCanvas.tsx:617` `z-[100]` becomes `z-[var(--z-fullscreen)]`.
This also *fixes a real bug*: at 9999 the colour picker sat above everything;
at 120 it sits above the fullscreen surface (100) as intended but is no longer
unbounded.

**B.** Add `tabular-nums` to `StudioShell.tsx:156` step counter `<p>` and to the
count `<Badge>` class at line 225.

**C.** Add `text-balance` to the `<h2>` at `StudioShell.tsx:361` and
`text-pretty` to the `<p>` at line 371.

**D.** Add an `aria-label` to each of the ten buttons in the table. Where the
button acts on a named item, interpolate the name so the label distinguishes it
from its siblings, e.g. `` aria-label={`Delete layer ${layer.name}`} `` rather
than a bare `"Delete"`, since a layer list renders many identical buttons.

## Repo conventions to follow

- Token groups in `:root` carry a `/* Comment */` header explaining the scale.
  Exemplar: the `/* Border Radius */` group at `web/app/globals.css:96`, which
  documents its steps in the comment.
- `tabular-nums` exemplar already in the repo: `web/components/ui/progress.tsx:68`.

## Steps

1. Add the `--z-*` tokens to `:root` in `web/app/globals.css`.
2. Swap the three arbitrary z-index values to the tokens.
3. Add `tabular-nums` at the two `StudioShell.tsx` sites.
4. Add `text-balance` and `text-pretty` at the two `StudioShell.tsx` sites.
5. Add the `aria-label` in `ColorPicker.tsx`.

## Boundaries

- Do NOT sweep `z-50` in `ui/` primitives to tokens in this plan. They are
  already consistent with each other at the popover layer; churning six files
  for no behaviour change is out of scope.
- Do NOT change any font size, weight, or `tracking-*`. `baseline-ui` forbids
  touching letter-spacing unless asked.
- Do NOT add dependencies.

## Verification

- **Mechanical**: `cd web; bunx tsc --noEmit -p tsconfig.json` exits 0, and
  `rg "z-\[\d+\]" web/components` returns no matches.
- **Feel check**:
  - Open the colour picker while the fullscreen variant viewer is open and
    confirm the picker is still reachable and on top.
  - Step from 1 to 5 and confirm the "Step N of 5" text does not shift sideways
    as N changes.
  - Confirm panel headings wrap into balanced lines rather than leaving one
    orphan word.
  - Tab to the colour picker close button and confirm a screen reader announces
    a name rather than "button".
- **Done when**: no arbitrary `z-[n]` remains in `web/components`.
