#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
# 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""Install the reviewed portable skill, preserving a complete external backup on upgrade."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sys
import tempfile
import uuid

import package_skill_release as release


SKILL_NAME = "three-scope-map"
SKILL_ROOT = Path(__file__).absolute().parents[1]
DEFAULT_TARGET = Path.home() / ".codex/skills" / SKILL_NAME
DEFAULT_BACKUPS = Path.home() / ".codex/skill-backups"


def checked_path(value: Path | str) -> Path:
    """Use an absolute lexical path, refusing symlinks instead of resolving them."""
    path = Path(os.path.abspath(os.path.expanduser(str(value))))
    for part in (path, *path.parents):
        if part.is_symlink():
            raise ValueError(f"Symlink paths are not allowed: {part}")
    return path


def paths_overlap(first: Path, second: Path) -> bool:
    return first.is_relative_to(second) or second.is_relative_to(first)


def checked_destination(value: Path | str) -> Path:
    path = checked_path(value)
    if path == path.parent or path == Path.home().absolute():
        raise ValueError(f"Refusing an unsafe destination: {path}")
    if path.exists() and not path.is_dir():
        raise ValueError(f"Destination must be a directory: {path}")
    return path


def is_this_skill(path: Path) -> bool:
    skill = path / "SKILL.md"
    if skill.is_symlink() or not skill.is_file():
        return False
    text = skill.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return False
    frontmatter = text.split("\n---", 1)[0]
    return re.search(r"(?m)^name:\s*['\"]?three-scope-map['\"]?\s*$", frontmatter) is not None


def load_distribution(source: Path) -> dict[str, bytes]:
    """Validate public release metadata and obtain exactly its distributable files."""
    if not source.is_dir() or not is_this_skill(source):
        raise ValueError(f"Source is not a {SKILL_NAME} skill: {source}")
    files = release.snapshot(source)
    return release.install_distribution(files)


def write_file_set(destination: Path, files: dict[str, bytes]) -> None:
    """Write a new private staging directory; never merge into a user directory."""
    for name, data in sorted(files.items()):
        relative = PurePosixPath(name)
        if (not name or relative.is_absolute() or ".." in relative.parts
                or relative.as_posix() != name or "\\" in name):
            raise ValueError(f"Unsafe distribution path: {name}")
        output = destination.joinpath(*relative.parts)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(data)


def backup_installation(target: Path, backup_root: Path) -> Path:
    """Copy every old entry, preserving internal links without following them."""
    backup_root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = backup_root / f"{SKILL_NAME}-{stamp}-{uuid.uuid4().hex[:8]}"
    pending = backup_root / f".{backup.name}.partial"
    try:
        shutil.copytree(target, pending, symlinks=True)
        os.replace(pending, backup)
    except BaseException:
        if pending.exists():
            shutil.rmtree(pending)
        raise
    return backup


def install_skill(source: Path | str, target: Path | str,
                  backup_dir: Path | str = DEFAULT_BACKUPS) -> dict:
    """Stage a verified release, then replace the old directory with rollback."""
    source = checked_path(source)
    target = checked_destination(target)
    backup_root = checked_path(backup_dir)
    if target.name == "skills" or target == checked_path(DEFAULT_TARGET.parent):
        raise ValueError(f"Refusing to replace the skills installation root: {target}")
    for first, second in ((source, target), (source, backup_root), (target, backup_root)):
        if paths_overlap(first, second):
            raise ValueError(f"Source, target and backup paths must not overlap: {first}; {second}")
    installation_root = next((parent for parent in target.parents if parent.name == "skills"), target.parent)
    if backup_root.is_relative_to(installation_root):
        raise ValueError(f"Backup directory must be outside the skills installation root: {installation_root}")
    if backup_root.exists() and not backup_root.is_dir():
        raise ValueError(f"Backup directory is not a directory: {backup_root}")
    if target.exists() and any(target.iterdir()) and not is_this_skill(target):
        raise ValueError(f"Refusing to replace an unrelated nonempty directory: {target}")

    # Source errors must be discovered before creating a backup or touching target.
    files = load_distribution(source)
    backup = backup_installation(target, backup_root) if target.exists() else None
    target.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=f".{target.name}-stage-", dir=target.parent))
    previous = None
    retained_previous = None
    try:
        write_file_set(stage, files)
        checked_destination(target)
        if target.exists():
            if any(target.iterdir()) and not is_this_skill(target):
                raise ValueError(f"Destination changed to an unrelated directory: {target}")
            previous = Path(tempfile.mkdtemp(prefix=f".{target.name}-previous-", dir=target.parent))
            previous.rmdir()
            os.replace(target, previous)
        try:
            os.replace(stage, target)
        except BaseException:
            if previous is not None:
                os.replace(previous, target)
                previous = None
            raise
        if previous is not None:
            try:
                shutil.rmtree(previous)
                previous = None
            except OSError:
                # Installation succeeded; report the extra recoverable copy.
                retained_previous = str(previous)
    finally:
        if stage.exists():
            shutil.rmtree(stage)
    result = {"target": str(target), "backup": str(backup) if backup else None,
              "files": len(files), "version": json.loads(files["release.json"])["version"]}
    if retained_previous:
        result["retainedPrevious"] = retained_previous
    return result


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Examples:\n  python3 scripts/install_skill.py\n"
               "  python3 scripts/install_skill.py --target /path/to/skills/three-scope-map "
               "--backup-dir /path/to/skill-backups\n"
               "Upgrades replace the complete directory. User changes remain in the external backup.")
    parser.add_argument("--source", type=Path, default=SKILL_ROOT, help="Portable skill source (default: this skill)")
    parser.add_argument("--target", type=Path, default=DEFAULT_TARGET, help=f"Installation directory (default: {DEFAULT_TARGET})")
    parser.add_argument("--backup-dir", type=Path, default=DEFAULT_BACKUPS,
                        help=f"External parent for unique upgrade backups (default: {DEFAULT_BACKUPS})")
    args = parser.parse_args()
    try:
        print(json.dumps(install_skill(args.source, args.target, args.backup_dir), ensure_ascii=False, indent=2))
    except (OSError, ValueError) as error:
        print(f"Installation failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
