# Version 3 API and compatibility

Version 3 separates composition, appearance, primary color, map material and effects. Preserve old callers and named-preset defaults. Never infer that a new hue requests a new material.

| Capability | Classic template | FUI template |
| --- | --- | --- |
| Administrative 3D and hierarchical drilldown | Yes | Yes |
| Earth entrance | Original 2.0 appearance | Entity/photographic FUI, regular dots, regular hex |
| 2D basemap | MapLibre/provider adapter | Same provider contract |
| 2D + 3D overlay | Shared-context MapLibre layer | Native smooth glass on MapLibre; existing classic/terrain overlay paths |
| Standalone contour terrain | Yes, independent DEM scene | Use the classic contour renderer explicitly |
| One-command primary color | `apply_map_theme.py` | Same command writes the paired FUI default |
| Per-instance FUI color | — | `primaryColor` or a normalized HEX theme ID |

## New integration presets

Create a complete new project with
`python3 <skill>/scripts/create_map_project.py <project> --preset fui` (default)
or `--preset classic` for 2.0. The destination must be new or empty. The script
copies the full selected family and its bundled license/notices without invoking
npm; use Node.js `^20.19.0` or `>=22.12.0`, then `npm ci` in the project.

For a new Earth or administrative-3D project without an explicit style, default to the 3.0 entity/photographic FUI pairing: `FUI_SCENE_PRESETS.surface` (entity Earth → terrain-glass map). “实体地球” and the existing “写实地球” wording are aliases for the same `surface` value, not new enum members or renderer modes. A map-only request uses the paired map without adding Earth. Explicit 2.0, hologram or other style requests override the default; existing projects retain their style unless a replacement is requested. This skill-level selection does not change legacy component prop defaults.

Treat these natural-language requests as complete appearance selections, with the matching 3D destination chosen automatically:

| User request | Template family | Complete appearance and destination |
| --- | --- | --- |
| `用2.0风格` | `assets/templates/songsummer-earth-vue/` (classic) | Original 2.0 Earth and its matching classic administrative 3D map. |
| `用3.0实体地球` / `实体地球` / `用3.0写实地球` / `用3.0风格` | `assets/templates/fui-earth-vue/` (FUI) | `FUI_SCENE_PRESETS.surface`: entity/photographic `surface` Earth → `terrain-glass` 3D map. |
| `用3.0全息地球` | `assets/templates/fui-earth-vue/` (FUI) | `FUI_SCENE_PRESETS.hologram`: regular fine-dot `hologram` Earth → `smooth-glass` 3D map. |

For FUI integrations, import the selected complete recipe from `fuiMapPresentation.ts` and use it with `v-bind`; it declares `earthPresentation`, `mapStyle`, `mapWave` and `mapView` together. The 2.0 request selects the classic template family; setting `mapStyle="classic"` inside FUI does not select that family. Use `FUI_SCENE_PRESETS['hologram-hex']` only when the user explicitly requests a honeycomb/hexagonal globe. A plain 3.0 hologram request selects fine dots.

Apply the selection directly to project configuration. Do not proactively show template pictures, ask the user to select a template, or add template/color/material/effect controls; add those preview controls only when explicitly requested. Both templates' `src/App.vue` files are demonstration shells; integrate the reusable components into the business layout instead. Normal Earth and administrative-3D integrations retain the `3D 地图 / 2D 地图 / 2D + 3D` view selector by default, including business layouts. In FUI, keep the destination's `show-view-switch` enabled; hide the selector only for an explicit request to hide switching, remove the selector, or retain a single renderer. A plain request for a “3D map” selects its initial view and does not request removal of the selector. Explicit standalone 2D or standalone contour tasks do not acquire unrelated renderers. Preserve geographic navigation and the selected material's style code.

Primary color is independent of appearance: a color-only request changes the theme without selecting another recipe, asking a template question, or adding controls. In an existing project, preserve current data, geographic scope, administrative navigation, business layout and unrelated settings. A selected recipe supplies matching appearance defaults; keep the user's explicit overrides for color, map material, pattern, effect, renderer or quality, and allow later explicit customizations without switching unrelated options. The latest explicit request takes precedence for the options it names; old generated prop defaults are not user customizations. These integration rules do not change legacy omitted-prop or named-preset defaults; `earthPresentation` alone still controls the globe, not its destination material.

