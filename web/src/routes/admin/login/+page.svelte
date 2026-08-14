<script lang="ts">
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
  <title>Admin sign in</title>
</svelte:head>

<main>
  <section>
    <p class="eyebrow">PHONES / ADMIN</p>
    <h1>Sign in to edit your app.</h1>

    {#if form?.sent}
      <p>We sent a verification code to <strong>{data.maskedEmail}</strong>.</p>
      <form method="POST" action="?/verify">
        <label for="code">Verification code</label>
        <span class="hint">Enter the six digits with no spaces.</span>
        <input
          id="code"
          name="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          placeholder="123456"
          required
        />
        <button type="submit">Verify code</button>
      </form>
    {:else}
      <p>We will send a verification code to <strong>{data.maskedEmail}</strong>.</p>
      <form method="POST" action="?/send">
        <button type="submit">Send code</button>
      </form>
    {/if}

    {#if form?.error}<p class="error">{form.error}</p>{/if}
  </section>
</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    color: #14231c;
    background: #f0f4e9;
    font-family: Georgia, 'Times New Roman', serif;
  }

  main {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 1rem;
  }

  section {
    width: min(34rem, 100%);
    padding: clamp(2rem, 7vw, 4rem);
    border: 1px solid #879589;
    background: #fbfcf6;
    box-shadow: 0.6rem 0.6rem 0 #d9a441;
  }

  .eyebrow,
  label,
  input,
  button,
  .error {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .eyebrow {
    color: #567161;
    font-size: 0.75rem;
    letter-spacing: 0.16em;
  }

  h1 {
    margin: 1.5rem 0;
    font-size: clamp(2rem, 7vw, 3.5rem);
    font-weight: 400;
    line-height: 1;
  }

  p {
    line-height: 1.5;
  }

  form {
    display: grid;
    gap: 0.75rem;
    margin-top: 1.5rem;
  }

  label {
    font-size: 0.8rem;
    font-weight: 700;
  }

  .hint {
    color: #567161;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
  }

  input,
  button {
    min-height: 3.25rem;
    border: 1px solid #14231c;
    font-size: 1rem;
  }

  input {
    padding: 0 1rem;
    letter-spacing: 0.35em;
  }

  button {
    padding: 0 1.25rem;
    color: white;
    background: #14231c;
    cursor: pointer;
  }

  .error {
    color: #9b3427;
    font-size: 0.85rem;
  }
</style>
