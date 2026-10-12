# Local personalization

`mountPersonalization(container, services)` mounts Language and voice, Appearance, Schedules, and Attention destinations without changing the encryption engine. Import `personalization.css` and `appearance.css`. The return value exposes `store`, `apply()`, `translate()`, `narrator`, `appearance`, `open(sectionId)` and `destroy()`.

Settings use a bounded version-1 record. English and Cantonese message style levels are independent, range from 1 through 5, and default to 5. The language can be English, Cantonese or bilingual. The emoji preference applies to dialog decoration, not accessible labels. A translator can apply the separately supplied personal vocabulary service only after `isAuthenticated()` returns exactly `true`.

## Host integration

- `notify(message)` reports a non-blocking notification.
- `history(record)` receives settings changes without credentials, image bytes or vocabulary payloads. A production host must implement durable protected history; this module does not claim to create a Git history repository itself.
- `onChange(settings)` receives the effective settings for the application's existing rendering and message paths. Apply the provided language, funny levels, theme, density, font, motion, display name and attention values consistently across those paths.
- `sharedSettings.read()`, `write(record)` and `subscribe(callback)` provide the shared local School-mode record and live changes across desktop applications. `setSharedCredential(value)` and `verifySharedCredential(value)` must use the protected local credential service. The browser fallback is origin-local only and is explicitly described as such; it is not universal cross-application storage.
- `attachSearch(input, scope)` attaches the application's full anchored regex builder to each local settings search. The integration must also provide that builder for picker menus.
- `fetchScheduleSource(source, constraints)` performs external requests at the privileged boundary, rejects unsafe targets and redirects, bounds bytes and time, and obtains credentials from the credential vault. No credentials belong in the settings record. Without this adapter, external rules remain unavailable and local rules continue.
- `vocabulary.isAuthenticated()` and `vocabulary.replace(text)` expose only the local authenticated rendering boundary. Loading, encrypted cache persistence, clear and replacement are handled by the separate upload service.

## School mode

The selected mode name replaces the shipped label. Enabling it forces English and removes the Cantonese, bilingual, funny-level and emoji controls from this surface. Prior preferences remain saved and return after a verified disable. Narration becomes English. The host must suppress all corresponding routes, results, images, surprises and other surfaces, not merely this panel. This is a convenience lock. It is not encryption and does not protect data from someone who can reset the local application record.

## Narration and attention

Narration starts off. Voice enumeration subscribes to late platform updates. A voice choice stores the stable URI, retains missing choices and reports fallback or unavailable voices. English and Cantonese each have a picker. Both speaks serially. Rate is bounded to 0.1–3 and pitch to 0–2. Category cooldown is 2.5 seconds; urgent events bypass it. A host signal yields to active assistive technology.

Focus, Low stimulation, Time awareness, One thing at a time and Momentum are independently persisted and off by default. Low stimulation disables nonessential motion. Time awareness displays elapsed session and inactivity time. The selected next action survives reload. A 20-minute inactivity prompt offers an hour-long dismissal. Focus styling requires the host to mark secondary content with `data-focus-secondary`; it never removes content.

## Schedules

Rules have stable ids, labels, enabled state, priority, date limits, weekdays, timezone, local values and optional external sources. Start is inclusive and end is exclusive. Equal times mean all day. Cross-midnight windows use the starting day's weekday and date. Repeated daylight-saving wall times match both occurrences; nonexistent times never occur. Higher numeric priority wins; equal priority uses lexical id order. Scheduled overrides do not overwrite saved base values.

The startup surprise helper evaluates at most once, draws at 10%, excludes first run, active work, errors, updates, quiet mode and School mode, and requires a verified published catalogue adapter. It does not bundle or fabricate images.

## Verification and remaining work

The Private local history tab stores password-encrypted snapshots in a separate bounded local record. Its password is independent of element locks and local-profile access. Records have chained integrity hashes and authenticated encryption, and snapshot redaction excludes credentials, authenticator secrets, personal vocabulary and custom images. It supports search, date/action filters, comparison, append-only restore and labels, redacted metadata export, retention and explicitly confirmed pruning. The browser implementation is an encrypted journal, not a Git repository. Desktop integration may supply `historyManager` and `historyCredentialStore` for native storage. Automatic settings recording begins only while history is unlocked; changes made while it is locked are not falsely described as recorded. Full native Git-backed history remains a separate integration requirement.

