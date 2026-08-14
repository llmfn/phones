# Phones Web

The hosted phones app is a SvelteKit application deployed as a Cloudflare
Worker.

```sh
npm install
npm run dev
```

Run the local checks with:

```sh
npm test
npm run check
npm run build
npx wrangler deploy --dry-run
```

Local development uses `local.pipal.in` as the apex and logs verification
codes to the terminal. Open `http://local.pipal.in:5173` after starting Vite;
student instances use `<slug>.local.pipal.in:5173`. Production instances use
`<slug>-phones.llmfn.com` so Cloudflare Universal SSL covers them.

## Cloudflare setup

The `llmfn.com` zone needs proxied DNS records for both `phones` and `*`. They
can point to the originless placeholder `192.0.2.1`; the Worker routes intercept
`phones.llmfn.com` and `*-phones.llmfn.com` requests before that address is
used. Existing explicit DNS records take precedence over the wildcard.

Before deployment, onboard `phones.llmfn.com` with Cloudflare Email Service,
verify `login@phones.llmfn.com` as a sender, and set the signing secret:

```sh
npx wrangler secret put AUTH_SECRET
```
