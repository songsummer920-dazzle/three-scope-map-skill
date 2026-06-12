#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (c) 2026 宋夏天Dazzle
"""Preprocess GeoJSON for ThreeScopeMap runtime rendering.

ThreeScopeMap attribution: 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
Code-only attribution. Do not render it in the UI.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_MAX_POINTS = {
    "world": 130,
    "country": 220,
    "province": 420,
    "city": 360,
    "district": 420,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create render-ready GeoJSON for ThreeScopeMap.")
    parser.add_argument("--input", required=True, help="Source GeoJSON FeatureCollection path.")
    parser.add_argument("--output", required=True, help="Output preprocessed GeoJSON path.")
    parser.add_argument("--scope", default="province", choices=sorted(DEFAULT_MAX_POINTS))
    parser.add_argument("--max-points", type=int, default=None, help="Maximum points per ring.")
    return parser.parse_args()


def to_polygons(feature: dict[str, Any]) -> list[list[list[float]]]:
    geometry = feature.get("geometry") or {}
    if geometry.get("type") == "Polygon":
        return [geometry.get("coordinates") or []]
    return geometry.get("coordinates") or []


def simplify_ring(ring: list[list[float]], max_points: int) -> list[list[float]]:
    if len(ring) <= max_points:
        return ring
    step = max(1, (len(ring) + max_points - 1) // max_points)
    simplified = [point for index, point in enumerate(ring) if index % step == 0]
    first = ring[0] if ring else None
    last = ring[-1] if ring else None
    if first and last and first != last:
        simplified.append(last)
    return simplified if len(simplified) >= 4 else ring


def count_points(polygons: list[list[list[float]]]) -> int:
    return sum(len(ring) for polygon in polygons for ring in polygon)


def bbox_for_polygons(polygons: list[list[list[float]]]) -> list[float]:
    bbox = [float("inf"), float("inf"), float("-inf"), float("-inf")]
    for polygon in polygons:
        for ring in polygon:
            for lon, lat, *_ in ring:
                bbox[0] = min(bbox[0], lon)
                bbox[1] = min(bbox[1], lat)
                bbox[2] = max(bbox[2], lon)
                bbox[3] = max(bbox[3], lat)
    return bbox if all(value != float("inf") and value != float("-inf") for value in bbox) else [0, 0, 0, 0]


def bbox_for_features(features: list[dict[str, Any]]) -> list[float]:
    bbox = [float("inf"), float("inf"), float("-inf"), float("-inf")]
    for feature in features:
        current = ((feature.get("properties") or {}).get("__threeScopeMap") or {}).get("bbox")
        if not current:
            continue
        bbox[0] = min(bbox[0], current[0])
        bbox[1] = min(bbox[1], current[1])
        bbox[2] = max(bbox[2], current[2])
        bbox[3] = max(bbox[3], current[3])
    return bbox if all(value != float("inf") and value != float("-inf") for value in bbox) else [0, 0, 0, 0]


def feature_center(feature: dict[str, Any], bbox: list[float]) -> list[float]:
    center = (feature.get("properties") or {}).get("center")
    if isinstance(center, list) and len(center) >= 2 and all(isinstance(value, (int, float)) for value in center[:2]):
        return center[:2]
    return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]


def main() -> None:
    args = parse_args()
    max_points = args.max_points or DEFAULT_MAX_POINTS[args.scope]
    source = Path(args.input)
    target = Path(args.output)
    geojson = json.loads(source.read_text(encoding="utf-8"))

    if geojson.get("type") != "FeatureCollection" or not isinstance(geojson.get("features"), list):
        raise SystemExit("Input must be a GeoJSON FeatureCollection.")

    processed_features = []
    for feature in geojson["features"]:
        geometry = feature.get("geometry") or {}
        if geometry.get("type") not in {"Polygon", "MultiPolygon"}:
            continue
        polygons = to_polygons(feature)
        simplified_polygons = [
            [simplify_ring(ring, max_points) for ring in polygon]
            for polygon in polygons
        ]
        bbox = bbox_for_polygons(simplified_polygons)
        properties = {
            **(feature.get("properties") or {}),
            "center": feature_center(feature, bbox),
            "__threeScopeMap": {
                "scope": args.scope,
                "bbox": bbox,
                "sourcePoints": count_points(polygons),
                "renderPoints": count_points(simplified_polygons),
            },
        }
        coordinates = simplified_polygons[0] if geometry.get("type") == "Polygon" else simplified_polygons
        processed_features.append({**feature, "properties": properties, "geometry": {**geometry, "coordinates": coordinates}})

    result = {
        "type": "FeatureCollection",
        "properties": {
            **(geojson.get("properties") or {}),
            "__threeScopeMap": {
                "scope": args.scope,
                "maxPoints": max_points,
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "bbox": bbox_for_features(processed_features),
                "sourceFeatureCount": len(geojson["features"]),
                "featureCount": len(processed_features),
            },
        },
        "features": processed_features,
    }

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Preprocessed {len(processed_features)} features -> {target}")


if __name__ == "__main__":
    main()
