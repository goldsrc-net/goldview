import { createRoot, createSignal, type Accessor } from "solid-js";
import * as THREE from "three";
import { loadModel, loadAnimation, modelTexture } from "../api";
import type { ModelData, PartMeta } from "../types";
import { OrbitControls } from "../three/OrbitControls";

export type ViewMode = "model" | "textures";

/** HLMV-style display toggles. */
export interface DisplayOpts {
  bones: boolean;
  attachments: boolean;
  hitboxes: boolean;
  bbox: boolean;
  ground: boolean;
}
const DEFAULT_DISPLAY: DisplayOpts = {
  bones: false,
  attachments: false,
  hitboxes: false,
  bbox: false,
  ground: false,
};

/**
 * Owns the Three.js scene + all model viewer state for one open model, so the
 * center viewport (ModelViewer) and the sidebar controls (ModelPanel) share it.
 * Created by the viewer, published via the module signal below, read by both.
 * Builds a SkinnedMesh + Skeleton and drives an AnimationMixer for playback.
 */
export class ModelController {
  // reactive state (read by the panel; created in an owned root)
  data!: Accessor<ModelData | null>;
  seq!: Accessor<number>;
  playing!: Accessor<boolean>;
  speed!: Accessor<number>;
  frame!: Accessor<number>;
  frameCount!: Accessor<number>;
  skin!: Accessor<number>;
  bodyparts!: Accessor<number[]>;
  /** stable per-part {name, submodel names}, captured once (survives rebuilds) */
  partsMeta!: Accessor<PartMeta[]>;
  wireframe!: Accessor<boolean>;
  viewMode!: Accessor<ViewMode>;
  display!: Accessor<DisplayOpts>;
  bg!: Accessor<string>;

  private setData!: (d: ModelData | null) => void;
  private setSeqS!: (n: number) => void;
  private setPlayingS!: (b: boolean) => void;
  private setSpeedS!: (n: number) => void;
  private setFrameS!: (n: number) => void;
  private setFrameCount!: (n: number) => void;
  private setSkinS!: (n: number) => void;
  private setBodypartsS!: (n: number[]) => void;
  private setPartsMetaS!: (p: PartMeta[]) => void;
  private setWireframeS!: (b: boolean) => void;
  private setViewModeS!: (m: ViewMode) => void;
  private setDisplayS!: (d: DisplayOpts) => void;
  private setBgS!: (s: string) => void;
  private disposeRoot!: () => void;

  // three.js
  private renderer?: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private group = new THREE.Group();
  private camera = new THREE.PerspectiveCamera(60, 1, 1, 100000);
  private controls?: OrbitControls;
  private mixer?: THREE.AnimationMixer;
  private action?: THREE.AnimationAction;
  private skeleton?: THREE.Skeleton;
  private geoms: THREE.BufferGeometry[] = [];
  private mats: THREE.MeshLambertMaterial[] = [];
  private texMap = new Map<number, THREE.Texture>();
  // display helpers (created on first toggle)
  private boneHelper?: THREE.SkeletonHelper;
  private bboxHelper?: THREE.Box3Helper;
  private groundHelper?: THREE.GridHelper;
  // attachment markers + hitbox boxes, parented to their bones so they animate
  private attachObjs: THREE.Object3D[] = [];
  private hitboxObjs: THREE.Box3Helper[] = [];
  private attachGeo?: THREE.SphereGeometry;
  private attachMat?: THREE.MeshBasicMaterial;
  private clock = new THREE.Clock();
  private raf = 0;
  private ro?: ResizeObserver;

