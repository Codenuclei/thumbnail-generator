"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImagePlus, Trash2, WandSparkles } from "lucide-react";
import { compressFile, MAX_EDIT_ASSETS } from "@/lib/image-compress-client";
import { LayerEditorPanel } from "@/components/LayerEditorPanel";
import type { EditorHistory } from "@/lib/editor-history";
import { toast } from "sonner";

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
  hook: string;
  iterationNote: string;
  onIterationNoteChange: (v: string) => void;
  onIterate: () => void;
  loading: boolean;
  assets: EditorAsset[];
  onAssetsChange: (assets: EditorAsset[]) => void;
  iterations: IterationEntry[];
  onPickIteration: (entry: IterationEntry) => void;
  editorHistory: EditorHistory;
  onEditorHistoryChange: (history: EditorHistory) => void;
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
};

export function ThumbnailEditor({
  image,
  hook,
  iterationNote,
  onIterationNoteChange,
  onIterate,
  loading,
  assets,
  onAssetsChange,
  iterations,
  onPickIteration,
  editorHistory,
  onEditorHistoryChange,
  selectedLayerId,
  onSelectLayer,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;

    if (assets.length >= MAX_EDIT_ASSETS) {
      toast.error(`Max ${MAX_EDIT_ASSETS} edit assets`);
      e.target.value = "";
      return;
    }

    const room = MAX_EDIT_ASSETS - assets.length;
    const batch = Array.from(files).slice(0, room);
    const added: EditorAsset[] = [];

    for (const file of batch) {
      try {
        const compressed = await compressFile(file, { maxWidth: 1024, quality: 0.8 });
        added.push({
          id: `${Date.now()}-${file.name}`,
          name: file.name,
          mimeType: compressed.mimeType,
          data: compressed.data,
          previewUrl: compressed.previewUrl,
        });
      } catch {
        toast.error(`Failed to read ${file.name}`);
      }
    }

    if (added.length) onAssetsChange([...assets, ...added]);
    e.target.value = "";
  }

  function removeAsset(id: string) {
    onAssetsChange(assets.filter((a) => a.id !== id));
  }

  return (
    <Tabs defaultValue="layers" className="space-y-5">
      <TabsList variant="line" className="w-full grid grid-cols-2">
        <TabsTrigger value="layers">Layer editor</TabsTrigger>
        <TabsTrigger value="iterate">AI iterate</TabsTrigger>
      </TabsList>

      <TabsContent value="layers" className="mt-0">
        <LayerEditorPanel
          backgroundImage={image}
          hook={hook}
          history={editorHistory}
          selectedLayerId={selectedLayerId}
          onHistoryChange={onEditorHistoryChange}
          onSelectLayer={onSelectLayer}
        />
      </TabsContent>

      <TabsContent value="iterate" className="mt-0 space-y-5">
        <img
          src={image}
          alt="Edit target"
          className="w-full rounded-[8px] border border-[#efefef]"
        />

        <div className="space-y-2">
          <Label htmlFor="iterationNote">What should change?</Label>
          <Textarea
            id="iterationNote"
            className="min-h-[96px]"
            placeholder="brighter sky, bigger hook text"
            value={iterationNote}
            onChange={(e) => onIterationNoteChange(e.target.value)}
            rows={4}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>
              Replace / add assets{" "}
              <span className="font-normal text-[#5c5e60]">
                ({assets.length}/{MAX_EDIT_ASSETS})
              </span>
            </Label>
            <Button
              variant="outline"
              size="sm"
              disabled={assets.length >= MAX_EDIT_ASSETS}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="size-3.5" />
              Upload
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void handleFileUpload(e)}
            />
          </div>
          {assets.length === 0 ? (
            <p className="type-ui font-normal text-[#5c5e60]">
              Upload logos, product shots, or backgrounds (auto-compressed for API limits).
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="group relative overflow-hidden rounded-[8px] border border-[#efefef]"
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
                    aria-label={`Remove ${asset.name}`}
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
          <WandSparkles className="size-4" />
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
                  className="shrink-0 overflow-hidden rounded-[8px] border border-[#efefef] transition-colors hover:border-[#171618]"
                  onClick={() => onPickIteration(entry)}
                  title={entry.note || `v${entry.index}`}
                >
                  <img
                    src={entry.image}
                    alt={`v${entry.index}`}
                    className="aspect-video w-[96px] object-cover"
                  />
                  <span className="block bg-[#f7f7f7] py-1.5 text-center type-caption font-medium text-[#5c5e60]">
                    v{entry.index}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
