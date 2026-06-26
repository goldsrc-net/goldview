/** Shared formatting helpers (single source of truth). */

/** File extension (without the dot), lowercased; "" if none. */
export function extOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i >= 0 ? path.slice(i + 1).toLowerCase() : "";
}

/** Human-readable byte size. */
export function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Pixel dimensions as `W×H` (single source for the ×-glyph form). */
export function fmtDim(w: number, h: number): string {
  return `${w}×${h}`;
}
