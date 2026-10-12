#!/usr/bin/env bash
# Build the release binaries people actually get, into dist/.
#
#   ./release.sh [linux] [win64] [win32]      (no arguments = all three)
#
# Each output is one self-contained file with the frontend embedded:
#   dist/goldview-<version>-linux-x86_64
#   dist/goldview-<version>-win64.exe
#   dist/goldview-<version>-win32.exe
#
# The Windows builds cross-compile from Linux against the MSVC targets, which
# link the WebView2 loader and the C runtime statically (the mingw targets
# need WebView2Loader.dll shipped beside the exe). That takes Microsoft's CRT
# and SDK import libraries, fetched once by xwin (cargo install xwin) into
# $XWIN_DIR, and rustup's bundled rust-lld as the linker. llvm-rc embeds
# src-tauri/icons/icon.ico, which was made from icon.png with:
#   magick icon.png -define icon:auto-resize=256,64,48,32,16 icon.ico
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$root"

xwin_dir="${XWIN_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/goldview/xwin}"
version="$(sed -n 's/^version = "\(.*\)"/\1/p' Cargo.toml | head -1)"
[ $# -gt 0 ] || set -- linux win64 win32

build() { cargo build --release -p goldview --features tauri/custom-protocol "$@"; }

# build_windows <rust arch> <xwin arch> <output suffix>
build_windows() {
  local triple="$1-pc-windows-msvc" lib="$xwin_dir/splat"
  if [ ! -d "$lib/crt/lib/$2" ]; then
    xwin --accept-license --arch x86,x86_64 --cache-dir "$xwin_dir/cache" \
      splat --output "$lib"
  fi
  rustup target add "$triple"
  local var="CARGO_TARGET_${triple//-/_}_RUSTFLAGS"
  export "${var^^}=-C linker=rust-lld -C linker-flavor=lld-link -C target-feature=+crt-static \
-Lnative=$lib/crt/lib/$2 -Lnative=$lib/sdk/lib/um/$2 -Lnative=$lib/sdk/lib/ucrt/$2"
  build --target "$triple"
  cp "target/$triple/release/goldview.exe" "dist/goldview-$version-$3.exe"
}

[ -d frontend/node_modules ] || (cd frontend && npm install)
(cd frontend && npm run build)
mkdir -p dist

for target in "$@"; do
  case "$target" in
    linux)
      build
      cp target/release/goldview "dist/goldview-$version-linux-x86_64"
      ;;
    win64) build_windows x86_64 x86_64 win64 ;;
    win32) build_windows i686 x86 win32 ;;
    *)
      echo "usage: $0 [linux] [win64] [win32]" >&2
      exit 2
      ;;
  esac
done

ls -l dist
