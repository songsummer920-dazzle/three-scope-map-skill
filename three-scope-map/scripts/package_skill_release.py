#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
# 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""Package reviewed sources and only the declared evidence for this version."""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import json
import re
import zipfile

IGNORED={'node_modules','.git','dist','.DS_Store','__pycache__','.vite','.impeccable'}
def digest(data):return hashlib.sha256(data).hexdigest()

def snapshot(root):
    result={}
    for path in sorted(root.rglob('*')):
        relative=path.relative_to(root)
        if any(part in IGNORED or part.startswith('dist-') or part.endswith(('.bak','.tmp','.swp')) for part in relative.parts):continue
        if path.is_symlink():raise ValueError(f'Release source contains a symlink: {relative}')
        if path.is_file():result[relative.as_posix()]=path.read_bytes()
    return result

def validate_manifest(files,name,prefix):
    manifest=json.loads(files[name])
    actual={p[len(prefix):]:digest(data) for p,data in files.items() if p.startswith(prefix)}
    if actual!=manifest:
        wrong=sorted(set(actual)^set(manifest)|{key for key in set(actual)&set(manifest) if actual[key]!=manifest[key]})
        raise ValueError(f'{name} does not match release snapshot: {wrong}')
    return len(manifest)

def source_fingerprint(files):
    """Bind validation to all shipped source/assets, excluding its own records.

    Evidence is independently hashed below. Excluding release.json and the
    validation/ directory prevents recursive self-hashing, not source changes.
    """
    source={name:digest(data) for name,data in sorted(files.items())
            if name!='release.json' and not name.startswith('validation/')}
    payload=json.dumps(source,sort_keys=True,separators=(',',':')).encode()
    return {'algorithm':'sha256-path-content-v1','sha256':digest(payload),'files':len(source)}

def validate_evidence(files,version,validation):
    if validation.get('status')!='passed':raise ValueError('Candidate packaging requires a passed validation record')
    if validation.get('schemaVersion')!=2 or validation.get('version')!=version:
        raise ValueError('Validation schema/version does not match this candidate')
    if validation.get('source')!=source_fingerprint(files):
        raise ValueError('Validation source fingerprint is stale or incomplete; rerun checks against this source')
    checks=validation.get('checks',{})
    for name in ['unit','build','integrity','webgl']:
        check=checks.get(name,{})
        if check.get('status')!='passed' or not str(check.get('command','')).strip():
            raise ValueError(f'Missing passed validation check/command: {name}')
    if not isinstance(checks['webgl'].get('cases'),int) or checks['webgl']['cases']<1:
        raise ValueError('WebGL validation must record actual completed cases')
    evidence=validation.get('evidence',[])
    if not isinstance(evidence,list):raise ValueError('Validation evidence must be a list')
    seen=set();kinds=set()
    for entry in evidence:
        name=entry.get('path','');path=PurePosixPath(name)
        if not name or path.is_absolute() or '..' in path.parts or path.as_posix()!=name or '\\' in name:
            raise ValueError('Unsafe validation evidence path')
        if not name.startswith(f'validation/{version}/') or name.endswith('/record.json') or name in seen:
            raise ValueError('Validation evidence must be unique and stored inside its candidate directory')
        seen.add(name)
        data=files.get(name)
        if data is None or entry.get('sha256')!=digest(data):
            raise ValueError(f'Missing or changed validation evidence: {name}')
        kind=entry.get('kind');kinds.add(kind)
        if kind=='screenshot' and not data.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError('Screenshot evidence must be a captured PNG')
        if kind=='browser-report':
            try:report=json.loads(data)
            except (ValueError,UnicodeDecodeError) as error:raise ValueError('Invalid browser report evidence') from error
            if not isinstance(report,dict) or report.get('status')!='passed' or report.get('errors'):
                raise ValueError('Browser evidence must contain a passed, error-free report')
    if not {'screenshot','browser-report'}.issubset(kinds):
        raise ValueError('Portable screenshot and browser-report evidence are required')

def release_status(version,status=None):
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?',version):raise ValueError('Invalid release version')
    if status is None:status='candidate' if '-' in version else 'release'
    if status not in {'candidate','release'}:raise ValueError('Invalid release status')
    if status=='release' and '-' in version:raise ValueError('A release cannot use a prerelease version')
    return status

MACHINE_LOCAL_PATH=re.compile(r'(?:/(?:Users|home)/[^/\s"\']+/|/(?:private/)?var/folders/|[A-Za-z]:[\\/]+Users[\\/]+)',re.IGNORECASE)

