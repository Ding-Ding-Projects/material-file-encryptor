# Material File Encryptor: Material 3 board kit (follow exactly)

Every board is a Material 3 desktop screen at 1440 x 960 (phone boards 390 x 844), dark scheme by default with a `theme` tweak for light. Pure Material 3: color roles, type scale, shapes and components below. No custom gradients except a drive's own banner image. No emoji. Every button has a Material Symbols icon.

## File skeleton (copy exactly; change title, body and renderVals)

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>SCREEN NAME</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link href="https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,300..900&amp;family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,300..600,0..1,0&amp;display=swap" rel="stylesheet">
<style>
body{margin:0}
.ms{font-family:'Material Symbols Rounded';font-weight:400;font-style:normal;font-size:24px;line-height:1;letter-spacing:normal;text-transform:none;display:inline-block;white-space:nowrap;direction:ltr;-webkit-font-feature-settings:'liga';font-feature-settings:'liga';user-select:none}
.ms.fill{font-variation-settings:'FILL' 1}
@keyframes enter{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes pop{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}
[data-motion=off] *{animation:none!important;transition:none!important}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
button,input,select{font:inherit;color:inherit}
</style>
</helmet>
<div data-motion="{{motion}}" style="width:1440px;height:960px;display:flex;font-family:'Roboto Flex',system-ui,sans-serif;font-size:14px;line-height:20px;color:{{onSurface}};background:{{surface}};overflow:hidden">
  ... navigation rail + content ...
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"seed":{"editor":"enum","options":["green","indigo","amber"],"default":"green"},"theme":{"editor":"enum","options":["dark","light"],"default":"dark"},"motion":{"editor":"enum","options":["on","off"],"default":"on"},"$preview":{"width":1440,"height":960}}'>
class Component extends DCLogic {
  renderVals() {
    const t = scheme(this.props.seed ?? 'green', this.props.theme ?? 'dark');
    return { ...t, motion: this.props.motion ?? 'on' /* , screen data */ };
  }
}
function scheme(seed, theme) { /* paste the SCHEME function below verbatim */ }
</script>
</body>
</html>
```

Icons: `<span class="ms" aria-hidden="true">home</span>` (ligature names from Material Symbols, e.g. home, folder, hard_drive, cloud_upload, history, delete, share, link, settings, lock, lock_open, search, add, download, upload, more_vert, check, close, sync, offline_pin, visibility, palette, language, notifications, update, menu_book, receipt_long, build, key, folder_open, image, qr_code_2, dns, schedule, restore, edit, content_copy, info, warning, error, done_all, filter_list, sort, expand_more, chevron_right, play_arrow, pause, storage, encrypted, shield, person, logout). Filled variant: add class `fill` for the selected rail item.

## SCHEME function (paste verbatim into every board)

```js
function scheme(seed, theme) {
  const dark = theme !== 'light';
  const seeds = {
    green:  dark ? { primary:'#8FD6B0', onPrimary:'#003825', primaryContainer:'#00513A', onPrimaryContainer:'#AAF2CB', secondaryContainer:'#354B40', onSecondaryContainer:'#CFE9D9', tertiaryContainer:'#234C5D', onTertiaryContainer:'#C1E8FB' }
                 : { primary:'#2B6A4E', onPrimary:'#FFFFFF', primaryContainer:'#AFF1CE', onPrimaryContainer:'#002114', secondaryContainer:'#CFE9D9', onSecondaryContainer:'#0B1F15', tertiaryContainer:'#C1E8FB', onTertiaryContainer:'#001F2A' },
    indigo: dark ? { primary:'#B9C3FF', onPrimary:'#1F2C61', primaryContainer:'#364379', onPrimaryContainer:'#DDE1FF', secondaryContainer:'#424659', onSecondaryContainer:'#DFE1F9', tertiaryContainer:'#5C3D58', onTertiaryContainer:'#FFD6F7' }
                 : { primary:'#4D5C92', onPrimary:'#FFFFFF', primaryContainer:'#DDE1FF', onPrimaryContainer:'#05164B', secondaryContainer:'#DFE1F9', onSecondaryContainer:'#171B2C', tertiaryContainer:'#FFD6F7', onTertiaryContainer:'#2C1229' },
    amber:  dark ? { primary:'#F5BD6F', onPrimary:'#452B00', primaryContainer:'#633F00', onPrimaryContainer:'#FFDDB3', secondaryContainer:'#574431', onSecondaryContainer:'#FBDEBC', tertiaryContainer:'#3E4E2E', onTertiaryContainer:'#D5EDBA' }
                 : { primary:'#835416', onPrimary:'#FFFFFF', primaryContainer:'#FFDDB3', onPrimaryContainer:'#2A1700', secondaryContainer:'#FBDEBC', onSecondaryContainer:'#271904', tertiaryContainer:'#D5EDBA', onTertiaryContainer:'#11200A' }
  };
  const neutral = dark
    ? { surface:'#101413', surfaceContainerLowest:'#0B0F0E', surfaceContainerLow:'#181D1B', surfaceContainer:'#1C211F', surfaceContainerHigh:'#272B29', surfaceContainerHighest:'#313634', onSurface:'#E0E3E0', onSurfaceVariant:'#C0C9C3', outline:'#8A938D', outlineVariant:'#404944', error:'#FFB4AB', onError:'#690005', errorContainer:'#93000A', onErrorContainer:'#FFDAD6', inverseSurface:'#E0E3E0', inverseOnSurface:'#2D3130', scrim:'rgba(0,0,0,.5)', shadow:'rgba(0,0,0,.45)' }
    : { surface:'#F7FAF7', surfaceContainerLowest:'#FFFFFF', surfaceContainerLow:'#F1F4F1', surfaceContainer:'#EBEFEB', surfaceContainerHigh:'#E6E9E6', surfaceContainerHighest:'#E0E3E0', onSurface:'#191C1B', onSurfaceVariant:'#404944', outline:'#707973', outlineVariant:'#C0C9C3', error:'#BA1A1A', onError:'#FFFFFF', errorContainer:'#FFDAD6', onErrorContainer:'#410002', inverseSurface:'#2D3130', inverseOnSurface:'#EEF1EE', scrim:'rgba(0,0,0,.32)', shadow:'rgba(0,0,0,.18)' };
  return { ...neutral, ...(seeds[seed] || seeds.green) };
}
```

## Type scale (Roboto Flex)

display-small 36/44 w400 · headline-large 32/40 w400 · headline-medium 28/36 w400 · headline-small 24/32 w400 · title-large 22/28 w400 · title-medium 16/24 w500 · title-small 14/20 w500 · body-large 16/24 w400 · body-medium 14/20 w400 · body-small 12/16 w400 · label-large 14/20 w500 · label-medium 12/16 w500.

## Shapes

extra-small 4px · small 8px · medium 12px · large 16px · extra-large 28px · full 999px.

## Layout of every desktop board

- Navigation rail on the left, width 96px, background `surface`, items stacked from top 24px: a FAB 56x56 radius 16 `primaryContainer`/`onPrimaryContainer` with an icon (the screen's main create action), then 8 rail items: Home (home), Drives (hard_drive), Offline (offline_pin), History (history), Backup (cloud_upload), Shared (share), Tools (build), Settings (settings). Each item: an active-indicator pill 56x32 radius 16 around the icon (`secondaryContainer` when selected, icon filled), label-medium below, `onSurfaceVariant` when not selected, `onSurface` when selected. Mark the board's own section as selected.
- Content area: `flex:1`, padding 24px 24px 24px 0, containing a rounded `surfaceContainerLow` panel radius 28 that holds the page (padding 24). Top app bar row inside: headline-medium title, optional supporting text, trailing actions.
- Search bars: height 56, radius full, `surfaceContainerHigh`, leading search icon, placeholder `onSurfaceVariant`, and beside it a separate "Regex" icon button (icon `regular_expression`, or text `.*` if the ligature is missing) as a tonal button: every search has its regex builder next to it.

## Components

- Filled button: height 40, radius full, padding 0 24 0 16, `primary`/`onPrimary`, label-large, leading icon 18px with gap 8.
- Tonal button: same, `secondaryContainer`/`onSecondaryContainer`.
- Outlined button: same, transparent, 1px `outline`, `primary` text.
- Text button: same, transparent, `primary` text, padding 0 12.
- Icon button: 40x40 radius full, icon 24 `onSurfaceVariant`; give it `aria-label`.
- FAB / extended FAB: height 56, radius 16, `primaryContainer`.
- Cards: filled `surfaceContainerHighest` radius 12; elevated `surfaceContainerLow` radius 12 with `box-shadow:0 1px 3px {{shadow}}`; outlined 1px `outlineVariant` radius 12. Large hero cards may use radius 28.
- Lists: rows 56px (one line) or 72px (two lines), leading 40px avatar or 24px icon, title-medium + body-medium supporting `onSurfaceVariant`, trailing text or icon button; dividers 1px `outlineVariant` inset 16.
- Chips: height 32, radius 8, 1px `outlineVariant`, label-large; selected = `secondaryContainer` with leading `check` icon 18.
- Segmented button: height 40, radius full outer, 1px `outline` between segments, selected `secondaryContainer` with `check` icon.
- Switch: track 52x32 radius full; on = `primary` track and `onPrimary` 24px handle on the right; off = `surfaceContainerHighest` track, 2px `outline` border, 16px `outline` handle on the left.
- Linear progress: track height 4 radius full `secondaryContainer`, indicator `primary`; show a percentage and text beside it.
- Menus: container `surfaceContainer`, radius 4... use the expressive 16 radius, `box-shadow:0 4px 12px {{shadow}}`, padding 8 0, items 48px with 12px horizontal padding, leading icon 24 `onSurfaceVariant`, label-large, trailing shortcut label-large `onSurfaceVariant`, dividers 1px `outlineVariant` with 8px vertical margin, destructive item text and icon `error`.
- Dialogs: `surfaceContainerHigh`, radius 28, padding 24, headline-small title, scrim behind.
- Snackbar: `inverseSurface`/`inverseOnSurface`, radius 4, height 48.
- Badges: small 6px dot or 16px pill `error`/`onError`.

## Rules

- Real data that fits the app (Material File Encryptor: encrypted Windows drives mounted with WinFsp, Docker Hub backup, sharing, file hosting, history, recycle bin, local tools). Times in 24-hour. Drive names: Studio, Photos 2026, Work, Music library, Taxes. Account: studio-owner.
- Interactive: selection, tabs, chips or toggles change state through `this.setState`; mark `is_interactive` boards accordingly.
- Accessible: real `<button>`, `<a href>`, `<input>`+`<label>`; icon-only buttons get `aria-label`; contrast 4.5:1 using the roles above.
- Animation: content enters with `animation:enter 320ms cubic-bezier(.05,.7,.1,1) both`; menus and dialogs with `pop 200ms`.
- Each board is fully self-contained. Do not import other boards.
