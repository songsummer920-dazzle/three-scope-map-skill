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
)

REQUIRED_EARTH_FILES = (
    "src/components/map/core/earthViewCore.ts",
    "src/components/map/core/earthChinaMapCore.ts",
    "src/components/map/core/scopeMapCore.ts",
    "src/components/map/mapTheme.ts",
    "src/assets/maps/china.json",
    "src/assets/maps/world.json",
    "src/assets/maps/world.earth-render.json",
    "src/assets/textures/map/china/china-height-legacy.png",
    "src/assets/textures/map/china/china-normal-legacy.png",
    "src/assets/textures/map/world/earth-day.jpg",
    "src/assets/textures/map/world/earth-lights.png",
    "src/assets/textures/map/world/earth-normal.jpg",
    "src/assets/textures/map/world/earth-specular.jpg",
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

EARTH_EFFECT_PATTERNS = {
    "Earth SphereGeometry": r"new\s+THREE\.SphereGeometry",
    "Earth postprocessing": r"EffectComposer|UnrealBloomPass",
    "Earth terrain tessellation": r"TessellateModifier",
    "Earth China extrusion": r"chinaWallVertexShader|chinaExtrusionGroup",
    "Earth atmosphere": r"outerAtmosphere|atmosphereVertexShader|atmospheric",
    "Earth grid scan": r"gridDotSweep|uSweep|scan",
    "Earth international fly lines": r"flyTrackMaterials|createFlyLines|createInternationalFlyLines",
    "Earth batched world outlines": r"function\s+createWorldOutlines[\s\S]*new\s+THREE\.LineSegments",
    "Earth spherical JD dashed line": r"createChinaJdDashedLines[\s\S]*LineDashedMaterial",
    "Earth handoff events": r"onIntroReady[\s\S]*onHandoffStart[\s\S]*onEnterChina",
}

PRIVATE_OR_DASHBOARD_PATTERNS = {
    "absolute local path": r"/(Users|home)/[^/\s]+/|/var/folders/",
    "local preview URL": r"localhost:\d+|127\.0\.0\.1:\d+",
    "chat temporary path": r"wxid_|xwechat_files|WeChat|com\.tencent\.(xinWeChat|qq)",
    "dashboard business copy": r"矿山产能实时监控|环境监测数据看板|设备运行状态分析|人员安全管理|生产调度指挥中心",
}

APPROVED_CHASE_RIBBON_PATTERNS = (
    r"const\s+provinceChaseSegmentLength\s*=\s*1\.35",
    r"const\s+provinceChaseRibbonWidth\s*=\s*2\.02",
    r"function\s+createProvinceSilhouetteLoop",
    r"function\s+smoothClosedPath",
    r"const\s+divisions\s*=\s*Math\.max\(1,\s*Math\.ceil\(length\s*/\s*provinceChaseSegmentLength\)\)",
    r"indices\.push\(offset,\s*offset\s*\+\s*1,\s*offset\s*\+\s*2,\s*offset\s*\+\s*2,\s*offset\s*\+\s*1,\s*offset\s*\+\s*3\)",
    r"blending:\s*THREE\.AdditiveBlending",
    r"depthTest:\s*false",
    r"depthWrite:\s*false",
    r"attribute\s+float\s+alpha",
    r"Math\.pow\(headRatio,\s*1\.65\)",
)


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
            "src/components/map/core/scopeMapCore.ts",
            "src/components/map/ChinaMap.vue",
            "src/components/map/ChinaMap.tsx",
        ],
    )
    if map_components:
        passes.append("Three map component found")
    else:
        problems.append("Three map component missing; copy assets/templates/smart-mine-vue/src first.")

    for relative_path in REQUIRED_EARTH_FILES:
        path = root / relative_path
        if path.exists():
            passes.append(f"Earth template file found: {relative_path}")
        else:
            problems.append(f"Earth template file missing: {relative_path}")

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

        earth_view = root / "src/components/map/core/earthViewCore.ts"
        earth_sources = [earth_view] if earth_view.exists() else []
        for label, pattern in EARTH_EFFECT_PATTERNS.items():
            if file_contains(earth_sources, pattern):
                passes.append(f"Earth effect check passed: {label}")
            else:
                problems.append(f"Earth effect check missing: {label}")

        theme_path = root / "src/components/map/mapTheme.ts"
        earth_theme_ok = file_contains(earth_sources, r"import\s*\{\s*MAP_THEME_PRIMARY\s*\}\s*from\s*['\"]\.\.?/mapTheme['\"]")
        map_theme_ok = file_contains(map_components, r"import\s*\{[^}]*mapTheme[^}]*\}\s*from\s*['\"]\.\.?/mapTheme['\"]")
        primary_ok = file_contains([theme_path] if theme_path.exists() else [], r"export\s+const\s+MAP_THEME_PRIMARY\s*=")
        if earth_theme_ok and map_theme_ok and primary_ok:
            passes.append("Shared one-color Earth/3D map theme entry found")
        else:
            problems.append("Earth and 3D map are not both connected to mapTheme.ts/MAP_THEME_PRIMARY.")

        earth_china_map = root / "src/components/map/core/earthChinaMapCore.ts"
        earth_china_sources = [earth_china_map] if earth_china_map.exists() else []
        isolated_preload_ok = (
            file_contains(earth_sources, r"onSceneReady")
            and file_contains(earth_sources, r"startIntro")
            and file_contains(earth_china_sources, r"setStartIntro\(")
            and file_contains(earth_china_sources, r"prepareChinaMap[\s\S]*chinaMounted\s*=\s*true")
            and file_contains(earth_china_sources, r"await\s+import\(['\"]\./scopeMapCore['\"]\)")
            and file_contains(earth_sources, r"world\.earth-render\.json")
            and not file_contains(earth_sources, r"from\s*['\"][^'\"]*/world\.json['\"]")
            and file_contains(map_components, r"waitForPreloadSlice[\s\S]*compileAsync[\s\S]*initTexture")
        )
        static_handoff_ok = (
            file_contains(map_components, r"settleMapForStaticFrame")
            and file_contains(map_components, r"startMapAnimation[\s\S]*stopMapAnimation")
            and file_contains(earth_china_sources, r"createScopeMap\([\s\S]*active:\s*false")
        )
        if static_handoff_ok:
            passes.append("Earth handoff uses a static precompiled destination frame before map animation")
        else:
            problems.append(
                "Earth handoff must reveal a static precompiled destination frame and keep map animation inactive until enter-china."
            )
        if isolated_preload_ok:
            passes.append("Earth visible intro is isolated from destination preload")
        else:
            problems.append(
                "Earth visible intro must start only after the inactive destination static frame is ready."
            )

        south_sea_svg_ok = file_contains(
            map_components,
            r"southSeaInsetMinWidth\s*=\s*62[\s\S]*southSeaInsetMaxWidth\s*=\s*92[\s\S]*updateSouthSeaInsetSize",
        )
        if south_sea_svg_ok:
            passes.append("South China Sea SVG camera-distance clamp found: 62-92px")
        else:
            problems.append("South China Sea SVG must follow camera distance and remain clamped to 62-92px.")

        if file_contains(source_files, r"EarthViewLegacy|earthVersion"):
            problems.append("Legacy/query-switch Earth fork detected; the bundled exact EarthView must be the only default entrance.")
        else:
            passes.append("Single authoritative Earth entrance check passed")

        for label, pattern in PRIVATE_OR_DASHBOARD_PATTERNS.items():
            if file_contains(source_files, pattern):
                problems.append(f"Private/full-dashboard content detected: {label}")
            else:
                passes.append(f"Privacy/scope check passed: {label}")

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

        ribbon_detected = file_contains(
            map_components,
            r"provinceChaseLine\s*=\s*new\s+THREE\.Mesh|attribute\s+float\s+alpha",
        )
        approved_ribbon = ribbon_detected and all(
            file_contains(map_components, pattern)
            for pattern in APPROVED_CHASE_RIBBON_PATTERNS
        )
        if approved_ribbon:
            passes.append("Approved one-to-one segmented chase-light ribbon detected")
        elif ribbon_detected:
            problems.append(
                "Unapproved chase-light ribbon detected; copy the bundled narrow segmented-ribbon implementation "
                "exactly or use short THREE.Line segments as the safe fallback."
            )
        else:
            passes.append("No unapproved chase-light ribbon detected")
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
