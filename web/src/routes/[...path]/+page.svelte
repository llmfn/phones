<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{data.sitename}</title>
</svelte:head>

<div class="message-page">
  <header class="site-nav">
    <a class="wordmark" href="/">Phones</a>
    <a class="nav-link" href="/admin">Admin</a>
  </header>
  <main class="message-main">
    <section class="editorial-panel message-panel">
      <p class="eyebrow">{data.sitename}</p>
      <h1>This page is not here yet.</h1>
      <a href="/">Return to phone search</a>
    </section>
  </main>
</div>
