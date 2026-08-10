# YouTube Thumbnail Generator (Direct Gemini API)

Generates new YouTube thumbnails that match your channel's collective visual style. It reads your reference sample library, injects the distilled style DNA into every prompt, and generates images through the **Google Gemini API** directly.

## Setup

1. Add your Gemini API key to `.env` (already gitignored):

```
GEMINI_API_KEY=your_key_here
```

2. Run:

```bash
python generate.py "India water crisis in Bengaluru" --hook "WE ARE RUNNING OUT"
```

## Usage

```bash
# Basic generation
python generate.py "India water crisis in Bengaluru"

# With hook text + composition
python generate.py "India vs Singapore infrastructure" --composition split --hook "INDIA vs SINGAPORE"

# Preview prompt only
python generate.py "Startup funding winter" --hook "NO MONEY?" --dry-run
```

### Options

| Flag | Description |
|------|-------------|
| `--hook TEXT` | Bold ALL-CAPS text on the thumbnail |
| `--composition` | `center`, `split`, `cutout`, or `data` |
| `--model` | `gemini` (default), `gemini-2.5`, `gemini-2.0`, or full model id |
| `--aspect-ratio` | Default `16:9` for YouTube |
| `--samples PATH` | Reference thumbnail folder |
| `--output PATH` | Custom output path |
| `--dry-run` | Print prompt without calling API |

Default image model: `gemini-2.5-flash-image`

**Note:** `gemini-flash-latest` is text-only. Thumbnails need an image model (`gemini-2.5-flash-image`, `gemini-3.1-flash-image`, etc.). Image generation may require billing enabled on your Google AI Studio project if free-tier image quota is 0.

## How it works

1. Loads `GEMINI_API_KEY` from `.env`
2. Builds a style-aware prompt from your 21 reference thumbnails
3. Calls `POST generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
4. Extracts the image from `inlineData` and saves to `output/`

## Deploy (Cohesivity)

Production deploys are **manual only** via GitHub Actions (`workflow_dispatch`) — not on every commit. See [docs/deploy-cohesivity-gha.md](docs/deploy-cohesivity-gha.md).
