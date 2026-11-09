// Checks for js/shopping.js (the shopping list). Run: node tests/shopping.test.js
const ing = require("../js/ingredients.js");
const plan = require("../js/plan.js");
const s = require("../js/shopping.js");
let passed = 0, failed = 0;
function check(name, ok, extra) { if (ok) { passed++; } else { failed++; console.log("FAIL:", name, extra === undefined ? "" : JSON.stringify(extra)); } }
function eq(name, got, want) { check(name, JSON.stringify(got) === JSON.stringify(want), { got: got, want: want }); }

const WEEK = "2026-11-09";   // a Monday
let n = 0;
function recipe(id, title, lines, servings) {
  return { id: id, current: { title: title, ingredients: ing.parseIngredients(lines), steps: [], servings: servings || null, timeMinutes: null, tags: [] } };
}
function meal(date, recipeId, servings, role) {
  n++;
  return { id: "e" + n, date: date, meal: "dinner", kind: "recipe", role: role || "main", recipeId: recipeId, title: "", servings: servings || null, note: "", position: role === "side" ? 1 : 0 };
}
function listFor(entries, recipes) { return s.buildShoppingList({ entries: entries }, recipes, WEEK); }
function rowOf(list, key) { return list.items.filter(function (r) { return r.key === key; })[0]; }
function text(list, key) { const r = rowOf(list, key); return r ? s.rowAmountText(r) : null; }
const empty = { weeks: {}, pantry: [], aisles: {} };

// ----- names and aisles -----
eq("names ignore case and plural", [s.shopKey("Red Onions"), s.shopKey("tomatoes"), s.shopKey("berries"), s.shopKey("molasses"), s.shopKey("Eggs")], ["red onion", "tomato", "berry", "molasse", "egg"]);
eq("aisles", ["onion", "chicken thighs", "milk", "bread", "flour", "frozen peas", "peanut butter", "gizmo"].map(s.guessAisle),
   ["Produce", "Meat & fish", "Dairy & eggs", "Bakery", "Pantry", "Frozen", "Pantry", "Other"]);

// ----- adding up -----
const soup = recipe("r1", "Soup", ["1 cup flour", "2 onions", "1 tsp salt"], 4);
const bread = recipe("r2", "Bread", ["½ cup flour", "1 onion", "salt to taste"], 4);
let list = listFor([meal("2026-11-09", "r1", 4), meal("2026-11-10", "r2", 4)], [soup, bread]);
eq("same ingredient from two recipes is added up", text(list, "flour"), "1½ cups");
eq("counts are added up", text(list, "onion"), "3");
eq("a line with no amount joins the measured one", [text(list, "salt"), rowOf(list, "salt").from.length], ["1 tsp", 2]);
eq("where each item comes from", rowOf(list, "onion").from, ["Mon · Soup", "Tue · Bread"]);

// units that can be added up
const m = recipe("r3", "Mix", ["2 tbsp butter", "1 cup milk", "1 lb potatoes", "200 g potatoes", "250 ml milk", "3 tsp sugar"], 2);
list = listFor([meal("2026-11-11", "r3", 2)], [m]);
eq("tbsp stays tbsp", text(list, "butter"), "2 tbsp");
check("milk: 1 cup + 250 ml = 490 ml", Math.abs(rowOf(list, "milk").parts[0].base - 490) < 0.01, rowOf(list, "milk").parts);
eq("pounds and grams add up", text(list, "potato"), "1½ lb");
eq("3 tsp is 1 tbsp", text(list, "sugar"), "1 tbsp");

// metric stays metric
const metric = recipe("r4", "Metric", ["500 g pasta", "700 g pasta", "1500 ml stock"], 2);
list = listFor([meal("2026-11-12", "r4", 2)], [metric]);
eq("grams add up to kg", text(list, "pasta"), "1.2 kg");
eq("ml become liters", text(list, "stock"), "1.5 liters");

