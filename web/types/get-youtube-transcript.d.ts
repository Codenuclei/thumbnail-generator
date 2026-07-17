declare module "get-youtube-transcript" {
  export type YouTubeTranscriptSegment = {
    start: number;
    duration: number;
    text: string;
  };

  export type YouTubeTranscriptResult = {
    text: string;
    segments: YouTubeTranscriptSegment[];
    language: string;
  };

  export function getTranscript(
    videoIdOrUrl: string,
    options?: { languages?: string[] }
  ): Promise<YouTubeTranscriptResult>;
}

