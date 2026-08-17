<script lang="ts">
  import type { TraceStep, TraceTurn } from '$lib/schema';

  let { turns }: { turns: TraceTurn[] } = $props();

  let views = $state<Record<string, 'formatted' | 'raw'>>({});
  let copyLabel = $state('copy as JSON');

  const formatted = (value: unknown) => JSON.stringify(value, null, 2);
  const inr = new Intl.NumberFormat('en-IN');
  const filterColors = ['var(--trace-success)', 'var(--primary)', 'var(--trace-fallback)', 'var(--trace-error)'];

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function substringMatches(step: TraceStep): Array<{ id: string; name: string }> | null {
    if (step.name !== 'search_substring_match' || !Array.isArray(step.output.shown_matches)) return null;
    return step.output.shown_matches.filter(
      (match): match is { id: string; name: string } =>
        typeof match === 'object' &&
        match !== null &&
        'id' in match &&
        typeof match.id === 'string' &&
        'name' in match &&
        typeof match.name === 'string'
    );
  }

  function matchCount(step: TraceStep): number {
    return typeof step.output.matched === 'number' ? step.output.matched : 0;
  }

  function filterSummary(step: TraceStep): string | null {
    if (step.name !== 'apply_filters') return null;
    const before = step.input.in;
    const after = step.output.kept;
    return typeof before === 'number' && typeof after === 'number' ? `${before} → ${after}` : null;
  }

  function filterDetail(step: TraceStep) {
    if (step.name !== 'apply_filters' || typeof step.output.kept !== 'number' || !isRecord(step.output.removed)) {
      return null;
    }

    const applied: Array<{ name: string; value: string }> = [];
    if (isRecord(step.input.filters)) {
      for (const [name, value] of Object.entries(step.input.filters)) {
        if (Array.isArray(value) && value.length) applied.push({ name, value: value.join(', ') });
        else if (isRecord(value) && typeof value.min === 'number' && typeof value.max === 'number') {
          applied.push({ name, value: `₹${inr.format(value.min)} – ₹${inr.format(value.max)}` });
        }
      }
    }

    const cuts = Object.entries(step.output.removed)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
      .sort((left, right) => right[1] - left[1]);
    const bands = [['kept', step.output.kept] as [string, number], ...cuts].map(([name, count], index) => ({
      name,
      count,
      color: filterColors[index % filterColors.length]
    }));
    return { applied, bands, total: bands.reduce((sum, band) => sum + band.count, 0) };
  }

  async function copyTrace() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(turns, null, 2));
      copyLabel = 'copied';
      window.setTimeout(() => (copyLabel = 'copy as JSON'), 1200);
    } catch {
      copyLabel = 'copy failed';
    }
  }
</script>

<aside class="trace-rail" aria-label="Trace">
  <div class="trace-head">
    <h2 class="trace-title">Trace</h2>
    <button class="trace-copy" type="button" onclick={copyTrace}>{copyLabel}</button>
  </div>

  <ol class="trace-turns">
    {#each turns as turn, turnIndex}
      <li class:error={turn.status === 'error'} class="trace-turn">
        <div class="turn-head">
          <span class="turn-kind">{turn.kind}</span>
          <span class="turn-input">{turn.input || '(no query)'}</span>
          <span class="trace-latency">{turn.latency_ms} ms</span>
        </div>

        <ol class="turn-steps">
          {#each turn.steps as step, stepIndex}
            {@const key = `${turnIndex}-${stepIndex}`}
            {@const matches = substringMatches(step)}
            {@const filters = filterDetail(step)}
            {@const summary = filterSummary(step)}
            <li class="step-item">
              <details>
                <summary class={`step-row ${step.status}`}>
                  <span class="step-label">{step.label || step.name}</span>
                  {#if step.status !== 'success'}<span class="step-status">{step.status}</span>{/if}
                  {#if summary}<span class="step-summary">{summary}</span>{:else}<span class="trace-latency">{step.latency_ms} ms</span>{/if}
                  <span class="step-caret" aria-hidden="true"></span>
                </summary>
                <div class="step-detail">
                  <div class="step-tabs" role="tablist" aria-label={`${step.label || step.name} detail`}>
                    <button
                      class:is-active={(views[key] ?? 'formatted') === 'formatted'}
                      class="step-tab"
                      type="button"
                      role="tab"
                      aria-selected={(views[key] ?? 'formatted') === 'formatted'}
                      onclick={() => (views[key] = 'formatted')}>formatted</button
                    >
                    <button
                      class:is-active={views[key] === 'raw'}
                      class="step-tab"
                      type="button"
                      role="tab"
                      aria-selected={views[key] === 'raw'}
                      onclick={() => (views[key] = 'raw')}>raw</button
                    >
                  </div>

                  {#if views[key] === 'raw'}
                    <pre class="trace-json">{formatted(step)}</pre>
                  {:else if filters}
                    {#if filters.applied.length}
                      <div class="detail-block">
                        <div class="io-label">filters applied</div>
                        <dl class="filter-applied">
                          {#each filters.applied as filter}
                            <dt>{filter.name}</dt><dd>{filter.value}</dd>
                          {/each}
                        </dl>
                      </div>
                    {/if}
                    <div class="detail-block">
                      <div class="io-label">what survived</div>
                      <div class="filter-bar" aria-hidden="true">
                        {#each filters.bands as band}
                          <span
                            class="filter-band"
                            style:width={`${filters.total ? (band.count / filters.total) * 100 : 0}%`}
                            style:background={band.color}
                          ></span>
                        {/each}
                      </div>
                      <dl class="filter-legend">
                        {#each filters.bands as band}
                          <dt><span class="filter-swatch" style:background={band.color}></span>{band.name}</dt>
                          <dd>{band.name === 'kept' ? band.count : `−${band.count}`}</dd>
                        {/each}
                      </dl>
                    </div>
                  {:else if matches}
                    <div class="detail-block">
                      <div class="io-label">query as sent</div>
                      <div class="detail-text">{String(step.input.query ?? '')}</div>
                    </div>
                    <div class="detail-block">
                      <div class="io-label">matches</div>
                      <ol class="substring-matches">
                        {#each matches as match}
                          <li>{match.name}</li>
                        {/each}
                      </ol>
                      <div class:error-count={matchCount(step) === 0} class="substring-count">
                        {matchCount(step)} matching phone{matchCount(step) === 1 ? '' : 's'}
                        {#if matches.length < matchCount(step)}
                          <span>showing first {matches.length} in catalogue order</span>
                        {/if}
                      </div>
                    </div>
                  {:else}
                    <div class="detail-block">
                      <div class="io-label">input</div>
                      <pre class="trace-json">{formatted(step.input)}</pre>
                    </div>
                    <div class="detail-block">
                      <div class="io-label">output</div>
                      <pre class="trace-json">{formatted(step.output)}</pre>
                    </div>
                  {/if}
                </div>
              </details>
            </li>
          {/each}
        </ol>

        {#if !turn.steps.length}<div class="turn-empty">no steps recorded</div>{/if}
        {#if turn.error}<div class="turn-error">{turn.error}</div>{/if}
      </li>
    {/each}
  </ol>
</aside>
