"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import {
  createDirection,
  type CreativeDirection,
} from "@/lib/creative-directions";
import {
  DIRECTION_MODEL_GLOBAL,
  IMAGE_MODELS,
  imageModelLabel,
  type ImageModelOption,
} from "@/lib/image-models";

type Props = {
  directions: CreativeDirection[];
  onChange: (next: CreativeDirection[]) => void;
  globalHook: string;
  /** Global Generate-stage model (for “Use global” label). */
  globalModel?: string;
  /** Live OpenRouter catalog; falls back to IMAGE_MODELS. */
  modelOptions?: ImageModelOption[];
};

export function DirectionsPanel({
  directions,
  onChange,
  globalHook,
  globalModel = "default",
  modelOptions = IMAGE_MODELS,
}: Props) {
  function update(id: string, patch: Partial<CreativeDirection>) {
    onChange(directions.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  const catalog = modelOptions.length ? modelOptions : IMAGE_MODELS;
  const globalLabel = imageModelLabel(globalModel, catalog);

  return (
    <section className="space-y-3 rounded-[20px] border border-[#efefef] bg-[#f7f7f7] p-4 sm:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="type-ui text-[#171618]">Directions</p>
          <p className="mt-0.5 type-caption text-[#5c5e60]">
            Separate briefs, model, and thumbnail text per version. Generate creates thumbs for each.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={directions.length >= 6}
          onClick={() =>
            onChange([...directions, createDirection(directions.length + 1)])
          }
        >
          <Plus className="size-3.5" />
          Add direction
        </Button>
      </div>

      <div className="space-y-3">
        {directions.map((dir, index) => (
          <div
            key={dir.id}
            className="space-y-2 rounded-[16px] border border-[#efefef] bg-white p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <Input
                value={dir.name}
                onChange={(e) => update(dir.id, { name: e.target.value })}
                className="h-8 max-w-[220px] type-ui"
                placeholder={`Direction ${index + 1}`}
              />
              <div className="flex items-center gap-2">
                <Select
                  value={String(dir.variantCount)}
                  onValueChange={(v) =>
                    update(dir.id, { variantCount: Number(v) || 2 })
                  }
                >
                  <SelectTrigger className="h-8 w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} thumb{n === 1 ? "" : "s"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={directions.length <= 1}
                  onClick={() => onChange(directions.filter((d) => d.id !== dir.id))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="type-caption text-[#5c5e60]">Brief for this version</Label>
              <Textarea
                value={dir.brief}
                onChange={(e) => update(dir.id, { brief: e.target.value })}
                rows={3}
                placeholder="Creative brief unique to this direction…"
                className="resize-y type-ui font-normal"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="type-caption text-[#5c5e60]">
                Thumbnail text{" "}
                <span className="font-normal text-[var(--text-tertiary)]">
                  optional override
                </span>
              </Label>
              <Input
                value={dir.hook || ""}
                onChange={(e) => update(dir.id, { hook: e.target.value })}
                placeholder={
                  globalHook.trim()
                    ? `Default: ${globalHook}`
                    : "Leave blank to use global thumbnail text"
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="type-caption text-[#5c5e60]">
                Image model{" "}
                <span className="font-normal text-[var(--text-tertiary)]">
                  optional override
                </span>
              </Label>
              <Select
                value={dir.model?.trim() ? dir.model : DIRECTION_MODEL_GLOBAL}
                onValueChange={(v) =>
                  update(dir.id, {
                    model: !v || v === DIRECTION_MODEL_GLOBAL ? "" : v,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DIRECTION_MODEL_GLOBAL}>
                    Use global · {globalLabel}
                  </SelectItem>
                  {catalog.filter((m) => m.value !== "default").map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.shortLabel || m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
