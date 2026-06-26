import type { Component } from "solid-js";
import type { Category } from "../types";
import { ResourceHandler, ViewProps } from "./Handler";
import VideoPlayer from "../viewers/VideoPlayer";

/** Video files (webm/mp4/ogv/avi). Tile = base 🎞️ icon; View = the player. */
export class VideoHandler extends ResourceHandler {
  readonly id = "video";
  readonly label = "Videos";
  readonly icon = "🎞️";
  readonly categories: Category[] = ["video"];
  readonly zoom = "none" as const;
  readonly View: Component<ViewProps> = (p) => <VideoPlayer path={p.node.path} />;
}