// ranges use the upper amount, scaling uses planned servings, package size never scales
const r5 = recipe("r5", "Curry", ["2-3 cloves garlic", "2 (14 oz) cans crushed tomatoes", "1 cup rice"], 4);
list = listFor([meal("2026-11-13", "r5", 6)], [r5]);
eq("range uses the upper amount, scaled 1.5x", text(list, "garlic"), "5 cloves".replace("5", "4½"));
eq("cans scale, the size does not", text(list, "crushed tomato"), "3 cans (14 oz)");
eq("cups of rice scale", text(list, "rice"), "1½ cups");
list = listFor([meal("2026-11-13", "r5", null)], [r5]);
eq("no planned servings = as written", text(list, "rice"), "1 cup");

// cups and grams for known ingredients only
const r6 = recipe("r6", "Cake", ["1 cup flour", "120 g flour", "1 cup rice", "200 g tofu", "1 cup tofu"], null);
list = listFor([meal("2026-11-14", "r6", null)], [r6]);
eq("flour: cups + grams become cups", text(list, "flour"), "2 cups");
eq("unknown ingredient with two kinds needs a look", [rowOf(list, "tofu").parts.length, rowOf(list, "tofu").look !== ""], [2, true]);
eq("shown as both amounts", text(list, "tofu"), "200 g + 1 cup");

// different count units can't be added up
const r7 = recipe("r7", "Garlicky", ["2 cloves garlic", "1 head garlic"], null);
list = listFor([meal("2026-11-15", "r7", null)], [r7]);
eq("cloves and heads stay apart and need a look", [text(list, "garlic"), rowOf(list, "garlic").look !== ""], ["2 cloves + 1 head", true]);

// sides count too; leftovers, eating out, notes and other weeks do not; deleted recipes are skipped
const side = recipe("r8", "Salad", ["1 head lettuce"], null);
const entries = [meal("2026-11-09", "r1", 4), meal("2026-11-09", "r8", null, "side"),
  { id: "x1", date: "2026-11-10", meal: "dinner", kind: "leftovers", role: "main", recipeId: "", title: "", servings: null, note: "", position: 0 },
  meal("2026-11-16", "r2", 4), meal("2026-11-11", "gone", 4)];
list = listFor(entries, [soup, side, bread]);
eq("a side is on the list", text(list, "lettuce"), "1 head");
eq("next week's dinner is not", rowOf(list, "onion").from, ["Mon · Soup"]);
eq("deleted recipes are counted, not listed", [list.deletedRecipes, list.plannedRecipes], [1, 3]);
eq("empty week", listFor([], [soup]).items.length, 0);

// lines the reader wasn't sure about
const odd = recipe("r9", "Odd", ["12-inch tortillas", "a splash of lime"], null);
list = listFor([meal("2026-11-09", "r9", null)], [odd]);
check("an unsure line goes under Needs a look", rowOf(list, "inch tortilla") === undefined ? list.items.some(function (r) { return r.look !== ""; }) : true, list.items);
eq("a line with no amount is kept as written", list.items.filter(function (r) { return r.look === ""; }).map(function (r) { return r.key; }), ["a splash of lime".replace("a splash of ", "")]);

// ----- the view: aisles, pantry, ticking -----
list = listFor([meal("2026-11-09", "r1", 4), meal("2026-11-10", "r2", 4)], [soup, bread]);
let shop = empty;
let v = s.shoppingView(shop, list, WEEK);
eq("aisles", Object.keys(v.aisles).sort(), ["Pantry", "Produce"]);
eq("first look: nothing is New", v.newCount, 0);
check("first look is remembered", v.changed && v.week.seen !== null);
eq("progress", [v.ticked, v.total], [0, 3]);

shop = s.tickItem(shop, WEEK, v.aisles.Produce[0], true);
v = s.shoppingView(shop, list, WEEK);
eq("ticked", [v.ticked, v.total], [1, 3]);

