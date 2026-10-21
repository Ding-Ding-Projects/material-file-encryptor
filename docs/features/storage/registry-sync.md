# Encrypted registry backup, restore and synchronization

Open **Storage maintenance**, then **Registry storage**. Enter an existing private Docker Hub repository as `namespace/repository`. Authentication stays in the main process and uses the supported existing Docker Desktop sign-in. The renderer never receives credentials. Saving configuration does not upload data.

## Back up and synchronize

**Run encrypted sync now** discovers the repository's immutable snapshot references, verifies downloaded manifests and encrypted objects, and appends missing objects without replacing existing bytes. Native root admission occurs before incoming objects are written. The native engine replays encrypted transaction ancestry and preserves concurrent file versions through its existing deterministic conflict-copy behavior.

The outgoing snapshot is taken at a native transaction boundary. An unlocked or mounted vault can continue receiving later writes while its frozen encrypted object closure is staged. Each lease protects the selected parts against reclamation until staging finishes. Locked storage uses the existing source reservation. Snapshots include encrypted configuration, transaction history, activity and referenced encrypted parts; they exclude the live journal and credentials.

Every publication has a unique reference and a verified content digest. The implementation does not overwrite a shared latest tag. Two computers retain their independent local sources and caches. Concurrent edits are reconciled through immutable transaction history, rather than one computer's clock deciding which copy survives. This does not provide live coauthoring in arbitrary editors.

## Configure a schedule

Scheduling is disabled until explicitly enabled. Choose an interval from 5 minutes to 7 days, or selected weekdays and local `HH:mm` times in an IANA time zone. Configure missed-run behavior and retry delay. The calendar skips nonexistent clock-change times; a consumed repeated local occurrence is not scheduled twice.

The installed application can register an optional per-user Windows task that checks due work every five minutes while the user is signed in. The task uses the exact installed executable with `--registry-sync`, least privilege and an interactive logon token. It does not store a login password, wake the computer or sign in. Normal background startup does not automatically unlock or mount a vault. Active application instances receive the due-work request without bringing their window forward.

Task replacement or removal requires the recorded task identity, executable, principal and arguments to match. A modified or ownership-uncertain task is preserved. Unavailable registration remains an explicit incomplete result, with manual synchronization still available. Native installed task execution requires separate runtime verification.

## Restore on another computer

A local vault is not required to configure a destination, list snapshots or restore. Select an immutable digest and choose a parent folder through the native folder chooser. The application creates a new uniquely named destination, verifies the encrypted inventory and publishes its configuration last. Existing vaults remain selected and unchanged. The result shows the exact restored location; choose that folder in the normal unlock workflow. Unlock still authenticates the vault key and encrypted metadata.

Restoration is a ciphertext copy, not an automatic unlock or in-place rollback. If an interrupted restoration leaves an incomplete destination, retain it for inspection and retry into another fresh destination. Never replace a usable vault merely to retry.

## Cancellation and failure recovery

Cancel requests network and snapshot preparation cancellation, then waits for original native work to settle. A failed lease release retains ownership and blocks new synchronization or safe shutdown until explicit cancellation/release recovery succeeds. Interrupted uploads may leave unreferenced blobs; they never become a complete snapshot without a verified manifest. Retries discover existing publications before sending another revision. Local data and the previous complete publication remain retained.

The first client version bounds objects to 1 GiB, snapshots to 100 GiB and 100,000 objects, and one catalogue read to 1,000 snapshot references and 64 MiB of metadata. Exceeding a bound is an incomplete result, not a partial successful listing. No history deletion or automatic remote garbage collection is implemented.

## Verification boundaries

Focused tests exercise the actual local OCI registry protocol, independent publication, digest verification, schedule calculations, fresh-folder restoration, source admission and release recovery. Native fixtures separately test authenticated encrypted snapshots and conflict preservation. Tests use synthetic data in an isolated Ubuntu WSL distribution before any production upload.

Packaged GUI interaction, mounted-drive behavior, installed task execution, production Docker Hub behavior, release downloads and installed updates each require their own source-bound evidence. Source checks or WSL protocol success do not imply those results. Current evidence and remaining work are recorded in the project handoff.

This category exposes no product HTTP API. A Postman collection is not applicable.
