# My Cookbook — Plan

A personal cookbook website that I use on my iPhone.
How we work and the reasons behind each decision are in `CLAUDE.md`.

## Current status (2026-10-31)

- **Version 1 is complete and confirmed on the phone** (steps 1–12, Version 14).
- **Now building "Cooking mode"** (steps 13–15 below), planned in a grill-me interview. Steps 13 and 14 are merged (step 13 confirmed on the phone). **A look fix is done as Version 17** (text centered next to the tick circles and in the buttons; ½×–3× buttons smaller), waiting for merge and a phone check. Next: step 15 (converter, **Version 18**). Each step gets its own plan, OK and pull request.
- **Working rule:** Claude shows a plan and waits for the user's OK before changing or committing anything (see `CLAUDE.md`).
- After cooking mode: **plan together** save from a web link + smart paste (needs a small free Cloudflare Worker; secret keys live there, never in the repo).
- Recipes the user saves are real. Before anything risky, ask the user to **Export a backup** first.

## What "done" means (version 1)

- [x] I can **create** my own recipes.
- [x] I can **save** recipes from elsewhere (typed or pasted) into my cookbook, with their source.
- [x] I can **edit** a saved recipe, see the **original**, and **add my own notes**.
- [x] I can **back up** my recipes and get them back.
- [x] I can **search** my cookbook.
- [x] A **"What should I cook?"** button suggests a random recipe, optionally by tag.

## Decisions (from the planning interview)

| Topic | Decision |
|---|---|
| Phone | iPhone, Safari. Always open from the Home Screen icon. |
| Storage | On the phone (localStorage), plus backups to iCloud Drive. |
| Hosting | Public repo + GitHub Pages at `im-brain.github.io/Cookbook`. Recipes never go in the repo. |
| Kinds of recipe | "My own" or "From somewhere else" (with optional source). |
| Original vs mine | Recipes from elsewhere keep an untouched original. Show mine by default; View original; Reset to original. |
| Fields | Title, ingredients, steps, servings, time, tags, notes. No photos. |
| Notes | Separate from edits, shown above the ingredients. |
| Tags | breakfast, lunch, dinner, dessert, quick, vegetarian + my own. |
| Random pick | From all saved recipes, optional tag filter. |
| Outside recipe services | None for now (TheMealDB and Spoonacular dropped). |
| Offline mode | Not yet. |
| Workflow | Claude writes + explains, checks on a simulated iPhone and sends a screenshot, I tap Merge, I test live. |

## Tools, in plain language

| Tool | What it is | Why |
|---|---|---|
| **HTML** | The structure: headings, buttons, text boxes. | Every website uses it. Nothing to install. |
| **CSS** | The look: colors, sizes, layout for a phone screen. | Built into every browser. |
| **JavaScript** | The behavior: "when I tap Save, store this recipe." | Runs in the browser. No server needed. |
| **localStorage** | A small storage box in the browser that keeps data after closing. | Saves recipes on my phone for free, no account. |
| **GitHub Pages** | Free hosting that turns this repo into a web address. | The code already lives on GitHub. |
| **Add to Home Screen** | Turns the website into an app-like icon. | Opens like an app, and protects my data from Safari's clean-up. |

## Files

```
index.html               the page
style.css                the look
app.js                   the behavior
manifest.json + icon     what "Add to Home Screen" uses (step 4)
PLAN.md                  this plan
CLAUDE.md                memory for future sessions
```

## Recipe shape (what we store for each recipe)

```js
{
  id: "abc123",
  kind: "elsewhere",           // "mine" or "elsewhere"
  source: "Grandma's card",    // optional, for "elsewhere"
  current: {                   // what I see and edit
    title: "Tomato Soup",
    ingredients: ["4 tomatoes", "1 onion", "2 cups stock"],
    steps: ["Chop everything", "Simmer 20 minutes", "Blend"],
    servings: 4,
    timeMinutes: 30,
    tags: ["dinner", "vegetarian"]
  },
  original: { ... },           // only for "elsewhere": the first saved version, never changed
  notes: "Add a pinch of sugar next time.",
  createdAt: "2026-10-31",
  updatedAt: "2026-10-31"
}
```

