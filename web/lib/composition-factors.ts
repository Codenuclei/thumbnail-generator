/** Classic photographic composition factors — case-aware, never force-applied. */

export type CompositionFactorId =
  | "rule-of-thirds"
  | "golden-spiral"
  | "diagonal"
  | "s-curve"
  | "l-shape"
  | "pyramid";

export type CompositionFactor = {
  id: CompositionFactorId;
  label: string;
  /** Framing instruction when this factor fits the scene */
  prompt: string;
  /** When this factor usually helps */
  whenToUse: string;
  /** When to skip it */
  whenToSkip: string;
};

export const COMPOSITION_FACTORS: CompositionFactor[] = [
  {
    id: "rule-of-thirds",
    label: "Rule of thirds",
    prompt:
      "Rule of thirds: place the hero subject and key accents on the 3×3 grid intersections — not dead center unless intentional.",
    whenToUse:
      "Single person/product with readable environment, interview stills, product-in-context, documentary portraits.",
    whenToSkip:
      "When the whole story is a centered face filling the frame, a symmetrical comparison, or a dense process diagram that needs center weight.",
  },
  {
    id: "golden-spiral",
    label: "Golden spiral",
    prompt:
      "Golden spiral (Fibonacci): lead the eye along a logarithmic curve into the focal subject at the spiral eye.",
    whenToUse:
      "Scenes with natural lead-ins (machinery arcs, roads, crowds flowing toward one person, reveal moments).",
    whenToSkip:
      "Flat graphic layouts, split comparisons, text-heavy data thumbs, or when the subject must sit dead-center for punch.",
  },
  {
    id: "diagonal",
    label: "Diagonal",
    prompt:
      "Diagonal composition: use a strong diagonal line (edge, road, machine, horizon tilt) from corner toward the opposite side for depth and energy.",
    whenToUse:
      "Factories, vehicles, action, conflict, before/after energy, anything with strong linear geometry.",
    whenToSkip:
      "Calm talking-head portraits, soft lifestyle product shots, or when diagonals would crop faces awkwardly.",
  },
  {
    id: "s-curve",
    label: "S-curve",
    prompt:
      "S-curve: guide the viewer with a winding path, river, conveyor, or body line that snakes through the frame.",
    whenToUse:
      "Process journeys, conveyors, roads, rivers, queues, body poses that already curve through space.",
    whenToSkip:
      "Tight close-ups, split panels, or scenes with no path-like element — never invent a fake S-curve prop.",
  },
  {
    id: "l-shape",
    label: "L-shape",
    prompt:
      "L-shape: anchor with a strong vertical on one side and a low horizontal base (horizon, table, floor) forming an L.",
    whenToUse:
      "Person beside machinery, product on a table/floor line, architecture interiors, shelf/room anchors.",
    whenToSkip:
      "Floating cutouts with no ground plane, centered hero fills, or busy scenes where an L would fight the subject.",
  },
  {
    id: "pyramid",
    label: "Pyramid",
    prompt:
      "Pyramid / triangular composition: stack visual weight into a stable triangle — peak at top center or slightly off-center for authority.",
    whenToUse:
      "Authority/leader shots, stacked products, group hierarchy, monumental subjects, title-over-base layouts.",
    whenToSkip:
      "Chaotic action, wide establishing scenes, or when a pyramid would force unnatural stacking.",
  },
];

export const COMPOSITION_FACTORS_PROMPT_BLOCK = [
  "COMPOSITION FACTORS (case-aware — pick ZERO or ONE that fits THIS scene; do not force framing rules that fight the subject):",
  ...COMPOSITION_FACTORS.map(
    (f) =>
      `- ${f.label}: ${f.prompt} USE WHEN: ${f.whenToUse} SKIP WHEN: ${f.whenToSkip}`
  ),
  "If none fit, use a clean strong thumbnail crop instead. Never apply all factors. Never invent props just to satisfy a factor.",
].join("\n");

/** Menu of user-selected factors with when/skip guidance — never a hard mandate. */
export function compositionFactorsPrompt(ids: string[]): string {
  const selected = COMPOSITION_FACTORS.filter((f) => ids.includes(f.id));
  if (!selected.length) return COMPOSITION_FACTORS_PROMPT_BLOCK;
  return [
    "COMPOSITION FACTOR MENU (case-aware — choose at most ONE if it fits THIS topic/scene; otherwise ignore):",
    ...selected.map(
      (f) =>
        `- ${f.label}: ${f.prompt} · USE WHEN: ${f.whenToUse} · SKIP WHEN: ${f.whenToSkip}`
    ),
    "Do NOT brainlessly force a factor. Prefer readability and story over textbook framing.",
  ].join("\n");
}

/**
 * Per-variant hint: prefer this factor only if the scene warrants it.
 * Other factors in the pool remain available; AI may pick none.
 */
export function compositionFactorVariantPrompt(
  preferredId: string | undefined,
  poolIds: string[]
): string {
  const pool = COMPOSITION_FACTORS.filter((f) => poolIds.includes(f.id));
  const preferred =
    COMPOSITION_FACTORS.find((f) => f.id === preferredId) || pool[0];

  const lines = [
    "FRAMING (intelligent — not mandatory):",
    "Decide framing from the topic, subject, and attached media. Apply a classic factor ONLY when it improves the hook visual for THIS case.",
  ];

  if (preferred) {
    lines.push(
      `Preferred candidate for THIS variant if it fits: ${preferred.label} — ${preferred.prompt}`,
      `Use it when: ${preferred.whenToUse}`,
      `Skip it when: ${preferred.whenToSkip}`
    );
  }

  if (pool.length > 1) {
    lines.push(
      "Other allowed factors (only if preferred does not fit):",
      ...pool
        .filter((f) => f.id !== preferred?.id)
        .map((f) => `- ${f.label}: USE WHEN ${f.whenToUse}; SKIP WHEN ${f.whenToSkip}`)
    );
  }

  lines.push(
    "If no factor fits, use a simple strong crop (large subject, clear negative space for type). Never invent fake lead lines or props to satisfy a factor."
  );

  return lines.join("\n");
}
