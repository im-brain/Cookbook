// ======================================================================
// Ingredients (Version 26, redesign Phase 3)
// Reads an ingredient line like "2 (14 oz) cans crushed tomatoes, drained" and works out its
// parts: amount, unit, package size, ingredient, prep, optional. The original wording is
// ALWAYS kept in "text". A plain script (no build step), loaded before app.js.
//
// One ingredient looks like this:
//   { text, amount: { from, to } | null, unit, item, size, prep, optional, check }
//   check: "ok"            the reader understood the line
//          "please-check"  the reader is not sure (the line still shows and cooks normally)
//          "as-written"    no amount to read ("salt to taste"); never scaled
// A section heading ("For the sauce:") is just { text, heading: true }.
//
// The same file also runs in Node for the checks in tests/ingredients.test.js.
// ======================================================================

// ---------- Amounts ----------

const FRACTION_CHARACTERS = { "½": 1 / 2, "¼": 1 / 4, "¾": 3 / 4, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 1 / 8 };

// One amount: "1 1/2", "1½", "1/2", "1.5", "2" or "½".
const AMOUNT = "(?:\\d+\\s+\\d+\\/\\d+|\\d+\\s*[½¼¾⅓⅔⅛]|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[½¼¾⅓⅔⅛])";
// An amount at the very start of a line, maybe a range ("2-3", "2 to 3").
const LEADING_AMOUNT = new RegExp(
  "^(\\s*)(" + AMOUNT + ")(?:(\\s*(?:-|–|—|to)\\s*)(" + AMOUNT + "))?"
);

// Turn amount text like "1 1/2" or "1½" into a number (1.5). null if it makes no sense.
function amountToNumber(text) {
  let rest = text.trim();
  let total = 0;
  const fraction = rest.match(/(\d+)\/(\d+)$/);
  if (fraction) {
    total += Number(fraction[1]) / Number(fraction[2]);
    rest = rest.slice(0, fraction.index);
  }
  const character = rest.match(/[½¼¾⅓⅔⅛]$/);
  if (character) {
    total += FRACTION_CHARACTERS[character[0]];
    rest = rest.slice(0, character.index);
  }
  rest = rest.trim();
  if (rest !== "") {
    total += Number(rest);
  }
  return Number.isFinite(total) && total > 0 ? total : null;
}

// Look for an amount at the start of an ingredient line.
// Returns { before, low, separator, high, rest } (high/separator only for ranges), or null.
function readAmount(line) {
  const match = line.match(LEADING_AMOUNT);
  if (!match) {
    return null;
  }
  const low = amountToNumber(match[2]);
  const high = match[4] ? amountToNumber(match[4]) : null;
  if (low === null || (match[4] && high === null)) {
    return null;
  }
  return {
    before: match[1],
    low: low,
    separator: match[3] || "",
    high: high,
    rest: line.slice(match[0].length)
  };
}

// Write a number the way a cook would: 1.5 → "1½", 0.33 → "⅓", 375.2 → "375".
// 10 or more: whole numbers. Smaller: whole part + the nearest ⅛, ¼, ⅓, ½, ⅔ or ¾.
function kitchenNumber(value) {
  if (value >= 10) {
    return String(Math.round(value));
  }
  let whole = Math.floor(value);
  const part = value - whole;
  const choices = [[0, ""], [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [1 / 2, "½"], [2 / 3, "⅔"], [3 / 4, "¾"], [1, ""]];
  let best = choices[0];
  choices.forEach(function (choice) {
    if (Math.abs(part - choice[0]) < Math.abs(part - best[0])) {
      best = choice;
    }
  });
  if (best[0] === 1) {
    whole += 1;
  }
  const text = (whole > 0 ? String(whole) : "") + best[1];
  return text === "" ? "⅛" : text; // a tiny amount never shows as nothing
}

// ---------- Section headings ----------

// A line ending in ":" (max 60 characters) is a section heading ("For the sauce:").
function isSectionHeading(line) {
  const text = line.trim();
  return text.length > 1 && text.length <= 60 && text.endsWith(":");
}

// ---------- Units ----------

// Spellings → one standard name.
const UNIT_NAMES = {
  cup: "cup", cups: "cup", c: "cup",
  tablespoon: "tbsp", tablespoons: "tbsp", tbsp: "tbsp", tbsps: "tbsp", tbs: "tbsp", tbl: "tbsp", tbls: "tbsp",
  teaspoon: "tsp", teaspoons: "tsp", tsp: "tsp", tsps: "tsp",
  ounce: "oz", ounces: "oz", oz: "oz",
  pound: "lb", pounds: "lb", lb: "lb", lbs: "lb",
  gram: "g", grams: "g", g: "g", gr: "g",
  kilogram: "kg", kilograms: "kg", kg: "kg", kgs: "kg",
  milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml", ml: "ml",
  liter: "l", liters: "l", litre: "l", litres: "l", l: "l",
  quart: "quart", quarts: "quart", qt: "quart", qts: "quart",
  pint: "pint", pints: "pint", pt: "pint",
  gallon: "gallon", gallons: "gallon", gal: "gallon",
  pinch: "pinch", pinches: "pinch",
  dash: "dash", dashes: "dash",
  clove: "clove", cloves: "clove",
  can: "can", cans: "can", tin: "can", tins: "can",
  jar: "jar", jars: "jar",
  package: "package", packages: "package", pkg: "package", packet: "package", packets: "package",
  bag: "bag", bags: "bag",
  box: "box", boxes: "box",
  bottle: "bottle", bottles: "bottle",
  bunch: "bunch", bunches: "bunch",
  slice: "slice", slices: "slice",
  stick: "stick", sticks: "stick",
  head: "head", heads: "head",
  sprig: "sprig", sprigs: "sprig",
  handful: "handful", handfuls: "handful"
};

// "fl oz", "fl. oz." and "fluid ounces" are two words, so they get checked first.
const FLUID_OUNCE = /^(?:fl\.?\s*oz\.?|fluid\s+ounces?)(?=\s|$|[,;)])/i;

