import { NextResponse } from "next/server";
import { youtubeYtdlpReady } from "@/lib/youtube-download";
import { runtimeEnv } from "@/lib/runtime-env";
import { DEFAULT_IMAGE_MODEL } from "@/lib/image-models";
import { openRouterConfigured } from "@/lib/openrouter-generate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const geminiKey = runtimeEnv("GEMINI_API_KEY") || runtimeEnv("GOOGLE_API_KEY");
  const cohesivityKey = runtimeEnv("COH_APPLICATION_KEY");
  const apifyToken = runtimeEnv("APIFY_API_TOKEN");
  const ytdlp = await youtubeYtdlpReady();

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

  return NextResponse.json(
    {
      gemini: {
        configured: Boolean(geminiKey),
        textOk: geminiText,
        imageModel: DEFAULT_IMAGE_MODEL,
        error: geminiError || undefined,
      },
      openrouter: {
        configured: openRouterConfigured(),
        baseUrl:
          runtimeEnv("OPENROUTER_BASE_URL") || "https://openrouter.ai/api/v1",
        defaultImageModel: DEFAULT_IMAGE_MODEL,
      },
      cohesivity: { configured: Boolean(cohesivityKey) },
      ytdlp,
      apify: { configured: Boolean(apifyToken) },
      exports: {
        canva: Boolean(cohesivityKey),
        figma: Boolean(cohesivityKey),
        canvaOAuth: Boolean(
          runtimeEnv("CANVA_CLIENT_ID") && runtimeEnv("CANVA_CLIENT_SECRET")
        ),
        figmaOAuth: Boolean(
          (runtimeEnv("FIGMA_CLIENT_ID") && runtimeEnv("FIGMA_CLIENT_SECRET")) ||
            runtimeEnv("FIGMA_ACCESS_TOKEN")
        ),
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
