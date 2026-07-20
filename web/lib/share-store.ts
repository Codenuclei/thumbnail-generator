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
  session_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function ensureSharesSchema(): Promise<void> {
  if (schemaReady) return;
  await cohesivitySql(SCHEMA_SQL);
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

async function fetchSharePayload(storagePath: string): Promise<SharePayload> {
  const tenant =
    runtimeEnv("COH_TENANT_ID") ||
    runtimeEnv("COHESIVITY_TENANT_ID") ||
    "";
  if (!tenant) throw new Error("COH_TENANT_ID not configured");

  const upstream = await fetch(
    `https://storage.cohesivity.ai/${encodeURIComponent(tenant)}/${storagePath
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/")}`,
    {
      headers: {
        "User-Agent": "thumbnail-studio/1.0 (share-read)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(60_000),
    }
  );
  if (!upstream.ok) {
    throw new Error(`Share payload missing (${upstream.status})`);
  }
  return (await upstream.json()) as SharePayload;
}

export async function createShareRecord(input: {
  payload: SharePayload;
  sessionId?: string;
  preferredSlug?: string;
}): Promise<{ slug: string; title: string; storagePath: string }> {
  await ensureSharesSchema();

  const topic = String(input.payload.topic || "").trim() || "Untitled";
  const title = shareTitle(topic, input.payload.hook);
  const slug =
    input.preferredSlug && isValidShareSlug(input.preferredSlug)
      ? input.preferredSlug.toLowerCase()
      : await uniqueSlug(topic);

  const storagePath = `shares/${slug}.json`;
  const body = Buffer.from(JSON.stringify(input.payload), "utf8");
  if (body.byteLength > 6 * 1024 * 1024) {
    throw new Error("Share payload too large — remove media photos and retry");
  }

  await uploadToCohesivityStorage(storagePath, body, "application/json");

  const now = new Date().toISOString();
  await cohesivitySql(
    `INSERT INTO shares (slug, title, topic, storage_path, session_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       title = excluded.title,
       topic = excluded.topic,
       storage_path = excluded.storage_path,
       session_id = excluded.session_id,
       updated_at = excluded.updated_at`,
    [slug, title, topic, storagePath, input.sessionId || null, now, now]
  );

  return { slug, title, storagePath };
}

export async function getShareBySlug(
  slug: string
): Promise<{ record: ShareRecord; payload: SharePayload } | null> {
  if (!isValidShareSlug(slug)) return null;
  await ensureSharesSchema();

  const result = await cohesivitySql<ShareRecord>(
    "SELECT slug, title, topic, storage_path, session_id, created_at, updated_at FROM shares WHERE slug = ? LIMIT 1",
    [slug.toLowerCase()]
  );
  const record = result.rows[0];
  if (!record) return null;

  const payload = await fetchSharePayload(record.storage_path);
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
