import { loadImage } from "../api";
import ImageView from "./ImageView";

/** Image file viewer (TGA/BMP/PNG) — the shared ImageView with its own zoom/pan. */
export default function ImageViewer(props: { path: string }) {
  return <ImageView key={props.path} load={() => loadImage(props.path)} />;
}
