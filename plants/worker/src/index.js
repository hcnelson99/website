// Push server for the plants PWA at https://hcnelson.com/plants/
//
// The PWA mirrors its watering schedule here (POST /sync, authed with a
// shared token). A daily check runs which plants are due and sends a Web
// Push notification (RFC 8291 aes128gcm encryption + RFC 8292 VAPID).
//
// Scheduling uses a Durable Object alarm rather than a cron trigger: the
// cron scheduler silently never dispatched to this worker (a known
// platform issue — see e.g. community.cloudflare.com/t/935555), while DO
// alarms use a separate dispatch path with at-least-once delivery and
// retries. The singleton PlantScheduler DO re-arms itself after each
// firing, and every fetch re-arms it if the alarm was ever lost.
//
// Secrets (set with `wrangler secret put`, never committed):
//   SYNC_TOKEN        — shared secret the PWA sends in X-Sync-Token
//   VAPID_PUBLIC_KEY  — base64url raw P-256 public key (served to the client)
//   VAPID_PRIVATE_JWK — the matching private key as a JWK JSON string

import { DurableObject } from "cloudflare:workers";

export class PlantScheduler extends DurableObject {
  // Arms the alarm if none is set. Called on every fetch as a self-healing
  // bootstrap; setAlarm is only invoked when the alarm is actually missing.
  async ensureScheduled() {
    let at = await this.ctx.storage.getAlarm();
    if (at === null) {
      at = nextNotifyTime();
      await this.ctx.storage.setAlarm(at);
      console.log(JSON.stringify({ event: "alarm_armed", at: new Date(at).toISOString() }));
    }
    return at;
  }

  async alarm() {
    // Re-arm before sending so a throw in the send path can't kill the
    // schedule; if this handler throws, the runtime retries it anyway.
    const next = nextNotifyTime();
    await this.ctx.storage.setAlarm(next);
    await sendDueNotifications(this.env);
    console.log(JSON.stringify({ event: "alarm_done", next: new Date(next).toISOString() }));
  }
}

// Next 22:00 UTC = 6pm America/New_York during EDT (shifts to 5pm in winter).
function nextNotifyTime(now = Date.now()) {
  const d = new Date(now);
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 22, 0, 0);
  return today > now ? today : today + 24 * 3600 * 1000;
}

const ALLOWED_ORIGIN = "https://hcnelson.com";
const VAPID_SUB = "mailto:hcnelson99@gmail.com";
const STATE_KEY = "state";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Sync-Token",
};

