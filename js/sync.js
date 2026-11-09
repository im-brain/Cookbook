// ======================================================================
// Sync engine (redesign Phase 4). Plain script, loaded before app.js.
//
// What it does, in plain words:
//  - Every recipe on the phone is compared with the "last synced copy" we remember for it.
//    A recipe that differs is waiting in the "outbox" (there is no separate list to lose:
//    the outbox is worked out from the comparison, so a retry can never send duplicates).
//  - Sending uses a version number. The cloud only accepts a change that was based on its
//    latest version. If it wasn't, we fetch the cloud's copy and combine the two:
//    parts changed on one side only are combined automatically; a part changed on both
//    sides becomes a "conflict" the person decides (nothing is overwritten meanwhile).
//  - A deleted recipe goes to "Recently deleted" (kept 30 days), also in the cloud.
//
// The engine never touches the network itself: it talks to `env.cloud` (js/auth.js),
// and reads/writes the phone's storage through `env`. That lets the tests in
// tests/sync.test.js run two pretend phones against a pretend cloud.
// ======================================================================

const SYNC_KEY = "cookbook.sync";        // never rename
const TRASH_KEY = "cookbook.trash";      // never rename
const TRASH_DAYS = 30;

const syncIngredients = (typeof cleanIngredientList === "function")
  ? cleanIngredientList
  : require("./ingredients.js").cleanIngredientList;

// ---------- Small helpers ----------

// JSON text with the keys in a fixed order. The cloud may return keys in another order,
// so we always compare this form, never plain JSON.stringify.
function stableText(value) {
  if (Array.isArray(value)) {
    return "[" + value.map(stableText).join(",") + "]";
  }
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ":" + stableText(value[key]);
    }).join(",") + "}";
  }
  return JSON.stringify(value === undefined ? null : value);
}

function sameValue(a, b) {
  return stableText(a) === stableText(b);
}

function syncFingerprint(value) {
  const text = stableText(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36);
}

function copyOf(value) {
  return JSON.parse(JSON.stringify(value));
}

// Phase 6: the little note about a recipe's photo, { id, w, h }, or null. Always the same field order,
// so fingerprints match. (A recipe without a photo has no "photo" field at all.)
function cleanPhotoNote(note) {
  if (!note || typeof note.id !== "string" || !/^[A-Za-z0-9_-]{6,80}$/.test(note.id)) { return null; }
  function size(value) { return typeof value === "number" && value > 0 && value < 20000 ? Math.round(value) : 0; }
  return { id: note.id, w: size(note.w), h: size(note.h) };
}

// Rebuild a recipe in the app's usual field order (same shape as recipeFromForm), from cloud or saved data.
function canonicalRecipe(data, fallbackDate) {
  function textList(value) {
    return Array.isArray(value) ? value.filter(function (x) { return typeof x === "string"; }) : [];
  }
  function part(p) {
    p = p || {};
    return {
      title: String(p.title || ""),
      ingredients: syncIngredients(p.ingredients),
      steps: textList(p.steps),
      servings: typeof p.servings === "number" ? p.servings : null,
      timeMinutes: typeof p.timeMinutes === "number" ? p.timeMinutes : null,
      tags: textList(p.tags)
    };
  }
  const recipe = {
    id: String(data.id),
    kind: data.kind === "elsewhere" ? "elsewhere" : "mine",
    source: typeof data.source === "string" ? data.source : "",
    current: part(data.current),
    original: data.original ? part(data.original) : null,
    notes: typeof data.notes === "string" ? data.notes : "",
    createdAt: typeof data.createdAt === "string" && data.createdAt ? data.createdAt : fallbackDate,
    updatedAt: typeof data.updatedAt === "string" && data.updatedAt ? data.updatedAt : fallbackDate
  };
  const photo = cleanPhotoNote(data.photo);
  if (photo) { recipe.photo = photo; }          // last, and only when there is one
  return recipe;
}

// A recipe on the phone <-> a row in the cloud table (supabase/schema.sql).
function toRow(recipe, version, deletedAt) {
  return {
    id: recipe.id,
    kind: recipe.kind,
    source: recipe.source,
    notes: recipe.notes,
    current: recipe.current,
    original: recipe.original,
    photo: recipe.photo || null,
    created_at: recipe.createdAt,
    updated_at: recipe.updatedAt,
    version: version,
    deleted_at: deletedAt || null
  };
}

