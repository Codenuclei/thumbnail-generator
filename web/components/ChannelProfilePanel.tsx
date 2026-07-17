"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles } from "lucide-react";
import type { ChannelProfile } from "@/lib/channel-profile";

type Props = {
  channelInput: string;
  topic: string;
  profile: ChannelProfile | null;
  loading: boolean;
  onChannelInputChange: (value: string) => void;
  onAnalyze: () => void;
  onClear: () => void;
};

const chipClass =
  "h-auto max-w-full min-w-0 whitespace-normal break-words text-left leading-snug";

export function ChannelProfilePanel({
  channelInput,
  topic,
  profile,
  loading,
  onChannelInputChange,
  onAnalyze,
  onClear,
}: Props) {
  return (
    <section className="min-w-0 space-y-4 overflow-hidden rounded-[20px] border border-[#efefef] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="type-ui text-[#171618]">Main channel profile</h3>
          <p className="mt-1 type-caption text-[#727578]">
            Summarize recurring thumbnail language from public channel evidence.
          </p>
        </div>
        {profile && (
          <Button size="sm" variant="ghost" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>

      <div className="min-w-0 space-y-2">
        <Label htmlFor="channelProfileInput">Channel URL or handle</Label>
        <div className="flex min-w-0 gap-2">
          <Input
            id="channelProfileInput"
            className="min-w-0 flex-1"
            value={channelInput}
            onChange={(e) => onChannelInputChange(e.target.value)}
            placeholder="@channel or https://youtube.com/@channel"
          />
          <Button
            className="shrink-0"
            onClick={onAnalyze}
            disabled={loading || !channelInput.trim()}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Analyze
          </Button>
        </div>
        <p className="type-caption text-[#727578]">
          Fetches public landscape videos directly from the channel URL or handle.
          {topic.trim() ? ` Topic context: ${topic.trim()}` : ""}
        </p>
      </div>

      {profile && (
        <div className="min-w-0 space-y-4 overflow-hidden rounded-[12px] border border-[#efefef] bg-[#f7f7f7] p-4">
          <div className="min-w-0">
            <p className="type-ui text-[#171618]">{profile.channelName}</p>
            <p className="mt-2 type-ui font-normal leading-relaxed break-words text-[#727578]">
              {profile.summary}
            </p>
          </div>

          <div className="flex min-w-0 flex-wrap gap-2">
            {profile.topicClusters.map((cluster) => (
              <Badge key={cluster} variant="secondary" className={chipClass}>
                {cluster}
              </Badge>
            ))}
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <Label className="text-xs text-[#727578]">Typography</Label>
              <p className="mt-1 text-sm break-words text-[#171618]">{profile.typography}</p>
            </div>
            <div className="min-w-0">
              <Label className="text-xs text-[#727578]">Palette</Label>
              <div className="mt-1 flex min-w-0 flex-wrap gap-1.5">
                {profile.colorPalette.map((color) => (
                  <span
                    key={color}
                    className="max-w-full break-all rounded-full border border-[#efefef] bg-white px-2 py-0.5 text-xs"
                  >
                    {color}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {profile.compositionPatterns.length > 0 && (
            <div className="min-w-0">
              <Label className="text-xs text-[#727578]">Composition patterns</Label>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[#727578]">
                {profile.compositionPatterns.map((item) => (
                  <li key={item} className="break-words">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {profile.motifs.length > 0 && (
            <div className="flex min-w-0 flex-wrap gap-2">
              {profile.motifs.map((motif) => (
                <Badge key={motif} variant="outline" className={chipClass}>
                  {motif}
                </Badge>
              ))}
            </div>
          )}

          <div className="min-w-0">
            <Label className="text-xs text-[#727578]">Evidence thumbnails</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {profile.evidence.map((item) => (
                <div
                  key={item.videoId}
                  className="min-w-0 overflow-hidden rounded-[8px] border border-[#efefef] bg-white"
                >
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title}
                    className="aspect-video w-full object-cover"
                  />
                  <p className="line-clamp-2 break-words p-2 text-[11px] text-[#727578]">
                    {item.title}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
