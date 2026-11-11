// js/planner-ui.js: the "Plan for me" screen (Version 39).
// Plain script, loaded after app.js, js/plan-ui.js, js/shopping-ui.js and js/planner.js (the thinking).
// The suggestion lives only in this file's memory. Recipes, the meal plan, the shopping list and the
// cloud are only READ here, except in one place: plannerSave(), which runs when the person taps
// "Add ... to This Week" in the confirmation sheet, and saves through the planner's normal savePlan().
// Recipe text goes on the page with textContent only, never innerHTML.

// What the person asked for is remembered on this device only (not in backups, not synced).
const PLANNER_PREFS_KEY = "cookbook.planner";   // never rename

const plannerPrefsForm = document.getElementById("planner-prefs");
const plannerResult = document.getElementById("planner-result");
const plannerMessage = document.getElementById("planner-message");
const plannerHave = document.getElementById("planner-have");
const plannerSwapSheet = document.getElementById("planner-swap-sheet");
const plannerConfirmSheet = document.getElementById("planner-confirm-sheet");

// Everything about the session on screen. `week` is null until "Suggest my week" is tapped.
const planner = {
  weekStart: null,      // the Monday of the week being planned
  dinners: 5, eaters: 4,
  week: null,           // the suggestion: { slots, notes, unused, wanted, planned, ... }
  options: null,        // what the suggestion was made from (so swaps and previews agree with it)
  userLocks: {},        // date -> true for dinners the person locked
  shown: {},            // recipe id -> how many times it was suggested and not kept
  seed: 0,
  swapDate: null
};

// ---------- Remembered choices ----------
function loadPlannerPrefs() {
  const prefs = { have: "", dinners: 5, eaters: null, leftovers: true, usePantry: true, priority: "have" };
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(PLANNER_PREFS_KEY)); } catch (error) { saved = null; }
  if (!saved || typeof saved !== "object") { return prefs; }
  if (typeof saved.have === "string") { prefs.have = saved.have.slice(0, 1000); }
  if (Number.isInteger(saved.dinners) && saved.dinners >= 1 && saved.dinners <= 7) { prefs.dinners = saved.dinners; }
  if (Number.isInteger(saved.eaters) && saved.eaters >= 1 && saved.eaters <= 20) { prefs.eaters = saved.eaters; }
  if (saved.leftovers === false) { prefs.leftovers = false; }
  if (saved.usePantry === false) { prefs.usePantry = false; }
  if (PLANNER_PRIORITIES.indexOf(saved.priority) !== -1) { prefs.priority = saved.priority; }
  return prefs;
}

function savePlannerPrefs() {
  try {
    localStorage.setItem(PLANNER_PREFS_KEY, JSON.stringify({
      have: plannerHave.value.slice(0, 1000), dinners: planner.dinners, eaters: planner.eaters,
      leftovers: document.getElementById("planner-leftovers").checked,
      usePantry: document.getElementById("planner-pantry").checked,
      priority: plannerPriority()
    }));
  } catch (error) { /* remembering is only a convenience */ }
}

function plannerPriority() {
  const picked = plannerPrefsForm.querySelector('input[name="planner-priority"]:checked');
  return picked ? picked.value : "have";
}

// How many people usually eat: what most planned dinners say, else what most recipes serve, else 4.
function plannerGuessEaters(plan, recipes) {
  const count = {};
  const tally = function (n) { if (Number.isInteger(n) && n >= 1 && n <= 20) { count[n] = (count[n] || 0) + 1; } };
  (recipes || []).forEach(function (r) { if (r && r.current) { tally(r.current.servings); } });
  let best = 4, most = 0;
  Object.keys(count).forEach(function (n) { if (count[n] > most) { most = count[n]; best = Number(n); } });
  return best;
}

// ---------- Reading the week (only reading) ----------

