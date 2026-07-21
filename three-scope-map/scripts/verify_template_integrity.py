#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (c) 2026 宋夏天Dazzle
"""Verify that the bundled one-to-one template has not drifted from its manifest.

作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_ROOT = SKILL_ROOT / "assets/templates/smart-mine-vue"
MANIFEST_PATH = SKILL_ROOT / "assets/template-manifest.json"
IGNORED_NAMES = {"node_modules", "dist", ".DS_Store"}


def template_files() -> list[Path]:
    return sorted(
        path
        for path in TEMPLATE_ROOT.rglob("*")
        if path.is_file() and not any(part in IGNORED_NAMES for part in path.parts)
    )


def digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def current_manifest() -> dict[str, str]:
    return {
        path.relative_to(TEMPLATE_ROOT).as_posix(): digest(path)
        for path in template_files()
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--update",
        action="store_true",
        help="Rewrite the manifest after an intentional maintainer change.",
    )
    args = parser.parse_args()
    current = current_manifest()

    if args.update:
        MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
        MANIFEST_PATH.write_text(
            json.dumps(current, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"Updated {MANIFEST_PATH} with {len(current)} files")
        return 0

    if not MANIFEST_PATH.exists():
        print(f"BLOCKER: manifest missing: {MANIFEST_PATH}")
        return 1

    expected = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    missing = sorted(set(expected) - set(current))
    unexpected = sorted(set(current) - set(expected))
    changed = sorted(path for path in set(expected) & set(current) if expected[path] != current[path])

    if missing or unexpected or changed:
        print("Bundled template integrity check failed")
        for label, paths in (("missing", missing), ("unexpected", unexpected), ("changed", changed)):
            for path in paths:
                print(f"  - {label}: {path}")
        return 1

    print(f"Bundled template integrity check passed: {len(current)} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
