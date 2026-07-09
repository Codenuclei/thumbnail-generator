/**
 * Quick Gemini connectivity check — reads key from .env.local, never prints it.
 * Run: bun run scripts/check-gemini.ts
 */

import { readFileSync } from "fs";
import { join } from "path";

function loadKey(): string {
  const envPath = join(import.meta.dir, "..", ".env.local");
  const raw = readFileSync(envPath, "utf8").replace(/^\uFEFF/, "");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("GEMINI_API_KEY=")) {
      return trimmed.slice("GEMINI_API_KEY=".length).trim();
    }
  }
  throw new Error("GEMINI_API_KEY not found in .env.local");
}

async function probe(model: string, body: object) {
  const key = loadKey();
  const prefix = key.slice(0, 4);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": key,
      },
      body: JSON.stringify(body),
    }
  );
  const text = await res.text();
  return { model, status: res.status, ok: res.ok, prefix, detail: text.slice(0, 500) };
}

const key = loadKey();
console.log("Key loaded:", key ? `yes (${key.length} chars, starts with "${key.slice(0, 4)}…")` : "no");
console.log(
  key.startsWith("AIza")
    ? "Key format looks like Google AI Studio."
    : "Key format does NOT look like Google AI Studio (expected AIza…)."
);

for (const model of ["gemini-2.5-flash", "gemini-2.5-flash-image", "gemini-3.1-flash-image"]) {
  const body =
    model.includes("image")
      ? {
          contents: [{ role: "user", parts: [{ text: "Simple red circle on white, 16:9 thumbnail test" }] }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: { aspectRatio: "16:9", imageSize: "1K" },
          },
        }
      : { contents: [{ role: "user", parts: [{ text: "Reply with exactly: GEMINI_OK" }] }] };

  const r = await probe(model, body);
  console.log(`\n[${model}] HTTP ${r.status}`);
  if (!r.ok) console.log(r.detail);
  else if (model.includes("image")) console.log("Image model responded (check for inline image data in payload).");
  else console.log("Text model OK.");
}
