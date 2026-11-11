#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
# Copyright (c) 2026 宋夏天Dazzle
"""Build a standalone contour-map bundle from an elevation raster.

作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import io
import json
import math
from pathlib import Path
from typing import Any, Iterable, Sequence
from urllib.request import Request, urlopen


Position = tuple[float, float]
DEFAULT_TERRARIUM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def visit_positions(value: Any) -> Iterable[Position]:
    if isinstance(value, list) and len(value) >= 2 and all(isinstance(item, (int, float)) for item in value[:2]):
        yield float(value[0]), float(value[1])
        return
    if isinstance(value, list):
        for item in value:
            yield from visit_positions(item)


def boundary_bbox(boundary: dict[str, Any]) -> tuple[float, float, float, float]:
    positions = [
        position
        for feature in boundary.get("features", [])
        if not str(feature.get("properties", {}).get("adcode") or "").endswith("_JD")
        for position in visit_positions(feature.get("geometry", {}).get("coordinates"))
    ]
    if not positions:
        raise ValueError("Boundary GeoJSON contains no coordinates")
    return (
        min(position[0] for position in positions),
        min(position[1] for position in positions),
        max(position[0] for position in positions),
        max(position[1] for position in positions),
    )


def polygon_sets(boundary: dict[str, Any]) -> list[list[list[Position]]]:
    polygons: list[list[list[Position]]] = []
    for feature in boundary.get("features", []):
        properties = feature.get("properties", {})
        code = str(properties.get("adcode") or properties.get("code") or properties.get("id") or "")
        if code.endswith("_JD"):
            continue
        geometry = feature.get("geometry", {})
        coordinates = geometry.get("coordinates", [])
        if geometry.get("type") == "Polygon":
            coordinates = [coordinates]
        for polygon in coordinates:
            polygons.append([[(float(x), float(y)) for x, y, *_ in ring] for ring in polygon])
    return polygons


def point_in_ring(point: Position, ring: Sequence[Position]) -> bool:
    x, y = point
    inside = False
    previous = len(ring) - 1
    for index, current_point in enumerate(ring):
        current_x, current_y = current_point
        previous_x, previous_y = ring[previous]
        denominator = previous_y - current_y
        if ((current_y > y) != (previous_y > y)) and abs(denominator) > 1e-15 and (
            x < (previous_x - current_x) * (y - current_y) / denominator + current_x
        ):
            inside = not inside
        previous = index
    return inside


def point_in_boundary(point: Position, polygons: Sequence[Sequence[Sequence[Position]]]) -> bool:
    for polygon in polygons:
        if not polygon or not point_in_ring(point, polygon[0]):
            continue
        if not any(point_in_ring(point, hole) for hole in polygon[1:]):
            return True
    return False


def load_image_grid(
    path: Path,
    min_elevation: float,
    max_elevation: float,
    max_grid: int,
) -> tuple[int, int, list[float]]:
    try:
        from PIL import Image
    except ImportError as error:
        raise RuntimeError("Pillow is required for PNG/JPEG elevation rasters") from error
    image = Image.open(path).convert("F")
    scale = min(1.0, max_grid / max(image.size))
    if scale < 1:
        image = image.resize((max(2, round(image.width * scale)), max(2, round(image.height * scale))))
    raw = [float(value) for value in image.getdata()]
    source_min = min(raw)
    source_max = max(raw)
    values = [
        min_elevation + (value - source_min) / max(source_max - source_min, 1e-12) * (max_elevation - min_elevation)
        for value in raw
    ]
    return image.width, image.height, values


def longitude_to_tile_x(longitude: float, zoom: int) -> float:
    return (longitude + 180.0) / 360.0 * (2 ** zoom)


def latitude_to_tile_y(latitude: float, zoom: int) -> float:
    latitude = max(-85.05112878, min(85.05112878, latitude))
    radians = math.radians(latitude)
    return (1.0 - math.asinh(math.tan(radians)) / math.pi) / 2.0 * (2 ** zoom)


def decode_terrarium(red: int, green: int, blue: int) -> float:
    return red * 256 + green + blue / 256 - 32768


def smooth_elevation_grid(width: int, height: int, values: Sequence[float], passes: int) -> list[float]:
    """Apply a small separable Gaussian blur while keeping metric elevation values."""
    current = list(values)
    for _ in range(passes):
        horizontal = [0.0] * len(current)
        for row in range(height):
            for column in range(width):
                left = current[row * width + max(0, column - 1)]
                center = current[row * width + column]
                right = current[row * width + min(width - 1, column + 1)]
                horizontal[row * width + column] = (left + center * 2 + right) / 4
        vertical = [0.0] * len(current)
        for row in range(height):
            for column in range(width):
                top = horizontal[max(0, row - 1) * width + column]
                center = horizontal[row * width + column]
                bottom = horizontal[min(height - 1, row + 1) * width + column]
                vertical[row * width + column] = (top + center * 2 + bottom) / 4
        current = vertical
    return current


def load_terrarium_grid(
    bbox: tuple[float, float, float, float],
    zoom: int,
    max_grid: int,
    url_template: str,
) -> tuple[int, int, list[float]]:
    """Sample Mapzen/Terrain Tiles Terrarium PNGs into a WGS84 elevation grid."""
    try:
        from PIL import Image
    except ImportError as error:
        raise RuntimeError("Pillow is required for Terrarium elevation tiles") from error

    min_x, min_y, max_x, max_y = bbox
    aspect = max((max_x - min_x) / max(max_y - min_y, 1e-12), 1e-6)
    if aspect >= 1:
        width = max_grid
        height = max(2, round(max_grid / aspect))
    else:
        height = max_grid
        width = max(2, round(max_grid * aspect))

    tile_cache: dict[tuple[int, int], Any] = {}

    def download_tile(key: tuple[int, int]):
        tile_x, tile_y = key
        url = url_template.format(z=zoom, x=tile_x, y=tile_y)
        request = Request(url, headers={"User-Agent": "three-scope-map-skill/contour-preprocessor"})
        try:
            with urlopen(request, timeout=30) as response:
                return key, Image.open(io.BytesIO(response.read())).convert("RGB")
        except Exception as error:
            raise RuntimeError(f"Failed to download Terrarium tile {zoom}/{tile_x}/{tile_y}: {error}") from error

    def tile(tile_x: int, tile_y: int):
        key = (tile_x, tile_y)
        if key not in tile_cache:
            _, tile_cache[key] = download_tile(key)
        return tile_cache[key]

    values: list[float] = []
    world_size = 2 ** zoom
    first_tile_x = max(0, min(world_size - 1, math.floor(longitude_to_tile_x(min_x, zoom))))
    last_tile_x = max(0, min(world_size - 1, math.floor(longitude_to_tile_x(max_x, zoom))))
    first_tile_y = max(0, min(world_size - 1, math.floor(latitude_to_tile_y(max_y, zoom))))
    last_tile_y = max(0, min(world_size - 1, math.floor(latitude_to_tile_y(min_y, zoom))))
    required_tiles = [
        (tile_x, tile_y)
        for tile_y in range(first_tile_y, last_tile_y + 1)
        for tile_x in range(first_tile_x, last_tile_x + 1)
    ]
    with ThreadPoolExecutor(max_workers=min(8, len(required_tiles))) as executor:
        futures = [executor.submit(download_tile, key) for key in required_tiles]
        for future in as_completed(futures):
            key, image = future.result()
            tile_cache[key] = image
    for row in range(height):
        latitude = max_y - row / max(height - 1, 1) * (max_y - min_y)
        world_y = latitude_to_tile_y(latitude, zoom)
        tile_y = max(0, min(world_size - 1, math.floor(world_y)))
        pixel_y = max(0, min(255, int((world_y - tile_y) * 256)))
        for column in range(width):
            longitude = min_x + column / max(width - 1, 1) * (max_x - min_x)
            world_x = longitude_to_tile_x(longitude, zoom)
            tile_x = max(0, min(world_size - 1, math.floor(world_x)))
            pixel_x = max(0, min(255, int((world_x - tile_x) * 256)))
            red, green, blue = tile(tile_x, tile_y).getpixel((pixel_x, pixel_y))
            values.append(decode_terrarium(red, green, blue))
    return width, height, values


def boundary_elevation_range(
    width: int,
    height: int,
    values: Sequence[float],
    bbox: tuple[float, float, float, float],
    polygons: Sequence[Sequence[Sequence[Position]]],
) -> tuple[float, float]:
    if not polygons:
        return min(values), max(values)
    min_x, min_y, max_x, max_y = bbox
    polygon_lookup = [
        (
            min(position[0] for position in polygon[0]),
            min(position[1] for position in polygon[0]),
            max(position[0] for position in polygon[0]),
            max(position[1] for position in polygon[0]),
            polygon,
        )
        for polygon in polygons
        if polygon and polygon[0]
    ]
    inside_values = []
    for row in range(height):
        latitude = max_y - row / max(height - 1, 1) * (max_y - min_y)
        for column in range(width):
            longitude = min_x + column / max(width - 1, 1) * (max_x - min_x)
            for polygon_min_x, polygon_min_y, polygon_max_x, polygon_max_y, polygon in polygon_lookup:
                if not (polygon_min_x <= longitude <= polygon_max_x and polygon_min_y <= latitude <= polygon_max_y):
                    continue
                point = (longitude, latitude)
                if point_in_ring(point, polygon[0]) and not any(point_in_ring(point, hole) for hole in polygon[1:]):
                    inside_values.append(values[row * width + column])
                    break
    if not inside_values:
        raise ValueError("No elevation samples fall inside the supplied boundary")
    return min(inside_values), max(inside_values)


def interpolate(a: Position, b: Position, a_value: float, b_value: float, level: float) -> list[float]:
    progress = 0.5 if abs(b_value - a_value) < 1e-12 else (level - a_value) / (b_value - a_value)
    return [a[0] + (b[0] - a[0]) * progress, a[1] + (b[1] - a[1]) * progress]


def extract_contours(
    width: int,
    height: int,
    values: Sequence[float],
    bbox: tuple[float, float, float, float],
    polygons: Sequence[Sequence[Sequence[Position]]],
    interval: float,
    major_every: int,
    elevation_range: tuple[float, float] | None = None,
) -> list[dict[str, Any]]:
    min_x, min_y, max_x, max_y = bbox
    cases: dict[int, list[tuple[int, int]]] = {
        1: [(3, 0)], 2: [(0, 1)], 3: [(3, 1)], 4: [(1, 2)],
        5: [(0, 1), (2, 3)], 6: [(0, 2)], 7: [(3, 2)], 8: [(2, 3)],
        9: [(0, 2)], 10: [(0, 3), (1, 2)], 11: [(1, 2)], 12: [(3, 1)],
        13: [(0, 1)], 14: [(3, 0)],
    }

    def point(column: int, row: int) -> Position:
        return (
            min_x + column / (width - 1) * (max_x - min_x),
            max_y - row / (height - 1) * (max_y - min_y),
        )

    range_min, range_max = elevation_range or (min(values), max(values))
    minimum = math.floor(range_min / interval) * interval
    maximum = math.ceil(range_max / interval) * interval
    polygon_lookup = []
    for polygon in polygons:
        if not polygon or not polygon[0]:
            continue
        polygon_lookup.append((
            min(position[0] for position in polygon[0]),
            min(position[1] for position in polygon[0]),
            max(position[0] for position in polygon[0]),
            max(position[1] for position in polygon[0]),
            polygon,
        ))

    def cell_is_inside(column: int, row: int) -> bool:
        if not polygon_lookup:
            return True
        top_left = point(column, row)
        bottom_right = point(column + 1, row + 1)
        center = ((top_left[0] + bottom_right[0]) / 2, (top_left[1] + bottom_right[1]) / 2)
        for polygon_min_x, polygon_min_y, polygon_max_x, polygon_max_y, polygon in polygon_lookup:
            if not (polygon_min_x <= center[0] <= polygon_max_x and polygon_min_y <= center[1] <= polygon_max_y):
                continue
            if point_in_ring(center, polygon[0]) and not any(point_in_ring(center, hole) for hole in polygon[1:]):
                return True
        return False

    inside_cells = [
        cell_is_inside(column, row)
        for row in range(height - 1)
        for column in range(width - 1)
    ]
    contours: list[dict[str, Any]] = []
    level = minimum + interval
    while level < maximum:
        for row in range(height - 1):
            for column in range(width - 1):
                index = row * width + column
                cell_values = [values[index], values[index + 1], values[index + width + 1], values[index + width]]
                corners = [point(column, row), point(column + 1, row), point(column + 1, row + 1), point(column, row + 1)]
                if not inside_cells[row * (width - 1) + column]:
                    continue
                mask = sum((1 << corner) for corner, value in enumerate(cell_values) if value >= level)
                edges = [(0, 1), (1, 2), (3, 2), (0, 3)]
                for edge_a, edge_b in cases.get(mask, []):
                    a0, a1 = edges[edge_a]
                    b0, b1 = edges[edge_b]
                    contours.append({
                        "elevation": round(level, 6),
                        "major": round(level / interval) % major_every == 0,
                        "coordinates": [
                            interpolate(corners[a0], corners[a1], cell_values[a0], cell_values[a1], level),
                            interpolate(corners[b0], corners[b1], cell_values[b0], cell_values[b1], level),
                        ],
                    })
        level += interval
    return contours


def build_bundle(args: argparse.Namespace) -> dict[str, Any]:
    boundary = read_json(args.boundary)
    bbox = tuple(args.bbox) if args.bbox else boundary_bbox(boundary)
    polygons = polygon_sets(boundary)
    if args.terrarium_zoom is not None:
        width, height, values = load_terrarium_grid(bbox, args.terrarium_zoom, args.max_grid, args.terrarium_url)
    else:
        width, height, values = load_image_grid(args.dem, args.min_elevation, args.max_elevation, args.max_grid)
    if args.clamp_min_elevation is not None:
        values = [max(args.clamp_min_elevation, value) for value in values]
    if args.smooth_passes:
        values = smooth_elevation_grid(width, height, values, args.smooth_passes)
    processing = "; ".join([
        f"sampled to {width}x{height} elevation grid",
        *(
            [f"elevation values clamped below {args.clamp_min_elevation:g} m"]
            if args.clamp_min_elevation is not None
            else []
        ),
        *(["overscan surface only; contour geometry remains in bundle.json"] if args.surface_only else []),
        *([f"Gaussian-smoothed {args.smooth_passes} pass(es) for cartographic presentation"] if args.smooth_passes else []),
    ])
    if args.surface_only:
        return {
            "metadata": {
                "scope": args.scope,
                "code": args.code,
                "regionName": args.region_name,
                "bbox": list(bbox),
                "crs": "EPSG:4326",
                "elevationUnit": "m",
                "minElevation": min(values),
                "maxElevation": max(values),
                "source": args.source,
                **({"attribution": args.attribution} if args.attribution else {}),
                "coverage": "bbox",
                "processing": processing,
                "demo": False,
            },
            "grid": {"width": width, "height": height, "values": [round(value, 4) for value in values]},
        }
    clip_polygons = polygons if args.clip_to_boundary else []
    elevation_range = boundary_elevation_range(width, height, values, bbox, clip_polygons)
    contours = extract_contours(
        width,
        height,
        values,
        bbox,
        clip_polygons,
        args.interval,
        args.major_every,
        elevation_range,
    )
    if not contours:
        raise ValueError("No contour lines were generated; check elevation range, interval, and boundary coverage")
    return {
        "metadata": {
            "scope": args.scope,
            "code": args.code,
            "regionName": args.region_name,
            "bbox": list(bbox),
            "crs": "EPSG:4326",
            "elevationUnit": "m",
            "minElevation": elevation_range[0],
            "maxElevation": elevation_range[1],
            "interval": args.interval,
            "majorEvery": args.major_every,
            "source": args.source,
            **({"attribution": args.attribution} if args.attribution else {}),
            "coverage": "administrative-boundary" if args.clip_to_boundary else "bbox",
            "processing": processing,
            "demo": False,
        },
        "grid": {"width": width, "height": height, "values": [round(value, 4) for value in values]},
        "contours": contours,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a Three.js contour-terrain bundle from a DEM raster or Terrarium tiles")
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument("--dem", type=Path, help="Grayscale PNG/JPEG elevation raster")
    source_group.add_argument("--terrarium-zoom", type=int, help="Download and decode real metric Terrarium tiles at this zoom")
    parser.add_argument("--terrarium-url", default=DEFAULT_TERRARIUM_URL, help="Terrarium URL template with {z}/{x}/{y}")
    parser.add_argument("--clip-to-boundary", action="store_true", help="Clip contour generation to the administrative geometry; default coverage is the full DEM bbox")
    parser.add_argument("--surface-only", action="store_true", help="Create surface.json only: a larger real DEM used to keep the rotatable view inside data coverage")
    parser.add_argument("--clamp-min-elevation", type=float, help="Clamp lower values for land-focused display while preserving metric units")
    parser.add_argument("--boundary", type=Path, required=True, help="Administrative boundary GeoJSON")
    parser.add_argument("--scope", choices=("world", "country", "province", "city", "district"), required=True)
    parser.add_argument("--code", required=True)
    parser.add_argument("--region-name", required=True)
    parser.add_argument("--bbox", nargs=4, type=float, metavar=("MIN_X", "MIN_Y", "MAX_X", "MAX_Y"))
    parser.add_argument("--min-elevation", type=float)
    parser.add_argument("--max-elevation", type=float)
    parser.add_argument("--interval", type=float)
    parser.add_argument("--major-every", type=int, default=5)
    parser.add_argument("--max-grid", type=int, default=256)
    parser.add_argument("--smooth-passes", type=int, default=0, help="Apply a restrained Gaussian smoothing pass before contour extraction")
    parser.add_argument("--source", required=True, help="DEM source/license identifier")
    parser.add_argument("--attribution", help="Visible or documented attribution required by the DEM provider")
    parser.add_argument("--out", type=Path, required=True, help="Output directory; bundle.json is created inside")
    args = parser.parse_args()
    if not args.surface_only and args.interval is None:
        parser.error("contour bundle generation requires --interval")
    if (args.interval is not None and args.interval <= 0) or args.major_every <= 0:
        parser.error("--interval and --major-every must be positive")
    if args.surface_only and args.clip_to_boundary:
        parser.error("--surface-only cannot be combined with --clip-to-boundary")
    if not 0 <= args.smooth_passes <= 6:
        parser.error("--smooth-passes must be between 0 and 6")
    if args.terrarium_zoom is not None and not 0 <= args.terrarium_zoom <= 15:
        parser.error("--terrarium-zoom must be between 0 and 15")
    if args.dem:
        if args.min_elevation is None or args.max_elevation is None:
            parser.error("--dem requires --min-elevation and --max-elevation")
        if args.max_elevation <= args.min_elevation:
            parser.error("--max-elevation must be greater than --min-elevation")
    bundle = build_bundle(args)
    args.out.mkdir(parents=True, exist_ok=True)
    output = args.out / ("surface.json" if args.surface_only else "bundle.json")
    output.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{'Overscan surface' if args.surface_only else 'Contour bundle'}: {output}")
    print(f"Grid: {bundle['grid']['width']}x{bundle['grid']['height']}")
    if not args.surface_only:
        print(f"Contour segments: {len(bundle['contours'])}")
    print(f"Elevation: {bundle['metadata']['minElevation']:.2f}..{bundle['metadata']['maxElevation']:.2f} m")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
