import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { AnimationData, BspData, ModelData, Node, OpenResult, Rgba, SpriteData, WadTexture, WavInfo } from "./types";

/** Pick a game directory and open it (reads its fallback_dir). */
export async function pickAndOpenMod(): Promise<OpenResult | null> {
  const dir = await openDialog({ directory: true, multiple: false, title: "Open a mod / game directory" });
  if (!dir || Array.isArray(dir)) return null;
  return openMod(dir);
}

export function openMod(path: string): Promise<OpenResult> {
  return invoke<OpenResult>("open_mod", { path });
}

/** Auto-open the mod named by $GOLDVIEW_MOD, if set (dev/CLI convenience). */
export function startupMod(): Promise<OpenResult | null> {
  return invoke<OpenResult | null>("startup_mod");
}

export function listTree(): Promise<Node> {
  return invoke<Node>("list_tree");
}

export function readText(path: string): Promise<string> {
  return invoke<string>("read_text", { path });
}

export function loadImage(path: string): Promise<Rgba> {
  return invoke<Rgba>("load_image", { path });
}

export function loadThumbnail(path: string, max: number): Promise<Rgba> {
  return invoke<Rgba>("load_thumbnail", { path, max });
}

export function textPreview(path: string, maxBytes: number): Promise<string> {
  return invoke<string>("text_preview", { path, maxBytes });
}

export function loadWad(path: string): Promise<WadTexture[]> {
  return invoke<WadTexture[]>("load_wad", { path });
}

export function wadTexture(path: string, name: string): Promise<Rgba> {
  return invoke<Rgba>("wad_texture", { path, name });
}

export function loadSprite(path: string): Promise<SpriteData> {
  return invoke<SpriteData>("load_sprite", { path });
}

export function spriteThumbnail(path: string, max: number): Promise<Rgba> {
  return invoke<Rgba>("sprite_thumbnail", { path, max });
}

export function loadModel(path: string, skin = 0, bodyparts: number[] = []): Promise<ModelData> {
  return invoke<ModelData>("load_model", { path, skin, bodyparts });
}

export function modelTexture(path: string, index: number): Promise<Rgba> {
  return invoke<Rgba>("model_texture", { path, index });
}

export function loadAnimation(path: string, seq: number): Promise<AnimationData> {
  return invoke<AnimationData>("load_animation", { path, seq });
}

export function loadBsp(path: string): Promise<BspData> {
  return invoke<BspData>("load_bsp", { path });
}

export function audioInfo(path: string): Promise<WavInfo> {
  return invoke<WavInfo>("audio_info", { path });
}

/** Open the OS file manager at the resource's folder. */
export function revealPath(path: string): Promise<void> {
  return invoke<void>("reveal_path", { path });
}

/** Build a goldview:// URL for a relative resource path (raw bytes). */
export function rawUrl(path: string): string {
  return convertFileSrc(path, "goldview");
}
