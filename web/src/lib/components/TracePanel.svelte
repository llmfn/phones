<script lang="ts">
  import type { TraceTurn } from '$lib/schema';

  let { turns }: { turns: TraceTurn[] } = $props();

  let views = $state<Record<string, 'formatted' | 'raw'>>({});
  let copyLabel = $state('copy as JSON');

  const formatted = (value: unknown) => JSON.stringify(value, null, 2);

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
            <li class="step-item">
              <details>
                <summary class={`step-row ${step.status}`}>
                  <span class="layer-badge">L{step.layer}</span>
                  <span class="step-label">{step.label || step.name}</span>
                  {#if step.status !== 'success'}<span class="step-status">{step.status}</span>{/if}
                  <span class="trace-latency">{step.latency_ms} ms</span>
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
