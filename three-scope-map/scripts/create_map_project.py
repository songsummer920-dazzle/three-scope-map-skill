#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
# 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""Copy a complete map preset and its legal bundle into a new project directory."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

import package_skill_release as release
from install_skill import SKILL_ROOT, checked_destination, checked_path, paths_overlap, write_file_set


PRESETS = {"fui": "fui-earth-vue", "classic": "songsummer-earth-vue"}
LEGAL_FILES = ("LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md")


def project_files(source: Path, preset: str) -> dict[str, bytes]:
    if preset not in PRESETS:
        raise ValueError(f"Unknown preset: {preset}; choose fui or classic")
    template = checked_path(source / "assets/templates" / PRESETS[preset])
    if not template.is_dir():
        raise ValueError(f"Preset template is missing: {template}")
    files = release.snapshot(template)
    try:
        package = json.loads(files["package.json"])
        scripts = package["scripts"]
        if not all(isinstance(scripts.get(name), str) and scripts[name].strip() for name in ("dev", "build")):
            raise ValueError("Template package.json requires dev and build scripts")
    except (KeyError, TypeError, json.JSONDecodeError) as error:
        raise ValueError("Template requires a valid package.json with dev and build scripts") from error
    if "index.html" not in files or not any(name.startswith("src/") for name in files):
        raise ValueError("Template requires index.html and its complete src directory")

    # Prefer the template's tailored notices; fill missing legal material from
    # the skill root. The union retains any additional template-specific grants.
    for name in LEGAL_FILES:
        if name not in files:
            fallback = checked_path(source / name)
            if not fallback.is_file():
                raise ValueError(f"Missing legal bundle entry: {name}")
            files[name] = fallback.read_bytes()
    root_licenses = checked_path(source / "LICENSES")
    if root_licenses.is_dir():
        for name, data in release.snapshot(root_licenses).items():
            files.setdefault(f"LICENSES/{name}", data)
    if not any(name.startswith("LICENSES/") for name in files):
        raise ValueError("Missing legal bundle directory: LICENSES")
    return files


def create_project(source: Path | str, target: Path | str, preset: str = "fui") -> dict:
    source = checked_path(source)
    target = checked_destination(target)
    if paths_overlap(source, target):
        raise ValueError("Source and project destination must not overlap")
    if target.exists() and any(target.iterdir()):
        raise ValueError(f"Project destination must be new or empty: {target}")
    files = project_files(source, preset)
    target.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=f".{target.name}-stage-", dir=target.parent))
    try:
        write_file_set(stage, files)
        checked_destination(target)
        if target.exists() and any(target.iterdir()):
            raise ValueError(f"Project destination became nonempty: {target}")
        os.replace(stage, target)
    finally:
        if stage.exists():
            shutil.rmtree(stage)
    return {"target": str(target), "preset": preset, "template": PRESETS[preset], "files": len(files)}


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Examples:\n  python3 scripts/create_map_project.py /path/to/my-map\n"
               "  python3 scripts/create_map_project.py /path/to/my-classic-map --preset classic\n"
               "Copies files only; dependency installation and project styling remain your next steps.")
    parser.add_argument("target", type=Path, help="New or empty project directory")
    parser.add_argument("--preset", choices=tuple(PRESETS), default="fui", help="Complete map style (default: fui)")
    parser.add_argument("--source", type=Path, default=SKILL_ROOT, help="Portable skill source (default: this skill)")
    args = parser.parse_args()
    try:
        print(json.dumps(create_project(args.source, args.target, args.preset), ensure_ascii=False, indent=2))
    except (OSError, ValueError) as error:
        print(f"Project creation failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
