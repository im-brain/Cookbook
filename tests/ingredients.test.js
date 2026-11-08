// Checks for js/ingredients.js. Run with:  node tests/ingredients.test.js
// Every line below is made up. Each row: the line, then what the reader should find.
const assert = require("assert");
const I = require("../js/ingredients.js");

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; }
  catch (error) { console.error("FAIL: " + name + "\n  " + error.message); process.exitCode = 1; }
}

// [line, from, to, unit, item, size, prep, optional, check]
const LINES = [
  // plain amounts and units
  ["2 cups flour", 2, 2, "cup", "flour", "", "", false, "ok"],
  ["1 cup sugar", 1, 1, "cup", "sugar", "", "", false, "ok"],
  ["1 tbsp olive oil", 1, 1, "tbsp", "olive oil", "", "", false, "ok"],
  ["2 Tbsp butter", 2, 2, "tbsp", "butter", "", "", false, "ok"],
  ["1 T soy sauce", 1, 1, "tbsp", "soy sauce", "", "", false, "ok"],
  ["1 t vanilla", 1, 1, "tsp", "vanilla", "", "", false, "ok"],
  ["1 tsp. salt", 1, 1, "tsp", "salt", "", "", false, "ok"],
  ["3 tablespoons honey", 3, 3, "tbsp", "honey", "", "", false, "ok"],
  ["2 teaspoons baking powder", 2, 2, "tsp", "baking powder", "", "", false, "ok"],
  ["8 oz cream cheese", 8, 8, "oz", "cream cheese", "", "", false, "ok"],
  ["8 ounces pasta", 8, 8, "oz", "pasta", "", "", false, "ok"],
  ["1 lb ground beef", 1, 1, "lb", "ground beef", "", "", false, "ok"],
  ["2 pounds potatoes", 2, 2, "lb", "potatoes", "", "", false, "ok"],
  ["250 g flour", 250, 250, "g", "flour", "", "", false, "ok"],
  ["250g flour", 250, 250, "g", "flour", "", "", false, "ok"],
  ["1 kg rice", 1, 1, "kg", "rice", "", "", false, "ok"],
  ["500 ml milk", 500, 500, "ml", "milk", "", "", false, "ok"],
  ["1 liter water", 1, 1, "l", "water", "", "", false, "ok"],
  ["2 fl oz lemon juice", 2, 2, "fl oz", "lemon juice", "", "", false, "ok"],
  ["1 quart stock", 1, 1, "quart", "stock", "", "", false, "ok"],
  ["1 pinch nutmeg", 1, 1, "pinch", "nutmeg", "", "", false, "ok"],
  ["1 pinch of salt", 1, 1, "pinch", "salt", "", "", false, "ok"],
  ["2 cloves garlic", 2, 2, "clove", "garlic", "", "", false, "ok"],
  ["2 cloves garlic, minced", 2, 2, "clove", "garlic", "", "minced", false, "ok"],
  ["1 bunch cilantro", 1, 1, "bunch", "cilantro", "", "", false, "ok"],
  ["4 slices bacon", 4, 4, "slice", "bacon", "", "", false, "ok"],
  ["1 stick butter", 1, 1, "stick", "butter", "", "", false, "ok"],
  ["2 sprigs thyme", 2, 2, "sprig", "thyme", "", "", false, "ok"],
  ["1 handful spinach", 1, 1, "handful", "spinach", "", "", false, "ok"],
  // no unit, counted things
  ["3 eggs", 3, 3, "", "eggs", "", "", false, "ok"],
  ["1 onion, diced", 1, 1, "", "onion", "", "diced", false, "ok"],
  ["2 large carrots, peeled and sliced", 2, 2, "", "large carrots", "", "peeled and sliced", false, "ok"],
  ["4 chicken thighs", 4, 4, "", "chicken thighs", "", "", false, "ok"],
  // fractions and decimals
  ["1/2 cup milk", 0.5, 0.5, "cup", "milk", "", "", false, "ok"],
  ["½ cup milk", 0.5, 0.5, "cup", "milk", "", "", false, "ok"],
  ["1½ cups flour", 1.5, 1.5, "cup", "flour", "", "", false, "ok"],
  ["1 1/2 cups flour", 1.5, 1.5, "cup", "flour", "", "", false, "ok"],
  ["1 ½ cups flour", 1.5, 1.5, "cup", "flour", "", "", false, "ok"],
  ["1.5 cups flour", 1.5, 1.5, "cup", "flour", "", "", false, "ok"],
  ["3/4 tsp salt", 0.75, 0.75, "tsp", "salt", "", "", false, "ok"],
  ["¾ tsp salt", 0.75, 0.75, "tsp", "salt", "", "", false, "ok"],
  ["⅓ cup oil", 1 / 3, 1 / 3, "cup", "oil", "", "", false, "ok"],
  ["2⅔ cups water", 2 + 2 / 3, 2 + 2 / 3, "cup", "water", "", "", false, "ok"],
  ["0.5 tsp cumin", 0.5, 0.5, "tsp", "cumin", "", "", false, "ok"],
  // ranges
  ["2-3 cups broth", 2, 3, "cup", "broth", "", "", false, "ok"],
  ["2–3 cups broth", 2, 3, "cup", "broth", "", "", false, "ok"],
  ["2 to 3 cups broth", 2, 3, "cup", "broth", "", "", false, "ok"],
  ["1/2-1 tsp chili flakes", 0.5, 1, "tsp", "chili flakes", "", "", false, "ok"],
  ["1-2 tbsp lemon juice", 1, 2, "tbsp", "lemon juice", "", "", false, "ok"],
  ["3 - 4 carrots", 3, 4, "", "carrots", "", "", false, "ok"],
  // package sizes: the size never scales
  ["2 (14 oz) cans crushed tomatoes", 2, 2, "can", "crushed tomatoes", "14 oz", "", false, "ok"],
  ["1 (15-ounce) can chickpeas, drained", 1, 1, "can", "chickpeas", "15-ounce", "drained", false, "ok"],
  ["1 can (14 oz) coconut milk", 1, 1, "can", "coconut milk", "14 oz", "", false, "ok"],
  ["2 14-oz cans black beans", 2, 2, "can", "black beans", "14 oz", "", false, "ok"],
  ["1 (8 ounce) package cream cheese, softened", 1, 1, "package", "cream cheese", "8 ounce", "softened", false, "ok"],
  ["3 (400 g) tins tomatoes", 3, 3, "can", "tomatoes", "400 g", "", false, "ok"],
  ["1 (12-inch) pie crust", 1, 1, "", "pie crust", "12-inch", "", false, "ok"],
  // "of" and extra words
  ["1 cup of sugar", 1, 1, "cup", "sugar", "", "", false, "ok"],
  ["2 cups of warm water", 2, 2, "cup", "warm water", "", "", false, "ok"],
  ["1 cup flour (120 g)", 1, 1, "cup", "flour (120 g)", "", "", false, "ok"],
  ["1 cup (240 ml) milk", 1, 1, "cup", "milk", "240 ml", "", false, "ok"],
  ["1 tsp salt, to taste", 1, 1, "tsp", "salt", "", "to taste", false, "ok"],
  ["2 tbsp butter, melted", 2, 2, "tbsp", "butter", "", "melted", false, "ok"],
  ["1 cup cheese, shredded (about 4 oz)", 1, 1, "cup", "cheese", "", "shredded (about 4 oz)", false, "ok"],
  // optional
  ["1/4 cup walnuts (optional)", 0.25, 0.25, "cup", "walnuts", "", "", true, "ok"],
  ["1 tbsp parsley, optional", 1, 1, "tbsp", "parsley", "", "", true, "ok"],
  ["2 tbsp chives, chopped (optional)", 2, 2, "tbsp", "chives", "", "chopped", true, "ok"],
  // lines the reader is not sure about: kept, flagged
  ["1 cup or 120 g flour", 1, 1, "cup", "or 120 g flour", "", "", false, "please-check"],
  ["1 cup + 2 tbsp flour", 1, 1, "cup", "+ 2 tbsp flour", "", "", false, "please-check"],
  ["2 cups", 2, 2, "cup", "", "", "", false, "please-check"],
  ["12-inch tortillas", 12, 12, "", "-inch tortillas", "", "", false, "please-check"],
  ["3 7-up cans", 3, 3, "", "7-up cans", "", "", false, "please-check"],
  ["9999 cups sugar", 9999, 9999, "cup", "sugar", "", "", false, "please-check"],
  // no amount: kept as written, never scaled
  ["salt to taste", null, null, "", "salt to taste", "", "", false, "as-written"],
  ["salt and pepper", null, null, "", "salt and pepper", "", "", false, "as-written"],
  ["Juice of 1 lemon", null, null, "", "Juice of 1 lemon", "", "", false, "as-written"],
  ["A pinch of salt", null, null, "", "A pinch of salt", "", "", false, "as-written"],
  ["Fresh basil, for garnish", null, null, "", "Fresh basil, for garnish", "", "", false, "as-written"],
  ["Cooking spray", null, null, "", "Cooking spray", "", "", false, "as-written"],
  ["Olive oil (optional)", null, null, "", "Olive oil (optional)", "", "", true, "as-written"]
];