// Read a unit at the start of "rest". Returns { unit, rest } (unit "" if there isn't one).
function readUnit(rest) {
  const fluid = rest.match(FLUID_OUNCE);
  if (fluid) {
    return { unit: "fl oz", rest: rest.slice(fluid[0].length).replace(/^\s+/, "") };
  }
  const word = rest.match(/^([A-Za-z]+)\.?(?=\s|$|[,;)])/);
  if (word) {
    // A capital T is a tablespoon and a small t a teaspoon; everything else ignores case.
    const name = word[1] === "T" ? "tbsp" : word[1] === "t" ? "tsp" : UNIT_NAMES[word[1].toLowerCase()];
    if (name) {
      return { unit: name, rest: rest.slice(word[0].length).replace(/^\s+/, "") };
    }
  }
  return { unit: "", rest: rest };
}

// "(14 oz)" straight after the amount or the unit is a package size: it never scales.
const SIZE_IN_BRACKETS = /^\(([^)]*\d[^)]*)\)\s*/;
// "14-oz can", "14 oz can", "400g tin": a size written in front of the container word.
const SIZE_BEFORE_CONTAINER = new RegExp(
  "^(\\d+(?:\\.\\d+)?\\s*-?\\s*(?:oz|ounces?|g|grams?|kg|lbs?|pounds?|ml|l|fl\\.?\\s*oz))\\.?\\s*-?\\s*" +
  "(?=(?:cans?|tins?|jars?|packages?|packets?|bags?|boxes|box|bottles?)\\b)", "i"
);

// ---------- Reading one line ----------

function noAmount(text, check) {
  return { text: text, amount: null, unit: "", item: text, size: "", prep: "", optional: false, check: check };
}

// Split "chopped onion, finely diced" at the first comma that is not inside brackets.
function splitAtComma(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") { depth += 1; }
    else if (ch === ")") { depth = Math.max(0, depth - 1); }
    else if (ch === "," && depth === 0) {
      return [text.slice(0, i).trim(), text.slice(i + 1).trim()];
    }
  }
  return [text.trim(), ""];
}

