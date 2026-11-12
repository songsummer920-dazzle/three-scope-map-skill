#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
# 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""Verify actual project handoff, framework isolation and stale-source rejection."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import create_map_project as project

ROOT = Path(__file__).resolve().parents[1]


class ReactProjectTests(unittest.TestCase):
    def test_both_style_families_ship_native_react_and_keep_shared_renderer_assets(self):
        for preset, template in project.PRESETS.items():
            with self.subTest(preset=preset):
                files = project.project_files(ROOT, preset, "react")
                package = json.loads(files["package.json"])
                self.assertIn("react", package["dependencies"])
                self.assertIn("react-dom", package["dependencies"])
                self.assertNotIn("vue", package["dependencies"])
                self.assertNotIn("@vitejs/plugin-vue", package["devDependencies"])
                self.assertFalse(any(name.endswith(".vue") for name in files))
                for name in ("EarthView", "EarthChinaMap", "ChinaMap", "VectorMap", "ZhejiangThreeMap"):
                    self.assertIn(f"src/components/map/{name}.tsx", files)
                for name in ("src/components/map/mapTheme.ts", "src/assets/maps/china.json",
                             "src/assets/textures/map/china/china-height-legacy.png"):
                    self.assertEqual(files[name], (ROOT / "assets/templates" / template / name).read_bytes())
                self.assertIn("LICENSE", files)
                self.assertTrue(any(name.startswith("LICENSES/") for name in files))
                self.assertNotIn("classic-regression.html", files)
                self.assertFalse(any(Path(name).name.lower().startswith("contour") or "/maps/contours/" in name for name in files))
                self.assertNotIn(b"ContourMap", files["src/components/map/ChinaMap.tsx"])
                self.assertNotIn(b"EarthView.vue", files.get("scripts/test-map-theme.mjs", b""))

    def test_vue_default_preserves_existing_template(self):
        for preset, template in project.PRESETS.items():
            with self.subTest(preset=preset):
                files = project.project_files(ROOT, preset)
                self.assertEqual(files["src/App.vue"], (ROOT / "assets/templates" / template / "src/App.vue").read_bytes())
                self.assertEqual(files["package.json"], (ROOT / "assets/templates" / template / "package.json").read_bytes())
                self.assertNotIn("src/App.tsx", files)
                self.assertFalse(any(Path(name).name.lower().startswith("contour") or "/maps/contours/" in name for name in files))
                self.assertNotIn(b"ContourMap", files["src/components/map/ChinaMap.vue"])

    def test_renderer_drift_blocks_creation_without_writing_destination(self):
        with tempfile.TemporaryDirectory(dir="/private/tmp" if Path("/private/tmp").is_dir() else None) as directory:
            root = Path(directory)
            skill, target = root / "skill", root / "project"
            template = skill / "assets/templates/fui-earth-vue/src"
            template.mkdir(parents=True)
            (template / "App.vue").write_text("Changed renderer")
            (skill / "assets/react/fui").mkdir(parents=True)
            (skill / "assets/react/source-baselines.json").write_text(json.dumps({"fui": {
                "src/App.vue": hashlib.sha256(b"Validated renderer").hexdigest()}}))
            with self.assertRaisesRegex(ValueError, "React source is stale"):
                project.create_project(skill, target, "fui", "react")
            self.assertFalse(target.exists())

    def test_unknown_framework_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Unknown framework"):
            project.project_files(ROOT, "fui", "other")


if __name__ == "__main__":
    unittest.main(verbosity=2)
