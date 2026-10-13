#!/usr/bin/env bash
# Build the release binaries people actually get, into dist/.
#
#   ./release.sh [linux64] [win64]      (no arguments = both)
#
# Each output is one self-contained file with the frontend embedded:
#   dist/goldview-<version>-linux64
#   dist/goldview-<version>-win64.exe
#
# <version> is the workspace version in Cargo.toml. CI refuses to release a
# tag that does not match it.
#
# The Windows build cross-compiles from Linux against the MSVC target, which
# links the WebView2 loader and the C runtime statically (the mingw target
# needs WebView2Loader.dll shipped beside the exe). That takes Microsoft's CRT
# and SDK import libraries, fetched once by xwin (cargo install xwin) into
# $XWIN_DIR, and rustup's bundled rust-lld as the linker. llvm-rc embeds
# src-tauri/icons/icon.ico, which was made from icon.png with:
#   magick icon.png -define icon:auto-resize=256,64,48,32,16 icon.ico
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$root"

xwin_dir="${XWIN_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/xwin}"
version="$(sed -n 's/^version = "\(.*\)"/\1/p' Cargo.toml | head -1)"
[ $# -gt 0 ] || set -- linux64 win64

build() { cargo build --release -p goldview --features tauri/custom-protocol "$@"; }

build_win64() {
  local lib="$xwin_dir/splat"
  if [ ! -d "$lib/crt/lib/x86_64" ]; then
    xwin --accept-license --arch x86_64 --cache-dir "$xwin_dir/cache" splat --output "$lib"
  fi
  rustup target add x86_64-pc-windows-msvc
  export CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS="-C linker=rust-lld \
-C linker-flavor=lld-link -C target-feature=+crt-static -Lnative=$lib/crt/lib/x86_64 \
-Lnative=$lib/sdk/lib/um/x86_64 -Lnative=$lib/sdk/lib/ucrt/x86_64"
  build --target x86_64-pc-windows-msvc
  cp target/x86_64-pc-windows-msvc/release/goldview.exe "dist/goldview-$version-win64.exe"
}

for target in "$@"; do
  case "$target" in
    linux64 | win64) ;;
    *)
      echo "usage: $0 [linux64] [win64]" >&2
      exit 2
      ;;
  esac
done

[ -d frontend/node_modules ] || (cd frontend && npm ci)
(cd frontend && npm run build)
mkdir -p dist

for target in "$@"; do
  case "$target" in
    linux64)
      build
      cp target/release/goldview "dist/goldview-$version-linux64"
      ;;
    win64) build_win64 ;;
  esac
done

ls -l dist