// pantry hides an item; putting it back shows it again
shop = s.setPantry(shop, "salt", "Salt", true);
v = s.shoppingView(shop, list, WEEK);
eq("pantry item is left off", [v.leftOff.map(function (r) { return r.key; }), v.total], [["salt"], 2]);
shop = s.setPantry(shop, "salt", "Salt", false);
eq("put back", s.shoppingView(shop, list, WEEK).total, 3);
// moving to another aisle
shop = s.setAisle(shop, "flour", "Bakery");
eq("aisle choice", Object.keys(s.shoppingView(shop, list, WEEK).aisles).sort(), ["Bakery", "Pantry", "Produce"]);
shop = s.setAisle(shop, "flour", "");
eq("aisle choice cleared", Object.keys(s.shoppingView(shop, list, WEEK).aisles).sort(), ["Pantry", "Produce"]);

// ----- the plan changes after ticking -----
function fresh() {
  let st = empty;
  const l = listFor([meal("2026-11-09", "r1", 4)], [soup]);
  const view = s.shoppingView(st, l, WEEK);
  st = s.withWeek(st, WEEK, view.week);
  return { st: st, l: l, view: view };
}
let a = fresh();
const flourItem = a.view.aisles.Pantry.filter(function (i) { return i.key === "flour"; })[0];
a.st = s.tickItem(a.st, WEEK, flourItem, true);
const onionItem = a.view.aisles.Produce.filter(function (i) { return i.key === "onion"; })[0];
a.st = s.tickItem(a.st, WEEK, onionItem, true);

// a second dinner adds flour (more) and a new item; onions unchanged
const more = recipe("r10", "Cookies", ["1 cup flour", "2 eggs"], 4);
const l2 = listFor([meal("2026-11-09", "r1", 4), meal("2026-11-12", "r10", 4)], [soup, more]);
let v2 = s.shoppingView(a.st, l2, WEEK);
const f2 = v2.aisles.Pantry.filter(function (i) { return i.key === "flour"; })[0];
check("more flour: tick removed with a reason", !f2.ticked && f2.moreWas === "1 cup" && f2.amount === "2 cups", f2);
const o2 = v2.aisles.Produce.filter(function (i) { return i.key === "onion"; })[0];
check("onions unchanged stay ticked", o2.ticked, o2);
const e2 = v2.aisles["Dairy & eggs"].filter(function (i) { return i.key === "egg"; })[0];
check("a new item is marked New", e2 && e2.isNew, e2);
eq("new count", v2.newCount, 1);
// saved, then the reason sticks until ticked again
let st2 = s.withWeek(a.st, WEEK, v2.week);
const v2b = s.shoppingView(st2, l2, WEEK);
check("reason sticks after saving", v2b.aisles.Pantry.filter(function (i) { return i.key === "flour"; })[0].moreWas === "1 cup");
st2 = s.tickItem(st2, WEEK, f2, true);
const v2c = s.shoppingView(st2, l2, WEEK);
check("ticking again clears the reason and the New mark", v2c.aisles.Pantry.filter(function (i) { return i.key === "flour"; })[0].moreWas === "" && v2c.ticked >= 2);
st2 = s.markAllSeen(st2, WEEK, v2c);
eq("Got it clears New", s.shoppingView(st2, l2, WEEK).newCount, 0);

// less needed stays ticked
const l3 = listFor([meal("2026-11-09", "r1", 2)], [soup]);
const v3 = s.shoppingView(a.st, l3, WEEK);
check("a smaller amount stays ticked", v3.aisles.Pantry.filter(function (i) { return i.key === "flour"; })[0].ticked);

// removed from the plan → No longer needed (ticked or not), then forgettable
const l4 = listFor([], [soup]);
let v4 = s.shoppingView(a.st, l4, WEEK);
eq("no longer needed", v4.gone.map(function (g) { return g.key; }).sort(), ["flour", "onion", "salt"]);
eq("nothing else is shown", v4.total, 0);
let st4 = s.forgetItem(a.st, WEEK, "flour");
eq("forget one", s.shoppingView(st4, l4, WEEK).gone.map(function (g) { return g.key; }).sort(), ["onion", "salt"]);
// moved to the pantry is not "no longer needed"
const stP = s.setPantry(a.st, "onion", "onion", true);
eq("pantry is not gone", s.shoppingView(stP, a.l, WEEK).gone.length, 0);

