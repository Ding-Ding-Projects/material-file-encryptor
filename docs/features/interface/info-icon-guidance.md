# Information icons

Every capable control has its own compact information icon placed immediately before it, so it comes first in reading and keyboard order and stays attached to its control when a row wraps. The icon is a Material icon button bundled with the product, so it needs no network access. It stays closed until you open it.

## What the icon does

- Opens an explanation written for that one control: its purpose, options, default, effects, an example, validation and recovery.
- Offers guided steps with Back and Next. The last step only moves keyboard focus to the real control. The guide never presses it for you.
- Shows an isolated sample with a worked example. The sample uses fixed demonstration values, runs only inside the explanation and never starts a real operation.
- Works from the keyboard. Enter or Space opens the icon, Escape closes it and returns focus to the icon. The desktop app and the website also list Guide and Explain commands in the command palette.
- Names its target in the active language: English, Cantonese or both together.

## Privacy and safety boundaries

An icon never reads the live value of its control, never copies private text such as a password, and never starts the original operation. A control that is disabled still explains itself, and only the guided start is disabled. The credential samples accept one fixed public demonstration text and store nothing.

## Coverage

The inventories below cover the static markup of each page and the controls that the page code creates at start-up. A coverage check reads each page as text and fails when a capable control has neither an explanation nor a stated reason.

- Desktop app (`src/renderer/index.html`): 65 explanations (1 for groups of related controls), 6 stated exemptions.
- Website (`docs/site/index.html`): 22 explanations (0 for groups of related controls), 7 stated exemptions.
- Browser extension popup (`browser-extension/popup.html`): 15 explanations (1 for groups of related controls), 0 stated exemptions.
- Browser extension workspace (`browser-extension/options.html`): 140 explanations (3 for groups of related controls), 3 stated exemptions.

## Controls not yet covered

Controls that feature modules create after start-up do not have an icon of this kind yet. This is partial coverage, not completion.

- Desktop app: the file table row controls, the history and recycle bin rows, and the controls of the access, converter, local models, server manager, storage maintenance, updates and status modules. The settings and server preparation modules already carry their own registered guidance.
- Website: the controls inside the workspace page, which reuse the settings guidance.
- Browser extension: the rows and panels that the notes, tickets, models, publishing, servers and converter modules create.

## Control kinds

Options, validation, recovery and the guided steps are shared by every control of the same kind. Each control section below states its own purpose, effects, default and example.

### kind-button

- Options: This action has no options. It runs once each time you press it.
- Validation: The action stays unavailable until its required conditions are met. Its own message names anything missing.
- Recovery: Close any dialog the action opens, then check the result at the control before trying again.
- Steps: Find the control directly below this icon. / Read what it does and what it changes. / Use the real control yourself when you are ready. This guide never operates it for you.

### kind-toggle

- Options: On or off.
- Validation: A switch has no invalid value. If it is unavailable, its adjacent text says why.
- Recovery: Switch it back to its previous position. The change applies as soon as you switch it.
- Steps: Find the control directly below this icon. / Read what it does and what it changes. / Use the real control yourself when you are ready. This guide never operates it for you.

### kind-text

- Options: Any text within the length the field allows.
- Validation: The field shows an error beside it when the text is too long, empty where a value is required, or in the wrong format.
- Recovery: Correct the text, or clear the field to start again. Nothing is saved until you confirm.
- Steps: Find the control directly below this icon. / Decide the value you want, using the sample below to see how the field behaves. / Check the result beside the control after you use it.

### kind-search

- Options: Any search text. The list narrows as you type.
- Validation: An empty search shows everything. A search with no matches shows an empty list, not an error.
- Recovery: Clear the search text to see every entry again.
- Steps: Find the control directly below this icon. / Decide the value you want, using the sample below to see how the field behaves. / Check the result beside the control after you use it.

### kind-number

- Options: A number within the minimum and maximum the control allows.
- Validation: A value outside the allowed range or that is not a number is rejected with a message beside the control.
- Recovery: Enter a value inside the range, or use the reset button where one is offered.
- Steps: Find the control directly below this icon. / Decide the value you want, using the sample below to see how the field behaves. / Check the result beside the control after you use it.

### kind-choice

- Options: Choose one entry from the list the control opens.
- Validation: Only entries in the list can be chosen, so a choice cannot be invalid.
- Recovery: Open the list again and choose the previous entry.
- Steps: Find the control directly below this icon. / Decide which entry you want, using the sample below to see the result. / Check the result beside the control after you use it.

### kind-credential

- Options: A secret you type once. It is hidden while you type.
- Validation: The secret is checked only when you submit it. A wrong or too short secret is rejected without hints about its content.
- Recovery: Clear the field and type it again. Nothing is shown, copied or kept by this explanation.
- Steps: Find the control directly below this icon. / Decide the value you want, using the sample below to see how the field behaves. / Check the result beside the control after you use it.

### kind-file

- Options: The system file or folder picker offers the choices. Nothing is chosen until you confirm in the picker.
- Validation: The chosen path is checked by the real control before it is used. A rejected path keeps the previous value.
- Recovery: Cancel the picker to keep the current value, or choose another location.
- Steps: Find the control directly below this icon. / Read what it does and what it changes. / Use the real control yourself when you are ready. This guide never operates it for you.

### kind-link

- Options: This control only opens a page. It has no options.
- Validation: Only the fixed project address behind this control can open. It cannot be edited.
- Recovery: Close the page that opened and return to the app. Nothing in the app changes.
- Steps: Find the control directly below this icon. / Read what it does and what it changes. / Use the real control yourself when you are ready. This guide never operates it for you.

### kind-navigation

- Options: Pick one destination. Only one is shown at a time.
- Validation: A destination that is not available stays disabled. Choosing one never changes your data.
- Recovery: Choose another destination, or use the Home view to see every destination.
- Steps: Find the control directly below this icon. / Read what it does and what it changes. / Use the real control yourself when you are ready. This guide never operates it for you.

## Verification

Source checks mount every icon on a document fixture and open it from the keyboard. A guard test removes the icon, the target binding, the keyboard action and the contextual panel one at a time and requires each removal to fail. Built interaction and visual evidence are not recorded yet.

## Desktop app

### desktop-main-navigation

**Main navigation** — `mfe-navigation-rail`

- Kind: navigation
- Purpose: Switch between the six main views: My drive, Available offline, History, Recycle Bin, Settings and How it works.
- Effects: Choosing a view only changes what is shown; it never opens, locks or changes a drive.
- Default: The first destination
- Example: Example for "Main navigation": choosing a view only changes what is shown; it never opens, locks or changes a drive.

### desktop-dismiss-error

**Dismiss error** — `#dismiss-error`

- Kind: button
- Purpose: Hide the red error banner at the top of the workspace after you have read it.
- Effects: The banner closes and nothing else changes; the cause of the error is not repaired by closing it.
- Default: Not invoked
- Example: Example for "Dismiss error": the banner closes and nothing else changes; the cause of the error is not repaired by closing it.

### desktop-lock-button

**Lock drive** — `#lock-button`

- Kind: button
- Purpose: Lock the open drive so its files can no longer be read until it is unlocked again.
- Effects: The drive is unmounted and the unlock credential is forgotten for this session; encrypted storage is untouched.
- Default: Not invoked
- Example: Example for "Lock drive": the drive is unmounted and the unlock credential is forgotten for this session; encrypted storage is untouched.

### desktop-install-driver

**Install WinFsp** — `#install-driver`

- Kind: button
- Purpose: Install the WinFsp driver this app needs before a drive can be mounted in File Explorer.
- Effects: Windows asks for your approval first. The notice disappears once the driver is detected.
- Default: Not invoked
- Example: Example for "Install WinFsp": windows asks for your approval first. The notice disappears once the driver is detected.

### desktop-create-button

**Create a drive** — `#create-button`

- Kind: button
- Purpose: Open the dialog that creates a new encrypted drive.
- Effects: Nothing is created until you fill in the dialog and confirm it.
- Default: Not invoked
- Example: Example for "Create a drive": nothing is created until you fill in the dialog and confirm it.

### desktop-unlock-button

**Unlock existing drive** — `#unlock-button`

- Kind: button
- Purpose: Open the dialog that unlocks a drive you already created, using its password or key file.
- Effects: A correct credential mounts the drive; a wrong one is rejected without revealing anything.
- Default: Not invoked
- Example: Example for "Unlock existing drive": a correct credential mounts the drive; a wrong one is rejected without revealing anything.

### desktop-upgrade-vault

**Upgrade by creating a copy** — `#upgrade-vault`

- Kind: button
- Purpose: Copy an older drive into the current storage format. The original drive is kept as it is.
- Effects: A new copy is written to the folders you choose; the original is never changed or removed.
- Default: Not invoked
- Example: Example for "Upgrade by creating a copy": a new copy is written to the folders you choose; the original is never changed or removed.

### desktop-mount-button

**Mount drive** — `#mount-button`

- Kind: button
- Purpose: Show the unlocked drive in File Explorer under its drive letter.
- Effects: The drive letter appears in File Explorer. The drive stays encrypted at rest.
- Default: Not invoked
- Example: Example for "Mount drive": the drive letter appears in File Explorer. The drive stays encrypted at rest.

### desktop-explorer-button

**Open in Explorer** — `#explorer-button`

- Kind: button
- Purpose: Open the mounted drive in a File Explorer window.
- Effects: A File Explorer window opens on the drive; no file is changed.
- Default: Not invoked
- Example: Example for "Open in Explorer": a File Explorer window opens on the drive; no file is changed.

### desktop-file-search

**Search files** — `mfe-search[scope="drive-files"]`

- Kind: search
- Purpose: Narrow the file list to names that contain the text you type.
- Effects: Only the list on screen is filtered; files are not opened or moved.
- Default: Empty
- Example: Example for "Search files": only the list on screen is filtered; files are not opened or moved.

### desktop-force-lock-button

**Force lock** — `#force-lock-button`

- Kind: button
- Purpose: Lock the drive immediately even when files are still in use or work is still running.
- Effects: Open files may lose unsaved changes. Use Lock drive first whenever you can.
- Default: Not invoked
- Example: Example for "Force lock": open files may lose unsaved changes. Use Lock drive first whenever you can.

### desktop-load-more-files

**Load more files** — `#load-more-files`

- Kind: button
- Purpose: Fetch the next page of the file list when the drive holds more files than fit on one page.
- Effects: More rows are added below the ones you already see. Nothing is opened or changed.
- Default: Not invoked
- Example: Example for "Load more files": more rows are added below the ones you already see. Nothing is opened or changed.

### desktop-retry-files

**Retry loading files** — `#retry-files`

- Kind: button
- Purpose: Ask for the file list again after loading it failed.
- Effects: The list is requested from the start again. A repeat failure shows the same error.
- Default: Not invoked
- Example: Example for "Retry loading files": the list is requested from the start again. A repeat failure shows the same error.

### desktop-file-details-button

**File details** — `#file-details-button`

- Kind: button
- Purpose: Open the details of the selected file: its versions, activity and labels.
- Effects: The File details tab opens. Viewing details never changes the file.
- Default: Not invoked
- Example: Example for "File details": the File details tab opens. Viewing details never changes the file.

### desktop-settings-local-search

**Search settings** — `#settings-local-search`

- Kind: search
- Purpose: Narrow the settings page to sections that match the text you type.
- Effects: Sections that do not match are hidden until the text is cleared. No setting changes.
- Default: Empty
- Example: Example for "Search settings": sections that do not match are hidden until the text is cleared. No setting changes.

### desktop-import-button

**Import files** — `#import-button`

- Kind: button
- Purpose: Pick files from your computer and add encrypted copies of them to the drive.
- Effects: The files are queued for import and appear in the list when they finish. Your originals stay where they are.
- Default: Not invoked
- Example: Example for "Import files": the files are queued for import and appear in the list when they finish. Your originals stay where they are.

