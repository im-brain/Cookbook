// Checks for js/fridge.js ("What's in my fridge?"). Run: node tests/fridge.test.js
const ing = require("../js/ingredients.js");
const f = require("../js/fridge.js");
let passed = 0, failed = 0;
function check(name, ok, extra) { if (ok) { passed++; } else { failed++; console.log("FAIL:", name, extra === undefined ? "" : JSON.stringify(extra)); } }
function eq(name, got, want) { check(name, JSON.stringify(got) === JSON.stringify(want), { got: got, want: want }); }
function recipe(id, title, lines) {
  return { id: id, current: { title: title, ingredients: ing.parseIngredients(lines), steps: [], servings: null, timeMinutes: null, tags: [] } };
}
function rank(recipes, text, pantry) { return f.rankByFridge(recipes, f.parseFridgeText(text), pantry || []); }
function titles(r) { return r.map(function (x) { return x.recipe.current.title; }); }

// ----- typing -----
eq("commas, lines, and", f.parseFridgeText("eggs, milk\n2 onions and rice"), ["eggs", "milk", "onions", "rice"]);
eq("bullets and repeats", f.parseFridgeText("- Eggs\n• egg\n  \n* Milk"), ["Eggs", "Milk"]);
eq("empty", f.parseFridgeText("  ,, \n"), []);

// ----- matching -----
const m = function (a, b) { return f.fridgeMatches(f.fridgeWords(a), f.fridgeWords(b)); };
check("plural", m("eggs", "egg"));
check("chicken has chicken thighs", m("chicken", "boneless chicken thighs"));
check("red onion has onion", m("red onion", "onion"));
check("butter is not peanut butter", !m("butter", "peanut butter"));
check("peanut butter is not butter", !m("peanut butter", "butter"));
check("cream is not sour cream", !m("cream", "sour cream"));
check("milk is not coconut milk", !m("milk", "coconut milk"));
check("peanut butter matches itself", m("peanut butter", "peanut butter"));
check("pepper is not bell pepper", !m("pepper", "bell pepper"));
check("unrelated", !m("tomato", "onion"));

// ----- ranking -----
const omelet = recipe("a", "Omelet", ["3 eggs", "1 tbsp butter", "salt to taste", "1/4 cup cheddar cheese"]);
const pasta = recipe("b", "Pasta", ["200 g spaghetti", "2 cloves garlic", "olive oil", "1 tsp pepper", "parsley (optional)"]);
const toast = recipe("c", "Toast", ["2 slices bread", "1 tbsp butter"]);
const soup = recipe("d", "Soup", ["For the broth:", "2 onions", "1 carrot", "6 cups water", "2 tbsp olive oil"]);
const all = [omelet, pasta, toast, soup];

let r = rank(all, "eggs, butter, bread");
eq("order: fewest missing first", titles(r), ["Toast", "Omelet"]);
eq("toast is complete", r[0].missing, []);
eq("omelet is missing cheese", r[1].missing, ["cheddar cheese"]);
eq("omelet has", r[1].have, ["eggs", "butter"]);
eq("basics never count", r[1].total, 3);

r = rank(all, "spaghetti, garlic");
eq("basics and optional ignored", [titles(r), r[0].missing], [["Pasta"], []]);

r = rank(all, "onion");
eq("headings skipped, water and oil ignored", [titles(r), r[0].have, r[0].missing, r[0].total], [["Soup"], ["onions"], ["carrot"], 2]);

eq("nothing typed", rank(all, ""), []);
eq("nothing matches", rank(all, "dragonfruit"), []);

r = rank(all, "bread", ["butter"]);
eq("pantry counts as already had", [titles(r), r[0].missing], [["Toast"], []]);
eq("pantry alone does not list a recipe", titles(rank(all, "dragonfruit", ["butter"])), []);

const a1 = recipe("e", "Zucchini bake", ["1 zucchini", "1 egg", "1 onion"]);
const a2 = recipe("f", "Apple cake", ["1 apple", "1 egg", "1 cup flour"]);
eq("tie goes A to Z", titles(rank([a1, a2], "egg")), ["Apple cake", "Zucchini bake"]);
const big = recipe("g", "Big", ["1 egg", "1 a1", "1 b1", "1 c1", "1 d1"]);
const small = recipe("h", "Small", ["1 egg", "1 a1"]);
eq("same missing: bigger share first", titles(rank([small, big], "egg, a1")), ["Small", "Big"]);
eq("damaged recipes are skipped", titles(rank([null, {}, { current: {} }, toast], "bread")), ["Toast"]);

console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
