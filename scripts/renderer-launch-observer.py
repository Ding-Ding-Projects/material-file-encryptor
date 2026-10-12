"""Persistent task-owned observer using registered installed Lowlevel tools."""
import asyncio
import hashlib
import importlib.metadata
import importlib.util
import inspect
import io
import json
import os
from pathlib import Path
import sys
from datetime import datetime, timezone


def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);sys.modules[name]=module;spec.loader.exec_module(module);return module


def digest(path):
    result=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda:stream.read(1048576),b''):result.update(chunk)
    return result.hexdigest()


class Journal:
    def __init__(self,intent_path):
        self.root=Path(intent_path).parent;self.sequence=0;self.previous=digest(intent_path)
    def write(self,phase,**values):
        self.sequence+=1
        value={'version':1,'phase':phase,'observedAt':datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),'previousSha256':self.previous,**values}
        data=json.dumps(value,indent=2).encode();path=self.root/f'{self.sequence:03d}-{phase}.json'
        with path.open('xb') as stream:stream.write(data);stream.flush();os.fsync(stream.fileno())
        self.previous=hashlib.sha256(data).hexdigest();return value
    def terminal(self,result):
        value=self.write('terminal',**result)
        published=self.root/'terminal-published-bytes.json'
        with published.open('x',encoding='utf8') as stream:json.dump(value,stream);stream.flush();os.fsync(stream.fileno())
        # Atomic exclusive publication after all bytes are durable. Retain the
        # original name too; no evidence deletion or overwrite is necessary.
        os.link(published,self.root/'terminal.json')


def launch_with_input(lifecycle, request, state_path):
    """Keep the installed parser authoritative with a complete non-TTY stream."""
    original_stdin = sys.stdin
    stream = io.TextIOWrapper(io.BytesIO(json.dumps(request).encode('utf-8')), encoding='utf-8')
    try:
        sys.stdin = stream
        return lifecycle._cmd_launch(lifecycle._parser().parse_args(['launch', '--state', state_path]))
    finally:
        sys.stdin = original_stdin
        stream.close()

def run(intent_path):
    journal=Journal(intent_path)
    try:
        intent=json.loads(Path(intent_path).read_bytes())
        if intent.get('kind')!='renderer-launch-observation' or intent['workerSha256']!=digest(__file__) or intent['adapterSha256']!=digest(intent['adapterPath']):raise RuntimeError('Launch intent source binding differs.')
        required={str(Path(__file__).with_name(name)) for name in ['renderer-launch-observer.mjs','renderer-launch-observer.py','supplemental-renderer-recovery.py','renderer-process-snapshot.py']}
        if set(intent.get('verifierHashes',{}))!=required or any(digest(p)!=value for p,value in intent['verifierHashes'].items()):raise RuntimeError('Launch intent verifier inventory differs.')
        interpreter=intent.get('observerInterpreter')
        if not isinstance(interpreter,dict) or set(interpreter)!={'launcher','base','hashes'} or Path(interpreter['launcher']).name.lower()!='pythonw.exe' or Path(interpreter['base']).name.lower()!='pythonw.exe':raise RuntimeError('GUI observer interpreter binding missing.')
        if Path(os.environ['MFE_LOWLEVEL_PYTHON'])!=Path(interpreter['launcher']) or Path(sys.executable)!=Path(interpreter['launcher']) or Path(sys._base_executable)!=Path(interpreter['base']):raise RuntimeError('Executing GUI observer interpreter differs.')
        if any(digest(p)!=value for p,value in interpreter['hashes'].items()):raise RuntimeError('GUI observer interpreter bytes changed.')
        recovery=load('launch_recovery',Path(__file__).with_name('supplemental-renderer-recovery.py'))
        life=load('launch_lifecycle',os.environ['MFE_LOWLEVEL_CLIENT'])
        life._reject_link_components(Path(intent_path));life._reject_link_components(Path(intent['statePath']))
        if Path(intent['statePath']).exists():raise RuntimeError('Fresh launch state already exists.')
        with recovery.owning_client(intent['declaredClientPid']) as (client,chain):
            journal.write('observer-bound',clientBinding=client,clientLaunchChain=chain)
        from lowlevel_computer_use_mcp import server,winio,native_win32
        distribution=importlib.metadata.distribution('lowlevel-computer-use-mcp')
        if not any(e.name=='lowlevel-computer-use-cheap' and e.value=='lowlevel_computer_use_mcp.server:cheap_entry' for e in distribution.entry_points):raise RuntimeError('Installed public Lowlevel entrypoint differs.')
        tools={'list_headless_windows':(server.list_headless_windows,server.HeadlessDesktopInput),'launch_on_headless_desktop':(server.launch_on_headless_desktop,server.LaunchHeadlessInput)}
        if any(not inspect.iscoroutinefunction(function) for function,_ in tools.values()):raise RuntimeError('Registered installed Lowlevel tool binding is unavailable.')
        if digest(intent['request']['executable'])!=intent['executableSha256']:raise RuntimeError('Intended launch executable bytes changed.')
        source_paths=[Path(server.__file__),Path(winio.__file__),Path(native_win32.__file__),Path(recovery.__file__),Path(recovery.snapshot.__file__),Path(life.__file__),Path(os.environ['MFE_LOWLEVEL_CLI']),Path(intent['request']['executable']),Path(intent['adapterPath']),*[Path(p) for p in intent['verifierHashes']]]
        source_hashes={str(p):digest(p) for p in source_paths}
        journal.write('installed-tools-bound',distributionVersion=distribution.version,sourceHashes=source_hashes,route='installed-public-lowlevel-tool-binding')
        backend=recovery.snapshot.RendererNativeBackend(life,intent['statePath'],intent['sourceCommit'],life.__file__,fresh_launch=True).install()
        class Client:
            def call_tool(self,name,params):
                if name not in tools:raise RuntimeError('Launch observer tool is outside the exact allowlist.')
                if source_hashes!={str(p):digest(p) for p in source_paths}:raise RuntimeError('Installed tool or verifier bytes changed before launch phase.')
                with recovery.owning_client(intent['declaredClientPid'],client) as (actual,chain):
                    journal.write('tool-started',tool=name,parameters=params,observerIdentity=backend.proof.identity(os.getpid()),clientLaunchChain=chain)
                function,model=tools[name]
                result=json.loads(asyncio.run(function(model(**params))))
                result['client_ok']=result.get('ok') is True
                journal.write('tool-result',tool=name,result=result)
                return result
        life._connect=lambda endpoint,timeout:Client()
        # The installed parser and launch validator remain authoritative.
        result=launch_with_input(life,intent['request'],intent['statePath'])
        if result.get('client_ok') is True:
            _,state=backend.read(intent['statePath'])
            if Path(state['process']['executablePath'])!=Path(intent['request']['executable']) or source_hashes!={str(p):digest(p) for p in source_paths}:raise RuntimeError('Launch image or bytes changed before admission.')
            journal.write('state-published',rootIdentity=state['process'],stateSha256=digest(intent['statePath']),sidecarSha256=digest(backend.marker))
        journal.terminal(result)
    except BaseException as error:
        journal.terminal({'ok':False,'client_ok':False,'error':str(error),'exceptionType':type(error).__name__,'processLaunchOutcome':'Unverified; retained phase journal is authoritative.',**({'launcherDiagnostic':error.launcherDiagnostic} if hasattr(error,'launcherDiagnostic') else {}),**({'executionDiagnostic':error.executionDiagnostic} if hasattr(error,'executionDiagnostic') else {})})


if __name__=='__main__':run(sys.argv[1])
