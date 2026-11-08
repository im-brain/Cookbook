// js/plan-ui.js: the "This Week" screen (Version 31, Phase 7 Part A).
// Plain script, loaded AFTER app.js (it uses app.js helpers) and after js/plan.js (the date maths and
// the plan changes). Recipe text goes on the page with textContent only, never innerHTML.

// ---------- Saving the plan on the phone ----------
// loadPlan() returns { entries: [...] }, or null if the saved data is damaged. If it is null, never write.
function loadPlan() {
  let raw = null;
  try { raw = localStorage.getItem(PLAN_KEY); } catch (error) { return null; }
  if (raw === null) { return { entries: [] }; }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.entries)) { return null; }
    return cleanPlan(parsed);
  } catch (error) {
    return null;
  }
}

function savePlan(plan) {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify({ entries: plan.entries }));
    return true;
  } catch (error) {
    return false;
  }
}

// ---------- What's on screen ----------
let planViewStart = null;   // the Monday of the week being shown

const planDays = document.getElementById("plan-days");
const tonightCard = document.getElementById("tonight-card");
const planMessage = document.getElementById("plan-message");
const planDamaged = document.getElementById("plan-damaged");

function showPlanMessage(text) {
  planMessage.textContent = text;
  planMessage.hidden = !text;
}

function planToday() { return localDateText(); }

// Opening the tab starts on this week; coming back from a recipe keeps the week you were on.
function openPlanScreen(keepWeek) {
  if (!keepWeek || planViewStart === null) { planViewStart = weekStartOf(planToday()); }
  showPlanMessage("");
  renderPlan();
}

function recipeMap() {
  const map = {};
  (loadRecipes() || []).forEach(function (r) { map[r.id] = r; });
  return map;
}

// The words for one planned entry: { title, sub, recipe } (recipe is null if it was deleted).
function describeEntry(entry, recipes) {
  if (entry.kind === "recipe") {
    const recipe = recipes[entry.recipeId] || null;
    const bits = [];
    if (!recipe) { bits.push("Recipe deleted"); } else if (entry.role === "main") { bits.push("Main"); }
    if (entry.servings) { bits.push("Serves " + entry.servings); }
    return { title: recipe ? recipe.current.title : entry.title, sub: bits.join(" · "), recipe: recipe };
  }
  if (entry.kind === "leftovers") { return { title: "Leftovers", sub: entry.note, recipe: null }; }
  if (entry.kind === "out") { return { title: "Eating out", sub: entry.note, recipe: null }; }
  return { title: "Note", sub: entry.note, recipe: null };
}

const KIND_ICONS = { leftovers: "leftovers", out: "fork", note: "note" };

// A small square picture: the recipe's photo or tag colour, or an icon for leftovers / eating out / a note.
function makeThumb(entry, recipe) {
  const thumb = document.createElement("span");
  thumb.className = "plan-thumb";
  if (entry.kind !== "recipe") {
    thumb.classList.add("plan-thumb-" + entry.kind);
    thumb.append(makeIcon(KIND_ICONS[entry.kind]));
    return thumb;
  }
  const tags = recipe ? recipe.current.tags : [];
  thumb.style.setProperty("--cover", tags.length > 0 ? tagColor(tags[0]) : "var(--cover-plain)");
  if (recipe && recipe.photo && recipe.photo.id) {
    photoUrl(recipe.photo.id).then(function (url) {
      if (!url) { return; }
      thumb.style.setProperty("--photo", 'url("' + url + '")');
      thumb.classList.add("has-photo");
    });
  }
  return thumb;
}

function sideNames(sides, recipes) {
  return sides.map(function (s) { return describeEntry(s, recipes).title; }).join(", ");
}

function openPlannedRecipe(recipe, entry) {
  backToPlan = true;           // app.js: the recipe page's Back button returns here
  showRecipe(recipe.id);
}