// Which days of the week can get a suggestion, and what is already there.
// Returns null if the meal plan can't be read.
function plannerWeekInfo() {
  const plan = loadPlan();
  if (plan === null) { return null; }
  const today = planToday();
  const keep = document.getElementById("planner-keep").checked;
  const days = weekDates(planner.weekStart);
  const open = days.filter(function (d) { return d >= today; });
  const busy = open.filter(function (d) { return dayOf(plan, d).main; });
  const past = days.filter(function (d) { return d < today && dayOf(plan, d).main; });
  const free = keep ? open.filter(function (d) { return !dayOf(plan, d).main; }) : open;
  const fixed = past.length + (keep ? busy.length : 0);
  // Dinners planned lately are suggested less: this week's kept ones and the two weeks before.
  const recent = {};
  const firstDay = open.length > 0 ? open[0] : days[0];
  plan.entries.forEach(function (e) {
    if (e.kind !== "recipe" || e.role !== "main") { return; }
    if (!keep && free.indexOf(e.date) !== -1) { return; }     // about to be replaced
    const inWeek = days.indexOf(e.date) !== -1;
    const ago = plannerDaysBetween(e.date, firstDay);
    if (inWeek || (ago > 0 && ago <= 7)) { recent[e.recipeId] = 1; }
    else if (ago > 7 && ago <= 14 && !recent[e.recipeId]) { recent[e.recipeId] = 0.5; }
  });
  return { plan: plan, open: open, busy: busy, free: free, fixed: fixed, recent: recent, keep: keep };
}

// ---------- Opening the screen ----------
function openPlanner(weekStart) {
  const sameWeek = planner.weekStart === weekStart;
  planner.weekStart = weekStart;
  if (!sameWeek) { plannerForget(); }
  const prefs = loadPlannerPrefs();
  plannerHave.value = prefs.have;
  planner.dinners = prefs.dinners;
  planner.eaters = prefs.eaters || plannerGuessEaters(loadPlan(), loadRecipes());
  document.getElementById("planner-leftovers").checked = prefs.leftovers;
  document.getElementById("planner-pantry").checked = prefs.usePantry;
  document.getElementById("planner-keep").checked = true;
  plannerPrefsForm.querySelectorAll('input[name="planner-priority"]').forEach(function (radio) { radio.checked = radio.value === prefs.priority; });
  showScreen(plannerScreen);
  plannerShowStep(planner.week ? "result" : "prefs");
  if (planner.week) { renderPlannerWeek(); }
}

// Forget the suggestion (a new week, or after saving).
function plannerForget() {
  planner.week = null; planner.options = null; planner.userLocks = {}; planner.shown = {}; planner.seed = 0;
}

function plannerShowStep(step) {
  plannerPrefsForm.hidden = step !== "prefs";
  plannerResult.hidden = step !== "result";
  plannerMessage.hidden = true;
  renderPlannerPrefs();
}

function plannerSay(text) {
  plannerMessage.textContent = text;
  plannerMessage.hidden = !text;
}

// The words around the choices: which week, how many are already planned, what "pantry" means.
function renderPlannerPrefs() {
  const today = planToday();
  const thisStart = weekStartOf(today);
  const name = planner.weekStart === thisStart ? "this week" : planner.weekStart === addDays(thisStart, 7) ? "next week" : "the week";
  document.getElementById("planner-week").textContent = "Dinners for " + name + " (" + weekLabel(planner.weekStart) +
    "), chosen from your saved recipes. Nothing is saved until you add it.";

  document.getElementById("planner-dinners").textContent = String(planner.dinners);
  document.getElementById("planner-dinners-minus").disabled = planner.dinners <= 1;
  document.getElementById("planner-dinners-plus").disabled = planner.dinners >= 7;
  document.getElementById("planner-eaters").textContent = String(planner.eaters);
  document.getElementById("planner-eaters-minus").disabled = planner.eaters <= 1;
  document.getElementById("planner-eaters-plus").disabled = planner.eaters >= 20;

  const shopping = loadShopping();
  const always = shopping ? shopping.pantry.length : 0;
  document.getElementById("planner-pantry-hint").textContent = "Salt, pepper, oil and water" +
    (always > 0 ? ", plus " + always + (always === 1 ? " thing" : " things") + " you marked “I always have this”" : "");

  const info = plannerWeekInfo();
  const go = document.getElementById("planner-go");
  const keepRow = document.getElementById("planner-keep-row");
  const hint = document.getElementById("planner-dinners-hint");
  go.disabled = false;
  if (info === null) {
    keepRow.hidden = true;
    hint.textContent = "";
    go.disabled = true;
    plannerSay("Sorry, your meal plan couldn't be read, so nothing can be suggested or changed. Please tell Claude.");
    return;
  }
  keepRow.hidden = info.busy.length === 0;
  document.getElementById("planner-keep-hint").textContent = info.busy.length === 1
    ? "1 dinner is planned from today on. Turn off to let it be replaced."
    : info.busy.length + " dinners are planned from today on. Turn off to let them be replaced.";
  const fresh = Math.min(Math.max(0, planner.dinners - info.fixed), info.free.length);
  if (info.open.length === 0) {
    hint.textContent = "This week is over";
    go.disabled = true;
  } else if (info.fixed > 0) {
    hint.textContent = info.fixed + " already planned, so " + fresh + " new";
    go.disabled = fresh === 0;
  } else if (fresh < planner.dinners) {
    hint.textContent = "Only " + info.free.length + (info.free.length === 1 ? " day is" : " days are") + " left this week";
  } else {
    hint.textContent = "Counting any you have already planned";
  }
}

