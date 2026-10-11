# Bundled QR components

These components run locally and make no network requests.

| Component | Pinned version | License | Registry archive SHA-256 |
| --- | --- | --- | --- |
| qrcode-generator | 1.4.4 | MIT | `ab6ed47d378877441deae95972e07b2716c26545a735a23aa6b9d442b33026ed` |
| jsqr | 1.4.0 | Apache-2.0 | `b5299b37917a1fe7a8cab9dd5cc6b8accf82663add80abe5bf7761a921cc6602` |

Sources were obtained with `npm pack qrcode-generator@1.4.4` and `npm pack jsqr@1.4.0`. The encoder source has one appended ES module default export. The decoder receives an isolated object for its UMD global target and exports that object's decoder as an ES module. Algorithm source remains unchanged. Corresponding license texts are retained beside each source.
