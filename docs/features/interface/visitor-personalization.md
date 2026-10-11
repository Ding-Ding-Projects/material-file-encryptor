# Website visitor personalization

The visitor adapter mounts the shared personalization controls inside the documentation website's own settings. It does not require desktop pairing or operate an encrypted drive. Language, independent English and Cantonese playfulness, theme, density, fonts, motion, logo editing, narrator voices, attention modes and local schedules use visitor-owned browser state.

## Storage and privacy

State is scoped to this browser origin under a separate visitor prefix, shared by documentation routes. It does not read desktop settings or infer language playfulness from the old success/search message sliders. If storage rejects an operation, subsequent changes remain available in this page's memory and a notification explains that they will be lost on reload. Private wording is never applied by this adapter.

## Schedules and capabilities

Local schedules use the shared validated timezone, date, weekday, overnight and deterministic-priority rules. External providers require an explicit trusted capability supplied by the host. Without it, the adapter makes no provider request and reports the unavailable boundary while local schedules remain usable. Setting or verifying a mode unlock credential similarly requires an explicit access capability. No missing capability is treated as successful authentication.

## Integration and remaining verification

`mountVisitorPersonalization(container, options)` returns `store`, `apply`, `getSettings`, `open`, `addLocalSchedule` and `destroy`, plus the shared narrator, appearance and history managers. `onChange(settings, metadata)` supplies canonical effective settings and the actual persistence state. The shell owns route mounting, public-copy projection, protected actions and current provenance. History credentials and destructive confirmation are supplied independently.

The shared renderer retains native controls in several nested editors. Full registered component coverage, every-dropdown regex filtering, advanced appearance capability completeness and built browser interaction remain unverified. Source checks establish independent tone persistence, storage fallback, local schedule behavior and capability rejection; they do not establish rendered acceptance or narration audio output.

The host supplies the same private history manager used by local access and an explicit profile-authentication predicate. Each changed settings snapshot is appended once only while both profile and history are unlocked. Unchanged updates create no history event. A history write failure reports a notification without undoing the live settings change.

Mode enabled-state changes require a one-use authorization from successful credential setup or verification. The central settings consumer applies this rule to imports, reset and history restore as well as the visible control. Reset while the mode is enabled is rejected until the user explicitly verifies and disables it. Authorization is consumed on an attempted transition and is rejected if the profile has locked in the meantime.

## Suggested articles

- [Local personalization](local-personalization.md)
- [Personal vocabulary](personal-vocabulary.md)

## Shared preferences palette, typography and navigation

The website projects its existing palette roles into shared Material Design 3 surface, text, outline and action roles, so shared preferences follow the same light/dark authority as their enclosing dialog. Material plain and brand typography follow the selected local font family, then the bundled MFE Noto Sans Regular and MFE Noto Sans CJK HK families, then sans-serif. Guidance shadow content uses that same authority. No remote font service or vendor patch is introduced.

Settings navigation uses registered md-tabs and md-primary-tab components. Selecting a tab retains the original settings store, protected mode, reset cancellation and history behavior. Arrow keys, Home and End navigate the tabs. Each tab retains its unique optional guidance and authoritative explanation in an aligned rail above the exact target. The rail and tab strip share one bounded horizontal scroll surface, while only registered tabs are children of md-tabs. Instance-scoped stable IDs associate every tab with the panel and the active panel with its labelled tab across language rerenders. Complex setting guidance remains optional above its original target.

Historical captures from the earlier static source diagnose the original mismatch only. Source/component checks do not establish current rendered conformance. Fresh built captures must cover normal and minimum viewport, light/dark, English/Cantonese/bilingual, and 100/125/150/200 percent scale before visual acceptance.
