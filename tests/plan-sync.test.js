// Checks for js/plan-sync.js. Run: node tests/plan-sync.test.js
// Two pretend phones share one pretend cloud (a table with a version check, like the real one).
const plan = require("../js/plan.js");
const ps = require("../js/plan-sync.js");
let passed = 0, failed = 0;
function check(name, ok, extra) { if (ok) { passed++; } else { failed++; console.log("FAIL:", name, extra === undefined ? "" : JSON.stringify(extra)); } }

// ----- a pretend cloud -----
function makeCloud() {
  let clock = 0;
  const cloud = {
    rows: {}, offline: false, calls: 0,
    stamp() { clock++; return "2026-11-09T10:00:" + String(clock).padStart(2, "0") + ".000Z"; },
    guard() { cloud.calls++; if (cloud.offline) { throw { offline: true }; } },
    async pullPlan(since) {
      cloud.guard();
      return Object.values(cloud.rows).filter(function (r) { return !since || r.modified_at >= since; })
        .sort(function (a, b) { return a.modified_at < b.modified_at ? -1 : 1; }).map(function (r) { return Object.assign({}, r); });
    },
    async fetchPlanRow(id) { cloud.guard(); return cloud.rows[id] ? Object.assign({}, cloud.rows[id]) : null; },
    async insertPlan(row) {
      cloud.guard();
      if (cloud.rows[row.id]) { return { ok: false }; }
      const stamped = Object.assign({}, row, { modified_at: cloud.stamp() });
      cloud.rows[row.id] = stamped;
      return { ok: true, modified_at: stamped.modified_at };
    },
    async updatePlan(id, baseVersion, patch) {
      cloud.guard();
      const row = cloud.rows[id];
      if (!row || row.version !== baseVersion) { return { ok: false }; }
      const p = Object.assign({}, patch); delete p.id;
      Object.assign(row, p, { modified_at: cloud.stamp() });
      return { ok: true, modified_at: row.modified_at };
    },
    async purgeOldPlan(cutoff) {
      cloud.guard();
      Object.keys(cloud.rows).forEach(function (id) { const r = cloud.rows[id]; if (r.deleted_at && r.deleted_at < cutoff) { delete cloud.rows[id]; } });
    }
  };
  return cloud;
}

// ----- a pretend phone -----
let ids = 0;
function makePhone(cloud, name) {
  const phone = {
    name: name, plan: { entries: [] }, state: null, damaged: false, clockMs: Date.parse("2026-11-09T12:00:00Z"),
    env() {
      return {
        cloud: cloud, userId: "u1",
        loadPlan: function () { return phone.damaged ? null : { entries: phone.plan.entries.map(function (e) { return Object.assign({}, e); }) }; },
        savePlan: function (p) { phone.plan = { entries: p.entries.map(function (e) { return Object.assign({}, e); }) }; return true; },
        loadState: function () { return phone.state ? JSON.parse(JSON.stringify(phone.state)) : null; },
        saveState: function (s) { phone.state = JSON.parse(JSON.stringify(s)); },
        now: function () { return new Date(phone.clockMs).toISOString(); }
      };
    },
    add(date, fields) { phone.plan = plan.addEntry(phone.plan, date, fields, "e" + (++ids)); return phone.plan.entries.find(function (e) { return e.date === date && (fields.role === "side" ? e.role === "side" : e.role === "main"); }); },
    sync() { return ps.syncPlan(phone.env()); },
    day(date) { return plan.dayOf(phone.plan, date); }
  };
  return phone;
}
const chili = { kind: "recipe", recipeId: "r1", title: "Chili", servings: 6 };
const salad = { kind: "recipe", role: "side", recipeId: "r2", title: "Salad", servings: 2 };

