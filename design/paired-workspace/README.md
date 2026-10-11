# Paired workspace implementation handoff

## Production composition

The workspace is a companion for documentation, preferences and explicitly approved local tools. It does not expose encrypted-drive operations. A stationary Material Design 3 navigation rail and top bar frame actual open-work tabs. Only the selected `.workspace-view.view` scrolls. Below 840 CSS pixels the rail becomes a dismissible drawer; the content keeps its full width. New profiles open documentation only. Persisted legitimate work tabs remain recoverable.

The host supplies `.sidebar` as `navigationHost` to `mountSurfaceFoundation`. The shared rail must derive destinations from registered labels, including `connection`, without inventing desktop drive destinations. The shared foundation owns navigation, menus, focus handling and registered Material controls.

## Stable acceptance targets

- Views: `#workspace-documentation`, `#workspace-connection`, `#workspace-personalization`, `#workspace-access`, `#workspace-converter`, `#workspace-ollama`, `#workspace-status`.
- Pairing: `.local-adapter form`, `md-outlined-text-field[type=url]`, `md-outlined-text-field[type=password]`, and `md-filled-button[type=submit]`.
- Explicit limits: `.workspace-capabilities`, visible in Connection.
- Private wording: `#workspace-wording-status`. Only authenticated local access plus live pairing can apply it.
- Shared settings: five-second polling with generation invalidation on pairing loss and replacement. Obsolete responses must not change the current session.

## Bounded service acceptance

Use synthetic local services for deterministic component acceptance, clearly separated from real pairing proof. Exercise a saved external source and stable schedule id; unchanged versus changed shared snapshots; disconnect during a read; a new session while an old read remains pending; settings guidance opening its bundled concept; history pruning after exact confirmation and denial after authorization loss; and old model events arriving after reconnection.

Native image normalization, font metadata scanning, schedule credential storage/clearing and runtime-port configuration remain intentionally unavailable to browser callers. No frontend adapter may widen the host allowlist. Installed font names remain an admitted operation. Browser image processing uses its existing local worker. Never enter a live credential in acceptance fixtures.

## Verification boundary

Focused source and synthetic service checks are recorded by the implementation lane. They do not prove built layout, rendered font identity, actual native pairing, real model operations or deployment. The integrated candidate still requires normal/minimum viewports, English/Cantonese/bilingual, light/dark and 100/125/150/200 percent display-scale captures, real interactions and source-bound receipts through the approved hidden route. Preserve all unavailable results honestly.
