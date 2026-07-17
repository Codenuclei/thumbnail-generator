import type { InspirationVideo, ThumbnailFeedback } from "@/lib/inspiration";
import { runtimeEnv } from "@/lib/runtime-env";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const QUERY_MODEL = "gemini-2.5-flash";

export function buildExpandedSearchQueries(topic: string, hook?: string): string[] {
  const t = topic.trim();
  const queries = [
    t,
    `${t} documentary`,
    `${t} explained`,
    `${t} factory how it's made`,
    `${t} inside the factory`,
    `${t} process india`,
    hook ? `${t} ${hook}` : "",
    `${t.split("|")[0].trim()} premium`,
  ].filter(Boolean);
  return [...new Set(queries)].slice(0, 8);
}

export function buildSimilarQueries(
  topic: string,
  seed: Pick<InspirationVideo, "title" | "channel">,
  feedbackComment?: string
): string[] {
  const shortTitle = seed.title.split("|")[0].trim();
  const queries = [
    `${seed.title} ${seed.channel}`,
    `${topic} ${shortTitle}`,
    `similar to ${seed.title} documentary`,
    `${seed.channel} ${topic} factory`,
    `${shortTitle} explained premium`,
    feedbackComment ? `${topic} ${feedbackComment.slice(0, 100)}` : "",
    feedbackComment ? `${seed.channel} style ${topic}` : "",
  ].filter(Boolean);
  return [...new Set(queries)].slice(0, 6);
}

export async function expandQueriesFromFeedback(input: {
  topic: string;
  seed?: Pick<InspirationVideo, "title" | "channel">;
  feedback: ThumbnailFeedback[];
}): Promise<string[]> {
  const apiKey = runtimeEnv("GEMINI_API_KEY") || runtimeEnv("GOOGLE_API_KEY");
  const liked = input.feedback.filter((f) => f.rating === "like");
  const notes = input.feedback
    .filter((f) => f.comment || f.rating === "like")
    .map((f) => `[${f.rating}] ${f.title}: ${f.comment || "liked"}`)
    .join("\n");

  const fallback = input.seed
    ? buildSimilarQueries(input.topic, input.seed, liked[0]?.comment)
    : buildExpandedSearchQueries(input.topic);

  if (!apiKey || !notes.trim()) return fallback;

  const prompt = `You are a YouTube research assistant. Generate 6 diverse YouTube SEARCH queries to find premium documentary/business thumbnails similar to what the user liked.

Topic: "${input.topic}"
${input.seed ? `Seed video: "${input.seed.title}" by ${input.seed.channel}` : ""}

User feedback on liked thumbnails:
${notes}

Rules:
- Queries must be searchable on YouTube (short, concrete)
- Incorporate what the user praised in comments (colors, composition, factory shots, etc.)
- Mix broad and specific queries
- Premium documentary tone — no clickbait

Return ONLY a JSON array of 6 strings.`;

  try {
    const res = await fetch(`${GEMINI_API_BASE}/${QUERY_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const text =
      data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") || "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]) as string[];
    const cleaned = parsed.map((q) => String(q).trim()).filter(Boolean);
    return cleaned.length ? cleaned.slice(0, 6) : fallback;
  } catch {
    return fallback;
  }
}
