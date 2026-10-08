# Public website design

## Purpose and product truth

Build a small, polished public website for **Material File Encryptor**, hosted at `https://ding-ding-projects.github.io/material-file-encryptor/`. It introduces the Windows desktop application and points to useful documentation. The website is separate from the Electron application; never present the site as the product UI.

Describe the product as a Windows virtual drive mounted in File Explorer through WinFsp. Files are stored encrypted in a folder the user chooses, including folders managed by OneDrive, Google Drive, or another sync service. Reads provide usable file bytes on demand through the drive. The app maintains an encrypted offline cache. Do not imply that it creates a normal plaintext workspace on disk, that a cloud provider is required, or that encryption itself confirms cloud upload completion.

Vault credentials can be a password or a key file. Say that the app starts with Windows by default. Optional automatic unlock uses the current Windows user's DPAPI protection; explain this plainly and never imply it makes the password/key file unnecessary for recovery. The maximum encrypted part size is entered in KB, MB, or GB and includes encryption overhead. It affects newly created or edited files; changing it does not rewrite existing parts. Resplitting existing files is an explicit operation.

Show the real release status. Before a verified public release exists, label the product **In development** and disable the Download action with adjacent text such as “Downloads will be available with the first release.” Do not use an empty, guessed, or misleading download link. Enable a release link only when its public destination and downloadable artifact are verified. Do not claim unimplemented features, security audits, provider integrations, compatibility, or guarantees.

## Visual direction

Use Material 3 as a coherent editorial system: purposeful hierarchy, readable typography, restrained tonal surfaces, clear controls, and small moments of useful motion. The page should feel like a considered product publication, not a generic SaaS landing page. Build one continuous page with generous whitespace, strong left alignment, fine separators, text-led sections, and a few deliberately composed diagrams or screenshots. Avoid a card grid, dashboard-like metrics, gradients, glowing blobs, glass effects, giant decorative icons, and ornamental badges.

Use a 4px spacing scale. Set a centered content column up to 1120px wide with 32px desktop side gutters, 24px at tablet widths, and 20px at 320–600px. The header is approximately 68px high. Main sections use 80–104px vertical spacing on desktop and 56–72px on mobile. Give content a clear 8-column editorial grid at wide sizes; collapse to a single column without horizontal overflow.

### Material palette

| Role | Color | Use |
| --- | --- | --- |
| Primary | `#3F51B5` | Main links, active accents, primary action |
| On primary | `#FFFFFF` | Primary action text |
| Primary container | `#E3E1FF` | Quiet selected or highlighted surfaces |
| On primary container | `#141A52` | Text on primary container |
| Secondary | `#5C5D72` | Supporting controls and accents |
| Surface | `#FDFBFF` | Main page background |
| Surface low | `#F6F2FA` | Alternating full-width section bands |
| Surface container | `#F0ECF4` | Diagram stage and compact callouts |
| On surface | `#1C1B20` | Main text |
| On surface variant | `#46464F` | Supporting text |
| Outline | `#767680` | Control boundaries |
| Outline variant | `#C7C5D0` | Fine separators |
| Error | `#BA1A1A` | Errors only |

Keep the palette mostly neutral; use primary indigo as a deliberate accent. Ensure body copy has at least 4.5:1 contrast and important non-text boundaries at least 3:1. Also support a dark color scheme with equivalent Material roles if implementation supports it; never make a section unreadable when system theme changes.

Use a locally available system sans stack (for example `Roboto, "Segoe UI", Arial, sans-serif`) so the page has no external font dependency. Use sentence case. Suggested type scale: display 52/60px on wide screens and 38/44px on small screens; section headings 32/40px desktop, 28/36px mobile; body 17/27px; supporting text 14/20px; navigation and buttons 14/20px medium. Keep line lengths near 65 characters. Avoid ultra-light text and tightly packed tracking.

Buttons use Material 3 state layers, a 20px radius, and a minimum 44px target height. Text links remain visibly underlined in body copy; navigation links get a clear hover and focus state. Use 1.75–2px rounded line icons, consistently sized at 20–24px, only where they aid scanning. No emoji as interface icons. Keep shadows for overlays only.

## Page structure and content