// ---------- Making a suggestion ----------

// The options for js/planner.js, from the screen and the saved data. Returns null (with a message) if it can't.
function plannerBuildOptions() {
  const recipes = loadRecipes();
  if (recipes === null) { plannerSay("Sorry, your saved recipes couldn't be read, so nothing can be suggested. Please tell Claude."); return null; }
  const info = plannerWeekInfo();
  if (info === null) { plannerSay("Sorry, your meal plan couldn't be read, so nothing can be suggested or changed. Please tell Claude."); return null; }
  const shopping = loadShopping();   // null if damaged: it is only read, so an empty pantry is used
  return {
    recipes: recipes,
    info: info,
    options: {
      dates: info.free,
      dinners: Math.max(0, planner.dinners - info.fixed),
      eaters: planner.eaters,
      leftovers: document.getElementById("planner-leftovers").checked,
      priority: plannerPriority(),
      available: parseFridgeText(plannerHave.value),
      pantry: shopping ? shopping.pantry : [],
      usePantry: document.getElementById("planner-pantry").checked,
      recent: info.recent,
      keepExisting: info.keep
    }
  };
}

function plannerLocksFrom(slots, onlyUserLocks) {
  const locks = [];
  slots.forEach(function (s) {
    if (onlyUserLocks && !planner.userLocks[s.date]) { return; }
    if (s.kind === "cook") { locks.push({ date: s.date, kind: "cook", recipeId: s.recipeId, servings: s.custom ? s.servings : null }); }
    else { locks.push({ date: s.date, kind: "leftovers", sourceDate: s.sourceDate }); }
  });
  return locks;
}

// Runs the planner and shows the result. `again` keeps the locked dinners and varies the rest.
function plannerRun(again) {
  const built = plannerBuildOptions();
  if (built === null) { return; }
  const options = built.options;
  if (again && planner.week) {
    planner.seed++;
    planner.week.slots.forEach(function (s) {
      if (s.kind === "cook" && !planner.userLocks[s.date]) { planner.shown[s.recipeId] = (planner.shown[s.recipeId] || 0) + 1; }
    });
    options.locked = plannerLocksFrom(planner.week.slots, true);
  } else {
    planner.seed = 0; planner.shown = {}; planner.userLocks = {};
    options.locked = [];
  }
  options.seed = planner.seed;
  options.shown = planner.shown;
  if (options.dinners === 0) {
    plannerSay("This week already has " + built.info.fixed + (built.info.fixed === 1 ? " dinner" : " dinners") + " planned. Ask for more dinners, or pick another week.");
    return;
  }
  if (options.dates.length === 0) {
    plannerSay(built.info.open.length === 0 ? "This week is over. Go back and choose this week or a later one."
      : "Every day left in this week already has dinner planned. Turn off “Keep dinners already planned” to replace them, or pick another week.");
    return;
  }
  const week = plannerSuggest(built.recipes, options);
  planner.options = options;
  plannerAdopt(week);
  savePlannerPrefs();
  plannerShowStep("result");
  renderPlannerWeek();
  if (again) { document.getElementById("planner-summary").focus(); }
  window.scrollTo(0, 0);
}

// Takes a fresh suggestion and puts the person's locks back on it.
function plannerAdopt(week) {
  const locks = {};
  week.slots.forEach(function (s) {
    if (planner.userLocks[s.date]) { locks[s.date] = true; }
    s.locked = !!planner.userLocks[s.date];
  });
  planner.userLocks = locks;
  planner.week = week;
}

plannerPrefsForm.addEventListener("submit", function (event) {
  event.preventDefault();
  plannerHave.blur();
  plannerRun(false);
});
document.getElementById("planner-again").addEventListener("click", function () { plannerRun(true); });
document.getElementById("planner-edit").addEventListener("click", function () {
  plannerShowStep("prefs");
  window.scrollTo(0, 0);
});
document.getElementById("planner-back").addEventListener("click", function () {
  showScreen(planScreen);
  openPlanScreen(true);
});
document.getElementById("plan-auto").addEventListener("click", function () {
  if (planViewStart === null) { planViewStart = weekStartOf(planToday()); }
  openPlanner(planViewStart);
});

