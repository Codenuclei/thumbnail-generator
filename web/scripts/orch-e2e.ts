/**
 * E2E orchestrator QA — 5 topics × 4 variants.
 * Run: bun scripts/orch-e2e.ts  (from web/)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(import.meta.dir, "..", "..", "output", "qa-loop-test");
mkdirSync(OUT, { recursive: true });

const TOPICS = [
  { slug: "campus-truth", topic: "Masters Union campus documentary", hook: "CAMPUS TRUTH" },
  { slug: "how-its-made", topic: "How alcohol is made in India", hook: "HOW IT'S MADE" },
  { slug: "valuation-lies", topic: "Startup valuation myths", hook: "VALUATION LIES" },
  { slug: "clean-power", topic: "Climate tech factories", hook: "CLEAN POWER" },
  { slug: "who-wins", topic: "IIT vs Ivy League", hook: "WHO WINS" },
];

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);

type Row = {
  slug: string;
  ok: number;
  total: number;
  ms?: number;
  error?: string;
  paths?: string[];
};

const results: Row[] = [];
const topics = only ? TOPICS.filter((t) => t.slug === only) : TOPICS;

for (const t of topics) {
  console.log(`\n=== ${t.slug}: ${t.topic} / ${t.hook} ===`);
  const started = Date.now();
  try {
    const res = await fetch("http://localhost:1382/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: t.topic,
        hook: t.hook,
        variantCount: 4,
        imageSize: "1K",
      }),
      signal: AbortSignal.timeout(280_000),
    });
    const text = await res.text();
    let json: {
      error?: string;
      images?: Array<{
        image?: string;
        verification?: { verdict?: string; score?: number };
      }>;
    };
    try {
      json = JSON.parse(text);
    } catch {
      console.error(`HTTP ${res.status} non-JSON:`, text.slice(0, 400));
      results.push({ slug: t.slug, ok: 0, total: 4, error: `non-json ${res.status}` });
      continue;
    }
    if (!res.ok) {
      console.error(`HTTP ${res.status}:`, json.error || text.slice(0, 300));
      results.push({
        slug: t.slug,
        ok: 0,
        total: 4,
        error: json.error || String(res.status),
      });
      continue;
    }
    const images = Array.isArray(json.images) ? json.images : [];
    let ok = 0;
    const paths: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const b64 = String(img.image || "").replace(/^data:[^;]+;base64,/, "");
      if (!b64) continue;
      const name = `orch-${t.slug}-v${i + 1}.png`;
      const path = join(OUT, name);
      writeFileSync(path, Buffer.from(b64, "base64"));
      paths.push(name);
      ok++;
      const v = img.verification;
      console.log(
        `  saved ${name} verify=${v?.verdict ?? "n/a"} score=${v?.score ?? "—"}`
      );
    }
    console.log(`  → ${ok}/4 in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    results.push({ slug: t.slug, ok, total: 4, ms: Date.now() - started, paths });
  } catch (err) {
    console.error("  FAIL:", err instanceof Error ? err.message : err);
    results.push({ slug: t.slug, ok: 0, total: 4, error: String(err) });
  }
}

writeFileSync(join(OUT, "orch-results.json"), JSON.stringify(results, null, 2));
console.log("\n=== SUMMARY ===");
for (const r of results) {
  console.log(`${r.slug}: ${r.ok}/4 ${r.error ? "ERR " + r.error : "ok"}`);
}
const allPass = results.length > 0 && results.every((r) => r.ok === 4);
process.exit(allPass ? 0 : 1);