export default {
  async fetch(request, env, ctx) {
    // Self-healing bootstrap: any traffic re-arms the alarm if it was lost.
    ctx.waitUntil(env.SCHEDULER.getByName("daily").ensureScheduled());

    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      if (url.pathname === "/vapid-public-key" && request.method === "GET") {
        return new Response(env.VAPID_PUBLIC_KEY, { headers: CORS_HEADERS });
      }

      if (url.pathname === "/sync" && request.method === "POST") {
        if (!(await tokenValid(request.headers.get("X-Sync-Token"), env.SYNC_TOKEN))) {
          return json({ error: "bad token" }, 401);
        }
        const body = await request.json();
        const plants = (Array.isArray(body.plants) ? body.plants : [])
          .slice(0, 200)
          .map((p) => ({
            name: String(p.name ?? "plant").slice(0, 100),
            intervalDays: Math.max(1, Math.min(365, Number(p.intervalDays) || 7)),
            lastWatered: String(p.lastWatered ?? "").slice(0, 10),
          }));

        const prev = await readState(env);
        const subscription = body.subscription?.endpoint ? body.subscription : prev?.subscription;
        await env.PLANTS_KV.put(STATE_KEY, JSON.stringify({ subscription, plants }));
        return json({ ok: true, plants: plants.length, hasSubscription: !!subscription });
      }

      // Sends a test push to the stored subscription, regardless of due plants.
      if (url.pathname === "/test" && request.method === "POST") {
        if (!(await tokenValid(request.headers.get("X-Sync-Token"), env.SYNC_TOKEN))) {
          return json({ error: "bad token" }, 401);
        }
        const state = await readState(env);
        if (!state?.subscription) {
          return json({ error: "no subscription synced yet — enable notifications first" }, 400);
        }
        const status = await sendWebPush(
          state.subscription,
          JSON.stringify({ title: "🪴 Test notification", body: "Push is working! 🎉", count: 1 }),
          env
        );
        return json({ ok: status >= 200 && status < 300, pushStatus: status });
      }

      return json({ error: "not found" }, 404);
    } catch (err) {
      console.log(JSON.stringify({ event: "fetch_error", message: err.message }));
      return json({ error: "internal error" }, 500);
    }
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function readState(env) {
  return env.PLANTS_KV.get(STATE_KEY, "json");
}

// Constant-time token check (compare SHA-256 digests so lengths match).
async function tokenValid(provided, expected) {
  if (!provided || !expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(provided)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

// ---- daily notification check (invoked by the PlantScheduler alarm) ----

async function sendDueNotifications(env) {
  const state = await readState(env);
  if (!state?.subscription) {
    console.log(JSON.stringify({ event: "cron_skip", reason: "no subscription" }));
    return;
  }

  const today = todayInNewYork();
  const due = (state.plants ?? []).filter(
    (p) => daysBetween(p.lastWatered, today) >= p.intervalDays
  );
  if (due.length === 0) {
    console.log(JSON.stringify({ event: "cron_done", due: 0 }));
    return;
  }

  const names = due.map((p) => p.name);
  const listed = names.length <= 3 ? formatList(names) : `${names.length} plants`;
  const payload = JSON.stringify({
    title: "🪴 Plant watering time!",
    body: `Time to water ${listed} 💧`,
    count: due.length,
  });

  const status = await sendWebPush(state.subscription, payload, env);
  console.log(JSON.stringify({ event: "cron_done", due: due.length, pushStatus: status }));

  // 404/410 means the subscription is dead — drop it so we stop trying.
  if (status === 404 || status === 410) {
    await env.PLANTS_KV.put(STATE_KEY, JSON.stringify({ ...state, subscription: undefined }));
  }
}

function formatList(names) {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function todayInNewYork() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

function daysBetween(a, b) {
  const pa = a?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const pb = b?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!pa || !pb) return Infinity; // malformed date → treat as long overdue
  return Math.round((Date.UTC(pb[1], pb[2] - 1, pb[3]) - Date.UTC(pa[1], pa[2] - 1, pa[3])) / 86400000);
}

// ---- Web Push: RFC 8291 (aes128gcm) encryption + RFC 8292 (VAPID) auth ----

function b64urlDecode(s) {
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(padded.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
}

function b64urlEncode(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

async function hkdf(salt, ikm, info, bits) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bits)
  );
}

async function encryptPayload(payload, p256dhB64, authB64) {
  const uaPublicRaw = b64urlDecode(p256dhB64); // 65-byte uncompressed point
  const authSecret = b64urlDecode(authB64); // 16 bytes

  const asKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));

  const uaPublicKey = await crypto.subtle.importKey(
    "raw", uaPublicRaw, { name: "ECDH", namedCurve: "P-256" }, false, []
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublicKey }, asKeys.privateKey, 256)
  );

  const enc = new TextEncoder();
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublicRaw, asPublicRaw);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 256);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 128);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 96);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // Last (only) record: plaintext + 0x02 delimiter octet.
  const plaintext = concat(enc.encode(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext)
  );

  // aes128gcm header: salt(16) | record size(4) | key id length(1) | as_public(65)
  const header = concat(
    salt,
    new Uint8Array([0, 0, 16, 0]), // rs = 4096
    new Uint8Array([asPublicRaw.length]),
    asPublicRaw
  );
  return concat(header, ciphertext);
}

async function vapidHeaders(endpoint, env) {
  const { origin } = new URL(endpoint);
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const key = await crypto.subtle.importKey(
    "jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  );

  const enc = new TextEncoder();
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64urlEncode(enc.encode(JSON.stringify({
    aud: origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: VAPID_SUB,
  })));
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`)
  );
  const jwt = `${header}.${claims}.${b64urlEncode(signature)}`;
  return { Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}` };
}

async function sendWebPush(subscription, payload, env) {
  const body = await encryptPayload(payload, subscription.keys.p256dh, subscription.keys.auth);
  const auth = await vapidHeaders(subscription.endpoint, env);
  const resp = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      ...auth,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "normal",
    },
    body,
  });
  if (!resp.ok) {
    console.log(JSON.stringify({ event: "push_error", status: resp.status, body: await resp.text() }));
  }
  return resp.status;
}
