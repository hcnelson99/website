# plants-push worker

Sends the daily "water your plants" push notification for the PWA at
https://hcnelson.com/plants/. The PWA mirrors its schedule here via
`POST /sync`; a cron at 22:00 UTC (6pm ET during daylight saving) checks
what's due and sends a Web Push.

This code is public; all credentials are Worker secrets (never committed).

## One-time deploy

```sh
cd plants/worker
npx wrangler login

# 1. Create the KV namespace, then paste the printed id into wrangler.jsonc
npx wrangler kv namespace create PLANTS_KV

# 2. Generate VAPID keys + a sync token (prints values, writes nothing)
node genkeys.mjs

# 3. Store them as secrets (each command prompts for the value)
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_JWK
npx wrangler secret put SYNC_TOKEN

# 4. Deploy
npx wrangler deploy
```

Then wire up the PWA:

1. Put the deployed worker URL into `WORKER_URL` at the top of `../app.js`
   and push the site.
2. On your iPhone: open hcnelson.com/plants in Safari → Share →
   Add to Home Screen → open it from the home screen.
3. In the app: ⚙️ Settings → paste the SYNC_TOKEN → Save, then
   "Enable notifications".

## Testing the push without waiting for 6pm

```sh
npx wrangler dev --test-scheduled   # then: curl "http://localhost:8787/__scheduled"
```

or trigger the deployed cron once from the Cloudflare dashboard
(Workers → plants-push → Trigger Events), and check Live Logs.

## Notes

- The sync token is the only auth on `/sync`. Worst case if leaked:
  someone can overwrite your watering schedule. Rotate it with
  `wrangler secret put SYNC_TOKEN` (then update it in the app's settings).
- If the push endpoint returns 404/410 (subscription expired), the worker
  drops it; reopening the app re-syncs a fresh subscription automatically.
- Cron is fixed UTC, so the notification shifts 6pm ↔ 5pm with DST.
