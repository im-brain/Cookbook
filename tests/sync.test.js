// Checks for js/sync.js with made-up recipes and a pretend cloud. Run: node tests/sync.test.js
// Two pretend phones ("devices") share one pretend cloud that follows the same version rule as the real one.
const sync = require("../js/sync.js");

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; } else { failed++; console.log("FAIL: " + name + (detail ? "  " + detail : "")); }
}

// Like the cloud's jsonb: object keys come back in a different order.
function sortKeys(v) {
  if (Array.isArray(v)) { return v.map(sortKeys); }
  if (v && typeof v === "object") { const o = {}; Object.keys(v).sort().reverse().forEach(function (k) { o[k] = sortKeys(v[k]); }); return o; }
  return v;
}

// ----- the pretend cloud (the real one is Supabase; rows are kept as plain text so key order is lost, like jsonb) -----
function makeCloud() {
  const rows = {};
  let clock = 1;
  const cloud = {
    rows: rows, offline: false, failNext: 0, loseReply: false, calls: [],
    check() { if (cloud.offline) { throw { offline: true }; } if (cloud.failNext > 0) { cloud.failNext--; throw { kind: "error", message: "boom" }; } },
    store(row) { clock++; const copy = sortKeys(row); copy.modified_at = "2026-11-08T10:00:" + String(clock).padStart(2, "0") + ".000000+00:00"; return copy; },
    async pullChanges(since) { cloud.check(); return Object.keys(rows).map(function (k) { return JSON.parse(JSON.stringify(rows[k])); }).filter(function (r) { return !since || r.modified_at >= since; }).sort(function (a, b) { return a.modified_at < b.modified_at ? -1 : 1; }); },
    async fetchRow(id) { cloud.check(); return rows[id] ? JSON.parse(JSON.stringify(rows[id])) : null; },
    async insertRow(row) { cloud.check(); cloud.calls.push("insert"); if (rows[row.id]) { return { ok: false }; } rows[row.id] = cloud.store(row); return { ok: true }; },
    async updateRow(id, baseVersion, row) {
      cloud.check(); cloud.calls.push("update");
      if (!rows[id] || rows[id].version !== baseVersion) { return { ok: false }; }
      const merged = Object.assign({}, rows[id], row); merged.id = id; rows[id] = cloud.store(merged);
      if (cloud.loseReply) { cloud.loseReply = false; throw { offline: true }; }   // saved, but the phone never heard
      return { ok: true };
    },
    async purgeRow(id) { cloud.check(); if (rows[id] && rows[id].deleted_at) { delete rows[id]; } }
  };
  return cloud;
}

let idCounter = 0;
function makeDevice(cloud, name, userId) {
  const store = {};
  const dev = {
    name: name, store: store, nowText: "2026-11-08T12:00:00.000Z",
    env: {
      cloud: cloud, userId: userId || "user-A",
      loadRecipes() { return store.recipes ? JSON.parse(store.recipes) : []; },
      saveRecipes(list) { store.recipes = JSON.stringify(list); return true; },
      loadTrash() { return store.trash ? JSON.parse(store.trash) : []; },
      saveTrash(list) { store.trash = JSON.stringify(list); },
      loadState() { return store.state ? JSON.parse(store.state) : null; },
      saveState(s) { store.state = JSON.stringify(s); },
      now() { return dev.nowText; },
      today() { return "2026-11-08"; },
      newId() { return "new-" + (++idCounter); }
    },
    recipes() { return dev.env.loadRecipes(); },
    trash() { return dev.env.loadTrash(); },
    get(id) { return dev.recipes().filter(function (r) { return r.id === id; })[0]; },
    add(recipe) { const l = dev.recipes(); l.push(recipe); dev.env.saveRecipes(l); },
    edit(id, change) { const l = dev.recipes(); change(l.filter(function (r) { return r.id === id; })[0]); dev.env.saveRecipes(l); },
    sync() { return sync.syncNow(dev.env); }
  };
  return dev;
}