// ---------- Drawing the screen ----------
function renderPlan() {
  const today = planToday();
  const thisStart = weekStartOf(today);
  const nextStart = addDays(thisStart, 7);

  const heading = document.getElementById("plan-heading");
  heading.textContent = planViewStart === thisStart ? "This Week" : (planViewStart === nextStart ? "Next Week" : "Week of " + monthShort(planViewStart) + " " + dayNumber(planViewStart));
  document.getElementById("plan-this-week").setAttribute("aria-pressed", String(planViewStart === thisStart));
  document.getElementById("plan-next-week").setAttribute("aria-pressed", String(planViewStart === nextStart));
  document.getElementById("plan-week-label").textContent = weekLabel(planViewStart);

  const plan = loadPlan();
  planDays.innerHTML = "";
  tonightCard.innerHTML = "";
  tonightCard.hidden = true;
  planDamaged.hidden = plan !== null;
  document.getElementById("plan-reuse").hidden = plan === null;
  if (plan === null) { return; }

  const recipes = recipeMap();
  renderTonight(plan, recipes, today);

  weekDates(planViewStart).forEach(function (date) {
    planDays.append(makeDayRow(plan, recipes, date, today));
  });
}

function renderTonight(plan, recipes, today) {
  const day = dayOf(plan, today);
  if (!day.main) { return; }
  const info = describeEntry(day.main, recipes);

  const label = document.createElement("p");
  label.className = "tonight-label";
  label.textContent = "Tonight · " + dayName(today);
  const title = document.createElement("p");
  title.className = "tonight-title";
  title.textContent = info.title;
  const sub = document.createElement("p");
  sub.className = "tonight-sub";
  const bits = [];
  if (day.main.kind === "recipe") {
    if (day.main.servings) { bits.push("Serves " + day.main.servings); }
  } else if (info.sub) { bits.push(info.sub); }
  if (day.sides.length > 0) { bits.push("side: " + sideNames(day.sides, recipes)); }
  sub.textContent = bits.join(" · ");

  const text = document.createElement("div");
  text.className = "tonight-text";
  text.append(label, title, sub);
  if (info.recipe) {
    const cook = document.createElement("button");
    cook.type = "button";
    cook.className = "button";
    cook.append(makeIcon("cook"), document.createTextNode(" Start cooking"));
    cook.addEventListener("click", function () { startCookingFromPlan(day.main, info.recipe); });
    text.append(cook);
  }
  tonightCard.append(makeThumb(day.main, info.recipe), text);
  tonightCard.hidden = false;
}

// Open the cooking screen for a planned recipe, with the amounts already scaled to the planned servings.
function startCookingFromPlan(entry, recipe) {
  backToPlan = true;
  showRecipe(recipe.id);
  document.getElementById("start-cooking-button").click();
  if (entry.servings && recipe.current.servings && entry.servings !== recipe.current.servings) {
    cookServings = entry.servings;
    setCookFactor(entry.servings / recipe.current.servings);
  }
}

function makeDayRow(plan, recipes, date, today) {
  const day = dayOf(plan, date);
  const li = document.createElement("li");
  li.className = "plan-day";
  if (date === today) { li.classList.add("today"); }
  if (date < today) { li.classList.add("past"); }

  const label = document.createElement("div");
  label.className = "plan-daylabel";
  const name = document.createElement("span");
  name.className = "plan-dayname";
  name.textContent = date === today ? "Today" : dayShort(date);
  const number = document.createElement("span");
  number.className = "plan-daynumber";
  number.textContent = String(dayNumber(date));
  label.append(name, number);

  const body = document.createElement("div");
  body.className = "plan-daybody";
  li.append(label, body);

  if (!day.main) {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "plan-empty";
    add.setAttribute("aria-label", "Plan dinner for " + prettyDate(date));
    add.append(makeIcon("plus"), document.createTextNode(" Plan dinner"));
    add.addEventListener("click", function () { openSheet(date, "main", null); });
    body.append(add);
    return li;
  }

  body.append(makeMealCard(day.main, recipes));
  day.sides.forEach(function (side) {
    const info = describeEntry(side, recipes);
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "side-pill";
    const dot = document.createElement("span");
    dot.className = "side-dot";
    const tags = info.recipe ? info.recipe.current.tags : [];
    dot.style.background = tags.length > 0 ? tagColor(tags[0]) : "var(--cover-plain)";
    pill.append(dot, document.createTextNode("side: " + info.title));
    pill.setAttribute("aria-label", "Side: " + info.title + ". Options");
    pill.addEventListener("click", function () { openMenu(side); });
    body.append(pill);
  });
  if (day.main.kind === "recipe") {
    const addSide = document.createElement("button");
    addSide.type = "button";
    addSide.className = "side-add";
    addSide.setAttribute("aria-label", "Add a side to " + prettyDate(date));
    addSide.append(makeIcon("plus"), document.createTextNode(" side"));
    addSide.addEventListener("click", function () { openSheet(date, "side", null); });
    body.append(addSide);
  }
  return li;
}

