import type { SharePayload } from "@/lib/studio-history";

const HANDOFF_KEY = "thumbnail-studio-share-handoff";

export function stashShareHandoff(payload: SharePayload, slug: string) {
  try {
    sessionStorage.setItem(
      HANDOFF_KEY,
      JSON.stringify({ slug, payload, at: Date.now() })
    );
  } catch {
    // sessionStorage may be unavailable
  }
}

export function takeShareHandoff(): {
  slug: string;
  payload: SharePayload;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(HANDOFF_KEY);
    const parsed = JSON.parse(raw) as {
      slug?: string;
      payload?: SharePayload;
      at?: number;
    };
    if (!parsed?.payload || parsed.payload.v !== 1) return null;
    return { slug: String(parsed.slug || ""), payload: parsed.payload };
  } catch {
    return null;
  }
}
