#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
# 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""Exercise optional-view validation against isolated real template copies."""
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
CHECKER = ROOT / 'scripts/check_three_map_project.py'


class OptionalViewValidationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='three-scope-checker-')
        self.project = Path(self.temporary.name) / 'project'
        shutil.copytree(ROOT / 'assets/templates/songsummer-earth-vue', self.project,
                        ignore=shutil.ignore_patterns('node_modules', 'dist*', '.git', '__pycache__'))

    def tearDown(self):
        self.temporary.cleanup()

    def run_check(self):
        return subprocess.run([sys.executable, str(CHECKER), str(self.project), '--strict'],
                              capture_output=True, text=True)

    def test_real_3d_integration_does_not_need_an_unrequested_view_picker(self):
        path = self.project / 'src/components/map/ChinaMap.vue'
        source, count = re.subn(r'<div\b[^>]*class="map-view-switch"[^>]*>[\s\S]*?</div>',
                                '', path.read_text(), count=1)
        self.assertEqual(count, 1, 'Real template view-picker fixture changed')
        path.write_text(source)
        result = self.run_check()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_included_vector_renderer_still_requires_its_provider(self):
        (self.project / 'src/components/map/vectorMapProvider.ts').unlink()
        result = self.run_check()
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn('included or referenced 2D renderer requires', result.stdout)


if __name__ == '__main__':
    unittest.main(verbosity=2)