function makeMealCard(entry, recipes) {
  const info = describeEntry(entry, recipes);
  const card = document.createElement("div");
  card.className = "meal-card";

  const main = document.createElement("button");
  main.type = "button";
  main.className = "meal-main";
  const text = document.createElement("span");
  text.className = "meal-text";
  const title = document.createElement("span");
  title.className = "meal-title";
  title.textContent = info.title;
  const sub = document.createElement("span");
  sub.className = "meal-sub";
  sub.textContent = info.sub;
  text.append(title);
  if (info.sub) { text.append(sub); }
  main.append(makeThumb(entry, info.recipe), text);
  main.addEventListener("click", function () {
    if (info.recipe) { openPlannedRecipe(info.recipe, entry); } else { openMenu(entry); }
  });

  const more = document.createElement("button");
  more.type = "button";
  more.className = "meal-more";
  more.setAttribute("aria-label", "Options for " + info.title);
  more.textContent = "•••";
  more.addEventListener("click", function () { openMenu(entry); });

  card.append(main, more);
  return card;
}

// ---------- Week buttons ----------
document.getElementById("plan-this-week").addEventListener("click", function () {
  planViewStart = weekStartOf(planToday()); showPlanMessage(""); renderPlan();
});
document.getElementById("plan-next-week").addEventListener("click", function () {
  planViewStart = addDays(weekStartOf(planToday()), 7); showPlanMessage(""); renderPlan();
});
document.getElementById("plan-prev").addEventListener("click", function () {
  planViewStart = addDays(planViewStart, -7); showPlanMessage(""); renderPlan();
});
document.getElementById("plan-next").addEventListener("click", function () {
  planViewStart = addDays(planViewStart, 7); showPlanMessage(""); renderPlan();
});

// If the app is left open past midnight (or over a Sunday night), today and "this week" move on.
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible" && !planScreen.hidden && !isAnySheetOpen()) { renderPlan(); }
});

// ======================================================================
// ---------- Bottom sheets ----------
// ======================================================================
const planSheet = document.getElementById("plan-sheet");
const planMenu = document.getElementById("plan-menu");
const reuseSheet = document.getElementById("plan-reuse-sheet");

function isAnySheetOpen() { return !planSheet.hidden || !planMenu.hidden || !reuseSheet.hidden; }

function openBackdrop(backdrop) {
  backdrop.hidden = false;
  document.body.classList.add("sheet-open");
}
function closeBackdrop(backdrop) {
  backdrop.hidden = true;
  if (!isAnySheetOpen()) { document.body.classList.remove("sheet-open"); }
}
// Tapping the dimmed area outside a sheet closes it; so does Escape.
[planSheet, planMenu, reuseSheet].forEach(function (backdrop) {
  backdrop.addEventListener("click", function (event) {
    if (event.target === backdrop) { closeBackdrop(backdrop); }
  });
});
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") { [planSheet, planMenu, reuseSheet].forEach(closeBackdrop); }
});

// ---------- The planning sheet ----------
// sheet = { date, role: "main"|"side", entry: the entry being changed or null, kind, recipeId, servings, query }
let sheet = null;
const sheetMessage = document.getElementById("sheet-message");
const sheetText = document.getElementById("sheet-text");

function openSheet(date, role, entry) {
  const recipes = recipeMap();
  sheet = {
    date: date,
    role: role,
    entry: entry,
    kind: entry ? entry.kind : "recipe",
    recipeId: entry && entry.kind === "recipe" ? entry.recipeId : "",
    servings: entry && entry.servings ? entry.servings : null,
    query: ""
  };
  if (sheet.recipeId && !recipes[sheet.recipeId]) { sheet.recipeId = ""; }   // a deleted recipe: pick another
  sheetText.value = entry && entry.kind !== "recipe" ? entry.note : "";
  if (!entry && role === "main") { sheet.leftoversGuess = guessLeftoversOf(loadPlan() || { entries: [] }, date); }
  document.getElementById("sheet-search").value = "";
  document.getElementById("sheet-date").textContent = prettyDate(date);
  document.getElementById("sheet-sub").textContent = role === "side" ? (entry ? "Change side dish" : "Add a side dish") : (entry ? "Change dinner" : "Dinner");
  sheetMessage.hidden = true;
  renderSheet();
  openBackdrop(planSheet);
  const first = sheet.kind === "recipe" ? document.getElementById("sheet-search") : sheetText;
  if (!entry) { first.blur(); }   // don't pop the keyboard up on its own
}

