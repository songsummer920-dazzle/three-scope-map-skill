# Regression Guard

Use this before making iterative fixes, especially when the user says a specific module is wrong. The default action is to change only the named module and its direct dependencies.

## Do Not Cross These Boundaries

- App-only request: do not edit map components, map data, map textures, scatter points, labels, or fly lines.
- Map-only request: do not edit unrelated app modules unless the user asks for whole-page theme/layout changes.
- Theme-color request: change theme constants/materials, not GeoJSON, point data, or chart data.
- Texture request: change terrain material/texture files, not labels, hover logic, or scatter data.
- Animation rollback: remove the animation or custom overlay that caused it; do not delete static styles or map data.

## Patch Discipline

1. Identify the smallest affected file set.
2. Search for shared constants before editing.
3. If the file contains unrelated recent edits, preserve them.
4. Patch only the needed section.
5. Run build or the nearest validation command.
6. Inspect the changed area plus one nearby unaffected area.
7. State exactly which files were touched.

## Red Flags

- A map point disappears after fixing texture or hover.
- A label asset becomes blurred, filtered, or hidden under a map overlay.
- A map scope switch keeps old labels or old fly lines.
- A camera reset restores the wrong scope or wrong default.
- A screenshot or static image replaces a required Three.js map.
