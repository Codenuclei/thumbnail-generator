/** Channel matching + topic relevance scoring for YouTube search ranking. */

import { parseChannelInputs } from "@/lib/channel-videos";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "into",
  "how",
  "its",
  "it's",
  "made",
  "video",
  "full",
  "best",
  "what",
  "when",
  "your",
  "about",
  "inside",
]);

export function parseChannelHandles(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return parseChannelInputs(raw)
    .map((input) => {
      if (input.browseId) return input.browseId.toLowerCase();
      const handle = input.resolveUrl.match(/@([^/?#\s]+)/i)?.[1];
      if (handle) return handle.toLowerCase();
      const channel = input.resolveUrl.match(/channel\/([^/?#\s]+)/i)?.[1];
      if (channel) return channel.toLowerCase();
      const custom = input.resolveUrl.match(/\/c\/([^/?#\s]+)/i)?.[1];
      if (custom) return custom.toLowerCase();
      const user = input.resolveUrl.match(/\/user\/([^/?#\s]+)/i)?.[1];
      if (user) return user.toLowerCase();
      return input.raw.replace(/^@/, "").toLowerCase();
    })
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeChannelName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isChannelIdHandle(handle: string): boolean {
  return /^uc[\w-]{10,}$/i.test(handle);
}

/** Match search results against parsed channel URLs/handles. */
export function videoFromReferenceChannel(
  video: { channel: string },
  handles: string[]
): boolean {
  if (!handles.length) return false;
  const normalized = normalizeChannelName(video.channel);
  const nameHandles = handles.filter((h) => !isChannelIdHandle(h));
  if (!nameHandles.length) return false;

  return nameHandles.some((h) => {
    const nh = normalizeChannelName(h);
    return normalized.includes(nh) || nh.includes(normalized);
  });
}

/** True when the video came from direct channel fetch for the given channel input. */
export function videoFromChannelFetch(
  video: { videoId: string },
  channelVideoIds: Set<string>
): boolean {
  return channelVideoIds.has(video.videoId);
}

/** Meaningful topic tokens for match scoring. */
export function topicTokens(topic: string): string[] {
  return topic
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * 0..1 topical match. Title hits weigh heaviest — YouTube recommendations also
 * lean on title/query overlap before popularity.
 */
export function scoreTopicMatch(
  topic: string,
  video: { title: string; description?: string; channel?: string }
): number {
  const tokens = topicTokens(topic);
  if (!tokens.length) return 0.5;

  const title = video.title.toLowerCase();
  const desc = (video.description || "").toLowerCase();
  const channel = (video.channel || "").toLowerCase();

  let score = 0;
  for (const token of tokens) {
    if (title.includes(token)) score += 1;
    else if (desc.includes(token)) score += 0.45;
    else if (channel.includes(token)) score += 0.2;
  }
  return score / tokens.length;
}

/**
 * Keep on-topic candidates. If too few pass the floor, fall back to the
 * highest-scoring titles rather than emptying the pool.
 */
export function filterByTopicRelevance<
  T extends { title: string; description?: string; channel?: string },
>(topic: string, videos: T[], minScore = 0.34): T[] {
  if (!videos.length) return [];
  const scored = videos
    .map((v) => ({ v, s: scoreTopicMatch(topic, v) }))
    .sort((a, b) => b.s - a.s);

  const kept = scored.filter((x) => x.s >= minScore);
  if (kept.length >= Math.min(8, videos.length)) {
    return kept.map((x) => x.v);
  }

  // Prefer anything with a non-zero match before padding with zeros.
  const nonzero = scored.filter((x) => x.s > 0);
  if (nonzero.length >= Math.min(6, videos.length)) {
    return nonzero.map((x) => x.v);
  }
  return scored.map((x) => x.v);
}

/** Relevance first, then views — mirrors YouTube search relevance more than pure popularity. */
export function rankByTopicThenViews<
  T extends { title: string; description?: string; channel?: string; viewCount: number },
>(topic: string, videos: T[]): T[] {
  return [...videos].sort((a, b) => {
    const rel = scoreTopicMatch(topic, b) - scoreTopicMatch(topic, a);
    if (Math.abs(rel) > 0.05) return rel;
    return b.viewCount - a.viewCount;
  });
}