function sheetCanAddSide() {
  return sheet.role === "main" && sheet.kind === "recipe" && !sheet.entry;
}

function renderSheet() {
  const recipes = loadRecipes() || [];
  const isSide = sheet.role === "side";

  document.getElementById("sheet-kinds").hidden = isSide;
  document.querySelectorAll("#sheet-kinds .kind").forEach(function (button) {
    button.setAttribute("aria-pressed", String(button.dataset.kind === sheet.kind));
  });

  const isRecipe = sheet.kind === "recipe";
  document.getElementById("sheet-recipe-part").hidden = !isRecipe;
  document.getElementById("sheet-text-part").hidden = isRecipe;
  document.getElementById("sheet-side").hidden = !sheetCanAddSide();
  document.getElementById("sheet-save").textContent = sheet.entry ? "Save" : (isSide ? "Add side" : "Plan it");

  if (!isRecipe) {
    const labels = { leftovers: ["Leftovers of (optional)", "e.g. Lemon Roast Chicken"], out: ["Where? (optional)", "e.g. Pizza with Sam"], note: ["Note", "e.g. Guests at 6"] };
    document.getElementById("sheet-text-label").textContent = labels[sheet.kind][0];
    sheetText.placeholder = labels[sheet.kind][1];
    if (sheet.kind === "leftovers" && sheetText.value === "" && sheet.leftoversGuess) { sheetText.value = sheet.leftoversGuess; }
    return;
  }

  // The recipe list, filtered by what's typed.
  const words = simplify(sheet.query).split(/\s+/).filter(function (w) { return w !== ""; });
  const shown = recipes.filter(function (r) { return matchesSearch(r, words); }).sort(function (a, b) {
    return simplify(a.current.title) < simplify(b.current.title) ? -1 : 1;
  });
  const list = document.getElementById("sheet-recipes");
  list.innerHTML = "";
  if (recipes.length === 0) {
    const none = document.createElement("li");
    none.className = "sheet-empty";
    none.textContent = "You have no recipes yet. Add one in the Cookbook first.";
    list.append(none);
  } else if (shown.length === 0) {
    const none = document.createElement("li");
    none.className = "sheet-empty";
    none.textContent = "No recipe matches that.";
    list.append(none);
  }
  shown.forEach(function (recipe) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sheet-recipe";
    const picked = recipe.id === sheet.recipeId;
    button.setAttribute("aria-pressed", String(picked));
    const text = document.createElement("span");
    text.className = "sheet-recipe-text";
    const title = document.createElement("span");
    title.className = "sheet-recipe-title";
    title.textContent = recipe.current.title;
    const details = document.createElement("span");
    details.className = "sheet-recipe-details";
    details.textContent = describeRecipe(recipe, false);
    text.append(title);
    if (details.textContent) { text.append(details); }
    const check = document.createElement("span");
    check.className = "sheet-check";
    check.textContent = picked ? "✓" : "";
    button.append(makeThumb({ kind: "recipe" }, recipe), text, check);
    button.addEventListener("click", function () { pickSheetRecipe(recipe); });
    item.append(button);
    list.append(item);
  });

  const chosen = recipes.find(function (r) { return r.id === sheet.recipeId; });
  document.getElementById("sheet-servings-row").hidden = !chosen;
  if (chosen) {
    if (!sheet.servings) { sheet.servings = chosen.current.servings || 2; }
    document.getElementById("sheet-servings").textContent = String(sheet.servings);
    document.getElementById("sheet-servings-hint").textContent = chosen.current.servings ? "Recipe makes " + chosen.current.servings : "Recipe doesn't say how many it makes";
    document.getElementById("sheet-servings-minus").disabled = sheet.servings <= 1;
    document.getElementById("sheet-servings-plus").disabled = sheet.servings >= 99;
  }
}

function pickSheetRecipe(recipe) {
  if (sheet.recipeId !== recipe.id) {
    sheet.recipeId = recipe.id;
    sheet.servings = recipe.current.servings || 2;   // start from what the recipe makes
  }
  sheetMessage.hidden = true;
  renderSheet();
}

