// js/shopping.js: the logic of the shopping list (Version 34, Phase 8 Part A).
// Plain script: it only works out lists and changes saved data. It never touches the page,
// so it also runs in Node for tests (node tests/shopping.test.js).
//
// The LIST ITSELF is never stored: it is worked out again from the meal plan and the recipes each time.
// What is stored (key "cookbook.shopping", never rename) is only what the person did:
//   { weeks: { "2026-11-09": { seen, ticks, more, extras } }, pantry: [names], aisles: { name: aisle } }
//   seen:   null (never looked yet) or { key: label }   what the list held last time it was looked at
//   ticks:  { key: { text, bases } }                    ticked items; `bases` = how much was needed when ticked
//   more:   { key: { was } }                            ticked items that later needed more (tick was removed)
//   extras: [ { id, text, ticked } ]                    things the person typed in
// `key` is the item's normalized name ("onion"), so the same ingredient from two recipes is one row.

// In Node (the tests) the date and ingredient helpers are loaded here; in the browser they are already there.
if (typeof module !== "undefined" && module.exports) {
  Object.assign(globalThis, require("./plan.js"), require("./ingredients.js"));
}

const SHOPPING_KEY = "cookbook.shopping";   // never rename
const AISLES = ["Produce", "Meat & fish", "Dairy & eggs", "Bakery", "Pantry", "Frozen", "Other"];

// ---------- Names ----------

function shopSingular(word) {
  if (word.length > 4 && /ies$/.test(word)) { return word.slice(0, -3) + "y"; }
  if (word.length > 4 && /oes$/.test(word)) { return word.slice(0, -2); }
  if (word.length > 3 && /s$/.test(word) && !/(ss|us|is)$/.test(word)) { return word.slice(0, -1); }
  return word;
}

