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

export interface WadTexture {
  name: string;
  kind: number; // 0x42 qpic, 0x43 miptex, 0x45 font
  width: number;
  height: number;
}

export interface SpriteData {
  width: number;
  height: number;
  num_frames: number;
  type_name: string;
  format_name: string;
  beam_length: number;
  frames: Rgba[];
}

export interface ModelTexture {
  name: string;
  width: number;
  height: number;
}
export interface SubMesh {
  texture: number;
  positions: number[];
  uvs: number[];
}
export interface PartData {
  name: string;
  submeshes: SubMesh[];
}
export interface ModelData {
  name: string;
  num_bones: number;
  textures: ModelTexture[];
  num_skin_families: number;
  parts: PartData[];
  bbox_min: [number, number, number];
  bbox_max: [number, number, number];
}

export interface WavInfo {
  channels: number;
  sample_rate: number;
  bits_per_sample: number;
  duration_secs: number;
  bytes: number;
}
