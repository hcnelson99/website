# plants-push worker

Sends the daily "water your plants" push notification for the PWA at
https://hcnelson.com/plants/. Each user's PWA mirrors its schedule here via
`POST /sync`, identified by that user's sync token; a daily alarm at 22:00
UTC (6pm ET during daylight saving) checks what's due per user and sends a
Web Push.

This code is public; all credentials are Worker secrets (never committed).

## One-time deploy

```sh
cd plants/worker
npx wrangler login

# 1. Create the KV namespace, then paste the printed id into wrangler.jsonc
npx wrangler kv namespace create PLANTS_KV

# 2. Generate VAPID keys (prints values, writes nothing)
node genkeys.mjs

# 3. Store them as secrets (each command prompts for the value)
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_JWK

# 4. Create yourself as a user (prints your sync token)
node users.mjs add henry

# 5. Deploy
npx wrangler deploy
```

Then wire up the PWA:

1. Put the deployed worker URL into `WORKER_URL` at the top of `../app.js`
   and push the site.
2. On your iPhone: open hcnelson.com/plants in Safari → Share →
   Add to Home Screen → open it from the home screen.
3. In the app: ⚙️ Settings → paste your sync token → Save, then
   "Enable notifications".

## Users

Users live in KV under the key `users` (`{"name": "token", ...}`); each
user's subscription + plants are mirrored under `state:<name>`. Plants
themselves (and photos) live only in each phone's localStorage.

```sh
node users.mjs list                 # every user and their token
node users.mjs add <name> [token]   # new user; random token if omitted
node users.mjs remove <name>        # delete user + their synced state
```

To onboard someone: `node users.mjs add <name>`, then send them the app URL
and the printed token to paste into ⚙️ Settings. No redeploy needed. Everyone
is notified at the same time (see Notes).

### Migrating from the single-user SYNC_TOKEN version (one-time)

Keeps your existing token (no change on the phone) and synced state:

```sh
node users.mjs add henry <your-existing-SYNC_TOKEN>   # it's in the app's ⚙️ Settings
npx wrangler kv key get state --binding PLANTS_KV --remote > /tmp/state.json
npx wrangler kv key put state:henry --path /tmp/state.json --binding PLANTS_KV --remote
npx wrangler deploy
# once confirmed working:
npx wrangler kv key delete state --binding PLANTS_KV --remote
npx wrangler secret delete SYNC_TOKEN
```

Even if this goes wrong, opening the app re-syncs plants + subscription.

## Testing the push without waiting for 6pm

In the app: ⚙️ Settings → "Send test notification". This hits `POST /test`,
which pushes through the real pipeline immediately (ignoring due dates).
Same thing from a terminal:

```sh
curl -X POST -H "X-Sync-Token: $YOUR_TOKEN" https://plants-push.hcnelson-plants.workers.dev/test
```

To test the real due-date logic end to end, edit a plant's "last watered"
date to be more than its interval ago and wait for the 6pm cron; watch
Live Logs in the dashboard (Workers → plants-push → Logs) for the
`cron_done` entry.

## Notes

- A user's sync token is the only auth on `/sync`. Worst case if leaked:
  someone can overwrite that user's watering schedule. Rotate it with
  `node users.mjs remove <name> && node users.mjs add <name>` (then update
  it in the app's settings; the app re-syncs its plants on save).
- If the push endpoint returns 404/410 (subscription expired), the worker
  drops it; reopening the app re-syncs a fresh subscription automatically.
- Cron is fixed UTC, so the notification shifts 6pm ↔ 5pm with DST.
