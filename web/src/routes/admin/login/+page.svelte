<script lang="ts">
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
  <title>Admin sign in</title>
</svelte:head>

<div class="auth-page">
  <header class="site-nav">
    <a class="wordmark" href="/">Phones</a>
    <a class="nav-link" href="/">Back to app</a>
  </header>
  <main class="auth-main">
    <section class="editorial-panel auth-panel">
      <p class="eyebrow">Phones / Admin</p>
      <h1>Sign in to edit your app.</h1>

      {#if form?.sent}
        <p class="auth-copy">
          We sent a verification code to <strong>{data.maskedEmail}</strong>.
        </p>
        <form class="auth-form" method="POST" action="?/verify">
          <label class="field-label" for="code">Verification code</label>
          <span class="hint">Enter the six digits with no spaces.</span>
          <input
            class="form-input code-input"
            id="code"
            name="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            placeholder="123456"
            required
          />
          <button class="button" type="submit">Verify code</button>
        </form>
      {:else}
        <p class="auth-copy">
          We will send a verification code to <strong>{data.maskedEmail}</strong>.
        </p>
        <form class="auth-form" method="POST" action="?/send">
          <button class="button" type="submit">Send code</button>
        </form>
      {/if}

      {#if form?.error}<p class="error">{form.error}</p>{/if}
    </section>
  </main>
</div>
