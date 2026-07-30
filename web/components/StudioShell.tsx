"use client";

import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Clapperboard,
  ImageIcon,
  LayoutTemplate,
  Search,
  Sparkles,
  Type,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** media is accepted for back-compat and remapped to topic. */
export type StudioTab = "topic" | "media" | "research" | "style" | "generate";

export function normalizeStudioTab(tab: string): Exclude<StudioTab, "media"> {
  if (tab === "media") return "topic";
  if (tab === "research" || tab === "style" || tab === "generate") return tab;
  return "topic";
}

type ShellTab = Exclude<StudioTab, "media">;

type Props = {
  tab: StudioTab;
  onTabChange: (tab: ShellTab) => void;
  geminiStatus: string;
  /** Combined topic + optional media flow */
  briefPanel: ReactNode;
  /** Optional control aligned with the Brief panel heading (e.g. Auto-select) */
  briefAction?: ReactNode;
  researchPanel: ReactNode;
  stylePanel: ReactNode;
  generatePanel: ReactNode;
  canvas: ReactNode;
  headerActions: ReactNode;
  /** Primary Generate control, shown bottom-right on the Generate step only */
  generateAction: ReactNode;
  counts?: {
    photos?: number;
    refs?: number;
    selected?: number;
    variants?: number;
  };
  researchNextExtra?: ReactNode;
};

const TABS: Array<{
  value: ShellTab;
  label: string;
  icon: typeof Type;
  countKey?: keyof NonNullable<Props["counts"]>;
  optional?: boolean;
  description: string;
}> = [
  {
    value: "topic",
    label: "Brief",
    icon: Type,
    countKey: "photos",
    description:
      "Name the video, add optional media, then research refs when you want them. Generate works from a title alone.",
  },
  {
    value: "research",
    label: "Research",
    icon: Search,
    countKey: "refs",
    optional: true,
    description:
      "Optional reference thumbs. Like what you want — palettes suggest automatically in the background once you head to Generate.",
  },
  {
    value: "style",
    label: "Style",
    icon: LayoutTemplate,
    optional: true,
    description: "Channel voice, brand language, quality direction, and composition.",
  },
  {
    value: "generate",
    label: "Generate",
    icon: Sparkles,
    countKey: "variants",
    description: "Set hook, layout, model, and palette, then create variants.",
  },
];

const NEXT_TAB: Record<ShellTab, ShellTab | null> = {
  topic: "research",
  research: "style",
  style: "generate",
  generate: null,
};

const PREV_TAB: Record<ShellTab, ShellTab | null> = {
  topic: null,
  research: "topic",
  style: "research",
  generate: "style",
};

const NEXT_LABEL: Record<ShellTab, string> = {
  topic: "Next: Research",
  research: "Next: Style",
  style: "Next: Generate",
  generate: "Generate",
};

