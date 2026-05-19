#!/usr/bin/env python3
"""Generate a B-end 3D province map theme from one main color.

Attribution: 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""

from __future__ import annotations

import colorsys
import json
import re
import sys
from typing import Tuple


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def parse_hex(value: str) -> Tuple[int, int, int]:
    raw = value.strip()
    match = re.fullmatch(r"#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})", raw)
    if not match:
        raise ValueError(f"Invalid color: {value!r}. Expected #RGB or #RRGGBB.")
    hex_value = match.group(1)
    if len(hex_value) == 3:
        hex_value = "".join(ch * 2 for ch in hex_value)
    return tuple(int(hex_value[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def to_hex(rgb: Tuple[int, int, int]) -> str:
    return "#{:02X}{:02X}{:02X}".format(*rgb)


def hls_to_rgb_hex(h: float, l: float, s: float) -> str:
    r, g, b = colorsys.hls_to_rgb(h, clamp(l), clamp(s))
    return to_hex((round(r * 255), round(g * 255), round(b * 255)))


def mix(a: Tuple[int, int, int], b: Tuple[int, int, int], amount: float) -> Tuple[int, int, int]:
    amount = clamp(amount)
    return tuple(round(a[i] * (1 - amount) + b[i] * amount) for i in range(3))  # type: ignore[return-value]


def rgba(hex_color: str, alpha: float) -> str:
    r, g, b = parse_hex(hex_color)
    return f"rgba({r},{g},{b},{alpha:.2f})"


def generate_theme(hex_color: str) -> dict[str, object]:
    rgb = parse_hex(hex_color)
    r, g, b = (channel / 255 for channel in rgb)
    h, l, s = colorsys.rgb_to_hls(r, g, b)

    primary = hls_to_rgb_hex(h, max(l, 0.62), max(s, 0.82))
    outline = hls_to_rgb_hex(h, 0.72, max(s, 0.72))
    hot = hls_to_rgb_hex(h, 0.80, max(s, 0.88))
    label_text = to_hex(mix(parse_hex(primary), (255, 255, 245), 0.72))
    top_fill = hls_to_rgb_hex(h, 0.055, min(max(s, 0.42), 0.64))
    side_mid = hls_to_rgb_hex(h, 0.46, max(s, 0.72))

    return {
        "primary": primary,
        "outline": outline,
        "internalLine": rgba(outline, 0.54),
        "topFill": top_fill,
        "topOpacity": 0.86,
        "sideTop": hot,
        "sideMid": side_mid,
        "sideBottom": rgba(primary, 0.06),
        "labelText": label_text,
        "labelBorder": rgba(label_text, 0.72),
        "labelGlow": rgba(primary, 0.34),
        "labelPointer": primary,
        "scatter": primary,
        "ripple": rgba(primary, 0.42),
        "flyLine": rgba(hot, 0.86),
        "hudRing": rgba(primary, 0.22),
        "chaseLightHead": "#FFFFFF",
        "chaseLightTail": "rgba(255,255,255,0)",
    }


def to_ts(theme: dict[str, object]) -> str:
    lines = ["export const mapTheme = {"]
    for key, value in theme.items():
        encoded = json.dumps(value, ensure_ascii=False)
        lines.append(f"  {key}: {encoded},")
    lines.append("} as const;")
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) not in (2, 3):
        print("Usage: generate_map_theme.py <#hex> [--json|--ts]", file=sys.stderr)
        return 2
    fmt = sys.argv[2] if len(sys.argv) == 3 else "--ts"
    theme = generate_theme(sys.argv[1])
    if fmt == "--json":
        print(json.dumps(theme, ensure_ascii=False, indent=2))
    elif fmt == "--ts":
        print(to_ts(theme))
    else:
        print(f"Unknown format: {fmt}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
