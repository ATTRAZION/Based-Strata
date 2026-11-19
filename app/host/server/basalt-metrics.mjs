/** Basalt's own words into the numbers Strata's Monitor already knows how to draw.
 *
 * The managed Basalt server answers `/health` without a key and `/metrics` with it. `/metrics` carries the
 * engine's facts, the live state, the last requests and the running totals, which is everything the Monitor
 * cards ask for. These functions are pure: a caller polls, then hands the pair over and gets a reading.
 */

/** The Monitor prints one phase word and one sentence; the sentence keys are the ones Strata already translates. */
const PHASE = {
  loading: ['loading', 'Loading model into memory'],
  reading: ['reading', 'Reading prompt'],
  generating: ['generating', 'Generating response'],
  idle: ['idle', 'Waiting for a request'],
  asleep: ['idle', 'The model rests in memory'],
  unloaded: ['idle', 'The model is unloaded'],
};

const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const round = (value, digits = 1) => number(value) === null ? null : Math.round(value * 10 ** digits) / 10 ** digits;
const iso = seconds => typeof seconds === 'number' && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString();

/** The one slot doing the work, or the busiest of them; Basalt runs a single slot unless it was told otherwise. */
function activeSlot(slots) {
  const rows = Array.isArray(slots) ? slots : [];
  return rows.find(row => row?.is_processing) ?? rows.find(row => (row?.ctx_used ?? 0) > 0) ?? rows[0] ?? null;
}

/** A request Basalt has finished, as a row of the Monitor's request table. */
function requestRow(row, label) {
  const read = number(row.prompt_tokens) ?? 0;
  const reused = number(row.reused) ?? 0;
  const promptMs = number(row.prompt_ms);
  return {
    id: `basalt-${row.id}`,
    at: iso(number(row.time)),
    client: 'Basalt',
    endpoint: typeof row.path === 'string' ? row.path : '/chat/completions',
    state: row.finish === 'error' ? 'error' : 'done',
    finishReason: typeof row.finish === 'string' ? row.finish : null,
    tokensIn: read,
    tokensOut: number(row.output_tokens),
    durationMs: round((number(row.duration_s) ?? 0) * 1000, 0) ?? 0,
    model: label,
    cachedTokens: reused,
    tps: number(row.decode_tok_s),
    promptTps: promptMs > 0 ? round(Math.max(0, read - reused) / (promptMs / 1000), 1) : null,
    hitRate: number(row.hit_rate),
    pcieShare: number(row.pcie_share),
    usageSource: 'reported',
  };
}

/**
 * A reading for the Monitor, or null while Basalt has never answered. `label` names the model in the
 * request table and the Monitor title; `metrics` is Basalt's `/metrics`, `health` its `/health`.
 */
