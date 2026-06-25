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
  skin_index: number[];
}
export interface PartData {
  name: string;
  model_names: string[];
  submeshes: SubMesh[];
}
export interface BoneOut {
  name: string;
  parent: number;
  pos: [number, number, number];
  quat: [number, number, number, number];
}
export interface SeqMeta {
  name: string;
  fps: number;
  num_frames: number;
}
export interface AttachOut {
  name: string;
  bone: number;
  pos: [number, number, number];
}
export interface HitboxOut {
  bone: number;
  group: number;
  bbmin: [number, number, number];
  bbmax: [number, number, number];
}
export interface ModelData {
  name: string;
  num_bones: number;
  bones: BoneOut[];
  textures: ModelTexture[];
  num_skin_families: number;
  sequences: SeqMeta[];
  attachments: AttachOut[];
  hitboxes: HitboxOut[];
  parts: PartData[];
  bbox_min: [number, number, number];
  bbox_max: [number, number, number];
}

/** load_animation: frames[frame][bone] = [px,py,pz, qx,qy,qz,qw] */
export type AnimationData = number[][][];

export interface WavInfo {
  channels: number;
  sample_rate: number;
  bits_per_sample: number;
  duration_secs: number;
  bytes: number;
}