// "Red Onions" and "red onion" → "red onion".
function shopKey(name) {
  const words = String(name || "").toLowerCase().replace(/[^a-z0-9%&' -]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) { return ""; }
  words[words.length - 1] = shopSingular(words[words.length - 1]);
  return words.join(" ");
}

// ---------- Aisles (a built-in word list) ----------
// Checked in this order; the first match wins. Anything unknown is "Other".
const AISLE_WORDS = [
  ["Frozen", /\b(frozen|ice cream)\b/],
  ["Pantry", /\b(peanut butter|almond butter|nut butter|coconut milk|coconut cream|almond milk|oat milk|soy milk|canned|dried|stock|broth|bouillon|tomato paste|tomato sauce|crushed tomato|diced tomato)\b/],
  ["Dairy & eggs", /\b(milk|butter|cream|cheese|yogurt|yoghurt|egg|sour cream|buttermilk|mozzarella|parmesan|cheddar|feta|ricotta|ghee|paneer|mascarpone)\b/],
  ["Meat & fish", /\b(chicken|beef|pork|lamb|turkey|bacon|sausage|ham|steak|mince|veal|duck|salmon|tuna|cod|shrimp|prawn|fish|anchovy|anchovies|scallop|crab|lobster|clam|mussel|chorizo|prosciutto|brisket|ribs?)\b/],
  ["Produce", /\b(onion|garlic|shallot|scallion|leek|tomato|potato|carrot|celery|pepper|chili|chile|jalapeno|lettuce|spinach|kale|cabbage|broccoli|cauliflower|zucchini|courgette|cucumber|mushroom|avocado|lemon|lime|orange|apple|banana|berry|berries|strawberry|blueberry|grape|mango|pineapple|peach|pear|ginger|cilantro|coriander|parsley|basil|mint|dill|thyme|rosemary|sage|chive|herb|squash|pumpkin|eggplant|aubergine|corn|pea|bean sprout|asparagus|beet|radish|turnip|fennel|arugula|rocket|salad|greens|bok choy|sweet potato|yam|green bean|watermelon|melon|cherry|plum|apricot|kiwi|fig|pomegranate|coconut)\b/],
  ["Bakery", /\b(bread|bun|roll|bagel|baguette|tortilla|pita|naan|croissant|brioche|wrap|flatbread|sourdough|ciabatta)\b/],
  ["Pantry", /\b(flour|sugar|salt|pepper|oil|vinegar|rice|pasta|noodle|spaghetti|macaroni|oat|cereal|honey|syrup|molasses|yeast|baking|vanilla|cocoa|chocolate|nut|almond|walnut|pecan|cashew|peanut|seed|sesame|spice|cumin|paprika|cinnamon|nutmeg|oregano|turmeric|curry|cayenne|bean|lentil|chickpea|soy sauce|sauce|mustard|ketchup|mayonnaise|mayo|jam|cornstarch|breadcrumb|panko|raisin|coffee|tea|water|wine|beer|lard|shortening|tahini|miso|couscous|quinoa|polenta|cornmeal|gelatin|extract|powder|clove|bay leaf|saffron|cardamom|ginger powder|paste|olive|caper|pickle|salsa)\b/]
];

function guessAisle(name) {
  const text = String(name || "").toLowerCase();
  const single = shopKey(text);   // "onions" is also checked as "onion"
  for (let i = 0; i < AISLE_WORDS.length; i++) {
    if (AISLE_WORDS[i][1].test(text) || AISLE_WORDS[i][1].test(single)) { return AISLE_WORDS[i][0]; }
  }
  return "Other";
}

// "salt to taste" → "salt", "a pinch of nutmeg" → "nutmeg" (lines with no amount keep their whole wording as the item).
function writtenName(text) {
  const cleaned = String(text || "").toLowerCase()
    .replace(/\b(to taste|as needed|for (serving|garnish|garnishing|frying|dusting|greasing|brushing|sprinkling))\b/g, " ")
    .replace(/^\s*(a |an |some )?(pinch|splash|dash|handful|drizzle|sprinkle|little|bit)( of)?\s+/, " ")
    .replace(/[,;(].*$/, " ")
    .replace(/\s+/g, " ").trim();
  return cleaned;
}

function aisleFor(shopping, key, name) {
  const chosen = shopping && shopping.aisles ? shopping.aisles[key] : null;
  return chosen && AISLES.indexOf(chosen) !== -1 ? chosen : guessAisle(name || key);
}

// ---------- Amounts ----------
const SHOP_VOLUME = { cup: 240, tbsp: 15, tsp: 5, "fl oz": 30, ml: 1, l: 1000, quart: 960, pint: 480, gallon: 3840 };
const SHOP_WEIGHT = { oz: 28.35, lb: 453.6, g: 1, kg: 1000 };
const SHOP_METRIC = { ml: true, l: true, g: true, kg: true };

// How many grams one US cup weighs (the same list the converter uses). Matched on whole words.
const SHOP_GRAMS_PER_CUP = [
  [/\bbrown sugar\b/, 213], [/\bpowdered sugar\b|\bicing sugar\b|\bconfectioners'? sugar\b/, 120],
  [/\bsugar\b/, 200], [/\bflour\b/, 120], [/\b(peanut|almond|nut|cookie) butter\b/, 0], [/\bbutter\b/, 227],
  [/\brice\b/, 185], [/\boats?\b/, 90], [/\bcocoa\b/, 85], [/\bmilk\b/, 240], [/\bhoney\b/, 340],
  [/\boil\b/, 218], [/\b(shredded|grated)? ?cheese\b/, 113]
];

function gramsPerCup(name) {
  const text = String(name || "").toLowerCase();
  for (let i = 0; i < SHOP_GRAMS_PER_CUP.length; i++) {
    if (SHOP_GRAMS_PER_CUP[i][0].test(text)) { return SHOP_GRAMS_PER_CUP[i][1] || null; }
  }
  return null;
}

function roundBase(value) { return Math.round(value * 1000) / 1000; }

// Volume in ml → "1½ cups", "2 tbsp", "355 ml" (kitchen fractions for US measures).
function volumeText(ml, metric) {
  if (metric) {
    if (ml >= 1000) { return trimNumber(ml / 1000, 2) + (ml / 1000 > 1 ? " liters" : " liter"); }
    return trimNumber(ml, 0) + " ml";
  }
  if (ml >= 60) { const n = ml / 240; return kitchenNumber(n) + (n > 1.05 ? " cups" : " cup"); }
  if (ml >= 14) { const n = ml / 15; return kitchenNumber(n) + " tbsp"; }
  return kitchenNumber(ml / 5) + " tsp";
}

function weightText(g, metric) {
  if (metric) {
    if (g >= 1000) { return trimNumber(g / 1000, 2) + " kg"; }
    return trimNumber(g, 0) + " g";
  }
  if (g >= 453) { return kitchenNumber(g / 453.6) + " lb"; }
  return kitchenNumber(g / 28.35) + " oz";
}

function trimNumber(value, places) {
  const f = Math.pow(10, places);
  return String(Math.round(value * f) / f);
}

function countText(part) {
  const n = part.n;
  let text = kitchenNumber(n);
  if (part.unit) {
    const many = (typeof UNIT_PLURALS !== "undefined" && UNIT_PLURALS[part.unit]) || part.unit;
    text += " " + (n > 1.05 ? many : part.unit);
  }
  if (part.size) { text += " (" + part.size + ")"; }
  return text;
}

// ---------- Building the list ----------

function recipeServingsFactor(recipe, entry) {
  const base = recipe.current && recipe.current.servings;
  if (entry.servings && base) { return entry.servings / base; }
  return 1;
}

// One row per ingredient name. Returns
// { items: [row], deletedRecipes: n, plannedRecipes: n }
// row = { key, name, parts: [part], from: [text], look: "" | reason, written: bool }
// part = { kind: "vol"|"wt"|"count"|"written", base, metric, unit, size, n }
function buildShoppingList(plan, recipes, weekStart) {
  const byRecipe = {};
  recipes.forEach(function (recipe) { byRecipe[recipe.id] = recipe; });
  const rows = {};
  const order = [];
  let deleted = 0;
  let planned = 0;

  const dates = weekDates(weekStart);
  const entries = plan.entries.filter(function (e) { return e.kind === "recipe" && dates.indexOf(e.date) !== -1; });
  entries.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.position - b.position; });

  entries.forEach(function (entry) {
    const recipe = byRecipe[entry.recipeId];
    planned++;
    if (!recipe || !recipe.current) { deleted++; return; }
    const factor = recipeServingsFactor(recipe, entry);
    const label = dayShort(entry.date) + " · " + (recipe.current.title || entry.title);
    (recipe.current.ingredients || []).forEach(function (raw) {
      const ing = typeof raw === "string" ? parseIngredient(raw) : raw;
      if (!ing || ing.heading || !ing.text) { return; }
      addIngredient(ing, factor, label);
    });
  });

  function row(key, name) {
    if (!rows[key]) { rows[key] = { key: key, name: name, parts: [], from: [], look: "", written: false }; order.push(key); }
    return rows[key];
  }

  function addIngredient(ing, factor, label) {
    let name = (ing.item || "").trim();
    if (!ing.amount && ing.check === "as-written") { name = writtenName(name) || name; }
    const key = shopKey(name);
    // Lines the reader wasn't sure about, or with no usable name, are shown as written.
    if (key === "" || ing.check === "please-check") {
      const text = ing.text.trim();
      const r = row(shopKey(text) || text.toLowerCase(), text);
      r.look = "The app wasn't sure how to read this line, so it is shown as written.";
      r.written = true;
      if (r.from.indexOf(label) === -1) { r.from.push(label); }
      if (r.parts.length === 0) { r.parts.push({ kind: "written" }); }
      return;
    }
    const r = row(key, name);
    if (r.from.indexOf(label) === -1) { r.from.push(label); }
    if (!ing.amount) {
      if (r.parts.length === 0) { r.parts.push({ kind: "written" }); r.written = true; }
      return;
    }
    const amount = ing.amount.to * factor;   // a range uses its upper amount
    const unit = ing.unit || "";
    if (SHOP_VOLUME[unit]) { addMeasured(r, "vol", amount * SHOP_VOLUME[unit], !!SHOP_METRIC[unit]); }
    else if (SHOP_WEIGHT[unit]) { addMeasured(r, "wt", amount * SHOP_WEIGHT[unit], !!SHOP_METRIC[unit]); }
    else { addCount(r, unit, ing.size || "", amount); }
  }

  function dropWritten(r) {
    r.parts = r.parts.filter(function (p) { return p.kind !== "written"; });
  }
  function addMeasured(r, kind, base, metric) {
    dropWritten(r); r.written = false;
    const have = r.parts.filter(function (p) { return p.kind === kind; })[0];
    if (have) { have.base = roundBase(have.base + base); have.metric = have.metric && metric; }
    else { r.parts.push({ kind: kind, base: roundBase(base), metric: metric }); }
  }
  function addCount(r, unit, size, n) {
    dropWritten(r); r.written = false;
    const have = r.parts.filter(function (p) { return p.kind === "count" && p.unit === unit && p.size === size; })[0];
    if (have) { have.n = roundBase(have.n + n); have.base = have.n; }
    else { r.parts.push({ kind: "count", unit: unit, size: size, n: roundBase(n), base: roundBase(n) }); }
  }

  const items = order.map(function (key) {
    const r = rows[key];
    // Cups and grams of the same known ingredient (flour, butter...) are added up in cups.
    const vol = r.parts.filter(function (p) { return p.kind === "vol"; })[0];
    const wt = r.parts.filter(function (p) { return p.kind === "wt"; })[0];
    if (vol && wt) {
      const gpc = gramsPerCup(r.name);
      if (gpc) {
        vol.base = roundBase(vol.base + wt.base / gpc * 240);
        vol.metric = false;
        r.parts = r.parts.filter(function (p) { return p !== wt; });
      }
    }
    if (r.parts.length > 1 && !r.look) {
      r.look = "This is measured in different ways in your recipes, so it can't be added up. Check how much you need.";
    }
    return r;
  });
  return { items: items, deletedRecipes: deleted, plannedRecipes: planned };
}

// "1½ cups + 200 g" for a row.
function rowAmountText(r) {
  const texts = r.parts.map(function (p) {
    if (p.kind === "vol") { return volumeText(p.base, p.metric); }
    if (p.kind === "wt") { return weightText(p.base, p.metric); }
    if (p.kind === "count") { return countText(p); }
    return "";
  }).filter(Boolean);
  return texts.join(" + ");
}

// What was needed, per kind of measure, so a later change can be compared.
function rowBases(r) {
  const bases = {};
  r.parts.forEach(function (p) {
    if (p.kind === "written") { return; }
    bases[p.kind === "count" ? "count:" + p.unit + ":" + p.size : p.kind] = p.base;
  });
  return bases;
}

// ---------- Saved choices ----------

function emptyWeek() { return { seen: null, ticks: {}, more: {}, extras: [] }; }

function cleanWeek(raw) {
  const week = emptyWeek();
  if (!raw || typeof raw !== "object") { return week; }
  if (raw.seen && typeof raw.seen === "object" && !Array.isArray(raw.seen)) {
    week.seen = {};
    Object.keys(raw.seen).forEach(function (k) { if (typeof raw.seen[k] === "string") { week.seen[k] = raw.seen[k].slice(0, 120); } });
  }
  if (raw.ticks && typeof raw.ticks === "object") {
    Object.keys(raw.ticks).forEach(function (k) {
      const t = raw.ticks[k];
      if (!t || typeof t !== "object") { return; }
      const bases = {};
      if (t.bases && typeof t.bases === "object") {
        Object.keys(t.bases).forEach(function (b) { if (typeof t.bases[b] === "number" && isFinite(t.bases[b])) { bases[b] = t.bases[b]; } });
      }
      week.ticks[k] = { text: typeof t.text === "string" ? t.text.slice(0, 120) : "", bases: bases };
    });
  }
  if (raw.more && typeof raw.more === "object") {
    Object.keys(raw.more).forEach(function (k) {
      if (raw.more[k] && typeof raw.more[k].was === "string") { week.more[k] = { was: raw.more[k].was.slice(0, 120) }; }
    });
  }
  if (Array.isArray(raw.extras)) {
    const ids = {};
    raw.extras.forEach(function (x) {
      if (!x || typeof x.id !== "string" || x.id === "" || ids[x.id]) { return; }
      const text = typeof x.text === "string" ? x.text.trim().slice(0, 120) : "";
      if (text === "") { return; }
      ids[x.id] = true;
      week.extras.push({ id: x.id.slice(0, 80), text: text, ticked: x.ticked === true });
    });
  }
  return week;
}

function cleanShopping(raw) {
  const shopping = { weeks: {}, pantry: [], aisles: {} };
  if (!raw || typeof raw !== "object") { return shopping; }
  if (raw.weeks && typeof raw.weeks === "object") {
    Object.keys(raw.weeks).forEach(function (start) {
      if (isDateText(start)) { shopping.weeks[start] = cleanWeek(raw.weeks[start]); }
    });
  }
  if (Array.isArray(raw.pantry)) {
    raw.pantry.forEach(function (name) {
      if (typeof name === "string" && name.trim() !== "" && shopping.pantry.indexOf(name) === -1) { shopping.pantry.push(name.slice(0, 120)); }
    });
  }
  if (raw.aisles && typeof raw.aisles === "object") {
    Object.keys(raw.aisles).forEach(function (k) {
      if (AISLES.indexOf(raw.aisles[k]) !== -1) { shopping.aisles[k] = raw.aisles[k]; }
    });
  }
  return shopping;
}

function weekOf(shopping, start) {
  return shopping.weeks[start] || emptyWeek();
}

// Returns a copy of the shopping data with one week replaced.
function withWeek(shopping, start, week) {
  const copy = cleanShopping(shopping);
  copy.weeks[start] = week;
  return copy;
}

function isShoppingEmpty(shopping) {
  return Object.keys(shopping.weeks).length === 0 && shopping.pantry.length === 0 && Object.keys(shopping.aisles).length === 0;
}

// ---------- Looking at the list: what changed since the last look ----------

// Works out what to show for a week. Returns
// { sections: { look: [item], aisles: { name: [item] } }, extras, leftOff: [item], gone: [{key,label}],
//   week: the week data with the changes noted (save it if `changed`), changed: bool, newCount, total, ticked }
// item = { key, name, amount, from, look, ticked, isNew, moreWas, aisle, written }
function shoppingView(shopping, built, start) {
  const week = cleanWeek(weekOf(shopping, start));
  let changed = false;
  const pantry = {};
  shopping.pantry.forEach(function (name) { pantry[shopKey(name)] = true; });

  const shown = [];
  const leftOff = [];
  built.items.forEach(function (r) {
    if (pantry[r.key]) { leftOff.push(r); } else { shown.push(r); }
  });

  // A ticked item that now needs more loses its tick, and says why.
  shown.forEach(function (r) {
    const tick = week.ticks[r.key];
    if (!tick) { return; }
    const bases = rowBases(r);
    let more = false;
    Object.keys(bases).forEach(function (k) {
      if (!(k in tick.bases) || bases[k] > tick.bases[k] + 0.0005) { more = true; }
    });
    if (more) {
      week.more[r.key] = { was: tick.text };
      delete week.ticks[r.key];
      changed = true;
    }
  });

  // First look at a week that has items: nothing is "New" yet.
  const currentKeys = {};
  built.items.forEach(function (r) { currentKeys[r.key] = true; });
  if (week.seen === null && built.items.length > 0) {
    week.seen = {};
    built.items.forEach(function (r) { week.seen[r.key] = r.name; });
    changed = true;
  }

  const items = shown.map(function (r) {
    const ticked = !!week.ticks[r.key];
    const text = rowAmountText(r);
    return {
      key: r.key, name: r.name, amount: text, from: r.from, look: r.look,
      ticked: ticked, isNew: week.seen !== null && !(r.key in week.seen),
      moreWas: !ticked && week.more[r.key] ? week.more[r.key].was : "",
      aisle: aisleFor(shopping, r.key, r.name), written: r.written, bases: rowBases(r)
    };
  });

  const view = { look: [], aisles: {}, extras: week.extras, leftOff: leftOff, gone: [], week: week, changed: changed, newCount: 0, total: 0, ticked: 0 };
  items.forEach(function (it) {
    if (it.look) { view.look.push(it); }
    else { (view.aisles[it.aisle] = view.aisles[it.aisle] || []).push(it); }
    if (it.isNew) { view.newCount++; }
    view.total++;
    if (it.ticked) { view.ticked++; }
  });
  week.extras.forEach(function (x) { view.total++; if (x.ticked) { view.ticked++; } });
  Object.keys(view.aisles).forEach(function (a) {
    view.aisles[a].sort(function (x, y) { return x.name.toLowerCase() < y.name.toLowerCase() ? -1 : 1; });
  });
  view.look.sort(function (x, y) { return x.name.toLowerCase() < y.name.toLowerCase() ? -1 : 1; });

  // No longer needed: seen or ticked before, not on the list now, and not just moved to the pantry.
  const gone = {};
  Object.keys(week.seen || {}).forEach(function (k) { if (!currentKeys[k]) { gone[k] = week.seen[k]; } });
  Object.keys(week.ticks).forEach(function (k) { if (!currentKeys[k] && !(k in gone)) { gone[k] = k; } });
  view.gone = Object.keys(gone).map(function (k) { return { key: k, label: gone[k] }; });
  return view;
}

// ---------- Changes the person makes ----------

// Ticking: remembers how much was needed, and counts the item as seen.
function tickItem(shopping, start, item, on) {
  const week = cleanWeek(weekOf(shopping, start));
  if (on) {
    week.ticks[item.key] = { text: item.amount, bases: item.bases };
    delete week.more[item.key];
    if (week.seen === null) { week.seen = {}; }
    week.seen[item.key] = item.name;
  } else {
    delete week.ticks[item.key];
  }
  return withWeek(shopping, start, week);
}

// "Got it": everything on the list now counts as seen (clears the New marks and the "more needed" notes).
function markAllSeen(shopping, start, view) {
  const week = cleanWeek(view.week);
  week.seen = {};
  const all = view.look.concat(Object.keys(view.aisles).reduce(function (list, a) { return list.concat(view.aisles[a]); }, []));
  all.forEach(function (it) { week.seen[it.key] = it.name; });
  view.leftOff.forEach(function (r) { week.seen[r.key] = r.name; });
  week.more = {};
  return withWeek(shopping, start, week);
}

// Removes an item from "No longer needed".
function forgetItem(shopping, start, key) {
  const week = cleanWeek(weekOf(shopping, start));
  if (week.seen) { delete week.seen[key]; }
  delete week.ticks[key];
  delete week.more[key];
  return withWeek(shopping, start, week);
}

function addExtra(shopping, start, text, id) {
  const clean = String(text || "").trim().slice(0, 120);
  if (clean === "") { return shopping; }
  const week = cleanWeek(weekOf(shopping, start));
  week.extras.push({ id: id, text: clean, ticked: false });
  return withWeek(shopping, start, week);
}

function tickExtra(shopping, start, id, on) {
  const week = cleanWeek(weekOf(shopping, start));
  week.extras.forEach(function (x) { if (x.id === id) { x.ticked = on; } });
  return withWeek(shopping, start, week);
}

function removeExtra(shopping, start, id) {
  const week = cleanWeek(weekOf(shopping, start));
  week.extras = week.extras.filter(function (x) { return x.id !== id; });
  return withWeek(shopping, start, week);
}

function setPantry(shopping, key, name, on) {
  const copy = cleanShopping(shopping);
  copy.pantry = copy.pantry.filter(function (n) { return shopKey(n) !== key; });
  if (on) { copy.pantry.push(name); }
  return copy;
}

function setAisle(shopping, key, aisle) {
  const copy = cleanShopping(shopping);
  if (AISLES.indexOf(aisle) === -1) { delete copy.aisles[key]; } else { copy.aisles[key] = aisle; }
  return copy;
}

// ---------- Backups ----------

// Adds what the file has and the phone doesn't (never deletes, the phone's choice wins).
// Returns { shopping, added } where `added` counts new extras, pantry items and weeks.
function mergeShopping(onPhone, fromFile) {
  const phone = cleanShopping(onPhone);
  const file = cleanShopping(fromFile);
  let added = 0;
  Object.keys(file.weeks).forEach(function (start) {
    if (!phone.weeks[start]) {
      phone.weeks[start] = file.weeks[start];
      added++;
      return;
    }
    const mine = phone.weeks[start];
    file.weeks[start].extras.forEach(function (x) {
      if (!mine.extras.some(function (y) { return y.id === x.id; })) { mine.extras.push(x); added++; }
    });
  });
  file.pantry.forEach(function (n) {
    if (!phone.pantry.some(function (m) { return shopKey(m) === shopKey(n); })) { phone.pantry.push(n); added++; }
  });
  Object.keys(file.aisles).forEach(function (k) {
    if (!(k in phone.aisles)) { phone.aisles[k] = file.aisles[k]; added++; }
  });
  return { shopping: phone, added: added };
}

// The unticked items as plain text, one per line, to hand to another shopping app (Version 38).
// Takes the result of shoppingView(). Ticked items and pantry items are left out; no headings.
function shoppingExportText(view) {
  const lines = [];
  function add(it) {
    if (it.ticked) { return; }
    const amount = it.amount || "";
    if (!amount) { lines.push(it.name); }
    else if (it.look) { lines.push(it.name + ": " + amount); }
    else { lines.push(amount + " " + it.name); }
  }
  view.look.forEach(add);
  Object.keys(view.aisles).sort(function (a, b) { return AISLES.indexOf(a) - AISLES.indexOf(b); })
    .forEach(function (a) { view.aisles[a].forEach(add); });
  view.extras.forEach(function (x) { if (!x.ticked) { lines.push(x.text); } });
  return { text: lines.join("\n"), count: lines.length };
}

// Lets the Node checks load this file.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    AISLES: AISLES, shopKey: shopKey, guessAisle: guessAisle, buildShoppingList: buildShoppingList,
    rowAmountText: rowAmountText, cleanShopping: cleanShopping, shoppingView: shoppingView, tickItem: tickItem,
    markAllSeen: markAllSeen, forgetItem: forgetItem, addExtra: addExtra, tickExtra: tickExtra,
    removeExtra: removeExtra, setPantry: setPantry, setAisle: setAisle, mergeShopping: mergeShopping,
    isShoppingEmpty: isShoppingEmpty, shoppingExportText: shoppingExportText, writtenName: writtenName, withWeek: withWeek, volumeText: volumeText, weightText: weightText
  };
}