`node --test test/local-personalization.test.js` covers settings persistence, unsafe input, mode restoration, overnight/date boundaries, precedence, external-generation races, language boundaries, serialized narration and startup exclusion. These are module checks, not proof of desktop or browser rendering. Full picker search integration, all-message localization, protected durable history, full advanced appearance capabilities, verified shared desktop record propagation, safe external networking and real built-surface capture remain host integration or subsequent verification requirements. No claim of full universal feature completion is made by these modules.

## 廣東話說明

個人設定包括語言及語音、外觀、時間表同專注設定。英文同廣東話趣味程度各自儲存，預設為 5。啟用學校模式後，畫面只用英文，原有語言同趣味設定會保留，通過本機驗證關閉模式後恢復。此模式只係介面限制，唔係資料保安。

語音旁白預設關閉，聲線按本機實際可用資料顯示，兩種語言依次播放。時間表使用指定時區；跨午夜時段歸開始當日，臨時設定唔會覆蓋原有設定。專注選項各自開關，預設全部關閉。桌面共用記錄、受保護歷史、外部來源同完整畫面驗證需要主程式整合，未驗證部分唔會當成完成。

### Incremental display projection

Personal wording is projected onto eligible display text and accessibility attributes in bounded event-loop slices. The view does not reject a document because its total node count exceeds a fixed ceiling. Each slice visits at most 500 nodes by default (configurable up to 2,000); continuation uses a timer so input and painting can run between slices. Ordinary mutation records revisit their changed subtrees, including discovered shadow roots, rather than rescanning the document.

`refresh()` retains the small-document synchronous result and returns `{ projected: false, reason: 'pending' }` while more slices remain. Integrations requiring a completed display can await `whenSettled()`. Revoking activation or destroying the view cancels outstanding work and restores only tracked modified display values immediately. A replacement exception restores earlier writes and settles with `replacement-failed`. Canonical application data, inputs, code blocks, exports, and network requests are not rewritten. The projection is incremental, so a partially completed active pass can temporarily show both canonical and personalized display text; it is not an atomic whole-document paint.

Focused verification covers a synthetic document exceeding 42,000 nodes, bounded scheduling, changed-subtree updates, shadow-root removal, cancellation, restoration, and rollback after a later-slice exception. This does not by itself establish native runtime or installer acceptance.

## Material control migration

The five destinations retain their existing setting stores and protected host adapters. Text and search fields use outlined Material fields; finite choices use outlined selects with adjacent searchable actions and the shared regex builder. Checkbox and range settings use Material checkbox and slider controls. Date, time and file inputs use registered compositions containing actual platform pickers behind Material fields and buttons. The control kind is chosen before construction.

Accent entry retains a typed field and offers the existing color workbench in an expandable section. Only a solid accent is accepted. Motion and typography choices use finite selects where a closed set exists; editable CSS property names and easing values retain free text with shared anchored suggestions. Invalid drafts, blocked controls, disconnected controls and rejected asynchronous stores do not authorize another mutation path.

The host supplies onLogoChange(dataUrlOrNull) to apply the normalized local logo to the application identity and restore its saved value at startup. The module itself owns conversion, local storage and editor preview. School-mode sharing, narration voices and external schedule requests retain their real host boundaries. Model checks do not establish those external capabilities.

The reference and state inventory are under design/gui-personalization/. Built-surface verification belongs to the integrated evidence, not that design reference.

## Local schedule snapshots

Appearance and logo schedules use versioned local references. Capture current appearance or Capture current logo records the saved base presentation under the schedule name. A schedule exports only its reference, never the private pixel data. Each local registry holds at most 20 entries and 4 MiB in total; missing, corrupt or oversized records are reported without resetting them. Snapshot references are bounded and are not paths or URLs.

