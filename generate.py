#!/usr/bin/env python3
"""YouTube thumbnail generator using direct Google Gemini API.

Learns the collective style from reference thumbnails and generates new ones
from a text prompt while staying visually cohesive with the channel.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_SAMPLES = Path(
    r"C:\Users\MasterUnion\Downloads\rerequestforthumbnailimagesforyoutubecontent_"
)
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
COHESIVITY_OPENAI_API = "https://cohesivity.ai/edge/openai-api"
USER_AGENT = "thumbnail-generator/1.0"

DEFAULT_GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image"

GEMINI_MODEL_PRESETS = {
    "gemini": DEFAULT_GEMINI_IMAGE_MODEL,
    "gemini-2.5": "gemini-2.5-flash-image",
    "gemini-3.1": "gemini-3.1-flash-image",
    "gemini-3-pro": "gemini-3-pro-image",
    "gemini-lite-image": "gemini-3.1-flash-lite-image",
}

STYLE_SUFFIX = (
    "YouTube thumbnail, 16:9 landscape, photorealistic cinematic, a young Indian woman "
    "with a strong emotional facial expression as the focal subject, high contrast "
    "dramatic color grade, bold ALL-CAPS heavy sans-serif text with thick outline in "
    "yellow/red/white, short punchy curiosity-gap hook, small channel logo badge in a "
    "corner, professional YouTube documentary thumbnail composition, ultra sharp, "
    "eye-catching."
)

QUALITY_DIRECTIVES = (
    "Design rules for maximum click-through: keep the layout clean and uncluttered; "
    "one dominant text hook only (2-4 words max), highly readable at phone size; "
    "subject face fills roughly one-third of the frame with exaggerated expression; "
    "limit background to one strong visual metaphor; use thick text stroke and high "
    "contrast; avoid tiny text, watermarks, or overcrowded collage; looks like a "
    "top-performing Indian documentary YouTube channel thumbnail, not a movie poster."
)

COMPOSITION_HINTS = {
    "center": "Center hero composition: subject close and centered, dramatic environment behind.",
    "split": "Split comparison: two or three vertical panels comparing contrasting ideas.",
    "cutout": "Cutout composition: subject on left or right, scene fills the rest of frame.",
    "data": "Data overlay: thin timeline line, node dots, era labels, or plunging graph.",
}


def load_env(path: Path | None = None) -> None:
    env_path = path or ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key and key not in os.environ:
            os.environ[key] = value.strip().strip('"').strip("'")


def load_cohesivity_config(path: Path | None = None) -> dict[str, str]:
    config_path = path or ROOT / ".cohesivity"
    if not config_path.exists():
        return {}
    config: dict[str, str] = {}
    for line in config_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        config[key.strip()] = value.strip()
    return config


def get_gemini_api_key() -> str | None:
    load_env()
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    return key or None


def list_sample_thumbnails(samples_dir: Path) -> list[Path]:
    if not samples_dir.is_dir():
        return []
    exts = {".jpg", ".jpeg", ".png", ".webp"}
    return sorted(p for p in samples_dir.iterdir() if p.suffix.lower() in exts)


def build_style_context(samples_dir: Path) -> str:
    samples = list_sample_thumbnails(samples_dir)
    if not samples:
        return (
            "Match this channel's documentary YouTube thumbnail style: India-focused "
            "social/economic stories, expressive Indian hosts, bold yellow/red/white "
            "ALL-CAPS text hooks, cinematic photorealism, high contrast."
        )

    names = ", ".join(p.stem for p in samples[:8])
    return (
        f"This channel has {len(samples)} reference thumbnails ({names}, ...). "
        "Collective style DNA: photoreal cinematic 16:9 YouTube thumbnails; recurring "
        "young Indian woman (or bearded man with glasses) with exaggerated emotional "
        "expressions; bold ALL-CAPS sans-serif text in yellow/red/white with thick "
        "outlines; curiosity-gap hooks and shock stats; split-screen comparisons for "
        "contrasts; India-focused documentary/explainer topics; small corner logo badges; "
        "red/yellow curved annotation arrows; desaturated moody grade for serious topics, "
        "vivid saturated grade for shock/comparison."
    )


def build_prompt(
    user_prompt: str,
    *,
    hook_text: str | None = None,
    composition: str | None = None,
    samples_dir: Path,
) -> str:
    parts = [
        build_style_context(samples_dir),
        f"Video topic: {user_prompt.strip()}",
    ]

    if hook_text:
        parts.append(f'On-thumbnail text hook (render legibly): "{hook_text.upper()}"')

    if composition and composition in COMPOSITION_HINTS:
        parts.append(COMPOSITION_HINTS[composition])

    parts.append(QUALITY_DIRECTIVES)
    parts.append(STYLE_SUFFIX)
    return " ".join(parts)


def gemini_request(
    api_key: str,
    model: str,
    payload: dict,
    *,
    timeout: int = 180,
) -> dict:
    url = f"{GEMINI_API_BASE}/{model}:generateContent"
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-goog-api-key": api_key,
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        if exc.code == 429 and "free_tier" in detail:
            raise RuntimeError(
                f"Gemini image quota exhausted (429). Your API key works, but image "
                f"models require billing enabled in Google AI Studio: "
                f"https://aistudio.google.com/apikey\n\n{detail}"
            ) from exc
        raise RuntimeError(f"Gemini API error ({exc.code}): {detail}") from exc


def extract_image_bytes(response: dict) -> bytes:
    candidates = response.get("candidates") or []
    for candidate in candidates:
        content = candidate.get("content") or {}
        for part in content.get("parts") or []:
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return base64.b64decode(inline["data"])
    raise RuntimeError(
        f"No image in Gemini response: {json.dumps(response)[:800]}"
    )


def generate_thumbnail_gemini(
    api_key: str,
    prompt: str,
    *,
    model: str = DEFAULT_GEMINI_IMAGE_MODEL,
    aspect_ratio: str = "16:9",
) -> bytes:
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {
                "aspectRatio": aspect_ratio,
            },
        },
    }
    response = gemini_request(api_key, model, payload)
    return extract_image_bytes(response)


def cohesivity_request(
    app_key: str,
    path: str,
    payload: dict,
    *,
    timeout: int = 180,
) -> dict:
    url = f"{COHESIVITY_OPENAI_API}{path}?key={app_key}"
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "cold: cursor",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Cohesivity API error ({exc.code}): {detail}") from exc


def generate_thumbnail_gpt(
    app_key: str,
    prompt: str,
    *,
    size: str = "1536x1024",
    quality: str = "medium",
) -> bytes:
    response = cohesivity_request(
        app_key,
        "/v1/images/generations",
        {
            "model": "gpt-image-2",
            "prompt": prompt,
            "size": size,
            "quality": quality,
            "n": 1,
        },
    )
    data = response.get("data") or []
    if not data:
        raise RuntimeError(f"No image returned: {json.dumps(response)[:500]}")
    item = data[0]
    if "b64_json" in item:
        return base64.b64decode(item["b64_json"])
    if "url" in item:
        with urllib.request.urlopen(
            urllib.request.Request(item["url"], headers={"User-Agent": USER_AGENT}),
            timeout=60,
        ) as resp:
            return resp.read()
    raise RuntimeError(f"Unexpected image payload: {list(item.keys())}")


def generate_thumbnail(
    prompt: str,
    *,
    gemini_key: str | None,
    cohesivity_key: str | None,
    model: str,
    aspect_ratio: str,
    size: str,
    quality: str,
    fallback: bool,
) -> tuple[bytes, str]:
    errors: list[str] = []

    if gemini_key:
        try:
            print("Trying Gemini (direct)...")
            return (
                generate_thumbnail_gemini(
                    gemini_key,
                    prompt,
                    model=model,
                    aspect_ratio=aspect_ratio,
                ),
                f"gemini:{model}",
            )
        except Exception as exc:
            errors.append(f"Gemini failed: {exc}")
            print(f"Gemini failed: {exc}", file=sys.stderr)
            if not fallback:
                raise

    if fallback and cohesivity_key:
        print("Falling back to Cohesivity gpt-image-2...")
        return (
            generate_thumbnail_gpt(
                cohesivity_key,
                prompt,
                size=size,
                quality=quality,
            ),
            "cohesivity:gpt-image-2",
        )

    if errors:
        raise RuntimeError("\n".join(errors))
    raise RuntimeError(
        "No backend available. Set GEMINI_API_KEY in .env or configure .cohesivity."
    )


def resolve_model(model_arg: str) -> str:
    return GEMINI_MODEL_PRESETS.get(model_arg, model_arg)


def slugify(text: str, max_len: int = 48) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:max_len] or "thumbnail"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate YouTube thumbnails in your channel style via Gemini API"
    )
    parser.add_argument(
        "prompt",
        help='Video topic, e.g. "India water crisis in Bengaluru"',
    )
    parser.add_argument(
        "--hook",
        help='Bold text to render on thumbnail, e.g. "WE ARE RUNNING OUT"',
    )
    parser.add_argument(
        "--composition",
        choices=list(COMPOSITION_HINTS),
        help="Composition archetype from reference library",
    )
    parser.add_argument(
        "--samples",
        type=Path,
        default=DEFAULT_SAMPLES,
        help="Folder with reference thumbnail samples",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Output image path (default: output/<slug>-<timestamp>.png)",
    )
    parser.add_argument(
        "--model",
        default="gemini",
        help=(
            "Gemini image model preset or full model id "
            f"(presets: {', '.join(GEMINI_MODEL_PRESETS)}; "
            f"default: {DEFAULT_GEMINI_IMAGE_MODEL})"
        ),
    )
    parser.add_argument(
        "--no-fallback",
        action="store_true",
        help="Do not fall back to Cohesivity gpt-image-2 if Gemini fails",
    )
    parser.add_argument(
        "--quality",
        default="medium",
        choices=["low", "medium", "high"],
        help="GPT fallback quality (ignored by Gemini)",
    )
    parser.add_argument(
        "--size",
        default="1536x1024",
        help="GPT fallback size (landscape for YouTube)",
    )
    parser.add_argument(
        "--aspect-ratio",
        default="16:9",
        help="Gemini output aspect ratio",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print final prompt without calling API",
    )
    args = parser.parse_args()

    gemini_key = get_gemini_api_key()
    cohesivity = load_cohesivity_config()
    cohesivity_key = cohesivity.get("coh_application_key")
    model = resolve_model(args.model)
    samples = list_sample_thumbnails(args.samples)
    print(f"Reference library: {len(samples)} sample thumbnails")
    print(f"Primary backend: Gemini (direct)")
    print(f"Fallback backend: {'Cohesivity gpt-image-2' if cohesivity_key and not args.no_fallback else 'disabled'}")
    print(f"Model: {model}")

    full_prompt = build_prompt(
        args.prompt,
        hook_text=args.hook,
        composition=args.composition,
        samples_dir=args.samples,
    )

    if args.dry_run:
        print("\n--- Final prompt ---\n")
        print(full_prompt)
        return 0

    image_bytes, backend_used = generate_thumbnail(
        full_prompt,
        gemini_key=gemini_key,
        cohesivity_key=cohesivity_key,
        model=model,
        aspect_ratio=args.aspect_ratio,
        size=args.size,
        quality=args.quality,
        fallback=not args.no_fallback,
    )
    print(f"Generated with: {backend_used}")

    if args.output:
        out_path = args.output
    else:
        out_dir = ROOT / "output"
        out_dir.mkdir(exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        out_path = out_dir / f"{slugify(args.prompt)}-{ts}.png"

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(image_bytes)
    print(f"Saved: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