export function StudioShell({
  tab,
  onTabChange,
  geminiStatus,
  briefPanel,
  briefAction,
  researchPanel,
  stylePanel,
  generatePanel,
  canvas,
  headerActions,
  generateAction,
  counts,
  researchNextExtra,
}: Props) {
  const connected = geminiStatus === "connected";
  const activeTab = normalizeStudioTab(tab);
  const stepIndex = TABS.findIndex((t) => t.value === activeTab);
  const activeMeta = TABS[stepIndex] || TABS[0];
  const nextTab = NEXT_TAB[activeTab];
  const prevTab = PREV_TAB[activeTab];

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b border-[#d8d8d8] bg-card">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-[var(--radius-inputs)] border border-[#d8d8d8] bg-muted">
              <Clapperboard className="size-4 text-foreground" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate type-ui text-foreground">Thumbnail Studio</h1>
              <p className="type-caption tabular-nums text-[#5c5e60]">
                Step {stepIndex + 1} of {TABS.length} · {activeMeta.label}
                {activeMeta.optional ? " (optional)" : ""}
              </p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "font-normal",
                connected
                  ? "border-[#b9e9c5] bg-[#effaf2] text-[#21813a]"
                  : "border-[#c8c9cb] text-muted-foreground"
              )}
            >
              Gemini · {geminiStatus}
            </Badge>
            {headerActions}
          </div>
        </div>

        <nav
          aria-label="Studio steps"
          className="mx-auto max-w-[1600px] border-t border-[#efefef] px-3 py-2.5 sm:px-5"
        >
          <ol className="grid grid-cols-4 gap-1 sm:gap-2">
            {TABS.map((item, i) => {
              const Icon = item.icon;
              const done = i < stepIndex;
              const current = item.value === activeTab;
              const count = item.countKey ? counts?.[item.countKey] : undefined;
              return (
                <li key={item.value}>
                  <button
                    type="button"
                    aria-current={current ? "step" : undefined}
                    onClick={() => onTabChange(item.value)}
                    className={cn(
                      "flex w-full flex-col items-center gap-1 rounded-[var(--radius-inputs)] border px-1 py-2 transition-colors sm:flex-row sm:justify-center sm:gap-2 sm:px-2",
                      current &&
                        "border-[#171618] bg-[#171618] text-white shadow-sm",
                      done &&
                        !current &&
                        "border-[#c8c9cb] bg-[#f7f7f7] text-[#171618]",
                      !current &&
                        !done &&
                        "border-[#efefef] bg-white text-[#5c5e60] hover:border-[#c8c9cb] hover:text-[#171618]"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full type-caption tabular-nums font-medium",
                        current && "bg-white/15 text-white",
                        done && !current && "bg-[#171618] text-white",
                        !current && !done && "bg-[#efefef] text-[#5c5e60]"
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="flex min-w-0 items-center gap-1">
                      <Icon className="hidden size-3.5 opacity-80 sm:inline" />
                      <span className="truncate type-caption font-medium">{item.label}</span>
                      {typeof count === "number" && count > 0 ? (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "hidden h-5 px-1.5 type-caption tabular-nums sm:inline-flex",
                            current && "border-white/20 bg-white/15 text-white"
                          )}
                        >
                          {count}
                        </Badge>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </header>

      <div className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 grid-cols-1 gap-4 overflow-hidden p-3 sm:p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <Card className="flex min-h-0 flex-col gap-0 overflow-hidden border border-[var(--container-border)] py-0 shadow-sm ring-1 ring-[#171618]/10">
          <Tabs
            value={activeTab}
            onValueChange={(v) => onTabChange(normalizeStudioTab(v))}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <ScrollArea className="min-h-0 flex-1">
              <div className="min-h-0">
                <TabsContent
                  value="topic"
                  className="mt-0 space-y-4 p-4 data-[hidden]:hidden sm:p-5"
                >
                  <PanelIntro
                    title="Brief"
                    description={TABS[0].description}
                    action={briefAction}
                  />
                  {briefPanel}
                </TabsContent>

                <TabsContent
                  value="research"
                  className="mt-0 space-y-4 p-4 data-[hidden]:hidden sm:p-5"
                >
                  <PanelIntro title="Research" optional description={TABS[1].description} />
                  {researchPanel}
                </TabsContent>

                <TabsContent
                  value="style"
                  className="mt-0 space-y-4 p-4 data-[hidden]:hidden sm:p-5"
                >
                  <PanelIntro title="Style" optional description={TABS[2].description} />
                  {stylePanel}
                </TabsContent>

                <TabsContent
                  value="generate"
                  className="mt-0 space-y-4 p-4 data-[hidden]:hidden sm:p-5"
                >
                  <PanelIntro title="Generate" description={TABS[3].description} />
                  {generatePanel}
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        </Card>

        <Card className="flex min-h-0 flex-col gap-0 overflow-hidden border border-[var(--container-border)] py-0 shadow-sm ring-1 ring-[#171618]/10">
          <CardHeader className="shrink-0 border-b border-[#d8d8d8] py-3">
            <div className="flex items-center gap-2">
              <ImageIcon className="size-4 text-[#5c5e60]" />
              <CardTitle className="type-ui text-[#171618]">Canvas</CardTitle>
              <CardDescription className="ml-auto type-caption text-[#5c5e60]">
                Pipeline, preview, and edit
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
            <div className="h-full min-h-[420px]">{canvas}</div>
          </CardContent>
        </Card>
      </div>

      <footer className="shrink-0 border-t border-[#d8d8d8] bg-card">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
          {prevTab ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 border-[var(--field-border)]"
              onClick={() => onTabChange(prevTab)}
            >
              <ArrowLeft className="size-3.5" />
              Back
            </Button>
          ) : (
            <span className="type-caption text-[#5c5e60]">Start with a title</span>
          )}

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {activeTab === "research" ? researchNextExtra : null}
            {nextTab ? (
              <Button
                type="button"
                size="sm"
                className="h-9 min-w-[9.5rem]"
                onClick={() => onTabChange(nextTab)}
              >
                {NEXT_LABEL[activeTab]}
                <ArrowRight className="size-3.5" />
              </Button>
            ) : (
              <div className="[&_button]:h-9 [&_button]:min-w-[9.5rem]">{generateAction}</div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

function PanelIntro({
  title,
  description,
  optional,
  action,
}: {
  title: string;
  description: string;
  optional?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-balance text-[18px] font-medium tracking-[-0.02em] text-[#171618]">
              {title}
            </h2>
            {optional ? (
              <Badge
                variant="outline"
                className="border-[#c8c9cb] font-normal type-caption text-[#5c5e60]"
              >
                Optional
              </Badge>
            ) : null}
          </div>
          <p className="max-w-2xl text-pretty type-caption leading-snug text-[#5c5e60]">
            {description}
          </p>
        </div>
        {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
      </div>
      <Separator className="mt-3 bg-[#d8d8d8]" />
    </div>
  );
}