// The steppers and switches on the first step.
function plannerStep(id, change) {
  document.getElementById(id).addEventListener("click", function () { change(); savePlannerPrefs(); plannerMessage.hidden = true; renderPlannerPrefs(); });
}
plannerStep("planner-dinners-minus", function () { planner.dinners = Math.max(1, planner.dinners - 1); });
plannerStep("planner-dinners-plus", function () { planner.dinners = Math.min(7, planner.dinners + 1); });
plannerStep("planner-eaters-minus", function () { planner.eaters = Math.max(1, planner.eaters - 1); });
plannerStep("planner-eaters-plus", function () { planner.eaters = Math.min(20, planner.eaters + 1); });
document.getElementById("planner-keep").addEventListener("change", function () { plannerMessage.hidden = true; renderPlannerPrefs(); });
["planner-leftovers", "planner-pantry"].forEach(function (id) { document.getElementById(id).addEventListener("change", savePlannerPrefs); });
plannerPrefsForm.querySelectorAll('input[name="planner-priority"]').forEach(function (radio) { radio.addEventListener("change", savePlannerPrefs); });
plannerHave.addEventListener("change", savePlannerPrefs);

// ---------- Drawing the suggested week ----------

function plannerText(tag, className, text) {
  const el = document.createElement(tag);
  if (className) { el.className = className; }
  el.textContent = text;
  return el;
}

function plannerCount(n, one, many) { return n + " " + (n === 1 ? one : many); }

function renderPlannerWeek() {
  const week = planner.week;
  const cooks = week.slots.filter(function (s) { return s.kind === "cook"; });
  const lefts = week.slots.length - cooks.length;
  const summary = document.getElementById("planner-summary");
  summary.tabIndex = -1;
  if (week.slots.length === 0) {
    summary.textContent = "No dinners could be suggested.";
  } else {
    const typed = planner.options.available.length;
    let text = plannerCount(week.slots.length, "dinner", "dinners") + ": " + cooks.length + " to cook" +
      (lefts > 0 ? " and " + plannerCount(lefts, "leftovers night", "leftovers nights") : "") + ".";
    if (typed > 0) { text += " Uses " + (typed - week.unused.length) + " of the " + plannerCount(typed, "thing", "things") + " you listed."; }
    summary.textContent = text;
  }

  const notes = document.getElementById("planner-notes");
  notes.innerHTML = "";
  week.notes.forEach(function (note) { notes.append(plannerText("li", "", note)); });
  if (week.unused.length > 0 && week.slots.length > 0) {
    notes.append(plannerText("li", "", "Not used this week: " + week.unused.join(", ") + "."));
  }
  notes.hidden = notes.children.length === 0;

  const list = document.getElementById("planner-days");
  list.innerHTML = "";
  const recipes = recipeMap();
  week.slots.forEach(function (slot) { list.append(makePlannerDay(slot, recipes)); });

  const has = week.slots.length > 0;
  document.getElementById("planner-again").hidden = !has;
  document.querySelector(".planner-impact").hidden = !has;
  document.querySelector(".planner-savebar").hidden = !has;
  const allLocked = has && week.slots.every(function (s) { return s.locked; });
  document.getElementById("planner-again").disabled = allLocked;
  document.getElementById("planner-review").textContent = "Review and add " + plannerCount(week.slots.length, "dinner", "dinners");
  renderPlannerImpact();
}

