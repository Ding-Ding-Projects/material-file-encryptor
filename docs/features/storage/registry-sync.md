# Encrypted registry backup, restore and synchronization

Open **Docker Hub storage** directly from the main navigation. Sign-in, destination setup, synchronization, schedules and restore are at the top of this view. Enter an existing Docker Hub repository as `namespace/repository` and select its expected public or private visibility. Authentication stays in the main process and uses the supported Docker Desktop credential store. The renderer never receives credentials. Saving configuration does not upload data. Packing and image export remain available below the backup controls.

## Back up and synchronize

**Run encrypted sync now** discovers the repository's immutable snapshot references, verifies downloaded manifests and encrypted objects, and appends missing objects without replacing existing bytes. Native root admission occurs before incoming objects are written. The native engine replays encrypted transaction ancestry and preserves concurrent file versions through its existing deterministic conflict-copy behavior.

The outgoing snapshot is taken at a native transaction boundary. An unlocked or mounted vault can continue receiving later writes while its frozen encrypted object closure is staged. Each lease protects the selected parts against reclamation until staging finishes. Locked storage uses the existing source reservation. Snapshots include encrypted configuration, transaction history, activity and referenced encrypted parts; they exclude the live journal and credentials.

Every publication has a unique reference and a verified content digest. The implementation does not overwrite a shared latest tag. Two computers retain their independent local sources and caches. Concurrent edits are reconciled through immutable transaction history, rather than one computer's clock deciding which copy survives. This does not provide live coauthoring in arbitrary editors.

## Configure a schedule

Scheduling is disabled until explicitly enabled. Choose an interval from 5 minutes to 7 days, or selected weekdays and local `HH:mm` times in an IANA time zone. Configure missed-run behavior and retry delay. The calendar skips nonexistent clock-change times; a consumed repeated local occurrence is not scheduled twice.

The installed application can register an optional per-user Windows task that checks due work every five minutes while the user is signed in. The task uses the exact installed executable with `--registry-sync`, least privilege and an interactive logon token. It does not store a login password, wake the computer or sign in. Normal background startup does not automatically unlock or mount a vault. Active application instances receive the due-work request without bringing their window forward.

Startup reconciles an enabled background schedule with its owned task and checks due work promptly. An owned task must retain its enabled five-minute trigger as well as the expected executable and principal. Calendar retries retain the original scheduled occurrence. A background operation on another vault keeps that vault as its owner; select the named vault to review progress or cancel that operation.

Task replacement or removal requires the recorded task identity, executable, principal and arguments to match. A modified or ownership-uncertain task is preserved. Unavailable registration remains an explicit incomplete result, with manual synchronization still available. Native installed task execution requires separate runtime verification.

## Restore on another computer

A local vault is not required to configure a destination, list snapshots or restore. Select an immutable digest and choose a parent folder through the native folder chooser. The application creates a new uniquely named destination, verifies the encrypted inventory and publishes its configuration last. Existing vaults remain selected and unchanged. The result shows the exact restored location; choose that folder in the normal unlock workflow. Unlock still authenticates the vault key and encrypted metadata.

Restoration is a ciphertext copy, not an automatic unlock or in-place rollback. If an interrupted restoration leaves an incomplete destination, retain it for inspection and retry into another fresh destination. Never replace a usable vault merely to retry.

The application retains the exact restore destination and whether copying completed across restarts. A partial copy is labelled incomplete. Storage progress reports completed encrypted files and bytes; upload preparation counts describe prepared data, not confirmation that every network byte has arrived. Synchronizing locked storage reports deferred native replay and requires a later explicit unlock to review merged file changes.

## Cancellation and failure recovery

Cancel requests network and snapshot preparation cancellation, then waits for original native work to settle. A failed lease release retains ownership and blocks new synchronization or safe shutdown until explicit cancellation/release recovery succeeds. Interrupted uploads may leave unreferenced blobs; they never become a complete snapshot without a verified manifest. Retries discover existing publications before sending another revision. Local data and the previous complete publication remain retained.

The first client version bounds objects to 1 GiB, snapshots to 100 GiB and 100,000 objects, and one catalogue read to 1,000 snapshot references and 64 MiB of metadata. Exceeding a bound is an incomplete result, not a partial successful listing. No history deletion or automatic remote garbage collection is implemented.

## Verification boundaries

Focused tests exercise the actual local OCI registry protocol, independent publication, digest verification, schedule calculations, fresh-folder restoration, source admission and release recovery. Native fixtures separately test authenticated encrypted snapshots and conflict preservation. Tests use synthetic data in an isolated Ubuntu WSL distribution before any production upload.

Packaged GUI interaction, mounted-drive behavior, installed task execution, production Docker Hub behavior, release downloads and installed updates each require their own source-bound evidence. Source checks or WSL protocol success do not imply those results. Current evidence and remaining work are recorded in the project handoff.

This category exposes no product HTTP API. A Postman collection is not applicable.

## Guided sign-in and explicit visibility

The storage panel provides guided sign-in through the official Docker CLI device flow. It first verifies the existing protected sign-in. When no sign-in is stored, it displays a temporary device code and explicit Copy code and Open authorization page controls. The application opens only `https://login.docker.com/activate`; passwords and access tokens are never entered in the application. Checking, authorization, verification, cancellation, expiry and unavailable states remain distinct. A successful CLI exit is followed by verification of the stored sign-in before success is displayed. Existing stale or unavailable credentials are preserved rather than silently replaced.

New empty destination forms explicitly default to public. Existing saved settings without a visibility field remain private. Public destinations require authenticated metadata with matching namespace and name, public visibility and write permission; private destinations require the corresponding private visibility. The expectation is rechecked before publication. Changing the form does not change provider visibility or begin synchronization.

Public encrypted objects and snapshot metadata are downloadable by others. Encryption does not hide object sizes, identifiers or publication timing. The provider's free public-repository allowance remains subject to its current limits and fair-use rules. Do not enable paid upgrades or use real data for a synthetic verification run.

The sign-in state machine, renderer controls and physical packaged-resource resolution have focused source-test coverage. The downloaded `v1.845.1` relay passed native compilation, actual ConPTY initialization, owned-child cancellation and natural-exit checks with a fixed synthetic child. See [the source-bound relay receipt](../../evidence/registry-login-native-81cb8ca5.json). Those results do not establish actual device authorization, installed behavior or the subsequently changed navigation. Built GUI acceptance is recorded separately in the handoff.

## Version-bound conflict review

The desktop bridge exposes `listRegistryConflicts` and `resolveRegistryConflict` only through the selected vault session. Paging is bounded; conflict identifiers and version identifiers use fixed hexadecimal forms. Resolution freezes the reviewed identifiers, opens a main-owned localized confirmation with Cancel selected, and checks session, shutdown and registry admission again before the native request. Native replay must compare the exact versions atomically. A changed review requires refresh and reselection.

Deletion intent is a separate transaction identifier, with a null preserved live version. It is never represented as an existing file. Historical divergence recovery must return two distinct actual paths; missing or malformed results stay unverified. Confirmation cancellation sends no native mutation. Current source checks do not establish packaged or mounted acceptance.
