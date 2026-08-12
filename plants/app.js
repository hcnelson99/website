// Plant watering tracker PWA.
// All plant data (including photos) lives in localStorage on this device.
// The Cloudflare Worker only mirrors names + schedule so it can send push.

const WORKER_URL = "https://plants-push.hcnelson-plants.workers.dev";

const STORAGE_KEY = "plants-v1";

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? { plants: [], token: "" };
  } catch {
    return { plants: [], token: "" };
  }
}

let state = loadState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---- dates ----

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// YYYY-MM-DD plus n days (n may be negative), DST-safe via UTC.
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

// Days between two YYYY-MM-DD strings, DST-safe via UTC.
function daysBetween(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

function daysUntilDue(plant) {
  return plant.intervalDays - daysBetween(plant.lastWatered, todayStr());
}

function dueText(plant) {
  const d = daysUntilDue(plant);
  if (d < 0) return `overdue by ${-d} day${-d === 1 ? "" : "s"}!`;
  if (d === 0) return "water today!";
  if (d === 1) return "water tomorrow";
  return `water in ${d} days`;
}

// ---- rendering ----

const listEl = document.getElementById("plant-list");
const emptyMsg = document.getElementById("empty-msg");

function render() {
  listEl.innerHTML = "";
  emptyMsg.hidden = state.plants.length > 0;
  const sorted = [...state.plants].sort((a, b) => daysUntilDue(a) - daysUntilDue(b));
  for (const plant of sorted) {
    const li = document.createElement("li");
    li.className = "plant-card" + (daysUntilDue(plant) <= 0 ? " due" : "");

    const photo = plant.photo
      ? Object.assign(document.createElement("img"), { src: plant.photo, alt: plant.name })
      : Object.assign(document.createElement("div"), { textContent: "🌱" });
    photo.className = "plant-photo";
    photo.addEventListener("click", () => openPlantDialog(plant.id));

    const info = document.createElement("div");
    info.className = "plant-info";
    const name = document.createElement("div");
    name.className = "plant-name";
    name.textContent = plant.name;
    const due = document.createElement("div");
    due.className = "plant-due";
    due.textContent = dueText(plant);
    info.append(name, due);

    const waterBtn = document.createElement("button");
    waterBtn.className = "water-btn";
    waterBtn.textContent = "💧";
    waterBtn.title = "Mark watered";
    waterBtn.addEventListener("click", () => {
      plant.lastWatered = todayStr();
      saveState();
      render();
      syncToWorker();
    });

    if (daysUntilDue(plant) <= 0) {
      const snoozeBtn = document.createElement("button");
      snoozeBtn.className = "snooze-btn";
      snoozeBtn.textContent = "💤";
      snoozeBtn.title = "Soil still damp — snooze 2 days";
      snoozeBtn.addEventListener("click", () => {
        // Snooze = make the plant come due 2 days from now, expressed as a
        // fictional lastWatered (clamped so it never lands in the future).
        plant.lastWatered = addDays(todayStr(), Math.min(0, 2 - plant.intervalDays));
        saveState();
        render();
        syncToWorker();
      });
      li.append(photo, info, snoozeBtn, waterBtn);
    } else {
      li.append(photo, info, waterBtn);
    }
    listEl.append(li);
  }
  updateBadge();
}

function updateBadge() {
  if (!("setAppBadge" in navigator)) return;
  const due = state.plants.filter((p) => daysUntilDue(p) <= 0).length;
  (due > 0 ? navigator.setAppBadge(due) : navigator.clearAppBadge()).catch(() => {});
}

// ---- add / edit dialog ----

const plantDialog = document.getElementById("plant-dialog");
const plantForm = document.getElementById("plant-form");
const nameInput = document.getElementById("name-input");
const intervalInput = document.getElementById("interval-input");
const lastWateredInput = document.getElementById("last-watered-input");
const photoInput = document.getElementById("photo-input");
const photoPreview = document.getElementById("photo-preview");
const photoPlaceholder = document.getElementById("photo-placeholder");
const deleteBtn = document.getElementById("delete-btn");

let editingId = null;
let pendingPhoto = null;

function openPlantDialog(id = null) {
  editingId = id;
  const plant = state.plants.find((p) => p.id === id);
  document.getElementById("dialog-title").textContent = plant ? plant.name : "New plant";
  nameInput.value = plant?.name ?? "";
  intervalInput.value = plant?.intervalDays ?? 7;
  lastWateredInput.value = plant?.lastWatered ?? todayStr();
  pendingPhoto = plant?.photo ?? null;
  photoPreview.src = pendingPhoto ?? "";
  photoPreview.hidden = !pendingPhoto;
  photoPlaceholder.hidden = !!pendingPhoto;
  deleteBtn.hidden = !plant;
  plantDialog.showModal();
}

document.getElementById("add-btn").addEventListener("click", () => openPlantDialog());
document.getElementById("cancel-btn").addEventListener("click", () => plantDialog.close());

deleteBtn.addEventListener("click", () => {
  if (!confirm("Delete this plant?")) return;
  state.plants = state.plants.filter((p) => p.id !== editingId);
  saveState();
  render();
  syncToWorker();
  plantDialog.close();
});

photoInput.addEventListener("change", async () => {
  const file = photoInput.files[0];
  if (!file) return;
  pendingPhoto = await resizeToCircleIcon(file);
  photoPreview.src = pendingPhoto;
  photoPreview.hidden = false;
  photoPlaceholder.hidden = true;
});

// Downscale + center-crop to a small square JPEG so localStorage stays tiny.
async function resizeToCircleIcon(file, size = 256) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const side = Math.min(bitmap.width, bitmap.height);
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
    0, 0, size, size
  );
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

