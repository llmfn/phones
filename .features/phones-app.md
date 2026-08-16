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
behaviour with real routing (apex → instance finder, hostname → student app)
built on the same parsing.

**Acceptance Criteria:**

- [x] The SvelteKit page renders `Hello, {sitename}` from the requested host
- [x] Tests cover both an apex-shaped host and an arbitrary subdomain

### [DONE] login: find an instance and sign into its admin

The apex serves an instance finder asking for an email. On submit, the Worker
takes the slug from the email's local part, lowercased with anything invalid
in a hostname stripped, and redirects to the public student hostname. It
sends no email and stores no authentication state.

The student homepage is a Svelte page with a link to `/admin`. The
recommender remains public, while `/admin` requires a session and offers a
logout action. A signed-out visit continues to `/admin/login`.

The admin login derives its owner email from the current slug, displays the
masked address, and sends a six-digit verification code via Cloudflare Email
Service. For now the owner is `<slug>@gmail.com`; a later student mapping must
replace this temporary rule. The signed challenge is kept in a short-lived,
host-only cookie, so no database or one-time enforcement is required yet.

Entering a valid code mints a signed session cookie scoped to that host alone
— never to a shared parent domain — and enters the admin. The code remains valid
for five minutes and may be retried during that window. Invalid, expired, or
wrong-host challenges are refused.

The apex always shows the instance finder and does not remember or redirect a
returning student.

In dev the Worker logs the verification code rather than sending it.
`local.pipal.in` stands in for the apex, with instances one label below it, so
hostname isolation and cookie scoping behave as they do in production. Known
apex hosts are a constant in the code, and production instance slugs are read
from the hostname's `-phones.llmfn.com` suffix.

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

### [DONE] deploy: connect production domains and email

Once Cloudflare account and DNS access are available, onboard
`phones.llmfn.com` with Email Service, configure `login@phones.llmfn.com` as
the sender, set `AUTH_SECRET`, add proxied DNS records for `phones` and `*`,
and deploy the configured Worker routes. Do not make authenticated
Cloudflare requests without explicit permission.

**Acceptance Criteria:**

- [x] The apex and an arbitrary student hostname work over HTTPS
- [x] A verification code is delivered through Cloudflare Email Service

## Handover

Production is live at `phones.llmfn.com`, with student instances at
`<slug>-phones.llmfn.com`. Proxied wildcard DNS, free Universal SSL, the Worker
routes, `AUTH_SECRET`, and the Cloudflare Email Service `EMAIL` binding are all
active. The apex and student hostnames return successfully over HTTPS, and
verification-code email delivery works in production.

The current student homepage is still the search zero state; its search control
is not connected to results. The temporary `<slug>@gmail.com` owner mapping
also remains until a real student mapping is available. Code attempts and email
sends are not throttled yet, so add limits before admin controls private or
destructive functionality.