The entity Earth uses the photographic material, matching relief, raised China, fine geographic lights and thin HUD described in [fui-earth.md](fui-earth.md). Runtime scheduling, cache and resource-lifetime changes must preserve that appearance; destination maps and holograms keep their own material paths.

## One-sentence color requests

For an existing generated project:

```bash
python3 <skill>/scripts/apply_map_theme.py '#A75FFF' <project>
```

The script detects the template family, validates all color entries before writing, and keeps backups. Classic updates `MAP_THEME_PRIMARY`; FUI also updates `FUI_THEME_PRIMARY_OVERRIDE`, so its Earth, HUD, 3D glass, classic destination and 2D palette use the same generated default. Never mutate a global live override to recolor one instance. Neutral inputs keep neutral pigments and readable highlights; a black input does not require physically impossible black emission.

FUI Vue usage:

```vue
<FuiEarth
  skin="glacier"
  primary-color="#A75FFF"
  earth-presentation="hologram"
  map-style="smooth-glass"
  map-wave="hex"
  map-view="overlay"
  initial-mode="china"
  quality="balanced"
/>
```

- `skin`: existing `original`, `amber`, `glacier`, `alert` preset, or normalized `#RGB/#RRGGBB` theme input. Presets remain unchanged when no override is provided.
- `primaryColor`: per-instance override. Explicit alert mode still takes priority and clearing it restores the normal color.
- `earthPresentation`: `surface` (3.0 entity/实体, also photographic/写实), `hologram`, `hologram-hex`.
- `mapStyle`: `classic`, `terrain-glass`, `smooth-glass`. Material stays independent of hue.
- `mapWave`: `hex`, `grid`, `none`. Disabling it leaves the compass/HUD rotors intact.
- `scanStyle`: `ribbon` (default) is 网格扫光 (legacy 柔光扫掠); `honeycomb` is 蜂窝扫描. Both entity and hologram Earth use these choices on the existing transparent sweep shell. This setting is independent of the hologram's dot/hex texture: a scan-only request preserves `earthPresentation`, material and color. In a scan discussion, “换成蜂窝” selects `scanStyle="honeycomb"`, not `earthPresentation="hologram-hex"`.
- `mapView`: standalone `3d`, standalone `2d`, or the actual shared-context `overlay`.
- `quality`: `high` (legacy default), `balanced`, `low`, `auto`. It reaches standalone and overlay. Low disables live map reflection, glass Bloom and glass-target MSAA, caps that target at 1024 and provider DPR at 1; high/balanced retain the full optical recipe and larger budgets. Provider-context antialiasing is fixed at context creation and is separate from the owned glass target.

The older `mapPresentation`, `mapSurface` and skin-only calls still work. With those old calls, automatic smooth glass remains paired with glacier holograms. An explicit `mapStyle="smooth-glass"` is available for every primary color. Changing styles prepares a missing material family on demand and preserves navigation/camera instead of changing the shared theme globally.

The demo's scan buttons are currently shown only for `surface`. Hologram scans can be selected through the same public `scanStyle` prop or demo query, for example `?earth=hologram&skin=glacier&scan=honeycomb&clean=1` keeps the dot globe and selects the moving honeycomb scan. This does not require adding a runtime scan selector to a business integration.

Retain the destination's existing `3D 地图 / 2D 地图 / 2D + 3D` controls by default. They retain the administrative path, selected material and primary color; returning to 3D restores its regional scope. Hide them only when the user explicitly requests no switch controls or a single renderer. A reactive `mapView` prop can also select the initial or current destination view from host controls; selecting `3d` does not itself hide the selector. The demo keeps its view selector available in `clean=1`; that option hides the optional preview toolbar and labels. To open the demo directly in the geographic overlay, use `?mode=china&view=overlay` with the existing skin or primary query.

The view switch keeps the source visible while preparing the actual destination composition, current scope and final viewport. Readiness requires a real matching target draw, including native overlay blocks, rather than basemap load or an earlier frame. A cold standalone renderer starts directly at the current navigation, uses the shared host's actual dimensions and active-quality DPR, and centers the projected map while preserving view angle and zoom distance. Cached returns reuse mounted model/canvas identities. Superseded requests or navigation changes cancel obsolete reveal waits. These preparation APIs add no independent inactive loop and do not change selected appearance, color, thickness, HUD or waves.

