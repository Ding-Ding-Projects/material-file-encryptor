import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';

const DRIVE_ID = /^[a-f0-9]{16}$/;
const inside = (parent, child) => { const rel = path.relative(parent, child); return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel); };

/** Restricts a folder to the signed-in account on Windows. Returns whether the restriction was applied. */
export function restrictToOwner(directory, { platform = process.platform, run = execFile, user = process.env.USERNAME, domain = process.env.USERDOMAIN, systemRoot = process.env.SystemRoot || 'C:\\Windows' } = {}) {
  if (platform !== 'win32') return fs.chmod(directory, 0o700).then(() => true, () => false);
  if (typeof user !== 'string' || !/^[^\\/:*?"<>|\x00-\x1f]{1,128}$/.test(user)) return Promise.resolve(false);
  const account = typeof domain === 'string' && /^[^\\/:*?"<>|\x00-\x1f]{1,128}$/.test(domain) ? `${domain}\\${user}` : user;
  return new Promise(resolve => {
    run(path.join(systemRoot, 'System32', 'icacls.exe'), [directory, '/inheritance:r', '/grant:r', `${account}:(OI)(CI)F`, '/grant:r', '*S-1-5-18:(OI)(CI)F'],
      { windowsHide: true, timeout: 15000 }, error => resolve(!error));
  });
}

/**
 * Automatic per-drive folders below the application's own data area. Nothing here is chosen by the
 * renderer: every drive gets <root>/<drive id>/storage and <root>/<drive id>/cache, created fresh,
 * never reused, never behind a link and readable only by the account where the platform allows it.
 */
export function createDriveLocations({ root, validate = async () => {}, restrict = restrictToOwner, newId = () => randomUUID().replaceAll('-', '').slice(0, 16) } = {}) {
  if (typeof root !== 'function' && (typeof root !== 'string' || !path.isAbsolute(root))) throw Error('The drive folders need an absolute application data folder.');
  const base = () => path.resolve(typeof root === 'function' ? root() : root);
  async function plainDirectory(directory) {
    const stat = await fs.lstat(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('Linked or missing drive folders are not supported.');
    if (path.resolve(await fs.realpath(directory)).toLowerCase() !== path.resolve(directory).toLowerCase()) throw Error('Linked drive folders are not supported.');
  }
  return {
    get root() { return base(); },
    /** Creates the folders for one new drive. Throws before returning if any rule is broken. */
    async allocate({ withStorage = true } = {}) {
      const parent = base();
      await fs.mkdir(parent, { recursive: true, mode: 0o700 });
      await plainDirectory(parent);
      for (let attempt = 0; attempt < 5; attempt++) {
        const driveId = newId();
        if (!DRIVE_ID.test(driveId)) throw Error('Invalid drive folder id.');
        const directory = path.join(parent, driveId);
        try { await fs.mkdir(directory, { mode: 0o700 }); }
        catch (error) { if (error.code === 'EEXIST') continue; throw error; }
        const storageDir = path.join(directory, 'storage'), cacheDir = path.join(directory, 'cache');
        try {
          if (withStorage) await fs.mkdir(storageDir, { mode: 0o700 }); await fs.mkdir(cacheDir, { mode: 0o700 });
          const ownerOnly = await restrict(directory);
          for (const folder of withStorage ? [directory, storageDir, cacheDir] : [directory, cacheDir]) { await plainDirectory(folder); if (!inside(parent, folder)) throw Error('Drive folders must stay inside the application data area.'); }
          if (withStorage) await validate(storageDir); await validate(cacheDir);
          return { driveId, directory, storageDir, cacheDir, ownerOnly };
        } catch (error) { await fs.rm(directory, { recursive: true, force: true }).catch(() => {}); throw error; }
      }
      throw Error('A free drive folder could not be created.');
    },
    /** Removes the folders of a drive that was never filled. A folder that holds anything is kept. */
    async discardEmpty(driveId) {
      if (!DRIVE_ID.test(String(driveId))) throw Error('Invalid drive folder id.');
      const directory = path.join(base(), driveId);
      const storage = path.join(directory, 'storage'), cache = path.join(directory, 'cache');
      for (const folder of [storage, cache]) { try { if ((await fs.readdir(folder)).length) return false; } catch (error) { if (error.code !== 'ENOENT') throw error; } }
      for (const folder of [storage, cache, directory]) await fs.rmdir(folder).catch(error => { if (error.code !== 'ENOENT') throw error; });
      return true;
    },
    /** True when a path lies inside this drive folder area. */
    owns(candidate) { return typeof candidate === 'string' && path.isAbsolute(candidate) && inside(base(), path.resolve(candidate)); },
  };
}
