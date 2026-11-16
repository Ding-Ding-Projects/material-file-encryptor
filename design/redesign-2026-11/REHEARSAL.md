# Rehearsal and review

Every board was filmed at 150 ms, 600 ms and after it settled (`frames/`). Each run also checked for
console errors and for elements whose content overflowed without scrolling. The final run reported
no console errors and no overflow on any board.

## Findings and fixes

| Board | Finding (from the frames) | Fix |
| --- | --- | --- |
| All | First pass read as a landing page | Redrawn as a dense tool with app chrome |
| All | No board declared Tweaks | Added `accent` and `motion` everywhere, plus stage, density or sheet where they fit |
| Main | Default selection was a folder, so the part map was empty | Default selection is now a file |
| Main | A sample file name modelled bad practice (a password hint file) | Replaced with an ordinary document |
| Main | The file table stopped well above the transfers strip | Filled with more real rows |
| Unlock | Left pane was wider than Main's because padding added to its width | `box-sizing: border-box` on both side panes |
| Unlock | Missing the command bar the other drive tabs have | Added a disabled command bar |
| Backup, Settings | Links used the browser default colour | Link colour set from the palette |
| SignIn | "Cancelled" was tagged as in progress | New neutral "Stopped" tag |
| Motion | Large title and pill buttons read as a landing page | Settings breadcrumb, 20 px title, 8 px controls |
| Motion, Tools | Content stopped well above the frame bottom | Frames shortened to fit the content |
| Settings | Coverage bar colours disagreed with the list | Bar uses the same colours as the list, plus a not applicable segment |
| Site | Task cards too tall, six cards stranded two orphans in four columns | Shorter cards in a three column grid |

## Not checked here

- Contrast was judged by eye on the frames, not measured.
- Interactive boards were filmed in their default state; interaction states were exercised by
  reading the board logic, not by scripted clicks.