### desktop-open-button

**Open** — `#open-button`

- Kind: button
- Purpose: Open the selected file with the program Windows normally uses for it.
- Effects: The file opens from the mounted drive; saving in that program writes back to the drive.
- Default: Not invoked
- Example: Example for "Open": the file opens from the mounted drive; saving in that program writes back to the drive.

### desktop-export-button

**Export copy** — `#export-button`

- Kind: button
- Purpose: Save a decrypted copy of the selected file to a folder you choose.
- Effects: A readable copy is written outside the drive. The encrypted original is not removed.
- Default: Not invoked
- Example: Example for "Export copy": a readable copy is written outside the drive. The encrypted original is not removed.

### desktop-offline-button

**Keep offline** — `#offline-button`

- Kind: button
- Purpose: Keep an encrypted copy of the selected file on this computer so it opens without a connection.
- Effects: The file is downloaded into the encrypted cache and marked available offline.
- Default: Not invoked
- Example: Example for "Keep offline": the file is downloaded into the encrypted cache and marked available offline.

### desktop-delete-button

**Delete selected files** — `#delete-button`

- Kind: button
- Purpose: Move every selected file to the drive Recycle Bin after the two-key confirmation.
- Effects: The files leave the drive view. They can be restored from the Recycle Bin until it is emptied.
- Default: Not invoked
- Example: Example for "Delete selected files": the files leave the drive view. They can be restored from the Recycle Bin until it is emptied.

### desktop-select-all-files

**Select all visible files** — `#select-all-files`

- Kind: toggle
- Purpose: Select or clear every file currently shown in the table.
- Effects: Only the selection changes. Nothing is opened, moved or deleted.
- Default: Off
- Example: Example for "Select all visible files": only the selection changes. Nothing is opened, moved or deleted.

### desktop-release-button

**Remove offline copy** — `#release-button`

- Kind: button
- Purpose: Free the space used by the offline copy of the selected file.
- Effects: Only the local cached copy is removed. The file stays in the drive.
- Default: Not invoked
- Example: Example for "Remove offline copy": only the local cached copy is removed. The file stays in the drive.

### desktop-empty-import-button

**Import files (empty drive)** — `#empty-import-button`

- Kind: button
- Purpose: Add your first files when the drive is empty, using the same picker as the toolbar button.
- Effects: Chosen files are queued for import and the empty message disappears once they arrive.
- Default: Not invoked
- Example: Example for "Import files (empty drive)": chosen files are queued for import and the empty message disappears once they arrive.

### desktop-sync-button

**Sync now** — `#sync-button`

- Kind: button
- Purpose: Send pending changes to the drive’s storage and fetch changes from it right away.
- Effects: The footer shows the result. Nothing is synced if the storage cannot be reached.
- Default: Not invoked
- Example: Example for "Sync now": the footer shows the result. Nothing is synced if the storage cannot be reached.

### desktop-split-value

**Encrypted part size** — `#split-value`

- Kind: number
- Purpose: Set how large each encrypted part of a new or edited file may be.
- Effects: Only new and edited files use the size once you apply it; existing files keep their parts.
- Default: 80 in the chosen unit
- Example: Example for "Encrypted part size": only new and edited files use the size once you apply it; existing files keep their parts.

### desktop-split-unit

**Part size unit** — `#split-unit`

- Kind: choice
- Purpose: Choose whether the part size is counted in KiB, MiB or GiB.
- Effects: The unit changes how the number beside it is read. The 90,000,000 byte limit still applies.
- Default: The first entry in the list
- Example: Example for "Part size unit": the unit changes how the number beside it is read. The 90,000,000 byte limit still applies.

### desktop-split-apply

**Apply part size** — `#split-apply`

- Kind: button
- Purpose: Save the part size you entered for future files.
- Effects: New and edited files use the saved size. A value that is too large or not a number is rejected.
- Default: Not invoked
- Example: Example for "Apply part size": new and edited files use the saved size. A value that is too large or not a number is rejected.

### desktop-resplit-button

**Re-split existing files** — `#resplit-button`

- Kind: button
- Purpose: Rewrite files that already exist so their parts follow the current part size.
- Effects: A long background job rewrites encrypted parts. Files stay readable while it runs.
- Default: Not invoked
- Example: Example for "Re-split existing files": a long background job rewrites encrypted parts. Files stay readable while it runs.

### desktop-startup-setting

**Start with Windows** — `#startup-setting`

- Kind: toggle
- Purpose: Start this app when you sign in to Windows.
- Effects: The setting applies the next time you sign in. It never unlocks a drive by itself.
- Default: Off
- Example: Example for "Start with Windows": the setting applies the next time you sign in. It never unlocks a drive by itself.

### desktop-auto-unlock-setting

**Automatically unlock this drive** — `#auto-unlock-setting`

- Kind: toggle
- Purpose: Keep a protected key for the drive so this Windows account can unlock it without typing.
- Effects: Other people who use this Windows account can also unlock the drive. Turn it off to stop that.
- Default: Off
- Example: Example for "Automatically unlock this drive": other people who use this Windows account can also unlock the drive. Turn it off to stop that.

### desktop-forget-credential

**Forget saved credential** — `#forget-credential`

- Kind: button
- Purpose: Delete the protected key saved for automatic unlock.
- Effects: The next unlock asks for the password or key file again. Your files are not touched.
- Default: Not invoked
- Example: Example for "Forget saved credential": the next unlock asks for the password or key file again. Your files are not touched.

### desktop-theme-setting

**Appearance** — `#theme-setting`

- Kind: choice
- Purpose: Choose whether the app follows the device, or always uses the light or dark theme.
- Effects: The colours change at once and the choice is remembered on this device.
- Default: The first entry in the list
- Example: Example for "Appearance": the colours change at once and the choice is remembered on this device.

### desktop-language-setting

**Language** — `#language-setting`

- Kind: choice
- Purpose: Choose English, Cantonese or both together for labels and messages.
- Effects: Visible text switches at once. File names and paths are never translated.
- Default: The first entry in the list
- Example: Example for "Language": visible text switches at once. File names and paths are never translated.

### desktop-performance-mode-setting

**Background work priority** — `#performance-mode-setting`

- Kind: choice
- Purpose: Choose between keeping the computer responsive and finishing encryption and sync as fast as possible.
- Effects: Responsive mode lowers background priority; throughput mode uses normal priority. Both bound their buffers.
- Default: The first entry in the list
- Example: Example for "Background work priority": responsive mode lowers background priority; throughput mode uses normal priority. Both bound their buffers.

### desktop-emoji-setting

**Emoji in dialogs** — `#emoji-setting`

- Kind: toggle
- Purpose: Show a small friendly face in dialogs and message boxes.
- Effects: Only decoration changes. The facts in every message stay the same.
- Default: Off
- Example: Example for "Emoji in dialogs": only decoration changes. The facts in every message stay the same.

### desktop-funny-english

**English playfulness** — `#funnyEnglish-setting`

- Kind: number
- Purpose: Set how playful English messages sound, from 1 (plain) to 5 (most playful).
- Effects: Only the tone of English messages changes. Facts and numbers do not.
- Default: The control’s starting value
- Example: Example for "English playfulness": only the tone of English messages changes. Facts and numbers do not.

### desktop-funny-cantonese

**Cantonese playfulness** — `#funnyCantonese-setting`

- Kind: number
- Purpose: Set how playful Cantonese messages sound, from 1 (plain) to 5 (most playful).
- Effects: Only the tone of Cantonese messages changes. Facts and numbers do not.
- Default: The control’s starting value
- Example: Example for "Cantonese playfulness": only the tone of Cantonese messages changes. Facts and numbers do not.

### desktop-vocabulary-label

**Import vocabulary JSON** — `#vocabulary-label`

- Kind: file
- Purpose: Load your own label replacements from a JSON file kept on this device.
- Effects: Matching interface labels are replaced. File names and paths are never changed.
- Default: Nothing chosen
- Example: Example for "Import vocabulary JSON": matching interface labels are replaced. File names and paths are never changed.

### desktop-reset-vocabulary

**Reset vocabulary** — `#reset-vocabulary`

- Kind: button
- Purpose: Remove every label replacement and return to the original wording.
- Effects: The original labels return at once. Your exported file, if any, is not touched.
- Default: Not invoked
- Example: Example for "Reset vocabulary": the original labels return at once. Your exported file, if any, is not touched.

### desktop-open-setup-guide

**Open the setup guide** — `#open-setup-guide`

- Kind: button
- Purpose: Reopen the guided setup: language and look, requirements, your drive and pairing a browser.
- Effects: The Setup guide tab opens where you stopped. Each step keeps its own button, so nothing happens until you press one.
- Default: Not invoked
- Example: Example for "Open the setup guide": the Setup guide tab opens where you stopped. Each step keeps its own button, so nothing happens until you press one.

### desktop-project-website-link

**Project website** — `#project-website-link`

- Kind: link
- Purpose: Open the project website in your browser.
- Effects: Your browser opens the fixed project address. Nothing from your drive is sent.
- Default: Not opened
- Example: Example for "Project website": your browser opens the fixed project address. Nothing from your drive is sent.

### desktop-winfsp-link

**WinFsp website** — `#winfsp-link`

- Kind: link
- Purpose: Open the WinFsp project website to read about the driver this app uses.
- Effects: Your browser opens the fixed WinFsp address. Nothing is installed by this link.
- Default: Not opened
- Example: Example for "WinFsp website": your browser opens the fixed WinFsp address. Nothing is installed by this link.

### desktop-dialog-close

**Close dialog** — `#dialog-close`

- Kind: button
- Purpose: Close the drive dialog without creating, upgrading or unlocking anything.
- Effects: Typed passwords and key file paths are cleared. No drive is changed.
- Default: Not invoked
- Example: Example for "Close dialog": typed passwords and key file paths are cleared. No drive is changed.

### desktop-transport-mode

**Encrypted storage transport** — `#transport-mode`

- Kind: choice
- Purpose: Choose whether encrypted data lives in a folder or in a private GitHub repository.
- Effects: Choosing a private repository adds an owner/name field. Only encrypted data is synchronized.
- Default: The first entry in the list
- Example: Example for "Encrypted storage transport": choosing a private repository adds an owner/name field. Only encrypted data is synchronized.

### desktop-remote-repository

**Private repository owner/name** — `#remote-repository`

- Kind: text
- Purpose: Name the private GitHub repository that stores the encrypted data, as owner/repository.
- Effects: The name is checked when you submit. Enter a name, never a link and never a token.
- Default: Empty
- Example: Example for "Private repository owner/name": the name is checked when you submit. Enter a name, never a link and never a token.

### desktop-storage-input

**Encrypted storage folder** — `#storage-input`

- Kind: text
- Purpose: Set the folder where the encrypted parts of the drive are kept.
- Effects: The drive writes encrypted parts here. A cloud-synced folder works too.
- Default: Empty
- Example: Example for "Encrypted storage folder": the drive writes encrypted parts here. A cloud-synced folder works too.

### desktop-browse-storage

**Browse for the storage folder** — `[data-browse="storage-input"]`

- Kind: file
- Purpose: Pick the encrypted storage folder with the system folder picker instead of typing its path.
- Effects: The chosen path fills the storage folder field. Cancelling leaves it as it was.
- Default: Nothing chosen
- Example: Example for "Browse for the storage folder": the chosen path fills the storage folder field. Cancelling leaves it as it was.

### desktop-cache-input

**Encrypted cache folder** — `#cache-input`

