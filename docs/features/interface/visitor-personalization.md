# Website visitor personalization

The visitor adapter mounts the shared personalization controls inside the documentation website's own settings. It does not require desktop pairing or operate an encrypted drive. Language, independent English and Cantonese playfulness, theme, density, fonts, motion, logo editing, narrator voices, attention modes and local schedules use visitor-owned browser state.

## Storage and privacy

State is scoped to this browser origin under a separate visitor prefix, shared by documentation routes. It does not read desktop settings or infer language playfulness from the old success/search message sliders. If storage rejects an operation, subsequent changes remain available in this page's memory and a notification explains that they will be lost on reload. Private wording is never applied by this adapter.

## Schedules and capabilities

Local schedules use the shared validated timezone, date, weekday, overnight and deterministic-priority rules. External providers require an explicit trusted capability supplied by the host. Without it, the adapter makes no provider request and reports the unavailable boundary while local schedules remain usable. Setting or verifying a mode unlock credential similarly requires an explicit access capability. No missing capability is treated as successful authentication.

## Integration and remaining verification

`mountVisitorPersonalization(container, options)` returns `store`, `apply`, `getSettings`, `open`, `addLocalSchedule` and `destroy`, plus the shared narrator, appearance and history managers. `onChange(settings, metadata)` supplies canonical effective settings and the actual persistence state. The shell owns route mounting, public-copy projection, protected actions and current provenance. History credentials and destructive confirmation are supplied independently.

The shared renderer retains native controls in several nested editors. Full registered component coverage, every-dropdown regex filtering, advanced appearance capability completeness and built browser interaction remain unverified. Source checks establish independent tone persistence, storage fallback, local schedule behavior and capability rejection; they do not establish rendered acceptance or narration audio output.

## Suggested articles

- [Local personalization](local-personalization.md)
- [Personal vocabulary](personal-vocabulary.md)
