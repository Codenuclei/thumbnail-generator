"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { readJsonResponse } from "@/lib/safe-json";
import { stashShareHandoff } from "@/lib/share-handoff";
import type { SharePayload } from "@/lib/studio-history";

export default function ShareSlugPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const slug = String(params.slug || "");
    if (!slug) {
      setError("Missing share link");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/share/${encodeURIComponent(slug)}`);
        const data = await readJsonResponse<{
          error?: string;
          payload?: SharePayload;
          slug?: string;
        }>(res);
        if (!res.ok || !data.payload) {
          throw new Error(data.error || "Share not found");
        }
        if (cancelled) return;
        stashShareHandoff(data.payload, data.slug || slug);
        router.replace("/");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not open share");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.slug, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white px-6 text-center">
      {error ? (
        <>
          <p className="type-ui text-[#171618]">Share unavailable</p>
          <p className="type-caption text-[#5c5e60]">{error}</p>
          <a href="/" className="type-caption text-[#38296c] underline">
            Back to studio
          </a>
        </>
      ) : (
        <>
          <LoaderCircle className="size-5 animate-spin text-[#171618]" />
          <p className="type-ui text-[#171618]">Opening shared thumbnail…</p>
          <p className="type-caption text-[#5c5e60]">/{params.slug}</p>
        </>
      )}
    </main>
  );
}
