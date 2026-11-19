/** A model that runs outside Strata Control still has to fill the Monitor: Basalt answers for itself, and the host folds its numbers into the same snapshot. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { basaltReading, basaltSummary } from '../server/basalt-metrics.mjs';
import * as monitor from '../server/monitor.mjs';
import * as serving from '../server/serving.mjs';

/* Taken from the managed server on the owner PC: the Qwen IQ3_S package, 256K context, one slot, MTP drafting. */
const HEALTH = {
  status: 'ok', max_context: 262144, model: 'Qwen3.8-Flash-Next-GSQ-RCO-IQ3_S', images: true, api_key: true,
  loaded: true, loading: false, service: 'basalt', percent: null, swap: null,
};
const METRICS = {
  engine: {
    model: 'Qwen3.8-Flash-Next-GSQ-RCO-IQ3_S', max_context: 262144, version: '0.4.1', kv: 'int8',
    expert_slots: 100, spill: { experts: 1200, total: 9216, bytes: 2_400_000_000 }, expert_total: 9216,
  },
  live: {
    state: 'generating', load: null, queued: 0,
    slots: [{
      id: 0, n_ctx: 262144, is_processing: true, state: 'decoding', api: 'openai', model: 'Qwen3.8-Flash-Next-GSQ-RCO-IQ3_S',
      tok_s: 91.4, generated: 512, max_tokens: 32768, prompt_tokens: 52761, prefill_done: 52761,
      ctx_used: 53273, reused: 50391, ttft_s: 0.8, draft_len: 4.1, drafts_offered: 620, drafts_accepted: 421,
    }],
    queue: [], prompt_tokens: 52761, generated: 512, elapsed_s: 6.2, tok_s: 91.4, phase: null, prefill_tok_s_mean: 1325,
  },
  requests: [
    {
      id: 'r_0007', path: '/v1/chat/completions', slot: 0, time: 1_763_000_000, duration_s: 9.4, finish: 'stop',
      prompt_tokens: 55177, reused: 54741, output_tokens: 745, prompt_ms: 700, decode_tok_s: 91.8,
      hit_rate: 0.672, pcie_share: 0, ssd_share: 0, drafts_offered: 900, drafts_accepted: 630, ttft_s: 0.7, draft_len: 4.1,
    },
    {
      id: 'r_0006', path: '/v1/chat/completions', slot: 0, time: 1_762_999_000, duration_s: 12.1, finish: 'length',
      prompt_tokens: 63981, reused: 55921, output_tokens: 737, prompt_ms: 3500, decode_tok_s: 94,
      hit_rate: 0.682, pcie_share: 0.01, ssd_share: 0, drafts_offered: 900, drafts_accepted: 620, ttft_s: 3.6, draft_len: 4.1,
    },
  ],
  totals: { since: 1_762_990_000, requests: 7, prompt: 300_000, reused: 280_000, written: 4_000, prompt_ms: 20_000, decode_ms: 45_000 },
  conversation: { parked: 1, slots: 2, bytes: 3_300_000_000 },
  hardware: { gpus: [], cpu: {}, ram_used: 60_000_000_000, ram_total: 102_000_000_000, disk_read_mb: 4 },
  hardware_static: { gpus: [] }, history: { tok_s: [], prefill_tok_s_mean: [] },
};
const LABEL = 'Qwen IQ3_S · Basalt';

test('Basalt words become the Monitor words: phase, speed, context and the expert pool', () => {
  const reading = basaltReading({ metrics: METRICS, health: HEALTH, label: LABEL });
  assert.equal(reading.phase, 'generating');
  assert.equal(reading.phaseLabel, 'Generating response');
  assert.equal(reading.outputTps, 91.4);
  assert.equal(reading.promptTps, 1325);
  assert.deepEqual(reading.generation, { done: 512, total: 32768 });
  assert.equal(reading.context.maxTokens, 262144);
  assert.equal(reading.context.usedTokens, 53273);
  assert.equal(reading.context.pct, 20);
  assert.deepEqual(reading.expertCache, { used: 8016, total: 9216, source: 'engine' });
  assert.deepEqual(reading.telemetry, { throughput: 'engine', context: 'reported' });
  assert.equal(reading.conversationCache.parked, 1);
  assert.equal(reading.model.name, LABEL);
  assert.equal(reading.model.loaded, true);
});

