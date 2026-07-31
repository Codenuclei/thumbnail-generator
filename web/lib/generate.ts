import { runtimeEnv } from "@/lib/runtime-env";
import {
  buildRepairPromptBlock,
  verifyThumbnailImage,
  type ThumbnailVerification,
} from "@/lib/thumbnail-verify";
import {
  POST_RENDER_TYPOGRAPHY_ENABLED,
  type PlacementZoneId,
} from "@/lib/font-engine";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-image";
/**
 * Per-call patience. Keep under route budget for multi-variant 1K batches.
 * Timeouts used to cascade: 55s × retries × rounds × variants → proxy 504s.
 */
const TIMEOUT_BY_SIZE: Record<"1K" | "2K" | "4K", number> = {
  "1K": 70_000,
  "2K": 95_000,
  "4K": 110_000,
};
const MAX_REF_IMAGES = 3;
/** Only retry rate-limits / 5xx — never burn the budget retrying a hung call. */
const MAX_RATE_RETRIES = 2;
const BETWEEN_VARIANT_MS = 150;
/**
 * Extra whole-batch passes used to fill missing variants. Gemini image 500s are
 * transient, so a slot that failed once usually lands on a later pass.
 */
const MAX_FILL_ROUNDS = 3;
/** Known-good image model used to fill slots when the selected model keeps 500ing. */
const FALLBACK_IMAGE_MODEL = DEFAULT_GEMINI_MODEL;
/** Default batch size for scratch generate. */
export const DEFAULT_VARIANT_COUNT = 4;

export type GenerateResult = {
  imageBase64: string;
  backend: string;
  geminiError?: string;
};

export type ImageAsset = {
  mimeType: string;
  data: string;
  label?: string;
  /** When "primary", this uploaded video frame anchors the output. "reference" = style hints only. "seed" = generated variant direction. */
  role?: "primary" | "reference" | "seed";
};

type InspirationInput = {
  thumbnailUrl: string;
  title?: string;
  channel?: string;
};

export type VariantSpec = {
  id: string;
  prompt: string;
  label: string;
  paletteId?: string;
  paletteName?: string;
  composition: string;
  compositionLabel?: string;
  cameraFilter?: string;
  cameraFilterLabel?: string;
  compositionFactor?: string;
  compositionFactorLabel?: string;
  suggestedTitle?: string;
  typographyZoneId?: PlacementZoneId;
};

export type VariantImage = {
  id: string;
  image: string;
  label: string;
  paletteId?: string;
  paletteName?: string;
  composition: string;
  compositionLabel?: string;
  cameraFilter?: string;
  cameraFilterLabel?: string;
  compositionFactor?: string;
  compositionFactorLabel?: string;
  suggestedTitle?: string;
  backend: string;
  /** LLM-ops QA result for the delivered attempt (undefined when QA disabled). */
  verification?: ThumbnailVerification & { attempts: number };
};

/** Enables the generate → verify → repair loop on each variant. */
export type VerifyLoopOptions = {
  /** Exact hook text expected on the image; "" = image must be text-free. */
  hook: string;
  topic: string;
  /** Regeneration attempts after a QA failure (default 1). */
  maxRepairs?: number;
  /** True when the split-panel composition was explicitly requested. */
  allowSplit?: boolean;
  /** Fallback zone when Gemini placement is missing — orchestrator still proposes. */
  typographyZoneId?: PlacementZoneId;
};

/** Minimum budget left to bother launching a verify + repair cycle. */
const QA_MIN_BUDGET_MS = 40_000;

function extractImageBuffer(data: Record<string, unknown>): Buffer | null {
  const candidates = (data.candidates as Array<Record<string, unknown>>) || [];
  for (const candidate of candidates) {
    const parts =
      ((candidate.content as Record<string, unknown>)?.parts as Array<Record<string, unknown>>) ||
      [];
    for (const part of parts) {
      const inline = (part.inlineData || part.inline_data) as { data?: string } | undefined;
      if (inline?.data) return Buffer.from(inline.data, "base64");
    }
  }
  return null;
}

