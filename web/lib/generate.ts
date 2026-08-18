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
import {
  DEFAULT_IMAGE_MODEL,
  FALLBACK_IMAGE_MODEL,
  resolveImageModelId,
} from "@/lib/image-models";
import {
  generateOpenRouterImage,
  openRouterConfigured,
} from "@/lib/openrouter-generate";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
/** Direct-Gemini fallback id (bare). Prefer OpenRouter + DEFAULT_IMAGE_MODEL. */
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
/** Max images attached to a single Gemini generate call (media + research refs + seed). */
const MAX_REF_IMAGES = 12;
/** Only retry rate-limits / 5xx — never burn the budget retrying a hung call. */
const MAX_RATE_RETRIES = 2;
/**
 * Gemini rate limits (https://ai.google.dev/gemini-api/docs/rate-limits):
 * RPM / TPM (input) / RPD per model+project; image models also constrain
 * effective images/min. Parallel bursts of gemini-*-flash-image often return
 * 500 INTERNAL or empty IMAGE_OTHER even when tier RPM looks fine — so the
 * first pass is strictly sequential. Failed slots wait RETRY_COOLDOWN_MS then
 * a second parallel fill; leftovers recover one-at-a-time with the same gap.
 */
const RETRY_COOLDOWN_MS = 3_000;
/** Small gap between successful sequential slots (avoid request stacking). */
const BETWEEN_SUCCESS_MS = 400;
/** Immediate re-try of the same slot during pass 1 (after cooldown). */
const PASS1_INLINE_RETRIES = 1;
/** After sequential pass, one parallel fill of remaining slots. */
const PARALLEL_FILL_ROUNDS = 1;
/** Final one-at-a-time recoveries after the parallel fill. */
const MAX_SEQUENTIAL_RECOVERIES = 3;
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
    return `STYLE SAMPLE ONLY — "${asset.label || "ref"}". Borrow font energy, case, open tracking, color mood, and layout RHYTHM. FORBIDDEN: same subject pose, same crop, same background layout, same text block placement, or a near-identical remake. Paint only the user's exact hook from the main prompt; never copy wording, outline, stroke, border, frame, plate, neon, glow, or shadow from this image. Invent a clearly different original scene.`;
  }
  if (asset.role === "seed") {
    return `GENERATED VARIANT SEED — "${asset.label || "variant seed"}". This is a prior output the user liked. Generate a sibling in the same story direction — match palette energy, subject scale, hook placement, and venue. Vary camera look and type variant per prompt. Improve phone-readability; do not pixel-copy. The result must NOT be a 1:1 replica of this seed image — change composition, staging, or framing enough that it is a new, similar-but-distinct thumbnail. No border/frame around the canvas edges.`;
  }
  if ((asset.label || "").toLowerCase().includes("media photo")) {
    return `USER PHOTO — "${asset.label}". Optional ingredient: use as person likeness, product/object, or background plate if it serves the topic; otherwise ignore.`;
  }
  return `Attached asset "${asset.label || "asset"}" — use only if it improves the thumbnail story.`;
}

const ORIGINALITY_PREAMBLE =
  "CRITICAL BEFORE ANY ATTACHED IMAGES: Competitor/liked thumbnails are STYLE SAMPLES only (fonts, color energy, layout rhythm). You MUST invent a NEW scene — different camera angle, different crop, different subject staging/pose, and different background arrangement than any attached reference. If the result could be mistaken for a reference thumb at a glance, it is a hard failure. Topic context and the user's brief outrank copying a reference.";

function buildParts(
  prompt: string,
  assets: ImageAsset[]
): Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  const hasRefs = assets.some((a) => a.role === "reference" || a.role === "seed");
  if (hasRefs) {
    parts.push({ text: ORIGINALITY_PREAMBLE });
  }
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
  return /429|500|503|INTERNAL|UNAVAILABLE|Resource exhausted|rate|IMAGE_OTHER|no image/i.test(
    msg
  );
}

