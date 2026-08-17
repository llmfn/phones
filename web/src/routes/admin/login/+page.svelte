<script lang="ts">
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
  <title>Log in | Phones Admin</title>
</svelte:head>

<div class="auth-page">
  <header class="site-nav">
    <a class="wordmark" href="/">Phones</a>
    <a class="nav-link" href="/">Back to app</a>
  </header>
  <main class="auth-main">
    <section class="editorial-panel auth-panel" aria-labelledby="login-title">
      <p class="eyebrow">Protected area</p>
      <h1 id="login-title">Admin login</h1>
      <p class="auth-copy">Use the admin passcode to continue.</p>

      <form class="auth-form" method="POST">
        <label class="field-label" for="passcode">Passcode</label>
        <input
          class="form-input"
          id="passcode"
          name="passcode"
          type="password"
          autocomplete="current-password"
          required
        />
        {#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
        <button class="button" type="submit">Log in</button>
      </form>
    </section>
  </main>
</div>
