import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const CONTEXTS = [32768, 65536, 131072, 196608, 262144, 393216];

export function initialSettings(config) {
  const model = config.models[0], engine = config.engine ?? {};
  return {
    context: model['max-context'], drafting: model.spec === 0 || model.spec === 1 ? 'off' : 'auto',
    profile: 'work', vision: model.vision !== 'off' && model.vision != null,
    ramReserve: model['ram-reserve-mib'] ?? engine['ram-reserve-mib'] ?? 10240,
    vramReserve: model['vram-reserve-mib'] ?? engine['vram-reserve-mib'] ?? 1344,
    idleUnload: model['idle-unload'] ?? 600,
  };
}

export function validateSettings(value) {
  const { context, drafting, profile, vision, ramReserve, vramReserve, idleUnload } = value ?? {};
  const between = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
  if (!CONTEXTS.includes(context) || !['auto', 'off'].includes(drafting) ||
      !['work', 'performance'].includes(profile) || typeof vision !== 'boolean' ||
      !between(ramReserve, 4096, 32768) || !between(vramReserve, 1024, 8192) ||
      !between(idleUnload, 0, 86400)) throw new Error('Check the context, drafting and memory settings.');
  return { context, drafting, profile, vision, ramReserve, vramReserve, idleUnload };
}

export function readSettings(file, defaults) {
  if (!existsSync(file)) return { values: defaults, presets: [] };
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return {
      values: validateSettings(data.values),
      presets: data.presets.map(({ name, values }) => ({ name, values: validateSettings(values) })),
    };
  } catch {
    console.warn('Basalt settings could not be read. The original configuration will be used.');
    return { values: defaults, presets: [] };
  }
}

export function writeSettings(file, saved, { values, preset }) {
  const next = { values: validateSettings(values), presets: saved.presets };
  if (preset != null) {
    const name = typeof preset === 'string' ? preset.trim() : '';
    if (!name || name.length > 60) throw new Error('Give the preset a name of at most 60 characters.');
    const existing = next.presets.some(item => item.name === name);
    if (!existing && next.presets.length >= 20) throw new Error('The Basalt preset list is full.');
    next.presets = [...next.presets.filter(item => item.name !== name), { name, values: next.values }];
  }
  const temporary = file + '.tmp';
  writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n');
  renameSync(temporary, file);
  return next;
}

export function runConfiguration(config, configPath, values) {
  const model = {
    ...config.models[0],
    model: resolve(dirname(configPath), config.models[0].model),
    'max-context': values.context, vision: values.vision ? 'dynamic' : 'off',
    'idle-unload': values.idleUnload, 'ram-reserve-mib': values.ramReserve,
    'vram-reserve-mib': values.vramReserve,
  };
  const engine = { ...config.engine };
  if (values.drafting === 'off') model.spec = 0;
  else { delete model.spec; delete engine.spec; }
  if (values.context > 262144) {
    model['rope-scaling'] = 'yarn';
    model['rope-scale'] = values.context / 262144;
    model['yarn-orig-ctx'] = 262144;
  }
  return { ...config, engine, models: [model] };
}