function isPermanentGenerateError(msg: string): boolean {
  return /No endpoints found that support the requested output modalities|cannot be used with the chat\/completions endpoint|Use the \/api\/v1\/images/i.test(
    msg
  );
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
  const resolvedModel = resolveImageModelId(model);
  // OpenRouter prefers provider/model slugs; direct Gemini wants bare ids.
  const geminiBareModel = resolvedModel.startsWith("google/")
    ? resolvedModel.slice("google/".length)
    : resolvedModel.includes("/")
      ? DEFAULT_GEMINI_MODEL
      : resolvedModel;

  if (!openRouterConfigured() && !geminiKey) {
    throw new Error(
      "OPENROUTER_API_KEY or GEMINI_API_KEY missing on server — thumbnail generation cannot run."
    );
  }

  try {
    let buf: Buffer;
    let backend: string;

    if (openRouterConfigured()) {
      const callTimeout = Math.min(
        timeoutForSize(imageSize),
        budgetMs && budgetMs > 5_000 ? budgetMs - 2_000 : timeoutForSize(imageSize)
      );
      let lastErr: Error | null = null;
      let orResult: { buffer: Buffer; backend: string } | null = null;
      for (let attempt = 1; attempt <= MAX_RATE_RETRIES + 1; attempt++) {
        try {
          orResult = await generateOpenRouterImage({
            prompt,
            model: resolvedModel || DEFAULT_IMAGE_MODEL,
            imageSize,
            assets,
            timeoutMs: callTimeout,
          });
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err instanceof Error ? err : new Error(String(err));
          const msg = lastErr.message;
          const retry =
            attempt <= MAX_RATE_RETRIES &&
            isRateOrServerError(msg) &&
            !isTimeoutError(msg);
          console.error(`OpenRouter attempt ${attempt} failed:`, msg);
          if (!retry) break;
          const backoff = 1000 * 2 ** (attempt - 1);
          await sleep(backoff + Math.floor(Math.random() * 500));
        }
      }
      if (!orResult) {
        throw lastErr || new Error("OpenRouter failed");
      }
      buf = orResult.buffer;
      backend = orResult.backend;
    } else {
      buf = await generateGemini(
        geminiKey!,
        prompt,
        geminiBareModel || DEFAULT_GEMINI_MODEL,
        imageSize,
        assets,
        budgetMs
      );
      backend = `gemini:${geminiBareModel || DEFAULT_GEMINI_MODEL}@${imageSize}`;
    }

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
      backend,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Image generate failed:", msg);
    if (!allowFallback || !cohesivityKey) {
      throw new Error(
        isTimeoutError(msg)
          ? `Generate timed out — use 1K, fewer refs, or default model. ${msg}`
          : msg
      );
    }
    throw new Error(`Generate failed and fallback disabled. ${msg}`);
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
 * Generate variants with a rate-limit-friendly schedule:
 * 1) First pass — sequential (wait for each slot; inline 3s retry on fail)
 * 2) Second pass — parallel fill of remaining slots after a 3s cooldown
 * 3) Final sequential recoveries with 3s gaps
 *
 * See https://ai.google.dev/gemini-api/docs/rate-limits — image models are
 * sensitive to concurrent generateContent bursts (500 / IMAGE_OTHER).
 */
