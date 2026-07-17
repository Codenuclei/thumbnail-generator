import { NextResponse } from "next/server";
import {
  buildCanvaAuthorizeUrl,
  canvaConfigured,
  canvaExportAvailable,
  refreshCanvaToken,
} from "@/lib/canva-connect";
import { createOAuthState, createPkcePair, redirectUriFor } from "@/lib/oauth-pkce";
import {
  isTokenFresh,
  readOAuthTokens,
  saveOAuthTokens,
  savePkceSession,
} from "@/lib/oauth-session";
import { runtimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.searchParams.get("origin") || url.origin;

  if (!canvaConfigured()) {
    return NextResponse.json(
      {
        error:
          "Canva Connect OAuth is not configured. Set CANVA_CLIENT_ID and CANVA_CLIENT_SECRET for one-click designs, or use Send to Canva for PNG file handoff.",
      },
      { status: 503 }
    );
  }

  const clientId = runtimeEnv("CANVA_CLIENT_ID");
  if (!clientId) {
    return NextResponse.json({ error: "CANVA_CLIENT_ID missing" }, { status: 503 });
  }

  const { verifier, challenge } = createPkcePair();
  const state = createOAuthState();
  const redirectUri = redirectUriFor(origin, "canva");

  await savePkceSession("canva", {
    verifier,
    state,
    provider: "canva",
    redirectUri,
  });

  const authorizeUrl = buildCanvaAuthorizeUrl({
    clientId,
    redirectUri,
    codeChallenge: challenge,
    state,
  });

  return NextResponse.redirect(authorizeUrl);
}

export async function POST() {
  const oauthConfigured = canvaConfigured();
  const exportAvailable = canvaExportAvailable();

  if (!oauthConfigured) {
    return NextResponse.json({
      configured: exportAvailable,
      connected: false,
      oauth: false,
      handoff: exportAvailable ? "file" : "unavailable",
    });
  }

  let tokens = await readOAuthTokens("canva");
  const clientId = runtimeEnv("CANVA_CLIENT_ID");
  const clientSecret = runtimeEnv("CANVA_CLIENT_SECRET");
  if (!isTokenFresh(tokens) && tokens?.refreshToken && clientId && clientSecret) {
    try {
      tokens = await refreshCanvaToken({
        clientId,
        clientSecret,
        refreshToken: tokens.refreshToken,
      });
      await saveOAuthTokens("canva", tokens);
    } catch {
      // file handoff still works
    }
  }

  return NextResponse.json({
    configured: true,
    connected: isTokenFresh(tokens),
    oauth: true,
    handoff: isTokenFresh(tokens) ? "api" : "file",
  });
}

export async function DELETE() {
  const { clearOAuthTokens } = await import("@/lib/oauth-session");
  await clearOAuthTokens("canva");
  return NextResponse.json({ ok: true });
}
