import { NextResponse } from "next/server";
import { runtimeEnv } from "@/lib/runtime-env";
import {
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODELS,
  type ImageModelOption,
} from "@/lib/image-models";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type OrModel = {
  id?: string;
  name?: string;
};

function openRouterBase(): string {
  return (
    runtimeEnv("OPENROUTER_BASE_URL")?.replace(/\/$/, "") ||
    "https://openrouter.ai/api/v1"
  );
}

/**
 * Live OpenRouter image-generation catalog.
 * Uses the same filter as https://openrouter.ai/models?output_modalities=image
 * (`GET /api/v1/models?output_modalities=image`).
 * Falls back to curated IMAGE_MODELS when the key is missing or upstream fails.
 */
export async function GET() {
  const key = runtimeEnv("OPENROUTER_API_KEY");
  if (!key) {
    return NextResponse.json(
      {
        source: "fallback",
        filter: "output_modalities=image",
        defaultModel: DEFAULT_IMAGE_MODEL,
        models: IMAGE_MODELS,
        error: "OPENROUTER_API_KEY not configured",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const res = await fetch(
      `${openRouterBase()}/models?output_modalities=image`,
      {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      }
    );
    if (!res.ok) {
      throw new Error(`OpenRouter models ${res.status}`);
    }
    const payload = (await res.json()) as { data?: OrModel[] };
    const live: ImageModelOption[] = [];
    for (const m of payload.data || []) {
      const id = (m.id || "").trim();
      if (!id) continue;
      const name = (m.name || id).trim();
      live.push({
        value: id,
        label: name,
        shortLabel: name.replace(/^[^:]+:\s*/, "").slice(0, 48),
      });
    }
    live.sort((a, b) => a.label.localeCompare(b.label));

    const models: ImageModelOption[] = [
      {
        value: "default",
        label: `Default · ${DEFAULT_IMAGE_MODEL}`,
        shortLabel: "Default",
      },
      ...live,
    ];

    return NextResponse.json(
      {
        source: "openrouter",
        filter: "output_modalities=image",
        filterUrl: "https://openrouter.ai/models?output_modalities=image",
        defaultModel: DEFAULT_IMAGE_MODEL,
        count: live.length,
        models,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      {
        source: "fallback",
        filter: "output_modalities=image",
        defaultModel: DEFAULT_IMAGE_MODEL,
        models: IMAGE_MODELS,
        error: err instanceof Error ? err.message : "fetch failed",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
