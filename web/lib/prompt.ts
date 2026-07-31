import type { InspirationVideo } from "@/lib/inspiration";

const STYLE_CONTEXT =
  "This channel has 21 reference thumbnails. Collective style DNA: real-camera 16:9 YouTube thumbnails (Canon EOS R5 / 35mm feel); recurring young Indian woman (or bearded man with glasses) with strong but natural emotional expressions; Montserrat SemiBold/Bold, Bebas Neue, Anton, Oswald SemiBold, or Helvetica Neue Bold styling at medium-bold weight with deliberate 0.06–0.10em open tracking and solid fill (no stroke, outline, drop shadow, or glow); curiosity-gap hooks and shock stats; India-focused documentary/explainer topics; desaturated moody grade for serious topics, vivid but photographic grade for shock/comparison — never CGI gloss.";

const STYLE_SUFFIX =
  "YouTube thumbnail, 16:9 landscape, shot like documentary still photography: natural window lighting or practical location light, shallow depth of field, minor film grain, imperfect skin texture; a young Indian woman with a strong emotional facial expression as the focal subject; high-contrast but camera-real color grade; named medium-bold sans target with deliberate 0.06–0.10em open tracking and solid fill in yellow/red/white (no outline, drop shadow, or glow); short punchy curiosity-gap hook. Avoid hyperrealistic / 8k / unreal engine / masterpiece / highly detailed AI-slop language and look.";

const QUALITY_DIRECTIVES =
  "Design rules for maximum click-through: keep the layout clean and uncluttered; one dominant text hook only (2-4 words max), highly readable at phone size; subject face fills roughly one-third of the frame with exaggerated but photographic expression; limit background to one strong visual metaphor; use open letter spacing and high contrast without stroke or heavy black weight; avoid tiny text, watermarks, overcrowded collage, glowing HUD overlays, and plastic over-smoothed surfaces; looks like a top-performing Indian documentary YouTube channel thumbnail shot on location, not a movie poster or game render.";

export const COMPOSITION_HINTS: Record<string, string> = {
  center:
    "Center hero: subject close and centered, candid low-angle documentary framing, real environment behind with shallow depth of field.",
  split:
    "Split comparison: two or three vertical panels comparing contrasting ideas — each panel looks photographed, not symmetrically generated.",
  cutout:
    "Cutout composition: subject on left or right like a photo edit, scene fills the rest of frame.",
  data:
    "Data overlay: thin timeline line, node dots, era labels, or plunging graph on a real scene — no glowing sci-fi screens.",
};

export function buildPrompt(
  topic: string,
  hook?: string,
  composition?: string,
  inspirations?: InspirationVideo[]
): string {
  const parts = [STYLE_CONTEXT, `Video topic: ${topic.trim()}`];
  if (hook) {
    parts.push(
      `Paint this exact hook character-for-character exactly once: "${hook.trim()}". Use Montserrat SemiBold/Bold, Bebas Neue, Anton, Oswald SemiBold, or Helvetica Neue Bold at medium-bold weight with deliberate 0.06–0.10em open tracking and solid flat fill. Dynamically place it in clean negative space with ≥5% safe margins; never crop it or cover faces/products. No stroke, outline, drop shadow, glow, plate, banner, or scrim.`
    );
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
      `Use these top-performing YouTube thumbnails on similar channels as visual inspiration for layout, color energy, and text placement: ${refs}. Match their proven patterns while keeping this channel's documentary style. Never copy their wording or outline/stroke/shadow treatments.`
    );
  }
  parts.push(QUALITY_DIRECTIVES, STYLE_SUFFIX);
  return parts.join(" ");
}
