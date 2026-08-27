/** Rotating camera looks — varied lenses/angles without warm yellow color casts. */
export const CAMERA_FILTERS = [
  {
    id: "daylight-35",
    label: "Neutral daylight 35mm",
    prompt:
      "Camera: Canon EOS R5, 35mm f/2, eye-level medium. Neutral daylight (~5600K) — clean whites, accurate skin, soft contrast, mild grain. Even window/skylight, shallow DOF. Distinct from wide flash and tight 50mm siblings. NO warm amber/yellow cast, NO golden-hour orange wash, NO tungsten glow.",
  },
  {
    id: "flash-reportage",
    label: "Clean flash reportage",
    prompt:
      "Camera: 28mm reportage, WIDE and closer to the action than a 35mm portrait. Direct on-camera flash, high contrast blacks, slight motion on secondary action. Flash is white/neutral — not yellow. No color cast, no orange rim light.",
  },
  {
    id: "cool-factory",
    label: "Cool industrial",
    prompt:
      "Camera: Fujifilm X-T5, 50mm f/1.8, TIGHTER crop than the 35mm sibling. Cool-neutral industrial light (daylight LEDs / overcast windows). Crisp edges, soft background. Prefer blue-gray or white practicals — NEVER amber factory sodium glow or yellow haze.",
  },
  {
    id: "studio-clean",
    label: "Clean studio plate",
    prompt:
      "Camera: Sony A7IV, 40mm still-life height (table/counter), not a standing portrait lens. Softbox / overhead daylight LED — even exposure, accurate neutrals, slight grain. No halation, no lens flare blobs, no warm practical spill.",
  },
  {
    id: "hard-daylight",
    label: "Hard daylight",
    prompt:
      "Camera: Nikon Z6 II, 24mm WIDE, slightly high or low — not eye-level medium. Hard midday or open-shade daylight — saturated but photographic color, crisp edges. White balance locked neutral. No sunset/golden gel, no yellow fog.",
  },
  {
    id: "overcast-muted",
    label: "Overcast muted",
    prompt:
      "Camera: 45mm, flat overcast sky, muted but color-accurate palette, soft contrast, documentary candid framing. Cool-neutral grade — not sepia, not amber.",
  },
  {
    id: "cleanroom-white",
    label: "Cleanroom white",
    prompt:
      "Camera: 85mm TIGHT, eye-level. Bright fluorescent/LED cleanroom or warehouse — whites stay white, metals stay silver/steel. Zero yellow sodium vapor look, zero orange fill.",
  },
  {
    id: "doc-handheld",
    label: "Doc handheld",
    prompt:
      "Camera: handheld documentary, 35mm, LOW angle (hip/table). Natural location light corrected to neutral WB. Real grit OK; ban amber glows, lens flares, and cinematic orange-teal grading.",
  },
] as const;

export type CameraFilter = (typeof CAMERA_FILTERS)[number];

export function cameraFilterForIndex(index: number): CameraFilter {
  return CAMERA_FILTERS[index % CAMERA_FILTERS.length];
}