function assetInstruction(asset: ImageAsset): string {
  if (asset.role === "primary") {
    return `KEY SOURCE STILL — "${asset.label || "video still"}". Use this as a plate: pull the best person, object, OR background for a YouTube thumbnail. Crop/reframe freely; do not force a full-frame paste. Keep real likeness/product identity if that element is chosen. Do not swap in a different invented person/product.`;
  }
  if (asset.role === "reference") {
    return `REFERENCE ONLY — "${asset.label || "ref"}". Study font energy, case, open tracking, color mood, and layout only. Paint only the user's exact hook from the main prompt; never copy wording from this reference. Never copy outline, stroke, border, frame, plate, neon, glow, or shadow treatments from the reference. Do not copy its subject over the user's media or reproduce it as a near-copy.`;
  }
  if (asset.role === "seed") {
    return `GENERATED VARIANT SEED — "${asset.label || "variant seed"}". This is a prior output the user liked. Generate a sibling in the same story direction — match palette energy, subject scale, hook placement, and venue. Vary camera look and type variant per prompt. Improve phone-readability; do not pixel-copy. The result must NOT be a 1:1 replica of this seed image — change composition, staging, or framing enough that it is a new, similar-but-distinct thumbnail. No border/frame around the canvas edges.`;
  }
  if ((asset.label || "").toLowerCase().includes("media photo")) {
    return `USER PHOTO — "${asset.label}". Optional ingredient: use as person likeness, product/object, or background plate if it serves the topic; otherwise ignore.`;
  }
  return `Attached asset "${asset.label || "asset"}" — use only if it improves the thumbnail story.`;
}

function buildParts(
  prompt: string,
  assets: ImageAsset[]
): Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  for (const asset of assets.slice(0, MAX_REF_IMAGES)) {
    parts.push({ inlineData: { mimeType: asset.mimeType, data: asset.data } });
    parts.push({ text: assetInstruction(asset) });
  }
  parts.push({ text: prompt });
  return parts;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, Math.max(0, Math.round(ms))));
}

function isTimeoutError(msg: string): boolean {
  return /timed out|aborted|timeout|AbortError/i.test(msg);
}

function isRateOrServerError(msg: string): boolean {
  return /429|500|503|INTERNAL|UNAVAILABLE|Resource exhausted|rate/i.test(msg);
}

function timeoutForSize(imageSize: "1K" | "2K" | "4K"): number {
  return TIMEOUT_BY_SIZE[imageSize] || TIMEOUT_BY_SIZE["1K"];
}