The schedule value editor offers typed narration and attention controls. Appearance and logo values use a saved-reference picker with the shared regex search. Remove local snapshot requires the destructive confirmation workflow and refuses references used by any saved schedule.

The returned appearance and logo adapters expose resolve, registerSnapshot, listSnapshots, removeSnapshot, applyTransient and clearTransient. Applying or clearing a schedule does not write the base appearance record, logo record, undo history or revision journal. Editing the base during an override preserves that new base for restoration. Logo snapshots accept only a normalized static 128 by 128 PNG or an explicit original-logo value. The appearance validator continues to reject external resources and unsafe declarations.

## History export

Unlocked history supports individual selection, Shift ranges, all filtered records, inversion and clear. Export selected records or the currently visible filtered result; comparison still requires exactly two entries. Ten text formats preserve complete redacted metadata with an explicit omission manifest. Snapshots, credentials, vocabulary and image pixels remain excluded. The complete format matrix below defines representations and exclusions.

## Logo authoring

The appearance tab offers local lock/key presets, local upload, contain/cover, focal points, numeric crop bounds, a safe area and the shared static background color workbench. The conversion notice precedes applying any output. Rejected application preserves the saved mark; rejected storage restores the prior display. Original source bytes and validated editing recipes persist locally alongside the normalized PNG; local schedule snapshots continue to contain only their normalized logo output. See the [state inventory](../../../design/gui-personalization/logo-authoring-states.md) for decoder isolation and other remaining requirements.

## Record export matrix

All files use UTF-8. JSON, JSON Lines, YAML, TOML, XML, Markdown, HTML and SQL use LF; CSV and TSV use CRLF rows. The final newline is included. Exports are bounded to 10,000 records and 16 MiB of serialized JSON input. Exceeding a bound rejects the operation without truncation.

| Surface / record | Formats | Scope and actions | Exclusions |
| --- | --- | --- | --- |
| Unlocked private history metadata | JSON, JSONL, YAML 1.2, TOML, XML, CSV, TSV, Markdown, HTML, SQLite SQL | Individual checkbox selection, all filtered, invert filtered, clear, selected export, filtered export. Compare requires exactly two. Existing restore and label remain individual actions. | Snapshots, credentials, vocabulary and custom image bytes remain omitted, declared in every export. |
| Shared adapter | Same ten formats | Caller supplies the exact reviewed record set and redaction policy. | It does not read storage or implicitly redact arbitrary data. |
| Notifications | Adapter available | Consumer integration belongs to notification center. | Not verified by history tests. |
| Appearance and logo images | Existing local snapshot / appearance transfer only | Separate image safety rules apply. | This record adapter does not export image bytes. |

JSON and YAML preserve the versioned envelope. YAML uses the strict JSON subset of YAML 1.2. JSONL begins with a manifest and wraps each complete record. TOML stores each record as a JSON string in records_json. XML stores escaped complete JSON in record-json elements. CSV/TSV use schema_json, omissions_json and record_json columns, so nested fields and types survive instead of being flattened away. An empty table contains one manifest-only row with an empty record_json cell. Markdown and HTML contain escaped complete JSON in a preformatted block. SQL targets SQLite and inserts one complete JSON envelope into a dedicated record_export table inside a transaction; importing into an existing table fails rather than replacing it.

Generated language source, Protobuf and JSON Schema are not supported for these variable history metadata records: they describe executable bindings or a type contract, not a faithful record interchange without an additional schema decision. PDF, workbook and image exports are outside this bounded structured-record adapter. An archive is unnecessary for one self-contained text document. These exclusions do not claim universal export completion.

The adapter rejects cycles, sparse arrays, non-finite numbers, unsupported objects, hidden fields and computed accessors. Markup escapes active syntax and HTML prohibits external resources. SQL quotes apostrophes. Table cells contain JSON syntax rather than raw formula-bearing text. Selection is resolved from the currently visible filtered rows immediately before export, with an unlocked-session check after decryption. No bulk destructive removal is added; the existing confirmed retention prune remains the removal workflow.

Runtime capture remains pending the production matrix. Source checks are not visual evidence.

### Isolated logo conversion