// One suggested dinner: what, why, what it uses, and the lock / swap / servings controls.
function makePlannerDay(slot, recipes) {
  const recipe = recipes[slot.recipeId] || null;
  const li = document.createElement("li");
  li.className = "planner-day" + (slot.locked ? " locked" : "");

  const label = document.createElement("p");
  label.className = "planner-daylabel";
  label.append(plannerText("span", "planner-date", dayName(slot.date) + " " + dayNumber(slot.date)));
  const kind = document.createElement("span");
  kind.className = "planner-kind planner-kind-" + slot.kind;
  kind.append(makeIcon(slot.kind === "cook" ? "cook" : "leftovers"), document.createTextNode(slot.kind === "cook" ? "Cook" : "Leftovers"));
  label.append(kind);
  if (slot.locked) {
    const locked = document.createElement("span");
    locked.className = "planner-kind planner-kind-locked";
    locked.append(makeIcon("lock"), document.createTextNode("Locked"));
    label.append(locked);
  }
  li.append(label);

  // Title row: tap it to look at the recipe (Back returns here).
  const main = document.createElement("button");
  main.type = "button";
  main.className = "planner-main";
  const text = document.createElement("span");
  text.className = "meal-text";
  text.append(plannerText("span", "planner-title", slot.kind === "cook" ? slot.title : "Leftovers: " + slot.title));
  const bits = [];
  if (slot.kind === "cook") {
    if (slot.servings) { bits.push("Serves " + slot.servings); }
    if (slot.time) { bits.push(describeTime(slot.time)); }
  } else {
    bits.push("Cooked on " + dayName(slot.sourceDate));
  }
  if (bits.length > 0) { text.append(plannerText("span", "meal-sub", bits.join(" · "))); }
  main.append(makeThumb({ kind: slot.kind === "cook" ? "recipe" : "leftovers" }, recipe), text);
  if (recipe) {
    const eye = makeIcon("chevron");
    eye.classList.add("planner-open");
    main.append(eye);
    main.setAttribute("aria-label", "Look at the recipe " + slot.title);
    main.addEventListener("click", function () {
      backToPlanner = true;
      showRecipe(recipe.id);
    });
  } else {
    main.disabled = true;
  }
  li.append(main);

  const why = document.createElement("ul");
  why.className = "planner-why";
  slot.reasons.forEach(function (reason) { why.append(plannerText("li", "", reason)); });
  if (slot.kind === "cook" && slot.leftoverDates.length > 0 && slot.servings) {
    const rest = Math.min(slot.servings - planner.options.eaters, 99);
    const night = plannerList(slot.leftoverDates.map(dayName));
    why.append(plannerText("li", rest < planner.options.eaters ? "planner-warn" : "",
      rest < planner.options.eaters
        ? "Leftovers may run short: " + planner.options.eaters + " servings tonight leaves " + Math.max(0, rest) + " for " + night
        : planner.options.eaters + " servings tonight, " + rest + " kept for " + night));
  }
  if (slot.kind === "cook" && !slot.baseServings) {
    why.append(plannerText("li", "", "The recipe doesn't say how many it serves, so it is planned as written"));
  }
  if (slot.kind === "cook" && slot.unsure > 0) {
    why.append(plannerText("li", "planner-warn", plannerCount(slot.unsure, "ingredient line", "ingredient lines") + " couldn't be read with confidence. Check the recipe"));
  }
  li.append(why);

  if (slot.kind === "cook") {
    const uses = document.createElement("div");
    uses.className = "planner-uses";
    if (slot.have.length > 0) { uses.append(makePlannerUse("check-circle", "have", "You have", slot.have)); }
    if (slot.buy.length > 0) { uses.append(makePlannerUse("plus-circle", "buy", "To buy", slot.buy)); }
    if (uses.children.length > 0) { li.append(uses); }
  }

  // Controls.
  const tools = document.createElement("div");
  tools.className = "planner-tools";
  const lock = document.createElement("button");
  lock.type = "button";
  lock.className = "tool-button";
  lock.setAttribute("aria-pressed", String(slot.locked));
  lock.setAttribute("aria-label", (slot.locked ? "Unlock " : "Lock ") + dayName(slot.date) + "'s dinner, " + slot.title);
  lock.append(makeIcon(slot.locked ? "lock" : "unlock"), document.createTextNode(slot.locked ? "Locked" : "Lock"));
  lock.addEventListener("click", function () { plannerToggleLock(slot); });
  const swap = document.createElement("button");
  swap.type = "button";
  swap.className = "tool-button";
  swap.setAttribute("aria-label", "Swap " + dayName(slot.date) + "'s dinner, " + slot.title + ", for another recipe");
  swap.append(makeIcon("swap"), document.createTextNode("Swap"));
  swap.addEventListener("click", function () { openPlannerSwap(slot); });
  tools.append(lock, swap);
  if (slot.kind === "cook" && slot.baseServings && slot.servings) {
    const stepper = document.createElement("div");
    stepper.className = "stepper planner-servings";
    stepper.setAttribute("role", "group");
    stepper.setAttribute("aria-label", "Servings for " + slot.title);
    const minus = document.createElement("button");
    minus.type = "button"; minus.className = "round-button"; minus.textContent = "−";
    minus.setAttribute("aria-label", "Fewer servings");
    minus.disabled = slot.servings <= 1;
    const number = plannerText("span", "stepper-number", String(slot.servings));
    number.setAttribute("aria-live", "polite");
    const plus = document.createElement("button");
    plus.type = "button"; plus.className = "round-button"; plus.textContent = "+";
    plus.setAttribute("aria-label", "More servings");
    plus.disabled = slot.servings >= 99;
    minus.addEventListener("click", function () { plannerSetServings(slot, slot.servings - 1, "minus"); });
    plus.addEventListener("click", function () { plannerSetServings(slot, slot.servings + 1, "plus"); });
    stepper.append(minus, number, plus);
    tools.append(stepper);
  }
  li.dataset.date = slot.date;
  li.append(tools);
  return li;
}

