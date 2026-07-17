/** Max JPEG width sent to /api/generate (keeps JSON under Vercel ~4.5MB limit). */
export const CLIENT_MAX_IMAGE_WIDTH = 1280;
export const CLIENT_JPEG_QUALITY = 0.82;
export const MAX_EDIT_ASSETS = 4;

export type CompressedImage = {
  mimeType: string;
  data: string;
  previewUrl: string;
};

function stripDataUrl(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;]+;base64,/, "");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

/** Browser-side resize/compress for edit payloads and share links. */
export async function compressDataUrl(
  dataUrl: string,
  options?: { maxWidth?: number; maxHeight?: number; quality?: number }
): Promise<CompressedImage> {
  const maxWidth = options?.maxWidth ?? CLIENT_MAX_IMAGE_WIDTH;
  const maxHeight = options?.maxHeight ?? CLIENT_MAX_IMAGE_WIDTH;
  const quality = options?.quality ?? CLIENT_JPEG_QUALITY;

  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(img, 0, 0, w, h);

  const previewUrl = canvas.toDataURL("image/jpeg", quality);
  const data = stripDataUrl(previewUrl);
  return { mimeType: "image/jpeg", data, previewUrl };
}

export async function compressFile(
  file: File,
  options?: { maxWidth?: number; quality?: number }
): Promise<CompressedImage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Read failed"));
    reader.readAsDataURL(file);
  });
  return compressDataUrl(dataUrl, options);
}
