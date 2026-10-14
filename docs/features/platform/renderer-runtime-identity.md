# Renderer interpreter identity

Renderer launch admission binds the isolated Python launcher, its executing base
image, the Node parent, their exact command lines, held process identities and
file hashes. Source and evidence paths must remain absolute canonical regular
files without symlink or junction components. A redirected base path is rejected
before the target launch. Resolving a path for diagnosis does not grant admission
to that spelling or relax any source or evidence checks.

## Supported runtime recovery

If an installed isolated environment records a lexical base path that redirects
to another physical location, independently resolve the selected base with
`scripts/renderer-native-path.py`. That read-only resolver compares the original
and final held native file identities and their size, write time and hash.
Inspect the resulting physical executable and create a new task-owned isolated
environment with that exact executable's supported `-m venv --without-pip`
operation. Do not edit the installed environment or substitute an unrelated
interpreter. Install the trusted Lowlevel distribution and its reviewed pinned
dependencies into the new environment through the supported package installer.

Select the new environment's `Scripts/python.exe` and registered
`Scripts/lowlevel-computer-use-cheap.exe` through `MFE_LOWLEVEL_PYTHON` and
`MFE_LOWLEVEL_CLI`. Confirm that the new configuration names the physical base,
disables system site packages and retains both console and GUI executables.
The launch worker still verifies the executing GUI image, its PE subsystem, the
declared console sibling when present, exact ancestry and all hashes.

## Read-only readiness and limits

Run `node scripts/renderer-binding-probe.mjs` for the GUI observer and append
`console` for the console route. The GUI probe uses the same explicit
`gui-observer` role as the production launch worker. The console probe retains
the ordinary strict role. Both probes observe only their own interpreter chain;
they neither launch the target nor create runtime acceptance evidence. Read each
`binding.json`, not just the probe process exit result, and require `ok: true`.

Focused Python checks retain rejection of extra arguments, changed commands,
incorrect ancestry, console/GUI substitution, replacement bytes and redirected
evidence. Actual target launch, runtime behavior, captures, restoration and
acceptance require separate execution against the intended source and build.
