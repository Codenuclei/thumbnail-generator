/** Client helper: store a full video on Cohesivity object storage via chunked uploads. */

import { readJsonResponse } from "@/lib/safe-json";

export type StoredVideoAsset = {
  uploadId: string;
  path: string;
  url: string;
  manifestUrl?: string;
  parts: Array<{ index: number; path: string; url: string; bytes: number }>;
  filename: string;
  contentType: string;
  totalBytes: number;
};

const CHUNK_BYTES = 3 * 1024 * 1024;

export async function uploadVideoToCohesivityStorage(
  file: File,
  options?: { onProgress?: (uploadedBytes: number, totalBytes: number) => void }
): Promise<StoredVideoAsset> {
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_BYTES));
  const initRes = await fetch("/api/storage/video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "init",
      filename: file.name,
      contentType: file.type || "video/mp4",
      size: file.size,
      totalChunks,
    }),
  });
  const initData = await readJsonResponse<{
    error?: string;
    uploadId?: string;
  }>(initRes);
  if (!initRes.ok) throw new Error(initData.error || "Video upload init failed");

  const uploadId = String(initData.uploadId);
  const parts: Array<{ index: number; path: string; url: string; bytes: number }> = [];
  let uploadedBytes = 0;

  for (let index = 0; index < totalChunks; index++) {
    const start = index * CHUNK_BYTES;
    const end = Math.min(file.size, start + CHUNK_BYTES);
    const blob = file.slice(start, end);
    const form = new FormData();
    form.append("action", "chunk");
    form.append("uploadId", uploadId);
    form.append("index", String(index));
    form.append("filename", file.name);
    form.append("file", blob, `${file.name}.part${index}`);

    const chunkRes = await fetch("/api/storage/video", { method: "POST", body: form });
    const chunkData = await readJsonResponse<{
      error?: string;
      path?: string;
      url?: string;
      bytes?: number;
    }>(chunkRes);
    if (!chunkRes.ok) throw new Error(chunkData.error || `Chunk ${index} upload failed`);

    parts.push({
      index,
      path: String(chunkData.path),
      url: String(chunkData.url),
      bytes: Number(chunkData.bytes || blob.size),
    });
    uploadedBytes = end;
    options?.onProgress?.(uploadedBytes, file.size);
  }

  const completeRes = await fetch("/api/storage/video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "complete",
      uploadId,
      filename: file.name,
      contentType: file.type || "video/mp4",
      size: file.size,
      totalChunks,
      parts,
    }),
  });
  const completeData = await readJsonResponse<{
    error?: string;
    path?: string;
    url?: string;
    manifestUrl?: string;
  }>(completeRes);
  if (!completeRes.ok) throw new Error(completeData.error || "Video upload complete failed");

  return {
    uploadId,
    path: String(completeData.path),
    url: String(completeData.url),
    manifestUrl: completeData.manifestUrl ? String(completeData.manifestUrl) : undefined,
    parts,
    filename: file.name,
    contentType: file.type || "video/mp4",
    totalBytes: file.size,
  };
}

/** Upload a JPEG still (best frame) to object storage. */
export async function uploadFrameToCohesivityStorage(
  base64Data: string,
  mimeType: string,
  label: string
): Promise<{ path: string; url: string } | null> {
  try {
    const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: mimeType || "image/jpeg" });
    const form = new FormData();
    form.append("folder", "video-frames");
    form.append("file", blob, `${label.replace(/[^a-z0-9._-]/gi, "_").slice(0, 40) || "frame"}.jpg`);
    const res = await fetch("/api/storage/upload", { method: "POST", body: form });
    if (!res.ok) return null;
    const data = (await res.json()) as { path?: string; url?: string };
    if (!data.path || !data.url) return null;
    return { path: data.path, url: data.url };
  } catch {
    return null;
  }
}
