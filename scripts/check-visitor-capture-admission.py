"""Local synthetic admission checks. Never invoked by the capture workflow."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import zipfile

spec = importlib.util.spec_from_file_location('capture_admission', 'scripts/prepare-visitor-capture.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
parent = Path('out/capture-admission-mechanics').resolve()
parent.mkdir(parents=True, exist_ok=True)
source = 'a' * 40
for name in ['../escape', '/absolute', 'C:/escape', 'folder/../../escape', '\\absolute']:
    try:
        module.safe_name(name)
    except ValueError:
        pass
    else:
        raise AssertionError('Unsafe entry admitted')


def archive(link=False):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w') as package:
        for name in ['site-provenance.json', 'workspace-provenance.json', 'index.html']:
            data = (json.dumps({'sourceCommit': source, 'sourceDirty': False}) if name.endswith('.json') else 'synthetic public page').encode()
            info = tarfile.TarInfo(name)
            info.size = len(data)
            package.addfile(info, io.BytesIO(data))
        if link:
            info = tarfile.TarInfo('escape')
            info.type = tarfile.SYMTYPE
            info.linkname = '/outside'
            package.addfile(info)
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as package:
        package.writestr('artifact.tar', stream.getvalue())
    return output.getvalue()

original_cwd = Path.cwd()
original_provider = module.subprocess.check_output
original_which = module.shutil.which
original_version = module.sys.version_info
try:
    for index, scenario in enumerate(['valid', 'wrong-bytes', 'link']):
        fixture = parent / (scenario + '-' + os.urandom(6).hex())
        fixture.mkdir()
        fake_cli = fixture / 'synthetic-gh'
        fake_cli.write_bytes(b'synthetic CLI identity, never executed')
        payload = archive(link=scenario == 'link')
        digest = hashlib.sha256(payload).hexdigest()
        metadata = {'name': 'github-pages', 'expired': False, 'digest': 'sha256:' + digest, 'size_in_bytes': len(payload), 'workflow_run': {'id': 123, 'head_sha': source}}
        run = {'head_sha': source, 'status': 'completed', 'conclusion': 'success', 'head_branch': 'main', 'event': 'push', 'path': '.github/workflows/pages.yml'}
        def provider(args):
            if args == ['gh', '--version']:
                return b'gh version 2.102.0 synthetic\n'
            endpoint = args[-1]
            if endpoint.endswith('/zip'):
                return payload + b'changed' if scenario == 'wrong-bytes' else payload
            return json.dumps(metadata if '/artifacts/' in endpoint else run).encode()
        module.subprocess.check_output = provider
        module.shutil.which = lambda _: str(fake_cli)
        module.sys.version_info = (3, 12, 12)
        module.owned_root = False
        os.environ.update(CAPTURE_SOURCE=source, CAPTURE_RUN='123', CAPTURE_ARTIFACT='456', CAPTURE_DIGEST=digest, GITHUB_REPOSITORY='fixture/public', GITHUB_SHA='b' * 40, GITHUB_REF='refs/heads/main')
        os.chdir(fixture)
        if scenario == 'valid':
            module.prepare()
            receipt = json.loads(Path('out/visitor-capture/evidence/production-input.json').read_text())
            assert receipt['artifactSha256'] == digest and receipt['acceptanceEvaluated'] is False and len(receipt['files']) == 3
        else:
            try:
                module.prepare()
            except ValueError:
                pass
            else:
                raise AssertionError('Invalid synthetic artifact admitted')
        os.chdir(original_cwd)
finally:
    os.chdir(original_cwd)
    module.subprocess.check_output = original_provider
    module.shutil.which = original_which
    module.sys.version_info = original_version
print('PASS: actual artifact admission/extraction with synthetic provider, changed bytes and archive-link negatives. No network or browser; owned fixtures retained.')
