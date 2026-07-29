"use client";

import { useEffect, useRef, useState } from "react";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  type EditorDocument,
  type EditorLayer,
  sortLayers,
} from "@/lib/editor-types";
import { renderEditorDocument } from "@/lib/editor-canvas";

type Props = {
  document: EditorDocument;
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onMoveLayer: (id: string, x: number, y: number) => void;
};

export function ThumbnailCanvas({
  document,
  selectedLayerId,
  onSelectLayer,
  onMoveLayer,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; originX: number; originY: number } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    void renderEditorDocument(document).then((url) => {
      if (!cancelled) setPreview(url);
    });
    return () => {
      cancelled = true;
    };
  }, [document]);

  function handlePointerDown(e: React.PointerEvent, layer: EditorLayer) {
    e.stopPropagation();
    onSelectLayer(layer.id);
    dragRef.current = {
      id: layer.id,
      startX: e.clientX,
      startY: e.clientY,
      originX: layer.x,
      originY: layer.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    const dx = ((e.clientX - drag.startX) / rect.width) * 100;
    const dy = ((e.clientY - drag.startY) / rect.height) * 100;
    onMoveLayer(drag.id, drag.originX + dx, drag.originY + dy);
  }

  function handlePointerUp(e: React.PointerEvent) {
    dragRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if capture was already released.
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative aspect-video w-full overflow-hidden rounded-[12px] border border-[#efefef] bg-[#111111]"
      onClick={() => onSelectLayer(null)}
    >
      {preview ? (
        <img src={preview} alt="Editor canvas" className="h-full w-full object-contain" />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-[#5c5e60]">
          Rendering canvas…
        </div>
      )}

      {sortLayers(document.layers)
        .filter((layer) => layer.visible)
        .map((layer) => {
          const active = selectedLayerId === layer.id;
          return (
            <button
              key={layer.id}
              type="button"
              className={`absolute border-2 transition-colors ${
                active ? "border-[#38296c] bg-[#f5f0ff]" : "border-transparent hover:border-white/40"
              }`}
              style={{
                left: `${layer.x}%`,
                top: `${layer.y}%`,
                width: `${layer.width}%`,
                height: `${layer.height}%`,
              }}
              onPointerDown={(e) => handlePointerDown(e, layer)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onClick={(e) => e.stopPropagation()}
              title={layer.name}
            />
          );
        })}

      <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/50 px-2 py-1 text-[10px] text-white">
        {CANVAS_WIDTH}×{CANVAS_HEIGHT}
      </div>
    </div>
  );
}