In the FUI wrapper, the default-enabled view selector also permits one alternate 3D/overlay preparation after the active source is ready: its entrance finishes, then a 150 ms delay and idle callback precede the normal hidden one-shot warm-up. This optional work has no visible pending/error UI, is canceled on navigation/switch/deactivation/removal, and reuses a matching target signature. Both mounted renderers remain available, with extra context and CPU/GPU memory costs. A plain 2D source or explicitly disabled selector does not schedule it. Switching before it completes still waits for the real target frame; it is not an instant-switch guarantee.

The entity terrain face derives its base and ridge pigments from the photographic Earth's China surface and ridge roles. Normalize their linear luminance to the existing terrain-light budget; preserve relief, shadows, clear coat and selection. Do not keep a fixed blue face underneath amber, red or custom themes. Original and hologram materials retain their own palette contracts.

For a direct classic map, `ChinaMap initialView="overlay"` opens the shared-context overlay without initializing the standalone 3D renderer. It accepts `overlaySurface="classic|terrain-glass|smooth-glass"`; the template's generated primary controls the semantic palette.

In FUI, both `mapStyle="terrain-glass"` and `mapStyle="smooth-glass"` with `mapView="overlay"` reuse their native standalone materials, full 32-unit body thickness, side gradient, beveled walls, outlines and anchored lift. Entity terrain keeps its geographic texture and relief; hologram smooth glass keeps its coat/backing, reflection and studio PMREM. Both omit HUD/ground/stage. Their Three renderer is a state adapter on MapLibre's existing canvas/context, with no extra OrbitControls or RAF. An exact-Mercator adapter and real MapLibre matrices supply the camera/eye. The layer owns its offscreen targets, never clears/disposes the borrowed framebuffer, and preserves the non-null-FBO return bridge. Ordinary provider geometry stays below the volume and symbols above; returning to 2D restores original order. The classic overlay retains its material path. See [map-3d-overlay.md](map-3d-overlay.md).

Terrain detail already prepared before first draw is shown at full strength. Late visible overlay detail blends over 380 ms through the shared terrain uniform, with matching interpolated CPU hit heights; `terrainBlend` reports progress and `terrainDetail="regional"` follows completion. Hidden destination preparation completes available detail before reveal. Texture filtering, source geography, final relief and material response remain unchanged; smooth glass requests no terrain data.

Smooth standalone and overlay share the Earth glass’s `fuiHologramGlassOptics.ts` linear core (36/20 reflection). Earth vertex/output adapters stay unchanged; flat adapters use real geographic virtual-cap normals and one fixed initial rest-view optical frame, rotating normal/light together and environment sampling back to the Earth frame. This is not per-frame camera-following. Actual map positions, geometric Snell exit and hit testing remain unchanged; the flat 2.6-unit near-top backing and 32-unit body are still distinct from spherical geometry. China country retains its reference optical center; other regions derive their shading frame from current geography, with dateline-aware centering and bounded world curvature.

On supported GPUs, both smooth destinations use geography-only HalfFloat HDR with up to 4× MSAA, Earth Bloom, then one ACES/sRGB output; reflection MSAA also follows actual RGBA16F sample support. Low uses its reduced budget. Without renderable float targets, the globe uses RGBA8 without Bloom or PMREM, and smooth maps omit PMREM/live reflection and use RGBA8 or a direct material output. These paths preserve usable glass with reduced reflection effects. HUD and basemap are not tone mapped. Standalone geography uses source layer 3, reflection layer 2 and raycaster layer 3. Compile the actual HDR/reflection target variants, draw/flush the complete frame before awaiting `FuiRendererJobs`, and dispose owned targets/passes only after pending owners drain. No additional canvas/context/RAF is created. Optional internal `uGlassBackdropStrength` defaults to `0` for the shared glass appearance, performing no unused framebuffer capture; it is not a public Vue prop or a material-energy override.

## Semantic color boundary

