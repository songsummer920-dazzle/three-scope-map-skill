#!/usr/bin/env python3
"""Recolor the bundled smart-mine map label SVG pointer.

Attribution: 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""

from __future__ import annotations

import argparse
import re
import shutil
from datetime import datetime
from pathlib import Path


HEX_COLOR_RE = re.compile(r"#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})")
POINTER_PATH_RE = re.compile(
    r'(<path\s+d="M54\s+67\.5H82L68\s+81L54\s+67\.5Z"\s+fill=")(#[0-9A-Fa-f]{6})(")',
)


def normalize_hex(value: str) -> str:
    match = HEX_COLOR_RE.fullmatch(value.strip())
    if not match:
        raise ValueError(f"Invalid color: {value!r}. Expected #RGB or #RRGGBB.")
    raw = match.group(1)
    if len(raw) == 3:
        raw = "".join(channel * 2 for channel in raw)
    return f"#{raw.upper()}"


def recolor_svg(source: str, color: str) -> tuple[str, bool]:
    next_source, count = POINTER_PATH_RE.subn(rf"\1{color}\3", source, count=1)
    return next_source, bool(count)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("color", help="Theme color for the label pointer, e.g. #2AF7FF")
    parser.add_argument("svg", type=Path, help="Path to map-label-bg.svg")
    parser.add_argument("--out", type=Path, help="Write to a new SVG path instead of overwriting")
    parser.add_argument("--dry-run", action="store_true", help="Print updated SVG without writing")
    parser.add_argument("--no-backup", action="store_true", help="Do not create a .bak backup when overwriting")
    args = parser.parse_args()

    if not args.svg.exists():
        raise SystemExit(f"SVG file does not exist: {args.svg}")

    color = normalize_hex(args.color)
    source = args.svg.read_text(encoding="utf-8")
    updated, changed = recolor_svg(source, color)
    if not changed:
        raise SystemExit("Could not find the bundled label pointer path to recolor.")

    if args.dry_run:
        print(updated)
        return 0

    target = args.out or args.svg
    if target == args.svg and not args.no_backup:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = args.svg.with_suffix(args.svg.suffix + f".{stamp}.bak")
        shutil.copy2(args.svg, backup)
        print(f"Backup: {backup}")

    target.write_text(updated, encoding="utf-8")
    print(f"Recolored label pointer to {color}: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
