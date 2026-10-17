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

Final compression repair also passes `--setupIcon`. Before reassembly, it matches the maker-branded packaged `Squirrel.exe` against the full package entry by SHA-256 and length, then copies that exact updater into an isolated vendor directory. The final setup inspection still requires the embedded updater to match that staged executable byte for byte, and retains the original package, release-index and extraction checks. The pristine vendor directory remains unchanged.

Forge copies `assets/branding` to `resources/branding`, outside ASAR. Packaged runtime paths are based on `process.resourcesPath`; development paths are based on the main module's application root, never the launch directory. Windows windows and tray receive the ICO; other platforms receive the PNG. One constructor wrapper returning the real native window supplies the icon to the main window, Material dialogs and profile-authentication dialog without changing ownership, permissions or lifecycle behavior.

Squirrel's existing install/update lifecycle recreates shortcuts through `Update.exe --createShortcut`. No shell cache deletion, unrelated shortcut rewrite, user data migration or application identity change is performed. Existing user-pinned shortcuts may retain operating-system cached artwork until Windows refreshes it.

## Verification boundary

Focused tests cover binary format rejection, malformed/truncated frames, development and packaged paths, all three owned window routes, tray wiring, immutable packaging configuration and unchanged dialog/lifecycle behavior. A source test does not establish installed appearance. Release verification must inspect the packaged executable, setup/update executable and root launcher resources, then inspect the real installed Start menu/desktop/taskbar/tray and dialog icons through the approved isolated route. Missing files or failed icon validation stop packaging rather than silently selecting a generic icon. These assets contain no private paths or user content and require no runtime network fetch.