async function generateGeminiOnce(
  apiKey: string,
  prompt: string,
  model: string,
  imageSize: "1K" | "2K" | "4K" = "1K",
  assets: ImageAsset[] = [],
  timeoutMs?: number
): Promise<Buffer> {
  const res = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: buildParts(prompt, assets) }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: "16:9", imageSize },
      },
    }),
    signal: AbortSignal.timeout(Math.floor(timeoutMs ?? timeoutForSize(imageSize))),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${raw.slice(0, 400)}`);

  const data = JSON.parse(raw) as Record<string, unknown>;
  const buf = extractImageBuffer(data);
  if (buf) return buf;

  const reason = (data.candidates as Array<Record<string, unknown>>)?.[0]?.finishReason;
  throw new Error(`Gemini returned no image (${reason || "unknown"})`);
}

async function generateGemini(
  apiKey: string,
  prompt: string,
  model: string,
  imageSize: "1K" | "2K" | "4K" = "1K",
  assets: ImageAsset[] = [],
  budgetMs?: number
): Promise<Buffer> {
  const started = Date.now();
  const budgetLeft = () =>
    budgetMs ? Math.max(0, budgetMs - (Date.now() - started)) : Infinity;
  const callTimeout = Math.min(
    timeoutForSize(imageSize),
    budgetMs && budgetMs > 5_000 ? budgetMs - 2_000 : timeoutForSize(imageSize)
  );
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RATE_RETRIES + 1; attempt++) {
    try {
      // Never let a later attempt outlive the caller's remaining budget.
      const attemptTimeout = Math.floor(Math.min(callTimeout, budgetLeft()));
      if (attemptTimeout < 5_000) break;
      return await generateGeminiOnce(
        apiKey,
        prompt,
        model,
        imageSize,
        assets,
        attemptTimeout
      );
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const msg = lastErr.message;
      // Never retry timeouts — that doubles hang time and causes proxy 504s.
      const retry =
        attempt <= MAX_RATE_RETRIES && isRateOrServerError(msg) && !isTimeoutError(msg);
      console.error(`Gemini attempt ${attempt} failed:`, msg);
      if (!retry) break;
      // Exponential backoff with jitter, per Gemini API retry guidance.
      const backoff = 1000 * 2 ** (attempt - 1);
      const wait = backoff + Math.floor(Math.random() * 500);
      if (budgetLeft() < wait + 10_000) break;
      await sleep(wait);
    }
  }
  throw lastErr || new Error("Gemini failed");
}

export async function generateThumbnail(
  prompt: string,
  model?: string,
  _inspirations: InspirationInput[] = [],
  imageSize: "1K" | "2K" | "4K" = "1K",
  allowFallback = false,
  assets: ImageAsset[] = [],
  budgetMs?: number,
  composite?: { hook: string; zoneId?: PlacementZoneId; topic?: string }
): Promise<GenerateResult> {
  const geminiKey = runtimeEnv("GEMINI_API_KEY") || runtimeEnv("GOOGLE_API_KEY");
  const cohesivityKey = runtimeEnv("COH_APPLICATION_KEY");
  const geminiModel = model || DEFAULT_GEMINI_MODEL;

  if (!geminiKey) {
    throw new Error(
      "GEMINI_API_KEY missing on server — thumbnail generation cannot run."
    );
  }

  try {
    let buf = await generateGemini(
      geminiKey,
      prompt,
      geminiModel,
      imageSize,
      assets,
      budgetMs
    );
    if (POST_RENDER_TYPOGRAPHY_ENABLED && composite?.hook.trim()) {
      try {
        // Preserved rollback path for future experiments. This feature is off
        // by default: Gemini currently paints and places the exact hook itself.
        const { orchestrateHookComposite } = await import(
          "@/lib/placement-orchestrator"
        );
        const composited = await orchestrateHookComposite(buf, {
          hook: composite.hook,
          fallbackZoneId: composite.zoneId,
          topic: composite.topic,
        });
        buf = composited.buffer;
        console.log(
          composited.applied
            ? `Hook orchestrated: "${composite.hook}" ${composited.detail}`
            : `Optional hook compositor skipped (${composited.detail}) — Gemini render kept`
        );
      } catch (err) {
        console.error("Optional hook compositor failed; returning Gemini render:", err);
      }
    }
    return {
      imageBase64: buf.toString("base64"),
      backend: `gemini:${geminiModel}@${imageSize}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Gemini failed:", msg);
    if (!allowFallback || !cohesivityKey) {
      throw new Error(
        isTimeoutError(msg)
          ? `Gemini timed out — use 1K, fewer refs, or default model. ${msg}`
          : msg
      );
    }
    throw new Error(`Gemini failed and fallback disabled. ${msg}`);
  }
}

/**
 * Closed-loop generation: render → vision-QA → targeted repair retry.
 * Keeps the best-scoring attempt so QA can only improve the delivered image.
 * Fail-open: QA errors deliver the image unverified rather than blocking.
 */
