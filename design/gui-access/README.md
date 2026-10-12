# Access workspace design reference

This target-owned state inventory specifies the real access implementation. It is a design reference, not a screenshot or runtime result. The shared shell design reference supplies the surrounding navigation and Material Web components.

## Structure

A compact page heading and convenience-lock disclosure precede four Material primary tabs: Local profile, Element locks, Authenticator, and Support Tickets. The active workflow owns one panel. Credentials remain in their originating fields across language refresh; changing the workflow closes waiting challenges and hides camera/QR output. Authenticator registration expands only through Add or Edit, leaving the account list as its normal workspace.

The profile panel groups its password, status, primary setup/unlock actions and logout. The lock list has local search and an explicit empty creation route through each element's context menu. The non-modal wizard carries a read-only exact target and its own policy, factors, session mode and disclosure. A bounded painted floating surface carries unlock and lock setup, with focus returned on cancellation.

## Components and spacing

Use actual Material Web filled/text buttons, outlined fields/selects, checkbox, switches, slider, tabs, and the registered file-picker composition. Do not substitute styled native controls. Use surface-container-low panel backgrounds, outline-variant boundaries, 20px rounded groups, 12px internal gaps, 44px minimum action targets and fluid field widths. Floating prompts use surface-container-high, a visible outline and elevation, bounded scrolling, and 24px corners. All state must remain readable at the exact tuples in state-inventory.json.

## Interaction acceptance

The state inventory is hand-written and names each profile, lock, waiting, authenticator, QR, support and confirmation state. Collection workbenches own isolated queries and receive labels only, never credential values. Each dropdown obtains the shared adjacent searchable menu with its own anchored full regex workbench.

Test all three language modes, both themes and four scales at both supported viewport sizes. Physical display scaling remains separate from browser zoom evidence. Exercise keyboard focus, Escape, cancel/retry, live translation, one-activation expiry and nested Shadow DOM admission. Use isolated synthetic credentials, clear them before evidence retention, and omit all QR, secret and generated-code pixels from publishable captures.

## Verification boundary

Focused Node tests establish logic and primitive construction, including deliberate red/green picker and cancellation regressions. They do not establish real layout, assistive technology, physical camera operation, native vault integration, installer behavior or physical display scaling. The integrated built acceptance lane owns those receipts.

## Owned packaged access producer

`scripts/gui-acceptance-access-fixtures.mjs` exports `createAccessFixtures({opened})`. The packaged acquisition producer supplies its exact already-opened session from `openGuiAcceptancePackage` through a lazy access provider. Explicit caller-supplied `fixtures.access` is preserved. Unrelated baseline capture neither constructs the provider nor inspects or configures access state. Access capability admission constructs it on demand; missing owned-session admission reports a named unavailable capability. Construction launches nothing. The provider revalidates the packaged receipt, executable/resource hashes, lifecycle identity, canonical isolated profile, production host data-folder readback, exact page URL, native storage/cache/drive identity, and unchanged mount state before each lifecycle operation. Drive M is excluded.

The repeatable inventory subset is `access-profile-locked`, `access-profile-unlocked`, `access-removal`, `access-confirmation`, `access-authenticator-registration`, and `access-qr-hidden`. The adapter checks the complete state/action capability list before native preparation. The first enter requires an unconfigured profile, no attempt history, and no authenticator, element-lock, or support records. Do not share this session with another producer that mutates access records.

Profile setup and successful unlock use the existing registered controls and a public synthetic fixture input. A locked-profile `begin-unlock` makes one incorrect synthetic attempt and requires the production host's failure counter to advance while the grant remains absent. Its `cancel-unlock` exercises successful unlock followed by logout, because this profile workflow has no separate cancel dialog. Private fields must be empty before evidence is returned. Presence and grant checks return no credential records, verifiers, QR data, or generated codes. An unrelated host exception cannot count as a denied grant.

Confirmation preparation creates a ticket through the production editor, reads its generated identity from persisted storage, edits that same identity through Edit, and opens the existing two-key removal controls. Early confirmation must preserve that durable identity. Restoration removes only that owned ticket through the same confirmation controls; a changed or unexpected record stops restoration. The component checks exercise these causal observations with a modeled transport; they are not packaged runtime evidence.

Restoration means closed prompts, cancelled registration, empty sensitive fields, cleared attempt state through successful authentication, logout, removed owned tickets, and unchanged native drive state. A newly configured synthetic profile remains in the isolated profile, explicitly reported as `profileRetained` for the owning session lifecycle to retain or retire. The provider does not erase protected history, delete the profile, rewrite credential storage, or claim byte-identical profile rollback.

Unavailable states fail closed: replayable first-time setup, element-lock creation and one-use native pickers, populated authenticators, waiting ladders, protected history, and support export. The current API has no safe production-control route for repeatedly deleting and recreating a configured profile, and this producer has no download/native-picker lifecycle. Their inventory entries remain acceptance gaps. Real packaged execution, inspected screenshots, all geometry/language/theme/scale tuples, physical input, and native teardown still require the owning acceptance run.

Registration action acceptance has explicit causal preconditions. Before Add, the producer uses Cancel when necessary and observes a closed panel with all six registration fields empty; Add must then open it. Before Cancel, it populates URI, manual input, current code, issuer, account, and group through registered controls using only public synthetic strings, observes populated booleans, and retains no values or capture. Cancel must hide the panel, empty all six fields, leave QR output hidden and empty, and leave camera output hidden with no stream. This does not start a physical camera or claim physical-camera teardown evidence. A one-use action-preparation receipt prevents replaying a prior transition. Negative modeled handlers for no-op Add and removed Cancel clearing must fail.