- Kind: text
- Purpose: Set the folder that holds offline parts of files on this computer.
- Effects: Offline parts stay encrypted there. It is not a decrypted folder.
- Default: Empty
- Example: Example for "Encrypted cache folder": offline parts stay encrypted there. It is not a decrypted folder.

### desktop-browse-cache

**Browse for the cache folder** — `[data-browse="cache-input"]`

- Kind: file
- Purpose: Pick the encrypted cache folder with the system folder picker.
- Effects: The chosen path fills the cache folder field. Cancelling leaves it as it was.
- Default: Nothing chosen
- Example: Example for "Browse for the cache folder": the chosen path fills the cache folder field. Cancelling leaves it as it was.

### desktop-drive-letter

**Drive letter** — `#drive-letter`

- Kind: text
- Purpose: Type the drive letter the mounted drive should use in File Explorer, such as M or M:.
- Effects: A letter that is already taken is flagged under the field before you can continue.
- Default: M:
- Example: Example for "Drive letter": a letter that is already taken is flagged under the field before you can continue.

### desktop-drive-letter-toggle

**Choose an available drive letter** — `#drive-letter-toggle`

- Kind: button
- Purpose: Open the list of drive letters that are free on this computer.
- Effects: Picking a letter from the list fills the drive letter field. The list closes on Escape.
- Default: Not invoked
- Example: Example for "Choose an available drive letter": picking a letter from the list fills the drive letter field. The list closes on Escape.

### desktop-drive-name

**Drive name** — `#drive-name`

- Kind: text
- Purpose: Set the name File Explorer shows for the drive.
- Effects: The name appears next to the drive letter. Characters Windows does not allow are rejected.
- Default: Material Files
- Example: Example for "Drive name": the name appears next to the drive letter. Characters Windows does not allow are rejected.

### desktop-credential-mode

**Unlock with** — `md-radio[name="credential-mode"]`

- Kind: choice
- Purpose: Choose whether the drive unlocks with a password or with a key file.
- Effects: The matching fields appear below. You cannot change the method for an existing drive here.
- Default: Password
- Example: Example for "Unlock with": the matching fields appear below. You cannot change the method for an existing drive here.

### desktop-password-input

**Password** — `#password-input`

- Kind: credential
- Purpose: Type the password that protects the drive. There is no recovery if it is lost.
- Effects: The password is used to derive the drive key. It is never saved in preferences or logs.
- Default: Empty
- Example: Example for "Password": the password is used to derive the drive key. It is never saved in preferences or logs.

### desktop-show-password

**Show password** — `#show-password`

- Kind: button
- Purpose: Reveal or hide the characters you typed in the password fields.
- Effects: Only what is on screen changes. The password is not copied anywhere.
- Default: Not invoked
- Example: Example for "Show password": only what is on screen changes. The password is not copied anywhere.

### desktop-confirm-password

**Confirm password** — `#confirm-password`

- Kind: credential
- Purpose: Type the new password a second time so a typing slip cannot lock you out.
- Effects: Creating the drive is blocked until both entries are identical.
- Default: Empty
- Example: Example for "Confirm password": creating the drive is blocked until both entries are identical.

### desktop-key-path

**Key file** — `#key-path`

- Kind: text
- Purpose: Set the path of the key file that unlocks this drive.
- Effects: The file is read only when you unlock. Keep it outside the storage and cache folders.
- Default: Empty
- Example: Example for "Key file": the file is read only when you unlock. Keep it outside the storage and cache folders.

### desktop-choose-key

**Choose key file** — `#choose-key`

- Kind: file
- Purpose: Pick an existing key file with the system file picker.
- Effects: The chosen path fills the key file field. The file itself is not changed.
- Default: Nothing chosen
- Example: Example for "Choose key file": the chosen path fills the key file field. The file itself is not changed.

### desktop-generate-key

**Generate key file** — `#generate-key`

- Kind: button
- Purpose: Create a new random key file you can use instead of a password.
- Effects: A new file is written to a place you choose. Keep a safe copy because there is no recovery.
- Default: Not invoked
- Example: Example for "Generate key file": a new file is written to a place you choose. Keep a safe copy because there is no recovery.

### desktop-create-split-value

**Maximum encrypted part size** — `#create-split-value`

- Kind: number
- Purpose: Set the largest size of each encrypted part for the drive you are creating.
- Effects: The size is saved with the new drive and can be changed later in My drive.
- Default: 80 in the chosen unit
- Example: Example for "Maximum encrypted part size": the size is saved with the new drive and can be changed later in My drive.

### desktop-create-split-unit

**Creation part size unit** — `#create-split-unit`

- Kind: choice
- Purpose: Choose KiB, MiB or GiB for the part size entered above.
- Effects: The unit decides how the number is read. The overall byte limit still applies.
- Default: The first entry in the list
- Example: Example for "Creation part size unit": the unit decides how the number is read. The overall byte limit still applies.

### desktop-dialog-cancel

**Cancel** — `#dialog-cancel`

- Kind: button
- Purpose: Close the drive dialog and discard what you typed.
- Effects: No drive is created or unlocked. Typed secrets are cleared.
- Default: Not invoked
- Example: Example for "Cancel": no drive is created or unlocked. Typed secrets are cleared.

### desktop-dialog-submit

**Create, unlock or upgrade** — `#dialog-submit`

- Kind: button
- Purpose: Carry out the action named on this button: create a drive, unlock one or create an upgraded copy.
- Effects: The fields are checked first and the first problem is shown. A success closes the dialog.
- Default: Not invoked
- Example: Example for "Create, unlock or upgrade": the fields are checked first and the first problem is shown. A success closes the dialog.

### desktop-confirm-action

**Confirm** — `#confirm-action`

- Kind: button
- Purpose: Confirm the action this dialog asks about, such as removing an offline copy or emptying the recycle bin.
- Effects: The named action goes ahead. Choosing Cancel instead leaves everything unchanged.
- Default: Not invoked
- Example: Example for "Confirm": the named action goes ahead. Choosing Cancel instead leaves everything unchanged.

### desktop-confirm-cancel

**Cancel confirmation** — `[value="cancel"]`

- Kind: button
- Purpose: Close the confirmation dialog without doing the action it asks about.
- Effects: Nothing changes. This is the safe choice and it has focus when the dialog opens.
- Default: Not invoked
- Example: Example for "Cancel confirmation": nothing changes. This is the safe choice and it has focus when the dialog opens.

### Exemptions on the desktop app

- `[data-window="minimize"]`: Operating system window chrome. Its label names the action and it changes no data.
- `[data-window="maximize"]`: Operating system window chrome. Its label names the action and it changes no data.
- `[data-window="close"]`: Operating system window chrome. Its label names the action and it changes no data.
- `#export-vocabulary`: Removed at start-up: the app does not offer to export the personal vocabulary.
- `#file-search`: Hidden at start-up and replaced by the search component, which carries the explanation.
- `mfe-file-picker#vocabulary-file`: A hidden file input. The visible Import vocabulary JSON button opens it and carries the explanation.

## Website

### site-menu-toggle

**Open navigation** — `#menu-toggle`

- Kind: button
- Purpose: Open or close the page navigation menu on narrow screens.
- Effects: The list of page sections appears or hides. No page content changes.
- Default: Not invoked
- Example: Example for "Open navigation": the list of page sections appears or hides. No page content changes.

### site-explore-toggle

**Explore** — `#explore-toggle`

- Kind: button
- Purpose: Open or close the list that leads to the documentation library, wiki, workspace and capture gallery.
- Effects: The extra links appear or hide. Nothing is loaded until you follow one.
- Default: Not invoked
- Example: Example for "Explore": the extra links appear or hide. Nothing is loaded until you follow one.

### site-preferences-open

**Website preferences** — `#preferences-open`

- Kind: button
- Purpose: Open the dialog for appearance, language, message tone and personal vocabulary on this website.
- Effects: The dialog opens over the page. Settings are kept in this browser only.
- Default: Not invoked
- Example: Example for "Website preferences": the dialog opens over the page. Settings are kept in this browser only.

### site-operation-write

**Write** — `[data-operation="write"]`

- Kind: button
- Purpose: Show the animated example of what happens when a file is saved to the drive.
- Effects: The diagram plays the write path. It is a concept demonstration; no file is processed.
- Default: Not invoked
- Example: Example for "Write": the diagram plays the write path. It is a concept demonstration; no file is processed.

### site-operation-read

**Read** — `[data-operation="read"]`

- Kind: button
- Purpose: Show the example of what happens when a file is opened from the drive.
- Effects: The diagram plays the read path, with the decryption step highlighted. Nothing is read from your computer.
- Default: Not invoked
- Example: Example for "Read": the diagram plays the read path, with the decryption step highlighted. Nothing is read from your computer.

### site-operation-offline

**Offline** — `[data-operation="offline"]`

- Kind: button
- Purpose: Show the example of reading a file when the storage cannot be reached.
- Effects: The result depends on the example availability you chose: a complete cache works, an incomplete one does not.
- Default: Not invoked
- Example: Example for "Offline": the result depends on the example availability you chose: a complete cache works, an incomplete one does not.

### site-operation-startup

**Startup** — `[data-operation="startup"]`

- Kind: button
- Purpose: Show the example of what happens when the app starts with Windows.
- Effects: The diagram explains the start-up and optional automatic unlock steps. Nothing is installed.
- Default: Not invoked
- Example: Example for "Startup": the diagram explains the start-up and optional automatic unlock steps. Nothing is installed.

### site-operation-resplit

**Resplit** — `[data-operation="resplit"]`

- Kind: button
- Purpose: Show the example of rewriting existing files into a different part size.
- Effects: The diagram and the size example below it update. Your own files are never touched.
- Default: Not invoked
- Example: Example for "Resplit": the diagram and the size example below it update. Your own files are never touched.

### site-access-mode

**Example availability** — `#access-mode`

- Kind: choice
- Purpose: Choose whether the example assumes the storage is reachable, the cache is complete or the cache is incomplete.
- Effects: The result text under the diagram changes to match. It describes an example, not your files.
- Default: The first entry in the list
- Example: Example for "Example availability": the result text under the diagram changes to match. It describes an example, not your files.

### site-part-limit

**Maximum encrypted part size** — `#part-limit`

- Kind: number
- Purpose: Type a part size to see how a 16 MiB example file would be split.
- Effects: The part count in the example updates. A value that is too large or not a number shows a message.
- Default: 10 in the chosen unit
- Example: Example for "Maximum encrypted part size": the part count in the example updates. A value that is too large or not a number shows a message.

### site-part-limit-clear

**Clear maximum encrypted part size** — `#part-limit-clear`

- Kind: button
- Purpose: Empty the part size field so you can type a new value.
- Effects: The field becomes empty and the example shows a prompt instead of a result.
- Default: Not invoked
- Example: Example for "Clear maximum encrypted part size": the field becomes empty and the example shows a prompt instead of a result.

### site-part-unit

**Part size unit** — `#part-unit`

- Kind: choice
- Purpose: Choose whether the example part size is in KiB, MiB or GiB.
- Effects: The unit decides how the number is read in the example. Real vaults are unaffected.
- Default: The first entry in the list
- Example: Example for "Part size unit": the unit decides how the number is read in the example. Real vaults are unaffected.

### site-workflow-play

**Play walkthrough** — `#workflow-play`

- Kind: button
- Purpose: Play the conceptual workflow one step after another, or advance one step at a time.
- Effects: The steps highlight in order. When your device asks for reduced motion it advances one step per press instead.
- Default: Not invoked
- Example: Example for "Play walkthrough": the steps highlight in order. When your device asks for reduced motion it advances one step per press instead.

### site-workflow-replay

**Replay workflow** — `#workflow-replay`

- Kind: button
- Purpose: Start the conceptual workflow again from the first step.
- Effects: The highlight returns to the start and plays again. Nothing outside the diagram changes.
- Default: Not invoked
- Example: Example for "Replay workflow": the highlight returns to the start and plays again. Nothing outside the diagram changes.

