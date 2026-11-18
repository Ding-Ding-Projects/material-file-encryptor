# Share a file through Docker Hub

Send one file from an unlocked drive to someone else. The app encrypts the file on this computer with a new key, uploads the encrypted data to your public Docker Hub repository `<account>/material-file-encryptor-shares`, and gives you one command. Whoever has the command, and Material File Encryptor, can download and open the file. They do not need a Docker Hub account.

The actions are **Share via Docker Hub…** (the drive command bar, a right-click on a file, and the command palette), **Receive a shared file…** and **Shared files** (the command palette, so the New tab catalog lists them, and a **Shared files** link on the Docker Hub storage page).

## Share a file

1. Unlock and mount the drive, then select one file.
2. Choose **Share via Docker Hub…**. Sign in to Docker Hub if you are not already; the guided sign-in only opens the official page.
3. Optionally turn on **Also require a passphrase** and type it twice (at least 8 characters).
4. Choose **Share**. The dialog shows each phase: reading the file, checking the repository, encrypting, uploading and saving the share to your list. **Cancel** stops it; nothing readable is uploaded either way.
5. Copy the command, the link, or the ready command line, and send it privately.

A share holds up to 1 GiB. The repository is created as a public repository the first time. It is separate from drive backups, and shares are tagged `share-<random>`, so drive listing never shows them.

## What the recipient does

Any one of these works:

- Paste the command into **Receive a shared file…**.
- Open the link. Installing the app registers the `material-file-encryptor://` link handler for the current Windows account, and uninstalling removes it.
- Run the command line, which uses the default per-user install location:

```
"%LOCALAPPDATA%\MaterialFileEncryptor\MaterialFileEncryptor.exe" --receive "mfe-share:v1:..."
```

The app downloads the share anonymously, checks the digest, and decrypts the first part to show the file name and size. **Save as…** chooses any location outside encrypted storage; **Save into the drive** writes it into the mounted drive under a new name. The whole file is authenticated again while it is written, to a temporary name beside the target that is renamed only after the last check passes.

A wrong key, a changed or damaged file, a cut-off file, a share made by a newer app version, or a command that points anywhere other than Docker Hub is refused with a plain message. The message never repeats the command.

## The command

```
mfe-share:v1:registry-1.docker.io/<account>/material-file-encryptor-shares@sha256:<digest>#<key>
```

- `<digest>` names the exact encrypted upload; the registry and the app both verify it.
- `<key>` is the 32-byte share key. With a passphrase it is `p:` followed by the key wrapped with your passphrase, so the command alone opens nothing.
- The link form puts the key after `#`, the part of a link that is never sent to a server.

## Shared files

**Shared files** lists what you shared from this computer: name, size, date, and whether it has a passphrase. **Copy command** copies it again. **Revoke** removes it from Docker Hub; **Revoke all** does that for every active share. **Remove from list** clears a revoked entry.

Revoking deletes the upload itself, not only its tag, because Docker Hub keeps an untagged upload downloadable by its digest. A share is marked revoked only after an anonymous check can no longer find it by tag or by digest. If Docker Hub does not confirm that, the share stays active and **Revoke** can be tried again.

## Security notes

- The command is a bearer secret. Anyone who has it, and has not been blocked by a revoke, can open the file. Send it privately, for example in a direct message rather than a public channel.
- Shares live in a public repository. Anyone can list the tags and download the encrypted data, which shows only its size. Nobody can read it without the command.
- The file name, size and modified time are inside the encrypted data. The upload carries no annotation or description of its own.
- The format is AES-256-GCM in 1 MiB chunks with a fresh random key per share. Each chunk has its own nonce built from a counter and a final-chunk flag, so chunks cannot be reordered, repeated or cut off without the check failing.
- The passphrase is stretched with scrypt (N = 2^17, r = 8, p = 1) and never uploaded or stored. Send it another way than the command. A forgotten passphrase cannot be recovered; share the file again.
- Your list of shares is encrypted with Windows protected storage, because each entry includes its command. When protected storage is unavailable, the list is kept only until the app closes and nothing is written.
- Revoking cannot recall a copy someone already downloaded. Docker Hub may keep the encrypted data in its own storage until its cleanup runs, but it can no longer be found through the command.
- The plaintext is read from the mounted drive and encrypted in memory. It is never written to a temporary file.

## Verification

The automated tests cover the format (round trips at chunk boundaries, a wrong key, a flipped bit in any chunk, truncation, reordered and repeated chunks, nonce uniqueness, an unknown version), the passphrase wrap, strict command parsing including malicious input, the encrypted share list, and a complete share, receive and revoke through the real registry client against a fake registry. One real share and receive of a tiny test file through Docker Hub, followed by a revoke, was run once on the development computer; see the handoff for exactly what that covered.