function fromRow(row, fallbackDate) {
  return canonicalRecipe({
    id: row.id, kind: row.kind, source: row.source, notes: row.notes,
    current: row.current, original: row.original, photo: row.photo,
    createdAt: row.created_at, updatedAt: row.updated_at
  }, fallbackDate);
}

// ---------- Combining two copies of a recipe ----------

const MERGE_PARTS = [
  { name: "title", inCurrent: true },
  { name: "ingredients", inCurrent: true },
  { name: "steps", inCurrent: true },
  { name: "servings", inCurrent: true },
  { name: "timeMinutes", inCurrent: true },
  { name: "tags", inCurrent: true },
  { name: "notes" },
  { name: "source" },
  { name: "original" },
  { name: "photo" }
];

function getPart(recipe, part) {
  return part.inCurrent ? recipe.current[part.name] : recipe[part.name];
}

function setPart(recipe, part, value) {
  if (part.name === "photo" && !value) { delete recipe.photo; return; }
  if (part.inCurrent) { recipe.current[part.name] = copyOf(value); }
  else { recipe[part.name] = copyOf(value); }
}

// Three-way combine. `base` is the last copy both sides agreed on (or null).
// Returns { merged, conflicts: [part names changed differently on both sides] }.
function mergeRecipes(base, local, remote) {
  const merged = copyOf(local);
  const conflicts = [];
  MERGE_PARTS.forEach(function (part) {
    const l = getPart(local, part);
    const r = getPart(remote, part);
    if (sameValue(l, r)) { return; }
    if (base && sameValue(l, getPart(base, part))) { setPart(merged, part, r); return; }
    if (base && sameValue(r, getPart(base, part))) { return; }
    conflicts.push(part.name);
  });
  if (remote.createdAt && remote.createdAt < merged.createdAt) { merged.createdAt = remote.createdAt; }
  if (remote.updatedAt && remote.updatedAt > merged.updatedAt) { merged.updatedAt = remote.updatedAt; }
  return { merged: merged, conflicts: conflicts };
}

// A short plain-words look at one part, for the "which one do you want?" screen.
function describePart(recipe, name) {
  const part = MERGE_PARTS.filter(function (p) { return p.name === name; })[0];
  const value = getPart(recipe, part);
  if (name === "ingredients") { return (value || []).length + " ingredients"; }
  if (name === "steps") { return (value || []).length + " steps"; }
  if (name === "tags") { return (value || []).length ? value.join(", ") : "no tags"; }
  if (name === "original") { return value ? "the saved original" : "no original"; }
  if (name === "photo") { return value ? "a photo" : "no photo"; }
  if (value === null || value === "") { return "(empty)"; }
  const text = String(value);
  return text.length > 80 ? text.slice(0, 77) + "…" : text;
}

// ---------- Reading and writing everything the engine owns ----------

function freshState(userId) {
  return { userId: userId || null, lastPulled: null, base: {}, conflicts: {} };
}

function readAll(env) {
  const recipes = env.loadRecipes();
  if (recipes === null) { throw { kind: "damaged" }; }
  const trash = env.loadTrash();
  let state = env.loadState();
  if (!state || typeof state !== "object" || typeof state.base !== "object" || state.base === null) {
    state = freshState(env.userId);
  }
  if (!state.conflicts) { state.conflicts = {}; }
  if (env.userId) {
    if (state.userId && state.userId !== env.userId) {
      state = freshState(env.userId);       // a different person signed in: start the bookkeeping over
    } else if (!state.userId) {
      state.userId = env.userId;
    }
  }
  return { recipes: recipes, trash: trash, state: state };
}

function writeAll(env, all) {
  if (!env.saveRecipes(all.recipes)) {
    throw { kind: "error", message: "The phone's storage for the cookbook may be full." };
  }
  env.saveTrash(all.trash);
  env.saveState(all.state);
}

function findLocal(all, id) {
  for (let i = 0; i < all.recipes.length; i++) {
    if (all.recipes[i].id === id) { return { where: "list", index: i, recipe: all.recipes[i] }; }
  }
  for (let j = 0; j < all.trash.length; j++) {
    if (all.trash[j].recipe.id === id) {
      return { where: "trash", index: j, recipe: all.trash[j].recipe, deletedAt: all.trash[j].deletedAt };
    }
  }
  return null;
}

