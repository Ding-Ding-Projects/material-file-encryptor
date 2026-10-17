# Installed desktop icons

The desktop application, Squirrel setup and update launcher, owned windows, and notification-area tray use the existing green folder-lock mark from `browser-extension/icons/icon.svg`. This changes presentation only. Executable names, application identifiers, vault data, startup registration and update feeds retain their existing values.

`assets/branding/app.ico` is a genuine ICO containing transparent 32-bit PNG frames at 16, 20, 24, 32, 40, 48, 64, 128 and 256 pixels. `app.png` provides the 256-pixel portable image. The manifest records the canonical LF source digest, renderer version and output hashes. Rendering uses no fonts or external assets.

## Reproduction and validation

Install the exact authoring tool into a separate temporary directory, outside the repository, then generate the committed assets:

```powershell
npm install --prefix <temporary-tool-directory> --save-exact --ignore-scripts --no-audit --no-fund @resvg/resvg-js@2.6.2
node scripts/desktop-icons.mjs generate <temporary-tool-directory>
node scripts/desktop-icons.mjs check
```

The authoring package is fetched from the official npm registry. Its lock entry has integrity `sha512-xBaJish5OeGmniDj9cW5PRa/PtmuVU3ziqrbr5xJj901ZDN4TosrVaNZpEiLZAxdfnhAe7uQ7QFWfjPe9d9K2Q==`. Retain the temporary installation lock for regeneration provenance; never copy that installation into the application. Normal builds need only Node to validate the committed files. The checker verifies hashes, the complete ICO directory, frame dimensions, decompressed RGBA scanlines, transparent pixels and visible opaque artwork. Both the root build route and Forge's pre-package hook run it.

## Packaging and runtime paths

Forge embeds the ICO in `MaterialFileEncryptor.exe`; Squirrel receives the same `setupIcon` for setup and its update executable. The Squirrel metadata `iconUrl` points at an immutable source commit containing the ICO. When artwork changes, commit the asset first, publish that commit, and only then update the URL to its full SHA. Confirm the URL returns those exact bytes before producing an installer.

Final compression repair also passes `--setupIcon`. Forge removes the temporary application directory after its maker finishes, so reassembly reads the updater directly from the full package instead of expecting a standalone file. It requires exactly one case-insensitive `lib/<framework>/squirrel.exe` entry, including the lowercase name emitted by NuGet, and rejects missing entries, duplicate case variants, and entries outside the 1-byte to 32-MiB bound. The extracted file must match the package entry's SHA-256 and length.

Before staging, a data/resource-only PE mapping verifies one `RT_GROUP_ICON`, all nine frame descriptors, and every referenced `RT_ICON` payload byte for byte against the approved ICO. The updater is never executed for this inspection. Reassembly copies the pristine vendor tools into an isolated directory, replaces only that staged updater with the verified package bytes, and verifies the staged hash again. Final setup inspection still requires the embedded updater to match the exact staged executable, and retains the original package, release-index and extraction checks. The pristine vendor directory remains unchanged. Before final payload inspection, setup resource repair moves the nine approved primary frames to IDs unused by both the candidate and pristine bootstrapper. It restores auxiliary groups 107 and 108 and every referenced frame from the pristine bootstrapper, then checks every group descriptor and frame byte. The complete embedded DATA payload hash must remain unchanged. The owned target must remain unsigned, and a complete pre-repair copy is retained. These source checks do not establish successful installer production or installed appearance.

Forge copies `assets/branding` to `resources/branding`, outside ASAR. Packaged runtime paths are based on `process.resourcesPath`; development paths are based on the main module's application root, never the launch directory. Windows windows and tray receive the ICO; other platforms receive the PNG. One constructor wrapper returning the real native window supplies the icon to the main window, Material dialogs and profile-authentication dialog without changing ownership, permissions or lifecycle behavior.

Squirrel's existing install/update lifecycle recreates shortcuts through `Update.exe --createShortcut`. No shell cache deletion, unrelated shortcut rewrite, user data migration or application identity change is performed. Existing user-pinned shortcuts may retain operating-system cached artwork until Windows refreshes it.

## Verification boundary

Focused tests cover binary format rejection, malformed/truncated frames, development and packaged paths, all three owned window routes, tray wiring, immutable packaging configuration and unchanged dialog/lifecycle behavior. A source test does not establish installed appearance. Release verification must inspect the packaged executable, setup/update executable and root launcher resources, then inspect the real installed Start menu/desktop/taskbar/tray and dialog icons through the approved isolated route. Missing files or failed icon validation stop packaging rather than silently selecting a generic icon. These assets contain no private paths or user content and require no runtime network fetch.

## Ordinary installed 1.823.1 evidence

Version 1.823.1 is verified in the ordinary user installation from release source `14d6e07636a1f1d62e6dd345273a0c6866664562`. All 910 payload files matched; four opened-file handles resolved to ordinary installation paths. Independent queries through the existing Explorer desktop confirmed the installation folder and Desktop/Start menu shortcut targets. The installer operation returned 0. Its original continuous observer failed, so operation exit and recorded-process absence were recovered separately and remain separate verdicts.

The installed English/light initial setup screen and five native window icon handles were observed with an isolated verification profile. Both ordinary-shell shortcut icon images were separately inspected and show the green folder-lock mark with the shortcut arrow; this is extracted shell-icon evidence, not a rendered Explorer/taskbar/tray screenshot. The runtime observer failed its Python-wrapper identity handshake; separate recovery found every recorded identity absent and the hidden desktop unavailable, while replacement processes were left untouched. Console observation covers only the capture interval, not startup history. Rendered taskbar/tray icons, full workflows and a disposable fresh-machine installation remain unverified. Independent recovery is now recorded separately. Canonical capture promotion remains pending because release source 14d6e07636a1f1d62e6dd345273a0c6866664562 differs from verifier checkout edf13cba77968c81a3c7eca392fdc1f740126868. The genuine capture remains private and unpromoted; no tool-context image is presented as ordinary-installed proof.

The bounded original installation evidence remains preserved privately. The release source and verifier checkout are recorded separately.
