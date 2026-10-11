"""Admit an exact production Pages artifact. This does not evaluate UI quality."""
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import shutil
import sys
import tarfile
import zipfile


def safe_name(name):
    normalized = name.replace('\\', '/')
    parts = PurePosixPath(normalized).parts
    if normalized.startswith('/') or ':' in normalized or '..' in parts:
        raise ValueError('Unsafe archive entry')
    return normalized


owned_root = False

def prepare():
    global owned_root
    if sys.version_info[:3] != (3, 12, 12):
        raise ValueError('Pinned Python runtime required')
    cli_version = subprocess.check_output(['gh', '--version']).decode().splitlines()[0]
    if not cli_version.startswith('gh version 2.102.0 '):
        raise ValueError('Pinned GitHub CLI required')
    source, run_id, artifact_id, digest = [os.environ[key] for key in
        ['CAPTURE_SOURCE', 'CAPTURE_RUN', 'CAPTURE_ARTIFACT', 'CAPTURE_DIGEST']]
    if not re.fullmatch('[a-f0-9]{40}', source) or not all(re.fullmatch('[0-9]{1,20}', value) for value in [run_id, artifact_id]) or not re.fullmatch('[a-f0-9]{64}', digest):
        raise ValueError('Invalid source identity')
    root = Path('out/visitor-capture')
    root.mkdir(parents=True, exist_ok=False)
    owned_root = True
    evidence = root / 'evidence'
    evidence.mkdir()
    repository = os.environ['GITHUB_REPOSITORY']
    def api(endpoint):
        return subprocess.check_output(['gh', 'api', 'repos/' + repository + endpoint])
    run = json.loads(api('/actions/runs/' + run_id))
    metadata = json.loads(api('/actions/artifacts/' + artifact_id))
    if os.environ.get('GITHUB_REF') != 'refs/heads/main' or run.get('head_branch') != 'main' or run.get('event') not in ['push', 'workflow_dispatch'] or run.get('path') != '.github/workflows/pages.yml' or run['head_sha'] != source or run['status'] != 'completed' or run['conclusion'] != 'success' or metadata['workflow_run']['id'] != int(run_id) or metadata['workflow_run']['head_sha'] != source or metadata['name'] != 'github-pages' or metadata['expired'] or metadata['digest'] != 'sha256:' + digest or not 0 < metadata['size_in_bytes'] <= 100 * 1024 * 1024:
        raise ValueError('Production artifact identity mismatch')
    archive = api('/actions/artifacts/' + artifact_id + '/zip')
    if len(archive) != metadata['size_in_bytes'] or len(archive) > 100 * 1024 * 1024 or hashlib.sha256(archive).hexdigest() != digest:
        raise ValueError('Production artifact bytes mismatch')
    with zipfile.ZipFile(io.BytesIO(archive)) as package:
        entries = package.infolist()
        if len(entries) != 1 or entries[0].filename != 'artifact.tar' or entries[0].file_size > 300 * 1024 * 1024:
            raise ValueError('Unexpected Pages transport inventory')
        payload = package.read(entries[0])
    static = root / 'static'
    static.mkdir()
    inventory = []
    with tarfile.open(fileobj=io.BytesIO(payload)) as package:
        members = package.getmembers()
        if len(members) > 20000 or sum(member.size for member in members) > 300 * 1024 * 1024:
            raise ValueError('Static artifact exceeds bounds')
        seen = set()
        for member in members:
            name = safe_name(member.name)
            if name in ['.', '']:
                continue
            key = name.casefold()
            if key in seen or not (member.isdir() or member.isfile()):
                raise ValueError('Duplicate or nonregular static entry')
            seen.add(key)
            target = static / name
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            data = package.extractfile(member).read()
            with target.open('xb') as output:
                output.write(data)
            inventory.append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    for name in ['site-provenance.json', 'workspace-provenance.json']:
        provenance = json.loads((static / name).read_text(encoding='utf-8'))
        if provenance['sourceCommit'] != source or provenance['sourceDirty'] is not False:
            raise ValueError('Static provenance mismatch')
    receipt = {'schemaVersion': 1, 'sourceCommit': source, 'deploymentRun': run_id,
        'artifactId': artifact_id, 'artifactSha256': digest, 'artifactBytes': len(archive),
        'tarSha256': hashlib.sha256(payload).hexdigest(), 'producerCommit': os.environ['GITHUB_SHA'],
        'files': inventory, 'acceptanceEvaluated': False, 'tools': {'python': sys.version.split()[0], 'gh': cli_version, 'ghSha256': hashlib.sha256(Path(shutil.which('gh')).read_bytes()).hexdigest()}}
    (evidence / 'production-input.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print('Exact production static artifact admitted; UI acceptance was not evaluated.')


if __name__ == '__main__':
    try:
        prepare()
    except Exception as error:
        if not owned_root:
            print("Static artifact admission stopped before ownership was established.", file=sys.stderr)
            sys.exit(1)
        evidence = Path("out/visitor-capture/evidence")
        evidence.mkdir(parents=True, exist_ok=True)
        (evidence / "admission-incomplete.json").write_text(json.dumps({"schemaVersion": 1, "acceptanceEvaluated": False, "exceptionType": type(error).__name__, "messageSha256": hashlib.sha256(str(error).encode()).hexdigest()}), encoding="utf-8")
        print("Static artifact admission incomplete; inspect the bounded receipt.", file=sys.stderr)
        sys.exit(1)
