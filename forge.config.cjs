const path = require('node:path');
module.exports = {
  packagerConfig: {
    asar: true,
    icon: path.resolve(__dirname, 'assets/branding/app.ico'),
    executableName: 'MaterialFileEncryptor',
    appBundleId: 'uk.dewhui.material-file-encryptor',
    extraResource: [path.resolve(__dirname, 'assets/branding'), path.resolve('out/native'), path.resolve('out/browser-host'), path.resolve('out/converter'), path.resolve('out/tools'), path.resolve('out/browser-extension'), path.resolve('.cache/driver'), path.resolve('dependencies.json')],
    // Keep PDF runtime code and notices; upstream debug maps stay in the source installation.
    ignore: [/^\/node_modules\/pdf-lib\/.*\.map$/,/(?:^|[\\/])MaterialFileEncryptor\.ServerLease\.Verifier(?:\.|[\\/]|$)/i,/^\/font-assets(?:\/|$)/,/(?:^|[\\/])(?:\.agent|\.claude|\.codex|\.test-output)(?:[\\/]|$)/i, /^\/src\/features\/converter\/native\/(?:bin|obj)(?:\/|$)/i, /^\/coverage(?:\/|$)/, /^\/docs/, /^\/test/, /^\/scripts/, /^\/native/, /^\/out/, /^\/\.git/, /^\/\.cache/, /^\/\.github/, /^\/CLOSEOUT_PROMPT\.md/],
  },
  hooks: { prePackage: async () => {
    const { checkIcons } = await import('./scripts/desktop-icons.mjs');
    checkIcons();
  }, postPackage: async (_config, result) => {
    const { requirePrivateFreePackage } = await import('./scripts/package-privacy.mjs');
    if (!result.outputPaths?.length) throw new Error('PACKAGE_PRIVACY_INPUT_REQUIRED');
    for (const output of result.outputPaths) await requirePrivateFreePackage(output);
  } },
  makers: [{ name: '@electron-forge/maker-squirrel', platforms: ['win32'], config: {
    vendorDirectory: process.env.MFE_SQUIRREL_VENDOR_DIRECTORY,
    name: 'MaterialFileEncryptor', authors: 'Ding Ding Projects',
    description: 'Encrypted storage mounted as a Windows drive',
    setupExe: 'MaterialFileEncryptor-Setup.exe',
    setupIcon: path.resolve(__dirname, 'assets/branding/app.ico'),
    iconUrl: 'https://raw.githubusercontent.com/Ding-Ding-Projects/material-file-encryptor/a15eac0a7dffc3e32763153b2ad2670999b8355e/assets/branding/app.ico',
    ...(process.env.MFE_SQUIRREL_VENDOR_DIRECTORY ? { vendorDirectory: process.env.MFE_SQUIRREL_VENDOR_DIRECTORY } : {}),
  } }],
};
