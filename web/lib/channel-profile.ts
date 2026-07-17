import type { ScrapedVideo } from "@/lib/apify-youtube";
import { runtimeEnv } from "@/lib/runtime-env";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const ANALYSIS_MODEL = "gemini-2.5-flash";

export type ChannelEvidence = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  viewCount: number;
  channel: string;
};

export type ChannelProfile = {
  channelName: string;
  channelInput: string;
  topicClusters: string[];
  colorPalette: string[];
  typography: string;
  compositionPatterns: string[];
  motifs: string[];
  summary: string;
  evidence: ChannelEvidence[];
  analyzedAt: number;
};

const STORAGE_KEY = "thumbnail-studio-channel-profile";

export function loadChannelProfile(): ChannelProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChannelProfile) : null;
  } catch {
    return null;
  }
}

export function saveChannelProfile(profile: ChannelProfile): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore quota errors.
  }
}

export function channelProfilePromptBlock(profile: ChannelProfile): string {
  return [
    "MAIN CHANNEL PROFILE (match this recurring visual language when generating):",
    `Channel: ${profile.channelName}`,
    `Summary: ${profile.summary}`,
    profile.topicClusters.length ? `Topic clusters: ${profile.topicClusters.join(", ")}` : "",
    profile.colorPalette.length ? `Palette: ${profile.colorPalette.join(", ")}` : "",
    profile.typography ? `Typography: ${profile.typography}` : "",
    profile.compositionPatterns.length
      ? `Composition patterns: ${profile.compositionPatterns.join("; ")}`
      : "",
    profile.motifs.length ? `Motifs: ${profile.motifs.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function fallbackProfile(channelInput: string, videos: ScrapedVideo[]): ChannelProfile {
  const channelName = videos[0]?.channel || channelInput;
  return {
    channelName,
    channelInput,
    topicClusters: ["General"],
    colorPalette: ["#ffffff", "#111111", "#ffcc00"],
    typography: "Bold ALL CAPS sans-serif with dark outline",
    compositionPatterns: ["Center hero subject", "High contrast background"],
    motifs: ["Close-up faces", "Bold hook text"],
    summary: `Representative thumbnails from ${channelName} emphasize bold hooks and clear subjects.`,
    evidence: videos.slice(0, 8).map((v) => ({
      videoId: v.videoId,
      title: v.title,
      thumbnailUrl: v.thumbnailUrl,
      viewCount: v.viewCount,
      channel: v.channel,
    })),
    analyzedAt: Date.now(),
  };
}

export async function analyzeChannelProfile(
  channelInput: string,
  videos: ScrapedVideo[]
): Promise<ChannelProfile> {
  const apiKey = runtimeEnv("GEMINI_API_KEY") || runtimeEnv("GOOGLE_API_KEY");
  const evidence = videos.slice(0, 10).map((v) => ({
    videoId: v.videoId,
    title: v.title,
    thumbnailUrl: v.thumbnailUrl,
    viewCount: v.viewCount,
    channel: v.channel,
  }));

  if (!apiKey || !videos.length) {
    return fallbackProfile(channelInput, videos);
  }

  const catalog = videos
    .slice(0, 10)
    .map(
      (v, i) =>
        `${i + 1}. "${v.title}" (${v.viewCount.toLocaleString()} views)\n   THUMB: ${v.thumbnailUrl}`
    )
    .join("\n");

  const prompt = `You are a YouTube thumbnail strategist. Analyze the recurring visual language for channel "${channelInput}" using these representative videos and their public thumbnail URLs.

${catalog}

Return ONLY valid JSON:
{
  "channelName": "display channel name",
  "topicClusters": ["3-6 recurring topic themes"],
  "colorPalette": ["#hex or color names observed across thumbnails"],
  "typography": "font weight, case, outline, placement patterns",
  "compositionPatterns": ["4-6 layout/composition habits"],
  "motifs": ["4-6 recurring visual motifs"],
  "summary": "2-3 sentence synthesis of this channel's thumbnail language"
}`;

  const res = await fetch(`${GEMINI_API_BASE}/${ANALYSIS_MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) {
    console.error("Channel profile analysis failed:", await res.text());
    return fallbackProfile(channelInput, videos);
  }

  const data = await res.json();
  const text =
    data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") || "";

  try {
    const parsed = JSON.parse(text) as Partial<ChannelProfile>;
    return {
      channelName: parsed.channelName || videos[0]?.channel || channelInput,
      channelInput,
      topicClusters: parsed.topicClusters || [],
      colorPalette: parsed.colorPalette || [],
      typography: parsed.typography || "",
      compositionPatterns: parsed.compositionPatterns || [],
      motifs: parsed.motifs || [],
      summary: parsed.summary || "",
      evidence,
      analyzedAt: Date.now(),
    };
  } catch {
    return fallbackProfile(channelInput, videos);
  }
}
