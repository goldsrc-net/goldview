import type { Component } from "solid-js";
import type { Category, Node } from "../types";

/** How a handler responds to Ctrl+zoom: not at all, by scaling the font (text),
 *  or by scaling pixels (images/sprites). The Viewer host owns the zoom state +
 *  input; the View just applies the factor. */
export type ZoomMode = "none" | "font" | "scale";

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
 * Concrete handlers subclass this and implement the two visual surfaces —
 * `Tile` (the small grid-preview component) and `View` (the full-pane viewer
 * component) — so that *every* file type renders a preview. Polymorphic
 * `canHandle` decides which handler claims a node; subclasses may override it
 * (e.g. the folder handler matches directories instead of a category).
 */
export abstract class ResourceHandler {
  /** stable id, also used as the filter key */
  abstract readonly id: string;
  /** human label for the folder-view filter UI */
  abstract readonly label: string;
  /** glyph shown in filter chips / generic tiles */
  abstract readonly icon: string;
  /** categories this handler claims */
  abstract readonly categories: Category[];
  /** how Ctrl+zoom behaves for this handler's view (forces each handler to decide) */
  abstract readonly zoom: ZoomMode;
  /** small grid-preview component */
  abstract readonly Tile: Component<TileProps>;
  /** full-pane viewer component */
  abstract readonly View: Component<ViewProps>;

  /** Does this handler claim `node`? Default: a file whose category matches. */
  canHandle(node: Node): boolean {
    return !node.is_dir && !!node.category && this.categories.includes(node.category);
  }
}

/** Ordered list of handlers + a fallback; first `canHandle` wins. */
export class HandlerRegistry {
  private handlers: ResourceHandler[] = [];
  constructor(private fallback: ResourceHandler) {}

  register(h: ResourceHandler): this {
    this.handlers.push(h);
    return this;
  }

  resolve(node: Node): ResourceHandler {
    return this.handlers.find((h) => h.canHandle(node)) ?? this.fallback;
  }

  /** The fallback handler (claims anything). */
  get default(): ResourceHandler {
    return this.fallback;
  }
}
