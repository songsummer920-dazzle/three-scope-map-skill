#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
# Copyright (c) 2026 宋夏天Dazzle
"""Validate a browser snapshot from window.__SUMMER_MAP_2D_DIAGNOSTICS__.

作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any


def read_snapshot(source: str) -> dict[str, Any]:
    raw = sys.stdin.read() if source == "-" else Path(source).read_text(encoding="utf-8")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("diagnostics snapshot must be a JSON object")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate a 2D MapLibre runtime diagnostics snapshot.",
    )
    parser.add_argument(
        "snapshot",
        help="JSON file exported from window.__SUMMER_MAP_2D_DIAGNOSTICS__, or - for stdin.",
    )
    args = parser.parse_args()

    try:
        snapshot = read_snapshot(args.snapshot)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"2D vector runtime diagnostics: invalid snapshot: {error}")
        return 1

    passes: list[str] = []
    blockers: list[str] = []

    def check(condition: bool, passed: str, blocked: str) -> None:
        (passes if condition else blockers).append(passed if condition else blocked)

    check(snapshot.get("version") == 1, "Diagnostics contract version is 1", "Unsupported diagnostics contract version")
    check(snapshot.get("styleLoaded") is True, "MapLibre style loaded", "MapLibre style did not load")
    check(snapshot.get("firstIdle") is True, "MapLibre reached first idle", "MapLibre never reached first idle")
    check(
        snapshot.get("basemapSourceLoaded") is True,
        "All basemap sources report loaded",
        "One or more basemap sources are not loaded",
    )
    check(bool(snapshot.get("navigationKey")), "Shared navigation key is present", "Shared navigation key is missing")
    check(not snapshot.get("errors"), "No MapLibre runtime errors", "MapLibre runtime errors were recorded")

    basemap_type = snapshot.get("basemapType")
    if basemap_type != "raster":
        check(
            int(snapshot.get("roadLayerCount") or 0) > 0,
            "Vector basemap includes road layers",
            "Vector basemap has no classified road layers",
        )
        check(
            int(snapshot.get("labelLayerCount") or 0) > 0,
            "Vector basemap includes label layers",
            "Vector basemap has no classified label layers",
        )

    if snapshot.get("themeMode") == "dashboard-dark" and basemap_type == "style-url":
        check(
            snapshot.get("styleHydrated") is True,
            "External style was hydrated before semantic theming",
            "External style was not hydrated, so semantic theming could not be guaranteed",
        )

    camera = snapshot.get("camera") or {}
    camera_values = [camera.get("zoom"), camera.get("bearing"), camera.get("pitch")]
    check(
        all(isinstance(value, (int, float)) and math.isfinite(value) for value in camera_values),
        "Camera diagnostics are finite",
        "Camera diagnostics are missing or invalid",
    )

    print("2D vector runtime diagnostics")
    print("\nPASS")
    for item in passes or ["None"]:
        print(f"  - {item}")
    print("\nBLOCKERS")
    for item in blockers or ["None"]:
        print(f"  - {item}")
    return 1 if blockers else 0


if __name__ == "__main__":
    raise SystemExit(main())
