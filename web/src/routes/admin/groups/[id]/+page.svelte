<script lang="ts">
  import AdminFrame from '$lib/AdminFrame.svelte';

  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
  <title>{data.group.name} | Phones Admin</title>
</svelte:head>

<AdminFrame>
  <a class="admin-back" href="/admin">&larr; Groups</a>

  <section class="admin-page-head admin-group-head">
    <div>
      <p class="eyebrow">Training group</p>
      <h1>{data.group.name}</h1>
    </div>
    <span class="admin-status" data-status={data.group.status}>{data.group.status}</span>
  </section>

  <section class="admin-section" aria-labelledby="rename-title">
    <h2 id="rename-title">Rename group</h2>
    <form class="admin-rename-form" method="POST" action="?/rename">
      <label class="field-label" for="name">Group name</label>
      <div class="field-row">
        <input class="form-input" id="name" name="name" value={data.group.name} required />
        <button class="button" type="submit">Save name</button>
      </div>
      {#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
    </form>
  </section>
</AdminFrame>
