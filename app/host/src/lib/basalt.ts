import type { BasaltState, BasaltSummary } from './types';

/** One small answer for the sidebar chip and the status line: is the Basalt engine up, and what is it doing.
 *
 * It comes from two places and has to look the same either way: the Models fetch (`GET /api/basalt`, read once at
 * start-up) and the host's own event, which the host sends from the engine's `/health` and `/metrics` answers.
 */
export function basaltSummaryOf(state: BasaltState | null): BasaltSummary | null {
  if (!state || !state.configured) return null;
  const live = state.live ?? null;
  return {
    name: state.model?.name ?? 'Basalt',
    modelId: state.model?.id ?? null,
    port: null,
    running: state.running === true,
    loaded: state.loaded === true,
    loading: state.loading === true,
    state: live?.state ?? (state.loading ? 'loading' : state.loaded ? 'idle' : state.running ? 'unloaded' : 'stopped'),
    context: live?.maxTokens ?? state.model?.contextMax ?? null,
    vision: state.model?.vision === true,
    outputTps: live?.outputTps ?? null,
    usedTokens: live?.usedTokens ?? null,
  };
}