export function basaltReading({ metrics, health, label }) {
  if (!metrics || typeof metrics !== 'object') return null;
  const live = metrics.live ?? {};
  const engine = metrics.engine ?? {};
  const slot = activeSlot(live.slots);
  const state = typeof live.state === 'string' ? live.state : 'idle';
  const [phase, phaseLabel] = PHASE[state] ?? PHASE.idle;

  const maxTokens = number(engine.max_context) ?? number(health?.max_context) ?? 0;
  const usedTokens = Math.max(0, number(slot?.ctx_used) ?? 0);

  const promptTotal = number(live.prompt_tokens) ?? number(slot?.prompt_tokens) ?? 0;
  const promptDone = number(slot?.prefill_done) ?? (phase === 'reading' ? 0 : promptTotal);

  const requests = (Array.isArray(metrics.requests) ? metrics.requests : [])
    .filter(row => row && typeof row === 'object')
    .slice(0, 12)
    .map(row => requestRow(row, label));

  const totals = metrics.totals ?? {};
  const promptMs = number(totals.prompt_ms);
  const decodeMs = number(totals.decode_ms);
  const promptTokens = number(totals.prompt) ?? 0;
  const reusedTokens = number(totals.reused) ?? 0;
  const writtenTokens = number(totals.written) ?? 0;
  const latencies = requests.map(row => row.durationMs).filter(value => value > 0);

  const reading = {
    model: {
      name: label, kind: 'basalt', running: true, port: null,
      loaded: health?.loaded === true, loading: health?.loading === true,
      loadPercent: number(health?.percent), state,
    },
    phase,
    phaseLabel,
    prompt: { done: promptDone, total: promptTotal, pct: promptTotal > 0 ? Math.round(promptDone / promptTotal * 100) : 0 },
    generation: { done: number(live.generated), total: number(slot?.max_tokens) },
    outputTps: number(live.tok_s) ?? 0,
    promptTps: number(live.prefill_tok_s_mean) ?? 0,
    queue: { running: Math.max(0, (Array.isArray(live.slots) ? live.slots.filter(row => row?.is_processing).length : 0)), waiting: Math.max(0, number(live.queued) ?? 0) },
    context: { usedTokens, maxTokens, pct: maxTokens > 0 ? Math.round(usedTokens / maxTokens * 100) : 0 },
    telemetry: { throughput: 'engine', context: 'reported' },
    requests,
    totals: {
      tokensIn: promptTokens,
      tokensOut: writtenTokens,
      requests: number(totals.requests) ?? requests.length,
      avgTps: decodeMs > 0 ? round(writtenTokens / (decodeMs / 1000), 1) : 0,
      since: number(totals.since) ? new Date(totals.since * 1000).toISOString() : new Date().toISOString(),
      ttftMs: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : 0,
      cachedTokens: reusedTokens,
      uncachedTokens: Math.max(0, promptTokens - reusedTokens),
      usageRequests: number(totals.requests) ?? requests.length,
      latencyRequests: latencies.length,
      promptMs: promptMs ?? 0,
      decodeMs: decodeMs ?? 0,
    },
  };

  // Experts that only the file holds stay out of memory: the bar shows what the engine keeps close.
  const expertTotal = number(engine.expert_total) ?? number(engine.spill?.total) ?? number(engine.expert_slots);
  if (expertTotal) {
    const spillExperts = number(engine.spill?.experts) ?? 0;
    reading.expertCache = { used: Math.max(0, expertTotal - spillExperts), total: expertTotal, source: 'engine' };
  }

  // Basalt's engine names what its cache holds: `CONV parked=N bytes=N evictions=N[ restored=N restored_ms=X]`.
  // A figure the engine does not name is left out rather than guessed at, and the card draws what is there.
  const conversation = metrics.conversation;
  if (conversation && typeof conversation === 'object') {
    const parked = number(conversation.parked), bytes = number(conversation.bytes);
    if (parked !== null || bytes !== null) {
      reading.conversationCache = {
        enabled: true, parked: parked ?? 0, source: 'engine',
        slots: number(conversation.slots) ?? undefined,
        parks: number(conversation.parks) ?? undefined,
        restores: number(conversation.restored) ?? number(conversation.restores) ?? undefined,
        evictions: number(conversation.evictions) ?? undefined,
        memoryGb: bytes === null ? undefined : round(bytes / 1024 ** 3, 2) || undefined,
      };
    }
  }
  return reading;
}

/** What the app's own store keeps about the managed engine: enough for a sidebar chip without the Monitor. */
export function basaltSummary({ state, health, model, port, settings }) {
  const loaded = health?.loaded === true;
  const loading = health?.loading === true;
  return {
    name: model?.name ?? 'Basalt',
    modelId: model?.id ?? null,
    port,
    running: !!state?.running,
    loaded,
    loading,
    loadPercent: number(health?.percent),
    state: state?.liveState ?? (loading ? 'loading' : loaded ? 'idle' : state?.running ? 'unloaded' : 'stopped'),
    context: number(settings?.context) ?? number(health?.max_context) ?? null,
    vision: model?.vision === true,
    outputTps: number(state?.outputTps),
    usedTokens: number(state?.usedTokens),
  };
}
