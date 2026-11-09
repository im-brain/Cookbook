// js/shopping-sync.js: syncing the shopping choices between devices (Version 36, Phase 8 Part B).
// Plain script, loaded after js/shopping.js and js/plan-sync.js. It talks to the cloud only through
// `env.cloud` (see js/auth.js), so it also runs in Node for tests (node tests/shopping-sync.test.js).
//
// What is synced is only what the person did (the list itself is worked out again on each device).
// The saved choices are cut into small "atoms", each with an id, so two devices rarely touch the same one:
//   tick|<Monday>|<key>    a ticked item           { text, bases }
//   extra|<Monday>|<id>    an extra the person typed   { text, ticked }
//   seen|<Monday>          what the list held when last looked at   { key: label }   (whole map is one atom)
//   more|<Monday>          items that needed more after being ticked   { key: { was } }
//   pantry|<key>           an "I always have this" item   the item's name
//   aisle|<key>            an aisle the person chose   the aisle's name
// Same rules as the meal plan (js/plan-sync.js): the phone keeps everything, the cloud is a mirror, a removed
// atom is marked removed (`deleted_at`) so the removal reaches the other devices, the outbox is worked out
// (an atom that differs from its last synced copy is waiting), and the LAST EDIT WINS.
// Bookkeeping lives on the phone under "cookbook.shoppingsync" (never rename it):
//   { userId, lastPulled, base: { atomId: { version, fp, deleted, modifiedAt } } }

const SHOPPING_SYNC_KEY = "cookbook.shoppingsync";   // never rename
const SHOPPING_TOMBSTONE_DAYS = 30;                  // how long "removed" marks stay in the cloud

const SS = (typeof module !== "undefined" && module.exports && typeof require === "function")
  ? require("./shopping.js")
  : { cleanShopping: cleanShopping, shopKey: shopKey };

// ---------- Atoms <-> the saved choices ----------

function shopStable(value) {
  if (Array.isArray(value)) { return "[" + value.map(shopStable).join(",") + "]"; }
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(function (k) { return JSON.stringify(k) + ":" + shopStable(value[k]); }).join(",") + "}";
  }
  return JSON.stringify(value === undefined ? null : value);
}

function shopFingerprint(value) { return shopStable(value); }

// { atomId: value } for everything the person has chosen.
function flattenShopping(shopping) {
  const atoms = {};
  const clean = SS.cleanShopping(shopping);
  Object.keys(clean.weeks).forEach(function (start) {
    const week = clean.weeks[start];
    if (week.seen !== null) { atoms["seen|" + start] = week.seen; }
    if (Object.keys(week.more).length > 0) { atoms["more|" + start] = week.more; }
    Object.keys(week.ticks).forEach(function (key) { atoms["tick|" + start + "|" + key] = week.ticks[key]; });
    week.extras.forEach(function (x) { atoms["extra|" + start + "|" + x.id] = { text: x.text, ticked: x.ticked }; });
  });
  clean.pantry.forEach(function (name) { atoms["pantry|" + SS.shopKey(name)] = name; });
  Object.keys(clean.aisles).forEach(function (key) { atoms["aisle|" + key] = clean.aisles[key]; });
  return atoms;
}

// Builds the saved choices from atoms. `prior` (the choices as they are on the phone, or null) only keeps the
// order of extras and pantry items steady.
function rebuildShopping(atoms, prior) {
  const raw = { weeks: {}, pantry: [], aisles: {} };
  function week(start) {
    if (!raw.weeks[start]) { raw.weeks[start] = { seen: null, ticks: {}, more: {}, extras: [] }; }
    return raw.weeks[start];
  }
  const extraOrder = {};
  const pantryOrder = {};
  if (prior) {
    const p = SS.cleanShopping(prior);
    Object.keys(p.weeks).forEach(function (start) {
      p.weeks[start].extras.forEach(function (x, i) { extraOrder[start + "|" + x.id] = i; });
    });
    p.pantry.forEach(function (name, i) { pantryOrder[SS.shopKey(name)] = i; });
  }
  function rank(order, id) { return id in order ? order[id] : 1e9; }
  const extras = [];
  const pantry = [];
  Object.keys(atoms).sort().forEach(function (id) {
    const value = atoms[id];
    const parts = id.split("|");
    const type = parts[0];
    if (type === "seen" && parts.length === 2) { week(parts[1]).seen = value; }
    else if (type === "more" && parts.length === 2) { week(parts[1]).more = value; }
    else if (type === "tick" && parts.length >= 3) { week(parts[1]).ticks[parts.slice(2).join("|")] = value; }
    else if (type === "extra" && parts.length >= 3 && value && typeof value === "object") {
      extras.push({ start: parts[1], x: { id: parts.slice(2).join("|"), text: value.text, ticked: value.ticked } });
    }
    else if (type === "pantry" && parts.length >= 2) { pantry.push({ key: parts.slice(1).join("|"), name: value }); }
    else if (type === "aisle" && parts.length >= 2) { raw.aisles[parts.slice(1).join("|")] = value; }
  });
  extras.sort(function (a, b) {
    return rank(extraOrder, a.start + "|" + a.x.id) - rank(extraOrder, b.start + "|" + b.x.id);
  });
  extras.forEach(function (e) { week(e.start).extras.push(e.x); });
  pantry.sort(function (a, b) { return rank(pantryOrder, a.key) - rank(pantryOrder, b.key); });
  pantry.forEach(function (p) { raw.pantry.push(p.name); });
  return SS.cleanShopping(raw);
}

