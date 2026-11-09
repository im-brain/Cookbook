// Checks for js/shopping-sync.js. Run: node tests/shopping-sync.test.js
// Two pretend phones share one pretend cloud (a table with a version check, like the real one).
const shop = require("../js/shopping.js");
const ss = require("../js/shopping-sync.js");
let passed = 0, failed = 0;
function check(name, ok, extra) { if (ok) { passed++; } else { failed++; console.log("FAIL:", name, extra === undefined ? "" : JSON.stringify(extra)); } }

function makeCloud() {
  let clock = 0;
  const cloud = {
    rows: {}, offline: false,
    stamp() { clock++; return "2026-11-09T10:00:" + String(clock).padStart(2, "0") + ".000Z"; },
    guard() { if (cloud.offline) { throw { offline: true }; } },
    async pullShop(since) {
      cloud.guard();
      return Object.values(cloud.rows).filter(function (r) { return !since || r.modified_at >= since; })
        .sort(function (a, b) { return a.modified_at < b.modified_at ? -1 : 1; }).map(function (r) { return JSON.parse(JSON.stringify(r)); });
    },
    async fetchShopRow(id) { cloud.guard(); return cloud.rows[id] ? JSON.parse(JSON.stringify(cloud.rows[id])) : null; },
    async insertShop(row) {
      cloud.guard();
      if (cloud.rows[row.id]) { return { ok: false }; }
      const stamped = Object.assign({ value: {} }, JSON.parse(JSON.stringify(row)), { modified_at: cloud.stamp() });
      cloud.rows[row.id] = stamped;
      return { ok: true, modified_at: stamped.modified_at };
    },
    async updateShop(id, baseVersion, patch) {
      cloud.guard();
      const row = cloud.rows[id];
      if (!row || row.version !== baseVersion) { return { ok: false }; }
      const p = JSON.parse(JSON.stringify(patch)); delete p.id;
      Object.assign(row, p, { modified_at: cloud.stamp() });
      return { ok: true, modified_at: row.modified_at };
    },
    async purgeOldShop(cutoff) {
      cloud.guard();
      Object.keys(cloud.rows).forEach(function (id) { const r = cloud.rows[id]; if (r.deleted_at && r.deleted_at < cutoff) { delete cloud.rows[id]; } });
    }
  };
  return cloud;
}

function makePhone(cloud, name) {
  const phone = {
    name: name, shopping: shop.cleanShopping(null), state: null, damaged: false, clockMs: Date.parse("2026-11-09T12:00:00Z"),
    env() {
      return {
        cloud: cloud, userId: "u1",
        loadShopping: function () { return phone.damaged ? null : JSON.parse(JSON.stringify(phone.shopping)); },
        saveShopping: function (s) { phone.shopping = JSON.parse(JSON.stringify(s)); return true; },
        loadState: function () { return phone.state ? JSON.parse(JSON.stringify(phone.state)) : null; },
        saveState: function (s) { phone.state = JSON.parse(JSON.stringify(s)); },
        now: function () { return new Date(phone.clockMs).toISOString(); }
      };
    },
    sync() { return ss.syncShopping(phone.env()); },
    pending() { return ss.shoppingPendingCount(phone.env()); }
  };
  return phone;
}

const W = "2026-11-09";
const onion = { key: "onion", name: "onion", amount: "2", bases: { count: 2 } };
const milk = { key: "milk", name: "milk", amount: "1 cup", bases: { volume: 240 } };

