// Generate a VAPID keypair for Web Push. Run once: node genkeys.mjs
// Prints the two values to feed to `wrangler secret put`.
// Nothing is written to disk — do NOT commit the output.

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));

const b64url = (bytes) =>
  Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

console.log("VAPID_PUBLIC_KEY (also fine to share publicly):\n");
console.log(`  ${b64url(publicRaw)}\n`);
console.log("VAPID_PRIVATE_JWK (secret! paste into `wrangler secret put VAPID_PRIVATE_JWK`):\n");
console.log(`  ${JSON.stringify(privateJwk)}\n`);
console.log("Suggested SYNC_TOKEN (secret! or make up your own):\n");
console.log(`  ${b64url(crypto.getRandomValues(new Uint8Array(24)))}`);