function removeLocal(all, id) {
  all.recipes = all.recipes.filter(function (r) { return r.id !== id; });
  all.trash = all.trash.filter(function (t) { return t.recipe.id !== id; });
}

// Phase 5: every recipe is synced (Phase 4 only sent recipes tagged "sync-test").
// Whether syncing is switched on at all is decided in js/sync-ui.js (after "Finish the move").
function isSynced(all, recipe) {
  return true;
}

function isDirty(all, item) {
  const base = all.state.base[item.recipe.id];
  const deleted = item.where === "trash";
  if (!base) { return true; }
  return base.deleted !== deleted || base.fp !== syncFingerprint(item.recipe);
}

// The outbox: ids of recipes whose newest state hasn't reached the cloud.
function pendingIds(all) {
  const ids = [];
  all.recipes.forEach(function (r) {
    if (isSynced(all, r) && !all.state.conflicts[r.id] && isDirty(all, { where: "list", recipe: r })) { ids.push(r.id); }
  });
  all.trash.forEach(function (t) {
    if (isSynced(all, t.recipe) && !all.state.conflicts[t.recipe.id] && isDirty(all, { where: "trash", recipe: t.recipe })) { ids.push(t.recipe.id); }
  });
  return ids;
}

function pendingCount(env) {
  return pendingIds(readAll(env)).length;
}

function conflictList(env) {
  const all = readAll(env);
  return Object.keys(all.state.conflicts).map(function (id) {
    const c = all.state.conflicts[id];
    const local = findLocal(all, id);
    return {
      id: id,
      title: local ? local.recipe.current.title : c.remote.current.title,
      parts: c.parts,
      lines: c.parts.map(function (name) {
        return { name: name, here: local ? describePart(local.recipe, name) : "", there: describePart(c.remote, name) };
      })
    };
  });
}

// ---------- Making local data match one cloud row ----------

function setBase(all, recipe, version, deleted) {
  all.state.base[recipe.id] = {
    version: version,
    fp: syncFingerprint(recipe),
    snapshot: copyOf(recipe),
    deleted: !!deleted
  };
}

function adoptRemote(env, all, row) {
  const recipe = fromRow(row, env.today());
  const deleted = !!row.deleted_at;
  removeLocal(all, recipe.id);
  if (deleted) { all.trash.push({ recipe: recipe, deletedAt: row.deleted_at }); }
  else { all.recipes.push(recipe); }
  setBase(all, recipe, row.version, deleted);
  delete all.state.conflicts[recipe.id];
}

// Decide what to do with one cloud row, given what the phone has. Changes `all` in memory only.
function reconcile(env, all, row) {
  const id = row.id;
  const remoteDeleted = !!row.deleted_at;
  const local = findLocal(all, id);
  const base = all.state.base[id] || null;

  if (!local) {                                   // new to this phone
    adoptRemote(env, all, row);
    return;
  }
  if (base && base.version === row.version && !isDirty(all, local)) {
    return;                                       // nothing new either way
  }
  if (base && !isDirty(all, local)) {             // only the cloud changed: take its copy
    adoptRemote(env, all, row);
    return;
  }
  const remoteRecipe = fromRow(row, env.today());
  const localDeleted = local.where === "trash";

  if (localDeleted && remoteDeleted) {            // deleted on both: agree
    all.state.base[id] = { version: row.version, fp: syncFingerprint(local.recipe), snapshot: copyOf(local.recipe), deleted: true };
    delete all.state.conflicts[id];
    return;
  }
  if (localDeleted && !remoteDeleted) {           // deleted here, edited elsewhere: nothing is lost, the edited copy wins
    adoptRemote(env, all, row);
    return;
  }
  if (!localDeleted && remoteDeleted) {           // edited here, deleted elsewhere: keep my edit (it comes back)
    all.state.base[id] = { version: row.version, fp: syncFingerprint(remoteRecipe), snapshot: copyOf(remoteRecipe), deleted: true };
    delete all.state.conflicts[id];
    return;
  }
  // Both live and both changed: combine part by part.
  const result = mergeRecipes(base ? base.snapshot : null, local.recipe, remoteRecipe);
  if (result.conflicts.length > 0) {
    all.state.conflicts[id] = {
      remote: remoteRecipe, remoteVersion: row.version, parts: result.conflicts
    };
    return;
  }
  all.recipes[local.index] = result.merged;       // (local is in the list here)
  all.state.base[id] = { version: row.version, fp: syncFingerprint(remoteRecipe), snapshot: copyOf(remoteRecipe), deleted: false };
  delete all.state.conflicts[id];
}

