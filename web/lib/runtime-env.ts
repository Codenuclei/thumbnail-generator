/**
 * Read server env at RUNTIME.
 * Next.js can inline `process.env.FOO` at build time to `undefined` if FOO
 * was missing during `next build` in Docker — never recover Railway secrets.
 */
export function runtimeEnv(name: string): string | undefined {
  const value = (process.env as Record<string, string | undefined>)[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

export function requireRuntimeEnv(name: string): string {
  const value = runtimeEnv(name);
  if (!value) {
    throw new Error(
      `${name} is not set on the server. Re-deploy with Railway env vars after runtime-env fix.`
    );
  }
  return value;
}
