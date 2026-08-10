/** One creative direction / thumbnail version with its own brief. */
export type CreativeDirection = {
  id: string;
  name: string;
  /** Per-version creative brief (used as userBrief for generate). */
  brief: string;
  /** Optional thumbnail text override; empty falls back to global hook. */
  hook?: string;
  /** How many variants to generate for this direction (1–4). */
  variantCount: number;
};

export function createDirection(
  index = 1,
  seed?: Partial<CreativeDirection>
): CreativeDirection {
  return {
    id: seed?.id || `dir-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: seed?.name || `Direction ${index}`,
    brief: seed?.brief || "",
    hook: seed?.hook || "",
    variantCount: Math.min(4, Math.max(1, seed?.variantCount ?? 2)),
  };
}

export function defaultDirections(): CreativeDirection[] {
  return [createDirection(1)];
}
