#!/bin/sh
set -eu

deno run \
  --allow-env \
  --allow-net \
  --allow-ffi=/opt/bgutil-provider/node_modules \
  --allow-read=/opt/bgutil-provider/node_modules \
  /opt/bgutil-provider/src/main.ts &
videolens_bgutil_pid=$!

videolens_bgutil_attempt=0
until curl -fsS http://127.0.0.1:4416/ping >/dev/null; do
  videolens_bgutil_attempt=$((videolens_bgutil_attempt + 1))

  if ! kill -0 "$videolens_bgutil_pid" 2>/dev/null; then
    echo "VideoLens startup failed: PO-token provider exited before becoming ready." >&2
    wait "$videolens_bgutil_pid"
    exit 1
  fi

  if [ "$videolens_bgutil_attempt" -ge 50 ]; then
    echo "VideoLens startup failed: PO-token provider did not become ready." >&2
    exit 1
  fi

  sleep 0.2
done

exec videolens ui --host 0.0.0.0 --port "${PORT:-8501}" --no-open
