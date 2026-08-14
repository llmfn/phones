<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{data.slug} admin</title>
</svelte:head>

<div class="auth-page">
  <header class="site-nav">
    <a class="wordmark" href="/">Phones</a>
    <a class="nav-link" href="/">View app</a>
  </header>
  <main class="auth-main">
    <section class="editorial-panel auth-panel">
      <p class="eyebrow">Phones / Admin</p>
      <h1>Your app workspace.</h1>
      <p class="auth-copy">
        Signed in as the administrator for <strong>{data.slug}</strong>.
      </p>
      <form class="admin-actions" method="POST" action="?/logout">
        <button class="button button-secondary" type="submit">Log out</button>
      </form>
    </section>
  </main>
</div>
