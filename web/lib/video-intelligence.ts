import "server-only";

import {
  buildPalettesFromSwatches,
  extractDominantColors,
  type ExtractedSwatch,
} from "@/lib/extract-colors";
import type { ColorPaletteOption } from "@/lib/palette-types";
import type { StyleBrief } from "@/lib/style-intelligence";
import { runtimeEnv } from "@/lib/runtime-env";
import type {
  HookCandidate,
  MediaImageInput,
  VideoColorStrategy,
  VideoIntelligenceResult,
  YouTubeVideoContext,
} from "@/lib/video-intelligence-types";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const ANALYSIS_MODEL = "gemini-2.5-flash";
const MAX_IMAGES = 8;
const MAX_SCRIPT_CHARS = 60_000;
const ANALYSIS_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    recommendedTopic: { type: "STRING" },
    summary: { type: "STRING" },
    audience: { type: "STRING" },
    primarySubject: { type: "STRING" },
    entities: { type: "ARRAY", items: { type: "STRING" } },
    storyBeats: { type: "ARRAY", items: { type: "STRING" } },
    sceneTypes: { type: "ARRAY", items: { type: "STRING" } },
    emotionalTone: { type: "STRING" },
    relatedContexts: { type: "ARRAY", items: { type: "STRING" } },
    depth: {
      type: "OBJECT",
      properties: {
        foreground: { type: "STRING" },
        midground: { type: "STRING" },
        background: { type: "STRING" },
        focalSubject: { type: "STRING" },
        depthCues: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["foreground", "midground", "background", "focalSubject", "depthCues"],
    },
    thumbnailOpportunities: { type: "ARRAY", items: { type: "STRING" } },
    hooks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          text: { type: "STRING" },
          rationale: { type: "STRING" },
          clarity: { type: "INTEGER" },
          curiosity: { type: "INTEGER" },
          fidelity: { type: "INTEGER" },
        },
        required: ["text", "rationale", "clarity", "curiosity", "fidelity"],
      },
    },
    typography: { type: "STRING" },
    composition: { type: "STRING" },
    creativeDirection: { type: "STRING" },
    doList: { type: "ARRAY", items: { type: "STRING" } },
    avoidList: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: [
    "recommendedTopic",
    "summary",
    "audience",
    "primarySubject",
    "entities",
    "storyBeats",
    "sceneTypes",
    "emotionalTone",
    "relatedContexts",
    "depth",
    "thumbnailOpportunities",
    "hooks",
    "typography",
    "composition",
    "creativeDirection",
    "doList",
    "avoidList",
  ],
} as const;

type AnalysisInput = {
  topic?: string;
  script: string;
  scriptSource: VideoIntelligenceResult["scriptSource"];
  images: MediaImageInput[];
  youtube?: YouTubeVideoContext;
};

type GeminiAnalysis = Partial<
  Pick<
    VideoIntelligenceResult,
    | "recommendedTopic"
    | "summary"
    | "audience"
    | "primarySubject"
    | "entities"
    | "storyBeats"
    | "sceneTypes"
    | "emotionalTone"
    | "relatedContexts"
    | "depth"
    | "thumbnailOpportunities"
    | "hooks"
  >
> & {
  typography?: string;
  composition?: string;
  creativeDirection?: string;
  doList?: string[];
  avoidList?: string[];
};

function cleanBase64(value: string): string {
  return value.replace(/^data:[^;]+;base64,/, "").trim();
}

function normalizeHex(value: string): string {
  const hex = value.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(hex) ? hex : "";
}