## Version 1 steps — small and testable one at a time

Each step ends with **"Test it"**: something I check on my phone before we move on.

- [x] **Step 1 — Hello, cookbook.** An `index.html` page titled "My Cookbook".
  **Test it:** Claude's screenshot shows the title.
- [x] **Step 2 — Put it on the internet.** Make the repo public and turn on GitHub Pages.
  **Test it:** Open `im-brain.github.io/Cookbook` on my iPhone and see "My Cookbook".
- [x] **Step 3 — Phone-friendly look.** `style.css`: readable text, big buttons, fits the screen.
  **Test it:** Nothing is tiny; no sideways scrolling.
- [x] **Step 4 — Add to Home Screen.** Icon + manifest so it installs like an app.
  **Test it:** Share → Add to Home Screen. The icon opens it full screen. **From now on, always use the icon.**
- [x] **Step 5 — Recipe form.** Title, ingredients and steps (one box each, with "+ Add ingredient" / "+ Add step"), servings, time, tags, notes, and "My own" / "From somewhere else" with a source box. Save does nothing yet.
  **Test it:** I can fill in every box comfortably on my phone.
- [x] **Step 6 — Save a recipe.** `app.js` stores it on the phone.
  **Test it:** Save one, close the app, reopen it: a message says "1 recipe saved".
- [x] **Step 7 — See my cookbook.** A list of titles; tapping one shows the full recipe with notes above the ingredients.
  **Test it:** Save two recipes; both appear and open correctly.
- [x] **Step 8 — Backup.** Export (save the file to iCloud Drive) and Import. Reminder: "N recipes changed since your last backup".
  **Test it:** Export, delete a recipe, import: it comes back. The reminder appears after a change and disappears after a backup.
- [x] **Step 9 — Edit, delete, original vs mine.** Edit anything; delete asks "Are you sure?". For recipes from elsewhere: View original and Reset to original.
  **Test it:** Change a step, reload: change kept. View original shows the old step. Reset brings it back. Delete removes it.
- [x] **Step 10 — Tags.** Starter tags plus my own.
  **Test it:** Add a new tag "soup" to a recipe; it's offered next time.
- [x] **Step 11 — Search.** Filter by title, ingredient or tag.
  **Test it:** Typing "chicken" shows only recipes with chicken.
- [x] **Step 12 — "What should I cook?"** Random pick, optional tag filter.
  **Test it:** Tap several times: different recipes. Filter "quick": only quick ones. Empty cookbook: a friendly message.

**→ Version 1 is done here.**

## Cooking mode — steps 13–15

Decided in a grill-me interview (2026-10-31). Details in `CLAUDE.md` → Key decisions.

