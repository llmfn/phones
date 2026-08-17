<script lang="ts">
  import type { TraceStep, TraceTurn } from '$lib/schema';

  let { turns }: { turns: TraceTurn[] } = $props();

  let views = $state<Record<string, 'formatted' | 'raw'>>({});
  let copyLabel = $state('copy as JSON');

  const formatted = (value: unknown) => JSON.stringify(value, null, 2);
  const inr = new Intl.NumberFormat('en-IN');
  const filterColors = ['var(--trace-success)', 'var(--primary)', 'var(--trace-fallback)', 'var(--trace-error)'];
  const tokenColors = [
    'var(--primary)',
    'var(--trace-success)',
    'var(--trace-fallback)',
    'var(--trace-fg)',
    'var(--trace-error)'
  ];

  interface BM25Token {
    token: string;
    matches: number;
    weight: number;
  }

  interface BM25ResultToken {
    token: string;
    count: number;
    score: number;
  }

  interface BM25Result {
    id: string;
    name: string;
    score: number;
    length: number;
    tokens: BM25ResultToken[];
  }

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

  function bm25Detail(step: TraceStep) {
    if (step.name !== 'search_bm25' || !Array.isArray(step.output.tokens)) {
      return null;
    }

    const tokens = step.output.tokens.filter(
      (value): value is BM25Token =>
        isRecord(value) &&
        typeof value.token === 'string' &&
        typeof value.matches === 'number' &&
        typeof value.weight === 'number'
    );
    if (!tokens.length) return null;

    const ranked = Array.isArray(step.output.top_scores)
      ? step.output.top_scores.filter(
          (value): value is BM25Result =>
            isRecord(value) &&
            typeof value.id === 'string' &&
            typeof value.name === 'string' &&
            typeof value.score === 'number' &&
            typeof value.length === 'number' &&
            Array.isArray(value.tokens)
        )
      : [];
    const colors: Record<string, string> = {};
    for (const token of tokens) {
      if (token.matches > 0) {
        colors[token.token] =
          tokenColors[Object.keys(colors).length % tokenColors.length];
      }
    }
    const axis =
      Math.max(0, ...ranked.map((result) => result.score)) * 1.05 || 1;

    return {
      tokens,
      ranked,
      colors,
      axis,
      catalogueSize:
        typeof step.output.catalogue_size === 'number'
          ? step.output.catalogue_size
          : 0,
      results:
        typeof step.output.results === 'number' ? step.output.results : 0,
      averageLength: step.output.average_length,
      k1: step.output.k1,
      b: step.output.b
    };
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
            {@const bm25 = bm25Detail(step)}
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
                  {:else if bm25}
                    <div class="detail-block">
                      <div class="io-label">query as sent</div>
                      <div class="detail-text">
                        {String(step.input.query ?? '')}
                      </div>
                    </div>
                    <div class="detail-block">
                      <div class="io-label">tokens</div>
                      <ul class="token-matches">
                        <li class="token-row is-head">
                          <span class="token">token</span>
                          <span class="token-count">in catalogue</span>
                          <span class="token-weight">weight</span>
                        </li>
                        {#each bm25.tokens as token}
                          <li
                            class:is-miss={token.matches === 0}
                            class="token-row"
                          >
                            <span class="token">
                              {#if token.matches}
                                <span
                                  class="token-swatch"
                                  style:background={bm25.colors[token.token]}
                                ></span>
                              {/if}
                              <span>{token.token}</span>
                            </span>
                            <span class="token-count">
                              {token.matches
                                ? `${token.matches} of ${bm25.catalogueSize} phones`
                                : 'no matches'}
                            </span>
                            <span class="token-weight">
                              {token.matches ? token.weight.toFixed(2) : '—'}
                            </span>
                          </li>
                        {/each}
                        <li
                          class:is-miss={bm25.results === 0}
                          class="token-row is-total"
                        >
                          <span class="token">
                            {bm25.tokens.length === 1
                              ? 'holding that token'
                              : 'holding every token'}
                          </span>
                          <span class="token-count">
                            {bm25.results} phones
                          </span>
                        </li>
                      </ul>
                    </div>
                    {#if bm25.ranked.length}
                      <div class="detail-block">
                        <div class="io-label">what that ranked</div>
                        <ol class="rank-chart">
                          {#each bm25.ranked as result}
                            <li class="rank-row">
                              <span class="rank-name">{result.name}</span>
                              <span class="rank-score">
                                {result.score.toFixed(2)}
                              </span>
                              <span class="rank-track">
                                {#each result.tokens as token}
                                  <span
                                    class="rank-bar"
                                    style:width={`${
                                      (token.score / bm25.axis) * 100
                                    }%`}
                                    style:background={
                                      bm25.colors[token.token] ??
                                      'var(--primary)'
                                    }
                                    title={`${token.token}: ${token.score}`}
                                  ></span>
                                {/each}
                              </span>
                              <span class="rank-meta">
                                {result.tokens
                                  .map((token) => {
                                    return `${token.token} ×${token.count}`;
                                  })
                                  .concat(`${result.length} words`)
                                  .join(' · ')}
                              </span>
                            </li>
                          {/each}
                        </ol>
                        <div class="rank-legend">
                          bar = each token's share of the score · rare words
                          weigh more, repeats saturate, long records dilute
                        </div>
                      </div>
                    {/if}
                    <dl class="bm25-settings">
                      <dt>average length</dt>
                      <dd>{String(bm25.averageLength)}</dd>
                      <dt>k1</dt>
                      <dd>{String(bm25.k1)}</dd>
                      <dt>b</dt>
                      <dd>{String(bm25.b)}</dd>
                    </dl>
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
