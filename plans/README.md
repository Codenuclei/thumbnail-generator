# Animation and UI Baseline Plans

Produced by the `improve-animations` audit workflow, with a final pass from `baseline-ui`.
Recon facts these plans assume:

- **Stack**: Next.js 14.2.5, React 18, Tailwind v4, Base UI primitives (`@base-ui/react`), `tw-animate-css`, `sonner` toasts, `lucide-react` icons.
- **No JS animation library.** No `motion/react`, no GSAP. All motion is CSS plus `tw-animate-css` utilities.
- **No motion tokens existed** before plan 001: no `--ease-*`, no `--duration-*`.
- **Personality**: crisp product tool (a 5 step studio wizard), not a playful consumer app. Motion stays short and subtle.
- **Frequency map**: step nav and panel swaps are hit tens of times per session; buttons and hover constantly; dialogs and the generation reveal occasionally.

## Plans

| # | Title | Severity | Category | Status |
| --- | --- | --- | --- | --- |
| 001 | Add motion tokens (easing + duration scale) | HIGH | Cohesion & tokens | DONE |
| 002 | Add a global reduced-motion guard | HIGH | Accessibility | DONE |
| 003 | Scope the progress bar off `transition-all` | HIGH | Performance | DONE |
| 004 | Retime overlay entrances to the modal budget | HIGH | Easing & duration | DONE |
| 005 | Animate studio step panel changes | MEDIUM | Missed opportunity | DONE |
| 006 | Add press feedback to buttons | MEDIUM | Physicality & origin | DONE |
| 007 | Stagger the variant grid and blur-mask the result reveal | MEDIUM | Cohesion & tokens | DONE |
| 008 | baseline-ui pass: z-scale, tabular-nums, text-balance, aria-labels | LOW | baseline-ui | DONE |

## Execution order and dependencies

1. **001 first.** Every later plan references the `--ease-*` and `--duration-*` tokens it defines.
2. **002 second.** It establishes the reduced-motion guard that 005, 006, and 007 rely on rather than each re-implementing it.
3. 003, 004 are independent of each other and can run in any order after 001.
4. 005, 006, 007 depend on 001 and 002.
5. 008 is independent of all motion work and can run last.

## Not reported (verified as by-design or already correct)

- `web/components/ui/dialog.tsx:56` uses centre transform origin. Modals are exempt per the audit playbook; centred appearance is correct.
- `web/components/ui/tooltip.tsx:53` and `web/components/ui/select.tsx:86` already use `origin-(--transform-origin)`, so they scale from their trigger. Correct as written.
- `zoom-in-95` throughout is `scale(0.95)`, already clear of the never-`scale(0)` rule.
- `animate-spin` uses linear easing, which is correct for a spinner.
