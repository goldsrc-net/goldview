import { Show, type Component } from "solid-js";
import type { Category, Node } from "../types";
import { extOf } from "../util/format";

/** How a handler responds to Ctrl+zoom: not at all, by scaling the font (text),
 *  or by scaling pixels (images/sprites). The Viewer host owns the zoom state +
 *  input; the View just applies the factor. */
export type ZoomMode = "none" | "font" | "scale";

/** A single inspector row a handler contributes for the selected node. */
export interface Detail {
  label: string;
  value: string;
}

/** Props passed to a full-pane viewer. `onSelect` lets a view navigate the
 *  selection (used by the folder grid to drill into children). `zoom` is the
 *  current Ctrl-zoom factor (1 = 100%; always 1 for `zoom: "none"` handlers). */
export interface ViewProps {
  node: Node;
  onSelect: (n: Node) => void;
  zoom: number;
}

/** Props passed to a grid preview tile. Tiles are pure preview content — the
 *  enclosing grid cell owns the click/selection. */
export interface TileProps {
  node: Node;
}

/**
 * Abstract base for every resource type goldview can preview & view.
 *
 * Concrete handlers subclass this. The two declared surfaces are `icon`/`label`
 * (identity) and `View` (the full-pane viewer, abstract — every handler MUST
 * implement it). `Tile` has a sensible default (a generic icon tile built from
 * `icon`), so simple handlers inherit it and only the rich ones override. The
 * polymorphic `canHandle` decides which handler claims a node; subclasses may
 * override it (e.g. the folder handler matches directories instead of a
 * category). `details` is an optional inspector contribution.
 *
 * Note: `Tile`/`View` are arrow-function class FIELDS (not methods) so `this`
 * stays bound when they're passed as bare components to `<Dynamic>`.
 */
export abstract class ResourceHandler {
  /** stable id, also used as the filter key */
  abstract readonly id: string;
  /** human label for the folder-view filter UI / inspector */
  abstract readonly label: string;
  /** glyph shown in filter chips / generic tiles / the tree */
  abstract readonly icon: string;
  /** categories this handler claims */
  abstract readonly categories: Category[];
  /** how Ctrl+zoom behaves for this handler's view (forces each handler to decide) */
  abstract readonly zoom: ZoomMode;
  /** full-pane viewer component */
  abstract readonly View: Component<ViewProps>;

  /** Default grid-preview tile: a generic icon chip. Override for real previews. */
  readonly Tile: Component<TileProps> = (p) => (
    <div class="tile-preview tile-generic">
      <div class="tile-emoji">{this.icon}</div>
      <Show when={!p.node.is_dir && extOf(p.node.name)}>
        <div class="tile-ext">{extOf(p.node.name).toUpperCase()}</div>
      </Show>
    </div>
  );

  /** Does this handler claim `node`? Default: a file whose category matches. */
  canHandle(node: Node): boolean {
    return !node.is_dir && !!node.category && this.categories.includes(node.category);
  }

  /** Optional type-specific inspector rows for `node` (async; may decode). */
  details?(node: Node): Promise<Detail[]>;
}

/** Ordered list of handlers + a fallback; first `canHandle` wins. */
export class HandlerRegistry {
  private handlers: ResourceHandler[] = [];
  constructor(private fallback: ResourceHandler) {}

  register(h: ResourceHandler): this {
    this.handlers.push(h);
    return this;
  }

  /** The handler that claims `node` (folder/category/fallback). */
  resolve(node: Node): ResourceHandler {
    return this.handlers.find((h) => h.canHandle(node)) ?? this.fallback;
  }

  /** The handler that owns a given file category (for filter chips). */
  forCategory(cat: Category): ResourceHandler | undefined {
    return this.handlers.find((h) => h.categories.includes(cat));
  }

  /** The fallback handler (claims anything). */
  get default(): ResourceHandler {
    return this.fallback;
  }
}
