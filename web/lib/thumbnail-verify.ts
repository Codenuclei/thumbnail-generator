import { runtimeEnv } from "@/lib/runtime-env";

/**
 * LLM-ops quality gate for generated thumbnails.
 *
 * Image models render "font energy" from prompt words — they cannot load a
 * real TTF — so hooks routinely come out misspelled, ghosted, cropped, or
 * with blotchy outlines no matter how many hard bans the prompt contains.
 * This module closes the loop: a vision model OCRs the output, checks the
 * hook character-for-character, and scores typography against the same
 * defect rubric the generation prompt bans. Failures produce a targeted
 * repair note that the generator feeds back into a retry.
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const VERIFY_MODEL = "gemini-2.5-flash";
const VERIFY_TIMEOUT_MS = 25_000;

export type VerificationDefectCode =
  | "hook-missing"
  | "hook-misspelled"
  | "extra-text"
  | "ai-painted-text"
  | "face-collision"
  | "ghost-letters"
  | "letters-cropped"
  | "hard-outline"
  | "blotchy-outline"
  | "shadow-or-glow"
  | "tight-tracking"
  | "background-patch"
  | "collage-seam"
  | "wrong-font-style"
  | "border-frame"
  | "illegible"
  | "other";

export type VerificationDefect = {
  code: VerificationDefectCode;
  severity: "critical" | "minor";
  detail: string;
};

export type ThumbnailVerification = {
  /** "skipped" = QA could not run (no key / API error) — never blocks delivery. */
  verdict: "pass" | "fail" | "skipped";
  /** 0–100 typography + integrity score from the vision model. */
  score: number;
  hookExpected: string;
  /** Verbatim on-image text the vision model read. */
  hookFound: string;
  hookExact: boolean;
  defects: VerificationDefect[];
  /** One-line instruction for the regeneration prompt when verdict is "fail". */
  repairNote?: string;
  model: string;
  ms: number;
};

const CRITICAL_CODES: ReadonlySet<VerificationDefectCode> = new Set([
  "hook-missing",
  "hook-misspelled",
  "extra-text",
  "ai-painted-text",
  "face-collision",
  "ghost-letters",
  "letters-cropped",
  "hard-outline",
  "shadow-or-glow",
  "tight-tracking",
  "collage-seam",
  "border-frame",
  "illegible",
]);

/** Uppercase, collapse whitespace/newlines so stacked lines still compare equal. */
function normalizeHook(text: string): string {
  return text
    .toUpperCase()
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    hookFound: {
      type: "STRING",
      description:
        "ALL on-image text transcribed verbatim, including every stray caption or label. Empty string if the image has no text.",
    },
    score: {
      type: "INTEGER",
      description: "0-100 overall typography + integrity quality score",
    },
    fontStyleOk: {
      type: "BOOLEAN",
      description:
        "True when text uses medium-bold Montserrat SemiBold/Bold, Bebas Neue, Anton, Oswald SemiBold, or Helvetica Neue Bold styling — never Impact Black, Arial Black, thin, script, serif, handwritten, or ultra-heavy/black",
    },
    trackingOk: {
      type: "BOOLEAN",
      description:
        "True only when letters have deliberate visible breathing room approximating 0.06–0.10em tracking, never tight, mashed, touching, or excessively scattered",
    },
    placementOk: {
      type: "BOOLEAN",
      description:
        "True only when the complete hook is in natural negative space, at least about 5% from every edge, uncropped, and does not cover a face, eyes, mouth, or primary product silhouette",
    },
    hasShadowOrGlow: {
      type: "BOOLEAN",
      description:
        "True if hook glyphs have any visible drop shadow, glow, neon aura, or shadow rim; required treatment is solid flat fill only",
    },
    textOnPlate: {
      type: "BOOLEAN",
      description:
        "True if the hook text sits on ANY shared region behind the whole line that is not the untouched photo: a box, bar, banner, ribbon, pill, strip, scrim, dimmed band, blurred patch, or translucent overlay — hard-edged OR soft-edged. False ONLY when letters sit directly on unmodified photo pixels with no shared backdrop.",
    },
    hookHasOutline: {
      type: "BOOLEAN",
      description:
        "True when a hard stroke/outline is TRACED AROUND the glyph contour, OR when a forced drop-shadow / glow rim is used as a substitute outline. Preferred treatment is solid flat fill with open tracking and no stroke/shadow.",
    },
    collageSeam: {
      type: "BOOLEAN",
      description:
        "True if the image is divided into two or more panels by hard straight seams/edges joining different photos or scenes (split-screen collage look). False for one single continuous photographic scene.",
    },
    defects: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          code: {
            type: "STRING",
            enum: [
              "hook-missing",
              "hook-misspelled",
              "extra-text",
              "ai-painted-text",
              "face-collision",
              "ghost-letters",
              "letters-cropped",
              "blotchy-outline",
              "shadow-or-glow",
              "tight-tracking",
              "background-patch",
              "wrong-font-style",
              "border-frame",
              "illegible",
              "other",
            ],
          },
          severity: { type: "STRING", enum: ["critical", "minor"] },
          detail: { type: "STRING" },
        },
        required: ["code", "severity", "detail"],
      },
    },
    repairNote: {
      type: "STRING",
      description:
        "One concise sentence telling an image generator exactly what to fix. Empty string when there is nothing to fix.",
    },
  },
  required: [
    "hookFound",
    "score",
    "defects",
    "repairNote",
    "fontStyleOk",
    "trackingOk",
    "placementOk",
    "hasShadowOrGlow",
    "textOnPlate",
    "hookHasOutline",
    "collageSeam",
  ],
} as const;

