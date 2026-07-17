import { NextResponse } from "next/server";
import { runtimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const STORAGE_CDN = "https://storage.cohesivity.ai";
const USER_AGENT = "thumbnail-studio/1.0 (storage-object-proxy)";

/**
 * Same-origin proxy for browser decode when needed.
 * Cohesivity edge only supports PUT/DELETE — reads must hit the public CDN URL.
 */
export async function GET(req: Request) {
  try {
    const path = new URL(req.url).searchParams.get("path")?.replace(/^\/+/, "");
    const download = new URL(req.url).searchParams.get("download");
    const allowedPrefix =
      path &&
      !path.includes("..") &&
      (path.startsWith("source-videos/") ||
        path.startsWith("youtube-stills/") ||
        path.startsWith("video-frames/") ||
        path.startsWith("exports/"));
    if (!allowedPrefix) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const tenant =
      runtimeEnv("COH_TENANT_ID") ||
      runtimeEnv("COHESIVITY_TENANT_ID") ||
      "";
    if (!tenant) {
      return NextResponse.json(
        { error: "COH_TENANT_ID not configured for storage reads" },
        { status: 503 }
      );
    }

    const upstream = await fetch(
      `${STORAGE_CDN}/${encodeURIComponent(tenant)}/${path
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/")}`,
      {
        headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
        signal: AbortSignal.timeout(110_000),
      }
    );

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return NextResponse.json(
        { error: `Storage fetch failed (${upstream.status}): ${text.slice(0, 160)}` },
        { status: upstream.status === 404 ? 404 : 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const buf = Buffer.from(await upstream.arrayBuffer());
    const filename =
      download?.replace(/[^\w.\-]+/g, "_").slice(0, 80) ||
      path.split("/").pop() ||
      "download.bin";
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Length": String(buf.length),
      "Cache-Control": "private, max-age=300",
      "Access-Control-Allow-Origin": "*",
    };
    if (download !== null) {
      headers["Content-Disposition"] = `attachment; filename="${filename}"`;
    }
    return new NextResponse(buf, { status: 200, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Storage proxy failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
