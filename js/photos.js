// ======================================================================
// Photos (redesign Phase 6, Version 30). Plain script, loaded after js/sync.js and before app.js.
//
// A recipe has at most one photo. The recipe only holds a small note about it:
//     recipe.photo = { id, w, h }          (left out when there is no photo)
// The picture itself is a shrunk JPEG kept in two places:
//   - on the phone, in IndexedDB (a roomy storage area; recipes stay in the small one), and
//   - in the cloud, in the private Supabase Storage bucket "recipe-photos" (see supabase/schema.sql).
// A photo is never changed once saved: a new picture gets a new id. So syncing the little note
// (recipe.photo) with the normal recipe sync is enough, and the pictures follow it.
//
// This file also works in Node (node tests/photos.test.js) for the parts that don't need a browser.
// ======================================================================

const PHOTO_MAX_SIDE = 1600;        // longest side in pixels after shrinking
const PHOTO_QUALITY = 0.82;         // JPEG quality
const PHOTO_DB_NAME = "cookbook-photos";
const PHOTO_STORE = "photos";
const PHOTO_STATE_KEY = "cookbook.photos";    // never rename: { uploaded: { id: true } }

// ---------- Shrinking a picture ----------

function loadPictureFile(file) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = function () { resolve({ image: image, url: url }); };
    image.onerror = function () { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
    image.src = url;
  });
}

// Shrink a picked photo. Resolves { blob, w, h }. The image element turns a sideways iPhone photo upright.
async function shrinkPhoto(file) {
  const loaded = await loadPictureFile(file);
  try {
    const image = loaded.image;
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) { throw new Error("empty"); }
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";          // see-through pictures get a white background
    context.fillRect(0, 0, w, h);
    context.drawImage(image, 0, 0, w, h);
    const blob = await new Promise(function (resolve) { canvas.toBlob(resolve, "image/jpeg", PHOTO_QUALITY); });
    if (!blob) { throw new Error("couldn't shrink"); }
    return { blob: blob, w: w, h: h };
  } finally {
    URL.revokeObjectURL(loaded.url);
  }
}

// ---------- The phone's photo store (IndexedDB) ----------

let photoDbPromise = null;

function openPhotoDb() {
  if (!photoDbPromise) {
    photoDbPromise = new Promise(function (resolve, reject) {
      if (typeof indexedDB === "undefined") { reject(new Error("no IndexedDB")); return; }
      const request = indexedDB.open(PHOTO_DB_NAME, 1);
      request.onupgradeneeded = function () { request.result.createObjectStore(PHOTO_STORE); };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("IndexedDB failed")); };
    });
    photoDbPromise.catch(function () { photoDbPromise = null; });   // try again next time
  }
  return photoDbPromise;
}

function photoRequest(mode, work) {
  return openPhotoDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      const transaction = db.transaction(PHOTO_STORE, mode);
      const store = transaction.objectStore(PHOTO_STORE);
      let result;
      const request = work(store);
      if (request) { request.onsuccess = function () { result = request.result; }; }
      transaction.oncomplete = function () { resolve(result); };
      transaction.onerror = function () { reject(transaction.error); };
      transaction.onabort = function () { reject(transaction.error || new Error("aborted")); };
    });
  });
}

// The store the sync code uses (tests give it a pretend one with the same four methods).
const photoStore = {
  get: function (id) { return photoRequest("readonly", function (s) { return s.get(id); }).then(function (v) { return v || null; }); },
  put: function (id, blob) { return photoRequest("readwrite", function (s) { return s.put(blob, id); }); },
  delete: function (id) { return photoRequest("readwrite", function (s) { return s.delete(id); }); },
  keys: function () { return photoRequest("readonly", function (s) { return s.getAllKeys(); }).then(function (k) { return k || []; }); }
};

// ---------- Showing a stored photo ----------

const photoUrls = {};      // id -> promise of a temporary address for the picture (or null)

// A temporary address you can put in <img src> or a CSS url(). Resolves null if this phone doesn't have it (yet).
function photoUrl(id) {
  if (!photoUrls[id]) {
    photoUrls[id] = photoStore.get(id).then(function (blob) {
      if (!blob) { delete photoUrls[id]; return null; }     // may arrive later; ask again next time
      return URL.createObjectURL(blob);
    }).catch(function () { delete photoUrls[id]; return null; });
  }
  return photoUrls[id];
}

function forgetPhotoUrl(id) {
  const pending = photoUrls[id];
  delete photoUrls[id];
  if (pending) { pending.then(function (url) { if (url) { URL.revokeObjectURL(url); } }); }
}

// ---------- Backup files: a photo as text ----------

function blobToBase64(blob) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () { resolve(String(reader.result).split(",")[1] || ""); };
    reader.onerror = function () { reject(reader.error); };
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) { bytes[i] = binary.charCodeAt(i); }
  return new Blob([bytes], { type: "image/jpeg" });
}

// ---------- Keeping photos in step with the cloud ----------

// Called at the end of every sync round (js/sync.js). `env` gives it:
//   store (get/put/delete/keys), cloud (uploadPhoto/downloadPhoto/removePhoto),
//   referenced()  -> { photoId: true } for every photo any recipe (or "Recently deleted", or a waiting choice) uses,
//   allSynced()   -> true when no recipe change is waiting and no choice is open,
//   loadState() / saveState(state)  -> { uploaded: { id: true } }
// Returns { downloaded, uploaded } (counts). Throws the cloud's error (offline etc.) so the caller can show it.
async function syncPhotos(env) {
  const saved = env.loadState();
  const state = saved && typeof saved === "object" && saved.uploaded && typeof saved.uploaded === "object" ? saved : { uploaded: {} };
  const refs = env.referenced();
  const have = {};
  (await env.store.keys()).forEach(function (id) { have[id] = true; });
  const counts = { downloaded: 0, uploaded: 0 };

  // 1. Send pictures the cloud hasn't got.
  for (const id of Object.keys(refs)) {
    if (have[id] && !state.uploaded[id]) {
      const blob = await env.store.get(id);
      if (blob) {
        await env.cloud.uploadPhoto(id, blob);
        state.uploaded[id] = true;
        env.saveState(state);
        counts.uploaded++;
      }
    }
  }

  // 2. Fetch pictures other phones added.
  for (const id of Object.keys(refs)) {
    if (!have[id]) {
      const blob = await env.cloud.downloadPhoto(id);      // null = not in the cloud (yet)
      if (blob) {
        await env.store.put(id, blob);
        have[id] = true;
        state.uploaded[id] = true;
        env.saveState(state);
        counts.downloaded++;
      }
    }
  }

  // 3. Tidy up, but only when everything is in step, so a picture another phone still needs is never removed.
  if (env.allSynced()) {
    const unused = Object.keys(state.uploaded).filter(function (id) { return !refs[id]; });
    for (const id of unused) {
      await env.cloud.removePhoto(id);
      delete state.uploaded[id];
      env.saveState(state);
    }
  }
  return counts;
}

// Delete pictures on this phone that no recipe uses (a photo picked and then cancelled, or replaced).
async function removeUnusedLocalPhotos(store, refs) {
  const keys = await store.keys();
  let removed = 0;
  for (const id of keys) {
    if (!refs[id]) { await store.delete(id); removed++; }
  }
  return removed;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    syncPhotos: syncPhotos, removeUnusedLocalPhotos: removeUnusedLocalPhotos
  };
}
