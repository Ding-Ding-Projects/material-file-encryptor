# Reviewed Windows executable provenance

The constants in `src/main/ollama-provenance.js` were measured from the official [Ollama v0.40.2 release](https://github.com/ollama/ollama/releases/tag/v0.40.2), published on 2026-10-08 at 16:53:47 UTC. The release API reported both draft and prerelease flags false. No downloaded executable was run, installed or started during this inspection.

The [Windows AMD64 archive](https://github.com/ollama/ollama/releases/download/v0.40.2/ollama-windows-amd64.zip) contains 1,468,085,195 bytes. Its measured SHA-256 is `e29ad1d5063dd4b54b2492d9b00adab2cff9621bfa654b6c92aa8d6f1fdfe7fc`, matching both the release asset digest and the official [checksum file](https://github.com/ollama/ollama/releases/download/v0.40.2/sha256sum.txt).

Only the exact root archive member `ollama.exe` was extracted. The reader required one exact member, a non-directory and non-symlink entry, a maximum uncompressed size of 1 GiB, and exact streamed byte count. It did not extract the other archive members. The executable contains 27,854,728 bytes with SHA-256 `9eaec399fd941073f8ddfbd56e0447f77fca5c006b26b8b1874a7fb12719b2a0`.

Read-only Windows `Get-AuthenticodeSignature` returned `Valid` and `Signature verified.` for those extracted bytes. The exact subject is:

```text
CN=Ollama Inc., O=Ollama Inc., L=Toronto, S=Ontario, C=CA, SERIALNUMBER=2713355, OID.2.5.4.15=Private Organization, OID.1.3.6.1.4.1.311.60.2.1.2=Ontario, OID.1.3.6.1.4.1.311.60.2.1.3=CA
```

The certificate thumbprint is `716CD3BC8C02361431A18F56F98C72DE88066103`. Its observed validity interval was 2026-02-12 00:00:00 UTC through 2029-02-13 23:59:59 UTC. The policy pins both subject and thumbprint, and the host still requires a valid signature at verification time. A future certificate rotation requires a new provenance review. This evidence describes the inspected release, not every binary with an Ollama filename.

Pass `REVIEWED_OLLAMA_MANIFESTS` as `reviewedManifests` and `OLLAMA_PUBLISHER_POLICIES` as `publisherPolicies` to `createNativeOllamaHost`. The executable-hash route still requires explicit native confirmation when publisher trust does not apply. The constants do not perform downloads or launches. Synthetic tests validate schema compatibility and immutability; they do not substitute for this recorded real archive inspection.