  constructor(public readonly path: string) {
    createRoot((dispose) => {
      this.disposeRoot = dispose;
      const [data, setData] = createSignal<ModelData | null>(null);
      const [seq, setSeq] = createSignal(0);
      const [playing, setPlaying] = createSignal(true);
      const [speed, setSpeed] = createSignal(1);
      const [frame, setFrame] = createSignal(0);
      const [frameCount, setFrameCount] = createSignal(0);
      const [skin, setSkin] = createSignal(0);
      const [bodyparts, setBodyparts] = createSignal<number[]>([]);
      const [partsMeta, setPartsMeta] = createSignal<PartMeta[]>([]);
      const [wireframe, setWireframe] = createSignal(false);
      const [viewMode, setViewMode] = createSignal<ViewMode>("model");
      const [display, setDisplay] = createSignal<DisplayOpts>({ ...DEFAULT_DISPLAY });
      const [bg, setBg] = createSignal("#131417");
      this.data = data;
      this.seq = seq;
      this.playing = playing;
      this.speed = speed;
      this.frame = frame;
      this.frameCount = frameCount;
      this.skin = skin;
      this.bodyparts = bodyparts;
      this.partsMeta = partsMeta;
      this.wireframe = wireframe;
      this.viewMode = viewMode;
      this.display = display;
      this.bg = bg;
      this.setData = setData;
      this.setSeqS = setSeq;
      this.setPlayingS = setPlaying;
      this.setSpeedS = setSpeed;
      this.setFrameS = setFrame;
      this.setFrameCount = setFrameCount;
      this.setSkinS = setSkin;
      this.setBodypartsS = setBodyparts;
      this.setPartsMetaS = setPartsMeta;
      this.setWireframeS = setWireframe;
      this.setViewModeS = setViewMode;
      this.setDisplayS = setDisplay;
      this.setBgS = setBg;
    });
    this.scene.background = new THREE.Color(0x131417);
    this.group.rotation.x = -Math.PI / 2; // GoldSrc Z-up → Three Y-up
    this.scene.add(this.group);
    // HLMV-style soft shading: bright ambient + a gentle key light (not fullbright)
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(0.5, 1, 0.8);
    this.scene.add(key);
  }

  /** Attach to the viewer's (reused) renderer + start the loop. */
  async attach(renderer: THREE.WebGLRenderer, container: HTMLElement) {
    this.renderer = renderer;
    const canvas = renderer.domElement;

    const model = await loadModel(this.path, this.skin(), this.bodyparts());
    this.setData(model);
    // capture the stable body-part metadata once (rebuilds won't recreate the UI)
    this.setPartsMetaS(model.parts.map((p) => ({ name: p.name, models: p.model_names })));
    await this.buildMesh(model);
    this.frameCamera(model);
    this.controls = new OrbitControls(this.camera, canvas, { target: this.target, radius: this.radius });

    if (model.sequences.length) await this.setSequence(0);

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h || !this.renderer) return;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    resize();
    this.ro = new ResizeObserver(resize);
    this.ro.observe(container);

