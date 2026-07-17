export type ProductGoalStatus = "planned" | "in_progress" | "blocked" | "done";

export type ProductGoalCategory =
  | "Video intelligence"
  | "Editor and branding"
  | "Channel intelligence"
  | "IP-defined language"
  | "Export";

export type ProductGoal = {
  id: string;
  category: ProductGoalCategory;
  title: string;
  summary: string;
  status: ProductGoalStatus;
  acceptanceCriteria: string[];
  dependencies?: string[];
  blocker?: string;
};

/**
 * Product-feedback source of truth.
 * Keep statuses aligned with PRODUCT_ROADMAP.md as work is verified.
 */
export const PRODUCT_GOALS: ProductGoal[] = [
  {
    id: "unified-media-ingest",
    category: "Video intelligence",
    title: "Unified media ingest",
    summary: "Read local video, photos, YouTube context, and a supplied script together.",
    status: "done",
    acceptanceCriteria: [
      "Accept local video, reference photos, YouTube URL, and pasted script",
      "Keep source-video decoding in the browser",
      "Persist compact inputs and intelligence results",
    ],
  },
  {
    id: "video-script",
    category: "Video intelligence",
    title: "Video script",
    summary: "Use supplied copy or the full available YouTube caption transcript.",
    status: "done",
    acceptanceCriteria: [
      "Prefer a user-supplied script",
      "Fetch full available captions with description fallback",
      "Show the script source and availability",
    ],
    dependencies: ["unified-media-ingest"],
  },
  {
    id: "youtube-context",
    category: "Video intelligence",
    title: "YouTube context",
    summary: "Analyze public metadata, captions, and thumbnail without downloading video.",
    status: "done",
    acceptanceCriteria: [
      "Parse common public YouTube URL formats",
      "Retrieve metadata, captions, and a public thumbnail",
      "Label URL-only visual evidence as limited",
    ],
    dependencies: ["unified-media-ingest", "video-script"],
  },
  {
    id: "media-colors",
    category: "Video intelligence",
    title: "Colors from photos and video",
    summary: "Measure dominant media colors and recommend a thumbnail-ready palette.",
    status: "done",
    acceptanceCriteria: [
      "Sample uploaded photos and local-video frames",
      "Recommend background, accent, and readable text colors",
      "Allow generation without liked references when media colors exist",
    ],
    dependencies: ["unified-media-ingest"],
  },
  {
    id: "context-depth",
    category: "Video intelligence",
    title: "Context and depth",
    summary: "Understand content meaning, story, focal hierarchy, and visual depth cues.",
    status: "done",
    acceptanceCriteria: [
      "Return audience, subject, story beats, emotion, and related contexts",
      "Describe foreground, midground, background, and focal subject",
      "Attach source-confidence notes to every analysis",
    ],
    dependencies: ["unified-media-ingest", "video-script"],
  },
  {
    id: "thumbnail-hooks",
    category: "Video intelligence",
    title: "Thumbnail hook",
    summary: "Suggest concise on-thumbnail copy grounded in the actual content.",
    status: "done",
    acceptanceCriteria: [
      "Return three to five ranked hook candidates",
      "Score clarity, curiosity, and content fidelity",
      "Allow selection and free editing independently of video titles",
    ],
    dependencies: ["context-depth"],
  },
  {
    id: "font-controls",
    category: "Editor and branding",
    title: "Font controls",
    summary: "Control thumbnail typography directly rather than only through a prompt.",
    status: "done",
    acceptanceCriteria: [
      "Choose family, weight, size, alignment, fill, stroke, and shadow",
      "Persist settings across iterations and exports",
    ],
  },
  {
    id: "elements-layers",
    category: "Editor and branding",
    title: "Elements and layers",
    summary: "Add editable text, image, shape, arrow, and badge layers.",
    status: "done",
    acceptanceCriteria: [
      "Support ordering, position, opacity, and visibility",
      "Support undo and redo",
    ],
  },
  {
    id: "logo-watermark",
    category: "Editor and branding",
    title: "Logo and watermark",
    summary: "Use a dedicated reusable brand asset with safe placement controls.",
    status: "done",
    acceptanceCriteria: [
      "Configure corner, size, opacity, and safe area",
      "Support logo and watermark modes",
    ],
    dependencies: ["elements-layers"],
  },
  {
    id: "custom-editor",
    category: "Editor and branding",
    title: "Custom thumbnail editor",
    summary: "Directly manipulate a layer-based 16:9 thumbnail canvas.",
    status: "done",
    acceptanceCriteria: [
      "Manipulate layers directly on canvas",
      "Retain natural-language AI iteration as a companion workflow",
    ],
    dependencies: ["font-controls", "elements-layers", "logo-watermark"],
  },
  {
    id: "channel-profile",
    category: "Channel intelligence",
    title: "Understand main channels",
    summary: "Create an evidence-backed profile of a channel's recurring visual language.",
    status: "done",
    acceptanceCriteria: [
      "Summarize topic clusters, palettes, type, composition, and motifs",
      "Keep source evidence visible and editable",
    ],
    dependencies: ["context-depth", "media-colors"],
  },
  {
    id: "ip-language",
    category: "IP-defined language",
    title: "Brand language system",
    summary: "Define approved phrases, motifs, tone, and reusable visual grammar.",
    status: "done",
    acceptanceCriteria: [
      "Store approved and avoided language",
      "Apply the profile to hooks, prompts, and channel analysis",
    ],
    dependencies: ["channel-profile", "logo-watermark"],
  },
  {
    id: "design-pack",
    category: "Export",
    title: "Portable design pack",
    summary: "Export PNG variants with hook, palette, style, and source metadata.",
    status: "done",
    acceptanceCriteria: [
      "Download all selected variants",
      "Include a machine-readable metadata sidecar",
    ],
  },
  {
    id: "canva-export",
    category: "Export",
    title: "Canva export",
    summary: "Send a thumbnail to Canva as a flat asset or editable template.",
    status: "done",
    acceptanceCriteria: [
      "Authenticate through Canva Connect",
      "Create the selected handoff format without exposing credentials",
    ],
    dependencies: ["design-pack", "custom-editor"],
  },
  {
    id: "figma-export",
    category: "Export",
    title: "Figma export",
    summary: "Send a thumbnail to Figma with a stable editable layer model.",
    status: "done",
    acceptanceCriteria: [
      "Authenticate without exposing credentials",
      "Create assets or editable layers in the chosen Figma workflow",
    ],
    dependencies: ["design-pack", "custom-editor"],
  },
];

export const PRODUCT_GOAL_CATEGORIES: ProductGoalCategory[] = [
  "Video intelligence",
  "Editor and branding",
  "Channel intelligence",
  "IP-defined language",
  "Export",
];

export function productGoalProgress(goals = PRODUCT_GOALS): {
  done: number;
  total: number;
  percent: number;
} {
  const done = goals.filter((goal) => goal.status === "done").length;
  const total = goals.length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