// ---------- One round of syncing ----------

async function pushOne(env, id) {
  let all = readAll(env);
  const item = findLocal(all, id);
  if (!item) { return false; }
  const base = all.state.base[id] || null;
  const deleted = item.where === "trash";
  const snapshot = copyOf(item.recipe);
  const row = toRow(snapshot, base ? base.version + 1 : 1, deleted ? item.deletedAt : null);

  const result = base ? await env.cloud.updateRow(id, base.version, row) : await env.cloud.insertRow(row);
  if (result.ok) {
    all = readAll(env);                           // the person may have edited meanwhile: read again
    setBase(all, snapshot, row.version, deleted);
    all.state.base[id].deleted = deleted;
    env.saveState(all.state);
    return true;
  }
  // The cloud has a newer copy (or already has this one). Fetch it and combine.
  const remote = await env.cloud.fetchRow(id);
  all = readAll(env);
  if (remote) { reconcile(env, all, remote); }
  else { delete all.state.base[id]; }              // gone from the cloud: send it again as new
  writeAll(env, all);
  return false;
}

// Take out recipes that have been in "Recently deleted" for more than 30 days.
async function purgeOldTrash(env) {
  const all = readAll(env);
  const limit = new Date(env.now()).getTime() - TRASH_DAYS * 24 * 3600 * 1000;
  const old = all.trash.filter(function (t) { return new Date(t.deletedAt).getTime() < limit; });
  if (old.length === 0) { return 0; }
  for (let i = 0; i < old.length; i++) {
    const id = old[i].recipe.id;
    if (all.state.base[id]) {
      try { await env.cloud.purgeRow(id); } catch (error) { if (error && error.offline) { throw error; } }
    }
  }
  const again = readAll(env);
  again.trash = again.trash.filter(function (t) { return old.every(function (o) { return o.recipe.id !== t.recipe.id; }); });
  old.forEach(function (o) { delete again.state.base[o.recipe.id]; delete again.state.conflicts[o.recipe.id]; });
  writeAll(env, again);
  return old.length;
}

// Send what's waiting and fetch what's new. Returns { ok: true, pulled, pushed } or { ok: false, kind, message }.
async function syncNow(env) {
  try {
    let all = readAll(env);
    const since = all.state.lastPulled;
    const rows = await env.cloud.pullChanges(since);

    all = readAll(env);
    let pulled = 0;
    let newest = all.state.lastPulled;
    rows.forEach(function (row) {
      if (!newest || row.modified_at > newest) { newest = row.modified_at; }
      const base = all.state.base[row.id];
      if (!base || base.version !== row.version) {
        reconcile(env, all, row);
        pulled++;
      }
    });
    all.state.lastPulled = newest;
    writeAll(env, all);

    let pushed = 0;
    for (let pass = 0; pass < 4; pass++) {
      const ids = pendingIds(readAll(env));
      if (ids.length === 0) { break; }
      for (let i = 0; i < ids.length; i++) {
        if (await pushOne(env, ids[i])) { pushed++; }
      }
    }
    await purgeOldTrash(env);
    let photos = 0;
    if (env.photos) {                              // Phase 6: pictures follow the recipes
      const counts = await env.photos();
      photos = counts ? counts.downloaded : 0;
    }
    return { ok: true, pulled: pulled, pushed: pushed, photos: photos };
  } catch (error) {
    if (error && error.offline) { return { ok: false, kind: "offline" }; }
    if (error && error.kind === "damaged") {
      return { ok: false, kind: "damaged", message: "Your saved recipes couldn't be read, so nothing was synced." };
    }
    return { ok: false, kind: "error", message: (error && error.message) ? error.message : "Something went wrong." };
  }
}

// ---------- Deleting, restoring, and choosing in a conflict ----------

// Delete = move to "Recently deleted". Returns { ok } or { ok:false, problem }.
function moveToTrash(env, id) {
  const all = readAll(env);
  const item = findLocal(all, id);
  if (!item || item.where !== "list") { return { ok: false, problem: "Sorry, that recipe couldn't be found. Nothing was changed." }; }
  all.recipes.splice(item.index, 1);
  all.trash.push({ recipe: item.recipe, deletedAt: env.now() });
  try { writeAll(env, all); } catch (error) { return { ok: false, problem: "Sorry, the change couldn't be saved. The phone's storage for the cookbook may be full." }; }
  return { ok: true };
}

