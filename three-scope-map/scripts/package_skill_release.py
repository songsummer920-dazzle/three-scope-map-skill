#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
# 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""Verify external release evidence and package only distributable skill files."""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import json
import re
import zipfile

IGNORED = {'node_modules', '.git', 'dist', '.DS_Store', '__pycache__', '.vite', '.impeccable'}
INTERNAL_DIRECTORIES = {'validation', 'test-results', 'playwright-report', 'coverage',
                        'screenshots', 'captures', 'debug-logs', 'logs', 'reports',
                        'artifacts', 'debug', 'traces', 'recordings'}
INTERNAL_REPORT = re.compile(r'^(?:release-(?:browser|build|tool|integrity)-.*|browser-.*)\.(?:json|png|webp|jpg)$')
REQUIRED = ['SKILL.md', 'LICENSE', 'NOTICE', 'references/v3-api.md', 'references/map-3d-overlay.md']
PUBLIC_METADATA_KEYS = {'version', 'status', 'templateFiles', 'source'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def internal_artifact(name):
    path = PurePosixPath(name)
    if any(part in INTERNAL_DIRECTORIES for part in path.parts):
        return True
    if path.suffix.lower() in {'.log', '.har', '.trace'} or INTERNAL_REPORT.fullmatch(path.name):
        return True
    return any(part in {'qa', 'tests'} for part in path.parts) and path.suffix.lower() in {'.png', '.jpg', '.jpeg', '.webp', '.gif'}


def public_sources(files):
    return {name: data for name, data in files.items() if not internal_artifact(name)}


def snapshot(root):
    result = {}
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        if any(part in IGNORED or part.startswith('dist-') or part.endswith(('.bak', '.tmp', '.swp')) for part in relative.parts):
            continue
        if internal_artifact(relative.as_posix()):
            continue
        if path.is_symlink():
            raise ValueError(f'Release source contains a symlink: {relative}')
        if path.is_file():
            result[relative.as_posix()] = path.read_bytes()
    return result


def validate_manifest(files, name, prefix):
    manifest = json.loads(files[name])
    actual = {p[len(prefix):]: digest(data) for p, data in files.items() if p.startswith(prefix)}
    if actual != manifest:
        wrong = sorted(set(actual) ^ set(manifest) | {key for key in set(actual) & set(manifest) if actual[key] != manifest[key]})
        raise ValueError(f'{name} does not match release snapshot: {wrong}')
    return len(manifest)


def source_fingerprint(files):
    """Bind all distributable source/assets; metadata cannot hash itself."""
    source = {name: digest(data) for name, data in sorted(public_sources(files).items())
              if name != 'release.json'}
    payload = json.dumps(source, sort_keys=True, separators=(',', ':')).encode()
    return {'algorithm': 'sha256-path-content-v1', 'sha256': digest(payload), 'files': len(source)}


def checked_evidence_name(name):
    path = PurePosixPath(name)
    if not name or path.is_absolute() or '..' in path.parts or path.as_posix() != name or '\\' in name:
        raise ValueError('Unsafe validation evidence path')
    return path


def load_evidence(root, validation):
    """Read only the declared external files; never follow an evidence symlink."""
    result = {}
    for entry in validation.get('evidence', []):
        name = entry.get('path', '')
        relative = checked_evidence_name(name)
        path = root.joinpath(*relative.parts)
        if any(parent.is_symlink() for parent in (path, *path.parents) if parent == root or root in parent.parents):
            raise ValueError('Validation evidence symlinks are not allowed')
        if path.is_file():
            result[name] = path.read_bytes()
    return result


def validate_evidence(files, version, validation, evidence_files):
    if validation.get('status') != 'passed':
        raise ValueError('Candidate packaging requires a passed validation record')
    if validation.get('schemaVersion') != 2 or validation.get('version') != version:
        raise ValueError('Validation schema/version does not match this candidate')
    if validation.get('source') != source_fingerprint(files):
        raise ValueError('Validation source fingerprint is stale or incomplete; rerun checks against this source')
    checks = validation.get('checks', {})
    for name in ['unit', 'build', 'integrity', 'webgl']:
        check = checks.get(name, {})
        if check.get('status') != 'passed' or not str(check.get('command', '')).strip():
            raise ValueError(f'Missing passed validation check/command: {name}')
    if type(checks['webgl'].get('cases')) is not int or checks['webgl']['cases'] < 1:
        raise ValueError('WebGL validation must record actual completed cases')
    evidence = validation.get('evidence', [])
    if not isinstance(evidence, list):
        raise ValueError('Validation evidence must be a list')
    seen = set()
    kinds = set()
    for entry in evidence:
        name = entry.get('path', '')
        checked_evidence_name(name)
        if name in seen:
            raise ValueError('Validation evidence paths must be unique')
        seen.add(name)
        data = evidence_files.get(name)
        if data is None or entry.get('sha256') != digest(data):
            raise ValueError(f'Missing or changed validation evidence: {name}')
        kind = entry.get('kind')
        kinds.add(kind)
        if kind == 'screenshot' and not data.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError('Screenshot evidence must be a captured PNG')
        if kind == 'browser-report':
            try:
                report = json.loads(data)
            except (ValueError, UnicodeDecodeError) as error:
                raise ValueError('Invalid browser report evidence') from error
            if not isinstance(report, dict) or report.get('status') != 'passed' or report.get('errors'):
                raise ValueError('Browser evidence must contain a passed, error-free report')
            cases = report.get('cases')
            if not isinstance(cases, list) or not cases:
                raise ValueError('Browser evidence must list completed passed cases')
            if any(not isinstance(case, dict) or case.get('status') != 'passed' or case.get('errors') or case.get('error') for case in cases):
                raise ValueError('Browser evidence contains a failed or incomplete case')
            if any(report.get(key) for key in ('inconclusive', 'inconclusiveChecks', 'pending', 'pendingChecks')):
                raise ValueError('Browser evidence contains incomplete checks')
    if not {'screenshot', 'browser-report'}.issubset(kinds):
        raise ValueError('External screenshot and browser-report evidence are required')


def release_status(version, status=None):
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?', version):
        raise ValueError('Invalid release version')
    if status is None:
        status = 'candidate' if '-' in version else 'release'
    if status not in {'candidate', 'release'}:
        raise ValueError('Invalid release status')
    if status == 'release' and '-' in version:
        raise ValueError('A release cannot use a prerelease version')
    return status


def template_counts(files):
    for name in REQUIRED:
        if name not in files:
            raise ValueError(f'Missing release entry: {name}')
    counts = {'classic': validate_manifest(files, 'assets/template-manifest.json', 'assets/templates/songsummer-earth-vue/'),
              'fui': validate_manifest(files, 'assets/fui-earth-manifest.json', 'assets/templates/fui-earth-vue/')}
    if 'assets/react-manifest.json' in files:
        validate_manifest(files, 'assets/react-manifest.json', 'assets/react/')
    return counts


def distribution_snapshot(files, version, validation, status=None, evidence_files=None):
    """Verify private evidence, then return a public tree with minimal metadata."""
    status = release_status(version, status)
    distributed = public_sources(files)
    counts = template_counts(distributed)
    if evidence_files is None:
        raise ValueError('External validation evidence is required for packaging')
    validate_evidence(distributed, version, validation, evidence_files)
    metadata = {'version': version, 'status': status, 'templateFiles': counts,
                'source': source_fingerprint(distributed)}
    distributed['release.json'] = (json.dumps(metadata, ensure_ascii=False, indent=2) + '\n').encode()
    return distributed


def install_distribution(files):
    """Verify public metadata and source bytes without requiring private reports."""
    distributed = public_sources(files)
    try:
        metadata = json.loads(distributed['release.json'])
        if not isinstance(metadata, dict) or set(metadata) != PUBLIC_METADATA_KEYS:
            raise ValueError('Invalid public release metadata')
        release_status(metadata['version'], metadata['status'])
        if metadata['source'] != source_fingerprint(distributed):
            raise ValueError('Public release source fingerprint is stale or incomplete')
        if metadata['templateFiles'] != template_counts(distributed):
            raise ValueError('Public release template counts differ from its manifests')
    except (KeyError, TypeError, json.JSONDecodeError) as error:
        raise ValueError('Source requires a valid reviewed release.json') from error
    return distributed


def package(root, output, version, validation, status=None, evidence_root=None):
    status = release_status(version, status)
    root = root.resolve()
    output = output.resolve()
    if output.is_relative_to(root):
        raise ValueError('Release output must stay outside the skill tree')
    if evidence_root is None:
        raise ValueError('An external evidence root is required for packaging')
    evidence_root = Path(evidence_root).resolve()
    if evidence_root == root or evidence_root.is_relative_to(root):
        raise ValueError('Validation evidence must stay outside the skill tree')
    for entry in validation.get('evidence', []):
        path = evidence_root.joinpath(*checked_evidence_name(entry.get('path', '')).parts).resolve()
        if path == root or path.is_relative_to(root):
            raise ValueError('Validation evidence must stay outside the skill tree')
    evidence_files = load_evidence(evidence_root, validation)
    files = distribution_snapshot(snapshot(root), version, validation, status, evidence_files)
    counts = json.loads(files['release.json'])['templateFiles']
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f'three-scope-map-{version}.zip'
    contents = {name: digest(data) for name, data in files.items()}
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
        for name, data in sorted(files.items()):
            path = PurePosixPath(root.name) / name
            if path.is_absolute() or '..' in path.parts:
                raise ValueError('Unsafe archive path')
            info = zipfile.ZipInfo(str(path), date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            bundle.writestr(info, data)
    checksum = digest(archive.read_bytes())
    archive.with_suffix('.zip.sha256').write_text(f'{checksum}  {archive.name}\n')
    archive.with_suffix('.contents.json').write_text(json.dumps({'version': version, 'files': contents, 'sha256': checksum}, indent=2) + '\n')
    with zipfile.ZipFile(archive) as bundle:
        assert len(bundle.namelist()) == len(files)
        assert all(digest(bundle.read(root.name + '/' + name)) == value for name, value in contents.items())
    return {'archive': str(archive), 'sha256': checksum, 'files': len(files),
            'templateFiles': counts, 'bytes': archive.stat().st_size, 'status': status}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skill', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output', type=Path)
    parser.add_argument('--version', default='3.0.0')
    parser.add_argument('--validation', type=Path, help='External validation record; never included in the archive')
    parser.add_argument('--evidence-root', type=Path, help='External evidence directory (default: validation record parent)')
    parser.add_argument('--status', choices=['candidate', 'release'])
    parser.add_argument('--source-fingerprint', action='store_true')
    args = parser.parse_args()
    root = args.skill.resolve()
    if args.source_fingerprint:
        print(json.dumps(source_fingerprint(snapshot(root)), indent=2))
        return
    if args.output is None or args.validation is None:
        parser.error('packaging requires --output and an external --validation')
    record = args.validation.resolve()
    if record == root or record.is_relative_to(root):
        parser.error('validation record must stay outside the skill tree')
    evidence_root = args.evidence_root.resolve() if args.evidence_root else record.parent
    result = package(root, args.output.resolve(), args.version, json.loads(record.read_text()), args.status, evidence_root)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
