import { NextResponse } from "next/server";
import { uploadToCohesivityStorage } from "@/lib/cohesivity-storage";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const folder = String(form.get("folder") || "studio").replace(/[^a-z0-9/_-]/gi, "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File exceeds 4MB limit" }, { status: 413 });
    }

    const contentType = file.type || "application/octet-stream";
    const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_").slice(0, 80) || "asset.bin";
    const path = `${folder}/${Date.now()}-${safeName}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const result = await uploadToCohesivityStorage(path, bytes, contentType);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
