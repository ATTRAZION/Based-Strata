import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/client';
import { tr } from '../lib/i18n';
import { go } from '../lib/store';
import { Btn } from './ui';
import type { BasaltState } from '../lib/types';

/** The phase word Basalt's own reading gives, in the words the Monitor already uses. */
const PHASE: Record<string, string> = {
  idle: 'Waiting for a request', asleep: 'The model rests in memory', reading: 'Reading prompt',
  generating: 'Generating response', loading: 'Loading model into memory', unloaded: 'The model is unloaded',
};

/** Settings → Engine: everything this install knows about the Basalt engine it runs by itself — the version the
 *  engine named, its files and saved choices, and live numbers while it is up. Read-only here: starting, stopping
 *  and tuning stay on the Models card, so this answers "what is it and where does it live" and nothing else.
 *  Numbers the engine never named (a stopped engine has no version yet) show as a dash rather than a guess. */
export function SettingsBasalt() {
  const [status, setStatus] = useState<BasaltState | null>(null);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    async function refresh() {
      try {
        const next = await api.get<BasaltState>('/api/basalt', abort.signal);
        if (!disposed) setStatus(next);
      } catch { /* The next read can recover after the host restarts. */ }
      if (!disposed) timer = setTimeout(refresh, 2000);
    }
    void refresh();
    return () => { disposed = true; abort.abort(); clearTimeout(timer); };
  }, []);
  if (!status?.configured) return null;
  const info = status.info ?? null;
  const live = status.live ?? null;
  const state = status.action === 'starting' ? 'Starting Basalt…' :
    status.action === 'stopping' ? 'Stopping Basalt…' :
    status.loading || status.action === 'loading' ? 'Loading model weights…' :
    status.loaded ? 'Model loaded' :
    status.running ? 'Ready. Model loads on the first message.' : 'Stopped';
  const row = (label: string, value: ReactNode) =>
    <div className="basalt-info__row"><span>{tr(label)}</span><strong>{value}</strong></div>;
  return <section className="settings-section basalt-info" aria-label="Basalt">
    <h2 className="h3" style={{ marginBottom: 14 }}>Basalt</h2>
    <div className="st-card st-card--flush">
      <div className="basalt-info__head">
        <span className="basalt-info__dot" data-on={status.running || undefined} aria-hidden="true"/>
        <p className="small" role="status">{tr(state)}{live ? ` · ${tr(PHASE[live.state] ?? PHASE.idle)}` : ''}</p>
        <Btn size="sm" variant="ghost" onClick={() => go('models')}>{tr("Open in Models")}</Btn>
      </div>
      <div className="basalt-info__grid">
        {row('Engine version', info?.version ?? '—')}
        {row('Model', status.model.name)}
        {row('Address', info ? `127.0.0.1:${info.port}` : '—')}
        {row('Context', `${status.settings.context / 1024}K`)}
        {row('Drafting', tr(status.settings.drafting === 'auto' ? 'Automatic' : 'Off'))}
        {row('Computer use', tr(status.settings.profile === 'work' ? 'Leave room for my work' : 'Full performance'))}
        {row('System reserves', `${(status.settings.ramReserve / 1024).toLocaleString()} GiB · ${status.settings.vramReserve.toLocaleString()} MiB VRAM`)}
        {row('Read pictures', tr(status.settings.vision ? 'On' : 'Off'))}
        {row('Idle unload', status.settings.idleUnload > 0 ? `${status.settings.idleUnload} s` : tr('Off'))}
      </div>
      {live ? <div className="basalt-info__grid basalt-info__grid--live">
        {row('Generating', `${live.outputTps.toFixed(1)} ${tr('tok/s')}`)}
        {row('Reading', `${live.promptTps.toFixed(0)} ${tr('tok/s')}`)}
        {row('Context', `${live.usedTokens.toLocaleString()} / ${live.maxTokens.toLocaleString()}`)}
        {row('Requests', live.requests.toLocaleString())}
        {row('Queue', live.queued)}
      </div> : null}
      {info ? <div className="basalt-info__grid basalt-info__grid--files">
        {row('Engine folder', <code>{info.release}</code>)}
        {row('Engine binary', <code>{info.engine}</code>)}
        {row('Python', <code>{info.python}</code>)}
        {row('Model file', <code>{status.packagePath}</code>)}
        {row('Profile file', <code>{info.configPath}</code>)}
        {row('Saved settings', <code>{info.settingsFile}</code>)}
        {row('Run configuration', <code>{info.runConfig}</code>)}
        {row('Engine log', <code>{info.logFile}</code>)}
      </div> : null}
    </div>
  </section>;
}
