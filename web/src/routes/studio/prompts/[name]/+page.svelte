<script lang="ts">
  import { untrack } from 'svelte';

  import StudioFrame from '$lib/StudioFrame.svelte';

  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const readOnly = $derived(data.revision !== data.live);
  const saved = $derived(data.config.prompts[data.prompt.name]);

  let text = $state(untrack(() => data.config.prompts[data.prompt.name]));

  // A save, a move between revisions, or a move to another prompt reloads the
  // page data; the editor follows it back to whatever is stored.
  $effect(() => {
    text = data.config.prompts[data.prompt.name];
  });

  const dirty = $derived(text !== saved);
</script>

<StudioFrame
  {data}
  here="/studio/prompts/{data.prompt.name}"
  eyebrow="Prompts"
  title={data.prompt.title}
>
  <p class="hint">{data.prompt.hint}</p>

  <form class="studio-form" method="POST" action="?/save">
    <fieldset class="studio-fieldset" disabled={readOnly}>
      <label class="studio-prompt">
        <span class="studio-choice-label">{data.prompt.name}</span>
        <textarea class="form-input" name={data.prompt.name} rows="18" bind:value={text}></textarea>
      </label>
    </fieldset>

    {#if !readOnly}
      <div class="studio-save">
        <label class="field-label" for="note">What changed</label>
        <input class="form-input" id="note" name="note" placeholder="Tightened the summary" />
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
