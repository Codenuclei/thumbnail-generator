"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { renderEditorDocument } from "@/lib/editor-canvas";
import { readJsonResponse } from "@/lib/safe-json";
import type { EditorDocument } from "@/lib/editor-types";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  topic: string;
  hook: string;
  image: string | null;
  editorDocument: EditorDocument;
  disabled?: boolean;
  onDownloadPng?: () => void;
  onExportDesignPack?: () => void;
  exportingDesignPack?: boolean;
};

async function triggerBrowserDownload(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export function ExportNavMenu({
  title,
  topic,
  hook,
  image,
  editorDocument,
  disabled = false,
  onDownloadPng,
  onExportDesignPack,
  exportingDesignPack = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [figmaReady, setFigmaReady] = useState(false);
  const [canvaReady, setCanvaReady] = useState(false);
  const [figmaMode, setFigmaMode] = useState<"layers" | "flat">("layers");
  const [exportingFigma, setExportingFigma] = useState(false);
  const [exportingCanva, setExportingCanva] = useState(false);
  const [lastLayerUrl, setLastLayerUrl] = useState<string | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const clearLeave = useCallback(() => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearLeave();
    leaveTimer.current = setTimeout(() => setOpen(false), 180);
  }, [clearLeave]);

  useEffect(() => {
    void Promise.all([
      fetch("/api/export/figma/auth", { method: "POST" })
        .then((r) => readJsonResponse<{ configured?: boolean }>(r))
        .catch(() => null),
      fetch("/api/export/canva/auth", { method: "POST" })
        .then((r) => readJsonResponse<{ configured?: boolean }>(r))
        .catch(() => null),
    ]).then(([figma, canva]) => {
      setFigmaReady(Boolean(figma?.configured));
      setCanvaReady(Boolean(canva?.configured));
    });
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      clearLeave();
    };
  }, [clearLeave]);

  async function resolveImageBase64(): Promise<string | null> {
    if (!image) return null;
    const flattened =
      editorDocument.layers.length > 0 || editorDocument.brandAsset
        ? await renderEditorDocument({
            ...editorDocument,
            backgroundImage: editorDocument.backgroundImage || image,
          })
        : image;
    return flattened.replace(/^data:[^;]+;base64,/, "");
  }

  function safeFilename(ext: string) {
    const base = (title || topic || "thumbnail").replace(/[^\w.\-]+/g, "_").slice(0, 48);
    return `${base || "thumbnail"}.${ext}`;
  }

  async function handleFigmaExport() {
    if (!image) {
      toast.error("Generate a thumbnail first");
      return;
    }
    setExportingFigma(true);
    try {
      const imageBase64 = await resolveImageBase64();
      const res = await fetch("/api/export/figma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || topic || "Thumbnail",
          topic,
          hook,
          imageBase64,
          mode: figmaMode,
          editorDocument,
        }),
      });
      const data = await readJsonResponse<{
        error?: string;
        layerModelUrl?: string;
        layerDownloadUrl?: string;
        flatImageUrl?: string;
        imageDownloadUrl?: string;
        figmaNewFileUrl?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || "Figma export failed");

      if (figmaMode === "layers" && (data.layerModelUrl || data.layerDownloadUrl)) {
        const layerUrl = data.layerModelUrl || data.layerDownloadUrl!;
        setLastLayerUrl(layerUrl);
        try {
          await navigator.clipboard.writeText(layerUrl);
        } catch {
          // shown below
        }
        window.open(data.figmaNewFileUrl || "https://www.figma.com/new", "_blank", "noopener,noreferrer");
        toast.success("Layer URL copied — run Thumbnail Studio Import and paste it");
      } else {
        const downloadUrl = data.imageDownloadUrl || data.flatImageUrl;
        if (!downloadUrl) throw new Error("No image URL");
        await triggerBrowserDownload(downloadUrl, safeFilename("png"));
        window.open(data.figmaNewFileUrl || "https://www.figma.com/new", "_blank", "noopener,noreferrer");
        toast.success("PNG downloaded — drag onto the Figma canvas");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Figma export failed");
    } finally {
      setExportingFigma(false);
    }
  }

  async function handleCanvaPng() {
    if (!image) {
      toast.error("Generate a thumbnail first");
      return;
    }
    setExportingCanva(true);
    try {
      const imageBase64 = await resolveImageBase64();
      const res = await fetch("/api/export/canva", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || topic || "Thumbnail",
          imageBase64,
          mode: "flat",
          preferManual: true,
        }),
      });
      const data = await readJsonResponse<{
        error?: string;
        downloadUrl?: string;
        imageUrl?: string;
        canvaCreateUrl?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || "Canva export failed");
      const downloadUrl = data.downloadUrl || data.imageUrl;
      if (!downloadUrl) throw new Error("No download URL");
      await triggerBrowserDownload(downloadUrl, safeFilename("png"));
      window.open(
        data.canvaCreateUrl || "https://www.canva.com/create?type=youtubeThumbnail",
        "_blank",
        "noopener,noreferrer"
      );
      toast.success("PNG downloaded — upload in Canva → Uploads");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Canva export failed");
    } finally {
      setExportingCanva(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => {
        clearLeave();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(open && "bg-[#f7f7f7]")}
      >
        Export
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[min(92vw,360px)] rounded-[12px] border border-[#efefef] bg-white p-3 shadow-[var(--shadow-md)]"
          onMouseEnter={clearLeave}
          onMouseLeave={scheduleClose}
        >
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="type-ui text-[#171618]">Figma</p>
              <Badge variant={figmaReady ? "default" : "outline"}>
                {figmaReady ? "Ready" : "Off"}
              </Badge>
            </div>

            <ol className="list-decimal space-y-1 pl-4 type-caption text-[#727578]">
              <li>
                Download{" "}
                <a
                  href="/figma-plugin.zip"
                  download="thumbnail-studio-figma-plugin.zip"
                  className="font-medium text-[#171618] underline-offset-2 hover:underline"
                >
                  plugin zip
                </a>
                , unzip
              </li>
              <li>
                Figma → Plugins → Development → Import plugin from{" "}
                <code className="text-[#171618]">manifest.json</code>
              </li>
              <li>Send layers → paste URL into Thumbnail Studio Import</li>
            </ol>

            <div className="flex flex-wrap gap-1.5">
              <a
                href="/figma-plugin.zip"
                download="thumbnail-studio-figma-plugin.zip"
                className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[#efefef] bg-white px-2.5 type-caption font-medium text-[#171618] hover:bg-[#f7f7f7]"
              >
                <Download className="size-3.5" />
                Plugin
              </a>
              <button
                type="button"
                className={cn(
                  "h-8 rounded-[8px] border px-2.5 type-caption font-medium transition-colors",
                  figmaMode === "layers"
                    ? "border-[#171618] bg-[#171618] text-white"
                    : "border-[#efefef] text-[#727578] hover:border-[#727578]"
                )}
                onClick={() => setFigmaMode("layers")}
              >
                Layers
              </button>
              <button
                type="button"
                className={cn(
                  "h-8 rounded-[8px] border px-2.5 type-caption font-medium transition-colors",
                  figmaMode === "flat"
                    ? "border-[#171618] bg-[#171618] text-white"
                    : "border-[#efefef] text-[#727578] hover:border-[#727578]"
                )}
                onClick={() => setFigmaMode("flat")}
              >
                Flat PNG
              </button>
            </div>

            <Button
              size="sm"
              className="h-8 w-full"
              disabled={disabled || !image || exportingFigma || !figmaReady}
              onClick={() => void handleFigmaExport()}
            >
              {exportingFigma ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ExternalLink className="size-3.5" />
              )}
              {figmaMode === "layers" ? "Send layers to Figma" : "PNG → Figma"}
            </Button>

            {lastLayerUrl && (
              <div className="space-y-1 rounded-[8px] border border-[#efefef] bg-[#f7f7f7] px-2 py-1.5">
                <p className="break-all type-caption text-[#727578] line-clamp-2">{lastLayerUrl}</p>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 type-caption font-medium text-[#171618] hover:underline"
                  onClick={() =>
                    void navigator.clipboard.writeText(lastLayerUrl).then(
                      () => toast.success("URL copied"),
                      () => toast.error("Copy failed")
                    )
                  }
                >
                  <Copy className="size-3" />
                  Copy layer URL
                </button>
              </div>
            )}

            <div className="border-t border-[#efefef] pt-2 space-y-1.5">
              <p className="type-caption font-medium text-[#171618]">Also</p>
              <div className="flex flex-col gap-1">
                {onDownloadPng && (
                  <button
                    type="button"
                    disabled={!image}
                    className="flex h-8 items-center gap-2 rounded-[8px] px-2 text-left type-caption text-[#171618] hover:bg-[#f7f7f7] disabled:opacity-40"
                    onClick={onDownloadPng}
                  >
                    <Download className="size-3.5 text-[#727578]" />
                    Download PNG
                  </button>
                )}
                {onExportDesignPack && (
                  <button
                    type="button"
                    disabled={!image || exportingDesignPack}
                    className="flex h-8 items-center gap-2 rounded-[8px] px-2 text-left type-caption text-[#171618] hover:bg-[#f7f7f7] disabled:opacity-40"
                    onClick={onExportDesignPack}
                  >
                    {exportingDesignPack ? (
                      <Loader2 className="size-3.5 animate-spin text-[#727578]" />
                    ) : (
                      <Package className="size-3.5 text-[#727578]" />
                    )}
                    Design pack
                  </button>
                )}
                <button
                  type="button"
                  disabled={disabled || !image || exportingCanva || !canvaReady}
                  className="flex h-8 items-center gap-2 rounded-[8px] px-2 text-left type-caption text-[#171618] hover:bg-[#f7f7f7] disabled:opacity-40"
                  onClick={() => void handleCanvaPng()}
                >
                  {exportingCanva ? (
                    <Loader2 className="size-3.5 animate-spin text-[#727578]" />
                  ) : (
                    <Download className="size-3.5 text-[#727578]" />
                  )}
                  Canva (PNG upload)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
