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
      {#if form?.action === 'rename'}<p class="error" role="alert">{form.error}</p>{/if}
    </form>
  </section>

  <section class="admin-section admin-participants" aria-labelledby="participants-title">
    <div class="admin-section-head">
      <h2 id="participants-title">Participants</h2>
      <details class="admin-create" open={form?.action === 'add'}>
        <summary class="button">Add participant</summary>
        <form class="admin-participant-form" method="POST" action="?/addParticipant">
          <label class="field-label" for="participant-name">Name <span>(optional)</span></label>
          <input
            class="form-input"
            id="participant-name"
            name="name"
            value={form?.action === 'add' ? (form.values?.name ?? '') : ''}
          />
          <label class="field-label" for="participant-email">Email</label>
          <input
            class="form-input"
            id="participant-email"
            name="email"
            type="email"
            autocomplete="email"
            value={form?.action === 'add' ? (form.values?.email ?? '') : ''}
            required
          />
          <button class="button" type="submit">Add participant</button>
          {#if form?.action === 'add'}<p class="error" role="alert">{form.error}</p>{/if}
        </form>
      </details>
    </div>

    {#if data.participants.length}
      <div class="admin-participant-list">
        {#each data.participants as participant (participant.id)}
          <article class:deleted={participant.status === 'deleted'} class="admin-participant-row">
            <div class="admin-participant-summary">
              <div>
                <strong>{participant.name || 'Unnamed participant'}</strong>
                <a href="mailto:{participant.email}">{participant.email}</a>
              </div>
              <code>{participant.subdomain}</code>
              <span class="admin-status" data-status={participant.status}>{participant.status}</span>
            </div>

            {#if participant.status === 'active'}
              <div class="admin-participant-actions">
                <details open={form?.action === 'edit' && form.participantId === participant.id}>
                  <summary class="nav-link">Edit</summary>
                  <form class="admin-participant-form" method="POST" action="?/editParticipant">
                    <input type="hidden" name="participantId" value={participant.id} />
                    <label class="field-label" for="name-{participant.id}">Name <span>(optional)</span></label>
                    <input
                      class="form-input"
                      id="name-{participant.id}"
                      name="name"
                      value={form?.action === 'edit' && form.participantId === participant.id
                        ? form.values.name
                        : participant.name || ''}
                    />
                    <label class="field-label" for="email-{participant.id}">Email</label>
                    <input
                      class="form-input"
                      id="email-{participant.id}"
                      name="email"
                      type="email"
                      value={form?.action === 'edit' && form.participantId === participant.id
                        ? form.values.email
                        : participant.email}
                      required
                    />
                    <label class="field-label" for="subdomain-{participant.id}">Subdomain</label>
                    <input
                      class="form-input"
                      id="subdomain-{participant.id}"
                      name="subdomain"
                      value={form?.action === 'edit' && form.participantId === participant.id
                        ? form.values.subdomain
                        : participant.subdomain}
                      required
                    />
                    <button class="button" type="submit">Save participant</button>
                    {#if form?.action === 'edit' && form.participantId === participant.id}
                      <p class="error" role="alert">{form.error}</p>
                    {/if}
                  </form>
                </details>
                <form method="POST" action="?/deleteParticipant">
                  <input type="hidden" name="participantId" value={participant.id} />
                  <button class="nav-link nav-button admin-delete" type="submit">Delete</button>
                </form>
              </div>
            {:else}
              <form class="admin-participant-actions" method="POST" action="?/restoreParticipant">
                <input type="hidden" name="participantId" value={participant.id} />
                <button class="nav-link nav-button" type="submit">Restore</button>
              </form>
            {/if}
          </article>
        {/each}
      </div>
    {:else}
      <p class="admin-empty">No participants yet. Add the first person in this group.</p>
    {/if}
  </section>
</AdminFrame>
