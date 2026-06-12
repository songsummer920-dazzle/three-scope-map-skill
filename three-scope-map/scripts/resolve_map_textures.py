#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (c) 2026 宋夏天Dazzle
"""Validate or generate terrain texture sets for Three.js dashboard maps.

Attribution: 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""

from __future__ import annotations

import argparse
import json
import math
import random
import re
import struct
import sys
import zlib
from pathlib import Path
from typing import Iterable


TEXTURE_KINDS = ("diffuse", "height", "normal", "roughness")
EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp")


def parse_hex(value: str) -> tuple[int, int, int]:
    match = re.fullmatch(r"#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})", value.strip())
    if not match:
        raise ValueError(f"Invalid color {value!r}; expected #RGB or #RRGGBB")
    hex_value = match.group(1)
    if len(hex_value) == 3:
        hex_value = "".join(ch * 2 for ch in hex_value)
    return tuple(int(hex_value[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def mix(a: tuple[int, int, int], b: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    amount = max(0.0, min(1.0, amount))
    return tuple(round(a[i] * (1 - amount) + b[i] * amount) for i in range(3))  # type: ignore[return-value]


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def write_png(path: Path, width: int, height: int, pixels: Iterable[tuple[int, int, int, int]]) -> None:
    raw = bytearray()
    iterator = iter(pixels)
    for _y in range(height):
        raw.append(0)
        for _x in range(width):
            raw.extend(next(iterator))
    payload = b"\x89PNG\r\n\x1a\n"
    payload += png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    payload += png_chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    payload += png_chunk(b"IEND", b"")
    path.write_bytes(payload)


def read_png_size(path: Path) -> tuple[int, int] | None:
    data = path.read_bytes()[:24]
    if len(data) >= 24 and data.startswith(b"\x89PNG\r\n\x1a\n"):
        return struct.unpack(">II", data[16:24])
    return None


def read_jpeg_size(path: Path) -> tuple[int, int] | None:
    data = path.read_bytes()
    if not data.startswith(b"\xff\xd8"):
        return None
    index = 2
    while index + 9 < len(data):
        if data[index] != 0xFF:
            index += 1
            continue
        marker = data[index + 1]
        index += 2
        if marker in (0xD8, 0xD9):
            continue
        if index + 2 > len(data):
            break
        length = struct.unpack(">H", data[index : index + 2])[0]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            height = struct.unpack(">H", data[index + 3 : index + 5])[0]
            width = struct.unpack(">H", data[index + 5 : index + 7])[0]
            return width, height
        index += length
    return None


def read_image_size(path: Path) -> tuple[int, int] | None:
    suffix = path.suffix.lower()
    if suffix == ".png":
        return read_png_size(path)
    if suffix in (".jpg", ".jpeg"):
        return read_jpeg_size(path)
    return None


def find_texture(directory: Path, kind: str) -> Path | None:
    candidates = []
    for ext in EXTENSIONS:
        candidates.extend(directory.glob(f"*{kind}*{ext}"))
        candidates.extend(directory.glob(f"*{kind.capitalize()}*{ext}"))
    return sorted(candidates)[0] if candidates else None


def smooth_noise(width: int, height: int, seed: int) -> list[list[float]]:
    rng = random.Random(seed)
    coarse_w = 32
    coarse_h = 32
    coarse = [[rng.random() for _x in range(coarse_w + 1)] for _y in range(coarse_h + 1)]
    values: list[list[float]] = []
    for y in range(height):
        gy = y / max(1, height - 1) * (coarse_h - 1)
        y0 = math.floor(gy)
        y1 = min(coarse_h, y0 + 1)
        ty = gy - y0
        row: list[float] = []
        for x in range(width):
            gx = x / max(1, width - 1) * (coarse_w - 1)
            x0 = math.floor(gx)
            x1 = min(coarse_w, x0 + 1)
            tx = gx - x0
            a = coarse[y0][x0] * (1 - tx) + coarse[y0][x1] * tx
            b = coarse[y1][x0] * (1 - tx) + coarse[y1][x1] * tx
            row.append(a * (1 - ty) + b * ty)
        values.append(row)
    return values


def generate_textures(directory: Path, scope: str, theme: str, size: int, overwrite: bool) -> list[Path]:
    directory.mkdir(parents=True, exist_ok=True)
    base = parse_hex(theme)
    dark = mix(base, (0, 0, 0), 0.88)
    accent = mix(base, (255, 255, 220), 0.24)
    seed_by_scope = {
        "world": 900000,
        "country": 100000,
        "province": 330000,
        "city": 330100,
        "district": 330106,
    }
    noise = smooth_noise(size, size, seed=seed_by_scope.get(scope, 330000))
    created: list[Path] = []

    def target(kind: str) -> Path:
        return directory / f"terrain-{kind}.png"

    height_values = [[max(0.0, min(1.0, value * 0.82 + 0.08)) for value in row] for row in noise]

    if overwrite or not target("height").exists():
        write_png(
            target("height"),
            size,
            size,
            ((v := round(height_values[y][x] * 255), v, v, 255) for y in range(size) for x in range(size)),
        )
        created.append(target("height"))

    if overwrite or not target("diffuse").exists():
        def diffuse_pixels() -> Iterable[tuple[int, int, int, int]]:
            for y in range(size):
                for x in range(size):
                    v = height_values[y][x]
                    shade = 0.18 + v * 0.28
                    color = mix(dark, accent, shade)
                    yield color[0], color[1], color[2], 255
        write_png(target("diffuse"), size, size, diffuse_pixels())
        created.append(target("diffuse"))

    if overwrite or not target("roughness").exists():
        write_png(
            target("roughness"),
            size,
            size,
            ((r := round(190 + height_values[y][x] * 42), r, r, 255) for y in range(size) for x in range(size)),
        )
        created.append(target("roughness"))

    if overwrite or not target("normal").exists():
        strength = 2.2 if scope in ("province", "city") else 1.6 if scope == "district" else 1.4
        def normal_pixels() -> Iterable[tuple[int, int, int, int]]:
            for y in range(size):
                ym = max(0, y - 1)
                yp = min(size - 1, y + 1)
                for x in range(size):
                    xm = max(0, x - 1)
                    xp = min(size - 1, x + 1)
                    dx = (height_values[y][xp] - height_values[y][xm]) * strength
                    dy = (height_values[yp][x] - height_values[ym][x]) * strength
                    nz = 1.0
                    length = math.sqrt(dx * dx + dy * dy + nz * nz) or 1
                    nx = -dx / length
                    ny = -dy / length
                    nz = nz / length
                    yield round((nx * 0.5 + 0.5) * 255), round((ny * 0.5 + 0.5) * 255), round((nz * 0.5 + 0.5) * 255), 255
        write_png(target("normal"), size, size, normal_pixels())
        created.append(target("normal"))

    return created


def validate_textures(directory: Path, scope: str) -> dict[str, object]:
    textures = {}
    warnings: list[str] = []
    dimensions: list[tuple[int, int]] = []
    for kind in TEXTURE_KINDS:
        path = find_texture(directory, kind)
        if not path:
            warnings.append(f"Missing {kind} texture")
            textures[kind] = None
            continue
        size = read_image_size(path)
        if not size:
            warnings.append(f"Could not read dimensions for {path.name}; supported checks are PNG/JPEG")
        else:
            dimensions.append(size)
        textures[kind] = {"path": str(path), "size": size, "suffix": path.suffix.lower()}

    unique_sizes = sorted(set(dimensions))
    if len(unique_sizes) > 1:
        warnings.append(f"Texture dimensions do not match: {unique_sizes}")
    if unique_sizes:
        width, height = unique_sizes[0]
        minimum = 1024 if scope in ("country", "world") else 512
        if width < minimum or height < minimum:
            warnings.append(f"{scope} textures are small ({width}x{height}); prefer at least {minimum}x{minimum}")
    if scope == "country" and directory.name.lower() not in ("china", "country", "national"):
        warnings.append("Country texture directory should be named china/, country/, or national/ to avoid scope confusion")

    return {
        "directory": str(directory),
        "scope": scope,
        "textures": textures,
        "uniqueSizes": unique_sizes,
        "warnings": warnings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", required=True, type=Path, help="Texture directory")
    parser.add_argument("--scope", required=True, choices=["world", "country", "province", "city", "district"], help="Map texture scope")
    parser.add_argument("--theme", default="#E8FF4F", help="Main map theme color for generated fallback textures")
    parser.add_argument("--size", type=int, default=1024, help="Generated PNG size")
    parser.add_argument("--check", action="store_true", help="Validate existing texture set")
    parser.add_argument("--generate-missing", action="store_true", help="Generate missing fallback PNG textures")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite generated PNG textures")
    args = parser.parse_args()

    if not args.check and not args.generate_missing:
        parser.error("Use --check or --generate-missing")

    created: list[str] = []
    if args.generate_missing:
        created = [str(path) for path in generate_textures(args.dir, args.scope, args.theme, args.size, args.overwrite)]
    report = validate_textures(args.dir, args.scope)
    report["created"] = created
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not report["warnings"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
