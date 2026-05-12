from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import HTMLResponse

from videolens import __version__
from videolens.config import Config

app = FastAPI(
    title="VideoLens",
    version=__version__,
    description="Universal video intelligence API entrypoint for Vercel.",
)


@app.get("/", response_class=HTMLResponse)
def home() -> str:
    return """
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>VideoLens</title>
        <style>
          :root {
            color-scheme: light dark;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
              "Segoe UI", sans-serif;
          }
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #f6f7f8;
            color: #111827;
          }
          main {
            width: min(720px, calc(100vw - 40px));
          }
          h1 {
            margin: 0 0 12px;
            font-size: clamp(2rem, 5vw, 4rem);
            line-height: 1;
          }
          p {
            margin: 0 0 20px;
            max-width: 62ch;
            color: #4b5563;
            font-size: 1.05rem;
            line-height: 1.6;
          }
          a {
            color: #0f766e;
            font-weight: 700;
          }
          code {
            background: #e5e7eb;
            border-radius: 6px;
            padding: 0.15rem 0.35rem;
          }
          @media (prefers-color-scheme: dark) {
            body {
              background: #0f172a;
              color: #f8fafc;
            }
            p {
              color: #cbd5e1;
            }
            code {
              background: #1e293b;
            }
          }
        </style>
      </head>
      <body>
        <main>
          <h1>VideoLens</h1>
          <p>
            VideoLens is deployed on Vercel with a Python API entrypoint.
            The local Streamlit interface still runs with <code>uv run videolens ui</code>.
          </p>
          <p><a href="/api/health">View health endpoint</a></p>
        </main>
      </body>
    </html>
    """


@app.get("/api/health")
def health() -> dict[str, bool | str]:
    config = Config.load()
    return {
        "status": "ok",
        "service": "videolens",
        "version": __version__,
        "openai_api_key_configured": config.openai_api_key is not None,
    }
