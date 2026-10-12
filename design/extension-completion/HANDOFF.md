# Extension implementation handoff

Status: proposed design. Production implementation, packaging, installed-browser
acceptance, independent review and visual parity remain pending. This document
does not exempt a feature because it is absent from the current extension.

## Baseline and implementation seams

At `6c880446b9e884efed589f189bbb7bda3111ae6f`, the extension is an MV3 download
handoff. `browser-extension/popup.js` supports `status`, `pair`, `disconnect`;
`background.js` accepts only the exact extension popup sender. Context-menu link
proposals use the existing native host. Only `contextMenus` and `nativeMessaging`
are requested. `scripts/build-browser-extension.mjs` copies four source files,
stages local Material/search/regex bundles, enforces exact permissions, and emits
a receipt with installation and runtime verification explicitly unperformed.
Its `connect-src 'none'` content security policy is a deliberate constraint.

Production destination: retain `popup.html/js/css`; add `options.html/js/css` and
an extension-only state/action adapter under `browser-extension/`. Declare
`options_ui: {page: 'options.html', open_in_tab: true}`. Open via
`chrome.runtime.openOptionsPage()` on deliberate activation. Do not load
`docs/site/workspace.js` wholesale: its browser/desktop assumptions and navigation
are not extension acceptance. Update staging, receipt source inventory, exact
sender allowlist, permission tests and surface registry together.

Existing reuse candidates are actual source, not proof of extension compatibility:

| Concern | Current source | Required extension integration |
| --- | --- | --- |
| Components | `src/shared/surface/material.js`, `controls.js`, `registry.js` | Bundle locally; retain provenance; register extension layout components and audit actual rendered primitives. |
| Search | `search.js`, `regex-workbench.js`, `regex-worker.js` | Each list, menu, picker and settings region gets its own worker-backed bounded search and anchored builder. Keep worker URLs extension-local. |
| Workspace | `workspace-shell.js`, `group-manager.js` | Supply extension-owned tab model; preserve all four tab searches, group picker, close previews and keyboard semantics. Browser tabs are not internal workspace tabs. |
| Palette | `command-palette.js` | Register exact extension destination/control identities and live setters; Ctrl+Shift+F only while the extension page owns focus. Browser-reserved shortcuts need documented equivalents, not global interception. |
| Notifications | `notification-center.js` | Use extension operation events, deduplicate correlated IDs, redact payloads, and give retry beside the initiating control. |
| Provenance | `provenance.js` | Stage package version, source and build provenance into extension output. Unknown values show unavailable, including first paint. |
| Vocabulary | `src/shared/personal-vocabulary.js` | Reuse strict parser and private text boundary; extension-local validated cache only; no source filename or transport of mappings. |
| Local UX | `src/shared/local-ux/` | Reuse settings descriptors, guidance and redaction; replace persistence with a versioned extension-local adapter. |
| Personalization | `src/renderer/features/personalization/` | Audit imports individually. Appearance, color, typography, image geometry, motion and schedules need exact local consumers and isolated workers. Native imports stay behind capability interfaces. |
| Access | `src/renderer/features/access/` | Reuse UI and validators only after separating platform credentials, authentication, local history and session boundaries. Never borrow desktop authority. |
| Tool surfaces | `src/renderer/features/converter/`, `ollama/`, `server-manager/` | Retain structured controls in the extension, supplied by capability descriptors. Missing privileged operation means unavailable with exact reason, not a native success simulation. |
| Documentation | `src/features/documentation/catalog.mjs`, shared Markdown renderer | Package complete relevant articles, wiki content and release history offline; sandbox provider content and links. No iframe with extension privileges. |

## Product structure and behavior

**Popup.** Compact connection state, latest correlated transfer, notification
summary and routes to the full extension workspace, personal settings and help.
The visible version and localized updated-at date/time include seconds and zone.
No provenance means unavailable. A status request never proves the native host
is currently unlocked merely because a session exists in worker memory.

**Transfers.** Persistent internal tab with truthful empty state, current-session
proposals, details, bulk selection and explicit scope. Source URLs, destinations,
credentials and plaintext remain absent from native status responses. Sanitized
state/byte counts and user-safe reason codes may appear. A proposal means waiting
for desktop approval. Start, native destination selection, active Downloading and
always-on-top completion remain three separately verified desktop surfaces.