function buildVerifyPrompt(
  hookExpected: string,
  topic: string,
  compositedText: boolean
): string {
  const hookBlock = hookExpected
    ? [
        `EXPECTED HOOK TEXT (must appear exactly once, spelled character-for-character): "${hookExpected}"`,
        "Transcribe ALL text you can see on the image verbatim into hookFound.",
        "Flag hook-misspelled if ANY letter is dropped, added, swapped, doubled (e.g. AMAZONON), or auto-corrected to a different word.",
        "Flag extra-text if there is ANY text beyond the expected hook: invented captions, subtitles, channel names, subscribe buttons, view counts, watermarks, or a second copy of the hook.",
        ...(compositedText
          ? ["The expected hook was composited by the application. Flag ai-painted-text if the plate contains any additional AI-generated letters or pseudo-text."]
          : []),
      ]
    : [
        "EXPECTED HOOK TEXT: none — this thumbnail must be completely text-free.",
        "Transcribe any text you see into hookFound (empty string when clean).",
        "Flag extra-text (critical) if ANY words, captions, or logos appear.",
      ];

  return [
    "You are a strict typography QA inspector for YouTube thumbnails. Inspect the attached generated thumbnail.",
    `Video topic: "${topic}"`,
    ...hookBlock,
    "",
    "DEFECT RUBRIC (report every defect you actually see, with severity):",
    "- ghost-letters (critical): double-printed/echoed glyph layers, overlapping or colliding letters, melted or smeared strokes, stray glyph fragments.",
    "- letters-cropped (critical): any part of the hook cut off by the canvas edge or only partially rendered.",
    "- hard-outline (critical): any hard stroke or rim traced around glyphs. Solid flat fill with no outline is required.",
    "- shadow-or-glow (critical): any drop shadow, glow, neon aura, or shadow rim behind/around letters.",
    "- tight-tracking (critical): letters are tight, mashed, touching, or lack deliberate visible breathing room around 0.06–0.10em.",
    "- background-patch (critical): hook sitting on ANY shared region behind the line that is not the untouched photo — box, bar, banner, ribbon, pill, strip, scrim, dimmed band, blurred patch, or translucent overlay, hard OR soft edged.",
    "- collage-seam (critical): image split into two or more panels by hard straight seams joining different photos/scenes — output must be ONE continuous photographic scene.",
    "- face-collision (critical): the hook overlaps a face, eyes, mouth, or readable product silhouette, or ignores available clean negative space.",
    ...(compositedText
      ? [
          "- ai-painted-text (critical in legacy compositor mode): leftover generated lettering or pseudo-text besides the exact composited hook.",
        ]
      : []),
    "- wrong-font-style (critical): thin, script, serif, handwritten, comic, Impact Black, Arial Black, or ultra-heavy/black lettering instead of a medium-bold Montserrat SemiBold/Bold, Bebas Neue, Anton, Oswald SemiBold, or Helvetica Neue Bold target.",
    "- border-frame (critical): decorative border, frame, vignette ring, or stroke running along the canvas edges.",
    "- illegible (critical): hook unreadable when the image is shrunk to phone-feed size (~120px wide).",
    "- other (minor unless severe): anything else that would embarrass a top YouTube channel.",
    "",
    "Judge letterform quality the way a channel art director would: the exact hook must be painted once, glyphs clean and medium-bold, spacing deliberately open, placement in real negative space, ≥5% safe margins, and all text phone-readable.",
    "Score 0-100: 90+ = ship-ready; 70-89 = passable with minor flaws; below 70 = defective.",
    "Return JSON only.",
  ].join("\n");
}