function restoreFromTrash(env, id) {
  const all = readAll(env);
  const item = findLocal(all, id);
  if (!item || item.where !== "trash") { return { ok: false, problem: "Sorry, that recipe couldn't be found." }; }
  all.trash.splice(item.index, 1);
  if (!all.recipes.some(function (r) { return r.id === id; })) {
    item.recipe.updatedAt = env.today();
    all.recipes.push(item.recipe);
  }
  try { writeAll(env, all); } catch (error) { return { ok: false, problem: "Sorry, the change couldn't be saved. The phone's storage for the cookbook may be full." }; }
  return { ok: true };
}

// choice: "mine" (keep this phone's copy), "theirs" (use the other one), "both" (theirs, plus mine as a copy).
function resolveConflict(env, id, choice) {
  const all = readAll(env);
  const c = all.state.conflicts[id];
  const local = findLocal(all, id);
  if (!c || !local) { return { ok: false, problem: "That choice is no longer needed." }; }
  const remote = copyOf(c.remote);

  if (choice === "mine") {
    // Say "I have seen their version" and keep mine; the next sync sends it on top.
    all.state.base[id] = { version: c.remoteVersion, fp: syncFingerprint(remote), snapshot: remote, deleted: false };
    delete all.state.conflicts[id];
  } else {
    if (choice === "both") {
      const mine = copyOf(local.recipe);
      mine.id = env.newId();
      mine.current.title = mine.current.title + " (copy)";
      all.recipes.push(mine);
    }
    all.recipes = all.recipes.filter(function (r) { return r.id !== id; });
    all.recipes.push(remote);
    setBase(all, remote, c.remoteVersion, false);
    delete all.state.conflicts[id];
  }
  try { writeAll(env, all); } catch (error) { return { ok: false, problem: "Sorry, the change couldn't be saved. The phone's storage for the cookbook may be full." }; }
  return { ok: true };
}

// ---------- Moving the real recipes (Phase 5) ----------

function titleOf(recipe) {
  return (recipe && recipe.current && recipe.current.title) ? recipe.current.title : "(no title)";
}

// Look, don't touch: what is on the phone and what is already in the cloud.
// Returns { ok: true, onPhone, inTrash, inCloud, toUpload, inBoth, cloudOnly, titles } or { ok: false, kind, message }.
async function previewMove(env) {
  try {
    const all = readAll(env);
    const rows = await env.cloud.pullChanges(null);
    const cloudIds = {};
    rows.forEach(function (row) { cloudIds[row.id] = true; });
    const mine = all.recipes.concat(all.trash.map(function (t) { return t.recipe; }));
    let inBoth = 0;
    const localIds = {};
    mine.forEach(function (r) { localIds[r.id] = true; if (cloudIds[r.id]) { inBoth++; } });
    let cloudOnly = 0;
    rows.forEach(function (row) { if (!localIds[row.id]) { cloudOnly++; } });
    return {
      ok: true, onPhone: all.recipes.length, inTrash: all.trash.length, inCloud: rows.length,
      toUpload: mine.length - inBoth, inBoth: inBoth, cloudOnly: cloudOnly,
      titles: all.recipes.map(titleOf).sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; })
    };
  } catch (error) {
    return moveFailure(error);
  }
}

// After the upload: download everything again and compare with the phone, recipe by recipe.
// ok is true only when nothing is missing, different, waiting, or in a conflict.
// Which parts of a recipe differ between this device and the cloud, in plain names (for messages).
function differingParts(local, remote, inTrash, remoteDeleted) {
  const names = [];
  MERGE_PARTS.forEach(function (part) {
    if (!sameValue(getPart(local, part), getPart(remote, part))) { names.push(part.name); }
  });
  if (local.kind !== remote.kind) { names.push("kind"); }
  if (local.createdAt !== remote.createdAt || local.updatedAt !== remote.updatedAt) { names.push("dates"); }
  if (!!inTrash !== !!remoteDeleted) { names.push(inTrash ? "deleted here only" : "deleted in the cloud only"); }
  return names;
}

