import { Show, For } from "solid-js";
import { currentModel } from "./ModelController";

/** Sidebar controls for the open model (sits below the Inspector). Drives the
 *  shared ModelController, so changes reflect live in the viewport. */
export default function ModelPanel() {
  const c = currentModel;
  return (
    <div class="model-panel">
      <h3>Model</h3>
      <Show when={c() && c()!.data()} fallback={<div class="mp-num">loading…</div>}>
      {(model) => {
        const ctrl = c()!;
        return (
          <>
            {/* sequences + playback */}
            <Show when={model().sequences.length}>
              <label class="mp-label">Sequence</label>
              <select
                class="mp-select"
                value={ctrl.seq()}
                onChange={(e) => ctrl.setSequence(+e.currentTarget.value)}
              >
                <For each={model().sequences}>
                  {(s, i) => (
                    <option value={i()}>
                      {i()}: {s.name} ({s.num_frames}f)
                    </option>
                  )}
                </For>
              </select>
              <div class="mp-row">
                <button onClick={() => ctrl.togglePlay()} style={{ "min-width": "36px" }}>
                  {ctrl.playing() ? "⏸" : "▶"}
                </button>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, ctrl.frameCount() - 1)}
                  value={ctrl.frame()}
                  onInput={(e) => ctrl.scrubTo(+e.currentTarget.value)}
                  style={{ flex: "1" }}
                />
                <span class="mp-num">
                  {ctrl.frame() + 1}/{ctrl.frameCount()}
                </span>
              </div>
              <div class="mp-row">
                <span class="mp-num">{ctrl.speed().toFixed(1)}×</span>
                <input
                  type="range"
                  min={0.1}
                  max={3}
                  step={0.1}
                  value={ctrl.speed()}
                  onInput={(e) => ctrl.setSpeed(+e.currentTarget.value)}
                  style={{ flex: "1" }}
                />
              </div>
            </Show>

            {/* skin */}
            <Show when={model().num_skin_families > 1}>
              <label class="mp-label">Skin</label>
              <select class="mp-select" value={ctrl.skin()} onChange={(e) => ctrl.setSkin(+e.currentTarget.value)}>
                <For each={Array.from({ length: model().num_skin_families }, (_, i) => i)}>
                  {(i) => <option value={i}>skin {i}</option>}
                </For>
              </select>
            </Show>

            {/* body parts: name + submodel selector (stable metadata → no revert) */}
            <Show when={ctrl.partsMeta().length}>
              <label class="mp-label">Body parts</label>
              <For each={ctrl.partsMeta()}>
                {(part, i) => (
                  <Show
                    when={part.models.length > 1}
                    fallback={<div class="mp-item">{part.name}</div>}
                  >
                    <select
                      class="mp-select"
                      value={ctrl.bodyparts()[i()] ?? 0}
                      onChange={(e) => ctrl.setBodypart(i(), +e.currentTarget.value)}
                    >
                      <For each={part.models}>
                        {(mn, mi) => (
                          <option value={mi()}>
                            {part.name}: {mn || `model ${mi()}`}
                          </option>
                        )}
                      </For>
                    </select>
                  </Show>
                )}
              </For>
            </Show>

            {/* DEBUG (bodypart bug): cycle submodel + show state */}
            <div class="mp-row">
              <button
                onClick={() => {
                  const cur = ctrl.bodyparts()[0] ?? 0;
                  const n = ctrl.partsMeta()[0]?.models.length || 1;
                  console.log("[dbg] cycle bp0", cur, "->", (cur + 1) % n, "n=", n);
                  ctrl.setBodypart(0, (cur + 1) % n);
                }}
              >
                cycle bp0
              </button>
              <span class="mp-num" style={{ color: "orange" }}>
                bp={JSON.stringify(ctrl.bodyparts())} v=
                {model().parts[0]?.submeshes.reduce((s, m) => s + m.positions.length / 3, 0) ?? 0}
              </span>
            </div>

            {/* named lists (collapsible) */}
            <details class="mp-list">
              <summary>Attachments ({model().attachments.length})</summary>
              <For each={model().attachments}>
                {(a) => (
                  <div class="mp-item">
                    {a.name || "(unnamed)"}
                    <span class="mp-num"> → {model().bones[a.bone]?.name ?? a.bone}</span>
                  </div>
                )}
              </For>
            </details>
            <details class="mp-list">
              <summary>Bones ({model().bones.length})</summary>
              <For each={model().bones}>
                {(b) => (
                  <div class="mp-item">
                    {b.name}
                    <Show when={b.parent >= 0}>
                      <span class="mp-num"> ← {model().bones[b.parent]?.name ?? b.parent}</span>
                    </Show>
                  </div>
                )}
              </For>
            </details>
            <details class="mp-list">
              <summary>Hitboxes ({model().hitboxes.length})</summary>
              <For each={model().hitboxes}>
                {(h) => (
                  <div class="mp-item">
                    {model().bones[h.bone]?.name ?? h.bone}
                    <span class="mp-num"> grp {h.group}</span>
                  </div>
                )}
              </For>
            </details>
          </>
        );
      }}
      </Show>
    </div>
  );
}
