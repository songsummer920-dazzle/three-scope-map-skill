#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (c) 2026 宋夏天Dazzle
"""Apply a generated mapTheme object to a TypeScript file.

Attribution: 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""

from __future__ import annotations

import argparse
import importlib.util
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path


def load_generator():
    script = Path(__file__).with_name("generate_map_theme.py")
    spec = importlib.util.spec_from_file_location("generate_map_theme", script)
    if not spec or not spec.loader:
        raise RuntimeError(f"Could not load {script}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_label_recolorer():
    script = Path(__file__).with_name("recolor_label_asset.py")
    spec = importlib.util.spec_from_file_location("recolor_label_asset", script)
    if not spec or not spec.loader:
        raise RuntimeError(f"Could not load {script}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def replace_theme(source: str, theme_ts: str) -> tuple[str, bool]:
    patterns = [
        r"export\s+const\s+mapTheme\s*=\s*\{.*?\}\s+as\s+const\s*;",
        r"const\s+mapTheme\s*=\s*\{.*?\}\s+as\s+const\s*;",
        r"export\s+const\s+mapTheme\s*=\s*\{.*?\}\s*;",
        r"const\s+mapTheme\s*=\s*\{.*?\}\s*;",
    ]
    for pattern in patterns:
        next_source, count = re.subn(pattern, theme_ts, source, count=1, flags=re.S)
        if count:
            return next_source, True
    return source, False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("color", help="Main theme color, e.g. #2AF7FF")
    parser.add_argument("target", type=Path, help="TypeScript file containing mapTheme")
    parser.add_argument("--label-svg", type=Path, help="Also recolor the bundled map-label-bg.svg pointer")
    parser.add_argument("--dry-run", action="store_true", help="Print replacement without writing")
    parser.add_argument("--no-backup", action="store_true", help="Do not create a .bak backup")
    args = parser.parse_args()

    if not args.target.exists():
        raise SystemExit(f"Target file does not exist: {args.target}")

    generator = load_generator()
    theme = generator.generate_theme(args.color)
    theme_ts = generator.to_ts(theme)
    source = args.target.read_text(encoding="utf-8")
    updated, changed = replace_theme(source, theme_ts)
    if not changed:
        raise SystemExit("Could not find a mapTheme object to replace. Expected `export const mapTheme = { ... } as const;`.")

    if args.dry_run:
        print(theme_ts)
        return 0

    backup = None
    if not args.no_backup:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = args.target.with_suffix(args.target.suffix + f".{stamp}.bak")
        shutil.copy2(args.target, backup)

    args.target.write_text(updated, encoding="utf-8")
    print(f"Applied mapTheme to {args.target}")
    if backup:
        print(f"Backup: {backup}")

    if args.label_svg:
        if not args.label_svg.exists():
            raise SystemExit(f"Label SVG file does not exist: {args.label_svg}")
        recolorer = load_label_recolorer()
        label_source = args.label_svg.read_text(encoding="utf-8")
        label_updated, label_changed = recolorer.recolor_svg(label_source, theme["labelPointer"])
        if not label_changed:
            raise SystemExit("Could not find the bundled label pointer path to recolor.")
        if not args.no_backup:
            stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            label_backup = args.label_svg.with_suffix(args.label_svg.suffix + f".{stamp}.bak")
            shutil.copy2(args.label_svg, label_backup)
            print(f"Label backup: {label_backup}")
        args.label_svg.write_text(label_updated, encoding="utf-8")
        print(f"Recolored label pointer to {theme['labelPointer']}: {args.label_svg}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
