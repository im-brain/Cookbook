// js/plan-sync.js: syncing the meal plan between devices (Version 32, Phase 7 Part B).
// Plain script, loaded after js/plan.js and js/sync.js. It works out what to send and what to take,
// and talks to the cloud only through `env.cloud` (see js/auth.js), so it also runs in Node for tests
// (node tests/plan-sync.test.js).
//
// How it works (simpler than recipes, on purpose: one planned dinner is small and easy to redo):
//  * The phone keeps the whole plan; the cloud table `plan_entries` is a mirror.
//  * A removed dinner is marked removed in the cloud (`deleted_at`), so the removal reaches the other devices.
//  * The "outbox" is worked out, not stored: an entry that differs from its last synced copy is waiting,
//    and so is an entry that was synced and is now gone from the phone.
//  * If the same dinner was changed on two devices, the LAST EDIT WINS (no "which one?" screen).
//  * Two devices that each plan a different main for the same day: the more recently changed one is kept,
//    the other is removed (a day has one main). Sides are never touched by this rule.
// Bookkeeping lives on the phone under "cookbook.plansync" (never rename it):
//   { userId, lastPulled, base: { id: { version, fp, deleted, modifiedAt } } }

const PLAN_SYNC_KEY = "cookbook.plansync";   // never rename
const PLAN_TOMBSTONE_DAYS = 30;               // how long "removed" marks stay in the cloud

const PS = (typeof module !== "undefined" && module.exports && typeof require === "function")
  ? require("./plan.js")
  : { cleanPlanEntry: cleanPlanEntry };

// ---------- Cloud rows <-> entries ----------

function planFingerprint(entry) {
  return JSON.stringify(entry);                     // entries always have their fields in one fixed order
}

function toPlanRow(entry, version, deletedAt) {
  return {
    id: entry.id, date: entry.date, meal: entry.meal, kind: entry.kind, role: entry.role,
    recipe_id: entry.recipeId, title: entry.title, servings: entry.servings, note: entry.note,
    position: entry.position, version: version, deleted_at: deletedAt || null
  };
}

function fromPlanRow(row) {
  return PS.cleanPlanEntry({
    id: row.id, date: typeof row.date === "string" ? row.date.slice(0, 10) : row.date, kind: row.kind, role: row.role,
    recipeId: row.recipe_id, title: row.title,
    servings: row.servings === null || row.servings === undefined ? null : Number(row.servings),
    note: row.note, position: row.position
  });
}

// ---------- Reading and writing what the engine owns ----------

function freshPlanState(userId) {
  return { userId: userId || null, lastPulled: null, base: {} };
}

function readPlanAll(env) {
  const plan = env.loadPlan();
  if (plan === null) { throw { kind: "damaged" }; }
  let state = env.loadState();
  if (!state || typeof state !== "object" || typeof state.base !== "object" || state.base === null) {
    state = freshPlanState(env.userId);
  }
  if (env.userId) {
    if (state.userId && state.userId !== env.userId) { state = freshPlanState(env.userId); }   // someone else signed in
    else if (!state.userId) { state.userId = env.userId; }
  }
  return { plan: { entries: plan.entries.slice() }, state: state };
}

function writePlanAll(env, all) {
  if (!env.savePlan(all.plan)) { throw { kind: "error", message: "The phone's storage for the cookbook may be full." }; }
  env.saveState(all.state);
}

function planIndex(all, id) {
  for (let i = 0; i < all.plan.entries.length; i++) { if (all.plan.entries[i].id === id) { return i; } }
  return -1;
}

// Does the phone hold a change for this id that the cloud hasn't got?  `entry` is the phone's entry or null.
function planDirty(all, id, entry) {
  const base = all.state.base[id];
  if (!base) { return entry !== null; }              // never synced: waiting if it exists
  if (base.deleted) { return entry !== null; }       // the cloud says removed: an entry here is a change
  if (!entry) { return true; }                       // synced before, now gone here: a removal is waiting
  return base.fp !== planFingerprint(entry);
}

// Ids waiting to be sent.
function planPendingIds(all) {
  const ids = [];
  all.plan.entries.forEach(function (e) { if (planDirty(all, e.id, e)) { ids.push(e.id); } });
  Object.keys(all.state.base).forEach(function (id) {
    if (planIndex(all, id) === -1 && planDirty(all, id, null)) { ids.push(id); }
  });
  return ids;
}

function planPendingCount(env) {
  return planPendingIds(readPlanAll(env)).length;
}

// ---------- Taking in one cloud row ----------

function planReconcile(all, row) {
  const id = row.id;
  const base = all.state.base[id] || null;
  if (base && base.version === row.version) { return false; }          // nothing new
  const remoteDeleted = !!row.deleted_at;
  const index = planIndex(all, id);
  const local = index === -1 ? null : all.plan.entries[index];
  const remote = remoteDeleted ? null : fromPlanRow(row);
  if (!remoteDeleted && remote === null) { return false; }             // a row this app can't read: leave it alone

  // Same content on both sides (e.g. the same backup imported on two devices): just agree.
  if (local && remote && planFingerprint(local) === planFingerprint(remote)) {
    all.state.base[id] = { version: row.version, fp: planFingerprint(local), deleted: false, modifiedAt: row.modified_at };
    return true;
  }
  if (!planDirty(all, id, local)) {                                     // only the cloud changed: take its copy
    if (remoteDeleted) {
      if (index !== -1) { all.plan.entries.splice(index, 1); }
      all.state.base[id] = { version: row.version, fp: null, deleted: true, modifiedAt: row.modified_at };
    } else {
      if (index === -1) { all.plan.entries.push(remote); } else { all.plan.entries[index] = remote; }
      all.state.base[id] = { version: row.version, fp: planFingerprint(remote), deleted: false, modifiedAt: row.modified_at };
    }
    return true;
  }
  // Both changed: the last edit wins, and ours is sent after this, so ours wins. Just learn the cloud's version.
  all.state.base[id] = {
    version: row.version, fp: base ? base.fp : null, deleted: remoteDeleted,
    modifiedAt: base ? base.modifiedAt : row.modified_at
  };
  return true;
}

