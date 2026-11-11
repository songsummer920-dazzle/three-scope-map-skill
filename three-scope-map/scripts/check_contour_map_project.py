#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
# Copyright (c) 2026 宋夏天Dazzle
"""Static readiness checks for the standalone Three.js contour terrain renderer.

作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""


def contains(path: Path, pattern: str) -> bool:
    return bool(re.search(pattern, read_text(path), re.IGNORECASE | re.DOTALL))


def main() -> int:
    parser = argparse.ArgumentParser(description="Check the independent Three.js contour-terrain contract")
    parser.add_argument("project", nargs="?", default=".")
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    root = Path(args.project).expanduser().resolve()
    map_root = root / "src/components/map"
    files = {
        "component": map_root / "ContourMap.vue",
        "config": map_root / "contourMapConfig.ts",
        "renderer": map_root / "contourMapRenderer.ts",
        "adapter": map_root / "contourDataAdapter.ts",
        "diagnostics": map_root / "contourMapDiagnostics.ts",
        "navigation": map_root / "mapNavigation.ts",
    }
    blockers: list[str] = []
    passes: list[str] = []
    try:
        package = json.loads((root / "package.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        package = {}
    dependencies = {**package.get("dependencies", {}), **package.get("devDependencies", {})}
    missing = [name for name in ("vue", "vite", "three") if name not in dependencies]
    if missing:
        blockers.append(f"Dependencies missing: {', '.join(missing)}")
    else:
        passes.append("Vue, Vite, and Three.js dependencies found")
    for label, path in files.items():
        if path.exists():
            passes.append(f"Contour contract file found: {path.relative_to(root)}")
        else:
            blockers.append(f"Contour contract file missing: {label}")
    checks = (
        (files["component"], (r"contour-terrain-host", r"createContourTerrainRenderer", r"prepareForReveal", r"navigation-change"), "Independent terrain component and navigation"),
        (files["renderer"], (r"from\s+['\"]three['\"]", r"OrbitControls", r"WebGLRenderer", r"BufferGeometry"), "Three.js DEM mesh and orbit camera"),
        (files["renderer"], (r"LineSegments", r"Raycaster", r"pickCoordinate", r"controls\.addEventListener\(['\"]change['\"]"), "Contour lines, surface picking, and event-driven rendering"),
        (files["renderer"], (r"ShaderMaterial", r"aOpacity", r"contourEdgeFeather", r"bundle\.surface"), "Contour edge fade over an overscan terrain surface"),
        (files["renderer"], (r"contour-dem-detail", r"contour-dem-overscan", r"createTerrainMesh\(bundle", r"detailEdgeFeather"), "Focused high-detail terrain preserved above overscan surface"),
        (files["config"], (r"scopeStyles", r"district", r"verticalExaggeration", r"resolveContourScopeStyle"), "Scope-isolated contour styling"),
        (files["adapter"], (r"loadContourBundle", r"loadOptionalSurface", r"surface\.json", r"requireRealDem", r"elevationUnit", r"EPSG:4326"), "DEM truthfulness and dual-coverage bundle contract"),
        (files["diagnostics"], (r"three-contour-terrain", r"rotatable", r"meshVertexCount", r"meshTriangleCount", r"verticalExaggeration", r"overscanSurface", r"surfaceBbox"), "Three-dimensional runtime diagnostics"),
    )
    for path, patterns, label in checks:
        if all(contains(path, pattern) for pattern in patterns):
            passes.append(f"Contract check passed: {label}")
        else:
            blockers.append(f"Contract check missing: {label}")
    renderer_source = read_text(files["renderer"])
    if re.search(r"from\s+['\"]maplibre-gl['\"]", renderer_source):
        blockers.append("Contour terrain must remain independent from MapLibre")
    else:
        passes.append("Renderer independence check passed: no MapLibre import")
    if re.search(r"Path2D|willReadFrequently|canvas-contour", renderer_source):
        blockers.append("Legacy flat Canvas contour renderer is still present")
    else:
        passes.append("Legacy flat Canvas implementation is absent")
    if re.search(r"setAnimationLoop|requestAnimationFrame", renderer_source):
        blockers.append("Static contour terrain must render on events instead of an idle animation loop")
    else:
        passes.append("No continuous idle render loop found")
    if contains(files["component"], r"非真实海拔") and contains(files["adapter"], r"bundled-relative-elevation-demo"):
        passes.append("Demo relative-elevation disclosure found")
    else:
        blockers.append("Demo data must be visibly and programmatically identified as non-metric")
    if contains(files["diagnostics"], r"coverage:\s*['\"]bbox['\"]") and not contains(files["config"], r"administrativeOverlay|clipToAdministrativeBoundary"):
        passes.append("Pure elevation default found: bbox terrain with no administrative visual overlay")
    else:
        blockers.append("Pure elevation default must not clip to or draw administrative boundaries")
    print(f"Contour map project check: {root}")
    print("\nPASS")
    for item in passes or ["None"]:
        print(f"  - {item}")
    print("\nBLOCKERS")
    for item in blockers or ["None"]:
        print(f"  - {item}")
    return 1 if blockers and args.strict else 0


if __name__ == "__main__":
    raise SystemExit(main())
