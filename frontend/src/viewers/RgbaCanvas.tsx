import { createEffect, type JSX } from "solid-js";
import type { Rgba } from "../types";
import { paintRgba } from "../util/canvas";

/** The single canvas-paint primitive: paints a decoded RGBA buffer to a
 *  `<canvas>`, repainting whenever `data` changes. Used by the thumbnail tile,
 *  the image/texture view, and sprite frames. Pass `ref` to get the element
 *  (e.g. ImageView needs it for cursor-anchored zoom). */
export default function RgbaCanvas(props: {
  data: Rgba;
  class?: string;
  style?: JSX.CSSProperties;
  ref?: (el: HTMLCanvasElement) => void;
}) {
  let canvas: HTMLCanvasElement | undefined;
  createEffect(() => {
    if (canvas) paintRgba(canvas, props.data);
  });
  return (
    <canvas
      class={props.class}
      style={props.style}
      ref={(el) => {
        canvas = el;
        props.ref?.(el);
      }}
    />
  );
}
