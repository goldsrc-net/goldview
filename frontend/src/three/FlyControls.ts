import * as THREE from "three";

/**
 * Pointer-lock FPS fly camera, shared by the 3D viewers (model + map).
 * Click the canvas to capture the mouse (look around); WASD moves, Space/Ctrl
 * (or Q/E) go up/down, Shift = faster; **ESC releases** the capture (browser
 * default exits pointer lock). `onLockChange` reports capture state for the UI.
 */
export class FlyControls {
  enabled = false;
  speed: number;
  private keys = new Set<string>();
  private yaw = 0;
  private pitch = 0;
  private readonly sens = 0.0022;
  private onLockChange?: (locked: boolean) => void;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
    opts: { speed?: number; onLockChange?: (locked: boolean) => void } = {},
  ) {
    this.speed = opts.speed ?? 300;
    this.onLockChange = opts.onLockChange;
    // seed yaw/pitch from the camera's current orientation
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    this.yaw = e.y;
    this.pitch = e.x;

    this.dom.addEventListener("click", this.requestLock);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    document.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  private requestLock = () => this.dom.requestPointerLock();

  private onPointerLockChange = () => {
    this.enabled = document.pointerLockElement === this.dom;
    if (!this.enabled) this.keys.clear();
    this.onLockChange?.(this.enabled);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.enabled) return;
    this.yaw -= e.movementX * this.sens;
    this.pitch -= e.movementY * this.sens;
    const lim = Math.PI / 2 - 0.001;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"));
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.enabled) this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);

  /** Advance the camera by the held keys; call once per frame with seconds. */
  update(dt: number) {
    if (!this.enabled) return;
    const v = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, this.camera.up).normalize();
    if (this.keys.has("KeyW")) v.add(fwd);
    if (this.keys.has("KeyS")) v.sub(fwd);
    if (this.keys.has("KeyD")) v.add(right);
    if (this.keys.has("KeyA")) v.sub(right);
    if (this.keys.has("Space") || this.keys.has("KeyE")) v.y += 1;
    if (this.keys.has("ControlLeft") || this.keys.has("KeyQ")) v.y -= 1;
    if (v.lengthSq() === 0) return;
    const boost = this.keys.has("ShiftLeft") ? 3 : 1;
    v.normalize().multiplyScalar(this.speed * boost * dt);
    this.camera.position.add(v);
  }

  dispose() {
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
    this.dom.removeEventListener("click", this.requestLock);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    document.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }
}