export async function generateWithVerification(
  prompt: string,
  verify: VerifyLoopOptions,
  options: {
    model?: string;
    imageSize?: "1K" | "2K" | "4K";
    assets?: ImageAsset[];
    budgetMs?: number;
  }
): Promise<GenerateResult & { verification?: VariantImage["verification"] }> {
  const started = Date.now();
  const budgetMs = options.budgetMs ?? 120_000;
  const budgetLeft = () => Math.max(0, budgetMs - (Date.now() - started));
  const maxRepairs = verify.maxRepairs ?? 1;

  let best:
    | (GenerateResult & { verification: ThumbnailVerification; attempts: number })
    | null = null;
  let prompt_ = prompt;

  // Correct hook always outranks a wrong one; verdict outranks raw score.
  const rank = (v: ThumbnailVerification) =>
    (v.verdict === "pass" ? 4000 : 0) + (v.hookExact ? 2000 : 0) + v.score;

  for (let attempt = 1; attempt <= maxRepairs + 1; attempt++) {
    const result = await generateThumbnail(
      prompt_,
      options.model,
      [],
      options.imageSize || "1K",
      false,
      options.assets || [],
      // Reserve room for the verify call after this render.
      Math.max(10_000, budgetLeft() - 15_000),
      {
        hook: verify.hook,
        zoneId: verify.typographyZoneId,
        topic: verify.topic,
      }
    );

    if (budgetLeft() < 20_000) {
      // No time to verify — ship what we have (prefer a previous verified pass).
      return best && best.verification.verdict === "pass"
        ? { ...best, verification: { ...best.verification, attempts: best.attempts } }
        : { ...result, verification: undefined };
    }

    const verification = await verifyThumbnailImage({
      imageBase64: result.imageBase64,
      hook: verify.hook,
      topic: verify.topic,
      allowSplit: verify.allowSplit,
      // Default path is Gemini-painted typography; QA must inspect those glyphs.
      compositedText: POST_RENDER_TYPOGRAPHY_ENABLED && Boolean(verify.hook.trim()),
    });

    if (verification.verdict === "skipped") {
      // QA unavailable — deliver unverified rather than burn budget blind.
      return { ...result, verification: undefined };
    }

    if (!best || rank(verification) > rank(best.verification)) {
      best = { ...result, verification, attempts: attempt };
    }

    if (verification.verdict === "pass") break;

    const canRetry = attempt <= maxRepairs && budgetLeft() > QA_MIN_BUDGET_MS;
    console.warn(
      `Thumbnail QA fail (attempt ${attempt}, score ${verification.score}): ${verification.defects
        .map((d) => d.code)
        .join(", ")}${canRetry ? " — repairing" : " — keeping best attempt"}`
    );
    if (!canRetry) break;
    prompt_ = `${prompt}\n${buildRepairPromptBlock(verification, attempt + 1)}`;
  }

  return {
    imageBase64: best!.imageBase64,
    backend: best!.backend,
    verification: { ...best!.verification, attempts: best!.attempts },
  };
}

async function generateOneVariant(
  v: VariantSpec,
  options: {
    model?: string;
    imageSize?: "1K" | "2K" | "4K";
    assets?: ImageAsset[];
    budgetMs?: number;
    verify?: VerifyLoopOptions;
  }
): Promise<VariantImage> {
  const result = options.verify
    ? await generateWithVerification(
        v.prompt,
        {
          ...options.verify,
          allowSplit: v.composition === "split",
          typographyZoneId: v.typographyZoneId,
        },
        options
      )
    : await generateThumbnail(
        v.prompt,
        options.model,
        [],
        options.imageSize || "1K",
        false,
        options.assets || [],
        options.budgetMs,
        undefined
      );
  const verification =
    "verification" in result
      ? (result as GenerateResult & { verification?: VariantImage["verification"] })
          .verification
      : undefined;
  return {
    id: v.id,
    image: result.imageBase64,
    label: v.label,
    paletteId: v.paletteId,
    paletteName: v.paletteName,
    composition: v.composition,
    compositionLabel: v.compositionLabel,
    cameraFilter: v.cameraFilter,
    cameraFilterLabel: v.cameraFilterLabel,
    compositionFactor: v.compositionFactor,
    compositionFactorLabel: v.compositionFactorLabel,
    suggestedTitle: v.suggestedTitle,
    backend: result.backend,
    verification,
  };
}

