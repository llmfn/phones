---
status: in-progress
created: 2026-08-15
---

# Phones App (phones-app)

The edition-3 hosted phones app: a Cloudflare Worker serving every student
their own live instance at `<slug>.phones.llmfn.com`, with `phones.llmfn.com`
as the single entry point that logs them in and routes them there.

## Design / Approach

Students work entirely in the browser — no local dev, no terminal. Each one
gets their own instance (their own prompts, schema, memory config, eval runs)
at a stable address.

Subdomains are never provisioned. A wildcard DNS record and a wildcard Worker
route mean any hostname under `phones.llmfn.com` reaches the Worker, so a
student arrives without any DNS or deployment change.

There is no database yet. Slugs are derived from the email and both tokens and
sessions are signed rather than stored, so nothing needs persisting until
per-student app state arrives.

The Worker lives in `web/` and becomes the app for this repo. It uses SvelteKit
with TypeScript and the Cloudflare adapter; the existing Python app may be
ported into it over time.

## Tasks

### [DONE] routing: prepare the hostname-aware Worker

Stand up a new Cloudflare Workers project in `web/`, initially available on its
`workers.dev` hostname while custom DNS access is unavailable. The Worker reads
the requested host and renders a plain `Hello, {sitename}` page, where
`{sitename}` is that host verbatim — no login, no database, no app logic.

Keep the host parsing in one small function; later tasks replace the echo
behaviour with real routing (apex → login, subdomain → student app) built on
the same parsing.

**Acceptance Criteria:**

- [x] The SvelteKit page renders `Hello, {sitename}` from the requested host
- [x] Tests cover both an apex-shaped host and an arbitrary subdomain

## Handover

The first task is complete. The SvelteKit and TypeScript skeleton is in `web/`.
Unit tests, Svelte diagnostics, the production build, and a Wrangler dry run
pass.

Custom-domain deployment remains deferred. Do not make authenticated Cloudflare
requests without explicit permission. A deployment attempt was rejected during
compatibility-date validation after its asset upload; no Worker script or
routes were published. The compatibility date is now corrected. DNS records
for `phones` and `*.phones` and wildcard certificate coverage still need to be
configured before the custom domains can go live.

Until DNS access is available, Wrangler is configured to deploy to the stable
`llmfn-phones.<account-subdomain>.workers.dev` hostname with version preview
URLs enabled. The custom routes are intentionally absent from
`web/wrangler.jsonc` so this deployment does not depend on DNS. Once DNS and
certificate coverage are ready, restore routes for `phones.llmfn.com/*` and
`*.phones.llmfn.com/*`, then disable `workers_dev` and `preview_urls` if the
Cloudflare-provided URLs should no longer be public.
