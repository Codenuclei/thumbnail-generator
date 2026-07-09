"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ImagePlus, Trash2, Wand2 } from "lucide-react";

export type EditorAsset = {
  id: string;
  name: string;
  mimeType: string;
  data: string;
  previewUrl: string;
};

type IterationEntry = {
  image: string;
  note: string;
  backend: string;
  index: number;
};

type Props = {
  image: string;
  iterationNote: string;
  onIterationNoteChange: (v: string) => void;
  onIterate: () => void;
  loading: boolean;
  assets: EditorAsset[];
  onAssetsChange: (assets: EditorAsset[]) => void;
  iterations: IterationEntry[];
  onPickIteration: (entry: IterationEntry) => void;
};

export function ThumbnailEditor({
  image,
  iterationNote,
  onIterationNoteChange,
  onIterate,
  loading,
  assets,
  onAssetsChange,
  iterations,
  onPickIteration,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.replace(/^data:[^;]+;base64,/, "");
        const asset: EditorAsset = {
          id: `${Date.now()}-${file.name}`,
          name: file.name,
          mimeType: file.type || "image/png",
          data: base64,
          previewUrl: result,
        };
        onAssetsChange([...assets, asset]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }

  function removeAsset(id: string) {
    onAssetsChange(assets.filter((a) => a.id !== id));
  }

  return (
    <div className="space-y-5">
      <img
        src={image}
        alt="Edit target"
        className="w-full rounded-[8px] border border-[#e8e8e8]"
      />

      <div className="space-y-2">
        <Label htmlFor="iterationNote">What should change?</Label>
        <Textarea
          id="iterationNote"
          className="min-h-[96px]"
          placeholder="e.g. brighter sky, bigger hook text, swap factory for vineyard scene…"
          value={iterationNote}
          onChange={(e) => onIterationNoteChange(e.target.value)}
          rows={4}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Replace / add assets</Label>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <ImagePlus className="size-3.5" />
            Upload
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>
        {assets.length === 0 ? (
          <p className="type-ui font-normal text-[#666666]">
            Upload logos, product shots, or backgrounds.
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className="group relative overflow-hidden rounded-[8px] border border-[#e8e8e8]"
              >
                <img
                  src={asset.previewUrl}
                  alt={asset.name}
                  className="aspect-square w-full object-cover"
                />
                <Badge variant="secondary" className="absolute bottom-1.5 left-1.5 max-w-[90%] truncate">
                  {asset.name}
                </Badge>
                <Button
                  variant="destructive"
                  size="icon-xs"
                  className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100"
                  onClick={() => removeAsset(asset.id)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button
        size="lg"
        className="w-full"
        disabled={loading || !iterationNote.trim()}
        onClick={onIterate}
      >
        <Wand2 className="size-4" />
        {loading ? "Applying…" : "Apply iteration"}
      </Button>

      {iterations.length > 1 && (
        <div className="space-y-3">
          <Label>Version history</Label>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {iterations.map((entry) => (
              <button
                key={entry.index}
                type="button"
                className="shrink-0 overflow-hidden rounded-[8px] border border-[#e8e8e8] transition-colors hover:border-[#181925]"
                onClick={() => onPickIteration(entry)}
                title={entry.note || `v${entry.index}`}
              >
                <img
                  src={entry.image}
                  alt={`v${entry.index}`}
                  className="aspect-video w-[96px] object-cover"
                />
                <span className="block bg-[#f5f5f5] py-1.5 text-center type-caption font-medium text-[#666666]">
                  v{entry.index}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
