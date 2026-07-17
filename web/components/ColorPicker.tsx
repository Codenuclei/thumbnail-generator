"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GripVertical, X } from "lucide-react";
import { cn } from "@/lib/utils";

const PANEL_W = 260;
const PANEL_H = 320;
const VIEW_PAD = 12;
const POS_STORAGE_KEY = "ts-color-picker-pos-v1";

type PanelPos = { left: number; top: number };

function normalizeHex(value: string): string {
  const raw = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const [, a, b, c] = raw;
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return "#000000";
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = normalizeHex(hex).slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")}`;
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  };
}

function hsvToHex(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

function clampPanel(left: number, top: number): PanelPos {
  if (typeof window === "undefined") return { left, top };
  const maxL = Math.max(VIEW_PAD, window.innerWidth - PANEL_W - VIEW_PAD);
  const maxT = Math.max(VIEW_PAD, window.innerHeight - PANEL_H - VIEW_PAD);
  return {
    left: Math.min(maxL, Math.max(VIEW_PAD, left)),
    top: Math.min(maxT, Math.max(VIEW_PAD, top)),
  };
}

function placeNearTrigger(rect: DOMRect): PanelPos {
  const spaceAbove = rect.top - VIEW_PAD;
  const spaceBelow = window.innerHeight - rect.bottom - VIEW_PAD;
  const preferAbove = spaceAbove >= PANEL_H || spaceAbove > spaceBelow;
  const top = preferAbove ? rect.top - PANEL_H - 8 : rect.bottom + 8;
  const left = rect.left + rect.width / 2 - PANEL_W / 2;
  return clampPanel(left, top);
}

function readSavedPos(): PanelPos | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(POS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PanelPos>;
    if (typeof parsed.left !== "number" || typeof parsed.top !== "number") return null;
    return clampPanel(parsed.left, parsed.top);
  } catch {
    return null;
  }
}

function savePos(pos: PanelPos): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(clampPanel(pos.left, pos.top)));
  } catch {
    // ignore quota / private mode
  }
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
  compact?: boolean;
  swatchClassName?: string;
};