function hexLuminance(hex: string): number {
  const clean = normalizeHex(hex);
  if (!clean) return 0;
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(clean.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function mergeSwatches(swatches: ExtractedSwatch[]): ExtractedSwatch[] {
  const merged = new Map<string, ExtractedSwatch>();
  for (const swatch of swatches) {
    const key = swatch.hex.slice(0, 5);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...swatch });
      continue;
    }
    const total = existing.count + swatch.count;
    merged.set(key, {
      hex: existing.count >= swatch.count ? existing.hex : swatch.hex,
      r: (existing.r * existing.count + swatch.r * swatch.count) / total,
      g: (existing.g * existing.count + swatch.g * swatch.count) / total,
      b: (existing.b * existing.count + swatch.b * swatch.count) / total,
      count: total,
    });
  }
  return [...merged.values()].sort((a, b) => b.count - a.count).slice(0, 18);
}

async function measuredColors(
  images: MediaImageInput[]
): Promise<{ swatches: ExtractedSwatch[]; palettes: ColorPaletteOption[] }> {
  const pooled: ExtractedSwatch[] = [];
  for (const image of images.slice(0, MAX_IMAGES)) {
    try {
      const buffer = Buffer.from(cleanBase64(image.data), "base64");
      if (buffer.length < 500) continue;
      pooled.push(...(await extractDominantColors(buffer, 8)));
    } catch (err) {
      console.error("media color extraction failed:", image.name, err);
    }
  }

  const swatches = mergeSwatches(pooled);
  const built = buildPalettesFromSwatches(
    swatches,
    `${Math.max(1, images.length)} supplied media source${images.length === 1 ? "" : "s"}`
  );
  const palettes: ColorPaletteOption[] = built.map((palette, index) => ({
    ...palette,
    id: `media-${palette.id.replace(/^extracted-/, "")}-${index + 1}`,
    name:
      index === 0
        ? "Video dominant"
        : palette.name.replace("From thumbs", "From media"),
    rationale: palette.rationale
      .replace(/liked thumbnails?/gi, "supplied media")
      .replace(/thumbs?/gi, "media"),
    sourceVideoIds: [],
  }));
  return { swatches, palettes };
}

function colorStrategyFromSwatches(swatches: ExtractedSwatch[]): VideoColorStrategy {
  const colors = swatches.map((swatch) => swatch.hex).filter(Boolean).slice(0, 8);
  if (!colors.length) {
    return {
      source: "fallback",
      dominant: ["#171618", "#F7F7F7", "#38296C", "#6C4800"],
      background: "#171618",
      accents: ["#918DF6", "#FFB84D"],
      text: "#FFFFFF",
      rationale: "Neutral fallback because no readable image pixels were supplied.",
    };
  }

  const byLuminance = [...colors].sort((a, b) => hexLuminance(a) - hexLuminance(b));
  const background = byLuminance[0];
  const text = hexLuminance(background) < 0.35 ? "#FFFFFF" : "#111111";
  const accents = colors.filter((color) => color !== background).slice(0, 3);
  return {
    source: "measured",
    dominant: colors,
    background,
    accents,
    text,
    rationale:
      "Measured from supplied photos, sampled local-video frames, and the public YouTube thumbnail when available.",
  };
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 10);
}

function score(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(10, Math.round(parsed)));
}

function fallbackHookBase(input: AnalysisInput): string {
  const source =
    input.topic || input.youtube?.title || input.script.split(/\s+/).slice(0, 6).join(" ");
  const words = source
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
  return (words.join(" ") || "THE REAL STORY").toUpperCase();
}

function fallbackHooks(input: AnalysisInput): HookCandidate[] {
  const base = fallbackHookBase(input);
  const candidates = [base, "INSIDE THE PROCESS", "WHAT REALLY HAPPENS", "THE HIDDEN DETAIL"];
  return [...new Set(candidates)]
    .slice(0, 4)
    .map((text, index) => ({
      text: text.slice(0, 42),
      rationale:
        index === 0
          ? "Directly names the supplied topic."
          : "Fallback curiosity framing; verify against the script before publishing.",
      clarity: index === 0 ? 8 : 7,
      curiosity: index === 0 ? 6 : 8,
      fidelity: index === 0 ? 8 : 5,
    }));
}

