<script lang="ts">
  import { untrack } from 'svelte';

  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const METHODS = [
    {
      value: 'substring_match',
      label: 'substring_match',
      hint: 'Case-insensitive match on the phone name. What you write before you know about ranking.'
    },
    {
      value: 'bm25',
      label: 'bm25',
      hint: 'Keyword ranking over the whole record. Every query token has to appear.'
    },
    {
      value: 'semantic_search',
      label: 'semantic_search',
      hint: 'Cosine similarity against each phone’s narrative. Answers vibe queries.'
    }
  ];

  const PARAMS: Record<string, { name: string; label: string; step: string }[]> = {
    substring_match: [],
    bm25: [
      { name: 'k1', label: 'k1 — term frequency saturation', step: '0.1' },
      { name: 'b', label: 'b — length normalisation', step: '0.05' }
    ],
    semantic_search: [{ name: 'min_score', label: 'min_score — similarity cutoff', step: '0.05' }]
  };

  // Every knob starts populated, so switching method shows numbers rather than
  // empty boxes; only the selected method's knobs are ever rendered or sent.
  const DEFAULTS = { k1: 1.5, b: 0.75, min_score: 0.3 };

  const readOnly = $derived(data.revision !== data.live);

  let method = $state(untrack(() => data.config.search.method));
  let params = $state<Record<string, number>>(
    untrack(() => ({ ...DEFAULTS, ...data.config.search.search_params }))
  );

  // A save or a move between revisions reloads the page data; the panel follows
  // it back to whatever is stored, discarding edits along with them.
  $effect(() => {
    method = data.config.search.method;
    params = { ...DEFAULTS, ...data.config.search.search_params };
  });

  const dirty = $derived(
    method !== data.config.search.method ||
      PARAMS[method].some(
        ({ name }) => params[name] !== (data.config.search.search_params as Record<string, number>)[name]
      )
  );

  function appHref() {
    return readOnly ? `/?r=${data.revision}` : '/';
  }
</script>

<svelte:head>
  <title>{data.slug} studio</title>
</svelte:head>

<div class="studio">
  <header class="studio-head">
    <a class="wordmark" href="/">{data.sitename}</a>
    <p class="studio-revision">
      rev {data.revision}
      <span class="studio-revision-state">{readOnly ? 'archived' : 'live'}</span>
    </p>
    <a class="nav-link" href={appHref()}>View app</a>
  </header>

  <div class="studio-body">
    <nav class="studio-rail" aria-label="Configuration">
      <a class="studio-rail-item is-current" href="/studio" aria-current="page">Search</a>
    </nav>

    <main class="studio-panel">
      <section class="editorial-panel">
        <p class="eyebrow">Search</p>
        <h1>How your site finds phones.</h1>

        {#if readOnly}
          <p class="hint">
            Revision {data.revision} is not live, so it is read only. Revision {data.live} is what
            your site serves.
          </p>
        {/if}

        <form class="studio-form" method="POST" action="?/save">
          <fieldset class="studio-fieldset" disabled={readOnly}>
            <legend class="field-label">Search method</legend>
            {#each METHODS as option (option.value)}
              <label class="studio-choice">
                <input type="radio" name="method" value={option.value} bind:group={method} />
                <span class="studio-choice-label">{option.label}</span>
                <span class="hint">{option.hint}</span>
              </label>
            {/each}
          </fieldset>

          {#if PARAMS[method].length > 0}
            <fieldset class="studio-fieldset" disabled={readOnly}>
              <legend class="field-label">Parameters</legend>
              {#each PARAMS[method] as param (param.name)}
                <label class="studio-param">
                  <span class="studio-choice-label">{param.label}</span>
                  <input
                    class="form-input"
                    type="number"
                    step={param.step}
                    name={param.name}
                    bind:value={params[param.name]}
                  />
                </label>
              {/each}
            </fieldset>
          {/if}

          {#if !readOnly}
            <div class="studio-save">
              <label class="field-label" for="note">What changed</label>
              <input
                class="form-input"
                id="note"
                name="note"
                placeholder="Switched to keyword ranking"
              />
              <div class="studio-save-row">
                <button class="button" type="submit">Save</button>
                <span class="hint" aria-live="polite">
                  {dirty ? 'Unsaved edits' : `Saved as revision ${data.live}`}
                </span>
              </div>
            </div>
          {/if}
        </form>

        {#if form?.error}<p class="error">{form.error}</p>{/if}
      </section>

      <form class="studio-signout" method="POST" action="?/logout">
        <button class="button button-secondary" type="submit">Log out</button>
      </form>
    </main>
  </div>
</div>
