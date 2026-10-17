import path from 'node:path';

/** Runtime branding is copied outside ASAR so Windows can load the ICO directly. */
export function desktopIconPath({packaged,resourcesPath,applicationRoot,platform=process.platform}) {
  const directory=packaged?path.join(resourcesPath,'branding'):path.join(applicationRoot,'assets','branding');
  return path.join(directory,platform==='win32'?'app.ico':'app.png');
}

/** Return the real native window, without subclassing Electron's built-in classes. */
export function brandedBrowserWindow(BrowserWindow,icon) {
  return function DesktopBrowserWindow(options={}) {
    return new BrowserWindow({...options,icon});
  };
}
