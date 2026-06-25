import type { Rgba } from "../types";

/** Blit a decoded RGBA buffer into a canvas at native resolution. */
export function paintRgba(canvas: HTMLCanvasElement, data: Rgba) {
  canvas.width = data.width;
  canvas.height = data.height;
  const ctx = canvas.getContext("2d")!;
  const arr = new Uint8ClampedArray(data.pixels);
  ctx.putImageData(new ImageData(arr, data.width, data.height), 0, 0);
}
