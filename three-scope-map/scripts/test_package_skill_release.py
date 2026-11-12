#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
# 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""Exercise release packaging against isolated fake skills, never the real tree."""
from pathlib import Path
import hashlib
import base64
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile

import package_skill_release as release


class ReleasePackagingTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='three-scope-release-test-')
        self.work = Path(self.temporary.name)
        self.root = self.work / 'three-scope-map'
        self.output = self.work / 'artifacts'
        self.evidence_root = self.work / 'private-evidence'
        self.version = '3.0.0-rc.1'
        self.templates = {
            'songsummer-earth-vue': {'src/map.ts': b'export const classic = true;\n', 'qa/classic-regression.ts': b'// QA source is publishable\n'},
            'fui-earth-vue': {'src/map.ts': b'export const fui = true;\n', 'tests/performance.test.ts': b'// Regression source is publishable\n'},
        }
        for name, data in {
            'SKILL.md': b'---\nname: fixture\ndescription: Unit fixture only\n---\n',
            'LICENSE': b'Unit fixture license\n', 'NOTICE': b'Unit fixture notice\n',
            'references/v3-api.md': b'# Fixture API\n',
            'references/map-3d-overlay.md': b'# Fixture overlay\n',
            'references/new-reference.md': b'# Intentionally new reviewed source\n',
        }.items():
            self.write(name, data)
        for template, files in self.templates.items():
            for name, data in files.items():
                self.write(f'assets/templates/{template}/{name}', data)
        self.write_manifests()
        self.evidence_path=f'validation/{self.version}/map.png'
        self.report_path=f'validation/{self.version}/browser.json'
        self.write_evidence(self.evidence_path,base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ZkAAAAASUVORK5CYII='))
        self.write_evidence(self.report_path,b'{"status":"passed","cases":[{"status":"passed"}],"errors":[]}\n')
        self.seal_validation()

    def tearDown(self):
        self.temporary.cleanup()

    def write(self, name, data):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def write_evidence(self, name, data):
        path=self.evidence_root/name
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_bytes(data)
        return path

    def write_manifests(self):
        for template, name in [('songsummer-earth-vue', 'template-manifest.json'), ('fui-earth-vue', 'fui-earth-manifest.json')]:
            # Expected fixture entries are explicit, independent of snapshot's
            # filtering logic, so an exclusion regression cannot validate itself.
            manifest = {path: hashlib.sha256(data).hexdigest() for path, data in self.templates[template].items()}
            self.write('assets/' + name, (json.dumps(manifest, sort_keys=True) + '\n').encode())

    def seal_validation(self):
        self.validation={'schemaVersion':2,'status':'passed','version':self.version,
            'source':release.source_fingerprint(release.snapshot(self.root)),
            'checks':{name:{'status':'passed','command':'isolated test fixture',**({'cases':1} if name=='webgl' else {})}
                      for name in ['unit','build','integrity','webgl']},
            'evidence':[{'path':name,'kind':kind,'sha256':hashlib.sha256((self.evidence_root/name).read_bytes()).hexdigest()}
                        for name,kind in [(self.evidence_path,'screenshot'),(self.report_path,'browser-report')]]}

    def package(self, output=None, validation=None, version=None, status=None):
        return release.package(self.root, output or self.output, version or self.version,
                               self.validation if validation is None else validation,status,self.evidence_root)

    def use_stable_version(self):
        screenshot=(self.evidence_root/self.evidence_path).read_bytes()
        report=(self.evidence_root/self.report_path).read_bytes()
        self.version='3.0.0'
        self.evidence_path=f'validation/{self.version}/map.png'
        self.report_path=f'validation/{self.version}/browser.json'
        self.write_evidence(self.evidence_path,screenshot)
        self.write_evidence(self.report_path,report)
        self.seal_validation()

    def test_build_dependency_cache_and_backup_outputs_are_excluded(self):
        excluded = [
            'node_modules/package/index.js', '.git/config', '.DS_Store',
            'dist/index.html', 'dist-classic-qa/assets/qa.js', 'dist-regression/index.html',
            '__pycache__/module.pyc', '.vite/deps/cache.js', 'saved.bak', 'backup.bak/file.txt',
            '.impeccable/design-system.md', 'release.json.codex-release.tmp', '.editor.swp',
            'assets/templates/songsummer-earth-vue/dist-classic-qa/qa.js',
            'assets/templates/fui-earth-vue/node_modules/package/index.js',
            'assets/templates/fui-earth-vue/.vite/deps/cache.js',
        ]
        for name in excluded:
            self.write(name, b'not release source\n')
        result = self.package()
        with zipfile.ZipFile(result['archive']) as archive:
            names = set(archive.namelist())
        for name in excluded:
            self.assertNotIn(self.root.name + '/' + name, names)
        self.assertIn(self.root.name + '/assets/templates/songsummer-earth-vue/qa/classic-regression.ts', names)
        self.assertIn(self.root.name + '/assets/templates/fui-earth-vue/tests/performance.test.ts', names)
        self.assertIn(self.root.name + '/references/new-reference.md', names)
        self.assertEqual(result['templateFiles'], {'classic': 2, 'fui': 2})

    def test_stable_versions_use_release_status_and_prereleases_use_candidate(self):
        candidate=self.package()
        self.assertEqual(candidate['status'],'candidate')
        self.use_stable_version()
        stable=self.package()
        self.assertEqual(stable['status'],'release')
        with zipfile.ZipFile(stable['archive']) as archive:
            self.assertEqual(json.loads(archive.read(self.root.name+'/release.json'))['status'],'release')

    def test_explicit_status_cannot_promote_a_prerelease(self):
        with self.assertRaisesRegex(ValueError,'prerelease version'):
            self.package(status='release')
        self.assertFalse(self.output.exists())
        self.use_stable_version()
        result=self.package(status='candidate')
        self.assertEqual(result['status'],'candidate')
        with self.assertRaisesRegex(ValueError,'Invalid release status'):
            self.package(status='published')

    def test_all_internal_evidence_is_excluded_without_deleting_local_history(self):
        excluded=['validation/2.0.0/record.json','validation/3.0.0-rc.0/old.log',
                  f'validation/{self.version}/unreviewed.png',f'validation/{self.version}/temporary.log']
        for name in excluded:self.write(name,b'kept developer history\n')
        result=self.package()
        with zipfile.ZipFile(result['archive']) as archive:
            names=set(archive.namelist())
        for name in excluded:
            self.assertNotIn(self.root.name+'/'+name,names)
            self.assertEqual((self.root/name).read_bytes(),b'kept developer history\n')
        self.assertFalse(any('/validation/' in name for name in names))
        for entry in self.validation['evidence']:
            self.assertTrue((self.evidence_root/entry['path']).is_file())

    def test_distribution_snapshot_is_exactly_the_public_archive_and_source_binding(self):
        self.write('validation/old/private.log',b'/Users/developer/work/history\n')
        self.write('LICENSES/component-license.txt',b'Included third-party grant\n')
        self.seal_validation()
        expected=release.distribution_snapshot(release.snapshot(self.root),self.version,self.validation,evidence_files=release.load_evidence(self.evidence_root,self.validation))
        result=self.package()
        self.assertEqual(release.source_fingerprint(expected),self.validation['source'])
        with zipfile.ZipFile(result['archive']) as archive:
            actual={name[len(self.root.name)+1:]:archive.read(name) for name in archive.namelist()}
        self.assertEqual(actual,expected)
        self.assertEqual(actual['LICENSES/component-license.txt'],b'Included third-party grant\n')

    def test_private_evidence_with_machine_paths_is_verified_but_never_distributed(self):
        self.use_stable_version()
        private_path='/Users/developer/private/project'
        self.write_evidence(self.report_path,(json.dumps({'status':'passed','errors':[], 'cases':[{'status':'passed'}], 'source':private_path})+'\n').encode())
        self.seal_validation()
        result=self.package()
        with zipfile.ZipFile(result['archive']) as archive:
            self.assertFalse(any('/validation/' in name for name in archive.namelist()))
            self.assertFalse(any(private_path.encode() in archive.read(name) for name in archive.namelist()))
            self.assertNotIn('validation',json.loads(archive.read(self.root.name+'/release.json')))
        self.assertIn(private_path,(self.evidence_root/self.report_path).read_text())

    def test_new_template_source_requires_a_manifest_update_then_is_included(self):
        name = 'src/new-reviewed-feature.ts'
        data = b'export const reviewed = true;\n'
        self.write('assets/templates/fui-earth-vue/' + name, data)
        with self.assertRaisesRegex(ValueError, 'does not match release snapshot'):
            self.package()
        self.assertFalse(self.output.exists())
        self.templates['fui-earth-vue'][name] = data
        self.write_manifests()
        self.seal_validation()
        result = self.package()
        with zipfile.ZipFile(result['archive']) as archive:
            self.assertEqual(archive.read(self.root.name + '/assets/templates/fui-earth-vue/' + name), data)
        self.assertEqual(result['templateFiles']['fui'], 3)

    def test_modified_or_missing_template_bytes_are_rejected_for_both_manifests(self):
        for template in self.templates:
            for modification in ['changed', 'deleted']:
                with self.subTest(template=template, modification=modification):
                    path = self.root / 'assets/templates' / template / 'src/map.ts'
                    original = path.read_bytes()
                    if modification == 'changed':
                        path.write_bytes(original + b'// unreviewed tamper\n')
                    else:
                        path.unlink()
                    try:
                        with self.assertRaisesRegex(ValueError, 'does not match release snapshot'):
                            self.package()
                        self.assertFalse(self.output.exists())
                    finally:
                        path.write_bytes(original)

    def test_forged_manifest_hash_is_rejected(self):
        manifest_path = self.root / 'assets/fui-earth-manifest.json'
        manifest = json.loads(manifest_path.read_text())
        manifest['src/map.ts'] = '0' * 64
        manifest_path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, 'does not match release snapshot'):
            self.package()
        self.assertFalse(self.output.exists())

    def test_zip_is_deterministic_despite_source_mtime_and_output_location(self):
        first = self.package(self.work / 'first')
        first_bytes = Path(first['archive']).read_bytes()
        for path in self.root.rglob('*'):
            if path.is_file():
                os.utime(path, (946684800, 946684800))
        second = self.package(self.work / 'second')
        self.assertEqual(first_bytes, Path(second['archive']).read_bytes())
        self.assertEqual(first['sha256'], second['sha256'])
        with zipfile.ZipFile(second['archive']) as archive:
            self.assertEqual(archive.namelist(), sorted(archive.namelist()))
            self.assertTrue(all(info.date_time == (2020, 1, 1, 0, 0, 0) for info in archive.infolist()))
            self.assertTrue(all(info.external_attr >> 16 == 0o100644 for info in archive.infolist()))

    def test_contents_and_checksum_sidecars_match_every_archived_byte(self):
        result = self.package()
        path = Path(result['archive'])
        contents = json.loads(path.with_suffix('.contents.json').read_text())
        actual_checksum = hashlib.sha256(path.read_bytes()).hexdigest()
        self.assertEqual(result['sha256'], actual_checksum)
        self.assertEqual(contents['sha256'], actual_checksum)
        self.assertEqual(path.with_suffix('.zip.sha256').read_text(), f'{actual_checksum}  {path.name}\n')
        with zipfile.ZipFile(path) as archive:
            self.assertEqual(set(archive.namelist()), {self.root.name + '/' + name for name in contents['files']})
            for name, digest in contents['files'].items():
                self.assertNotIn('..', Path(name).parts)
                self.assertFalse(Path(name).is_absolute())
                self.assertEqual(hashlib.sha256(archive.read(self.root.name + '/' + name)).hexdigest(), digest)
            metadata = json.loads(archive.read(self.root.name + '/release.json'))
            self.assertEqual(metadata['version'], self.version)
            self.assertEqual(metadata['status'], 'candidate')
            self.assertEqual(set(metadata),{'version','status','templateFiles','source'})
            self.assertEqual(metadata['source'],self.validation['source'])
            self.assertNotIn(self.root.name+'/'+self.evidence_path,archive.namelist())
            self.assertFalse(any('/validation/' in name for name in archive.namelist()))

    def test_legacy_passed_record_and_wrong_candidate_are_rejected(self):
        with self.assertRaisesRegex(ValueError,'schema/version'):
            self.package(validation={'status':'passed'})
        wrong={**self.validation,'version':'3.0.0-rc.999'}
        with self.assertRaisesRegex(ValueError,'schema/version'):
            self.package(validation=wrong)
        self.assertFalse(self.output.exists())

    def test_updated_manifest_cannot_reuse_an_old_passed_source_record(self):
        self.templates['fui-earth-vue']['src/map.ts']+=b'// changed after validation\n'
        self.write('assets/templates/fui-earth-vue/src/map.ts',self.templates['fui-earth-vue']['src/map.ts'])
        self.write_manifests()
        with self.assertRaisesRegex(ValueError,'source fingerprint'):
            self.package()
        self.assertFalse(self.output.exists())

    def test_documentation_change_also_invalidates_the_validated_source(self):
        self.write('references/v3-api.md',b'# Different contract after validation\n')
        with self.assertRaisesRegex(ValueError,'source fingerprint'):
            self.package()

    def test_missing_or_changed_external_evidence_blocks_packaging(self):
        for delete in [False,True]:
            original=(self.evidence_root/self.evidence_path).read_bytes()
            if delete:(self.evidence_root/self.evidence_path).unlink()
            else:self.write_evidence(self.evidence_path,b'changed PNG')
            try:
                with self.assertRaisesRegex(ValueError,'Missing or changed validation evidence'):
                    self.package()
                self.assertFalse(self.output.exists())
            finally:self.write_evidence(self.evidence_path,original)

    def test_unsafe_evidence_failed_browser_and_missing_checks_are_rejected(self):
        unsafe={**self.validation,'evidence':[{'path':'../outside.png','kind':'screenshot','sha256':'0'*64}]}
        with self.assertRaisesRegex(ValueError,'Unsafe validation evidence'):
            self.package(validation=unsafe)
        for count in [True,0,-1,'1']:
            invalid_count={**self.validation,'checks':{**self.validation['checks'],'webgl':{'status':'passed','command':'fixture','cases':count}}}
            with self.assertRaisesRegex(ValueError,'actual completed cases'):
                self.package(validation=invalid_count)
        incomplete={**self.validation,'checks':{**self.validation['checks'],'webgl':{'status':'pending','command':'fixture'}}}
        with self.assertRaisesRegex(ValueError,'Missing passed validation check'):
            self.package(validation=incomplete)
        self.write_evidence(self.report_path,b'{"status":"passed","errors":["shader error"]}')
        self.seal_validation()
        with self.assertRaisesRegex(ValueError,'passed, error-free'):
            self.package()

    def test_internal_records_cannot_override_external_review_or_enter_the_archive(self):
        name=f'validation/{self.version}/record.json'
        stale=b'{"status":"failed","stale":true}'
        self.write(name,stale)
        result=self.package()
        self.assertEqual((self.root/name).read_bytes(),stale)
        with zipfile.ZipFile(result['archive']) as archive:
            self.assertNotIn(self.root.name+'/'+name,archive.namelist())

    def test_external_evidence_is_required_and_must_not_be_inside_the_skill(self):
        with self.assertRaisesRegex(ValueError,'external evidence root'):
            release.package(self.root,self.output,self.version,self.validation)
        with self.assertRaisesRegex(ValueError,'outside the skill tree'):
            release.package(self.root,self.output,self.version,self.validation,evidence_root=self.root)
        with self.assertRaisesRegex(ValueError,'External validation evidence'):
            release.distribution_snapshot(release.snapshot(self.root),self.version,self.validation)
        internal=self.write('validation/current.png',b'private screenshot')
        parent_relative=internal.relative_to(self.work).as_posix()
        disguised={**self.validation,'evidence':[{'path':parent_relative,'kind':'screenshot','sha256':hashlib.sha256(internal.read_bytes()).hexdigest()}]}
        with self.assertRaisesRegex(ValueError,'outside the skill tree'):
            release.package(self.root,self.output,self.version,disguised,evidence_root=self.work)
        self.assertFalse(self.output.exists())

    def test_internal_reports_and_screenshots_are_excluded_but_runtime_images_remain(self):
        private=['validation/unexpected.png','screenshots/map.png','logs/debug.json',
                 'release-browser-current.json','browser-current-private.json','browser-classic-entry.json',
                 'browser-smoke.png','capture.har','reports/current.json',
                 'assets/templates/fui-earth-vue/qa/screenshot.png']
        for name in private:self.write(name,b'private debug payload')
        runtime='src/assets/texture.png'
        self.templates['fui-earth-vue'][runtime]=b'valid runtime texture bytes'
        self.write('assets/templates/fui-earth-vue/'+runtime,self.templates['fui-earth-vue'][runtime])
        self.write('assets/readme/preview.gif',b'valid documented preview')
        self.write_manifests();self.seal_validation()
        result=self.package()
        with zipfile.ZipFile(result['archive']) as archive:
            names=set(archive.namelist())
            for name in private:self.assertNotIn(self.root.name+'/'+name,names)
            self.assertIn(self.root.name+'/assets/templates/fui-earth-vue/'+runtime,names)
            self.assertIn(self.root.name+'/assets/readme/preview.gif',names)

    def test_failed_or_incomplete_browser_cases_cannot_be_hidden_by_passed_summary(self):
        cases=[{'status':state} for state in ['failed','pending','inconclusive']]
        cases += [{'status':'passed','errors':['renderer error']}, {'status':'passed','error':'renderer error'}]
        for case in cases:
            self.write_evidence(self.report_path,json.dumps({'status':'passed','errors':[],'cases':[case]}).encode())
            self.seal_validation()
            with self.assertRaisesRegex(ValueError,'failed or incomplete case'):
                self.package()
            self.assertFalse(self.output.exists())

    def test_browser_case_shape_cannot_hide_missing_or_failed_results(self):
        shapes=[{}, {'failed':{'status':'failed'}}, 1, True, [], [None], ['passed'], [{}], [{'status':None}]]
        for cases in shapes:
            self.write_evidence(self.report_path,json.dumps({'status':'passed','errors':[],'cases':cases}).encode())
            self.seal_validation()
            with self.subTest(cases=cases):
                with self.assertRaisesRegex(ValueError,'completed passed cases|failed or incomplete case'):
                    self.package()
                self.assertFalse(self.output.exists())
        self.write_evidence(self.report_path,b'{"status":"passed","errors":[]}')
        self.seal_validation()
        with self.assertRaisesRegex(ValueError,'completed passed cases'):
            self.package()

    def test_failed_or_missing_validation_status_is_rejected_before_output(self):
        for validation in [{}, {'status': 'failed'}, {'status': 'pending'}]:
            with self.subTest(validation=validation):
                with self.assertRaisesRegex(ValueError, 'passed validation record'):
                    self.package(validation=validation)
                self.assertFalse(self.output.exists())

    def test_missing_required_release_reference_is_rejected(self):
        (self.root / 'references/v3-api.md').unlink()
        with self.assertRaisesRegex(ValueError, 'Missing release entry'):
            self.package()
        self.assertFalse(self.output.exists())

    def test_unsafe_or_malformed_versions_cannot_create_archives(self):
        for version in ['../escape', '3.0', '3.0.0/escape', '3.0.0 rc.1']:
            with self.subTest(version=version):
                with self.assertRaisesRegex(ValueError, 'Invalid release version'):
                    self.package(version=version)
                self.assertFalse(self.output.exists())

    def test_source_symlinks_are_rejected_instead_of_followed(self):
        external = self.work / 'outside.txt'
        external.write_text('must never be bundled')
        link = self.root / 'references/external.md'
        try:
            link.symlink_to(external)
        except (OSError, NotImplementedError):
            self.skipTest('Symlinks unavailable on this filesystem')
        with self.assertRaisesRegex(ValueError, 'symlink'):
            self.package()
        self.assertFalse(self.output.exists())

    def test_cli_uses_external_record_parent_and_rejects_an_internal_record(self):
        record=self.evidence_root/'review.json'
        record.write_text(json.dumps(self.validation))
        script=Path(release.__file__)
        args=[sys.executable,str(script),'--skill',str(self.root),'--output',str(self.output),
              '--version',self.version,'--validation',str(record)]
        result=subprocess.run(args,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
        with zipfile.ZipFile(json.loads(result.stdout)['archive']) as archive:
            self.assertFalse(any('/validation/' in name for name in archive.namelist()))
            self.assertNotIn('validation',json.loads(archive.read(self.root.name+'/release.json')))
        inside=self.write('validation/review.json',record.read_bytes())
        args[-1]=str(inside)
        rejected=subprocess.run(args,capture_output=True,text=True)
        self.assertNotEqual(rejected.returncode,0)
        self.assertIn('outside the skill tree',rejected.stderr)

    def test_output_cannot_contaminate_its_own_release_snapshot(self):
        for output in [self.root, self.root / 'release-output', self.root / 'dist-release']:
            with self.subTest(output=output.relative_to(self.root)):
                with self.assertRaisesRegex(ValueError, 'outside the skill tree'):
                    self.package(output)
                self.assertFalse((self.root / f'three-scope-map-{self.version}.zip').exists())
                if output != self.root:
                    self.assertFalse(output.exists())
        # Resolve aliases as well: a sibling directory symlink must not bypass
        # the guard and turn previous archives into new release inputs.
        alias = self.work / 'source-alias'
        try:
            alias.symlink_to(self.root, target_is_directory=True)
        except (OSError, NotImplementedError):
            return
        with self.assertRaisesRegex(ValueError, 'outside the skill tree'):
            self.package(alias / 'release-output')
        self.assertFalse((self.root / 'release-output').exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)
