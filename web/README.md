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

## Production

The app is live at `https://phones.llmfn.com`; student instances use
`https://<slug>-phones.llmfn.com`.

The `llmfn.com` zone needs proxied DNS records for both `phones` and `*`. They
can point to the originless placeholder `192.0.2.1`; the Worker routes intercept
`phones.llmfn.com` and `*-phones.llmfn.com` requests before that address is
used. Existing explicit DNS records take precedence over the wildcard.

Production email is sent from `login@phones.llmfn.com` through the `EMAIL`
binding. The `phones.llmfn.com` sending domain must remain onboarded in
Cloudflare Email Service. Set the authentication signing secret with:

```sh
npx wrangler secret put AUTH_SECRET
```

Semantic search embeds queries with OpenAI. Set its shared credential with:

```sh
npx wrangler secret put OPENAI_API_KEY
```

Deploy from this directory with:

```sh
npm run deploy
```