test('the request table keeps what the engine measured: reuse, hit rate, decode speed, the time to the first token', () => {
  const reading = basaltReading({ metrics: METRICS, health: HEALTH, label: LABEL });
  assert.equal(reading.requests.length, 2);
  const [row] = reading.requests;
  assert.equal(row.client, 'Basalt');
  assert.equal(row.model, LABEL);
  assert.equal(row.tokensIn, 55177);
  assert.equal(row.cachedTokens, 54741);
  assert.equal(row.tokensOut, 745);
  assert.equal(row.tps, 91.8);
  assert.equal(row.promptTps, 622.9);                   // (55177 - 54741) read in 0.7 s: uncached tokens over prompt time
  assert.equal(row.hitRate, 0.672);
  assert.equal(row.durationMs, 9400);
  assert.equal(row.finishReason, 'stop');
  assert.equal(row.usageSource, 'reported');
});

test('the session totals come from the engine, so the cards add up instead of counting only what Strata proxied', () => {
  const reading = basaltReading({ metrics: METRICS, health: HEALTH, label: LABEL });
  assert.equal(reading.totals.tokensIn, 300_000);
  assert.equal(reading.totals.cachedTokens, 280_000);
  assert.equal(reading.totals.uncachedTokens, 20_000);
  assert.equal(reading.totals.tokensOut, 4_000);
  assert.equal(reading.totals.requests, 7);
  assert.equal(reading.totals.avgTps, 88.9);            // written tokens over decode time
});

test('a model that is only reading, or only loading, is named as such', () => {
  const reading = state => basaltReading({ metrics: { ...METRICS, live: { ...METRICS.live, state } }, health: HEALTH, label: LABEL });
  assert.deepEqual([reading('reading').phase, reading('reading').phaseLabel], ['reading', 'Reading prompt']);
  assert.deepEqual([reading('loading').phase, reading('loading').phaseLabel], ['loading', 'Loading model into memory']);
  assert.deepEqual([reading('unloaded').phase, reading('unloaded').phaseLabel], ['idle', 'The model is unloaded']);
});

test('no answer from the engine is not a reading: the Monitor keeps its own words', () => {
  assert.equal(basaltReading({ metrics: null, health: null, label: LABEL }), null);
  assert.equal(basaltReading({ metrics: {}, health: null, label: LABEL }).phase, 'idle');
});

test('the Monitor shows the outside model: its name, its speed, its requests', () => {
  const reading = basaltReading({ metrics: METRICS, health: HEALTH, label: LABEL });
  const open = serving.open({ client: 'Strata chat', endpoint: '/chat/completions', model: LABEL });
  serving.mark(open.id, { state: 'generating', tokensIn: 120 });
  monitor.setModelSource(() => reading);
  const snap = monitor.snapshot();
  assert.equal(snap.phase, 'generating');
  assert.equal(snap.phaseLabel, 'Generating response');
  assert.equal(snap.model.name, LABEL);
  assert.equal(snap.telemetry.throughput, 'engine');
  assert.equal(snap.telemetry.context, 'reported');
  assert.equal(snap.context.maxTokens, 262144);
  assert.equal(snap.totals.tokensOut, 4_000);
  assert.equal(snap.generation.done, 512);
  // the request the host is still serving stays, and the engine's finished ones are added
  const ids = snap.requests.map(r => r.id);
  assert.ok(ids.includes(open.id));
  assert.ok(ids.some(id => id.startsWith('basalt-r_0007')));
  serving.finish(open.id, { tokensOut: 40, durationMs: 900 });
  monitor.setModelSource(null);
  assert.equal(monitor.snapshot().model, undefined);
});

test('the sidebar chip says what the engine is doing without waiting for the Monitor', () => {
  const summary = basaltSummary({
    state: { running: true, liveState: 'generating', outputTps: 91.4, usedTokens: 53273 },
    health: HEALTH, model: { id: 'Qwen3.8-Flash-Next-GSQ-RCO-IQ3_S', name: LABEL, vision: true }, port: 18511,
    settings: { context: 262144 },
  });
  assert.deepEqual(
    [summary.name, summary.running, summary.loaded, summary.state, summary.context, summary.outputTps],
    [LABEL, true, true, 'generating', 262144, 91.4],
  );
  const stopped = basaltSummary({ state: { running: false }, health: null, model: { name: LABEL }, port: 18511, settings: { context: 262144 } });
  assert.deepEqual([stopped.running, stopped.loaded, stopped.state], [false, false, 'stopped']);
});
