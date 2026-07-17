"""Optional standalone HTTP wrapper around frame_pipeline (Railway-ready)."""

from __future__ import annotations

import os

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from frame_pipeline import process_youtube

app = FastAPI(docs_url=None, redoc_url=None)
SECRET = os.environ.get("YT_WORKER_SECRET", "")


class ExtractBody(BaseModel):
    url: str
    topic: str | None = None
    max_frames: int = Field(default=16, ge=4, le=24)
    keep_frames: int = Field(default=8, ge=2, le=12)


@app.get("/health")
def health():
    return {"ok": True, "service": "yt-frame-worker"}


@app.post("/v1/youtube/frames")
def extract(body: ExtractBody, x_worker_secret: str | None = Header(default=None)):
    if SECRET and x_worker_secret != SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        return process_youtube(
            body.url,
            max_frames=body.max_frames,
            keep_frames=body.keep_frames,
            topic=body.topic,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)[:500]) from exc
