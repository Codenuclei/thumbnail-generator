import "server-only";
import { cohesivitySql } from "@/lib/cohesivity-db";
import { uploadToCohesivityStorage } from "@/lib/cohesivity-storage";
import { buildShareSlug, isValidShareSlug } from "@/lib/share-slug";
import type { SharePayload } from "@/lib/studio-history";
import { runtimeEnv } from "@/lib/runtime-env";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS shares (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  storage_url TEXT,
  session_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

let schemaReady = false;

export type ShareRecord = {
  slug: string;
  title: string;
  topic: string;
  storage_path: string;
  storage_url: string | null;
  session_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function ensureSharesSchema(): Promise<void> {
  if (schemaReady) return;
  await cohesivitySql(SCHEMA_SQL);
  // Older rows may predate storage_url — add column if missing.
  try {
    await cohesivitySql("ALTER TABLE shares ADD COLUMN storage_url TEXT");
  } catch {
    // column already exists
  }
  await cohesivitySql(
    "CREATE INDEX IF NOT EXISTS idx_shares_session ON shares(session_id)"
  );
  await cohesivitySql(
    "CREATE INDEX IF NOT EXISTS idx_shares_updated ON shares(updated_at)"
  );
  schemaReady = true;
}

function shareTitle(topic: string, hook?: string): string {
  const t = topic.trim() || "Untitled";
  const h = (hook || "").trim();
  if (!h) return t.slice(0, 80);
  return `${t.slice(0, 48)} · ${h.slice(0, 28)}`.slice(0, 80);
}

async function uniqueSlug(topic: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const slug = buildShareSlug(topic);
    const existing = await cohesivitySql<{ slug: string }>(
      "SELECT slug FROM shares WHERE slug = ? LIMIT 1",
      [slug]
    );
    if (!existing.rows.length) return slug;
  }
  return buildShareSlug(`${topic}-${Date.now()}`);
}

function tenantCdnUrl(storagePath: string): string {
  const tenant =
    runtimeEnv("COH_TENANT_ID") ||
    runtimeEnv("COHESIVITY_TENANT_ID") ||
    "";
  if (!tenant) throw new Error("COH_TENANT_ID not configured");
  return `https://storage.cohesivity.ai/${encodeURIComponent(tenant)}/${storagePath
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/")}`;
}

async function fetchSharePayload(
  storagePath: string,
  storageUrl?: string | null
): Promise<SharePayload> {
  const candidates = [
    storageUrl?.trim() || "",
    tenantCdnUrl(storagePath),
  ].filter(Boolean);

  let lastStatus = 0;
  for (const url of candidates) {
    const upstream = await fetch(url, {
      headers: {
        "User-Agent": "thumbnail-studio/1.0 (share-read)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(60_000),
    });
    lastStatus = upstream.status;
    if (!upstream.ok) continue;
    return (await upstream.json()) as SharePayload;
  }

  throw new Error(`Share payload missing (${lastStatus || 404})`);
}

export async function createShareRecord(input: {
  payload: SharePayload;
  sessionId?: string;
  preferredSlug?: string;
}): Promise<{ slug: string; title: string; storagePath: string; storageUrl: string }> {
  await ensureSharesSchema();

  const topic = String(input.payload.topic || "").trim() || "Untitled";
  const title = shareTitle(topic, input.payload.hook);
  const slug =
    input.preferredSlug && isValidShareSlug(input.preferredSlug)
      ? input.preferredSlug.toLowerCase()
      : await uniqueSlug(topic);

  // Requested path is only a hint — Cohesivity mutates it with a hash suffix.
  const requestedPath = `shares/${slug}.json`;
  const body = Buffer.from(JSON.stringify(input.payload), "utf8");
  if (body.byteLength > 6 * 1024 * 1024) {
    throw new Error("Share payload too large — remove media photos and retry");
  }

  const uploaded = await uploadToCohesivityStorage(
    requestedPath,
    body,
    "application/json"
  );
  // CRITICAL: persist the hashed path + public CDN url from the upload response.
  const storagePath = uploaded.path;
  const storageUrl = uploaded.url;

  const now = new Date().toISOString();
  await cohesivitySql(
    `INSERT INTO shares (slug, title, topic, storage_path, storage_url, session_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       title = excluded.title,
       topic = excluded.topic,
       storage_path = excluded.storage_path,
       storage_url = excluded.storage_url,
       session_id = excluded.session_id,
       updated_at = excluded.updated_at`,
    [slug, title, topic, storagePath, storageUrl, input.sessionId || null, now, now]
  );

  return { slug, title, storagePath, storageUrl };
}

export async function getShareBySlug(
  slug: string
): Promise<{ record: ShareRecord; payload: SharePayload } | null> {
  if (!isValidShareSlug(slug)) return null;
  await ensureSharesSchema();

  const result = await cohesivitySql<ShareRecord>(
    "SELECT slug, title, topic, storage_path, storage_url, session_id, created_at, updated_at FROM shares WHERE slug = ? LIMIT 1",
    [slug.toLowerCase()]
  );
  const record = result.rows[0];
  if (!record) return null;

  const payload = await fetchSharePayload(record.storage_path, record.storage_url);
  return { record, payload };
}

export async function getShareSlugForSession(
  sessionId: string
): Promise<string | null> {
  if (!sessionId.trim()) return null;
  await ensureSharesSchema();
  const result = await cohesivitySql<{ slug: string }>(
    "SELECT slug FROM shares WHERE session_id = ? ORDER BY updated_at DESC LIMIT 1",
    [sessionId]
  );
  return result.rows[0]?.slug || null;
}