function recipe(id, title, tags) {
  return {
    id: id, kind: "mine", source: "",
    current: { title: title, ingredients: ["2 cups flour", "1 egg"].map(function (t) { return require("../js/ingredients.js").parseIngredient(t); }), steps: ["Mix.", "Bake."], servings: 4, timeMinutes: 30, tags: tags || ["sync-test"] },
    original: null, notes: "", createdAt: "2026-11-01", updatedAt: "2026-11-01"
  };
}

(async function () {
  // 1. A new tagged recipe is sent once; a second sync sends nothing; another phone receives it.
  {
    const cloud = makeCloud(); const A = makeDevice(cloud, "A"), B = makeDevice(cloud, "B");
    A.add(recipe("r1", "Pancakes"));
    check("pending before first sync", sync.pendingCount(A.env) === 1);
    let r = await A.sync();
    check("first sync ok", r.ok && r.pushed === 1, JSON.stringify(r));
    check("cloud has the row at version 1", cloud.rows.r1 && cloud.rows.r1.version === 1);
    check("nothing pending after sync", sync.pendingCount(A.env) === 0);
    r = await A.sync();
    check("second sync sends nothing", r.ok && r.pushed === 0 && cloud.calls.length === 1, JSON.stringify(cloud.calls));
    r = await B.sync();
    check("other phone receives it", r.ok && B.recipes().length === 1 && B.get("r1").current.title === "Pancakes");
    check("received recipe equals the original (key order restored)", sync.stableText(B.get("r1")) === sync.stableText(A.get("r1")));
    check("received recipe has the same field order as saved ones", JSON.stringify(B.get("r1")) === JSON.stringify(A.get("r1")));
    r = await B.sync();
    check("receiving phone has nothing to send back", r.ok && r.pushed === 0 && sync.pendingCount(B.env) === 0);
  }

  // 2. Phase 5: every recipe is sent, whatever its tags.
  {
    const cloud = makeCloud(); const A = makeDevice(cloud, "A");
    A.add(recipe("real1", "Grandma's stew", ["dinner"]));
    const r = await A.sync();
    check("untagged recipe is sent too", r.ok && Object.keys(cloud.rows).length === 1 && sync.pendingCount(A.env) === 0);
  }

  // 3. Offline: change is kept, nothing lost, then sent when back online. Server error likewise.
  {
    const cloud = makeCloud(); const A = makeDevice(cloud, "A");
    A.add(recipe("r1", "Soup")); await A.sync();
    A.edit("r1", function (x) { x.notes = "less salt"; });
    cloud.offline = true;
    let r = await A.sync();
    check("offline reported", !r.ok && r.kind === "offline");
    check("change kept while offline", sync.pendingCount(A.env) === 1 && A.get("r1").notes === "less salt");
    cloud.offline = false; cloud.failNext = 1;
    r = await A.sync();
    check("server error reported", !r.ok && r.kind === "error" && r.message === "boom");
    check("still pending after server error", sync.pendingCount(A.env) === 1);
    r = await A.sync();
    check("retry succeeds", r.ok && cloud.rows.r1.notes === "less salt" && cloud.rows.r1.version === 2);
  }

  // 4. A reply gets lost after the cloud saved: retry doesn't duplicate or conflict.
  {
    const cloud = makeCloud(); const A = makeDevice(cloud, "A");
    A.add(recipe("r1", "Soup")); await A.sync();
    A.edit("r1", function (x) { x.notes = "more pepper"; });
    cloud.loseReply = true;
    let r = await A.sync();
    check("lost reply looks offline", !r.ok && r.kind === "offline" && cloud.rows.r1.version === 2);
    r = await A.sync();
    check("retry recognises its own change", r.ok && cloud.rows.r1.version === 2 && sync.pendingCount(A.env) === 0 && Object.keys(A.env.loadState().conflicts).length === 0, JSON.stringify(r));
    check("still one recipe", A.recipes().length === 1 && Object.keys(cloud.rows).length === 1);
  }

  // 5. Two phones change different parts: combined automatically.
  {
    const cloud = makeCloud(); const A = makeDevice(cloud, "A"), B = makeDevice(cloud, "B");
    A.add(recipe("r1", "Chili")); await A.sync(); await B.sync();
    A.edit("r1", function (x) { x.notes = "notes from A"; });
    B.edit("r1", function (x) { x.current.tags = ["sync-test", "dinner"]; });
    await A.sync();
    const r = await B.sync();
    check("B sync ok", r.ok, JSON.stringify(r));
    check("B has both changes", B.get("r1").notes === "notes from A" && B.get("r1").current.tags.join() === "sync-test,dinner");
    await A.sync();
    check("A gets the combined recipe", A.get("r1").notes === "notes from A" && A.get("r1").current.tags.join() === "sync-test,dinner");
    check("cloud has the combined recipe", cloud.rows.r1.notes === "notes from A" && cloud.rows.r1.current.tags.join() === "sync-test,dinner");
    check("no conflicts", Object.keys(A.env.loadState().conflicts).length === 0 && Object.keys(B.env.loadState().conflicts).length === 0);
  }

  // 6. Same part changed on both: conflict, nothing overwritten, then each choice works.
  async function conflictSetup() {
    const cloud = makeCloud(); const A = makeDevice(cloud, "A"), B = makeDevice(cloud, "B");
    A.add(recipe("r1", "Chili")); await A.sync(); await B.sync();
    A.edit("r1", function (x) { x.notes = "A's note"; x.current.servings = 6; });
    B.edit("r1", function (x) { x.notes = "B's note"; });
    await A.sync();
    const r = await B.sync();
    return { cloud: cloud, A: A, B: B, r: r };
  }
  {
    const s = await conflictSetup();
    const list = sync.conflictList(s.B.env);
    check("conflict found", s.r.ok && list.length === 1 && list[0].parts.join() === "notes", JSON.stringify(list));
    check("conflict lines describe both sides", list[0].lines[0].here === "B's note" && list[0].lines[0].there === "A's note");
    check("B's text untouched while undecided", s.B.get("r1").notes === "B's note");
    check("undecided conflict isn't sent", sync.pendingCount(s.B.env) === 0 && s.cloud.rows.r1.notes === "A's note");
    await s.B.sync();
    check("still undecided after another sync", sync.conflictList(s.B.env).length === 1 && s.B.get("r1").notes === "B's note");
  }
  {
    const s = await conflictSetup();   // keep this phone's
    check("mine: resolve ok", sync.resolveConflict(s.B.env, "r1", "mine").ok);
    check("mine: now waiting to send", sync.pendingCount(s.B.env) === 1);
    await s.B.sync();
    check("mine: cloud has B's note", s.cloud.rows.r1.notes === "B's note" && s.cloud.rows.r1.version === 3);
    await s.A.sync();
    check("mine: A receives B's note", s.A.get("r1").notes === "B's note");
  }
  {
    const s = await conflictSetup();   // use the other one
    check("theirs: resolve ok", sync.resolveConflict(s.B.env, "r1", "theirs").ok);
    check("theirs: B has A's recipe", s.B.get("r1").notes === "A's note" && s.B.get("r1").current.servings === 6);
    await s.B.sync();
    check("theirs: nothing to send, one recipe", sync.pendingCount(s.B.env) === 0 && s.B.recipes().length === 1 && s.cloud.rows.r1.version === 2);
  }
  {
    const s = await conflictSetup();   // keep both
    check("both: resolve ok", sync.resolveConflict(s.B.env, "r1", "both").ok);
    check("both: two recipes, copy titled", s.B.recipes().length === 2 && s.B.recipes().some(function (r) { return r.current.title === "Chili (copy)" && r.notes === "B's note"; }));
    await s.B.sync(); await s.A.sync();
    check("both: copy reaches the cloud and A", Object.keys(s.cloud.rows).length === 2 && s.A.recipes().length === 2);
  }

  // 7. Delete goes to Recently deleted, reaches the other phone, can be restored.
  {
    const cloud = makeCloud(); const A = makeDevice(cloud, "A"), B = makeDevice(cloud, "B");
    A.add(recipe("r1", "Stew")); await A.sync(); await B.sync();
    check("delete ok", sync.moveToTrash(A.env, "r1").ok && A.recipes().length === 0 && A.trash().length === 1);
    await A.sync();
    check("cloud marks it deleted", !!cloud.rows.r1.deleted_at && cloud.rows.r1.version === 2);
    await B.sync();
    check("other phone moves it to Recently deleted", B.recipes().length === 0 && B.trash().length === 1);
    check("restore ok", sync.restoreFromTrash(B.env, "r1").ok && B.recipes().length === 1 && B.trash().length === 0);
    await B.sync(); await A.sync();
    check("restored everywhere", !cloud.rows.r1.deleted_at && A.recipes().length === 1 && A.trash().length === 0);
  }

  // 8. Deleted on one phone while edited on the other: nothing is lost either way.
  {
    const cloud = makeCloud(); const A = makeDevice(cloud, "A"), B = makeDevice(cloud, "B");
    A.add(recipe("r1", "Stew")); await A.sync(); await B.sync();
    sync.moveToTrash(A.env, "r1"); await A.sync();
    B.edit("r1", function (x) { x.notes = "B kept cooking this"; });
    await B.sync();
    check("edit beats delete: recipe is back in the cloud", !cloud.rows.r1.deleted_at && cloud.rows.r1.notes === "B kept cooking this");
    await A.sync();
    check("edit beats delete: A gets it back", A.get("r1") && A.get("r1").notes === "B kept cooking this" && A.trash().length === 0);
  }
  {
    const cloud = makeCloud(); const A = makeDevice(cloud, "A"), B = makeDevice(cloud, "B");
    A.add(recipe("r1", "Stew")); await A.sync(); await B.sync();
    B.edit("r1", function (x) { x.notes = "edited"; }); await B.sync();
    sync.moveToTrash(A.env, "r1");
    await A.sync();
    check("delete after someone else's edit: edited copy comes back", A.get("r1") && A.get("r1").notes === "edited" && !cloud.rows.r1.deleted_at);
  }

  // 9. Old trash is purged after 30 days, locally and in the cloud.
  {
    const cloud = makeCloud(); const A = makeDevice(cloud, "A");
    A.add(recipe("r1", "Old")); await A.sync();
    sync.moveToTrash(A.env, "r1"); await A.sync();
    A.nowText = "2026-12-20T12:00:00.000Z";
    await A.sync();
    check("purged after 30 days", A.trash().length === 0 && !cloud.rows.r1);
  }
  {
    const cloud = makeCloud(); const A = makeDevice(cloud, "A");
    A.add(recipe("r1", "Young")); await A.sync();
    sync.moveToTrash(A.env, "r1"); await A.sync();
    A.nowText = "2026-12-01T12:00:00.000Z";
    await A.sync();
    check("kept before 30 days", A.trash().length === 1 && !!cloud.rows.r1);
  }
  {
    const cloud = makeCloud(); const A = makeDevice(cloud, "A");
    A.add(recipe("real", "Private", ["dinner"]));
    sync.moveToTrash(A.env, "real");
    check("untagged delete also goes to Recently deleted", A.trash().length === 1 && A.recipes().length === 0);
    check("restore an untagged recipe", sync.restoreFromTrash(A.env, "real").ok && A.recipes().length === 1);
  }

  // 10. A different person signing in starts fresh; one person's rows aren't mixed into the other's bookkeeping.
  {
    const cloud = makeCloud(); const A = makeDevice(cloud, "A", "user-A");
    A.add(recipe("r1", "Soup")); await A.sync();
    A.env.userId = "user-B";
    const st = sync.readAll(A.env).state;
    check("state reset for a different user", st.userId === "user-B" && Object.keys(st.base).length === 0);
  }

  // 11. Damaged data: nothing is written.
  {
    const cloud = makeCloud(); const A = makeDevice(cloud, "A");
    A.env.loadRecipes = function () { return null; };
    const r = await A.sync();
    check("damaged recipes: no sync", !r.ok && r.kind === "damaged" && Object.keys(cloud.rows).length === 0);
  }

  // 12. Many edits in a row make one change each time (versions count up, no duplicates).
  {
    const cloud = makeCloud(); const A = makeDevice(cloud, "A");
    A.add(recipe("r1", "Soup")); await A.sync();
    for (let i = 0; i < 5; i++) { A.edit("r1", function (x) { x.notes = "v" + i; }); await A.sync(); }
    check("version counts saved changes", cloud.rows.r1.version === 6 && Object.keys(cloud.rows).length === 1);
  }

  // 13. A part-by-part check of the combiner itself.
  {
    const base = recipe("r1", "T");
    const local = JSON.parse(JSON.stringify(base)); local.current.title = "T2";
    const remote = JSON.parse(JSON.stringify(base)); remote.current.steps = ["Only step."];
    const m = sync.mergeRecipes(base, local, remote);
    check("merge takes each side's own change", m.conflicts.length === 0 && m.merged.current.title === "T2" && m.merged.current.steps.length === 1);
    const both = JSON.parse(JSON.stringify(base)); both.current.title = "T3";
    check("merge flags a part changed on both sides", sync.mergeRecipes(base, local, both).conflicts.join() === "title");
    check("merge with no common base flags differences", sync.mergeRecipes(null, local, both).conflicts.join() === "title");
  }

  // 14. The move (Phase 5): preview, upload, verify.
  {
    const cloud = makeCloud(); const A = makeDevice(cloud, "A"); const B = makeDevice(cloud, "B");
    A.add(recipe("m1", "Beef stew", ["dinner"])); A.add(recipe("m2", "Apple pie", ["dessert"]));
    B.add(recipe("m2", "Apple pie", ["dessert"])); B.add(recipe("m3", "Pancakes", ["breakfast"]));
    await B.sync();    // the cloud already holds m2 and m3
    const p = await sync.previewMove(A.env);
    check("preview counts", p.ok && p.onPhone === 2 && p.inCloud === 2 && p.toUpload === 1 && p.inBoth === 1 && p.cloudOnly === 1, JSON.stringify(p));
    check("preview lists titles A-Z", p.titles.join() === "Apple pie,Beef stew");
    check("preview changes nothing", Object.keys(cloud.rows).length === 2 && sync.pendingCount(A.env) === 2);
    let v = await sync.verifyMove(A.env);
    check("verify before upload says not ok", !v.ok && v.missing.indexOf("Beef stew") !== -1);
    await A.sync();
    v = await sync.verifyMove(A.env);
    check("verify after upload is ok", v.ok && v.total === 3 && v.matching === 3, JSON.stringify(v));
    check("cloud's own recipe came to the phone", !!A.get("m3"));
    cloud.rows.m1.current.title = "Changed elsewhere";
    v = await sync.verifyMove(A.env);
    check("verify spots a difference", !v.ok && v.different.join() === "Beef stew");
    cloud.offline = true;
    const off = await sync.verifyMove(A.env);
    check("verify offline says so", !off.ok && off.kind === "offline");
    cloud.offline = false;
    A.edit("m2", function (x) { x.notes = "more salt"; });
    v = await sync.verifyMove(A.env);
    check("verify spots a waiting change", !v.ok && v.waiting === 1);
  }

  // Version 33: Verify explains itself, and "make this device match the cloud".
  {
    const cloud = makeCloud(); const A = makeDevice(cloud, "A"); const B = makeDevice(cloud, "B");
    ["s1", "s2", "s3"].forEach(function (id, i) { A.add(recipe(id, "Dish " + (i + 1), ["dinner"])); });
    await A.sync();                                           // the cloud holds three recipes from phone A
    // The iPad B holds the same ids, but with its own notes / servings / an extra recipe only it has.
    ["s1", "s2", "s3"].forEach(function (id, i) { B.add(recipe(id, "Dish " + (i + 1), ["dinner"])); });
    B.edit("s1", function (x) { x.notes = "iPad note"; });
    B.edit("s2", function (x) { x.current.servings = 6; });
    B.add(recipe("only-b", "Only on the iPad", ["dinner"]));
    // Details: which parts differ (before anything is synced, the cloud still has A's copies).
    let v = await sync.verifyMove(B.env);
    const d1 = v.differentDetails.filter(function (d) { return d.title === "Dish 1"; })[0];
    const d2 = v.differentDetails.filter(function (d) { return d.title === "Dish 2"; })[0];
    check("verify names the differing part (notes)", d1 && d1.parts.join() === "notes", JSON.stringify(v.differentDetails));
    check("verify names the differing part (servings)", d2 && d2.parts.join() === "servings", JSON.stringify(v.differentDetails));
    check("verify explains what is waiting", v.waitingDetails.length === 4 && v.waitingDetails.every(function (w) { return w.why === "not sent yet"; }), JSON.stringify(v.waitingDetails));
    check("verify lists the recipe missing in the cloud", v.missing.join() === "Only on the iPad");

    // Looking first changes nothing.
    const before = JSON.stringify(B.recipes());
    const look = await sync.matchCloud(B.env, true);
    check("dry run counts", look.ok && look.cloudTotal === 3 && look.replace === 2 && look.alreadyMatch === 1 && look.onlyHere === 1, JSON.stringify(look));
    check("dry run changes nothing", JSON.stringify(B.recipes()) === before);

    // Doing it: the cloud's copies win, the iPad-only recipe stays, and the usual Upload then Verify pass.
    const done = await sync.matchCloud(B.env, false);
    check("match replaced two", done.ok && done.replace === 2, JSON.stringify(done));
    check("iPad copy of Dish 1 is the cloud's (no iPad note)", B.get("s1").notes === "");
    check("iPad copy of Dish 2 is the cloud's (servings 4)", B.get("s2").current.servings === 4);
    check("the iPad-only recipe is kept", !!B.get("only-b"));
    await B.sync();
    v = await sync.verifyMove(B.env);
    check("after match + upload, verify passes", v.ok && v.total === 4 && v.waiting === 0 && v.conflicts === 0, JSON.stringify(v));
    check("the iPad-only recipe reached the cloud", !!cloud.rows["only-b"]);

    // An open choice is dropped by matching.
    A.edit("s3", function (x) { x.notes = "A's note"; }); await A.sync();
    B.edit("s3", function (x) { x.notes = "B's note"; });
    await B.sync();
    check("a conflict was found", Object.keys(JSON.parse(B.store.state).conflicts).length === 1);
    v = await sync.verifyMove(B.env);
    check("verify reports the open choice", !v.ok && v.conflicts === 1);
    await sync.matchCloud(B.env, false);
    check("matching drops the open choice", Object.keys(JSON.parse(B.store.state).conflicts).length === 0 && B.get("s3").notes === "A's note");
    await B.sync();
    v = await sync.verifyMove(B.env);
    check("verify passes again", v.ok, JSON.stringify(v));

    // Deleted recipes follow the cloud too.
    A.env.saveRecipes(A.recipes()); 
    sync.moveToTrash(A.env, "s1"); await A.sync(); 
    await sync.matchCloud(B.env, false);
    check("a recipe deleted elsewhere moves to Recently deleted here", !B.get("s1") && B.trash().some(function (t) { return t.recipe.id === "s1"; }));
    // Nothing in the cloud: nothing to match.
    const empty = await sync.matchCloud(makeDevice(makeCloud(), "C").env, true);
    check("empty cloud: nothing to match", empty.ok && empty.cloudTotal === 0);
    // Offline is reported, nothing changed.
    cloud.offline = true;
    const off2 = await sync.matchCloud(B.env, false);
    check("match offline says so", !off2.ok && off2.kind === "offline");
    cloud.offline = false;
  }

  console.log(passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})();
