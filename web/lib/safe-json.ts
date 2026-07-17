/** Parse JSON responses; surface HTML/platform error pages clearly. */
export async function readJsonResponse<T = unknown>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();

  if (!text) {
    throw new Error(res.ok ? "Empty response" : `Request failed (${res.status})`);
  }

  const looksHtml =
    contentType.includes("text/html") ||
    text.trimStart().startsWith("<!DOCTYPE") ||
    text.trimStart().startsWith("<html");

  if (looksHtml) {
    throw new Error(
      res.status === 413 || res.status === 431
        ? "Upload too large for the server — try a shorter clip or re-encode smaller"
        : `Server returned an HTML error page (${res.status}). Retry or check the deploy.`
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Invalid JSON (${res.status}): ${text.replace(/\s+/g, " ").slice(0, 160)}`
    );
  }
}
