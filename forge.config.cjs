const path = require('node:path');
module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'MaterialFileEncryptor',
    appBundleId: 'uk.dewhui.material-file-encryptor',
    extraResource: [path.resolve('out/native'), path.resolve('out/tools'), path.resolve('.cache/driver'), path.resolve('dependencies.json')],
    ignore: [/^\/docs/, /^\/test/, /^\/scripts/, /^\/native/, /^\/out/, /^\/\.git/, /^\/\.cache/, /^\/\.github/, /^\/CLOSEOUT_PROMPT\.md/],
  },
  makers: [{ name: '@electron-forge/maker-squirrel', platforms: ['win32'], config: {
    name: 'MaterialFileEncryptor', authors: 'Ding Ding Projects',
    description: 'Encrypted storage mounted as a Windows drive',
    setupExe: 'MaterialFileEncryptor-Setup.exe',
  } }],
};