### site-doc-search

**Search documentation** — `#doc-search`

- Kind: search
- Purpose: Type words to narrow the guides and articles to those that mention them.
- Effects: Guides that do not match are hidden until you clear the search. Nothing is sent anywhere.
- Default: Empty
- Example: Example for "Search documentation": guides that do not match are hidden until you clear the search. Nothing is sent anywhere.

### site-search-clear

**Clear documentation search** — `#search-clear`

- Kind: button
- Purpose: Empty the documentation search so every guide is listed again.
- Effects: The search text is removed and all guides return.
- Default: Not invoked
- Example: Example for "Clear documentation search": the search text is removed and all guides return.

### site-preview-download

**Download the preview** — `#preview-download`

- Kind: button
- Purpose: Download the verified preview installer once a release has been published and checked.
- Effects: It stays disabled until a release record exists. Nothing is downloaded before you press it.
- Default: Not invoked
- Example: Example for "Download the preview": it stays disabled until a release record exists. Nothing is downloaded before you press it.

### site-preferences-footer

**Website preferences (footer)** — `#preferences-footer`

- Kind: button
- Purpose: Open the same preferences dialog from the page footer.
- Effects: The dialog opens. It is the same set of settings as the button in the header.
- Default: Not invoked
- Example: Example for "Website preferences (footer)": the dialog opens. It is the same set of settings as the button in the header.

### site-preferences-close

**Close preferences** — `#preferences-close`

- Kind: button
- Purpose: Close the preferences dialog and return to the page.
- Effects: Your choices are already applied; closing only hides the dialog.
- Default: Not invoked
- Example: Example for "Close preferences": your choices are already applied; closing only hides the dialog.

### site-vocabulary-file

**Choose a vocabulary JSON file** — `#vocabulary-file`

- Kind: file
- Purpose: Load your own wording replacements from a JSON file on this device.
- Effects: The file is read in this browser only and never uploaded. Matching labels are replaced.
- Default: Nothing chosen
- Example: Example for "Choose a vocabulary JSON file": the file is read in this browser only and never uploaded. Matching labels are replaced.

### site-vocabulary-reset

**Reset vocabulary** — `#vocabulary-reset`

- Kind: button
- Purpose: Remove every wording replacement and go back to the default text.
- Effects: The default wording returns at once. Your original file is untouched.
- Default: Not invoked
- Example: Example for "Reset vocabulary": the default wording returns at once. Your original file is untouched.

### site-page-tools-toggle

**Page tools** — `#page-tools-toggle`

- Kind: button
- Purpose: Open or close the page tools: tabs, command palette and notifications for this page.
- Effects: The tools panel appears or hides. Page content does not change.
- Default: Not invoked
- Example: Example for "Page tools": the tools panel appears or hides. Page content does not change.

### Exemptions on the website

- `#theme-select`: A migration binding that the page hides at start-up. The visible control comes from the personalization panel, which carries its own registered explanation.
- `#language-select`: A migration binding that the page hides at start-up. The visible control comes from the personalization panel, which carries its own registered explanation.
- `#emoji-toggle`: A migration binding that the page hides at start-up. The visible control comes from the personalization panel, which carries its own registered explanation.
- `#success-tone`: A migration binding that the page hides at start-up. The visible control comes from the personalization panel, which carries its own registered explanation.
- `#english-tone-reset`: A migration binding that the page hides at start-up. The visible control comes from the personalization panel, which carries its own registered explanation.
- `#search-tone`: A migration binding that the page hides at start-up. The visible control comes from the personalization panel, which carries its own registered explanation.
- `#cantonese-tone-reset`: A migration binding that the page hides at start-up. The visible control comes from the personalization panel, which carries its own registered explanation.

## Browser extension popup

### extension-popup-pair

**Pair browser** — `#pair`

- Kind: button
- Purpose: Ask the desktop app to pair with this browser so it can receive download links.
- Effects: The desktop app asks you to approve the pairing. Nothing is paired until you approve it there.
- Default: Not invoked
- Example: Example for "Pair browser": the desktop app asks you to approve the pairing. Nothing is paired until you approve it there.

### extension-popup-disconnect

**Disconnect** — `#disconnect`

- Kind: button
- Purpose: End the pairing between this browser and the desktop app.
- Effects: The browser forgets its pairing. Downloads can no longer be handed to the desktop until you pair again.
- Default: Not invoked
- Example: Example for "Disconnect": the browser forgets its pairing. Downloads can no longer be handed to the desktop until you pair again.

### extension-popup-workspace

**Open workspace** — `#workspace`

- Kind: button
- Purpose: Open the full workspace page of the extension in a browser tab.
- Effects: A new tab opens on the workspace home. Nothing is sent or changed.
- Default: Not invoked
- Example: Example for "Open workspace": a new tab opens on the workspace home. Nothing is sent or changed.

### extension-popup-popup-search

**Find instructions** — `#search`

- Kind: search
- Purpose: Type words to narrow the instructions in the popup to those that mention them.
- Effects: Instructions that do not match are hidden until you clear the text. Nothing is sent anywhere.
- Default: Empty
- Example: Example for "Find instructions": instructions that do not match are hidden until you clear the text. Nothing is sent anywhere.

### extension-popup-popup-language

**Language** — `[role="group"]`

- Kind: navigation
- Purpose: Choose English, Cantonese or both together for the popup wording.
- Effects: The popup text switches at once and the choice is shared with the workspace.
- Default: The first destination
- Example: Example for "Language": the popup text switches at once and the choice is shared with the workspace.

### extension-popup-launch-connection

**Open Connection** — `#launch-connection`

- Kind: button
- Purpose: Open the Connection section of the workspace, where you can pair this browser with the desktop and read protection observations.
- Effects: The workspace opens in a tab on the Connection section. Nothing is sent or changed.
- Default: Not invoked
- Example: Example for "Open Connection": the workspace opens in a tab on the Connection section. Nothing is sent or changed.

### extension-popup-launch-personalization

**Open Personalization** — `#launch-personalization`

- Kind: button
- Purpose: Open the Personalization section of the workspace, where you can language, theme, message tone, accent, logo, attention modes, narration and personal wording.
- Effects: The workspace opens in a tab on the Personalization section. Nothing is sent or changed.
- Default: Not invoked
- Example: Example for "Open Personalization": the workspace opens in a tab on the Personalization section. Nothing is sent or changed.

### extension-popup-launch-changelog

**Open Changelog** — `#launch-changelog`

- Kind: button
- Purpose: Open the Changelog section of the workspace, where you can filter and export the list of changes.
- Effects: The workspace opens in a tab on the Changelog section. Nothing is sent or changed.
- Default: Not invoked
- Example: Example for "Open Changelog": the workspace opens in a tab on the Changelog section. Nothing is sent or changed.

### extension-popup-launch-notes

**Open Notes** — `#launch-notes`

- Kind: button
- Purpose: Open the Notes section of the workspace, where you can write, read, export and delete notes kept in this browser.
- Effects: The workspace opens in a tab on the Notes section. Nothing is sent or changed.
- Default: Not invoked
- Example: Example for "Open Notes": the workspace opens in a tab on the Notes section. Nothing is sent or changed.

### extension-popup-launch-docs

**Open Documentation** — `#launch-docs`

- Kind: button
- Purpose: Open the Documentation section of the workspace, where you can read the bundled documentation without a connection.
- Effects: The workspace opens in a tab on the Documentation section. Nothing is sent or changed.
- Default: Not invoked
- Example: Example for "Open Documentation": the workspace opens in a tab on the Documentation section. Nothing is sent or changed.

### extension-popup-launch-support

**Open Support** — `#launch-support`

- Kind: button
- Purpose: Open the Support section of the workspace, where you can save support tickets and record the screen for a report.
- Effects: The workspace opens in a tab on the Support section. Nothing is sent or changed.
- Default: Not invoked
- Example: Example for "Open Support": the workspace opens in a tab on the Support section. Nothing is sent or changed.

### extension-popup-launch-dimsum

**Open Dim sum** — `#launch-dimsum`

- Kind: button
- Purpose: Open the Dim sum section of the workspace, where you can browse the public dim sum catalogue after you load it.
- Effects: The workspace opens in a tab on the Dim sum section. Nothing is sent or changed.
- Default: Not invoked
- Example: Example for "Open Dim sum": the workspace opens in a tab on the Dim sum section. Nothing is sent or changed.

### extension-popup-launch-models

**Open Models** — `#launch-models`

- Kind: button
- Purpose: Open the Models section of the workspace, where you can talk to a model server running on this computer.
- Effects: The workspace opens in a tab on the Models section. Nothing is sent or changed.
- Default: Not invoked
- Example: Example for "Open Models": the workspace opens in a tab on the Models section. Nothing is sent or changed.

### extension-popup-launch-status

**Open Status** — `#launch-status`

- Kind: button
- Purpose: Open the Status section of the workspace, where you can see versions, build provenance, desktop status and feature coverage.
- Effects: The workspace opens in a tab on the Status section. Nothing is sent or changed.
- Default: Not invoked
- Example: Example for "Open Status": the workspace opens in a tab on the Status section. Nothing is sent or changed.

### extension-popup-launch-servers

**Open Servers** — `#launch-servers`

- Kind: button
- Purpose: Open the Servers section of the workspace, where you can prepare and manage game servers.
- Effects: The workspace opens in a tab on the Servers section. Nothing is sent or changed.
- Default: Not invoked
- Example: Example for "Open Servers": the workspace opens in a tab on the Servers section. Nothing is sent or changed.

## Browser extension workspace

### extension-options-home-back

**Back to home** — `#home-back`

- Kind: button
- Purpose: Return from a section to the workspace home, which lists every section.
- Effects: The section closes and the home cards show again. Your settings are unchanged.
- Default: Not invoked
- Example: Example for "Back to home": the section closes and the home cards show again. Your settings are unchanged.

### extension-options-palette-open

**Commands** — `#palette-open`

- Kind: button
- Purpose: Open the command palette to run any workspace action by typing its name.
- Effects: A dialog lists matching commands. Nothing runs until you choose one.
- Default: Not invoked
- Example: Example for "Commands": a dialog lists matching commands. Nothing runs until you choose one.

### extension-options-search-toggle

**Search the page** — `#search-toggle`

- Kind: button
- Purpose: Show or hide the search box that filters the explanations on this page.
- Effects: The box appears or hides. Typing in it only hides explanations that do not match.
- Default: Not invoked
- Example: Example for "Search the page": the box appears or hides. Typing in it only hides explanations that do not match.

### extension-options-palette-icon

**Open commands** — `#palette-icon`

- Kind: button
- Purpose: Open the command palette from the toolbar icon.
- Effects: The same command dialog opens as the Commands button. Nothing runs until you choose a command.
- Default: Not invoked
- Example: Example for "Open commands": the same command dialog opens as the Commands button. Nothing runs until you choose a command.

### extension-options-section-connection

**Connection section** — `button[data-tab="connection"]`

- Kind: navigation
- Purpose: Open the Connection section, where you can pair this browser with the desktop and read protection observations.
- Effects: The Connection section opens and the other sections hide. Choosing a section never changes your data.
- Default: The first destination
- Example: Example for "Connection section": the Connection section opens and the other sections hide. Choosing a section never changes your data.

### extension-options-section-personalization

**Personalization section** — `button[data-tab="personalization"]`

- Kind: navigation
- Purpose: Open the Personalization section, where you can language, theme, message tone, accent, logo, attention modes, narration and personal wording.
- Effects: The Personalization section opens and the other sections hide. Choosing a section never changes your data.
- Default: The first destination
- Example: Example for "Personalization section": the Personalization section opens and the other sections hide. Choosing a section never changes your data.