Logo decoding and canvas conversion run in a dedicated module worker. The controller allows one active job, caps execution at ten seconds, and terminates the worker on success, failure, cancellation or panel disposal. Input signatures and declared dimensions are checked before decoding; the worker verifies actual dimensions and decodes the final 128 by 128 PNG again. Network entrypoints are disabled inside the worker. This is a worker boundary, not an operating-system process. Focused checks verify controller admission and termination; actual built worker execution remains pending runtime verification. Original editing recipes now persist, and the current 20 by 20 title mark has a synchronized preview. Separate 64- and 128-pixel views are labelled editing previews, not additional application targets.

### Retained logo source and target preview

The private authoring record retains at most 4 MiB of original static PNG, JPEG or WebP bytes, the accepted contain/cover, focal, crop, safe-area, background and preset recipe, and the normalized PNG output. The complete versioned record is bounded to 8 MiB. Reopening the appearance panel restores those values and can regenerate output without selecting the file again. Storage quota rejection keeps the previous accepted mark; no smaller or lossy original is silently substituted.

The existing normalized output key remains compatible with the title consumer. Both records use compare-before-write and rollback checks. A conflicting concurrent value is never overwritten during recovery. Unverifiable rollback disables further edits until reload and review. Malformed or inconsistent saved authoring bytes remain preserved, with an explicit replacement notice. Older normalized-only records display an original-source-unavailable notice and remain editable from their saved PNG. Reset removes both the original authoring record and normalized output. History and record exports contain neither image payload.

The sole current application target is the decorative 20 by 20 title mark on the titlebar's frame background. Its labelled preview follows effective scheduled logo changes. The 64- and 128-pixel editing previews continue to show the saved base, so an active schedule does not hide what is being edited. Resetting the base while a schedule is active reports that the schedule remains visible. No taskbar or package icon mutation is implied. Model and mounted-fixture checks establish persistence and callback behavior; actual title pixels and the complete visual matrix still require the packaged candidate.

Logo concurrency checks retain the editor’s accepted record pair before asynchronous work. A newer writer prevents stale publication, conversion completion or reset from overwriting it. Both intended records must match before an accepted-history event. Rollback touches only attempted writes still containing this edit’s value; foreign values remain intact and unresolved restoration produces a visible recovery failure.

Display-name edits, Reset name, settings import and a settings-history restoration that changes the name require the protected desktop host to return exactly `true` before local preferences change. Missing, cancelled, rejected or malformed responses preserve the local name and draft. One request runs at a time; unrelated settings updates remain available and pending drafts survive rerendering. Disposal or newer changes to affected local fields prevent a delayed response from overwriting current preferences. Host history and renderer preferences are separate stores; a durable host acceptance followed by local unavailability or conflicting changes requires reopening or reloading to synchronize, rather than a false combined-success claim.
## Connected desktop startup surprise

The earlier main baseline provided only the probability helper. The desktop now
connects that helper to startup readiness, updater snapshots and a non-blocking
registered presentation with a local image data URL, bilingual dish name, meaningful
alt text and five-second dismissal. It never moves focus or starts an operation.

The single 10% draw waits for a transient update check to settle. First-run, School,
quiet, error and active-work exclusions remain terminal, including during checking.
Trusted pointer, keyboard or input activity ends the opportunity; an open modal
also suppresses display. The opportunity expires after 15 seconds, including while
a photo is resolving. There is no preference to force or disable the draw.

The desktop-only `surprise/resolvePublishedDish` request accepts an empty payload.
It resolves authoritative bilingual metadata from the public dim-sum photo catalog
and only published normal `catalog-v1*` assets. The bundled CLI is selected from
`forge-executables.json` and verified by version, path and SHA-256 before execution;
no global `PATH` fallback exists. The host verifies asset URL, digest, size and
native image decoding before returning bounded bytes. No catalog or photo is
tracked here. The one-image private application-data cache records source revision
and integrity; offline metadata or missing verified tools returns unavailable.

Focused checks cover the actual renderer startup seam, terminal exclusions, late
results, trusted input, verified tool selection, image bounds and publication
validation. They do not prove installed startup display or native decoding. Those
remain separate built-runtime acceptance requirements.