- [x] **Step 13 — Cooking screen (Version 15).** "🍳 Start cooking" under the title opens a big-text screen: notes, ingredients and steps you tap to tick off (forgotten when you tap Done cooking). Times in steps ("20 minutes") are bold, for Siri or the Clock app. The screen stays awake while cooking. No timer in the cookbook (user's choice).
  **Test it:** Start cooking a recipe: tick a few things off, put the phone down for a few minutes (the screen should stay on), tap Done cooking, then Start cooking again: no ticks.
- [x] **Step 14 — Scale the recipe (Version 16).** − / + servings (when the recipe has a servings number) and ½×, 1×, 2×, 3× buttons on the cooking screen. Amounts shown as kitchen fractions (1½, ⅓) and highlighted. Only for this cooking session; the saved recipe doesn't change. Only the amount at the **start** of a line changes ("2 (14 oz) cans" → "3 (14 oz) cans"; "Juice of 1 lemon" stays). Amounts of 10 or more are rounded to whole numbers (250 g ÷ 3 → 83 g).
  **Test it:** A "serves 4" recipe at 6 servings: "2 cups stock" shows "3 cups stock"; "salt to taste" unchanged; reopen the recipe: original amounts.
- [ ] **Step 15 — Converter (Version 18).** "⚖️ Convert" box on the cooking screen. US measures (cup 240 ml). Volumes (cups, tbsp, tsp, fl oz, ml, l), weights (oz, lb, g, kg), °F ↔ °C, and cups ↔ grams for flour, white/brown/powdered sugar, butter, rice, rolled oats, cocoa, milk/water, honey, oil, grated cheese.
  **Test it:** 1 cup flour → about 120 g; 350 °F → about 175 °C; 1 lb → about 454 g.

## Later — in this order

1. **Save from a web link + smart paste.** Paste a recipe URL (or a whole recipe's text) and the form fills itself in. Needs a small free helper (Cloudflare Worker) because browsers block one site from reading another.
   - **Then an AI upgrade** for sites and messy text that plain import can't handle. AI service and budget decided when we get there; the key stays hidden in the helper.
2. **Suggest from my fridge.** I type what I have; my saved recipes are ranked by how many ingredients I have, with what's missing.

## Maybe someday

- Suggestions from an outside recipe service
- Photos
- Offline mode
- Sync across devices / online storage

## Progress log

- 2026-10-31 — First plan written, then refined in a planning interview (grill-me). `CLAUDE.md` added as memory for future sessions.
- 2026-10-31 — Step 1 done: `index.html` with the title "My Cookbook". Checked on a simulated iPhone screen.
- 2026-10-31 — Step 2 done: repo made public, GitHub Pages turned on (main branch, root). Site is live at https://im-brain.github.io/Cookbook/.
- 2026-10-31 — Step 3 done: `style.css` added (warm colors, iPhone font, 18px text, 48px-tall buttons, automatic Dark Mode, notch-safe edges). Checked in light and dark mode: no sideways scrolling.
- 2026-10-31 — Step 4 done: app icon (`icons/`), `manifest.json`, iPhone Home Screen settings, and `app.js` started. In a Safari tab the page shows "Add me to your Home Screen" instructions; from the icon it shows "✓ Opened from your Home Screen".
- 2026-10-31 — Step 5 done: "Add a recipe" opens a form with every field (kind + source, title, ingredients, steps, servings, time, tag chips, notes). Save shows a "step 6" message and stores nothing; Cancel goes home.
- 2026-10-31 — Step 5 follow-up: ingredients and steps changed from one big text box to one box per item, with "+ Add" buttons, the keyboard's Next key, and × to remove. Steps are numbered and long ones wrap.
- 2026-10-31 — Fix: the phone kept showing an old copy after merging (caching). Added version numbers to the file links and a "Version 7" label on the home screen. Every update raises the number.
- 2026-10-31 — Step 6 done (Version 8): Save stores the recipe on the phone (localStorage key `cookbook.recipes`). Home shows "N recipes saved" and "✓ Saved …". Recipes from somewhere else keep an untouched `original` copy. If saved data can't be read, nothing is overwritten.
- 2026-10-31 — Step 7 done (Version 9): home screen lists saved recipes A–Z (title + time · servings · tags). Tapping one opens its page: details, source (web links tappable), tags, notes above ingredients, bulleted ingredients, numbered steps, and a "‹ My Cookbook" back button.
- 2026-10-31 — Handoff to a new conversation. Added "Current status" above. (PLAN.md only, so no version bump.)
- 2026-10-31 — Step 7 confirmed on the user's phone.
- 2026-10-31 — Step 8 done (Version 10): a Backup box on the home screen. **Export** opens the iPhone Share menu with `cookbook-backup-YYYY-MM-DD.json` (Save to Files → iCloud Drive). **Import** merges a backup in: missing recipes come back, the newer copy wins, nothing on the phone is deleted, and it asks first. The reminder says "N recipes changed since your last backup" (new, edited or deleted), or "✓ All recipes backed up".
- 2026-10-31 — Step 8 confirmed on the user's phone (export to iCloud Drive and import both work).
- 2026-10-31 — Step 9 done (Version 11): the recipe page has **Edit recipe** (the same form, filled in), **Delete recipe** (asks first), and, for recipes from somewhere else, **View original** (with a banner) → **Back to my version** / **Reset to original** (asks first; notes are kept). The kind of recipe can't be changed when editing. Tags the starter list doesn't have are kept when editing.
- 2026-10-31 — Step 9 confirmed on the user's phone.
- 2026-10-31 — Step 10 done (Version 12): the form has a "New tag" box with "+ Add" (or the keyboard's Done). New tags appear as ticked chips. Tags are tidied to lower case, and duplicates are ignored. A tag typed but not added still counts when you tap Save. Your own tags are offered on every recipe form after the starter tags, A–Z.
- 2026-10-31 — Step 10 merged; the user moved on to the next step.
- 2026-10-31 — Step 11 done (Version 13): a search box above the recipe list filters it as you type, by title, ingredient or tag. Upper/lower case and accents don't matter, and several words must all match ("chicken dinner"). Shows "3 of 5 recipes" or "Nothing matches …"; × clears it. Hidden when the cookbook is empty. Only "my version" is searched, not the original.
- 2026-10-31 — Step 11 confirmed on the user's phone ("everything is looking good").
- 2026-10-31 — Step 12 done (Version 14): a "🎲 What should I cook?" button under "+ Add a recipe" opens a box with a random recipe (tap it to open), **Pick another**, and "Pick from" chips (any, or one tag used on your recipes). Never the same recipe twice in a row. Friendly messages for an empty cookbook or a tag with only one recipe. **Version 1 is complete.**
- 2026-10-31 — Step 12 merged. Working rule added at the user's request: Claude shows a plan and waits for an OK before changing or committing anything, and `CLAUDE.md` / `PLAN.md` are updated in every pull request. (Notes only, so no version bump; the site stays at Version 14.)
- 2026-10-31 — Handoff to a new conversation. "Current status" updated. (PLAN.md only, so no version bump.)
- 2026-10-31 — Step 12 confirmed on the user's phone. Planned "Cooking mode" in a grill-me interview: a cooking screen (step 13), scaling (step 14), a converter (step 15). No timer in the cookbook: the user uses Siri / Clock, and times in steps are shown in bold. Cooking mode comes before link import.
- 2026-10-31 — Step 13 done (Version 15): "🍳 Start cooking" on the recipe page (hidden while viewing the original) opens the cooking screen: bigger text, notes, ingredients and numbered steps as big tap-to-tick boxes, bold times, Done cooking at the top and bottom. The screen stays awake while cooking (Wake Lock; older iPhones just dim).
- 2026-10-31 — Step 13 confirmed on the user's phone ("Works!").
- 2026-10-31 — Step 14 done (Version 16): a box at the top of the cooking screen with "Serves − 4 +" (only if the recipe has servings) and ½×, 1×, 2×, 3× buttons. The amount at the start of each ingredient changes and is shown in color, as kitchen fractions (1½, ¾, ⅓); 10 or more are whole numbers. Ranges ("2-3 cloves") scale both ends. Ticks are kept when you change the amounts. Starting to cook again begins at the saved amounts; the saved recipe never changes. Known limit: words don't change ("1 cups", "1 tomatoes").
- 2026-10-31 — Step 14 merged. Look fix (Version 17), from the user's screenshot review: text is now centered next to the tick circles (also for two-line items) and inside the − / + and ½×–3× buttons. The ½×, 1×, 2×, 3× buttons are kept but smaller (user's choice), since − / + servings is the main control. The converter moves to Version 18.