### extension-options-section-changelog

**Changelog section** — `button[data-tab="changelog"]`

- Kind: navigation
- Purpose: Open the Changelog section, where you can filter and export the list of changes.
- Effects: The Changelog section opens and the other sections hide. Choosing a section never changes your data.
- Default: The first destination
- Example: Example for "Changelog section": the Changelog section opens and the other sections hide. Choosing a section never changes your data.

### extension-options-section-notes

**Notes section** — `button[data-tab="notes"]`

- Kind: navigation
- Purpose: Open the Notes section, where you can write, read, export and delete notes kept in this browser.
- Effects: The Notes section opens and the other sections hide. Choosing a section never changes your data.
- Default: The first destination
- Example: Example for "Notes section": the Notes section opens and the other sections hide. Choosing a section never changes your data.

### extension-options-section-docs

**Documentation section** — `button[data-tab="docs"]`

- Kind: navigation
- Purpose: Open the Documentation section, where you can read the bundled documentation without a connection.
- Effects: The Documentation section opens and the other sections hide. Choosing a section never changes your data.
- Default: The first destination
- Example: Example for "Documentation section": the Documentation section opens and the other sections hide. Choosing a section never changes your data.

### extension-options-section-support

**Support section** — `button[data-tab="support"]`

- Kind: navigation
- Purpose: Open the Support section, where you can save support tickets and record the screen for a report.
- Effects: The Support section opens and the other sections hide. Choosing a section never changes your data.
- Default: The first destination
- Example: Example for "Support section": the Support section opens and the other sections hide. Choosing a section never changes your data.

### extension-options-section-dimsum

**Dim sum section** — `button[data-tab="dimsum"]`

- Kind: navigation
- Purpose: Open the Dim sum section, where you can browse the public dim sum catalogue after you load it.
- Effects: The Dim sum section opens and the other sections hide. Choosing a section never changes your data.
- Default: The first destination
- Example: Example for "Dim sum section": the Dim sum section opens and the other sections hide. Choosing a section never changes your data.

### extension-options-section-models

**Models section** — `button[data-tab="models"]`

- Kind: navigation
- Purpose: Open the Models section, where you can talk to a model server running on this computer.
- Effects: The Models section opens and the other sections hide. Choosing a section never changes your data.
- Default: The first destination
- Example: Example for "Models section": the Models section opens and the other sections hide. Choosing a section never changes your data.

### extension-options-section-status

**Status section** — `button[data-tab="status"]`

- Kind: navigation
- Purpose: Open the Status section, where you can see versions, build provenance, desktop status and feature coverage.
- Effects: The Status section opens and the other sections hide. Choosing a section never changes your data.
- Default: The first destination
- Example: Example for "Status section": the Status section opens and the other sections hide. Choosing a section never changes your data.

### extension-options-section-publishing

**Progress and publication section** — `button[data-tab="publishing"]`

- Kind: navigation
- Purpose: Open the Progress and publication section, where you can follow the progress of publication tasks.
- Effects: The Progress and publication section opens and the other sections hide. Choosing a section never changes your data.
- Default: The first destination
- Example: Example for "Progress and publication section": the Progress and publication section opens and the other sections hide. Choosing a section never changes your data.

### extension-options-section-servers

**Servers section** — `button[data-tab="servers"]`

- Kind: navigation
- Purpose: Open the Servers section, where you can prepare and manage game servers.
- Effects: The Servers section opens and the other sections hide. Choosing a section never changes your data.
- Default: The first destination
- Example: Example for "Servers section": the Servers section opens and the other sections hide. Choosing a section never changes your data.

### extension-options-locks-read

**Read locks** — `#locks-read`

- Kind: button
- Purpose: Ask the paired desktop which workspace sections are locked.
- Effects: The list below shows each section as locked or unlocked. Reading never locks or unlocks anything.
- Default: Not invoked
- Example: Example for "Read locks": the list below shows each section as locked or unlocked. Reading never locks or unlocks anything.

### extension-options-lock-connection

**Lock Connection** — `#lock-connection-lock`

- Kind: button
- Purpose: Lock the Connection section so it cannot be changed until it is unlocked on the desktop.
- Effects: The desktop is asked to lock this section and confirms the result in the list. Other sections are unaffected.
- Default: Not invoked
- Example: Example for "Lock Connection": the desktop is asked to lock this section and confirms the result in the list. Other sections are unaffected.

### extension-options-unlock-connection

**Unlock Connection** — `#lock-connection-unlock`

- Kind: button
- Purpose: Ask the desktop to unlock the Connection section so it can be changed again.
- Effects: The desktop asks for its own approval first. Nothing unlocks until you approve it there.
- Default: Not invoked
- Example: Example for "Unlock Connection": the desktop asks for its own approval first. Nothing unlocks until you approve it there.

### extension-options-lock-personalization

**Lock Personalization** — `#lock-personalization-lock`

- Kind: button
- Purpose: Lock the Personalization section so it cannot be changed until it is unlocked on the desktop.
- Effects: The desktop is asked to lock this section and confirms the result in the list. Other sections are unaffected.
- Default: Not invoked
- Example: Example for "Lock Personalization": the desktop is asked to lock this section and confirms the result in the list. Other sections are unaffected.

### extension-options-unlock-personalization

**Unlock Personalization** — `#lock-personalization-unlock`

- Kind: button
- Purpose: Ask the desktop to unlock the Personalization section so it can be changed again.
- Effects: The desktop asks for its own approval first. Nothing unlocks until you approve it there.
- Default: Not invoked
- Example: Example for "Unlock Personalization": the desktop asks for its own approval first. Nothing unlocks until you approve it there.

### extension-options-lock-changelog

**Lock Changelog** — `#lock-changelog-lock`

- Kind: button
- Purpose: Lock the Changelog section so it cannot be changed until it is unlocked on the desktop.
- Effects: The desktop is asked to lock this section and confirms the result in the list. Other sections are unaffected.
- Default: Not invoked
- Example: Example for "Lock Changelog": the desktop is asked to lock this section and confirms the result in the list. Other sections are unaffected.

### extension-options-unlock-changelog

**Unlock Changelog** — `#lock-changelog-unlock`

- Kind: button
- Purpose: Ask the desktop to unlock the Changelog section so it can be changed again.
- Effects: The desktop asks for its own approval first. Nothing unlocks until you approve it there.
- Default: Not invoked
- Example: Example for "Unlock Changelog": the desktop asks for its own approval first. Nothing unlocks until you approve it there.

### extension-options-lock-notes

**Lock Notes** — `#lock-notes-lock`

- Kind: button
- Purpose: Lock the Notes section so it cannot be changed until it is unlocked on the desktop.
- Effects: The desktop is asked to lock this section and confirms the result in the list. Other sections are unaffected.
- Default: Not invoked
- Example: Example for "Lock Notes": the desktop is asked to lock this section and confirms the result in the list. Other sections are unaffected.

### extension-options-unlock-notes

**Unlock Notes** — `#lock-notes-unlock`

- Kind: button
- Purpose: Ask the desktop to unlock the Notes section so it can be changed again.
- Effects: The desktop asks for its own approval first. Nothing unlocks until you approve it there.
- Default: Not invoked
- Example: Example for "Unlock Notes": the desktop asks for its own approval first. Nothing unlocks until you approve it there.

### extension-options-lock-docs

**Lock Documentation** — `#lock-docs-lock`

- Kind: button
- Purpose: Lock the Documentation section so it cannot be changed until it is unlocked on the desktop.
- Effects: The desktop is asked to lock this section and confirms the result in the list. Other sections are unaffected.
- Default: Not invoked
- Example: Example for "Lock Documentation": the desktop is asked to lock this section and confirms the result in the list. Other sections are unaffected.

### extension-options-unlock-docs

**Unlock Documentation** — `#lock-docs-unlock`

- Kind: button
- Purpose: Ask the desktop to unlock the Documentation section so it can be changed again.
- Effects: The desktop asks for its own approval first. Nothing unlocks until you approve it there.
- Default: Not invoked
- Example: Example for "Unlock Documentation": the desktop asks for its own approval first. Nothing unlocks until you approve it there.

### extension-options-lock-support

**Lock Support** — `#lock-support-lock`

- Kind: button
- Purpose: Lock the Support section so it cannot be changed until it is unlocked on the desktop.
- Effects: The desktop is asked to lock this section and confirms the result in the list. Other sections are unaffected.
- Default: Not invoked
- Example: Example for "Lock Support": the desktop is asked to lock this section and confirms the result in the list. Other sections are unaffected.

### extension-options-unlock-support

**Unlock Support** — `#lock-support-unlock`

- Kind: button
- Purpose: Ask the desktop to unlock the Support section so it can be changed again.
- Effects: The desktop asks for its own approval first. Nothing unlocks until you approve it there.
- Default: Not invoked
- Example: Example for "Unlock Support": the desktop asks for its own approval first. Nothing unlocks until you approve it there.

### extension-options-lock-dimsum

**Lock Dim sum** — `#lock-dimsum-lock`

- Kind: button
- Purpose: Lock the Dim sum section so it cannot be changed until it is unlocked on the desktop.
- Effects: The desktop is asked to lock this section and confirms the result in the list. Other sections are unaffected.
- Default: Not invoked
- Example: Example for "Lock Dim sum": the desktop is asked to lock this section and confirms the result in the list. Other sections are unaffected.

### extension-options-unlock-dimsum

**Unlock Dim sum** — `#lock-dimsum-unlock`

- Kind: button
- Purpose: Ask the desktop to unlock the Dim sum section so it can be changed again.
- Effects: The desktop asks for its own approval first. Nothing unlocks until you approve it there.
- Default: Not invoked
- Example: Example for "Unlock Dim sum": the desktop asks for its own approval first. Nothing unlocks until you approve it there.

### extension-options-lock-models

**Lock Models** — `#lock-models-lock`

- Kind: button
- Purpose: Lock the Models section so it cannot be changed until it is unlocked on the desktop.
- Effects: The desktop is asked to lock this section and confirms the result in the list. Other sections are unaffected.
- Default: Not invoked
- Example: Example for "Lock Models": the desktop is asked to lock this section and confirms the result in the list. Other sections are unaffected.

### extension-options-unlock-models

**Unlock Models** — `#lock-models-unlock`

- Kind: button
- Purpose: Ask the desktop to unlock the Models section so it can be changed again.
- Effects: The desktop asks for its own approval first. Nothing unlocks until you approve it there.
- Default: Not invoked
- Example: Example for "Unlock Models": the desktop asks for its own approval first. Nothing unlocks until you approve it there.

### extension-options-lock-status

**Lock Status** — `#lock-status-lock`

- Kind: button
- Purpose: Lock the Status section so it cannot be changed until it is unlocked on the desktop.
- Effects: The desktop is asked to lock this section and confirms the result in the list. Other sections are unaffected.
- Default: Not invoked
- Example: Example for "Lock Status": the desktop is asked to lock this section and confirms the result in the list. Other sections are unaffected.

### extension-options-unlock-status

**Unlock Status** — `#lock-status-unlock`

- Kind: button
- Purpose: Ask the desktop to unlock the Status section so it can be changed again.
- Effects: The desktop asks for its own approval first. Nothing unlocks until you approve it there.
- Default: Not invoked
- Example: Example for "Unlock Status": the desktop asks for its own approval first. Nothing unlocks until you approve it there.

### extension-options-ladder-read

**Read level** — `#ladder-read`

- Kind: button
- Purpose: Ask the paired desktop which unlock level this browser has reached.
- Effects: The current level is shown. Reading never raises or lowers the level.
- Default: Not invoked
- Example: Example for "Read level": the current level is shown. Reading never raises or lowers the level.

