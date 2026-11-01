// recipe-helper.js: the cookbook's small helper on Cloudflare (step 17).
//
// Why it exists: a web page (the cookbook) isn't allowed to read other websites.
// This helper runs on Cloudflare instead, reads a recipe page, and sends back ONLY the recipe.
//
// How it reads a recipe: most recipe sites hide a tidy copy of the recipe in their page
// (a "schema.org Recipe" block, made for Google). The helper finds that block.
//
// Safety:
// - It only answers the cookbook's own website (ALLOWED_ORIGINS).
// - It only reads normal web links (http/https), gives up after 10 seconds, and reads at most 5 MB.
// - It has no secret keys, so this code can be public.
//
// How to put it on Cloudflare: see "Link helper (step 17)" in CLAUDE.md.
// The cookbook calls it like this:  https://<helper address>/?url=<recipe link>
// It answers with JSON: { ok: true, recipe: {...} }  or  { ok: false, reason: "..." }.

const ALLOWED_ORIGINS = ["https://im-brain.github.io"];
const TIME_LIMIT_MS = 10000;
const MAX_PAGE_SIZE = 5 * 1024 * 1024;

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.includes(origin);
    const headers = {
      "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
      "Vary": "Origin",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    };
    const reply = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers });

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: { ...headers, "Access-Control-Allow-Methods": "GET" } });
    }
    if (!allowed) {
      return reply({ ok: false, reason: "not-allowed" }, 403);
    }

    // The recipe link to read.
    const link = new URL(request.url).searchParams.get("url") || "";
    let target;
    try {
      target = new URL(link);
    } catch (error) {
      return reply({ ok: false, reason: "bad-link" });
    }
    if (!/^https?:$/.test(target.protocol) || link.length > 2000) {
      return reply({ ok: false, reason: "bad-link" });
    }

    // Read the page, like a normal browser would.
    let page;
    try {
      const response = await fetch(target.href, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9"
        },
        redirect: "follow",
        signal: AbortSignal.timeout(TIME_LIMIT_MS)
      });
      if (!response.ok) {
        return reply({ ok: false, reason: response.status === 404 ? "not-found" : "blocked" });
      }
      page = await response.text();
    } catch (error) {
      return reply({ ok: false, reason: "blocked" });
    }
    if (page.length > MAX_PAGE_SIZE) {
      page = page.slice(0, MAX_PAGE_SIZE);
    }

    const found = findRecipe(page);
    if (!found) {
      return reply({ ok: false, reason: "no-recipe" });
    }
    const recipe = tidyRecipe(found);
    if (recipe.ingredients.length === 0 && recipe.steps.length === 0) {
      return reply({ ok: false, reason: "no-recipe" });
    }
    return reply({ ok: true, recipe });
  }
};

// ---------- Finding the hidden recipe block ----------

// Look through every <script type="application/ld+json"> block for something of type "Recipe".
function findRecipe(html) {
  const blocks = html.matchAll(/<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of blocks) {
    let data;
    try {
      data = JSON.parse(block[1].trim());
    } catch (error) {
      try {
        data = JSON.parse(block[1].replace(/[\u0000-\u001f]+/g, " ").trim()); // stray line breaks inside strings
      } catch (error2) {
        continue;
      }
    }
    const recipe = searchForRecipe(data, 0);
    if (recipe) {
      return recipe;
    }
  }
  return null;
}

function isRecipe(node) {
  const type = node["@type"];
  return type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
}

// The recipe can be the block itself, in a list, inside "@graph", or nested a few levels down.
function searchForRecipe(node, depth) {
  if (!node || typeof node !== "object" || depth > 6) {
    return null;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = searchForRecipe(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (isRecipe(node)) {
    return node;
  }
  for (const value of Object.values(node)) {
    const found = searchForRecipe(value, depth + 1);
    if (found) return found;
  }
  return null;
}

// ---------- Tidying the recipe into the cookbook's shape ----------

// Plain text: no HTML tags, no "&amp;" codes, single spaces.
function plain(value) {
  if (typeof value !== "string") {
    return "";
  }
  return decodeEntities(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeEntities(text) {
  const named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", frac12: "½", frac14: "¼", frac34: "¾", deg: "°", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…" };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (whole, code) => {
    if (code[0] === "#") {
      const number = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(number) && number > 0 && number < 0x110000 ? String.fromCodePoint(number) : whole;
    }
    return named[code.toLowerCase()] !== undefined ? named[code.toLowerCase()] : whole;
  });
}

function asList(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

// Steps can be one long text, a list of texts, or "HowToStep"s grouped in "HowToSection"s.
// A section's name becomes a heading line ending with ":" (the cookbook shows it as a heading).
function readSteps(value, out, depth) {
  if (depth > 5) return;
  for (const item of asList(value)) {
    if (typeof item === "string") {
      // One block of text: split it on line breaks and paragraph ends.
      item.replace(/<\/(p|li|div)>|<br\s*\/?>/gi, "\n").split(/\n+/).forEach((line) => {
        const text = plain(line);
        if (text) out.push(text);
      });
    } else if (item && typeof item === "object") {
      const type = asList(item["@type"]);
      if (type.includes("HowToSection") || (item.itemListElement && !item.text)) {
        const name = plain(item.name);
        if (name) out.push(name.endsWith(":") ? name : name + ":");
        readSteps(item.itemListElement, out, depth + 1);
      } else {
        const text = plain(item.text) || plain(item.name);
        if (text) out.push(text);
      }
    }
  }
}

// "PT1H30M" → 90 minutes. null if missing.
function isoMinutes(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:\d+(?:\.\d+)?S)?)?$/i);
  if (!match) return null;
  const minutes = (Number(match[1] || 0) * 24 * 60) + (Number(match[2] || 0) * 60) + Number(match[3] || 0);
  return minutes > 0 ? Math.round(minutes) : null;
}

// "4 servings", ["4", "4 servings"] or 4 → 4. null if no number.
function readServings(value) {
  for (const item of asList(value)) {
    if (typeof item === "number" && item > 0) return Math.round(item);
    const match = typeof item === "string" ? item.match(/\d+/) : null;
    if (match && Number(match[0]) > 0) return Number(match[0]);
  }
  return null;
}

// Website categories, e.g. "Dinner", "Italian" (from recipeCategory and recipeCuisine).
function readCategories(recipe) {
  const words = [];
  for (const value of [...asList(recipe.recipeCategory), ...asList(recipe.recipeCuisine)]) {
    if (typeof value !== "string") continue;
    value.split(",").forEach((part) => {
      const word = plain(part).toLowerCase();
      if (word && word.length <= 30 && !words.includes(word)) words.push(word);
    });
  }
  return words.slice(0, 10);
}

function tidyRecipe(recipe) {
  const ingredients = asList(recipe.recipeIngredient || recipe.ingredients)
    .map(plain).filter(Boolean).slice(0, 200);
  const steps = [];
  readSteps(recipe.recipeInstructions, steps, 0);

  let timeMinutes = isoMinutes(recipe.totalTime);
  if (timeMinutes === null) {
    const prep = isoMinutes(recipe.prepTime);
    const cook = isoMinutes(recipe.cookTime);
    if (prep !== null || cook !== null) timeMinutes = (prep || 0) + (cook || 0);
  }

  return {
    title: plain(asList(recipe.name)[0]).slice(0, 200),
    ingredients,
    steps: steps.slice(0, 200),
    servings: readServings(recipe.recipeYield),
    timeMinutes,
    categories: readCategories(recipe)
  };
}
