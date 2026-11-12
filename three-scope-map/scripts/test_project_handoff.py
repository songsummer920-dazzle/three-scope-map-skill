#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
# 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""Exercise installation and project handoff using isolated temporary skills only."""

from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import create_map_project as project
import install_skill as installer
import package_skill_release as release


class HandoffTests(unittest.TestCase):
    def setUp(self):
        temporary_root = "/private/tmp" if Path("/private/tmp").is_dir() else None
        self.temporary = tempfile.TemporaryDirectory(prefix="map-handoff-test-", dir=temporary_root)
        self.work = Path(self.temporary.name)
        self.source = self.work / "portable-skill"
        self.target = self.work / "skills/three-scope-map"
        self.backups = self.work / "backups"
        self.version = "3.0.0"
        self.write("SKILL.md", b"---\nname: three-scope-map\ndescription: Isolated test fixture\n---\n")
        for name in ("LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"):
            self.write(name, f"Root fixture {name}\n".encode())
        self.write("LICENSES/root-component.txt", b"Root component grant\n")
        self.write("references/v3-api.md", b"Fixture API\n")
        self.write("references/map-3d-overlay.md", b"Fixture overlay\n")
        self.write("new-source.txt", b"new reviewed source\n")
        self.write("dashboard-only/business.txt", b"Do not copy unrelated business UI\n")
        for preset, template in (("classic", "songsummer-earth-vue"), ("fui", "fui-earth-vue")):
            prefix = f"assets/templates/{template}/"
            self.write(prefix + "package.json", json.dumps({"name": f"fixture-{preset}",
                       "scripts": {"dev": "vite", "build": "vite build"}}).encode())
            self.write(prefix + "package-lock.json", b'{"lockfileVersion":3}\n')
            self.write(prefix + "index.html", b'<div id="app"></div>\n')
            self.write(prefix + "src/main.ts", f"export const preset = '{preset}';\n".encode())
            self.write(prefix + "public/map.bin", b"fixture geographic asset\n")
            for name in ("LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"):
                self.write(prefix + name, f"{preset} fixture {name}\n".encode())
            self.write(prefix + "LICENSES/template-component.txt", f"{preset} component grant\n".encode())
        self.seal()

    def tearDown(self):
        self.temporary.cleanup()

    def write(self, name, data, root=None):
        path = (root or self.source) / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def tree(self, root):
        return {path.relative_to(root).as_posix(): path.read_bytes()
                for path in root.rglob("*") if path.is_file() and not path.is_symlink()}

    def seal(self):
        for template, manifest in (("songsummer-earth-vue", "template-manifest.json"),
                                   ("fui-earth-vue", "fui-earth-manifest.json")):
            files = release.snapshot(self.source / "assets/templates" / template)
            self.write("assets/" + manifest,
                       json.dumps({name: hashlib.sha256(data).hexdigest() for name, data in files.items()}).encode())
        evidence = [(f"validation/{self.version}/screen.png", "screenshot", b"\x89PNG\r\n\x1a\nfixture"),
                    (f"validation/{self.version}/browser.json", "browser-report", b'{"status":"passed","errors":[]}\n')]
        for name, _, data in evidence:
            self.write(name, data)
        self.validation = {"schemaVersion": 2, "status": "passed", "version": self.version,
                           "source": release.source_fingerprint(release.snapshot(self.source)),
                           "checks": {name: {"status": "passed", "command": "isolated fixture check",
                                              **({"cases": 1} if name == "webgl" else {})}
                                      for name in ("unit", "build", "integrity", "webgl")},
                           "evidence": [{"path": name, "kind": kind, "sha256": hashlib.sha256(data).hexdigest()}
                                        for name, kind, data in evidence]}
        files=release.snapshot(self.source)
        self.write("release.json", json.dumps({"version": self.version, "status": "release",
                    "templateFiles": release.template_counts(files),
                    "source": release.source_fingerprint(files)}).encode())

    def old_install(self):
        self.write("SKILL.md", b"---\nname: three-scope-map\n---\nOld skill\n", self.target)
        self.write("assets/previews/deleted-ai-preview.png", b"old preview", self.target)
        self.write("my-local-customization.txt", b"user modifications", self.target)
        self.write("node_modules/local/index.js", b"old local dependency", self.target)
        return self.tree(self.target)

    def install(self):
        return installer.install_skill(self.source, self.target, self.backups)

    def expected_distribution(self):
        return release.install_distribution(release.snapshot(self.source))

    def test_new_install_has_exact_reviewed_public_files_and_no_generated_outputs(self):
        for name in ("node_modules/cache.js", ".git/config", "dist/app.js", "dist-qa/qa.js",
                     "__pycache__/test.pyc", ".vite/cache.js", ".DS_Store", "saved.bak"):
            self.write(name, b"excluded generated output")
        self.write("validation/old/private.log", b"unreviewed historical evidence")
        result = self.install()
        self.assertEqual(self.tree(self.target), self.expected_distribution())
        self.assertIsNone(result["backup"])
        self.assertFalse(self.backups.exists())
        self.assertEqual(result["target"], str(self.target))

    def test_public_metadata_installs_without_internal_validation_records(self):
        shutil.rmtree(self.source/"validation")
        result=self.install()
        self.assertTrue((self.target/"release.json").is_file())
        self.assertNotIn("validation",json.loads((self.target/"release.json").read_text()))
        self.assertFalse((self.target/"validation").exists())
        self.assertEqual(result["version"],self.version)

    def test_install_rejects_embedded_internal_evidence_metadata(self):
        before=self.old_install()
        p=self.source/"release.json";metadata=json.loads(p.read_text())
        metadata["validation"]=self.validation;p.write_text(json.dumps(metadata))
        with self.assertRaisesRegex(ValueError,"public release metadata"):
            self.install()
        self.assertEqual(self.tree(self.target),before)
        self.assertFalse(self.backups.exists())

    def test_upgrade_replaces_old_files_and_keeps_complete_external_backup(self):
        old_files = self.old_install()
        result = self.install()
        backup = Path(result["backup"])
        self.assertFalse(backup.is_relative_to(self.target.parent))
        self.assertEqual(self.tree(backup), old_files)
        self.assertEqual(self.tree(self.target), self.expected_distribution())
        self.assertFalse((self.target / "assets/previews/deleted-ai-preview.png").exists())
        self.assertFalse((self.target / "my-local-customization.txt").exists())

    def test_backup_preserves_internal_links_without_copying_external_contents(self):
        self.old_install()
        outside = self.work / "outside-private"
        outside.mkdir()
        (outside / "secret").write_bytes(b"external user data")
        (self.target / "user-link").symlink_to(outside, target_is_directory=True)
        result = self.install()
        saved_link = Path(result["backup"]) / "user-link"
        self.assertTrue(saved_link.is_symlink())
        self.assertEqual(os.readlink(saved_link), str(outside))
        self.assertEqual((outside / "secret").read_bytes(), b"external user data")
        self.assertFalse((self.target / "user-link").exists())

    def test_each_upgrade_uses_a_new_backup_directory(self):
        self.old_install()
        first = self.install()
        self.write("user-after-first.txt", b"second customization", self.target)
        second = self.install()
        self.assertNotEqual(first["backup"], second["backup"])
        self.assertTrue((Path(first["backup"]) / "my-local-customization.txt").exists())
        self.assertEqual((Path(second["backup"]) / "user-after-first.txt").read_bytes(), b"second customization")

    def test_stale_review_record_leaves_old_install_untouched(self):
        before = self.old_install()
        self.write("new-source.txt", b"changed after review")
        with self.assertRaisesRegex(ValueError, "stale|incomplete"):
            self.install()
        self.assertEqual(self.tree(self.target), before)
        self.assertFalse(self.backups.exists())

    def test_missing_review_record_leaves_old_install_untouched(self):
        before = self.old_install()
        (self.source / "release.json").unlink()
        with self.assertRaisesRegex(ValueError, "reviewed release.json"):
            self.install()
        self.assertEqual(self.tree(self.target), before)
        self.assertFalse(self.backups.exists())

    def test_backup_failure_does_not_touch_old_target(self):
        before = self.old_install()
        with mock.patch.object(installer.shutil, "copytree", side_effect=OSError("simulated backup failure")):
            with self.assertRaisesRegex(OSError, "backup failure"):
                self.install()
        self.assertEqual(self.tree(self.target), before)
        self.assertEqual(list(self.target.parent.iterdir()), [self.target])

    def test_staging_failure_keeps_old_target_and_a_complete_backup(self):
        before = self.old_install()
        with mock.patch.object(installer, "write_file_set", side_effect=OSError("simulated disk full")):
            with self.assertRaisesRegex(OSError, "disk full"):
                self.install()
        self.assertEqual(self.tree(self.target), before)
        backups = list(self.backups.iterdir())
        self.assertEqual(len(backups), 1)
        self.assertEqual(self.tree(backups[0]), before)
        self.assertEqual(list(self.target.parent.iterdir()), [self.target])

    def test_failed_commit_restores_original_install(self):
        before = self.old_install()
        real_replace = os.replace

        def fail_new_install(source, destination):
            if Path(source).name.startswith(f".{self.target.name}-stage-"):
                raise OSError("simulated rename failure")
            return real_replace(source, destination)

        with mock.patch.object(installer.os, "replace", side_effect=fail_new_install):
            with self.assertRaisesRegex(OSError, "rename failure"):
                self.install()
        self.assertEqual(self.tree(self.target), before)
        self.assertEqual(self.tree(next(self.backups.iterdir())), before)
        self.assertEqual(list(self.target.parent.iterdir()), [self.target])

    def test_unrelated_existing_directory_is_not_replaced(self):
        self.write("SKILL.md", b"---\nname: another-skill\n---\n", self.target)
        self.write("business.txt", b"unrelated user work", self.target)
        before = self.tree(self.target)
        with self.assertRaisesRegex(ValueError, "unrelated"):
            self.install()
        self.assertEqual(self.tree(self.target), before)
        self.assertFalse(self.backups.exists())

    def test_installation_refuses_filesystem_home_and_skills_roots(self):
        for target in (Path("/"), Path.home(), self.target.parent):
            with self.subTest(target=target):
                with self.assertRaisesRegex(ValueError, "unsafe destination|installation root"):
                    installer.install_skill(self.source, target, self.backups)
        self.assertFalse(self.target.parent.exists())

    def test_installation_paths_must_be_disjoint_and_backup_outside_skills_root(self):
        before = self.tree(self.source)
        cases = [(self.source, self.source / "nested", self.backups),
                 (self.source, self.work, self.backups),
                 (self.source, self.target, self.source / "backups"),
                 (self.source, self.target, self.work),
                 (self.source, self.target, self.target.parent / "backups"),
                 (self.source, self.target.parent / "team/three-scope-map", self.target.parent / "backups")]
        for source, target, backup in cases:
            with self.subTest(source=source, target=target, backup=backup):
                with self.assertRaisesRegex(ValueError, "overlap|outside"):
                    installer.install_skill(source, target, backup)
        self.assertEqual(self.tree(self.source), before)
        self.assertFalse(self.target.exists())

    def test_installation_rejects_symlink_source_target_parent_and_backup(self):
        self.old_install()
        before = self.tree(self.target)
        linked_source = self.work / "linked-source"
        linked_source.symlink_to(self.source, target_is_directory=True)
        linked_target = self.work / "linked-target"
        linked_target.symlink_to(self.target, target_is_directory=True)
        linked_parent = self.work / "linked-parent"
        linked_parent.symlink_to(self.target.parent, target_is_directory=True)
        self.backups.mkdir()
        linked_backup = self.work / "linked-backups"
        linked_backup.symlink_to(self.backups, target_is_directory=True)
        cases = [(linked_source, self.target, self.backups),
                 (self.source, linked_target, self.backups),
                 (self.source, linked_parent / "three-scope-map", self.backups),
                 (self.source, self.target, linked_backup)]
        for source, target, backup in cases:
            with self.subTest(source=source, target=target, backup=backup):
                with self.assertRaisesRegex(ValueError, "Symlink"):
                    installer.install_skill(source, target, backup)
        self.assertEqual(self.tree(self.target), before)
        self.assertEqual(list(self.backups.iterdir()), [])

    def test_symlink_in_release_source_cannot_enter_installation(self):
        before = self.old_install()
        (self.source / "linked-license").symlink_to(self.source / "LICENSE")
        with self.assertRaisesRegex(ValueError, "symlink"):
            self.install()
        self.assertEqual(self.tree(self.target), before)

    def test_both_project_presets_copy_runtime_files_and_complete_legal_bundle(self):
        for preset, template in (("fui", "fui-earth-vue"), ("classic", "songsummer-earth-vue")):
            with self.subTest(preset=preset):
                template_root = self.source / "assets/templates" / template
                for name in ("node_modules/cache.js", "dist/app.js", "dist-qa/qa.js", ".git/config", ".DS_Store"):
                    self.write(name, b"excluded", template_root)
                destination = self.work / f"project-{preset}"
                result = project.create_project(self.source, destination, preset)
                actual = self.tree(destination)
                expected = self.tree(template_root)
                for name in ("node_modules/cache.js", "dist/app.js", "dist-qa/qa.js", ".git/config", ".DS_Store"):
                    del expected[name]
                expected["LICENSES/root-component.txt"] = b"Root component grant\n"
                self.assertEqual(actual, expected)
                self.assertEqual(result["template"], template)
                self.assertIn(preset.encode(), actual["src/main.ts"])
                self.assertNotIn("dashboard-only/business.txt", actual)
                for name in project.LEGAL_FILES:
                    self.assertEqual(actual[name], f"{preset} fixture {name}\n".encode())

    def test_default_project_preset_is_fui(self):
        destination = self.work / "default-project"
        result = project.create_project(self.source, destination)
        self.assertEqual(result["preset"], "fui")
        self.assertIn(b"fui", (destination / "src/main.ts").read_bytes())

    def test_project_fills_missing_template_legal_entries_from_skill_root(self):
        template = self.source / "assets/templates/fui-earth-vue"
        for name in project.LEGAL_FILES:
            (template / name).unlink()
        shutil.rmtree(template / "LICENSES")
        destination = self.work / "fallback-project"
        project.create_project(self.source, destination)
        for name in project.LEGAL_FILES:
            self.assertEqual((destination / name).read_bytes(), (self.source / name).read_bytes())
        self.assertEqual((destination / "LICENSES/root-component.txt").read_bytes(), b"Root component grant\n")

    def test_missing_legal_bundle_prevents_project_creation(self):
        template = self.source / "assets/templates/fui-earth-vue"
        for root in (self.source, template):
            (root / "NOTICE").unlink()
        destination = self.work / "missing-legal-project"
        with self.assertRaisesRegex(ValueError, "legal bundle entry: NOTICE"):
            project.create_project(self.source, destination)
        self.assertFalse(destination.exists())

    def test_existing_nonempty_project_and_file_are_untouched(self):
        destination = self.work / "business-project"
        self.write(".user-work", b"preserve hidden business file", destination)
        with self.assertRaisesRegex(ValueError, "new or empty"):
            project.create_project(self.source, destination)
        self.assertEqual(self.tree(destination), {".user-work": b"preserve hidden business file"})
        file_target = self.work / "business.txt"
        file_target.write_bytes(b"preserve file")
        with self.assertRaisesRegex(ValueError, "must be a directory"):
            project.create_project(self.source, file_target)
        self.assertEqual(file_target.read_bytes(), b"preserve file")

    def test_existing_empty_project_directory_is_accepted(self):
        destination = self.work / "empty-project"
        destination.mkdir()
        project.create_project(self.source, destination, "classic")
        self.assertIn(b"classic", (destination / "src/main.ts").read_bytes())

    def test_invalid_preset_and_incomplete_template_never_create_destination(self):
        destination = self.work / "invalid-project"
        with self.assertRaisesRegex(ValueError, "Unknown preset"):
            project.create_project(self.source, destination, "unknown")
        self.assertFalse(destination.exists())
        (self.source / "assets/templates/fui-earth-vue/package.json").write_bytes(b"{}")
        with self.assertRaisesRegex(ValueError, "package.json"):
            project.create_project(self.source, destination)
        self.assertFalse(destination.exists())

    def test_project_rejects_missing_runtime_entry(self):
        destination = self.work / "incomplete-project"
        (self.source / "assets/templates/fui-earth-vue/index.html").unlink()
        with self.assertRaisesRegex(ValueError, "index.html"):
            project.create_project(self.source, destination)
        self.assertFalse(destination.exists())

    def test_project_source_and_destination_cannot_be_nested(self):
        before = self.tree(self.source)
        for target in (self.source, self.source / "nested", self.work):
            with self.subTest(target=target):
                with self.assertRaisesRegex(ValueError, "overlap"):
                    project.create_project(self.source, target)
        self.assertEqual(self.tree(self.source), before)

    def test_project_rejects_symlink_source_destination_parent_and_template(self):
        destination = self.work / "safe-project"
        linked_source = self.work / "linked-source"
        linked_source.symlink_to(self.source, target_is_directory=True)
        destination.mkdir()
        linked_destination = self.work / "linked-project"
        linked_destination.symlink_to(destination, target_is_directory=True)
        linked_parent = self.work / "linked-parent"
        linked_parent.symlink_to(self.work, target_is_directory=True)
        for source, target in ((linked_source, destination), (self.source, linked_destination),
                               (self.source, linked_parent / "new-project")):
            with self.subTest(source=source, target=target):
                with self.assertRaisesRegex(ValueError, "Symlink"):
                    project.create_project(source, target)
        self.assertEqual(list(destination.iterdir()), [])
        template = self.source / "assets/templates/fui-earth-vue"
        template.rename(self.work / "real-template")
        template.symlink_to(self.work / "real-template", target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "Symlink"):
            project.create_project(self.source, destination)

    def test_project_staging_failure_leaves_empty_target_untouched(self):
        destination = self.work / "empty-project"
        destination.mkdir()
        with mock.patch.object(project, "write_file_set", side_effect=OSError("simulated disk full")):
            with self.assertRaisesRegex(OSError, "disk full"):
                project.create_project(self.source, destination)
        self.assertTrue(destination.is_dir())
        self.assertEqual(list(destination.iterdir()), [])
        self.assertFalse(any(path.name.startswith(".empty-project-stage-") for path in self.work.iterdir()))

    def test_install_and_project_cli_run_only_against_explicit_temporary_targets(self):
        scripts = Path(__file__).absolute().parent
        installed = subprocess.run([sys.executable, str(scripts / "install_skill.py"),
                                    "--source", str(self.source), "--target", str(self.target),
                                    "--backup-dir", str(self.backups)], capture_output=True, text=True)
        self.assertEqual(installed.returncode, 0, installed.stderr)
        self.assertEqual(json.loads(installed.stdout)["target"], str(self.target))
        self.assertIsNone(json.loads(installed.stdout)["backup"])
        destination = self.work / "cli-project"
        created = subprocess.run([sys.executable, str(scripts / "create_map_project.py"), str(destination),
                                  "--source", str(self.target), "--preset", "classic"], capture_output=True, text=True)
        self.assertEqual(created.returncode, 0, created.stderr)
        self.assertEqual(json.loads(created.stdout)["preset"], "classic")
        self.assertIn(b"classic", (destination / "src/main.ts").read_bytes())


if __name__ == "__main__":
    unittest.main()