### extension-options-ladder-step

**Request next step** — `#ladder-step`

- Kind: button
- Purpose: Ask the desktop for the next step of the unlock ladder.
- Effects: The desktop decides whether to grant the step and may ask you to confirm. Nothing is granted from here.
- Default: Not invoked
- Example: Example for "Request next step": the desktop decides whether to grant the step and may ask you to confirm. Nothing is granted from here.

### extension-options-workspace-search

**Find workspace guidance** — `#search`

- Kind: search
- Purpose: Type words to narrow the explanations on the open section to those that mention them.
- Effects: Explanations that do not match are hidden until you clear the text. Controls and data are untouched.
- Default: Empty
- Example: Example for "Find workspace guidance": explanations that do not match are hidden until you clear the text. Controls and data are untouched.

### extension-options-connection-pair

**Pair browser (connection section)** — `#pair`

- Kind: button
- Purpose: Send a pairing request to the desktop app, using the pairing code if you typed one.
- Effects: The desktop shows the request and waits for your approval. The browser is paired only after you approve it there.
- Default: Not invoked
- Example: Example for "Pair browser (connection section)": the desktop shows the request and waits for your approval. The browser is paired only after you approve it there.

### extension-options-connection-disconnect

**Disconnect (connection section)** — `#disconnect`

- Kind: button
- Purpose: Forget the pairing with the desktop app from this section.
- Effects: Hand-offs to the desktop stop until you pair again. Nothing on the desktop is deleted.
- Default: Not invoked
- Example: Example for "Disconnect (connection section)": hand-offs to the desktop stop until you pair again. Nothing on the desktop is deleted.

### extension-options-pair-code

**Pairing code (optional)** — `#pair-code`

- Kind: text
- Purpose: Type the one-time pairing code shown on the desktop when you pair this browser.
- Effects: The code is sent only when you press Pair browser. A wrong or expired code is rejected.
- Default: Empty
- Example: Example for "Pairing code (optional)": the code is sent only when you press Pair browser. A wrong or expired code is rejected.

### extension-options-pair-scan

**Scan code** — `#pair-scan`

- Kind: button
- Purpose: Use the camera to read the pairing code from the desktop screen.
- Effects: The browser asks permission for the camera first. The image is not stored or sent anywhere.
- Default: Not invoked
- Example: Example for "Scan code": the browser asks permission for the camera first. The image is not stored or sent anywhere.

### extension-options-pair-scan-stop

**Stop scanning** — `#pair-scan-stop`

- Kind: button
- Purpose: Turn the camera off and stop looking for a pairing code.
- Effects: The camera is released at once. You can still type the code by hand.
- Default: Not invoked
- Example: Example for "Stop scanning": the camera is released at once. You can still type the code by hand.

### extension-options-refresh

**Refresh observations** — `#refresh`

- Kind: button
- Purpose: Read the browser protection observations again.
- Effects: The observations on screen update. It is read-only and changes no browser setting.
- Default: Not invoked
- Example: Example for "Refresh observations": the observations on screen update. It is read-only and changes no browser setting.

### extension-options-editor-open

**Choose file and editor on desktop** — `#editor-open`

- Kind: button
- Purpose: Ask the desktop to let you pick a file and an external editor for it.
- Effects: The choice is made on the desktop, never in the browser. The request ends if you cancel there.
- Default: Not invoked
- Example: Example for "Choose file and editor on desktop": the choice is made on the desktop, never in the browser. The request ends if you cancel there.

### extension-options-editor-cancel

**Cancel request and disconnect** — `#editor-cancel`

- Kind: button
- Purpose: Cancel the pending external editor request and disconnect from the desktop.
- Effects: The request is withdrawn and the pairing ends. Pair again to continue.
- Default: Not invoked
- Example: Example for "Cancel request and disconnect": the request is withdrawn and the pairing ends. Pair again to continue.

### extension-options-authenticator-open

**Open authenticator on desktop** — `#authenticator-open`

- Kind: button
- Purpose: Ask the desktop to bring its authenticator window to the front.
- Effects: Only the desktop shows codes. No code or account detail travels to the browser.
- Default: Not invoked
- Example: Example for "Open authenticator on desktop": only the desktop shows codes. No code or account detail travels to the browser.

### extension-options-language-choice

**Language choice** — `#language-group`

- Kind: navigation
- Purpose: Choose English, Cantonese or both together for the workspace wording.
- Effects: The workspace text switches at once and the choice is remembered in this browser.
- Default: The first destination
- Example: Example for "Language choice": the workspace text switches at once and the choice is remembered in this browser.

### extension-options-theme-choice

**Theme choice** — `#theme-group`

- Kind: navigation
- Purpose: Choose whether the workspace follows the device, or always uses the light or dark theme.
- Effects: Colours change at once and the choice is remembered in this browser.
- Default: The first destination
- Example: Example for "Theme choice": colours change at once and the choice is remembered in this browser.

### extension-options-funnyenglish

**English playfulness** — `#funnyEnglish`

- Kind: number
- Purpose: Set how playful English messages sound, from 1 (plain) to 5 (most playful).
- Effects: Only the tone of English messages changes. Facts and button labels do not.
- Default: The control’s starting value
- Example: Example for "English playfulness": only the tone of English messages changes. Facts and button labels do not.

### extension-options-reset-english

**Reset English playfulness** — `#reset-English`

- Kind: button
- Purpose: Put the English playfulness back to its starting level of 5.
- Effects: Only the English tone changes. The Cantonese tone keeps its own level.
- Default: Not invoked
- Example: Example for "Reset English playfulness": only the English tone changes. The Cantonese tone keeps its own level.

### extension-options-funnycantonese

**Cantonese playfulness** — `#funnyCantonese`

- Kind: number
- Purpose: Set how playful Cantonese messages sound, from 1 (plain) to 5 (most playful).
- Effects: Only the tone of Cantonese messages changes. Facts and button labels do not.
- Default: The control’s starting value
- Example: Example for "Cantonese playfulness": only the tone of Cantonese messages changes. Facts and button labels do not.

### extension-options-reset-cantonese

**Reset Cantonese playfulness** — `#reset-Cantonese`

- Kind: button
- Purpose: Put the Cantonese playfulness back to its starting level of 5.
- Effects: Only the Cantonese tone changes. The English tone keeps its own level.
- Default: Not invoked
- Example: Example for "Reset Cantonese playfulness": only the Cantonese tone changes. The English tone keeps its own level.

### extension-options-emoji

**Show emojis in dialogs and message boxes** — `#emoji`

- Kind: toggle
- Purpose: Show a small friendly face in dialogs and message boxes.
- Effects: Only decoration changes. The facts in each message stay the same.
- Default: Off
- Example: Example for "Show emojis in dialogs and message boxes": only decoration changes. The facts in each message stay the same.

### extension-options-preview-open

**Preview message** — `#preview-open`

- Kind: button
- Purpose: Show a sample message in your current tone and emoji settings.
- Effects: A dialog shows the sample. No setting changes and nothing is saved.
- Default: Not invoked
- Example: Example for "Preview message": a dialog shows the sample. No setting changes and nothing is saved.

### extension-options-reset

**Reset browser settings** — `#reset`

- Kind: button
- Purpose: Return this extension’s settings in the browser to their starting values.
- Effects: A confirmation dialog appears first. Settings on the desktop are not touched.
- Default: Not invoked
- Example: Example for "Reset browser settings": a confirmation dialog appears first. Settings on the desktop are not touched.

### extension-options-display-name

**Product name** — `#display-name`

- Kind: text
- Purpose: Type the product name the workspace shows in place of Material File Encryptor.
- Effects: Only the displayed name changes. Leave it empty to use the original name.
- Default: Material File Encryptor
- Example: Example for "Product name": only the displayed name changes. Leave it empty to use the original name.

### extension-options-accent-presets

**Accent presets** — `#accent-swatches`

- Kind: navigation
- Purpose: Pick one of the ready-made accent colours.
- Effects: The chosen colour fills the accent field, ready for you to apply.
- Default: The first destination
- Example: Example for "Accent presets": the chosen colour fills the accent field, ready for you to apply.

### extension-options-accent-hex

**Accent colour** — `#accent-hex`

- Kind: text
- Purpose: Type a six-digit colour such as #3a7d44 to use as the accent.
- Effects: The colour is checked for contrast before it is applied. An invalid value is rejected.
- Default: The built-in green
- Example: Example for "Accent colour": the colour is checked for contrast before it is applied. An invalid value is rejected.

### extension-options-accent-alpha

**Accent opacity** — `#accent-alpha`

- Kind: number
- Purpose: Set how opaque the accent colour is, from 20 to 100 percent.
- Effects: A lower value gives a softer accent. Very low values are limited to keep text readable.
- Default: The control’s starting value
- Example: Example for "Accent opacity": a lower value gives a softer accent. Very low values are limited to keep text readable.

### extension-options-accent-apply

**Apply accent** — `#accent-apply`

- Kind: button
- Purpose: Use the accent colour and opacity you chose across the workspace.
- Effects: Buttons and highlights change colour. Colours that fail the contrast check are not applied.
- Default: Not invoked
- Example: Example for "Apply accent": buttons and highlights change colour. Colours that fail the contrast check are not applied.

### extension-options-accent-reset

**Use default accent** — `#accent-reset`

- Kind: button
- Purpose: Go back to the built-in accent colour.
- Effects: Your chosen colour is forgotten and the original green returns.
- Default: Not invoked
- Example: Example for "Use default accent": your chosen colour is forgotten and the original green returns.

### extension-options-logo-choose

**Choose logo** — `#logo-choose`

- Kind: file
- Purpose: Pick a PNG, JPEG or WebP image to show as the workspace logo.
- Effects: The image is checked and kept in this browser only. A file that is too large or the wrong type is rejected.
- Default: Nothing chosen
- Example: Example for "Choose logo": the image is checked and kept in this browser only. A file that is too large or the wrong type is rejected.

### extension-options-logo-reset

**Remove logo** — `#logo-reset`

- Kind: button
- Purpose: Delete the stored logo and go back to the built-in mark.
- Effects: The stored image is removed from this browser. The original file is not touched.
- Default: Not invoked
- Example: Example for "Remove logo": the stored image is removed from this browser. The original file is not touched.

### extension-options-attention-focus

**Focus: hide explanatory text** — `#attention-focus`

- Kind: toggle
- Purpose: Hide the explanatory paragraphs so only the controls remain.
- Effects: Help text is hidden everywhere in the workspace. Turn it off to bring the text back.
- Default: Off
- Example: Example for "Focus: hide explanatory text": help text is hidden everywhere in the workspace. Turn it off to bring the text back.

### extension-options-attention-reduced

**Reduced stimulus: no motion or emoji decoration** — `#attention-reduced`

- Kind: toggle
- Purpose: Remove motion and emoji decoration for a calmer page.
- Effects: Animations stop and emoji decoration is hidden. Facts and labels are unchanged.
- Default: Off
- Example: Example for "Reduced stimulus: no motion or emoji decoration": animations stop and emoji decoration is hidden. Facts and labels are unchanged.

### extension-options-attention-guided

**Guided attention: highlight the open panel** — `#attention-guided`

- Kind: toggle
- Purpose: Draw a clear outline around the section you are working in.
- Effects: Only the open section is highlighted. Nothing else on the page changes.
- Default: Off
- Example: Example for "Guided attention: highlight the open panel": only the open section is highlighted. Nothing else on the page changes.

### extension-options-attention-reset

**Turn off attention modes** — `#attention-reset`

- Kind: button
- Purpose: Switch off Focus, Reduced stimulus and Guided attention together.
- Effects: All three attention switches return to off in one step.
- Default: Not invoked
- Example: Example for "Turn off attention modes": all three attention switches return to off in one step.

