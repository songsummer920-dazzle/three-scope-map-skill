#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (c) 2026 宋夏天Dazzle
"""Project readiness checks for the three-scope-map skill.

作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Iterable


REQUIRED_ASSETS = (
    "src/assets/maps",
    "src/assets/textures/map",
    "src/assets/figma/map-label-bg.svg",
)

THREE_EFFECT_PATTERNS = {
    "WebGLRenderer": r"new\s+THREE\.WebGLRenderer",
    "extrusionDepth": r"ExtrudeGeometry|extrudeSettings|depth:|createSideGradientMaterial|createPolygonSideWalls|side-wall|sideWall|thickness",
    "outerContour": r"outerContour|outer.*contour|provinceOuter",
    "chaseLight": r"chaseLight|flowLight|追光",
    "flyLines": r"flyLine|flyLines|飞线",
    "hoverLift": r"hover|lift|凸起",
    "cameraControls": r"OrbitControls|cameraView|保存本层|恢复本层",
}


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def list_source_files(root: Path) -> list[Path]:
    if not (root / "src").exists():
        return []
    suffixes = {".vue", ".ts", ".tsx", ".js", ".jsx", ".css", ".scss"}
    return [
        path
        for path in (root / "src").rglob("*")
        if path.is_file() and path.suffix in suffixes
    ]


def find_any(root: Path, patterns: Iterable[str]) -> list[Path]:
    matches: list[Path] = []
    for pattern in patterns:
        matches.extend(root.glob(pattern))
    return sorted(set(matches))


def file_contains(files: Iterable[Path], pattern: str) -> bool:
    regex = re.compile(pattern, re.IGNORECASE)
    for path in files:
        try:
            if regex.search(path.read_text(encoding="utf-8", errors="ignore")):
                return True
        except Exception:
            continue
    return False


def package_status(root: Path) -> tuple[list[str], list[str]]:
    package_path = root / "package.json"
    if not package_path.exists():
        return ["package.json missing"], []

    package = read_json(package_path)
    deps = {}
    deps.update(package.get("dependencies", {}))
    deps.update(package.get("devDependencies", {}))

    missing = [name for name in ("vue", "vite", "three") if name not in deps]
    present = [name for name in ("vue", "vite", "three", "@types/three") if name in deps]
    return [f"{name} dependency missing" for name in missing], present


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check whether a target project is ready to render the one-to-one Three.js map."
    )
    parser.add_argument(
        "project",
        nargs="?",
        default=".",
        help="Target project directory, default: current directory.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit with code 1 when blocking problems are found.",
    )
    args = parser.parse_args()

    root = Path(args.project).expanduser().resolve()
    source_files = list_source_files(root)
    problems: list[str] = []
    warnings: list[str] = []
    passes: list[str] = []

    if not root.exists():
        problems.append(f"Project directory does not exist: {root}")
    elif not root.is_dir():
        problems.append(f"Project path is not a directory: {root}")

    dependency_problems, present_deps = package_status(root)
    problems.extend(dependency_problems)
    if present_deps:
        passes.append(f"Dependencies present: {', '.join(present_deps)}")

    vite_files = find_any(root, ["vite.config.*"])
    if vite_files:
        passes.append("Vite config found")
    else:
        warnings.append("No vite.config.* found; initialize or adapt the app before visual QA.")

    map_components = find_any(
        root,
        [
            "src/components/map/*ThreeMap.vue",
            "src/components/map/ZhejiangThreeMap.vue",
            "src/**/ZhejiangThreeMap.vue",
        ],
    )
    if map_components:
        passes.append("Three map component found")
    else:
        problems.append("Three map component missing; copy assets/templates/smart-mine-vue/src first.")

    for asset in REQUIRED_ASSETS:
        if (root / asset).exists():
            passes.append(f"Asset path found: {asset}")
        else:
            warnings.append(f"Asset path missing or moved: {asset}")

    if source_files:
        for label, pattern in THREE_EFFECT_PATTERNS.items():
            if file_contains(source_files, pattern):
                passes.append(f"Effect check passed: {label}")
            else:
                problems.append(f"Effect check missing: {label}")

        fixed_host_pattern = r"\.map-host[\s\S]{0,400}(width\s*:\s*1920px|height\s*:\s*1080px|min-width\s*:\s*1920px|min-height\s*:\s*1080px)"
        if file_contains(source_files, fixed_host_pattern):
            problems.append(".map-host appears fixed to 1920x1080; it must fill its parent container.")
        else:
            passes.append(".map-host fixed-size check passed")

        if file_contains(source_files, r"setupSvgFallback|map-svg-fallback|<svg[\s>][\s\S]{0,600}(geo|map|boundary)"):
            problems.append("SVG/image fallback map detected; one-to-one delivery must render real Three.js.")
        else:
            passes.append("No SVG fallback map detected")

        if file_contains(source_files, r"createMapTextureMesh|const\s+textureMap\s*=\s*createMapTextureMesh"):
            problems.append(
                "Full-map transparent texture plane detected; terrain texture must stay on real ShapeGeometry regions."
            )
        else:
            passes.append("No full-map transparent texture plane detected")

        if file_contains(source_files, r"provinceChaseLine\s*=\s*new\s+THREE\.Mesh|attribute\s+float\s+alpha"):
            problems.append(
                "Chase light ribbon mesh detected; use short Line segments instead of transparent triangle strips."
            )
        else:
            passes.append("No chase-light ribbon mesh detected")
    else:
        problems.append("No source files found under src/.")

    print(f"three-scope-map project check: {root}")
    print("\nPASS")
    for item in passes:
        print(f"  - {item}")
    print("\nWARN")
    for item in warnings or ["None"]:
        print(f"  - {item}")
    print("\nBLOCKERS")
    for item in problems or ["None"]:
        print(f"  - {item}")

    if problems and args.strict:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
