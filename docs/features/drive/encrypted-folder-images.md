# Encrypted folder images for Docker Hub

Storage maintenance can package the selected vault's **encrypted storage folder** as a data-only Docker image. It is not an application container: the fixed image has no runtime, entrypoint, executable or custom Dockerfile. Nothing is uploaded automatically.

## Prepare, review, build, upload

1. Synchronize the vault while unlocked, then lock it. The image contains storage only, **not pending cache changes**. This workflow rejects sparse private-repository transport; it requires complete folder storage.
2. In Storage maintenance, enter an existing Docker Hub target as `namespace/repository:tag` and prepare the snapshot. Review the target, vault identity, encrypted file count and bytes.
3. Build locally using an existing Docker Desktop installation in Linux-container mode. Only an allowlisted local Windows named-pipe daemon is accepted; remote Docker contexts are refused.
4. Choose Upload and accept the final confirmation. Existing Docker Desktop credentials authenticate with Docker Hub. The application verifies that the repository already exists, is private, and allows writes immediately before uploading. It never creates a repository, signs in, or silently falls back to public visibility. The chosen tag may replace an existing tag.

The repository must remain private. Do not change repository visibility or manipulate the image tag in another Docker client during the action. Docker does not provide a cross-client transaction that locks visibility and tags for this entire workflow. A failed or interrupted upload is **unverified**, not proof that nothing reached the registry. Inspect Docker Hub before retrying; the application never automatically retries an uncertain upload.

Preparing is local. Building sends only the reviewed context to the local Docker daemon and does not request an image upload. Upload uses Docker's existing credential mechanism and the official Docker Hub API. Existing credentials must support that API; unsupported identity-token-only sign-ins fail closed. Passwords and tokens are not placed in process arguments, logs, snapshots or preferences. If Docker prerequisites or privacy verification are unavailable, the action stops with instructions instead of installing software or changing credentials.

## What is included

The allowlist is `vault.json` and recognized encrypted objects under `parts`, `commits`, and `activity`, plus a generated restore manifest. Configuration includes the encrypted wrapped vault key and password-derivation metadata necessary for restoration, not an unwrapped key or password. Plaintext exports, arbitrary extra files, key files, caches, Git data, symlinks, hardlinks and unexpected directory contents are refused rather than silently copied.

A native locked-source lease prevents another session in this application from reopening the source while it is copied. Filesystem identity, format structure, repeated inventories and SHA-256 checks detect changes during preparation. External processes must also leave the folder unchanged. The snapshot contains no source paths. Before building, its exact inventory, hashes, manifest and fixed Dockerfile are checked again. Docker receives an explicit-entry tar stream, not an arbitrary directory: only the reviewed files and the in-memory fixed Dockerfile/manifest are sent, and streamed file bytes must still match their recorded hashes before a build can be accepted.

This structural inspection is not decryption or cryptographic authentication. It cannot prove that deliberately forged records are authentic ciphertext. Only package vaults created and opened by this application, and retain a tested original backup. Existing native encryption is unchanged. Encryption does not prevent offline password guessing; use a strong password and keep key files separately.

Discard removes the application's prepared snapshot, not the source vault or the built Docker image. App shutdown removes prepared snapshots when it can safely finish. A crash may leave an encrypted snapshot in the application's `VaultImages` data directory. Built images remain in Docker until you remove them using Docker's own tools.

## Restore without starting a container or overwriting data

Use the recorded registry digest rather than a mutable tag. On a machine with Docker, pull that exact image. Create a **new** named container from it with an arbitrary command, but never start it; the command is only to satisfy Docker's create interface. Copy `/vault` and `/manifest.json` out using `docker cp`, then remove only that temporary container.

For example, replace the placeholders and use a new empty destination directory and a unique container name:

```powershell
docker pull namespace/repository@sha256:RECORDED_DIGEST
docker create --name unique-vault-restore namespace/repository@sha256:RECORDED_DIGEST /not-executed
# C:\NewVaultRestore must not exist. Stop if it already exists.
New-Item -ItemType Directory -Path C:\NewVaultRestore -ErrorAction Stop
docker cp unique-vault-restore:/vault C:\NewVaultRestore\vault
docker cp unique-vault-restore:/manifest.json C:\NewVaultRestore\manifest.json
docker rm unique-vault-restore
```

Do not copy over an existing vault or cache. Check every manifest relative path, length and SHA-256 against the extracted files, and reject unexpected files or links. Then use Unlock with the extracted `vault` folder, a **new separate empty cache**, and the original password or separately retained key file. Verify important files before relying on the restored copy. This feature does not store recovery credentials and cannot recover a forgotten password or missing key file.

## Validation scope

Automated tests use synthetic encrypted-format fixtures and mocked Docker/Hub calls. They do not upload vault data, read real credentials, install Docker, or demonstrate an end-to-end Docker Hub restore. A real private-registry upload and restore require separate explicit action and remain unverified until performed.
