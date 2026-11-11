#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
# Copyright (c) 2026 宋夏天Dazzle
"""Behavior tests for preprocess_contour_map.py.

作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""

from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

from PIL import Image

from preprocess_contour_map import build_bundle, decode_terrarium, extract_contours, load_image_grid, smooth_elevation_grid


def main() -> int:
    assert decode_terrarium(137, 219, 68) == 2523.265625
    impulse = smooth_elevation_grid(3, 3, [0, 0, 0, 0, 100, 0, 0, 0, 0], 1)
    assert 0 < impulse[4] < 100
    assert abs(sum(impulse) - 100) < 1e-6
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        image = Image.new("L", (5, 5))
        image.putdata([column * 32 + row * 8 for row in range(5) for column in range(5)])
        image_path = root / "slope.png"
        image.save(image_path)
        width, height, values = load_image_grid(image_path, 0, 100, 32)
        contours = extract_contours(width, height, values, (0, 0, 1, 1), [], 20, 2)
        assert contours, "slope DEM should produce contour segments"
        assert any(item["major"] for item in contours), "major contours should be marked"
        assert all(len(item["coordinates"]) == 2 for item in contours)
        assert all(0 <= coordinate <= 1 for item in contours for point in item["coordinates"] for coordinate in point)
        boundary_path = root / "boundary.json"
        boundary_path.write_text(json.dumps({
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {"adcode": "100000"},
                "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]},
            }],
        }), encoding="utf-8")
        surface = build_bundle(argparse.Namespace(
            boundary=boundary_path,
            bbox=[-0.5, -0.5, 1.5, 1.5],
            terrarium_zoom=None,
            terrarium_url="",
            max_grid=32,
            dem=image_path,
            min_elevation=0,
            max_elevation=100,
            clamp_min_elevation=None,
            surface_only=True,
            clip_to_boundary=False,
            interval=None,
            major_every=5,
            scope="country",
            code="100000",
            region_name="中国",
            source="test-dem",
            attribution=None,
            smooth_passes=1,
        ))
        assert "contours" not in surface
        assert surface["metadata"]["coverage"] == "bbox"
        assert surface["metadata"]["bbox"] == [-0.5, -0.5, 1.5, 1.5]
        assert "overscan surface only" in surface["metadata"]["processing"]
    print("Contour preprocessing tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
