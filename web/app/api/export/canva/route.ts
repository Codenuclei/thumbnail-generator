import { NextResponse } from "next/server";
import {
  canvaConfigured,
  canvaExportAvailable,
  exportThumbnailToCanva,
  refreshCanvaToken,
  uploadPngForExport,
  type CanvaExportMode,
} from "@/lib/canva-connect";
import { exportDownloadUrl, requestOrigin } from "@/lib/export-download";
import {
  isTokenFresh,
  readOAuthTokens,
  saveOAuthTokens,
} from "@/lib/oauth-session";
import { runtimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

function decodeBase64Image(input: string): Buffer {
  const raw = input.replace(/^data:[^;]+;base64,/, "");
  return Buffer.from(raw, "base64");
}

async function resolveImage(body: {
  imageUrl?: string;
  imageBase64?: string;
}): Promise<{ imageUrl: string; storagePath?: string } | null> {
  if (body.imageUrl?.trim()) return { imageUrl: body.imageUrl.trim() };
  if (!body.imageBase64) return null;
  const uploaded = await uploadPngForExport(
    decodeBase64Image(body.imageBase64),
    `canva-${Date.now()}.png`
  );
  return { imageUrl: uploaded.url, storagePath: uploaded.path };
}

export async function POST(req: Request) {
  try {
    if (!canvaExportAvailable()) {
      return NextResponse.json(
        { error: "Canva export needs Cohesivity storage or Canva Connect credentials" },
        { status: 503 }
      );
    }

    const body = (await req.json()) as {
      title?: string;
      imageBase64?: string;
      imageUrl?: string;
      mode?: CanvaExportMode;
      preferManual?: boolean;
    };

    const title = (body.title || "Thumbnail Studio export").slice(0, 120);
    const mode: CanvaExportMode = body.mode === "template" ? "template" : "flat";
    const resolved = await resolveImage(body);
    if (!resolved) {
      return NextResponse.json({ error: "imageUrl or imageBase64 is required" }, { status: 400 });
    }

    const { imageUrl, storagePath } = resolved;
    const origin = requestOrigin(req);
    const filename = `${title.replace(/[^\w.\-]+/g, "_").slice(0, 48) || "thumbnail"}.png`;
    const downloadUrl = storagePath
      ? exportDownloadUrl(origin, storagePath, filename)
      : imageUrl;

    const canvaCreateUrl = "https://www.canva.com/create?type=youtubeThumbnail";

    const clientId = runtimeEnv("CANVA_CLIENT_ID");
    const clientSecret = runtimeEnv("CANVA_CLIENT_SECRET");
    let tokens = canvaConfigured() ? await readOAuthTokens("canva") : null;
    if (!body.preferManual && tokens?.accessToken && clientId && clientSecret) {
      if (!isTokenFresh(tokens) && tokens.refreshToken) {
        tokens = await refreshCanvaToken({
          clientId,
          clientSecret,
          refreshToken: tokens.refreshToken,
        });
        await saveOAuthTokens("canva", tokens);
      }

      if (isTokenFresh(tokens)) {
        const result = await exportThumbnailToCanva({
          accessToken: tokens.accessToken,
          imageUrl,
          title,
          mode,
        });

        return NextResponse.json({
          ok: true,
          provider: "canva",
          handoff: "api",
          mode,
          designId: result.designId,
          editUrl: result.editUrl,
          imageUrl,
          downloadUrl,
          storagePath,
          canvaCreateUrl,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      provider: "canva",
      handoff: "file",
      mode,
      imageUrl,
      downloadUrl,
      storagePath,
      canvaCreateUrl,
      instructions:
        "PNG downloaded. In Canva: Uploads → Upload files → select the downloaded thumbnail, then place it on the YouTube thumbnail canvas.",
      oauthConfigured: canvaConfigured(),
      code: canvaConfigured() ? "not_connected" : "file_handoff",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Canva export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