// Read one ingredient line. Never throws; always returns an ingredient (or heading) object.
function parseIngredient(line) {
  const text = String(line).trim();
  if (isSectionHeading(text)) {
    return { text: text, heading: true };
  }

  // "optional" in brackets or at the end of the line.
  let optional = false;
  let work = text;
  if (/\(\s*optional\s*\)/i.test(work)) {
    optional = true;
    work = work.replace(/\s*\(\s*optional\s*\)/ig, "");
  }
  if (/[,;]?\s*\boptional\s*$/i.test(work) && work.replace(/[,;]?\s*\boptional\s*$/i, "").trim() !== "") {
    optional = true;
    work = work.replace(/[,;]?\s*\boptional\s*$/i, "");
  }
  work = work.trim();

  const amount = readAmount(work);
  if (amount === null) {
    const result = noAmount(text, "as-written");
    result.optional = optional;
    return result;
  }

  let rest = amount.rest.replace(/^\s+/, "");
  let size = "";
  let unit = "";

  // Package size in brackets right after the amount: "2 (14 oz) cans ..."
  let found = rest.match(SIZE_IN_BRACKETS);
  if (found) {
    size = found[1].trim();
    rest = rest.slice(found[0].length);
  } else {
    // "2 14-oz cans ..."
    found = rest.match(SIZE_BEFORE_CONTAINER);
    if (found) {
      size = found[1].replace(/\s*-\s*/g, " ").replace(/\s+/g, " ").trim();
      rest = rest.slice(found[0].length);
    }
  }

  const unitRead = readUnit(rest);
  unit = unitRead.unit;
  rest = unitRead.rest;

  // "1 can (14 oz) tomatoes", "1 cup (240 ml) milk": the size can also come after the unit.
  if (size === "") {
    found = rest.match(SIZE_IN_BRACKETS);
    if (found) {
      size = found[1].trim();
      rest = rest.slice(found[0].length);
    }
  }
  rest = rest.replace(/^of\s+/i, "");

  const parts = splitAtComma(rest);
  const item = parts[0];
  const prep = parts[1];

  // Decide how sure we are.
  let check = "ok";
  const outsideBrackets = (item + " " + prep).replace(/\([^)]*\)/g, " ");
  const firstLetter = amount.rest.charAt(0);
  if (item === "") {
    check = "please-check";                       // "2 cups" and nothing else
  } else if (firstLetter !== "" && !/[\s(A-Za-z]/.test(firstLetter) && !/^\s*[½¼¾⅓⅔⅛]/.test(amount.rest)) {
    check = "please-check";                       // "12-inch tortillas": the number may not be an amount
  } else if (/\d/.test(outsideBrackets)) {
    check = "please-check";                       // a second number: "1 cup or 120 g flour", "1 cup + 2 tbsp"
  } else if (amount.high !== null && amount.high < amount.low) {
    check = "please-check";
  } else if ((amount.high !== null ? amount.high : amount.low) > 5000) {
    check = "please-check";
  } else if (text.length > 100) {
    check = "please-check";
  }

  return {
    text: text,
    amount: { from: amount.low, to: amount.high !== null ? amount.high : amount.low },
    unit: unit,
    item: item,
    size: size,
    prep: prep,
    optional: optional,
    check: check
  };
}

// ---------- Building a line from its parts (the ••• editor, Version 27) ----------

const UNIT_PLURALS = {
  cup: "cups", quart: "quarts", pint: "pints", gallon: "gallons", pinch: "pinches", dash: "dashes",
  clove: "cloves", can: "cans", jar: "jars", package: "packages", bag: "bags", box: "boxes",
  bottle: "bottles", bunch: "bunches", slice: "slices", stick: "sticks", head: "heads",
  sprig: "sprigs", handful: "handfuls"
};

// 1.5 → "1½", 2.4 → "2.4" (a typed amount that isn't a kitchen fraction is kept as typed).
function amountText(value) {
  const kitchen = kitchenNumber(value);
  const back = amountToNumber(kitchen);
  if (back !== null && Math.abs(back - value) < 0.01) {
    return kitchen;
  }
  return String(Math.round(value * 100) / 100);
}

// Parts → an ingredient object whose `text` is written from the parts.
// parts: { from, to, unit, item, size, prep, optional } (from/to are numbers or null).
// Returns null when there is nothing at all.
function ingredientFromParts(parts) {
  const from = typeof parts.from === "number" && parts.from > 0 ? parts.from : null;
  let to = from !== null && typeof parts.to === "number" && parts.to > 0 ? parts.to : from;
  let unit = String(parts.unit || "").trim();
  const known = UNIT_NAMES[unit.toLowerCase()];
  if (known && unit !== "T" && unit !== "t") {
    unit = known;
  }
  const item = String(parts.item || "").trim();
  const size = String(parts.size || "").trim();
  const prep = String(parts.prep || "").trim();
  const optional = parts.optional === true;

  const bits = [];
  if (from !== null) {
    bits.push(amountText(from) + (to !== from ? "-" + amountText(to) : ""));
    if (unit !== "") {
      bits.push((to > 1 || from > 1) && UNIT_PLURALS[unit] ? UNIT_PLURALS[unit] : unit);
    }
  } else if (unit !== "") {
    unit = "";   // a unit without an amount means nothing
  }
  if (size !== "") { bits.push("(" + size + ")"); }
  if (item !== "") { bits.push(item); }
  let text = bits.join(" ");
  if (prep !== "") { text += (text !== "" ? ", " : "") + prep; }
  if (optional) { text += (text !== "" ? " " : "") + "(optional)"; }
  if (text === "") {
    return null;
  }

  let check = "ok";
  if (from === null) {
    check = "as-written";
  } else if (item === "" || to < from) {
    check = "please-check";
  }
  return {
    text: text,
    amount: from === null ? null : { from: from, to: to },
    unit: unit, item: item, size: size, prep: prep, optional: optional, check: check
  };
}