    const loop = () => {
      const dt = this.clock.getDelta();
      this.controls?.update(dt);
      if (this.mixer && this.action) {
        if (this.playing()) this.mixer.update(dt * this.speed());
        const dur = this.action.getClip().duration || 1;
        const fc = this.frameCount();
        if (fc > 0) this.setFrameS(Math.round(((this.action.time % dur) / dur) * fc) % fc);
      }
      this.renderer!.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private target = new THREE.Vector3();
  private radius = 100;
  private frameCamera(_model: ModelData) {
    const box = new THREE.Box3().setFromObject(this.group);
    box.getCenter(this.target);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    this.radius = (maxDim / (2 * Math.tan((this.camera.fov * Math.PI) / 360))) * 1.4;
  }

  private async buildMesh(model: ModelData) {
    // textures
    const used = new Set<number>();
    for (const part of model.parts) for (const sm of part.submeshes) used.add(sm.texture);
    await Promise.all(
      [...used].map(async (idx) => {
        try {
          const rgba = await modelTexture(this.path, idx);
          const tex = new THREE.DataTexture(new Uint8Array(rgba.pixels), rgba.width, rgba.height, THREE.RGBAFormat);
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.minFilter = tex.magFilter = THREE.LinearFilter;
          tex.needsUpdate = true;
          this.texMap.set(idx, tex);
        } catch {
          /* untextured */
        }
      }),
    );

    // skeleton (unique bone names so animation tracks bind unambiguously)
    const bones = model.bones.map((b, i) => {
      const bone = new THREE.Bone();
      bone.name = `bone_${i}`;
      bone.position.set(b.pos[0], b.pos[1], b.pos[2]);
      bone.quaternion.set(b.quat[0], b.quat[1], b.quat[2], b.quat[3]);
      return bone;
    });
    model.bones.forEach((b, i) => (b.parent >= 0 ? bones[b.parent].add(bones[i]) : this.group.add(bones[i])));
    // bone world matrices must be current before the Skeleton computes its
    // bind-pose inverses, else skinning double-transforms (explodes).
    this.group.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(bones);

    for (const part of model.parts) {
      for (const sm of part.submeshes) {
        if (sm.positions.length === 0) continue;
        const vcount = sm.positions.length / 3;
        const si = new Uint16Array(vcount * 4);
        const sw = new Float32Array(vcount * 4);
        for (let v = 0; v < vcount; v++) {
          si[v * 4] = sm.skin_index[v] ?? 0;
          sw[v * 4] = 1;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(sm.positions, 3));
        geo.setAttribute("uv", new THREE.Float32BufferAttribute(sm.uvs, 2));
        geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
        geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
        geo.computeVertexNormals(); // smooth normals (flat toggle uses face normals)
        const mat = new THREE.MeshLambertMaterial({
          map: this.texMap.get(sm.texture) ?? null,
          color: this.texMap.has(sm.texture) ? 0xffffff : 0x9aa0a8,
          side: THREE.DoubleSide,
          wireframe: this.wireframe(),
        });
        const mesh = new THREE.SkinnedMesh(geo, mat);
        this.group.add(mesh);
        // bones already live under `group`; bind without re-parenting them
        mesh.bind(this.skeleton);
        this.geoms.push(geo);
        this.mats.push(mat);
      }
    }
    // skeleton overlay — bright, drawn over the model (hidden until toggled)
    this.boneHelper = new THREE.SkeletonHelper(this.group);
    const bhm = this.boneHelper.material as THREE.LineBasicMaterial;
    bhm.vertexColors = false;
    bhm.color = new THREE.Color(0xffcc33);
    bhm.depthTest = false;
    bhm.needsUpdate = true;
    this.boneHelper.visible = false;
    this.scene.add(this.boneHelper);

    // attachment markers (spheres) + hitbox boxes, parented to bones → animate
    this.attachGeo = new THREE.SphereGeometry(1.3, 8, 6);
    this.attachMat = new THREE.MeshBasicMaterial({ color: 0x33e0ff, depthTest: false });
    this.attachObjs = model.attachments.map((a) => {
      const m = new THREE.Mesh(this.attachGeo!, this.attachMat!);
      m.position.set(a.pos[0], a.pos[1], a.pos[2]);
      m.visible = false;
      (bones[a.bone] ?? this.group).add(m);
      return m;
    });
    this.hitboxObjs = model.hitboxes.map((h) => {
      const box = new THREE.Box3(new THREE.Vector3(...h.bbmin), new THREE.Vector3(...h.bbmax));
      const helper = new THREE.Box3Helper(box, new THREE.Color(0xff5566));
      (helper.material as THREE.LineBasicMaterial).depthTest = false;
      helper.visible = false;
      (bones[h.bone] ?? this.group).add(helper);
      return helper;
    });

    this.mixer = new THREE.AnimationMixer(this.group);
    this.applyDisplay();
  }

  /** Load + play a sequence's animation as an AnimationClip. */
  async setSequence(i: number) {
    const model = this.data();
    if (!model || !this.mixer) return;
    this.setSeqS(i);
    const meta = model.sequences[i];
    const frames = await loadAnimation(this.path, i);
    const fps = meta.fps || 10;
    const nframes = frames.length;
    this.setFrameCount(nframes);
    if (nframes === 0) return;

    const times = new Float32Array(nframes);
    for (let f = 0; f < nframes; f++) times[f] = f / fps;
    const tracks: THREE.KeyframeTrack[] = [];
    for (let b = 0; b < model.bones.length; b++) {
      const pos = new Float32Array(nframes * 3);
      const quat = new Float32Array(nframes * 4);
      for (let f = 0; f < nframes; f++) {
        const t = frames[f][b];
        pos.set([t[0], t[1], t[2]], f * 3);
        quat.set([t[3], t[4], t[5], t[6]], f * 4);
      }
      tracks.push(new THREE.VectorKeyframeTrack(`bone_${b}.position`, times as any, pos as any));
      tracks.push(new THREE.QuaternionKeyframeTrack(`bone_${b}.quaternion`, times as any, quat as any));
    }
    const clip = new THREE.AnimationClip(meta.name || `seq${i}`, nframes / fps, tracks);
    this.action?.stop();
    this.action = this.mixer.clipAction(clip);
    this.action.play();
    this.action.paused = !this.playing();
  }

  togglePlay() {
    const p = !this.playing();
    this.setPlayingS(p);
    if (this.action) this.action.paused = !p;
  }
  setSpeed(s: number) {
    this.setSpeedS(s);
  }
  /** Scrub to a frame (pauses playback). */
  scrubTo(frame: number) {
    this.setPlayingS(false);
    this.setFrameS(frame);
    if (this.action) {
      const fps = this.data()?.sequences[this.seq()]?.fps || 10;
      this.action.paused = true;
      this.action.time = frame / fps;
      this.mixer?.update(0);
    }
  }
  async setSkin(s: number) {
    this.setSkinS(s);
    await this.rebuild();
  }
  /** Choose a submodel for a body part (rebuilds geometry). */
  async setBodypart(partIndex: number, modelIndex: number) {
    const arr = [...this.bodyparts()];
    while (arr.length <= partIndex) arr.push(0);
    arr[partIndex] = modelIndex;
    this.setBodypartsS(arr);
    await this.rebuild();
  }
  setWireframe(b: boolean) {
    this.setWireframeS(b);
    this.mats.forEach((m) => (m.wireframe = b));
  }
  setViewMode(m: ViewMode) {
    this.setViewModeS(m);
  }
  setDisplay<K extends keyof DisplayOpts>(key: K, val: boolean) {
    this.setDisplayS({ ...this.display(), [key]: val });
    this.applyDisplay();
  }
  setBg(hex: string) {
    this.setBgS(hex);
    this.scene.background = new THREE.Color(hex);
  }

  /** Sync the display helpers/overlays to the current toggles. */
  private applyDisplay() {
    const d = this.display();
    // built-in-buildMesh overlays: just toggle visibility
    if (this.boneHelper) this.boneHelper.visible = d.bones;
    this.attachObjs.forEach((o) => (o.visible = d.attachments));
    this.hitboxObjs.forEach((o) => (o.visible = d.hitboxes));
    // bounding box — from the actual geometry bounds (studiohdr bbox is often
    // zero), in world space so it's reliably visible.
    if (d.bbox && !this.bboxHelper) {
      const box = new THREE.Box3().setFromObject(this.group);
      if (!box.isEmpty()) {
        this.bboxHelper = new THREE.Box3Helper(box, new THREE.Color(0x3fd07a));
        this.scene.add(this.bboxHelper);
      }
    } else if (!d.bbox && this.bboxHelper) {
      this.scene.remove(this.bboxHelper);
      this.bboxHelper = undefined;
    }
    // ground grid at world y=0 (the model's feet plane)
    if (d.ground && !this.groundHelper) {
      const size = Math.max(this.radius, 64) * 2;
      this.groundHelper = new THREE.GridHelper(size, 20, 0x55606b, 0x32373d);
      this.scene.add(this.groundHelper);
    } else if (!d.ground && this.groundHelper) {
      this.scene.remove(this.groundHelper);
      this.groundHelper = undefined;
    }
  }

  /** Rebuild geometry (e.g. after a skin change), keeping the current sequence. */
  private async rebuild() {
    const model = await loadModel(this.path, this.skin(), this.bodyparts());
    this.disposeScene();
    this.setData(model);
    await this.buildMesh(model);
    await this.setSequence(this.seq());
  }

  private disposeScene() {
    this.geoms.forEach((g) => g.dispose());
    this.mats.forEach((m) => m.dispose());
    this.geoms = [];
    this.mats = [];
    // remove meshes + bones (attach/hitbox overlays are bone children → go too)
    [...this.group.children].forEach((c) => this.group.remove(c));
    this.hitboxObjs.forEach((h) => {
      h.geometry.dispose();
      (h.material as THREE.Material).dispose();
    });
    this.attachGeo?.dispose();
    this.attachMat?.dispose();
    this.attachObjs = [];
    this.hitboxObjs = [];
    if (this.bboxHelper) {
      this.scene.remove(this.bboxHelper);
      this.bboxHelper = undefined;
    }
    if (this.boneHelper) {
      this.scene.remove(this.boneHelper);
      this.boneHelper = undefined;
    }
    this.mixer = undefined;
    this.action = undefined;
    this.skeleton = undefined;
  }

  /** Dispose scene resources. The renderer is owned by the viewer (reused). */
  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.controls?.dispose();
    this.disposeScene();
    this.texMap.forEach((t) => t.dispose());
    this.texMap.clear();
    this.disposeRoot();
  }
}

/** The model session both the viewport and the sidebar panel bind to. */
export const [currentModel, setCurrentModel] = createSignal<ModelController | null>(null);
