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

`node --test test/local-personalization.test.js` covers settings persistence, unsafe input, mode restoration, overnight/date boundaries, precedence, external-generation races, language boundaries, serialized narration and startup exclusion. These are module checks, not proof of desktop or browser rendering. Full picker search integration, all-message localization, protected durable history, full advanced appearance capabilities, verified shared desktop record propagation, safe external networking and real built-surface capture remain host integration or subsequent verification requirements. No claim of full universal feature completion is made by these modules.

## 廣東話說明

個人設定包括語言及語音、外觀、時間表同專注設定。英文同廣東話趣味程度各自儲存，預設為 5。啟用學校模式後，畫面只用英文，原有語言同趣味設定會保留，通過本機驗證關閉模式後恢復。此模式只係介面限制，唔係資料保安。

語音旁白預設關閉，聲線按本機實際可用資料顯示，兩種語言依次播放。時間表使用指定時區；跨午夜時段歸開始當日，臨時設定唔會覆蓋原有設定。專注選項各自開關，預設全部關閉。桌面共用記錄、受保護歷史、外部來源同完整畫面驗證需要主程式整合，未驗證部分唔會當成完成。
