<script lang="ts">
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
  <title>{data.page === 'apex' ? 'Find your Phones app' : data.sitename}</title>
</svelte:head>

{#if data.page === 'apex'}
  <main class="login-shell">
    <section class="login-card">
      <p class="eyebrow">LLMFN / PHONES</p>
      <h1>Your phone lab,<br />ready in the browser.</h1>
      <p class="intro">Enter your course email to open your personal workspace.</p>

      <form method="POST">
        <label for="email">Email address</label>
        <div class="field-row">
          <input
            id="email"
            name="email"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
            required
          />
          <button type="submit">Open app</button>
        </div>
        {#if form?.error}<p class="error">{form.error}</p>{/if}
      </form>
    </section>
  </main>
{:else}
  <main class="app-shell">
    <section class="app-card">
      <p>Hello, {data.sitename}</p>
      <a href="/admin">Admin</a>
    </section>
  </main>
{/if}

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

  .login-shell {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 2rem;
    background:
      linear-gradient(90deg, rgb(20 35 28 / 7%) 1px, transparent 1px) 0 0 / 3rem 3rem,
      #f0f4e9;
  }

  .login-card {
    width: min(44rem, 100%);
    padding: clamp(2rem, 7vw, 5rem);
    border: 1px solid #879589;
    border-radius: 0.25rem;
    background: #fbfcf6;
    box-shadow: 0.75rem 0.75rem 0 #d9a441;
  }

  .eyebrow,
  label,
  button,
  input {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .eyebrow {
    margin: 0 0 2rem;
    color: #567161;
    font-size: 0.75rem;
    letter-spacing: 0.16em;
  }

  h1 {
    margin: 0;
    font-size: clamp(2.4rem, 8vw, 4.5rem);
    font-weight: 400;
    line-height: 0.96;
    letter-spacing: -0.04em;
  }

  .intro {
    max-width: 32rem;
    margin: 1.75rem 0 2.5rem;
    color: #4f5c54;
    font-size: 1.15rem;
    line-height: 1.5;
  }

  label {
    display: block;
    margin-bottom: 0.6rem;
    font-size: 0.8rem;
    font-weight: 700;
  }

  .field-row {
    display: flex;
    gap: 0.65rem;
  }

  input,
  button {
    min-height: 3.25rem;
    border: 1px solid #14231c;
    font-size: 0.95rem;
  }

  input {
    min-width: 0;
    flex: 1;
    padding: 0 1rem;
    border-radius: 0;
    background: white;
  }

  input:focus {
    outline: 3px solid #d9a441;
    outline-offset: 1px;
  }

  button {
    padding: 0 1.25rem;
    color: white;
    background: #14231c;
    cursor: pointer;
  }

  button:hover {
    background: #2d4b3c;
  }

  .error {
    margin: 0.75rem 0 0;
    color: #9b3427;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85rem;
  }

  .app-shell {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 1rem;
  }

  .app-card {
    display: flex;
    align-items: center;
    gap: 2rem;
  }

  .app-card a {
    padding: 0.65rem 1rem;
    border: 1px solid #14231c;
    color: #14231c;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    text-decoration: none;
  }

  @media (max-width: 36rem) {
    .login-shell {
      padding: 1rem;
    }

    .login-card {
      padding: 2rem 1.5rem 2.5rem;
      box-shadow: 0.4rem 0.4rem 0 #d9a441;
    }

    .field-row {
      flex-direction: column;
    }

    button {
      width: 100%;
    }
  }
</style>
