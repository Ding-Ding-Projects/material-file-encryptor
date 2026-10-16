# Setup guide

The setup guide is a short wizard for the desktop app. It runs on the first launch, and you can reopen it at any time from the Help view (Open the setup guide) or from the command palette (Open the setup guide). Each step performs a real setup action through the same code the rest of the app uses, then shows what actually happened.

## Steps

1. Welcome. Explains the guide. This step and the last one are required; every other step can be skipped.
2. Look and language. Choose English, Cantonese or both, and the device setting, light or dark appearance. Each choice is applied through the same preference path as Settings and the result is shown.
3. Requirements. Reads the real WinFsp driver state and whether local server supervision is available, and reports them separately. The check only reads. Install WinFsp appears only when the driver is missing and the installer is available; Windows keeps its own approval prompt.
4. Your drive. Type a drive name and, if you like, the encrypted storage and cache folders (Browse opens the system folder picker). Create a drive and Unlock existing drive open the existing drive dialog with those values filled in. The dialog still asks for the password or key file and keeps its own validation; the guide never sees the secret. When the dialog closes the guide reads the drive state and reports whether a drive is ready.
5. Browser. Shows the one-time browser pairing code using the existing pairing view. You still approve the pairing on the desktop. Leaving the step clears the code.
6. Finish. Summarises each step as done or skipped, with its result, and leads into the workspace Home.

## Progress, resume and skipping

A progress bar and a step list show where you are. Back and Next move one step; Skip this step records the step as skipped; Save and close and Skip setup return to Home without losing the saved step. Start over clears only the saved guide progress and changes no preference, drive or pairing.

Progress is saved on the device under a single key. Only the step, which steps are done or skipped, the language, the appearance and the drive name are kept. Passwords, key files, folder paths and pairing codes are never saved. If the saved record is damaged or unreadable it is rejected whole and the guide starts again. If the device cannot store progress, the guide says so and keeps working for the current session.

## Destructive steps

Creating a drive while the app already points at another drive replaces which drive the app opens. The files of the current drive are not deleted, but the app stops opening them until you unlock that folder again. This uses the existing two-key confirmation with the full slider; declining changes nothing and saves nothing.

## Keyboard and accessibility

Every action is a real Material button or field and can be reached with Tab. Alt+Right moves to the next step and Alt+Left to the previous one. The step title takes focus whenever the step changes, and results are announced through a status region. All wording is available in English, Cantonese and both together. The panel slides in with Material motion tokens, and the animation and transition are removed when the device asks for reduced motion.

## Scope

The setup guide is a desktop app feature. The website and the browser extension do not have a setup wizard: the website is documentation and download, and the extension has its own pairing flow in its workspace. Both are recorded as not applicable for this feature rather than missing, and the separate public website requirement is unchanged.

## Verification boundary

Source checks drive the real model and view against fakes for the preference, driver, drive dialog, confirmation and pairing services, including resume after a restart, skipping, keyboard movement and localization. They are not built-app acceptance. A built interaction and visual capture of the first-run flow, and a run that installs the driver or creates a drive on a real device, are not yet recorded.
