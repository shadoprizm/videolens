FROM python:3.12-slim

# yt-dlp requires an external JavaScript runtime for YouTube's current player
# challenges. Deno is the runtime recommended by yt-dlp and is enabled by
# default when present on PATH.
COPY --from=denoland/deno:bin-2.7.14 /deno /usr/local/bin/deno
COPY --from=brainicism/bgutil-ytdlp-pot-provider:1.3.1-deno /app /opt/bgutil-provider

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    VIDEOLENS_CACHE_DIR=/app/.videolens/cache \
    STREAMLIT_BROWSER_GATHER_USAGE_STATS=false \
    STREAMLIT_SERVER_HEADLESS=true \
    STREAMLIT_SERVER_ENABLE_CORS=false \
    STREAMLIT_SERVER_ENABLE_XSRF_PROTECTION=false \
    STREAMLIT_SERVER_ENABLE_WEBSOCKET_COMPRESSION=false \
    DENO_DIR=/opt/bgutil-provider/.cache/deno \
    DENO_NO_PROMPT=1 \
    DENO_NO_UPDATE_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        ffmpeg \
        libcairo2 \
        libffi8 \
        libgdk-pixbuf-2.0-0 \
        libglib2.0-0 \
        libpango-1.0-0 \
        libpangoft2-1.0-0 \
        shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.9.18 /uv /uvx /usr/local/bin/

WORKDIR /app

COPY pyproject.toml uv.lock README.md LICENSE ./
COPY app.py ./app.py
COPY .streamlit ./.streamlit
COPY scripts ./scripts
COPY src ./src

RUN uv sync --frozen --no-dev --extra ui

RUN chmod +x /app/scripts/start-hosted.sh

# The hosted app is an interactive product surface, not a search landing page.
# Give its initial HTML a useful title and keep the thin Streamlit shell out of
# the index; videolens.io contains the canonical, crawlable product content.
RUN python -c "from pathlib import Path; p=next(Path('/app/.venv').glob('lib/python*/site-packages/streamlit/static/index.html')); s=p.read_text(); s=s.replace('<title>Streamlit</title>', '<title>VideoLens App — AI Video Analysis</title>'); s=s.replace('<head>', '<head><meta name=\"robots\" content=\"noindex, nofollow, noarchive\"><meta name=\"description\" content=\"VideoLens hosted AI video analysis app.\">', 1); p.write_text(s)"

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8501

CMD ["/app/scripts/start-hosted.sh"]