export async function verifyThumbnailImage(options: {
  imageBase64: string;
  mimeType?: string;
  hook: string;
  topic: string;
  /** True when the user explicitly requested a split-panel composition. */
  allowSplit?: boolean;
  /** True when the exact hook was composited after plate generation. */
  compositedText?: boolean;
}): Promise<ThumbnailVerification> {
  const started = Date.now();
  const hookExpected = normalizeHook(options.hook || "");
  const skipped: ThumbnailVerification = {
    verdict: "skipped",
    score: 0,
    hookExpected,
    hookFound: "",
    hookExact: false,
    defects: [],
    model: VERIFY_MODEL,
    ms: 0,
  };

  const apiKey = runtimeEnv("GEMINI_API_KEY") || runtimeEnv("GOOGLE_API_KEY");
  if (!apiKey || runtimeEnv("THUMBNAIL_QA") === "off") return skipped;

  try {
    const res = await fetch(`${GEMINI_API_BASE}/${VERIFY_MODEL}:generateContent`, {
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
                  data: options.imageBase64,
                },
              },
              {
                text: buildVerifyPrompt(
                  hookExpected,
                  options.topic,
                  Boolean(options.compositedText)
                ),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 1200,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn(`Thumbnail QA skipped — verifier HTTP ${res.status}`);
      return { ...skipped, ms: Date.now() - started };
    }

    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text =
      json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    const parsed = JSON.parse(
      text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
    ) as {
      hookFound?: string;
      score?: number;
      fontStyleOk?: boolean;
      trackingOk?: boolean;
      placementOk?: boolean;
      hasShadowOrGlow?: boolean;
      textOnPlate?: boolean;
      hookHasOutline?: boolean;
      collageSeam?: boolean;
      defects?: VerificationDefect[];
      repairNote?: string;
    };

    const hookFound = String(parsed.hookFound || "").trim();
    const defects: VerificationDefect[] = Array.isArray(parsed.defects)
      ? parsed.defects
          .filter((d) => d && d.code && d.detail)
          .map((d) => ({
            code: d.code,
            severity: d.severity === "critical" ? "critical" : "minor",
            detail: String(d.detail).slice(0, 300),
          }))
      : [];

    // Spelling verdict is computed in code — never trusted to the model alone.
    const hookExact = hookExpected
      ? normalizeHook(hookFound) === hookExpected
      : hookFound.length === 0;

    // The transcription matches: drop any spurious spelling complaints the
    // model hallucinated, or they trigger pointless repair retries.
    if (hookExact) {
      for (let i = defects.length - 1; i >= 0; i--) {
        if (defects[i].code === "hook-misspelled" || defects[i].code === "hook-missing") {
          defects.splice(i, 1);
        }
      }
    }

    if (hookExpected && !hookExact && !defects.some((d) => d.code === "hook-misspelled" || d.code === "hook-missing")) {
      defects.push({
        code: hookFound ? "hook-misspelled" : "hook-missing",
        severity: "critical",
        detail: `Expected "${hookExpected}" but image reads "${hookFound || "(no text)"}"`,
      });
    }
    if (!hookExpected && hookFound && !defects.some((d) => d.code === "extra-text")) {
      defects.push({
        code: "extra-text",
        severity: "critical",
        detail: `Thumbnail must be text-free but reads "${hookFound}"`,
      });
    }
    if (
      hookExpected &&
      parsed.textOnPlate === true &&
      !defects.some((d) => d.code === "background-patch")
    ) {
      defects.push({
        code: "background-patch",
        severity: "critical",
        detail:
          "Hook text sits on a band/strip/scrim/overlay instead of directly on the photo — remove the plate and leave clean negative space for solid-fill open-tracking type with no stroke or shadow.",
      });
    }
    if (
      hookExpected &&
      parsed.hookHasOutline === true &&
      !defects.some((d) => d.code === "hard-outline" || d.code === "blotchy-outline")
    ) {
      defects.push({
        code: "hard-outline",
        severity: "critical",
        detail:
          "Hook letters have a hard stroke/rim traced around the glyph edges — outlines are banned. Repaint solid-fill letters with open tracking and no stroke, border, plate, or shadow.",
      });
    }
    if (
      hookExpected &&
      parsed.hasShadowOrGlow === true &&
      !defects.some((d) => d.code === "shadow-or-glow")
    ) {
      defects.push({
        code: "shadow-or-glow",
        severity: "critical",
        detail:
          "Hook letters use a drop shadow or glow — repaint them as solid flat fill only with no shadow, glow, neon aura, stroke, or outline.",
      });
    }
    if (
      hookExpected &&
      parsed.trackingOk === false &&
      !defects.some((d) => d.code === "tight-tracking")
    ) {
      defects.push({
        code: "tight-tracking",
        severity: "critical",
        detail:
          "Hook letter spacing is too tight or mashed — repaint with deliberate open tracking around 0.06–0.10em and visible breathing room.",
      });
    }
    if (
      hookExpected &&
      parsed.placementOk === false &&
      !defects.some(
        (d) => d.code === "face-collision" || d.code === "letters-cropped"
      )
    ) {
      defects.push({
        code: "face-collision",
        severity: "critical",
        detail:
          "Hook placement is unsafe — move the complete text into clean negative space, keep at least 5% margin, and avoid faces, eyes, and product silhouettes.",
      });
    }
    if (
      parsed.collageSeam === true &&
      !options.allowSplit &&
      !defects.some((d) => d.code === "collage-seam")
    ) {
      defects.push({
        code: "collage-seam",
        severity: "critical",
        detail:
          "Image is split into panels by hard seams — render ONE continuous photographic scene with no split-screen collage.",
      });
    }

    // User explicitly asked for a split layout — seams are intentional there.
    const effectiveDefects = options.allowSplit
      ? defects.filter((d) => d.code !== "collage-seam")
      : defects;

    const hasCritical =
      effectiveDefects.some(
        (d) => d.severity === "critical" && CRITICAL_CODES.has(d.code)
      ) ||
      effectiveDefects.some(
        (d) =>
          d.severity === "critical" &&
          (d.code === "blotchy-outline" ||
            d.code === "background-patch" ||
            d.code === "shadow-or-glow" ||
            d.code === "tight-tracking" ||
            d.code === "wrong-font-style")
      );

    let score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
    if (hasCritical) score = Math.min(score, 60);

    const repairParts = effectiveDefects
      .filter((d) => d.severity === "critical")
      .map((d) => d.detail);
    const repairNote =
      repairParts.length
        ? repairParts.join(" ")
        : String(parsed.repairNote || "").trim() || undefined;

    return {
      verdict: hasCritical ? "fail" : "pass",
      score,
      hookExpected,
      hookFound,
      hookExact,
      defects: effectiveDefects,
      repairNote: hasCritical ? repairNote : undefined,
      model: VERIFY_MODEL,
      ms: Date.now() - started,
    };
  } catch (err) {
    console.warn(
      "Thumbnail QA skipped —",
      err instanceof Error ? err.message : String(err)
    );
    return { ...skipped, ms: Date.now() - started };
  }
}