// The "item" of an as-written line keeps the full text, so only compare the amount and flag there.
LINES.forEach(function (row) {
  const line = row[0];
  check("parse: " + line, function () {
    const r = I.parseIngredient(line);
    assert.strictEqual(r.text, line.trim(), "text is kept exactly");
    assert.strictEqual(r.check, row[8], "check");
    assert.strictEqual(r.optional, row[7], "optional");
    if (row[1] === null) {
      assert.strictEqual(r.amount, null, "no amount");
      return;
    }
    assert.ok(r.amount, "has an amount");
    assert.ok(Math.abs(r.amount.from - row[1]) < 1e-9, "from " + r.amount.from);
    assert.ok(Math.abs(r.amount.to - row[2]) < 1e-9, "to " + r.amount.to);
    assert.strictEqual(r.unit, row[3], "unit");
    assert.strictEqual(r.item, row[4], "item");
    assert.strictEqual(r.size, row[5], "size");
    assert.strictEqual(r.prep, row[6], "prep");
  });
});

// Section headings
["For the sauce:", "Topping:", "  Dough:  "].forEach(function (line) {
  check("heading: " + line, function () {
    const r = I.parseIngredient(line);
    assert.strictEqual(r.heading, true);
    assert.strictEqual(r.text, line.trim());
    assert.strictEqual(r.amount, undefined);
  });
});
check("a long line ending in ':' is not a heading", function () {
  assert.notStrictEqual(I.parseIngredient("x".repeat(70) + ":").heading, true);
});

