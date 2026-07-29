const q = process.argv[2] || "hyrox";
const url =
  "https://www.youtube.com/results?search_query=" +
  encodeURIComponent(q) +
  "&sp=EgIQAQ%253D%253D";

const html = await fetch(url, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    Cookie: "SOCS=CAI",
  },
}).then((r) => r.text());

const m =
  html.match(/var ytInitialData = (\{.+?\});<\/script>/s) ||
  html.match(/ytInitialData"\] = (\{.+?\});<\/script>/s);

console.log(JSON.stringify({ htmlLen: html.length, hasInitial: Boolean(m) }));
if (!m) process.exit(0);

const data = JSON.parse(m[1]);
const contents =
  data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
    ?.contents || [];
const items: Array<{ id: string; title: string }> = [];
for (const c of contents) {
  const arr = c.itemSectionRenderer?.contents || [];
  for (const it of arr) {
    const v = it.videoRenderer;
    if (!v?.videoId) continue;
    const title =
      (v.title?.runs || []).map((r: { text?: string }) => r.text || "").join("") ||
      v.title?.simpleText ||
      "";
    items.push({ id: v.videoId, title });
  }
}
console.log(JSON.stringify(items.slice(0, 10), null, 2));
