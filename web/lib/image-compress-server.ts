import "server-only";
import sharp from "sharp";

/** Server-side sharp compress — used in /api/generate before Gemini. */
export async function compressBase64Server(
  base64: string,
  mimeType = "image/png",
  options?: { maxWidth?: number; quality?: number }
): Promise<{ mimeType: string; data: string }> {
  // Smaller refs = faster Gemini uploads and fewer timeouts.
  const maxWidth = options?.maxWidth ?? 1024;
  const quality = options?.quality ?? 72;

  try {
    const input = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ""), "base64");
    if (!input.length) return { mimeType, data: base64 };

    const out = await sharp(input)
      .rotate()
      .resize({ width: maxWidth, height: maxWidth, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    return { mimeType: "image/jpeg", data: out.toString("base64") };
  } catch {
    return { mimeType, data: base64.replace(/^data:[^;]+;base64,/, "") };
  }
}

export async function compressAssetsForApi(
  assets: Array<{ mimeType: string; data: string; label?: string }>
): Promise<Array<{ mimeType: string; data: string; label?: string }>> {
  const limited = assets.slice(0, 3);
  return Promise.all(
    limited.map(async (a) => {
      const c = await compressBase64Server(a.data, a.mimeType, {
        maxWidth: 1024,
        quality: 72,
      });
      return { ...a, mimeType: c.mimeType, data: c.data };
    })
  );
}