// A list of typed lines → a list of ingredients (empty lines skipped).
function parseIngredients(lines) {
  return lines
    .filter(function (line) { return typeof line === "string" && line.trim() !== ""; })
    .map(parseIngredient);
}

// ---------- Saved ingredients ----------

// The words of an ingredient, whether it's an ingredient object or an old plain line.
function ingredientText(ingredient) {
  return typeof ingredient === "string" ? ingredient : String(ingredient && ingredient.text || "");
}
function ingredientTexts(list) {
  return list.map(ingredientText);
}

// Rebuild an ingredient from saved or imported data, field by field, in a fixed order
// (so the "fingerprint" of a recipe is the same after a backup round trip).
// Returns null when there is nothing usable.
function cleanIngredient(value) {
  if (typeof value === "string") {
    return value.trim() === "" ? null : parseIngredient(value);
  }
  if (!value || typeof value !== "object" || typeof value.text !== "string" || value.text.trim() === "") {
    return null;
  }
  if (value.heading === true) {
    return { text: value.text, heading: true };
  }
  const from = value.amount && typeof value.amount.from === "number" && value.amount.from > 0 ? value.amount.from : null;
  const to = value.amount && typeof value.amount.to === "number" && value.amount.to > 0 ? value.amount.to : from;
  return {
    text: value.text,
    amount: from === null ? null : { from: from, to: to },
    unit: typeof value.unit === "string" ? value.unit : "",
    item: typeof value.item === "string" ? value.item : value.text,
    size: typeof value.size === "string" ? value.size : "",
    prep: typeof value.prep === "string" ? value.prep : "",
    optional: value.optional === true,
    check: value.check === "ok" || value.check === "as-written" ? value.check : "please-check"
  };
}
function cleanIngredientList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(cleanIngredient).filter(function (x) { return x !== null; });
}

// Make sure every ingredient of this recipe part is an ingredient object.
// Returns true if anything had to be converted (old plain lines).
function upgradeIngredients(part) {
  if (!part || !Array.isArray(part.ingredients)) {
    return false;
  }
  let changed = false;
  part.ingredients = part.ingredients.map(function (item) {
    if (typeof item === "string") {
      changed = true;
      return parseIngredient(item);
    }
    return item;
  }).filter(function (item) { return item !== null && item !== undefined; });
  return changed;
}

// ---------- Scaling ----------

// Scale one ingredient. Returns null when there is nothing to scale, otherwise
// { before, scaled, rest }: the line is "before + scaled + rest", with only the amount changed.
// The numbers come from the ingredient's amount field; the original wording is kept around it.
function scaleIngredient(ingredient, factor) {
  if (typeof ingredient === "string") {
    ingredient = parseIngredient(ingredient);
  }
  if (!ingredient || ingredient.heading || !ingredient.amount) {
    return null;
  }
  const layout = readAmount(ingredient.text);
  if (layout === null) {
    return null;
  }
  let scaled = kitchenNumber(ingredient.amount.from * factor);
  if (layout.high !== null) {
    scaled += layout.separator + kitchenNumber(ingredient.amount.to * factor);
  }
  return { before: layout.before, scaled: scaled, rest: layout.rest };
}

// Lets the Node checks load this file.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    amountToNumber: amountToNumber, readAmount: readAmount, kitchenNumber: kitchenNumber,
    isSectionHeading: isSectionHeading, parseIngredient: parseIngredient, parseIngredients: parseIngredients,
    ingredientText: ingredientText, ingredientTexts: ingredientTexts, cleanIngredient: cleanIngredient,
    cleanIngredientList: cleanIngredientList, upgradeIngredients: upgradeIngredients,
    scaleIngredient: scaleIngredient, LEADING_AMOUNT: LEADING_AMOUNT,
    ingredientFromParts: ingredientFromParts, amountText: amountText
  };
}
