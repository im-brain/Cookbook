// js/planner.js: "Plan for me" (Version 39). Suggests a week of dinners from the saved recipes.
// Plain script: it only works things out. It never touches the page, never saves anything and never
// changes a recipe, so it also runs in Node for tests (node tests/planner.test.js).
// Nothing is sent anywhere: no AI service, no network.
//
// How it thinks (in plain words):
//   1. Every saved recipe that suits dinner gets a "profile": which ingredients you said you have,
//      which are pantry staples, and which would have to be bought.
//   2. It tries many different SETS of dinners (not just the best single recipes) and gives each
//      whole week a score: using what you have is good, each different thing to buy costs points,
//      buying one thing for two dinners is good, a leftovers night is good, the same kind of
//      dinner twice costs points, and long cooking times cost a little.
//   3. The best week is laid out on the free days, with a leftovers night one to three days after
//      the dinner it comes from (that dinner is cooked in a bigger batch).
// The amounts you have are NOT known, so an ingredient you listed is never treated as endless:
// the second dinner that uses it earns much less, and the shopping preview says "may need more".

// In Node (the tests) the other files are loaded here; in the browser they are already there.
if (typeof module !== "undefined" && module.exports) {
  Object.assign(globalThis, require("./shopping.js"), require("./fridge.js"));
}

const PLANNER_POOL = 16;          // how many of the best single recipes go into the week search
const PLANNER_KEEP = 30;          // how many of the best weeks are kept to try laying out
const PLANNER_UNKNOWN_TIME = 40;  // minutes assumed when a recipe doesn't say how long it takes
const PLANNER_MAX_BATCH = 3;      // a recipe is never made more than 3 times its size for leftovers
const PLANNER_LEFTOVER_DAYS = 3;  // leftovers are eaten within 3 days

// What matters most. Each number is how many points one unit is worth.
const PLANNER_WEIGHTS = {
  have:     { have: 3,   buy: 1, share: 0.5,  same: 1.5, time: 0.05 },
  shopping: { have: 1.5, buy: 2, share: 0.75, same: 1.5, time: 0.05 },
  quick:    { have: 1.5, buy: 1, share: 0.5,  same: 1.5, time: 0.5 },
  variety:  { have: 1.5, buy: 1, share: 0.25, same: 4,   time: 0.05 }
};
const PLANNER_PRIORITIES = ["have", "shopping", "quick", "variety"];

// Tags that mean "this isn't a dinner" (unless the recipe is also tagged dinner).
const PLANNER_NOT_DINNER = ["dessert", "desserts", "breakfast", "brunch", "drink", "drinks", "snack", "snacks",
  "baking", "side", "sides", "side dish", "sauce", "sauces", "appetizer", "starter", "bread", "cocktail"];
const PLANNER_DINNER_TAGS = ["dinner", "main", "mains", "supper"];

// A word in an ingredient that makes it a different food from the plain one:
// having "chicken" doesn't mean having "chicken broth"; "egg" isn't "egg noodles".
const PLANNER_DERIVED = ["broth", "stock", "bouillon", "noodle", "chip", "starch", "powder", "sauce", "paste",
  "flour", "seasoning", "extract", "oil", "vinegar", "gravy", "soup", "cube", "mix", "sausage"];

// The "kind of dinner", used so a week isn't four chicken dinners. First match wins.
const PLANNER_GROUPS = [
  ["chicken", /\b(chicken|turkey|duck)\b/],
  ["beef", /\b(beef|steak|brisket|veal|meatball|burger)s?\b/],
  ["pork", /\b(pork|bacon|ham|chorizo|prosciutto|sausage)s?\b/],
  ["lamb", /\blamb\b/],
  ["fish", /\b(salmon|tuna|cod|fish|shrimp|prawn|scallop|crab|lobster|clam|mussel|anchov)/],
  ["tofu", /\b(tofu|tempeh)\b/],
  ["beans", /\b(bean|lentil|chickpea)s?\b/],
  ["egg", /\b(egg|omelet|omelette|frittata|quiche)s?\b/],
  ["pasta", /\b(pasta|spaghetti|noodle|macaroni|penne|lasagna|lasagne|linguine|fettuccine|gnocchi|orzo)s?\b/]
];

// Dinners that keep and reheat well, and ones that don't.
const PLANNER_KEEPS_WELL = /\b(stew|soup|curry|chili|chilli|casserole|bake|baked|roast|lasagna|lasagne|braise|braised|ragu|bolognese|pie|slow|pulled|meatball|dal|dhal|enchilada|gratin|goulash|tagine|pilaf|risotto|paella|batch)s?\b/;
const PLANNER_KEEPS_BADLY = /\b(salad|omelet|omelette|scrambled?|fried eggs?|sandwich|toast|smoothie|taco|tacos|sushi|poached)\b/;

