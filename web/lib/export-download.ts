/** Build same-origin download URLs for exported storage objects. */

export function exportDownloadUrl(
  origin: string,
  storagePath: string,
  filename: string
): string {
  const params = new URLSearchParams({
    path: storagePath.replace(/^\/+/, ""),
    download: filename,
  });
  return `${origin.replace(/\/$/, "")}/api/storage/object?${params.toString()}`;
}

export function requestOrigin(req: Request): string {
  const url = new URL(req.url);
  const forwarded = req.headers.get("x-forwarded-host");
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  if (forwarded) return `${proto}://${forwarded.split(",")[0].trim()}`;
  return url.origin;
}
