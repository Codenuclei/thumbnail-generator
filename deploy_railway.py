#!/usr/bin/env python3
"""Deploy Thumbnail Studio to Cohesivity Railway (yt-dlp + ffmpeg enabled)."""

from __future__ import annotations

import base64
import json
import mimetypes
import os
import secrets
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
COHESIVITY_BASE = "https://cohesivity.ai"
USER_AGENT = "skill-3ec4ad99e463:cursor"

SKIP_DIRS = {
    "node_modules",
    ".next",
    ".git",
    ".data",
    "agent-transcripts",
    "__pycache__",
    ".cursor",
}
SKIP_FILES = {".env", ".cohesivity", ".env.local"}
INCLUDE_ROOT_FILES = {"Dockerfile", "README.md"}


def load_dotenv(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def load_cohesivity(path: Path) -> dict[str, str]:
    cfg: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        cfg[k.strip()] = v.strip()
    return cfg


def api_request(method: str, path: str, key: str, body: dict | None = None) -> dict:
    url = f"{COHESIVITY_BASE}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} -> {exc.code}: {detail}") from exc


def set_env_var(mgmt_key: str, key: str, value: str) -> None:
    """Always upsert. Delete first when present so empty stale values cannot stick."""
    try:
        api_request("DELETE", f"/api/railway/env/{key}", mgmt_key)
    except RuntimeError as exc:
        if "404" not in str(exc) and "not_found" not in str(exc).lower():
            # ignore missing; continue to upsert
            pass
    api_request(
        "POST",
        "/api/railway/env",
        mgmt_key,
        {"key": key, "value": value},
    )
    print(f"  railway env upsert: {key} (len={len(value)})")


def collect_files() -> list[dict]:
    files: list[dict] = []

    def add_file(abs_path: Path, rel: str) -> None:
        if abs_path.name in SKIP_FILES:
            return
        mime, _ = mimetypes.guess_type(str(abs_path))
        raw = abs_path.read_bytes()
        # Skip huge binaries accidentally
        if abs_path.suffix.lower() in {".mp4", ".webm", ".zip"} and len(raw) > 2_000_000:
            return
        if abs_path.suffix.lower() in {
            ".png",
            ".jpg",
            ".jpeg",
            ".webp",
            ".ico",
            ".woff",
            ".woff2",
            ".ttf",
        } or (mime or "").startswith("image/"):
            files.append(
                {
                    "file": rel,
                    "data": base64.b64encode(raw).decode("ascii"),
                    "encoding": "base64",
                }
            )
        else:
            try:
                files.append({"file": rel, "data": raw.decode("utf-8")})
            except UnicodeDecodeError:
                files.append(
                    {
                        "file": rel,
                        "data": base64.b64encode(raw).decode("ascii"),
                        "encoding": "base64",
                    }
                )

    for name in INCLUDE_ROOT_FILES:
        p = ROOT / name
        if p.exists():
            add_file(p, name)

    # Frame pipeline
    pipeline = ROOT / "yt-worker" / "frame_pipeline.py"
    if pipeline.exists():
        add_file(pipeline, "yt-worker/frame_pipeline.py")

    for path in sorted(WEB.rglob("*")):
        if not path.is_file():
            continue
        rel_parts = path.relative_to(WEB).parts
        if any(part in SKIP_DIRS for part in rel_parts):
            continue
        if path.name in SKIP_FILES:
            continue
        add_file(path, f"web/{path.relative_to(WEB).as_posix()}")

    return files


