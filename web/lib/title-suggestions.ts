const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-2.5-flash";

export async function suggestTitlesFromFeedback(input: {
  topic: string;
  feedbackNotes: string;
  likedTitles: string[];
  dislikedTitles: string[];
  existingSuggestions?: string[];
}): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return input.existingSuggestions?.slice(0, 4) || [input.topic];
  }

  const prompt = `You are a YouTube title strategist. Generate 5 premium video title ideas.

Current topic: "${input.topic}"

User liked these reference video styles/titles:
${input.likedTitles.length ? input.likedTitles.map((t) => `- ${t}`).join("\n") : "- none yet"}

User disliked:
${input.dislikedTitles.length ? input.dislikedTitles.map((t) => `- ${t}`).join("\n") : "- none"}

User feedback notes:
${input.feedbackNotes || "No extra notes"}

Requirements:
- Premium business/documentary tone
- Searchable, clear, optimistic
- Inspired by what user liked, avoid disliked patterns
- No cheap clickbait

Return ONLY JSON: { "titles": ["title 1", "title 2", ...] }`;

  try {
    const res = await fetch(`${GEMINI_API_BASE}/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 800 },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error("titles api fail");

    const data = await res.json();
    const text =
      data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no json");

    const parsed = JSON.parse(match[0]) as { titles?: string[] };
    const titles = (parsed.titles || []).filter((t) => t.trim()).slice(0, 5);
    return titles.length ? titles : input.existingSuggestions || [input.topic];
  } catch (err) {
    console.error("Title suggestion error:", err);
    return input.existingSuggestions?.slice(0, 4) || [input.topic];
  }
}
