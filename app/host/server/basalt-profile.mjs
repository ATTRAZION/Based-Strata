/** The managed Basalt profile: no installer carries one, so the first start writes it next to the install. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { findFreePort } from './ports.mjs';

const CONFIG = 'basalt_config.json';

/** An old profile (an absolute path left by an earlier build) is replaced; one that still points at a config stays. */
function profileWorks(file, roots) {
  try {
    const profile = JSON.parse(readFileSync(file, 'utf8'));
    const config = isAbsolute(profile.config) ? profile.config : join(roots[0], String(profile.config));
    return roots.some(root => { const inside = relative(root, config); return !inside.startsWith('..') && !isAbsolute(inside); }) &&
      existsSync(config);
  } catch { return false; }
}

/**
 * The file its runtime reads. An install that shipped a profile (or one a person wrote) keeps it untouched;
 * otherwise the profile is created on first start: the config next to the engine, a port free on this machine,
 * and every path relative to the install folder, so nothing in it names the machine that built the installer.
 * When the install folder is read-only (Program Files), the profile lives with the user's data instead.
 */
export async function ensureBasaltProfile({ installRoot, dataDir }) {
  const installed = join(installRoot, 'basalt-local.json');
  if (existsSync(installed) && profileWorks(installed, [installRoot, dataDir])) return installed;
  if (!existsSync(join(installRoot, 'basalt', CONFIG))) return null;   // this build ships no engine
  const port = await findFreePort(0);          // any port free on this machine, never one baked at build time
  const profile = { config: `basalt/${CONFIG}`, port, release: 'basalt', python: 'control/python/python.exe' };
  try {
    writeFileSync(installed, JSON.stringify(profile, null, 2) + '\n');
    return installed;
  } catch {
    const fallback = join(dataDir, 'basalt-local.json');
    try {
      mkdirSync(dataDir, { recursive: true });
      if (!existsSync(fallback)) writeFileSync(fallback, JSON.stringify({
        config: join(installRoot, 'basalt', CONFIG), port, release: join(installRoot, 'basalt'),
        python: join(installRoot, 'control', 'python', 'python.exe'),
      }, null, 2) + '\n');
      return fallback;
    } catch { return null; }
  }
}
