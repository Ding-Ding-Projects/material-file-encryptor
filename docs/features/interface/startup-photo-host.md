# Verified startup photo host

The desktop host resolves one optional startup photo from the [authoritative public catalog](https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json) and the [published photo releases](https://github.com/Ding-Ding-Projects/dim-sum-photos/releases). Catalog English and Traditional Chinese names remain authoritative. Only normal published releases whose tags begin with `catalog-v1` supply photos. No copied catalog, generated substitute or repository-tracked photo is used by this service.

The read-only `surprise/resolvePublishedDish` request accepts an empty payload and returns either `null` or one bounded result containing bilingual names, the approved public URL, publication state and a verified image data URL. The renderer does not fetch the photo. Browser companion requests cannot invoke this desktop route.

The host uses the GitHub CLI to resolve the current catalog revision, read that exact revision and inspect published asset metadata. It verifies the asset URL, byte count and SHA-256 digest before decoding. Metadata responses are limited to 16 MiB; one image is limited to 4 MiB, 4096 pixels per axis and 16,777,216 pixels total. Only PNG, JPEG and WebP signatures are accepted, and the native decoder must confirm matching dimensions. Unsupported or undecodable images are omitted.

A private application-data cache stores at most one current image and its receipt. The receipt includes catalog source and revision, catalog digest, release, image URL and digest, byte count, dimensions and media type. Each new process still verifies public metadata before using matching cached bytes. Missing CLI access, offline transport, unpublished assets and failed verification return `null`, including when an old cached image exists. Closing the service aborts its owned command and suppresses late results.

This host resolves images only. The startup coordinator owns the single 10% draw, first-run and busy/update/error exclusions, School mode and quiet-state suppression, and the non-blocking, focus-preserving, auto-dismissed presentation. A successful resolver result does not establish that the startup coordinator displayed anything.

The host also exposes `personalization/accessibilityState` from the runtime's actual `accessibilitySupportEnabled` boolean and publishes the `accessibilityState` event when runtime support changes. The result reports known and enabled state with a runtime source. It does not prove that a screen reader is running or that narration was heard. Renderer narration should remain off until the relevant state is known; its presentation and accessibility verification are separate.

Focused tests use synthetic byte fixtures and mocked transport to cover source restrictions, publication eligibility, digest and dimension rejection, private cache receipts, offline omission, cancellation and exact runtime state. Actual startup display, native decoding and assistive-technology interaction require separate integrated evidence. The service introduces no public HTTP API, so a Postman collection is not applicable.

## Startup timing and bundled command resolution

The photo host resolves `gh` through the same digest-verified bundled tool receipt
as the other desktop services. It receives the application tools directory and
never relies on a global CLI or host `PATH`. An absent or changed bundled executable
returns unavailable without falling back to an unrelated executable.

A transient startup update check defers evaluation until it settles. Deferral does
not consume or repeat the single 10% draw. The startup opportunity lasts at most
15 seconds from coordinator creation; expiration or a late result never triggers
a later display. First-run, error, active work, actual updates, quiet state and
School mode still suppress presentation. Trusted pointer, keyboard or input activity
closes the opportunity, and an open modal also prevents a photo appearing while a
form is being completed. An already visible card is dismissed on interaction.

Focused checks cover check-to-current transitions, terminal exclusions, late results,
trusted interaction, the default bundled resolver and changed executable rejection.
These are deterministic source/service checks, not installed runtime or visible
presentation acceptance. No photo is copied into this repository.