**Personalize.** Subtabs: Language, Appearance, Attention, Schedules and Privacy.
Controls include independent funny levels, dialog emoji, per-language narration
voice/rate/pitch, live display-name presentation, theme/density/font/seed color,
logo editor, element/state appearance and motion editors, five attention modes,
date/time/weekday schedule editor and personal-vocabulary picker. Every control
shows default provenance, optional exact-target guidance above it, validation,
clear/reset where applicable, history outcome and palette/search focus target.
The reference illustrates only Language/Privacy and the unavailable shared-mode
boundary; remaining views require additional addressable references before parity.

**Access.** Shared mode read/watch/rename and authenticated disable flow; six
element-lock policies; authenticator registration/import; QR pairing; protected
history access; local support tickets and wait-only unlock ladder. Credential
material never becomes browser settings. The current native protocol exposes none
of these operations. Their extension UI and mediated capability path remain
incomplete, not satisfied by a link to desktop settings. A browser-local toy lock
must disclose reset-by-clearing-storage and cannot claim OS credential protection.

**Tools.** File converter, model manager and server manager are distinct workspaces
with real typed controls, searchable catalogs and exact availability. Catalog
absence is an empty/unavailable state, never sample inventory. Converter categories:
Documents/PDF, Images, Audio, Video, Archives, Structured Data/Spreadsheets,
Code/Text and Binary Encodings. File selection is explicit, formats stay disabled
until packaged offline adapter proof exists, and batch queues use bounded chunks.
Model variants need real paginated catalog, hardware evidence and guided profiles.
Server workflows expose all four targets, edition/version/channel/flavour,
compatibility, worlds, backups, players, permissions, packs and dedicated typed
configuration. A console or generic JSON form cannot replace these controls.

**History, Notifications, Documentation, Status.** Separate internal tabs, each
with search/regex, appropriate date/action filters, bulk actions and faithful
exports. History is password-protected where required and distinguishes browser
settings recovery from actual native Git-backed history. Notifications contain
real outcomes and exact retry routes. Documentation and changelog are bundled
content with internal navigation. Status exposes observed capability/version,
retrieval age and unavailable enrollment, never invented healthy records.

## State machine and security

1. Popup starts `checking` with bounded request and unavailable provenance as needed.
2. `unpaired` enables Pair browser. Pair action is idempotence-protected and enters
   `pairing`; only explicit unlocked native approval yields `paired`.
3. Context-menu selection validates the HTTPS link and suggested name. Pairing
   never transfers. `awaiting-confirmation` represents admission to native review.
4. Native correlation alone yields `downloading`, `completed`, `failed` or
   `cancelled`. Unknown totals show received bytes without invented percentage or ETA.
5. Lost port, lock, expiry, worker restart or malformed response invalidates live
   observations. Display `unknown`/`unavailable`; retain no stale success styling.
   Require deliberate re-pair and re-submit. Never automatically replay a link.
6. Popup disposal aborts its subscriptions, not a native transfer. An open options
   tab re-reads state. Disconnect revokes local admission and reports native
   disconnect outcome separately from any already running transfer outcome.

Keep exact `sender.id` plus an allowlist of extension URLs for popup and options.
Reject arbitrary extension paths, iframes, content scripts and web-page messages.
Typed messages permit only capability-specific fields, bounded sizes and request
IDs. Every async response checks current request generation and capability epoch.
Do not widen the existing native protocol into arbitrary process execution,
filesystem paths, HTTP requests, shell commands or page inspection. There are no
content scripts, host-page grants, browsing-history access or browser download
interception in this proposal. `storage` permission, if chosen for settings, is a
new explicit manifest/staging change requiring review; `storage.sync` is excluded.

Native mediation extensions require separate authenticated, versioned, allowlisted
operations and per-operation consent. An extension ID/origin alone is not proof
against a manually launched same-user native process. Preserve current 15-minute
in-memory pairing, maximum 64 proposals, request/frame bounds, same-user pipe ACL,
revocation on lock and verified owned-process shutdown. No session token crosses
into popup text, disk persistence, exports, logs or history.

## Persistence and privacy contract

| Data | Storage and propagation | Exclusion and recovery |
| --- | --- | --- |
| Language, theme, density, tab/groups, attention choices, appearance | Versioned extension-local store; live changes update popup and options; bounded schema and migration | No sync; invalid cache reports fallback; reset previews affected scope. |
| Personal vocabulary | Separate validated private local cache, revalidated on each load; clear purges cache and derived mappings | No native messages, logs, telemetry, history, exports, prompts, source filenames or paths. Never bundle sample mappings. |
| Pairing session and proposal correlation | Service-worker memory only; native session authority remains desktop-owned | Restart/expiry loses pairing; re-pair deliberately. No restore of authorization from settings. |
| Secrets and authenticator | Native credential-vault adapter required | No secret browser cache or plaintext history. Absent adapter keeps sensitive actions unavailable. |
| Shared mode | Native shared-record read/watch/update with current revision and authenticated unlock | No independent switch masquerading as universal. Unreadable record has a visible state; preserve last verified suppression, disclose staleness, never claim mode off. |
| History | Append-only redacted events; actual Git/encrypted snapshots require reviewed native adapter | Exclude vocabulary and source file metadata; no fabricated commits; interrupted write has visible recovery. |
| Custom logo | Bounded local worker decoding and private derived cache | No originals in exported settings/history; reset purges; shipped identity unchanged. |
| External schedule sources | Native validated network adapter and OS credential vault | Existing `connect-src 'none'` stays intact; no API credential fields stored in extension JSON. |