// ---------- Small helpers ----------

// A steady number from 0 to 1 for a piece of text (the same text always gives the same number).
function plannerHash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // A final stir, so texts that differ by one letter give very different numbers.
  h ^= h >>> 16; h = Math.imul(h, 2246822507);
  h ^= h >>> 13; h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function plannerDaysBetween(from, to) {
  return Math.round((Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / 86400000);
}

function plannerList(names) {
  if (names.length <= 1) { return names.join(""); }
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

// Does something you have (a list of words) stand for an ingredient (a list of words)?
// The fridge's rule, plus: a "derived" word on one side must be on the other side too.
function plannerMatches(haveWords, ingredientWords) {
  if (!fridgeMatches(haveWords, ingredientWords)) { return false; }
  const missing = function (a, b) {
    return a.some(function (w) { return PLANNER_DERIVED.indexOf(w) !== -1 && b.indexOf(w) === -1; });
  };
  return !missing(ingredientWords, haveWords) && !missing(haveWords, ingredientWords);
}

// What the person has: { typed: [{ label, words }], pantry: [words], usePantry }.
function plannerContext(options) {
  const typed = [];
  const seen = {};
  (options.available || []).forEach(function (text) {
    const words = fridgeWords(text);
    const key = words.join(" ");
    if (key === "" || seen[key]) { return; }
    seen[key] = true;
    typed.push({ label: String(text).trim().toLowerCase(), words: words });
  });
  const usePantry = options.usePantry !== false;
  const pantry = usePantry ? (options.pantry || []).map(fridgeWords).filter(function (w) { return w.length > 0; }) : [];
  return { typed: typed, pantry: pantry, usePantry: usePantry };
}

// Is an ingredient name something you listed ("have"), a pantry staple ("pantry"), or neither ("buy")?
function plannerClassify(name, ctx) {
  const words = fridgeWords(name);
  if (words.length === 0) { return { status: "buy", index: -1 }; }
  for (let i = 0; i < ctx.typed.length; i++) {
    if (plannerMatches(ctx.typed[i].words, words)) { return { status: "have", index: i }; }
  }
  if (ctx.usePantry && (isBasicName(words) || ctx.pantry.some(function (p) { return plannerMatches(p, words); }))) {
    return { status: "pantry", index: -1 };
  }
  return { status: "buy", index: -1 };
}

function plannerGroup(recipe) {
  const title = String(recipe.current.title || "").toLowerCase();
  for (let i = 0; i < PLANNER_GROUPS.length; i++) {
    if (PLANNER_GROUPS[i][1].test(title)) { return PLANNER_GROUPS[i][0]; }
  }
  const names = (recipe.current.ingredients || []).map(function (x) { return fridgeIngredientName(x); }).join(" | ").toLowerCase();
  for (let i = 0; i < PLANNER_GROUPS.length; i++) {
    if (PLANNER_GROUPS[i][1].test(names)) { return PLANNER_GROUPS[i][0]; }
  }
  return "";
}

// Everything the planner needs to know about one recipe. The recipe itself is only read.
function plannerProfile(recipe, ctx, eaters) {
  if (!recipe || !recipe.current || !Array.isArray(recipe.current.ingredients)) { return null; }
  const current = recipe.current;
  const tags = (Array.isArray(current.tags) ? current.tags : []).map(function (t) { return String(t).toLowerCase(); });
  const have = [];       // indexes into ctx.typed
  const buy = [];        // { key, name }
  const pantry = [];     // names
  let unsure = 0;
  const seen = {};
  current.ingredients.forEach(function (ingredient) {
    if (ingredient && (ingredient.heading || ingredient.optional === true)) { return; }
    const name = fridgeIngredientName(ingredient);
    const key = shopKey(name);
    if (key === "" || seen[key]) { return; }
    seen[key] = true;
    if (ingredient && ingredient.check === "please-check") { unsure++; }
    const found = plannerClassify(name, ctx);
    if (found.status === "have") { if (have.indexOf(found.index) === -1) { have.push(found.index); } }
    else if (found.status === "pantry") { pantry.push(name); }
    else { buy.push({ key: key, name: name }); }
  });
  const servings = typeof current.servings === "number" && current.servings > 0 ? current.servings : null;
  const title = String(current.title || "");
  const text = title.toLowerCase() + " " + tags.join(" ");
  const notDinner = tags.some(function (t) { return PLANNER_NOT_DINNER.indexOf(t) !== -1; }) &&
    !tags.some(function (t) { return PLANNER_DINNER_TAGS.indexOf(t) !== -1; });
  // Can it honestly feed a second night? Only if the recipe says how many it serves, the bigger
  // batch is no more than 3 times the recipe, and it isn't a dish that keeps badly.
  let leftoverOk = servings !== null && (eaters * 2) / servings <= PLANNER_MAX_BATCH &&
    tags.indexOf("no leftovers") === -1 && !PLANNER_KEEPS_BADLY.test(text);
  const total = have.length + buy.length + pantry.length;
  return {
    id: recipe.id, title: title, recipe: recipe, tags: tags,
    have: have, buy: buy, pantry: pantry, unsure: unsure,
    time: typeof current.timeMinutes === "number" && current.timeMinutes > 0 ? current.timeMinutes : null,
    servings: servings, group: plannerGroup(recipe),
    dinnerOk: !notDinner && total > 0,
    leftoverOk: leftoverOk,
    keepsWell: PLANNER_KEEPS_WELL.test(text) || tags.indexOf("leftovers") !== -1 ? 1 : 0.5
  };
}

function plannerByTitle(a, b) {
  const x = a.title.toLowerCase(), y = b.title.toLowerCase();
  if (x !== y) { return x < y ? -1 : 1; }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// ---------- Scoring a whole week ----------

// meals: profiles being cooked. sources: ids of the ones cooked big for a leftovers night.
// Returns { score, parts } where parts explains the score.
function plannerScore(meals, sources, env) {
  const w = env.weights;
  const uses = {};
  const buyKeys = {};
  let buyLines = 0, unsure = 0, time = 0, recent = 0, shown = 0, jitter = 0, keeps = 0;
  const groups = {};
  meals.forEach(function (m) {
    const big = sources.indexOf(m.id) !== -1;
    m.have.forEach(function (i) { uses[i] = (uses[i] || 0) + (big ? 2 : 1); });
    m.buy.forEach(function (b) { buyKeys[b.key] = true; buyLines++; });
    unsure += m.unsure;
    time += m.time === null ? PLANNER_UNKNOWN_TIME : m.time;
    if (m.group) { groups[m.group] = (groups[m.group] || 0) + 1; }
    recent += env.recent[m.id] || 0;
    shown += Math.min(3, env.shown[m.id] || 0);
    if (env.seed) { jitter += 2.5 * plannerHash(m.id + "#" + env.seed); }
    if (big) { keeps += m.keepsWell; }
  });
  // What you have: the first dinner that uses it counts fully, the next much less (amount unknown).
  let have = 0;
  Object.keys(uses).forEach(function (i) { have += uses[i] === 1 ? 1 : uses[i] === 2 ? 1.4 : 1.5; });
  const buy = Object.keys(buyKeys).length;
  let same = 0;
  Object.keys(groups).forEach(function (g) { same += groups[g] * (groups[g] - 1) / 2; });
  const parts = {
    have: have, usedItems: Object.keys(uses).length, buy: buy, shared: buyLines - buy, same: same,
    minutes: time, leftovers: sources.length, unsure: unsure
  };
  const score = w.have * have - w.buy * buy + w.share * parts.shared - w.same * same - w.time * (time / 10) +
    6 * sources.length + keeps - 0.25 * unsure - 2 * recent - 1.5 * shown + jitter;
  return { score: score, parts: parts };
}

// A single recipe's own worth, used only to choose which recipes enter the week search.
function plannerSoloScore(m, env) {
  const w = env.weights;
  return w.have * m.have.length - w.buy * 0.5 * m.buy.length - w.time * ((m.time === null ? PLANNER_UNKNOWN_TIME : m.time) / 10) -
    2 * (env.recent[m.id] || 0) - 1.5 * Math.min(3, env.shown[m.id] || 0) + (env.seed ? 2.5 * plannerHash(m.id + "#" + env.seed) : 0) +
    (m.leftoverOk ? 0.5 * m.keepsWell : 0);
}

// Every way to choose `count` things from a list, in list order. `each` gets one choice at a time.
function plannerChoose(list, count, each) {
  const picked = [];
  (function go(start) {
    if (picked.length === count) { each(picked.slice()); return; }
    for (let i = start; i <= list.length - (count - picked.length); i++) {
      picked.push(list[i]);
      go(i + 1);
      picked.pop();
    }
  })(0);
}

// The dinners in a set that could feed a leftovers night, best first.
function plannerSourceOrder(meals) {
  return meals.filter(function (m) { return m.leftoverOk; }).sort(function (a, b) {
    if (a.keepsWell !== b.keepsWell) { return b.keepsWell - a.keepsWell; }
    if (a.have.length !== b.have.length) { return b.have.length - a.have.length; }
    return plannerByTitle(a, b);
  });
}

// ---------- Laying a week out on its days ----------

// meals: profiles to cook. sources: ids cooked big (one leftovers night each).
// dates: the free dates to use, in order. locked: { date: { kind, recipeId | sourceDate } }.
// Returns [{ date, kind: "cook"|"leftovers", meal, sourceId }] in date order, or null if a leftovers
// night can't be put 1 to 3 days after its dinner.
function plannerArrange(meals, sources, dates, locked) {
  const byId = {};
  meals.forEach(function (m) { byId[m.id] = m; });
  const fixed = {};        // date -> item
  const placedCook = {};   // recipe id -> true (already on a locked date)
  const placedLeft = {};   // source id -> true
  dates.forEach(function (date) {
    const lock = locked[date];
    if (!lock) { return; }
    if (lock.kind === "cook" && byId[lock.recipeId] && !placedCook[lock.recipeId]) {
      fixed[date] = { kind: "cook", meal: byId[lock.recipeId], sourceId: "" };
      placedCook[lock.recipeId] = true;
    }
  });
  dates.forEach(function (date) {
    const lock = locked[date];
    if (!lock || lock.kind !== "leftovers") { return; }
    const sourceLock = locked[lock.sourceDate];
    if (!sourceLock || sourceLock.kind !== "cook" || sources.indexOf(sourceLock.recipeId) === -1 || placedLeft[sourceLock.recipeId]) { return; }
    fixed[date] = { kind: "leftovers", meal: byId[sourceLock.recipeId], sourceId: sourceLock.recipeId };
    placedLeft[sourceLock.recipeId] = true;
  });

  const open = dates.filter(function (d) { return !fixed[d]; });
  const items = [];
  meals.slice().sort(function (a, b) {
    if (a.have.length !== b.have.length) { return b.have.length - a.have.length; }
    return plannerByTitle(a, b);
  }).forEach(function (m) {
    if (!placedCook[m.id]) { items.push({ kind: "cook", meal: m, sourceId: "" }); }
  });
  sources.forEach(function (id) {
    if (!placedLeft[id]) { items.push({ kind: "leftovers", meal: byId[id], sourceId: id }); }
  });
  if (items.length > open.length) { return null; }
  const useDates = open.slice(0, items.length);

  let best = null, bestScore = -Infinity;
  const order = [];
  const used = items.map(function () { return false; });
  function judge() {
    const cookDate = {};
    Object.keys(fixed).forEach(function (d) { if (fixed[d].kind === "cook") { cookDate[fixed[d].meal.id] = d; } });
    order.forEach(function (it, i) { if (it.kind === "cook") { cookDate[it.meal.id] = useDates[i]; } });
    let score = 0;
    const leftovers = [];
    Object.keys(fixed).forEach(function (d) { if (fixed[d].kind === "leftovers") { leftovers.push([fixed[d].sourceId, d]); } });
    order.forEach(function (it, i) { if (it.kind === "leftovers") { leftovers.push([it.sourceId, useDates[i]]); } });
    for (let i = 0; i < leftovers.length; i++) {
      const gap = plannerDaysBetween(cookDate[leftovers[i][0]], leftovers[i][1]);
      if (gap < 1 || gap > PLANNER_LEFTOVER_DAYS) { return; }       // not allowed
      score += gap === 2 ? 1 : gap === 1 ? 0.6 : 0.3;               // a night's break is nicest
    }
    // Use what you have early in the week, while it is fresh.
    order.forEach(function (it, i) { if (it.kind === "cook") { score += it.meal.have.length * (useDates.length - i) * 0.1; } });
    if (score > bestScore + 1e-9) { bestScore = score; best = order.slice(); }
  }
  (function go() {
    if (order.length === items.length) { judge(); return; }
    for (let i = 0; i < items.length; i++) {
      if (used[i]) { continue; }
      used[i] = true; order.push(items[i]);
      go();
      order.pop(); used[i] = false;
    }
  })();
  if (best === null) { return null; }

  const result = [];
  Object.keys(fixed).forEach(function (d) { result.push({ date: d, kind: fixed[d].kind, meal: fixed[d].meal, sourceId: fixed[d].sourceId, locked: true }); });
  best.forEach(function (it, i) { result.push({ date: useDates[i], kind: it.kind, meal: it.meal, sourceId: it.sourceId, locked: false }); });
  result.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  return result;
}

// ---------- The suggestion ----------

// recipes: the saved recipes (only read). options:
//   dates:      free dates that may get a dinner, in order (text "2026-11-10")
//   dinners:    how many dinners to suggest
//   eaters:     how many people eat (servings per dinner)
//   leftovers:  true to plan leftovers nights
//   priority:   "have" | "shopping" | "quick" | "variety"
//   available:  names the person typed            pantry: "I always have this" names
//   usePantry:  false to count staples (salt, oil, pantry names) as things to buy
//   locked:     [{ date, kind: "cook", recipeId, servings } | { date, kind: "leftovers", sourceDate }]
//   recent:     { recipeId: 1 | 0.5 }  dinners planned lately (they are suggested less)
//   shown:      { recipeId: times }    suggestions already shown and not kept (for "Suggest again")
//   seed:       0 for the plain best week; another number for a different, repeatable variation
// Returns { slots, wanted, planned, notes, unused, parts, counts }.
function plannerSuggest(recipes, options) {
  const ctx = plannerContext(options);
  const eaters = Number.isInteger(options.eaters) && options.eaters > 0 ? Math.min(options.eaters, 99) : 4;
  const dates = (options.dates || []).filter(isDateText).slice().sort();
  const env = {
    weights: PLANNER_WEIGHTS[options.priority] || PLANNER_WEIGHTS.have,
    recent: options.recent || {}, shown: options.shown || {}, seed: options.seed || 0
  };
  const notes = [];
  const result = { slots: [], wanted: 0, planned: 0, notes: notes, unused: [], parts: null,
    counts: { recipes: 0, suitable: 0, notDinner: 0 } };

  const profiles = [];
  (recipes || []).forEach(function (recipe) {
    const p = plannerProfile(recipe, ctx, eaters);
    if (p) { profiles.push(p); }
  });
  const byId = {};
  profiles.forEach(function (p) { byId[p.id] = p; });
  result.counts.recipes = profiles.length;
  result.counts.notDinner = profiles.filter(function (p) { return !p.dinnerOk; }).length;

  // Locks that still make sense (the recipe exists, the date is offered).
  const locked = {};
  (options.locked || []).forEach(function (lock) {
    if (!lock || dates.indexOf(lock.date) === -1) { return; }
    if (lock.kind === "cook" && byId[lock.recipeId]) { locked[lock.date] = { kind: "cook", recipeId: lock.recipeId, servings: lock.servings || null }; }
  });
  (options.locked || []).forEach(function (lock) {
    if (!lock || lock.kind !== "leftovers" || dates.indexOf(lock.date) === -1 || locked[lock.date]) { return; }
    const source = locked[lock.sourceDate];
    const gap = source ? plannerDaysBetween(lock.sourceDate, lock.date) : 0;
    if (source && source.kind === "cook" && gap >= 1 && gap <= PLANNER_LEFTOVER_DAYS) { locked[lock.date] = { kind: "leftovers", sourceDate: lock.sourceDate }; }
  });
  const lockedCook = [];
  const lockedSources = [];
  Object.keys(locked).sort().forEach(function (d) {
    if (locked[d].kind === "cook") { if (lockedCook.indexOf(locked[d].recipeId) === -1) { lockedCook.push(locked[d].recipeId); } }
    else { const id = locked[locked[d].sourceDate].recipeId; if (lockedSources.indexOf(id) === -1) { lockedSources.push(id); } }
  });
  // A dinner you locked as a leftovers source counts as one, whatever the app thinks of it.
  lockedSources.forEach(function (id) { byId[id].leftoverOk = true; });

  const candidates = profiles.filter(function (p) { return p.dinnerOk && lockedCook.indexOf(p.id) === -1; });
  result.counts.suitable = candidates.length + lockedCook.length;

  let wanted = Number.isInteger(options.dinners) && options.dinners > 0 ? options.dinners : 5;
  wanted = Math.max(wanted, lockedCook.length + lockedSources.length);
  if (wanted > dates.length) { wanted = dates.length; }
  result.wanted = wanted;
  if (wanted === 0) { return result; }

  // The recipes that go into the week search: the best ones on their own, in a steady order.
  const pool = candidates.map(function (p) { return { p: p, s: plannerSoloScore(p, env) }; })
    .sort(function (a, b) { return b.s !== a.s ? b.s - a.s : plannerByTitle(a.p, b.p); })
    .slice(0, PLANNER_POOL).map(function (x) { return x.p; });
  const forced = lockedCook.map(function (id) { return byId[id]; });
  const totalCookable = pool.length + forced.length;

  const leftoversOn = options.leftovers !== false;
  const preferred = wanted >= 6 ? 2 : wanted >= 3 ? 1 : 0;
  let nights = lockedSources.length;
  if (leftoversOn) {
    // Too few recipes for the cooking nights? Then more leftovers nights are tried.
    nights = Math.max(nights, preferred, wanted - totalCookable);
    nights = Math.min(nights, Math.floor(wanted / 2));
    nights = Math.max(nights, lockedSources.length);
  }

  let chosen = null;
  for (let L = nights; L >= lockedSources.length && chosen === null; L--) {
    const cookCount = Math.min(wanted - L, totalCookable);
    if (cookCount < forced.length || cookCount < 1) { continue; }
    const ranked = [];
    plannerChoose(pool, cookCount - forced.length, function (picked) {
      const meals = forced.concat(picked);
      const extra = plannerSourceOrder(meals).filter(function (m) { return lockedSources.indexOf(m.id) === -1; });
      const need = Math.min(L - lockedSources.length, extra.length);
      const sources = lockedSources.concat(extra.slice(0, need).map(function (m) { return m.id; }));
      const scored = plannerScore(meals, sources, env);
      ranked.push({ meals: meals, score: scored.score, need: need, extra: extra,
        key: meals.map(function (m) { return m.id; }).sort().join("|") });
    });
    ranked.sort(function (a, b) { return b.score !== a.score ? b.score - a.score : (a.key < b.key ? -1 : 1); });
    const top = ranked.slice(0, PLANNER_KEEP);
    for (let i = 0; i < top.length && chosen === null; i++) {
      const week = top[i];
      // Try the leftovers sources best first, until the nights fit on the calendar.
      const tries = [];
      plannerChoose(week.extra, week.need, function (picked) { tries.push(picked.map(function (m) { return m.id; })); });
      for (let t = 0; t < tries.length && chosen === null; t++) {
        const sources = lockedSources.concat(tries[t]);
        const laid = plannerArrange(week.meals, sources, dates, locked);
        if (laid) { chosen = { meals: week.meals, sources: sources, laid: laid }; }
      }
    }
  }
  if (chosen === null) {
    notes.push(result.counts.suitable === 0
      ? (result.counts.recipes === 0 ? "Your cookbook has no recipes yet, so there is nothing to suggest. Add a few recipes first."
        : "None of your saved recipes looks like a dinner (they are tagged breakfast, dessert and so on, or list no ingredients).")
      : "These dinners couldn't be fitted onto the free days.");
    return result;
  }

  result.parts = plannerScore(chosen.meals, chosen.sources, env).parts;
  result.slots = plannerSlots(chosen, ctx, eaters, locked);
  result.planned = result.slots.length;

  // ---------- Honest notes about what couldn't be done ----------
  if (result.planned < wanted) {
    let why = "Only " + result.planned + " of " + wanted + " dinners could be suggested: your cookbook has " +
      result.counts.suitable + (result.counts.suitable === 1 ? " recipe" : " recipes") + " that suit dinner";
    if (result.counts.notDinner > 0) { why += " (" + result.counts.notDinner + " more are tagged breakfast, dessert and so on, or list no ingredients)"; }
    why += ". You could add more recipes, ask for fewer dinners" + (leftoversOn ? "" : ", turn on leftovers") + ", or plan the other nights yourself.";
    notes.push(why);
  }
  if (leftoversOn && preferred > 0 && chosen.sources.length === 0) {
    notes.push("No leftovers night: none of these dinners can honestly feed a second night (the recipe needs to say how many it serves, and be something that keeps).");
  }
  const usedTyped = {};
  chosen.meals.forEach(function (m) { m.have.forEach(function (i) { usedTyped[i] = true; }); });
  result.unused = ctx.typed.filter(function (t, i) { return !usedTyped[i]; }).map(function (t) { return t.label; });
  return result;
}

// Turns a laid-out week into the slots the screen shows, with the reasons in words.
function plannerSlots(chosen, ctx, eaters, locked) {
  const leftoverDates = {};   // source id -> [dates]
  const cookDate = {};
  chosen.laid.forEach(function (x) {
    if (x.kind === "leftovers") { (leftoverDates[x.sourceId] = leftoverDates[x.sourceId] || []).push(x.date); }
    else { cookDate[x.meal.id] = x.date; }
  });
  const cooks = chosen.laid.filter(function (x) { return x.kind === "cook"; });
  return chosen.laid.map(function (x) {
    const m = x.meal;
    if (x.kind === "leftovers") {
      return {
        date: x.date, kind: "leftovers", recipeId: m.id, title: m.title, sourceDate: cookDate[m.id],
        servings: null, baseServings: m.servings, leftoverDates: [], locked: x.locked, time: null,
        have: [], buy: [], pantry: [], unsure: 0,
        reasons: ["From " + dayName(cookDate[m.id]) + "'s " + m.title, "No cooking and nothing extra to buy"]
      };
    }
    const nights = leftoverDates[m.id] || [];
    let servings = m.servings === null ? null : eaters * (1 + nights.length);
    if (locked[x.date] && locked[x.date].servings) { servings = locked[x.date].servings; }
    const have = m.have.map(function (i) { return ctx.typed[i].label; });
    const reasons = [];
    if (have.length > 0) { reasons.push("Uses your " + plannerList(have)); }
    if (nights.length > 0) {
      reasons.push("Cook a bigger batch: " + plannerList(nights.map(dayName)) + (nights.length === 1 ? " is" : " are") + " leftovers");
    }
    // Things to buy that another dinner this week also needs.
    const shared = [];
    let sharedWith = "";
    m.buy.forEach(function (b) {
      cooks.forEach(function (other) {
        if (other.meal.id === m.id) { return; }
        if (other.meal.buy.some(function (o) { return o.key === b.key; })) {
          if (shared.indexOf(b.name) === -1) { shared.push(b.name); }
          if (!sharedWith) { sharedWith = other.meal.title; }
        }
      });
    });
    if (shared.length > 0) { reasons.push("Shares " + plannerList(shared.slice(0, 3)) + " with " + sharedWith); }
    if (m.time !== null && m.time <= 30) { reasons.push("Ready in " + m.time + " min"); }
    if (m.buy.length === 0) { reasons.push("Nothing extra to buy"); }
    if (reasons.length === 0) { reasons.push(m.buy.length <= 3 ? "A short shopping list" : "Adds variety to the week"); }
    return {
      date: x.date, kind: "cook", recipeId: m.id, title: m.title, sourceDate: "",
      servings: servings, baseServings: m.servings, leftoverDates: nights, locked: x.locked, time: m.time,
      have: have, buy: m.buy.map(function (b) { return b.name; }), pantry: m.pantry.slice(), unsure: m.unsure,
      reasons: reasons.slice(0, 3)
    };
  });
}

// ---------- Swapping one dinner ----------

// Other recipes for the dinner on `date`, best first, judged with the REST of the week kept as it is.
// Returns [{ recipeId, title, have: [labels], buy: [names], time, suitable }] (every other saved recipe).
function plannerAlternatives(recipes, options, slots, date) {
  const ctx = plannerContext(options);
  const eaters = Number.isInteger(options.eaters) && options.eaters > 0 ? options.eaters : 4;
  const env = { weights: PLANNER_WEIGHTS[options.priority] || PLANNER_WEIGHTS.have, recent: options.recent || {}, shown: {}, seed: 0 };
  const profiles = [];
  (recipes || []).forEach(function (r) { const p = plannerProfile(r, ctx, eaters); if (p) { profiles.push(p); } });
  const byId = {};
  profiles.forEach(function (p) { byId[p.id] = p; });
  const inWeek = {};
  const others = [];
  const sources = [];
  slots.forEach(function (s) {
    inWeek[s.recipeId] = true;
    if (s.kind === "cook" && s.date !== date && byId[s.recipeId]) { others.push(byId[s.recipeId]); }
    if (s.kind === "leftovers" && s.sourceDate !== date && s.date !== date && byId[s.recipeId]) { sources.push(s.recipeId); }
  });
  return profiles.filter(function (p) { return !inWeek[p.id]; }).map(function (p) {
    return { p: p, score: plannerScore(others.concat([p]), sources, env).score - (p.dinnerOk ? 0 : 100) };
  }).sort(function (a, b) { return b.score !== a.score ? b.score - a.score : plannerByTitle(a.p, b.p); })
    .map(function (x) {
      return {
        recipeId: x.p.id, title: x.p.title, have: x.p.have.map(function (i) { return ctx.typed[i].label; }),
        buy: x.p.buy.map(function (b) { return b.name; }), time: x.p.time, suitable: x.p.dinnerOk
      };
    });
}

// ---------- Shopping impact (a preview; nothing is saved) ----------

// The plan entries a suggestion would become (also used by the preview, with made-up ids).
function plannerEntries(slots, newId) {
  return slots.map(function (s) {
    if (s.kind === "leftovers") {
      return { id: newId(), date: s.date, meal: "dinner", kind: "leftovers", role: "main", recipeId: "", title: "", servings: null, note: s.title, position: 0 };
    }
    return { id: newId(), date: s.date, meal: "dinner", kind: "recipe", role: "main", recipeId: s.recipeId, title: s.title, servings: s.servings, note: "", position: 0 };
  });
}

// What the suggested dinners need, added up by the Shopping list's own sums, then sorted into
//   have:   you listed it, and one normal-size dinner uses it
//   more:   you listed it, but several dinners (or a bigger batch) use it: you may need more
//   buy:    not listed as available
//   pantry: counted as a staple you always have
//   look:   the Shopping list can't add it up, or the line wasn't read with confidence
// Each item is { name, amount, from: [labels], why }.
function plannerShoppingImpact(recipes, slots, options) {
  const ctx = plannerContext(options);
  const impact = { have: [], more: [], buy: [], pantry: [], look: [], dinners: 0 };
  const cooks = slots.filter(function (s) { return s.kind === "cook"; });
  if (cooks.length === 0) { return impact; }
  impact.dinners = slots.length;
  let n = 0;
  const entries = plannerEntries(cooks, function () { n++; return "preview-" + n; });
  const byWeek = {};
  entries.forEach(function (e) { (byWeek[weekStartOf(e.date)] = byWeek[weekStartOf(e.date)] || []).push(e); });
  const bigLabels = {};   // "Tue · Title" of the bigger batches
  cooks.forEach(function (s) {
    if (s.leftoverDates.length > 0 || (s.baseServings && s.servings && s.servings > s.baseServings)) {
      bigLabels[dayShort(s.date) + " · " + s.title] = true;
    }
  });
  Object.keys(byWeek).sort().forEach(function (start) {
    const built = buildShoppingList({ entries: byWeek[start] }, recipes, start);
    built.items.forEach(function (row) {
      const amount = rowAmountText(row);
      const item = { name: row.name, amount: amount, from: row.from.slice(), why: "" };
      const found = plannerClassify(row.name, ctx);
      if (found.status === "pantry") { impact.pantry.push(item); return; }
      if (found.status === "have") {
        const big = row.from.some(function (label) { return bigLabels[label]; });
        if (row.from.length > 1) { item.why = "Used in " + row.from.length + " dinners"; impact.more.push(item); }
        else if (big) { item.why = "A bigger batch needs more than usual"; impact.more.push(item); }
        else { impact.have.push(item); }
        return;
      }
      if (row.look) { item.why = row.written ? "Shown as written" : "Measured in different ways"; impact.look.push(item); return; }
      impact.buy.push(item);
    });
  });
  ["have", "more", "buy", "pantry", "look"].forEach(function (group) {
    impact[group].sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
  });
  return impact;
}

// ---------- Saving (only ever called after the person confirms) ----------

// What saving would do, day by day. Looks at the plan as it is NOW.
//   [{ date, action: "add" | "replace" | "skip", slot, was }]
// keepExisting (the default): a day that already has a dinner is left alone ("skip").
// A leftovers night is skipped too if the dinner it comes from is skipped.
function plannerChanges(plan, slots, keepExisting) {
  const changes = [];
  const skippedCook = {};
  slots.forEach(function (slot) {
    const main = dayOf(plan, slot.date).main;
    let action = !main ? "add" : (keepExisting === false ? "replace" : "skip");
    if (slot.kind === "leftovers" && skippedCook[slot.sourceDate]) { action = "skip"; }
    if (slot.kind === "cook" && action === "skip") { skippedCook[slot.date] = true; }
    let was = "";
    if (main) { was = main.kind === "recipe" ? main.title : main.kind === "leftovers" ? "Leftovers" : main.kind === "out" ? "Eating out" : "Note"; }
    changes.push({ date: slot.date, action: action, slot: slot, was: was });
  });
  return changes;
}

// Returns a NEW plan with the suggestion added (the old plan is left alone), or null if an
// entry couldn't be made. { plan, added, replaced, skipped }
function plannerApply(plan, slots, keepExisting, newId) {
  const changes = plannerChanges(plan, slots, keepExisting);
  let next = plan;
  let added = 0, replaced = 0, skipped = 0;
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    if (c.action === "skip") { skipped++; continue; }
    const s = c.slot;
    const fields = s.kind === "leftovers"
      ? { kind: "leftovers", role: "main", recipeId: "", title: "", servings: null, note: s.title }
      : { kind: "recipe", role: "main", recipeId: s.recipeId, title: s.title, servings: s.servings, note: "" };
    next = addEntry(next, s.date, fields, newId());
    if (next === null) { return null; }
    if (c.action === "replace") { replaced++; } else { added++; }
  }
  return { plan: next, added: added, replaced: replaced, skipped: skipped };
}

// Lets the Node checks load this file.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PLANNER_PRIORITIES: PLANNER_PRIORITIES, plannerMatches: plannerMatches, plannerContext: plannerContext,
    plannerClassify: plannerClassify, plannerProfile: plannerProfile, plannerScore: plannerScore,
    plannerArrange: plannerArrange, plannerSuggest: plannerSuggest, plannerAlternatives: plannerAlternatives,
    plannerEntries: plannerEntries, plannerShoppingImpact: plannerShoppingImpact,
    plannerChanges: plannerChanges, plannerApply: plannerApply, plannerHash: plannerHash
  };
}
