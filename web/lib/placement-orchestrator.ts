/**
 * Placement orchestrator — Gemini proposes where the hook should live;
 * this module is master control: validate, clamp to safe margins, then
 * hand a resolved box to the Sharp/opentype compositor.
 *
 * Gemini never paints glyphs — placement intelligence only.
 */

import { runtimeEnv } from "@/lib/runtime-env";
import {
  compositeHookTextDetailed,
  type CompositeResult,
} from "@/lib/font-composite";
import {
  DEFAULT_TRACKING_EM,
  PLACEMENT_ZONES,
  type PlacementZoneId,
} from "@/lib/font-engine";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const PLACE_MODEL = "gemini-2.5-flash";
const PLACE_TIMEOUT_MS = 12_000;
const SAFE_MARGIN = 0.05;

export type PlacementAlign = "start" | "end";

/** Raw intent from Gemini (or fallback). Coordinates are normalized 0–1. */
export type PlacementProposal = {
  zoneId?: PlacementZoneId;
  /** Normalized x of the text block origin (left edge if start, right edge if end). */
  x?: number;
  /** Normalized y of the top of the text block. */
  y?: number;
  align?: PlacementAlign;
  preferredLines?: 1 | 2;
  subjectSide?: "left" | "right" | "center" | "none";
  source: "gemini" | "fallback";
  reason?: string;
};

/** Master-control output — always safe to draw inside. */
export type ResolvedPlacement = {
  zoneId: PlacementZoneId | "custom";
  /** Fractions of canvas — compositor clamps again to pixel safe area. */
  box: { x: number; y: number; w: number; h: number; align: PlacementAlign };
  preferredLines?: 1 | 2;
  proposal: PlacementProposal;
  adjusted: boolean;
  detail: string;
};

const ZONE_IDS = new Set(PLACEMENT_ZONES.map((z) => z.id));

/** Default fractional boxes per named zone (mirrors compositor). */
const ZONE_BOXES: Record<
  string,
  { x: number; y: number; w: number; h: number; align: PlacementAlign }
> = {
  "lower-left": { x: 0.05, y: 0.58, w: 0.52, h: 0.34, align: "start" },
  "lower-right": { x: 0.43, y: 0.56, w: 0.52, h: 0.3, align: "end" },
  "upper-left": { x: 0.05, y: 0.07, w: 0.52, h: 0.3, align: "start" },
  "upper-right": { x: 0.43, y: 0.07, w: 0.52, h: 0.3, align: "end" },
  "mid-band": { x: 0.06, y: 0.38, w: 0.88, h: 0.26, align: "start" },
  "opposite-face": { x: 0.05, y: 0.58, w: 0.52, h: 0.34, align: "start" },
};

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    zoneId: {
      type: "STRING",
      enum: [
        "lower-left",
        "lower-right",
        "upper-left",
        "upper-right",
        "mid-band",
        "opposite-face",
      ],
      description: "Named placement zone for the hook",
    },
    x: {
      type: "NUMBER",
      description: "Normalized 0–1 text origin x (left if align=start, right if end)",
    },
    y: {
      type: "NUMBER",
      description: "Normalized 0–1 top of the text block",
    },
    align: {
      type: "STRING",
      enum: ["start", "end"],
      description: "start = left-anchored, end = right-anchored",
    },
    preferredLines: {
      type: "INTEGER",
      description: "1 or 2 lines for the hook",
    },
    subjectSide: {
      type: "STRING",
      enum: ["left", "right", "center", "none"],
      description: "Where the face/product sits so type goes opposite",
    },
    reason: {
      type: "STRING",
      description: "Brief why this placement is best",
    },
  },
  required: ["zoneId", "align", "subjectSide", "reason"],
} as const;

function clamp01(n: number, lo = 0, hi = 1): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function isZoneId(value: unknown): value is PlacementZoneId {
  return typeof value === "string" && ZONE_IDS.has(value as PlacementZoneId);
}

/**
 * Ask Gemini vision where the hook should sit on this TEXTLESS plate.
 * Returns null on any failure — caller falls back to busyness zone picker.
 */
