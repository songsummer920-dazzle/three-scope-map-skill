#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
# 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""Copy a complete map preset and its legal bundle into a new project directory."""

from __future__ import annotations

import argparse
import hashlib
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
SOURCE_ATTRIBUTION = '// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1\n// Copyright (c) 2026 宋夏天Dazzle\n// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天\n// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill\n'


def project_files(source: Path, preset: str, framework: str = "vue") -> dict[str, bytes]:
    if preset not in PRESETS:
        raise ValueError(f"Unknown preset: {preset}; choose fui or classic")
    template = checked_path(source / "assets/templates" / PRESETS[preset])
    if not template.is_dir():
        raise ValueError(f"Preset template is missing: {template}")
    files = release.snapshot(template)
    if framework not in ("vue", "react"):
        raise ValueError(f"Unknown framework: {framework}; choose vue or react")
    if framework == "react":
        files = react_project_files(source, files, preset)
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


def react_project_files(source: Path, files: dict[str, bytes], preset: str) -> dict[str, bytes]:
    """Combine shared geographic/renderer assets with maintained native TSX hosts."""
    overlay = checked_path(source / "assets/react" / preset)
    if not overlay.is_dir():
        raise ValueError(f"React source is missing: {overlay}")
    baselines = json.loads((source / "assets/react/source-baselines.json").read_text())[preset]
    for name, expected in baselines.items():
        if name not in files or hashlib.sha256(files[name]).hexdigest() != expected:
            raise ValueError(f"React source is stale for {preset}/{name}; run sync_react_templates.mjs before generation")
    excluded = ("qa/", "tests/", "scripts/run-regression", "scripts/run-overlay-regression", "vite.regression", "vite.classic-regression", "tsconfig.classic-regression")
    files = {name: data for name, data in files.items()
             if not name.endswith(".vue") and name not in ("src/main.ts", "package-lock.json", "src/vite-env.d.ts", "classic-regression.html")
             and not name.startswith(excluded)}
    files.update(release.snapshot(overlay))
    files["src/components/map/mapRuntime.tsx"] = (source / "assets/react/mapRuntime.tsx").read_bytes()
    resource = "src/components/map/fuiEarthResources.ts"
    if resource in files:
        files[resource] = files[resource].replace(b"from 'vue'", b"from './mapRuntime'")
    files["index.html"] = files["index.html"].replace(b"/src/main.ts", b"/src/main.tsx")
    package = json.loads(files["package.json"])
    package["name"] += "-react"
    package["dependencies"] = {name: version for name, version in package["dependencies"].items()
                               if name not in ("vue", "@lucide/vue")}
    package["dependencies"].update({"react": "^19.3.1", "react-dom": "^19.3.1"})
    if preset == "fui":
        package["dependencies"]["lucide-react"] = "^1.31.0"
    package["devDependencies"] = {name: version for name, version in package["devDependencies"].items()
                                  if name not in ("@vitejs/plugin-vue", "vue-tsc")}
    package["devDependencies"].update({"@types/react": "^19.2.17", "@types/react-dom": "^19.2.3"})
    package["scripts"].pop("test", None)
    package["scripts"].pop("build:regression", None)
    package["scripts"]["build"] = "tsc --noEmit && vite build"
    files["package.json"] = (json.dumps(package, ensure_ascii=False, indent=2) + "\n").encode()
    config = json.loads(files["tsconfig.json"])
    config["compilerOptions"]["jsx"] = "react-jsx"
    config["include"] = ["src/**/*.ts", "src/**/*.tsx"]
    files["tsconfig.json"] = (json.dumps(config, indent=2) + "\n").encode()
    files["vite.config.ts"] = (SOURCE_ATTRIBUTION + "import { defineConfig } from 'vite';\nexport default defineConfig({\n"
        "  optimizeDeps: { exclude: ['maplibre-gl'] },\n"
        "  server: { proxy: { '/openfreemap': { target: 'https://tiles.openfreemap.org', changeOrigin: true, rewrite: path => path.replace(/^\\/openfreemap/, '') } } },\n"
        "  build: { rollupOptions: { output: { manualChunks(id) { if (id.includes('/node_modules/three/')) return 'vendor-three'; if (id.includes('/node_modules/react')) return 'vendor-react'; } } } },\n"
        "});\n").encode()
    files["src/main.tsx"] = (SOURCE_ATTRIBUTION +
        "import React from 'react';\nimport { createRoot } from 'react-dom/client';\n"
        "import App from './App';\nimport './style.css';\n"
        "const config=window.__SUMMER_MAP_2D_CONFIG__;\n"
        "window.__SUMMER_MAP_2D_CONFIG__={...config,controls:{top:'24px',right:'24px',bottom:'24px',...config?.controls}};\n"
        "createRoot(document.getElementById('app')!).render(<React.StrictMode><App /></React.StrictMode>);\n").encode()
    baker = "scripts/fui-earth-cache.mjs"
    if baker in files:
        text = files[baker].decode().replace("'src/components/map/EarthView.vue'", "'src/components/map/EarthView.tsx'")
        text = text.replace("source=vue.match(/<script setup lang=\"ts\">([\\s\\S]*?)<\\/script>/)[1]", "source=vue")
        text = text.replace("const names=", "const setup=ast.statements.find(node=>ts.isExportAssignment(node)).expression.arguments[1];\nconst statements=setup.body.statements;\nconst names=")
        text = text.replace("ast.statements.find(node=>ts.isFunctionDeclaration", "statements.find(node=>ts.isFunctionDeclaration")
        text = text.replace("const bounds=ast.statements.find", "const bounds=statements.find")
        files[baker] = text.encode()
    for name in ("scripts/test-map-theme.mjs", "scripts/test-theme.mjs"):
        if name in files:
            files[name] = files[name].replace(b"EarthView.vue", b"EarthView.tsx")
    for name in ("README.md", "DESIGN.md"):
        if name in files:
            files[name] = files[name].replace(b".vue", b".tsx").replace(b"Vue 3", b"React").replace(b"Vue", b"React")
    dependencies = ("react-MIT.txt", "react-dom-MIT.txt", "scheduler-MIT.txt") + (("lucide-react-ISC.txt",) if preset == "fui" else ())
    for name in dependencies:
        files[f"LICENSES/third-party/{name}"] = (source / "assets/react/licenses" / name).read_bytes()
    files["THIRD_PARTY_NOTICES.md"] += ("\n## Native React host dependencies\n\n"
        "React, React DOM and Scheduler: MIT, Meta Platforms, Inc. and affiliates. "
        "Source: https://github.com/facebook/react.\n\n"
        + ("Lucide React: ISC and its retained Feather-derived MIT notices. Source: https://github.com/lucide-icons/lucide.\n\n" if preset == "fui" else "")
        + "Full additional notices are preserved in `LICENSES/third-party/`.\n").encode()
    # Generated source is native React; no Vue SFC, compiler or runtime leaks.
    for name, data in files.items():
        if name.startswith("src/") and name.endswith((".ts", ".tsx")):
            if b"from 'vue'" in data or b'from "vue"' in data or b".vue'" in data:
                raise ValueError(f"Vue dependency leaked into React project: {name}")
    return files


