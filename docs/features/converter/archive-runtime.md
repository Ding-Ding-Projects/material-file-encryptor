# 7z and RAR reading

The archive adapter provides list and extract workflows for 7z and RAR, using the exact 7-Zip 26.04 publisher binaries recorded in `archive-runtime-manifest.json`. RAR creation is not supported. The publisher's [download page](https://www.7-zip.org/download.html) links the [official release](https://github.com/ip7z/7zip/releases/tag/26.04), whose API provides the pinned asset digests.

## Packaging

Run `node scripts/converter-archive-runtime.mjs <new-output-directory>` from the build entrypoint. It verifies the publisher package and corresponding source archive before extracting only `7z.exe`, `7z.dll`, and `License.txt`. The resulting directory also contains the unchanged complete `7z2604-src.tar.xz`. Existing valid output is reused; invalid existing output is preserved and rejected. New content is validated in a sibling staging directory and renamed into an absent destination.

Pass the returned `sevenZipPath`, `sevenZipSha256`, `sevenZipDllPath`, and `sevenZipDllSha256` as `archiveRuntime` to `createWindowsSandboxProvider`. Package all four files. The executable and DLL are rehashed before each stage. Startup performs real isolated listing of a small 7z and RAR fixture. Without that evidence, archive entries stay disabled. This runtime does not use PATH discovery or execute downloaded installer code.

The publisher executable is not Authenticode signed. Trust is anchored in the official HTTPS publisher links and SHA-256 release asset digest, with individual extracted file hashes. This is not a claim of a reproducible binary build or a separately authenticated compiler. Preserve the complete source archive and License.txt when distributing the runtime. The license includes LGPL, BSD notices, and the unRAR restriction; the RAR decoder is not permission to recreate a proprietary RAR encoder.

## Safety and supported subset

Every tool invocation runs directly in the verified AppContainer and one-process job, with no network capabilities, a 256 MiB memory limit and a 30-second native deadline. The complete list/extract pipeline also has a 30-second combined deadline and cancellation propagation. Only fixed list or stdout-extraction commands for 7z/RAR are accepted by the native launcher. No arbitrary command arguments are accepted.

The adapter limits the source to 64 MiB, listing to 1 MiB and 1,000 items, extraction to 128 files, each file to 16 MiB, total expanded bytes to 64 MiB and expansion ratio to 100:1. Names pass the existing traversal, absolute-path, device-name, depth and case-collision checks. Passwords, multipart entries, links, streams and Unix special-file metadata are rejected. File extraction requests each validated name with wildcard matching disabled and writes only to stdout, so archive paths never become tool-controlled filesystem destinations. Exact length and any supplied CRC are checked before the queue receives the output. Decoder exit status must indicate success. Empty directories, permissions and archive metadata are not restored.

Names containing underscores are intentionally rejected in this subset. In the pinned source, `CPP/Common/StdOutStream.cpp` replaces CR/LF in redirected listing names with underscore. Rejecting that character avoids accepting a normalized spelling as an exact member name. This is an explicit interoperability limit, not a claim that all valid archives are supported.

The existing queue validates the entire output set, requires a destination directory grant, preserves the source and existing destination files, and stages output bytes before publication. No extraction output is executed. Tests exercise stored 7z and RAR fixtures, official compressed 7z content, traversal and corrupt content rejection, cancellation and helper tampering.
