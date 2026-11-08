// js/plan.js: the logic of "This Week" (Version 31, Phase 7 Part A).
// Plain script: it only works out dates and changes the plan list. It never touches the page,
// so it also runs in Node for tests (node tests/plan.test.js).
//
// The plan is stored on the phone under the key "cookbook.plan" (never rename it) as { entries: [...] }.
// One entry is one thing planned for one dinner:
//   { id, date: "2026-11-09", meal: "dinner", kind, role, recipeId, title, servings, note, position }
//   kind: "recipe" | "leftovers" | "out" | "note"        role: "main" | "side"
// Only a recipe can be a side. leftovers / out / note use `note` for their words ("Pizza with Sam").
// `title` is a copy of the recipe's name, so the plan still reads well if the recipe is deleted later.
// Dates are the phone's local calendar date. Nothing says "this week": the week is worked out from
// today's date each time, so on Monday the new week simply becomes This Week.

const PLAN_KEY = "cookbook.plan";   // never rename
const PLAN_KINDS = ["recipe", "leftovers", "out", "note"];
const PLAN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PLAN_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ---------- Dates ----------
// All date maths goes through UTC at midday, so a clock change (daylight saving) can't shift a day.

function isDateText(text) {
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) { return false; }
  const d = dateFromText(text);
  return dateToText(d) === text;
}

function dateFromText(text) {
  const parts = text.split("-");
  return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12));
}

function dateToText(date) {
  return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0") + "-" + String(date.getUTCDate()).padStart(2, "0");
}

function addDays(text, days) {
  const d = dateFromText(text);
  d.setUTCDate(d.getUTCDate() + days);
  return dateToText(d);
}

// The phone's own calendar date today, as text.
function localDateText(now) {
  const n = now || new Date();
  return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
}

// The Monday on or before a date.
function weekStartOf(text) {
  const day = dateFromText(text).getUTCDay();      // 0 = Sunday ... 6 = Saturday
  return addDays(text, -((day + 6) % 7));
}

// The seven dates of a week, Monday first.
function weekDates(start) {
  const list = [];
  for (let i = 0; i < 7; i++) { list.push(addDays(start, i)); }
  return list;
}

function dayName(text) { return PLAN_DAYS[dateFromText(text).getUTCDay()]; }
function dayShort(text) { return dayName(text).slice(0, 3); }
function dayNumber(text) { return dateFromText(text).getUTCDate(); }
function monthShort(text) { return PLAN_MONTHS[dateFromText(text).getUTCMonth()]; }
function prettyDate(text) { return dayName(text) + ", " + monthShort(text) + " " + dayNumber(text); }

// "Nov 2 – 8, 2026", "Nov 30 – Dec 6, 2026", "Dec 28, 2026 – Jan 3, 2027".
function weekLabel(start) {
  const end = addDays(start, 6);
  const a = dateFromText(start);
  const b = dateFromText(end);
  if (a.getUTCFullYear() !== b.getUTCFullYear()) {
    return monthShort(start) + " " + dayNumber(start) + ", " + a.getUTCFullYear() + " – " + monthShort(end) + " " + dayNumber(end) + ", " + b.getUTCFullYear();
  }
  if (a.getUTCMonth() !== b.getUTCMonth()) {
    return monthShort(start) + " " + dayNumber(start) + " – " + monthShort(end) + " " + dayNumber(end) + ", " + b.getUTCFullYear();
  }
  return monthShort(start) + " " + dayNumber(start) + " – " + dayNumber(end) + ", " + b.getUTCFullYear();
}

// ---------- Cleaning (also used for backup files) ----------

