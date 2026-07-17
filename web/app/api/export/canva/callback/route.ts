import { NextResponse } from "next/server";
import { exchangeCanvaCode } from "@/lib/canva-connect";
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
  const redirectBack = `${origin}/?export=canva`;

  if (error) {
    return NextResponse.redirect(`${redirectBack}&status=error&message=${encodeURIComponent(error)}`);
  }

  const session = await readPkceSession("canva");
  const clientId = runtimeEnv("CANVA_CLIENT_ID");
  const clientSecret = runtimeEnv("CANVA_CLIENT_SECRET");
  if (!session || !code || state !== session.state || !clientId || !clientSecret) {
    return NextResponse.redirect(`${redirectBack}&status=error&message=invalid_oauth_state`);
  }

  try {
    const tokens = await exchangeCanvaCode({
      clientId,
      clientSecret,
      redirectUri: session.redirectUri,
      code,
      codeVerifier: session.verifier,
    });
    await saveOAuthTokens("canva", tokens);
    await clearPkceSession("canva");
    return NextResponse.redirect(`${redirectBack}&status=connected`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Canva OAuth failed";
    return NextResponse.redirect(`${redirectBack}&status=error&message=${encodeURIComponent(message)}`);
  }
}
