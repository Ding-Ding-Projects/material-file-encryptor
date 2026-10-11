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
