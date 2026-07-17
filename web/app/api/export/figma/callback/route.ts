import { NextResponse } from "next/server";
import { exchangeFigmaCode } from "@/lib/figma-export-server";
import {
  clearPkceSession,
  readPkceSession,
  saveOAuthTokens,
} from "@/lib/oauth-session";
import { runtimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const origin = `${url.protocol}//${url.host}`;
  const redirectBack = `${origin}/?export=figma`;

  if (error) {
    return NextResponse.redirect(`${redirectBack}&status=error&message=${encodeURIComponent(error)}`);
  }

  const session = await readPkceSession("figma");
  const clientId = runtimeEnv("FIGMA_CLIENT_ID");
  const clientSecret = runtimeEnv("FIGMA_CLIENT_SECRET");
  if (!session || !code || state !== session.state || !clientId || !clientSecret) {
    return NextResponse.redirect(`${redirectBack}&status=error&message=invalid_oauth_state`);
  }

  try {
    const tokens = await exchangeFigmaCode({
      clientId,
      clientSecret,
      redirectUri: session.redirectUri,
      code,
    });
    await saveOAuthTokens("figma", tokens);
    await clearPkceSession("figma");
    return NextResponse.redirect(`${redirectBack}&status=connected`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Figma OAuth failed";
    return NextResponse.redirect(`${redirectBack}&status=error&message=${encodeURIComponent(message)}`);
  }
}
