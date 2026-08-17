<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<div class="admin-shell">
  <header class="site-nav admin-header">
    <a class="wordmark" href="/admin">Phones <span>Admin</span></a>
    <form method="POST" action="/admin/logout">
      <button class="nav-link nav-button" type="submit">Log out</button>
    </form>
  </header>
  <main class="admin-main">
    {@render children()}
  </main>
</div>
