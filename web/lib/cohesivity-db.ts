import "server-only";
import { requireRuntimeEnv } from "@/lib/runtime-env";

const EDGE_BASE = "https://cohesivity.ai/edge/database";
const USER_AGENT = "thumbnail-studio/1.0 (cohesivity-database)";

export type DbQueryResult<T = Record<string, unknown>> = {
  rows: T[];
  rowCount: number;
};

function getAppKey(): string {
  return requireRuntimeEnv("COH_APPLICATION_KEY");
}

/** Run a single parameterized SQLite statement on Cohesivity D1. */
export async function cohesivitySql<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = []
): Promise<DbQueryResult<T>> {
  const key = getAppKey();
  const res = await fetch(`${EDGE_BASE}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ query, params }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Database query failed (${res.status}): ${text.slice(0, 240)}`);
  }

  const data = (await res.json()) as DbQueryResult<T>;
  return {
    rows: Array.isArray(data.rows) ? data.rows : [],
    rowCount: Number(data.rowCount) || 0,
  };
}
