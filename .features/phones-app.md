---
status: in-progress
created: 2026-08-15
---

# Phones App (phones-app)

The edition-3 hosted phones app: a Cloudflare Worker serving every student
their own live instance at `<slug>-phones.llmfn.com`, with `phones.llmfn.com`
as the instance finder and each hostname owning its admin authentication.

## Design / Approach

Students work entirely in the browser — no local dev, no terminal. Each one
gets their own instance (their own prompts, schema, memory config, eval runs)
at a stable address.

Student hostnames are never provisioned. A wildcard DNS record and a wildcard
Worker route mean any first-level hostname ending in `-phones.llmfn.com`
reaches the Worker, so a student arrives without any DNS or deployment change.
This naming keeps instances within free Cloudflare Universal SSL coverage.

There is no database yet. Slugs are derived from the email, while short-lived
code challenges and sessions are signed rather than stored, so nothing needs
persisting until per-student app state arrives. Student instances are public;
authentication protects only their admin routes.

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
behaviour with real routing (apex → instance finder, subdomain → student app)
built on the same parsing.

**Acceptance Criteria:**

- [x] The SvelteKit page renders `Hello, {sitename}` from the requested host
- [x] Tests cover both an apex-shaped host and an arbitrary subdomain

### [DONE] login: find an instance and sign into its admin

The apex serves an instance finder asking for an email. On submit, the Worker
takes the slug from the email's local part, lowercased with anything invalid
in a hostname stripped, and redirects to the public student subdomain. It
sends no email and stores no authentication state.

The subdomain homepage is a Svelte page with a link to `/admin`. The
recommender remains public, while `/admin` requires a session and offers a
logout action. A signed-out visit continues to `/admin/login`.

The admin login derives its owner email from the current slug, displays the
masked address, and sends a six-digit verification code via Cloudflare Email
Service. For now the owner is `<slug>@gmail.com`; a later student mapping must
replace this temporary rule. The signed challenge is kept in a short-lived,
host-only cookie, so no database or one-time enforcement is required yet.

Entering a valid code mints a signed session cookie scoped to that host alone
— never to `.phones.llmfn.com` — and enters the admin. The code remains valid
for five minutes and may be retried during that window. Invalid, expired, or
wrong-host challenges are refused.

The apex always shows the instance finder and does not remember or redirect a
returning student.

In dev the Worker logs the verification code rather than sending it.
`local.pipal.in` stands in for the apex, with instances one label below it, so
hostnames and cookie scoping behave as they do in production. Known apex hosts
are a constant in the code, so dev and production both work unconfigured; any
other host is an instance, with the slug as its first label.

**Acceptance Criteria:**

- [x] Submitting an email on the apex redirects to the public student instance
- [x] The Svelte student homepage links to its protected admin
- [x] Admin login sends a code to the masked temporary Gmail owner
- [x] Invalid, expired, or wrong-host code challenges are refused
- [x] The session cookie is host-only and logout clears it
- [x] Every visit to the apex shows the instance finder

### [DONE] design: share the editorial design language

Use the warm terracotta design system from `DESIGN.md` and the Python app
across the hosted app. Self-host the same Alegreya and Fira Code fonts, keep
the design tokens and shared components in one global stylesheet, and avoid
shadows, gradients, and page-specific palettes.

The public student homepage uses the Python app's zero-state composition: a
centred Phones wordmark and phone search bar, with Admin available in the
top navigation. The search control is the visual shell only until the
recommender API is ported. The apex finder, admin login, admin page, and public
fallback pages use the same typography, colour, controls, and navigation.

**Acceptance Criteria:**

- [x] Apex and student pages share the terracotta tokens and self-hosted fonts
- [x] The student homepage matches the Python app's responsive search zero state
- [x] The student top navigation links to Admin
- [x] Svelte diagnostics, tests, and the production build pass

### [TODO] deploy: connect production domains and email

Once Cloudflare account and DNS access are available, onboard
`phones.llmfn.com` with Email Service, configure `login@phones.llmfn.com` as
the sender, set `AUTH_SECRET`, add proxied DNS records for `phones` and `*`,
and deploy the configured Worker routes. Do not make authenticated
Cloudflare requests without explicit permission.

**Acceptance Criteria:**

- [ ] The apex and an arbitrary student hostname work over HTTPS
- [ ] A verification code is delivered through Cloudflare Email Service

## Handover

The hostname routing and login tasks are complete in `web/`. The apex only
finds and redirects to public student instances. Their Svelte homepage links
to a session-protected admin, where a six-digit email code creates one signed,
host-only session. Admin logout clears that session. Local development logs
codes for the `local.pipal.in` hosts, while production uses the `EMAIL`
binding.

All hosted pages now use the shared editorial design system in `web/src/app.css`
with self-hosted fonts in `web/static/fonts/`. The student homepage mirrors
the Python app's centred zero state with a phone search bar and an Admin
link in the top navigation. The search bar is not connected to results yet;
that belongs with the future recommender API port.

The 30 tests cover slug derivation, instance discovery, temporary Gmail owner
mapping, code delivery and refusal, cookie scope, admin access and logout, and
public instance access. Unit tests, Svelte diagnostics, the production build,
a Wrangler dry run, and whitespace checks pass.

The `<slug>@gmail.com` owner rule is temporary. Replace it with the real
student mapping as soon as that mapping exists; admin authentication should
then send only to the mapped owner address. Code attempts and email sends are
not throttled yet; add limits before the admin controls private or destructive
functionality.

Live email delivery and production deployment remain deferred. Do not make
authenticated Cloudflare requests without explicit permission. Production
needs an `AUTH_SECRET`, Email Service onboarding for
`login@phones.llmfn.com`, and proxied DNS records for `phones` and `*` pointing
to the originless placeholder. Free Universal SSL covers both the apex and the
`<slug>-phones.llmfn.com` instance hostnames.

Wrangler is configured with routes for `phones.llmfn.com/*` and
`*-phones.llmfn.com/*`; `workers_dev` and version preview URLs are disabled.
After the remaining secret and email setup, deploy and verify both hostname
shapes over HTTPS.
