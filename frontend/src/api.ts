import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { Node, OpenResult, Rgba, WavInfo } from "./types";

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

export function audioInfo(path: string): Promise<WavInfo> {
  return invoke<WavInfo>("audio_info", { path });
}

/** Build a goldview:// URL for a relative resource path (raw bytes). */
export function rawUrl(path: string): string {
  return convertFileSrc(path, "goldview");
}
