#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
# Copyright (c) 2026 宋夏天Dazzle
"""Static readiness checks for a standalone or hybrid MapLibre 2D map.

作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""


def contains(path: Path, pattern: str) -> bool:
    return bool(re.search(pattern, read_text(path), re.IGNORECASE | re.DOTALL))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check a Vue or React project for the reusable MapLibre provider/theme/diagnostics contract.",
    )
    parser.add_argument("project", nargs="?", default=".", help="Target project directory.")
    parser.add_argument("--strict", action="store_true", help="Exit with code 1 on blockers.")
    args = parser.parse_args()

    root = Path(args.project).expanduser().resolve()
    map_root = root / "src/components/map"
    files = {
        "component": map_root / "VectorMap.vue",
        "config": map_root / "vectorMapConfig.ts",
        "provider": map_root / "vectorMapProvider.ts",
        "theme": map_root / "vectorMapTheme.ts",
        "diagnostics": map_root / "vectorMapDiagnostics.ts",
        "worker": map_root / "maplibreWorker.ts",
        "navigation": map_root / "mapNavigation.ts",
    }
    if not files["component"].exists():
        files["component"] = files["component"].with_suffix(".tsx")
    passes: list[str] = []
    blockers: list[str] = []

    if not root.is_dir():
        blockers.append(f"Project directory does not exist: {root}")

    package_path = root / "package.json"
    try:
        package = json.loads(package_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        package = {}
    dependencies = {**package.get("dependencies", {}), **package.get("devDependencies", {})}
    framework = ("react", "react-dom") if "react" in dependencies else ("vue",)
    missing_dependencies = [name for name in (*framework, "vite", "maplibre-gl", "pmtiles") if name not in dependencies]
    if missing_dependencies:
        blockers.append(f"Dependencies missing: {', '.join(missing_dependencies)}")
    else:
        passes.append(f"{'/'.join(framework)}, Vite, MapLibre, and PMTiles dependencies found")

    for label, path in files.items():
        if path.exists():
            passes.append(f"2D contract file found: {path.relative_to(root)}")
        else:
            blockers.append(f"2D contract file missing: {label}")

    checks = (
        (files["config"], (r"VectorMapProviderConfig", r"style-url", r"raster", r"vector-tiles", r"pmtiles"), "Replaceable provider source types"),
        (files["config"], (r"WGS84\s*['\"]\s*\|\s*['\"]GCJ02\s*['\"]\s*\|\s*['\"]BD09",), "Provider coordinate systems"),
        (files["provider"], (r"projectGeoDataForProvider", r"createProviderRequestTransform", r"hydrateVectorStyle"), "Provider-boundary projection and request handling"),
        (files["theme"], (r"classifyVectorMapLayer", r"compileVectorMapTheme", r"roadCasingScale"), "Semantic layer theme compiler"),
        (files["diagnostics"], (r"__SUMMER_MAP_2D_DIAGNOSTICS__", r"basemapSourceLoaded"), "Browser runtime diagnostics contract"),
        (files["component"], (r"dragRotate:\s*true", r"touchPitch:\s*true", r"bearingSnap:\s*0"), "Native rotation and pitch interaction"),
        (files["component"], (r"--vector-map-control-top", r"--vector-map-control-right", r"--vector-map-control-bottom"), "Responsive control inset variables"),
        (files["worker"], (r"maplibre-gl-worker\.mjs", r"MapLibreWorker"), "Complete MapLibre worker entry"),
    )
    for path, patterns, label in checks:
        if all(contains(path, pattern) for pattern in patterns):
            passes.append(f"Contract check passed: {label}")
        else:
            blockers.append(f"Contract check missing: {label}")

    source_text = "\n".join(
        read_text(path)
        for path in (root / "src").rglob("*")
        if path.is_file() and path.suffix in {".vue", ".ts", ".tsx", ".js", ".jsx", ".css"}
    ) if (root / "src").exists() else ""
    for label, pattern in {
        "absolute local path": r"/(Users|home)/[^/\s]+/|/var/folders/",
        "local preview URL": r"localhost:\d+|127\.0\.0\.1:\d+",
        "chat temporary path": r"wxid_|xwechat_files|WeChat|com\.tencent\.(xinWeChat|qq)",
    }.items():
        if re.search(pattern, source_text, re.IGNORECASE):
            blockers.append(f"Private or non-reusable content detected: {label}")
        else:
            passes.append(f"Privacy check passed: {label}")

    print(f"2D vector map project check: {root}")
    print("\nPASS")
    for item in passes or ["None"]:
        print(f"  - {item}")
    print("\nBLOCKERS")
    for item in blockers or ["None"]:
        print(f"  - {item}")
    return 1 if blockers and args.strict else 0


if __name__ == "__main__":
    raise SystemExit(main())
