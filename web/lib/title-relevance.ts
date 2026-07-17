/** Channel URL/handle parsing only — relevance is handled by Gemini dynamically. */

import { parseChannelInputs } from "@/lib/channel-videos";

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