### extension-options-narration-voice

**Voice** — `#narration-voice`

- Kind: choice
- Purpose: Choose which installed speech voice reads the page aloud.
- Effects: The next reading uses this voice. Only voices installed on your device appear.
- Default: The first entry in the list
- Example: Example for "Voice": the next reading uses this voice. Only voices installed on your device appear.

### extension-options-narration-rate

**Speaking rate** — `#narration-rate`

- Kind: number
- Purpose: Set how fast the voice reads, from half speed to double speed.
- Effects: The next reading uses this speed. A reading already in progress is not changed.
- Default: The control’s starting value
- Example: Example for "Speaking rate": the next reading uses this speed. A reading already in progress is not changed.

### extension-options-narration-read

**Read this tab (Alt+R)** — `#narration-read`

- Kind: button
- Purpose: Read the open section aloud with the chosen voice and speed.
- Effects: Speech starts at once from your device. Nothing is recorded or sent.
- Default: Not invoked
- Example: Example for "Read this tab (Alt+R)": speech starts at once from your device. Nothing is recorded or sent.

### extension-options-narration-stop

**Stop reading** — `#narration-stop`

- Kind: button
- Purpose: Stop the narration that is playing.
- Effects: Speech stops at once. Starting again begins from the top of the section.
- Default: Not invoked
- Example: Example for "Stop reading": speech stops at once. Starting again begins from the top of the section.

### extension-options-schedule-field

**Setting** — `#schedule-field`

- Kind: choice
- Purpose: Choose which setting a scheduled change will modify: theme or language.
- Effects: The Value list below offers choices for the setting you pick.
- Default: The first entry in the list
- Example: Example for "Setting": the Value list below offers choices for the setting you pick.

### extension-options-schedule-value

**Value** — `#schedule-value`

- Kind: choice
- Purpose: Choose the value the scheduled change will apply.
- Effects: The value is applied only at the time you set. Nothing changes now.
- Default: The first entry in the list
- Example: Example for "Value": the value is applied only at the time you set. Nothing changes now.

### extension-options-schedule-at

**When** — `#schedule-at`

- Kind: text
- Purpose: Choose the date and time at which the scheduled change should happen.
- Effects: The time must be in the future. A past time is rejected.
- Default: Empty
- Example: Example for "When": the time must be in the future. A past time is rejected.

### extension-options-schedule-add

**Schedule change** — `#schedule-add`

- Kind: button
- Purpose: Save the setting, value and time as a scheduled change.
- Effects: The change joins the list below and applies at its time while the workspace is open.
- Default: Not invoked
- Example: Example for "Schedule change": the change joins the list below and applies at its time while the workspace is open.

### extension-options-wording-import

**Import wording file** — `#wording-import`

- Kind: file
- Purpose: Load a JSON file that swaps interface words for your own wording.
- Effects: The file stays in this browser and changes interface text only. A file that is too large or malformed is rejected.
- Default: Nothing chosen
- Example: Example for "Import wording file": the file stays in this browser and changes interface text only. A file that is too large or malformed is rejected.

### extension-options-wording-clear

**Clear wording** — `#wording-clear`

- Kind: button
- Purpose: Remove the imported wording and restore the original interface text.
- Effects: The original wording returns at once. Your file is untouched.
- Default: Not invoked
- Example: Example for "Clear wording": the original wording returns at once. Your file is untouched.

### extension-options-history-clear

**Clear history** — `#history-clear`

- Kind: button
- Purpose: Delete the local record of settings changes kept in this browser.
- Effects: The record is removed. Current settings stay as they are.
- Default: Not invoked
- Example: Example for "Clear history": the record is removed. Current settings stay as they are.

### extension-options-filters-toggle

**Filters** — `#filters-toggle`

- Kind: button
- Purpose: Show or hide the filter and export controls for the changelog.
- Effects: The controls appear or hide. The list itself does not change.
- Default: Not invoked
- Example: Example for "Filters": the controls appear or hide. The list itself does not change.

### extension-options-changelog-filter

**Filter changes** — `#changelog-filter`

- Kind: search
- Purpose: Type words to narrow the changelog to entries that mention them.
- Effects: Entries that do not match are hidden. The count line shows how many remain.
- Default: Empty
- Example: Example for "Filter changes": entries that do not match are hidden. The count line shows how many remain.

### extension-options-export-format

**Export format** — `#export-format`

- Kind: choice
- Purpose: Choose JSON, CSV or Markdown for the changelog export.
- Effects: The preview uses the chosen format. Nothing is saved until you confirm the export.
- Default: The first entry in the list
- Example: Example for "Export format": the preview uses the chosen format. Nothing is saved until you confirm the export.

### extension-options-export-preview

**Preview export** — `#export-preview`

- Kind: button
- Purpose: Show what the changelog export would contain, in the chosen format.
- Effects: A dialog shows the text. You then choose whether to save it.
- Default: Not invoked
- Example: Example for "Preview export": a dialog shows the text. You then choose whether to save it.

### extension-options-note-new

**New note** — `#note-new`

- Kind: button
- Purpose: Start a new note in a three-step sheet.
- Effects: A sheet opens for the title and text. Nothing is saved until you finish the last step.
- Default: Not invoked
- Example: Example for "New note": a sheet opens for the title and text. Nothing is saved until you finish the last step.

### extension-options-notes-export

**Export selected** — `#notes-export`

- Kind: button
- Purpose: Export the notes you ticked as one file.
- Effects: A file with only the ticked notes is offered for saving. The notes stay in this browser.
- Default: Not invoked
- Example: Example for "Export selected": a file with only the ticked notes is offered for saving. The notes stay in this browser.

### extension-options-notes-delete

**Delete selected** — `#notes-delete`

- Kind: button
- Purpose: Delete the notes you ticked from this browser.
- Effects: A confirmation is required first. Deleted notes cannot be recovered.
- Default: Not invoked
- Example: Example for "Delete selected": a confirmation is required first. Deleted notes cannot be recovered.

### extension-options-note-reader-export

**Export full note** — `#note-reader-export`

- Kind: button
- Purpose: Export the note you are reading as a file.
- Effects: A file with this note is offered for saving. The note stays in this browser.
- Default: Not invoked
- Example: Example for "Export full note": a file with this note is offered for saving. The note stays in this browser.

### extension-options-note-reader-close

**Close note** — `#note-reader-close`

- Kind: button
- Purpose: Close the note reader and return to the list of notes.
- Effects: Only the reader closes. The note is kept.
- Default: Not invoked
- Example: Example for "Close note": only the reader closes. The note is kept.

### extension-options-note-title

**Title** — `#note-title`

- Kind: text
- Purpose: Type a short title for the new note.
- Effects: The title is required before you can go on to the next step.
- Default: Empty
- Example: Example for "Title": the title is required before you can go on to the next step.

### extension-options-note-body

**Note** — `#note-body`

- Kind: text
- Purpose: Write the text of the note.
- Effects: The text is kept as a draft until you save, so Cancel or Escape does not lose it.
- Default: Empty
- Example: Example for "Note": the text is kept as a draft until you save, so Cancel or Escape does not lose it.

### extension-options-note-cancel

**Cancel note** — `#note-cancel`

- Kind: button
- Purpose: Close the note sheet without saving.
- Effects: The sheet closes and the draft is kept so you can return to it.
- Default: Not invoked
- Example: Example for "Cancel note": the sheet closes and the draft is kept so you can return to it.

### extension-options-note-back

**Back** — `#note-back`

- Kind: button
- Purpose: Return to the previous step of the note sheet.
- Effects: Your typed text stays. Nothing is saved.
- Default: Not invoked
- Example: Example for "Back": your typed text stays. Nothing is saved.

### extension-options-note-next

**Next** — `#note-next`

- Kind: button
- Purpose: Go to the next step, or save the note on the last step.
- Effects: The current step is checked first. On the last step the note is saved in this browser.
- Default: Not invoked
- Example: Example for "Next": the current step is checked first. On the last step the note is saved in this browser.

### extension-options-docs-search

**Search documentation** — `#docs-search`

- Kind: search
- Purpose: Type words to narrow the bundled documentation to articles that mention them.
- Effects: The article list narrows as you type. Everything is searched on this device.
- Default: Empty
- Example: Example for "Search documentation": the article list narrows as you type. Everything is searched on this device.

### extension-options-ticket-title

**Ticket title** — `#ticket-title`

- Kind: text
- Purpose: Type a short title for the support ticket.
- Effects: The title is required before the ticket can be saved.
- Default: Empty
- Example: Example for "Ticket title": the title is required before the ticket can be saved.

### extension-options-ticket-category

**Ticket category** — `#ticket-category`

- Kind: choice
- Purpose: Choose whether the ticket is a problem, a question or a suggestion.
- Effects: The category is saved with the ticket and appears in the exported file.
- Default: The first entry in the list
- Example: Example for "Ticket category": the category is saved with the ticket and appears in the exported file.

### extension-options-ticket-description

**What happened** — `#ticket-description`

- Kind: text
- Purpose: Describe what happened, in your own words, up to 4,000 characters.
- Effects: The text is kept in this browser with the ticket. Nothing is sent automatically.
- Default: Empty
- Example: Example for "What happened": the text is kept in this browser with the ticket. Nothing is sent automatically.

### extension-options-ticket-status

**Ticket status** — `#ticket-status-field`

- Kind: choice
- Purpose: Choose whether the ticket is open, waiting or closed.
- Effects: The status is saved with the ticket so you can find it later.
- Default: The first entry in the list
- Example: Example for "Ticket status": the status is saved with the ticket so you can find it later.

### extension-options-ticket-attach

**Attach file** — `#ticket-attach`

- Kind: file
- Purpose: Attach a small image, text or JSON file to the ticket.
- Effects: The file is checked for type and size and kept in this browser. It is not uploaded.
- Default: Nothing chosen
- Example: Example for "Attach file": the file is checked for type and size and kept in this browser. It is not uploaded.

### extension-options-ticket-diagnostics

**Include diagnostics** — `#ticket-diagnostics`

- Kind: toggle
- Purpose: Add the diagnostics text shown below to the exported ticket file.
- Effects: The diagnostics are added only to the file you export. You can read them first.
- Default: Off
- Example: Example for "Include diagnostics": the diagnostics are added only to the file you export. You can read them first.

### extension-options-ticket-save

**Save ticket** — `#ticket-save`

- Kind: button
- Purpose: Save the ticket in this browser.
- Effects: The ticket joins the list below. Nothing is sent to anyone.
- Default: Not invoked
- Example: Example for "Save ticket": the ticket joins the list below. Nothing is sent to anyone.

### extension-options-ticket-clear

**New ticket** — `#ticket-clear`

- Kind: button
- Purpose: Clear the form to start a fresh ticket.
- Effects: The form empties. Saved tickets are not touched.
- Default: Not invoked
- Example: Example for "New ticket": the form empties. Saved tickets are not touched.

### extension-options-recording-start

**Start recording** — `#recording-start`

- Kind: button
- Purpose: Record a tab or window to show a problem. The browser asks which one to share.
- Effects: Nothing is recorded until you choose in the browser prompt. The recording stays on this computer.
- Default: Not invoked
- Example: Example for "Start recording": nothing is recorded until you choose in the browser prompt. The recording stays on this computer.

### extension-options-recording-stop

**Stop recording** — `#recording-stop`

- Kind: button
- Purpose: End the recording that is running.
- Effects: Recording stops and a preview appears so you can review it.
- Default: Not invoked
- Example: Example for "Stop recording": recording stops and a preview appears so you can review it.

### extension-options-recording-reviewed

**Recording reviewed** — `#recording-reviewed`

