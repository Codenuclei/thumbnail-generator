export type InspirationVideo = {
  videoId: string;
  title: string;
  channel: string;
  viewCount: number;
  thumbnailUrl: string;
  publishedAt?: string;
  similarTo?: string;
  description?: string;
};

export type { VideoContentMapping } from "@/lib/video-mapping";

export type ThumbnailFeedback = {
  videoId: string;
  title: string;
  channel: string;
  rating: "like" | "dislike" | null;
  comment: string;
};

export function formatViews(views: number): string {
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K views`;
  return `${views} views`;
}
