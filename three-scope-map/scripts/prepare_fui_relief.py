#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
# 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""Pack a NASA/GEBCO 0–6400m elevation raster for FUI's linear relief sampler.

Requires Pillow and NumPy. Input is a global equirectangular elevation image,
not a shaded render, concept image, or screen capture. See references/fui-earth.md.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image


def smooth_elevation(height: np.ndarray, radius: int) -> np.ndarray:
    """Approximate a Gaussian in float32, keeping sub-height-unit slopes."""
    result = height
    for _ in range(3):
        for axis in (0, 1):
            padding = [(0, 0), (0, 0)]
            padding[axis] = (radius, radius)
            padded = np.pad(result, padding, mode="wrap" if axis == 1 else "edge")
            total = np.cumsum(padded, axis=axis, dtype=np.float32)
            shape = list(total.shape)
            shape[axis] = 1
            total = np.concatenate((np.zeros(shape, dtype=np.float32), total), axis=axis)
            upper = [slice(None), slice(None)]
            lower = [slice(None), slice(None)]
            width = radius * 2 + 1
            upper[axis] = slice(width, None)
            lower[axis] = slice(None, -width)
            result = (total[tuple(upper)] - total[tuple(lower)]) / width
    return result


def resize_data_channels(packed: np.ndarray, width: int, height: int) -> np.ndarray:
    """Resample independent linear data; the fourth channel is not opacity."""
    channels = [
        np.asarray(
            Image.fromarray(packed[:, :, channel]).resize(
                (width, height), Image.Resampling.LANCZOS
            ),
            dtype=np.float32,
        )
        for channel in range(packed.shape[2])
    ]
    return np.stack(channels, axis=2)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--width", type=int, default=4096)
    args = parser.parse_args()
    if args.width < 512 or args.width > 8192 or args.width % 2:
        parser.error("--width must be an even integer from 512 to 8192")
    Image.MAX_IMAGE_PIXELS = 250_000_000
    work_width = min(args.width * 2, 8192)
    work_height = work_width // 2
    with Image.open(args.input) as source:
        if abs(source.width / source.height - 2) > 0.01:
            parser.error("input must be a 2:1 equirectangular elevation raster")
        dem = source.convert("L").resize((work_width, work_height), Image.Resampling.LANCZOS)
    height = np.asarray(dem, dtype=np.float32) / 255
    # Separate the scale of a mountain range from its small ridges. Using only
    # the finest gradient produces noisy glitter at a globe-sized viewport.
    # All three scales come from the same elevation raster, without noise.
    # Balance narrow ridges with coherent range gradients. The former broad-
    # dominated field made whole ranges look like rounded, polished lumps.
    fine = smooth_elevation(height, max(1, round(1 * work_width / 8192)))
    medium = smooth_elevation(height, max(1, round(3 * work_width / 8192)))
    broad = smooth_elevation(height, max(1, round(10 * work_width / 8192)))
    east = np.zeros_like(height)
    north = np.zeros_like(height)
    for level, weight in ((fine, 0.80), (medium, 0.72), (broad, 0.20)):
        east += (np.roll(level, -1, axis=1) - np.roll(level, 1, axis=1)) * 0.5 * weight
        north += (np.roll(level, 1, axis=0) - np.roll(level, -1, axis=0)) * 0.5 * weight
    latitude = (np.arange(work_height, dtype=np.float32) + 0.5) / work_height * np.pi
    strength = 72 * work_width / 8192
    east = -east * strength / np.maximum(np.sin(latitude)[:, None], 0.15)
    north = -north * strength
    magnitude = np.sqrt(east**2 + north**2 + 1)
    # The fourth channel is a signed, range-scale curvature cue, centered at .5.
    # PNG keeps channel data lossless; JPEG ringing otherwise creates false ridges.
    curvature = np.clip((medium - broad) * 3.0 + 0.5, 0, 1)
    packed = np.stack((east / magnitude * 0.5 + 0.5, north / magnitude * 0.5 + 0.5, fine, curvature), axis=2)
    # Alpha stores curvature, not opacity. RGBA resize premultiplies R/G/B by
    # that unrelated channel and corrupts the normal and elevation data.
    # Resample each float channel independently, then quantize exactly once.
    resized = resize_data_channels(packed, args.width, args.width // 2)
    image = Image.fromarray(np.uint8(np.clip(resized, 0, 1) * 255 + 0.5))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.output, compress_level=6)
    print(f"Wrote {args.output}: {image.width} × {image.height}, linear R/G normal, B elevation, A curvature")


if __name__ == "__main__":
    main()