function makePlannerUse(icon, kind, label, names) {
  const p = document.createElement("p");
  p.className = "planner-use planner-use-" + kind;
  p.append(makeIcon(icon), plannerText("span", "planner-use-label", label + ": "), document.createTextNode(names.join(", ")));
  return p;
}

// Locking a leftovers night locks the dinner it comes from; unlocking that dinner frees the night too.
function plannerToggleLock(slot) {
  const on = !planner.userLocks[slot.date];
  const set = function (date, value) { if (value) { planner.userLocks[date] = true; } else { delete planner.userLocks[date]; } };
  set(slot.date, on);
  if (slot.kind === "leftovers" && on) { set(slot.sourceDate, true); }
  if (slot.kind === "cook" && !on) { slot.leftoverDates.forEach(function (d) { set(d, false); }); }
  planner.week.slots.forEach(function (s) { s.locked = !!planner.userLocks[s.date]; });
  renderPlannerWeek();
  plannerRefocus(slot.date, ".tool-button");
}

function plannerSetServings(slot, servings, which) {
  slot.servings = Math.max(1, Math.min(99, servings));
  slot.custom = true;
  renderPlannerWeek();
  plannerRefocus(slot.date, which === "minus" ? ".planner-servings .round-button:first-child" : ".planner-servings .round-button:last-child");
}

// After a redraw, put the keyboard / VoiceOver focus back on the control that was used.
function plannerRefocus(date, selector) {
  const row = document.querySelector('.planner-day[data-date="' + date + '"]');
  const target = row ? row.querySelector(selector) : null;
  if (target && !target.disabled) { target.focus({ preventScroll: true }); }
}

// ---------- Shopping impact (a preview: nothing is saved) ----------
const PLANNER_GROUPS_SHOWN = [
  ["have", "Already listed as available", "check-circle", "Check you have enough: the amount shown is what these dinners need."],
  ["more", "Listed, but you may need more", "alert-circle", ""],
  ["buy", "Potentially need to buy", "plus-circle", ""],
  ["look", "Needs a look", "eye", "These can't be added up automatically."]
];

function renderPlannerImpact() {
  const box = document.getElementById("planner-impact");
  box.innerHTML = "";
  if (!planner.week || planner.week.slots.length === 0) { return; }
  const recipes = loadRecipes();
  if (recipes === null) { return; }
  const impact = plannerShoppingImpact(recipes, planner.week.slots, planner.options);

  PLANNER_GROUPS_SHOWN.forEach(function (group) {
    const items = impact[group[0]];
    if (items.length === 0) { return; }
    const section = document.createElement("div");
    section.className = "impact-group impact-" + group[0];
    section.append(plannerText("h3", "", group[1]));
    if (group[3]) { section.append(plannerText("p", "impact-note", group[3])); }
    const list = document.createElement("ul");
    items.forEach(function (item) {
      const li = document.createElement("li");
      const text = document.createElement("span");
      text.className = "impact-text";
      text.append(plannerText("span", "impact-name", item.name));
      const detail = item.why || item.from.join(", ");
      if (detail) { text.append(plannerText("span", "impact-from", detail)); }
      li.append(makeIcon(group[2]), text);
      if (item.amount) { li.append(plannerText("span", "impact-amount", item.amount)); }
      list.append(li);
    });
    section.append(list);
    box.append(section);
  });

  if (impact.pantry.length > 0) {
    const fold = document.createElement("details");
    fold.className = "impact-group impact-pantry";
    fold.append(plannerText("summary", "", "Counted as pantry staples (" + impact.pantry.length + ")"));
    fold.append(plannerText("p", "impact-note", impact.pantry.map(function (i) { return i.name; }).join(", ") +
      ". These still show on your Shopping list unless you marked them “I always have this” there."));
    box.append(fold);
  }
  if (box.children.length === 0) { box.append(plannerText("p", "impact-note", "These dinners need nothing that the app can list.")); }
}

// ---------- Sheets ----------
function plannerOpenSheet(backdrop) {
  backdrop.hidden = false;
  document.body.classList.add("sheet-open");
}
function plannerCloseSheet(backdrop) {
  backdrop.hidden = true;
  if (!document.querySelector(".sheet-backdrop:not([hidden])")) { document.body.classList.remove("sheet-open"); }
}
[plannerSwapSheet, plannerConfirmSheet].forEach(function (backdrop) {
  backdrop.addEventListener("click", function (event) { if (event.target === backdrop) { plannerCloseSheet(backdrop); } });
});
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") { [plannerSwapSheet, plannerConfirmSheet].forEach(function (b) { if (!b.hidden) { plannerCloseSheet(b); } }); }
});