document.getElementById("sheet-kinds").addEventListener("click", function (event) {
  const button = event.target.closest(".kind");
  if (!button || !sheet) { return; }
  sheet.kind = button.dataset.kind;
  sheetMessage.hidden = true;
  renderSheet();
});
document.getElementById("sheet-search").addEventListener("input", function (event) {
  sheet.query = event.target.value;
  renderSheet();
});
document.getElementById("sheet-search").addEventListener("keydown", function (event) {
  if (event.key === "Enter") { event.preventDefault(); event.target.blur(); }   // Search key just hides the keyboard
});
document.getElementById("sheet-servings-minus").addEventListener("click", function () {
  sheet.servings = Math.max(1, sheet.servings - 1); renderSheet();
});
document.getElementById("sheet-servings-plus").addEventListener("click", function () {
  sheet.servings = Math.min(99, sheet.servings + 1); renderSheet();
});
document.getElementById("sheet-cancel").addEventListener("click", function () { closeBackdrop(planSheet); });

function sheetProblem(text) {
  sheetMessage.textContent = text;
  sheetMessage.hidden = false;
}

// Save what the sheet describes. Returns true if saved.
function saveSheet() {
  const plan = loadPlan();
  if (plan === null) { sheetProblem("Sorry, your meal plan couldn't be read, so nothing was changed. Please tell Claude."); return false; }
  const fields = { kind: sheet.kind, role: sheet.role, recipeId: "", title: "", servings: null, note: sheetText.value.trim() };
  if (sheet.kind === "recipe") {
    const recipe = (loadRecipes() || []).find(function (r) { return r.id === sheet.recipeId; });
    if (!recipe) { sheetProblem("Pick a recipe first."); return false; }
    fields.recipeId = recipe.id;
    fields.title = recipe.current.title;
    fields.servings = sheet.servings;
    fields.note = "";
  } else if (sheet.kind === "note" && fields.note === "") {
    sheetProblem("Type a few words for the note.");
    return false;
  }
  const next = sheet.entry ? changeEntry(plan, sheet.entry.id, fields) : addEntry(plan, sheet.date, fields, makeId());
  if (next === null) { sheetProblem("Sorry, that couldn't be planned."); return false; }
  if (!savePlan(next)) { sheetProblem("Sorry, the plan couldn't be saved. The phone's storage for the cookbook may be full. Nothing was changed."); return false; }
  return true;
}

document.getElementById("sheet-save").addEventListener("click", function () {
  if (!saveSheet()) { return; }
  closeBackdrop(planSheet);
  showPlanMessage("");
  renderPlan();
});

document.getElementById("sheet-side").addEventListener("click", function () {
  const date = sheet.date;
  if (!saveSheet()) { return; }
  renderPlan();
  openSheet(date, "side", null);   // straight on to choosing the side dish
});

// ---------- The ••• menu ----------
let menuEntry = null;

function openMenu(entry) {
  menuEntry = entry;
  const recipes = recipeMap();
  const info = describeEntry(entry, recipes);
  document.getElementById("menu-title").textContent = info.title;
  document.getElementById("menu-sub").textContent = prettyDate(entry.date) + (entry.role === "side" ? " · side dish" : "");
  document.getElementById("menu-open").hidden = !info.recipe;
  document.getElementById("menu-move-toggle").textContent = entry.role === "side" ? "Move to another day…" : "Move this dinner to another day…";
  document.getElementById("menu-move").hidden = true;
  document.getElementById("menu-date").value = entry.date;
  document.getElementById("menu-remove").textContent = entry.role === "main" && dayOf(loadPlan() || { entries: [] }, entry.date).sides.length > 0 ? "Remove (with its sides)" : "Remove";
  openBackdrop(planMenu);
}

document.getElementById("menu-cancel").addEventListener("click", function () { closeBackdrop(planMenu); });

document.getElementById("menu-open").addEventListener("click", function () {
  const recipe = recipeMap()[menuEntry.recipeId];
  closeBackdrop(planMenu);
  if (recipe) { openPlannedRecipe(recipe, menuEntry); }
});

document.getElementById("menu-change").addEventListener("click", function () {
  const entry = menuEntry;
  closeBackdrop(planMenu);
  openSheet(entry.date, entry.role, entry);
});

