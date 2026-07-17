# Cohesivity Railway: Next.js + yt-dlp + ffmpeg + Laplacian/Gemini frame pick
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    ca-certificates \
    curl \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && pip3 install --break-system-packages --no-cache-dir numpy pillow yt-dlp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY web/package.json web/bun.lock* web/package-lock.json* ./
RUN npm install -g bun \
  && if [ -f bun.lock ]; then bun install --frozen-lockfile; else npm install; fi

COPY web/ ./
COPY yt-worker/frame_pipeline.py /opt/yt-worker/frame_pipeline.py

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV YTDLP_PATH=/usr/local/bin/yt-dlp
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV YT_FRAME_PIPELINE=/opt/yt-worker/frame_pipeline.py
ENV PYTHON_PATH=python3
# Placeholder so Next does not permanently inline missing secrets at build time.
# Real values come from Railway runtime env.
ENV GEMINI_API_KEY=
ENV GOOGLE_API_KEY=
ENV COH_APPLICATION_KEY=
ENV COH_TENANT_ID=
ENV APIFY_API_TOKEN=
ENV CANVA_CLIENT_ID=
ENV CANVA_CLIENT_SECRET=
ENV FIGMA_CLIENT_ID=
ENV FIGMA_CLIENT_SECRET=
ENV FIGMA_ACCESS_TOKEN=

RUN bun run build || npm run build

ENV PORT=3000
EXPOSE 3000
# Railway injects PORT; bind explicitly.
CMD ["sh", "-c", "npm run start -- -H 0.0.0.0 -p ${PORT:-3000}"]
