<script lang="ts">
  import AdminFrame from '$lib/AdminFrame.svelte';

  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
  <title>Phones Admin</title>
</svelte:head>

<AdminFrame>
  <section class="admin-page-head">
    <div>
      <p class="eyebrow">Phones / Admin</p>
      <h1>Training groups.</h1>
    </div>

    <details class="admin-create" open={Boolean(form?.error)}>
      <summary class="button">New group</summary>
      <form class="admin-create-form" method="POST" action="?/create">
        <label class="field-label" for="name">Group name</label>
        <div class="field-row">
          <input class="form-input" id="name" name="name" required />
          <button class="button" type="submit">Create group</button>
        </div>
        {#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
      </form>
    </details>
  </section>

  {#if data.groups.length}
    <ul class="admin-group-list">
      {#each data.groups as group (group.id)}
        <li class="admin-group-row">
          <a class="admin-group-name" href="/admin/groups/{group.id}">{group.name}</a>
          <span class="admin-group-count"
            >{group.participant_count} participant{group.participant_count === 1 ? '' : 's'}</span
          >
          <span class="admin-status" data-status={group.status}>{group.status}</span>
          <a class="nav-link" href="/admin/groups/{group.id}">Edit</a>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="admin-empty">No training groups yet. Create the first one to begin.</p>
  {/if}
</AdminFrame>
