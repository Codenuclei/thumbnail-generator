export type ColorPaletteOption = {
  id: string;
  name: string;
  colors: string[];
  rationale: string;
  sourceVideoIds: string[];
};

export type StyleBriefLite = {
  summary: string;
  colorPalette: string[];
  typography: string;
  composition: string;
  emotionalHook: string;
  textPatterns: string[];
  creativeDirection: string;
  doList: string[];
  avoidList: string[];
  suggestedHook?: string;
};

export function applyPaletteToBrief(
  brief: StyleBriefLite | null | undefined,
  palette: ColorPaletteOption | null | undefined
): StyleBriefLite | undefined {
  if (!brief && !palette) return undefined;
  if (!palette) return brief || undefined;
  return {
    ...(brief || {
      summary: palette.rationale,
      colorPalette: palette.colors,
      typography: "Bold ALL-CAPS sans-serif",
      composition: "Hero with clean text space",
      emotionalHook: "Optimistic, authoritative, premium",
      textPatterns: [],
      creativeDirection: palette.rationale,
      doList: [],
      avoidList: [],
    }),
    colorPalette: palette.colors,
    summary: brief?.summary || palette.rationale,
  };
}
