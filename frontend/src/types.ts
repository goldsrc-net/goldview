export type Category =
  | "map"
  | "model"
  | "sprite"
  | "wad"
  | "image"
  | "sound"
  | "script"
  | "text"
  | "other";

export interface Node {
  name: string;
  path: string;
  is_dir: boolean;
  category?: Category;
  size?: number;
  source?: number;
  children?: Node[];
}

export interface OpenResult {
  roots: string[];
  names: string[];
  tree: Node;
}

export interface Rgba {
  width: number;
  height: number;
  pixels: number[]; // serialized Vec<u8>
}

export interface WavInfo {
  channels: number;
  sample_rate: number;
  bits_per_sample: number;
  duration_secs: number;
  bytes: number;
}
