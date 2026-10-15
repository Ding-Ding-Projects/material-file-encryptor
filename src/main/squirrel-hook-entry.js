import {app} from 'electron';
import {registerExplorerCommand} from './explorer-command.js';
import {handleNativeHostSquirrelEvent} from './browser-host-squirrel.js';
import {runSquirrelLifecycle} from './squirrel-lifecycle.js';

// This module is the first import of the main module, so the lifecycle work below runs before the main module's own
// top-level code. It is a separate file so the main module body keeps no Squirrel logic at all.
const outcome = process.platform === 'win32'
  ? runSquirrelLifecycle({
    argv: process.argv,
    packaged: app.isPackaged,
    execPath: process.execPath,
    resourcesPath: process.resourcesPath,
    userData: app.getPath('userData'),
    exit: code => app.exit(code),
    registerExplorer: executable => registerExplorerCommand(executable),
    removeExplorer: executable => registerExplorerCommand(executable, {remove: true}),
    disableLogin: () => app.setLoginItemSettings({openAtLogin: false, path: process.execPath, args: ['--startup']}),
    nativeHostEvent: details => handleNativeHostSquirrelEvent(details),
  })
  : {handled: false};

export const squirrelHandled = outcome.handled === true;
