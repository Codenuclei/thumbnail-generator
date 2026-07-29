import { runtimeEnv } from "@/lib/runtime-env";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-2.5-flash";

export type VariantTitleInput = {
  id: string;
  cameraFilter: string;
  composition: string;
  compositionFactor: string;
  paletteName?: string;
};

export async function suggestTitlesForVariants(input: {
  topic: string;
  hook?: string;
  likedTitles: string[];
  dislikedTitles?: string[];
  variants: VariantTitleInput[];
}): Promise<Record<string, string>> {
  const apiKey = runtimeEnv("GEMINI_API_KEY") || runtimeEnv("GOOGLE_API_KEY");
  const fallback = (id: string, i: number) =>
    `${input.topic}${input.hook ? `: ${input.hook}` : ""} — Option ${i + 1}`;

  if (!apiKey || !input.variants.length) {
    return Object.fromEntries(
      input.variants.map((v, i) => [v.id, fallback(v.id, i)])
    );
  }

  const variantLines = input.variants
    .map(
      (v, i) =>
        `${i + 1}. id=${v.id} | camera=${v.cameraFilter} | layout=${v.composition} | framing=${v.compositionFactor}${v.paletteName ? ` | palette=${v.paletteName}` : ""}`
    )
    .join("\n");

  const prompt = `You are a YouTube title strategist. Write ONE unique video title per thumbnail variant below.

Topic: "${input.topic}"
${input.hook ? `Hook on thumbnail: "${input.hook}"` : ""}

Reference titles user LIKED (PRIMARY inspiration — match energy/structure, do NOT copy verbatim):
${input.likedTitles.length ? input.likedTitles.map((t) => `- ${t}`).join("\n") : "- none — invent strong titles from topic"}

${input.dislikedTitles?.length ? `Avoid patterns from disliked:\n${input.dislikedTitles.map((t) => `- ${t}`).join("\n")}` : ""}

Variants (each needs its own fresh title):
${variantLines}

Rules:
- Premium documentary / business tone
- Each title must be DISTINCT — no duplicates
- Heavily inspired by liked refs' energy and phrasing patterns, but NEW wording
- Searchable, clear, optimistic
- 40–70 characters ideal
- No cheap clickbait

Return ONLY JSON:
{
  "titles": [
    { "id": "v1", "title": "unique title here" }
  ]
}`;

  try {
    const res = await fetch(`${GEMINI_API_BASE}/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.45, maxOutputTokens: 1200 },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`titles ${res.status}`);

    const data = await res.json();
    const text =
      data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no json");

    const parsed = JSON.parse(match[0]) as {
      titles?: Array<{ id?: string; title?: string }>;
    };

    const map: Record<string, string> = {};
    const used = new Set<string>();

    for (const entry of parsed.titles || []) {
      const id = entry.id || "";
      const title = String(entry.title || "").trim();
      if (!id || !title || used.has(title.toLowerCase())) continue;
      used.add(title.toLowerCase());
      map[id] = title;
    }

    // Fill gaps with fallbacks
    for (let i = 0; i < input.variants.length; i++) {
      const v = input.variants[i];
      if (!map[v.id]) map[v.id] = fallback(v.id, i);
    }

    return map;
  } catch (err) {
    console.error("Variant title error:", err);
    return Object.fromEntries(
      input.variants.map((v, i) => [v.id, fallback(v.id, i)])
    );
  }
}
