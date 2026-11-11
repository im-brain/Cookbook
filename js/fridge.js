// ======================================================================
// "What's in my fridge?" (Version 37)
// You type what you have; saved recipes are ranked by how many of their ingredients you have.
// Everything happens on the phone. Nothing is saved or sent anywhere.
//
// Rules (the user's choices):
//   - basics (salt, pepper, water, oil) never count, as have or as missing
//   - optional ingredients and section headings are left out
//   - things marked "I always have this" on the Shopping list count as already in the fridge
//   - only "my version" of a recipe is looked at
// A plain script (no build step). Also runs in Node: node tests/fridge.test.js
// ======================================================================

const fridgeShop = (typeof module !== "undefined" && module.exports) ? require("./shopping.js") : null;

// Words that make an ingredient a "basic" (all of its words must be in this list).
const BASIC_WORDS = ["salt", "pepper", "black", "white", "ground", "kosher", "sea", "fine", "coarse", "table",
  "freshly", "cracked", "water", "cold", "hot", "warm", "ice", "oil", "olive", "vegetable", "cooking", "canola",
  "extra", "virgin", "light", "neutral", "spray", "and", "of"];

// Names where the second word changes the food ("peanut butter" is not "butter").
// If either side has one of these, the other side must have it too.
const COMPOUND_NAMES = ["peanut butter", "almond butter", "nut butter", "sour cream", "ice cream", "cream cheese",
  "coconut milk", "coconut cream", "almond milk", "oat milk", "soy milk", "brown sugar", "powdered sugar",
  "bell pepper", "sweet potato", "green onion", "tomato paste", "tomato sauce", "soy sauce", "fish sauce",
  "baking powder", "baking soda", "corn starch", "cornstarch", "whipping cream", "heavy cream"];

function fridgeKey(name) {
  return fridgeShop ? fridgeShop.shopKey(name) : shopKey(name);
}

function fridgeWritten(text) {
  return fridgeShop ? fridgeShop.writtenName(text) : writtenName(text);
}

// "chicken thighs" → ["chicken", "thigh"]  (every word made singular)
function fridgeWords(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9%&' -]/g, " ").split(/\s+/).filter(Boolean)
    .map(function (w) { return fridgeKey(w); }).filter(Boolean);
}

// What the person typed → a list of items ("eggs, milk\n2 onions" → ["eggs", "milk", "onions"]).
// A leading amount or bullet is dropped; the same food twice is kept once.
function parseFridgeText(text) {
  const parts = String(text || "").split(/[\n,;]+|\band\b|&|•|·/i);
  const items = [];
  const seen = {};
  parts.forEach(function (part) {
    const cleaned = part.replace(/^[\s\-–—*\d.\/½¼¾⅓⅔⅛]+/, "").replace(/\s+/g, " ").trim().slice(0, 60);
    const key = fridgeWords(cleaned).join(" ");
    if (key === "" || seen[key]) { return; }
    seen[key] = true;
    items.push(cleaned);
  });
  return items;
}

function isBasicName(words) {
  return words.length > 0 && words.every(function (w) { return BASIC_WORDS.indexOf(w) !== -1; });
}

function compoundsIn(words) {
  const joined = " " + words.join(" ") + " ";
  return COMPOUND_NAMES.filter(function (c) { return joined.indexOf(" " + fridgeWords(c).join(" ") + " ") !== -1; });
}

// Does a fridge item (a list of words) stand for an ingredient (a list of words)?
function fridgeMatches(fridgeList, ingredientList) {
  if (fridgeList.length === 0 || ingredientList.length === 0) { return false; }
  const inIngredient = function (w) { return ingredientList.indexOf(w) !== -1; };
  const inFridge = function (w) { return fridgeList.indexOf(w) !== -1; };
  // "chicken" has "chicken thighs"; "red onion" has "onion".
  if (!fridgeList.every(inIngredient) && !ingredientList.every(inFridge)) { return false; }
  // But "butter" does not have "peanut butter".
  const bad = function (compoundList, otherList) {
    return compoundList.some(function (c) {
      return !fridgeWords(c).every(function (w) { return otherList.indexOf(w) !== -1; });
    });
  };
  if (bad(compoundsIn(ingredientList), fridgeList)) { return false; }
  if (bad(compoundsIn(fridgeList), ingredientList)) { return false; }
  return true;
}

// The name to match and to show for one ingredient record (or an old plain line).
function fridgeIngredientName(ingredient) {
  if (typeof ingredient === "string") { return fridgeWritten(ingredient); }
  if (!ingredient || ingredient.heading) { return ""; }
  const item = typeof ingredient.item === "string" ? ingredient.item.trim() : "";
  return fridgeWritten(item !== "" ? item : ingredient.text);
}

// Ranks recipes. fridgeItems: typed names. pantryNames: "I always have this" names (may be empty).
// Returns [{ recipe, have: [names], missing: [names], total }] with at least one match, best first:
// fewest missing, then the biggest share, then A to Z.
function rankByFridge(recipes, fridgeItems, pantryNames) {
  const owned = (fridgeItems || []).concat(pantryNames || []).map(fridgeWords).filter(function (w) { return w.length > 0; });
  const typed = (fridgeItems || []).map(fridgeWords).filter(function (w) { return w.length > 0; });
  if (typed.length === 0) { return []; }
  const results = [];
  (recipes || []).forEach(function (recipe) {
    if (!recipe || !recipe.current || !Array.isArray(recipe.current.ingredients)) { return; }
    const have = [], missing = [], seen = {};
    let usesTyped = false;
    recipe.current.ingredients.forEach(function (ingredient) {
      if (ingredient && (ingredient.heading || ingredient.optional === true)) { return; }
      const name = fridgeIngredientName(ingredient);
      const words = fridgeWords(name);
      if (words.length === 0 || isBasicName(words)) { return; }
      const key = words.join(" ");
      if (seen[key]) { return; }
      seen[key] = true;
      if (owned.some(function (f) { return fridgeMatches(f, words); })) {
        have.push(name);
        if (typed.some(function (f) { return fridgeMatches(f, words); })) { usesTyped = true; }
      } else {
        missing.push(name);
      }
    });
    // Only recipes that use something you typed (pantry items alone are not a reason to show one).
    if (!usesTyped) { return; }
    results.push({ recipe: recipe, have: have, missing: missing, total: have.length + missing.length });
  });
  results.sort(function (a, b) {
    if (a.missing.length !== b.missing.length) { return a.missing.length - b.missing.length; }
    const shareA = a.have.length / a.total, shareB = b.have.length / b.total;
    if (shareA !== shareB) { return shareB - shareA; }
    return a.recipe.current.title.toLowerCase() < b.recipe.current.title.toLowerCase() ? -1 : 1;
  });
  return results;
}

// Lets the Node checks load this file.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseFridgeText: parseFridgeText, rankByFridge: rankByFridge, fridgeMatches: fridgeMatches, fridgeWords: fridgeWords,
    isBasicName: isBasicName, fridgeIngredientName: fridgeIngredientName };
}