Vocabulary controls expose empty, validating, loaded, invalid-with-prior-valid,
invalid-without-prior-valid, replace, cleared and corrupt-cache states. Enforce
256 KiB UTF-8, depth 8, 160-code-point keys, 1,000-code-point values, supported
schema, duplicate/unsafe-key rejection and dynamic entries. Validate atomically;
failure preserves only an explicitly retained prior valid cache. Clear restores
original text immediately. Replace only private authored UI text and accessible
names; preserve URLs, identifiers, code, external factual records and paths.
Shared mode suppression removes those controls and results entirely when active.
No real private file is used in reference data or captured evidence.

## Interaction and accessibility

Use genuine local Material components inside registered extension surfaces.
Minimum targets are 44 CSS pixels. Text and actions wrap; do not use ellipsis to
hide facts. At narrow widths move the inspector below content, preserve tab focus,
and keep anchored menus bounded, painted and associated with their origin.
All collections, short dropdowns and menus have local search and anchored full
regex builders. Filters/statistics begin collapsed unless active, with persisted
expanded state and an active-filter count. Every editable field has a labeled
clear action using the same value-change path. Keyboard alternatives accompany
dragging, crop handles, group moves and numeric sliders.

Internal tabs use roving arrows, Home/End, exact `aria-controls` and tabpanel
ownership. Tab mutations include grouping, move picker, pin, reopen, containing
and not-containing bulk close with review and protected-item exclusions. Browser
tab shortcuts are not hijacked. Escape closes only the active overlay and restores
focus; composed layers prevent click-through. Locked controls intercept pointer,
keyboard, palette and programmatic activation before executing any action.

Language is persisted English/Cantonese/bilingual. Bilingual primary and secondary
lines stack rather than joining long labels into one row. Narration is opt-in,
serial, respects reduced sound/motion and yields to assistive technology; unavailable
or network-backed voices are explained. Live regions announce transitions once,
not byte or countdown ticks. Error facts remain exact at both funny-level extremes.
All five attention modes are independent, off by default, and compose explicitly
with shared mode and reduced motion. No generated identity or screenshot is used.

## Verification handoff and completion boundary

- Add hand-written extension surface rows for every new destination, nested editor,
  dialog and state. Link each family to an exact consumer, localized copy,
  persistence, documentation, focused test and source/hash-bound runtime evidence.
  `families.json` is design classification only and must never be imported as green
  product proof. Current shared-registry rows do not prove extension integration.
- Prove red then green by removing a required family, specific surface consumer,
  local vocabulary control, generated provenance, sender validation, translation,
  persistence or capture receipt. Test stale responses, repeated submit, expiry,
  worker restart, popup disposal and options sender isolation.
- Run the actual root build entrypoint after production implementation. Extend
  staging to include options, bundled documentation, all workers and their hashes.
  Source ZIP staging does not prove signing, registered identity or installation.
- Drive the actual installed extension on an isolated browser profile through the
  permitted headless route. Independently prove registered identity, native caller,
  pair approval, lock revocation, Start download, active progress and completion.
  No existing browser profile is mutated to obtain this evidence.
- Compare each reference and real built screen at identical normal/minimum viewport,
  English/Cantonese/bilingual, light/dark and 100/125/150/200% display-scale tuples.
  Retain raw captures, version-1 layout probes, source/build hashes, labeled
  comparison, visual diff and intentional-deviation review. Unknown viewport or
  host scale is an acceptance gap. A CSS resize alone is not host display scaling.
- Capture no private mappings, credentials, QR secrets, personal history or paths.
  Use neutral owned fixtures with exact provenance; refresh current presentation
  only after genuine captures are inspected. Production screenshots do not yet exist
  for this design. Additional unrendered nested states in `states.json` need their
  own references before full parity can pass.
- Independent review must assess browser capability truthfulness, exact family
  classification, protocol/security separation, language/layout and real component
  reuse before implementation. The design author cannot self-approve that review.
