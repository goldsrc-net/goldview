import { HandlerRegistry } from "./Handler";
import { DefaultHandler } from "./DefaultHandler";
import { FolderHandler } from "./FolderHandler";
import { ImageHandler } from "./ImageHandler";
import { TextHandler } from "./TextHandler";
import { SoundHandler } from "./SoundHandler";
import { MapHandler, ModelHandler, SpriteHandler, WadHandler } from "./stubs";

/** The single registry of resource handlers. Order matters: first
 *  `canHandle` wins. Folders first, then real previews, then the stubs;
 *  `DefaultHandler` is the catch-all fallback. */
export const registry = new HandlerRegistry(new DefaultHandler())
  .register(new FolderHandler())
  .register(new ImageHandler())
  .register(new TextHandler())
  .register(new SoundHandler())
  .register(new MapHandler())
  .register(new ModelHandler())
  .register(new SpriteHandler())
  .register(new WadHandler());