function normalizeHooks(value: unknown, input: AnalysisInput): HookCandidate[] {
  if (!Array.isArray(value)) return fallbackHooks(input);
  const hooks = value
    .map((item): HookCandidate | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const text = stringValue(record.text, "")
        .replace(/\s+/g, " ")
        .toUpperCase()
        .slice(0, 42);
      if (!text) return null;
      return {
        text,
        rationale: stringValue(record.rationale, "Grounded in the supplied content."),
        clarity: score(record.clarity, 7),
        curiosity: score(record.curiosity, 7),
        fidelity: score(record.fidelity, 7),
      };
    })
    .filter((hook): hook is HookCandidate => Boolean(hook));
  const unique = [...new Map(hooks.map((hook) => [hook.text, hook])).values()].slice(0, 5);
  return unique.length >= 3 ? unique : fallbackHooks(input);
}

function confidenceFor(input: AnalysisInput): VideoIntelligenceResult["confidence"] {
  const hasScript = input.script.trim().length > 80;
  const localVisuals = input.images.some((image) => image.kind !== "youtube-thumbnail");
  const hasVisuals = input.images.length > 0;
  let scoreValue = 25;
  const evidence: string[] = [];
  const limitations: string[] = [];

  if (hasScript) {
    scoreValue += 35;
    evidence.push(
      input.scriptSource === "user"
        ? "User-supplied script"
        : input.scriptSource === "youtube-captions"
          ? "Full available YouTube captions"
          : "YouTube description"
    );
  } else {
    limitations.push("No substantial script or caption transcript");
  }
  if (localVisuals) {
    scoreValue += 35;
    evidence.push(`${input.images.filter((image) => image.kind !== "youtube-thumbnail").length} supplied visual samples`);
  } else if (hasVisuals) {
    scoreValue += 15;
    evidence.push("Public YouTube thumbnail");
    limitations.push("YouTube URL analysis cannot inspect video frames");
  } else {
    limitations.push("No visual evidence supplied");
  }
  if (input.youtube) evidence.push("Public YouTube metadata");
  const normalized = Math.min(95, scoreValue);
  return {
    level: normalized >= 75 ? "high" : normalized >= 50 ? "medium" : "low",
    score: normalized,
    evidence,
    limitations,
  };
}

function fallbackAnalysis(input: AnalysisInput): GeminiAnalysis {
  const topic = input.topic || input.youtube?.title || fallbackHookBase(input);
  const scriptSummary =
    input.script.trim().slice(0, 280) ||
    input.youtube?.description.slice(0, 280) ||
    "Visual sources supplied without a script.";
  return {
    recommendedTopic: topic,
    summary: scriptSummary,
    audience: `Viewers interested in ${topic}`,
    primarySubject: topic,
    entities: [],
    storyBeats: input.script ? ["Opening premise", "Core process or argument", "Outcome"] : [],
    sceneTypes: input.images.length ? ["Supplied visual references"] : [],
    emotionalTone: "Clear, grounded, and curiosity-led",
    relatedContexts: [topic],
    depth: {
      foreground: "Use the clearest supplied subject as the foreground anchor.",
      midground: "Preserve contextual action only when it supports the subject.",
      background: "Keep the environment readable but subordinate.",
      focalSubject: topic,
      depthCues: ["Scale separation", "Contrast separation", "Controlled background detail"],
    },
    thumbnailOpportunities: [
      "Lead with one clearly recognizable subject",
      "Use measured media colors for continuity",
      "Keep on-thumbnail copy short",
    ],
    hooks: fallbackHooks(input),
  };
}

