import { NextResponse } from "next/server";
import { uploadToCohesivityStorage } from "@/lib/cohesivity-storage";
import { exportDownloadUrl, requestOrigin } from "@/lib/export-download";
import { buildFigmaImportDocument } from "@/lib/figma-layer-model";
import {
  figmaConfigured,
  getFigmaUser,
  serverFigmaAccessToken,
} from "@/lib/figma-export-server";
import { isTokenFresh, readOAuthTokens } from "@/lib/oauth-session";
import type { EditorDocument } from "@/lib/editor-types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function decodeBase64Image(input: string): Buffer {
  const raw = input.replace(/^data:[^;]+;base64,/, "");
  return Buffer.from(raw, "base64");
}

async function ensurePublicImageUrl(
  imageUrl: string | undefined,
  imageBase64: string | undefined
): Promise<{ imageUrl: string; storagePath?: string }> {
  if (imageBase64) {
    const uploaded = await uploadToCohesivityStorage(
      `exports/figma-${Date.now()}.png`,
      decodeBase64Image(imageBase64),
      "image/png"
    );
    return { imageUrl: uploaded.url, storagePath: uploaded.path };
  }
  if (imageUrl?.trim()) {
    // Re-host data/blob URLs and same-origin assets so Figma can fetch them.
    if (imageUrl.startsWith("data:") || imageUrl.startsWith("blob:")) {
      throw new Error("Pass imageBase64 instead of data/blob URLs for Figma export");
    }
    return { imageUrl: imageUrl.trim() };
  }
  throw new Error("imageUrl or imageBase64 is required");
}

export async function POST(req: Request) {
  try {
    if (!figmaConfigured()) {
      return NextResponse.json(
        { error: "Figma export is not configured on the server" },
        { status: 503 }
      );
    }

    const body = (await req.json()) as {
      title?: string;
      topic?: string;
      hook?: string;
      mode?: "flat" | "layers";
      imageBase64?: string;
      imageUrl?: string;
      editorDocument?: EditorDocument;
    };

    const mode = body.mode === "layers" ? "layers" : "flat";
    const title = (body.title || "Thumbnail Studio export").slice(0, 120);
    const origin = requestOrigin(req);

    const resolved = await ensurePublicImageUrl(body.imageUrl, body.imageBase64);
    const { imageUrl, storagePath } = resolved;
    const pngName = `${title.replace(/[^\w.\-]+/g, "_").slice(0, 48) || "thumbnail"}.png`;
    const imageDownloadUrl = storagePath
      ? exportDownloadUrl(origin, storagePath, pngName)
      : imageUrl;

    const oauthTokens = await readOAuthTokens("figma");
    const accessToken = isTokenFresh(oauthTokens)
      ? oauthTokens!.accessToken
      : serverFigmaAccessToken();

    let user: { id: string; email: string } | null = null;
    if (accessToken && isTokenFresh(oauthTokens)) {
      try {
        user = await getFigmaUser(accessToken);
      } catch {
        user = null;
      }
    }

    const editorDoc = body.editorDocument || {
      version: 1 as const,
      backgroundImage: imageUrl,
      layers: [],
      brandAsset: null,
      defaultFont: {
        family: "Montserrat, Helvetica Neue, Arial, sans-serif",
        weight: 700,
        size: 8.5,
        align: "left" as const,
        fill: "#ffffff",
        stroke: "transparent",
        strokeWidth: 0,
        shadowColor: "transparent",
        shadowBlur: 0,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        letterSpacing: 4,
      },
    };

    // Prefer public CDN URL inside the layer model so the Figma plugin can fetch it.
    const layerModel = buildFigmaImportDocument({
      title,
      topic: body.topic,
      hook: body.hook,
      backgroundImageUrl: imageUrl,
      editorDoc: {
        ...editorDoc,
        backgroundImage: imageUrl,
      },
    });

    const layerJson = JSON.stringify(layerModel, null, 2);
    const layerUpload = await uploadToCohesivityStorage(
      `exports/figma-layer-${Date.now()}.json`,
      Buffer.from(layerJson, "utf8"),
      "application/json"
    );

    const layerDownloadUrl = exportDownloadUrl(
      origin,
      layerUpload.path,
      `${pngName.replace(/\.png$/i, "")}-layers.json`
    );

    return NextResponse.json({
      ok: true,
      provider: "figma",
      mode,
      handoff: mode === "layers" ? "plugin" : "file",
      connected: Boolean(accessToken),
      user,
      flatImageUrl: imageUrl,
      imageDownloadUrl,
      layerModelUrl: layerUpload.url,
      layerDownloadUrl,
      layerModel,
      pluginZipUrl: `${origin}/figma-plugin.zip`,
      pluginManifestUrl: `${origin}/figma-plugin/manifest.json`,
      instructions:
        mode === "layers"
          ? "1) Download Thumbnail Studio Import plugin zip once. 2) Figma → Plugins → Development → Import plugin from manifest… 3) Run plugin and paste the layer-model URL."
          : "PNG downloaded. In Figma: Place image / drag the file onto the canvas.",
      figmaNewFileUrl: "https://www.figma.com/new",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Figma export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
