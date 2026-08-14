<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{data.slug} admin</title>
</svelte:head>

<main>
  <p>Signed in as the administrator for <strong>{data.slug}</strong>.</p>
  <form method="POST" action="?/logout">
    <button type="submit">Log out</button>
  </form>
</main>
