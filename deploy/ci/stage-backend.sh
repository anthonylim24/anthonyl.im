#!/usr/bin/env bash
# Runs ON the droplet. Stages ~/anthonyl.im.next without touching live.
# Same steps as .github/workflows/deploy.yml "Stage backend on droplet".
set -euo pipefail
export PATH="$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

NEXT="$HOME/anthonyl.im.next"
REPO="${DEPLOY_GIT_URL:-git@github.com:anthonylim24/anthonyl.im.git}"
BRANCH="${DEPLOY_GIT_BRANCH:-main}"

# Stage into a sibling directory so the live tree keeps serving
# until the atomic swap step. Shallow clone keeps droplet disk low.
rm -rf "$NEXT"
git clone --depth=1 --branch "$BRANCH" "$REPO" "$NEXT"
cd "$NEXT"

cp "$HOME/.env" "$NEXT/.env"
cp "$HOME/.env" "$NEXT/frontend/.env"

if [ ! -x "$HOME/.bun/bin/bun" ]; then
  curl -fsSL https://bun.sh/install | bash
fi
export PATH="$HOME/.bun/bin:$PATH"
bun install --frozen-lockfile

# System tools the IG places worker needs. Non-fatal — worker
# degrades to caption-only when these are missing.

if ! command -v yt-dlp >/dev/null 2>&1; then
  echo "[deploy] yt-dlp missing — installing latest standalone binary"
  sudo curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
    && sudo chmod a+rx /usr/local/bin/yt-dlp \
    || echo "[deploy] WARN: yt-dlp install failed; video pipeline will fall back to direct CDN fetch"
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "[deploy] ffmpeg missing — trying apt first, static binary as fallback"
  (sudo apt-get install -y -qq ffmpeg 2>&1 \
    | grep -v -E '^E: The repository' || true) >/dev/null || true
  if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "[deploy] apt install of ffmpeg failed — fetching static binary"
    TMPF=$(mktemp -d)
    if curl -fsSL https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz \
         -o "$TMPF/ffmpeg.tar.xz" \
       && tar -xf "$TMPF/ffmpeg.tar.xz" -C "$TMPF" \
       && FFBIN=$(find "$TMPF" -name ffmpeg -type f | head -1) \
       && [ -n "$FFBIN" ]; then
      sudo mv "$FFBIN" /usr/local/bin/ffmpeg
      sudo chmod a+rx /usr/local/bin/ffmpeg
    else
      echo "[deploy] WARN: ffmpeg static-binary install also failed; transcription/frame-OCR will be skipped per-job"
    fi
    rm -rf "$TMPF"
  fi
fi

if ! command -v dev-browser >/dev/null 2>&1; then
  echo "[deploy] dev-browser missing — installing globally"
  if sudo npm install -g dev-browser 2>&1 | tail -3; then
    dev-browser install 2>&1 | tail -3 \
      || echo "[deploy] WARN: dev-browser install (binary download) failed; headless fallback will be skipped"
  else
    echo "[deploy] WARN: dev-browser global install failed; headless fallback will be skipped"
  fi
fi

echo "[deploy] staged $NEXT from $REPO ($BRANCH)"
echo "[deploy] yt-dlp: $(command -v yt-dlp >/dev/null 2>&1 && yt-dlp --version 2>/dev/null || echo MISSING)"
echo "[deploy] ffmpeg: $(command -v ffmpeg >/dev/null 2>&1 && ffmpeg -version 2>/dev/null | head -1 || echo MISSING)"
echo "[deploy] dev-browser: $(command -v dev-browser >/dev/null 2>&1 && dev-browser --version 2>/dev/null || echo MISSING)"
