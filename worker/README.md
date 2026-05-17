# Swale API — Cloudflare Worker

Bridges Ecowitt cloud (WH51 soil sensors) → the Swale Intelligence PWA.
Rainbird is Phase 2 (needs an on-prem bridge).

## One-time deploy

```bash
cd worker
npm install
npx wrangler login   # opens browser, sign into your Cloudflare account
```

Get Ecowitt API credentials at https://api.ecowitt.net/ (sign in with the same
account you used in the Ecowitt mobile app, then Application Key + API Key).
Find the GW1200 MAC in the Ecowitt app under Devices.

```bash
npx wrangler secret put ECOWITT_APP_KEY    # paste Application Key
npx wrangler secret put ECOWITT_API_KEY    # paste API Key
npx wrangler secret put ECOWITT_MAC        # paste MAC, format AB:CD:EF:12:34:56

npx wrangler deploy
```

Wrangler prints the deployed URL, e.g.
`https://swale-api.<your-cf-account>.workers.dev`.

Then in `swale-app.html` set `API_BASE` near the top of the script block to
that URL and commit.

## Endpoints

- `GET /sensors` — live WH51 moisture per channel, normalized to app zones
- `GET /rainbird/status` — Rainbird state (empty until Phase 2 bridge runs)
- `POST /rainbird/push` — auth'd endpoint for the on-prem Rainbird bridge

## Phase 2 (Rainbird live state)

```bash
npx wrangler kv namespace create SWALE_KV
# uncomment kv_namespaces in wrangler.toml, paste the returned id
npx wrangler secret put BRIDGE_TOKEN    # random string; share with the bridge
npx wrangler deploy
```

The on-prem bridge (a small Python service running on a Pi or your Mac via
launchctl) polls Rainbird LNK locally via pyrainbird every 60s and POSTs to
`/rainbird/push` with `Authorization: Bearer $BRIDGE_TOKEN`. We'll write that
when you're ready.

## Local test

```bash
npx wrangler dev   # serves on http://localhost:8787
curl http://localhost:8787/sensors
```

Set local secrets in `.dev.vars`:
```
ECOWITT_APP_KEY=...
ECOWITT_API_KEY=...
ECOWITT_MAC=...
```