export async function proposePlacementFromGemini(options: {
  image: Buffer;
  hook: string;
  topic?: string;
  mimeType?: string;
}): Promise<PlacementProposal | null> {
  const apiKey = runtimeEnv("GEMINI_API_KEY") || runtimeEnv("GOOGLE_API_KEY");
  if (!apiKey) return null;

  const hook = options.hook.replace(/\s+/g, " ").trim().toUpperCase();
  if (!hook) return null;

  const prompt = [
    "You are a YouTube thumbnail art director.",
    "This image is a TEXTLESS plate — no letters will be painted by you.",
    `Hook that will be composited later (exact spelling, ALL CAPS): "${hook}"`,
    options.topic ? `Topic context: ${options.topic}` : "",
    "Propose the best placement for that hook so it is phone-readable and never covers a face, eyes, mouth, or primary product silhouette.",
    "Prefer calm negative space opposite the subject. Keep ≥5% margin from every edge.",
    "Prefer 1 line; use 2 lines only if the hook is long.",
    "Return JSON only with zoneId, optional x/y (0–1 origin of the text block), align (start=left-anchored, end=right-anchored), preferredLines, subjectSide, reason.",
    "Do NOT suggest painting, outlining, stroking, plating, or shadowing the text.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch(`${GEMINI_API_BASE}/${PLACE_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: options.mimeType || "image/png",
                  data: options.image.toString("base64"),
                },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 400,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(PLACE_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.warn(
        `Placement proposal skipped — HTTP ${res.status}: ${errBody.slice(0, 240)}`
      );
      return null;
    }

    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text =
      json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    const parsed = JSON.parse(
      text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
    ) as {
      zoneId?: string;
      x?: number;
      y?: number;
      align?: string;
      preferredLines?: number;
      subjectSide?: string;
      reason?: string;
    };

    if (!isZoneId(parsed.zoneId) && (parsed.x == null || parsed.y == null)) {
      return null;
    }

    const align: PlacementAlign =
      parsed.align === "end" ? "end" : parsed.align === "start" ? "start" : "start";

    const proposal: PlacementProposal = {
      zoneId: isZoneId(parsed.zoneId) ? parsed.zoneId : undefined,
      x: typeof parsed.x === "number" ? clamp01(parsed.x) : undefined,
      y: typeof parsed.y === "number" ? clamp01(parsed.y) : undefined,
      align,
      preferredLines:
        parsed.preferredLines === 2 ? 2 : parsed.preferredLines === 1 ? 1 : undefined,
      subjectSide:
        parsed.subjectSide === "left" ||
        parsed.subjectSide === "right" ||
        parsed.subjectSide === "center" ||
        parsed.subjectSide === "none"
          ? parsed.subjectSide
          : undefined,
      source: "gemini",
      reason: String(parsed.reason || "").slice(0, 200),
    };

    // opposite-face without coords → map subject side to a concrete zone
    if (proposal.zoneId === "opposite-face" && proposal.x == null) {
      if (proposal.subjectSide === "left") {
        proposal.zoneId = "lower-right";
        proposal.align = "end";
      } else if (proposal.subjectSide === "right") {
        proposal.zoneId = "lower-left";
        proposal.align = "start";
      } else {
        proposal.zoneId = "lower-left";
      }
    }

    return proposal;
  } catch (err) {
    console.warn(
      "Placement proposal failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Master control: turn a (possibly invalid) Gemini proposal into a clamped
 * fractional draw box. Never lets text sit inside the 5% edge margin.
 */
export function resolvePlacement(
  proposal: PlacementProposal | null,
  fallbackZoneId?: PlacementZoneId
): ResolvedPlacement {
  const fallbackId =
    fallbackZoneId && ZONE_BOXES[fallbackZoneId] ? fallbackZoneId : "lower-left";
  const fallbackBox = ZONE_BOXES[fallbackId];

  if (!proposal || proposal.source === "fallback") {
    const fb: PlacementProposal = proposal ?? {
      zoneId: fallbackId,
      align: fallbackBox.align,
      source: "fallback",
      reason: "no gemini proposal",
    };
    return {
      zoneId: fallbackId,
      box: { ...fallbackBox },
      preferredLines: fb.preferredLines,
      proposal: { ...fb, source: "fallback", zoneId: fallbackId },
      adjusted: false,
      detail: `fallback zone=${fallbackId}`,
    };
  }

  let adjusted = false;
  let zoneId: PlacementZoneId | "custom" = proposal.zoneId || "custom";
  let align: PlacementAlign =
    proposal.align ||
    (proposal.zoneId && ZONE_BOXES[proposal.zoneId]?.align) ||
    "start";

  let box: { x: number; y: number; w: number; h: number; align: PlacementAlign };

  if (
    typeof proposal.x === "number" &&
    typeof proposal.y === "number" &&
    Number.isFinite(proposal.x) &&
    Number.isFinite(proposal.y)
  ) {
    // Build a box from the proposed origin, spanning toward the opposite side.
    const originX = clamp01(proposal.x, SAFE_MARGIN, 1 - SAFE_MARGIN);
    const originY = clamp01(proposal.y, SAFE_MARGIN, 1 - SAFE_MARGIN);
    if (originX !== proposal.x || originY !== proposal.y) adjusted = true;

    const maxW = 1 - SAFE_MARGIN * 2;
    const preferW = Math.min(0.55, maxW);
    let x: number;
    let w: number;
    if (align === "end") {
      // origin is the right edge of the text block
      const right = originX;
      const left = Math.max(SAFE_MARGIN, right - preferW);
      x = left;
      w = right - left;
      if (w < 0.3) {
        w = Math.min(preferW, maxW);
        x = Math.max(SAFE_MARGIN, right - w);
        adjusted = true;
      }
    } else {
      x = originX;
      w = Math.min(preferW, 1 - SAFE_MARGIN - x);
      if (w < 0.3) {
        w = Math.min(preferW, maxW);
        x = Math.max(SAFE_MARGIN, 1 - SAFE_MARGIN - w);
        adjusted = true;
      }
    }

    const preferH = proposal.preferredLines === 2 ? 0.28 : 0.22;
    let y = originY;
    let h = Math.min(preferH, 1 - SAFE_MARGIN - y);
    if (h < 0.12) {
      h = Math.min(preferH, 1 - SAFE_MARGIN * 2);
      y = Math.max(SAFE_MARGIN, 1 - SAFE_MARGIN - h);
      adjusted = true;
    }

    box = { x, y, w, h, align };
    zoneId = proposal.zoneId && ZONE_BOXES[proposal.zoneId] ? proposal.zoneId : "custom";
  } else if (proposal.zoneId && ZONE_BOXES[proposal.zoneId]) {
    const z = ZONE_BOXES[proposal.zoneId];
    box = { ...z, align: proposal.align || z.align };
    zoneId = proposal.zoneId;
    align = box.align;
  } else {
    box = { ...fallbackBox };
    zoneId = fallbackId;
    align = fallbackBox.align;
    adjusted = true;
  }

  // Prefer the opposite side of the subject when Gemini names a conflicting zone.
  if (proposal.subjectSide === "left" || proposal.subjectSide === "right") {
    const wantsRight = proposal.subjectSide === "left";
    const zoneIsRight =
      typeof zoneId === "string" &&
      (zoneId.includes("right") ||
        (zoneId === "custom" && box.align === "end") ||
        (zoneId === "custom" && box.x > 0.4));
    const zoneIsLeft =
      typeof zoneId === "string" &&
      (zoneId.includes("left") ||
        (zoneId === "custom" && box.align === "start" && box.x < 0.4));
    if ((wantsRight && zoneIsLeft) || (!wantsRight && zoneIsRight)) {
      const safer = wantsRight
        ? ZONE_BOXES["upper-right"] || ZONE_BOXES["lower-right"]
        : ZONE_BOXES["upper-left"] || ZONE_BOXES["lower-left"];
      box = { ...safer };
      zoneId = wantsRight ? "upper-right" : "upper-left";
      align = box.align;
      adjusted = true;
    }
  }

  // Final clamp of the whole box into the safe frame.
  const clamped = clampBox(box);
  if (
    clamped.x !== box.x ||
    clamped.y !== box.y ||
    clamped.w !== box.w ||
    clamped.h !== box.h
  ) {
    adjusted = true;
  }
  clamped.align = align;

  const detail = [
    `gemini zone=${proposal.zoneId || "—"}`,
    proposal.x != null && proposal.y != null
      ? `xy=(${proposal.x.toFixed(2)},${proposal.y.toFixed(2)})`
      : "xy=—",
    `align=${proposal.align || "—"}`,
    proposal.subjectSide ? `subject=${proposal.subjectSide}` : null,
    proposal.reason ? `reason="${proposal.reason}"` : null,
    `→ final zone=${zoneId} box=(${clamped.x.toFixed(2)},${clamped.y.toFixed(2)},${clamped.w.toFixed(2)},${clamped.h.toFixed(2)}) align=${clamped.align}`,
    adjusted ? "ADJUSTED" : "as-proposed",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    zoneId,
    box: clamped,
    preferredLines: proposal.preferredLines,
    proposal,
    adjusted,
    detail,
  };
}

function clampBox(box: {
  x: number;
  y: number;
  w: number;
  h: number;
  align: PlacementAlign;
}): { x: number; y: number; w: number; h: number; align: PlacementAlign } {
  const maxRight = 1 - SAFE_MARGIN;
  const maxBottom = 1 - SAFE_MARGIN;
  let x = clamp01(box.x, SAFE_MARGIN, maxRight);
  let y = clamp01(box.y, SAFE_MARGIN, maxBottom);
  let w = Math.max(0.28, Math.min(box.w, maxRight - x));
  let h = Math.max(0.12, Math.min(box.h, maxBottom - y));
  if (x + w > maxRight) {
    w = maxRight - x;
    if (w < 0.28) {
      w = 0.28;
      x = maxRight - w;
    }
  }
  if (y + h > maxBottom) {
    h = maxBottom - y;
    if (h < 0.12) {
      h = 0.12;
      y = maxBottom - h;
    }
  }
  return { x, y, w, h, align: box.align };
}

export type OrchestrateOptions = {
  hook: string;
  /** Used when Gemini proposal is missing/invalid. */
  fallbackZoneId?: PlacementZoneId;
  topic?: string;
  trackingEm?: number;
  /** Skip the Gemini call (tests / offline). */
  skipGemini?: boolean;
  /** Inject a proposal (tests). */
  proposal?: PlacementProposal | null;
};

/**
 * Full path: Gemini placement intent → master clamp → Sharp/opentype composite.
 */
export async function orchestrateHookComposite(
  image: Buffer,
  options: OrchestrateOptions
): Promise<CompositeResult & { placement: ResolvedPlacement }> {
  const hook = options.hook.replace(/\s+/g, " ").trim();

  let proposal: PlacementProposal | null =
    options.proposal !== undefined
      ? options.proposal
      : options.skipGemini
        ? null
        : await proposePlacementFromGemini({
            image,
            hook,
            topic: options.topic,
          });

  if (!proposal) {
    proposal = {
      zoneId: options.fallbackZoneId || "lower-left",
      source: "fallback",
      reason: "gemini placement unavailable",
    };
  }

  console.log(
    `Placement Gemini proposal: source=${proposal.source} zone=${proposal.zoneId || "—"} ` +
      `xy=${proposal.x != null && proposal.y != null ? `(${proposal.x},${proposal.y})` : "—"} ` +
      `align=${proposal.align || "—"} subject=${proposal.subjectSide || "—"} ` +
      `${proposal.reason ? `"${proposal.reason}"` : ""}`
  );

  const resolved = resolvePlacement(proposal, options.fallbackZoneId);
  console.log(`Placement adjusted final: ${resolved.detail}`);

  const composited = await compositeHookTextDetailed(image, {
    hook,
    zoneId:
      resolved.zoneId !== "custom" && isZoneId(resolved.zoneId)
        ? resolved.zoneId
        : options.fallbackZoneId,
    placementBox: resolved.box,
    preferredLines: resolved.preferredLines,
    trackingEm: options.trackingEm ?? DEFAULT_TRACKING_EM,
    // When Gemini proposed a concrete box, skip busyness re-pick so we honour intent
    // (master control already clamped). Busyness still runs for pure fallbacks.
    honorPlacementBox: proposal.source === "gemini" && Boolean(resolved.box),
  });

  const detail = `orch: ${resolved.detail} | composite: ${composited.detail}`;
  console.log(
    composited.applied
      ? `Placement composite applied: ${detail}`
      : `Placement composite SKIPPED (${composited.detail})`
  );

  return {
    ...composited,
    detail,
    placement: resolved,
  };
}