def create_project(source: Path | str, target: Path | str, preset: str = "fui", framework: str = "vue") -> dict:
    source = checked_path(source)
    target = checked_destination(target)
    if paths_overlap(source, target):
        raise ValueError("Source and project destination must not overlap")
    if target.exists() and any(target.iterdir()):
        raise ValueError(f"Project destination must be new or empty: {target}")
    files = project_files(source, preset, framework)
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
    return {"target": str(target), "preset": preset, "framework": framework, "template": PRESETS[preset], "files": len(files)}


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Examples:\n  python3 scripts/create_map_project.py /path/to/my-map\n"
               "  python3 scripts/create_map_project.py /path/to/my-classic-map --preset classic\n"
               "Copies files only; dependency installation and project styling remain your next steps.")
    parser.add_argument("target", type=Path, help="New or empty project directory")
    parser.add_argument("--preset", choices=tuple(PRESETS), default="fui", help="Complete map style (default: fui)")
    parser.add_argument("--framework", choices=("vue", "react"), default="vue", help="Target framework; Vue remains the backward-compatible default")
    parser.add_argument("--source", type=Path, default=SKILL_ROOT, help="Portable skill source (default: this skill)")
    args = parser.parse_args()
    try:
        print(json.dumps(create_project(args.source, args.target, args.preset, args.framework), ensure_ascii=False, indent=2))
    except (OSError, ValueError) as error:
        print(f"Project creation failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
