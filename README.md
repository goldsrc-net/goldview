# goldview

A GoldSrc / Half-Life **mod resource browser** — point it at a game directory
(e.g. `ts/` with its `valve/` fallback) and inspect every resource: maps (BSP),
models (MDL) with animation playback, sprites (SPR), WAD textures, images
(TGA/BMP/PNG), sounds (WAV/MP3), and `.sc` event scripts.

Built as a **Tauri v2** app: a Rust backend (`gv-vfs` + `gv-formats`) parses the
binary formats and serves them to a **SolidJS + Three.js** frontend.

## Layout

```
crates/formats/   hand-rolled Rust parsers (bsp, wad, miptex, mdl, spr, img, sc)
crates/vfs/       mod filesystem: game dir + fallback chain, typed resource tree
src-tauri/        Tauri shell: commands + the goldview:// asset protocol
frontend/         Vite + SolidJS + Three.js UI
```

## Develop

```bash
cd frontend && npm install          # one time
npm run tauri dev                   # build + run the app (from frontend/)
```

Set `GOLDVIEW_MOD=/path/to/gamedir` to auto-open a mod on launch (handy for
dev/screenshots and launching from the CLI).

Rust-only checks:

```bash
cargo test -p gv-formats -p gv-vfs  # parser + vfs tests vs real assets
cargo build                         # whole workspace
```

## Architecture notes

- **Resource handlers** (`frontend/src/handlers/`) are an OOP hierarchy: an
  abstract `ResourceHandler` (polymorphic `canHandle`, abstract `Tile`/`View`)
  with one concrete subclass per type, resolved through a `HandlerRegistry`.
  Every file type therefore renders both a grid **tile** and a full **view**,
  and the folder grid is itself just `FolderHandler.View`.
- Selecting a **folder** shows a grid of its direct children (lazy, downscaled
  image thumbnails via `IntersectionObserver`; text snippets; icons otherwise),
  filterable by type and sortable.

## License

**GPL-3.0-or-later.** The BSP/WAD/lightmap path adapts
[r4v3n6101/hlbsp-viewer](https://github.com/r4v3n6101/hlbsp-viewer) (GPL-3.0);
see `LICENSE`.
