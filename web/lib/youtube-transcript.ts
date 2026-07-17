import type { YouTubeVideoContext } from "@/lib/video-intelligence-types";

const OPENING_SECONDS = 120;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

type CaptionTrack = { baseUrl: string; languageCode?: string };

type TranscriptSegment = { start: number; text: string; duration?: number };

type YouTubeOEmbed = {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
};

export type OpeningTranscript = {
  text: string;
  source: "captions" | "description" | "unavailable";
  durationSec: number;
};

function extractJsonObjectAfter(html: string, marker: string): string | null {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = html.indexOf("{", markerIndex + marker.length);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

function extractPlayerResponse(html: string): Record<string, unknown> | null {
  for (const marker of [
    "ytInitialPlayerResponse =",
    "ytInitialPlayerResponse=",
    "var ytInitialPlayerResponse =",
  ]) {
    const raw = extractJsonObjectAfter(html, marker);
    if (!raw) continue;
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // try legacy patterns
    }
  }

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

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .trim();
}

function htmlAttribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`${name}=["']([^"']*)["']`, "i"));
  return match?.[1] ? decodeHtml(match[1]) : "";
}

function pageMeta(html: string, names: string[]): string {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key =
      htmlAttribute(tag, "property") ||
      htmlAttribute(tag, "name") ||
      htmlAttribute(tag, "itemprop");
    if (wanted.has(key.toLowerCase())) {
      const content = htmlAttribute(tag, "content");
      if (content) return content;
    }
  }
  return "";
}

async function fetchYouTubeOEmbed(videoId: string): Promise<YouTubeOEmbed | null> {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`
      )}&format=json`,
      {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(12_000),
      }
    );
    return response.ok ? ((await response.json()) as YouTubeOEmbed) : null;
  } catch {
    return null;
  }
}

function usefulDescription(value: string): string {
  const description = value.trim();
  if (
    /^(enjoy the videos|enjoy videos|share your videos|youtube is a place)/i.test(
      description
    )
  ) {
    return "";
  }
  return description;
}

