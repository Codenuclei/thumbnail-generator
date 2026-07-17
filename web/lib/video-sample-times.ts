/** Target candidate count for Gemini thumbnail-frame ranking (keeps payload under ~4MB). */
export const FULL_VIDEO_MAX_FRAMES = 12;

/** Smart sample timestamps across the full video for thumbnail-ready stills. */
export function fullVideoSampleTimes(
  durationSec: number,
  maxFrames = FULL_VIDEO_MAX_FRAMES
): number[] {
  const end = Math.max(0.1, durationSec - 0.2);
  if (!Number.isFinite(durationSec) || durationSec < 0.3) return [0.1];

  // Short clips: keep dense early samples.
  if (durationSec <= 15) {
    const times: number[] = [];
    for (let sec = 1; sec <= Math.floor(end); sec++) times.push(sec);
    if (!times.includes(Math.round(end * 10) / 10)) times.push(Math.round(end * 10) / 10);
    return times.slice(0, maxFrames);
  }

  const landmark = [
    Math.min(1, end),
    Math.min(3, end),
    Math.min(5, end),
    Math.min(10, end),
    Math.min(15, end),
    Math.min(30, end),
    durationSec * 0.15,
    durationSec * 0.25,
    durationSec * 0.35,
    durationSec * 0.45,
    durationSec * 0.55,
    durationSec * 0.65,
    durationSec * 0.75,
    durationSec * 0.85,
    durationSec * 0.92,
    end,
  ];

  // Even spacing so long videos are fully covered.
  const evenCount = Math.max(8, maxFrames - 4);
  for (let i = 0; i < evenCount; i++) {
    landmark.push((end * i) / Math.max(1, evenCount - 1));
  }

  const unique = [
    ...new Set(
      landmark
        .map((sec) => Math.max(0.08, Math.round(sec * 10) / 10))
        .filter((sec) => sec <= end + 0.05)
    ),
  ].sort((a, b) => a - b);

  if (unique.length <= maxFrames) return unique;

  return Array.from({ length: maxFrames }, (_, index) => {
    const sourceIndex = Math.round((index * (unique.length - 1)) / Math.max(1, maxFrames - 1));
    return unique[sourceIndex];
  });
}
