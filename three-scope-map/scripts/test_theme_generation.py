#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
# Copyright (c) 2026 宋夏天Dazzle
"""Regression checks for achromatic and low-saturation generated map themes.

作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""

from __future__ import annotations

import colorsys

from generate_map_theme import generate_theme, parse_hex


def saturation(value: str) -> float:
    red, green, blue = (channel / 255 for channel in parse_hex(value))
    return colorsys.rgb_to_hls(red, green, blue)[2]


def check_muted_theme(primary: str, maximum_saturation: float) -> None:
    theme = generate_theme(primary)
    for role in ("primary", "outline", "topFill", "sideTop", "sideMid"):
        value = theme[role]
        assert isinstance(value, str)
        assert saturation(value) <= maximum_saturation, (
            f"{primary} generated excessive chroma for {role}: {value}"
        )


def main() -> int:
    for primary in ("#000000", "#808080", "#FFFFFF"):
        check_muted_theme(primary, 0.001)
    check_muted_theme("#777A7D", 0.08)

    cyan = generate_theme("#2AF7FF")
    assert saturation(str(cyan["primary"])) >= 0.75
    assert saturation(str(cyan["sideMid"])) >= 0.7

    print("Theme generator regression checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
