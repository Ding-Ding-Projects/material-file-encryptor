# Feature documentation

## Storage and drive

- [Encrypted storage and offline cache](storage/native-vault.md)
- [History and Recycle Bin](storage/history-and-recycle-bin.md)
- [Selected-file versions and encrypted activity](storage/file-history-activity.md)
- [Managed transfers, journal and safe lifecycle](storage/transfer-lifecycle.md)
- [Encrypted Git transport](storage/git-transport.md)
- [Windows Explorer drive and native protocol](drive/README.md)

## Desktop workflows

- [Shared tabs, search, command palette and notifications](surface-foundation/README.md)
- [Language, narration, schedules and attention modes](interface/local-personalization.md)
- [Element appearance editor and logo customization](interface/appearance-editor.md)
- [Local personal vocabulary](interface/personal-vocabulary.md)
- [Access, authenticator and support desk](access/local-access.md)
- [Local file converter](converter/README.md)
- [Local model suite](ollama/README.md)
- [Offline documentation, changelog, status and delivery inventory](platform/documentation-and-status.md)
- [Modern surfaces and clearable fields](interface/modern-fields.md)
- [Startup registration readback](interface/startup-registration.md)

## Verification and delivery

- [Native helper measurements and strict limits](performance/native-helper.md)
- [Desktop packaging and verification](desktop/README.md)
- [Preview verification and delivery](release/preview-verification.md)
- [Current integration status](platform/current-integration.md)
- [Interface design](../../DESIGN.md)

Each article distinguishes source implementation, focused checks, host integration and actual runtime acceptance. The feature delivery inventory keeps all 208 desktop/site rows unverified until their complete evidence exists. Historical captures and releases retain their original source boundaries.

The application introduces no public HTTP API. Its native JSONL channel and privileged feature bridge are local protocols, not a public web API. The local model service consumes Ollama's API, and the status module consumes its configured service. No new Postman collection is applicable to these modules.
