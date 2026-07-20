/** Title-friendly unique share slug helpers (client + server safe). */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function slugifyTitle(input: string, maxLen = 36): string {
  const base = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, maxLen)
    .replace(/-+$/g, "");
  return base || "thumb";
}

export function shortShareId(length = 6): string {
  const bytes =
    typeof crypto !== "undefined" && "getRandomValues" in crypto
      ? crypto.getRandomValues(new Uint8Array(length))
      : Uint8Array.from({ length }, (_, i) => (Date.now() + i * 17) % 256);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

/** e.g. how-its-made-k7m2xp */
export function buildShareSlug(topic: string): string {
  return `${slugifyTitle(topic)}-${shortShareId()}`;
}

export function isValidShareSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug) && slug.length >= 4 && slug.length <= 64;
}

export function publicSharePath(slug: string): string {
  return `/s/${slug}`;
}

export function publicShareUrl(slug: string, origin?: string): string {
  const base =
    origin ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}${publicSharePath(slug)}`;
}
