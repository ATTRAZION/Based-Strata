/** Own the optional Basalt server. The model is loaded by its first inference request. */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { CONTEXTS, initialSettings, readSettings, runConfiguration, writeSettings } from './basalt-settings.mjs';
import { basaltReading, basaltSummary } from './basalt-metrics.mjs';

export const BASALT_ID = 'strata-managed-basalt';
const bridge = fileURLToPath(new URL('./basalt-server.py', import.meta.url));

export function createBasaltRuntime({ installFile, dataDir, releaseStrata, strataInUse, changed = () => {} }) {
  if (!existsSync(installFile)) return null;
  const root = dirname(installFile);
  const getPath = value => resolve(root, value);
  const local = JSON.parse(readFileSync(installFile, 'utf8'));
  const configPath = getPath(local.config);
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const model = config.models?.[0];
  const port = local.port;
  if (config.models?.length !== 1 || !model.alias || !(model['max-context'] > 0) ||
      !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('The managed Basalt profile needs one named model, a context size, and a private port.');
  }
  const settingsFile = join(dataDir, 'basalt-settings.json');
  const runConfig = join(dataDir, 'basalt-run.json');
  const logFile = join(dataDir, 'managed-basalt.log');
  const pythonPath = getPath(local.python);
  const releasePath = getPath(local.release);
  const enginePath = join(releasePath, 'bin', 'basalt.exe');
  const defaults = initialSettings(config);
  let saved = readSettings(settingsFile, defaults);
  /* The settings file is shared by every Basalt profile this installation has served, so a context chosen for
   * an earlier package can be larger than this model's own ceiling. Take the profile's default instead of
   * asking the engine for a window the package cannot hold. */
  if (saved.values.context > model['max-context']) saved = { ...saved, values: { ...saved.values, context: defaults.context } };
  let runningSettings = null;
  const origin = `http://127.0.0.1:${port}`;
  const apiKey = randomBytes(32).toString('hex');
  const headers = { authorization: `Bearer ${apiKey}` };
  const connection = {
    id: BASALT_ID, managed: true, kind: 'custom', provider: null, name: 'Basalt', baseUrl: origin + '/v1',
    protocol: 'openai-chat', apiKey, models: [{
      id: model.alias, name: model.alias, contextMax: model['max-context'], maxOutput: null,
      vision: saved.values.vision, reasoning: true,
    }],
  };
  let child = null, finished = null, action = null, closing = false;
  /* What the engine is doing now, in the words the rest of Strata already speaks. Basalt answers this itself
   * (`/health` without a key, `/metrics` with the one this host made), so the host asks its own server every
   * couple of seconds and keeps the last reading for the Monitor, the sidebar chip and the Models card. */
  let reading = null, liveHealth = null, poller = null, published = '';
  async function sample() {
    const owned = child;
    if (!owned || closing) { reading = null; liveHealth = null; published = ''; return; }
    const h = await health();
    if (child !== owned) return;
    liveHealth = h;
    const answer = h ? await request('/metrics', undefined, 3000).catch(() => null) : null;
    const metrics = answer?.ok ? await answer.json().catch(() => null) : null;
    if (child !== owned) return;
    reading = basaltReading({ metrics, health: h, label: connection.models[0].name });
    const summary = summaryValue();
    const signature = JSON.stringify(summary);
    if (signature !== published) { published = signature; changed(summary); }
  }
  function liveValue() {
    return reading ? {
      state: reading.model.state, loaded: reading.model.loaded, loading: reading.model.loading,
      outputTps: reading.outputTps, promptTps: reading.promptTps,
      usedTokens: reading.context.usedTokens, maxTokens: reading.context.maxTokens,
      queued: reading.queue.waiting, requests: reading.totals.requests,
    } : null;
  }
  function summaryValue() {
    return basaltSummary({
      state: reading ? { running: true, liveState: reading.model.state, outputTps: reading.outputTps, usedTokens: reading.context.usedTokens } : { running: !!child },
      health: liveHealth, model: connection.models[0], port, settings: saved.values,
    });
  }
  if (poller === null) { poller = setInterval(() => void sample(), 1500); poller.unref?.(); }
  const pendingSettings = () => runningSettings !== null && JSON.stringify(runningSettings) !== JSON.stringify(saved.values);
  function advertise(values) {
    Object.assign(connection.models[0], { contextMax: values.context, vision: values.vision });
  }

  const request = (path, options, timeout = 4000) => fetch(origin + path, {
    ...options, headers: { ...headers, ...options?.headers }, redirect: 'error', signal: AbortSignal.timeout(timeout),
  });
  async function health() {
    try {
      const response = await request('/health');
      return response.ok ? await response.json() : null;
    } catch { return null; }
  }
  async function state() {
    const h = child ? await health() : null;
    return { configured: true, connectionId: BASALT_ID, model: connection.models[0], action,
      settings: saved.values, presets: saved.presets, contexts: CONTEXTS, pendingSettings: pendingSettings(),
      packagePath: resolve(dirname(configPath), model.model),
      // What this app knows about the engine it runs itself: where its files are and the version it answered with.
      info: { port, version: reading?.version ?? null, release: releasePath, engine: enginePath, python: pythonPath,
        logFile, settingsFile, runConfig, configPath },
      live: liveValue(),
      running: !!child && h?.service === 'basalt', loaded: h?.loaded === true, loading: h?.loading === true };
  }
  async function exclusive(name, task) {
    if (closing || action) throw new Error('An engine switch is already in progress.');
    action = name;
    try { return await task(); } finally { action = null; }
  }
  async function closeChild(force = false) {
    const owned = child, done = finished;
    if (!owned) return;
    if (!force) {
      const h = await health();
      if (child !== owned) return;
      if (!h) throw new Error('Basalt did not reply. Wait for it to finish starting.');
      if (h.loading) throw new Error('Wait for Basalt to finish loading before switching engines.');
      const response = await request('/v1/unload', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      }, 60000).catch(err => {
        if (child === owned) throw err;
        return null;
      });
      if (child !== owned) return;
      if (response.status === 409) throw new Error('Finish or stop the Basalt request before switching engines.');
      if (!response.ok) throw new Error('Basalt did not confirm that it unloaded the model.');
    }
    owned.stdin.end();
    if (!await Promise.race([done.then(() => true), delay(15000, false, { ref: false })])) {
      owned.kill();
      if (!await Promise.race([done.then(() => true), delay(4000, false, { ref: false })])) {
        throw new Error('The Basalt server did not stop.');
      }
    }
  }
  async function start() {
    await exclusive('starting', async () => {
      if (child && !pendingSettings()) return;
      if (strataInUse()) throw new Error('Finish the current operation before applying Basalt settings.');
      const python = pythonPath, release = releasePath, engine = enginePath;
      for (const [path, label] of [[python, 'Python'], [engine, 'Basalt'], [resolve(dirname(configPath), model.model), 'The Basalt model']]) {
        if (!existsSync(path)) throw new Error(`${label} was not found at ${path}.`);
      }
      if (child) await closeChild();
      if (await health()) throw new Error('The managed Basalt port is already in use.');
      mkdirSync(dataDir, { recursive: true });
      const values = saved.values;
      writeFileSync(runConfig, JSON.stringify(runConfiguration(config, configPath, values), null, 2) + '\n');
      const log = openSync(logFile, 'a');
      let proc;
      try {
        proc = spawn(python, ['-u', bridge, release, '--engine-bin', engine, '--config', runConfig,
          '--host', '127.0.0.1', '--port', String(port), '--lazy'],
        { cwd: release, windowsHide: true, stdio: ['pipe', log, log],
          env: { ...process.env, STRATA_MANAGED_BASALT_KEY: apiKey } });
      } finally { closeSync(log); }
      child = proc;
      proc.stdin.on('error', () => {});
      finished = new Promise(done => {
        function exited() {
          if (child === proc) {
            child = null;
            runningSettings = null;
            advertise(saved.values);
          }
          done();
        }
        proc.once('error', exited);
        proc.once('exit', exited);
      });
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline && child === proc && !closing) {
        const h = await health();
        if (h?.service === 'basalt' && h.model === model.alias && h.max_context === values.context && h.api_key) {
          const models = await request('/v1/models').catch(() => null);
          if (models?.ok) {
            try {
              if (strataInUse()) throw new Error('Finish the Strata operation before switching engines.');
              await releaseStrata();
              if (child !== proc || closing) throw new Error('Basalt stopped during the engine switch.');
            } catch (err) {
              await closeChild(true);
              throw err;
            }
            runningSettings = values;
            advertise(values);
            return;
          }
        }
        await delay(450);
      }
      await closeChild(true);
      if (!closing) throw new Error('Basalt did not start. See managed-basalt.log in the Strata data folder.');
    });
    return state();
  }
  return { connection, state, start,
    telemetry: () => reading,
    live: liveValue,
    summary: summaryValue,
    available: () => !!child && !action && !closing,
    // The id the chat picker names when it chooses this engine; the host needs it to answer a chat that
    // was given no model of its own.
    modelId: () => connection.models[0].id,
    async configure(body) {
      if (closing || action) throw new Error('Wait for the current Basalt operation to finish.');
      saved = writeSettings(settingsFile, saved, body);
      if (!runningSettings) advertise(saved.values);
      return state();
    },
    async load() {
      await start();
      await exclusive('loading', async () => {
        if (!child) throw new Error('Basalt has stopped. Start it again in Models.');
        const response = await request('/v1/load', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
        }, 900000);
        if (!response.ok) {
          const failure = await response.json().catch(() => null);
          throw new Error(failure?.error?.message ?? 'Basalt could not load the model.');
        }
      });
      return state();
    },
    async stop() { await exclusive('stopping', () => closeChild()); return state(); },
    async close() { closing = true; await closeChild(true); },
  };
}
