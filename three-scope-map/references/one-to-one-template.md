# Classic 2.0 Template Integration

Use this reference to integrate or migrate the classic 2.0 administrative map.
New Earth or administrative-3D projects without a requested style use the complete
`fui-earth-vue` entity preset and its paired terrain-glass map; FUI, contour and
shared-context overlay integrations use their respective references.

## Template Contents

Use the complete `assets/templates/songsummer-earth-vue/` family, including its package
configuration, lockfile, `LICENSE`, `NOTICE`, `LICENSES/` and
`THIRD_PARTY_NOTICES.md`. Its `src/` includes:

- `ZhejiangThreeMap.vue` for a direct administrative map;
- `EarthChinaMap.vue`, `EarthView.vue` and `ChinaMap.vue` for Earth entry and destination;
- shared theme, data, terrain, navigation and camera helpers;
- GeoJSON, regional terrain layers and Earth textures;
- application styles and the demonstration `App.vue` shell.

The Zhejiang name identifies the reusable classic renderer, not a limit on region
coverage. Adapt data and scope within this family rather than rebuilding its
materials and geometry from memory.

## Integration

1. Inspect the target framework, aliases and existing map state.
2. For a new Vue 3 + Vite + TypeScript project, run
   `python3 <skill>/scripts/create_map_project.py <target-project> --preset classic`.
   It refuses non-empty destinations and copies the complete template and notices
   without running npm. For an existing app, integrate its files at matching paths
   and preserve the bundled notices. Use Node.js `^20.19.0` or `>=22.12.0` and
   the declared dependencies; install a complete project with `npm ci`.
3. Mount `ChinaMap.vue` for a map-only integration with view switching and
   navigation, or `EarthChinaMap.vue` for Earth entry. Use the lower-level
   `ZhejiangThreeMap.vue` only for an explicitly custom renderer composition.
   The template's demonstration `App.vue` mounts `EarthChinaMap.vue`;
   integrate the component into the business layout. Retain the normal
   `3D 地图 / 2D 地图 / 2D + 3D` view selector by default; hide it only when the
   user explicitly requests hidden switching or a single renderer. A plain
   “3D map” request selects the initial view and does not remove the selector.
   Add runtime style/color preview controls only for an explicit requirement,
   and preserve geographic navigation. Explicit standalone 2D/contour tasks
   do not acquire unrelated renderer modes.
4. Preserve asset imports and shared helpers. The host fills its parent, with
   renderer sizing through `ResizeObserver`; outer dashboard shells own 16:9 scaling.
5. Resolve the requested region's data, subdivisions, labels, points, texture
   extent and camera together. Every required non-terminal scope needs its next
   data level; report unavailable data rather than inventing subdivisions.
6. Apply color through `scripts/apply_map_theme.py`, which updates the shared
   Earth/map theme. Preserve material and interaction behavior during integration.
7. Build and verify the actual map in a background browser using the dev-server URL.

The default 2D/overlay basemap uses online OpenFreeMap resources. The administrative
adapter bundles China and Zhejiang; other levels request Aliyun DataV geography
on demand. Offline/internal-network use needs configured provider resources and
administrative data; the default template is not fully offline.

Before copying, verify the template; before delivery, check the target project:

```bash
python3 <skill>/scripts/verify_template_integrity.py --preset default
python3 <skill>/scripts/check_three_map_project.py <target-project> --strict
```

## Visual And Interaction Contract

- Preserve the bundled renderer, dark translucent terrain surface, themed side-wall
  gradient, aligned top/bottom outlines and thin internal boundaries. The default
  classic palette is green; custom colors retain the same brightness hierarchy.
- Bind terrain to real region `ShapeGeometry`; non-world maps do not use a full-map
  transparent texture plane. Reuse the bundled narrow outer-contour chase light.
- Keep the classic Earth geometry, textures, camera/orientation, scan, atmosphere,
  routes, intro and handoff as one implementation.
- Hover lifts the surface and side geometry together, resets cleanly, and uses the
  same highlight treatment for every feature.
- Preserve the theme-generated SVG HUD label geometry. Keep its pointer within
  the `68px × 41px` frame and derive pointer color/glow from the shared theme.
- Regenerate effects for the active scope: Beijing at China scope, the province
  capital at province scope, and one stable district/county source at city scope.
  District is terminal by default and has no outgoing source without supplied data.
- Keep chunked rebuilding, navigation state, transition handling and saved unified/
  per-scope camera views. Returning to a parent restores its exact camera.

Scope and theme changes may adapt data, container layout, camera presets and label
offsets. A style variant may alter materials when requested. Detailed classic
material, label and camera rules are in `three-map-style.md` and
`smart-mine-validated-map.md`; migration procedures are in `map-migration-playbook.md`.

## Acceptance

Use `visual-qa.md` for screenshots and renderer-specific checks. Verify extrusion,
terrain, outlines, labels, effects, hover, next-level navigation and return in the
actual Three.js canvas. A build, screenshot substitute or flat polygon fill does
not establish a working 3D integration.

For blank WebGL output, inspect renderer errors, GPU/browser support, host size,
asset paths, GeoJSON parsing and texture imports. Report a concrete environment
limitation if WebGL cannot run; do not silently replace the renderer with SVG.
