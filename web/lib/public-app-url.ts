import { runtimeEnv } from "@/lib/runtime-env";

const LOCAL_OR_BIND =
  /^(https?:\/\/)?(0\.0\.0\.0|127\.0\.0\.1|localhost)(:\d+)?$/i;

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function isUsablePublicOrigin(origin: string | undefined | null): boolean {
  if (!origin) return false;
  const trimmed = origin.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    const u = new URL(trimmed);
    if (LOCAL_OR_BIND.test(u.origin)) return false;
    if (u.hostname === "0.0.0.0") return false;
    return true;
  } catch {
    return false;
  }
}

/** Canonical public site origin for share links (never 0.0.0.0 / localhost binds). */
export function resolvePublicAppOrigin(input?: {
  requestOrigin?: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  clientOrigin?: string | null;
}): string {
  const fromEnv =
    runtimeEnv("PUBLIC_APP_URL") ||
    runtimeEnv("NEXT_PUBLIC_APP_URL") ||
    runtimeEnv("APP_URL") ||
    "";
  if (isUsablePublicOrigin(fromEnv)) return stripTrailingSlash(fromEnv);

  const host = (input?.forwardedHost || "").split(",")[0]?.trim();
  const proto = (input?.forwardedProto || "https").split(",")[0]?.trim() || "https";
  if (host && !/^(0\.0\.0\.0|127\.0\.0\.1|localhost)(:\d+)?$/i.test(host)) {
    const built = `${proto}://${host}`;
    if (isUsablePublicOrigin(built)) return stripTrailingSlash(built);
  }

  if (isUsablePublicOrigin(input?.requestOrigin || "")) {
    return stripTrailingSlash(String(input!.requestOrigin));
  }

  if (isUsablePublicOrigin(input?.clientOrigin || "")) {
    return stripTrailingSlash(String(input!.clientOrigin));
  }

  const tenant =
    runtimeEnv("COH_TENANT_ID") ||
    runtimeEnv("COHESIVITY_TENANT_ID") ||
    "fleet-dolphin-gaining";
  return `https://${tenant}.cohesivity.app`;
}

/** Browser-safe origin for copying share links. */
export function resolveClientPublicOrigin(): string {
  if (typeof window === "undefined") {
    return "https://fleet-dolphin-gaining.cohesivity.app";
  }
  const current = window.location.origin;
  if (isUsablePublicOrigin(current)) return current;
  return "https://fleet-dolphin-gaining.cohesivity.app";
}