(async function () {
  // ----- Add on A, appears on B -----
  let cloud = makeCloud();
  let A = makePhone(cloud, "A"), B = makePhone(cloud, "B");
  const e1 = A.add("2026-11-10", chili);
  A.add("2026-11-10", salad);
  check("two entries waiting before sync", ps.planPendingCount(A.env()) === 2);
  let r = await A.sync();
  check("A synced", r.ok && r.pushed === 2, r);
  check("nothing waiting after sync", ps.planPendingCount(A.env()) === 0);
  check("cloud holds both", Object.keys(cloud.rows).length === 2);
  r = await B.sync();
  check("B pulled both", r.ok && r.pulled === 2 && B.plan.entries.length === 2, r);
  check("B has the same dinner", B.day("2026-11-10").main.title === "Chili" && B.day("2026-11-10").sides[0].title === "Salad");
  check("B has nothing to send", ps.planPendingCount(B.env()) === 0);
  r = await B.sync();
  check("a second sync changes nothing", r.ok && r.pulled === 0 && r.pushed === 0, r);

  // ----- Edit on B, reaches A -----
  B.plan = plan.changeEntry(B.plan, e1.id, { kind: "recipe", recipeId: "r1", title: "Chili", servings: 8 });
  await B.sync(); await A.sync();
  check("edit reaches A", A.day("2026-11-10").main.servings === 8);

  // ----- Remove on A, reaches B -----
  A.plan = plan.removeEntry(A.plan, A.day("2026-11-10").sides[0].id);
  check("a removal is waiting", ps.planPendingCount(A.env()) === 1);
  await A.sync();
  check("removal is marked in the cloud, not erased", Object.values(cloud.rows).some(function (x) { return x.deleted_at; }));
  await B.sync();
  check("removal reaches B", B.day("2026-11-10").sides.length === 0 && B.day("2026-11-10").main !== null);
  check("B then has nothing waiting", ps.planPendingCount(B.env()) === 0);

  // ----- Offline keeps changes, then sends them -----
  cloud.offline = true;
  B.add("2026-11-11", { kind: "out", note: "Pizza" });
  r = await B.sync();
  check("offline is reported", !r.ok && r.kind === "offline");
  check("the change is kept", B.day("2026-11-11").main.note === "Pizza" && ps.planPendingCount(B.env()) === 1);
  cloud.offline = false;
  r = await B.sync();
  check("sent after coming back", r.ok && r.pushed === 1 && ps.planPendingCount(B.env()) === 0, r);
  await A.sync();
  check("A sees it", A.day("2026-11-11").main && A.day("2026-11-11").main.note === "Pizza");

  // ----- Retrying never duplicates -----
  const before = Object.keys(cloud.rows).length;
  await B.sync(); await B.sync();
  check("repeat syncs add no rows", Object.keys(cloud.rows).length === before);

  // ----- Same dinner edited on both: last edit wins -----
  const pizzaA = A.day("2026-11-11").main;
  A.plan = plan.changeEntry(A.plan, pizzaA.id, { kind: "out", note: "Tacos (A)" });
  B.plan = plan.changeEntry(B.plan, pizzaA.id, { kind: "out", note: "Sushi (B)" });
  await A.sync();           // A goes first
  await B.sync();           // B goes last: B's edit wins
  await A.sync();
  check("last edit wins on both", A.day("2026-11-11").main.note === "Sushi (B)" && B.day("2026-11-11").main.note === "Sushi (B)", [A.day("2026-11-11").main.note, B.day("2026-11-11").main.note]);

  // ----- Edit on one device, removal on the other: the last to sync wins, and both agree -----
  const sushi = A.day("2026-11-11").main;
  A.plan = plan.removeEntry(A.plan, sushi.id);
  B.plan = plan.changeEntry(B.plan, sushi.id, { kind: "out", note: "Ramen" });
  await A.sync(); await B.sync(); await A.sync();
  check("both devices agree after edit vs removal", JSON.stringify(A.plan) === JSON.stringify(B.plan) || (A.day("2026-11-11").main === null && B.day("2026-11-11").main === null), [A.plan.entries.length, B.plan.entries.length]);

  // ----- Two different mains planned for one day: the newer one stays, everywhere -----
  cloud = makeCloud(); A = makePhone(cloud, "A"); B = makePhone(cloud, "B");
  A.add("2026-11-12", { kind: "recipe", recipeId: "r1", title: "Chili", servings: 4 });
  A.add("2026-11-12", salad);
  await A.sync();
  B.add("2026-11-12", { kind: "recipe", recipeId: "r9", title: "Curry", servings: 4 });
  await B.sync();                      // B has never seen A's: B's own new main is "newest" on B
  await A.sync();
  await B.sync();
  await A.sync();
  const mainsA = A.plan.entries.filter(function (e) { return e.date === "2026-11-12" && e.role === "main"; });
  const mainsB = B.plan.entries.filter(function (e) { return e.date === "2026-11-12" && e.role === "main"; });
  check("one main per day on A", mainsA.length === 1, mainsA);
  check("one main per day on B", mainsB.length === 1, mainsB);
  check("both pick the same main", mainsA[0].id === mainsB[0].id, [mainsA[0].title, mainsB[0].title]);
  check("the side stays", A.day("2026-11-12").sides.length === 1 && B.day("2026-11-12").sides.length === 1);
  check("nothing waiting afterwards", ps.planPendingCount(A.env()) === 0 && ps.planPendingCount(B.env()) === 0);
  const liveRows = Object.values(cloud.rows).filter(function (x) { return !x.deleted_at && x.role === "main"; });
  check("the cloud also has one live main", liveRows.length === 1, liveRows.length);

  // ----- The same backup on two phones (same ids): no duplicates, no needless changes -----
  cloud = makeCloud(); A = makePhone(cloud, "A"); B = makePhone(cloud, "B");
  const backupPlan = { entries: [{ id: "same1", date: "2026-11-13", meal: "dinner", kind: "note", role: "main", recipeId: "", title: "", servings: null, note: "Guests", position: 0 }] };
  A.plan = backupPlan; B.plan = JSON.parse(JSON.stringify(backupPlan));
  await A.sync(); await B.sync();
  check("same ids: one row", Object.keys(cloud.rows).length === 1);
  check("same ids: no version churn", cloud.rows.same1.version === 1);
  check("same ids: nothing waiting", ps.planPendingCount(B.env()) === 0);

  // ----- Old removal marks are cleaned up -----
  cloud = makeCloud(); A = makePhone(cloud, "A");
  const gone = A.add("2026-11-14", { kind: "note", note: "old" });
  await A.sync();
  A.plan = plan.removeEntry(A.plan, gone.id);
  await A.sync();
  check("removal mark is in the cloud", cloud.rows[gone.id] && cloud.rows[gone.id].deleted_at);
  A.clockMs += 31 * 24 * 3600 * 1000;
  await A.sync();
  check("mark older than 30 days is purged", !cloud.rows[gone.id]);

  // ----- Safety -----
  cloud = makeCloud(); A = makePhone(cloud, "A");
  A.damaged = true;
  r = await A.sync();
  check("damaged plan: nothing synced, cloud not even asked", !r.ok && r.kind === "damaged" && cloud.calls === 0, r);
  A.damaged = false;
  const other = makePhone(cloud, "A2");
  other.state = { userId: "someone-else", lastPulled: "2026-11-01T00:00:00.000Z", base: { x: { version: 5, fp: "z", deleted: false } } };
  r = await other.sync();
  check("a different account starts the bookkeeping over", r.ok && other.state.userId === "u1" && !other.state.base.x, other.state);
  // an unreadable cloud row is left alone
  cloud.rows.weird = { id: "weird", date: "2026-11-15", kind: "banana", role: "main", recipe_id: "", title: "", servings: null, note: "", position: 0, version: 1, deleted_at: null, modified_at: cloud.stamp() };
  r = await other.sync();
  check("an unreadable row is ignored", r.ok && !other.plan.entries.some(function (e) { return e.id === "weird"; }));
  // cloud sends numbers and dates in its own style
  cloud.rows.s1 = { id: "s1", date: "2026-11-16", kind: "recipe", role: "main", recipe_id: "r1", title: "Soup", servings: "3.00", note: "", position: 0, version: 1, deleted_at: null, modified_at: cloud.stamp() };
  await other.sync();
  const soup = other.plan.entries.find(function (e) { return e.id === "s1"; });
  check("cloud numbers are read as numbers", soup && soup.servings === 3);
  check("a pulled entry is not 'waiting'", ps.planPendingCount(other.env()) === 0);

  // ----- Errors from the cloud -----
  cloud.pullPlan = async function () { throw { kind: "error", message: "The cloud tables aren't set up yet." }; };
  r = await other.sync();
  check("a cloud error is reported with its words", !r.ok && r.kind === "error" && /tables/.test(r.message), r);

  console.log(passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})();
