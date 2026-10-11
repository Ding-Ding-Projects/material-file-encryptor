const path = require('node:path');
module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'MaterialFileEncryptor',
    appBundleId: 'uk.dewhui.material-file-encryptor',
    extraResource: [path.resolve('out/native'), path.resolve('out/converter'), path.resolve('out/tools'), path.resolve('.cache/driver'), path.resolve('dependencies.json')],
    ignore: [/(?:^|[\\/])\.agent(?:[\\/]|$)/i, /^\/docs/, /^\/test/, /^\/scripts/, /^\/native/, /^\/out/, /^\/\.git/, /^\/\.cache/, /^\/\.github/, /^\/CLOSEOUT_PROMPT\.md/],
  },
  hooks: { postPackage: async (_config, result) => {
    const { requirePrivateFreePackage } = await import('./scripts/package-privacy.mjs');
    if (!result.outputPaths?.length) throw new Error('PACKAGE_PRIVACY_INPUT_REQUIRED');
    for (const output of result.outputPaths) await requirePrivateFreePackage(output);
  } },
  makers: [{ name: '@electron-forge/maker-squirrel', platforms: ['win32'], config: {
    name: 'MaterialFileEncryptor', authors: 'Ding Ding Projects',
    description: 'Encrypted storage mounted as a Windows drive',
    setupExe: 'MaterialFileEncryptor-Setup.exe',
    ...(process.env.MFE_SQUIRREL_VENDOR_DIRECTORY ? { vendorDirectory: process.env.MFE_SQUIRREL_VENDOR_DIRECTORY } : {}),
  } }],
};