Derive semantic roles, not identical RGB pixels. Surface absorption, emission, reflections and dim labels deliberately respond differently to the same primary. Keep space/background neutral, contrast readable and metric elevation semantics truthful. Vector provider layers can be recolored by role; raster pixels, baked sprite artwork and explicit provider `source` mode have their documented limits.

Use canonical normalized theme IDs for palette caches, bound custom-color caches, and retain independent material uniforms for simultaneous differently colored instances.

## Network and data boundary

The default 2D and overlay provider loads OpenFreeMap style, tile, glyph and sprite
resources online. The administrative adapter bundles China and Zhejiang; other
administrative levels use `geo.datav.aliyun.com` on demand. Configure provider
resources through `vectorMapConfig.ts` / `vectorMapProvider.ts` and supply all
required administrative levels through `mapDataAdapter.ts` for offline or
internal-network delivery. Local Earth textures do not make the default project
fully offline; preserve provider and data attribution.

## Verification and distribution

Test original preset output, chromatic and neutral colors, repeated hot changes, two instances, material/effect independence, native navigation and lazy initialization. For overlay, verify a real basemap, shared projection/canvas/context, actual thickness and hit testing; a pair of overlapping canvases is insufficient.

Build and test a complete template family, then update its intentional integrity manifest. Package all reviewed distribution source and assets, including intentionally new files; do not infer the release from currently tracked Git files. Installed source/assets must match the reviewed source and both template manifests.

`package_skill_release.py` requires a version-matched schema-2 validation record, passed unit/build/integrity/WebGL checks with their commands, and a fingerprint of all shipped source/assets except `release.json` and `validation/`. Changing a template, helper, document or cache invalidates the old record even after updating its integrity manifest. Record the actual tested platform and completed cases; a forced GPU-budget branch is not evidence of testing another physical GPU.

Store a captured PNG and an error-free structured browser report in `validation/<version>/`, each with its SHA-256 in the record. The user archive contains only that record's declared evidence and `validation/<version>/record.json`; older RC directories and undeclared temporary evidence stay in the development tree. Keep complete historical/machine-local evidence in a separate developer artifact outside the user installation. Produce portable evidence copies with machine paths replaced by stable labels such as `<project>` before hashing them. A formal release rejects machine-local home/temp paths in text evidence; packaging never silently rewrites reviewed bytes. Missing/tampered evidence, failed browser reports and conflicting portable records remain blockers.

`snapshot()` defines distribution source consistently: generated dependency/build/cache outputs, backup/editor-temporary files and `.impeccable` development preferences are excluded. It includes both complete template families, their QA sources and all license files. `distribution_snapshot(files, version, validation, status)` returns the exact public byte set, including generated release metadata and only the selected evidence. Audit/extract the ZIP against this set, rather than requiring its evidence history to equal the full development tree. Its non-validation source fingerprint must equal the validated source fingerprint.

After the reviewed source and manifests are final, obtain its binding with `python3 <skill>/scripts/package_skill_release.py --source-fingerprint`. Add that object as the validation record's `source`; package with `--version <version> --validation <record.json> --output <directory-outside-skill>`. `--status candidate|release` is explicit when needed; omission selects `candidate` for a prerelease version and `release` for a stable version. `--version 3.0.0 --status release` produces formal release metadata, while a prerelease version cannot be promoted with `--status release`. Record the actual tested hardware/browser support and remaining limits; a release label does not establish universal device performance. Do not reuse a previous record after editing source.

A local `status: release` package identifies stable version formatting, not public
publication or third-party rights clearance. Inspect the current validation
record's `publication` object. The 3.0.0 source release is dated 2026-11-12;
`pending-third-party-rights-review` means the listed bundle redistribution rights
remain unresolved. Public source access does not establish those rights or grant
additional permission for a third-party marketplace or restricted platform offering.

The author-owned code license does not grant commercial rights to third-party
data, services or textures. Each user or deployer must obtain permissions needed
for their own use and distribution; source records are not license grants.
Those user-specific permissions do not by themselves clear the bundle's separate
redistribution review or the author's restricted-platform license requirements.

The 3.0.0 citation metadata records the source-release date 2026-11-12, the public
author and repository URL, and the license URL for tag `v3.0.0`. For later releases,
record their actual release dates and tag-specific license URLs.