export function parseYouTubeVideoId(input: string): string | null {
  const value = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.endsWith("youtube.com")) {
      const fromQuery = url.searchParams.get("v");
      if (fromQuery && /^[A-Za-z0-9_-]{11}$/.test(fromQuery)) return fromQuery;
      const parts = url.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live"].includes(parts[0]) && parts[1]) {
        return /^[A-Za-z0-9_-]{11}$/.test(parts[1]) ? parts[1] : null;
      }
    }
  } catch {
    return null;
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

function fullTranscriptFromSegments(segments: TranscriptSegment[]): string {
  return segments
    .map((segment) => segment.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchCaptionText(baseUrl: string): Promise<TranscriptSegment[]> {
  let jsonUrl = baseUrl;
  try {
    const parsed = new URL(baseUrl);
    parsed.searchParams.set("fmt", "json3");
    jsonUrl = parsed.toString();
  } catch {
    jsonUrl = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}fmt=json3`;
  }
  const res = await fetch(jsonUrl, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`caption fetch ${res.status}`);
  const raw = await res.text();
  if (raw.trim().startsWith("{")) return parseJson3Captions(raw);
  return parseXmlCaptions(raw);
}

async function fetchTranscriptWithPoToken(videoId: string): Promise<TranscriptSegment[]> {
  try {
    const { getTranscript } = await import("get-youtube-transcript");
    const result = await getTranscript(videoId, { languages: ["en"] });
    return (result.segments || [])
      .map((segment) => ({
        start: Number(segment.start || 0),
        duration: Number(segment.duration || 0),
        text: String(segment.text || "").replace(/\s+/g, " ").trim(),
      }))
      .filter((segment) => segment.text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/no captions|transcript unavailable|login_required|video not available/i.test(message)) {
      console.error(`PoToken transcript ${videoId}:`, message);
    }
    return [];
  }
}

export async function fetchOpeningTranscript(
  videoId: string,
  description = ""
): Promise<OpeningTranscript> {
  try {
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    });
    if (!pageRes.ok) throw new Error("watch page failed");
    const html = await pageRes.text();
    const player = extractPlayerResponse(html);
    if (player) {
      const tracks = getCaptionTracks(player);
      const preferred =
        tracks.find((t) => t.languageCode?.startsWith("en")) || tracks[0];
      if (preferred) {
        try {
          const segments = await fetchCaptionText(preferred.baseUrl);
          const text = openingFromSegments(segments, OPENING_SECONDS);
          if (text.length > 40) {
            return { text, source: "captions", durationSec: OPENING_SECONDS };
          }
        } catch {
          // Description fallback keeps research mapping fast.
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

/**
 * Captions-first transcript fetch. Uses PoToken package before watch-page scrape,
 * so Railway can still succeed when YouTube returns 429 on HTML fetches.
 */
export async function fetchYouTubeTranscript(input: string): Promise<{
  videoId: string;
  title?: string;
  channel?: string;
  transcript: string;
  source: "captions" | "description" | "unavailable";
  characters: number;
  durationSec: number;
}> {
  const videoId = parseYouTubeVideoId(input);
  if (!videoId) throw new Error("Enter a valid public YouTube video URL");

  const oEmbed = await fetchYouTubeOEmbed(videoId);
  const title = oEmbed?.title;
  const channel = oEmbed?.author_name;

  const poSegments = await fetchTranscriptWithPoToken(videoId);
  if (poSegments.length) {
    const transcript = fullTranscriptFromSegments(poSegments);
    if (transcript.length > 40) {
      const last = poSegments[poSegments.length - 1];
      return {
        videoId,
        title,
        channel,
        transcript,
        source: "captions",
        characters: transcript.length,
        durationSec: Math.max(
          0,
          Math.round(Number(last?.start || 0) + Number(last?.duration || 0))
        ),
      };
    }
  }

  try {
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const player = extractPlayerResponse(html);
      if (player) {
        const tracks = getCaptionTracks(player);
        const preferred =
          tracks.find((t) => t.languageCode?.startsWith("en")) || tracks[0];
        if (preferred) {
          try {
            const segments = await fetchCaptionText(preferred.baseUrl);
            const transcript = fullTranscriptFromSegments(segments);
            if (transcript.length > 40) {
              const details = (player.videoDetails || {}) as Record<string, unknown>;
              return {
                videoId,
                title: String(details.title || title || `YouTube ${videoId}`),
                channel: String(details.author || channel || ""),
                transcript,
                source: "captions",
                characters: transcript.length,
                durationSec: Number(details.lengthSeconds || 0),
              };
            }
          } catch {
            // fall through to description
          }
        }

        const details = (player.videoDetails || {}) as Record<string, unknown>;
        const description = usefulDescription(String(details.shortDescription || ""));
        if (description.trim().length > 80) {
          return {
            videoId,
            title: String(details.title || title || `YouTube ${videoId}`),
            channel: String(details.author || channel || ""),
            transcript: description.trim(),
            source: "description",
            characters: description.trim().length,
            durationSec: Number(details.lengthSeconds || 0),
          };
        }
      }
    }
  } catch (err) {
    console.error(
      `transcript page ${videoId}:`,
      err instanceof Error ? err.message : err
    );
  }

  return {
    videoId,
    title,
    channel,
    transcript: "",
    source: "unavailable",
    characters: 0,
    durationSec: 0,
  };
}

/**
 * Fetch public metadata and the complete available caption track for a YouTube URL.
 * This intentionally does not download or proxy the video.
 */
export async function fetchYouTubeVideoContext(input: string): Promise<YouTubeVideoContext> {
  const videoId = parseYouTubeVideoId(input);
  if (!videoId) throw new Error("Enter a valid public YouTube video URL");

  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  if (!pageRes.ok) {
    const fallback = await fetchYouTubeTranscript(input);
    if (!fallback.transcript) {
      throw new Error(`YouTube page unavailable (${pageRes.status})`);
    }
    return {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: fallback.title || `YouTube ${videoId}`,
      channel: fallback.channel || "",
      description: "",
      durationSec: fallback.durationSec,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      transcript: fallback.transcript,
      transcriptSource: fallback.source,
      transcriptDurationSec: fallback.durationSec,
      visualEvidence: "public-thumbnail-only",
    };
  }

  const html = await pageRes.text();
  const player = extractPlayerResponse(html);
  if (!player) throw new Error("Could not read public YouTube metadata");
  const oEmbed = await fetchYouTubeOEmbed(videoId);

  const details = (player.videoDetails || {}) as Record<string, unknown>;
  const microformat = (player.microformat || {}) as Record<string, unknown>;
  const playerMicroformat =
    (microformat.playerMicroformatRenderer as Record<string, unknown> | undefined) || {};
  const thumbContainer = (details.thumbnail || {}) as Record<string, unknown>;
  const thumbnails =
    (thumbContainer.thumbnails as Array<{ url?: string; width?: number }>) || [];
  const bestThumb = [...thumbnails]
    .filter((item) => item.url)
    .sort((a, b) => Number(b.width || 0) - Number(a.width || 0))[0]?.url;

  const title = String(
    details.title ||
      playerMicroformat.title ||
      oEmbed?.title ||
      pageMeta(html, ["og:title", "title"]) ||
      `YouTube ${videoId}`
  );
  const channel = String(
    details.author || playerMicroformat.ownerChannelName || oEmbed?.author_name || ""
  );
  const description = usefulDescription(
    String(
    details.shortDescription ||
      playerMicroformat.description ||
      pageMeta(html, ["og:description", "description"])
    )
  );
  const durationSec = Number(details.lengthSeconds || playerMicroformat.lengthSeconds || 0);
  const thumbnailUrl =
    bestThumb ||
    oEmbed?.thumbnail_url ||
    pageMeta(html, ["og:image", "thumbnailUrl"]) ||
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

  let transcript = "";
  let transcriptSource: YouTubeVideoContext["transcriptSource"] = "unavailable";
  let transcriptDurationSec = 0;
  const tracks = getCaptionTracks(player);
  const preferred = tracks.find((track) => track.languageCode?.startsWith("en")) || tracks[0];

  if (preferred) {
    try {
      const segments = await fetchCaptionText(preferred.baseUrl);
      transcript = fullTranscriptFromSegments(segments);
      transcriptDurationSec = segments.length
        ? Math.ceil(segments[segments.length - 1].start)
        : durationSec;
      if (transcript.length > 40) transcriptSource = "captions";
    } catch (err) {
      console.error(
        `full transcript ${videoId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  if (!transcript) {
    const segments = await fetchTranscriptWithPoToken(videoId);
    transcript = fullTranscriptFromSegments(segments);
    transcriptDurationSec = segments.length
      ? Math.ceil(
          segments[segments.length - 1].start +
            Number(segments[segments.length - 1].duration || 0)
        )
      : 0;
    if (transcript.length > 40) transcriptSource = "captions";
  }

  if (!transcript && description.trim().length > 80) {
    transcript = description.trim();
    transcriptSource = "description";
    transcriptDurationSec = 0;
  }

  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title,
    channel,
    description,
    durationSec: Number.isFinite(durationSec) ? durationSec : 0,
    thumbnailUrl,
    transcript,
    transcriptSource,
    transcriptDurationSec,
    visualEvidence: "public-thumbnail-only",
  };
}
