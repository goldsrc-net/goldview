import type { Component } from "solid-js";
import type { Category } from "../types";
import { ResourceHandler, TileProps, ViewProps } from "./Handler";

/** Base for not-yet-implemented viewers: a uniform "coming soon" tile + pane,
 *  parameterised by icon/label/phase. Each concrete subclass is swapped for a
 *  real handler in its phase (WAD → Phase 1, maps → Phase 2, models → 3/4…). */
abstract class StubHandler extends ResourceHandler {
  abstract readonly phase: string;
  readonly Tile: Component<TileProps> = (_p) => (
    <div class="tile-preview tile-generic">
      <div class="tile-emoji">{this.icon}</div>
      <div class="tile-ext">{this.label}</div>
    </div>
  );
  readonly View: Component<ViewProps> = (_p) => (
    <div class="viewer-body center">
      <div class="placeholder">
        <div style={{ "font-size": "40px" }}>{this.icon}</div>
        {this.label} viewer — coming in {this.phase}
      </div>
    </div>
  );
}

export class MapHandler extends StubHandler {
  readonly id = "map";
  readonly label = "Maps";
  readonly icon = "🗺️";
  readonly categories: Category[] = ["map"];
  readonly phase = "Phase 2";
}

export class ModelHandler extends StubHandler {
  readonly id = "model";
  readonly label = "Models";
  readonly icon = "🧍";
  readonly categories: Category[] = ["model"];
  readonly phase = "Phase 3";
}

export class SpriteHandler extends StubHandler {
  readonly id = "sprite";
  readonly label = "Sprites";
  readonly icon = "✨";
  readonly categories: Category[] = ["sprite"];
  readonly phase = "Phase 5";
}
