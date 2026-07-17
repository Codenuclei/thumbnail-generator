import type { ScrapedVideo } from "@/lib/apify-youtube";
import { runtimeEnv } from "@/lib/runtime-env";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const ANALYSIS_MODEL = "gemini-2.5-flash";

export type StyleBrief = {
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

export async function analyzeStyleWithGemini(
  topic: string,
  videos: ScrapedVideo[],
  hook?: string
): Promise<StyleBrief> {
  const apiKey = runtimeEnv("GEMINI_API_KEY") || runtimeEnv("GOOGLE_API_KEY");
  if (!apiKey) {
    return fallbackBrief(topic, videos, hook);
  }

  const catalog = videos
    .map(
      (v, i) =>
        `${i + 1}. TITLE: ${v.title}\n   CHANNEL: ${v.channel}\n   VIEWS: ${v.viewCount}\n   DESC: ${v.description.slice(0, 200)}`
    )
    .join("\n\n");

  const prompt = `You are a YouTube thumbnail strategist. Analyze these top-performing videos on similar channels for the topic "${topic}".

${catalog}

${hook ? `Planned hook text: "${hook}"` : ""}

Return ONLY valid JSON with this shape:
{
  "summary": "2 sentence style synthesis",
  "colorPalette": ["#hex or color name", ...],
  "typography": "font weight, case, outline rules",
  "composition": "layout and subject placement rules",
  "emotionalHook": "dominant emotion to convey",
  "textPatterns": ["short hook patterns observed"],
  "creativeDirection": "one paragraph art direction using camera-real language (lens, lighting, grain) — never hyperrealistic/8k/unreal engine/masterpiece",
  "doList": ["5 specific do's"],
  "avoidList": ["5 specific don'ts including AI-slop looks: CGI gloss, plastic skin, glowing HUD, perfect symmetry"],
  "suggestedHook": "3-5 word ALL CAPS hook if none provided"
}

Important: describe visuals as real photography (35mm, natural light, film grain), not as AI renders.`;

  const res = await fetch(`${GEMINI_API_BASE}/${ANALYSIS_MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4 },
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    console.error("Gemini analysis failed:", await res.text());
    return fallbackBrief(topic, videos, hook);
  }

  const data = await res.json();
  const text =
    data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") || "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return fallbackBrief(topic, videos, hook);

  try {
    return JSON.parse(jsonMatch[0]) as StyleBrief;
  } catch {
    return fallbackBrief(topic, videos, hook);
  }
}

function fallbackBrief(topic: string, _videos: ScrapedVideo[], hook?: string): StyleBrief {
  return {
    summary: `Premium ${topic} thumbnails: clean factory visuals, optimistic business tone, bold professional hooks.`,
    colorPalette: ["#FFFFFF", "#1E3A5F", "#F5A623", "#2ECC71"],
    typography: "Bold ALL-CAPS sans-serif, thick stroke, high contrast",
    composition: "Hero subject left, process environment right, clean negative space for text",
    emotionalHook: "Optimistic, authoritative, premium",
    textPatterns: ["HOW IT'S MADE", "INSIDE THE FACTORY", "THE PROCESS"],
    creativeDirection:
      "Business-documentary still: Canon EOS R5, 35mm, natural window or practical factory light, Kodak Portra 400 response, minor film grain, real industrial grit, one confident hook — photographed on location, not CGI.",
    doList: [
      "Camera-real documentary look",
      "Natural or practical lighting only",
      "One clear professional hook",
      "Clean uncluttered layout",
      "Mobile-readable text",
    ],
    avoidList: [
      "Cheap clickbait",
      "Shock/negative faces",
      "Cluttered collage",
      "AI-slop CGI gloss / unreal engine look",
      "Glowing HUD / plastic over-smoothed surfaces",
    ],
    suggestedHook: hook?.toUpperCase() || "HOW IT'S MADE",
  };
}

export function styleBriefToPrompt(brief: StyleBrief, topic: string, hook?: string): string {
  const hookLine = hook || brief.suggestedHook || "";
  return [
    `STYLE INTELLIGENCE BRIEF for "${topic}":`,
    brief.summary,
    `Colors: ${brief.colorPalette.join(", ")}`,
    `Typography: ${brief.typography}`,
    `Composition: ${brief.composition}`,
    `Emotion: ${brief.emotionalHook}`,
    `Text patterns: ${brief.textPatterns.join("; ")}`,
    `Direction: ${brief.creativeDirection}`,
    `DO: ${brief.doList.join("; ")}`,
    `AVOID: ${brief.avoidList.join("; ")}`,
    hookLine ? `Render hook text legibly: "${hookLine.toUpperCase()}"` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
