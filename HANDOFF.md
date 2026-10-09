# Implementation handoff

The first preview is being extended with fixed encrypted chunks, actual Git history, selectable folder/private GitHub transport, History and Recycle Bin. Source implementation is not a runtime-verification claim.

The starting verified main was `928ea6feb43e7acc245e1c33b423991376fd4341`. Existing runtime evidence under `docs/images/captures/windows` belongs to earlier source `c74b3a6828e3d1893015598f2df1c9bd4ce84c32`. That run passed 34 mounted filesystem checks and packaged desktop checks, but stopped at `INSTALL_REGISTRATION_MISSING`. Installed application execution and uninstall remain unverified.

The current integration contains focused core and transport tests, renderer controls and production-only packaging. Review found eager hydration during metadata discovery and Git configuration/index boundary defects; targeted repairs and integration verification are in progress. No new release or successful installer lifecycle is claimed.

See `ROADMAP.md` for incomplete acceptance criteria. Preserve existing user installations and original vaults. Tests use isolated synthetic data. Installation requires a fresh verified target; native driver elevation, if needed, is supplied by the user. Never restart the host automatically.
