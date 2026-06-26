import * as THREE from "three";

/**
 * Turntable/orbit camera for the model viewer (no pointer lock):
 *  - drag (left button) orbits around the model
 *  - Q/E orbit left/right, W/S zoom in/out
 *  - A/D pan left/right (view-relative), Z/C pan up/down (world height)
 *  - plain mouse wheel zooms (only while hovering the canvas)
 * Keys act only while the pointer is over the canvas, so they don't hijack
 * typing elsewhere.
 */
export class OrbitControls {
  target = new THREE.Vector3();
  // Head-on starting view (the original default). Drag to orbit.
  private theta = 0; // azimuth
  private phi = Math.PI / 2.2; // polar (from +Y)
  private radius: number;
  private minR: number;
  private maxR: number;
  private dragging = false;
  private hovering = false;
  private keys = new Set<string>();
  private readonly sens = 0.008;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
    opts: { target?: THREE.Vector3; radius: number },
  ) {
    if (opts.target) this.target.copy(opts.target);
    this.radius = opts.radius;
    this.minR = opts.radius * 0.05;
    this.maxR = opts.radius * 8;

    dom.addEventListener("mousedown", this.onDown);
    window.addEventListener("mouseup", this.onUp);
    window.addEventListener("mousemove", this.onMove);
    dom.addEventListener("wheel", this.onWheel, { passive: false });
    dom.addEventListener("mouseenter", this.onEnter);
    dom.addEventListener("mouseleave", this.onLeave);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    this.apply();
  }

  private onDown = (e: MouseEvent) => {
    if (e.button === 0) this.dragging = true;
  };
  private onUp = () => (this.dragging = false);
  private onMove = (e: MouseEvent) => {
    if (!this.dragging) return;
    this.theta -= e.movementX * this.sens;
    this.phi -= e.movementY * this.sens;
    this.clampPhi();
    this.apply();
  };
  private onWheel = (e: WheelEvent) => {
    if (!this.hovering) return;
    e.preventDefault();
    this.zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1);
  };
  private onEnter = () => (this.hovering = true);
  private onLeave = () => {
    this.hovering = false;
    this.keys.clear();
  };
  private onKey = (e: KeyboardEvent) => {
    if (this.hovering) this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);

  private clampPhi() {
    const lim = 0.01;
    this.phi = Math.max(lim, Math.min(Math.PI - lim, this.phi));
  }
  private zoom(f: number) {
    this.radius = Math.max(this.minR, Math.min(this.maxR, this.radius * f));
    this.apply();
  }

  /** Recompute camera position from spherical coords around the target. */
  private apply() {
    const sp = Math.sin(this.phi);
    this.camera.position.set(
      this.target.x + this.radius * sp * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * sp * Math.cos(this.theta),
    );
    this.camera.lookAt(this.target);
  }

  /** Apply held keys; call once per frame with seconds. */
  update(dt: number) {
    if (this.keys.size === 0) return;
    const rot = 1.5 * dt; // rad/s
    const pan = this.radius * 1.2 * dt; // pan speed scales with distance
    // Q/E orbit left/right
    if (this.keys.has("KeyQ")) this.theta += rot;
    if (this.keys.has("KeyE")) this.theta -= rot;
    // W/S zoom
    if (this.keys.has("KeyW")) this.zoom(1 - 1.2 * dt);
    if (this.keys.has("KeyS")) this.zoom(1 + 1.2 * dt);
    // A/D pan horizontally along the camera's view-relative right vector, so it
    // tracks where you're looking (not a fixed world axis). Right = (cosθ,0,-sinθ);
    // panning the target left makes the model appear to slide right on screen.
    const rx = Math.cos(this.theta);
    const rz = -Math.sin(this.theta);
    if (this.keys.has("KeyA")) {
      this.target.x -= rx * pan;
      this.target.z -= rz * pan;
    }
    if (this.keys.has("KeyD")) {
      this.target.x += rx * pan;
      this.target.z += rz * pan;
    }
    // Z/C pan up/down (world height)
    if (this.keys.has("KeyZ")) this.target.y += pan;
    if (this.keys.has("KeyC")) this.target.y -= pan;
    this.apply();
  }

  dispose() {
    this.dom.removeEventListener("mousedown", this.onDown);
    window.removeEventListener("mouseup", this.onUp);
    window.removeEventListener("mousemove", this.onMove);
    this.dom.removeEventListener("wheel", this.onWheel);
    this.dom.removeEventListener("mouseenter", this.onEnter);
    this.dom.removeEventListener("mouseleave", this.onLeave);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
  }
}
