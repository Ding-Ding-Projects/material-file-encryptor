// Verified from the official v0.40.2 release archive without executing its contents.
const sourceUrl='https://github.com/ollama/ollama/releases/download/v0.40.2/ollama-windows-amd64.zip';
export const REVIEWED_OLLAMA_MANIFESTS=Object.freeze([Object.freeze({
  sha256:'9eaec399fd941073f8ddfbd56e0447f77fca5c006b26b8b1874a7fb12719b2a0',
  bytes:27854728,
  version:'v0.40.2',
  sourceUrl,
  artifactSha256:'e29ad1d5063dd4b54b2492d9b00adab2cff9621bfa654b6c92aa8d6f1fdfe7fc',
  member:'ollama.exe',
})]);
export const OLLAMA_PUBLISHER_POLICIES=Object.freeze([Object.freeze({
  publisher:'CN=Ollama Inc., O=Ollama Inc., L=Toronto, S=Ontario, C=CA, SERIALNUMBER=2713355, OID.2.5.4.15=Private Organization, OID.1.3.6.1.4.1.311.60.2.1.2=Ontario, OID.1.3.6.1.4.1.311.60.2.1.3=CA',
  thumbprint:'716CD3BC8C02361431A18F56F98C72DE88066103',
  sourceUrl,
})]);

// Release API metadata is pinned; downloaded bytes still require verification.
export const OLLAMA_RUNTIME_ARCHIVES=Object.freeze({
  x64:Object.freeze({version:'v0.40.3',architecture:'x64',name:'ollama-windows-amd64.zip',bytes:1468053171,sha256:'e5ecff02dfc7cae8ddf6d6b7a7ac5f727ffeedf4491f44ae75ff5b0820dbbbd5',sourceUrl:'https://github.com/ollama/ollama/releases/download/v0.40.3/ollama-windows-amd64.zip'}),
  arm64:Object.freeze({version:'v0.40.3',architecture:'arm64',name:'ollama-windows-arm64.zip',bytes:209943812,sha256:'8af2eb5ff1b8e67fa3cba8adf52bcaeab41a650da318ec717182804d174ec05e',sourceUrl:'https://github.com/ollama/ollama/releases/download/v0.40.3/ollama-windows-arm64.zip'})
});
