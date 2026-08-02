#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (c) 2026 宋夏天Dazzle
"""Sync the map-core source of truth into the runnable Vue/React templates.

作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""

from __future__ import annotations

import argparse
import filecmp
import shutil
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = SKILL_ROOT / "assets/templates"
CORE = TEMPLATES / "map-core"
VUE = TEMPLATES / "smart-mine-vue"
REACT = TEMPLATES / "smart-mine-react"
TARGETS = (VUE, REACT)
IGNORED_NAMES = {"node_modules", "dist", ".DS_Store"}


def core_pairs(target: Path) -> list[tuple[Path, Path]]:
    """(source, destination) for every file map-core owns in `target`."""
    pairs: list[tuple[Path, Path]] = []
    for source in sorted((CORE / "core").rglob("*")):
        if source.is_file():
            pairs.append((source, target / "src/components/map/core" / source.relative_to(CORE / "core")))
    for source in sorted((CORE / "shared/types").rglob("*")):
        if source.is_file():
            pairs.append((source, target / "src/types" / source.relative_to(CORE / "shared/types")))
    for source in sorted((CORE / "shared").glob("*")):
        if not source.is_file():
            continue
        if source.name == "style.css":
            pairs.append((source, target / "src/style.css"))
        else:
            pairs.append((source, target / "src/components/map" / source.name))
    return pairs


def asset_pairs() -> list[tuple[Path, Path]]:
    """Vue template assets are the source of truth for the React template."""
    source_root = VUE / "src/assets"
    pairs: list[tuple[Path, Path]] = []
    if not REACT.exists():
        return pairs
    for source in sorted(source_root.rglob("*")):
        if source.is_file() and not any(part in IGNORED_NAMES for part in source.parts):
            pairs.append((source, REACT / "src/assets" / source.relative_to(source_root)))
    return pairs


def all_pairs() -> list[tuple[Path, Path]]:
    pairs: list[tuple[Path, Path]] = []
    for target in TARGETS:
        if target.exists():
            pairs.extend(core_pairs(target))
    pairs.extend(asset_pairs())
    return pairs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Only report drift; do not write. Exit 1 when any file is out of sync.",
    )
    args = parser.parse_args()

    pairs = all_pairs()
    drifted = [
        (source, destination)
        for source, destination in pairs
        if not destination.exists() or not filecmp.cmp(source, destination, shallow=False)
    ]

    if args.check:
        if drifted:
            print(f"Template sync check failed: {len(drifted)} file(s) out of sync")
            for source, destination in drifted:
                print(f"  - {destination.relative_to(TEMPLATES).as_posix()}")
            print("\nRun: python3 three-scope-map/scripts/sync_map_templates.py")
            return 1
        print(f"Template sync check passed: {len(pairs)} files")
        return 0

    for source, destination in drifted:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    print(f"Synced {len(drifted)} file(s) of {len(pairs)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
