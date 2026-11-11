# Scope-Aware Map Component Structure

Use the complete renderer from the selected template family. This reference describes
how a host application coordinates geographic state; it is not an alternative
renderer or a runnable replacement for the bundled components.

## Component Responsibilities

| Concern | Responsibility |
| --- | --- |
| Host state | Current scope, region, data, navigation stack and theme |
| Data adapter | Validation, cache, request de-duplication and next-level loading |
| Renderer | Projection, meshes, materials, labels, effects, hit testing and camera |
| Camera controller | Built-in view, saved unified/per-scope views and parent restoration |
| Lifecycle | Resize, active rendering, asynchronous build cancellation and resource disposal |

Keep geographic state explicit rather than inferring scope from feature count:

```ts
type MapScope = 'world' | 'country' | 'province' | 'city' | 'district';

type DrillTarget = {
  scope: MapScope;
  regionName: string;
  code: string;
  geoJsonPath: string;
};

type CameraViewPreset = {
  fov: number;
  position: [number, number, number];
  target: [number, number, number];
};
```

The host supplies the current GeoJSON, labels, scatter/ripple points, fly-line
endpoints, semantic theme, terrain configuration and camera configuration together.
Use the selected component's actual props and methods; see `v3-api.md` for FUI
integration and `one-to-one-template.md` for the classic template.

## Scope Changes And Navigation

- Resolve clicked features through a data registry using stable administrative codes.
  Hover previews and may prefetch; click navigates only when a valid target exists.
- Keep a back stack containing the complete parent state and camera.
- Load and validate the next data before committing the new geographic state.
  Update scope, region, GeoJSON, labels, points, fly lines, terrain extent, outer
  contour and camera in one transaction.
- Keep the current map visible until the next build is ready. Use the bundled
  chunked rebuild and version-token handling so stale async work cannot replace
  a newer scope.
- Clear stale hover, labels, points and effect paths on a successful swap.
  Return restores the exact parent state and camera.
- Keep projection, material extent, geometry scale and labels scope-aware while
  retaining the selected visual family.

See `map-drilldown.md` and `map-scope-switching.md` for data resolution and scope rules.

## Rendering And Lifecycle

- Size the host from its container and update the renderer with `ResizeObserver`.
  Fixed dashboard scaling belongs to the outer page shell.
- Reuse the template's real meshes, terrain binding, side-wall gradient, outlines,
  labels, HUD and animation paths. Hover moves the visible surface, walls,
  boundaries and hit geometry together.
- Retain active/inactive rendering behavior. Do not create extra render loops or
  construct a second renderer for a shared-context overlay.
- Release owned geometries, materials, textures, listeners, observers, workers,
  pending requests and renderer resources on teardown. Preserve resources owned
  by another renderer or host context.
- Keep author attribution in source comments or metadata; it does not create UI
  elements unless requested.

For theme roles, terrain configuration and camera-persistence details, read
`three-map-style.md` and `smart-mine-validated-map.md`. Validate the integrated
component with `visual-qa.md` and the applicable project checker.