// ---------- Swap one dinner ----------
function openPlannerSwap(slot) {
  planner.swapDate = slot.date;
  document.getElementById("planner-swap-title").textContent = "Swap " + dayName(slot.date) + "'s dinner";
  document.getElementById("planner-swap-search").value = "";
  renderPlannerSwap();
  plannerOpenSheet(plannerSwapSheet);
}

function renderPlannerSwap() {
  const list = document.getElementById("planner-swap-list");
  list.innerHTML = "";
  const recipes = loadRecipes();
  if (recipes === null) { list.append(plannerText("li", "sheet-empty", "Sorry, your saved recipes couldn't be read.")); return; }
  const byId = {};
  recipes.forEach(function (r) { byId[r.id] = r; });
  const words = simplify(document.getElementById("planner-swap-search").value).split(/\s+/).filter(Boolean);
  const choices = plannerAlternatives(recipes, planner.options, planner.week.slots, planner.swapDate)
    .filter(function (c) { return byId[c.recipeId] && matchesSearch(byId[c.recipeId], words); });
  if (choices.length === 0) {
    list.append(plannerText("li", "sheet-empty", words.length > 0 ? "No recipe matches that." : "Every saved recipe is already in this week."));
    return;
  }
  choices.forEach(function (choice) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sheet-recipe";
    const text = document.createElement("span");
    text.className = "sheet-recipe-text";
    text.append(plannerText("span", "sheet-recipe-title", choice.title));
    const bits = [];
    if (choice.have.length > 0) { bits.push("You have " + choice.have.join(", ")); }
    bits.push(choice.buy.length === 0 ? "nothing to buy" : plannerCount(choice.buy.length, "thing", "things") + " to buy");
    if (choice.time) { bits.push(describeTime(choice.time)); }
    if (!choice.suitable) { bits.push("not tagged as a dinner"); }
    text.append(plannerText("span", "sheet-recipe-details", bits.join(" · ")));
    button.append(makeThumb({ kind: "recipe" }, byId[choice.recipeId]), text);
    button.addEventListener("click", function () { plannerSwapTo(choice.recipeId); });
    item.append(button);
    list.append(item);
  });
}

document.getElementById("planner-swap-search").addEventListener("input", renderPlannerSwap);
document.getElementById("planner-swap-search").addEventListener("keydown", function (event) {
  if (event.key === "Enter") { event.preventDefault(); event.target.blur(); }
});
document.getElementById("planner-swap-cancel").addEventListener("click", function () { plannerCloseSheet(plannerSwapSheet); });

// Puts the chosen recipe on that day and keeps every other dinner where it is. If the swapped dinner
// was feeding a leftovers night, the planner works out again where that night's food comes from.
function plannerSwapTo(recipeId) {
  const date = planner.swapDate;
  const recipes = loadRecipes();
  plannerCloseSheet(plannerSwapSheet);
  if (recipes === null || !planner.week) { return; }
  const slots = planner.week.slots;
  const old = slots.find(function (s) { return s.date === date; });
  const locks = [];
  slots.forEach(function (s) {
    if (s.date === date) { return; }
    if (s.kind === "cook") { locks.push({ date: s.date, kind: "cook", recipeId: s.recipeId, servings: s.custom ? s.servings : null }); }
    else if (s.sourceDate !== date) { locks.push({ date: s.date, kind: "leftovers", sourceDate: s.sourceDate }); }
  });
  locks.push({ date: date, kind: "cook", recipeId: recipeId, servings: null });
  const options = Object.assign({}, planner.options, {
    dates: slots.map(function (s) { return s.date; }), dinners: slots.length, locked: locks, seed: 0, shown: {}
  });
  const week = plannerSuggest(recipes, options);
  if (week.slots.length === 0) { plannerSay("Sorry, that swap couldn't be made."); return; }
  // Keep the wider facts of the first suggestion (which days were offered), and the person's changes.
  const custom = {};
  slots.forEach(function (s) { if (s.custom && s.date !== date) { custom[s.date] = s.servings; } });
  week.slots.forEach(function (s) { if (custom[s.date] && s.kind === "cook") { s.servings = custom[s.date]; s.custom = true; } });
  planner.userLocks[date] = true;                       // you chose it, so it stays
  if (old && old.kind === "leftovers") { /* the night is now a cooking night */ }
  week.wanted = planner.week.wanted;
  week.notes = week.notes.concat(planner.week.notes.filter(function (n) { return /^Only \d+ of/.test(n) && week.notes.indexOf(n) === -1; }));
  plannerAdopt(week);
  plannerSay("");
  renderPlannerWeek();
  plannerRefocus(date, ".tool-button");
}