// A value from the cloud, tidied the same way as the phone's own. null = this app can't read it.
function normalizeAtom(id, value) {
  const one = {};
  one[id] = value;
  const back = flattenShopping(rebuildShopping(one, null));
  return back[id] === undefined ? null : back[id];
}

// ---------- Cloud rows <-> atoms ----------

function toShopRow(id, value, version, deletedAt) {
  const row = { id: id, version: version, deleted_at: deletedAt || null };
  if (!deletedAt) { row.value = value; }
  return row;
}

// ---------- Reading and writing what the engine owns ----------

function freshShopState(userId) { return { userId: userId || null, lastPulled: null, base: {} }; }

function readShopAll(env) {
  const shopping = env.loadShopping();
  if (shopping === null) { throw { kind: "damaged" }; }
  let state = env.loadState();
  if (!state || typeof state !== "object" || typeof state.base !== "object" || state.base === null) {
    state = freshShopState(env.userId);
  }
  if (env.userId) {
    if (state.userId && state.userId !== env.userId) { state = freshShopState(env.userId); }   // someone else signed in
    else if (!state.userId) { state.userId = env.userId; }
  }
  return { shopping: shopping, atoms: flattenShopping(shopping), state: state };
}

function writeShopAll(env, all) {
  const next = rebuildShopping(all.atoms, all.shopping);
  if (!env.saveShopping(next)) { throw { kind: "error", message: "The phone's storage for the cookbook may be full." }; }
  all.shopping = next;
  env.saveState(all.state);
}

// Does the phone hold a change for this atom that the cloud hasn't got?
function shopDirty(all, id) {
  const value = all.atoms[id];
  const base = all.state.base[id];
  if (!base) { return value !== undefined; }
  if (base.deleted) { return value !== undefined; }
  if (value === undefined) { return true; }
  return base.fp !== shopFingerprint(value);
}

function shopPendingIds(all) {
  const ids = Object.keys(all.atoms).filter(function (id) { return shopDirty(all, id); });
  Object.keys(all.state.base).forEach(function (id) {
    if (!(id in all.atoms) && shopDirty(all, id)) { ids.push(id); }
  });
  return ids;
}

function shoppingPendingCount(env) {
  return shopPendingIds(readShopAll(env)).length;
}

// ---------- Taking in one cloud row ----------

function shopReconcile(all, row) {
  const id = row.id;
  const base = all.state.base[id] || null;
  if (base && base.version === row.version) { return false; }          // nothing new
  const remoteDeleted = !!row.deleted_at;
  const local = all.atoms[id];
  const remote = remoteDeleted ? null : normalizeAtom(id, row.value);
  if (!remoteDeleted && remote === null) { return false; }             // a row this app can't read: leave it alone

  if (local !== undefined && remote !== null && shopFingerprint(local) === shopFingerprint(remote)) {   // already the same: agree
    all.state.base[id] = { version: row.version, fp: shopFingerprint(local), deleted: false, modifiedAt: row.modified_at };
    return true;
  }
  if (!shopDirty(all, id)) {                                            // only the cloud changed: take its copy
    if (remoteDeleted) {
      delete all.atoms[id];
      all.state.base[id] = { version: row.version, fp: null, deleted: true, modifiedAt: row.modified_at };
    } else {
      all.atoms[id] = remote;
      all.state.base[id] = { version: row.version, fp: shopFingerprint(remote), deleted: false, modifiedAt: row.modified_at };
    }
    return true;
  }
  // Both changed: the last edit wins, and ours is sent after this. Just learn the cloud's version.
  all.state.base[id] = {
    version: row.version, fp: base ? base.fp : null, deleted: remoteDeleted,
    modifiedAt: base ? base.modifiedAt : row.modified_at
  };
  return true;
}

