#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/web"

if [ ! -d node_modules ]; then
  echo "Installing dependencies with Bun..."
  bun install
fi

if [ ! -f .env.local ]; then
  if [ -f ../.env ] && [ -f ../.cohesivity ]; then
    GEMINI=$(grep '^GEMINI_API_KEY=' ../.env | cut -d= -f2-)
    COH=$(grep '^coh_application_key=' ../.cohesivity | cut -d= -f2-)
    printf 'GEMINI_API_KEY=%s\nCOH_APPLICATION_KEY=%s\n' "$GEMINI" "$COH" > .env.local
  else
    echo "Copy web/.env.example to web/.env.local and add your API keys."
    cp .env.example .env.local
    exit 1
  fi
fi

echo ""
echo "Thumbnail Generator: http://localhost:1382"
echo "LAN access: http://$(hostname -I 2>/dev/null | awk '{print $1}'):1382"
echo ""
bun run dev