/** Floating, draggable HSV color panel — position + close are stateful. */
export function ColorPicker({
  value,
  onChange,
  label,
  className,
  compact = false,
  swatchClassName,
}: Props) {
  const hex = normalizeHex(value || "#000000");
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<PanelPos>({ left: VIEW_PAD, top: VIEW_PAD });
  const posRef = useRef(pos);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originL: number;
    originT: number;
    moved: boolean;
  } | null>(null);

  const initial = useMemo(() => {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHsv(r, g, b);
  }, [hex]);

  const [hue, setHue] = useState(initial.h);
  const [sat, setSat] = useState(initial.s);
  const [val, setVal] = useState(initial.v);
  const [hexDraft, setHexDraft] = useState(hex.toUpperCase());

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  useEffect(() => {
    if (!open) {
      const { r, g, b } = hexToRgb(hex);
      const next = rgbToHsv(r, g, b);
      setHue(next.h);
      setSat(next.s);
      setVal(next.v);
      setHexDraft(hex.toUpperCase());
    }
  }, [hex, open]);

  useLayoutEffect(() => {
    if (!open) return;
    const saved = readSavedPos();
    if (saved) {
      setPos(saved);
      return;
    }
    if (triggerRef.current) {
      setPos(placeNearTrigger(triggerRef.current.getBoundingClientRect()));
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onResize() {
      setPos((p) => {
        const next = clampPanel(p.left, p.top);
        savePos(next);
        return next;
      });
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  function closePanel() {
    savePos(posRef.current);
    setOpen(false);
  }

  function commitHsv(nextH: number, nextS: number, nextV: number) {
    setHue(nextH);
    setSat(nextS);
    setVal(nextV);
    const nextHex = hsvToHex(nextH, nextS, nextV);
    setHexDraft(nextHex.toUpperCase());
    onChange(nextHex);
  }

  function applyHexDraft(raw: string, commit = false) {
    const next = raw.trim();
    setHexDraft(next.toUpperCase());
    if (/^#?[0-9a-fA-F]{3}$/.test(next) || /^#?[0-9a-fA-F]{6}$/.test(next)) {
      const normalized = normalizeHex(next.startsWith("#") ? next : `#${next}`);
      onChange(normalized);
      const { r, g, b } = hexToRgb(normalized);
      const hsv = rgbToHsv(r, g, b);
      setHue(hsv.h);
      setSat(hsv.s);
      setVal(hsv.v);
      if (commit) setHexDraft(normalized.toUpperCase());
    } else if (commit) {
      const normalized = normalizeHex(raw);
      setHexDraft(normalized.toUpperCase());
      onChange(normalized);
    }
  }

  function pickSv(clientX: number, clientY: number) {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    commitHsv(hue, s, v);
  }

  function onSvPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pickSv(e.clientX, e.clientY);
  }

  function onSvPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    pickSv(e.clientX, e.clientY);
  }

  function onDragStart(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("[data-color-picker-close]")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originL: posRef.current.left,
      originT: posRef.current.top,
      moved: false,
    };
  }

  function onDragMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const next = clampPanel(
      drag.originL + (e.clientX - drag.startX),
      drag.originT + (e.clientY - drag.startY)
    );
    if (
      Math.abs(next.left - drag.originL) > 2 ||
      Math.abs(next.top - drag.originT) > 2
    ) {
      drag.moved = true;
    }
    setPos(next);
  }

  function onDragEnd(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    const next = clampPanel(posRef.current.left, posRef.current.top);
    setPos(next);
    if (drag.moved) savePos(next);
  }

  const hueColor = hsvToHex(hue, 1, 1);

  const floatingPanel =
    open && mounted
      ? createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-modal="false"
            aria-label={label ? `${label} color wheel` : "Color wheel"}
            className="fixed z-[9999] w-[260px] rounded-[16px] border border-[#efefef] bg-white p-3 shadow-[0_16px_48px_rgba(23,22,24,0.22)]"
            style={{ left: pos.left, top: pos.top }}
          >
            <div className="mb-2 flex items-center gap-1.5">
              <div
                className="flex min-w-0 flex-1 cursor-grab items-center gap-1.5 active:cursor-grabbing"
                onPointerDown={onDragStart}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onPointerCancel={onDragEnd}
              >
                <GripVertical className="size-3.5 shrink-0 text-[#727578]" />
                <p className="min-w-0 flex-1 truncate type-caption font-medium text-[#171618]">
                  {label || "Custom color"} · drag to move
                </p>
              </div>
              <button
                type="button"
                data-color-picker-close
                className="shrink-0 rounded-[6px] p-1.5 text-[#727578] hover:bg-[#f7f7f7] hover:text-[#171618]"
                aria-label="Close color picker"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  closePanel();
                }}
              >
                <X className="size-3.5" />
              </button>
            </div>

            <div
              ref={svRef}
              className="relative h-[148px] w-full cursor-crosshair touch-none overflow-hidden rounded-[12px]"
              style={{
                background: `
                  linear-gradient(to top, #000, transparent),
                  linear-gradient(to right, #fff, ${hueColor})
                `,
              }}
              onPointerDown={onSvPointerDown}
              onPointerMove={onSvPointerMove}
            >
              <span
                className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                style={{
                  left: `${sat * 100}%`,
                  top: `${(1 - val) * 100}%`,
                  background: hex,
                }}
              />
            </div>

            <label className="mt-3 block space-y-1.5">
              <span className="type-caption text-[#727578]">Hue</span>
              <input
                type="range"
                min={0}
                max={360}
                step={1}
                value={Math.round(hue)}
                onChange={(e) => commitHsv(Number(e.target.value), sat, val)}
                className="h-3 w-full cursor-pointer appearance-none rounded-full"
                style={{
                  background:
                    "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
                }}
                aria-label="Hue"
              />
            </label>

            <div className="mt-3 flex items-center gap-2">
              <span
                className="size-8 shrink-0 rounded-[10px] border border-[#efefef]"
                style={{ background: hex }}
              />
              <input
                type="text"
                value={hexDraft}
                onChange={(e) => applyHexDraft(e.target.value)}
                onBlur={(e) => applyHexDraft(e.target.value, true)}
                className="h-8 min-w-0 flex-1 rounded-[8px] border border-[#efefef] px-2 type-caption font-medium uppercase tracking-wide text-[#171618] outline-none focus-visible:border-[#171618]"
                spellCheck={false}
                aria-label={label ? `${label} hex` : "Color hex"}
              />
              <button
                type="button"
                data-color-picker-close
                className="shrink-0 type-caption font-medium text-[#171618] underline-offset-2 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  closePanel();
                }}
              >
                Done
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && !compact ? (
        <p className="type-caption font-medium text-[#727578]">{label}</p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          ref={triggerRef}
          type="button"
          aria-label={label ? `${label} color wheel` : "Open color wheel"}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "relative shrink-0 overflow-hidden outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[#171618]",
            compact
              ? "size-8 rounded-full border border-[#efefef]"
              : "size-11 rounded-[12px] border border-[#efefef] shadow-[var(--shadow-subtle)]",
            open && "ring-2 ring-[#171618]",
            swatchClassName
          )}
          style={
            compact
              ? { background: hex }
              : {
                  background: `
              linear-gradient(${hex}, ${hex}),
              conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)
            `,
                  backgroundOrigin: "border-box",
                  backgroundClip: "padding-box, border-box",
                  border: "3px solid transparent",
                }
          }
          title={`${label || "Color"} · ${hex.toUpperCase()} — click to customize`}
        >
          {!compact && (
            <span
              className="absolute inset-[5px] rounded-[8px] border border-black/10"
              style={{ background: hex }}
            />
          )}
        </button>
        {!compact && (
          <input
            type="text"
            value={hexDraft}
            onChange={(e) => applyHexDraft(e.target.value)}
            onBlur={(e) => applyHexDraft(e.target.value, true)}
            onFocus={() => setOpen(true)}
            className="h-11 min-w-0 flex-1 rounded-[12px] border border-[#efefef] bg-white px-3 type-ui font-normal uppercase tracking-wide text-[#171618] outline-none focus-visible:border-[#171618]"
            spellCheck={false}
            aria-label={label ? `${label} hex` : "Color hex"}
          />
        )}
      </div>
      {floatingPanel}
    </div>
  );
}