// ---------- Sending one atom ----------
// Returns true if it was sent (or needed nothing).
async function shopPushOne(env, all, id) {
  const value = all.atoms[id];
  const base = all.state.base[id] || null;
  const cloud = env.cloud;

  if (value !== undefined && !base) {                                 // brand new
    const result = await cloud.insertShop(toShopRow(id, value, 1, null));
    if (result.ok) {
      all.state.base[id] = { version: 1, fp: shopFingerprint(value), deleted: false, modifiedAt: result.modified_at || env.now() };
      return true;
    }
    const row = await cloud.fetchShopRow(id);                         // the cloud already has that id: learn its version, retry
    if (row) { all.state.base[id] = { version: row.version, fp: null, deleted: !!row.deleted_at, modifiedAt: row.modified_at }; }
    return false;
  }
  if (!base) { return true; }                                         // gone and never sent: nothing to do

  if (value === undefined) {                                          // removed here
    const result = await cloud.updateShop(id, base.version, { deleted_at: env.now(), version: base.version + 1 });
    if (result.ok) {
      all.state.base[id] = { version: base.version + 1, fp: null, deleted: true, modifiedAt: result.modified_at || env.now() };
      return true;
    }
  } else {                                                            // changed here
    const result = await cloud.updateShop(id, base.version, toShopRow(id, value, base.version + 1, null));
    if (result.ok) {
      all.state.base[id] = { version: base.version + 1, fp: shopFingerprint(value), deleted: false, modifiedAt: result.modified_at || env.now() };
      return true;
    }
  }
  const row = await cloud.fetchShopRow(id);                           // the cloud moved on: learn its version, retry
  if (row) { all.state.base[id] = { version: row.version, fp: base.fp, deleted: !!row.deleted_at, modifiedAt: row.modified_at }; }
  else { delete all.state.base[id]; }
  return false;
}

// ---------- The whole round: fetch what's new, send what's waiting ----------
// Returns { ok: true, pulled, pushed } or { ok: false, kind, message }.
async function syncShopping(env) {
  try {
    let all = readShopAll(env);
    const rows = await env.cloud.pullShop(all.state.lastPulled);

    all = readShopAll(env);                                           // (re-read: the person may have edited meanwhile)
    let pulled = 0;
    let newest = all.state.lastPulled;
    rows.forEach(function (row) {
      if (!newest || row.modified_at > newest) { newest = row.modified_at; }
      if (shopReconcile(all, row)) { pulled++; }
    });
    all.state.lastPulled = newest;
    writeShopAll(env, all);

    let pushed = 0;
    for (let pass = 0; pass < 4; pass++) {
      all = readShopAll(env);
      const ids = shopPendingIds(all);
      if (ids.length === 0) { break; }
      for (let i = 0; i < ids.length; i++) {
        if (await shopPushOne(env, all, ids[i])) { pushed++; }
      }
      writeShopAll(env, all);
    }

    // Tidy the cloud: "removed" marks older than 30 days can go for good.
    const cutoff = new Date(Date.parse(env.now()) - SHOPPING_TOMBSTONE_DAYS * 24 * 3600 * 1000).toISOString();
    await env.cloud.purgeOldShop(cutoff);
    return { ok: true, pulled: pulled, pushed: pushed };
  } catch (error) {
    if (error && error.offline) { return { ok: false, kind: "offline" }; }
    if (error && error.kind === "damaged") { return { ok: false, kind: "damaged", message: "Your shopping list couldn't be read, so it wasn't synced." }; }
    return { ok: false, kind: "error", message: (error && error.message) ? error.message : "Something went wrong." };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SHOPPING_SYNC_KEY: SHOPPING_SYNC_KEY, syncShopping: syncShopping, shoppingPendingCount: shoppingPendingCount,
    flattenShopping: flattenShopping, rebuildShopping: rebuildShopping, normalizeAtom: normalizeAtom
  };
}
