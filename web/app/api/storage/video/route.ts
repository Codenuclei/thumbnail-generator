import { NextResponse } from "next/server";
import { uploadToCohesivityStorage } from "@/lib/cohesivity-storage";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_CHUNK_BYTES = 3.5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

type PartMeta = {
  index: number;
  path: string;
  url: string;
  bytes: number;
};

type Manifest = {
  uploadId: string;
  filename: string;
  contentType: string;
  totalBytes: number;
  totalChunks: number;
  parts: PartMeta[];
  createdAt: number;
};

function safeName(name: string): string {
  return name.replace(/[^a-z0-9._-]/gi, "_").slice(0, 80) || "video.mp4";
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const action = String(form.get("action") || "");
      if (action !== "chunk") {
        return NextResponse.json({ error: "Unsupported multipart action" }, { status: 400 });
      }

      const uploadId = String(form.get("uploadId") || "").replace(/[^a-z0-9_-]/gi, "");
      const index = Number(form.get("index"));
      const filename = safeName(String(form.get("filename") || "video.mp4"));
      const file = form.get("file");

      if (!uploadId || !Number.isFinite(index) || index < 0) {
        return NextResponse.json({ error: "uploadId and index required" }, { status: 400 });
      }
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "file is required" }, { status: 400 });
      }
      if (file.size > MAX_CHUNK_BYTES) {
        return NextResponse.json({ error: "Chunk exceeds 3.5MB limit" }, { status: 413 });
      }

      const path = `source-videos/${uploadId}/part-${String(index).padStart(4, "0")}-${filename}`;
      const bytes = Buffer.from(await file.arrayBuffer());
      const uploaded = await uploadToCohesivityStorage(
        path,
        bytes,
        file.type || "application/octet-stream"
      );

      return NextResponse.json({
        ok: true,
        index,
        path: uploaded.path,
        url: uploaded.url,
        bytes: file.size,
      });
    }

    const body = (await req.json()) as {
      action?: string;
      filename?: string;
      contentType?: string;
      size?: number;
      totalChunks?: number;
      uploadId?: string;
      parts?: PartMeta[];
    };

    const action = body.action || "";

    if (action === "init") {
      const size = Number(body.size || 0);
      const totalChunks = Number(body.totalChunks || 0);
      if (!size || size > MAX_VIDEO_BYTES) {
        return NextResponse.json(
          { error: "Video must be between 1 byte and 500MB" },
          { status: 400 }
        );
      }
      if (!totalChunks || totalChunks > 200) {
        return NextResponse.json({ error: "Invalid chunk count" }, { status: 400 });
      }

      const uploadId = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return NextResponse.json({
        ok: true,
        uploadId,
        folder: `source-videos/${uploadId}`,
        chunkBytes: MAX_CHUNK_BYTES,
      });
    }

    if (action === "complete") {
      const uploadId = String(body.uploadId || "").replace(/[^a-z0-9_-]/gi, "");
      const filename = safeName(String(body.filename || "video.mp4"));
      const totalChunks = Number(body.totalChunks || 0);
      const parts = Array.isArray(body.parts) ? body.parts : [];

      if (!uploadId) {
        return NextResponse.json({ error: "uploadId required" }, { status: 400 });
      }

      // Prefer client-reported parts if provided; otherwise rebuild paths convention.
      const resolvedParts: PartMeta[] =
        parts.length > 0
          ? parts
          : Array.from({ length: totalChunks }, (_, index) => ({
              index,
              path: `source-videos/${uploadId}/part-${String(index).padStart(4, "0")}-${filename}`,
              url: "",
              bytes: 0,
            }));

      const manifest: Manifest = {
        uploadId,
        filename,
        contentType: body.contentType || "video/mp4",
        totalBytes: Number(body.size || 0),
        totalChunks: resolvedParts.length || totalChunks,
        parts: resolvedParts,
        createdAt: Date.now(),
      };

      const manifestUpload = await uploadToCohesivityStorage(
        `source-videos/${uploadId}/manifest.json`,
        Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
        "application/json"
      );

      const primary = resolvedParts[0];
      return NextResponse.json({
        ok: true,
        uploadId,
        path: manifestUpload.path,
        url: primary?.url || manifestUpload.url,
        manifestUrl: manifestUpload.url,
        parts: resolvedParts,
        filename,
        contentType: manifest.contentType,
        totalBytes: manifest.totalBytes,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Video storage failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
