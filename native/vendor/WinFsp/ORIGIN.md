# Official WinFsp .NET binding

Source: https://github.com/winfsp/winfsp/tree/ddca7bd5481857a65ba552f643b8776fd070836f/src/dotnet

Pinned release: v2.1; commit `ddca7bd5481857a65ba552f643b8776fd070836f`.
The five `.cs` files are unmodified upstream source. `License.txt` is the upstream GPLv3 license and FLOSS linking exception. The local project file builds these sources with .NET 8 and preserves the upstream `Product=WinFsp` and 2.1 file-version metadata required by its native-library resolver and ABI check.

WinFsp - Windows File System Proxy, Copyright (C) Bill Zissimopoulos.
https://github.com/winfsp/winfsp

Runtime requires the official installed signed WinFsp driver and matching native DLL; this repository does not implement, replace, or bundle a kernel driver.

SHA-256:

```
94073c2ca73a1246fc8445b7cabbca39e6f51a0d3cfea936dca471ff99154641 FileSystemBase+Const.cs
7d09990282db8c522ecb3eb33e56ecae2b449413294ebe7f26e6ad8b1e835499 FileSystemBase.cs
d34867ed0fa312394bab0e1f4063b7992e3023c218456b38ef803d21894c4cbf FileSystemHost.cs
272a9284c848bed10a2e7dcf0420a2f121832ff3e9ae9afa35b91242f42b43b9 Interop.cs
633d974bf01f90d4231f3d121848ae874cc6d4a195bd86a6246b2ad917a2fa48 Service.cs
68ae2fa9d8e6110ebdc9a236beecf118e279f8a26530daf09c9e682c231f7879 License.txt
```
