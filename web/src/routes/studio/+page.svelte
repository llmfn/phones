<script lang="ts">
  import { untrack } from 'svelte';

  import StudioFrame from '$lib/StudioFrame.svelte';
  import { SEARCH_METHODS, searchMethodSpec, type SearchMethod } from '$lib/site-defaults';

  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // Every knob starts populated, so switching method shows numbers rather than
  // empty boxes; only the selected method's knobs are ever rendered or sent.
  function allDefaults(): Record<string, number> {
    const values: Record<string, number> = {};
    for (const spec of SEARCH_METHODS) {
      for (const param of spec.params) values[param.name] = param.default;
    }
    return values;
  }

  const readOnly = $derived(data.revision !== data.live);

  let method = $state<SearchMethod>(untrack(() => data.config.search.method));
  let params = $state<Record<string, number>>(
    untrack(() => ({ ...allDefaults(), ...data.config.search.search_params }))
  );

  // A save or a move between revisions reloads the page data; the panel follows
  // it back to whatever is stored, discarding edits along with them.
  $effect(() => {
    method = data.config.search.method;
    params = { ...allDefaults(), ...data.config.search.search_params };
  });

  const shown = $derived(searchMethodSpec(method).params);

  const dirty = $derived(
    method !== data.config.search.method ||
      shown.some(
        ({ name }) => params[name] !== (data.config.search.search_params as Record<string, number>)[name]
      )
  );
</script>

<StudioFrame {data} here="/studio" eyebrow="Search" title="How your site finds phones.">
  <form class="studio-form" method="POST" action="?/save">
    <fieldset class="studio-fieldset" disabled={readOnly}>
      <legend class="field-label">Search method</legend>
      {#each SEARCH_METHODS as option (option.value)}
        <label class="studio-choice">
          <input type="radio" name="method" value={option.value} bind:group={method} />
          <span class="studio-choice-label">{option.value}</span>
          <span class="hint">{option.hint}</span>
        </label>
      {/each}
    </fieldset>

    {#if shown.length > 0}
      <fieldset class="studio-fieldset" disabled={readOnly}>
        <legend class="field-label">Parameters</legend>
        {#each shown as param (param.name)}
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
</StudioFrame>
