#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
# Copyright (c) 2026 宋夏天Dazzle
"""Validate a browser snapshot from __SUMMER_MAP_CONTOUR_DIAGNOSTICS__.

作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Three.js contour-terrain runtime diagnostics")
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--require-real-dem", action="store_true")
    parser.add_argument("--require-bbox-coverage", action="store_true")
    parser.add_argument("--require-overscan-surface", action="store_true")
    args = parser.parse_args()
    diagnostics = json.loads(args.snapshot.read_text(encoding="utf-8"))
    blockers: list[str] = []
    if diagnostics.get("renderer") != "three-contour-terrain":
        blockers.append("renderer must be three-contour-terrain")
    if diagnostics.get("phase") != "ready" or not diagnostics.get("firstFrameRendered"):
        blockers.append("first complete contour terrain frame was not reported")
    if diagnostics.get("rotatable") is not True:
        blockers.append("orbit-camera rotation capability was not reported")
    for field in ("contourFeatureCount", "meshVertexCount", "meshTriangleCount"):
        if field == "contourFeatureCount" and diagnostics.get("flatTerrain") is True and diagnostics.get(field) == 0:
            continue  # Real flat terrain need not cross any contour elevation.
        if int(diagnostics.get(field, 0)) <= 0:
            blockers.append(f"{field} must be positive")
    if diagnostics.get("elevationUnit") == "m" and float(diagnostics.get("verticalExaggeration", 0)) <= 0:
        blockers.append("metric terrain must disclose a positive verticalExaggeration")
    if int(diagnostics.get("canvasWidth", 0)) <= 0 or int(diagnostics.get("canvasHeight", 0)) <= 0:
        blockers.append("WebGL canvas dimensions must be positive")
    if diagnostics.get("errors"):
        blockers.append("runtime errors were recorded")
    if args.require_real_dem and (diagnostics.get("demoData") or diagnostics.get("elevationUnit") != "m"):
        blockers.append("real DEM was required but diagnostics report demo/non-metric data")
    if args.require_bbox_coverage and diagnostics.get("coverage") != "bbox":
        blockers.append("pure elevation was required but diagnostics report administrative clipping")
    if args.require_overscan_surface:
        contour_bbox = diagnostics.get("contourBbox") or []
        surface_bbox = diagnostics.get("surfaceBbox") or []
        if diagnostics.get("overscanSurface") is not True:
            blockers.append("an overscan DEM surface was required but was not reported")
        elif len(contour_bbox) != 4 or len(surface_bbox) != 4 or not (
            surface_bbox[0] < contour_bbox[0]
            and surface_bbox[1] < contour_bbox[1]
            and surface_bbox[2] > contour_bbox[2]
            and surface_bbox[3] > contour_bbox[3]
        ):
            blockers.append("surfaceBbox must extend beyond contourBbox on every side")
    print("Contour diagnostics blockers:")
    for blocker in blockers or ["None"]:
        print(f"  - {blocker}")
    return 1 if blockers else 0


if __name__ == "__main__":
    raise SystemExit(main())
