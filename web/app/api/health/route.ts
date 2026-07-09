import { NextResponse } from "next/server";

export async function GET() {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const cohesivityKey = process.env.COH_APPLICATION_KEY;
  const apifyToken = process.env.APIFY_API_TOKEN;

  let geminiText = false;
  let geminiError = "";

  if (geminiKey) {
    try {
      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-goog-api-key": geminiKey,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "ping" }] }],
          }),
          signal: AbortSignal.timeout(8000),
        }
      );
      geminiText = res.ok;
      if (!res.ok) geminiError = (await res.text()).slice(0, 200);
    } catch (err) {
      geminiError = err instanceof Error ? err.message : "timeout";
    }
  }

  return NextResponse.json({
    gemini: {
      configured: Boolean(geminiKey),
      textOk: geminiText,
      imageModel: "gemini-2.5-flash-image",
      error: geminiError || undefined,
    },
    cohesivity: { configured: Boolean(cohesivityKey) },
    apify: { configured: Boolean(apifyToken) },
  });
}
