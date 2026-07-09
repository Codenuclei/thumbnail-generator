const OPENING_SECONDS = 120;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

type CaptionTrack = { baseUrl: string; languageCode?: string };

type TranscriptSegment = { start: number; text: string };

export type OpeningTranscript = {
  text: string;
  source: "captions" | "description" | "unavailable";
  durationSec: number;
};

function extractPlayerResponse(html: string): Record<string, unknown> | null {
  const patterns = [
    /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/,
    /var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\});/,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      try {
        return JSON.parse(match[1]) as Record<string, unknown>;
      } catch {
        continue;
      }
    }
  }
  return null;
}

function getCaptionTracks(player: Record<string, unknown>): CaptionTrack[] {
  const captions = player.captions as Record<string, unknown> | undefined;
  const tracklist = captions?.playerCaptionsTracklistRenderer as Record<string, unknown> | undefined;
  const tracks = (tracklist?.captionTracks as Array<Record<string, unknown>>) || [];
  return tracks
    .map((t) => ({
      baseUrl: String(t.baseUrl || ""),
      languageCode: String(t.languageCode || ""),
    }))
    .filter((t) => t.baseUrl);
}

function parseJson3Captions(raw: string): TranscriptSegment[] {
  const data = JSON.parse(raw) as { events?: Array<Record<string, unknown>> };
  const segments: TranscriptSegment[] = [];
  for (const event of data.events || []) {
    const start = Number(event.tStartMs || 0) / 1000;
    const segs = (event.segs as Array<{ utf8?: string }>) || [];
    const text = segs.map((s) => s.utf8 || "").join("").replace(/\n/g, " ").trim();
    if (text) segments.push({ start, text });
  }
  return segments;
}

function parseXmlCaptions(raw: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const regex = /<text start="([^"]+)"[^>]*>([^<]*)<\/text>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw))) {
    const start = parseFloat(match[1]);
    const text = match[2]
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
    if (text) segments.push({ start, text });
  }
  return segments;
}

function openingFromSegments(segments: TranscriptSegment[], maxSec: number): string {
  return segments
    .filter((s) => s.start < maxSec)
    .map((s) => s.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchCaptionText(baseUrl: string): Promise<TranscriptSegment[]> {
  const jsonUrl = baseUrl.includes("fmt=") ? baseUrl : `${baseUrl}&fmt=json3`;
  const res = await fetch(jsonUrl, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`caption fetch ${res.status}`);
  const raw = await res.text();
  if (raw.trim().startsWith("{")) return parseJson3Captions(raw);
  return parseXmlCaptions(raw);
}

export async function fetchOpeningTranscript(
  videoId: string,
  description = ""
): Promise<OpeningTranscript> {
  try {
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(12_000),
    });
    if (!pageRes.ok) throw new Error("watch page failed");
    const html = await pageRes.text();
    const player = extractPlayerResponse(html);
    if (player) {
      const tracks = getCaptionTracks(player);
      const preferred =
        tracks.find((t) => t.languageCode?.startsWith("en")) || tracks[0];
      if (preferred) {
        const segments = await fetchCaptionText(preferred.baseUrl);
        const text = openingFromSegments(segments, OPENING_SECONDS);
        if (text.length > 40) {
          return { text, source: "captions", durationSec: OPENING_SECONDS };
        }
      }
    }
  } catch (err) {
    console.error(`transcript ${videoId}:`, err instanceof Error ? err.message : err);
  }

  const descOpening = description.trim().slice(0, 600);
  if (descOpening.length > 80) {
    return {
      text: descOpening,
      source: "description",
      durationSec: 0,
    };
  }

  return { text: "", source: "unavailable", durationSec: 0 };
}
