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

### [TODO] login: sign in with a magic link

The apex serves a login screen asking for an email. On submit, the Worker
takes the slug from the email's local part, lowercased with anything invalid
in a hostname stripped, signs a short-lived token carrying it, and sends a
link to `<slug>.phones.llmfn.com/login/verify?token=...` via Cloudflare
Email Service.

Every path on the subdomain serves the recommender publicly — anyone with the
URL can use that student's instance. Only `/login/verify` requires a session,
and what the session unlocks beyond it is later work.

`/login/verify` accepts either a token or an existing session. A token is
valid only if its signature holds, it hasn't expired, and its slug matches the
host it arrived on. A valid one mints a session cookie scoped to that host
alone — never to `.phones.llmfn.com` — and a pointer cookie on the apex
holding just the slug, which carries no authority beyond routing. With neither
a valid session nor a valid token, it redirects to the apex, which clears the
pointer and shows the login screen again.

Tokens are signed rather than stored: valid for a few minutes, and reusable
within that window so mail scanners that follow the link don't consume it.

In dev the Worker logs the magic link rather than sending it. `local.pipal.in`
stands in for the apex, with instances one label below it, so hostnames and
cookie scoping behave as they do in production. Known apex hosts are a constant
in the code, so dev and production both work unconfigured; any other host is an
instance, with the slug as its first label.

**Acceptance Criteria:**

- [ ] Submitting an email delivers a link to that student's subdomain
- [ ] A fresh link reaches the app, and following it twice still works
- [ ] An expired, altered, or wrong-host token is refused
- [ ] The session cookie is not sent to another subdomain
- [ ] A return visit to the apex reaches the app with no login screen
- [ ] A subdomain visit with no session serves the recommender
- [ ] A stale pointer cookie ends at the login screen with the pointer cleared

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
