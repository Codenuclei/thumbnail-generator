/** Classic photographic composition factors for thumbnail / hook framing. */

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
  /** Short prompt line injected when selected */
  prompt: string;
};

export const COMPOSITION_FACTORS: CompositionFactor[] = [
  {
    id: "rule-of-thirds",
    label: "Rule of thirds",
    prompt:
      "Rule of thirds: place the hero subject and key accents on the 3×3 grid intersections — not dead center unless intentional.",
  },
  {
    id: "golden-spiral",
    label: "Golden spiral",
    prompt:
      "Golden spiral (Fibonacci): lead the eye along a logarithmic curve into the focal subject at the spiral eye.",
  },
  {
    id: "diagonal",
    label: "Diagonal",
    prompt:
      "Diagonal composition: use a strong diagonal line (edge, road, machine, horizon tilt) from corner toward the opposite side for depth and energy.",
  },
  {
    id: "s-curve",
    label: "S-curve",
    prompt:
      "S-curve: guide the viewer with a winding path, river, conveyor, or body line that snakes through the frame.",
  },
  {
    id: "l-shape",
    label: "L-shape",
    prompt:
      "L-shape: anchor with a strong vertical on one side and a low horizontal base (horizon, table, floor) forming an L.",
  },
  {
    id: "pyramid",
    label: "Pyramid",
    prompt:
      "Pyramid / triangular composition: stack visual weight into a stable triangle — peak at top center or slightly off-center for authority.",
  },
];

export const COMPOSITION_FACTORS_PROMPT_BLOCK = [
  "COMPOSITION FACTORS (apply when framing the hook visual — the first-look still):",
  ...COMPOSITION_FACTORS.map((f) => `- ${f.label}: ${f.prompt}`),
  "Pick the factor(s) that best match the scene; do not force all six at once.",
].join("\n");

export function compositionFactorsPrompt(ids: string[]): string {
  const selected = COMPOSITION_FACTORS.filter((f) => ids.includes(f.id));
  if (!selected.length) return COMPOSITION_FACTORS_PROMPT_BLOCK;
  return [
    "ACTIVE COMPOSITION FACTORS for this thumbnail hook:",
    ...selected.map((f) => `- ${f.label}: ${f.prompt}`),
  ].join("\n");
}