def main() -> None:
    coh = load_cohesivity(ROOT / ".cohesivity")
    env = {**load_dotenv(ROOT / ".env"), **load_dotenv(WEB / ".env.local")}
    mgmt_key = coh["coh_management_key"]
    app_key = coh["coh_application_key"]
    tenant_id = coh.get("tenant_id", "")

    print("Provisioning railway-hosting...")
    try:
        result = api_request("POST", "/api/resources/railway-hosting", mgmt_key)
        print(f"  {result.get('status') or result.get('deployment_url') or result}")
        deploy_url = result.get("deployment_url")
    except RuntimeError as exc:
        if "already" in str(exc).lower() or "active" in str(exc).lower():
            print("  already provisioned")
            deploy_url = f"https://{tenant_id}.cohesivity.app"
        else:
            raise

    print("Setting Railway env vars...")
    set_env_var(mgmt_key, "COH_APPLICATION_KEY", app_key)
    if tenant_id:
        set_env_var(mgmt_key, "COH_TENANT_ID", tenant_id)
    if env.get("GEMINI_API_KEY"):
        set_env_var(mgmt_key, "GEMINI_API_KEY", env["GEMINI_API_KEY"])
    if env.get("APIFY_API_TOKEN"):
        set_env_var(mgmt_key, "APIFY_API_TOKEN", env["APIFY_API_TOKEN"])
    for optional in (
        "CANVA_CLIENT_ID",
        "CANVA_CLIENT_SECRET",
        "FIGMA_CLIENT_ID",
        "FIGMA_CLIENT_SECRET",
        "FIGMA_ACCESS_TOKEN",
    ):
        if env.get(optional):
            set_env_var(mgmt_key, optional, env[optional])
    set_env_var(mgmt_key, "COOKIE_SECURE", "1")
    set_env_var(mgmt_key, "YTDLP_PATH", "/usr/local/bin/yt-dlp")
    set_env_var(mgmt_key, "FFMPEG_PATH", "/usr/bin/ffmpeg")
    set_env_var(mgmt_key, "YT_FRAME_PIPELINE", "/opt/yt-worker/frame_pipeline.py")
    set_env_var(mgmt_key, "PYTHON_PATH", "python3")
    worker_secret = env.get("YT_WORKER_SECRET") or secrets.token_urlsafe(24)
    set_env_var(mgmt_key, "YT_WORKER_SECRET", worker_secret)

    print("Collecting files for Railway...")
    files = collect_files()
    print(f"  {len(files)} files")

    print("Deploying to Railway via Cohesivity (build can take several minutes)...")
    deploy = api_request(
        "POST",
        "/api/railway/deploy?wait=ready",
        mgmt_key,
        {"files": files},
    )

    url = deploy.get("deployment_url") or deploy_url or f"https://{tenant_id}.cohesivity.app"
    state = deploy.get("state") or deploy.get("status")
    print(f"\nDeployment state: {state}")
    print(f"Live URL: {url}")
    if deploy.get("logs_url"):
        print(f"Logs: {deploy.get('logs_url')}")

    if state and str(state).upper() in {"BUILDING", "DEPLOYING", "PENDING"}:
        # wait=ready timed out — poll until terminal
        dep_id = deploy.get("deployment_id")
        print(f"  waiting for deploy to finish (state={state})...")
        import time

        for _ in range(40):
            listing = api_request("GET", "/api/railway/deployments", mgmt_key)
            deps = listing.get("deployments") or []
            cur = next((d for d in deps if d.get("id") == dep_id), deps[0] if deps else {})
            state = cur.get("state") or state
            url = cur.get("deployment_url") or url
            print(f"  state={state}")
            if str(state).upper() in {"SUCCESS", "READY", "FAILED", "ERROR", "CRASHED"}:
                break
            time.sleep(15)

    if state and str(state).upper() in {"ERROR", "FAILED", "CRASHED"}:
        print(json.dumps(deploy, indent=2)[:2000])
        raise SystemExit(1)

    (ROOT / "DEPLOY_URL.txt").write_text(url or "", encoding="utf-8")
    (ROOT / "RAILWAY_URL.txt").write_text(url or "", encoding="utf-8")
    print("\nSaved URL to DEPLOY_URL.txt and RAILWAY_URL.txt")
    print("YouTube path: yt-dlp download -> ffmpeg sample -> Laplacian + Gemini best frame")


if __name__ == "__main__":
    main()