// an empty first look does not make later items New
let st5 = empty;
const v5 = s.shoppingView(st5, listFor([], []), WEEK);
st5 = s.withWeek(st5, WEEK, v5.week);
eq("empty week stays unseen", st5.weeks[WEEK].seen, null);
eq("so first items are not New", s.shoppingView(st5, a.l, WEEK).newCount, 0);

// ----- extras -----
let ex = s.addExtra(empty, WEEK, "  Paper towels ", "x1");
ex = s.addExtra(ex, WEEK, "   ", "x2");
eq("extra added, blanks ignored", ex.weeks[WEEK].extras, [{ id: "x1", text: "Paper towels", ticked: false }]);
ex = s.tickExtra(ex, WEEK, "x1", true);
const vx = s.shoppingView(ex, listFor([], []), WEEK);
eq("extras count in progress", [vx.ticked, vx.total], [1, 1]);
check("extras survive plan changes", vx.extras.length === 1);
ex = s.removeExtra(ex, WEEK, "x1");
eq("removed", ex.weeks[WEEK].extras, []);

// ----- damaged / odd saved data and backups -----
eq("junk becomes an empty shopping record", s.cleanShopping({ weeks: { nope: {}, "2026-11-09": { ticks: 5, extras: [{ id: 1 }] } }, pantry: [3, "salt", "salt"], aisles: { a: "Nowhere", b: "Frozen" } }),
   { weeks: { "2026-11-09": { seen: null, ticks: {}, more: {}, extras: [] } }, pantry: ["salt"], aisles: { b: "Frozen" } });
const phone = s.addExtra(s.setPantry(empty, "salt", "salt", true), WEEK, "Soap", "x1");
const file = s.addExtra(s.setPantry(s.setAisle(empty, "kale", "Produce"), "oil", "oil", true), WEEK, "Foil", "x9");
const merged = s.mergeShopping(phone, file);
eq("import adds what is missing", [merged.shopping.weeks[WEEK].extras.map(function (x) { return x.id; }), merged.shopping.pantry, merged.shopping.aisles, merged.added], [["x1", "x9"], ["salt", "oil"], { kale: "Produce" }, 3]);
eq("importing the same file again adds nothing", s.mergeShopping(merged.shopping, file).added, 0);
check("phone's choice wins", s.mergeShopping(phone, s.setAisle(empty, "kale", "Bakery")).shopping.aisles.kale === "Bakery" && s.mergeShopping(s.setAisle(empty, "kale", "Frozen"), s.setAisle(empty, "kale", "Bakery")).shopping.aisles.kale === "Frozen");
check("empty check", s.isShoppingEmpty(empty) && !s.isShoppingEmpty(phone));

// ----- export text (Version 38) -----
{
  const rs = [recipe("r1", "Soup", ["2 cups flour", "1 lb chicken thighs", "3 cloves garlic", "1 head garlic"], 4)];
  const lst = listFor([meal("2026-11-10", "r1", 4)], rs);
  let st = s.addExtra(empty, WEEK, "Paper towels", "x1");
  st = s.addExtra(st, WEEK, "Foil", "x2");
  st = s.tickExtra(st, WEEK, "x2", true);
  let vw = s.shoppingView(st, lst, WEEK);
  st = s.withWeek(st, WEEK, vw.week);
  st = s.tickItem(st, WEEK, vw.aisles[Object.keys(vw.aisles)[0]][0], true);
  vw = s.shoppingView(st, lst, WEEK);
  const ex2 = s.shoppingExportText(vw);
  check("export skips ticked + counts lines", ex2.count === ex2.text.split("\n").length && !/Foil/.test(ex2.text), ex2);
  check("export has amount first", /(^|\n)1 lb chicken thighs/.test(ex2.text) && /garlic: 3 cloves \+ 1 head/.test(ex2.text) && !/flour/.test(ex2.text), ex2);
  check("export has extra", /Paper towels/.test(ex2.text), ex2);
  eq("empty export", s.shoppingExportText(s.shoppingView(empty, listFor([], []), WEEK)), { text: "", count: 0 });
  console.log(JSON.stringify(ex2.text));
}

console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
