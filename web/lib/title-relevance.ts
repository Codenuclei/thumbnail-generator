/** Channel URL/handle parsing only — relevance is handled by Gemini dynamically. */

export function parseChannelHandles(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[\n,]+/)
    .map((line) => {
      const trimmed = line.trim();
      const at = trimmed.match(/@([^/?#\s]+)/i);
      if (at) return at[1].toLowerCase();
      const channel = trimmed.match(/channel\/([^/?#\s]+)/i);
      if (channel) return channel[1].toLowerCase();
      const c = trimmed.match(/\/c\/([^/?#\s]+)/i);
      if (c) return c[1].toLowerCase();
      return "";
    })
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeChannelName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function videoFromReferenceChannel(
  video: { channel: string },
  handles: string[]
): boolean {
  if (!handles.length) return false;
  const normalized = normalizeChannelName(video.channel);
  return handles.some((h) => {
    const nh = normalizeChannelName(h);
    return normalized.includes(nh) || nh.includes(normalized);
  });
}
