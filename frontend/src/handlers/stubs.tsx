import type { Component } from "solid-js";
import type { Category } from "../types";
import { ResourceHandler, ViewProps } from "./Handler";

/** Base for not-yet-implemented viewers: a uniform "coming soon" pane,
 *  parameterised by icon/label/phase (Tile inherited from the base). Each
 *  concrete subclass is swapped for a real handler in its phase. */
abstract class StubHandler extends ResourceHandler {
  abstract readonly phase: string;
  readonly zoom = "none" as const;
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
  readonly phase = "the BSP phase";
}