// A day has one main. If two ended up on the same date, keep the most recently changed one.
function planSettleMains(env, all) {
  const byDate = {};
  all.plan.entries.forEach(function (e) {
    if (e.role === "main") { (byDate[e.date] = byDate[e.date] || []).push(e); }
  });
  const nowText = env.now();
  Object.keys(byDate).forEach(function (date) {
    const mains = byDate[date];
    if (mains.length < 2) { return; }
    function stamp(e) {
      if (planDirty(all, e.id, e)) { return nowText; }                  // not sent yet: it's the newest
      const base = all.state.base[e.id];
      return base && base.modifiedAt ? base.modifiedAt : "";
    }
    mains.sort(function (a, b) {
      const sa = stamp(a), sb = stamp(b);
      if (sa !== sb) { return sa < sb ? 1 : -1; }                       // newest first
      return a.id < b.id ? 1 : -1;                                      // a tie: the same choice on every device
    });
    mains.slice(1).forEach(function (loser) {
      const i = planIndex(all, loser.id);
      if (i !== -1) { all.plan.entries.splice(i, 1); }
    });
  });
}

// ---------- Sending one entry ----------
// Returns true if it was sent (or needed nothing).
async function planPushOne(env, all, id) {
  const index = planIndex(all, id);
  const entry = index === -1 ? null : all.plan.entries[index];
  const base = all.state.base[id] || null;
  const cloud = env.cloud;

  if (entry && !base) {                                               // brand new
    const result = await cloud.insertPlan(toPlanRow(entry, 1, null));
    if (result.ok) {
      all.state.base[id] = { version: 1, fp: planFingerprint(entry), deleted: false, modifiedAt: result.modified_at || env.now() };
      return true;
    }
    const row = await cloud.fetchPlanRow(id);                         // the cloud already has that id: learn its version, retry
    if (row) { all.state.base[id] = { version: row.version, fp: null, deleted: !!row.deleted_at, modifiedAt: row.modified_at }; }
    return false;
  }
  if (!base) { return true; }                                         // gone and never sent: nothing to do

  if (!entry) {                                                       // removed here
    const result = await cloud.updatePlan(id, base.version, { deleted_at: env.now(), version: base.version + 1 });
    if (result.ok) {
      all.state.base[id] = { version: base.version + 1, fp: null, deleted: true, modifiedAt: result.modified_at || env.now() };
      return true;
    }
  } else {                                                            // changed here
    const result = await cloud.updatePlan(id, base.version, toPlanRow(entry, base.version + 1, null));
    if (result.ok) {
      all.state.base[id] = { version: base.version + 1, fp: planFingerprint(entry), deleted: false, modifiedAt: result.modified_at || env.now() };
      return true;
    }
  }
  const row = await cloud.fetchPlanRow(id);                           // the cloud moved on: learn its version, retry
  if (row) { all.state.base[id] = { version: row.version, fp: base.fp, deleted: !!row.deleted_at, modifiedAt: row.modified_at }; }
  else { delete all.state.base[id]; }
  return false;
}

// ---------- The whole round: fetch what's new, send what's waiting ----------
// Returns { ok: true, pulled, pushed } or { ok: false, kind, message }.
async function syncPlan(env) {
  try {
    let all = readPlanAll(env);
    const rows = await env.cloud.pullPlan(all.state.lastPulled);

    all = readPlanAll(env);                                           // (re-read: the person may have edited meanwhile)
    let pulled = 0;
    let newest = all.state.lastPulled;
    rows.forEach(function (row) {
      if (!newest || row.modified_at > newest) { newest = row.modified_at; }
      if (planReconcile(all, row)) { pulled++; }
    });
    all.state.lastPulled = newest;
    planSettleMains(env, all);
    writePlanAll(env, all);

    let pushed = 0;
    for (let pass = 0; pass < 4; pass++) {
      all = readPlanAll(env);
      const ids = planPendingIds(all);
      if (ids.length === 0) { break; }
      for (let i = 0; i < ids.length; i++) {
        if (await planPushOne(env, all, ids[i])) { pushed++; }
      }
      writePlanAll(env, all);
    }

    // Tidy the cloud: "removed" marks older than 30 days can go for good.
    const cutoff = new Date(Date.parse(env.now()) - PLAN_TOMBSTONE_DAYS * 24 * 3600 * 1000).toISOString();
    await env.cloud.purgeOldPlan(cutoff);
    return { ok: true, pulled: pulled, pushed: pushed };
  } catch (error) {
    if (error && error.offline) { return { ok: false, kind: "offline" }; }
    if (error && error.kind === "damaged") { return { ok: false, kind: "damaged", message: "Your meal plan couldn't be read, so it wasn't synced." }; }
    return { ok: false, kind: "error", message: (error && error.message) ? error.message : "Something went wrong." };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PLAN_SYNC_KEY: PLAN_SYNC_KEY, syncPlan: syncPlan, planPendingCount: planPendingCount, toPlanRow: toPlanRow,
    fromPlanRow: fromPlanRow, planFingerprint: planFingerprint
  };
}
