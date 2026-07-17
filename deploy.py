#!/usr/bin/env python3
"""Deploy the Next.js frontend to Cohesivity Vercel hosting."""

from __future__ import annotations

import base64
import json
import mimetypes
import os
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
COHESIVITY_BASE = "https://cohesivity.ai"
USER_AGENT = "cold: cursor"

SKIP_DIRS = {"node_modules", ".next", ".git"}
SKIP_FILES = {".env", ".cohesivity"}


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
        with urllib.request.urlopen(req, timeout=300) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} -> {exc.code}: {detail}") from exc


def collect_files(base: Path) -> list[dict]:
    files: list[dict] = []
    for path in sorted(base.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(base).as_posix()
        parts = set(rel.split("/"))
        if parts & SKIP_DIRS:
            continue
        if path.name in SKIP_FILES:
            continue

        mime, _ = mimetypes.guess_type(str(path))
        binary = mime and not mime.startswith("text/") and mime not in (
            "application/json",
            "application/javascript",
        )

        if binary:
            raw = path.read_bytes()
            files.append(
                {
                    "file": rel,
                    "data": base64.b64encode(raw).decode("ascii"),
                    "encoding": "base64",
                }
            )
        else:
            files.append({"file": rel, "data": path.read_text(encoding="utf-8")})
    return files


def set_env_var(mgmt_key: str, key: str, value: str) -> None:
    try:
        api_request(
            "POST",
            "/api/vercel/env",
            mgmt_key,
            {"key": key, "value": value, "target": ["production"]},
        )
        print(f"  env set: {key}")
    except RuntimeError as exc:
        if "already exists" in str(exc).lower() or "409" in str(exc):
            print(f"  env exists: {key} (skipping)")
        else:
            raise


def main() -> None:
    coh = load_cohesivity(ROOT / ".cohesivity")
    env = {**load_dotenv(ROOT / ".env"), **load_dotenv(WEB / ".env.local")}
    mgmt_key = coh["coh_management_key"]
    app_key = coh["coh_application_key"]
    gemini_key = env.get("GEMINI_API_KEY", "")
    apify_token = env.get("APIFY_API_TOKEN", "")

    print("Provisioning vercel-hosting...")
    try:
        result = api_request("POST", "/api/resources/vercel-hosting", mgmt_key)
        print(f"  {result.get('status', result)}")
    except RuntimeError as exc:
        if "already" in str(exc).lower() or "active" in str(exc).lower():
            print("  already provisioned")
        else:
            raise

    print("Setting environment variables...")
    if gemini_key:
        set_env_var(mgmt_key, "GEMINI_API_KEY", gemini_key)
    if apify_token:
        set_env_var(mgmt_key, "APIFY_API_TOKEN", apify_token)
    set_env_var(mgmt_key, "COH_APPLICATION_KEY", app_key)
    tenant_id = coh.get("tenant_id") or ""
    if tenant_id:
        set_env_var(mgmt_key, "COH_TENANT_ID", tenant_id)
    set_env_var(mgmt_key, "COOKIE_SECURE", "1")

    for key in (
        "CANVA_CLIENT_ID",
        "CANVA_CLIENT_SECRET",
        "FIGMA_CLIENT_ID",
        "FIGMA_CLIENT_SECRET",
        "FIGMA_ACCESS_TOKEN",
    ):
        if env.get(key):
            set_env_var(mgmt_key, key, env[key])

    print("Collecting web files...")
    files = collect_files(WEB)
    print(f"  {len(files)} files")

    print("Deploying to Cohesivity (this may take 30-60s)...")
    deploy = api_request(
        "POST",
        "/api/vercel/deploy?wait=ready",
        mgmt_key,
        {"files": files, "projectSettings": {"framework": "nextjs"}},
    )

    url = deploy.get("canonical_url") or deploy.get("project_url")
    state = deploy.get("state") or deploy.get("status")
    print(f"\nDeployment state: {state}")
    print(f"Live URL: {url}")

    if state == "ERROR":
        print(f"Error: {json.dumps(deploy.get('last_error'), indent=2)}")
        raise SystemExit(1)

    # Write URL to file for easy access
    (ROOT / "DEPLOY_URL.txt").write_text(url or "", encoding="utf-8")
    print(f"\nSaved URL to DEPLOY_URL.txt")


if __name__ == "__main__":
    main()
