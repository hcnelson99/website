// Manage plants-push users (stored in KV under "users" as {"name": "token"}).
//
//   node users.mjs list                 — print every user and their token
//   node users.mjs add <name> [token]   — add a user (random token if omitted)
//   node users.mjs remove <name>        — remove a user and their synced state
//
// Shells out to wrangler, so run `npx wrangler login` first. Tokens are
// secrets — don't commit or paste the output anywhere public.

import { execFileSync } from "node:child_process";

const cwd = new URL(".", import.meta.url).pathname;

function wrangler(...args) {
  try {
    return execFileSync("npx", ["wrangler", "kv", "key", ...args, "--binding", "PLANTS_KV", "--remote"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    if (args[0] === "get" && /not found/i.test(err.stderr ?? "")) return "";
    process.stderr.write(err.stderr ?? "");
    throw new Error(`wrangler kv key ${args[0]} failed`);
  }
}

function readUsers() {
  const out = wrangler("get", "users").trim();
  // A missing key prints "Value not found" (or nothing) rather than JSON.
  if (!out.startsWith("{")) return {};
  return JSON.parse(out);
}

function writeUsers(users) {
  wrangler("put", "users", JSON.stringify(users));
}

const [cmd, name, token] = process.argv.slice(2);

if (cmd === "list") {
  const users = readUsers();
  if (Object.keys(users).length === 0) console.log("(no users)");
  for (const [n, t] of Object.entries(users)) console.log(`${n}\t${t}`);
} else if (cmd === "add" && name) {
  if (!/^[a-z0-9_-]+$/.test(name)) throw new Error("name must be lowercase letters, digits, - or _");
  const users = readUsers();
  if (users[name]) throw new Error(`user "${name}" already exists`);
  users[name] = token ?? Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
  writeUsers(users);
  console.log(`Added ${name}. Their sync token (paste into the app's ⚙️ Settings):\n\n  ${users[name]}`);
} else if (cmd === "remove" && name) {
  const users = readUsers();
  if (!users[name]) throw new Error(`no user "${name}"`);
  delete users[name];
  writeUsers(users);
  wrangler("delete", `state:${name}`);
  console.log(`Removed ${name}.`);
} else {
  console.log("usage: node users.mjs list | add <name> [token] | remove <name>");
  process.exit(1);
}
