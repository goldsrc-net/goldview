export type Category =
  | "map"
  | "model"
  | "sprite"
  | "wad"
  | "image"
  | "sound"
  | "video"
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

/** A single label→value row, shown in the inspector and other key/value grids.
 *  Handlers contribute these via `details()`; rendered by the shared `KV`. */
export interface Detail {
  label: string;
  value: string;
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
  /** mstudiotexture_t.flags: chrome 0x02, additive 0x20, masked 0x40 */
  flags: number;
  width: number;
  height: number;
}
/** Minimal shape the shared `Gallery` grid needs from any texture-like item
 *  (WadTexture, ModelTexture, …): a name + pixel dimensions for the cell label. */
export interface GalleryItem {
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
/** Stable per-body-part metadata (name + selectable submodel names), captured
 *  once for the panel's submodel selectors so geometry rebuilds don't recreate
 *  the UI. A projection of {@link PartData} minus the heavy submesh arrays. */
export interface PartMeta {
  name: string;
  models: string[];
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
export interface BspSurface {
  texture: number;
  /** BSP model owning this surface (0 = worldspawn; N = brush entity `*N`) */
  model: number;
  positions: number[];
  uvs: number[];
  lightmap_uvs: number[];
  normals: number[];
}
export interface BspTexture {
  name: string;
  width: number;
  height: number;
  embedded: boolean;
}
export interface BspEntity {
  keys: Record<string, string>;
}
export interface BspData {
  surfaces: BspSurface[];
  textures: BspTexture[];
  entities: BspEntity[];
  lightmap: Rgba;
  bbox_min: [number, number, number];
  bbox_max: [number, number, number];
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