plantForm.addEventListener("submit", () => {
  const data = {
    name: nameInput.value.trim(),
    intervalDays: Math.max(1, parseInt(intervalInput.value, 10) || 7),
    lastWatered: lastWateredInput.value || todayStr(),
    photo: pendingPhoto,
  };
  if (editingId) {
    Object.assign(state.plants.find((p) => p.id === editingId), data);
  } else {
    state.plants.push({ id: crypto.randomUUID(), ...data });
  }
  saveState();
  render();
  syncToWorker();
});

// ---- settings / notifications ----

const settingsDialog = document.getElementById("settings-dialog");
const tokenInput = document.getElementById("token-input");
const notifStatus = document.getElementById("notif-status");
const syncStatus = document.getElementById("sync-status");

document.getElementById("settings-btn").addEventListener("click", () => {
  tokenInput.value = state.token;
  refreshNotifStatus();
  syncStatus.textContent = "";
  settingsDialog.showModal();
});
document.getElementById("settings-close-btn").addEventListener("click", () => settingsDialog.close());

document.getElementById("settings-form").addEventListener("submit", () => {
  state.token = tokenInput.value.trim();
  saveState();
  syncToWorker();
});

function refreshNotifStatus() {
  if (!("Notification" in window) || !("PushManager" in window)) {
    notifStatus.textContent =
      "Push not available. On iOS, add this app to your home screen first (Share → Add to Home Screen), then open it from there.";
    return;
  }
  notifStatus.textContent = { granted: "Notifications are enabled ✅", denied: "Notifications are blocked in system settings." }[Notification.permission]
    ?? "Notifications are not enabled yet.";
}

document.getElementById("enable-notifs-btn").addEventListener("click", async () => {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") { refreshNotifStatus(); return; }
    await subscribeToPush();
    refreshNotifStatus();
    syncStatus.textContent = "Subscribed and synced ✅";
  } catch (err) {
    syncStatus.textContent = `Failed: ${err.message}`;
  }
});

document.getElementById("test-push-btn").addEventListener("click", async () => {
  if (!state.token) { syncStatus.textContent = "Save your sync token first."; return; }
  syncStatus.textContent = "Sending…";
  try {
    const resp = await fetch(`${WORKER_URL}/test`, {
      method: "POST",
      headers: { "X-Sync-Token": state.token },
    });
    const result = await resp.json();
    syncStatus.textContent = result.ok
      ? "Test push sent (status " + result.pushStatus + ") — lock your phone and it should arrive in a few seconds 📬"
      : `Push failed: ${result.error ?? "status " + result.pushStatus}`;
  } catch (err) {
    syncStatus.textContent = `Failed: ${err.message}`;
  }
});

function urlBase64ToUint8Array(base64) {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function subscribeToPush() {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const resp = await fetch(`${WORKER_URL}/vapid-public-key`);
    if (!resp.ok) throw new Error("couldn't reach worker for VAPID key");
    const publicKey = (await resp.text()).trim();
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  await syncToWorker(sub);
  return sub;
}

// ---- sync schedule (not photos) to the worker ----

async function syncToWorker(subscription = null) {
  if (!state.token) return; // not configured yet
  try {
    if (!subscription && "serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      subscription = await reg.pushManager.getSubscription();
    }
  } catch { /* push unsupported outside installed PWA */ }

  const body = {
    subscription: subscription ? subscription.toJSON() : undefined,
    plants: state.plants.map(({ name, intervalDays, lastWatered }) => ({ name, intervalDays, lastWatered })),
  };
  try {
    const resp = await fetch(`${WORKER_URL}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sync-Token": state.token },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`sync failed: ${resp.status}`);
    syncStatus.textContent = "Synced ✅";
  } catch (err) {
    syncStatus.textContent = `Sync failed: ${err.message}`;
  }
}

// ---- boot ----

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {});
}

render();
// Keep the worker's mirror fresh (e.g. after reinstall or subscription rotation).
syncToWorker();
