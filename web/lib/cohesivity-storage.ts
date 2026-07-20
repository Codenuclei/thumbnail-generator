import "server-only";
import { requireRuntimeEnv } from "@/lib/runtime-env";

const EDGE_BASE = "https://cohesivity.ai/edge/object-storage";
const USER_AGENT = "thumbnail-studio/1.0 (cohesivity-storage)";

export type StorageUploadResult = {
  ok: boolean;
  path: string;
  url: string;
  requestedPath?: string;
  requested_path?: string;
  path_was_mutated?: boolean;
};

function getAppKey(): string {
  return requireRuntimeEnv("COH_APPLICATION_KEY");
}

/** Upload bytes to Cohesivity object storage (R2-backed). */
export async function uploadToCohesivityStorage(
  path: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<StorageUploadResult> {
  const key = getAppKey();
  const url = `${EDGE_BASE}/${path.replace(/^\/+/, "")}?key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "User-Agent": USER_AGENT,
    },
    body: body instanceof Buffer ? body : Buffer.from(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Storage upload failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as StorageUploadResult;
  if (!data.ok || !data.path || !data.url) {
    throw new Error("Storage upload returned an invalid response");
  }
  return data;
}

export async function deleteFromCohesivityStorage(path: string): Promise<void> {
  const key = getAppKey();
  const url = `${EDGE_BASE}/${path.replace(/^\/+/, "")}?key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: { "User-Agent": USER_AGENT },
  });

  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => "");
    throw new Error(`Storage delete failed (${res.status}): ${text.slice(0, 200)}`);
  }
}
