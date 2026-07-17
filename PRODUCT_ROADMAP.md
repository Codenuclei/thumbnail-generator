# Thumbnail Studio product roadmap

This roadmap turns recurring user feedback into measurable mini-goals. Goal definitions
live in `web/lib/product-goals.ts` for contributors — they are not shown in the Studio
Pipeline UI.

## Status definitions

- `planned`: accepted and scoped, but implementation has not started.
- `in_progress`: active delivery work.
- `blocked`: requires an external credential, policy decision, or upstream milestone.
- `done`: acceptance criteria are implemented and verified.

## Video intelligence

### Unified media ingest — done

- Accept a local video, reference photos, a YouTube URL, and a pasted script.
- Keep video decoding in the browser so Vercel never receives the source video.
- Preserve analysis inputs and compact results in draft/history state.

### Video script — done

- Use the pasted script when provided.
- Retrieve the full available YouTube caption transcript, with description fallback.
- Report the script source and never imply captions exist when they do not.

### YouTube context — done

- Parse a public YouTube URL and retrieve metadata, captions, and a public thumbnail.
- Do not download the YouTube video.
- Label URL-only visual analysis as limited.

### Colors from media — done

- Measure dominant colors from uploaded photos and sampled local-video frames.
- Recommend background, accent, and readable text colors.
- Allow generation without liked research references when a media palette exists.

### Context and depth — done

- Summarize subject, audience, story beats, scene types, emotion, and related contexts.
- Describe foreground, midground, background, focal hierarchy, and depth cues.
- Treat depth as semantic/visual analysis, not a fabricated physical measurement.

### Thumbnail hook — done

- Produce three to five short on-thumbnail hook candidates.
- Rank hooks for clarity, curiosity, and fidelity to the supplied content.
- Let the user select or edit the final hook independently of video-title suggestions.

## Editor and branding

### Font controls — done

- Choose family, weight, size, alignment, fill, stroke, and shadow.
- Preserve text settings across iterations and exports.

### Elements and layers — done

- Add editable text, image, shape, arrow, and badge layers.
- Support ordering, position, opacity, visibility, and undo/redo.

### Logo and watermark — done

- Add a dedicated reusable brand asset rather than treating logos as generic references.
- Control corner, size, opacity, safe area, and watermark mode.
- Brand assets upload to Cohesivity object storage (R2-backed).

### Custom thumbnail editor — done

- Directly manipulate layers on a 16:9 canvas.
- Keep AI iteration available as a complementary workflow.

## Channel intelligence

### Main-channel profile — done

- Build a reusable profile from public channel metadata and representative thumbnails.
- Summarize thumbnail language, topic clusters, palettes, typography, composition, and motifs.
- Keep profile evidence visible and editable.

## IP-defined language

### Brand language system — done

- Store approved and avoided phrases, recurring motifs, tone, and visual grammar.
- Apply that language consistently to hooks, prompts, and channel profiles.

## Export

### Portable design pack — done

- Export PNG variants plus a metadata sidecar containing hook, palette, font intent,
  scene brief, and source notes.
- Optionally upload metadata to Cohesivity object storage for sharing.

### Canva export — done

- OAuth through Canva Connect (PKCE, server-side token storage).
- Flat image or template-style design handoff at 1280×720.
- Uses Cohesivity public image URLs for Canva asset import.

### Figma export — done

- Flat image URL handoff plus editable layer-model JSON.
- Optional Figma OAuth or server `FIGMA_ACCESS_TOKEN`.
- Companion dev plugin in `figma-plugin/` rebuilds layers from the exported JSON URL.

