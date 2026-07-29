/**
 * CDP drift check: youtube.com UI vs our /api/search (light) vs raw searchYouTubeExact.
 * Run: bun scripts/drift-youtube-vs-research.ts
 */
import { searchYouTubeExact } from "../lib/ytsr-search";

const QUERY = process.argv[2] || "hyrox";
const APP = "http://localhost:1382";
const CDP = "http://127.0.0.1:9222";

type Row = { i: number; id: string; title: string; channel?: string; isShort?: boolean };

async function cdpCall(
  ws: WebSocket,
  id: number,
  method: string,
  params: Record<string, unknown> = {},
  sessionId?: string
) {
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${method}`)), 60_000);
    const onMsg = (ev: MessageEvent) => {
      let msg: any;
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data));
      } catch {
        return;
      }
      if (msg.id === id) {
        clearTimeout(timer);
        ws.removeEventListener("message", onMsg);
        resolve(msg);
      }
    };
    ws.addEventListener("message", onMsg);
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

async function scrapeYoutubeUi(query: string): Promise<Row[]> {
  const version = await fetch(`${CDP}/json/version`).then((r) => r.json());
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise<void>((res, rej) => {
    ws.addEventListener("open", () => res());
    ws.addEventListener("error", (e) => rej(e));
  });

  let id = 1;
  const created = await cdpCall(ws, id++, "Target.createTarget", { url: "about:blank" });
  const targetId = created.result.targetId as string;
  const attached = await cdpCall(ws, id++, "Target.attachToTarget", { targetId, flatten: true });
  const sessionId = attached.result.sessionId as string;

  const call = (method: string, params: Record<string, unknown> = {}) =>
    cdpCall(ws, id++, method, params, sessionId);

  await call("Page.enable");
  await call("Runtime.enable");
  const url =
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` +
    `&sp=CAA%253D&gl=IN&hl=en`;
  await call("Page.navigate", { url });

  let count = 0;
  for (let i = 0; i < 35; i++) {
    await Bun.sleep(1000);
    const ready = await call("Runtime.evaluate", {
      expression: `document.querySelectorAll('ytd-video-renderer').length`,
      returnByValue: true,
    });
    count = ready.result?.result?.value || 0;
    if (count >= 8) break;
  }

  const evalRes = await call("Runtime.evaluate", {
    expression: `(() => {
      const nodes = [...document.querySelectorAll('ytd-video-renderer')];
      return nodes.slice(0, 15).map((el, i) => {
        const a = el.querySelector('a#video-title') || el.querySelector('a#thumbnail');
        const href = a && a.href ? a.href : '';
        const m = href.match(/[?&]v=([\\w-]{11})/) || href.match(/\\/shorts\\/([\\w-]{11})/);
        const id = m ? m[1] : null;
        const title = ((a && (a.getAttribute('title') || a.textContent)) || '').trim().replace(/\\s+/g, ' ');
        const channelEl = el.querySelector('ytd-channel-name a');
        const channel = channelEl ? channelEl.textContent.trim() : '';
        const isShort = /\\/shorts\\//.test(href);
        return { i: i + 1, id, title, channel, isShort, href };
      }).filter((x) => x.id);
    })()`,
    returnByValue: true,
  });

  const rows = (evalRes.result?.result?.value || []) as Row[];
  await cdpCall(ws, id++, "Target.closeTarget", { targetId });
  ws.close();
  return rows;
}

async function researchApi(query: string) {
  const res = await fetch(`${APP}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: query, filterMode: "light", lightFilter: true }),
  });
  const data = await res.json();
  return {
    status: res.status,
    youtubeQuery: data.youtubeQuery as string,
    source: data.source as string,
    titles: ((data.results || []) as any[]).slice(0, 8).map((v, i) => ({
      i: i + 1,
      id: v.videoId as string,
      title: v.title as string,
      channel: v.channel as string,
    })),
  };
}

function compare(labelA: string, a: Row[], labelB: string, b: Row[]) {
  const aIds = a.map((x) => x.id);
  const bIds = b.map((x) => x.id);
  const overlap = aIds.filter((id) => bIds.includes(id));
  const pos = aIds.map((id, i) => ({
    pos: i + 1,
    [labelA]: id,
    [labelB]: bIds[i] || null,
    same: bIds[i] === id,
  }));
  return {
    overlapCount: overlap.length,
    positionExactMatches: pos.filter((p) => p.same).length,
    overlapIds: overlap,
    positionDiffs: pos,
  };
}

const [uiAll, exact, research] = await Promise.all([
  scrapeYoutubeUi(QUERY),
  searchYouTubeExact(QUERY, { target: 8 }),
  researchApi(QUERY),
]);

const uiLandscape = uiAll.filter((v) => !v.isShort).slice(0, 8);
const uiAllTop8 = uiAll.slice(0, 8);
const exactTop8 = exact.videos.slice(0, 8).map((v, i) => ({
  i: i + 1,
  id: v.videoId,
  title: v.title,
  channel: v.channel,
}));

const out = {
  query: QUERY,
  researchYoutubeQuery: research.youtubeQuery,
  researchSource: research.source,
  youtubeUiRawTop8: uiAllTop8,
  youtubeUiLandscapeTop8: uiLandscape,
  innertubeExactTop8: exactTop8,
  researchLightTop8: research.titles,
  drift: {
    uiLandscape_vs_innertube: compare("ui", uiLandscape, "innertube", exactTop8),
    uiLandscape_vs_research: compare("ui", uiLandscape, "research", research.titles),
    innertube_vs_research: compare("innertube", exactTop8, "research", research.titles),
  },
};

console.log(JSON.stringify(out, null, 2));