export async function generateThumbnailVariants(
  variants: VariantSpec[],
  options: {
    model?: string;
    imageSize?: "1K" | "2K" | "4K";
    assets?: ImageAsset[];
    /** Target count — defaults to all variants */
    targetCount?: number;
    /** Hard wall-clock budget for the whole batch (ms). Default 280s. */
    budgetMs?: number;
    /** When set, every variant runs the generate → verify → repair QA loop. */
    verify?: VerifyLoopOptions;
  }
): Promise<VariantImage[]> {
  const target = options.targetCount ?? variants.length;
  const budgetMs = options.budgetMs ?? 280_000;
  const started = Date.now();
  const succeeded = new Map<string, VariantImage>();
  const lastFail = new Map<string, string>();
  const selectedModel = options.model?.trim();
  // Don't silently swap a non-Gemini pick (FLUX / GPT Image / Recraft…) onto Gemini.
  const selectedResolved = selectedModel
    ? resolveImageModelId(selectedModel)
    : "";
  const retryModel =
    selectedResolved && !selectedResolved.startsWith("google/gemini")
      ? selectedResolved
      : FALLBACK_IMAGE_MODEL;

  function remaining(): number {
    return Math.max(0, budgetMs - (Date.now() - started));
  }

  async function runOne(
    v: VariantSpec,
    modelOverride?: string,
    capMs?: number
  ): Promise<boolean> {
    if (succeeded.has(v.id)) return true;
    const left = Math.min(remaining(), capMs ?? Infinity);
    if (left < 12_000) {
      console.warn(`Skipping ${v.id} — only ${left}ms budget left`);
      return false;
    }
    try {
      const img = await generateOneVariant(v, {
        ...options,
        model: modelOverride ?? options.model,
        budgetMs: left,
      });
      succeeded.set(v.id, img);
      console.log(`Variant ${v.id} ok (${succeeded.size}/${target})`);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastFail.set(v.id, msg);
      console.error(`Variant ${v.id} failed:`, msg);
      return false;
    }
  }

  const pending = variants.slice(0, target);

  // ── Pass 1: sequential ──────────────────────────────────────────────
  console.log(
    `Variant batch: sequential pass for ${pending.length} slot(s) (budget ${Math.round(budgetMs / 1000)}s)`
  );
  for (let i = 0; i < pending.length; i++) {
    const v = pending[i]!;
    if (remaining() < 12_000) {
      console.warn(`Stopping sequential pass — ${remaining()}ms left`);
      break;
    }
    // Leave headroom for later slots + a parallel fill.
    const slotsLeft = pending.length - i;
    const perSlotCap = Math.max(
      25_000,
      Math.floor((remaining() * 0.85) / Math.max(1, slotsLeft))
    );
    let ok = await runOne(v, undefined, perSlotCap);
    for (
      let inline = 0;
      !ok &&
      inline < PASS1_INLINE_RETRIES &&
      remaining() >= 20_000 &&
      !isPermanentGenerateError(lastFail.get(v.id) || "");
      inline++
    ) {
      console.warn(
        `Variant ${v.id}: waiting ${RETRY_COOLDOWN_MS}ms then retry ${inline + 1}/${PASS1_INLINE_RETRIES}`
      );
      await sleep(RETRY_COOLDOWN_MS);
      ok = await runOne(
        v,
        selectedResolved && selectedResolved !== retryModel
          ? retryModel
          : undefined,
        Math.min(remaining() - 5_000, 95_000)
      );
    }
    if (ok && i < pending.length - 1 && remaining() > BETWEEN_SUCCESS_MS) {
      await sleep(BETWEEN_SUCCESS_MS);
    }
  }

  // ── Pass 2: parallel fill of misses (after 3s cooldown) ─────────────
  for (let round = 1; round <= PARALLEL_FILL_ROUNDS; round++) {
    const missing = pending.filter(
      (v) =>
        !succeeded.has(v.id) &&
        !isPermanentGenerateError(lastFail.get(v.id) || "")
    );
    if (!missing.length) break;
    if (remaining() < 25_000) {
      console.warn(
        `Skipping parallel fill — ${remaining()}ms left, ${missing.length} short`
      );
      break;
    }
    console.warn(
      `Parallel fill ${round}: cooling ${RETRY_COOLDOWN_MS}ms then retrying ${missing.length} in parallel on ${retryModel}`
    );
    await sleep(RETRY_COOLDOWN_MS);
    const roundCap = Math.max(25_000, Math.floor(remaining() * 0.7));
    await Promise.all(
      missing.map((v) => runOne(v, retryModel, roundCap))
    );
  }

  // ── Pass 3: sequential recoveries with 3s gaps ──────────────────────
  for (let i = 0; i < MAX_SEQUENTIAL_RECOVERIES; i++) {
    const missing = pending.filter(
      (v) =>
        !succeeded.has(v.id) &&
        !isPermanentGenerateError(lastFail.get(v.id) || "")
    );
    if (!missing.length) break;
    if (remaining() < 28_000) {
      console.warn(
        `Stopping sequential recovery — ${remaining()}ms left, ${missing.length} short`
      );
      break;
    }
    const next = missing[0]!;
    console.warn(
      `Sequential recovery ${i + 1}: waiting ${RETRY_COOLDOWN_MS}ms then ${next.id} (${missing.length} missing)`
    );
    await sleep(RETRY_COOLDOWN_MS);
    await runOne(
      next,
      retryModel,
      Math.min(remaining() - 5_000, 95_000)
    );
  }

  return variants
    .filter((v) => succeeded.has(v.id))
    .map((v) => succeeded.get(v.id)!);
}