// ---------- Review and save ----------
// The only place anything is saved. The plan is read again at this moment, so the sheet shows
// exactly what will happen even if another device changed the plan in the meantime.
document.getElementById("planner-review").addEventListener("click", function () {
  const plan = loadPlan();
  const message = document.getElementById("planner-confirm-message");
  message.hidden = true;
  const save = document.getElementById("planner-confirm-save");
  const list = document.getElementById("planner-changes");
  list.innerHTML = "";
  document.getElementById("planner-confirm-sub").textContent = weekLabel(planner.weekStart);
  if (plan === null || !planner.week) {
    message.textContent = "Sorry, your meal plan couldn't be read, so nothing can be added. Please tell Claude.";
    message.hidden = false;
    save.hidden = true;
    plannerOpenSheet(plannerConfirmSheet);
    return;
  }
  const changes = plannerChanges(plan, planner.week.slots, planner.options.keepExisting);
  let doing = 0;
  changes.forEach(function (change) {
    const slot = change.slot;
    const li = document.createElement("li");
    li.className = "planner-change planner-change-" + change.action;
    const what = slot.kind === "cook" ? slot.title + (slot.servings ? ", serves " + slot.servings : "") : "Leftovers: " + slot.title;
    const verb = change.action === "add" ? "Add" : change.action === "replace" ? "Replace " + change.was + " with" : "Left alone";
    li.append(plannerText("span", "planner-change-day", dayShort(slot.date) + " " + dayNumber(slot.date)));
    const text = document.createElement("span");
    text.className = "planner-change-text";
    text.append(plannerText("span", "planner-change-verb", verb));
    text.append(plannerText("span", "", change.action === "skip"
      ? (change.was ? "This day now has " + change.was + ", so " + what + " is not added" : what + " is not added, because its dinner isn't")
      : what));
    li.append(text);
    list.append(li);
    if (change.action !== "skip") { doing++; }
  });
  const replacing = changes.filter(function (c) { return c.action === "replace"; }).length;
  document.getElementById("planner-confirm-title").textContent = doing === 0 ? "Nothing to add" : "Add to This Week?";
  document.getElementById("planner-confirm-note").textContent =
    (replacing > 0 ? "A replaced dinner is removed from that day; its side dishes stay. " : "Dinners you already planned stay as they are. ") +
    "Your recipes are not changed. The Shopping list works itself out from the plan, so it will include these dinners. " +
    "You can change or remove any of them afterwards on This Week.";
  save.hidden = doing === 0;
  save.textContent = "Add " + plannerCount(doing, "dinner", "dinners") + " to This Week";
  plannerOpenSheet(plannerConfirmSheet);
});

document.getElementById("planner-confirm-cancel").addEventListener("click", function () { plannerCloseSheet(plannerConfirmSheet); });

document.getElementById("planner-confirm-save").addEventListener("click", function () { plannerSave(); });

function plannerSave() {
  const message = document.getElementById("planner-confirm-message");
  const fail = function (text) { message.textContent = text; message.hidden = false; };
  const plan = loadPlan();
  if (plan === null) { fail("Sorry, your meal plan couldn't be read, so nothing was changed. Please tell Claude."); return; }
  if (!planner.week) { return; }
  const result = plannerApply(plan, planner.week.slots, planner.options.keepExisting, makeId);
  if (result === null) { fail("Sorry, these dinners couldn't be added. Nothing was changed."); return; }
  if (result.added + result.replaced === 0) { plannerCloseSheet(plannerConfirmSheet); return; }
  if (!savePlan(result.plan)) { fail("Sorry, the plan couldn't be saved. The phone's storage for the cookbook may be full. Nothing was changed."); return; }
  plannerCloseSheet(plannerConfirmSheet);
  const weekStart = planner.weekStart;
  plannerForget();
  showScreen(planScreen);
  planViewStart = weekStart;
  openPlanScreen(true);
  showPlanMessage("✓ Added " + plannerCount(result.added + result.replaced, "dinner", "dinners") + " to this week" +
    (result.skipped > 0 ? " (" + result.skipped + " left out because the day was taken)" : "") + ". Your Shopping list now includes them.");
}