async function geminiAnalysis(
  input: AnalysisInput,
  swatches: ExtractedSwatch[]
): Promise<GeminiAnalysis> {
  const apiKey = runtimeEnv("GEMINI_API_KEY") || runtimeEnv("GOOGLE_API_KEY");
  if (!apiKey) return fallbackAnalysis(input);

  const sourceLines = [
    input.topic ? `User topic: ${input.topic}` : "",
    input.youtube
      ? `YouTube metadata: "${input.youtube.title}" by ${input.youtube.channel}; duration ${input.youtube.durationSec}s; description: ${input.youtube.description.slice(0, 1200)}`
      : "",
    input.script
      ? `Script source: ${input.scriptSource}\nSCRIPT:\n${input.script.slice(0, MAX_SCRIPT_CHARS)}`
      : "No script supplied.",
    `Measured colors: ${swatches.map((swatch) => swatch.hex).slice(0, 12).join(", ") || "none"}`,
    `Visual evidence: ${input.images.map((image) => `${image.kind}:${image.name}${image.timestampSec != null ? `@${image.timestampSec}s` : ""}`).join(", ") || "none"}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const prompt = `You are a rigorous YouTube content and thumbnail strategist.
Analyze only the supplied evidence. Never claim to have watched a YouTube video when the evidence is metadata, captions, and one public thumbnail.

${sourceLines}

"Depth" means two things:
1. semantic depth: subject, audience, argument/process, story beats, and related context;
2. visual depth: foreground, midground, background, focal hierarchy, and visible depth cues.
Do not invent a physical depth measurement or unseen scenes.

Hooks are ON-THUMBNAIL COPY, not video titles. Return 3-5 hooks, ideally 2-5 words and no more than 42 characters. Score each 0-10 for clarity, curiosity, and fidelity.

Return ONLY valid JSON:
{
  "recommendedTopic": "clear working topic",
  "summary": "2-4 grounded sentences",
  "audience": "specific intended viewer",
  "primarySubject": "main visual/content subject",
  "entities": ["people, products, places, concepts"],
  "storyBeats": ["ordered beats supported by script"],
  "sceneTypes": ["visible scene categories only"],
  "emotionalTone": "tone",
  "relatedContexts": ["useful adjacent contexts"],
  "depth": {
    "foreground": "visible/recommended foreground",
    "midground": "visible/recommended midground",
    "background": "visible/recommended background",
    "focalSubject": "single focal subject",
    "depthCues": ["specific cues"]
  },
  "thumbnailOpportunities": ["specific opportunities"],
  "hooks": [
    {
      "text": "SHORT HOOK",
      "rationale": "why it is faithful",
      "clarity": 8,
      "curiosity": 8,
      "fidelity": 9
    }
  ],
  "typography": "thumbnail typography recommendation",
  "composition": "composition recommendation",
  "creativeDirection": "camera-real art direction grounded in supplied evidence",
  "doList": ["specific actions"],
  "avoidList": ["unsupported or harmful choices"]
}`;

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    { text: prompt },
  ];
  for (const image of input.images.slice(0, MAX_IMAGES)) {
    parts.push({ text: `Image evidence: ${image.kind} — ${image.name}` });
    parts.push({
      inlineData: {
        mimeType: image.mimeType || "image/jpeg",
        data: cleanBase64(image.data),
      },
    });
  }

  try {
    const response = await fetch(`${GEMINI_API_BASE}/${ANALYSIS_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          responseSchema: ANALYSIS_RESPONSE_SCHEMA,
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(`Gemini intelligence ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    const data = await response.json();
    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text)
        .join("") || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Gemini returned no JSON");
    return JSON.parse(match[0]) as GeminiAnalysis;
  } catch (err) {
    console.error("video intelligence fallback:", err);
    return fallbackAnalysis(input);
  }
}

function buildStyleBrief(
  parsed: GeminiAnalysis,
  colors: VideoColorStrategy,
  hooks: HookCandidate[]
): StyleBrief {
  return {
    summary: stringValue(parsed.summary, "Media-grounded thumbnail direction."),
    colorPalette: colors.dominant.slice(0, 5),
    typography: stringValue(
      parsed.typography,
      `Bold phone-readable sans-serif using ${colors.text} text`
    ),
    composition: stringValue(
      parsed.composition,
      "One focal subject with clear foreground/background separation"
    ),
    emotionalHook: stringValue(parsed.emotionalTone, "Grounded curiosity"),
    textPatterns: hooks.map((hook) => hook.text),
    creativeDirection: stringValue(
      parsed.creativeDirection,
      "Use the supplied visual evidence and measured colors; stay camera-real."
    ),
    doList: stringArray(parsed.doList, [
      "Use the supplied focal subject",
      "Use measured media colors",
      "Keep one short hook",
    ]),
    avoidList: stringArray(parsed.avoidList, [
      "Unsupported scenes",
      "Clutter",
      "Unreadable text",
      "Synthetic CGI gloss",
    ]),
    suggestedHook: hooks[0]?.text,
  };
}

export async function analyzeVideoIntelligence(
  input: AnalysisInput
): Promise<VideoIntelligenceResult> {
  const images = input.images
    .filter((image) => image.data && image.mimeType.startsWith("image/"))
    .slice(0, MAX_IMAGES);
  const normalizedInput = { ...input, images };
  const { swatches, palettes } = await measuredColors(images);
  const colors = colorStrategyFromSwatches(swatches);
  const resolvedPalettes =
    palettes.length > 0
      ? palettes
      : [
          {
            id: "media-neutral-fallback",
            name: "Neutral fallback",
            colors: colors.dominant.slice(0, 4),
            rationale: colors.rationale,
            sourceVideoIds: [],
          },
        ];
  const parsed = await geminiAnalysis(normalizedInput, swatches);
  const fallback = fallbackAnalysis(normalizedInput);
  const hooks = normalizeHooks(parsed.hooks, normalizedInput);
  const confidence = confidenceFor(normalizedInput);
  const depthRecord =
    parsed.depth && typeof parsed.depth === "object"
      ? (parsed.depth as Record<string, unknown>)
      : {};
  const depthFallback = fallback.depth!;
  const sourceSummary = [
    input.scriptSource !== "none" ? `script:${input.scriptSource}` : "",
    images.length ? `${images.length} visual sample${images.length === 1 ? "" : "s"}` : "",
    input.youtube ? "YouTube metadata" : "",
  ]
    .filter(Boolean)
    .join(" + ");

  return {
    recommendedTopic: stringValue(parsed.recommendedTopic, fallback.recommendedTopic!),
    summary: stringValue(parsed.summary, fallback.summary!),
    audience: stringValue(parsed.audience, fallback.audience!),
    primarySubject: stringValue(parsed.primarySubject, fallback.primarySubject!),
    entities: stringArray(parsed.entities, fallback.entities),
    storyBeats: stringArray(parsed.storyBeats, fallback.storyBeats),
    sceneTypes: stringArray(parsed.sceneTypes, fallback.sceneTypes),
    emotionalTone: stringValue(parsed.emotionalTone, fallback.emotionalTone!),
    relatedContexts: stringArray(parsed.relatedContexts, fallback.relatedContexts),
    depth: {
      foreground: stringValue(depthRecord.foreground, depthFallback.foreground),
      midground: stringValue(depthRecord.midground, depthFallback.midground),
      background: stringValue(depthRecord.background, depthFallback.background),
      focalSubject: stringValue(depthRecord.focalSubject, depthFallback.focalSubject),
      depthCues: stringArray(depthRecord.depthCues, depthFallback.depthCues),
    },
    thumbnailOpportunities: stringArray(
      parsed.thumbnailOpportunities,
      fallback.thumbnailOpportunities
    ),
    hooks,
    colors,
    confidence,
    sourceSummary: sourceSummary || "limited supplied context",
    scriptSource: input.scriptSource,
    youtube: input.youtube,
    palettes: resolvedPalettes,
    styleBrief: buildStyleBrief(parsed, colors, hooks),
    analyzedAt: Date.now(),
  };
}