- Kind: toggle
- Purpose: Confirm that you watched the recording and it shows nothing private.
- Effects: Save recording stays unavailable until you confirm this.
- Default: Off
- Example: Example for "Recording reviewed": save recording stays unavailable until you confirm this.

### extension-options-recording-save

**Save recording** — `#recording-save`

- Kind: button
- Purpose: Save the reviewed recording as a file on this computer.
- Effects: The browser offers a file download. Nothing is uploaded.
- Default: Not invoked
- Example: Example for "Save recording": the browser offers a file download. Nothing is uploaded.

### extension-options-recording-discard

**Discard recording** — `#recording-discard`

- Kind: button
- Purpose: Throw away the recording without saving it.
- Effects: The recording is removed from memory and cannot be recovered.
- Default: Not invoked
- Example: Example for "Discard recording": the recording is removed from memory and cannot be recovered.

### extension-options-dimsum-load

**Load catalogue from GitHub** — `#dimsum-load`

- Kind: button
- Purpose: Fetch the public dim sum catalogue so you can browse it.
- Effects: The page contacts GitHub only now. No cookies or personal settings are sent. The catalogue is kept for a day.
- Default: Not invoked
- Example: Example for "Load catalogue from GitHub": the page contacts GitHub only now. No cookies or personal settings are sent. The catalogue is kept for a day.

### extension-options-dimsum-refresh

**Refresh catalogue** — `#dimsum-refresh`

- Kind: button
- Purpose: Download the catalogue again, replacing the copy kept for a day.
- Effects: The page contacts GitHub again. The list updates if the catalogue changed.
- Default: Not invoked
- Example: Example for "Refresh catalogue": the page contacts GitHub again. The list updates if the catalogue changed.

### extension-options-dimsum-search

**Search dishes** — `#dimsum-search`

- Kind: search
- Purpose: Type words to narrow the catalogue to dishes that match.
- Effects: The dish list narrows as you type. Everything is filtered on this device.
- Default: Empty
- Example: Example for "Search dishes": the dish list narrows as you type. Everything is filtered on this device.

### extension-options-dimsum-category

**Dish category** — `#dimsum-category`

- Kind: choice
- Purpose: Choose one category of dishes to show.
- Effects: Only dishes in the category are listed. Choose all categories to see everything.
- Default: The first entry in the list
- Example: Example for "Dish category": only dishes in the category are listed. Choose all categories to see everything.

### extension-options-dimsum-mine

**Show my list** — `#dimsum-mine`

- Kind: button
- Purpose: Switch between the whole catalogue and the dishes you marked as yours.
- Effects: The list changes. Your marks are kept only in this browser.
- Default: Not invoked
- Example: Example for "Show my list": the list changes. Your marks are kept only in this browser.

### extension-options-dimsum-more

**Show more dishes** — `#dimsum-more`

- Kind: button
- Purpose: Add the next group of dishes to the list.
- Effects: More dishes appear below the ones already shown.
- Default: Not invoked
- Example: Example for "Show more dishes": more dishes appear below the ones already shown.

### extension-options-models-port

**Port** — `#models-port`

- Kind: number
- Purpose: Type the port your local model server listens on. The usual port is 11434.
- Effects: Only 127.0.0.1 on this port is contacted, and only after you grant permission.
- Default: 11434
- Example: Example for "Port": only 127.0.0.1 on this port is contacted, and only after you grant permission.

### extension-options-models-connect

**Connect** — `#models-connect`

- Kind: button
- Purpose: Ask the browser for permission to talk to the model server on this computer, then connect.
- Effects: The browser asks first. If you refuse, nothing connects and nothing is stored.
- Default: Not invoked
- Example: Example for "Connect": the browser asks first. If you refuse, nothing connects and nothing is stored.

### extension-options-models-refresh

**Refresh models** — `#models-refresh`

- Kind: button
- Purpose: Read the list of installed models again.
- Effects: The installed list updates. No model is changed.
- Default: Not invoked
- Example: Example for "Refresh models": the installed list updates. No model is changed.

### extension-options-models-pull-name

**Model tag** — `#models-pull-name`

- Kind: text
- Purpose: Type the tag of the model to download, such as llama3.2:3b.
- Effects: The tag is sent to your local model server only when you press Pull.
- Default: Empty
- Example: Example for "Model tag": the tag is sent to your local model server only when you press Pull.

### extension-options-models-pull

**Pull** — `#models-pull`

- Kind: button
- Purpose: Ask the local model server to download the model named above.
- Effects: A progress bar shows the download. It can use a lot of disk space.
- Default: Not invoked
- Example: Example for "Pull": a progress bar shows the download. It can use a lot of disk space.

### extension-options-models-pull-cancel

**Cancel download** — `#models-pull-cancel`

- Kind: button
- Purpose: Stop the model download that is running.
- Effects: The download ends and the partly downloaded model is not kept.
- Default: Not invoked
- Example: Example for "Cancel download": the download ends and the partly downloaded model is not kept.

### extension-options-chat-model

**Chat model** — `#chat-model`

- Kind: choice
- Purpose: Choose which installed model answers your messages.
- Effects: The next message goes to this model. Earlier answers are unchanged.
- Default: The first entry in the list
- Example: Example for "Chat model": the next message goes to this model. Earlier answers are unchanged.

### extension-options-chat-prompt

**Message** — `#chat-prompt`

- Kind: text
- Purpose: Type the message to send to the local model.
- Effects: The text goes only to your local model server. The conversation is never saved.
- Default: Empty
- Example: Example for "Message": the text goes only to your local model server. The conversation is never saved.

### extension-options-chat-send

**Send** — `#chat-send`

- Kind: button
- Purpose: Send the message to the chosen model.
- Effects: The answer appears in the conversation as it is written.
- Default: Not invoked
- Example: Example for "Send": the answer appears in the conversation as it is written.

### extension-options-chat-stop

**Stop answer** — `#chat-stop`

- Kind: button
- Purpose: Stop the answer that is being written.
- Effects: The answer stops where it is and stays on screen.
- Default: Not invoked
- Example: Example for "Stop answer": the answer stops where it is and stays on screen.

### extension-options-chat-clear

**Clear conversation** — `#chat-clear`

- Kind: button
- Purpose: Remove the conversation from this page.
- Effects: The log empties. The model server keeps nothing from it.
- Default: Not invoked
- Example: Example for "Clear conversation": the log empties. The model server keeps nothing from it.

### extension-options-docs-link

**Documentation website** — `#docs-link`

- Kind: link
- Purpose: Open the documentation website in a new browser tab.
- Effects: The fixed project address opens. Nothing from the workspace is sent.
- Default: Not opened
- Example: Example for "Documentation website": the fixed project address opens. Nothing from the workspace is sent.

### extension-options-desktop-refresh

**Refresh desktop status** — `#desktop-refresh`

- Kind: button
- Purpose: Ask the paired desktop for its lock state, version and update progress.
- Effects: Nothing is sent until you press it. No file names or paths are shown.
- Default: Not invoked
- Example: Example for "Refresh desktop status": nothing is sent until you press it. No file names or paths are shown.

### extension-options-school-read

**Read school mode** — `#school-read`

- Kind: button
- Purpose: Ask the desktop whether school mode is on.
- Effects: The current state is shown. Reading never changes it.
- Default: Not invoked
- Example: Example for "Read school mode": the current state is shown. Reading never changes it.

### extension-options-school-toggle

**Turn on school mode** — `#school-toggle`

- Kind: button
- Purpose: Ask the desktop to turn school mode on or off.
- Effects: The desktop decides and may ask for its own confirmation. Nothing changes from here alone.
- Default: Not invoked
- Example: Example for "Turn on school mode": the desktop decides and may ask for its own confirmation. Nothing changes from here alone.

### extension-options-release-check

**Check releases** — `#release-check`

- Kind: button
- Purpose: Look up the latest published release and its code name.
- Effects: The page contacts GitHub only now. No cookies or personal settings are sent.
- Default: Not invoked
- Example: Example for "Check releases": the page contacts GitHub only now. No cookies or personal settings are sent.

### extension-options-coverage-search

**Search coverage** — `#coverage-search`

- Kind: search
- Purpose: Type words to narrow the feature coverage records.
- Effects: The list narrows as you type. The records are inventory, not proof of delivery.
- Default: Empty
- Example: Example for "Search coverage": the list narrows as you type. The records are inventory, not proof of delivery.

### extension-options-coverage-status

**Coverage status** — `#coverage-status`

- Kind: choice
- Purpose: Choose which recorded status of features to show.
- Effects: Only records with that status are listed.
- Default: The first entry in the list
- Example: Example for "Coverage status": only records with that status are listed.

### extension-options-preview-close

**Close preview** — `#preview-close`

- Kind: button
- Purpose: Close the sample message dialog.
- Effects: The dialog closes. No setting changes.
- Default: Not invoked
- Example: Example for "Close preview": the dialog closes. No setting changes.

### extension-options-palette-filter

**Find a command** — `#palette-filter`

- Kind: search
- Purpose: Type words to find a workspace command.
- Effects: The command list narrows as you type. Nothing runs until you choose one.
- Default: Empty
- Example: Example for "Find a command": the command list narrows as you type. Nothing runs until you choose one.

### extension-options-palette-close

**Close commands** — `#palette-close`

- Kind: button
- Purpose: Close the command palette.
- Effects: The dialog closes and no command runs.
- Default: Not invoked
- Example: Example for "Close commands": the dialog closes and no command runs.

### extension-options-export-cancel

**Cancel export** — `#export-cancel`

- Kind: button
- Purpose: Close the export preview without saving.
- Effects: Nothing is saved.
- Default: Not invoked
- Example: Example for "Cancel export": nothing is saved.

### extension-options-export-save

**Save export** — `#export-save`

- Kind: button
- Purpose: Save the previewed export as a file.
- Effects: The browser offers a file download. Nothing is uploaded.
- Default: Not invoked
- Example: Example for "Save export": the browser offers a file download. Nothing is uploaded.

### extension-options-confirm-first

**First confirmation** — `#confirm-first`

- Kind: toggle
- Purpose: Switch on the first of two deliberate confirmations before a reset.
- Effects: Both switches and the slider are needed before the reset can run.
- Default: Off
- Example: Example for "First confirmation": both switches and the slider are needed before the reset can run.

### extension-options-confirm-second

**Second confirmation** — `#confirm-second`

- Kind: toggle
- Purpose: Switch on the second of two deliberate confirmations before a reset.
- Effects: The slider unlocks only after both switches are on.
- Default: Off
- Example: Example for "Second confirmation": the slider unlocks only after both switches are on.

### extension-options-confirm-slider

**Confirmation progress** — `#confirm-slider`

- Kind: number
- Purpose: Drag the slider to the end to complete the confirmation.
- Effects: Reaching the end enables the final button. Letting go early resets it.
- Default: The control’s starting value
- Example: Example for "Confirmation progress": reaching the end enables the final button. Letting go early resets it.

### extension-options-confirm-cancel

**Cancel reset** — `#confirm-cancel`

- Kind: button
- Purpose: Close the confirmation and keep your settings.
- Effects: Nothing is reset.
- Default: Not invoked
- Example: Example for "Cancel reset": nothing is reset.

### extension-options-confirm-execute

**Reset** — `#confirm-execute`

- Kind: button
- Purpose: Carry out the reset after both confirmations are complete.
- Effects: The browser settings return to their starting values. Desktop settings are not touched.
- Default: Not invoked
- Example: Example for "Reset": the browser settings return to their starting values. Desktop settings are not touched.

### Exemptions on the browser extension workspace

- `#logo-file`: A hidden file input. The visible Choose logo button opens it and carries the explanation.
- `#wording-file`: A hidden file input. The visible Import wording file button opens it and carries the explanation.
- `#ticket-file`: A hidden file input. The visible Attach file button opens it and carries the explanation.
