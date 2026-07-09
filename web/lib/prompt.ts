import type { InspirationVideo } from "@/lib/inspiration";

const STYLE_CONTEXT =
  "This channel has 21 reference thumbnails. Collective style DNA: photoreal cinematic 16:9 YouTube thumbnails; recurring young Indian woman (or bearded man with glasses) with exaggerated emotional expressions; bold ALL-CAPS sans-serif text in yellow/red/white with thick outlines; curiosity-gap hooks and shock stats; split-screen comparisons for contrasts; India-focused documentary/explainer topics; small corner logo badges; red/yellow curved annotation arrows; desaturated moody grade for serious topics, vivid saturated grade for shock/comparison.";

const STYLE_SUFFIX =
  "YouTube thumbnail, 16:9 landscape, photorealistic cinematic, a young Indian woman with a strong emotional facial expression as the focal subject, high contrast dramatic color grade, bold ALL-CAPS heavy sans-serif text with thick outline in yellow/red/white, short punchy curiosity-gap hook, small channel logo badge in a corner, professional YouTube documentary thumbnail composition, ultra sharp, eye-catching.";

const QUALITY_DIRECTIVES =
  "Design rules for maximum click-through: keep the layout clean and uncluttered; one dominant text hook only (2-4 words max), highly readable at phone size; subject face fills roughly one-third of the frame with exaggerated expression; limit background to one strong visual metaphor; use thick text stroke and high contrast; avoid tiny text, watermarks, or overcrowded collage; looks like a top-performing Indian documentary YouTube channel thumbnail, not a movie poster.";

export const COMPOSITION_HINTS: Record<string, string> = {
  center: "Center hero composition: subject close and centered, dramatic environment behind.",
  split: "Split comparison: two or three vertical panels comparing contrasting ideas.",
  cutout: "Cutout composition: subject on left or right, scene fills the rest of frame.",
  data: "Data overlay: thin timeline line, node dots, era labels, or plunging graph.",
};

export function buildPrompt(
  topic: string,
  hook?: string,
  composition?: string,
  inspirations?: InspirationVideo[]
): string {
  const parts = [STYLE_CONTEXT, `Video topic: ${topic.trim()}`];
  if (hook) {
    parts.push(`On-thumbnail text hook (render legibly): "${hook.toUpperCase()}"`);
  }
  if (composition && COMPOSITION_HINTS[composition]) {
    parts.push(COMPOSITION_HINTS[composition]);
  }
  if (inspirations?.length) {
    const refs = inspirations
      .slice(0, 10)
      .map(
        (item, index) =>
          `${index + 1}. "${item.title}" by ${item.channel} (${item.viewCount.toLocaleString()} views)`
      )
      .join("; ");
    parts.push(
      `Use these top-performing YouTube thumbnails on similar channels as visual inspiration for layout, color energy, text placement, and click-through appeal: ${refs}. Match their proven patterns while keeping this channel's documentary style.`
    );
  }
  parts.push(QUALITY_DIRECTIVES, STYLE_SUFFIX);
  return parts.join(" ");
}
