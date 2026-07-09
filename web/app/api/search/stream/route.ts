import { NextRequest } from "next/server";
import { runSearchPipeline } from "@/lib/search-pipeline";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const title = String(body.title || body.topic || "").trim();
  const channels = body.channels ? String(body.channels) : undefined;
  const hook = body.hook ? String(body.hook).trim() : undefined;

  if (!title) {
    return new Response(JSON.stringify({ type: "error", message: "Title is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        await runSearchPipeline(title, {
          channels,
          hook,
          onProgress: (event) => send(event),
        });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Search failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
