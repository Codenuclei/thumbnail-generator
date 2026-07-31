/**
 * dry.md learning store — one Gemini vision/text pass per user rating,
 * then append unique lessons only (no repeats). Injected into every generate prompt.
 */

import "server-only";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { runtimeEnv } from "@/lib/runtime-env";
import { HARD_BANS } from "@/lib/font-engine";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const ANALYZE_MODEL = "gemini-2.5-flash";

export type DryPolarity = "avoid" | "prefer";

export type DryLesson = {
  id: string;
  polarity: DryPolarity;
  lesson: string;
  codes: string[];
  source: "generated" | "inspiration" | "seed";
  topic?: string;
  hook?: string;
  rating: "like" | "dislike";
  userComment?: string;
  createdAt: string;
};

export type LearnFeedbackInput = {
  rating: "like" | "dislike";
  source: "generated" | "inspiration";
  comment?: string;
  topic?: string;
  hook?: string;
  title?: string;
  /** Base64 without data: URL prefix */
  imageBase64?: string;
  mimeType?: string;
  thumbnailUrl?: string;
};

function resolveDryMdPath(): string {
  const candidates = [
    join(process.cwd(), "dry.md"),
    join(process.cwd(), "..", "dry.md"),
    join(process.cwd(), "web", "dry.md"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  const fromWeb = join(process.cwd(), "..", "dry.md");
  if (existsSync(dirname(fromWeb))) return fromWeb;
  return join(process.cwd(), "dry.md");
}

function resolveDrySeenPath(): string {
  const md = resolveDryMdPath();
  return join(dirname(md), "dry-seen.json");
}

function loadSeenKeys(): Set<string> {
  const p = resolveDrySeenPath();
  if (!existsSync(p)) return new Set();
  try {
    const arr = JSON.parse(readFileSync(p, "utf8")) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSeenKey(key: string) {
  const p = resolveDrySeenPath();
  const set = loadSeenKeys();
  set.add(key);
  // Cap growth
  const list = [...set].slice(-500);
  writeFileSync(p, JSON.stringify(list, null, 0), "utf8");
}

function feedbackEventKey(input: LearnFeedbackInput): string {
  const imgSig = input.imageBase64
    ? createHash("sha1").update(input.imageBase64.slice(0, 8000)).digest("hex").slice(0, 10)
    : input.thumbnailUrl || "";
  return createHash("sha1")
    .update(
      [
        input.rating,
        input.source,
        (input.comment || "").trim().toLowerCase(),
        (input.hook || "").trim().toLowerCase(),
        (input.topic || "").trim().toLowerCase(),
        imgSig,
      ].join("|")
    )
    .digest("hex")
    .slice(0, 16);
}

function fingerprint(polarity: DryPolarity, lesson: string): string {
  const norm = normalizeLessonCore(lesson);
  return createHash("sha1").update(`${polarity}|${norm}`).digest("hex").slice(0, 12);
}

/** Strip filler so "Avoid thick outlines…" ≈ "Do not use thick outlines…". */
function normalizeLessonCore(lesson: string): string {
  return lesson
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(
      /\b(the|a|an|to|and|or|of|for|with|as|they|can|make|appear|do|not|use|avoid|prefer|please|very|really|that|this|it|is|are|be|been|being|from|into|onto|over|under|less|more|than|then)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(s.split(" ").filter((t) => t.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function isDuplicateLesson(
  polarity: DryPolarity,
  lesson: string,
  existing: DryLesson[]
): boolean {
  const id = fingerprint(polarity, lesson);
  const core = normalizeLessonCore(lesson);
  const tokens = tokenSet(core);
  return existing.some((e) => {
    if (e.polarity !== polarity) return false;
    if (e.id === id) return true;
    const eCore = normalizeLessonCore(e.lesson);
    if (eCore === core) return true;
    return jaccard(tokenSet(eCore), tokens) >= 0.55;
  });
}

const SEED_AVOID = [
  ...HARD_BANS.map((b) => b),
  "Do not put hard black/white stroke outlines around hook letterforms",
  "Do not join two photos with a hard vertical/horizontal split seam",
  "Do not place the hook on a banner, bar, pill, or blurred plate",
];

const SEED_PREFER = [
  "Paint the exact hook once using Montserrat SemiBold/Bold, Bebas Neue, Anton, Oswald SemiBold, or Helvetica Neue Bold",
  "Use medium-bold weight and deliberate open 0.06–0.10em tracking; never Impact Black, Arial Black, ultra-heavy, or mashed",
  "Solid flat fill only — no stroke, outline, drop shadow, glow, border, plate, banner, or scrim",
  "Dynamically place hook in clear negative space with 5% safe margins; never cover faces or crop text",
  "One continuous photographic scene by default (no collage)",
];

export function ensureDryMd(): string {
  const path = resolveDryMdPath();
  if (existsSync(path)) return path;

  const lines = [
    "# Thumbnail Learning Log (dry.md)",
    "",
    "Lessons from user ratings + one Gemini pass per feedback event.",
    "Each bullet has a unique `id:` — never append a duplicate id.",
    "",
    "## Prefer",
    ...SEED_PREFER.map(
      (lesson) =>
        `- id:${fingerprint("prefer", lesson)} | ${lesson} | source:seed | ${new Date().toISOString().slice(0, 10)}`
    ),
    "",
    "## Avoid",
    ...SEED_AVOID.map(
      (lesson) =>
        `- id:${fingerprint("avoid", lesson)} | ${lesson} | source:seed | ${new Date().toISOString().slice(0, 10)}`
    ),
    "",
  ];
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines.join("\n"), "utf8");
  return path;
}

function parseLessonLine(line: string, polarity: DryPolarity): DryLesson | null {
  const m = line.match(
    /^\s*-\s*id:([a-f0-9]+)\s*\|\s*(.+?)\s*\|\s*source:(\w+)\s*\|\s*(\d{4}-\d{2}-\d{2})/i
  );
  if (!m) return null;
  return {
    id: m[1],
    polarity,
    lesson: m[2].trim(),
    codes: [],
    source: m[3] === "generated" || m[3] === "inspiration" ? m[3] : "seed",
    rating: polarity === "prefer" ? "like" : "dislike",
    createdAt: m[4],
  };
}

export function loadDryLessons(): DryLesson[] {
  const path = ensureDryMd();
  const text = readFileSync(path, "utf8");
  const lessons: DryLesson[] = [];
  let section: DryPolarity | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^##\s+Prefer/i.test(line)) {
      section = "prefer";
      continue;
    }
    if (/^##\s+Avoid/i.test(line)) {
      section = "avoid";
      continue;
    }
    if (!section || !line.trim().startsWith("-")) continue;
    const parsed = parseLessonLine(line, section);
    if (parsed) lessons.push(parsed);
  }
  return lessons;
}

export function dryLessonsPromptBlock(max = 14): string {
  const lessons = loadDryLessons();
  const prefer = lessons.filter((l) => l.polarity === "prefer").slice(-Math.ceil(max / 2));
  const avoid = lessons.filter((l) => l.polarity === "avoid").slice(-Math.ceil(max / 2));
  if (!prefer.length && !avoid.length) return "";

  const lines = [
    "DRY.MD LEARNED RULES (from prior user ratings — obey these; do not reintroduce known failures):",
  ];
  if (prefer.length) {
    lines.push("Prefer:");
    for (const l of prefer) lines.push(`- ${l.lesson}`);
  }
  if (avoid.length) {
    lines.push("Avoid (known bad):");
    for (const l of avoid) lines.push(`- ${l.lesson}`);
  }
  return lines.join("\n");
}

function appendUniqueLessons(newLessons: DryLesson[]): { added: DryLesson[]; skipped: number } {
  const path = ensureDryMd();
  const existing = loadDryLessons();
  const ids = new Set(existing.map((l) => l.id));
  const added: DryLesson[] = [];
  let skipped = 0;

  let text = readFileSync(path, "utf8");
  if (!/^##\s+Prefer/im.test(text)) {
    text += "\n## Prefer\n";
  }
  if (!/^##\s+Avoid/im.test(text)) {
    text += "\n## Avoid\n";
  }

  for (const lesson of newLessons) {
    if (isDuplicateLesson(lesson.polarity, lesson.lesson, existing)) {
      skipped += 1;
      continue;
    }
    // Keep id stable to normalized core
    lesson.id = fingerprint(lesson.polarity, lesson.lesson);
    if (ids.has(lesson.id)) {
      skipped += 1;
      continue;
    }
    ids.add(lesson.id);
    existing.push(lesson);
    added.push(lesson);
    const bullet = `- id:${lesson.id} | ${lesson.lesson} | source:${lesson.source} | ${lesson.createdAt.slice(0, 10)}`;
    const heading = lesson.polarity === "prefer" ? "## Prefer" : "## Avoid";
    const idx = text.search(new RegExp(`^${heading}\\s*$`, "im"));
    if (idx < 0) {
      text += `\n${heading}\n${bullet}\n`;
    } else {
      const afterHeading = text.indexOf("\n", idx);
      const insertAt = afterHeading < 0 ? text.length : afterHeading + 1;
      text = text.slice(0, insertAt) + `${bullet}\n` + text.slice(insertAt);
    }
  }

  if (added.length) writeFileSync(path, text, "utf8");
  return { added, skipped };
}

type GeminiLessonPayload = {
  lessons: Array<{ polarity: DryPolarity; lesson: string; codes?: string[] }>;
};

async function analyzeFeedbackOnce(input: LearnFeedbackInput): Promise<GeminiLessonPayload> {
  const apiKey = runtimeEnv("GEMINI_API_KEY") || runtimeEnv("GOOGLE_API_KEY");
  if (!apiKey) {
    // Offline fallback from comment / rating only
    const fallbackLesson =
      input.comment?.trim() ||
      (input.rating === "dislike"
        ? "Avoid repeating the visual/text defects in the last disliked thumbnail"
        : "Prefer patterns from the last liked thumbnail");
    return {
      lessons: [
        {
          polarity: input.rating === "like" ? "prefer" : "avoid",
          lesson: fallbackLesson.slice(0, 180),
          codes: [],
        },
      ],
    };
  }

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  if (input.imageBase64) {
    parts.push({
      inlineData: {
        mimeType: input.mimeType || "image/png",
        data: input.imageBase64,
      },
    });
  } else if (input.thumbnailUrl) {
    try {
      const res = await fetch(input.thumbnailUrl, { signal: AbortSignal.timeout(12_000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const mime = res.headers.get("content-type") || "image/jpeg";
        parts.push({
          inlineData: { mimeType: mime.split(";")[0], data: buf.toString("base64") },
        });
      }
    } catch {
      // continue text-only
    }
  }

  parts.push({
    text: [
      "You distill ONE user thumbnail rating into durable YouTube-thumbnail lessons.",
      "Return JSON only: {\"lessons\":[{\"polarity\":\"prefer\"|\"avoid\",\"lesson\":\"short imperative rule\",\"codes\":[\"optional-defect-code\"]}]}",
      "Rules:",
      "- 1–3 lessons max, each ≤ 140 characters, concrete and actionable",
      "- Do NOT repeat the same idea twice",
      "- polarity prefer for likes; avoid for dislikes (may include one prefer if like notes a keep)",
      "- Focus on typography, placement, composition, color, subject — not marketing copy",
      "- Align with: exact hook once; Montserrat SemiBold/Bold, Bebas Neue, Anton, Oswald SemiBold, or Helvetica Neue Bold; medium-bold only; 0.06–0.10em open tracking; solid flat fill; no stroke/outline/drop shadow/glow/plate; dynamic negative-space placement; no collage seams by default",
      `User rating: ${input.rating}`,
      `Source: ${input.source}`,
      input.topic ? `Topic: ${input.topic}` : "",
      input.hook ? `Hook: ${input.hook}` : "",
      input.title ? `Title: ${input.title}` : "",
      input.comment ? `User comment: ${input.comment}` : "User comment: (none)",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const res = await fetch(`${GEMINI_API_BASE}/${ANALYZE_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 600,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) {
    throw new Error(`Gemini feedback analyze ${res.status}`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text =
    json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "{}";
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleaned) as GeminiLessonPayload;
  if (!Array.isArray(parsed.lessons)) return { lessons: [] };
  return {
    lessons: parsed.lessons
      .filter((l) => l && l.lesson && (l.polarity === "prefer" || l.polarity === "avoid"))
      .slice(0, 3)
      .map((l) => ({
        polarity: l.polarity,
        lesson: String(l.lesson).replace(/\s+/g, " ").trim().slice(0, 180),
        codes: Array.isArray(l.codes) ? l.codes.map(String).slice(0, 4) : [],
      })),
  };
}

/**
 * One Gemini pass → unique dry.md appends. Never duplicates by id/text.
 */
export async function learnFromFeedback(input: LearnFeedbackInput): Promise<{
  added: DryLesson[];
  skipped: number;
  dryPath: string;
}> {
  const path = ensureDryMd();
  const eventKey = feedbackEventKey(input);
  if (loadSeenKeys().has(eventKey)) {
    return { added: [], skipped: 1, dryPath: path };
  }

  const analyzed = await analyzeFeedbackOnce(input);
  const now = new Date().toISOString();

  // Force polarity to match rating as primary signal
  const lessons: DryLesson[] = analyzed.lessons.map((l) => {
    const polarity: DryPolarity =
      input.rating === "like"
        ? l.polarity === "avoid"
          ? "avoid"
          : "prefer"
        : l.polarity === "prefer"
          ? "prefer"
          : "avoid";
    // Dislikes default to avoid; likes default to prefer
    const forced: DryPolarity =
      input.rating === "dislike" && polarity === "prefer" && !input.comment
        ? "avoid"
        : input.rating === "like" && polarity === "avoid" && !input.comment
          ? "prefer"
          : polarity;
    return {
      id: fingerprint(forced, l.lesson),
      polarity: forced,
      lesson: l.lesson,
      codes: l.codes || [],
      source: input.source,
      topic: input.topic,
      hook: input.hook,
      rating: input.rating,
      userComment: input.comment,
      createdAt: now,
    };
  });

  // If Gemini returned nothing, still record a comment-based lesson
  if (!lessons.length && input.comment?.trim()) {
    const polarity: DryPolarity = input.rating === "like" ? "prefer" : "avoid";
    const lesson = input.comment.trim().slice(0, 180);
    lessons.push({
      id: fingerprint(polarity, lesson),
      polarity,
      lesson,
      codes: [],
      source: input.source,
      topic: input.topic,
      hook: input.hook,
      rating: input.rating,
      userComment: input.comment,
      createdAt: now,
    });
  }

  const { added, skipped } = appendUniqueLessons(lessons);
  saveSeenKey(eventKey);
  return { added, skipped, dryPath: path };
}
