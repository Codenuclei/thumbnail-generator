"use client";

import { useMemo } from "react";
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
import { Badge } from "@/components/ui/badge";
import {
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  ImagePlus,
  Layers,
  Redo2,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { ThumbnailCanvas } from "@/components/ThumbnailCanvas";
import { ColorPicker } from "@/components/ColorPicker";
import {
  FONT_FAMILIES,
  createArrowLayer,
  createBadgeLayer,
  createImageLayer,
  createShapeLayer,
  createTextLayer,
  reorderLayer,
  type BrandAsset,
  type EditorDocument,
  type EditorLayer,
  type FontStyle,
} from "@/lib/editor-types";
import type { EditorHistory } from "@/lib/editor-history";
import { toast } from "sonner";

type Props = {
  backgroundImage: string | null;
  hook: string;
  history: EditorHistory;
  selectedLayerId: string | null;
  onHistoryChange: (history: EditorHistory) => void;
  onSelectLayer: (id: string | null) => void;
};

export function LayerEditorPanel({
  backgroundImage,
  hook,
  history,
  selectedLayerId,
  onHistoryChange,
  onSelectLayer,
}: Props) {
  const doc = history.present;
  const selected = doc.layers.find((layer) => layer.id === selectedLayerId) || null;

  const visibleLayers = useMemo(
    () => [...doc.layers].sort((a, b) => b.zIndex - a.zIndex),
    [doc.layers]
  );

  function setDocument(next: EditorDocument) {
    onHistoryChange({ ...history, present: next, future: [], past: [...history.past, history.present].slice(-40) });
  }

  function updateLayer(id: string, patch: Partial<EditorLayer>) {
    setDocument({
      ...doc,
      layers: doc.layers.map((layer) => (layer.id === id ? { ...layer, ...patch } as EditorLayer : layer)),
    });
  }

  function addLayer(layer: EditorLayer) {
    setDocument({ ...doc, layers: [...doc.layers, layer] });
    onSelectLayer(layer.id);
  }

  async function uploadBrandAsset(file: File) {
    const form = new FormData();
    form.append("folder", "brand-assets");
    form.append("file", file);
    const res = await fetch("/api/storage/upload", { method: "POST", body: form });
    if (!res.ok) {
      toast.error("Brand asset upload failed");
      return;
    }
    const data = (await res.json()) as { path: string; url: string };
    const previewUrl = URL.createObjectURL(file);
    const asset: BrandAsset = {
      id: `brand-${Date.now()}`,
      name: file.name,
      storagePath: data.path,
      storageUrl: data.url,
      previewUrl,
      mode: "logo",
      corner: "bottom-right",
      sizePercent: 12,
      opacity: 0.95,
      safeAreaPercent: 4,
    };
    setDocument({ ...doc, brandAsset: asset });
    toast.success("Brand asset saved to Cohesivity storage");
  }

  async function uploadImageLayer(file: File) {
    const form = new FormData();
    form.append("folder", "editor-assets");
    form.append("file", file);
    const res = await fetch("/api/storage/upload", { method: "POST", body: form });
    if (!res.ok) {
      toast.error("Image upload failed");
      return;
    }
    const data = (await res.json()) as { path: string; url: string };
    const previewUrl = URL.createObjectURL(file);
    addLayer(
      createImageLayer(previewUrl, {
        storagePath: data.path,
        storageUrl: data.url,
        name: file.name,
      })
    );
  }

  function updateDefaultFont(patch: Partial<FontStyle>) {
    setDocument({ ...doc, defaultFont: { ...doc.defaultFont, ...patch } });
  }

  function updateBrandAsset(patch: Partial<BrandAsset>) {
    if (!doc.brandAsset) return;
    setDocument({ ...doc, brandAsset: { ...doc.brandAsset, ...patch } });
  }

  return (
    <div className="space-y-5">
      <ThumbnailCanvas
        document={{
          ...doc,
          backgroundImage: doc.backgroundImage || backgroundImage,
        }}
        selectedLayerId={selectedLayerId}
        onSelectLayer={onSelectLayer}
        onMoveLayer={(id, x, y) => updateLayer(id, { x, y })}
      />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => addLayer(createTextLayer(hook || "HOOK TEXT", doc.defaultFont))}>
          <Layers className="size-3.5" />
          Text
        </Button>
        <Button size="sm" variant="outline" onClick={() => addLayer(createShapeLayer())}>
          Shape
        </Button>
        <Button size="sm" variant="outline" onClick={() => addLayer(createArrowLayer())}>
          Arrow
        </Button>
        <Button size="sm" variant="outline" onClick={() => addLayer(createBadgeLayer())}>
          Badge
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => document.getElementById("layer-image-upload")?.click()}
        >
          <ImagePlus className="size-3.5" />
          Image
        </Button>
        <input
          id="layer-image-upload"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadImageLayer(file);
            e.target.value = "";
          }}
        />
        <div className="ml-auto flex gap-2">
          <Button
            size="icon-sm"
            variant="outline"
            disabled={!history.past.length}
            aria-label="Undo"
            onClick={() => onHistoryChange({ ...history, present: history.past[history.past.length - 1], past: history.past.slice(0, -1), future: [history.present, ...history.future] })}
          >
            <Undo2 className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="outline"
            disabled={!history.future.length}
            aria-label="Redo"
            onClick={() => onHistoryChange({ ...history, present: history.future[0], past: [...history.past, history.present], future: history.future.slice(1) })}
          >
            <Redo2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <section className="space-y-3 rounded-[20px] border border-[#efefef] p-4">
        <div className="flex items-center justify-between">
          <Label>Brand logo / watermark</Label>
          <Button
            size="sm"
            variant="outline"
            onClick={() => document.getElementById("brand-asset-upload")?.click()}
          >
            <Upload className="size-3.5" />
            Upload
          </Button>
          <input
            id="brand-asset-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadBrandAsset(file);
              e.target.value = "";
            }}
          />
        </div>
        {doc.brandAsset ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <img
              src={doc.brandAsset.previewUrl || doc.brandAsset.storageUrl}
              alt={doc.brandAsset.name}
              className="aspect-square w-20 rounded border border-[#efefef] object-contain bg-white"
            />
            <div className="space-y-2">
              <Select
                value={doc.brandAsset.mode}
                onValueChange={(v) => v && updateBrandAsset({ mode: v as BrandAsset["mode"] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="logo">Logo</SelectItem>
                  <SelectItem value="watermark">Watermark</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={doc.brandAsset.corner}
                onValueChange={(v) => v && updateBrandAsset({ corner: v as BrandAsset["corner"] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="top-left">Top left</SelectItem>
                  <SelectItem value="top-right">Top right</SelectItem>
                  <SelectItem value="bottom-left">Bottom left</SelectItem>
                  <SelectItem value="bottom-right">Bottom right</SelectItem>
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Size %</Label>
                  <Input
                    type="number"
                    value={doc.brandAsset.sizePercent}
                    onChange={(e) => updateBrandAsset({ sizePercent: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Opacity</Label>
                  <Input
                    type="number"
                    step="0.05"
                    min={0}
                    max={1}
                    value={doc.brandAsset.opacity}
                    onChange={(e) => updateBrandAsset({ opacity: Number(e.target.value) })}
                  />
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setDocument({ ...doc, brandAsset: null })}>
                Remove brand asset
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#5c5e60]">
            Upload a reusable logo or watermark. Stored in Cohesivity object storage.
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-[20px] border border-[#efefef] p-4">
        <Label>Default font controls</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            value={doc.defaultFont.family}
            onValueChange={(v) => v && updateDefaultFont({ family: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FONT_FAMILIES.map((family) => (
                <SelectItem key={family} value={family}>
                  {family.split(",")[0]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(doc.defaultFont.weight)}
            onValueChange={(v) => v && updateDefaultFont({ weight: Number(v) })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[400, 500, 600, 700].map((weight) => (
                <SelectItem key={weight} value={String(weight)}>
                  {weight}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            value={doc.defaultFont.size}
            onChange={(e) => updateDefaultFont({ size: Number(e.target.value) })}
            placeholder="Size %"
          />
          <Input
            type="number"
            value={doc.defaultFont.letterSpacing ?? 4}
            onChange={(e) => updateDefaultFont({ letterSpacing: Number(e.target.value) })}
            placeholder="Tracking px"
            title="Open letter spacing (px)"
          />
          <Select
            value={doc.defaultFont.align}
            onValueChange={(v) => v && updateDefaultFont({ align: v as FontStyle["align"] })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="center">Center</SelectItem>
              <SelectItem value="right">Right</SelectItem>
            </SelectContent>
          </Select>
          <ColorPicker
            label="Fill"
            value={doc.defaultFont.fill}
            onChange={(fill) => updateDefaultFont({ fill })}
          />
          <ColorPicker
            label="Stroke"
            value={doc.defaultFont.stroke}
            onChange={(stroke) => updateDefaultFont({ stroke })}
          />
        </div>
      </section>

      <section className="space-y-3">
        <Label>Layers</Label>
        {visibleLayers.length === 0 ? (
          <p className="text-sm text-[#5c5e60]">Add text, shapes, arrows, badges, or images.</p>
        ) : (
          <div className="space-y-2">
            {visibleLayers.map((layer) => (
              <div
                key={layer.id}
                className={`flex items-center gap-2 rounded-[10px] border p-2 ${
                  selectedLayerId === layer.id ? "border-[#38296c]" : "border-[#efefef]"
                }`}
              >
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelectLayer(layer.id)}>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{layer.type}</Badge>
                    <span className="truncate text-sm">{layer.name}</span>
                  </div>
                </button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={layer.visible ? `Hide layer ${layer.name}` : `Show layer ${layer.name}`}
                  onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
                >
                  {layer.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Move layer ${layer.name} up`}
                  onClick={() =>
                    setDocument({ ...doc, layers: reorderLayer(doc.layers, layer.id, "up") })
                  }
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Move layer ${layer.name} down`}
                  onClick={() =>
                    setDocument({ ...doc, layers: reorderLayer(doc.layers, layer.id, "down") })
                  }
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Delete layer ${layer.name}`}
                  onClick={() => {
                    setDocument({ ...doc, layers: doc.layers.filter((l) => l.id !== layer.id) });
                    if (selectedLayerId === layer.id) onSelectLayer(null);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {selected?.type === "text" && (
        <section className="space-y-3 rounded-[20px] border border-[#efefef] p-4">
          <Label>Selected text layer</Label>
          <Textarea
            value={selected.text}
            onChange={(e) => updateLayer(selected.id, { text: e.target.value })}
            rows={3}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              type="number"
              value={selected.font.size}
              onChange={(e) =>
                updateLayer(selected.id, { font: { ...selected.font, size: Number(e.target.value) } })
              }
            />
            <Input
              type="number"
              step="0.05"
              min={0}
              max={1}
              value={selected.opacity}
              onChange={(e) => updateLayer(selected.id, { opacity: Number(e.target.value) })}
            />
            <ColorPicker
              label="Fill"
              value={selected.font.fill}
              onChange={(fill) =>
                updateLayer(selected.id, { font: { ...selected.font, fill } })
              }
            />
            <ColorPicker
              label="Stroke"
              value={selected.font.stroke}
              onChange={(stroke) =>
                updateLayer(selected.id, { font: { ...selected.font, stroke } })
              }
            />
          </div>
        </section>
      )}
    </div>
  );
}
