# File hosting design

Design canvas for the self-hosted download server that turns Docker Hub shares into web links, and the desktop screens that deploy and manage it.

| Board | What it shows |
|---|---|
| `Main.dc.html` | One-click deploy wizard: this computer or an SSH host, port and cache, public address (none, quick Cloudflare tunnel, own tunnel), deploy progress and the verified links |
| `CreateLink.dc.html` | Create a download link from a shared file: expiry, delete after N downloads, link and QR code |
| `Manage.dc.html` | File hosting page: health, cache use, instance actions and the link list |
| `Download.dc.html` | The hosted download page (fluid), with ready, passphrase, downloading, done and expired states |
| `DownloadPhone.dc.html` | The same page at 390 px |

Every board has accent and motion tweaks; the download boards also have a state tweak. The implementation builds to these boards.