1. **Header:** left-aligned wordmark “Material File Encryptor” with a simple folder-and-lock line symbol. Right side contains Overview, Security, and Documentation anchor links plus one status-aware Download control. At narrow widths collapse links behind a named menu button; preserve access to every destination. Header may become sticky after scrolling but should not obscure anchor targets.
2. **Opening:** eyebrow “A Windows virtual drive”, heading “Your files, readable in Explorer. Encrypted where they’re stored.” Supporting copy: “Open files through a mounted drive while their stored copies stay encrypted in a folder you choose.” Primary action is “How it works” and scrolls to the workflow. The release-aware Download action sits beside it when appropriate. No sign-in gate, waitlist form, fake usage metric, or overclaiming security badge.
3. **Drive workflow:** use the supplied `docs/images/drive-workflow.png` as the lead illustration. Pair it with a short explanation and three numbered stages: choose an encrypted storage folder; mount the drive in Windows File Explorer; open and edit files through the drive. State that any suitable folder can be selected, including one synchronized by OneDrive or Google Drive. Label the artwork as an explanatory diagram unless it is an actual, accurately captured application view.
4. **Offline access:** use `docs/images/offline-workflow.png` when present and verified. Explain that the app keeps an encrypted offline cache for local access. Describe on-demand reads in plain words and avoid promising availability when bytes are neither cached nor reachable. If the diagram is absent, use a compact text-and-line illustration that accurately shows encrypted storage, the mounted drive, and the encrypted cache; do not show plaintext files being written to a separate workspace.
5. **Security and control:** present concise editorial rows with a small icon or left rule, not cards. Cover password or key-file credentials; optional automatic unlock protected by the current user's DPAPI; startup enabled by default with an option to change it; and the encrypted-part limit. State precisely that the part-size limit includes overhead, applies to new or edited files, and requires an explicit resplit action to change existing parts. Link to the relevant documentation if available. Do not imply DPAPI protects against an already unlocked Windows session or replaces a backup of credentials.
6. **Documentation:** provide a short, scannable set of real links for setup, security and credentials, offline behavior, and configuration/part sizes. Only render destinations that exist. Keep the language ordinary and explain Windows terms at first use.
7. **Download and footer:** repeat current release status and the same verified or disabled download behavior used in the header. Footer includes the public project name, repository link, Documentation link, and a concise “Windows desktop application” label. Do not imply that the separate website runs or unlocks a vault.

Keep copy direct and factual. Suitable section headings include “How the drive works”, “Work offline”, and “Choose how you unlock”. Avoid claiming “zero knowledge”, “military grade”, “unbreakable”, “seamless sync”, “never leaves your device”, or “cloud backup” unless those claims are independently established by the implementation and evidence.

## Imagery and product evidence

Use the provided workflow diagrams at their real paths and preserve their proportions. They should sit in open editorial compositions, not inside a gallery of equally sized cards. Use a soft surface behind diagrams only when contrast or legibility needs it, with a fine outline and 16–20px corner radius. On mobile, keep the image within the viewport, place it after its corresponding explanation, and retain readable labels. Provide concise alt text that states the data flow rather than repeating nearby copy.

If genuine application captures later become available under `docs/images/captures/`, choose at most two that clarify the Explorer-mounted drive or a relevant real setting. Identify them as application screenshots. Do not fabricate file names, filesystem states, provider sync completion, dialog contents, or release UI. Never use mockups or diagrams as evidence of a shipped feature.

## Responsive behavior

Design from 320px upward. At 320–599px, use 20px page gutters, stack hero actions, diagrams and text, and wrap long URLs or path examples safely. Navigation becomes a compact menu with a visible open/close state and keyboard support. At 600–899px use 24px gutters and a two-column layout only where each column remains at least 260px wide. From 900px use the full editorial grid and up to 1120px content width. Images use `max-width: 100%`; tables are avoided in favor of stacked labelled rows. No content, focus outline, or controls may cause horizontal scrolling.

## Interaction, motion, and accessibility

All links and controls work with keyboard and pointer. Use semantic header, nav, main, section, and footer landmarks; one page-level heading; ordered heading levels; descriptive link names; and a menu button with `aria-expanded` and `aria-controls`. Keep visible focus rings with at least a 2px primary outline and offset. Do not rely on color alone for status or link affordance. Decorative symbols are hidden from assistive technology; informative images get specific alt text. Maintain a useful focus order and ensure sticky header navigation does not hide focused content.

Use Material easing `cubic-bezier(.2, 0, 0, 1)`. Small control and underline changes take 120–180ms. The mobile navigation may fade and move no more than 8px over 180ms. Reveal content with no more than 8px travel and no scroll-jacking; diagrams do not animate continuously. Honor `prefers-reduced-motion: reduce` by removing travel and easing nonessential transitions to effectively immediate. No interaction or information depends on animation.

## Review checklist

- The title and public copy use only “Material File Encryptor”; no private aliases or internal nicknames appear.
- Website copy explains the Windows Explorer virtual drive, chosen encrypted folder, on-demand reads, and encrypted offline cache accurately.
- No plaintext workspace, fake release, empty download link, fabricated screenshot, or unsupported security claim appears.
- Password/key-file choice, optional current-user DPAPI auto-unlock, Windows startup default, and exact part-size/resplit semantics are represented correctly.
- Every rendered nav, docs, repository, and release link has a verified destination.
- The layout works at 320px, keyboard focus is visible, contrast is sufficient, and reduced-motion preferences are respected.
