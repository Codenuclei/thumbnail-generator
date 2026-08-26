/**
 * Per-variant story beats. Camera / type / palette rotation is not enough —
 * siblings collapse into the same presenter-holds-object pose unless each
 * option gets a mandatory, mutually exclusive staging recipe.
 */

export type StagingRecipe = {
  id: string;
  label: string;
  prompt: string;
};

export const STAGING_RECIPES: StagingRecipe[] = [
  {
    id: "object-hero",
    label: "Object hero",
    prompt: [
      "THIS VARIANT STAGING (mandatory): OBJECT HERO.",
      "Story beat: the topic's main object fills most of the 16:9 frame. Extreme close crop. A person is optional and only as cropped hands, a bite, or a shoulder — never a full standing portrait presenting the object.",
      "Action: hands finishing, sliding, stacking, pouring, or revealing the object. Not posing with it.",
      "Scale: object is huge; place is a thin sliver of real background.",
      "BAN for this variant: standing presenter holding a platter/board toward camera; matching kitchen-portrait from siblings.",
    ].join(" "),
  },
  {
    id: "mid-action",
    label: "Mid-action",
    prompt: [
      "THIS VARIANT STAGING (mandatory): MID-ACTION.",
      "Story beat: a person frozen at the peak of a topic-relevant action — mid-bite, mid-taste, mid-pour, mid-compare, mid-fix, mid-lift, shocked reaction.",
      "Action: body and hands are doing the work now. Face reads a real emotion (surprise, delight, strain), never a stock smile.",
      "Scale: chest-up or three-quarter. Object is in use, not displayed on a board.",
      "BAN for this variant: static hold-the-product presentation; identical chef-and-platter pose.",
    ].join(" "),
  },
  {
    id: "place-scale",
    label: "Place + scale",
    prompt: [
      "THIS VARIANT STAGING (mandatory): PLACE + SCALE.",
      "Story beat: environment-first. Show WHERE this topic lives (line, stall, floor, studio, street, shop, gym). The place must be readable at phone size.",
      "Action: process continuing in the space — people working, a queue, a station — the hero is inside the place, not isolated on a studio plate.",
      "Scale: wider than siblings. Subject is smaller; architecture and depth do the click.",
      "BAN for this variant: tight studio plate of one object with a smiling presenter.",
    ].join(" "),
  },
  {
    id: "reveal-clash",
    label: "Reveal / clash",
    prompt: [
      "THIS VARIANT STAGING (mandatory): REVEAL / CLASH.",
      "Story beat: one continuous photograph of contrast happening now — a lid coming off, a bite gap, two sizes side-by-side in the SAME scene, a messy vs clean pile, a before-object next to an after-object. NOT a split-panel collage.",
      "Action: the reveal or comparison is mid-motion.",
      "Scale: medium, decisive moment, one camera.",
      "BAN for this variant: single centered product on a wooden board with a presenter.",
    ].join(" "),
  },
  {
    id: "pov-hands",
    label: "POV hands",
    prompt: [
      "THIS VARIANT STAGING (mandatory): POV / HANDS.",
      "Story beat: first-person or over-shoulder. Viewer is doing the topic. Hands and the object dominate; face is absent or only a sliver.",
      "Action: gripping, assembling, seasoning, typing, cutting, holding the result toward the lens from the maker's view.",
      "Scale: tight desk/counter/tool POV. Different height than standing portraits.",
      "BAN for this variant: third-person smiling portrait with the object on a board.",
    ].join(" "),
  },
  {
    id: "low-punch",
    label: "Low-angle punch",
    prompt: [
      "THIS VARIANT STAGING (mandatory): LOW-ANGLE PUNCH.",
      "Story beat: camera at table/hip/floor height looking up so the subject or object feels monumental.",
      "Action: a strong upward gesture or looming object — not a level eye-height studio pose.",
      "Scale: hero towers; ceiling or sky reads. Different camera height than every sibling.",
      "BAN for this variant: eye-level presenter shot; flat product plate.",
    ].join(" "),
  },
];

export function stagingRecipeForIndex(index: number): StagingRecipe {
  return STAGING_RECIPES[index % STAGING_RECIPES.length];
}

export function siblingStagingLock(index: number, variantCount: number): string {
  const mine = stagingRecipeForIndex(index);
  const siblings = Array.from({ length: Math.max(1, variantCount) }, (_, i) =>
    stagingRecipeForIndex(i)
  )
    .filter((_, i) => i !== index)
    .map((r) => r.label);
  const unique = [...new Set(siblings)];
  return [
    `VARIANT SLOT: ${index + 1} of ${Math.max(1, variantCount)}. Your exclusive recipe is "${mine.label}".`,
    unique.length
      ? `Sibling recipes you MUST NOT reuse (different action, crop scale, and place): ${unique.join("; ")}.`
      : "",
    "If this frame could be mistaken for a sibling at ~120px wide — same pose, same object-on-board staging, same camera height — it fails.",
  ]
    .filter(Boolean)
    .join(" ");
}
