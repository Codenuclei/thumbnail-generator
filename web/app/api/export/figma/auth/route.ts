import { NextResponse } from "next/server";
import {
  buildFigmaAuthorizeUrl,
  figmaConfigured,
  figmaOAuthConfigured,
} from "@/lib/figma-export-server";
import { createOAuthState, redirectUriFor } from "@/lib/oauth-pkce";
import {
  isTokenFresh,
  readOAuthTokens,
  savePkceSession,
} from "@/lib/oauth-session";
import { runtimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.searchParams.get("origin") || url.origin;

  if (!figmaOAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          "Figma OAuth is optional. Export still works via Cohesivity + the Figma plugin. To enable Connect, set FIGMA_CLIENT_ID and FIGMA_CLIENT_SECRET.",
      },
      { status: 503 }
    );
  }

  const clientId = runtimeEnv("FIGMA_CLIENT_ID");
  if (!clientId) {
    return NextResponse.json({ error: "FIGMA_CLIENT_ID missing" }, { status: 503 });
  }

  const state = createOAuthState();
  const redirectUri = redirectUriFor(origin, "figma");

  await savePkceSession("figma", {
    verifier: "",
    state,
    provider: "figma",
    redirectUri,
  });

  const authorizeUrl = buildFigmaAuthorizeUrl({
    clientId,
    redirectUri,
    state,
  });

  return NextResponse.redirect(authorizeUrl);
}

export async function POST() {
  const configured = figmaConfigured();
  const oauthTokens = await readOAuthTokens("figma");
  const oauth = figmaOAuthConfigured();

  return NextResponse.json({
    configured,
    connected: isTokenFresh(oauthTokens),
    oauth,
    serverToken: Boolean(runtimeEnv("FIGMA_ACCESS_TOKEN")),
    handoff: configured ? "plugin" : "unavailable",
  });
}

export async function DELETE() {
  const { clearOAuthTokens } = await import("@/lib/oauth-session");
  await clearOAuthTokens("figma");
  return NextResponse.json({ ok: true });
}
