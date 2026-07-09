import type { ScrapedVideo } from "@/lib/apify-youtube";
import { fetchOpeningTranscript } from "@/lib/youtube-transcript";

export type VideoContentMapping = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  channel: string;
  viewCount: number;
  openingScript: string;
  openingDurationSec: number;
  transcriptSource: "captions" | "description" | "unavailable";
  alignmentNote: string;
};

export async function buildVideoMappings(
  videos: ScrapedVideo[],
  topic: string,
  limit = 6
): Promise<VideoContentMapping[]> {
  const slice = videos.slice(0, limit);
  const mappings = await Promise.all(
    slice.map(async (v) => {
      const opening = await fetchOpeningTranscript(v.videoId, v.description);
      const alignmentNote = buildAlignmentNote(topic, v.title, opening.text);
      return {
        videoId: v.videoId,
        title: v.title,
        thumbnailUrl: v.thumbnailUrl,
        channel: v.channel,
        viewCount: v.viewCount,
        openingScript: opening.text,
        openingDurationSec: opening.durationSec,
        transcriptSource: opening.source,
        alignmentNote,
      };
    })
  );
  return mappings;
}

function buildAlignmentNote(topic: string, title: string, opening: string): string {
  if (!opening) return "No opening transcript — thumbnail judged on title + visual only.";
  const topicWords = topic.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const blob = `${title} ${opening}`.toLowerCase();
  const hits = topicWords.filter((w) => blob.includes(w)).length;
  if (hits >= 2) return "Strong title ↔ opening alignment with topic.";
  if (hits === 1) return "Partial alignment — verify thumbnail matches opening hook.";
  return "Weak text alignment — rely on visual style from thumbnail.";
}