// Odd input never throws
["", "   ", "💥", "1", "½", "cup", "0 cups flour", "-5 g flour", "1/0 cup"].forEach(function (line) {
  check("does not throw: '" + line + "'", function () {
    const r = I.parseIngredient(line);
    assert.strictEqual(typeof r.text, "string");
  });
});

// Scaling: only the amount at the start changes; the wording and package size stay.
function scaled(line, factor) {
  const s = I.scaleIngredient(I.parseIngredient(line), factor);
  return s === null ? null : s.before + s.scaled + s.rest;
}
[
  ["2 (14 oz) cans crushed tomatoes", 1.5, "3 (14 oz) cans crushed tomatoes"],
  ["2 (14 oz) cans crushed tomatoes", 2, "4 (14 oz) cans crushed tomatoes"],
  ["2 14-oz cans black beans", 2, "4 14-oz cans black beans"],
  ["1 cup flour", 0.5, "½ cup flour"],
  ["1 cup flour", 3, "3 cup flour"],
  ["1½ cups flour", 2, "3 cups flour"],
  ["1 1/2 cups flour", 2, "3 cups flour"],
  ["2-3 cups broth", 2, "4-6 cups broth"],
  ["2 to 3 cups broth", 2, "4 to 6 cups broth"],
  ["250 g flour", 1 / 3, "83 g flour"],
  ["1 tsp salt", 1 / 3, "⅓ tsp salt"],
  ["3 eggs", 2, "6 eggs"],
  ["Juice of 1 lemon", 2, null],
  ["salt to taste", 2, null],
  ["For the sauce:", 2, null]
].forEach(function (row) {
  check("scale: " + row[0] + " ×" + row[1], function () {
    assert.strictEqual(scaled(row[0], row[1]), row[2]);
  });
});
check("scale: old plain line also works", function () {
  const s = I.scaleIngredient("2 eggs", 2);
  assert.strictEqual(s.scaled, "4");
});
check("scale: the amount field is what is used", function () {
  const ing = I.parseIngredient("2 cups flour");
  ing.amount = { from: 5, to: 5 };
  assert.strictEqual(I.scaleIngredient(ing, 2).scaled, "10");
});

