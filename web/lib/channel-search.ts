import type { ScrapedVideo } from "@/lib/apify-youtube";
import { searchInnerTube } from "@/lib/youtube-search";
import { parseChannelHandles, videoFromReferenceChannel } from "@/lib/title-relevance";

function toScraped(
  results: Array<{
    videoId: string;
    title: string;
    channel: string;
    viewCount: number;
    thumbnailUrl: string;
  }>
): ScrapedVideo[] {
  return results.map((r) => ({
    ...r,
    description: "",
    url: `https://www.youtube.com/watch?v=${r.videoId}`,
  }));
}

/** Collect candidate videos from reference channels — Gemini filters relevance later. */
export async function searchReferenceChannels(
  topic: string,
  channelsRaw: string
): Promise<ScrapedVideo[]> {
  const handles = parseChannelHandles(channelsRaw);
  if (!handles.length) return [];

  const queries = handles.flatMap((h) => [`${topic} ${h}`, `${topic} site:${h}`]);
  const batches = await Promise.all(queries.map((q) => searchInnerTube(q).catch(() => [])));

  const seen = new Set<string>();
  const results: ScrapedVideo[] = [];

  for (const batch of batches) {
    for (const video of toScraped(batch)) {
      if (seen.has(video.videoId)) continue;
      if (!videoFromReferenceChannel(video, handles)) continue;
      seen.add(video.videoId);
      results.push(video);
    }
  }

  return results.sort((a, b) => b.viewCount - a.viewCount).slice(0, 12);
}