def validate_public_evidence(files,validation):
    """Require portable public evidence; never rewrite already-hashed bytes."""
    for entry in validation['evidence']:
        try:text=files[entry['path']].decode('utf-8')
        except UnicodeDecodeError:continue
        if MACHINE_LOCAL_PATH.search(text):
            raise ValueError(f'Release evidence contains a machine-local path: {entry["path"]}; create and hash a portable copy first')

def distribution_snapshot(files,version,validation,status=None):
    """Return the exact public file set without deleting development history.

    All source/assets remain included and fingerprinted. Validation history and
    undeclared temporary evidence are not runtime inputs and never enter the
    user installation archive. The selected evidence remains byte-for-byte
    bound to the supplied record; this function does not rewrite/sanitize it.
    """
    status=release_status(version,status)
    for required in ['SKILL.md','LICENSE','NOTICE','references/v3-api.md','references/map-3d-overlay.md']:
        if required not in files:raise ValueError(f'Missing release entry: {required}')
    counts={'classic':validate_manifest(files,'assets/template-manifest.json','assets/templates/songsummer-earth-vue/'),
            'fui':validate_manifest(files,'assets/fui-earth-manifest.json','assets/templates/fui-earth-vue/')}
    validate_evidence(files,version,validation)
    if status=='release':validate_public_evidence(files,validation)
    record=(json.dumps(validation,ensure_ascii=False,indent=2)+'\n').encode()
    record_name=f'validation/{version}/record.json'
    if record_name in files and files[record_name]!=record:
        raise ValueError('Portable validation record differs from the supplied reviewed record')
    evidence={entry['path'] for entry in validation['evidence']}
    distributed={name:data for name,data in files.items()
                 if not name.startswith('validation/') or name in evidence}
    distributed[record_name]=record
    distributed['release.json']=(json.dumps({'version':version,'status':status,'templateFiles':counts,'validation':validation},ensure_ascii=False,indent=2)+'\n').encode()
    if source_fingerprint(distributed)!=validation['source']:
        raise ValueError('Distributed source differs from the validated source fingerprint')
    return distributed

def package(root,output,version,validation,status=None):
    status=release_status(version,status)
    root=root.resolve();output=output.resolve()
    if output.is_relative_to(root):raise ValueError('Release output must stay outside the skill tree')
    files=distribution_snapshot(snapshot(root),version,validation,status)
    counts=json.loads(files['release.json'])['templateFiles']
    output.mkdir(parents=True,exist_ok=True)
    archive=output/f'three-scope-map-{version}.zip'
    contents={name:digest(data) for name,data in files.items()}
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as bundle:
        for name,data in sorted(files.items()):
            path=PurePosixPath(root.name)/name
            if path.is_absolute() or '..' in path.parts:raise ValueError('Unsafe archive path')
            info=zipfile.ZipInfo(str(path),date_time=(2020,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=0o100644<<16;bundle.writestr(info,data)
    checksum=digest(archive.read_bytes())
    archive.with_suffix('.zip.sha256').write_text(f'{checksum}  {archive.name}\n')
    archive.with_suffix('.contents.json').write_text(json.dumps({'version':version,'files':contents,'sha256':checksum},indent=2)+'\n')
    with zipfile.ZipFile(archive) as bundle:
        assert len(bundle.namelist())==len(files)
        assert all(digest(bundle.read(root.name+'/'+name))==value for name,value in contents.items())
    return {'archive':str(archive),'sha256':checksum,'files':len(files),'templateFiles':counts,'bytes':archive.stat().st_size,'status':status}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skill',type=Path,default=Path(__file__).resolve().parents[1]);parser.add_argument('--output',type=Path)
    parser.add_argument('--version',default='3.0.0-rc.1');parser.add_argument('--validation',type=Path)
    parser.add_argument('--status',choices=['candidate','release'],help='Defaults to candidate for prerelease versions and release for stable versions')
    parser.add_argument('--source-fingerprint',action='store_true',help='Print the exact source binding for a new validation record without packaging')
    args=parser.parse_args()
    if args.source_fingerprint:
        print(json.dumps(source_fingerprint(snapshot(args.skill.resolve())),indent=2));return
    if args.output is None or args.validation is None:parser.error('packaging requires --output and --validation')
    print(json.dumps(package(args.skill.resolve(),args.output.resolve(),args.version,json.loads(args.validation.read_text()),args.status),indent=2))

if __name__=='__main__':main()