/** Prompt block appended when regenerating after a QA failure. */
export function buildRepairPromptBlock(
  verification: ThumbnailVerification,
  attempt: number
): string {
  const defectLines = verification.defects
    .filter((d) => d.severity === "critical")
    .map((d) => `- ${d.code}: ${d.detail}`);
  return [
    `AUTOMATED QA FAILED (repair attempt ${attempt}) — the previous render of this exact prompt was rejected by a typography inspector. Fix ALL of these defects this time:`,
    ...defectLines,
    verification.hookExpected
      ? [
          `REPAINT THE EXACT HOOK character-for-character, exactly once: "${verification.hookExpected}". Do not translate, paraphrase, autocorrect, truncate, duplicate, or add text.`,
          "Use Montserrat SemiBold/Bold, Bebas Neue, Anton, Oswald SemiBold, or Helvetica Neue Bold styling at medium-bold weight only; never Impact Black, Arial Black, ultra-heavy, or black.",
          "Use deliberate 0.06–0.10em open tracking and solid flat fill. Remove every ghost letter, plate/banner/scrim, stroke, outline, drop shadow, glow, and neon treatment.",
          "Dynamically place the complete hook in clean negative space with ≥5% safe margins. Never crop it or cover faces, eyes, or product silhouettes. One line preferred, two maximum; shrink/wrap rather than truncate. Keep one continuous scene with no collage seams.",
        ].join(" ")
      : "The image must contain ZERO text of any kind — this supersedes any earlier text instruction.",
  ].join("\n");
}