/**
 * Generate every variant concurrently, then retry misses in one parallel pass.
 * Tier 2 allows 2k RPM / 4M TPM, so a 4-wide burst is well inside quota —
 * wall time is one image call, not four.
 */
export async function generateThumbnailVariants(
  variants: VariantSpec[],
  options: {
    model?: string;
    imageSize?: "1K" | "2K" | "4K";
    assets?: ImageAsset[];
    /** Target count — defaults to all variants */
    targetCount?: number;
    /** Hard wall-clock budget for the whole batch (ms). Default 200s. */
    budgetMs?: number;
    /** When set, every variant runs the generate → verify → repair QA loop. */
    verify?: VerifyLoopOptions;
  }
): Promise<VariantImage[]> {
  const target = options.targetCount ?? variants.length;
  const budgetMs = options.budgetMs ?? 200_000;
  const started = Date.now();
  const succeeded = new Map<string, VariantImage>();

  function remaining(): number {
    return Math.max(0, budgetMs - (Date.now() - started));
  }

  async function runOne(v: VariantSpec, modelOverride?: string, capMs?: number) {
    if (succeeded.has(v.id)) return;
    const left = Math.min(remaining(), capMs ?? Infinity);
    if (left < 12_000) {
      console.warn(`Skipping ${v.id} — only ${left}ms budget left`);
      return;
    }
    try {
      const img = await generateOneVariant(v, {
        ...options,
        model: modelOverride ?? options.model,
        budgetMs: left,
      });
      succeeded.set(v.id, img);
      console.log(`Variant ${v.id} ok (${succeeded.size}/${target})`);
    } catch (err) {
      console.error(
        `Variant ${v.id} failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  const pending = variants.slice(0, target);

  // Reserve budget for fill rounds so one slow/flaky slot cannot eat the batch.
  await Promise.all(pending.map((v) => runOne(v, undefined, budgetMs * 0.55)));

  // Keep filling missing slots while budget allows. Gemini image 500s are
  // transient, so a slot that failed once often succeeds on a later pass.
  const selectedModel = options.model?.trim();
  for (let round = 1; round <= MAX_FILL_ROUNDS; round++) {
    const missing = pending.filter((v) => !succeeded.has(v.id));
    if (!missing.length) break;
    if (remaining() < 20_000) {
      console.warn(
        `Stopping fill rounds — ${remaining()}ms left, ${missing.length} variant(s) short`
      );
      break;
    }
    // After the first retry pass, fall back to the known-good image model so a
    // flaky selected model cannot cap the batch below the requested count.
    const useFallback =
      round >= 2 && Boolean(selectedModel) && selectedModel !== FALLBACK_IMAGE_MODEL;
    console.warn(
      `Fill round ${round}: retrying ${missing.length} variant(s) in parallel${
        useFallback ? ` on ${FALLBACK_IMAGE_MODEL}` : ""
      }`
    );
    await sleep(BETWEEN_VARIANT_MS * round);
    // Leave room for the next round unless this is the last one.
    const roundCap =
      round === MAX_FILL_ROUNDS ? remaining() : Math.max(25_000, remaining() * 0.6);
    await Promise.all(
      missing.map((v) =>
        runOne(v, useFallback ? FALLBACK_IMAGE_MODEL : undefined, roundCap)
      )
    );
  }

  return variants
    .filter((v) => succeeded.has(v.id))
    .map((v) => succeeded.get(v.id)!);
}
