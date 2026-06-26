import type { BspEntity } from "../types";

/**
 * Half-Life DM pickup/item entities → their world model (`models/w_*.mdl`). The
 * BSP only stores the classname; the world model is hardcoded in the game DLL, so
 * we mirror the common mappings here. Keys are lowercase classnames. (Extend as
 * needed; unknown classnames simply render no model.)
 */
const ENTITY_WORLD_MODELS: Record<string, string> = {
  // weapons
  weapon_crowbar: "w_crowbar.mdl",
  weapon_9mmhandgun: "w_9mmhandgun.mdl",
  weapon_357: "w_357.mdl",
  weapon_9mmar: "w_9mmar.mdl",
  weapon_shotgun: "w_shotgun.mdl",
  weapon_crossbow: "w_crossbow.mdl",
  weapon_rpg: "w_rpg.mdl",
  weapon_gauss: "w_gauss.mdl",
  weapon_egon: "w_egon.mdl",
  weapon_hornetgun: "w_hgun.mdl",
  weapon_handgrenade: "w_grenade.mdl",
  weapon_satchel: "w_satchel.mdl",
  weapon_snark: "w_squeak.mdl",
  // ammo
  ammo_9mmclip: "w_9mmclip.mdl",
  ammo_9mmar: "w_9mmarclip.mdl",
  ammo_9mmbox: "w_chainammo.mdl",
  ammo_argrenades: "w_argrenade.mdl",
  ammo_buckshot: "w_shotbox.mdl",
  ammo_357: "w_357ammobox.mdl",
  ammo_crossbow: "w_crossbow_clip.mdl",
  ammo_rpgclip: "w_rpgammo.mdl",
  ammo_gaussclip: "w_gaussammo.mdl",
  // items
  item_healthkit: "w_medkit.mdl",
  item_battery: "w_battery.mdl",
  item_longjump: "w_longjump.mdl",
  item_suit: "w_suit.mdl",
  item_antidote: "w_antidote.mdl",
  item_security: "w_security.mdl",
};

/** Resolve an entity's renderable `.mdl` path: an explicit `model` key, else the
 *  classname's world model. Returns null for brush models (`*N`) and unknowns. */
export function entityModelPath(e: BspEntity): string | null {
  const model = e.keys.model;
  if (model && model.toLowerCase().endsWith(".mdl")) return model;
  const w = ENTITY_WORLD_MODELS[(e.keys.classname ?? "").toLowerCase()];
  return w ? `models/${w}` : null;
}

/** Resolve an entity's `.spr` path (env_sprite/env_glow/cycler_sprite + any entity
 *  whose `model` is a sprite). Null if it isn't a sprite entity. */
export function entitySpritePath(e: BspEntity): string | null {
  const model = e.keys.model;
  return model && model.toLowerCase().endsWith(".spr") ? model : null;
}

/** Entity `scale` key (sprite size multiplier); 1 if absent or 0. */
export function entityScale(e: BspEntity): number {
  const s = Number(e.keys.scale);
  return Number.isFinite(s) && s > 0 ? s : 1;
}

/** Entity `rendercolor` ("R G B", 0-255) → [r,g,b] in 0-1, or null for the
 *  unset/black default (meaning "no tint" → use the texture's own colour). */
export function entityRenderColor(e: BspEntity): [number, number, number] | null {
  const p = (e.keys.rendercolor ?? "").trim().split(/\s+/).map(Number);
  if (p.length !== 3 || !p.every((n) => Number.isFinite(n)) || (p[0] === 0 && p[1] === 0 && p[2] === 0)) return null;
  return [p[0] / 255, p[1] / 255, p[2] / 255];
}

/** Parse an entity `origin` ("x y z") to a tuple; [0,0,0] if absent/malformed. */
export function entityOrigin(e: BspEntity): [number, number, number] {
  const p = (e.keys.origin ?? "").trim().split(/\s+/).map(Number);
  return p.length === 3 && p.every((n) => Number.isFinite(n)) ? [p[0], p[1], p[2]] : [0, 0, 0];
}

/** Yaw (rotation about world Z, radians) from `angles` ("p y r") or `angle`. */
export function entityYaw(e: BspEntity): number {
  const a = e.keys.angles?.trim().split(/\s+/).map(Number);
  const yaw = a && a.length === 3 ? a[1] : Number(e.keys.angle);
  return Number.isFinite(yaw) ? (yaw * Math.PI) / 180 : 0;
}
