---
status: draft
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
route mean any hostname under `phones.llmfn.com` reaches the Worker, so adding
a student is a database row, never a DNS or deployment change.

The Worker lives in `web/` and becomes the app for this repo; the existing
Python app may be ported to TS/JS + Svelte.

## Tasks

### [TODO] routing: serve any hostname under phones.llmfn.com

Stand up a new Cloudflare Workers project in `web/` and route both
`phones.llmfn.com` and `*.phones.llmfn.com` to it. The Worker reads the
requested host and renders a plain `Hello, {sitename}` page, where
`{sitename}` is that host verbatim — no login, no database, no app logic.

Keep the host parsing in one small function; later tasks replace the echo
behaviour with real routing (apex → login, subdomain → student app) built on
the same parsing.

**Acceptance Criteria:**

- [ ] `https://phones.llmfn.com` returns `Hello, phones.llmfn.com`
- [ ] An arbitrary unregistered subdomain returns its own hostname
- [ ] Both are served over HTTPS with no certificate warning