document.getElementById("menu-move-toggle").addEventListener("click", function () {
  const box = document.getElementById("menu-move");
  box.hidden = !box.hidden;
});

document.getElementById("menu-move-go").addEventListener("click", function () {
  const to = document.getElementById("menu-date").value;
  const entry = menuEntry;
  if (!isDateText(to) || to === entry.date) { closeBackdrop(planMenu); return; }
  const plan = loadPlan();
  if (plan === null) { return; }
  let next;
  if (entry.role === "side") {
    next = moveSide(plan, entry.id, to);
  } else {
    const target = dayOf(plan, to);
    if ((target.main || target.sides.length > 0) &&
        !window.confirm(prettyDate(to) + " already has dinner planned. Swap the two days?")) { return; }
    next = moveDay(plan, entry.date, to);
  }
  if (!savePlan(next)) { showPlanMessage("Sorry, the plan couldn't be saved. Nothing was changed."); closeBackdrop(planMenu); return; }
  closeBackdrop(planMenu);
  showPlanMessage("Moved to " + prettyDate(to) + (weekStartOf(to) !== planViewStart ? " (in the week of " + weekLabel(weekStartOf(to)) + ")." : "."));
  renderPlan();
});

document.getElementById("menu-remove").addEventListener("click", function () {
  const entry = menuEntry;
  const plan = loadPlan();
  if (plan === null) { return; }
  const info = describeEntry(entry, recipeMap());
  const day = dayOf(plan, entry.date);
  const withSides = entry.role === "main" && day.sides.length > 0;
  const question = "Remove " + info.title + " from " + prettyDate(entry.date) + (withSides ? ", and its side dishes" : "") + "?\nThe recipe itself stays in your cookbook.";
  if (!window.confirm(question)) { return; }
  let next = removeEntry(plan, entry.id);
  if (withSides) { day.sides.forEach(function (side) { next = removeEntry(next, side.id); }); }
  closeBackdrop(planMenu);
  if (!savePlan(next)) { showPlanMessage("Sorry, the plan couldn't be saved. Nothing was changed."); return; }
  showPlanMessage("");
  renderPlan();
});

// ---------- Reuse a past week ----------
document.getElementById("plan-reuse").addEventListener("click", function () {
  const plan = loadPlan();
  if (plan === null) { return; }
  const weeks = weeksWithPlans(plan, planViewStart);
  const list = document.getElementById("reuse-list");
  list.innerHTML = "";
  document.getElementById("reuse-sub").textContent = weeks.length > 0
    ? "Copy its dinners into " + weekLabel(planViewStart) + ". Days that already have something planned stay as they are."
    : "No other week has anything planned yet.";
  weeks.forEach(function (week) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sheet-recipe";
    const text = document.createElement("span");
    text.className = "sheet-recipe-text";
    const title = document.createElement("span");
    title.className = "sheet-recipe-title";
    title.textContent = weekLabel(week.start);
    const details = document.createElement("span");
    details.className = "sheet-recipe-details";
    details.textContent = week.dinners === 1 ? "1 dinner" : week.dinners + " dinners";
    text.append(title, details);
    button.append(text);
    button.addEventListener("click", function () { reuseWeekFrom(week.start); });
    item.append(button);
    list.append(item);
  });
  openBackdrop(reuseSheet);
});

document.getElementById("reuse-cancel").addEventListener("click", function () { closeBackdrop(reuseSheet); });

function reuseWeekFrom(fromStart) {
  const plan = loadPlan();
  if (plan === null) { return; }
  const result = reuseWeek(plan, fromStart, planViewStart, makeId);
  closeBackdrop(reuseSheet);
  if (result.copiedDays === 0) {
    showPlanMessage("Nothing was copied: every day that had dinner planned already has something here.");
    return;
  }
  if (!window.confirm("Copy " + result.copiedDays + (result.copiedDays === 1 ? " day" : " days") + " from " + weekLabel(fromStart) + " into " + weekLabel(planViewStart) + "?")) { return; }
  if (!savePlan(result.plan)) { showPlanMessage("Sorry, the plan couldn't be saved. Nothing was changed."); return; }
  showPlanMessage("✓ Copied " + result.copiedDays + (result.copiedDays === 1 ? " day" : " days") + " from " + weekLabel(fromStart) + ".");
  renderPlan();
}
