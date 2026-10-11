# Local model suite

The suite is mediated by the privileged desktop process or an authenticated loopback adapter. The renderer receives only named actions and events. It never receives a generic HTTP client, executable launcher, or arbitrary endpoint setting.

- [Operation, boundaries and recovery](./local-models.md)
- [廣東話操作及復原指引](./local-models.zh-HK.md)
- [Native host trust boundary](./native-host.md)
- [Reviewed Windows release provenance](./release-provenance.md)

The Ollama HTTP API is an external local service API; this feature does not introduce a public HTTP API or a Postman collection.

Catalog records preserve each variant's own description and capabilities. Family summaries are exposed separately as `familyDescription` and `familyCapabilities`; a family-level capability does not prove that every variant supports it. Overall catalog completeness remains unknown even after every observed linked page has been enumerated.