function cleanText(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Returns a tidy entry, or null if it can't be used. Fields are always in this order.
function cleanPlanEntry(raw) {
  if (!raw || typeof raw !== "object") { return null; }
  if (typeof raw.id !== "string" || raw.id === "" || !isDateText(raw.date)) { return null; }
  const kind = PLAN_KINDS.indexOf(raw.kind) !== -1 ? raw.kind : null;
  if (kind === null) { return null; }
  const role = kind === "recipe" && raw.role === "side" ? "side" : "main";
  let servings = null;
  if (kind === "recipe" && typeof raw.servings === "number" && isFinite(raw.servings) && raw.servings > 0 && raw.servings <= 999) {
    servings = raw.servings;
  }
  const entry = {
    id: raw.id.slice(0, 80),
    date: raw.date,
    meal: "dinner",
    kind: kind,
    role: role,
    recipeId: kind === "recipe" ? cleanText(raw.recipeId, 80) : "",
    title: kind === "recipe" ? cleanText(raw.title, 200) : "",
    servings: servings,
    note: cleanText(raw.note, 300),
    position: Number.isInteger(raw.position) && raw.position >= 0 ? raw.position : (role === "main" ? 0 : 1)
  };
  // A recipe needs something to point at; the others need a few words (leftovers may be left blank).
  if (kind === "recipe" && entry.recipeId === "") { return null; }
  if (kind === "note" && entry.note === "") { return null; }
  return entry;
}

// A whole plan from saved or imported data. Always returns { entries: [...] }, one main per day.
function cleanPlan(raw) {
  const list = raw && Array.isArray(raw.entries) ? raw.entries : [];
  const seen = {};
  const mains = {};
  const entries = [];
  list.forEach(function (item) {
    const entry = cleanPlanEntry(item);
    if (!entry || seen[entry.id]) { return; }
    if (entry.role === "main") {
      if (mains[entry.date]) { return; }       // a day has one main; keep the first
      mains[entry.date] = true;
    }
    seen[entry.id] = true;
    entries.push(entry);
  });
  return { entries: entries };
}

function copyPlan(plan) {
  return { entries: plan.entries.map(function (e) { return Object.assign({}, e); }) };
}

// ---------- Reading ----------

// What is planned on one date: { main: entry|null, sides: [entries] }.
function dayOf(plan, date) {
  let main = null;
  const sides = [];
  plan.entries.forEach(function (e) {
    if (e.date !== date) { return; }
    if (e.role === "main") { main = e; } else { sides.push(e); }
  });
  sides.sort(function (a, b) { return a.position - b.position; });
  return { main: main, sides: sides };
}

function entryById(plan, id) {
  return plan.entries.find(function (e) { return e.id === id; }) || null;
}

// Weeks (their Mondays) that have something planned, newest first. `excluding` leaves one week out.
function weeksWithPlans(plan, excluding) {
  const found = {};
  plan.entries.forEach(function (e) {
    const start = weekStartOf(e.date);
    if (start !== excluding) { found[start] = (found[start] || 0) + (e.role === "main" ? 1 : 0); }
  });
  return Object.keys(found).sort().reverse().map(function (start) { return { start: start, dinners: found[start] }; });
}

// ---------- Changing (each returns a new plan; the old one is left alone) ----------

// Plan something. fields: { kind, role, recipeId, title, servings, note }. Adding a main to a day
// that already has one replaces it (its sides stay). A new side goes to the end of that day's sides.
function addEntry(plan, date, fields, id) {
  const next = copyPlan(plan);
  const role = fields.kind === "recipe" && fields.role === "side" ? "side" : "main";
  if (role === "main") {
    next.entries = next.entries.filter(function (e) { return !(e.date === date && e.role === "main"); });
  }
  let position = 0;
  if (role === "side") {
    position = 1 + next.entries.filter(function (e) { return e.date === date && e.role === "side"; }).length;
  }
  const entry = cleanPlanEntry({
    id: id, date: date, kind: fields.kind, role: role, recipeId: fields.recipeId, title: fields.title,
    servings: fields.servings, note: fields.note, position: position
  });
  if (!entry) { return null; }
  next.entries.push(entry);
  return next;
}

// Change what an existing entry is (keeps its day, role and place).
function changeEntry(plan, id, fields) {
  const old = entryById(plan, id);
  if (!old) { return null; }
  const next = copyPlan(plan);
  const index = next.entries.findIndex(function (e) { return e.id === id; });
  const entry = cleanPlanEntry({
    id: id, date: old.date, kind: fields.kind, role: old.role, recipeId: fields.recipeId, title: fields.title,
    servings: fields.servings, note: fields.note, position: old.position
  });
  if (!entry) { return null; }
  if (old.role === "main" && entry.role === "main") { next.entries[index] = entry; return next; }
  if (old.role === "side" && entry.kind === "recipe") { next.entries[index] = entry; return next; }
  return null;
}

function removeEntry(plan, id) {
  const next = copyPlan(plan);
  next.entries = next.entries.filter(function (e) { return e.id !== id; });
  return next;
}

// Move a whole day's dinner (main and sides) to another date. If that date already has a dinner,
// the two days swap places, so nothing is lost.
function moveDay(plan, from, to) {
  if (from === to || !isDateText(to)) { return plan; }
  const next = copyPlan(plan);
  next.entries.forEach(function (e) {
    if (e.date === from) { e.date = to; } else if (e.date === to) { e.date = from; }
  });
  return next;
}

// Move one side dish to another date (it stays a side).
function moveSide(plan, id, to) {
  const next = copyPlan(plan);
  const e = entryById(next, id);
  if (!e || e.role !== "side" || !isDateText(to)) { return plan; }
  e.date = to;
  e.position = 1 + next.entries.filter(function (x) { return x.date === to && x.role === "side" && x.id !== id; }).length;
  return next;
}

// Copy a past (or any) week into another week. Days that already have something are left alone.
// newId() gives each copy its own id. Returns { plan, copiedDays }.
function reuseWeek(plan, fromStart, toStart, newId) {
  const next = copyPlan(plan);
  let copiedDays = 0;
  for (let i = 0; i < 7; i++) {
    const from = addDays(fromStart, i);
    const to = addDays(toStart, i);
    const source = dayOf(plan, from);
    const target = dayOf(plan, to);
    if (!source.main && source.sides.length === 0) { continue; }
    if (target.main || target.sides.length > 0) { continue; }
    plan.entries.forEach(function (e) {
      if (e.date !== from) { return; }
      const copy = Object.assign({}, e, { id: newId(), date: to });
      next.entries.push(copy);
    });
    copiedDays++;
  }
  return { plan: next, copiedDays: copiedDays };
}

// Guess what "leftovers" are of: the nearest earlier dinner that was a recipe (within 3 days).
function guessLeftoversOf(plan, date) {
  for (let i = 1; i <= 3; i++) {
    const main = dayOf(plan, addDays(date, -i)).main;
    if (main && main.kind === "recipe") { return main.title; }
  }
  return "";
}

// Merge a plan from a backup file into the phone's plan. Nothing is deleted; entries whose id is
// already on the phone stay as they are. Returns { plan, added }.
function mergePlans(onPhone, fromFile) {
  const merged = copyPlan(onPhone);
  const have = {};
  merged.entries.forEach(function (e) { have[e.id] = true; });
  const mains = {};
  merged.entries.forEach(function (e) { if (e.role === "main") { mains[e.date] = true; } });
  let added = 0;
  fromFile.entries.forEach(function (e) {
    if (have[e.id]) { return; }
    if (e.role === "main" && mains[e.date]) { return; }   // the phone's dinner for that day stays
    merged.entries.push(Object.assign({}, e));
    have[e.id] = true;
    if (e.role === "main") { mains[e.date] = true; }
    added++;
  });
  return { plan: merged, added: added };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PLAN_KEY: PLAN_KEY, isDateText: isDateText, addDays: addDays, localDateText: localDateText,
    weekStartOf: weekStartOf, weekDates: weekDates, dayName: dayName, dayShort: dayShort,
    dayNumber: dayNumber, monthShort: monthShort, prettyDate: prettyDate, weekLabel: weekLabel,
    cleanPlanEntry: cleanPlanEntry, cleanPlan: cleanPlan, dayOf: dayOf, entryById: entryById,
    weeksWithPlans: weeksWithPlans, addEntry: addEntry, changeEntry: changeEntry,
    removeEntry: removeEntry, moveDay: moveDay, moveSide: moveSide, reuseWeek: reuseWeek,
    guessLeftoversOf: guessLeftoversOf, mergePlans: mergePlans
  };
}
