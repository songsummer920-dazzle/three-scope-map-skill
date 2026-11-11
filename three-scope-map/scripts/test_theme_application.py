#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
# 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""Exercise the real shared-theme CLI without changing a bundled template."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile

SCRIPT = Path(__file__).with_name('apply_map_theme.py')

def run(root, color, *extra):
    return subprocess.run([sys.executable, '-B', str(SCRIPT), color, str(root), '--no-backup', *extra], capture_output=True, text=True)

def main():
    with tempfile.TemporaryDirectory(prefix='three-map-theme-') as temporary:
        root=Path(temporary);folder=root/'src/components/map';folder.mkdir(parents=True)
        primary=folder/'mapTheme.ts'
        primary.write_text("export const MAP_THEME_PRIMARY = '#9fc53a';\n")
        assert run(root,'#a7f').returncode==0
        assert "'#AA77FF'" in primary.read_text()
        fui=folder/'fuiEarthTheme.ts'
        fui.write_text("export const FUI_THEME_PRIMARY_OVERRIDE:string|undefined=undefined;\n")
        result=run(root,'#14c98c','--dry-run');assert result.returncode==0,result.stderr
        plan=json.loads(result.stdout);assert len(plan)==2
        before={p:p.read_bytes() for p in [primary,fui]}
        assert 'undefined' in fui.read_text()
        result=run(root,'#14c98c');assert result.returncode==0,result.stderr
        assert "'#14C98C'" in primary.read_text() and "'#14C98C'" in fui.read_text()
        before={p:p.read_bytes() for p in [primary,fui]}
        assert run(root,'not-a-color').returncode!=0
        assert all(p.read_bytes()==data for p,data in before.items())
        fui.write_text('export const oldTheme = true;\n');before=primary.read_bytes()
        assert run(root,'#ffee00').returncode!=0
        assert primary.read_bytes()==before,'A missing FUI entry must not half-apply the primary.'
    print('Shared theme CLI regression checks passed')

if __name__=='__main__':main()
