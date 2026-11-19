import { useEffect, useState } from 'react';
import { api } from '../lib/client';
import { tr } from '../lib/i18n';
import { go, selectRemoteModel } from '../lib/store';
import { Btn, Dialog, ErrorNotice, Icon, Select } from './ui';

interface BasaltSettings {
    context: number;
    drafting: 'auto' | 'off';
    profile: 'work' | 'performance';
    vision: boolean;
    ramReserve: number;
    vramReserve: number;
    idleUnload: number;
}

interface BasaltState {
    configured: boolean;
    connectionId: string;
    model: { id: string; name: string; contextMax: number };
    action?: 'starting' | 'stopping' | 'loading';
    running: boolean;
    loaded: boolean;
    loading: boolean;
    settings: BasaltSettings;
    presets: { name: string; values: BasaltSettings }[];
    contexts: number[];
    pendingSettings: boolean;
    packagePath: string;
}

export function BasaltEngine() {
    const [status, setStatus] = useState<BasaltState>();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const [draft, setDraft] = useState<BasaltSettings>();
    const [dialog, setDialog] = useState<'advanced' | 'package' | 'preset'>();
    const [presetName, setPresetName] = useState('');
    useEffect(() => {
        let disposed = false;
        let timer: ReturnType<typeof setTimeout>;
        const abort = new AbortController();
        async function refresh() {
            try {
                const next = await api.get<BasaltState>('/api/basalt', abort.signal);
                if (disposed) return;
                setStatus(next);
                if (!next.configured) return;
            } catch { /* The next read can recover after the host restarts. */ }
            if (!disposed) timer = setTimeout(refresh, 1800);
        }
        void refresh();
        return () => { disposed = true; abort.abort(); clearTimeout(timer); };
    }, []);
    if (!status?.configured) return null;
    const current = status;
    const values = draft ?? current.settings;
    const busy = pending || !!current.action || current.loading;
    const dirty = draft != null && JSON.stringify(values) !== JSON.stringify(current.settings);
    const needsApply = dirty || current.pendingSettings;
    const changeValues = (patch: Partial<BasaltSettings>) => setDraft({ ...values, ...patch });
    function reserveLabel(profile: BasaltSettings['profile'], ram: number, vram: number) {
        const selected = values.profile === profile;
        return `${((selected ? values.ramReserve : ram) / 1024).toLocaleString()} GiB RAM · ${(selected ? values.vramReserve : vram).toLocaleString()} MiB VRAM`;
    }
    async function change(action: 'start' | 'stop' | 'load' | 'save' | 'preset') {
        setPending(true);
        setError('');
        try {
            if ((dirty && action !== 'stop') || action === 'preset') {
                setStatus(await api.post<BasaltState>('/api/basalt/settings', {
                    values, ...(action === 'preset' ? { preset: presetName } : {}),
                }));
                setDraft(undefined);
            }
            if (action === 'preset') {
                setPresetName('');
                setDialog(undefined);
            } else if (action === 'save') setDialog(undefined);
            else setStatus(await api.post<BasaltState>('/api/basalt/' + action, {}));
        }
        catch (err) { setError(err instanceof Error ? err.message : String(err)); }
        finally { setPending(false); }
    }
    function chat() {
        selectRemoteModel({ connectionId: current.connectionId, modelId: current.model.id });
        go('chat');
    }
    const label = current.action === 'starting' ? 'Starting Basalt…' :
        current.action === 'stopping' ? 'Stopping Basalt…' :
        current.loading || current.action === 'loading' ? 'Loading model weights…' : current.loaded ? 'Model loaded' :
        current.running ? 'Ready. Model loads on the first message.' : 'Stopped';
    return <section className="st-card native-choice basalt-engine" aria-label="Basalt">
        <h2 className="h4">Basalt</h2>
        <div className="native-choice__head">
            <span className="native-choice__label">{tr("Version")}</span>
            <div className="native-choice__tools">
                <Select ariaLabel={tr("Saved settings")} value="" disabled={busy} translateLabels={false}
                    options={[{ value: '', label: tr("Saved settings") }, ...current.presets.map((preset, i) => ({ value: String(i), label: preset.name })), { value: 'save', label: tr("Save Basalt preset") }]}
                    onChange={key => {
                        if (key === 'save') setDialog('preset');
                        else if (key !== '') setDraft(current.presets[Number(key)].values);
                    }}/>
                <Btn icon="models" size="sm" variant="ghost" onClick={() => setDialog('package')}>{tr("Manage models")}</Btn>
            </div>
        </div>
        <Btn block className="basalt-engine__package" icon="models" onClick={() => setDialog('package')}>{current.model.name} · {tr("Downloaded")}</Btn>
        <div className="native-choice__row">
            <div className="native-choice__col"><span className="native-choice__label">{tr("Conversation context")}</span>
                <Select ariaLabel={tr("Basalt conversation context")} value={String(values.context)} disabled={busy}
                    options={current.contexts.map(context => ({ value: String(context), label: `${context / 1024}K` }))}
                    onChange={context => changeValues({ context: Number(context) })}/>
                {values.context > 262144 ? <small className="muted">{tr("384K extends the model with YaRN.")}</small> : null}
            </div>
            <div className="native-choice__col"><span className="native-choice__label">{tr("Drafting")}</span>
                <Select ariaLabel={tr("Basalt drafting")} value={values.drafting} disabled={busy}
                    options={[{ value: 'auto', label: 'Auto (recommended)' }, { value: 'off', label: 'Off' }]}
                    onChange={drafting => changeValues({ drafting })}/>
            </div>
            <div className="native-choice__col"><span className="native-choice__label">{tr("Computer use")}</span>
                <div className="native-resource-choice">
                    <button disabled={busy} aria-pressed={values.profile === 'work'} data-selected={values.profile === 'work'}
                        onClick={() => changeValues({ profile: 'work', ramReserve: 10240, vramReserve: 1344 })}>
                        <Icon name="computer" size={20}/><span><strong>{tr("Leave room for my work")}</strong><small>{reserveLabel('work', 10240, 1344)}</small></span>
                    </button>
                    <button disabled={busy} aria-pressed={values.profile === 'performance'} data-selected={values.profile === 'performance'}
                        onClick={() => changeValues({ profile: 'performance', ramReserve: 6144, vramReserve: 1024 })}>
                        <Icon name="bolt" size={20}/><span><strong>{tr("Full performance")}</strong><small>{reserveLabel('performance', 6144, 1024)}</small></span>
                    </button>
                </div>
            </div>
        </div>
        <div className="native-image-reading"><label><input type="checkbox" checked={values.vision} disabled={busy} onChange={event => changeValues({ vision: event.target.checked })}/><span><strong>{tr("Read pictures")}</strong></span></label></div>
        <p className="small" role="status">{tr(label)}</p>
        {needsApply ? <p className="small muted">{tr("Apply the Basalt settings without loading weights, or load the model.")}</p> : null}
        <div className="native-model-actions">
            <Btn icon="gauge" disabled={busy} onClick={() => setDialog('advanced')}>{tr("Configure Basalt")}</Btn>
            {!current.running || needsApply ? <Btn disabled={busy} onClick={() => void change('start')}>{tr(current.running ? 'Apply Basalt settings' : 'Prepare Basalt')}</Btn> : null}
            {current.running && !needsApply ? <Btn disabled={busy} onClick={chat}>{tr("Use in chat")}</Btn> : null}
            {current.running ? <Btn disabled={busy} onClick={() => void change('stop')}>{tr("Stop Basalt")}</Btn> : null}
            {!current.loaded || needsApply ? <Btn variant="primary" icon="models" disabled={busy} onClick={() => void change('load')}>{tr("Load model")}</Btn> : null}
        </div>
        {error ? <ErrorNotice message={error}/> : null}
        <Dialog open={dialog === 'package'} compact title={tr("Manage models")} onClose={() => setDialog(undefined)}>
            <p>{current.model.name}</p><p className="small muted" style={{ overflowWrap: 'anywhere' }}>{current.packagePath}</p>
        </Dialog>
        <Dialog open={dialog === 'advanced'} compact title={tr("Configure Basalt")} onClose={() => { if (!pending) setDialog(undefined); }}
            actions={<Btn variant="primary" disabled={pending} onClick={() => void change('save')}>{tr("Save")}</Btn>}>
            <div className="stack stack--sm">
                <label className="input-field"><span>{tr("Basalt RAM reserve (MiB)")}</span><input className="st-input" type="number" min={4096} max={32768} step={128} value={values.ramReserve} onChange={e => changeValues({ ramReserve: Number(e.target.value) })}/></label>
                <label className="input-field"><span>{tr("Basalt VRAM reserve (MiB)")}</span><input className="st-input" type="number" min={1024} max={8192} step={64} value={values.vramReserve} onChange={e => changeValues({ vramReserve: Number(e.target.value) })}/></label>
                <label className="input-field"><span>{tr("Unload after idle (seconds, 0 to disable)")}</span><input className="st-input" type="number" min={0} max={86400} value={values.idleUnload} onChange={e => changeValues({ idleUnload: Number(e.target.value) })}/></label>
            </div>
            {error ? <ErrorNotice message={error}/> : null}
        </Dialog>
        <Dialog open={dialog === 'preset'} compact title={tr("Save Basalt preset")} onClose={() => { if (!pending) setDialog(undefined); }}
            actions={<Btn variant="primary" disabled={pending || !presetName.trim()} onClick={() => void change('preset')}>{tr("Save")}</Btn>}>
            <label className="input-field"><span>{tr("Preset name")}</span><input className="st-input" value={presetName} maxLength={60} onChange={e => setPresetName(e.target.value)}/></label>
            {error ? <ErrorNotice message={error}/> : null}
        </Dialog>
    </section>;
}