async function verifyMove(env) {
  try {
    const all = readAll(env);
    const rows = await env.cloud.pullChanges(null);
    const byId = {};
    rows.forEach(function (row) { byId[row.id] = row; });
    const missing = [];
    const different = [];
    const differentDetails = [];
    let matching = 0;
    function compare(recipe, inTrash) {
      const row = byId[recipe.id];
      if (!row) { missing.push(titleOf(recipe)); return; }
      const sameState = inTrash ? !!row.deleted_at : !row.deleted_at;
      const remote = fromRow(row, env.today());
      if (sameState && syncFingerprint(remote) === syncFingerprint(recipe)) { matching++; }
      else {
        different.push(titleOf(recipe));
        const parts = differingParts(recipe, remote, inTrash, !!row.deleted_at);
        differentDetails.push({ title: titleOf(recipe), parts: parts.length ? parts : ["formatting only"] });
      }
    }
    all.recipes.forEach(function (r) { compare(r, false); });
    all.trash.forEach(function (t) { compare(t.recipe, true); });
    const total = all.recipes.length + all.trash.length;
    const waitingIds = pendingIds(all);
    const waiting = waitingIds.length;
    const conflicts = Object.keys(all.state.conflicts).length;
    const waitingDetails = waitingIds.map(function (id) {
      const item = findLocal(all, id);
      return { title: item ? titleOf(item.recipe) : id, why: all.state.base[id] ? "changed since it was last sent" : "not sent yet" };
    });
    return {
      ok: missing.length === 0 && different.length === 0 && waiting === 0 && conflicts === 0,
      total: total, matching: matching, missing: missing, different: different, waiting: waiting, conflicts: conflicts,
      differentDetails: differentDetails, waitingDetails: waitingDetails
    };
  } catch (error) {
    return moveFailure(error);
  }
}

// "Make this device match the cloud" (for a second device such as an iPad): every recipe the cloud already has
// is replaced here by the cloud's copy (including its "Recently deleted" state), and any open choice about it
// is dropped. Recipes that exist only on this device are kept (the normal sync sends them). With dryRun = true
// nothing is changed; it only counts. Returns { ok, cloudTotal, replace, alreadyMatch, onlyHere }.
async function matchCloud(env, dryRun) {
  try {
    const rows = await env.cloud.pullChanges(null);
    const all = readAll(env);
    let replace = 0;
    let alreadyMatch = 0;
    let newest = all.state.lastPulled;
    const inCloud = {};
    rows.forEach(function (row) {
      inCloud[row.id] = true;
      if (!newest || row.modified_at > newest) { newest = row.modified_at; }
      const local = findLocal(all, row.id);
      const sameState = local && (local.where === "trash") === !!row.deleted_at;
      if (sameState && syncFingerprint(local.recipe) === syncFingerprint(fromRow(row, env.today()))) { alreadyMatch++; }
      else { replace++; }
      if (!dryRun) { adoptRemote(env, all, row); }
    });
    let onlyHere = 0;
    all.recipes.forEach(function (r) { if (!inCloud[r.id]) { onlyHere++; } });
    all.trash.forEach(function (t) { if (!inCloud[t.recipe.id]) { onlyHere++; } });
    if (!dryRun) {
      all.state.lastPulled = newest;
      writeAll(env, all);
    }
    return { ok: true, cloudTotal: rows.length, replace: replace, alreadyMatch: alreadyMatch, onlyHere: onlyHere };
  } catch (error) {
    return moveFailure(error);
  }
}

function moveFailure(error) {
  if (error && error.offline) { return { ok: false, kind: "offline", message: "No connection." }; }
  if (error && error.kind === "damaged") { return { ok: false, kind: "damaged", message: "Your saved recipes couldn't be read, so nothing was done." }; }
  return { ok: false, kind: "error", message: (error && error.message) ? error.message : "Something went wrong." };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    previewMove: previewMove, verifyMove: verifyMove, matchCloud: matchCloud, TRASH_DAYS: TRASH_DAYS, stableText: stableText, syncFingerprint: syncFingerprint,
    canonicalRecipe: canonicalRecipe, cleanPhotoNote: cleanPhotoNote, toRow: toRow, fromRow: fromRow, mergeRecipes: mergeRecipes,
    describePart: describePart, pendingCount: pendingCount, conflictList: conflictList, syncNow: syncNow,
    moveToTrash: moveToTrash, restoreFromTrash: restoreFromTrash, resolveConflict: resolveConflict,
    freshState: freshState, readAll: readAll
  };
}