// Saved data: converting, cleaning and round trips
check("upgradeIngredients converts old lines and keeps the words", function () {
  const part = { ingredients: ["2 eggs", "For the sauce:", "salt"] };
  assert.strictEqual(I.upgradeIngredients(part), true);
  assert.deepStrictEqual(part.ingredients.map(I.ingredientText), ["2 eggs", "For the sauce:", "salt"]);
  assert.strictEqual(I.upgradeIngredients(part), false, "second time changes nothing");
});
check("cleanIngredient is stable (same JSON after cleaning)", function () {
  LINES.forEach(function (row) {
    const once = I.parseIngredient(row[0]);
    const twice = I.cleanIngredient(JSON.parse(JSON.stringify(once)));
    assert.strictEqual(JSON.stringify(twice), JSON.stringify(once), row[0]);
  });
});
check("cleanIngredient: damaged objects are repaired or dropped", function () {
  assert.strictEqual(I.cleanIngredient(null), null);
  assert.strictEqual(I.cleanIngredient(42), null);
  assert.strictEqual(I.cleanIngredient({ text: "" }), null);
  assert.strictEqual(I.cleanIngredient({ amount: { from: 1 } }), null);
  const fixed = I.cleanIngredient({ text: "2 eggs", amount: { from: "x" }, check: "weird" });
  assert.strictEqual(fixed.amount, null);
  assert.strictEqual(fixed.check, "please-check");
  assert.strictEqual(fixed.text, "2 eggs");
});
check("cleanIngredientList accepts old strings, objects, junk", function () {
  const list = I.cleanIngredientList(["2 eggs", { text: "1 cup milk" }, 7, null, "  "]);
  assert.deepStrictEqual(list.map(I.ingredientText), ["2 eggs", "1 cup milk"]);
  assert.deepStrictEqual(I.cleanIngredientList("nope"), []);
});

// Amount helpers (moved here from app.js; same behaviour)
check("kitchenNumber", function () {
  assert.strictEqual(I.kitchenNumber(1.5), "1½");
  assert.strictEqual(I.kitchenNumber(0.33), "⅓");
  assert.strictEqual(I.kitchenNumber(375.2), "375");
  assert.strictEqual(I.kitchenNumber(0.01), "⅛");
});
check("amountToNumber", function () {
  assert.strictEqual(I.amountToNumber("1 1/2"), 1.5);
  assert.strictEqual(I.amountToNumber("1½"), 1.5);
  assert.strictEqual(I.amountToNumber("0"), null);
});

console.log(passed + " checks passed" + (process.exitCode ? ", some FAILED" : ""));
