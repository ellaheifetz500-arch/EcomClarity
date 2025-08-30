# Warehouse Shipping Calculator — LIVE (Netlify Functions + Shippo)

This build supports **live carrier quotes** via Shippo and optional **label purchase**.

## What you need
- A Netlify site deployed **from GitHub** (or using Netlify CLI `deploy --build`).
- Shippo API token set in Netlify env: `SHIPPO_API_TOKEN`.

## Files
- `index.html` — UI (neutral style, light/dark toggle). Calls:
  - `/.netlify/functions/quote` — live quotes (Shippo) or demo fallback.
  - `/.netlify/functions/buy_label` — purchase label in live (or demo label fallback).
- `data/warehouses.json` — warehouse profiles.
- `netlify/functions/quote.js` — live (Shippo) / demo logic; returns `rate_id` in live.
- `netlify/functions/buy_label.js` — uses `rate_id` to buy label via Shippo Transactions.
- `netlify/functions/ping.js` — healthcheck.
- `netlify.toml` — ensures functions are detected.

## Deploy (GitHub — recommended)
1) Create a GitHub repo and add these files.
2) Netlify → **Add new site** → **Import from Git** → connect the repo.
3) Netlify → **Site settings → Environment variables**: add `SHIPPO_API_TOKEN`.
4) Deploy. Open `/.netlify/functions/ping` and you should see `pong`.
5) Use the app. Header will show **Live via Shippo** if the token is detected.

## Deploy (CLI)
```bash
npm i -g netlify-cli
netlify login
netlify init   # pick/create a site
netlify deploy --build --prod
```

## Notes
- In LIVE mode, we map Shippo rates to app schema and include `rate_id`.
- In LIVE label purchase, we POST to `https://api.goshippo.com/transactions/`.
- In DEMO (no token), quotes are heuristic and label purchase returns a demo PNG.
