# Changelog

## 3.0 — Vue / React support and documentation

- Keep the loading state during slow first-time basemap preparation instead of
  cancelling a view switch after five seconds; release readiness callbacks when
  a switch finishes, times out, or its map host becomes inactive.
- Keep release archives focused on reusable templates, integration documentation,
  attribution and license notices.
- Simplified README startup examples and network configuration guidance.

- Introduced author-owned license 1.1 with mandatory source-code attribution;
  README or other documentation credits cannot replace notices in source files.
- Preserved copyright, attribution, license identifiers and origin information
  through source splitting, merging, relocation and adaptations retaining
  protected content. Visible application watermarks remain optional.
- Synchronized current license notices, source headers and integration guidance.
  Historical license 1.0 and GPL copies retain their original grants.
- Added native React project generation alongside Vue for the 2.0 classic and
  3.0 entity/hologram families, sharing the corresponding renderer modules and assets.
- Removed the independent contour-terrain mode from the supported distribution,
  project templates, invocation routes and public examples.
- Standardized the names 3.0 实体地球, 3.0 全息地球, 纹理玻璃 3D 地图 and
  纯玻璃 3D 地图; retained their visual materials, themes and animations.

## 3.0.0 — 2026-11-12

- Added `install_skill.py`: back up an existing Skill outside the skills directory,
  then replace the whole directory without automatically restoring old custom files.
  Added `create_map_project.py` for complete FUI/classic projects with bundled
  licenses and notices; it rejects non-empty destinations and does not run npm.
- Added a standalone Chinese README inside the portable Skill and README files
  for both templates, including Node requirements and business component entry points.
  Clarified that `App.vue` is a demonstration shell and style, color and material preview controls
  are included in business pages only when explicitly requested.
- Documented online OpenFreeMap basemaps and Aliyun administrative drilldown beyond
  bundled China/Zhejiang data; offline/internal-network use needs configured
  providers and administrative data.
- Added the source-release date and versioned license URL to citation metadata.

- Subdue photographic grid emission with view-angle fading and softer scan
  wires; remove the three decorative photographic HUD reticles.

- Match the photographic ground ribbon to the transparent carrier's gradual
  Gaussian shoulders and trailing falloff, retaining the hologram recipe.

- Fit the entity Earth and its full HUD envelope inside the host with a shared
  scale and safety margin, preserving ring geometry and palette.
- Align 3.0 South China Sea island and maritime-stroke bodies with the mainland
  top and bottom datums; preserve mainland thickness and the fixed inset.

- Applied the custom 3.0 author-owned license: ordinary projects and client work
  are permitted; paid platform, Skill, SDK or template resale requires written
  permission. Historical GPL grants and third-party rights remain separate.
- Clarified paid-platform licensing for free tiers within paid offerings,
  hosted use without source delivery, bundled or third-party-collected fees,
  rewrites retaining protected content, and client-built reusable platforms.
  Ordinary business SaaS remains permitted under the license's conditions.
- Added a visible loading instrument for renderer switches and preserved the
  current map until the destination has drawn. Restored optional preparation
  after navigation and retained prepared models across repeated view switches.
- Installation, build and browser coverage for the exact distributed source are
  recorded in the [3.0 validation record](three-scope-map/validation/3.0.0/record.json).
  Default high quality remains unchanged.
- Third-party geography and legacy-image redistribution records remain unresolved.
  Source publication does not grant or confirm those third-party rights.

- New Earth and administrative-3D projects default to the 3.0 entity
  (photographic/写实 FUI) appearance, paired with the terrain-glass map.
  A transparent outer scan shell coordinates with the surface light response.
- Preserved the explicit 2.0 classic Earth and map. Three short style requests
  select complete pairings: 2.0 classic, 3.0 entity, or 3.0 hologram. Existing
  project styles stay unchanged unless a replacement is requested.
- Added regular-dot and regular-hex hologram Earth appearances with a raised
  glass China surface and paired smooth-glass destination.
- Added textured terrain glass, smooth glass, independent bottom-wave choices,
  and a real MapLibre 2D + geographic 3D overlay sharing one camera and context.
- Unified one-sentence color changes across the selected Earth/map family, HUD,
  glass and semantic 2D roles. Named skins and per-instance HEX overrides remain
  available independently from material and renderer composition.
- Retained geographic drilldown, native destination entrance, full-face selection,
  a fixed China-only maritime inset, and return to the same Earth canvas/state.
- Added verified geographic caches, first-frame priority, deferred destination
  GPU warm-up, cancellation, retry and last-request-wins skin switching, hidden
  scene pausing, and explicit quality/capability budgets.
- Clarified the default recipe, template-family migration and current visual
  baseline; preserved complete renderer/data/texture ownership during integration.
- Both runnable Vue templates require Node.js `^20.19.0` or `>=22.12.0` and ship
  dependency lockfiles. Use a clean `npm ci` before build verification.
- The packaged `release.json` and current validation record provide the exact
  tested artifact fingerprint, completed installation/build/browser cases,
  performance measurements and tested environments. No additional physical
  device or browser coverage is implied by this feature list.
- Version 3.0 licensing and redistribution scope are defined by the distributed
  `LICENSE` and `NOTICE`; third-party assets retain their own terms, and earlier
  releases retain the permissions already granted with those releases.

### Upgrade from 2.0

- Keep `用 2.0 风格` to retain the classic family. An existing project's current
  style and primary color are not automatically changed by installing the skill.
- For a requested migration to entity or hologram, copy the complete FUI family
  and apply its matching `FUI_SCENE_PRESETS` recipe. Preserve data, scope,
  navigation and any explicitly chosen renderer composition.
- Continue using a single color request. Callers do not need to learn separate
  Earth, glass, HUD and 2D color parameters.

## 3.0.0-rc.8

- Added complete scene recipes shared by the demo and new integrations without changing legacy component defaults.
- Connected quality through native overlays, added lower glass budgets and capability-driven output fallbacks.
- Moved native geometry preparation into cancellable CPU stages and preserved the previous scene until a new frame can commit.
- Adapted optical centers and China-only maritime content to the current region; refined shallow maritime geometry and shared smooth surfaces.
- Replaced repeated Earth geography parsing/raster construction with exact, build-verified binary geographic caches.
- Bound candidate validation to source fingerprints and shipped its captured screenshots and structured browser evidence.


## 3.0.0-rc.1

- Added the complete FUI photographic, regular-dot and regular-hex Earth preset alongside the preserved 2.0 classic appearance.
- Added independent primary color, map material, bottom-wave and renderer-composition controls, with legacy-call compatibility.
- Added a shared-context MapLibre geographic 3D overlay with real projection, holes, geographic picking, anchored extrusion and shared administrative navigation.
- Connected custom HEX colors to FUI/HUD/glass/2D and the classic destination; connected the default 2D semantic palette to the shared primary.
- Paused the hidden classic Earth loop; gated FUI destination context/PMREM creation; removed unused surface resources from smooth holographic maps.
- Added explicit quality budgets, bounded theme caches, and lazy alternate renderers.
- Scoped conflicting template/timing instructions and synchronized the reviewed skill distribution.

The entries marked `-rc` above describe historical release candidates. The current
distributed `release.json` and its validation record identify the final artifact
and completed checks; historical candidate results do not imply a new validation run.
