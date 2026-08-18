"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, ListFilter } from "lucide-react";

export type ResearchSortMode = "relevance" | "views";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: ResearchSortMode;
  onChange: (value: ResearchSortMode) => void;
  minViews: string;
  maxViews: string;
  onRangeChange: (min: string, max: string) => void;
};

const OPTIONS: Array<{
  id: ResearchSortMode;
  label: string;
  description: string;
}> = [
  {
    id: "relevance",
    label: "Relevance",
    description: "YouTube search order — same prioritise as youtube.com",
  },
  {
    id: "views",
    label: "View count",
    description: "Highest views first (100M → 80M → 70M…)",
  },
];

/** Empty / invalid text = no bound. Commas allowed. */
export function parseViewBound(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, "");
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export function viewRangeInvalid(minRaw: string, maxRaw: string): boolean {
  const min = parseViewBound(minRaw);
  const max = parseViewBound(maxRaw);
  return min != null && max != null && min > max;
}

export function ResearchSortModal({
  open,
  onOpenChange,
  value,
  onChange,
  minViews,
  maxViews,
  onRangeChange,
}: Props) {
  const rangeError = viewRangeInvalid(minViews, maxViews);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 p-0 sm:max-w-md">
        <DialogHeader className="border-b border-[#efefef] px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <ListFilter className="size-4" />
            Search filters
          </DialogTitle>
          <DialogDescription>
            Choose how reference thumbnails are ordered — like YouTube&apos;s filter menu.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 px-3 py-3">
          <p className="px-2 pb-1 type-caption text-[#5c5e60]">Sort by</p>
          {OPTIONS.map((opt) => {
            const active = value === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onChange(opt.id);
                  onOpenChange(false);
                }}
                className={`flex w-full items-start gap-3 rounded-[12px] px-3 py-3 text-left transition-colors ${
                  active
                    ? "bg-[#171618] text-white"
                    : "hover:bg-[#f7f7f7] text-[#171618]"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block type-ui">{opt.label}</span>
                  <span
                    className={`mt-0.5 block type-caption ${
                      active ? "text-white/70" : "text-[#5c5e60]"
                    }`}
                  >
                    {opt.description}
                  </span>
                </span>
                {active ? <Check className="mt-0.5 size-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>

        <div className="space-y-2 border-t border-[#efefef] px-5 py-4">
          <p className="type-caption text-[#5c5e60]">View count range</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="min-views">Min views</Label>
              <Input
                id="min-views"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="Any"
                value={minViews}
                onChange={(e) => onRangeChange(e.target.value, maxViews)}
                aria-invalid={rangeError || undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max-views">Max views</Label>
              <Input
                id="max-views"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="Any"
                value={maxViews}
                onChange={(e) => onRangeChange(minViews, e.target.value)}
                aria-invalid={rangeError || undefined}
              />
            </div>
          </div>
          <p className={`type-caption ${rangeError ? "text-red-600" : "text-[#5c5e60]"}`}>
            {rangeError
              ? "Min views must be less than or equal to max views."
              : "Leave empty for no limit on that side."}
          </p>
        </div>

        <DialogFooter className="border-t border-[#efefef] px-5 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function researchSortLabel(mode: ResearchSortMode): string {
  return mode === "views" ? "Views" : "Relevance";
}
