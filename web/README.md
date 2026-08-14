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

## Cloudflare setup

The `llmfn.com` zone needs proxied DNS records for both `phones` and
`*.phones`. They can point to the originless placeholder `192.0.2.1`; Worker
routes intercept requests before that address is used.

Universal SSL does not cover the deeper `*.phones.llmfn.com` hostnames. The
zone therefore needs an Advanced Certificate that includes
`*.phones.llmfn.com` before deploying with `npm run deploy`.