(async function () {
  // ----- tidy round trip -----
  {
    let s = shop.cleanShopping(null);
    s = shop.tickItem(s, W, onion, true);
    s = shop.addExtra(s, W, "paper towels", "x1");
    s = shop.addExtra(s, W, "batteries", "x2");
    s = shop.setPantry(s, "salt", "salt", true);
    s = shop.setAisle(s, "tofu", "Dairy & eggs");
    const atoms = ss.flattenShopping(s);
    check("atoms: tick", atoms["tick|" + W + "|onion"] && atoms["tick|" + W + "|onion"].text === "2");
    check("atoms: seen", atoms["seen|" + W] && atoms["seen|" + W].onion === "onion");
    check("atoms: extras, pantry, aisle", atoms["extra|" + W + "|x1"] && atoms["pantry|salt"] === "salt" && atoms["aisle|tofu"] === "Dairy & eggs");
    const back = ss.rebuildShopping(atoms, s);
    check("round trip is lossless", JSON.stringify(back) === JSON.stringify(shop.cleanShopping(s)), back);
    check("extras keep their order", back.weeks[W].extras.map(function (x) { return x.id; }).join() === "x1,x2");
    check("odd atoms are ignored", ss.normalizeAtom("tick|not-a-date|x", { text: "a", bases: {} }) === null && ss.normalizeAtom("wat|1", 5) === null);
  }

  // ----- first sync sends, a second phone receives -----
  {
    const cloud = makeCloud();
    const a = makePhone(cloud, "A"), b = makePhone(cloud, "B");
    a.shopping = shop.tickItem(a.shopping, W, onion, true);
    a.shopping = shop.addExtra(a.shopping, W, "paper towels", "x1");
    a.shopping = shop.setPantry(a.shopping, "salt", "salt", true);
    check("waiting changes are counted", a.pending() === 4, a.pending());   // seen, tick, extra, pantry
    const r = await a.sync();
    check("A syncs", r.ok && r.pushed === 4, r);
    check("nothing waiting after", a.pending() === 0);
    const rb = await b.sync();
    check("B receives", rb.ok && rb.pulled === 4, rb);
    check("B has the tick, extra and pantry", !!b.shopping.weeks[W].ticks.onion && b.shopping.weeks[W].extras[0].text === "paper towels" && b.shopping.pantry[0] === "salt");
    check("B has nothing waiting", b.pending() === 0);
    const again = await b.sync();
    check("a second round changes nothing", again.ok && again.pulled === 0 && again.pushed === 0, again);
  }

  // ----- un-tick, remove an extra and a pantry item reach the other phone -----
  {
    const cloud = makeCloud();
    const a = makePhone(cloud, "A"), b = makePhone(cloud, "B");
    a.shopping = shop.tickItem(a.shopping, W, milk, true);
    a.shopping = shop.addExtra(a.shopping, W, "soap", "x9");
    a.shopping = shop.setPantry(a.shopping, "salt", "salt", true);
    await a.sync(); await b.sync();
    b.shopping = shop.tickItem(b.shopping, W, milk, false);
    b.shopping = shop.removeExtra(b.shopping, W, "x9");
    b.shopping = shop.setPantry(b.shopping, "salt", "salt", false);
    check("removals are waiting", b.pending() === 3, b.pending());
    await b.sync(); await a.sync();
    check("A sees the un-tick", !a.shopping.weeks[W].ticks.milk);
    check("A sees the extra gone", a.shopping.weeks[W].extras.length === 0);
    check("A sees the pantry item gone", a.shopping.pantry.length === 0);
    check("removal marks are in the cloud", cloud.rows["tick|" + W + "|milk"].deleted_at && cloud.rows["extra|" + W + "|x9"].deleted_at);
  }

  // ----- different items ticked on two phones: both kept -----
  {
    const cloud = makeCloud();
    const a = makePhone(cloud, "A"), b = makePhone(cloud, "B");
    await a.sync(); await b.sync();
    a.shopping = shop.tickItem(a.shopping, W, onion, true);
    b.shopping = shop.tickItem(b.shopping, W, milk, true);
    await a.sync(); await b.sync(); await a.sync();
    check("A has both ticks", !!a.shopping.weeks[W].ticks.onion && !!a.shopping.weeks[W].ticks.milk);
    check("B has both ticks", !!b.shopping.weeks[W].ticks.onion && !!b.shopping.weeks[W].ticks.milk);
  }

  // ----- same item changed on both: the last edit wins, and both end up equal -----
  {
    const cloud = makeCloud();
    const a = makePhone(cloud, "A"), b = makePhone(cloud, "B");
    a.shopping = shop.setAisle(a.shopping, "tofu", "Produce");
    await a.sync(); await b.sync();
    a.shopping = shop.setAisle(a.shopping, "tofu", "Frozen");
    b.shopping = shop.setAisle(b.shopping, "tofu", "Bakery");
    await a.sync();                                  // A first
    await b.sync();                                  // B later: B's is the last edit
    await a.sync();
    check("last edit wins on both phones", a.shopping.aisles.tofu === "Bakery" && b.shopping.aisles.tofu === "Bakery", [a.shopping.aisles, b.shopping.aisles]);
    check("no change left waiting", a.pending() === 0 && b.pending() === 0);
  }

  // ----- tick on A while B removes the same tick: no crash, both agree -----
  {
    const cloud = makeCloud();
    const a = makePhone(cloud, "A"), b = makePhone(cloud, "B");
    a.shopping = shop.tickItem(a.shopping, W, onion, true);
    await a.sync(); await b.sync();
    a.shopping = shop.tickItem(a.shopping, W, onion, false);
    b.shopping = shop.tickItem(b.shopping, W, onion, false);
    b.shopping = shop.tickItem(b.shopping, W, onion, true);
    await a.sync(); await b.sync(); await a.sync();
    check("both agree after a clash", !!a.shopping.weeks[W].ticks.onion === !!b.shopping.weeks[W].ticks.onion);
  }

  // ----- "Got it" (seen map replaced) travels -----
  {
    const cloud = makeCloud();
    const a = makePhone(cloud, "A"), b = makePhone(cloud, "B");
    a.shopping = shop.tickItem(a.shopping, W, onion, true);
    await a.sync(); await b.sync();
    a.shopping = shop.forgetItem(a.shopping, W, "onion");
    await a.sync(); await b.sync();
    check("forget reaches B", !b.shopping.weeks[W] || (!b.shopping.weeks[W].ticks.onion && !(b.shopping.weeks[W].seen || {}).onion));
  }

  // ----- offline: changes are kept and sent later; bad data is never written -----
  {
    const cloud = makeCloud();
    const a = makePhone(cloud, "A");
    a.shopping = shop.addExtra(a.shopping, W, "eggs", "x5");
    cloud.offline = true;
    const off = await a.sync();
    check("offline is reported", !off.ok && off.kind === "offline");
    check("the change is kept", a.shopping.weeks[W].extras.length === 1 && a.pending() === 1);
    cloud.offline = false;
    const on = await a.sync();
    check("sent later", on.ok && a.pending() === 0 && !!cloud.rows["extra|" + W + "|x5"]);
    a.damaged = true;
    const bad = await a.sync();
    check("damaged data is never synced or written", !bad.ok && bad.kind === "damaged");
  }

  // ----- another account signing in starts the bookkeeping again -----
  {
    const cloud = makeCloud();
    const a = makePhone(cloud, "A");
    a.shopping = shop.addExtra(a.shopping, W, "eggs", "x5");
    await a.sync();
    const env = a.env(); env.userId = "u2";
    check("other account: everything counts as waiting", ss.shoppingPendingCount(env) === 1);
  }

  // ----- old removal marks are erased -----
  {
    const cloud = makeCloud();
    const a = makePhone(cloud, "A");
    cloud.rows["extra|" + W + "|old"] = { id: "extra|" + W + "|old", value: {}, version: 2, deleted_at: "2026-09-01T00:00:00.000Z", modified_at: "2026-09-01T00:00:00.000Z" };
    await a.sync();
    check("30-day-old marks are erased", !cloud.rows["extra|" + W + "|old"]);
  }

  console.log(passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})();
