<script lang="ts">
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
  <title>{data.page === 'apex' ? 'Find your Phones app' : data.sitename}</title>
</svelte:head>

{#if data.page === 'apex'}
  <div class="apex-page">
    <header class="site-nav">
      <a class="wordmark" href="/">Phones</a>
      <span class="eyebrow">LLMFN</span>
    </header>
    <main class="apex-main">
      <section class="editorial-panel">
        <p class="eyebrow">Your course workspace</p>
        <h1>Find your phone lab.</h1>
        <p class="intro">
          Enter your course email to open your personal recommender and continue your work.
        </p>

        <form class="finder-form" method="POST">
          <label class="field-label" for="email">Email address</label>
          <div class="field-row">
            <input
              class="form-input"
              id="email"
              name="email"
              type="email"
              autocomplete="email"
              placeholder="you@example.com"
              value={form && 'email' in form ? form.email : ''}
              required
            />
            <button class="button" type="submit">Open app</button>
          </div>
          {#if form?.error}<p class="error">{form.error}</p>{/if}
        </form>
      </section>
    </main>
  </div>
{:else}
  <main class="student-home">
    <header class="student-topbar">
      <a class="wordmark" href="/">Phones</a>
      <form class="search" role="search" onsubmit={(event) => event.preventDefault()}>
        <svg
          class="search-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7"></circle>
          <path d="m20 20-3.8-3.8"></path>
        </svg>
        <input
          class="search-input"
          type="search"
          placeholder="Find a phone - describe what you need"
          autocomplete="off"
          aria-label="Search phones"
        />
      </form>
      <nav class="tool-links" aria-label="Student tools">
        <a class="nav-link" href="/admin">Admin</a>
      </nav>
    </header>
  </main>
{/if}
