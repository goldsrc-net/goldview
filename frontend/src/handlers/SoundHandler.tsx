import type { Component } from "solid-js";
import type { Category } from "../types";
import { ResourceHandler, TileProps, ViewProps } from "./Handler";
import AudioPlayer from "../viewers/AudioPlayer";

export class SoundHandler extends ResourceHandler {
  readonly id = "sound";
  readonly label = "Sounds";
  readonly icon = "🔊";
  readonly categories: Category[] = ["sound"];
  readonly zoom = "none" as const;
  readonly Tile: Component<TileProps> = (p) => (
    <div class="tile-preview tile-generic">
      <div class="tile-emoji">🔊</div>
      <div class="tile-ext">{ext(p.node.name)}</div>
    </div>
  );
  readonly View: Component<ViewProps> = (p) => <AudioPlayer path={p.node.path} />;
}

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toUpperCase() : "";
}
