// Checks for js/plan.js (This Week). Run: node tests/plan.test.js
const p = require("../js/plan.js");
let passed = 0, failed = 0;
function check(name, ok, extra) { if (ok) { passed++; } else { failed++; console.log("FAIL:", name, extra === undefined ? "" : JSON.stringify(extra)); } }
function eq(name, got, want) { check(name, JSON.stringify(got) === JSON.stringify(want), { got: got, want: want }); }

let n = 0;
const id = function () { n++; return "id" + n; };
const empty = { entries: [] };

// ----- Weeks and dates -----
eq("Sunday belongs to the week starting Monday", p.weekStartOf("2026-11-08"), "2026-11-02");
eq("Monday starts its own week", p.weekStartOf("2026-11-09"), "2026-11-09");
eq("Wednesday", p.weekStartOf("2026-11-11"), "2026-11-09");
eq("Sunday night to Monday: next week begins", [p.weekStartOf("2026-11-08"), p.weekStartOf("2026-11-09")], ["2026-11-02", "2026-11-09"]);
eq("year end week", p.weekStartOf("2027-01-01"), "2026-12-28");
eq("week dates across the year end", p.weekDates("2026-12-28"), ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
eq("month end", p.addDays("2026-11-30", 1), "2026-12-01");
eq("leap day 2028", p.addDays("2028-02-28", 1), "2028-02-29");
eq("no leap day 2027", p.addDays("2027-02-28", 1), "2027-03-01");
eq("back over a year", p.addDays("2027-01-01", -1), "2026-12-31");
eq("daylight saving (US, Nov 1 2026) keeps whole days", p.weekDates("2026-10-26").map(p.dayNumber), [26, 27, 28, 29, 30, 31, 1]);
eq("daylight saving spring (Mar 8 2026)", p.weekDates("2026-03-02").map(p.dayNumber), [2, 3, 4, 5, 6, 7, 8]);
eq("week label, same month", p.weekLabel("2026-11-02"), "Nov 2 – 8, 2026");
eq("week label, two months", p.weekLabel("2026-11-30"), "Nov 30 – Dec 6, 2026");
eq("week label, two years", p.weekLabel("2026-12-28"), "Dec 28, 2026 – Jan 3, 2027");
eq("day names", [p.dayName("2026-11-08"), p.dayShort("2026-11-09"), p.prettyDate("2026-11-11")], ["Sunday", "Mon", "Wednesday, Nov 11"]);
check("real dates only", p.isDateText("2026-02-28") && !p.isDateText("2026-02-30") && !p.isDateText("2026-2-3") && !p.isDateText(null));
// local date text uses the phone's own date parts
eq("local date text", p.localDateText(new Date(2026, 10, 8, 23, 59)), "2026-11-08");
eq("local date text after midnight", p.localDateText(new Date(2026, 10, 9, 0, 1)), "2026-11-09");

// ----- Planning -----
let plan = p.addEntry(empty, "2026-11-09", { kind: "recipe", recipeId: "r1", title: "Chili", servings: 6 }, id());
check("a main was added", plan && p.dayOf(plan, "2026-11-09").main.title === "Chili");
check("the old plan is untouched", empty.entries.length === 0);
plan = p.addEntry(plan, "2026-11-09", { kind: "recipe", role: "side", recipeId: "r2", title: "Bread", servings: 4 }, id());
plan = p.addEntry(plan, "2026-11-09", { kind: "recipe", role: "side", recipeId: "r3", title: "Salad", servings: 2 }, id());
eq("sides keep their order", p.dayOf(plan, "2026-11-09").sides.map(function (e) { return e.title; }), ["Bread", "Salad"]);
plan = p.addEntry(plan, "2026-11-09", { kind: "recipe", recipeId: "r4", title: "Soup", servings: 3 }, id());
check("a new main replaces the old one", p.dayOf(plan, "2026-11-09").main.title === "Soup" && plan.entries.filter(function (e) { return e.role === "main"; }).length === 1);
check("sides stay when the main is replaced", p.dayOf(plan, "2026-11-09").sides.length === 2);
check("a recipe needs a recipe id", p.addEntry(empty, "2026-11-09", { kind: "recipe", recipeId: "", title: "x" }, id()) === null);
check("a note needs words", p.addEntry(empty, "2026-11-09", { kind: "note", note: "  " }, id()) === null);
check("eating out can be blank", p.addEntry(empty, "2026-11-09", { kind: "out", note: "" }, id()) !== null);
check("leftovers can be blank", p.addEntry(empty, "2026-11-09", { kind: "leftovers", note: "" }, id()) !== null);
check("only a recipe can be a side", p.addEntry(empty, "2026-11-09", { kind: "note", role: "side", note: "hi" }, id()).entries[0].role === "main");
check("a bad date is refused", p.addEntry(empty, "2026-13-09", { kind: "note", note: "hi" }, id()) === null);
check("servings must be a sensible number", p.addEntry(empty, "2026-11-09", { kind: "recipe", recipeId: "a", title: "A", servings: -2 }, id()).entries[0].servings === null);
check("a leftovers entry keeps no recipe", p.addEntry(empty, "2026-11-09", { kind: "leftovers", recipeId: "zzz", title: "t", servings: 3, note: "Chili" }, id()).entries[0].recipeId === "");

// ----- Change, remove, move -----
const mainId = p.dayOf(plan, "2026-11-09").main.id;
let changed = p.changeEntry(plan, mainId, { kind: "out", note: "Pizza" });
check("change a main into eating out", changed && p.dayOf(changed, "2026-11-09").main.kind === "out" && p.dayOf(changed, "2026-11-09").main.note === "Pizza");
check("sides survive the change", p.dayOf(changed, "2026-11-09").sides.length === 2);
const sideId = p.dayOf(plan, "2026-11-09").sides[0].id;
check("a side can't turn into a note", p.changeEntry(plan, sideId, { kind: "note", note: "x" }) === null);
check("a side can become another recipe", p.changeEntry(plan, sideId, { kind: "recipe", recipeId: "r9", title: "Rice", servings: 4 }).entries.find(function (e) { return e.id === sideId; }).title === "Rice");
check("change keeps the day", p.changeEntry(plan, mainId, { kind: "note", note: "x" }).entries.find(function (e) { return e.id === mainId; }).date === "2026-11-09");
eq("remove one entry", p.removeEntry(plan, sideId).entries.length, plan.entries.length - 1);
check("remove leaves the original plan", plan.entries.some(function (e) { return e.id === sideId; }));

let moved = p.moveDay(plan, "2026-11-09", "2026-11-12");
check("move a whole day", p.dayOf(moved, "2026-11-12").main.title === "Soup" && p.dayOf(moved, "2026-11-12").sides.length === 2 && !p.dayOf(moved, "2026-11-09").main);
let two = p.addEntry(plan, "2026-11-10", { kind: "out", note: "Tacos" }, id());
let swapped = p.moveDay(two, "2026-11-09", "2026-11-10");
check("moving onto a busy day swaps", p.dayOf(swapped, "2026-11-10").main.title === "Soup" && p.dayOf(swapped, "2026-11-09").main.note === "Tacos");
check("nothing is lost in a swap", swapped.entries.length === two.entries.length);
let sideMoved = p.moveSide(plan, sideId, "2026-11-11");
check("move one side", p.dayOf(sideMoved, "2026-11-11").sides.length === 1 && p.dayOf(sideMoved, "2026-11-09").sides.length === 1);

// ----- Reuse a past week -----
let past = p.addEntry(empty, "2026-11-02", { kind: "recipe", recipeId: "r1", title: "Chicken", servings: 4 }, id());
past = p.addEntry(past, "2026-11-02", { kind: "recipe", role: "side", recipeId: "r2", title: "Potatoes", servings: 4 }, id());
past = p.addEntry(past, "2026-11-03", { kind: "leftovers", note: "Chicken" }, id());
past = p.addEntry(past, "2026-11-10", { kind: "out", note: "Already here" }, id());
const reused = p.reuseWeek(past, "2026-11-02", "2026-11-09", id);
eq("two days copied", reused.copiedDays, 1);   // Tue Nov 10 was already planned
check("the copy lands on the same weekday", p.dayOf(reused.plan, "2026-11-09").main.title === "Chicken" && p.dayOf(reused.plan, "2026-11-09").sides.length === 1);
check("a busy day is left alone", p.dayOf(reused.plan, "2026-11-10").main.note === "Already here");
check("the copies have their own ids", new Set(reused.plan.entries.map(function (e) { return e.id; })).size === reused.plan.entries.length);
check("the past week is unchanged", p.dayOf(reused.plan, "2026-11-02").main.title === "Chicken");
eq("weeks with plans, newest first, minus the one being viewed",
  p.weeksWithPlans(reused.plan, "2026-11-09").map(function (w) { return w.start; }), ["2026-11-02"]);
eq("weeks list counts dinners", p.weeksWithPlans(past, "")[1], { start: "2026-11-02", dinners: 2 });

// ----- Leftovers guess -----
let lo = p.addEntry(empty, "2026-11-02", { kind: "recipe", recipeId: "r1", title: "Chicken", servings: 4 }, id());
eq("leftovers guess: the day before", p.guessLeftoversOf(lo, "2026-11-03"), "Chicken");
eq("leftovers guess: two days later", p.guessLeftoversOf(lo, "2026-11-04"), "Chicken");
eq("leftovers guess: too far away", p.guessLeftoversOf(lo, "2026-11-08"), "");

// ----- Cleaning damaged data -----
check("damaged plan becomes empty", p.cleanPlan(null).entries.length === 0 && p.cleanPlan({ entries: "no" }).entries.length === 0);
const messy = p.cleanPlan({ entries: [
  null, 5, { id: "a" }, { id: "b", date: "2026-02-31", kind: "note", note: "x" },
  { id: "c", date: "2026-11-09", kind: "note", note: "ok" },
  { id: "c", date: "2026-11-10", kind: "note", note: "same id twice" },
  { id: "d", date: "2026-11-09", kind: "out", note: "second main same day" },
  { id: "e", date: "2026-11-09", kind: "recipe", role: "side", recipeId: "r1", title: "Side", servings: 2, position: 1 }
] });
eq("only usable entries survive", messy.entries.map(function (e) { return e.id; }), ["c", "e"]);
const roundTrip = p.cleanPlan(JSON.parse(JSON.stringify(plan)));
eq("a saved plan reads back the same", JSON.stringify(roundTrip), JSON.stringify(plan));
eq("field order is fixed", Object.keys(p.cleanPlanEntry({ position: 0, note: "", servings: null, title: "", recipeId: "", role: "main", kind: "out", meal: "dinner", date: "2026-11-09", id: "z" })),
  ["id", "date", "meal", "kind", "role", "recipeId", "title", "servings", "note", "position"]);

// ----- Backup merge -----
const phonePlan = p.addEntry(empty, "2026-11-09", { kind: "out", note: "Phone's dinner" }, "p1");
const filePlan = p.cleanPlan({ entries: [
  { id: "p1", date: "2026-11-09", kind: "out", note: "same id: ignored" },
  { id: "f2", date: "2026-11-09", kind: "note", note: "same day, different id: phone wins" },
  { id: "f3", date: "2026-11-10", kind: "note", note: "new day: added" }
] });
const merged = p.mergePlans(phonePlan, filePlan);
eq("merge adds only what's missing", merged.added, 1);
check("merge keeps the phone's dinner", p.dayOf(merged.plan, "2026-11-09").main.note === "Phone's dinner");
check("merge never deletes", merged.plan.entries.length === 2);

console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
