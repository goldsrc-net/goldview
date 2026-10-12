#!/usr/bin/env bash
# Build and launch goldview.
#
#   ./launch.sh [debug|release] [gamedir]
#
# debug    unoptimized binary that loads the UI from the vite dev server on
#          :1420 (hot reload). Starts vite if it is not already running and
#          stops it again on exit.
# release  optimized binary with the built frontend embedded. No dev server.
#
# gamedir is opened on launch (same as setting GOLDVIEW_MOD). Without it, use
# the "Open mod..." button.
set -euo pipefail

mode="${1:-debug}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$root"

if [ $# -ge 2 ]; then
  GOLDVIEW_MOD="$(realpath "$2")"
  export GOLDVIEW_MOD
fi

[ -d frontend/node_modules ] || (cd frontend && npm install)

# "localhost", not 127.0.0.1: vite binds the IPv6 loopback only.
vite_up() { (exec 3<>/dev/tcp/localhost/1420) 2>/dev/null; }

case "$mode" in
  debug)
    if ! vite_up; then
      # vite directly, not "npm run dev": npm does not pass the kill on.
      (cd frontend && exec ./node_modules/.bin/vite) &
      vite_pid=$!
      trap 'kill "$vite_pid" 2>/dev/null || true' EXIT
      until vite_up; do
        kill -0 "$vite_pid" 2>/dev/null || { echo "vite failed to start" >&2; exit 1; }
        sleep 0.2
      done
    fi
    cargo build -p goldview
    ./target/debug/goldview
    ;;
  release)
    (cd frontend && npm run build)
    # tauri/custom-protocol is what makes the binary serve the embedded
    # frontend/dist. Without it even a --release build loads the dev server.
    cargo build --release -p goldview --features tauri/custom-protocol
    ./target/release/goldview
    ;;
  *)
    echo "usage: $0 [debug|release] [gamedir]" >&2
    exit 2
    ;;
esac
